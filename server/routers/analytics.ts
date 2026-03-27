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

    // Build a set of unique YYYY-MM-DD strings from entryDate
    const entrySet = new Set<string>();
    for (const j of allJournal) {
      const raw = j.entryDate as unknown as string;
      if (raw && typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        entrySet.add(raw);
      } else {
        const d = new Date(raw as any);
        if (!Number.isNaN(d.getTime())) {
          entrySet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        }
      }
    }

    function ymd(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    // Current streak: count back from today
    let currentJournalStreak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (entrySet.has(ymd(cursor))) {
      currentJournalStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // Longest streak: iterate sorted dates
    let longestJournalStreak = 0;
    if (entrySet.size > 0) {
      const sorted = Array.from(entrySet).sort();
      let run = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]);
        const curr = new Date(sorted[i]);
        const diffMs = curr.getTime() - prev.getTime();
        if (diffMs === 86400000) {
          run += 1;
        } else {
          longestJournalStreak = Math.max(longestJournalStreak, run);
          run = 1;
        }
      }
      longestJournalStreak = Math.max(longestJournalStreak, run);
    }

    return {
      currentJournalStreak,
      longestJournalStreak,
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

    const userItemIds = new Set(allItems.map((item) => item.id));
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
      if (!userItemIds.has(rel.itemId)) continue;
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
