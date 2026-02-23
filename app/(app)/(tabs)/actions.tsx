import React from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { VoiceInputButton } from "@/components/voice-input-button";
import { PomodoroTimer } from "@/components/pomodoro-timer";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { cancelTaskDueNotification, scheduleTaskDueNotification } from "@/lib/notifications/task-notifications";
import { offlineManager } from "@/lib/offline-manager";
import { extractNaturalDate, parseNaturalDate } from "@/lib/productivity/natural-date";

type FilterTab = "all" | "today" | "completed" | "high" | "overdue";
type RecurrenceType = "none" | "daily" | "weekly" | "monthly";
type ActionsSavedView = { id: string; name: string; tab: FilterTab };
const ACTIONS_VIEWS_KEY = "actions_saved_views_v1";
const ACTIONS_FOCUS_STATS_KEY = "actions_focus_stats_v1";
const ACTIONS_MY_DAY_KEY = "actions_my_day_ids_v1";
const ACTIONS_HABITS_KEY = "actions_habits_v1";
const ACTIONS_WEEKLY_GOALS_KEY = "actions_weekly_goals_v1";
const ACTIONS_MONTHLY_GOALS_KEY = "actions_monthly_goals_v1";
const ACTIONS_KANBAN_STATUS_KEY = "actions_kanban_status_v1";

type FocusStats = {
  date: string;
  sessions: number;
  minutes: number;
};

type HabitItem = {
  id: string;
  name: string;
  streak: number;
  doneToday: boolean;
  lastCompletedDate: string | null;
};

type WeeklyGoal = {
  id: string;
  title: string;
  done: boolean;
};

type MonthlyGoal = {
  id: string;
  title: string;
  progress: number;
  target: number;
};

type TaskBoardStatus = "todo" | "inprogress" | "done";

const PRIORITY_ORDER: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "🔴 High",
  medium: "🟡 Medium",
  low: "⚪ Low",
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isToday(date: Date | null): boolean {
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function computeNextDueDateLabel(dueDateValue: unknown, recurrence: RecurrenceType | null | undefined): string | null {
  if (!recurrence || recurrence === "none") return null;
  const base = toDate(dueDateValue) || new Date();
  const next = new Date(base);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  if (recurrence === "monthly") next.setDate(next.getDate() + 30);
  return next.toLocaleDateString("en-US");
}

function startOfWeek(date: Date): Date {
  const clone = new Date(date);
  const day = clone.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setDate(clone.getDate() + diff);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function dateToYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ActionsScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();
  const params = useLocalSearchParams<{ taskId?: string }>();

  const [activeTab, setActiveTab] = React.useState<FilterTab>("all");
  const [taskSearch, setTaskSearch] = React.useState("");
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [newTaskTitle, setNewTaskTitle] = React.useState("");
  const [newTaskDescription, setNewTaskDescription] = React.useState("");
  const [newTaskDueDate, setNewTaskDueDate] = React.useState("");
  const [newTaskDetectedDateText, setNewTaskDetectedDateText] = React.useState("");
  const [newTaskDetectedDateValue, setNewTaskDetectedDateValue] = React.useState("");
  const [newTaskDueDateTouched, setNewTaskDueDateTouched] = React.useState(false);
  const [newTaskPriority, setNewTaskPriority] = React.useState<"low" | "medium" | "high">("medium");
  const [newTaskRecurrence, setNewTaskRecurrence] = React.useState<RecurrenceType>("none");
  const [newTaskBlockedByTaskId, setNewTaskBlockedByTaskId] = React.useState<string>("");
  const [subtasksTaskId, setSubtasksTaskId] = React.useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = React.useState("");
  const [togglingTaskId, setTogglingTaskId] = React.useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = React.useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = React.useState<string | null>(null);
  const [savedViews, setSavedViews] = React.useState<ActionsSavedView[]>([]);
  const [focusMinutes, setFocusMinutes] = React.useState(25);
  const [focusRemainingSeconds, setFocusRemainingSeconds] = React.useState(25 * 60);
  const [isFocusRunning, setIsFocusRunning] = React.useState(false);
  const [focusStats, setFocusStats] = React.useState<FocusStats>({
    date: new Date().toISOString().slice(0, 10),
    sessions: 0,
    minutes: 0,
  });
  const [myDayTaskIds, setMyDayTaskIds] = React.useState<string[]>([]);
  const [habits, setHabits] = React.useState<HabitItem[]>([]);
  const [newHabitName, setNewHabitName] = React.useState("");
  const [weeklyGoals, setWeeklyGoals] = React.useState<WeeklyGoal[]>([]);
  const [newWeeklyGoalTitle, setNewWeeklyGoalTitle] = React.useState("");
  const [monthlyGoals, setMonthlyGoals] = React.useState<MonthlyGoal[]>([]);
  const [newMonthlyGoalTitle, setNewMonthlyGoalTitle] = React.useState("");
  const [newMonthlyGoalTarget, setNewMonthlyGoalTarget] = React.useState("5");
  const [reminderUpdatingTaskId, setReminderUpdatingTaskId] = React.useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = React.useState(false);
  const [rowActionTaskId, setRowActionTaskId] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<"list" | "kanban">("list");
  const [kanbanStatusById, setKanbanStatusById] = React.useState<Record<string, TaskBoardStatus>>({});

  const tasksQuery = trpc.tasks.list.useInfiniteQuery(
    {
      sortOrder: "asc",
      limit: 25,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );
  const tasks = React.useMemo(
    () => tasksQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [tasksQuery.data]
  );
  const { isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = tasksQuery;
  const taskTimeQuery = trpc.taskTime.listByTasks.useQuery(
    { taskIds: tasks.map((task: any) => task.id) },
    { enabled: tasks.length > 0, refetchInterval: 5000 }
  );
  const subtasksSummaryQuery = trpc.subtasks.summary.useQuery(
    { taskIds: tasks.map((task: any) => task.id) },
    { enabled: tasks.length > 0, refetchInterval: 5000 }
  );
  const subtasksQuery = trpc.subtasks.list.useQuery(
    { taskId: subtasksTaskId || "" },
    { enabled: Boolean(subtasksTaskId) }
  );

  React.useEffect(() => {
    if (error) {
      console.error("Actions query failed:", error);
    }
  }, [error]);

  React.useEffect(() => {
    console.log("[Actions] Query status:", {
      isLoading,
      total: tasks.length,
      activeTab,
      hasNextPage,
    });
  }, [activeTab, hasNextPage, isLoading, tasks.length]);

  React.useEffect(() => {
    const taskId = typeof params.taskId === "string" ? params.taskId : undefined;
    if (!taskId) return;
    setActiveTab("all");
    setFocusedTaskId(taskId);
    const timer = setTimeout(() => setFocusedTaskId(null), 6000);
    return () => clearTimeout(timer);
  }, [params.taskId]);

  React.useEffect(() => {
    AsyncStorage.getItem(ACTIONS_VIEWS_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as ActionsSavedView[];
        if (Array.isArray(parsed)) setSavedViews(parsed);
      })
      .catch((error) => console.error("[Actions] Failed loading saved views:", error));
  }, []);

  React.useEffect(() => {
    AsyncStorage.getItem(ACTIONS_FOCUS_STATS_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as FocusStats;
        const today = new Date().toISOString().slice(0, 10);
        if (parsed?.date === today) {
          setFocusStats(parsed);
        }
      })
      .catch((error) => console.error("[Actions] Failed loading focus stats:", error));
  }, []);

  React.useEffect(() => {
    AsyncStorage.getItem(ACTIONS_MY_DAY_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as string[];
        if (Array.isArray(parsed)) setMyDayTaskIds(parsed);
      })
      .catch((error) => console.error("[Actions] Failed loading My Day tasks:", error));
  }, []);

  React.useEffect(() => {
    AsyncStorage.getItem(ACTIONS_HABITS_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as HabitItem[];
        if (!Array.isArray(parsed)) return;
        const today = new Date().toISOString().slice(0, 10);
        const normalized = parsed.map((habit) => ({
          ...habit,
          doneToday: habit.lastCompletedDate === today ? habit.doneToday : false,
        }));
        setHabits(normalized);
      })
      .catch((error) => console.error("[Actions] Failed loading habits:", error));
  }, []);

  React.useEffect(() => {
    AsyncStorage.getItem(ACTIONS_WEEKLY_GOALS_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as WeeklyGoal[];
        if (Array.isArray(parsed)) setWeeklyGoals(parsed);
      })
      .catch((error) => console.error("[Actions] Failed loading weekly goals:", error));
  }, []);

  React.useEffect(() => {
    AsyncStorage.getItem(ACTIONS_MONTHLY_GOALS_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as MonthlyGoal[];
        if (Array.isArray(parsed)) setMonthlyGoals(parsed);
      })
      .catch((error) => console.error("[Actions] Failed loading monthly goals:", error));
  }, []);

  React.useEffect(() => {
    AsyncStorage.getItem(ACTIONS_KANBAN_STATUS_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as Record<string, TaskBoardStatus>;
        if (parsed && typeof parsed === "object") {
          setKanbanStatusById(parsed);
        }
      })
      .catch((error) => console.error("[Actions] Failed loading kanban status:", error));
  }, []);

  React.useEffect(() => {
    AsyncStorage.setItem(ACTIONS_MY_DAY_KEY, JSON.stringify(myDayTaskIds)).catch((error) =>
      console.error("[Actions] Failed persisting My Day tasks:", error)
    );
  }, [myDayTaskIds]);

  React.useEffect(() => {
    AsyncStorage.setItem(ACTIONS_HABITS_KEY, JSON.stringify(habits)).catch((error) =>
      console.error("[Actions] Failed persisting habits:", error)
    );
  }, [habits]);

  React.useEffect(() => {
    AsyncStorage.setItem(ACTIONS_WEEKLY_GOALS_KEY, JSON.stringify(weeklyGoals)).catch((error) =>
      console.error("[Actions] Failed persisting weekly goals:", error)
    );
  }, [weeklyGoals]);

  React.useEffect(() => {
    AsyncStorage.setItem(ACTIONS_MONTHLY_GOALS_KEY, JSON.stringify(monthlyGoals)).catch((error) =>
      console.error("[Actions] Failed persisting monthly goals:", error)
    );
  }, [monthlyGoals]);

  React.useEffect(() => {
    AsyncStorage.setItem(ACTIONS_KANBAN_STATUS_KEY, JSON.stringify(kanbanStatusById)).catch((error) =>
      console.error("[Actions] Failed persisting kanban status:", error)
    );
  }, [kanbanStatusById]);

  React.useEffect(() => {
    const sourceText = `${newTaskTitle} ${newTaskDescription}`.trim();
    if (!sourceText) {
      setNewTaskDetectedDateText("");
      setNewTaskDetectedDateValue("");
      return;
    }

    const detected = extractNaturalDate(sourceText);
    if (!detected) {
      setNewTaskDetectedDateText("");
      setNewTaskDetectedDateValue("");
      return;
    }

    setNewTaskDetectedDateText(detected.text);
    setNewTaskDetectedDateValue(detected.date);
    if (!newTaskDueDateTouched && newTaskDueDate !== detected.date) {
      setNewTaskDueDate(detected.date);
    }
  }, [newTaskDescription, newTaskDueDate, newTaskDueDateTouched, newTaskTitle]);

  React.useEffect(() => {
    if (!isFocusRunning) return;
    const timer = setInterval(() => {
      setFocusRemainingSeconds((current) => {
        if (current <= 1) {
          clearInterval(timer);
          setIsFocusRunning(false);
          const today = new Date().toISOString().slice(0, 10);
          setFocusStats((previous) => {
            const next: FocusStats =
              previous.date === today
                ? {
                    date: today,
                    sessions: previous.sessions + 1,
                    minutes: previous.minutes + focusMinutes,
                  }
                : {
                    date: today,
                    sessions: 1,
                    minutes: focusMinutes,
                  };
            AsyncStorage.setItem(ACTIONS_FOCUS_STATS_KEY, JSON.stringify(next)).catch((error) =>
              console.error("[Actions] Failed persisting focus stats:", error)
            );
            return next;
          });
          Alert.alert("Focus complete", "Great work. Take a short break.");
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [focusMinutes, isFocusRunning]);

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      setShowCreateModal(false);
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskDueDate("");
      setNewTaskDetectedDateText("");
      setNewTaskDetectedDateValue("");
      setNewTaskDueDateTouched(false);
      setNewTaskPriority("medium");
      setNewTaskRecurrence("none");
      setNewTaskBlockedByTaskId("");
    },
  });

  const toggleTask = trpc.tasks.toggle.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
    },
    onSettled: () => {
      setTogglingTaskId(null);
    },
  });

  const completeRecurringTask = trpc.tasks.completeRecurring.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
    },
    onSettled: () => {
      setTogglingTaskId(null);
    },
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
    },
    onSettled: () => {
      setDeletingTaskId(null);
    },
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
    },
  });
  const startTaskTimer = trpc.taskTime.start.useMutation({
    onSuccess: () => {
      taskTimeQuery.refetch().catch(() => undefined);
    },
  });
  const stopTaskTimer = trpc.taskTime.stop.useMutation({
    onSuccess: () => {
      taskTimeQuery.refetch().catch(() => undefined);
    },
  });
  const createSubtask = trpc.subtasks.create.useMutation({
    onSuccess: () => {
      subtasksQuery.refetch().catch(() => undefined);
      subtasksSummaryQuery.refetch().catch(() => undefined);
      setNewSubtaskTitle("");
    },
  });
  const toggleSubtask = trpc.subtasks.toggle.useMutation({
    onSuccess: () => {
      subtasksQuery.refetch().catch(() => undefined);
      subtasksSummaryQuery.refetch().catch(() => undefined);
    },
  });
  const deleteSubtask = trpc.subtasks.delete.useMutation({
    onSuccess: () => {
      subtasksQuery.refetch().catch(() => undefined);
      subtasksSummaryQuery.refetch().catch(() => undefined);
    },
  });

  const formatTrackedTime = React.useCallback((seconds: number): string => {
    if (!seconds || seconds <= 0) return "0m";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }, []);

  const handleToggleTaskTimer = React.useCallback(
    async (taskId: string) => {
      try {
        if (taskTimeQuery.data?.activeTaskId === taskId) {
          await stopTaskTimer.mutateAsync({ taskId });
        } else {
          await startTaskTimer.mutateAsync({ taskId });
        }
      } catch (error) {
        console.error("[Actions] Failed toggling task timer:", error);
        Alert.alert("Error", "Failed to update task timer.");
      }
    },
    [startTaskTimer, stopTaskTimer, taskTimeQuery.data?.activeTaskId]
  );

  const filteredAndSortedTasks = React.useMemo(() => {
    const filtered = (tasks as any[]).filter((task) => {
      const dueDate = toDate(task.dueDate);
      const isCompleted = Boolean(task.isCompleted);
      const priority = (task.priority || "medium") as string;
      const query = taskSearch.trim().toLowerCase();
      const matchesSearch =
        !query ||
        String(task.title || "")
          .toLowerCase()
          .includes(query) ||
        String(task.description || "")
          .toLowerCase()
          .includes(query);
      const isOverdue = !isCompleted && !!dueDate && dueDate.getTime() < Date.now();

      if (!matchesSearch) return false;

      if (activeTab === "today") return isToday(dueDate) && !isCompleted;
      if (activeTab === "completed") return isCompleted;
      if (activeTab === "high") return priority === "high" && !isCompleted;
      if (activeTab === "overdue") return isOverdue;
      return true;
    });

    return filtered.sort((a, b) => {
      const aDue = toDate(a.dueDate);
      const bDue = toDate(b.dueDate);

      const aDueTime = aDue ? aDue.getTime() : Number.MAX_SAFE_INTEGER;
      const bDueTime = bDue ? bDue.getTime() : Number.MAX_SAFE_INTEGER;

      if (aDueTime !== bDueTime) return aDueTime - bDueTime;

      const aPriority = PRIORITY_ORDER[a.priority || "medium"] || 0;
      const bPriority = PRIORITY_ORDER[b.priority || "medium"] || 0;
      return bPriority - aPriority;
    });
  }, [tasks, activeTab, taskSearch]);

  const getTaskBoardStatus = React.useCallback(
    (task: any): TaskBoardStatus => {
      if (task.isCompleted) return "done";
      return kanbanStatusById[task.id] === "inprogress" ? "inprogress" : "todo";
    },
    [kanbanStatusById]
  );

  const moveTaskToBoardStatus = React.useCallback(
    async (task: any, status: TaskBoardStatus) => {
      try {
        setRowActionTaskId(task.id);
        if (status === "done") {
          if (!task.isCompleted) {
            await updateTask.mutateAsync({ id: task.id, isCompleted: true });
          }
          setKanbanStatusById((prev) => {
            const next = { ...prev };
            delete next[task.id];
            return next;
          });
        } else {
          if (task.isCompleted) {
            await updateTask.mutateAsync({ id: task.id, isCompleted: false });
          }
          setKanbanStatusById((prev) => ({ ...prev, [task.id]: status }));
        }
        await utils.tasks.list.invalidate();
      } catch (error) {
        console.error("[Actions/Kanban] Failed moving task:", error);
        Alert.alert("Error", "Failed moving task between columns.");
      } finally {
        setRowActionTaskId(null);
      }
    },
    [updateTask, utils.tasks.list]
  );

  const kanbanColumns = React.useMemo(() => {
    const columns: Record<TaskBoardStatus, any[]> = { todo: [], inprogress: [], done: [] };
    for (const task of filteredAndSortedTasks as any[]) {
      const status = getTaskBoardStatus(task);
      columns[status].push(task);
    }
    return columns;
  }, [filteredAndSortedTasks, getTaskBoardStatus]);

  const myDayTasks = React.useMemo(() => {
    const pinned = new Set(myDayTaskIds);
    return (tasks as any[])
      .filter((task) => !task.isCompleted && (pinned.has(task.id) || isToday(toDate(task.dueDate))))
      .sort((a, b) => {
        const aPinned = pinned.has(a.id) ? 1 : 0;
        const bPinned = pinned.has(b.id) ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        const aDue = toDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bDue = toDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      });
  }, [myDayTaskIds, tasks]);

  const weeklyReview = React.useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    let created = 0;
    let completed = 0;
    let overdue = 0;
    for (const task of tasks as any[]) {
      const createdAt = toDate(task.createdAt);
      const completedAt = toDate(task.completedAt);
      const dueDate = toDate(task.dueDate);
      if (createdAt && createdAt >= weekStart) created += 1;
      if (task.isCompleted && completedAt && completedAt >= weekStart) completed += 1;
      if (!task.isCompleted && dueDate && dueDate.getTime() < now.getTime()) overdue += 1;
    }
    const completionRate = created > 0 ? Math.round((completed / created) * 100) : 0;
    return { created, completed, overdue, completionRate };
  }, [tasks]);

  const overdueTasks = React.useMemo(() => {
    const now = new Date();
    return (tasks as any[])
      .filter((task) => !task.isCompleted && toDate(task.dueDate) && (toDate(task.dueDate) as Date).getTime() < now.getTime())
      .sort((a, b) => (toDate(a.dueDate)?.getTime() ?? 0) - (toDate(b.dueDate)?.getTime() ?? 0));
  }, [tasks]);

  const overdueCount = overdueTasks.length;

  const dashboardStats = React.useMemo(() => {
    const today = new Date();
    const todayTotal = (tasks as any[]).filter(
      (task) => !task.isCompleted && isToday(toDate(task.dueDate))
    ).length;
    const habitsDone = habits.filter((habit) => habit.doneToday).length;
    const weeklyGoalsDone = weeklyGoals.filter((goal) => goal.done).length;
    const weeklyGoalsTotal = weeklyGoals.length;
    const monthlyProgress = monthlyGoals.reduce((acc, goal) => acc + goal.progress, 0);
    const monthlyTarget = monthlyGoals.reduce((acc, goal) => acc + goal.target, 0);
    return {
      dateLabel: today.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      todayTotal,
      myDayCount: myDayTasks.length,
      habitsDone,
      weeklyGoalsDone,
      weeklyGoalsTotal,
      monthlyProgress,
      monthlyTarget,
    };
  }, [tasks, habits, weeklyGoals, monthlyGoals, myDayTasks.length]);

  const monthlyReview = React.useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let created = 0;
    let completed = 0;
    for (const task of tasks as any[]) {
      const createdAt = toDate(task.createdAt);
      const completedAt = toDate(task.completedAt);
      if (createdAt && createdAt >= monthStart) created += 1;
      if (task.isCompleted && completedAt && completedAt >= monthStart) completed += 1;
    }
    const open = Math.max(created - completed, 0);
    const completionRate = created > 0 ? Math.round((completed / created) * 100) : 0;
    return { created, completed, open, completionRate };
  }, [tasks]);

  const handleCreateTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) {
      Alert.alert("Error", "Please enter a task title");
      return;
    }

    try {
      const rawDueDate = newTaskDueDate.trim();
      const parsedDueDate = rawDueDate
        ? parseNaturalDate(rawDueDate)
        : newTaskDetectedDateValue || null;
      if (rawDueDate && !parsedDueDate) {
        Alert.alert(
          "Invalid due date",
          "Use YYYY-MM-DD or natural text like: today, tomorrow, next week, in 3 days, بكرة."
        );
        return;
      }
      const input = {
        title,
        description: newTaskDescription.trim() || undefined,
        dueDate: parsedDueDate || undefined,
        blockedByTaskId: newTaskBlockedByTaskId || undefined,
        priority: newTaskPriority,
        recurrence: newTaskRecurrence === "none" ? undefined : newTaskRecurrence,
      };
      console.log("[Actions] Creating task:", input);
      const createdTask = await createTask.mutateAsync(input as any);
      console.log("[Actions] Task created:", createdTask);
      setActiveTab("all");
      await refetch();

      if (createdTask?.id && createdTask?.dueDate) {
        await scheduleTaskDueNotification({
          taskId: createdTask.id,
          title: createdTask.title || title,
          priority: (createdTask.priority || newTaskPriority) as "low" | "medium" | "high",
          dueDate: createdTask.dueDate as unknown as string,
        });
      }
    } catch (err) {
      console.error("Failed to create task:", err);
      Alert.alert("Error", "Failed to create task");
    }
  };

  const persistSavedViews = async (nextViews: ActionsSavedView[]) => {
    setSavedViews(nextViews);
    try {
      await AsyncStorage.setItem(ACTIONS_VIEWS_KEY, JSON.stringify(nextViews));
    } catch (error) {
      console.error("[Actions] Failed saving views:", error);
    }
  };

  const handleSaveCurrentView = async () => {
    const nextView: ActionsSavedView = {
      id: `${Date.now()}`,
      name: activeTab === "all" ? "All Tasks" : `View: ${activeTab}`,
      tab: activeTab,
    };
    const next = [nextView, ...savedViews].slice(0, 8);
    await persistSavedViews(next);
  };

  const handleDeleteSavedView = async (id: string) => {
    const next = savedViews.filter((view) => view.id !== id);
    await persistSavedViews(next);
  };

  const formatFocusTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const setFocusPreset = (minutes: number) => {
    setFocusMinutes(minutes);
    setFocusRemainingSeconds(minutes * 60);
    setIsFocusRunning(false);
  };

  const toggleMyDayTask = (id: string) => {
    setMyDayTaskIds((previous) =>
      previous.includes(id) ? previous.filter((value) => value !== id) : [id, ...previous]
    );
  };

  const addHabit = () => {
    const name = newHabitName.trim();
    if (!name) return;
    const next: HabitItem = {
      id: `${Date.now()}`,
      name,
      streak: 0,
      doneToday: false,
      lastCompletedDate: null,
    };
    setHabits((previous) => [next, ...previous].slice(0, 12));
    setNewHabitName("");
  };

  const toggleHabitDone = (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setHabits((previous) =>
      previous.map((habit) => {
        if (habit.id !== id) return habit;
        if (habit.doneToday) {
          return habit;
        }
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const nextStreak = habit.lastCompletedDate === yesterday ? habit.streak + 1 : 1;
        return {
          ...habit,
          doneToday: true,
          streak: nextStreak,
          lastCompletedDate: today,
        };
      })
    );
  };

  const deleteHabit = (id: string) => {
    setHabits((previous) => previous.filter((habit) => habit.id !== id));
  };

  const habitsStats = React.useMemo(() => {
    const longest = habits.reduce((max, habit) => Math.max(max, habit.streak), 0);
    const doneToday = habits.filter((habit) => habit.doneToday).length;
    return { longest, doneToday, total: habits.length };
  }, [habits]);

  const addWeeklyGoal = () => {
    const title = newWeeklyGoalTitle.trim();
    if (!title) return;
    const next: WeeklyGoal = {
      id: `${Date.now()}`,
      title,
      done: false,
    };
    setWeeklyGoals((previous) => [next, ...previous].slice(0, 12));
    setNewWeeklyGoalTitle("");
  };

  const toggleWeeklyGoal = (id: string) => {
    setWeeklyGoals((previous) =>
      previous.map((goal) => (goal.id === id ? { ...goal, done: !goal.done } : goal))
    );
  };

  const removeWeeklyGoal = (id: string) => {
    setWeeklyGoals((previous) => previous.filter((goal) => goal.id !== id));
  };

  const addMonthlyGoal = () => {
    const title = newMonthlyGoalTitle.trim();
    const target = Math.max(1, Number.parseInt(newMonthlyGoalTarget || "0", 10) || 1);
    if (!title) return;
    const next: MonthlyGoal = {
      id: `${Date.now()}`,
      title,
      progress: 0,
      target,
    };
    setMonthlyGoals((previous) => [next, ...previous].slice(0, 10));
    setNewMonthlyGoalTitle("");
    setNewMonthlyGoalTarget("5");
  };

  const incrementMonthlyGoal = (id: string) => {
    setMonthlyGoals((previous) =>
      previous.map((goal) =>
        goal.id === id ? { ...goal, progress: Math.min(goal.target, goal.progress + 1) } : goal
      )
    );
  };

  const resetMonthlyGoal = (id: string) => {
    setMonthlyGoals((previous) => previous.map((goal) => (goal.id === id ? { ...goal, progress: 0 } : goal)));
  };

  const removeMonthlyGoal = (id: string) => {
    setMonthlyGoals((previous) => previous.filter((goal) => goal.id !== id));
  };

  const completeMonthlyGoal = (id: string) => {
    setMonthlyGoals((previous) =>
      previous.map((goal) => (goal.id === id ? { ...goal, progress: goal.target } : goal))
    );
  };

  const handleSnoozeTask = async (task: any, days: number) => {
    try {
      setReminderUpdatingTaskId(task.id);
      const base = toDate(task.dueDate) || new Date();
      const next = new Date(base);
      next.setDate(next.getDate() + days);
      const input = {
        id: task.id,
        dueDate: dateToYmd(next),
      };
      const result = await offlineManager.runOrQueueMutation("tasks.update", input, () =>
        updateTask.mutateAsync(input)
      );
      if ("queued" in (result as any)) {
        Alert.alert("Queued", "Reminder update will sync when back online.");
      }
    } catch (error) {
      console.error("[Actions] Failed snoozing task:", error);
      Alert.alert("Error", "Failed to update reminder.");
    } finally {
      setReminderUpdatingTaskId(null);
    }
  };

  const handleMoveTaskToToday = async (task: any) => {
    try {
      setReminderUpdatingTaskId(task.id);
      const input = {
        id: task.id,
        dueDate: dateToYmd(new Date()),
      };
      const result = await offlineManager.runOrQueueMutation("tasks.update", input, () =>
        updateTask.mutateAsync(input)
      );
      if ("queued" in (result as any)) {
        Alert.alert("Queued", "Task update will sync when back online.");
      }
    } catch (error) {
      console.error("[Actions] Failed moving task to today:", error);
      Alert.alert("Error", "Failed to move task.");
    } finally {
      setReminderUpdatingTaskId(null);
    }
  };

  const handleCompleteMyDay = async () => {
    const targets = myDayTasks.filter((task) => !task.isCompleted);
    if (!targets.length) {
      Alert.alert("My Day", "No pending tasks to complete.");
      return;
    }
    try {
      for (const task of targets) {
        // Reuse existing business logic to support recurring tasks correctly.
        // eslint-disable-next-line no-await-in-loop
        await handleToggleTask(task.id);
      }
      Alert.alert("Done", `Completed ${targets.length} task(s) from My Day.`);
    } catch (error) {
      console.error("[Actions] Failed completing My Day tasks:", error);
      Alert.alert("Error", "Failed to complete some tasks.");
    }
  };

  const handleClearCompletedTasks = async () => {
    const completed = (tasks as any[]).filter((task) => task.isCompleted);
    if (!completed.length) {
      Alert.alert("Actions", "No completed tasks to clear.");
      return;
    }
    try {
      setBulkActionLoading(true);
      for (const task of completed) {
        // eslint-disable-next-line no-await-in-loop
        await deleteTask.mutateAsync({ id: task.id });
      }
      Alert.alert("Done", `Removed ${completed.length} completed task(s).`);
    } catch (error) {
      console.error("[Actions] Failed clearing completed tasks:", error);
      Alert.alert("Error", "Failed to clear completed tasks.");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleDuplicateTask = async (task: any) => {
    try {
      setRowActionTaskId(task.id);
      await createTask.mutateAsync({
        title: `${task.title} (Copy)`,
        description: task.description || undefined,
        dueDate: task.dueDate || undefined,
        priority: task.priority || "medium",
        recurrence: task.recurrence || undefined,
      } as any);
    } catch (error) {
      console.error("[Actions] Failed duplicating task:", error);
      Alert.alert("Error", "Failed to duplicate task.");
    } finally {
      setRowActionTaskId(null);
    }
  };

  const handleCycleTaskPriority = async (task: any) => {
    try {
      setRowActionTaskId(task.id);
      const current = task.priority || "medium";
      const next: "low" | "medium" | "high" =
        current === "low" ? "medium" : current === "medium" ? "high" : "low";
      const input = {
        id: task.id,
        priority: next,
      };
      const result = await offlineManager.runOrQueueMutation("tasks.update", input, () =>
        updateTask.mutateAsync(input)
      );
      if ("queued" in (result as any)) {
        Alert.alert("Queued", "Priority update will sync when back online.");
      }
    } catch (error) {
      console.error("[Actions] Failed cycling priority:", error);
      Alert.alert("Error", "Failed to update priority.");
    } finally {
      setRowActionTaskId(null);
    }
  };

  const resetFocusStats = async () => {
    const next: FocusStats = {
      date: new Date().toISOString().slice(0, 10),
      sessions: 0,
      minutes: 0,
    };
    setFocusStats(next);
    await AsyncStorage.setItem(ACTIONS_FOCUS_STATS_KEY, JSON.stringify(next));
  };

  const resetHabitsProgress = () => {
    setHabits((previous) =>
      previous.map((habit) => ({
        ...habit,
        streak: 0,
        doneToday: false,
        lastCompletedDate: null,
      }))
    );
  };

  const resetWeeklyGoals = () => {
    setWeeklyGoals((previous) => previous.map((goal) => ({ ...goal, done: false })));
  };

  const resetMonthlyGoalsProgress = () => {
    setMonthlyGoals((previous) => previous.map((goal) => ({ ...goal, progress: 0 })));
  };

  const openTaskTemplate = (template: "gtd" | "eisenhower" | "timeblock") => {
    if (template === "gtd") {
      setNewTaskTitle("Capture + Clarify next action");
      setNewTaskDescription("Define the concrete next action and context.");
      setNewTaskPriority("medium");
    } else if (template === "eisenhower") {
      setNewTaskTitle("Urgent vs Important review");
      setNewTaskDescription("Decide: do, schedule, delegate, or drop.");
      setNewTaskPriority("high");
    } else {
      setNewTaskTitle("Deep work block");
      setNewTaskDescription("Reserve 90 minutes for focused execution.");
      setNewTaskPriority("medium");
    }
    setShowCreateModal(true);
  };

  const handleToggleTask = async (id: string) => {
    try {
      setTogglingTaskId(id);
      const task = (tasks as any[]).find((t) => t.id === id);
      if (task && !task.isCompleted && task.blockedByTaskId) {
        const blocker = (tasks as any[]).find((t) => t.id === task.blockedByTaskId);
        if (blocker && !blocker.isCompleted) {
          Alert.alert("Task blocked", `Complete "${blocker.title}" first.`);
          return;
        }
      }
      const isRecurring = Boolean(task?.recurrence && ["daily", "weekly", "monthly"].includes(task.recurrence));
      const isCompleting = task && !task.isCompleted;
      if (isRecurring && isCompleting) {
        const result = await offlineManager.runOrQueueMutation(
          "tasks.completeRecurring",
          { id },
          () => completeRecurringTask.mutateAsync({ id })
        );
        if ("queued" in (result as any)) {
          Alert.alert("Queued", "Task completion will sync when you're back online.");
          return;
        }
        const typedResult = result as any;
        await cancelTaskDueNotification(id);
        if (typedResult?.newTask?.id && typedResult?.newTask?.dueDate) {
          await scheduleTaskDueNotification({
            taskId: typedResult.newTask.id,
            title: typedResult.newTask.title || task?.title || "Task",
            priority: (typedResult.newTask.priority || task?.priority || "medium") as "low" | "medium" | "high",
            dueDate: typedResult.newTask.dueDate as unknown as string,
          });
        }
      } else {
        const result = await offlineManager.runOrQueueMutation("tasks.toggle", { id }, () =>
          toggleTask.mutateAsync({ id })
        );
        if ("queued" in (result as any)) {
          Alert.alert("Queued", "Task update will sync when you're back online.");
          return;
        }
      const typedResult = result as any;
      if (typedResult?.blocked) {
        Alert.alert("Task blocked", "You can't complete this task until its dependency is completed.");
        return;
      }
      if (typedResult?.isCompleted) {
        await cancelTaskDueNotification(id);
      } else if (task?.dueDate) {
          await scheduleTaskDueNotification({
            taskId: id,
            title: task.title || "Task",
            priority: (task.priority || "medium") as "low" | "medium" | "high",
            dueDate: task.dueDate,
          });
        }
      }
    } catch (err) {
      console.error("Failed to toggle task:", err);
      Alert.alert("Error", "Failed to update task");
    } finally {
      setTogglingTaskId(null);
    }
  };

  const handleDeleteTask = (id: string) => {
    Alert.alert("Delete Task", "Are you sure you want to delete this task?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingTaskId(id);
            const result = await offlineManager.runOrQueueMutation("tasks.delete", { id }, () =>
              deleteTask.mutateAsync({ id })
            );
            if ("queued" in (result as any)) {
              Alert.alert("Queued", "Task deletion will sync when you're back online.");
            } else {
              await cancelTaskDueNotification(id);
            }
          } catch (err) {
            console.error("Failed to delete task:", err);
            Alert.alert("Error", "Failed to delete task");
          } finally {
            setDeletingTaskId(null);
          }
        },
      },
    ]);
  };

  const taskById = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const task of tasks as any[]) {
      map.set(task.id, task);
    }
    return map;
  }, [tasks]);

  const dependencyCandidates = React.useMemo(
    () => (tasks as any[]).filter((task) => !task.isCompleted).slice(0, 8),
    [tasks]
  );

  const openSubtasksModal = React.useCallback((taskId: string) => {
    setSubtasksTaskId(taskId);
    setNewSubtaskTitle("");
  }, []);

  const handleCreateSubtask = React.useCallback(async () => {
    if (!subtasksTaskId || !newSubtaskTitle.trim()) return;
    try {
      await createSubtask.mutateAsync({ taskId: subtasksTaskId, title: newSubtaskTitle.trim() });
    } catch (error) {
      console.error("[Actions] Failed creating subtask:", error);
      Alert.alert("Error", "Failed to create subtask.");
    }
  }, [createSubtask, newSubtaskTitle, subtasksTaskId]);

  return (
    <ScreenContainer>
      <View className="p-4 border-b border-border">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <MaterialIcons name="check-circle" size={32} color={colors.primary} />
            <Text className="text-2xl font-bold text-foreground ml-2">Actions</Text>
          </View>
          <Pressable
            onPress={() => setShowCreateModal(true)}
            className="bg-primary rounded-lg p-2 items-center justify-center"
          >
            <MaterialIcons name="add" size={22} color="white" />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", marginTop: 10 }}>
          {(["list", "kanban"] as const).map((modeOption) => (
            <Pressable
              key={modeOption}
              onPress={() => setViewMode(modeOption)}
              style={{
                marginRight: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: viewMode === modeOption ? colors.primary : colors.background,
              }}
            >
              <Text style={{ color: viewMode === modeOption ? "white" : colors.foreground, fontSize: 12, fontWeight: "700" }}>
                {modeOption === "list" ? "List View" : "Kanban View"}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", marginTop: 10 }}>
          {[
            { key: "gtd", label: "GTD" },
            { key: "eisenhower", label: "Eisenhower" },
            { key: "timeblock", label: "Time Block" },
          ].map((template) => (
            <Pressable
              key={template.key}
              onPress={() => openTaskTemplate(template.key as "gtd" | "eisenhower" | "timeblock")}
              style={{
                marginRight: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>{template.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="px-4 py-3 border-b border-border">
        <PomodoroTimer />
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            padding: 12,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Productivity Dashboard</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{dashboardStats.dateLabel}</Text>
          </View>
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>Due Today</Text>
              <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>{dashboardStats.todayTotal}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>My Day</Text>
              <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>{dashboardStats.myDayCount}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>Habits Done</Text>
              <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>{dashboardStats.habitsDone}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 12, marginRight: 12 }}>
              Weekly: {dashboardStats.weeklyGoalsDone}/{dashboardStats.weeklyGoalsTotal}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Monthly: {dashboardStats.monthlyProgress}/{dashboardStats.monthlyTarget}
            </Text>
          </View>
        </View>
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Quick Filters</Text>
          <View style={{ flexDirection: "row" }}>
            <Pressable onPress={handleSaveCurrentView} style={{ marginRight: 10 }}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>Save View</Text>
            </Pressable>
            <Pressable onPress={handleClearCompletedTasks} disabled={bulkActionLoading}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                {bulkActionLoading ? "Clearing..." : "Clear Completed"}
              </Text>
            </Pressable>
          </View>
        </View>
        <TextInput
          value={taskSearch}
          onChangeText={setTaskSearch}
          placeholder="Search tasks..."
          placeholderTextColor={colors.muted}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            backgroundColor: colors.background,
            color: colors.foreground,
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginBottom: 8,
          }}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", zIndex: 5, elevation: 5 }}>
          {[
            { label: "All", value: "all" as const },
            { label: "Today", value: "today" as const },
            { label: "Completed", value: "completed" as const },
            { label: "High Priority", value: "high" as const },
            { label: `Overdue (${overdueCount})`, value: "overdue" as const },
          ].map((tab) => (
            <Pressable
              key={tab.value}
              onPress={() => {
                console.log("[Actions] Filter tab pressed:", tab.value);
                setActiveTab(tab.value);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginRight: 8,
                marginBottom: 8,
                alignSelf: "flex-start",
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: activeTab === tab.value ? colors.primary : colors.surface,
              }}
            >
              <Text style={{ color: activeTab === tab.value ? "white" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {savedViews.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
            {savedViews.map((view) => (
              <Pressable
                key={view.id}
                onPress={() => setActiveTab(view.tab)}
                onLongPress={() => handleDeleteSavedView(view.id)}
                style={{
                  marginRight: 8,
                  marginBottom: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                <Text style={{ color: colors.foreground, fontSize: 12 }}>{view.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            padding: 12,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Focus Timer</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Today: {focusStats.sessions} sessions • {focusStats.minutes} min
            </Text>
          </View>
          <Pressable onPress={resetFocusStats} style={{ alignSelf: "flex-start", marginTop: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Reset Focus Stats</Text>
          </Pressable>
          <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 28, marginTop: 8 }}>
            {formatFocusTime(focusRemainingSeconds)}
          </Text>
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            {[15, 25, 50].map((minutes) => (
              <Pressable
                key={minutes}
                onPress={() => setFocusPreset(minutes)}
                style={{
                  marginRight: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: focusMinutes === minutes ? colors.primary : colors.background,
                }}
              >
                <Text style={{ color: focusMinutes === minutes ? "white" : colors.foreground, fontSize: 12 }}>
                  {minutes}m
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <Pressable
              onPress={() => setIsFocusRunning((previous) => !previous)}
              style={{
                marginRight: 8,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: colors.primary,
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>{isFocusRunning ? "Pause" : "Start"}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setIsFocusRunning(false);
                setFocusRemainingSeconds(focusMinutes * 60);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
              }}
            >
              <Text style={{ color: colors.foreground, fontWeight: "700" }}>Reset</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            padding: 12,
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>My Day</Text>
          <Pressable
            onPress={handleCompleteMyDay}
            style={{
              alignSelf: "flex-start",
              marginTop: 8,
              marginBottom: 2,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>Complete My Day</Text>
          </Pressable>
          <Pressable onPress={() => setMyDayTaskIds([])} style={{ alignSelf: "flex-start", marginTop: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Clear My Day Pins</Text>
          </Pressable>
          {myDayTasks.length === 0 ? (
            <Text style={{ color: colors.muted, marginTop: 6, fontSize: 12 }}>
              No tasks yet. Pin tasks with "My Day" from the list below.
            </Text>
          ) : (
            <View style={{ marginTop: 8 }}>
              {myDayTasks.slice(0, 4).map((task) => (
                <View key={`my-day-${task.id}`} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <MaterialIcons name="today" size={14} color={colors.primary} />
                  <Text style={{ color: colors.foreground, marginLeft: 6, flex: 1, fontSize: 13 }} numberOfLines={1}>
                    {task.title}
                  </Text>
                  <Pressable onPress={() => toggleMyDayTask(task.id)}>
                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                      {myDayTaskIds.includes(task.id) ? "Unpin" : "Pin"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            padding: 12,
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Habit Tracker</Text>
          <Text style={{ color: colors.muted, marginTop: 6, fontSize: 12 }}>
            Done today: {habitsStats.doneToday}/{habitsStats.total} • Longest streak: {habitsStats.longest}
          </Text>
          <Pressable onPress={resetHabitsProgress} style={{ alignSelf: "flex-start", marginTop: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Reset Habits Progress</Text>
          </Pressable>
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <TextInput
              value={newHabitName}
              onChangeText={setNewHabitName}
              placeholder="Add habit..."
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                backgroundColor: colors.background,
                color: colors.foreground,
                paddingHorizontal: 10,
                paddingVertical: 8,
                marginRight: 8,
              }}
            />
            <Pressable
              onPress={addHabit}
              style={{
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Add</Text>
            </Pressable>
          </View>
          {habits.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              {habits.map((habit) => (
                <View key={habit.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Pressable onPress={() => toggleHabitDone(habit.id)} style={{ marginRight: 8 }}>
                    <MaterialIcons
                      name={habit.doneToday ? "check-circle" : "radio-button-unchecked"}
                      size={20}
                      color={habit.doneToday ? colors.primary : colors.muted}
                    />
                  </Pressable>
                  <Text style={{ color: colors.foreground, flex: 1 }} numberOfLines={1}>
                    {habit.name}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginRight: 10 }}>
                    {habit.streak} day streak
                  </Text>
                  <Pressable onPress={() => deleteHabit(habit.id)}>
                    <MaterialIcons name="close" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>
              Add your first habit to track consistency.
            </Text>
          )}
        </View>
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            padding: 12,
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Weekly Goals</Text>
          <Pressable onPress={resetWeeklyGoals} style={{ alignSelf: "flex-start", marginTop: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Reset Weekly Goals</Text>
          </Pressable>
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <TextInput
              value={newWeeklyGoalTitle}
              onChangeText={setNewWeeklyGoalTitle}
              placeholder="Add weekly goal..."
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                backgroundColor: colors.background,
                color: colors.foreground,
                paddingHorizontal: 10,
                paddingVertical: 8,
                marginRight: 8,
              }}
            />
            <Pressable
              onPress={addWeeklyGoal}
              style={{
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Add</Text>
            </Pressable>
          </View>
          {weeklyGoals.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>
                Completion: {Math.round((weeklyGoals.filter((goal) => goal.done).length / weeklyGoals.length) * 100)}%
              </Text>
              {weeklyGoals.map((goal) => (
                <View key={goal.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Pressable onPress={() => toggleWeeklyGoal(goal.id)} style={{ marginRight: 8 }}>
                    <MaterialIcons
                      name={goal.done ? "check-circle" : "radio-button-unchecked"}
                      size={20}
                      color={goal.done ? colors.primary : colors.muted}
                    />
                  </Pressable>
                  <Text style={{ color: colors.foreground, flex: 1 }} numberOfLines={1}>
                    {goal.title}
                  </Text>
                  <Pressable onPress={() => removeWeeklyGoal(goal.id)}>
                    <MaterialIcons name="close" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>No weekly goals yet.</Text>
          )}
        </View>
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            padding: 12,
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Weekly Review</Text>
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Created</Text>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 18 }}>{weeklyReview.created}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Completed</Text>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 18 }}>{weeklyReview.completed}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Rate</Text>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 18 }}>{weeklyReview.completionRate}%</Text>
            </View>
          </View>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
            Overdue tasks: {weeklyReview.overdue}
          </Text>
        </View>
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            padding: 12,
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Monthly Goals</Text>
          <Pressable onPress={resetMonthlyGoalsProgress} style={{ alignSelf: "flex-start", marginTop: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Reset Monthly Progress</Text>
          </Pressable>
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <TextInput
              value={newMonthlyGoalTitle}
              onChangeText={setNewMonthlyGoalTitle}
              placeholder="Goal title..."
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                backgroundColor: colors.background,
                color: colors.foreground,
                paddingHorizontal: 10,
                paddingVertical: 8,
                marginRight: 8,
              }}
            />
            <TextInput
              value={newMonthlyGoalTarget}
              onChangeText={setNewMonthlyGoalTarget}
              keyboardType="number-pad"
              placeholder="Target"
              placeholderTextColor={colors.muted}
              style={{
                width: 74,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                backgroundColor: colors.background,
                color: colors.foreground,
                paddingHorizontal: 10,
                paddingVertical: 8,
                marginRight: 8,
              }}
            />
            <Pressable
              onPress={addMonthlyGoal}
              style={{
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Add</Text>
            </Pressable>
          </View>
          {monthlyGoals.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              {monthlyGoals.map((goal) => {
                const percentage = goal.target > 0 ? Math.round((goal.progress / goal.target) * 100) : 0;
                return (
                  <View key={goal.id} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                      <Text style={{ color: colors.foreground, flex: 1 }} numberOfLines={1}>
                        {goal.title}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12, marginRight: 10 }}>
                        {goal.progress}/{goal.target}
                      </Text>
                      <Pressable onPress={() => removeMonthlyGoal(goal.id)}>
                        <MaterialIcons name="close" size={16} color={colors.muted} />
                      </Pressable>
                    </View>
                    <View
                      style={{
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: colors.background,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.max(0, Math.min(100, percentage))}%`,
                          height: 8,
                          backgroundColor: colors.primary,
                        }}
                      />
                    </View>
                    <View style={{ flexDirection: "row", marginTop: 6 }}>
                      <Pressable
                        onPress={() => incrementMonthlyGoal(goal.id)}
                        style={{
                          marginRight: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          backgroundColor: colors.primary,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>+1 Progress</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => resetMonthlyGoal(goal.id)}
                        style={{
                          marginRight: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                        }}
                      >
                        <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 12 }}>Reset</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => completeMonthlyGoal(goal.id)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.primary,
                          backgroundColor: colors.surface,
                        }}
                      >
                        <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>Mark Done</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>No monthly goals yet.</Text>
          )}
        </View>
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            padding: 12,
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Monthly Review</Text>
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Created</Text>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 18 }}>{monthlyReview.created}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Completed</Text>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 18 }}>{monthlyReview.completed}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Open</Text>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 18 }}>{monthlyReview.open}</Text>
            </View>
          </View>
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13, marginTop: 8 }}>
            Completion rate: {monthlyReview.completionRate}%
          </Text>
        </View>
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            padding: 12,
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Smart Reminders</Text>
          {overdueTasks.length === 0 ? (
            <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>Great. No overdue tasks.</Text>
          ) : (
            <View style={{ marginTop: 8 }}>
              {overdueTasks.slice(0, 4).map((task) => (
                <View key={`overdue-${task.id}`} style={{ marginBottom: 10 }}>
                  <Text style={{ color: colors.foreground, fontSize: 13 }} numberOfLines={1}>
                    {task.title}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                    Due: {toDate(task.dueDate)?.toLocaleDateString("en-US") || "No due date"}
                  </Text>
                  <View style={{ flexDirection: "row", marginTop: 5 }}>
                    <Pressable
                      onPress={() => handleMoveTaskToToday(task)}
                      disabled={reminderUpdatingTaskId === task.id}
                      style={{
                        marginRight: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: colors.primary,
                      }}
                    >
                      {reminderUpdatingTaskId === task.id ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>Move to Today</Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => handleSnoozeTask(task, 1)}
                      disabled={reminderUpdatingTaskId === task.id}
                      style={{
                        marginRight: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 12 }}>Snooze +1d</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleSnoozeTask(task, 3)}
                      disabled={reminderUpdatingTaskId === task.id}
                      style={{
                        marginRight: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 12 }}>+3d</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleSnoozeTask(task, 7)}
                      disabled={reminderUpdatingTaskId === task.id}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 12 }}>+7d</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {viewMode === "kanban" ? (
        <ScrollView horizontal contentContainerStyle={{ padding: 12 }}>
          {([
            { key: "todo", label: "To Do" },
            { key: "inprogress", label: "In Progress" },
            { key: "done", label: "Done" },
          ] as Array<{ key: TaskBoardStatus; label: string }>).map((column) => (
            <View
              key={column.key}
              style={{
                width: 280,
                marginRight: 12,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                backgroundColor: colors.surface,
                padding: 10,
              }}
            >
              <Text style={{ color: colors.foreground, fontWeight: "700", marginBottom: 8 }}>
                {column.label} ({kanbanColumns[column.key].length})
              </Text>
              {kanbanColumns[column.key].length === 0 ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>No tasks</Text>
              ) : (
                kanbanColumns[column.key].map((task: any) => (
                  <View
                    key={task.id}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: colors.foreground, fontWeight: "600" }} numberOfLines={2}>
                      {task.title}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
                      {task.dueDate ? `Due: ${task.dueDate}` : "No due date"}
                    </Text>
                    <View style={{ flexDirection: "row", marginTop: 8 }}>
                      {column.key !== "todo" ? (
                        <Pressable
                          onPress={() => moveTaskToBoardStatus(task, column.key === "done" ? "inprogress" : "todo")}
                          style={{ marginRight: 10 }}
                          disabled={rowActionTaskId === task.id}
                        >
                          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                            Move Left
                          </Text>
                        </Pressable>
                      ) : null}
                      {column.key !== "done" ? (
                        <Pressable
                          onPress={() => moveTaskToBoardStatus(task, column.key === "todo" ? "inprogress" : "done")}
                          disabled={rowActionTaskId === task.id}
                        >
                          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                            Move Right
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </View>
          ))}
        </ScrollView>
      ) : isLoading ? (
        <View className="flex-1 items-center mt-8">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-muted mt-4">Loading tasks...</Text>
        </View>
      ) : error ? (
        <View className="flex-1 p-4">
          <ErrorState error={error} onRetry={refetch} />
        </View>
      ) : filteredAndSortedTasks.length === 0 ? (
        <View className="flex-1 items-center justify-center mt-8 px-4">
          <MaterialIcons name="assignment-turned-in" size={64} color={colors.muted} />
          <Text className="text-muted text-center mt-4">No tasks found</Text>
          <Text className="text-muted text-center mt-2 text-sm">
            Tap + to create your first task
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          <FlashList
            data={filteredAndSortedTasks}
            estimatedItemSize={124}
            keyExtractor={(task: any) => task.id}
            contentContainerStyle={{ padding: 16 }}
            onEndReachedThreshold={0.35}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View className="py-4">
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : null
            }
            renderItem={({ item: task }: { item: any }) => {
            const completed = Boolean(task.isCompleted);
            const dueDate = toDate(task.dueDate);
            const priority = task.priority || "medium";
            const recurrence = (task.recurrence || null) as RecurrenceType | null;
            const nextDueDateLabel = computeNextDueDateLabel(task.dueDate, recurrence);
            const isToggling =
              (toggleTask.isPending || completeRecurringTask.isPending) && togglingTaskId === task.id;
            const isDeleting = deleteTask.isPending && deletingTaskId === task.id;

              return (
              <View
                key={task.id}
                className="bg-surface p-4 rounded-lg mb-3 border border-border"
                style={{
                  opacity: completed ? 0.6 : 1,
                  borderColor: focusedTaskId === task.id ? colors.primary : colors.border,
                  borderWidth: focusedTaskId === task.id ? 2 : 1,
                }}
              >
                <View className="flex-row items-start justify-between">
                  <Pressable onPress={() => handleToggleTask(task.id)} disabled={isToggling} className="mr-3 mt-0.5">
                    {isToggling ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <MaterialIcons
                        name={completed ? "check-box" : "check-box-outline-blank"}
                        size={22}
                        color={completed ? colors.primary : colors.muted}
                      />
                    )}
                  </Pressable>

                  <View className="flex-1">
                    <Text
                      className="font-semibold text-foreground"
                      style={{ textDecorationLine: completed ? "line-through" : "none" }}
                    >
                      {task.title}
                    </Text>
                    {task.description ? (
                      <Text
                        className="text-muted text-sm mt-1"
                        style={{ textDecorationLine: completed ? "line-through" : "none" }}
                      >
                        {task.description}
                      </Text>
                    ) : null}
                    <View className="flex-row items-center mt-2">
                      <Text className="text-muted text-xs mr-3">
                        {dueDate ? dueDate.toLocaleDateString("en-US") : "No due date"}
                      </Text>
                      <Text className="text-xs">{PRIORITY_BADGE[priority] || PRIORITY_BADGE.medium}</Text>
                    </View>
                    {recurrence ? (
                      <View className="flex-row items-center mt-1">
                        <MaterialIcons name="autorenew" size={14} color={colors.primary} />
                        <Text className="text-xs ml-1" style={{ color: colors.primary }}>
                          {recurrence}
                          {nextDueDateLabel ? ` • Next: ${nextDueDateLabel}` : ""}
                        </Text>
                      </View>
                    ) : null}
                    {task.blockedByTaskId ? (
                      <View className="flex-row items-center mt-1">
                        <MaterialIcons name="link" size={14} color={colors.error} />
                        <Text className="text-xs ml-1" style={{ color: colors.error }}>
                          Blocked by: {taskById.get(task.blockedByTaskId)?.title || "Another task"}
                        </Text>
                      </View>
                    ) : null}
                    <Pressable onPress={() => toggleMyDayTask(task.id)} style={{ marginTop: 6, alignSelf: "flex-start" }}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                        {myDayTaskIds.includes(task.id) ? "Remove from My Day" : "Add to My Day"}
                      </Text>
                    </Pressable>
                    <View style={{ flexDirection: "row", marginTop: 6 }}>
                      <Pressable onPress={() => handleDuplicateTask(task)} disabled={rowActionTaskId === task.id}>
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700", marginRight: 12 }}>
                          {rowActionTaskId === task.id ? "..." : "Duplicate"}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => handleCycleTaskPriority(task)} disabled={rowActionTaskId === task.id}>
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                          Cycle Priority
                        </Text>
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                      <Text style={{ color: colors.muted, fontSize: 12, marginRight: 10 }}>
                        Time: {formatTrackedTime(taskTimeQuery.data?.totals?.[task.id] ?? 0)}
                      </Text>
                      <Pressable
                        onPress={() => handleToggleTaskTimer(task.id)}
                        disabled={startTaskTimer.isPending || stopTaskTimer.isPending}
                      >
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                          {taskTimeQuery.data?.activeTaskId === task.id ? "Stop Timer" : "Start Timer"}
                        </Text>
                      </Pressable>
                    </View>
                    {subtasksSummaryQuery.data?.[task.id]?.total ? (
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                        <Text style={{ color: colors.muted, fontSize: 12, marginRight: 10 }}>
                          Subtasks: {subtasksSummaryQuery.data[task.id].completed}/{subtasksSummaryQuery.data[task.id].total}
                        </Text>
                        <Pressable onPress={() => openSubtasksModal(task.id)}>
                          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Manage</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => openSubtasksModal(task.id)} style={{ marginTop: 6, alignSelf: "flex-start" }}>
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Add subtask</Text>
                      </Pressable>
                    )}
                  </View>

                  <Pressable onPress={() => handleDeleteTask(task.id)} disabled={isDeleting} className="ml-3 mt-0.5">
                    {isDeleting ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <MaterialIcons name="delete" size={20} color={colors.error} />
                    )}
                  </Pressable>
                </View>
              </View>
              );
            }}
          />
        </View>
      )}

      <Modal
        visible={Boolean(subtasksTaskId)}
        transparent
        animationType="fade"
        onRequestClose={() => setSubtasksTaskId(null)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-surface rounded-t-3xl p-6 max-h-3/4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-xl font-bold text-foreground mb-4">Manage Subtasks</Text>

            <View style={{ flexDirection: "row", marginBottom: 12 }}>
              <TextInput
                value={newSubtaskTitle}
                onChangeText={setNewSubtaskTitle}
                placeholder="New subtask"
                placeholderTextColor={colors.muted}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.foreground,
                  backgroundColor: colors.background,
                  marginRight: 8,
                }}
              />
              <Pressable
                onPress={handleCreateSubtask}
                disabled={createSubtask.isPending || !newSubtaskTitle.trim()}
                style={{
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                  backgroundColor: colors.primary,
                  opacity: createSubtask.isPending || !newSubtaskTitle.trim() ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>Add</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {(subtasksQuery.data ?? []).map((subtask: any) => (
                <View
                  key={subtask.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    marginBottom: 8,
                  }}
                >
                  <Pressable
                    onPress={() => toggleSubtask.mutate({ id: subtask.id })}
                    style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                  >
                    <MaterialIcons
                      name={subtask.isCompleted ? "check-box" : "check-box-outline-blank"}
                      size={20}
                      color={subtask.isCompleted ? colors.primary : colors.muted}
                    />
                    <Text
                      style={{
                        marginLeft: 8,
                        color: colors.foreground,
                        textDecorationLine: subtask.isCompleted ? "line-through" : "none",
                      }}
                    >
                      {subtask.title}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => deleteSubtask.mutate({ id: subtask.id })}>
                    <MaterialIcons name="delete" size={18} color={colors.error} />
                  </Pressable>
                </View>
              ))}
              {subtasksQuery.isLoading ? (
                <View style={{ paddingVertical: 12 }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : null}
              {(subtasksQuery.data ?? []).length === 0 && !subtasksQuery.isLoading ? (
                <Text style={{ color: colors.muted }}>No subtasks yet.</Text>
              ) : null}
            </ScrollView>

            <Pressable onPress={() => setSubtasksTaskId(null)} style={{ marginTop: 12 }}>
              <View className="bg-border rounded-lg py-3 items-center">
                <Text className="text-foreground font-semibold">Close</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-surface rounded-t-3xl p-6 max-h-3/4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-xl font-bold text-foreground mb-4">New Task</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="mb-3">
                <Text className="text-sm font-semibold text-foreground mb-2">Productivity Templates</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {[
                    {
                      label: "GTD",
                      title: "Capture + Clarify next action",
                      description: "Define the concrete next action and context.",
                    },
                    {
                      label: "Eisenhower",
                      title: "Urgent vs Important review",
                      description: "Decide: do, schedule, delegate, or drop.",
                    },
                    {
                      label: "Time Block",
                      title: "Deep work block",
                      description: "Reserve 90 minutes for focused execution.",
                    },
                  ].map((template) => (
                    <Pressable
                      key={template.label}
                      onPress={() => {
                        setNewTaskTitle(template.title);
                        setNewTaskDescription(template.description);
                      }}
                      style={{
                        marginRight: 8,
                        marginBottom: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 12 }}>
                        {template.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <TextInput
                placeholder="Task title"
                placeholderTextColor={colors.muted}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
                style={{ color: colors.foreground }}
              />
              <VoiceInputButton
                label="Mic for title"
                onTranscript={(spoken) => setNewTaskTitle((prev) => `${prev} ${spoken}`.trim())}
              />
              {newTaskDetectedDateValue ? (
                <Text className="text-xs mb-3" style={{ color: colors.primary, fontWeight: "600" }}>
                  Detected date: "{newTaskDetectedDateText}" to {newTaskDetectedDateValue}
                </Text>
              ) : null}
              <TextInput
                placeholder="Description (optional)"
                placeholderTextColor={colors.muted}
                value={newTaskDescription}
                onChangeText={setNewTaskDescription}
                multiline
                numberOfLines={3}
                className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
                style={{ color: colors.foreground }}
              />
              <VoiceInputButton
                label="Mic for description"
                onTranscript={(spoken) => setNewTaskDescription((prev) => `${prev} ${spoken}`.trim())}
              />
              <TextInput
                placeholder="Due date (YYYY-MM-DD / tomorrow / بكرة)"
                placeholderTextColor={colors.muted}
                value={newTaskDueDate}
                onChangeText={(value) => {
                  setNewTaskDueDateTouched(true);
                  setNewTaskDueDate(value);
                }}
                className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
                style={{ color: colors.foreground }}
              />
              <VoiceInputButton
                label="Mic for due date"
                onTranscript={(spoken) => {
                  setNewTaskDueDateTouched(true);
                  setNewTaskDueDate((prev) => `${prev} ${spoken}`.trim());
                }}
              />
              <Text className="text-xs mb-3" style={{ color: colors.muted }}>
                Supports: today, tomorrow, next week, in 3 days, بكرة
              </Text>
              <View className="mb-4">
                <Text className="text-sm font-semibold text-foreground mb-2">Priority</Text>
                <View className="flex-row gap-2">
                  {(["low", "medium", "high"] as const).map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => setNewTaskPriority(p)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: newTaskPriority === p ? colors.primary : colors.background,
                        borderColor: colors.border,
                        borderWidth: 1,
                      }}
                    >
                      <Text
                        style={{
                          textAlign: "center",
                          color: newTaskPriority === p ? "white" : colors.foreground,
                          fontWeight: "600",
                          fontSize: 12,
                          textTransform: "capitalize",
                        }}
                      >
                        {p}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View className="mb-4">
                <Text className="text-sm font-semibold text-foreground mb-2">Recurrence</Text>
                <View className="flex-row gap-2">
                  {([
                    { key: "none", label: "None" },
                    { key: "daily", label: "Daily" },
                    { key: "weekly", label: "Weekly" },
                    { key: "monthly", label: "Monthly" },
                  ] as const).map((option) => (
                    <Pressable
                      key={option.key}
                      onPress={() => setNewTaskRecurrence(option.key)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        backgroundColor: newTaskRecurrence === option.key ? colors.primary : colors.background,
                        borderColor: colors.border,
                        borderWidth: 1,
                      }}
                    >
                      <Text
                        style={{
                          color: newTaskRecurrence === option.key ? "white" : colors.foreground,
                          fontWeight: "600",
                          fontSize: 12,
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View className="mb-4">
                <Text className="text-sm font-semibold text-foreground mb-2">Blocked By</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Pressable
                    onPress={() => setNewTaskBlockedByTaskId("")}
                    style={{
                      marginRight: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: newTaskBlockedByTaskId === "" ? colors.primary : colors.background,
                    }}
                  >
                    <Text style={{ color: newTaskBlockedByTaskId === "" ? "white" : colors.foreground, fontSize: 12 }}>None</Text>
                  </Pressable>
                  {dependencyCandidates.map((task: any) => (
                    <Pressable
                      key={task.id}
                      onPress={() => setNewTaskBlockedByTaskId(task.id)}
                      style={{
                        marginRight: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: newTaskBlockedByTaskId === task.id ? colors.primary : colors.background,
                      }}
                    >
                      <Text style={{ color: newTaskBlockedByTaskId === task.id ? "white" : colors.foreground, fontSize: 12 }}>
                        {task.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
            <View className="flex-row gap-3 mt-4">
              <Pressable onPress={() => setShowCreateModal(false)} style={{ flex: 1 }}>
                <View className="bg-border rounded-lg py-3 items-center">
                  <Text className="text-foreground font-semibold">Cancel</Text>
                </View>
              </Pressable>
              <Pressable onPress={handleCreateTask} disabled={createTask.isPending} style={{ flex: 1 }}>
                <View className="bg-primary rounded-lg py-3 items-center">
                  {createTask.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-semibold">Create</Text>
                  )}
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Pressable
        onPress={() => setShowCreateModal(true)}
        style={{
          position: "absolute",
          right: 18,
          bottom: 22,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primary,
          elevation: 8,
        }}
      >
        <MaterialIcons name="add" size={28} color="white" />
      </Pressable>
    </ScreenContainer>
  );
}

