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
        items: z.array(z.any()).default([]),
        tasks: z.array(z.any()).default([]),
        journal: z.array(z.any()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results: Array<{ type: string; id: string; success: boolean; reason?: string }> = [];

      const upsertRows = async (type: "item" | "task" | "journal", rows: any[]) => {
        for (const row of rows) {
          const id = String(row?.id ?? "");
          if (!id) {
            results.push({ type, id: "", success: false, reason: "missing_id" });
            continue;
          }

          try {
            if (type === "item") {
              const existing = await db
                .select()
                .from(items)
                .where(and(eq(items.id, id), eq(items.userId, ctx.user.id)))
                .limit(1);
              if (existing[0]) {
                const existingUpdated = toDate(existing[0].updatedAt);
                const incomingUpdated = toDate(row.updatedAt);
                if (existingUpdated >= incomingUpdated) {
                  results.push({ type, id, success: false, reason: "server_newer" });
                  continue;
                }
                await db.update(items).set({ ...row, userId: ctx.user.id }).where(eq(items.id, id));
              } else {
                await db.insert(items).values({ ...row, userId: ctx.user.id });
              }
            } else if (type === "task") {
              const existing = await db
                .select()
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, ctx.user.id)))
                .limit(1);
              if (existing[0]) {
                const existingUpdated = toDate(existing[0].updatedAt);
                const incomingUpdated = toDate(row.updatedAt);
                if (existingUpdated >= incomingUpdated) {
                  results.push({ type, id, success: false, reason: "server_newer" });
                  continue;
                }
                await db.update(tasks).set({ ...row, userId: ctx.user.id }).where(eq(tasks.id, id));
              } else {
                await db.insert(tasks).values({ ...row, userId: ctx.user.id });
              }
            } else {
              const existing = await db
                .select()
                .from(journal)
                .where(and(eq(journal.id, id), eq(journal.userId, ctx.user.id)))
                .limit(1);
              if (existing[0]) {
                const existingUpdated = toDate(existing[0].updatedAt);
                const incomingUpdated = toDate(row.updatedAt);
                if (existingUpdated >= incomingUpdated) {
                  results.push({ type, id, success: false, reason: "server_newer" });
                  continue;
                }
                await db.update(journal).set({ ...row, userId: ctx.user.id }).where(eq(journal.id, id));
              } else {
                await db.insert(journal).values({ ...row, userId: ctx.user.id });
              }
            }

            results.push({ type, id, success: true });
          } catch (error) {
            results.push({
              type,
              id,
              success: false,
              reason: error instanceof Error ? error.message : "unknown_error",
            });
          }
        }
      };

      await upsertRows("item", input.items);
      await upsertRows("task", input.tasks);
      await upsertRows("journal", input.journal);

      const now = new Date();
      await db.update(users).set({ lastSyncedAt: now, updatedAt: now }).where(eq(users.id, ctx.user.id));

      return {
        success: true,
        results,
        serverTimestamp: now.getTime(),
      };
    }),
});
