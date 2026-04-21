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
        const ownerRows = await db
          .select()
          .from(items)
          .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)))
          .limit(1);

        let accessRole: 'owner' | 'shared' = 'owner';
        let accessPermission: 'view' | 'edit' = 'edit';

        if (ownerRows.length === 0) {
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
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const newItem = {
          id: randomUUID(),
          userId: ctx.user.id,
          type: input.type,
          title: input.title,
          content: input.content || null,
          url: input.url || null,
          location: input.location ?? ('inbox' as const),
          isFavorite: false,
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
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      const access = await getItemAccessById({
        itemId: id,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });
      ensureItemAccess(access, 'edit');

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
      await db
        .delete(items)
        .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)));

      return { success: true };
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
