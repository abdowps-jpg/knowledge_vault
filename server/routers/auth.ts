import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { comparePassword, generateToken, hashPassword, verifyToken as verifyJwtToken } from '../lib/auth';
import { users } from '../schema/users';
import { protectedProcedure, publicProcedure, router } from '../trpc';

const authUserSelect = {
  id: users.id,
  email: users.email,
  username: users.username,
  isActive: users.isActive,
};

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        email: z.email(),
        password: z.string().min(6),
        username: z.string().min(2).max(100).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email already in use' });
      }

      const passwordHash = await hashPassword(input.password);
      const newUser = {
        id: randomUUID(),
        email,
        password: passwordHash,
        username: input.username?.trim() || null,
        isActive: true,
      };

      await db.insert(users).values(newUser);

      return {
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          isActive: true,
        },
      };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();
      console.log('Login attempt for:', email);
      console.log('[Auth/Login] Login attempt:', { email });
      try {
        const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
        const user = existing[0];
        console.log('User found:', !!user);

        if (!user) {
          console.warn('[Auth/Login] User not found:', { email });
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
        }

        if (!user.isActive) {
          console.warn('[Auth/Login] Inactive account:', { userId: user.id, email: user.email });
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Account is inactive' });
        }

        const passwordMatches = await comparePassword(input.password, user.password);
        console.log('Password match:', passwordMatches);
        if (!passwordMatches) {
          console.warn('[Auth/Login] Password mismatch:', { userId: user.id, email: user.email });
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
        }

        const token = generateToken({
          id: user.id,
          email: user.email,
          username: user.username,
        });
        console.log('Token generated:', token);

        console.log('[Auth/Login] Login success:', { userId: user.id, email: user.email });
        return {
          token,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            isActive: user.isActive,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[Auth/Login] Unexpected login error:', { email, error });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to login' });
      }
    }),

  verifyToken: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const payload = verifyJwtToken(input.token);
      if (!payload) {
        return { valid: false as const };
      }

      const userRows = await db
        .select(authUserSelect)
        .from(users)
        .where(and(eq(users.id, payload.sub), eq(users.email, payload.email)))
        .limit(1);

      if (userRows.length === 0 || !userRows[0].isActive) {
        return { valid: false as const };
      }

      return {
        valid: true as const,
        user: userRows[0],
      };
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        email: z.email().optional(),
        username: z.string().min(2).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const nextEmail = input.email?.trim().toLowerCase();
      const nextUsername = input.username?.trim();

      if (!nextEmail && typeof nextUsername === 'undefined') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No profile fields provided' });
      }

      if (nextEmail && nextEmail !== ctx.user.email) {
        const existing = await db.select().from(users).where(eq(users.email, nextEmail)).limit(1);
        if (existing.length > 0 && existing[0].id !== ctx.user.id) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Email already in use' });
        }
      }

      const updateData: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (nextEmail) updateData.email = nextEmail;
      if (typeof nextUsername !== 'undefined') updateData.username = nextUsername || null;

      await db.update(users).set(updateData).where(eq(users.id, ctx.user.id));

      const userRows = await db.select(authUserSelect).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const updatedUser = userRows[0];
      if (!updatedUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      const token = generateToken({
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
      });

      return {
        user: updatedUser,
        token,
      };
    }),
});
