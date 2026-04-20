import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { EmptyState } from "@/components/empty-state";
import { SkeletonList } from "@/components/skeleton-loader";
import { SwipeableRow } from "@/components/swipeable-row";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

function getTodayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameYmd(dateStr: string | null | undefined, todayStr: string): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 10) === todayStr;
}

function isBeforeYmd(dateStr: string | null | undefined, todayStr: string): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 10) < todayStr;
}

function SectionHeader({ title, icon, count, color }: { title: string; icon: keyof typeof MaterialIcons.glyphMap; count: number; color?: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
      <MaterialIcons name={icon} size={18} color={color || colors.primary} />
      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginLeft: 8 }}>{title}</Text>
      <View
        style={{
          marginLeft: 8,
          backgroundColor: (color || colors.primary) + "20",
          borderRadius: 10,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "700", color: color || colors.primary }}>{count}</Text>
      </View>
    </View>
  );
}

function TaskRow({ task, onToggle, onPress, todayStr }: { task: any; onToggle: () => void; onPress: () => void; todayStr: string }) {
  const colors = useColors();
  const priorityColor = task.priority === "high" ? colors.error : task.priority === "medium" ? colors.warning : colors.muted;
  const overdueDue = isBeforeYmd(task.dueDate, todayStr);

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggle();
        }}
        style={{ marginRight: 12 }}
      >
        <MaterialIcons
          name={task.isCompleted ? "check-circle" : "radio-button-unchecked"}
          size={22}
          color={task.isCompleted ? colors.success : colors.muted}
        />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: task.isCompleted ? colors.muted : colors.foreground,
            fontWeight: "600",
            textDecorationLine: task.isCompleted ? "line-through" : "none",
          }}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        {task.dueDate ? (
          <Text style={{ color: overdueDue ? colors.error : colors.muted, fontSize: 11, marginTop: 2 }}>
            {task.dueDate.slice(0, 10)}
          </Text>
        ) : null}
      </View>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: priorityColor }} />
    </Pressable>
  );
}

function HabitRow({ habit, onToggle }: { habit: any; onToggle: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle();
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <MaterialIcons
        name={habit.doneToday ? "check-circle" : "radio-button-unchecked"}
        size={22}
        color={habit.doneToday ? colors.success : colors.muted}
      />
      <Text
        style={{
          flex: 1,
          marginLeft: 12,
          color: habit.doneToday ? colors.muted : colors.foreground,
          fontWeight: "600",
          textDecorationLine: habit.doneToday ? "line-through" : "none",
        }}
      >
        {habit.name}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 11 }}>🔥 {habit.streak}</Text>
    </Pressable>
  );
}

export default function TodayScreen() {
  const colors = useColors();
  const router = useRouter();
  const utils = trpc.useUtils();
  const todayStr = getTodayYmd();

  const tasksQuery = trpc.tasks.list.useInfiniteQuery(
    { limit: 100, sortOrder: "asc" },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );
  const habitsQuery = trpc.habits.list.useQuery();
  const journalQuery = trpc.journal.list.useInfiniteQuery(
    { limit: 5 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  const toggleTask = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
  });
  const toggleHabit = trpc.habits.toggleToday.useMutation({
    onSuccess: () => utils.habits.list.invalidate(),
  });

  const allTasks = useMemo(
    () => tasksQuery.data?.pages.flatMap((p) => p.items ?? []) ?? [],
    [tasksQuery.data]
  );

  const overdueTasks = useMemo(
    () => allTasks.filter((t: any) => !t.isCompleted && isBeforeYmd(t.dueDate, todayStr)),
    [allTasks, todayStr]
  );

  const todayTasks = useMemo(
    () => allTasks.filter((t: any) => !t.isCompleted && isSameYmd(t.dueDate, todayStr)),
    [allTasks, todayStr]
  );

  const habits = useMemo(() => (habitsQuery.data ?? []) as any[], [habitsQuery.data]);
  const pendingHabits = useMemo(() => habits.filter((h) => !h.doneToday), [habits]);
  const doneHabits = useMemo(() => habits.filter((h) => h.doneToday), [habits]);

  const journalEntries = useMemo(
    () => journalQuery.data?.pages.flatMap((p) => p.items ?? []) ?? [],
    [journalQuery.data]
  );
  const hasTodayJournal = journalEntries.some((e: any) => e.entryDate === todayStr);

  const isLoading = tasksQuery.isLoading || habitsQuery.isLoading || journalQuery.isLoading;

  const completedToday = useMemo(
    () => allTasks.filter((t: any) => t.isCompleted && isSameYmd(t.updatedAt?.toString?.(), todayStr)).length,
    [allTasks, todayStr]
  );

  const totalToday = overdueTasks.length + todayTasks.length + pendingHabits.length;

  const completeTask = (id: string) => toggleTask.mutate({ id, isCompleted: true });
  const openTask = (id: string) =>
    router.push({ pathname: "/(app)/(tabs)/actions", params: { taskId: id } } as any);

  const renderTaskRow = (task: any) => (
    <SwipeableRow
      key={task.id}
      leftAction={{
        icon: "check-circle",
        color: "#fff",
        backgroundColor: colors.success,
        onPress: () => completeTask(task.id),
      }}
    >
      <TaskRow task={task} onToggle={() => completeTask(task.id)} onPress={() => openTask(task.id)} todayStr={todayStr} />
    </SwipeableRow>
  );

  const renderHabitRow = (habit: any) => (
    <SwipeableRow
      key={habit.id}
      leftAction={{
        icon: habit.doneToday ? "undo" : "check-circle",
        color: "#fff",
        backgroundColor: habit.doneToday ? colors.warning : colors.success,
        onPress: () => toggleHabit.mutate({ id: habit.id }),
      }}
    >
      <HabitRow habit={habit} onToggle={() => toggleHabit.mutate({ id: habit.id })} />
    </SwipeableRow>
  );

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground }}>Today</Text>
        </View>
        <SkeletonList count={6} variant="task" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground }}>Today</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {completedToday + doneHabits.length} done today
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {totalToday} remaining
          </Text>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.success,
              width: totalToday + completedToday + doneHabits.length > 0
                ? `${((completedToday + doneHabits.length) / (totalToday + completedToday + doneHabits.length)) * 100}%`
                : "0%",
            }}
          />
        </View>
      </View>

      {totalToday === 0 && !hasTodayJournal ? (
        <EmptyState
          icon="wb-sunny"
          title="All caught up!"
          subtitle="No tasks or habits remaining for today. Enjoy your day or add something new."
          actionLabel="Add a task"
          onAction={() => router.push("/(app)/(tabs)/actions" as any)}
        />
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {overdueTasks.length > 0 ? (
            <>
              <SectionHeader title="Overdue" icon="warning" count={overdueTasks.length} color={colors.error} />
              {overdueTasks.map(renderTaskRow)}
            </>
          ) : null}

          {todayTasks.length > 0 ? (
            <>
              <SectionHeader title="Today's Tasks" icon="check-circle" count={todayTasks.length} />
              {todayTasks.map(renderTaskRow)}
            </>
          ) : null}

          {habits.length > 0 ? (
            <>
              <SectionHeader title="Habits" icon="local-fire-department" count={pendingHabits.length} />
              {pendingHabits.map(renderHabitRow)}
              {doneHabits.map(renderHabitRow)}
            </>
          ) : null}

          {!hasTodayJournal ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 }}>
              <Pressable
                onPress={() => router.push("/(app)/(tabs)/journal" as any)}
                style={{
                  backgroundColor: colors.primary + "12",
                  borderWidth: 1,
                  borderColor: colors.primary + "30",
                  borderRadius: 12,
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <MaterialIcons name="edit" size={22} color={colors.primary} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontWeight: "700" }}>Write today's journal</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Reflect on your day</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
