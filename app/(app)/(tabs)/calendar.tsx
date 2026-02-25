import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Calendar } from "react-native-calendars";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type CalendarMode = "month" | "week" | "day";

function toYmd(input: unknown): string | null {
  if (!input) return null;
  const date = new Date(input as string | number | Date);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default function CalendarScreen() {
  const colors = useColors();
  const router = useRouter();
  const [mode, setMode] = React.useState<CalendarMode>("month");
  const [selectedDate, setSelectedDate] = React.useState(() => toYmd(new Date()) || "");

  const tasksQuery = trpc.tasks.list.useInfiniteQuery(
    { sortOrder: "asc", limit: 100 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );
  const tasks = React.useMemo(
    () => tasksQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [tasksQuery.data]
  );
  const itemsQuery = trpc.items.list.useInfiniteQuery(
    { limit: 100, type: "note", sortBy: "createdAt", sortOrder: "desc" },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );
  const notes = React.useMemo(
    () => itemsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [itemsQuery.data]
  );
  const journalQuery = trpc.journal.list.useInfiniteQuery(
    { limit: 100 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );
  const journalEntries = React.useMemo(
    () => journalQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [journalQuery.data]
  );

  const allEntries = React.useMemo(() => {
    const taskEntries = (tasks as any[]).map((task) => ({
      id: task.id as string,
      kind: "task" as const,
      title: String(task.title || "Untitled task"),
      subtitle: task.description ? String(task.description) : "",
      dateKey: toYmd(task.dueDate),
      raw: task,
    }));
    const noteEntries = (notes as any[]).map((note) => ({
      id: note.id as string,
      kind: "note" as const,
      title: String(note.title || "Untitled note"),
      subtitle: note.content ? String(note.content) : "",
      dateKey: toYmd(note.createdAt),
      raw: note,
    }));
    const journalCalendarEntries = (journalEntries as any[]).map((entry) => ({
      id: entry.id as string,
      kind: "journal" as const,
      title: String(entry.title || "Journal entry"),
      subtitle: entry.content ? String(entry.content) : "",
      dateKey: toYmd(entry.entryDate),
      raw: entry,
    }));
    return [...taskEntries, ...noteEntries, ...journalCalendarEntries].filter((entry) => Boolean(entry.dateKey));
  }, [journalEntries, notes, tasks]);

  const markedDates = React.useMemo(() => {
    const marks: Record<string, any> = {};
    for (const entry of allEntries) {
      const due = entry.dateKey;
      if (!due) continue;
      const dots = new Map<string, { key: string; color: string }>(
        (marks[due]?.dots ?? []).map((dot: any) => [dot.key, dot])
      );
      if (entry.kind === "task") dots.set("task", { key: "task", color: colors.primary });
      if (entry.kind === "note") dots.set("note", { key: "note", color: "#0EA5E9" });
      if (entry.kind === "journal") dots.set("journal", { key: "journal", color: "#8B5CF6" });
      marks[due] = {
        ...(marks[due] || {}),
        dots: Array.from(dots.values()),
      };
    }
    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] || {}),
        selected: true,
        selectedColor: colors.primary,
      };
    }
    return marks;
  }, [allEntries, colors.primary, selectedDate]);

  const visibleEntries = React.useMemo(() => {
    const byDay = allEntries.filter((entry) => entry.dateKey === selectedDate);
    if (mode === "day" || mode === "month") return byDay;

    const selected = new Date(selectedDate);
    if (Number.isNaN(selected.getTime())) return byDay;
    const weekStart = startOfWeek(selected);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return allEntries.filter((entry) => {
      const due = entry.dateKey ? new Date(entry.dateKey) : null;
      return !!due && due >= weekStart && due <= weekEnd;
    });
  }, [allEntries, mode, selectedDate]);

  if (tasksQuery.isLoading || itemsQuery.isLoading || journalQuery.isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-muted mt-3">Loading calendar...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (tasksQuery.error || itemsQuery.error || journalQuery.error) {
    const error = tasksQuery.error || itemsQuery.error || journalQuery.error;
    return (
      <ScreenContainer>
        <View className="flex-1 p-4">
          <ErrorState
            error={error}
            onRetry={() => {
              tasksQuery.refetch();
              itemsQuery.refetch();
              journalQuery.refetch();
            }}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View className="p-4 border-b border-border">
        <View className="flex-row items-center mb-2">
          <MaterialIcons name="calendar-month" size={30} color={colors.primary} />
          <Text className="text-2xl font-bold text-foreground ml-2">Calendar</Text>
        </View>
        <View className="flex-row">
          {(["month", "week", "day"] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setMode(item)}
              style={{
                marginRight: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: mode === item ? colors.primary : colors.surface,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: mode === item ? "white" : colors.foreground, fontWeight: "600", fontSize: 12 }}>
                {item.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Calendar
        markingType="multi-dot"
        markedDates={markedDates}
        onDayPress={(day) => setSelectedDate(day.dateString)}
        theme={{
          calendarBackground: colors.background,
          dayTextColor: colors.foreground,
          monthTextColor: colors.foreground,
          textDisabledColor: colors.muted,
          selectedDayBackgroundColor: colors.primary,
          selectedDayTextColor: "white",
          todayTextColor: colors.primary,
          arrowColor: colors.primary,
        }}
      />

      <View className="px-4 pt-3 pb-2">
        <Text className="text-foreground font-semibold">
          {mode === "week" ? "Tasks This Week" : `Tasks on ${selectedDate || "Selected Date"}`}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 pb-6">
        {visibleEntries.length === 0 ? (
          <View className="mt-6 items-center">
            <MaterialIcons name="event-busy" size={52} color={colors.muted} />
            <Text className="text-muted mt-3">No entries for this period</Text>
          </View>
        ) : (
          visibleEntries.map((entry) => (
            <Pressable
              key={`${entry.kind}-${entry.id}`}
              onPress={() => {
                if (entry.kind === "task") {
                  router.push({ pathname: "/(app)/(tabs)/actions", params: { taskId: entry.id } } as any);
                  return;
                }
                if (entry.kind === "note") {
                  router.push(`/(app)/item/${entry.id}` as any);
                  return;
                }
                router.push({ pathname: "/(app)/(tabs)/journal", params: { openEntryId: entry.id } } as any);
              }}
              className="bg-surface border border-border rounded-lg p-3 mb-3"
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-foreground font-semibold" style={{ flex: 1 }}>
                  {entry.title}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color:
                      entry.kind === "task" ? colors.primary : entry.kind === "note" ? "#0EA5E9" : "#8B5CF6",
                  }}
                >
                  {entry.kind.toUpperCase()}
                </Text>
              </View>
              {entry.subtitle ? <Text className="text-muted mt-1">{entry.subtitle}</Text> : null}
              <Text className="text-muted text-xs mt-2">{entry.dateKey}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
