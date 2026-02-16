import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

interface AddTaskModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddTaskModal({ visible, onClose, onSuccess }: AddTaskModalProps) {
  const colors = useColors();

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [priority, setPriority] = React.useState<"low" | "medium" | "high">("medium");
  const [titleError, setTitleError] = React.useState("");

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      resetForm();
      onSuccess();
      onClose();
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("medium");
    setTitleError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setTitleError("Title is required");
      return;
    }

    setTitleError("");
    createTask.mutate({
      title: cleanTitle,
      description: description.trim() || undefined,
      dueDate: dueDate.trim() || undefined,
      priority,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="rounded-t-3xl p-6 max-h-3/4" style={{ backgroundColor: colors.surface }}>
          <Text className="text-xl font-bold text-foreground mb-4">Add New Task</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <TextInput
              placeholder="Task title *"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                if (titleError) setTitleError("");
              }}
              className="bg-background border border-border rounded-lg p-3 text-foreground mb-1"
              style={{ color: colors.foreground }}
            />
            {titleError ? (
              <Text className="text-xs mb-3" style={{ color: colors.error }}>
                {titleError}
              </Text>
            ) : (
              <View className="mb-3" />
            )}

            <TextInput
              placeholder="Description (optional)"
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
              style={{ color: colors.foreground }}
            />

            <TextInput
              placeholder="Due date (YYYY-MM-DD, optional)"
              placeholderTextColor={colors.muted}
              value={dueDate}
              onChangeText={setDueDate}
              className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
              style={{ color: colors.foreground }}
            />

            <View className="mb-4">
              <Text className="text-sm font-semibold text-foreground mb-2">Priority</Text>
              <View className="flex-row gap-2">
                {(["low", "medium", "high"] as const).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setPriority(value)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: priority === value ? colors.primary : colors.background,
                      borderColor: colors.border,
                      borderWidth: 1,
                    }}
                  >
                    <Text
                      style={{
                        textAlign: "center",
                        color: priority === value ? "white" : colors.foreground,
                        fontWeight: "600",
                        fontSize: 12,
                        textTransform: "capitalize",
                      }}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>

          <View className="flex-row gap-3 mt-4">
            <Pressable onPress={handleClose} style={{ flex: 1 }}>
              <View className="bg-border rounded-lg py-3 items-center">
                <Text className="text-foreground font-semibold">Cancel</Text>
              </View>
            </Pressable>

            <Pressable onPress={handleSave} disabled={createTask.isPending} style={{ flex: 1 }}>
              <View className="bg-primary rounded-lg py-3 items-center">
                {createTask.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold">Save</Text>
                )}
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
