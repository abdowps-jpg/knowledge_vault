import { createHash, randomInt, randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { comparePassword, generateToken, hashPassword, verifyToken as verifyJwtToken } from '../lib/auth';
import { buildTaskInboxAddressForUser } from '../lib/email-task-address';
import { sendVerificationEmail } from '../lib/email';
import { users } from '../schema/users';
import { protectedProcedure, publicProcedure, router } from '../trpc';

const authUserSelect = {
  id: users.id,
  email: users.email,
  username: users.username,
  isActive: users.isActive,
  emailVerified: users.emailVerified,
  pendingEmail: users.pendingEmail,
};

function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashVerificationCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

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
      const verificationCode = generateVerificationCode();
      const verificationCodeHash = hashVerificationCode(verificationCode);
      const verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);
      const passwordHash = await hashPassword(input.password);
      const username = input.username?.trim() || null;

      if (existing.length > 0) {
        const existingUser = existing[0];
        if (existingUser.emailVerified) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Email already in use' });
        }

        await db
          .update(users)
          .set({
            emailVerificationCode: verificationCodeHash,
            emailVerificationExpiresAt: verificationCodeExpiry,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id));

        await sendVerificationEmail({ to: email, code: verificationCode });

        return {
          requiresVerification: true as const,
          user: {
            id: existingUser.id,
            email,
            username,
            isActive: true,
            emailVerified: false,
          },
        };
      }

      const newUser = {
        id: randomUUID(),
        email,
        password: passwordHash,
        username,
        isActive: true,
        emailVerified: false,
        emailVerificationCode: verificationCodeHash,
        emailVerificationExpiresAt: verificationCodeExpiry,
      };

      await db.insert(users).values(newUser);
      await sendVerificationEmail({ to: email, code: verificationCode });

      return {
        requiresVerification: true as const,
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          isActive: true,
          emailVerified: false,
        },
      };
    }),

  verifyEmail: publicProcedure
    .input(
      z.object({
        email: z.email(),
        code: z
          .string()
          .trim()
          .regex(/^\d{6}$/),
      })
    )
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = existing[0];

      const submittedHash = hashVerificationCode(input.code);
      const isValid =
        !!user &&
        !user.emailVerified &&
        !!user.emailVerificationCode &&
        !!user.emailVerificationExpiresAt &&
        user.emailVerificationExpiresAt.getTime() >= Date.now() &&
        submittedHash === user.emailVerificationCode;

      if (!isValid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid verification code' });
      }

      await db
        .update(users)
        .set({
          emailVerified: true,
          emailVerifiedAt: new Date(),
          emailVerificationCode: null,
          emailVerificationExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return { success: true as const };
    }),

  resendVerificationCode: publicProcedure
    .input(
      z.object({
        email: z.email(),
      })
    )
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = existing[0];

      if (user && !user.emailVerified) {
        const verificationCode = generateVerificationCode();
        const verificationCodeHash = hashVerificationCode(verificationCode);
        const verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);

        await db
          .update(users)
          .set({
            emailVerificationCode: verificationCodeHash,
            emailVerificationExpiresAt: verificationCodeExpiry,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        await sendVerificationEmail({ to: email, code: verificationCode });
      }

      // Generic response prevents email enumeration.
      return { success: true as const };
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
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Email is not registered. Please create an account.' });
        }

        if (!user.isActive) {
          console.warn('[Auth/Login] Inactive account:', { userId: user.id, email: user.email });
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Account is inactive' });
        }

        if (!user.emailVerified) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Please verify your email before login',
          });
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

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const userRows = await db.select(authUserSelect).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const user = userRows[0];
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    return {
      user,
      taskInboxEmail: buildTaskInboxAddressForUser(user.id),
    };
  }),

  requestEmailChange: protectedProcedure
    .input(
      z.object({
        newEmail: z.email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const newEmail = input.newEmail.trim().toLowerCase();
      if (newEmail === ctx.user.email) {
        return { success: true as const };
      }

      const existing = await db.select().from(users).where(eq(users.email, newEmail)).limit(1);
      if (existing.length > 0 && existing[0].id !== ctx.user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email already in use' });
      }

      const verificationCode = generateVerificationCode();
      const verificationCodeHash = hashVerificationCode(verificationCode);
      const verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);

      await db
        .update(users)
        .set({
          pendingEmail: newEmail,
          emailVerificationCode: verificationCodeHash,
          emailVerificationExpiresAt: verificationCodeExpiry,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));

      await sendVerificationEmail({ to: newEmail, code: verificationCode });
      return { success: true as const };
    }),

  confirmEmailChange: protectedProcedure
    .input(
      z.object({
        code: z
          .string()
          .trim()
          .regex(/^\d{6}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const user = userRows[0];
      if (!user?.pendingEmail) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No email change request found' });
      }

      const submittedHash = hashVerificationCode(input.code);
      const isValid =
        !!user.emailVerificationCode &&
        !!user.emailVerificationExpiresAt &&
        user.emailVerificationExpiresAt.getTime() >= Date.now() &&
        submittedHash === user.emailVerificationCode;

      if (!isValid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid verification code' });
      }

      const conflict = await db.select().from(users).where(eq(users.email, user.pendingEmail)).limit(1);
      if (conflict.length > 0 && conflict[0].id !== ctx.user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email already in use' });
      }

      await db
        .update(users)
        .set({
          email: user.pendingEmail,
          emailVerified: true,
          emailVerifiedAt: new Date(),
          pendingEmail: null,
          emailVerificationCode: null,
          emailVerificationExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));

      const updatedRows = await db.select(authUserSelect).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const updatedUser = updatedRows[0];
      if (!updatedUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      const token = generateToken({
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
      });

      return {
        success: true as const,
        user: updatedUser,
        token,
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
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Email change requires verification. Use requestEmailChange first.',
        });
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
