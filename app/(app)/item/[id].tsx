import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useColors } from "@/hooks/use-colors";
import { getItemById, updateItem } from "@/lib/db/storage";

export default function ItemDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");

  React.useEffect(() => {
    if (!id) return;
    setLoading(true);
    getItemById(id)
      .then((item) => {
        if (!item) {
          Alert.alert("Not Found", "Item was not found.");
          router.back();
          return;
        }
        setTitle(item.title ?? "");
        setContent(item.content ?? "");
        setTagsInput((item.tags ?? []).join(", "));
        console.log("[Item/Detail] Loaded item:", item.id);
      })
      .catch((error) => {
        console.error("[Item/Detail] Failed loading item:", error);
        Alert.alert("Error", "Failed to load item.");
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleSave = async () => {
    if (!id) return;
    if (!title.trim()) {
      Alert.alert("Validation", "Title is required.");
      return;
    }

    try {
      setSaving(true);
      const parsedTags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      await updateItem(id, {
        title: title.trim(),
        content: content.trim() || title.trim(),
        tags: parsedTags as any,
      });
      console.log("[Item/Detail] Item updated:", id);
      Alert.alert("Saved", "Item updated successfully.");
      router.back();
    } catch (error) {
      console.error("[Item/Detail] Failed saving item:", error);
      Alert.alert("Error", "Failed to save item.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <View className="px-4 py-4 border-b border-border flex-row items-center justify-between">
        <Text className="text-xl font-bold text-foreground">Item Details</Text>
        <Pressable onPress={() => router.back()}>
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
            marginBottom: 14,
          }}
        />

        <Text className="text-sm font-semibold text-foreground mb-2">Content</Text>
        <RichTextEditor value={content} onChange={setContent} placeholder="Write content..." minHeight={220} />

        <Text className="text-sm font-semibold text-foreground mb-2 mt-4">Tags (comma separated)</Text>
        <TextInput
          value={tagsInput}
          onChangeText={setTagsInput}
          placeholder="tag1, tag2"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            color: colors.foreground,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 20,
          }}
        />

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "700" }}>Save</Text>}
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
