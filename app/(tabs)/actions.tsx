import React from "react";
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
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type FilterTab = "all" | "today" | "completed" | "high";

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

export default function ActionsScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = React.useState<FilterTab>("all");
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [newTaskTitle, setNewTaskTitle] = React.useState("");
  const [newTaskDescription, setNewTaskDescription] = React.useState("");
  const [newTaskDueDate, setNewTaskDueDate] = React.useState("");
  const [newTaskPriority, setNewTaskPriority] = React.useState<"low" | "medium" | "high">("medium");
  const [togglingTaskId, setTogglingTaskId] = React.useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = React.useState<string | null>(null);

  const { data: tasks = [], isLoading, error, refetch } = trpc.tasks.list.useQuery({
    sortOrder: "asc",
    limit: 200,
  });

  React.useEffect(() => {
    if (error) {
      console.error("Actions query failed:", error);
    }
  }, [error]);

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      setShowCreateModal(false);
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskDueDate("");
      setNewTaskPriority("medium");
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

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
    },
    onSettled: () => {
      setDeletingTaskId(null);
    },
  });

  const filteredAndSortedTasks = React.useMemo(() => {
    const filtered = (tasks as any[]).filter((task) => {
      const dueDate = toDate(task.dueDate);
      const isCompleted = Boolean(task.isCompleted);
      const priority = (task.priority || "medium") as string;

      if (activeTab === "today") return isToday(dueDate) && !isCompleted;
      if (activeTab === "completed") return isCompleted;
      if (activeTab === "high") return priority === "high" && !isCompleted;
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
  }, [tasks, activeTab]);

  const handleCreateTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) {
      Alert.alert("Error", "Please enter a task title");
      return;
    }

    try {
      await createTask.mutateAsync({
        title,
        description: newTaskDescription.trim() || undefined,
        dueDate: newTaskDueDate.trim() || undefined,
        priority: newTaskPriority,
      });
    } catch (err) {
      console.error("Failed to create task:", err);
      Alert.alert("Error", "Failed to create task");
    }
  };

  const handleToggleTask = async (id: string) => {
    try {
      setTogglingTaskId(id);
      await toggleTask.mutateAsync({ id });
    } catch (err) {
      console.error("Failed to toggle task:", err);
      Alert.alert("Error", "Failed to update task");
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
            await deleteTask.mutateAsync({ id });
          } catch (err) {
            console.error("Failed to delete task:", err);
            Alert.alert("Error", "Failed to delete task");
          }
        },
      },
    ]);
  };

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
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View className="flex-row">
          {[
            { label: "All", value: "all" as const },
            { label: "Today", value: "today" as const },
            { label: "Completed", value: "completed" as const },
            { label: "High Priority", value: "high" as const },
          ].map((tab) => (
            <Pressable
              key={tab.value}
              onPress={() => setActiveTab(tab.value)}
              className="mr-2 px-3 py-1 rounded-full border"
              style={{
                borderColor: colors.border,
                backgroundColor: activeTab === tab.value ? colors.primary : colors.surface,
              }}
            >
              <Text style={{ color: activeTab === tab.value ? "white" : colors.foreground, fontSize: 12 }}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {isLoading ? (
          <View className="items-center mt-8">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-muted mt-4">Loading tasks...</Text>
          </View>
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : filteredAndSortedTasks.length === 0 ? (
          <View className="items-center justify-center mt-8">
            <MaterialIcons name="assignment-turned-in" size={64} color={colors.muted} />
            <Text className="text-muted text-center mt-4">No tasks found</Text>
            <Text className="text-muted text-center mt-2 text-sm">
              Tap + to create your first task
            </Text>
          </View>
        ) : (
          filteredAndSortedTasks.map((task: any) => {
            const completed = Boolean(task.isCompleted);
            const dueDate = toDate(task.dueDate);
            const priority = task.priority || "medium";
            const isToggling = toggleTask.isPending && togglingTaskId === task.id;
            const isDeleting = deleteTask.isPending && deletingTaskId === task.id;

            return (
              <View
                key={task.id}
                className="bg-surface p-4 rounded-lg mb-3 border border-border"
                style={{ opacity: completed ? 0.6 : 1 }}
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
          })
        )}
      </ScrollView>

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
              <TextInput
                placeholder="Task title"
                placeholderTextColor={colors.muted}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
                style={{ color: colors.foreground }}
              />
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
              <TextInput
                placeholder="Due date (YYYY-MM-DD, optional)"
                placeholderTextColor={colors.muted}
                value={newTaskDueDate}
                onChangeText={setNewTaskDueDate}
                className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
                style={{ color: colors.foreground }}
              />
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
    </ScreenContainer>
  );
}
