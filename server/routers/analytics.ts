import { eq } from "drizzle-orm";
import { db } from "../db";
import { items, journal, tasks, tags, itemTags, categories } from "../schema";
import { protectedProcedure, router } from "../trpc";

function dateKey(date: Date, mode: "day" | "week" | "month"): string {
  if (mode === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (mode === "week") {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - ((day + 6) % 7));
    return `${d.getFullYear()}-W${String(Math.ceil(d.getDate() / 7)).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function bucket(records: Array<Date>, mode: "day" | "week" | "month") {
  const map = new Map<string, number>();
  for (const d of records) {
    const key = dateKey(d, mode);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }));
}

export const analyticsRouter = router({
  getProductivity: protectedProcedure.query(async ({ ctx }) => {
    const [allItems, allTasks, allJournal] = await Promise.all([
      db.select().from(items).where(eq(items.userId, ctx.user.id)),
      db.select().from(tasks).where(eq(tasks.userId, ctx.user.id)),
      db.select().from(journal).where(eq(journal.userId, ctx.user.id)),
    ]);

    const itemDates = allItems.map((r) => new Date(r.createdAt as any));
    const taskDoneDates = allTasks.filter((r) => !!r.completedAt).map((r) => new Date(r.completedAt as any));
    const journalDates = allJournal.map((r) => new Date(r.createdAt as any));

    return {
      itemsPerDay: bucket(itemDates, "day"),
      itemsPerWeek: bucket(itemDates, "week"),
      itemsPerMonth: bucket(itemDates, "month"),
      tasksCompletedPerDay: bucket(taskDoneDates, "day"),
      journalPerDay: bucket(journalDates, "day"),
      peakProductivityHours: [] as Array<{ hour: number; count: number }>,
    };
  }),

  getStreaks: protectedProcedure.query(async ({ ctx }) => {
    const allJournal = await db.select().from(journal).where(eq(journal.userId, ctx.user.id));
    const entries = new Set(
      allJournal.map((j) => {
        const d = new Date(j.entryDate as any);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    );

    let currentJournalStreak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (entries.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
      currentJournalStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return {
      currentJournalStreak,
      longestJournalStreak: currentJournalStreak,
      taskCompletionStreak: 0,
    };
  }),

  getDistribution: protectedProcedure.query(async ({ ctx }) => {
    const [allItems, allTasks, allTags, allItemTags, allCategories] = await Promise.all([
      db.select().from(items).where(eq(items.userId, ctx.user.id)),
      db.select().from(tasks).where(eq(tasks.userId, ctx.user.id)),
      db.select().from(tags).where(eq(tags.userId, ctx.user.id)),
      db.select().from(itemTags),
      db.select().from(categories).where(eq(categories.userId, ctx.user.id)),
    ]);

    const byType = new Map<string, number>();
    const byCategory = new Map<string, number>();
    const byPriority = new Map<string, number>();
    const tagById = new Map(allTags.map((t) => [t.id, t.name]));
    const tagUsage = new Map<string, number>();

    for (const item of allItems) {
      byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
    }
    for (const task of allTasks) {
      const priority = String((task as any).priority ?? "medium");
      byPriority.set(priority, (byPriority.get(priority) ?? 0) + 1);
    }
    for (const category of allCategories) {
      byCategory.set(category.name, 0);
    }
    for (const rel of allItemTags) {
      const name = tagById.get(rel.tagId);
      if (name) tagUsage.set(name, (tagUsage.get(name) ?? 0) + 1);
    }

    return {
      itemsByType: Array.from(byType.entries()).map(([label, value]) => ({ label, value })),
      itemsByCategory: Array.from(byCategory.entries()).map(([label, value]) => ({ label, value })),
      tasksByPriority: Array.from(byPriority.entries()).map(([label, value]) => ({ label, value })),
      tagUsage: Array.from(tagUsage.entries()).map(([label, value]) => ({ label, value })),
    };
  }),

  getTimeSeries: protectedProcedure.query(async ({ ctx }) => {
    const [allItems, allTasks] = await Promise.all([
      db.select().from(items).where(eq(items.userId, ctx.user.id)),
      db.select().from(tasks).where(eq(tasks.userId, ctx.user.id)),
    ]);
    return {
      contentCreation: bucket(allItems.map((r) => new Date(r.createdAt as any)), "day"),
      taskCompletion: bucket(
        allTasks.filter((t) => !!t.completedAt).map((t) => new Date(t.completedAt as any)),
        "day"
      ),
    };
  }),
});
