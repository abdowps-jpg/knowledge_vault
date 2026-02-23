import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

function parseMilestones(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function GoalsScreen() {
  const colors = useColors();
  const goalsQuery = trpc.goals.list.useQuery();
  const tasksQuery = trpc.tasks.list.useInfiniteQuery(
    { sortOrder: "asc", limit: 100 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  const createGoal = trpc.goals.create.useMutation({
    onSuccess: () => goalsQuery.refetch().catch(() => undefined),
  });
  const toggleMilestone = trpc.goals.toggleMilestone.useMutation({
    onSuccess: () => goalsQuery.refetch().catch(() => undefined),
  });
  const linkTask = trpc.goals.linkTask.useMutation({
    onSuccess: () => goalsQuery.refetch().catch(() => undefined),
  });

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [milestonesText, setMilestonesText] = React.useState("");
  const [expandedGoalId, setExpandedGoalId] = React.useState<string | null>(null);

  const availableTasks = React.useMemo(
    () => tasksQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [tasksQuery.data]
  );

  const handleCreateGoal = async () => {
    if (!title.trim()) {
      Alert.alert("Validation", "Goal title is required.");
      return;
    }
    try {
      await createGoal.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        milestones: parseMilestones(milestonesText),
      });
      setTitle("");
      setDescription("");
      setMilestonesText("");
    } catch (error) {
      console.error("[Goals] Failed creating goal:", error);
      Alert.alert("Error", "Failed to create goal.");
    }
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <ScrollView className="flex-1 p-4">
        <Text className="text-2xl font-bold text-foreground mb-2">Goals & Milestones</Text>

        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.surface }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Goal title"
            placeholderTextColor={colors.muted}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.foreground,
              backgroundColor: colors.background,
              marginBottom: 10,
            }}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Goal description"
            placeholderTextColor={colors.muted}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.foreground,
              backgroundColor: colors.background,
              marginBottom: 10,
            }}
          />
          <TextInput
            value={milestonesText}
            onChangeText={setMilestonesText}
            multiline
            placeholder={"Milestones (one per line)\nDefine scope\nBuild MVP\nLaunch beta"}
            placeholderTextColor={colors.muted}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.foreground,
              backgroundColor: colors.background,
              marginBottom: 12,
              minHeight: 100,
              textAlignVertical: "top",
            }}
          />
          <Pressable
            onPress={handleCreateGoal}
            disabled={createGoal.isPending}
            style={{ borderRadius: 10, backgroundColor: colors.primary, paddingVertical: 12, alignItems: "center" }}
          >
            {createGoal.isPending ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "700" }}>Create Goal</Text>}
          </Pressable>
        </View>

        <View style={{ marginTop: 16 }}>
          {goalsQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            (goalsQuery.data ?? []).map((goal) => (
              <View
                key={goal.id}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: colors.surface,
                  marginBottom: 10,
                }}
              >
                <Pressable onPress={() => setExpandedGoalId((prev) => (prev === goal.id ? null : goal.id))}>
                  <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16 }}>{goal.title}</Text>
                  {!!goal.description ? <Text style={{ color: colors.muted, marginTop: 4 }}>{goal.description}</Text> : null}
                  <Text style={{ color: colors.primary, marginTop: 6, fontWeight: "700" }}>Progress: {goal.progress}%</Text>
                </Pressable>

                {expandedGoalId === goal.id ? (
                  <View style={{ marginTop: 10 }}>
                    {goal.milestones.map((milestone: any) => (
                      <View key={milestone.id} style={{ marginBottom: 8, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ color: colors.foreground, fontWeight: "600", flex: 1 }}>{milestone.title}</Text>
                          <Pressable onPress={() => toggleMilestone.mutate({ milestoneId: milestone.id })}>
                            <Text style={{ color: colors.primary, fontWeight: "700" }}>
                              {milestone.effectiveCompleted ? "Completed" : "Mark Done"}
                            </Text>
                          </Pressable>
                        </View>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                          {availableTasks.slice(0, 6).map((task: any) => (
                            <Pressable
                              key={`${milestone.id}-${task.id}`}
                              onPress={() => linkTask.mutate({ milestoneId: milestone.id, taskId: task.id })}
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: colors.border,
                                marginRight: 6,
                                marginBottom: 6,
                              }}
                            >
                              <Text style={{ color: colors.muted, fontSize: 12 }}>{task.title}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
