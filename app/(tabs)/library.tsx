import React from "react";
import { Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";

export default function LibraryScreen() {
  const colors = useColors();

  return (
    <ScreenContainer className="items-center justify-center">
      <MaterialIcons name="library-books" size={64} color={colors.primary} />
      <Text className="text-2xl font-bold text-foreground mt-4">Library</Text>
      <Text className="text-muted text-center mt-2 px-4">Coming soon...</Text>
    </ScreenContainer>
  );
}
