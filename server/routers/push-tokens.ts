import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { pushTokens } from '../schema/push_tokens';
import { protectedProcedure, router } from '../trpc';

export const pushTokensRouter = router({
  register: protectedProcedure
    .input(
      z.object({
        token: z.string().min(8).max(400),
        platform: z.enum(['ios', 'android', 'web']),
        deviceName: z.string().max(120).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      const existing = await db
        .select()
        .from(pushTokens)
        .where(eq(pushTokens.token, input.token))
        .limit(1);
      const current = existing[0];

      if (current) {
        await db
          .update(pushTokens)
          .set({
            userId: ctx.user.id,
            platform: input.platform,
            deviceName: input.deviceName ?? current.deviceName ?? null,
            isActive: true,
            lastSeenAt: now,
          })
          .where(eq(pushTokens.id, current.id));
        return { success: true as const, id: current.id, created: false as const };
      }

      const id = randomUUID();
      await db.insert(pushTokens).values({
        id,
        userId: ctx.user.id,
        token: input.token,
        platform: input.platform,
        deviceName: input.deviceName ?? null,
        isActive: true,
        createdAt: now,
        lastSeenAt: now,
      });
      return { success: true as const, id, created: true as const };
    }),

  unregister: protectedProcedure
    .input(z.object({ token: z.string().min(8).max(400) }))
    .mutation(async ({ input, ctx }) => {
      await db
        .update(pushTokens)
        .set({ isActive: false })
        .where(and(eq(pushTokens.userId, ctx.user.id), eq(pushTokens.token, input.token)));
      return { success: true as const };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: pushTokens.id,
        platform: pushTokens.platform,
        deviceName: pushTokens.deviceName,
        isActive: pushTokens.isActive,
        createdAt: pushTokens.createdAt,
        lastSeenAt: pushTokens.lastSeenAt,
      })
      .from(pushTokens)
      .where(eq(pushTokens.userId, ctx.user.id));
  }),
});
