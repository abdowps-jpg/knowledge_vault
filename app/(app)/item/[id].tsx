import React from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";

import { ScreenContainer } from "@/components/screen-container";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useAiEnabled } from "@/hooks/use-ai-enabled";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as localStorage from "@/lib/db/storage";
import type { Item as LocalItem } from "@/lib/db/schema";
import { useInbox } from "@/lib/context/inbox-context";

export default function ItemDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [didHydrateForm, setDidHydrateForm] = React.useState(false);
  const [extractingAttachmentId, setExtractingAttachmentId] = React.useState<string | null>(null);
  const [shareEmail, setShareEmail] = React.useState("");
  const [sharePermission, setSharePermission] = React.useState<"view" | "edit">("view");
  const [commentInput, setCommentInput] = React.useState("");
  const [replyToCommentId, setReplyToCommentId] = React.useState<string | null>(null);
  const [publicPassword, setPublicPassword] = React.useState("");
  const [publicExpiryDays, setPublicExpiryDays] = React.useState("7");
  const [showPresentationMode, setShowPresentationMode] = React.useState(false);
  const [presentationIndex, setPresentationIndex] = React.useState(0);
  const [localItem, setLocalItem] = React.useState<LocalItem | null>(null);
  const [isLoadingLocalItem, setIsLoadingLocalItem] = React.useState(false);
  const { loadInboxItems, deleteItem: deleteInboxItem } = useInbox();

  const utils = trpc.useUtils();
  const itemQuery = trpc.items.getWithTags.useQuery(
    { id: id || "" },
    {
      enabled: Boolean(id),
    }
  );
  const updateItem = trpc.items.update.useMutation();
  const deleteItem = trpc.items.delete.useMutation();
  const attachmentsQuery = trpc.attachments.list.useQuery(
    { itemId: id || "", limit: 20 },
    { enabled: Boolean(id) }
  );
  const extractText = trpc.attachments.extractText.useMutation();
  const transcribeAttachment = trpc.attachments.transcribe.useMutation();
  const [transcribingId, setTranscribingId] = React.useState<string | null>(null);
  const [transcriptionByAttachment, setTranscriptionByAttachment] = React.useState<Record<string, string>>({});

  const handleTranscribe = async (attachmentId: string) => {
    try {
      setTranscribingId(attachmentId);
      const result = await transcribeAttachment.mutateAsync({ attachmentId });
      if (!result.text) {
        Alert.alert("No Speech", "Could not detect speech in this audio.");
        return;
      }
      setTranscriptionByAttachment((prev) => ({ ...prev, [attachmentId]: result.text }));
      setContent((prev) => {
        const trimmedPrev = prev.trim();
        const section = `\n\n[Audio Transcript]\n${result.text}`.trim();
        return trimmedPrev ? `${trimmedPrev}\n\n${section}` : section;
      });
    } catch (err: any) {
      console.error("[Item/Detail] Transcription failed:", err);
      Alert.alert("Error", err?.message || "Failed to transcribe audio.");
    } finally {
      setTranscribingId(null);
    }
  };
  const listTags = trpc.tags.list.useQuery({ limit: 200 });
  const createTag = trpc.tags.create.useMutation();
  const addTagToItem = trpc.tags.addToItem.useMutation();
  const removeTagFromItem = trpc.tags.removeFromItem.useMutation();
  const createShare = trpc.itemShares.create.useMutation();
  const revokeShare = trpc.itemShares.revoke.useMutation();
  const itemSharesQuery = trpc.itemShares.listForItem.useQuery(
    { itemId: id || "" },
    {
      enabled: Boolean(id) && itemQuery.data?.accessRole === "owner",
    }
  );
  const commentsQuery = trpc.itemComments.list.useQuery(
    { itemId: id || "" },
    {
      enabled: Boolean(id) && Boolean(itemQuery.data),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    }
  );
  const mentionableQuery = trpc.itemComments.listMentionable.useQuery(
    { itemId: id || "" },
    {
      enabled: Boolean(id) && Boolean(itemQuery.data),
    }
  );
  const createComment = trpc.itemComments.create.useMutation();
  const createPublicLink = trpc.publicLinks.create.useMutation();
  const listPublicLinks = trpc.publicLinks.listForItem.useQuery(
    { itemId: id || "" },
    { enabled: Boolean(id) && itemQuery.data?.accessRole === "owner" }
  );
  const revokePublicLink = trpc.publicLinks.revoke.useMutation();
  const versionsQuery = trpc.itemVersions.list.useQuery(
    { itemId: id || "", limit: 20 },
    { enabled: Boolean(id) && Boolean(itemQuery.data) }
  );
  const restoreVersion = trpc.itemVersions.restore.useMutation();
  const suggestTags = trpc.ai.suggestTags.useMutation();
  const summarizeItem = trpc.ai.summarize.useMutation();
  const relatedItems = trpc.ai.relatedItems.useMutation();
  const quickActions = trpc.ai.quickActions.useMutation();
  const expandDraft = trpc.ai.expand.useMutation();
  const extractTasks = trpc.ai.extractTasks.useMutation();
  const bulkCreateTasks = trpc.tasks.bulkCreate.useMutation();
  const proofreadItem = trpc.ai.proofread.useMutation();
  const suggestTitle = trpc.ai.suggestTitle.useMutation();
  const createTaskFromAction = trpc.tasks.create.useMutation();
  const [extractedTasks, setExtractedTasks] = React.useState<
    { title: string; priority: "low" | "medium" | "high" }[]
  >([]);
  const [aiSummary, setAiSummary] = React.useState<string>("");
  const [aiTagSuggestions, setAiTagSuggestions] = React.useState<string[]>([]);
  const [aiRelated, setAiRelated] = React.useState<{ id: string; title: string; reason: string }[]>([]);
  const [aiActions, setAiActions] = React.useState<
    { kind: "task" | "followup" | "question" | "note"; label: string; detail?: string }[]
  >([]);
  const [previewMarkdown, setPreviewMarkdown] = React.useState(false);
  const aiEnabled = useAiEnabled();
  const isServerBackedItem = Boolean(itemQuery.data);
  const effectiveItem = React.useMemo(() => {
    if (itemQuery.data) return itemQuery.data;
    if (!localItem) return null;
    return {
      id: localItem.id,
      title: localItem.title,
      content: localItem.content,
      tags: [],
      categoryId: localItem.categoryId ?? null,
      accessRole: "owner" as const,
      accessPermission: "edit" as const,
    };
  }, [itemQuery.data, localItem]);
  const presentationSlides = React.useMemo(() => {
    const chunks = (content || "")
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    if (chunks.length === 0) return [title || "Untitled note", "No content"];
    return [title || "Untitled note", ...chunks];
  }, [content, title]);

  React.useEffect(() => {
    if (!showPresentationMode || Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setPresentationIndex((prev) => Math.min(prev + 1, presentationSlides.length - 1));
      } else if (event.key === "ArrowLeft") {
        setPresentationIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === "Escape") {
        setShowPresentationMode(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presentationSlides.length, showPresentationMode]);

  React.useEffect(() => {
    if (!id) {
      return;
    }
    if (itemQuery.error) {
      console.error("[Item/Detail] Failed loading item:", itemQuery.error);
      return;
    }
    if (effectiveItem && !didHydrateForm) {
      setTitle(effectiveItem.title ?? "");
      setContent(effectiveItem.content ?? "");
      setTagsInput((effectiveItem.tags ?? []).map((tag) => tag.name).join(", "));
      setDidHydrateForm(true);
    }
  }, [didHydrateForm, effectiveItem, id, itemQuery.error, itemQuery.isFetched, router]);

  React.useEffect(() => {
    if (!id || itemQuery.data || !itemQuery.isFetched) return;
    let cancelled = false;
    setIsLoadingLocalItem(true);
    localStorage
      .getItemById(id)
      .then((item) => {
        if (!cancelled) setLocalItem(item);
      })
      .catch((error) => {
        console.error("[Item/Detail] Failed loading local item:", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLocalItem(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, itemQuery.data, itemQuery.isFetched]);

  const handleSave = async () => {
    if (!id || !effectiveItem) return;
    if (effectiveItem.accessPermission !== "edit") {
      Alert.alert("View Only", "You do not have permission to edit this item.");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Validation", "Title is required.");
      return;
    }

    try {
      setIsSaving(true);
      if (isServerBackedItem) {
        await updateItem.mutateAsync({
          title: title.trim(),
          content: content.trim() || title.trim(),
          id,
        });
      } else {
        await localStorage.updateItem(id, {
          title: title.trim(),
          content: content.trim() || title.trim(),
        } as any);
      }

      if (isServerBackedItem && effectiveItem.accessRole === "owner") {
        const nextTagNames = tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
        const nextTagNamesSet = new Set(nextTagNames.map((tag) => tag.toLowerCase()));
        const currentTags = effectiveItem.tags ?? [];
        const currentTagNamesSet = new Set(currentTags.map((tag) => tag.name.toLowerCase()));
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
      }

      await Promise.all([
        utils.items.getWithTags.invalidate({ id }),
        utils.items.list.invalidate(),
        utils.tags.list.invalidate(),
      ]);
      Alert.alert("Saved", "Item updated successfully.");
      router.replace("/(app)/(tabs)" as any);
    } catch (error) {
      console.error("[Item/Detail] Failed saving item:", error);
      Alert.alert("Error", "Failed to save item.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!id) return;
    const performDelete = async () => {
      try {
        if (isServerBackedItem) {
          await deleteItem.mutateAsync({ id });
        } else {
          await deleteInboxItem(id);
        }
        await Promise.all([
          utils.items.list.invalidate(),
          utils.items.getWithTags.invalidate({ id }),
          loadInboxItems(),
        ]);
        Alert.alert("Deleted", "Item deleted successfully.");
        router.back();
      } catch (error: any) {
        console.error("[Item/Detail] Failed deleting item:", error);
        Alert.alert("Error", error?.message || "Failed to delete item.");
      }
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const ok = window.confirm("Are you sure you want to permanently delete this item?");
      if (!ok) return;
      await performDelete();
      return;
    }

    Alert.alert("Delete Item", "Are you sure you want to permanently delete this item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void performDelete();
        },
      },
    ]);
  };

  const handleShare = async () => {
    if (!id) return;
    const email = shareEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert("Validation", "Please enter an email to share with.");
      return;
    }
    try {
      await createShare.mutateAsync({
        itemId: id,
        email,
        permission: sharePermission,
      });
      await itemSharesQuery.refetch();
      setShareEmail("");
      Alert.alert("Shared", `Item shared with ${email}.`);
    } catch (error: any) {
      console.error("[Item/Share] Failed sharing item:", error);
      Alert.alert("Error", error?.message || "Failed to share item.");
    }
  };

  const handleAddComment = async () => {
    if (!id) return;
    const contentValue = commentInput.trim();
    if (!contentValue) return;
    try {
      await createComment.mutateAsync({
        itemId: id,
        content: contentValue,
        parentCommentId: replyToCommentId ?? undefined,
      });
      setCommentInput("");
      setReplyToCommentId(null);
      await commentsQuery.refetch();
    } catch (error: any) {
      console.error("[Item/Comments] Failed creating comment:", error);
      Alert.alert("Error", error?.message || "Failed to add comment.");
    }
  };

  const handleCreatePublicLink = async () => {
    if (!id) return;
    const parsedDays = Number(publicExpiryDays);
    try {
      await createPublicLink.mutateAsync({
        itemId: id,
        expiresInDays: Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : undefined,
        password: publicPassword.trim() || undefined,
      });
      setPublicPassword("");
      await listPublicLinks.refetch();
      Alert.alert("Public Link Created", "You can now open this item through the generated token link.");
    } catch (error: any) {
      console.error("[Item/PublicLink] Failed creating public link:", error);
      Alert.alert("Error", error?.message || "Failed to create public link.");
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

  const handlePrint = () => {
    if (Platform.OS !== "web") {
      Alert.alert("Print", "Print is currently supported on web.");
      return;
    }
    window.print();
  };

  const handleOpenPresentation = () => {
    setPresentationIndex(0);
    setShowPresentationMode(true);
  };

  if (itemQuery.isLoading || isLoadingLocalItem) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (itemQuery.isFetched && !effectiveItem) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold text-foreground mb-2">Item not found</Text>
          <Text className="text-muted text-center mb-4">
            This note may have been moved or deleted.
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 10,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>Back to Inbox</Text>
          </Pressable>
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

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text className="text-sm font-semibold text-foreground">Content</Text>
          <Pressable
            onPress={() => setPreviewMarkdown((v) => !v)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: previewMarkdown ? colors.primary : colors.surface,
            }}
          >
            <Text
              style={{
                color: previewMarkdown ? "#fff" : colors.foreground,
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              {previewMarkdown ? "Edit" : "Preview"}
            </Text>
          </Pressable>
        </View>
        {previewMarkdown ? (
          <View
            style={{
              minHeight: 220,
              padding: 12,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              backgroundColor: colors.surface,
              marginBottom: 4,
            }}
          >
            {content.trim().length === 0 ? (
              <Text style={{ color: colors.muted, fontStyle: "italic" }}>
                Nothing to preview yet.
              </Text>
            ) : (
              <Markdown
                style={{
                  body: { color: colors.foreground, fontSize: 14, lineHeight: 21 },
                  heading1: { color: colors.foreground, fontSize: 20, fontWeight: "700" },
                  heading2: { color: colors.foreground, fontSize: 17, fontWeight: "700" },
                  heading3: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
                  link: { color: colors.primary },
                  code_inline: {
                    backgroundColor: colors.background,
                    color: colors.foreground,
                    borderRadius: 4,
                    paddingHorizontal: 4,
                  },
                  code_block: {
                    backgroundColor: colors.background,
                    color: colors.foreground,
                    padding: 8,
                    borderRadius: 6,
                  },
                  blockquote: {
                    backgroundColor: colors.background,
                    borderLeftWidth: 3,
                    borderLeftColor: colors.primary,
                    paddingLeft: 10,
                    paddingVertical: 4,
                  },
                }}
              >
                {content}
              </Markdown>
            )}
          </View>
        ) : (
          <RichTextEditor value={content} onChange={setContent} placeholder="Write content..." minHeight={220} />
        )}

        <Text className="text-sm font-semibold text-foreground mb-2 mt-4">Image Attachments</Text>
        {attachmentsQuery.isLoading ? (
          <View className="py-2">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : attachmentsQuery.data && attachmentsQuery.data.filter((a) => a.type === "image").length > 0 ? (
          <View style={{ gap: 10, marginBottom: 14 }}>
            {attachmentsQuery.data
              .filter((a) => a.type === "image")
              .map((attachment) => {
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

        {attachmentsQuery.data && attachmentsQuery.data.filter((a) => a.type === "audio").length > 0 ? (
          <>
            <Text className="text-sm font-semibold text-foreground mb-2 mt-4">Audio Attachments</Text>
            <View style={{ gap: 10, marginBottom: 14 }}>
              {attachmentsQuery.data
                .filter((a) => a.type === "audio")
                .map((attachment) => {
                  const isBusy = transcribingId === attachment.id && transcribeAttachment.isPending;
                  const existing = transcriptionByAttachment[attachment.id] ?? attachment.transcription ?? "";
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
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <MaterialIcons name="audiotrack" size={22} color={colors.primary} />
                        <Text style={{ color: colors.foreground, flex: 1 }} numberOfLines={1}>
                          {attachment.filename}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleTranscribe(attachment.id)}
                        disabled={isBusy}
                        style={{
                          marginTop: 10,
                          borderRadius: 8,
                          paddingVertical: 10,
                          alignItems: "center",
                          backgroundColor: colors.primary,
                          opacity: isBusy ? 0.75 : 1,
                        }}
                      >
                        {isBusy ? (
                          <ActivityIndicator color="white" />
                        ) : (
                          <Text style={{ color: "white", fontWeight: "700" }}>
                            {existing ? "Re-transcribe" : "Transcribe"}
                          </Text>
                        )}
                      </Pressable>
                      {existing ? (
                        <View
                          style={{
                            marginTop: 10,
                            padding: 10,
                            borderRadius: 8,
                            backgroundColor: colors.background,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                        >
                          <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>
                            Transcript
                          </Text>
                          <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>
                            {existing}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
            </View>
          </>
        ) : null}

        {isServerBackedItem && effectiveItem?.accessRole === "owner" && id && aiEnabled ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 12,
              marginTop: 16,
              marginBottom: 4,
              backgroundColor: colors.surface,
            }}
          >
            <Text className="text-sm font-semibold text-foreground mb-2">AI Assistant</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Pressable
                onPress={async () => {
                  try {
                    const res = await suggestTags.mutateAsync({ itemId: id });
                    setAiTagSuggestions(res.suggestions);
                  } catch (e: any) {
                    Alert.alert("AI", e?.message ?? "Failed to suggest tags");
                  }
                }}
                disabled={suggestTags.isPending}
                style={{
                  backgroundColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  opacity: suggestTags.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
                  {suggestTags.isPending ? "Thinking…" : "Suggest tags"}
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  try {
                    const res = await summarizeItem.mutateAsync({ itemId: id });
                    setAiSummary(res.summary || "Not enough content to summarize.");
                  } catch (e: any) {
                    Alert.alert("AI", e?.message ?? "Failed to summarize");
                  }
                }}
                disabled={summarizeItem.isPending}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  opacity: summarizeItem.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
                  {summarizeItem.isPending ? "Thinking…" : "Summarize"}
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  try {
                    const res = await relatedItems.mutateAsync({ itemId: id, limit: 5 });
                    setAiRelated(res.related);
                  } catch (e: any) {
                    Alert.alert("AI", e?.message ?? "Failed to find related items");
                  }
                }}
                disabled={relatedItems.isPending}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  opacity: relatedItems.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
                  {relatedItems.isPending ? "Thinking…" : "Find related"}
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  try {
                    const res = await quickActions.mutateAsync({ itemId: id });
                    setAiActions(res.actions);
                  } catch (e: any) {
                    Alert.alert("AI", e?.message ?? "Failed to suggest actions");
                  }
                }}
                disabled={quickActions.isPending}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  opacity: quickActions.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
                  {quickActions.isPending ? "Thinking…" : "Quick actions"}
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  try {
                    const res = await expandDraft.mutateAsync({ itemId: id, tone: "neutral" });
                    if (!res.expanded) {
                      Alert.alert("AI", "Not enough content to expand.");
                      return;
                    }
                    setContent((prev) => {
                      const trimmed = prev.trim();
                      const section = `\n\n[Expanded]\n${res.expanded}`.trim();
                      return trimmed ? `${trimmed}\n\n${section}` : section;
                    });
                  } catch (e: any) {
                    Alert.alert("AI", e?.message ?? "Failed to expand");
                  }
                }}
                disabled={expandDraft.isPending}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  opacity: expandDraft.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
                  {expandDraft.isPending ? "Thinking…" : "Expand"}
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  try {
                    const res = await extractTasks.mutateAsync({ itemId: id });
                    setExtractedTasks(res.tasks);
                    if (res.tasks.length === 0) {
                      Alert.alert("AI", "No actionable tasks detected in this content.");
                    }
                  } catch (e: any) {
                    Alert.alert("AI", e?.message ?? "Failed to extract tasks");
                  }
                }}
                disabled={extractTasks.isPending}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  opacity: extractTasks.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
                  {extractTasks.isPending ? "Thinking…" : "Extract tasks"}
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  try {
                    const res = await proofreadItem.mutateAsync({ itemId: id });
                    if (!res.cleaned) {
                      Alert.alert("AI", "Not enough content to proofread.");
                      return;
                    }
                    Alert.alert(
                      "Proofread result",
                      res.changes.length > 0
                        ? `Changes:\n• ${res.changes.join("\n• ")}\n\nApply the cleaned version?`
                        : "No notable issues found. Apply anyway?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Apply",
                          onPress: () => setContent(res.cleaned),
                        },
                      ]
                    );
                  } catch (e: any) {
                    Alert.alert("AI", e?.message ?? "Failed to proofread");
                  }
                }}
                disabled={proofreadItem.isPending}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  opacity: proofreadItem.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
                  {proofreadItem.isPending ? "Thinking…" : "Proofread"}
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  try {
                    const res = await suggestTitle.mutateAsync({ itemId: id });
                    if (res.titles.length === 0) {
                      Alert.alert("AI", "Not enough content to propose a title.");
                      return;
                    }
                    Alert.alert(
                      "Suggested titles",
                      "",
                      [
                        ...res.titles.map((t) => ({
                          text: t,
                          onPress: () => setTitle(t),
                        })),
                        { text: "Cancel", style: "cancel" },
                      ]
                    );
                  } catch (e: any) {
                    Alert.alert("AI", e?.message ?? "Failed to suggest titles");
                  }
                }}
                disabled={suggestTitle.isPending}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  opacity: suggestTitle.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
                  {suggestTitle.isPending ? "Thinking…" : "Suggest title"}
                </Text>
              </Pressable>
            </View>
            {extractedTasks.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    Tasks detected ({extractedTasks.length})
                  </Text>
                  <Pressable
                    onPress={async () => {
                      try {
                        const res = await bulkCreateTasks.mutateAsync({ tasks: extractedTasks });
                        setExtractedTasks([]);
                        Alert.alert("Tasks created", `${res.created} task${res.created === 1 ? "" : "s"} added.`);
                      } catch (err: any) {
                        Alert.alert("Error", err?.message ?? "Failed to create tasks.");
                      }
                    }}
                    disabled={bulkCreateTasks.isPending}
                    style={{
                      backgroundColor: colors.primary,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 999,
                      opacity: bulkCreateTasks.isPending ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                      {bulkCreateTasks.isPending ? "..." : "Create all"}
                    </Text>
                  </Pressable>
                </View>
                {extractedTasks.map((t, idx) => {
                  const pColor =
                    t.priority === "high" ? colors.error : t.priority === "low" ? colors.muted : colors.warning;
                  return (
                    <View
                      key={idx}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                        marginBottom: 4,
                      }}
                    >
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: pColor,
                        }}
                      />
                      <Text style={{ color: colors.foreground, flex: 1, fontSize: 12 }} numberOfLines={2}>
                        {t.title}
                      </Text>
                      <Pressable
                        onPress={() => {
                          setExtractedTasks((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <Text style={{ color: colors.muted, fontSize: 11 }}>✕</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {aiActions.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
                  Suggested actions
                </Text>
                {aiActions.map((a, idx) => {
                  const kindColor =
                    a.kind === "task"
                      ? colors.success
                      : a.kind === "followup"
                      ? colors.warning
                      : a.kind === "question"
                      ? colors.primary
                      : colors.muted;
                  return (
                    <Pressable
                      key={`${a.kind}-${idx}`}
                      onPress={async () => {
                        if (a.kind === "task") {
                          try {
                            await createTaskFromAction.mutateAsync({
                              title: a.label,
                              description: a.detail ?? undefined,
                              priority: "medium",
                            });
                            setAiActions((prev) => prev.filter((_, i) => i !== idx));
                            Alert.alert("Task created", a.label);
                          } catch (err: any) {
                            Alert.alert("Error", err?.message ?? "Failed to create task.");
                          }
                        }
                      }}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        marginBottom: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 999,
                            backgroundColor: kindColor + "22",
                          }}
                        >
                          <Text
                            style={{
                              color: kindColor,
                              fontSize: 10,
                              fontWeight: "700",
                              textTransform: "uppercase",
                            }}
                          >
                            {a.kind}
                          </Text>
                        </View>
                        <Text
                          style={{ color: colors.foreground, flex: 1, fontSize: 13, fontWeight: "600" }}
                          numberOfLines={2}
                        >
                          {a.label}
                        </Text>
                        {a.kind === "task" ? (
                          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>+ Task</Text>
                        ) : null}
                      </View>
                      {a.detail ? (
                        <Text
                          style={{ color: colors.muted, fontSize: 11, marginTop: 4, marginLeft: 2 }}
                          numberOfLines={2}
                        >
                          {a.detail}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {aiTagSuggestions.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>
                  Tap to add:
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {aiTagSuggestions.map((tag) => (
                    <Pressable
                      key={tag}
                      onPress={() => {
                        const current = tagsInput
                          .split(",")
                          .map((t) => t.trim().toLowerCase())
                          .filter(Boolean);
                        if (current.includes(tag.toLowerCase())) return;
                        const next = [...current, tag].join(", ");
                        setTagsInput(next);
                        setAiTagSuggestions((prev) => prev.filter((t) => t !== tag));
                      }}
                      style={{
                        backgroundColor: colors.background,
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontSize: 12 }}>+ {tag}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {aiSummary ? (
              <View
                style={{
                  marginTop: 10,
                  backgroundColor: colors.background,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>
                  Summary
                </Text>
                <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 18 }}>
                  {aiSummary}
                </Text>
              </View>
            ) : null}
            {aiRelated.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
                  Related items
                </Text>
                {aiRelated.map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => router.push(`/(app)/item/${r.id}` as any)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      marginBottom: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    }}
                  >
                    <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 13 }} numberOfLines={1}>
                      {r.title}
                    </Text>
                    {r.reason ? (
                      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                        {r.reason}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

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
          editable={effectiveItem?.accessRole === "owner"}
        />

        {isServerBackedItem && itemQuery.data?.accessRole === "owner" ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              backgroundColor: colors.surface,
            }}
          >
            <Text className="text-sm font-semibold text-foreground mb-2">Share with Others</Text>
            <TextInput
              value={shareEmail}
              onChangeText={setShareEmail}
              placeholder="user@example.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                color: colors.foreground,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 10,
              }}
            />
            <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
              <Pressable
                onPress={() => setSharePermission("view")}
                style={{
                  borderWidth: 1,
                  borderColor: sharePermission === "view" ? colors.primary : colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: sharePermission === "view" ? `${colors.primary}22` : colors.background,
                }}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>View</Text>
              </Pressable>
              <Pressable
                onPress={() => setSharePermission("edit")}
                style={{
                  borderWidth: 1,
                  borderColor: sharePermission === "edit" ? colors.primary : colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: sharePermission === "edit" ? `${colors.primary}22` : colors.background,
                }}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Edit</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={handleShare}
              disabled={createShare.isPending}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: "center",
                opacity: createShare.isPending ? 0.7 : 1,
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Share Item</Text>
            </Pressable>
            <View style={{ marginTop: 10, gap: 8 }}>
              {(itemSharesQuery.data ?? []).map((share) => (
                <View
                  key={share.id}
                  className="flex-row items-center justify-between"
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  <View>
                    <Text style={{ color: colors.foreground, fontWeight: "600" }}>{share.sharedWithEmail}</Text>
                    <Text style={{ color: colors.muted }}>{share.permission.toUpperCase()}</Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      try {
                        await revokeShare.mutateAsync({ shareId: share.id });
                        await itemSharesQuery.refetch();
                      } catch (error) {
                        console.error("[Item/Share] Failed revoking share:", error);
                        Alert.alert("Error", "Failed to revoke share.");
                      }
                    }}
                  >
                    <Text style={{ color: colors.error, fontWeight: "700" }}>Revoke</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
              <Text className="text-sm font-semibold text-foreground mb-2">Public Links</Text>
              <TextInput
                value={publicExpiryDays}
                onChangeText={setPublicExpiryDays}
                placeholder="Expires in days (optional)"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={{
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  color: colors.foreground,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={publicPassword}
                onChangeText={setPublicPassword}
                placeholder="Password (optional)"
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  color: colors.foreground,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 8,
                }}
              />
              <Pressable
                onPress={handleCreatePublicLink}
                disabled={createPublicLink.isPending}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: "center",
                  opacity: createPublicLink.isPending ? 0.7 : 1,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>Create Public Link</Text>
              </Pressable>
              {(listPublicLinks.data ?? []).map((link) => (
                <View
                  key={link.id}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>/public/{link.token}</Text>
                  <Text style={{ color: colors.muted }}>
                    {link.isRevoked ? "Revoked" : "Active"}{link.expiresAt ? ` - expires ${new Date(link.expiresAt).toLocaleDateString()}` : ""}
                  </Text>
                  {!link.isRevoked ? (
                    <Pressable
                      onPress={async () => {
                        try {
                          await revokePublicLink.mutateAsync({ linkId: link.id });
                          await listPublicLinks.refetch();
                        } catch (error) {
                          console.error("[Item/PublicLink] Failed revoking link:", error);
                          Alert.alert("Error", "Failed to revoke public link.");
                        }
                      }}
                    >
                      <Text style={{ color: colors.error, fontWeight: "700", marginTop: 6 }}>Revoke Public Link</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text style={{ color: colors.muted, marginBottom: 14 }}>
            Shared access: {effectiveItem?.accessPermission === "edit" ? "Can edit" : "View only"}
          </Text>
        )}

        {isServerBackedItem ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            padding: 12,
            marginBottom: 20,
            backgroundColor: colors.surface,
          }}
        >
          <Text className="text-sm font-semibold text-foreground mb-2">Comments</Text>
          {(commentsQuery.data ?? []).map((comment) => (
            <View
              key={comment.id}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
                marginLeft: comment.parentCommentId ? 20 : 0,
              }}
            >
              <Text style={{ color: colors.foreground, fontWeight: "700" }}>
                {comment.authorUsername || comment.authorEmail || "Unknown"}
              </Text>
              <Text style={{ color: colors.foreground, marginTop: 4 }}>{comment.content}</Text>
              <Pressable onPress={() => setReplyToCommentId(comment.id)} style={{ marginTop: 8 }}>
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Reply</Text>
              </Pressable>
            </View>
          ))}
          {replyToCommentId ? (
            <Text style={{ color: colors.muted, marginBottom: 8 }}>Replying to comment</Text>
          ) : null}
          <TextInput
            value={commentInput}
            onChangeText={setCommentInput}
            placeholder="Add comment... Use @username or @email to mention"
            placeholderTextColor={colors.muted}
            multiline
            style={{
              backgroundColor: colors.background,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 8,
              color: colors.foreground,
              paddingHorizontal: 12,
              paddingVertical: 10,
              minHeight: 80,
              marginBottom: 8,
            }}
          />
          {mentionableQuery.data && mentionableQuery.data.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              <Text style={{ color: colors.muted, fontSize: 11, width: "100%", marginBottom: 2 }}>
                Tap to mention:
              </Text>
              {mentionableQuery.data.slice(0, 8).map((u: any) => {
                const handle = u.username || u.email;
                return (
                  <Pressable
                    key={u.id}
                    onPress={() => {
                      setCommentInput((prev) => {
                        const sep = prev.trim().length > 0 && !/\s$/.test(prev) ? " " : "";
                        return `${prev}${sep}@${handle} `;
                      });
                    }}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "600" }}>@{handle}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Pressable
            onPress={handleAddComment}
            disabled={createComment.isPending}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 8,
              paddingVertical: 10,
              alignItems: "center",
              opacity: createComment.isPending ? 0.7 : 1,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>Post Comment</Text>
          </Pressable>
        </View>
        ) : null}

        {isServerBackedItem ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
            backgroundColor: colors.surface,
          }}
        >
          <Text className="text-sm font-semibold text-foreground mb-2">Version History</Text>
          {(versionsQuery.data ?? []).length === 0 ? (
            <Text style={{ color: colors.muted }}>No previous versions yet.</Text>
          ) : (
            (versionsQuery.data ?? []).map((version) => (
              <View
                key={version.id}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: colors.foreground, fontWeight: "700" }} numberOfLines={1}>
                  {version.title}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                  {version.createdAt ? new Date(version.createdAt).toLocaleString() : "Unknown time"}
                </Text>
                <Text style={{ color: colors.foreground, marginTop: 4 }} numberOfLines={2}>
                  {version.content || "No content"}
                </Text>
                <Pressable
                  onPress={async () => {
                    try {
                      await restoreVersion.mutateAsync({ versionId: version.id });
                      await Promise.all([
                        itemQuery.refetch(),
                        versionsQuery.refetch(),
                      ]);
                      Alert.alert("Restored", "Previous version restored.");
                    } catch (error: any) {
                      console.error("[Item/Versions] Restore failed:", error);
                      Alert.alert("Error", error?.message || "Failed to restore version.");
                    }
                  }}
                  style={{ marginTop: 8 }}
                >
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>Restore This Version</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={handlePrint}
            style={{
              flex: 1,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
            }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>Print</Text>
          </Pressable>
          <Pressable
            onPress={handleOpenPresentation}
            style={{
              flex: 1,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
            }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>Present</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={handleSave}
          disabled={isSaving || effectiveItem?.accessPermission !== "edit"}
          style={{
            marginTop: 8,
            backgroundColor: colors.primary,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            opacity: isSaving || effectiveItem?.accessPermission !== "edit" ? 0.7 : 1,
          }}
        >
          {isSaving ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "700" }}>Save</Text>}
        </Pressable>
        <Pressable
          onPress={handleDeleteItem}
          disabled={deleteItem.isPending}
          style={{
            marginTop: 8,
            backgroundColor: colors.error,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            opacity: deleteItem.isPending ? 0.7 : 1,
          }}
        >
          {deleteItem.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "white", fontWeight: "700" }}>Delete</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal visible={showPresentationMode} transparent animationType="fade" onRequestClose={() => setShowPresentationMode(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Text style={{ color: "white", fontSize: 28, fontWeight: "800", marginBottom: 12, textAlign: "center" }}>
            {title || "Untitled note"}
          </Text>
          <Text
            style={{
              color: "white",
              fontSize: 20,
              lineHeight: 30,
              textAlign: "center",
              maxWidth: 900,
            }}
          >
            {presentationSlides[presentationIndex]}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 16 }}>
            Slide {presentationIndex + 1} / {presentationSlides.length}
          </Text>
          <View style={{ flexDirection: "row", marginTop: 20, gap: 10 }}>
            <Pressable
              onPress={() => setPresentationIndex((prev) => Math.max(prev - 1, 0))}
              style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Prev</Text>
            </Pressable>
            <Pressable
              onPress={() => setPresentationIndex((prev) => Math.min(prev + 1, presentationSlides.length - 1))}
              style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Next</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowPresentationMode(false)}
              style={{ borderWidth: 1, borderColor: colors.error, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 }}
            >
              <Text style={{ color: colors.error, fontWeight: "700" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
