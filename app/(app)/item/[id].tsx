import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";

import { ScreenContainer } from "@/components/screen-container";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function ItemDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [didHydrateForm, setDidHydrateForm] = React.useState(false);
  const [extractingAttachmentId, setExtractingAttachmentId] = React.useState<string | null>(null);

  const utils = trpc.useUtils();
  const itemQuery = trpc.items.getWithTags.useQuery(
    { id: id || "" },
    {
      enabled: Boolean(id),
    }
  );
  const updateItem = trpc.items.update.useMutation();
  const attachmentsQuery = trpc.attachments.list.useQuery(
    { itemId: id || "", limit: 20 },
    { enabled: Boolean(id) }
  );
  const extractText = trpc.attachments.extractText.useMutation();
  const listTags = trpc.tags.list.useQuery({ limit: 200 });
  const createTag = trpc.tags.create.useMutation();
  const addTagToItem = trpc.tags.addToItem.useMutation();
  const removeTagFromItem = trpc.tags.removeFromItem.useMutation();

  React.useEffect(() => {
    if (!id) {
      Alert.alert("Not Found", "Item id is missing.");
      router.back();
      return;
    }
    if (itemQuery.error) {
      console.error("[Item/Detail] Failed loading item:", itemQuery.error);
      Alert.alert("Error", "Failed to load item.");
      return;
    }
    if (itemQuery.isFetched && !itemQuery.data) {
      Alert.alert("Not Found", "Item was not found.");
      router.back();
      return;
    }
    if (itemQuery.data && !didHydrateForm) {
      setTitle(itemQuery.data.title ?? "");
      setContent(itemQuery.data.content ?? "");
      setTagsInput((itemQuery.data.tags ?? []).map((tag) => tag.name).join(", "));
      setDidHydrateForm(true);
      console.log("[Item/Detail] Loaded item:", itemQuery.data.id);
    }
  }, [didHydrateForm, id, itemQuery.data, itemQuery.error, itemQuery.isFetched, router]);

  const handleSave = async () => {
    if (!id || !itemQuery.data) return;
    if (!title.trim()) {
      Alert.alert("Validation", "Title is required.");
      return;
    }

    try {
      setIsSaving(true);
      const nextTagNames = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const nextTagNamesSet = new Set(nextTagNames.map((tag) => tag.toLowerCase()));
      const currentTags = itemQuery.data.tags ?? [];
      const currentTagNamesSet = new Set(currentTags.map((tag) => tag.name.toLowerCase()));

      await updateItem.mutateAsync({
        title: title.trim(),
        content: content.trim() || title.trim(),
        id,
      });

      const allTags = listTags.data ?? [];
      const tagIdByName = new Map(allTags.map((tag) => [tag.name.toLowerCase(), tag.id]));

      for (const tagName of nextTagNames) {
        const key = tagName.toLowerCase();
        if (currentTagNamesSet.has(key)) continue;

        let tagId = tagIdByName.get(key);
        if (!tagId) {
          const created = await createTag.mutateAsync({ name: tagName });
          tagId = created?.id;
          if (tagId) {
            tagIdByName.set(key, tagId);
          }
        }

        if (tagId) {
          await addTagToItem.mutateAsync({ itemId: id, tagId });
        }
      }

      for (const existingTag of currentTags) {
        const key = existingTag.name.toLowerCase();
        if (nextTagNamesSet.has(key)) continue;
        await removeTagFromItem.mutateAsync({ itemId: id, tagId: existingTag.id });
      }

      await Promise.all([
        utils.items.getWithTags.invalidate({ id }),
        utils.items.list.invalidate(),
        utils.tags.list.invalidate(),
      ]);

      console.log("[Item/Detail] Item updated:", id);
      Alert.alert("Saved", "Item updated successfully.");
      router.back();
    } catch (error) {
      console.error("[Item/Detail] Failed saving item:", error);
      Alert.alert("Error", "Failed to save item.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExtractText = async (attachmentId: string) => {
    try {
      setExtractingAttachmentId(attachmentId);
      const result = await extractText.mutateAsync({ attachmentId });
      if (!result?.text) {
        Alert.alert("No Text Found", "Could not detect readable text in this image.");
        return;
      }

      setContent((prev) => {
        const trimmedPrev = prev.trim();
        const section = `\n\n[Extracted Text]\n${result.text}`.trim();
        return trimmedPrev ? `${trimmedPrev}\n\n${section}` : section;
      });
      Alert.alert("Text Extracted", "Extracted text was inserted into content.");
    } catch (error: any) {
      console.error("[Item/Detail] OCR extraction failed:", error);
      const message = error?.message || "Failed to extract text from image.";
      Alert.alert("Error", message);
    } finally {
      setExtractingAttachmentId(null);
    }
  };

  if (itemQuery.isLoading) {
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

        <Text className="text-sm font-semibold text-foreground mb-2 mt-4">Image Attachments</Text>
        {attachmentsQuery.isLoading ? (
          <View className="py-2">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : attachmentsQuery.data && attachmentsQuery.data.length > 0 ? (
          <View style={{ gap: 10, marginBottom: 14 }}>
            {attachmentsQuery.data.map((attachment) => {
              const isExtracting = extractingAttachmentId === attachment.id && extractText.isPending;
              return (
                <View
                  key={attachment.id}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: colors.surface,
                  }}
                >
                  <ExpoImage
                    source={{ uri: attachment.fileUrl }}
                    contentFit="cover"
                    style={{ width: "100%", height: 160, borderRadius: 8 }}
                  />
                  <Pressable
                    onPress={() => handleExtractText(attachment.id)}
                    disabled={isExtracting}
                    style={{
                      marginTop: 10,
                      borderRadius: 8,
                      paddingVertical: 10,
                      alignItems: "center",
                      backgroundColor: colors.primary,
                      opacity: isExtracting ? 0.75 : 1,
                    }}
                  >
                    {isExtracting ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={{ color: "white", fontWeight: "700" }}>Extract Text</Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={{ color: colors.muted, marginBottom: 14 }}>No images attached to this item.</Text>
        )}

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
          disabled={isSaving}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            opacity: isSaving ? 0.7 : 1,
          }}
        >
          {isSaving ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "700" }}>Save</Text>}
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
