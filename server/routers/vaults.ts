import { randomUUID } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../schema/users';
import { vaultActivity, vaultMembers, vaults } from '../schema/vaults';
import { protectedProcedure, router } from '../trpc';

async function requireMember(vaultId: string, userId: string, allowed: ('owner' | 'editor' | 'viewer')[] = ['owner', 'editor', 'viewer']) {
  const rows = await db
    .select()
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)))
    .limit(1);
  const member = rows[0];
  if (!member) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this vault' });
  }
  if (!allowed.includes(member.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Requires one of: ${allowed.join(', ')}` });
  }
  return member;
}

async function logActivity(vaultId: string, actorUserId: string, action: string, resource?: { kind: string; id: string }, meta?: Record<string, unknown>) {
  try {
    await db.insert(vaultActivity).values({
      id: randomUUID(),
      vaultId,
      actorUserId,
      action: action.slice(0, 80),
      resourceKind: resource?.kind ?? null,
      resourceId: resource?.id ?? null,
      meta: meta ? JSON.stringify(meta).slice(0, 2000) : null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('[vaults] activity log failed:', err);
  }
}

export const vaultsRouter = router({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await db
      .select()
      .from(vaultMembers)
      .where(eq(vaultMembers.userId, ctx.user.id));
    if (memberships.length === 0) return [];
    const vaultIds = memberships.map((m) => m.vaultId);
    const vaultRows = await db.select().from(vaults).where(inArray(vaults.id, vaultIds));
    const byId = new Map(vaultRows.map((v) => [v.id, v]));
    return memberships
      .map((m) => {
        const v = byId.get(m.vaultId);
        if (!v) return null;
        return { ...v, role: m.role, joinedAt: m.joinedAt };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = randomUUID();
      const now = new Date();
      await db.insert(vaults).values({
        id,
        ownerUserId: ctx.user.id,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        isPersonal: false,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(vaultMembers).values({
        id: randomUUID(),
        vaultId: id,
        userId: ctx.user.id,
        role: 'owner',
        invitedByUserId: null,
        joinedAt: now,
      });
      await logActivity(id, ctx.user.id, 'vault.created');
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireMember(input.id, ctx.user.id, ['owner', 'editor']);
      const { id, ...patch } = input;
      await db.update(vaults).set({ ...patch, updatedAt: new Date() }).where(eq(vaults.id, id));
      await logActivity(id, ctx.user.id, 'vault.updated');
      return { success: true as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const vaultRows = await db.select().from(vaults).where(eq(vaults.id, input.id)).limit(1);
      const vault = vaultRows[0];
      if (!vault) return { success: true as const };
      if (vault.ownerUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the vault owner can delete it' });
      }
      await db.delete(vaultMembers).where(eq(vaultMembers.vaultId, input.id));
      await db.delete(vaultActivity).where(eq(vaultActivity.vaultId, input.id));
      await db.delete(vaults).where(eq(vaults.id, input.id));
      return { success: true as const };
    }),

  listMembers: protectedProcedure
    .input(z.object({ vaultId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireMember(input.vaultId, ctx.user.id);
      const members = await db.select().from(vaultMembers).where(eq(vaultMembers.vaultId, input.vaultId));
      if (members.length === 0) return [];
      const userIds = members.map((m) => m.userId);
      const userRows = await db
        .select({ id: users.id, email: users.email, username: users.username })
        .from(users)
        .where(inArray(users.id, userIds));
      const userById = new Map(userRows.map((u) => [u.id, u]));
      return members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt,
        user: userById.get(m.userId) ?? { id: m.userId, email: null, username: null },
      }));
    }),

  invite: protectedProcedure
    .input(
      z.object({
        vaultId: z.string(),
        email: z.email(),
        role: z.enum(['editor', 'viewer']).default('viewer'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireMember(input.vaultId, ctx.user.id, ['owner', 'editor']);
      const normalizedEmail = input.email.trim().toLowerCase();
      const userRows = await db
        .select()
        .from(users)
        .where(and(eq(users.email, normalizedEmail), eq(users.isActive, true)))
        .limit(1);
      const user = userRows[0];
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No user with that email' });
      }
      const existing = await db
        .select()
        .from(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, input.vaultId), eq(vaultMembers.userId, user.id)))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(vaultMembers)
          .set({ role: input.role })
          .where(eq(vaultMembers.id, existing[0].id));
        await logActivity(input.vaultId, ctx.user.id, 'vault.role.updated', { kind: 'user', id: user.id }, { role: input.role });
        return { success: true as const, id: existing[0].id };
      }
      const id = randomUUID();
      await db.insert(vaultMembers).values({
        id,
        vaultId: input.vaultId,
        userId: user.id,
        role: input.role,
        invitedByUserId: ctx.user.id,
        joinedAt: new Date(),
      });
      await logActivity(input.vaultId, ctx.user.id, 'vault.member.added', { kind: 'user', id: user.id }, { role: input.role });
      return { success: true as const, id };
    }),

  removeMember: protectedProcedure
    .input(z.object({ vaultId: z.string(), userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireMember(input.vaultId, ctx.user.id, ['owner']);
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Owners cannot remove themselves; delete the vault instead.' });
      }
      await db
        .delete(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, input.vaultId), eq(vaultMembers.userId, input.userId)));
      await logActivity(input.vaultId, ctx.user.id, 'vault.member.removed', { kind: 'user', id: input.userId });
      return { success: true as const };
    }),

  leave: protectedProcedure
    .input(z.object({ vaultId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const vaultRows = await db.select().from(vaults).where(eq(vaults.id, input.vaultId)).limit(1);
      if (vaultRows[0]?.ownerUserId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Owners cannot leave; transfer or delete the vault.' });
      }
      await db
        .delete(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, input.vaultId), eq(vaultMembers.userId, ctx.user.id)));
      return { success: true as const };
    }),

  feed: protectedProcedure
    .input(z.object({ vaultId: z.string(), limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ input, ctx }) => {
      await requireMember(input.vaultId, ctx.user.id);
      return db
        .select()
        .from(vaultActivity)
        .where(eq(vaultActivity.vaultId, input.vaultId))
        .orderBy(desc(vaultActivity.createdAt))
        .limit(input.limit);
    }),

  logEvent: protectedProcedure
    .input(
      z.object({
        vaultId: z.string(),
        action: z.string().min(1).max(80),
        resourceKind: z.string().max(40).optional(),
        resourceId: z.string().max(100).optional(),
        meta: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireMember(input.vaultId, ctx.user.id, ['owner', 'editor']);
      await logActivity(
        input.vaultId,
        ctx.user.id,
        input.action,
        input.resourceKind && input.resourceId ? { kind: input.resourceKind, id: input.resourceId } : undefined,
        input.meta as Record<string, unknown> | undefined
      );
      return { success: true as const };
    }),
});
