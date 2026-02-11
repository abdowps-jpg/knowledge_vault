import React, { useState, useEffect } from "react";
import { FlatList, Text, View, Pressable, RefreshControl, GestureResponderEvent } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import { useInbox } from "@/lib/context/inbox-context";
import { Item, ItemType } from "@/lib/db/schema";
import { QuickAddModal } from "@/components/quick-add-modal";
import { ItemContextMenu } from "@/components/item-context-menu";
import * as Haptics from "expo-haptics";

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
  onLongPress: (item: Item) => void;
  onDelete: (itemId: string) => void;
}

function InboxItem({ item, onLongPress, onDelete }: InboxItemProps) {
  const colors = useColors();
  const [showDelete, setShowDelete] = useState(false);

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
          <Text className="text-sm text-muted mt-1" numberOfLines={2}>
            {getPreview(item.content)}
          </Text>
          <View className="flex-row items-center gap-2 mt-2">
            <Text className="text-xs text-muted">{getItemTypeLabel(item.type)}</Text>
            <Text className="text-xs text-muted">•</Text>
            <Text className="text-xs text-muted">{formatDate(item.createdAt)}</Text>
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
    </Pressable>
  );
}

// ============================================================================
// Inbox Screen
// ============================================================================

export default function InboxScreen() {
  const colors = useColors();
  const { items, loading, openQuickAdd, loadInboxItems, deleteItem } = useInbox();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);

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
              onLongPress={handleItemLongPress}
              onDelete={handleDelete}
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
      <QuickAddModal />

      {/* Context Menu */}
      <ItemContextMenu
        item={selectedItem}
        isVisible={showContextMenu}
        onClose={() => {
          setShowContextMenu(false);
          setSelectedItem(null);
        }}
      />
    </ScreenContainer>
  );
}
