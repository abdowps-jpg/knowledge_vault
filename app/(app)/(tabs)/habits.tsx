import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function HabitsScreen() {
  const colors = useColors();
  const [newHabitName, setNewHabitName] = React.useState("");

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

  const handleCreate = async () => {
    if (!newHabitName.trim()) {
      Alert.alert("Validation", "Habit name is required.");
      return;
    }
    try {
      await createHabit.mutateAsync({ name: newHabitName.trim() });
    } catch (error) {
      console.error("[Habits] Failed creating habit:", error);
      Alert.alert("Error", "Failed to create habit.");
    }
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <View className="px-4 py-4 border-b border-border">
        <Text className="text-xl font-bold text-foreground">Habits Tracker</Text>
        <Text className="text-sm text-muted mt-1">Build consistency one day at a time.</Text>
      </View>

      <View className="px-4 pt-4">
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
        {habitsQuery.isLoading ? (
          <View className="items-center mt-8">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : habitsQuery.data && habitsQuery.data.length > 0 ? (
          habitsQuery.data.map((habit) => (
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
              </View>
              <Pressable
                onPress={() => toggleHabit.mutate({ id: habit.id })}
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
          ))
        ) : (
          <Text style={{ color: colors.muted, marginTop: 8 }}>No habits yet. Add your first one above.</Text>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
