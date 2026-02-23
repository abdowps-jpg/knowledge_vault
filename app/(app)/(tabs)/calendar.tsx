import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Calendar } from "react-native-calendars";
import { MaterialIcons } from "@expo/vector-icons";

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

  const markedDates = React.useMemo(() => {
    const marks: Record<string, any> = {};
    for (const task of tasks as any[]) {
      const due = toYmd(task.dueDate);
      if (!due) continue;
      marks[due] = {
        ...(marks[due] || {}),
        marked: true,
        dotColor: colors.primary,
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
  }, [colors.primary, selectedDate, tasks]);

  const visibleTasks = React.useMemo(() => {
    const byDay = (tasks as any[]).filter((task) => toYmd(task.dueDate) === selectedDate);
    if (mode === "day" || mode === "month") return byDay;

    const selected = new Date(selectedDate);
    if (Number.isNaN(selected.getTime())) return byDay;
    const weekStart = startOfWeek(selected);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return (tasks as any[]).filter((task) => {
      const due = task.dueDate ? new Date(task.dueDate) : null;
      return !!due && due >= weekStart && due <= weekEnd;
    });
  }, [mode, selectedDate, tasks]);

  if (tasksQuery.isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-muted mt-3">Loading calendar...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (tasksQuery.error) {
    return (
      <ScreenContainer>
        <View className="flex-1 p-4">
          <ErrorState error={tasksQuery.error} onRetry={tasksQuery.refetch} />
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
        {visibleTasks.length === 0 ? (
          <View className="mt-6 items-center">
            <MaterialIcons name="event-busy" size={52} color={colors.muted} />
            <Text className="text-muted mt-3">No tasks for this period</Text>
          </View>
        ) : (
          visibleTasks.map((task: any) => (
            <View key={task.id} className="bg-surface border border-border rounded-lg p-3 mb-3">
              <Text className="text-foreground font-semibold">{task.title}</Text>
              {task.description ? <Text className="text-muted mt-1">{task.description}</Text> : null}
              <Text className="text-muted text-xs mt-2">Due: {toYmd(task.dueDate) || "No due date"}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
