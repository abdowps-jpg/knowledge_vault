import { randomUUID } from 'crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { ensureItemAccess, getItemAccessById } from '../lib/item-access';
import { itemComments } from '../schema/item_comments';
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
      if (mentionedEmails.length > 0) {
        const mentionedUsers = await db
          .select()
          .from(users)
          .where(and(eq(users.isActive, true), inArray(users.email, mentionedEmails)));
        const targets = mentionedUsers.filter((user) => mentionedEmails.includes(user.email.toLowerCase()));
        for (const target of targets) {
          if (target.id === ctx.user.id) continue;
          await db.insert(userNotifications).values({
            id: randomUUID(),
            userId: target.id,
            type: 'mention',
            title: 'You were mentioned in a comment',
            body: `${ctx.user.email} mentioned you`,
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

      return { success: true as const, id: commentId };
    }),
});
