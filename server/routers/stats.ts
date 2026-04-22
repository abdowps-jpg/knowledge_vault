import { and, eq, gte, inArray, isNull, like } from 'drizzle-orm';
import { z } from 'zod';
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

  tagGrowth: protectedProcedure.query(async ({ ctx }) => {
    try {
      const userTags = await db.select().from(tags).where(eq(tags.userId, ctx.user.id));
      if (userTags.length === 0) return { byMonth: [] as { month: string; count: number }[] };
      const byMonth = new Map<string, number>();
      for (const t of userTags) {
        const d = toDate(t.createdAt);
        if (!d) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
      }
      return {
        byMonth: Array.from(byMonth.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, count]) => ({ month, count })),
      };
    } catch (err) {
      console.error('Error in tagGrowth:', err);
      return { byMonth: [] };
    }
  }),

  flashcardsOverview: protectedProcedure.query(async ({ ctx }) => {
    try {
      const { flashcards } = await import('../schema/flashcards');
      const rows = await db.select().from(flashcards).where(eq(flashcards.userId, ctx.user.id));
      const today = new Date().toISOString().slice(0, 10);
      const due = rows.filter((r) => r.nextReviewDate <= today).length;
      const reviewedLast7 = rows.filter((r) => {
        if (!r.lastReviewedAt) return false;
        const t = toDate(r.lastReviewedAt);
        return t && Date.now() - t.getTime() < 7 * 24 * 60 * 60 * 1000;
      }).length;
      return {
        total: rows.length,
        due,
        reviewedLast7,
        mature: rows.filter((r) => r.interval >= 21).length,
      };
    } catch (err) {
      console.error('Error in flashcardsOverview:', err);
      return { total: 0, due: 0, reviewedLast7: 0, mature: 0 };
    }
  }),

  selfHealth: protectedProcedure.query(async ({ ctx }) => {
    try {
      const [userItems, userTasks, userJournal] = await Promise.all([
        db.select().from(items).where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt))),
        db.select().from(tasks).where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt))),
        db.select().from(journal).where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt))),
      ]);
      const totalChars = userItems.reduce((s, i) => s + (i.content?.length ?? 0), 0) +
        userJournal.reduce((s, j) => s + (j.content?.length ?? 0), 0);
      return {
        healthy: true as const,
        storage: {
          items: userItems.length,
          tasks: userTasks.length,
          journal: userJournal.length,
          estimatedKBWritten: Math.round(totalChars / 1024),
        },
        usage: {
          incompleteTasks: userTasks.filter((t) => !t.isCompleted).length,
          itemsLastWeek: userItems.filter((i) => {
            const d = toDate(i.createdAt);
            return d && Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
          }).length,
        },
      };
    } catch (err) {
      console.error('Error in selfHealth:', err);
      return { healthy: false as const, error: 'internal' };
    }
  }),

  timeline: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(30).default(7) }).optional())
    .query(async ({ input, ctx }) => {
      const days = input?.days ?? 7;
      const since = new Date();
      since.setDate(since.getDate() - days);
      const [recentItems, completedTasks, recentJournal] = await Promise.all([
        db
          .select({ id: items.id, title: items.title, type: items.type, createdAt: items.createdAt })
          .from(items)
          .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt), gte(items.createdAt, since))),
        db
          .select({ id: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
          .from(tasks)
          .where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt), eq(tasks.isCompleted, true))),
        db
          .select({ id: journal.id, title: journal.title, entryDate: journal.entryDate, createdAt: journal.createdAt })
          .from(journal)
          .where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt), gte(journal.createdAt, since))),
      ]);

      type Event = { ts: number; kind: 'item' | 'task' | 'journal'; id: string; label: string };
      const events: Event[] = [];
      for (const r of recentItems) {
        const d = toDate(r.createdAt);
        if (d) events.push({ ts: d.getTime(), kind: 'item', id: r.id, label: `+${r.type}: ${r.title}` });
      }
      for (const t of completedTasks) {
        const d = toDate(t.completedAt);
        if (!d || d.getTime() < since.getTime()) continue;
        events.push({ ts: d.getTime(), kind: 'task', id: t.id, label: `✓ ${t.title}` });
      }
      for (const j of recentJournal) {
        const d = toDate(j.createdAt);
        if (d) events.push({ ts: d.getTime(), kind: 'journal', id: j.id, label: `📖 ${j.title ?? j.entryDate ?? 'Entry'}` });
      }
      events.sort((a, b) => b.ts - a.ts);
      return events.slice(0, 200).map((e) => ({ ...e, at: new Date(e.ts).toISOString() }));
    }),

  goalSnapshot: protectedProcedure.query(async ({ ctx }) => {
    try {
      const { goals, goalMilestones } = await import('../schema/goals');
      const goalRows = await db.select().from(goals).where(eq(goals.userId, ctx.user.id));
      if (goalRows.length === 0) {
        return { totalGoals: 0, completedGoals: 0, activeGoals: 0, totalMilestones: 0, completedMilestones: 0 };
      }
      const goalIds = goalRows.map((g) => g.id);
      const ms = await db.select().from(goalMilestones).where(inArray(goalMilestones.goalId, goalIds));
      return {
        totalGoals: goalRows.length,
        completedGoals: goalRows.filter((g) => g.isCompleted).length,
        activeGoals: goalRows.filter((g) => !g.isCompleted).length,
        totalMilestones: ms.length,
        completedMilestones: ms.filter((m) => m.isCompleted).length,
      };
    } catch (err) {
      console.error('Error in goalSnapshot:', err);
      return { totalGoals: 0, completedGoals: 0, activeGoals: 0, totalMilestones: 0, completedMilestones: 0 };
    }
  }),

  weekOverWeek: protectedProcedure.query(async ({ ctx }) => {
    try {
      const now = Date.now();
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

      const [itemRows, taskRows, journalRows] = await Promise.all([
        db.select().from(items).where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt))),
        db.select().from(tasks).where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt))),
        db.select().from(journal).where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt))),
      ]);

      const countInWindow = <T,>(
        rows: T[],
        getDate: (r: T) => Date | null,
        start: number,
        end: number
      ) =>
        rows.filter((r) => {
          const d = getDate(r);
          return d && d.getTime() >= start && d.getTime() < end;
        }).length;

      const itemsThis = countInWindow(itemRows, (i) => toDate(i.createdAt), weekAgo, now);
      const itemsPrev = countInWindow(itemRows, (i) => toDate(i.createdAt), twoWeeksAgo, weekAgo);
      const tasksThis = countInWindow(
        taskRows.filter((t) => t.isCompleted),
        (t) => toDate(t.completedAt),
        weekAgo,
        now
      );
      const tasksPrev = countInWindow(
        taskRows.filter((t) => t.isCompleted),
        (t) => toDate(t.completedAt),
        twoWeeksAgo,
        weekAgo
      );
      const journalThis = countInWindow(journalRows, (j) => toDate(j.createdAt), weekAgo, now);
      const journalPrev = countInWindow(journalRows, (j) => toDate(j.createdAt), twoWeeksAgo, weekAgo);

      const pct = (cur: number, prev: number) => {
        if (prev === 0) return cur === 0 ? 0 : 100;
        return Math.round(((cur - prev) / prev) * 100);
      };

      return {
        items: { thisWeek: itemsThis, prevWeek: itemsPrev, changePct: pct(itemsThis, itemsPrev) },
        tasksCompleted: { thisWeek: tasksThis, prevWeek: tasksPrev, changePct: pct(tasksThis, tasksPrev) },
        journal: { thisWeek: journalThis, prevWeek: journalPrev, changePct: pct(journalThis, journalPrev) },
      };
    } catch (err) {
      console.error('Error computing week-over-week:', err);
      return {
        items: { thisWeek: 0, prevWeek: 0, changePct: 0 },
        tasksCompleted: { thisWeek: 0, prevWeek: 0, changePct: 0 },
        journal: { thisWeek: 0, prevWeek: 0, changePct: 0 },
      };
    }
  }),

  focusScore: protectedProcedure.query(async ({ ctx }) => {
    try {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const [itemRows, taskRows, journalRows] = await Promise.all([
        db.select().from(items).where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt))),
        db.select().from(tasks).where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt))),
        db.select().from(journal).where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt))),
      ]);

      const itemsThisWeek = itemRows.filter((i) => {
        const d = toDate(i.createdAt);
        return d && d.getTime() >= weekAgo;
      }).length;
      const tasksCompletedThisWeek = taskRows.filter((t) => {
        if (!t.isCompleted || !t.completedAt) return false;
        const d = toDate(t.completedAt);
        return d && d.getTime() >= weekAgo;
      }).length;
      const journalThisWeek = journalRows.filter((j) => {
        const d = toDate(j.createdAt);
        return d && d.getTime() >= weekAgo;
      }).length;

      // Components: 0-100 each, weighted
      const capture = Math.min(100, itemsThisWeek * 10);          // 10 items → 100
      const execution = Math.min(100, tasksCompletedThisWeek * 15); // 7 done → 100+
      const reflection = Math.min(100, journalThisWeek * 20);     // 5 entries → 100

      // Weighted average: capture 40%, execution 40%, reflection 20%
      const score = Math.round(capture * 0.4 + execution * 0.4 + reflection * 0.2);
      return {
        score,
        components: { capture, execution, reflection },
        counts: { items: itemsThisWeek, tasksCompleted: tasksCompletedThisWeek, journal: journalThisWeek },
      };
    } catch (err) {
      console.error('Error computing focus score:', err);
      return {
        score: 0,
        components: { capture: 0, execution: 0, reflection: 0 },
        counts: { items: 0, tasksCompleted: 0, journal: 0 },
      };
    }
  }),

  topTagsThisMonth: protectedProcedure.query(async ({ ctx }) => {
    try {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      const recentItems = await db
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt), gte(items.createdAt, monthAgo)));
      const itemIds = recentItems.map((i) => i.id);
      if (itemIds.length === 0) return { top: [] as { name: string; count: number }[], itemsConsidered: 0 };
      const links = await db
        .select()
        .from(itemTags)
        .where(inArray(itemTags.itemId, itemIds));
      const tagIds = Array.from(new Set(links.map((l) => l.tagId)));
      const tagRows = tagIds.length > 0
        ? await db.select().from(tags).where(and(eq(tags.userId, ctx.user.id), inArray(tags.id, tagIds)))
        : [];
      const tagNameById = new Map(tagRows.map((t) => [t.id, t.name]));
      const counts = new Map<string, number>();
      for (const link of links) {
        const name = tagNameById.get(link.tagId);
        if (!name) continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));
      return { top, itemsConsidered: itemIds.length };
    } catch (err) {
      console.error('Error computing top tags this month:', err);
      return { top: [], itemsConsidered: 0 };
    }
  }),

  getBurndown: protectedProcedure.query(async ({ ctx }) => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const rows = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt), gte(tasks.createdAt, since)));

      const byDay = new Map<string, { created: number; completed: number }>();
      const ensure = (key: string) => {
        if (!byDay.has(key)) byDay.set(key, { created: 0, completed: 0 });
        return byDay.get(key)!;
      };
      for (const t of rows) {
        const c = toDate(t.createdAt);
        if (c) ensure(formatDateKey(c)).created += 1;
        if (t.isCompleted && t.completedAt) {
          const cAt = toDate(t.completedAt);
          if (cAt) ensure(formatDateKey(cAt)).completed += 1;
        }
      }
      const series = Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, created: v.created, completed: v.completed }));
      return { last14Days: series };
    } catch (err) {
      console.error('Error building burndown:', err);
      return { last14Days: [] as { date: string; created: number; completed: number }[] };
    }
  }),

  activityHeatmap: protectedProcedure.query(async ({ ctx }) => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 90);

      const [iRows, tRows, jRows] = await Promise.all([
        db
          .select({ createdAt: items.createdAt })
          .from(items)
          .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt), gte(items.createdAt, since))),
        db
          .select({ completedAt: tasks.completedAt })
          .from(tasks)
          .where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt))),
        db
          .select({ entryDate: journal.entryDate, createdAt: journal.createdAt })
          .from(journal)
          .where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt), gte(journal.createdAt, since))),
      ]);

      const byDay = new Map<string, number>();
      const bump = (d: Date | null) => {
        if (!d) return;
        const key = formatDateKey(d);
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
      };
      for (const r of iRows) bump(toDate(r.createdAt));
      for (const r of tRows) {
        if (!r.completedAt) continue;
        const d = toDate(r.completedAt);
        if (!d) continue;
        if (d.getTime() < since.getTime()) continue;
        bump(d);
      }
      for (const r of jRows) bump(toDate(r.createdAt));

      const series = Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count }));
      const maxCount = series.reduce((m, d) => Math.max(m, d.count), 0);
      return { days: series, maxCount };
    } catch (error) {
      console.error('Error building heatmap:', error);
      return { days: [] as { date: string; count: number }[], maxCount: 0 };
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
