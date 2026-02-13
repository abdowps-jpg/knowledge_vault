import React, { useState } from "react";
import { FlatList, Text, View, Pressable, RefreshControl, Alert, Modal, TextInput, ScrollView } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import { useActions } from "@/lib/context/actions-context";
import { Item, ItemType } from "@/lib/db/schema";
import * as Haptics from "expo-haptics";

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(date: Date): string {
  const now = new Date();
  const itemDate = new Date(date);
  const diffMs = now.getTime() - itemDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return itemDate.toLocaleDateString();
}

function getPriorityColor(priority: string, colors: any): string {
  switch (priority) {
    case "high":
      return colors.error;
    case "medium":
      return colors.warning;
    case "low":
      return colors.success;
    default:
      return colors.muted;
  }
}

function getDueDateStatus(dueDate: Date | undefined): { label: string; color: string } {
  if (!dueDate) return { label: "No due date", color: "muted" };

  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: "error" };
  if (diffDays === 0) return { label: "Due today", color: "warning" };
  if (diffDays === 1) return { label: "Due tomorrow", color: "warning" };
  if (diffDays <= 7) return { label: `Due in ${diffDays}d`, color: "success" };
  return { label: `Due in ${diffDays}d`, color: "muted" };
}

// ============================================================================
// Task Item Component
// ============================================================================

interface TaskItemProps {
  task: Item;
  onToggleComplete: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
}

function TaskItem({ task, onToggleComplete, onDelete }: TaskItemProps) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const isCompleted = (task as any).isCompleted;
  const dueDate = (task as any).dueDate ? new Date((task as any).dueDate) : undefined;
  const priority = (task as any).priority || "medium";
  const dueDateStatus = getDueDateStatus(dueDate);

  const handleToggleComplete = async () => {
    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await onToggleComplete(task.id);
    } catch (error) {
      console.error("Error toggling task:", error);
      Alert.alert("Error", "Failed to update task");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert("Delete Task", "Are you sure you want to delete this task?", [
      { text: "Cancel", onPress: () => {} },
      {
        text: "Delete",
        onPress: async () => {
          try {
            setLoading(true);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await onDelete(task.id);
          } catch (error) {
            console.error("Error deleting task:", error);
            Alert.alert("Error", "Failed to delete task");
          } finally {
            setLoading(false);
          }
        },
        style: "destructive",
      },
    ]);
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        opacity: isCompleted ? 0.6 : 1,
      }}
    >
      <View className="flex-row items-start gap-3">
        {/* Checkbox */}
        <Pressable
          onPress={handleToggleComplete}
          disabled={loading}
          style={({ pressed }) => [
            {
              opacity: pressed || loading ? 0.6 : 1,
              marginTop: 2,
            },
          ]}
        >
          <MaterialIcons
            name={isCompleted ? "check-circle" : "radio-button-unchecked"}
            size={24}
            color={isCompleted ? colors.success : colors.muted}
          />
        </Pressable>

        {/* Content */}
        <View className="flex-1">
          <Text
            className="text-base font-semibold text-foreground"
            numberOfLines={1}
            style={{ textDecorationLine: isCompleted ? "line-through" : "none" }}
          >
            {task.title}
          </Text>

          {/* Metadata */}
          <View className="flex-row items-center gap-2 mt-2 flex-wrap">
            {/* Priority Badge */}
            <View
              style={{
                backgroundColor: getPriorityColor(priority, colors),
                borderRadius: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text style={{ color: "white", fontSize: 10, fontWeight: "600" }}>
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
              </Text>
            </View>

            {/* Due Date */}
            {dueDate && (
              <Text
                style={{
                  color: getPriorityColor(dueDateStatus.color, colors),
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                {dueDateStatus.label}
              </Text>
            )}

            {/* Created Date */}
            <Text className="text-xs text-muted">{formatDate(task.createdAt)}</Text>
          </View>
        </View>

        {/* Delete Button */}
        <Pressable
          onPress={handleDelete}
          disabled={loading}
          style={({ pressed }) => [{ opacity: pressed || loading ? 0.6 : 0.8, padding: 8 }]}
        >
          <MaterialIcons name="delete" size={20} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

// ============================================================================
// Actions Screen
// ============================================================================

export default function ActionsScreen() {
  const colors = useColors();
  const {
    filteredTasks,
    loading,
    filters,
    setStatus,
    loadTasks,
    completeTask,
    deleteTask,
    getTaskStats,
  } = useActions();
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const stats = getTaskStats();

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      {/* Header */}
      <View className="px-4 py-4 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Actions</Text>
        <View className="flex-row gap-4 mt-2">
          <View>
            <Text className="text-xs text-muted">Total</Text>
            <Text className="text-lg font-bold text-foreground">{stats.total}</Text>
          </View>
          <View>
            <Text className="text-xs text-muted">Completed</Text>
            <Text className="text-lg font-bold text-success">{stats.completed}</Text>
          </View>
          <View>
            <Text className="text-xs text-muted">Overdue</Text>
            <Text className="text-lg font-bold text-error">{stats.overdue}</Text>
          </View>
        </View>
      </View>

      {/* Status Filter */}
      <View className="px-4 py-3 border-b border-border gap-2">
        <View className="flex-row gap-2">
          {[
            { label: "Active", value: "active" },
            { label: "Completed", value: "completed" },
            { label: "Overdue", value: "overdue" },
          ].map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setStatus(option.value as any)}
              style={({ pressed }) => [
                {
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: filters.status === option.value ? colors.primary : colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 20,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                },
              ]}
            >
              <Text
                style={{
                  color: filters.status === option.value ? "white" : colors.foreground,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Tasks List */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <MaterialIcons name="hourglass-empty" size={48} color={colors.muted} />
          <Text className="text-muted mt-4">Loading...</Text>
        </View>
      ) : filteredTasks.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3">
          <MaterialIcons name="check-circle" size={64} color={colors.muted} />
          <Text className="text-lg font-semibold text-foreground">
            {filters.status === "completed" ? "No Completed Tasks" : "No Active Tasks"}
          </Text>
          <Text className="text-sm text-muted text-center px-4 max-w-xs">
            {filters.status === "completed"
              ? "Complete some tasks to see them here"
              : "Convert items from Inbox to create tasks"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TaskItem
              task={item}
              onToggleComplete={completeTask}
              onDelete={deleteTask}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={{ flexGrow: 1 }}
          scrollEnabled={filteredTasks.length > 0}
        />
      )}

      {/* FAB Button */}
      <Pressable
        onPress={() => setShowCreateModal(true)}
        style={({ pressed }) => [
          {
            position: "absolute",
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.primary,
            justifyContent: "center",
            alignItems: "center",
            opacity: pressed ? 0.8 : 1,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          },
        ]}
      >
        <MaterialIcons name="add" size={28} color="white" />
      </Pressable>

      {/* Create Task Modal */}
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
                numberOfLines={4}
                className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
                style={{ color: colors.foreground }}
              />
              <View className="mb-4">
                <Text className="text-sm font-semibold text-foreground mb-2">Priority</Text>
                <View className="flex-row gap-2">
                  {["low", "medium", "high"].map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => setNewTaskPriority(p)}
                      style={({ pressed }) => [
                        {
                          flex: 1,
                          paddingVertical: 8,
                          borderRadius: 8,
                          backgroundColor: newTaskPriority === p ? colors.primary : colors.background,
                          borderColor: colors.border,
                          borderWidth: 1,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
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
              <Pressable
                onPress={() => setShowCreateModal(false)}
                style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.7 : 1 }]}
              >
                <View className="bg-border rounded-lg py-3 items-center">
                  <Text className="text-foreground font-semibold">Cancel</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (newTaskTitle.trim()) {
                    setShowCreateModal(false);
                    setNewTaskTitle("");
                    setNewTaskDescription("");
                    setNewTaskPriority("medium");
                  } else {
                    Alert.alert("Error", "Please enter a task title");
                  }
                }}
                style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.7 : 1 }]}
              >
                <View className="bg-primary rounded-lg py-3 items-center">
                  <Text className="text-white font-semibold">Create</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
