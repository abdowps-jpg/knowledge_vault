import { createHash, randomInt, randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { getSessionCookieOptions } from '../_core/cookies';
import { comparePassword, generateToken, hashPassword, verifyToken as verifyJwtToken } from '../lib/auth';
import { buildTaskInboxAddressForUser } from '../lib/email-task-address';
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/email';
import { listAuditForUser, recordAudit } from '../lib/audit';
import { users } from '../schema/users';
import { protectedProcedure, publicProcedure, router } from '../trpc';

function getRequestAudit(req: unknown): { ip: string | null; userAgent: string | null } {
  const r = req as { ip?: string; headers?: Record<string, string | string[] | undefined> } | null;
  if (!r) return { ip: null, userAgent: null };
  const ua = r.headers?.['user-agent'];
  return {
    ip: r.ip ?? null,
    userAgent: Array.isArray(ua) ? ua[0] ?? null : (ua ?? null),
  };
}
import { COOKIE_NAME } from '../../shared/const.js';

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
  me: publicProcedure.query(({ ctx }) => ctx.user),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

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
    .mutation(async ({ input, ctx }) => {
      const email = input.email.trim().toLowerCase();
      const audit = getRequestAudit(ctx.req);
      try {
        const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
        const user = existing[0];

        if (!user) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Email is not registered. Please create an account.' });
        }

        if (!user.isActive) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Account is inactive' });
        }

        if (!user.emailVerified) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Please verify your email before login',
          });
        }

        const passwordMatches = await comparePassword(input.password, user.password);
        if (!passwordMatches) {
          await recordAudit({ userId: user.id, ...audit }, 'auth.login.failed');
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
        }

        const token = generateToken({
          id: user.id,
          email: user.email,
          username: user.username,
        });
        await recordAudit({ userId: user.id, ...audit }, 'auth.login.success');
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

  forgotPassword: publicProcedure
    .input(
      z.object({
        email: z.email(),
      })
    )
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = existing[0];

      if (user && user.emailVerified && user.isActive) {
        const resetCode = generateVerificationCode();
        const resetCodeHash = hashVerificationCode(resetCode);
        const resetCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);

        await db
          .update(users)
          .set({
            emailVerificationCode: resetCodeHash,
            emailVerificationExpiresAt: resetCodeExpiry,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        await sendPasswordResetEmail({ to: email, code: resetCode });
      }

      // Generic response prevents email enumeration.
      return { success: true as const };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({
        email: z.email(),
        code: z
          .string()
          .trim()
          .regex(/^\d{6}$/),
        newPassword: z.string().min(6),
      })
    )
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = existing[0];

      const submittedHash = hashVerificationCode(input.code);
      const isValid =
        !!user &&
        user.emailVerified &&
        !!user.emailVerificationCode &&
        !!user.emailVerificationExpiresAt &&
        user.emailVerificationExpiresAt.getTime() >= Date.now() &&
        submittedHash === user.emailVerificationCode;

      if (!isValid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired reset code' });
      }

      const hashed = await hashPassword(input.newPassword);
      await db
        .update(users)
        .set({
          password: hashed,
          emailVerificationCode: null,
          emailVerificationExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return { success: true as const };
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const audit = getRequestAudit(ctx.req);
      const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const user = userRows[0];
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const valid = await comparePassword(input.currentPassword, user.password);
      if (!valid) {
        await recordAudit({ userId: user.id, ...audit }, 'auth.password.change.failed');
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' });
      }

      const hashed = await hashPassword(input.newPassword);
      await db.update(users).set({ password: hashed, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
      await recordAudit({ userId: user.id, ...audit }, 'auth.password.changed');
      return { success: true as const };
    }),

  getAuditLog: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ input, ctx }) => {
      const rows = await listAuditForUser(ctx.user.id, input?.limit ?? 50);
      return rows;
    }),

  deleteAccount: protectedProcedure
    .input(z.object({ password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const user = userRows[0];
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const valid = await comparePassword(input.password, user.password);
      if (!valid) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect password' });

      const {
        items: itemsTable,
        tasks: tasksTable,
        journal: journalTable,
        categories,
        tags,
        habits,
        goals,
        goalMilestones,
        milestoneTasks,
        devices,
        subtasks,
        taskTimeEntries,
        itemComments,
        itemVersions,
        itemShares,
        publicLinks,
        attachments,
        itemTags,
        itemCategories,
        userNotifications,
        apiKeys,
        webhookSubscriptions,
      } = await import('../schema');

      const uid = ctx.user.id;

      // Gather IDs for indirect lookups
      const [userItems, userTasks, userJournals, userGoals] = await Promise.all([
        db.select({ id: itemsTable.id }).from(itemsTable).where(eq(itemsTable.userId, uid)),
        db.select({ id: tasksTable.id }).from(tasksTable).where(eq(tasksTable.userId, uid)),
        db.select({ id: journalTable.id }).from(journalTable).where(eq(journalTable.userId, uid)),
        db.select({ id: goals.id }).from(goals).where(eq(goals.userId, uid)),
      ]);

      const itemIds = userItems.map((r) => r.id);
      const taskIds = userTasks.map((r) => r.id);
      const journalIds = userJournals.map((r) => r.id);
      const goalIds = userGoals.map((r) => r.id);

      // Get milestone IDs for milestoneTasks deletion
      const milestoneRows =
        goalIds.length > 0
          ? await db.select({ id: goalMilestones.id }).from(goalMilestones).where(inArray(goalMilestones.goalId, goalIds))
          : [];
      const milestoneIds = milestoneRows.map((r) => r.id);

      // Delete junction/leaf tables first
      if (milestoneIds.length > 0) {
        await db.delete(milestoneTasks).where(inArray(milestoneTasks.milestoneId, milestoneIds));
      }
      if (goalIds.length > 0) {
        await db.delete(goalMilestones).where(inArray(goalMilestones.goalId, goalIds));
      }
      if (itemIds.length > 0) {
        await db.delete(itemTags).where(inArray(itemTags.itemId, itemIds));
        await db.delete(itemCategories).where(inArray(itemCategories.itemId, itemIds));
        await db.delete(attachments).where(inArray(attachments.itemId, itemIds));
      }
      if (journalIds.length > 0) {
        await db.delete(attachments).where(inArray(attachments.journalId, journalIds));
      }
      if (taskIds.length > 0) {
        await db.delete(subtasks).where(inArray(subtasks.taskId, taskIds));
        await db.delete(taskTimeEntries).where(inArray(taskTimeEntries.taskId, taskIds));
      }

      // Delete tables with direct userId
      await db.delete(itemComments).where(eq(itemComments.userId, uid));
      await db.delete(itemVersions).where(eq(itemVersions.userId, uid));
      await db.delete(itemShares).where(eq(itemShares.ownerUserId, uid));
      await db.delete(publicLinks).where(eq(publicLinks.ownerUserId, uid));
      await db.delete(habits).where(eq(habits.userId, uid));
      await db.delete(devices).where(eq(devices.userId, uid));
      await db.delete(userNotifications).where(eq(userNotifications.userId, uid));
      await db.delete(apiKeys).where(eq(apiKeys.userId, uid));
      await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.userId, uid));
      await db.delete(goals).where(eq(goals.userId, uid));

      // Delete main data tables
      await db.delete(journalTable).where(eq(journalTable.userId, uid));
      await db.delete(tasksTable).where(eq(tasksTable.userId, uid));
      await db.delete(itemsTable).where(eq(itemsTable.userId, uid));
      await db.delete(categories).where(eq(categories.userId, uid));
      await db.delete(tags).where(eq(tags.userId, uid));
      await db.delete(users).where(eq(users.id, uid));

      return { success: true as const };
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
