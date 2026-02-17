import React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";

export default function ConflictsScreen() {
  const router = useRouter();

  return (
    <ScreenContainer>
      <View className="px-4 py-4 border-b border-border flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3">
          <MaterialIcons name="arrow-back" size={22} color="#111827" />
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">Conflict Resolution</Text>
      </View>
      <ScrollView className="flex-1 p-4">
        <View className="bg-surface border border-border rounded-xl p-4">
          <Text className="text-foreground font-semibold mb-2">Conflict Detected</Text>
          <Text className="text-muted mb-3">Choose which version to keep or merge manually.</Text>
          <View className="flex-row gap-2">
            <View className="flex-1 bg-background border border-border rounded-lg p-3">
              <Text className="text-xs text-muted mb-2">Local Version</Text>
              <Text className="text-foreground">Local content preview...</Text>
            </View>
            <View className="flex-1 bg-background border border-border rounded-lg p-3">
              <Text className="text-xs text-muted mb-2">Server Version</Text>
              <Text className="text-foreground">Server content preview...</Text>
            </View>
          </View>
          <TextInput
            placeholder="Manual merge result..."
            className="bg-background border border-border rounded-lg px-3 py-3 text-foreground mt-3"
            placeholderTextColor="#9ca3af"
            multiline
          />
          <View className="flex-row gap-2 mt-3">
            <Pressable className="flex-1 bg-border rounded-lg py-3 items-center">
              <Text className="text-foreground font-semibold">Keep Local</Text>
            </Pressable>
            <Pressable className="flex-1 bg-border rounded-lg py-3 items-center">
              <Text className="text-foreground font-semibold">Keep Server</Text>
            </Pressable>
            <Pressable className="flex-1 bg-primary rounded-lg py-3 items-center">
              <Text className="text-white font-semibold">Save Merge</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
