import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { items } from '../schema';
import { eq, and, desc, asc, sql, gte, inArray, isNull, lt } from 'drizzle-orm';
import { db } from '../db';
import { randomUUID } from 'crypto';
import { itemTags, tags } from '../schema/tags';
import { itemCategories } from '../schema/categories';
import { ensureItemAccess, getItemAccessById } from '../lib/item-access';
import { fetchLinkMetadata } from '../lib/link-metadata';
import { itemVersions } from '../schema/item_versions';
import { canWrite, canDelete } from '../../lib/vault-permissions';

const LINK_META_WINDOW_MS = 60_000;
const LINK_META_MAX = 20;
const linkMetaUsage = new Map<string, { count: number; resetAt: number }>();

function enforceLinkMetaQuota(userId: string) {
  const now = Date.now();
  const entry = linkMetaUsage.get(userId);
  if (!entry || now > entry.resetAt) {
    linkMetaUsage.set(userId, { count: 1, resetAt: now + LINK_META_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= LINK_META_MAX;
}

export const itemsRouter = router({
  // قراءة كل العناصر
  list: protectedProcedure
    .input(z.object({
      location: z.enum(['inbox', 'library', 'archive']).optional(),
      isFavorite: z.boolean().optional(),
      type: z.enum(['note', 'quote', 'link', 'audio']).optional(),
      categoryId: z.string().optional(),
      vaultId: z.string().optional(),
      recentDays: z.number().optional(),
      sortBy: z.enum(['createdAt', 'title']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
      limit: z.number().min(1).max(100).default(25),
      cursor: z.number().int().min(0).optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const cursor = input.cursor ?? 0;
        const conditions = [eq(items.userId, ctx.user.id), isNull(items.deletedAt)];
        
        if (input.location) {
          conditions.push(eq(items.location, input.location));
        }

        if (typeof input.isFavorite === 'boolean') {
          conditions.push(eq(items.isFavorite, input.isFavorite));
        }

        if (input.type) {
          conditions.push(eq(items.type, input.type));
        }

        if (input.categoryId) {
          conditions.push(eq(itemCategories.categoryId, input.categoryId));
        }

        if (input.vaultId) {
          conditions.push(eq(items.vaultId, input.vaultId));
        }

        if (input.recentDays && input.recentDays > 0) {
          const recentThreshold = new Date(Date.now() - input.recentDays * 24 * 60 * 60 * 1000);
          conditions.push(gte(items.createdAt, recentThreshold));
        }
        
        const rows = await db
          .select()
          .from(items)
          .leftJoin(itemCategories, eq(itemCategories.itemId, items.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(
            input.sortBy === 'title'
              ? input.sortOrder === 'asc'
                ? asc(items.title)
                : desc(items.title)
              : input.sortOrder === 'asc'
              ? asc(items.createdAt)
              : desc(items.createdAt)
          )
          .limit(input.limit + 1)
          .offset(cursor);

        if (!rows || rows.length === 0) {
          return { items: [], nextCursor: undefined };
        }

        const hasMore = rows.length > input.limit;
        const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
        const mappedItems = pageRows.map((row) => ({
          ...row.items,
          tags: [] as Array<{ id: string; name: string; color: string | null }>,
        }));
        const itemIds = mappedItems.map((item: any) => item.id);

        if (itemIds.length === 0) {
          return { items: mappedItems, nextCursor: undefined };
        }

        const tagRows = await db
          .select()
          .from(itemTags)
          .innerJoin(tags, eq(tags.id, itemTags.tagId))
          .where(inArray(itemTags.itemId, itemIds));

        const tagsByItemId = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
        for (const row of tagRows) {
          const entry = tagsByItemId.get(row.item_tags.itemId) ?? [];
          entry.push({
            id: row.tags.id,
            name: row.tags.name,
            color: row.tags.color,
          });
          tagsByItemId.set(row.item_tags.itemId, entry);
        }

        const categoryLinks = await db
          .select()
          .from(itemCategories)
          .where(inArray(itemCategories.itemId, itemIds));

        const categoryByItemId = new Map<string, string>();
        for (const link of categoryLinks) {
          categoryByItemId.set(link.itemId, link.categoryId);
        }

        return {
          items: mappedItems.map((item: any) => ({
            ...item,
            tags: tagsByItemId.get(item.id) ?? [],
            categoryId: categoryByItemId.get(item.id) ?? null,
          })),
          nextCursor: hasMore ? cursor + input.limit : undefined,
        };
      } catch (error) {
        console.error('Error fetching items:', error);
        return { items: [], nextCursor: undefined };
      }
    }),

  // Get single item with its tags
  getWithTags: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const itemRows = await db
          .select()
          .from(items)
          .where(eq(items.id, input.id))
          .limit(1);
        const itemRow = itemRows[0];

        let accessRole: 'owner' | 'shared' = 'owner';
        let accessPermission: 'view' | 'edit' = 'edit';

        if (itemRow?.vaultId) {
          const { vaultMembers } = await import('../schema/vaults');
          const memberRows = await db
            .select()
            .from(vaultMembers)
            .where(and(eq(vaultMembers.vaultId, itemRow.vaultId), eq(vaultMembers.userId, ctx.user.id)))
            .limit(1);
          const member = memberRows[0];
          if (!member) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this vault' });
          }
          accessRole = member.role === 'owner' ? 'owner' : 'shared';
          accessPermission = member.role === 'viewer' ? 'view' : 'edit';
        } else if (!itemRow || itemRow.userId !== ctx.user.id) {
          const access = await getItemAccessById({
            itemId: input.id,
            userId: ctx.user.id,
            userEmail: ctx.user.email,
          });
          const ensuredAccess = ensureItemAccess(access, 'view');
          accessRole = ensuredAccess.role;
          accessPermission = ensuredAccess.permission;
        }

        const rows = await db
          .select()
          .from(items)
          .leftJoin(itemTags, eq(itemTags.itemId, items.id))
          .leftJoin(tags, eq(tags.id, itemTags.tagId))
          .where(eq(items.id, input.id));

        if (!rows || rows.length === 0) {
          return null;
        }

        const baseItem = rows[0].items;
        const categoryLink = await db
          .select()
          .from(itemCategories)
          .where(eq(itemCategories.itemId, input.id))
          .limit(1);

        const result = {
          ...baseItem,
          tags: [] as Array<{ id: string; name: string; color: string | null }>,
          categoryId: categoryLink[0]?.categoryId ?? null,
          accessRole,
          accessPermission,
        };

        for (const row of rows) {
          if (row.tags) {
            const alreadyAdded = result.tags.some((t) => t.id === row.tags!.id);
            if (!alreadyAdded) {
              result.tags.push({
                id: row.tags.id,
                name: row.tags.name,
                color: row.tags.color,
              });
            }
          }
        }

        return result;
      } catch (error) {
        console.error('Error fetching item with tags:', error);
        return null;
      }
    }),

  // إضافة عنصر جديد
  create: protectedProcedure
    .input(z.object({
      type: z.enum(['note', 'quote', 'link', 'audio']),
      title: z.string(),
      content: z.string().optional(),
      url: z.string().optional(),
      location: z.enum(['inbox', 'library', 'archive']).optional(),
      vaultId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (input.vaultId) {
          await canWrite(ctx.user.id, input.vaultId);
        }
        const newItem = {
          id: randomUUID(),
          userId: ctx.user.id,
          type: input.type,
          title: input.title,
          content: input.content || null,
          url: input.url || null,
          location: input.location ?? ('inbox' as const),
          isFavorite: false,
          vaultId: input.vaultId ?? null,
        };

        await db.insert(items).values(newItem);

        // Background metadata enrichment for links: fire-and-forget. Only fills
        // blanks; never overwrites user-provided title/content.
        const urlForEnrich = (input.url || '').trim();
        if (input.type === 'link' && /^https?:\/\//i.test(urlForEnrich)) {
          const titleLooksBlank =
            !input.title ||
            input.title.trim().length === 0 ||
            input.title.trim() === urlForEnrich;
          const contentLooksBlank = !input.content || input.content.trim().length === 0;

          if (enforceLinkMetaQuota(ctx.user.id) && (titleLooksBlank || contentLooksBlank)) {
            fetchLinkMetadata(urlForEnrich)
              .then(async (metadata) => {
                if (!metadata) return;
                const patch: { title?: string; content?: string; updatedAt: Date } = {
                  updatedAt: new Date(),
                };
                if (titleLooksBlank && metadata.title) {
                  patch.title = metadata.title.slice(0, 500);
                }
                if (contentLooksBlank && metadata.description) {
                  patch.content = metadata.description;
                }
                if (patch.title || patch.content) {
                  await db.update(items).set(patch).where(eq(items.id, newItem.id));
                }
              })
              .catch((err) => {
                console.error('[items.create] background link enrichment failed:', err);
              });
          }
        }

        return newItem;
      } catch (error) {
        console.error('Error creating item:', error);
        throw error;
      }
    }),

  // تعديل عنصر
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      content: z.string().optional(),
      location: z.enum(['inbox', 'library', 'archive']).optional(),
      isFavorite: z.boolean().optional(),
      vaultId: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      const currentForVault = await db.select().from(items).where(eq(items.id, id)).limit(1);
      const currentVaultId = currentForVault[0]?.vaultId ?? null;
      if (currentVaultId) {
        await canWrite(ctx.user.id, currentVaultId);
      } else {
        const access = await getItemAccessById({
          itemId: id,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
        });
        ensureItemAccess(access, 'edit');
      }
      if (typeof input.vaultId !== 'undefined' && input.vaultId !== currentVaultId) {
        if (input.vaultId) {
          await canWrite(ctx.user.id, input.vaultId);
        }
      }

      const MAX_VERSIONS_PER_ITEM = 50;

      const currentRows = await db.select().from(items).where(eq(items.id, id)).limit(1);
      const current = currentRows[0];
      if (current) {
        await db.insert(itemVersions).values({
          id: randomUUID(),
          itemId: current.id,
          userId: current.userId,
          title: current.title,
          content: current.content,
          createdAt: new Date(),
        });

        // Keep only the most recent MAX_VERSIONS_PER_ITEM versions per item.
        const oldest = await db
          .select({ id: itemVersions.id, createdAt: itemVersions.createdAt })
          .from(itemVersions)
          .where(eq(itemVersions.itemId, current.id))
          .orderBy(desc(itemVersions.createdAt))
          .offset(MAX_VERSIONS_PER_ITEM)
          .limit(1);
        const cutoff = oldest[0]?.createdAt ?? null;
        if (cutoff !== null) {
          await db
            .delete(itemVersions)
            .where(and(eq(itemVersions.itemId, current.id), lt(itemVersions.createdAt, cutoff)));
        }
      }

      await db
        .update(items)
        .set({ ...data, updatedAt: sql`(strftime('%s', 'now'))` })
        .where(eq(items.id, id));
      
      return { success: true };
    }),

  // Toggle favorite status
  toggleFavorite: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const existing = await db
          .select()
          .from(items)
          .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)))
          .limit(1);

        if (!existing || existing.length === 0) {
          return { success: false, isFavorite: false };
        }

        const nextIsFavorite = !existing[0].isFavorite;

        await db
          .update(items)
          .set({
            isFavorite: nextIsFavorite,
            updatedAt: sql`(strftime('%s', 'now'))`,
          })
          .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)));

        return { success: true, isFavorite: nextIsFavorite };
      } catch (error) {
        console.error('Error toggling favorite:', error);
        return { success: false, isFavorite: false };
      }
    }),

  // حذف عنصر
  delete: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const row = await db.select().from(items).where(eq(items.id, input.id)).limit(1);
      if (row[0]?.vaultId) {
        await canDelete(ctx.user.id, row[0].vaultId);
        await db.delete(items).where(eq(items.id, input.id));
      } else {
        await db
          .delete(items)
          .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)));
      }

      return { success: true };
    }),

  bulkMove: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(100),
        location: z.enum(['inbox', 'library', 'archive']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db
        .update(items)
        .set({ location: input.location, updatedAt: new Date() })
        .where(
          and(
            inArray(items.id, input.ids),
            eq(items.userId, ctx.user.id),
            isNull(items.deletedAt)
          )
        );
      return { success: true as const, moved: input.ids.length };
    }),

  bulkFavorite: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(100),
        isFavorite: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db
        .update(items)
        .set({ isFavorite: input.isFavorite, updatedAt: new Date() })
        .where(
          and(
            inArray(items.id, input.ids),
            eq(items.userId, ctx.user.id),
            isNull(items.deletedAt)
          )
        );
      return { success: true as const, updated: input.ids.length };
    }),

  trash: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .update(items)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)));
      return { success: true as const };
    }),

  merge: protectedProcedure
    .input(
      z.object({
        keepId: z.string(),
        mergeFromId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.keepId === input.mergeFromId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot merge an item into itself' });
      }
      const rows = await db
        .select()
        .from(items)
        .where(
          and(
            inArray(items.id, [input.keepId, input.mergeFromId]),
            eq(items.userId, ctx.user.id),
            isNull(items.deletedAt)
          )
        );
      const keep = rows.find((r) => r.id === input.keepId);
      const from = rows.find((r) => r.id === input.mergeFromId);
      if (!keep || !from) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }

      const mergedContent = [
        (keep.content ?? '').trim(),
        from.content && from.content.trim() ? `\n\n---\n\n${from.content.trim()}` : '',
      ]
        .join('')
        .slice(0, 100_000);

      await db
        .update(items)
        .set({
          content: mergedContent,
          url: keep.url ?? from.url ?? null,
          updatedAt: new Date(),
        })
        .where(eq(items.id, keep.id));

      // Union tag links
      const fromTagLinks = await db.select().from(itemTags).where(eq(itemTags.itemId, from.id));
      for (const link of fromTagLinks) {
        const existing = await db
          .select()
          .from(itemTags)
          .where(and(eq(itemTags.itemId, keep.id), eq(itemTags.tagId, link.tagId)))
          .limit(1);
        if (existing.length === 0) {
          await db.update(itemTags).set({ itemId: keep.id }).where(eq(itemTags.id, link.id));
        } else {
          await db.delete(itemTags).where(eq(itemTags.id, link.id));
        }
      }

      // Soft-delete the source
      await db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, from.id));

      return { success: true as const, keptId: keep.id };
    }),

  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .limit(1);
      const src = rows[0];
      if (!src) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }
      const now = new Date();
      const copy = {
        id: randomUUID(),
        userId: ctx.user.id,
        type: src.type,
        title: `${src.title} (copy)`.slice(0, 500),
        content: src.content,
        url: src.url,
        location: src.location ?? 'inbox',
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(items).values(copy);

      // Copy tag links
      const tagLinks = await db.select().from(itemTags).where(eq(itemTags.itemId, src.id));
      for (const link of tagLinks) {
        await db.insert(itemTags).values({
          id: randomUUID(),
          itemId: copy.id,
          tagId: link.tagId,
          createdAt: now,
        });
      }
      return copy;
    }),

  removeAllTags: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const ownRow = await db
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
        .limit(1);
      if (ownRow.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }
      const removed = await db.delete(itemTags).where(eq(itemTags.itemId, input.itemId));
      return { success: true as const, removed: Array.isArray(removed) ? removed.length : 0 };
    }),

  setCategory: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        categoryId: z.string().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify item ownership
      const itemRow = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .limit(1);
      if (itemRow.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }
      // Clear existing category link
      await db.delete(itemCategories).where(eq(itemCategories.itemId, input.itemId));
      if (input.categoryId) {
        // Verify category ownership before linking
        const catRow = await db
          .select()
          .from(itemCategories)
          .where(eq(itemCategories.categoryId, input.categoryId))
          .limit(1);
        // Ownership of category was not tracked in the link table; fetch from categories
        const { categories } = await import('../schema/categories');
        const ownCat = await db
          .select()
          .from(categories)
          .where(and(eq(categories.id, input.categoryId), eq(categories.userId, ctx.user.id)))
          .limit(1);
        if (ownCat.length === 0) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Category not found' });
        }
        await db.insert(itemCategories).values({
          id: randomUUID(),
          itemId: input.itemId,
          categoryId: input.categoryId,
          createdAt: new Date().toISOString(),
        });
        // satisfy unused variable
        void catRow;
      }
      return { success: true as const, categoryId: input.categoryId };
    }),

  bulkAddTag: protectedProcedure
    .input(
      z.object({
        itemIds: z.array(z.string()).min(1).max(100),
        tagId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify tag ownership
      const tagRow = await db
        .select()
        .from(tags)
        .where(and(eq(tags.id, input.tagId), eq(tags.userId, ctx.user.id)))
        .limit(1);
      if (tagRow.length === 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Tag not found for this user' });
      }

      // Verify all items belong to the user
      const ownedItems = await db
        .select({ id: items.id })
        .from(items)
        .where(
          and(
            inArray(items.id, input.itemIds),
            eq(items.userId, ctx.user.id),
            isNull(items.deletedAt)
          )
        );
      const ownedIds = new Set(ownedItems.map((r) => r.id));
      const toLink = input.itemIds.filter((id) => ownedIds.has(id));
      if (toLink.length === 0) return { success: true as const, linked: 0 };

      // Skip items that already have this tag
      const existingLinks = await db
        .select()
        .from(itemTags)
        .where(and(inArray(itemTags.itemId, toLink), eq(itemTags.tagId, input.tagId)));
      const existingItemIds = new Set(existingLinks.map((l) => l.itemId));
      const newLinks = toLink
        .filter((id) => !existingItemIds.has(id))
        .map((id) => ({
          id: randomUUID(),
          itemId: id,
          tagId: input.tagId,
          createdAt: new Date(),
        }));
      if (newLinks.length > 0) {
        await db.insert(itemTags).values(newLinks);
      }
      return { success: true as const, linked: newLinks.length, skipped: toLink.length - newLinks.length };
    }),

  bulkTrash: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      await db
        .update(items)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(inArray(items.id, input.ids), eq(items.userId, ctx.user.id)));
      return { success: true as const, trashed: input.ids.length };
    }),

  bulkRestore: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      await db
        .update(items)
        .set({ deletedAt: null, updatedAt: now })
        .where(and(inArray(items.id, input.ids), eq(items.userId, ctx.user.id)));
      return { success: true as const, restored: input.ids.length };
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .update(items)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)));
      return { success: true as const };
    }),

  listTrashed: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(items)
      .where(and(eq(items.userId, ctx.user.id), sql`${items.deletedAt} IS NOT NULL`))
      .orderBy(desc(items.deletedAt))
      .limit(200);
    return rows;
  }),

  emptyTrash: protectedProcedure.mutation(async ({ ctx }) => {
    const trashed = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.userId, ctx.user.id), sql`${items.deletedAt} IS NOT NULL`));
    const ids = trashed.map((t) => t.id);
    if (ids.length === 0) return { success: true as const, deleted: 0 };
    await db.delete(items).where(and(eq(items.userId, ctx.user.id), inArray(items.id, ids)));
    return { success: true as const, deleted: ids.length };
  }),

  syncItems: protectedProcedure
    .input(
      z.object({
        since: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const sinceDate = input.since ? new Date(input.since) : new Date(0);
      const result = await db
        .select()
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), gte(items.updatedAt, sinceDate)))
        .orderBy(desc(items.updatedAt));
      return result ?? [];
    }),

  searchFast: protectedProcedure
    .input(
      z.object({
        q: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const needle = `%${input.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      const rows = await db
        .select()
        .from(items)
        .where(
          and(
            eq(items.userId, ctx.user.id),
            isNull(items.deletedAt),
            sql`(lower(${items.title}) LIKE lower(${needle}) OR lower(coalesce(${items.content}, '')) LIKE lower(${needle}))`
          )
        )
        .orderBy(desc(items.updatedAt))
        .limit(input.limit);
      return rows;
    }),

  convertToJournal: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        keepItem: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .limit(1);
      const item = rows[0];
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }
      const { journal } = await import('../schema/journal');
      const newJournalId = randomUUID();
      const now = new Date();
      await db.insert(journal).values({
        id: newJournalId,
        userId: ctx.user.id,
        entryDate: input.entryDate,
        title: item.title ?? null,
        content: item.content ?? '',
        mood: null,
        location: null,
        weather: null,
        isLocked: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      if (!input.keepItem) {
        await db
          .update(items)
          .set({ deletedAt: now })
          .where(eq(items.id, item.id));
      }
      return { success: true as const, journalId: newJournalId };
    }),

  archiveInboxOlderThan: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .mutation(async ({ input, ctx }) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.days);
      const rows = await db
        .select({ id: items.id })
        .from(items)
        .where(
          and(
            eq(items.userId, ctx.user.id),
            isNull(items.deletedAt),
            eq(items.location, 'inbox'),
            lt(items.createdAt, cutoff)
          )
        );
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return { success: true as const, archived: 0 };
      await db
        .update(items)
        .set({ location: 'archive', updatedAt: new Date() })
        .where(and(inArray(items.id, ids), eq(items.userId, ctx.user.id)));
      return { success: true as const, archived: ids.length };
    }),

  createQuote: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(2000),
        source: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = randomUUID();
      const now = new Date();
      const title = input.text.slice(0, 80).trim() || 'Quote';
      const content = input.source ? `${input.text}\n\n— ${input.source}` : input.text;
      await db.insert(items).values({
        id,
        userId: ctx.user.id,
        type: 'quote',
        title,
        content,
        url: null,
        location: 'inbox',
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      });
      return { id };
    }),

  snapshot: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .limit(1);
      const item = rows[0];
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }
      const { attachments } = await import('../schema/attachments');
      const { itemShares } = await import('../schema/item_shares');
      const { publicLinks } = await import('../schema/public_links');
      const { itemComments } = await import('../schema/item_comments');
      const { flashcards } = await import('../schema/flashcards');

      const [tagRows, categoryLinks, shares, links, comments, attachmentsRows, cardRows] = await Promise.all([
        db.select().from(itemTags).innerJoin(tags, eq(tags.id, itemTags.tagId)).where(eq(itemTags.itemId, input.id)),
        db.select().from(itemCategories).where(eq(itemCategories.itemId, input.id)),
        db.select().from(itemShares).where(eq(itemShares.itemId, input.id)),
        db.select().from(publicLinks).where(eq(publicLinks.itemId, input.id)),
        db.select().from(itemComments).where(eq(itemComments.itemId, input.id)).orderBy(asc(itemComments.createdAt)),
        db.select().from(attachments).where(eq(attachments.itemId, input.id)),
        db.select().from(flashcards).where(and(eq(flashcards.userId, ctx.user.id), eq(flashcards.itemId, input.id))),
      ]);

      return {
        item,
        tags: tagRows.map((r) => ({ id: r.tags.id, name: r.tags.name, color: r.tags.color })),
        categoryId: categoryLinks[0]?.categoryId ?? null,
        shares,
        publicLinks: links,
        comments,
        attachments: attachmentsRows,
        flashcards: cardRows,
      };
    }),

  exportOneMarkdown: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .limit(1);
      const item = rows[0];
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }
      const tagRows = await db
        .select()
        .from(itemTags)
        .innerJoin(tags, eq(tags.id, itemTags.tagId))
        .where(eq(itemTags.itemId, item.id));
      const tagNames = tagRows.map((r) => r.tags.name);
      const createdAt = item.createdAt instanceof Date ? item.createdAt.toISOString() : null;
      const frontMatter = [
        '---',
        `title: "${(item.title ?? 'Untitled').replace(/"/g, '\\"')}"`,
        `type: ${item.type}`,
        createdAt ? `createdAt: ${createdAt}` : '',
        item.url ? `url: "${item.url.replace(/"/g, '\\"')}"` : '',
        tagNames.length ? `tags: [${tagNames.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]` : '',
        '---',
        '',
      ]
        .filter(Boolean)
        .join('\n');
      const body = (item.content ?? '').trim();
      return {
        filename: `${(item.title ?? 'untitled').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'untitled'}.md`,
        markdown: `${frontMatter}# ${item.title || 'Untitled'}\n\n${body}\n`,
      };
    }),

  shareStatus: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { itemShares } = await import('../schema/item_shares');
      const { publicLinks } = await import('../schema/public_links');
      // Verify ownership
      const owned = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
        .limit(1);
      if (owned.length === 0) {
        return { isOwner: false, shares: [], publicLinks: [] };
      }
      const [shares, links] = await Promise.all([
        db.select().from(itemShares).where(eq(itemShares.itemId, input.itemId)),
        db.select().from(publicLinks).where(eq(publicLinks.itemId, input.itemId)),
      ]);
      return {
        isOwner: true,
        shares,
        publicLinks: links,
      };
    }),

  fromTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        title: z.string().min(1).max(500),
        location: z.enum(['inbox', 'library', 'archive']).default('inbox'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { templates } = await import('../schema/templates');
      const tplRows = await db
        .select()
        .from(templates)
        .where(and(eq(templates.id, input.templateId), eq(templates.userId, ctx.user.id)))
        .limit(1);
      const tpl = tplRows[0];
      if (!tpl) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });
      }
      if (tpl.kind !== 'item') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Template is not an item template' });
      }
      const newItem = {
        id: randomUUID(),
        userId: ctx.user.id,
        type: 'note' as const,
        title: input.title.trim(),
        content: tpl.body,
        url: null,
        location: input.location,
        isFavorite: false,
      };
      await db.insert(items).values(newItem);
      return newItem;
    }),

  neighbors: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        location: z.enum(['inbox', 'library', 'archive']).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const conditions = [eq(items.userId, ctx.user.id), isNull(items.deletedAt)];
      if (input.location) conditions.push(eq(items.location, input.location));
      const rows = await db
        .select({ id: items.id, title: items.title, createdAt: items.createdAt })
        .from(items)
        .where(and(...conditions))
        .orderBy(desc(items.createdAt));
      const idx = rows.findIndex((r) => r.id === input.id);
      if (idx === -1) return { prev: null, next: null };
      return {
        prev: idx > 0 ? rows[idx - 1] : null,
        next: idx < rows.length - 1 ? rows[idx + 1] : null,
      };
    }),

  topDomains: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(10) }).optional())
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select({ url: items.url })
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt), eq(items.type, 'link')));
      const counts = new Map<string, number>();
      for (const r of rows) {
        if (!r.url) continue;
        try {
          const host = new URL(r.url).hostname.replace(/^www\./, '');
          if (host) counts.set(host, (counts.get(host) ?? 0) + 1);
        } catch {
          // malformed URL — skip
        }
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, input?.limit ?? 10)
        .map(([domain, count]) => ({ domain, count }));
    }),

  publishShortcut: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const owned = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .limit(1);
      if (owned.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }
      const { publicLinks } = await import('../schema/public_links');
      const token = randomUUID().replace(/-/g, '');
      const linkId = randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // default 30-day expiry
      await db.insert(publicLinks).values({
        id: linkId,
        token,
        itemId: input.itemId,
        ownerUserId: ctx.user.id,
        passwordHash: null,
        expiresAt,
        isRevoked: false,
        viewCount: 0,
        lastViewedAt: null,
        createdAt: new Date(),
      });
      return {
        id: linkId,
        token,
        urlPath: `/p/${token}`,
        expiresAt: expiresAt.toISOString(),
      };
    }),

  findDuplicates: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(items)
      .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt)));
    const byKey = new Map<string, typeof rows>();
    for (const r of rows) {
      const normalizedTitle = (r.title ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
      const normalizedUrl = r.url ? r.url.replace(/[?#].*$/, '').replace(/\/$/, '') : '';
      const key = normalizedUrl ? `url:${normalizedUrl}` : `title:${normalizedTitle}`;
      if (!key || key === 'title:') continue;
      const list = byKey.get(key) ?? [];
      list.push(r);
      byKey.set(key, list);
    }
    return Array.from(byKey.entries())
      .filter(([, list]) => list.length >= 2)
      .slice(0, 50)
      .map(([key, list]) => ({
        key,
        count: list.length,
        items: list.map((i) => ({
          id: i.id,
          title: i.title,
          type: i.type,
          createdAt: i.createdAt,
        })),
      }));
  }),

  findOrphans: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ input, ctx }) => {
      const allUserItems = await db
        .select({ id: items.id, title: items.title, type: items.type, createdAt: items.createdAt })
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .orderBy(desc(items.createdAt))
        .limit(500);
      const userItemIds = allUserItems.map((i) => i.id);
      if (userItemIds.length === 0) return [];
      const [tagLinks, catLinks] = await Promise.all([
        db.select({ itemId: itemTags.itemId }).from(itemTags).where(inArray(itemTags.itemId, userItemIds)),
        db.select({ itemId: itemCategories.itemId }).from(itemCategories).where(inArray(itemCategories.itemId, userItemIds)),
      ]);
      const hasTag = new Set(tagLinks.map((l) => l.itemId));
      const hasCat = new Set(catLinks.map((l) => l.itemId));
      return allUserItems
        .filter((i) => !hasTag.has(i.id) && !hasCat.has(i.id))
        .slice(0, input?.limit ?? 50);
    }),

  byDateRange: protectedProcedure
    .input(
      z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        limit: z.number().int().min(1).max(200).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const startMs = new Date(input.start + 'T00:00:00Z');
      const endMs = new Date(input.end + 'T23:59:59Z');
      return db
        .select()
        .from(items)
        .where(
          and(
            eq(items.userId, ctx.user.id),
            isNull(items.deletedAt),
            gte(items.createdAt, startMs),
            lt(items.createdAt, endMs)
          )
        )
        .orderBy(desc(items.createdAt))
        .limit(input.limit);
    }),

  byCategory: protectedProcedure
    .input(z.object({ categoryId: z.string(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input, ctx }) => {
      const links = await db
        .select()
        .from(itemCategories)
        .where(eq(itemCategories.categoryId, input.categoryId));
      const itemIds = links.map((l) => l.itemId);
      if (itemIds.length === 0) return [];
      return db
        .select()
        .from(items)
        .where(
          and(
            inArray(items.id, itemIds),
            eq(items.userId, ctx.user.id),
            isNull(items.deletedAt)
          )
        )
        .orderBy(desc(items.updatedAt))
        .limit(input.limit);
    }),

  counts: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(items)
      .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt)));
    const total = rows.length;
    const byType = { note: 0, quote: 0, link: 0, audio: 0 };
    const byLocation = { inbox: 0, library: 0, archive: 0 };
    let favorites = 0;
    for (const r of rows) {
      const t = r.type as keyof typeof byType;
      if (t in byType) byType[t] += 1;
      const l = (r.location ?? 'inbox') as keyof typeof byLocation;
      if (l in byLocation) byLocation[l] += 1;
      if (r.isFavorite) favorites += 1;
    }
    const trashedRows = await db
      .select()
      .from(items)
      .where(and(eq(items.userId, ctx.user.id), sql`${items.deletedAt} IS NOT NULL`));
    return {
      total,
      byType,
      byLocation,
      favorites,
      trashed: trashedRows.length,
    };
  }),

  listByTag: protectedProcedure
    .input(
      z.object({
        tagId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify the tag belongs to the user
      const tagRow = await db
        .select()
        .from(tags)
        .where(and(eq(tags.id, input.tagId), eq(tags.userId, ctx.user.id)))
        .limit(1);
      if (tagRow.length === 0) return [];

      const links = await db
        .select()
        .from(itemTags)
        .where(eq(itemTags.tagId, input.tagId));
      const itemIds = links.map((l) => l.itemId);
      if (itemIds.length === 0) return [];

      return db
        .select()
        .from(items)
        .where(
          and(
            eq(items.userId, ctx.user.id),
            isNull(items.deletedAt),
            inArray(items.id, itemIds)
          )
        )
        .orderBy(desc(items.updatedAt))
        .limit(input.limit);
    }),

  recentlyEdited: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(8) }).optional())
    .query(async ({ input, ctx }) => {
      const limit = input?.limit ?? 8;
      const rows = await db
        .select()
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .orderBy(desc(items.updatedAt))
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        updatedAt: r.updatedAt,
      }));
    }),

  fetchLinkMetadata: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      if (!enforceLinkMetaQuota(ctx.user.id)) {
        return {
          metadata: null,
          error: 'rate_limited' as const,
        };
      }
      const metadata = await fetchLinkMetadata(input.url);
      return { metadata, error: null };
    }),

  bulkImport: protectedProcedure
    .input(
      z.object({
        notes: z
          .array(
            z.object({
              title: z.string().min(1).max(500),
              content: z.string().max(100_000).optional(),
              url: z.string().url().max(2048).optional(),
            })
          )
          .min(1)
          .max(200),
        location: z.enum(['inbox', 'library', 'archive']).default('library'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      const rows = input.notes.map((n) => ({
        id: randomUUID(),
        userId: ctx.user.id,
        type: (n.url ? 'link' : 'note') as 'note' | 'link',
        title: n.title.trim().slice(0, 500),
        content: n.content?.trim().slice(0, 100_000) ?? null,
        url: n.url ?? null,
        location: input.location,
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      }));

      await db.insert(items).values(rows);
      return { success: true as const, imported: rows.length, ids: rows.map((r) => r.id) };
    }),
});
