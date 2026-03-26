import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { items, journal, tasks, users, tags, categories } from "../schema";
import { protectedProcedure, router } from "../trpc";

function toDate(value: unknown): Date {
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export const syncRouter = router({
  getLastSync: protectedProcedure.query(async ({ ctx }) => {
    const row = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    return {
      lastSyncedAt: row[0]?.lastSyncedAt ? new Date(row[0].lastSyncedAt).getTime() : null,
    };
  }),

  updateLastSync: protectedProcedure
    .input(
      z.object({
        timestamp: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lastSyncedAt = input.timestamp ? new Date(input.timestamp) : new Date();
      await db.update(users).set({ lastSyncedAt, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
      return { success: true, lastSyncedAt: lastSyncedAt.getTime() };
    }),

  fullSync: protectedProcedure.query(async ({ ctx }) => {
    const [allItems, allTasks, allJournal, allTags, allCategories] = await Promise.all([
      db.select().from(items).where(eq(items.userId, ctx.user.id)),
      db.select().from(tasks).where(eq(tasks.userId, ctx.user.id)),
      db.select().from(journal).where(eq(journal.userId, ctx.user.id)),
      db.select().from(tags).where(eq(tags.userId, ctx.user.id)),
      db.select().from(categories).where(eq(categories.userId, ctx.user.id)),
    ]);

    return {
      items: allItems ?? [],
      tasks: allTasks ?? [],
      journal: allJournal ?? [],
      tags: allTags ?? [],
      categories: allCategories ?? [],
      serverTimestamp: Date.now(),
    };
  }),

  batchSync: protectedProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              id: z.string().uuid(),
              type: z.enum(["note", "quote", "link", "audio"]),
              title: z.string().max(500),
              content: z.string().max(100_000).optional().nullable(),
              url: z.string().max(2000).optional().nullable(),
              location: z.enum(["inbox", "library", "archive"]).optional().nullable(),
              isFavorite: z.boolean().optional().nullable(),
              updatedAt: z.union([z.string(), z.number(), z.date()]).optional().nullable(),
              deletedAt: z.union([z.string(), z.number(), z.date()]).optional().nullable(),
            })
          )
          .max(500)
          .default([]),
        tasks: z
          .array(
            z.object({
              id: z.string().uuid(),
              title: z.string().max(500),
              description: z.string().max(10_000).optional().nullable(),
              dueDate: z.string().max(30).optional().nullable(),
              priority: z.enum(["low", "medium", "high"]).optional().nullable(),
              isCompleted: z.boolean().optional().nullable(),
              isUrgent: z.boolean().optional().nullable(),
              isImportant: z.boolean().optional().nullable(),
              recurrence: z.enum(["daily", "weekly", "monthly"]).optional().nullable(),
              updatedAt: z.union([z.string(), z.number(), z.date()]).optional().nullable(),
            })
          )
          .max(500)
          .default([]),
        journal: z
          .array(
            z.object({
              id: z.string().uuid(),
              title: z.string().max(500).optional().nullable(),
              content: z.string().max(100_000).optional().nullable(),
              entryDate: z.string().max(30),
              mood: z.string().max(50).optional().nullable(),
              location: z.string().max(200).optional().nullable(),
              weather: z.string().max(100).optional().nullable(),
              updatedAt: z.union([z.string(), z.number(), z.date()]).optional().nullable(),
            })
          )
          .max(500)
          .default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results: Array<{ type: string; id: string; success: boolean; reason?: string }> = [];

      // Only spread whitelisted fields to prevent prototype pollution / extra columns
      const toDateOrNow = (v: unknown): Date => {
        const d = toDate(v);
        return d.getTime() === 0 ? new Date() : d;
      };

      const upsertItem = async (row: (typeof input.items)[number]) => {
        const existing = await db
          .select({ updatedAt: items.updatedAt })
          .from(items)
          .where(and(eq(items.id, row.id), eq(items.userId, ctx.user.id)))
          .limit(1);
        const safeFields = {
          type: row.type,
          title: row.title,
          content: row.content ?? null,
          url: row.url ?? null,
          location: row.location ?? "inbox" as const,
          isFavorite: row.isFavorite ?? false,
          updatedAt: toDateOrNow(row.updatedAt),
          deletedAt: row.deletedAt ? toDate(row.deletedAt) : null,
          userId: ctx.user.id,
        };
        if (existing[0]) {
          if (toDate(existing[0].updatedAt) >= toDateOrNow(row.updatedAt)) {
            return { type: "item", id: row.id, success: false, reason: "server_newer" };
          }
          await db.update(items).set(safeFields).where(eq(items.id, row.id));
        } else {
          await db.insert(items).values({ id: row.id, ...safeFields });
        }
        return { type: "item", id: row.id, success: true };
      };

      const upsertTask = async (row: (typeof input.tasks)[number]) => {
        const existing = await db
          .select({ updatedAt: tasks.updatedAt })
          .from(tasks)
          .where(and(eq(tasks.id, row.id), eq(tasks.userId, ctx.user.id)))
          .limit(1);
        const safeFields = {
          title: row.title,
          description: row.description ?? null,
          dueDate: row.dueDate ?? null,
          priority: row.priority ?? "medium" as const,
          isCompleted: row.isCompleted ?? false,
          isUrgent: row.isUrgent ?? false,
          isImportant: row.isImportant ?? false,
          recurrence: row.recurrence ?? null,
          updatedAt: toDateOrNow(row.updatedAt),
          userId: ctx.user.id,
        };
        if (existing[0]) {
          if (toDate(existing[0].updatedAt) >= toDateOrNow(row.updatedAt)) {
            return { type: "task", id: row.id, success: false, reason: "server_newer" };
          }
          await db.update(tasks).set(safeFields).where(eq(tasks.id, row.id));
        } else {
          await db.insert(tasks).values({ id: row.id, ...safeFields });
        }
        return { type: "task", id: row.id, success: true };
      };

      const upsertJournal = async (row: (typeof input.journal)[number]) => {
        const existing = await db
          .select({ updatedAt: journal.updatedAt })
          .from(journal)
          .where(and(eq(journal.id, row.id), eq(journal.userId, ctx.user.id)))
          .limit(1);
        const safeFields = {
          title: row.title ?? null,
          content: row.content ?? "",
          entryDate: row.entryDate,
          mood: row.mood ?? null,
          location: row.location ?? null,
          weather: row.weather ?? null,
          updatedAt: toDateOrNow(row.updatedAt),
          userId: ctx.user.id,
        };
        if (existing[0]) {
          if (toDate(existing[0].updatedAt) >= toDateOrNow(row.updatedAt)) {
            return { type: "journal", id: row.id, success: false, reason: "server_newer" };
          }
          await db.update(journal).set(safeFields).where(eq(journal.id, row.id));
        } else {
          await db.insert(journal).values({ id: row.id, ...safeFields });
        }
        return { type: "journal", id: row.id, success: true };
      };

      for (const row of input.items) {
        try {
          results.push(await upsertItem(row));
        } catch (error) {
          results.push({ type: "item", id: row.id, success: false, reason: error instanceof Error ? error.message : "unknown_error" });
        }
      }
      for (const row of input.tasks) {
        try {
          results.push(await upsertTask(row));
        } catch (error) {
          results.push({ type: "task", id: row.id, success: false, reason: error instanceof Error ? error.message : "unknown_error" });
        }
      }
      for (const row of input.journal) {
        try {
          results.push(await upsertJournal(row));
        } catch (error) {
          results.push({ type: "journal", id: row.id, success: false, reason: error instanceof Error ? error.message : "unknown_error" });
        }
      }

      const now = new Date();
      await db.update(users).set({ lastSyncedAt: now, updatedAt: now }).where(eq(users.id, ctx.user.id));

      return {
        success: true,
        results,
        serverTimestamp: now.getTime(),
      };
    }),
});
