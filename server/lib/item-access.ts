import { and, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { items } from '../schema/items';
import { itemShares } from '../schema/item_shares';

export type ItemAccess = {
  item: typeof items.$inferSelect;
  role: 'owner' | 'shared';
  permission: 'view' | 'edit';
};

export async function getItemAccessById(args: {
  itemId: string;
  userId: string;
  userEmail?: string | null;
}): Promise<ItemAccess | null> {
  const ownerRows = await db.select().from(items).where(eq(items.id, args.itemId)).limit(1);
  const item = ownerRows[0];
  if (!item) return null;

  if (item.userId === args.userId) {
    return {
      item,
      role: 'owner',
      permission: 'edit',
    };
  }

  const normalizedEmail = args.userEmail?.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const shareRows = await db
    .select()
    .from(itemShares)
    .where(and(eq(itemShares.itemId, args.itemId), eq(itemShares.sharedWithEmail, normalizedEmail)))
    .limit(1);
  const share = shareRows[0];
  if (!share) return null;

  return {
    item,
    role: 'shared',
    permission: share.permission === 'edit' ? 'edit' : 'view',
  };
}

export function ensureItemAccess(access: ItemAccess | null, required: 'view' | 'edit'): ItemAccess {
  if (!access) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
  }
  if (required === 'edit' && access.permission !== 'edit') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have edit access to this item' });
  }
  return access;
}
