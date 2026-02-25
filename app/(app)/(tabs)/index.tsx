import React, { Suspense, useMemo, useState } from "react";
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
  onMoveToJournal: (item: Item) => void;
  onMoveToActions: (item: Item) => void;
}

function InboxItem({
  item,
  onPress,
  onLongPress,
  onDelete,
  onMoveToLibrary,
  onMoveToJournal,
  onMoveToActions,
}: InboxItemProps) {
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
            <Pressable onPress={() => onMoveToActions(item)}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>Move to Actions</Text>
            </Pressable>
            <Pressable onPress={() => onMoveToJournal(item)}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>Move to Journal</Text>
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
  const utils = trpc.useUtils();
  const { items, loading, openQuickAdd, loadInboxItems, deleteItem, updateItem, convertToTask } = useInbox();
  const [refreshing, setRefreshing] = useState(false);
  const [inboxView, setInboxView] = useState<"list" | "search">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const isSearchMode = inboxView === "search";

  const itemsSearchQuery = trpc.items.list.useInfiniteQuery(
    { limit: 100, sortBy: "createdAt", sortOrder: "desc" },
    { getNextPageParam: (lastPage) => lastPage.nextCursor, enabled: isSearchMode }
  );
  const tasksSearchQuery = trpc.tasks.list.useInfiniteQuery(
    { limit: 100, sortOrder: "desc" },
    { getNextPageParam: (lastPage) => lastPage.nextCursor, enabled: isSearchMode }
  );
  const journalSearchQuery = trpc.journal.list.useInfiniteQuery(
    { limit: 100 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor, enabled: isSearchMode }
  );
  const updateItemMutation = trpc.items.update.useMutation();
  const createItemMutation = trpc.items.create.useMutation();
  const createTaskMutation = trpc.tasks.create.useMutation();
  const createJournalMutation = trpc.journal.create.useMutation();

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
      await updateItemMutation.mutateAsync({
        id: item.id,
        location: "library",
      });
      await updateItem(item.id, { categoryId: "library" as any, isArchived: true as any });
      await utils.items.list.invalidate();
      console.log("[Inbox] Moved item to library:", item.id);
      Alert.alert("Done", "Item moved to Library.");
    } catch (error) {
      console.error("[Inbox] Failed moving item to library:", error);
      try {
        const normalizedType =
          item.type === ItemType.QUOTE || item.type === ItemType.LINK || item.type === ItemType.AUDIO
            ? item.type
            : ItemType.NOTE;
        await createItemMutation.mutateAsync({
          type: normalizedType as "note" | "quote" | "link" | "audio",
          title: item.title?.trim() || "Untitled",
          content: item.content?.trim() || item.title?.trim() || "",
          url: item.type === ItemType.LINK ? ((item as any).url || undefined) : undefined,
          location: "library",
        });
        await deleteItem(item.id);
        await utils.items.list.invalidate();
        Alert.alert("Done", "Item copied to Library and removed from Inbox.");
      } catch {
        try {
          await updateItem(item.id, { categoryId: "library" as any, isArchived: true as any });
          Alert.alert("Done", "Item moved locally. It will sync later.");
        } catch {
          Alert.alert("Error", "Failed to move item.");
        }
      }
    }
  };

  const getTodayDateString = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const handleMoveToJournal = async (item: Item) => {
    try {
      const title = item.title?.trim() || null;
      const content = item.content?.trim() || item.title?.trim() || "Untitled";
      await createJournalMutation.mutateAsync({
        entryDate: getTodayDateString(),
        title,
        content,
        mood: null,
        location: null,
        weather: null,
      });
      await deleteItem(item.id);
      await utils.journal.list.invalidate();
      await utils.items.list.invalidate();
      console.log("[Inbox] Moved item to journal:", item.id);
      Alert.alert("Done", "Item moved to Journal.");
    } catch (error) {
      console.error("[Inbox] Failed moving item to journal:", error);
      try {
        await updateItem(item.id, {
          type: ItemType.JOURNAL as any,
          entryDate: new Date() as any,
        } as any);
        Alert.alert("Done", "Item moved locally to Journal.");
      } catch {
        Alert.alert("Error", "Failed to move item to Journal.");
      }
    }
  };

  const handleMoveToActions = async (item: Item) => {
    try {
      const title = item.title?.trim() || "Inbox Item";
      const descriptionParts = [item.content?.trim() || ""];
      const url = (item as any).url;
      if (typeof url === "string" && url.trim()) {
        descriptionParts.push(`URL: ${url.trim()}`);
      }
      const description = descriptionParts.filter(Boolean).join("\n\n") || undefined;
      await createTaskMutation.mutateAsync({
        title,
        description,
        priority: "medium",
      });
      await deleteItem(item.id);
      await utils.tasks.list.invalidate();
      await utils.items.list.invalidate();
      Alert.alert("Done", "Item moved to Actions.");
    } catch (error) {
      console.error("[Inbox] Failed moving item to actions:", error);
      try {
        await convertToTask(item.id);
        Alert.alert("Done", "Item moved locally to Actions.");
      } catch {
        Alert.alert("Error", "Failed to move item to Actions.");
      }
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

  const filteredItems = useMemo(() => {
    return items;
  }, [items]);

  const allSearchResults = useMemo(() => {
    const itemRows =
      itemsSearchQuery.data?.pages.flatMap((page) => page.items ?? []).map((item: any) => ({
        key: `item:${item.id}`,
        kind: "item" as const,
        id: item.id as string,
        title: String(item.title || "Untitled"),
        content: String(item.content || ""),
        subLabel: `Item • ${item.location || "inbox"}`,
      })) ?? [];
    const taskRows =
      tasksSearchQuery.data?.pages.flatMap((page) => page.items ?? []).map((task: any) => ({
        key: `task:${task.id}`,
        kind: "task" as const,
        id: task.id as string,
        title: String(task.title || "Untitled task"),
        content: String(task.description || ""),
        subLabel: `Task • ${task.dueDate || "No due date"}`,
      })) ?? [];
    const journalRows =
      journalSearchQuery.data?.pages.flatMap((page) => page.items ?? []).map((entry: any) => ({
        key: `journal:${entry.id}`,
        kind: "journal" as const,
        id: entry.id as string,
        title: String(entry.title || "Journal entry"),
        content: String(entry.content || ""),
        subLabel: `Journal • ${entry.entryDate || ""}`,
      })) ?? [];
    return [...itemRows, ...taskRows, ...journalRows];
  }, [itemsSearchQuery.data, tasksSearchQuery.data, journalSearchQuery.data]);

  const filteredSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allSearchResults;
    return allSearchResults.filter((item) => {
      const title = String(item.title || "").toLowerCase();
      const content = String(item.content || "").toLowerCase();
      return title.includes(q) || content.includes(q);
    });
  }, [allSearchResults, searchQuery]);

  const searchLoading =
    isSearchMode && (itemsSearchQuery.isLoading || tasksSearchQuery.isLoading || journalSearchQuery.isLoading);
  const searchError = isSearchMode ? itemsSearchQuery.error || tasksSearchQuery.error || journalSearchQuery.error : null;

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
        <View>
          <Text className="text-2xl font-bold text-foreground">Inbox</Text>
          <Text className="text-xs text-muted mt-1">{items.length} items</Text>
        </View>
      </View>

      <View className="px-4 py-3 border-b border-border">
        <View style={{ flexDirection: "row", marginBottom: 10 }}>
          {[
            { key: "list", label: "Inbox" },
            { key: "search", label: "Search" },
          ].map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setInboxView(tab.key as "list" | "search")}
              style={{
                marginRight: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: inboxView === tab.key ? colors.primary : colors.surface,
              }}
            >
              <Text style={{ color: inboxView === tab.key ? "white" : colors.foreground, fontSize: 12, fontWeight: "700" }}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {inboxView === "search" ? (
          <TextInput
            placeholder="Search all data (inbox, library, tasks, journal)..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 10,
              color: colors.foreground,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 10,
            }}
          />
        ) : null}
        <Text className="text-xs text-muted mb-2">Capture</Text>
        <View style={{ flexDirection: "row", marginBottom: 10 }}>
          {[
            { label: "Write", icon: "edit-note", onPress: () => handleQuickAdd() },
            { label: "Image", icon: "image", onPress: () => openQuickAdd("note", { autoPickImage: true }) },
            { label: "Voice", icon: "keyboard-voice", onPress: () => openQuickAdd("audio") },
          ].map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              style={{
                flex: 1,
                marginRight: action.label === "Voice" ? 0 : 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: colors.surface,
              }}
            >
              <MaterialIcons name={action.icon as any} size={18} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontSize: 12, marginTop: 4, fontWeight: "600" }}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Items List */}
      {isSearchMode ? (
        searchLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-muted mt-4">Searching...</Text>
          </View>
        ) : searchError ? (
          <View className="flex-1 items-center justify-center px-4">
            <Text className="text-muted text-center">Search failed. Try again.</Text>
          </View>
        ) : filteredSearchResults.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-3">
            <MaterialIcons name="search-off" size={64} color={colors.muted} />
            <Text className="text-lg font-semibold text-foreground">No results</Text>
          </View>
        ) : (
          <FlatList
            data={filteredSearchResults}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  if (item.kind === "item") {
                    router.push(`/(app)/item/${item.id}` as any);
                    return;
                  }
                  if (item.kind === "task") {
                    router.push({ pathname: "/(app)/(tabs)/actions", params: { taskId: item.id } } as any);
                    return;
                  }
                  router.push({ pathname: "/(app)/(tabs)/journal", params: { openEntryId: item.id } } as any);
                }}
                style={{
                  backgroundColor: colors.surface,
                  borderBottomColor: colors.border,
                  borderBottomWidth: 1,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text className="text-xs text-muted mt-1">{item.subLabel}</Text>
                {item.content ? (
                  <Text className="text-sm text-muted mt-1" numberOfLines={2}>
                    {item.content}
                  </Text>
                ) : null}
              </Pressable>
            )}
          />
        )
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <MaterialIcons name="hourglass-empty" size={48} color={colors.muted} />
          <Text className="text-muted mt-4">Loading...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3">
          <MaterialIcons name="inbox" size={64} color={colors.muted} />
          <Text className="text-lg font-semibold text-foreground">Inbox Empty</Text>
          <Text className="text-sm text-muted text-center px-4 max-w-xs">
            No items for this filter yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <InboxItem
              item={item}
              onPress={handleItemPress}
              onLongPress={handleItemLongPress}
              onDelete={handleDelete}
              onMoveToLibrary={handleMoveToLibrary}
              onMoveToJournal={handleMoveToJournal}
              onMoveToActions={handleMoveToActions}
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
      <Pressable
        onPress={handleQuickAdd}
        style={({ pressed }) => [
          {
            position: "absolute",
            right: 18,
            bottom: 22,
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primary,
            elevation: 8,
            opacity: pressed ? 0.75 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          },
        ]}
      >
        <MaterialIcons name="add" size={28} color="white" />
      </Pressable>
    </ScreenContainer>
  );
}
