import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type ItemLocation = "inbox" | "library" | "archive";

function toParamValue(value: string | string[] | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? value[0] ?? "" : value;
}

export default function ShareScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string | string[]; text?: string | string[]; url?: string | string[] }>();

  const sharedTitle = toParamValue(params.title).trim();
  const sharedText = toParamValue(params.text).trim();
  const sharedUrl = toParamValue(params.url).trim();

  const [title, setTitle] = React.useState(sharedTitle || "Shared item");
  const [content, setContent] = React.useState(sharedText);
  const [url, setUrl] = React.useState(sharedUrl);
  const [location, setLocation] = React.useState<ItemLocation>("inbox");

  const createItem = trpc.items.create.useMutation();

  const handleSave = async () => {
    try {
      const finalTitle = title.trim() || sharedTitle || sharedUrl || "Shared item";
      if (!finalTitle) {
        Alert.alert("Validation", "Title is required.");
        return;
      }

      const isLink = Boolean(url.trim());
      const created = await createItem.mutateAsync({
        type: isLink ? "link" : "note",
        title: finalTitle,
        content: content.trim() || finalTitle,
        url: isLink ? url.trim() : undefined,
        location,
      });

      console.log("[Share] Item created from shared payload:", created?.id);
      router.replace({ pathname: "/(app)/item/[id]", params: { id: created.id } });
    } catch (error) {
      console.error("[Share] Failed creating shared item:", error);
      Alert.alert("Error", "Failed to save shared item.");
    }
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <View className="px-4 py-4 border-b border-border flex-row items-center justify-between">
        <Text className="text-xl font-bold text-foreground">Create From Share</Text>
        <Pressable onPress={() => router.replace("/(app)/(tabs)")}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>Close</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 p-4">
        <Text className="text-sm font-semibold text-foreground mb-2">Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            color: colors.foreground,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 12,
          }}
        />

        <Text className="text-sm font-semibold text-foreground mb-2">URL (optional)</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://..."
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            color: colors.foreground,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 12,
          }}
        />

        <Text className="text-sm font-semibold text-foreground mb-2">Content</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="Shared text..."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={6}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            color: colors.foreground,
            paddingHorizontal: 12,
            paddingVertical: 10,
            minHeight: 120,
            textAlignVertical: "top",
            marginBottom: 16,
          }}
        />

        <Text className="text-sm font-semibold text-foreground mb-2">Save to</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
          {(["inbox", "library", "archive"] as ItemLocation[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => setLocation(option)}
              style={{
                flex: 1,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: location === option ? colors.primary : colors.surface,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  textAlign: "center",
                  color: location === option ? "white" : colors.foreground,
                  fontWeight: "700",
                  textTransform: "capitalize",
                }}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handleSave}
          disabled={createItem.isPending}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            opacity: createItem.isPending ? 0.7 : 1,
          }}
        >
          {createItem.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "white", fontWeight: "700" }}>Save Shared Item</Text>
          )}
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
