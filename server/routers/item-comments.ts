import { randomUUID } from 'crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { ensureItemAccess, getItemAccessById } from '../lib/item-access';
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
        const rows = await db
          .select()
          .from(users)
          .where(
            and(
              eq(users.isActive, true),
              mentionedEmails.length > 0 && mentionedUsernames.length > 0
                ? undefined
                : undefined
            )
          );
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
          await db.insert(userNotifications).values({
            id: randomUUID(),
            userId: target.id,
            type: 'mention',
            title: 'You were mentioned in a comment',
            body: `${ctx.user.username ?? ctx.user.email} mentioned you`,
            meta: JSON.stringify({ itemId: input.itemId, commentId }),
            isRead: false,
            createdAt: new Date(),
          });
        }
      }

      if (ensuredAccess.item.userId !== ctx.user.id) {
        await db.insert(userNotifications).values({
          id: randomUUID(),
          userId: ensuredAccess.item.userId,
          type: 'item_comment',
          title: 'New comment on your item',
          body: `${ctx.user.email} commented on your item`,
          meta: JSON.stringify({ itemId: input.itemId, commentId }),
          isRead: false,
          createdAt: new Date(),
        });
      }

      return { success: true as const, id: commentId, mentioned: mentionedEchoes };
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
