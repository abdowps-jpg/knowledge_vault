import React from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function WidgetQuickAddScreen() {
  const colors = useColors();
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");

  const createTask = trpc.tasks.create.useMutation();

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Validation", "Task title is required.");
      return;
    }
    try {
      const task = await createTask.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        priority: "medium",
      });
      console.log("[Widgets/QuickAdd] Task created:", task?.id);
      router.replace("/(app)/(tabs)/actions");
    } catch (error) {
      console.error("[Widgets/QuickAdd] Failed creating task:", error);
      Alert.alert("Error", "Failed to create task.");
    }
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <View className="px-4 py-4 border-b border-border">
        <Text className="text-xl font-bold text-foreground">Widget Quick Add</Text>
        <Text className="text-sm text-muted mt-1">Fast capture screen for Home Screen widgets.</Text>
      </View>

      <View className="p-4">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Task title"
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
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Description (optional)"
          placeholderTextColor={colors.muted}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.foreground,
            backgroundColor: colors.surface,
            marginBottom: 16,
          }}
        />

        <Pressable
          onPress={handleCreate}
          disabled={createTask.isPending}
          style={{
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 14,
            backgroundColor: colors.primary,
            opacity: createTask.isPending ? 0.75 : 1,
          }}
        >
          {createTask.isPending ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "700" }}>Create Task</Text>}
        </Pressable>
      </View>
    </ScreenContainer>
  );
}
