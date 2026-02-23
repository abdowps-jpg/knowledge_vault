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
  const [shareEmail, setShareEmail] = React.useState("");
  const [sharePermission, setSharePermission] = React.useState<"view" | "edit">("view");
  const [commentInput, setCommentInput] = React.useState("");
  const [replyToCommentId, setReplyToCommentId] = React.useState<string | null>(null);
  const [publicPassword, setPublicPassword] = React.useState("");
  const [publicExpiryDays, setPublicExpiryDays] = React.useState("7");

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
      enabled: Boolean(id),
    }
  );
  const createComment = trpc.itemComments.create.useMutation();
  const createPublicLink = trpc.publicLinks.create.useMutation();
  const listPublicLinks = trpc.publicLinks.listForItem.useQuery(
    { itemId: id || "" },
    { enabled: Boolean(id) && itemQuery.data?.accessRole === "owner" }
  );
  const revokePublicLink = trpc.publicLinks.revoke.useMutation();

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
    if (itemQuery.data.accessPermission !== "edit") {
      Alert.alert("View Only", "You do not have permission to edit this item.");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Validation", "Title is required.");
      return;
    }

    try {
      setIsSaving(true);
      await updateItem.mutateAsync({
        title: title.trim(),
        content: content.trim() || title.trim(),
        id,
      });

      if (itemQuery.data.accessRole === "owner") {
        const nextTagNames = tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
        const nextTagNamesSet = new Set(nextTagNames.map((tag) => tag.toLowerCase()));
        const currentTags = itemQuery.data.tags ?? [];
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
          editable={itemQuery.data?.accessRole === "owner"}
        />

        {itemQuery.data?.accessRole === "owner" ? (
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
                    <Text style={{ color: "#DC2626", fontWeight: "700" }}>Revoke</Text>
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
                      <Text style={{ color: "#DC2626", fontWeight: "700", marginTop: 6 }}>Revoke Public Link</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text style={{ color: colors.muted, marginBottom: 14 }}>
            Shared access: {itemQuery.data?.accessPermission === "edit" ? "Can edit" : "View only"}
          </Text>
        )}

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
            placeholder="Add comment... Use @email for mentions"
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
              marginBottom: 10,
            }}
          />
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

        <Pressable
          onPress={handleSave}
          disabled={isSaving || itemQuery.data?.accessPermission !== "edit"}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            opacity: isSaving || itemQuery.data?.accessPermission !== "edit" ? 0.7 : 1,
          }}
        >
          {isSaving ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "700" }}>Save</Text>}
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
