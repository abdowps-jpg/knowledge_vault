import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const HABITS_META_KEY = "habits_meta_v1";
const HABITS_HISTORY_KEY = "habits_history_v1";

type HabitMeta = {
  category: string;
  targetPerWeek: number;
};

function dateToYmd(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: Date): Date {
  const clone = new Date(date);
  const day = clone.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setDate(clone.getDate() + diff);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

export default function HabitsScreen() {
  const colors = useColors();
  const [newHabitName, setNewHabitName] = React.useState("");
  const [newHabitCategory, setNewHabitCategory] = React.useState("Health");
  const [newHabitTargetPerWeek, setNewHabitTargetPerWeek] = React.useState("5");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "pending" | "done">("all");
  const [metaByHabitId, setMetaByHabitId] = React.useState<Record<string, HabitMeta>>({});
  const [historyByHabitId, setHistoryByHabitId] = React.useState<Record<string, string[]>>({});

  const habitsQuery = trpc.habits.list.useQuery();
  const createHabit = trpc.habits.create.useMutation({
    onSuccess: () => {
      habitsQuery.refetch().catch(() => undefined);
      setNewHabitName("");
    },
  });
  const toggleHabit = trpc.habits.toggleToday.useMutation({
    onSuccess: () => {
      habitsQuery.refetch().catch(() => undefined);
    },
  });

  React.useEffect(() => {
    AsyncStorage.getItem(HABITS_META_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as Record<string, HabitMeta>;
        if (parsed && typeof parsed === "object") setMetaByHabitId(parsed);
      })
      .catch((error) => console.error("[Habits] Failed loading metadata:", error));
    AsyncStorage.getItem(HABITS_HISTORY_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as Record<string, string[]>;
        if (parsed && typeof parsed === "object") setHistoryByHabitId(parsed);
      })
      .catch((error) => console.error("[Habits] Failed loading history:", error));
  }, []);

  React.useEffect(() => {
    AsyncStorage.setItem(HABITS_META_KEY, JSON.stringify(metaByHabitId)).catch((error) =>
      console.error("[Habits] Failed saving metadata:", error)
    );
  }, [metaByHabitId]);

  React.useEffect(() => {
    AsyncStorage.setItem(HABITS_HISTORY_KEY, JSON.stringify(historyByHabitId)).catch((error) =>
      console.error("[Habits] Failed saving history:", error)
    );
  }, [historyByHabitId]);

  const handleCreate = async () => {
    if (!newHabitName.trim()) {
      Alert.alert("Validation", "Habit name is required.");
      return;
    }
    const parsedTarget = Number(newHabitTargetPerWeek);
    const targetPerWeek = Number.isFinite(parsedTarget)
      ? Math.max(1, Math.min(7, Math.floor(parsedTarget)))
      : 5;
    try {
      const created = await createHabit.mutateAsync({ name: newHabitName.trim() });
      setMetaByHabitId((prev) => ({
        ...prev,
        [created.id]: {
          category: newHabitCategory.trim() || "General",
          targetPerWeek,
        },
      }));
      setNewHabitCategory("Health");
      setNewHabitTargetPerWeek("5");
    } catch (error) {
      console.error("[Habits] Failed creating habit:", error);
      Alert.alert("Error", "Failed to create habit.");
    }
  };

  const handleToggleHabit = async (habitId: string) => {
    try {
      const result = await toggleHabit.mutateAsync({ id: habitId });
      const today = dateToYmd(new Date());
      setHistoryByHabitId((prev) => {
        const current = new Set(prev[habitId] ?? []);
        if ((result as any)?.doneToday) {
          current.add(today);
        } else {
          current.delete(today);
        }
        return { ...prev, [habitId]: Array.from(current).sort() };
      });
    } catch (error) {
      console.error("[Habits] Failed toggling habit:", error);
      Alert.alert("Error", "Failed to update habit.");
    }
  };

  const habits = habitsQuery.data ?? [];
  const weekStart = React.useMemo(() => getWeekStart(new Date()), []);
  const weekStartYmd = React.useMemo(() => dateToYmd(weekStart), [weekStart]);
  const filteredHabits = React.useMemo(() => {
    return habits.filter((habit) => {
      if (statusFilter === "done") return habit.doneToday;
      if (statusFilter === "pending") return !habit.doneToday;
      return true;
    });
  }, [habits, statusFilter]);

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <View className="px-4 py-4 border-b border-border">
        <Text className="text-xl font-bold text-foreground">Habits Tracker</Text>
        <Text className="text-sm text-muted mt-1">Build consistency one day at a time.</Text>
      </View>

      <View className="px-4 pt-4">
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 10 }}>
          {[
            { label: "Exercise", category: "Health", target: "5" },
            { label: "Read 20m", category: "Learning", target: "7" },
            { label: "Meditation", category: "Mindfulness", target: "7" },
            { label: "Water 2L", category: "Health", target: "7" },
            { label: "Coding", category: "Career", target: "5" },
          ].map((preset) => (
            <Pressable
              key={preset.label}
              onPress={() => {
                setNewHabitName(preset.label);
                setNewHabitCategory(preset.category);
                setNewHabitTargetPerWeek(preset.target);
              }}
              style={{
                marginRight: 8,
                marginBottom: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={newHabitName}
          onChangeText={setNewHabitName}
          placeholder="New habit (e.g. Exercise)"
          placeholderTextColor={colors.muted}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.foreground,
            backgroundColor: colors.surface,
            marginBottom: 10,
          }}
        />
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <TextInput
            value={newHabitCategory}
            onChangeText={setNewHabitCategory}
            placeholder="Category (Health, Study...)"
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.foreground,
              backgroundColor: colors.surface,
            }}
          />
          <TextInput
            value={newHabitTargetPerWeek}
            onChangeText={setNewHabitTargetPerWeek}
            keyboardType="number-pad"
            placeholder="5"
            placeholderTextColor={colors.muted}
            style={{
              width: 90,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.foreground,
              backgroundColor: colors.surface,
              textAlign: "center",
            }}
          />
        </View>
        <Pressable
          onPress={handleCreate}
          disabled={createHabit.isPending}
          style={{
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 12,
            backgroundColor: colors.primary,
            opacity: createHabit.isPending ? 0.75 : 1,
          }}
        >
          {createHabit.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "white", fontWeight: "700" }}>Add Habit</Text>
          )}
        </Pressable>
      </View>

      <ScrollView className="flex-1 p-4">
        <View style={{ flexDirection: "row", marginBottom: 12 }}>
          {([
            { key: "all", label: "All" },
            { key: "pending", label: "Pending" },
            { key: "done", label: "Done Today" },
          ] as const).map((option) => (
            <Pressable
              key={option.key}
              onPress={() => setStatusFilter(option.key)}
              style={{
                marginRight: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: statusFilter === option.key ? colors.primary : colors.surface,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: statusFilter === option.key ? "white" : colors.foreground, fontWeight: "700", fontSize: 12 }}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {habitsQuery.isLoading ? (
          <View className="items-center mt-8">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : filteredHabits.length > 0 ? (
          filteredHabits.map((habit) => {
            const meta = metaByHabitId[habit.id] ?? { category: "General", targetPerWeek: 5 };
            const history = historyByHabitId[habit.id] ?? [];
            const completedThisWeek = history.filter((day) => day >= weekStartYmd).length;
            const weeklyProgress = Math.min(100, Math.round((completedThisWeek / Math.max(1, meta.targetPerWeek)) * 100));
            return (
            <View
              key={habit.id}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
                backgroundColor: colors.surface,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16 }}>{habit.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 4 }}>
                  🔥 {habit.streak} day streak {habit.doneToday ? "• Done today" : "• Not done yet"}
                </Text>
                <Text style={{ color: colors.muted, marginTop: 2, fontSize: 12 }}>
                  {meta.category} • Weekly: {completedThisWeek}/{meta.targetPerWeek}
                </Text>
                <View
                  style={{
                    marginTop: 8,
                    height: 6,
                    width: "100%",
                    borderRadius: 999,
                    backgroundColor: colors.border,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      width: `${weeklyProgress}%`,
                      backgroundColor: weeklyProgress >= 100 ? "#16a34a" : colors.primary,
                    }}
                  />
                </View>
              </View>
              <Pressable
                onPress={() => handleToggleHabit(habit.id)}
                disabled={toggleHabit.isPending}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  backgroundColor: habit.doneToday ? "#16a34a" : colors.primary,
                  opacity: toggleHabit.isPending ? 0.75 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>{habit.doneToday ? "Undo" : "Done"}</Text>
              </Pressable>
            </View>
            );
          })
        ) : (
          <Text style={{ color: colors.muted, marginTop: 8 }}>
            {habits.length === 0 ? "No habits yet. Add your first one above." : "No habits match the selected filter."}
          </Text>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
