import React, { Suspense, useState } from "react";
import { useRouter } from "expo-router";
import { FlatList, Text, View, Pressable, RefreshControl, Modal, ActivityIndicator, TextInput, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import { useInbox } from "@/lib/context/inbox-context";
import { Item, ItemType } from "@/lib/db/schema";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import Markdown from "react-native-markdown-display";
import { Image as ExpoImage } from "expo-image";
import { AudioPlayer } from "@/components/audio-player";

const QuickAddModal = React.lazy(() =>
  import("@/components/quick-add-modal").then((mod) => ({ default: mod.QuickAddModal }))
);
const ItemContextMenu = React.lazy(() =>
  import("@/components/item-context-menu").then((mod) => ({ default: mod.ItemContextMenu }))
);
const QuickActionsFab = React.lazy(() =>
  import("@/components/quick-actions-fab").then((mod) => ({ default: mod.QuickActionsFab }))
);
const RichTextEditor = React.lazy(() =>
  import("@/components/rich-text-editor").then((mod) => ({ default: mod.RichTextEditor }))
);

// ============================================================================
// Helper Functions
// ============================================================================

function getItemTypeIcon(type: string): string {
  switch (type) {
    case ItemType.NOTE:
      return "description";
    case ItemType.QUOTE:
      return "format-quote";
    case ItemType.LINK:
      return "link";
    case ItemType.AUDIO:
      return "mic";
    case ItemType.TASK:
      return "check-circle";
    case ItemType.JOURNAL:
      return "today";
    default:
      return "note";
  }
}

function getItemTypeLabel(type: string): string {
  switch (type) {
    case ItemType.NOTE:
      return "Note";
    case ItemType.QUOTE:
      return "Quote";
    case ItemType.LINK:
      return "Link";
    case ItemType.AUDIO:
      return "Audio";
    case ItemType.TASK:
      return "Task";
    case ItemType.JOURNAL:
      return "Journal";
    default:
      return "Item";
  }
}

function formatDate(date: Date): string {
  const now = new Date();
  const itemDate = new Date(date);
  const diffMs = now.getTime() - itemDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return itemDate.toLocaleDateString();
}

function getPreview(content: string, maxLength: number = 50): string {
  return content.length > maxLength ? `${content.substring(0, maxLength)}...` : content;
}

// ============================================================================
// Inbox Item Component
// ============================================================================

interface InboxItemProps {
  item: Item;
  onPress: (item: Item) => void;
  onLongPress: (item: Item) => void;
  onDelete: (itemId: string) => void;
  onMoveToLibrary: (item: Item) => void;
  onCopy: (item: Item) => void;
}

function InboxItem({ item, onPress, onLongPress, onDelete, onMoveToLibrary, onCopy }: InboxItemProps) {
  const colors = useColors();
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const { data: attachments = [], isLoading: isAttachmentsLoading } = trpc.attachments.list.useQuery({
    itemId: item.id,
  });

  const handleDelete = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete(item.id);
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLongPress(item);
  };

  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={handleLongPress}
      delayLongPress={500}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.7 : 1,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
          paddingHorizontal: 16,
          paddingVertical: 12,
        },
      ]}
    >
      <View className="flex-row items-start gap-3">
        {/* Icon */}
        <View className="mt-1">
          <MaterialIcons name={getItemTypeIcon(item.type) as any} size={20} color={colors.primary} />
        </View>

        {/* Content */}
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {item.title || "(Untitled)"}
          </Text>
          <View className="mt-1">
            <Markdown
              style={{
                body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
                paragraph: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 0 },
                heading1: { color: colors.foreground, fontSize: 18, fontWeight: "700" as const, marginBottom: 4 },
                strong: { color: colors.foreground, fontWeight: "700" as const },
                em: { color: colors.muted, fontStyle: "italic" as const },
                code_inline: { color: colors.primary, backgroundColor: colors.background },
              }}
            >
              {getPreview(item.content)}
            </Markdown>
          </View>
          <View className="flex-row items-center gap-2 mt-2">
            <Text className="text-xs text-muted">{getItemTypeLabel(item.type)}</Text>
            <Text className="text-xs text-muted">•</Text>
            <Text className="text-xs text-muted">{formatDate(item.createdAt)}</Text>
          </View>
          {isAttachmentsLoading ? (
            <View className="mt-2">
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : attachments.length > 0 ? (
            <View className="flex-row items-center gap-2 mt-3">
              {attachments.slice(0, 3).map((attachment) => (
                <Pressable key={attachment.id} onPress={() => setPreviewImageUri(attachment.fileUrl)}>
                  <ExpoImage
                    source={{ uri: attachment.fileUrl }}
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                </Pressable>
              ))}
            </View>
          ) : null}
          {item.type === ItemType.AUDIO ? (
            <View className="mt-3">
              <AudioPlayer
                title={item.title || "Audio Note"}
                sourceUri={attachments.find((a) => a.type === "audio")?.fileUrl || ""}
                durationSec={(attachments.find((a) => a.type === "audio")?.duration as number | undefined) || 0}
              />
            </View>
          ) : null}
          <View className="flex-row items-center gap-3 mt-3">
            <Pressable onPress={() => onMoveToLibrary(item)}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>Move to Library</Text>
            </Pressable>
            <Pressable onPress={() => onCopy(item)}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>Copy</Text>
            </Pressable>
          </View>
        </View>

        {/* Delete Button */}
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.6 : 0.8,
              padding: 8,
            },
          ]}
        >
          <MaterialIcons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <Modal
        visible={!!previewImageUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
      >
        <Pressable
          onPress={() => setPreviewImageUri(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.9)",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          {previewImageUri ? (
            <ExpoImage
              source={{ uri: previewImageUri }}
              cachePolicy="memory-disk"
              contentFit="contain"
              style={{ width: "100%", height: "80%", borderRadius: 12 }}
            />
          ) : null}
        </Pressable>
      </Modal>
    </Pressable>
  );
}

// ============================================================================
// Inbox Screen
// ============================================================================

export default function InboxScreen() {
  const colors = useColors();
  const router = useRouter();
  const { items, loading, openQuickAdd, loadInboxItems, deleteItem, updateItem, addItem } = useInbox();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInboxItems();
    setRefreshing(false);
  };

  // Handle item long press
  const handleItemLongPress = (item: Item) => {
    setSelectedItem(item);
    setShowContextMenu(true);
  };

  const handleItemPress = (item: Item) => {
    console.log("[Inbox] Opening item details:", item.id);
    router.push(`/(app)/item/${item.id}` as any);
  };

  // Handle delete
  const handleDelete = async (itemId: string) => {
    try {
      await deleteItem(itemId);
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  // Handle quick add button
  const handleQuickAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openQuickAdd("note");
  };

  const handleMoveToLibrary = async (item: Item) => {
    try {
      await updateItem(item.id, { categoryId: "library" as any });
      console.log("[Inbox] Moved item to library:", item.id);
    } catch (error) {
      console.error("[Inbox] Failed moving item to library:", error);
      Alert.alert("Error", "Failed to move item.");
    }
  };

  const handleCopyItem = async (item: Item) => {
    try {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copySource } = item as any;
      const duplicated = await addItem({
        ...copySource,
        title: `${item.title} (Copy)`,
      });
      console.log("[Inbox] Copied item:", item.id, "->", duplicated.id);
      Alert.alert("Copied", "Item duplicated successfully.");
    } catch (error) {
      console.error("[Inbox] Failed copying item:", error);
      Alert.alert("Error", "Failed to copy item.");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    if (!editTitle.trim()) {
      Alert.alert("Validation", "Title is required");
      return;
    }

    try {
      setSavingEdit(true);
      await updateItem(editingItem.id, {
        title: editTitle.trim(),
        content: editContent.trim() || editTitle.trim(),
      });
      setEditingItem(null);
      setEditTitle("");
      setEditContent("");
    } catch (error) {
      console.error("Error updating item:", error);
      Alert.alert("Error", "Failed to update item");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
        <View>
          <Text className="text-2xl font-bold text-foreground">Inbox</Text>
          <Text className="text-xs text-muted mt-1">{items.length} items</Text>
        </View>
        <Pressable
          onPress={handleQuickAdd}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
        >
          <View className="w-12 h-12 rounded-full bg-primary items-center justify-center">
            <MaterialIcons name="add" size={28} color="white" />
          </View>
        </Pressable>
      </View>

      {/* Items List */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <MaterialIcons name="hourglass-empty" size={48} color={colors.muted} />
          <Text className="text-muted mt-4">Loading...</Text>
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3">
          <MaterialIcons name="inbox" size={64} color={colors.muted} />
          <Text className="text-lg font-semibold text-foreground">Inbox Empty</Text>
          <Text className="text-sm text-muted text-center px-4 max-w-xs">
            Tap the + button to add your first note, quote, link, or task
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <InboxItem
              item={item}
              onPress={handleItemPress}
              onLongPress={handleItemLongPress}
              onDelete={handleDelete}
              onMoveToLibrary={handleMoveToLibrary}
              onCopy={handleCopyItem}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={{ flexGrow: 1 }}
          scrollEnabled={items.length > 0}
        />
      )}

      {/* Quick Add Modal */}
      <Suspense fallback={null}>
        <QuickAddModal />
      </Suspense>

      {/* Item Detail Edit Modal */}
      <Modal visible={!!editingItem} transparent animationType="slide" onRequestClose={() => setEditingItem(null)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6 max-h-[85%]" style={{ backgroundColor: colors.surface }}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-foreground">Edit Item</Text>
              <Pressable onPress={() => setEditingItem(null)}>
                <MaterialIcons name="close" size={22} color={colors.foreground} />
              </Pressable>
            </View>

            <TextInput
              placeholder="Title"
              placeholderTextColor={colors.muted}
              value={editTitle}
              onChangeText={setEditTitle}
              style={{
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.foreground,
                marginBottom: 12,
              }}
            />

            <Suspense fallback={<ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}>
              <RichTextEditor
                value={editContent}
                onChange={setEditContent}
                placeholder="Write content in markdown..."
                minHeight={220}
              />
            </Suspense>

            <View className="flex-row gap-3 mt-4">
              <Pressable onPress={() => setEditingItem(null)} style={{ flex: 1 }}>
                <View className="rounded-lg py-3 items-center" style={{ backgroundColor: colors.border }}>
                  <Text className="text-foreground font-semibold">Cancel</Text>
                </View>
              </Pressable>
              <Pressable onPress={handleSaveEdit} disabled={savingEdit} style={{ flex: 1 }}>
                <View className="rounded-lg py-3 items-center" style={{ backgroundColor: colors.primary }}>
                  {savingEdit ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">Save</Text>}
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Context Menu */}
      <Suspense fallback={null}>
        <ItemContextMenu
          item={selectedItem}
          isVisible={showContextMenu}
          onClose={() => {
            setShowContextMenu(false);
            setSelectedItem(null);
          }}
        />
      </Suspense>

      {/* Quick Actions FAB */}
      <Suspense fallback={null}>
        <QuickActionsFab />
      </Suspense>
    </ScreenContainer>
  );
}
