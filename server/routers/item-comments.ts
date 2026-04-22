import { randomUUID } from 'crypto';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { ensureItemAccess, getItemAccessById } from '../lib/item-access';
import { sendPushToUser } from '../lib/push-sender';
import { broadcastToUser } from '../lib/realtime';
import { itemComments } from '../schema/item_comments';
import { itemShares } from '../schema/item_shares';
import { items } from '../schema/items';
import { userNotifications } from '../schema/user_notifications';
import { users } from '../schema/users';
import { protectedProcedure, router } from '../trpc';

function extractMentionedEmails(content: string): string[] {
  const regex = /@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  const emails = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    emails.add(match[1].toLowerCase());
  }
  return Array.from(emails);
}

function extractMentionedUsernames(content: string): string[] {
  const withoutEmails = content.replace(/@[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ' ');
  const regex = /(^|[^A-Za-z0-9._-])@([A-Za-z0-9._-]{2,40})(?=$|[^A-Za-z0-9._-])/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(withoutEmails)) !== null) {
    names.add(match[2].toLowerCase());
  }
  return Array.from(names);
}

export const itemCommentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const access = await getItemAccessById({
        itemId: input.itemId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });
      ensureItemAccess(access, 'view');

      const rows = await db
        .select({
          id: itemComments.id,
          itemId: itemComments.itemId,
          userId: itemComments.userId,
          parentCommentId: itemComments.parentCommentId,
          content: itemComments.content,
          createdAt: itemComments.createdAt,
          updatedAt: itemComments.updatedAt,
          authorEmail: users.email,
          authorUsername: users.username,
        })
        .from(itemComments)
        .leftJoin(users, eq(users.id, itemComments.userId))
        .where(eq(itemComments.itemId, input.itemId))
        .orderBy(asc(itemComments.createdAt));

      return rows;
    }),

  create: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        content: z.string().min(1).max(4000),
        parentCommentId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getItemAccessById({
        itemId: input.itemId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });
      const ensuredAccess = ensureItemAccess(access, 'view');

      if (input.parentCommentId) {
        const parentRows = await db
          .select()
          .from(itemComments)
          .where(and(eq(itemComments.id, input.parentCommentId), eq(itemComments.itemId, input.itemId)))
          .limit(1);
        if (parentRows.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Parent comment not found for this item' });
        }
      }

      const commentId = randomUUID();
      await db.insert(itemComments).values({
        id: commentId,
        itemId: input.itemId,
        userId: ctx.user.id,
        parentCommentId: input.parentCommentId ?? null,
        content: input.content.trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const mentionedEmails = extractMentionedEmails(input.content);
      const mentionedUsernames = extractMentionedUsernames(input.content);
      const mentionedTargetIds = new Set<string>();
      const mentionedEchoes: { id: string; email: string; username: string | null }[] = [];

      if (mentionedEmails.length > 0 || mentionedUsernames.length > 0) {
        const orClauses = [];
        if (mentionedEmails.length > 0) orClauses.push(inArray(users.email, mentionedEmails));
        if (mentionedUsernames.length > 0) orClauses.push(inArray(users.username, mentionedUsernames));

        const matchCondition = orClauses.length === 1 ? orClauses[0] : or(...orClauses);
        const rows = await db
          .select()
          .from(users)
          .where(and(eq(users.isActive, true), matchCondition));

        const candidates = rows.filter((u) => {
          if (u.email && mentionedEmails.includes(u.email.toLowerCase())) return true;
          if (u.username && mentionedUsernames.includes(u.username.toLowerCase())) return true;
          return false;
        });

        for (const target of candidates) {
          if (target.id === ctx.user.id) continue;
          if (mentionedTargetIds.has(target.id)) continue;
          mentionedTargetIds.add(target.id);
          mentionedEchoes.push({ id: target.id, email: target.email, username: target.username ?? null });
          const title = 'You were mentioned in a comment';
          const body = `${ctx.user.username ?? ctx.user.email} mentioned you`;
          await db.insert(userNotifications).values({
            id: randomUUID(),
            userId: target.id,
            type: 'mention',
            title,
            body,
            meta: JSON.stringify({ itemId: input.itemId, commentId }),
            isRead: false,
            createdAt: new Date(),
          });
          sendPushToUser(target.id, {
            title,
            body,
            data: { type: 'mention', itemId: input.itemId, commentId },
          }).catch(() => {});
          broadcastToUser(target.id, 'notification', {
            kind: 'mention',
            title,
            body,
            itemId: input.itemId,
            commentId,
          });
        }
      }

      if (ensuredAccess.item.userId !== ctx.user.id && !mentionedTargetIds.has(ensuredAccess.item.userId)) {
        const title = 'New comment on your item';
        const body = `${ctx.user.username ?? ctx.user.email} commented on your item`;
        await db.insert(userNotifications).values({
          id: randomUUID(),
          userId: ensuredAccess.item.userId,
          type: 'item_comment',
          title,
          body,
          meta: JSON.stringify({ itemId: input.itemId, commentId }),
          isRead: false,
          createdAt: new Date(),
        });
        sendPushToUser(ensuredAccess.item.userId, {
          title,
          body,
          data: { type: 'item_comment', itemId: input.itemId, commentId },
        }).catch(() => {});
        broadcastToUser(ensuredAccess.item.userId, 'notification', {
          kind: 'item_comment',
          title,
          body,
          itemId: input.itemId,
          commentId,
        });
      }

      return { success: true as const, id: commentId, mentioned: mentionedEchoes };
    }),

  edit: protectedProcedure
    .input(z.object({ id: z.string(), content: z.string().min(1).max(4000) }))
    .mutation(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(itemComments)
        .where(and(eq(itemComments.id, input.id), eq(itemComments.userId, ctx.user.id)))
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the author can edit this comment' });
      }
      await db
        .update(itemComments)
        .set({ content: input.content.trim(), updatedAt: new Date() })
        .where(eq(itemComments.id, input.id));
      return { success: true as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(itemComments)
        .where(eq(itemComments.id, input.id))
        .limit(1);
      const comment = rows[0];
      if (!comment) return { success: true as const };
      if (comment.userId !== ctx.user.id) {
        // Item owner can also delete any comment on their item
        const itemRows = await db
          .select()
          .from(items)
          .where(and(eq(items.id, comment.itemId), eq(items.userId, ctx.user.id)))
          .limit(1);
        if (itemRows.length === 0) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only author or item owner can delete' });
        }
      }
      await db.delete(itemComments).where(eq(itemComments.id, input.id));
      return { success: true as const };
    }),

  listMentionable: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getItemAccessById({
        itemId: input.itemId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });
      ensureItemAccess(access, 'view');

      // Gather owner + shared-with participants
      const itemRows = await db.select().from(items).where(eq(items.id, input.itemId)).limit(1);
      const item = itemRows[0];
      if (!item) return [];

      const shares = await db.select().from(itemShares).where(eq(itemShares.itemId, input.itemId));
      const emails = new Set<string>();
      for (const s of shares) {
        if (s.sharedWithEmail) emails.add(s.sharedWithEmail.toLowerCase());
      }

      const userRows = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
        })
        .from(users)
        .where(
          emails.size > 0
            ? and(eq(users.isActive, true), inArray(users.email, Array.from(emails)))
            : eq(users.id, item.userId)
        );

      const ownerRows = await db
        .select({ id: users.id, email: users.email, username: users.username })
        .from(users)
        .where(eq(users.id, item.userId))
        .limit(1);

      const byId = new Map<string, { id: string; email: string; username: string | null }>();
      for (const u of ownerRows) byId.set(u.id, { id: u.id, email: u.email, username: u.username ?? null });
      for (const u of userRows) byId.set(u.id, { id: u.id, email: u.email, username: u.username ?? null });
      byId.delete(ctx.user.id);
      return Array.from(byId.values());
    }),
});
