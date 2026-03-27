import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

const FEATURES = [
  "Smart Tags Suggestion",
  "Smart Categorization",
  "Summary Generation",
  "Related Items",
  "Smart Search",
  "Quick Actions",
];

export default function AIFeaturesScreen() {
  const router = useRouter();
  const colors = useColors();

  return (
    <ScreenContainer>
      <View className="px-4 py-4 border-b border-border flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3">
          <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">AI Features</Text>
      </View>

      <ScrollView className="flex-1 p-4">
        {FEATURES.map((feature) => (
          <View key={feature} className="bg-surface border border-border rounded-xl p-4 mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-foreground font-semibold">{feature}</Text>
              <MaterialIcons name="lock" size={18} color={colors.muted} />
            </View>
            <Text className="text-muted text-sm mt-2">Coming soon in a future update.</Text>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
