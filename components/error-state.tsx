import React from "react";
import { Pressable, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";

interface ErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const colors = useColors();

  return (
    <View className="items-center justify-center mt-8 px-6">
      <MaterialIcons name="error-outline" size={64} color={colors.error} />
      <Text className="text-center mt-4 font-semibold" style={{ color: colors.error }}>
        Failed to load data
      </Text>
      <Text className="text-muted text-center mt-2 text-sm">{getErrorMessage(error)}</Text>
      <Pressable
        onPress={onRetry}
        className="mt-4 px-4 py-2 rounded-lg border"
        style={{ borderColor: colors.error }}
      >
        <Text style={{ color: colors.error, fontWeight: "600" }}>Retry</Text>
      </Pressable>
    </View>
  );
}
