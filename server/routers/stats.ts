import { and, eq, gte, inArray, isNull, like } from 'drizzle-orm';
import { protectedProcedure, router } from '../trpc';
import { db } from '../db';
import { auditLog } from '../schema/audit_log';
import { items, tasks, journal, tags, itemTags } from '../schema';

type DateLike = string | number | Date | null | undefined;

function toDate(value: DateLike): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export const statsRouter = router({
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    try {
      const [allItems, allTasks, allJournal] = await Promise.all([
        db.select().from(items).where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt))),
        db.select().from(tasks).where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt))),
        db.select().from(journal).where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt))),
      ]);

      const now = new Date();
      const weekStart = startOfWeek(now).getTime();
      const weekEnd = now.getTime();

      const completedTasksThisWeek = allTasks.filter((task) => {
        if (!task.isCompleted) return false;
        const completedAt = toDate(task.completedAt);
        if (!completedAt) return false;
        const t = completedAt.getTime();
        return t >= weekStart && t <= weekEnd;
      }).length;

      const entryDays = new Set<string>();
      for (const entry of allJournal) {
        const rawDate = entry.entryDate as unknown as DateLike;
        const parsed = toDate(rawDate);
        if (!parsed) continue;
        entryDays.add(formatDateKey(parsed));
      }

      let streak = 0;
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);

      while (true) {
        const key = formatDateKey(cursor);
        if (!entryDays.has(key)) break;
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }

      return {
        totalNotes: allItems.length,
        totalTasks: allTasks.length,
        totalJournalEntries: allJournal.length,
        completedTasksThisWeek,
        currentStreak: streak,
      };
    } catch (error) {
      console.error('Error getting stats summary:', error);
      return {
        totalNotes: 0,
        totalTasks: 0,
        totalJournalEntries: 0,
        completedTasksThisWeek: 0,
        currentStreak: 0,
      };
    }
  }),

  getChartData: protectedProcedure.query(async ({ ctx }) => {
    try {
      const [allItems, allTasks, allJournal] = await Promise.all([
        db.select().from(items).where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt))),
        db.select().from(tasks).where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt))),
        db.select().from(journal).where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt))),
      ]);

      const now = new Date();

      const weekBuckets: Array<{ label: string; start: Date; count: number }> = [];
      for (let i = 5; i >= 0; i -= 1) {
        const date = new Date(now);
        date.setDate(date.getDate() - i * 7);
        const start = startOfWeek(date);
        const label = `${start.getMonth() + 1}/${start.getDate()}`;
        weekBuckets.push({ label, start, count: 0 });
      }

      for (const item of allItems) {
        const created = toDate(item.createdAt);
        if (!created) continue;
        const createdTime = created.getTime();

        for (let i = 0; i < weekBuckets.length; i += 1) {
          const start = weekBuckets[i].start.getTime();
          const nextStart =
            i < weekBuckets.length - 1
              ? weekBuckets[i + 1].start.getTime()
              : Number.POSITIVE_INFINITY;
          if (createdTime >= start && createdTime < nextStart) {
            weekBuckets[i].count += 1;
            break;
          }
        }
      }

      const completed = allTasks.filter((t) => !!t.isCompleted).length;
      const pending = allTasks.length - completed;

      const monthBuckets: Array<{ label: string; start: Date; count: number }> = [];
      for (let i = 5; i >= 0; i -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthBuckets.push({
          label: date.toLocaleDateString('en-US', { month: 'short' }),
          start: startOfMonth(date),
          count: 0,
        });
      }

      for (const entry of allJournal) {
        const d = toDate(entry.entryDate as unknown as DateLike);
        if (!d) continue;
        const entryTime = d.getTime();
        for (let i = 0; i < monthBuckets.length; i += 1) {
          const start = monthBuckets[i].start.getTime();
          const nextStart =
            i < monthBuckets.length - 1
              ? monthBuckets[i + 1].start.getTime()
              : Number.POSITIVE_INFINITY;
          if (entryTime >= start && entryTime < nextStart) {
            monthBuckets[i].count += 1;
            break;
          }
        }
      }

      return {
        itemsPerWeek: {
          labels: weekBuckets.map((w) => w.label),
          values: weekBuckets.map((w) => w.count),
        },
        tasksCompletionRate: {
          completed,
          pending,
        },
        journalPerMonth: {
          labels: monthBuckets.map((m) => m.label),
          values: monthBuckets.map((m) => m.count),
        },
      };
    } catch (error) {
      console.error('Error getting chart data:', error);
      return {
        itemsPerWeek: { labels: [], values: [] },
        tasksCompletionRate: { completed: 0, pending: 0 },
        journalPerMonth: { labels: [], values: [] },
      };
    }
  }),

  getInsights: protectedProcedure.query(async ({ ctx }) => {
    try {
      const [allItems, allTasks, allJournal, allTags] = await Promise.all([
        db.select().from(items).where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt))),
        db.select().from(tasks).where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt))),
        db.select().from(journal).where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt))),
        db.select().from(tags).where(eq(tags.userId, ctx.user.id)),
      ]);

      const tagNameById = new Map<string, string>();
      for (const t of allTags) {
        tagNameById.set(t.id, t.name);
      }

      const userItemIds = new Set(allItems.map((item) => item.id));
      const itemIdArray = allItems.map((item) => item.id);
      const allItemTags = itemIdArray.length > 0
        ? await db.select().from(itemTags).where(inArray(itemTags.itemId, itemIdArray))
        : [];
      const tagCounts = new Map<string, number>();
      for (const link of allItemTags) {
        const name = tagNameById.get(link.tagId);
        if (!name) continue;
        tagCounts.set(name, (tagCounts.get(name) || 0) + 1);
      }

      const mostUsedTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const dayCounts = [0, 0, 0, 0, 0, 0, 0];
      for (const item of allItems) {
        const d = toDate(item.createdAt);
        if (d) dayCounts[d.getDay()] += 1;
      }
      for (const task of allTasks) {
        const d = toDate(task.createdAt as unknown as DateLike);
        if (d) dayCounts[d.getDay()] += 1;
      }
      for (const entry of allJournal) {
        const d = toDate(entry.createdAt as unknown as DateLike);
        if (d) dayCounts[d.getDay()] += 1;
      }

      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      let maxDayIndex = 0;
      for (let i = 1; i < dayCounts.length; i += 1) {
        if (dayCounts[i] > dayCounts[maxDayIndex]) maxDayIndex = i;
      }

      const allDates: Date[] = [];
      for (const item of allItems) {
        const d = toDate(item.createdAt);
        if (d) allDates.push(d);
      }
      for (const task of allTasks) {
        const d = toDate(task.createdAt as unknown as DateLike);
        if (d) allDates.push(d);
      }
      for (const entry of allJournal) {
        const d = toDate(entry.createdAt as unknown as DateLike);
        if (d) allDates.push(d);
      }

      let averageItemsPerDay = 0;
      const totalRecords = allItems.length + allTasks.length + allJournal.length;
      if (allDates.length > 0) {
        const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())));
        const daysSpan = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000) + 1);
        averageItemsPerDay = Number((totalRecords / daysSpan).toFixed(2));
      }

      return {
        mostUsedTags,
        mostProductiveDay: dayLabels[maxDayIndex],
        averageItemsPerDay,
      };
    } catch (error) {
      console.error('Error getting insights:', error);
      return {
        mostUsedTags: [] as Array<{ name: string; count: number }>,
        mostProductiveDay: 'N/A',
        averageItemsPerDay: 0,
      };
    }
  }),

  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    try {
      const [allItems, allTasks, allJournal, allTags] = await Promise.all([
        db.select().from(items).where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt))),
        db.select().from(tasks).where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt))),
        db.select().from(journal).where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt))),
        db.select().from(tags).where(eq(tags.userId, ctx.user.id)),
      ]);

      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const itemsThisWeek = allItems.filter((i) => {
        const d = toDate(i.createdAt);
        return d && d.getTime() >= weekAgo;
      }).length;

      const tasksCompletedThisWeek = allTasks.filter((t) => {
        if (!t.isCompleted || !t.completedAt) return false;
        const d = toDate(t.completedAt);
        return d && d.getTime() >= weekAgo;
      }).length;

      const journalEntriesThisWeek = allJournal.filter((j) => {
        const d = toDate(j.createdAt);
        return d && d.getTime() >= weekAgo;
      }).length;

      return {
        counts: {
          items: allItems.length,
          tasks: allTasks.length,
          journal: allJournal.length,
          tags: allTags.length,
        },
        weekly: {
          items: itemsThisWeek,
          tasksCompleted: tasksCompletedThisWeek,
          journalEntries: journalEntriesThisWeek,
        },
        taskProgress: {
          total: allTasks.length,
          completed: allTasks.filter((t) => t.isCompleted).length,
          percent:
            allTasks.length > 0
              ? Math.round((allTasks.filter((t) => t.isCompleted).length / allTasks.length) * 100)
              : 0,
        },
      };
    } catch (err) {
      console.error('Error building dashboard:', err);
      return {
        counts: { items: 0, tasks: 0, journal: 0, tags: 0 },
        weekly: { items: 0, tasksCompleted: 0, journalEntries: 0 },
        taskProgress: { total: 0, completed: 0, percent: 0 },
      };
    }
  }),

  getWritingTrend: protectedProcedure.query(async ({ ctx }) => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const rows = await db
        .select()
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt), gte(items.createdAt, since)));
      // Bucket content length by day
      const byDay = new Map<string, { items: number; chars: number }>();
      for (const r of rows) {
        const d = toDate(r.createdAt);
        if (!d) continue;
        const key = formatDateKey(d);
        const entry = byDay.get(key) ?? { items: 0, chars: 0 };
        entry.items += 1;
        entry.chars += (r.content ?? '').length;
        byDay.set(key, entry);
      }
      const sorted = Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, items: v.items, chars: v.chars }));
      const totalChars = sorted.reduce((s, d) => s + d.chars, 0);
      const totalItems = sorted.reduce((s, d) => s + d.items, 0);
      const avgCharsPerItem = totalItems > 0 ? Math.round(totalChars / totalItems) : 0;
      return {
        last30Days: sorted,
        totals: { items: totalItems, chars: totalChars, avgCharsPerItem },
      };
    } catch (error) {
      console.error('Error getting writing trend:', error);
      return {
        last30Days: [] as { date: string; items: number; chars: number }[],
        totals: { items: 0, chars: 0, avgCharsPerItem: 0 },
      };
    }
  }),

  getAiUsage: protectedProcedure.query(async ({ ctx }) => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const rows = await db
        .select({ action: auditLog.action, createdAt: auditLog.createdAt })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, ctx.user.id),
            like(auditLog.action, 'ai.%'),
            gte(auditLog.createdAt, since)
          )
        );
      const byProcedure = new Map<string, number>();
      for (const r of rows) {
        const key = r.action.replace(/^ai\./, '');
        byProcedure.set(key, (byProcedure.get(key) ?? 0) + 1);
      }
      const total = rows.length;
      const breakdown = Array.from(byProcedure.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));
      return {
        last30Days: { total, breakdown },
      };
    } catch (error) {
      console.error('Error getting AI usage:', error);
      return { last30Days: { total: 0, breakdown: [] as { name: string; count: number }[] } };
    }
  }),
});
