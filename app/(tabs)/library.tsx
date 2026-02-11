import React, { useState, useEffect } from "react";
import { FlatList, Text, View, Pressable, TextInput, ScrollView, RefreshControl, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import { useLibrary } from "@/lib/context/library-context";
import { Item, ItemType } from "@/lib/db/schema";
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
// Library Item Component
// ============================================================================

interface LibraryItemProps {
  item: Item;
  onToggleFavorite: (itemId: string) => Promise<void>;
  onToggleArchive: (itemId: string) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
}

function LibraryItem({ item, onToggleFavorite, onToggleArchive, onDelete }: LibraryItemProps) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);

  const handleToggleFavorite = async () => {
    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await onToggleFavorite(item.id);
    } catch (error) {
      console.error("Error toggling favorite:", error);
      Alert.alert("Error", "Failed to update favorite");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert("Delete Item", "Are you sure you want to delete this item?", [
      { text: "Cancel", onPress: () => {} },
      {
        text: "Delete",
        onPress: async () => {
          try {
            setLoading(true);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await onDelete(item.id);
          } catch (error) {
            console.error("Error deleting item:", error);
            Alert.alert("Error", "Failed to delete item");
          } finally {
            setLoading(false);
          }
        },
        style: "destructive",
      },
    ]);
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
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
            <Text className="text-xs text-muted">{formatDate(item.createdAt)}</Text>
            {item.tags.length > 0 && (
              <>
                <Text className="text-xs text-muted">•</Text>
                <Text className="text-xs text-muted">{item.tags.length} tags</Text>
              </>
            )}
          </View>
        </View>

        {/* Actions */}
        <View className="flex-row gap-2">
          <Pressable
            onPress={handleToggleFavorite}
            disabled={loading}
            style={({ pressed }) => [{ opacity: pressed || loading ? 0.6 : 0.8, padding: 8 }]}
          >
            <MaterialIcons
              name={item.isFavorite ? "favorite" : "favorite-border"}
              size={20}
              color={item.isFavorite ? colors.error : colors.muted}
            />
          </Pressable>
          <Pressable
            onPress={handleDelete}
            disabled={loading}
            style={({ pressed }) => [{ opacity: pressed || loading ? 0.6 : 0.8, padding: 8 }]}
          >
            <MaterialIcons name="delete" size={20} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// Filter Bar Component
// ============================================================================

interface FilterBarProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  sortBy: string;
  onSortChange: (sort: any) => void;
  showFavoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  onClearFilters: () => void;
}

function FilterBar({
  searchText,
  onSearchChange,
  sortBy,
  onSortChange,
  showFavoritesOnly,
  onToggleFavoritesOnly,
  onClearFilters,
}: FilterBarProps) {
  const colors = useColors();
  const [showSortMenu, setShowSortMenu] = useState(false);

  return (
    <View className="bg-background border-b border-border">
      {/* Search Bar */}
      <View className="px-4 py-3 gap-2">
        <View className="flex-row items-center gap-2 bg-surface rounded-8 px-3 py-2 border border-border">
          <MaterialIcons name="search" size={20} color={colors.muted} />
          <TextInput
            placeholder="Search items..."
            value={searchText}
            onChangeText={onSearchChange}
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              color: colors.foreground,
              fontSize: 16,
            }}
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => onSearchChange("")}>
              <MaterialIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pb-3">
        {/* Favorites Filter */}
        <Pressable
          onPress={onToggleFavoritesOnly}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.7 : 1,
              backgroundColor: showFavoritesOnly ? colors.primary : colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
              marginRight: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            },
          ]}
        >
          <MaterialIcons
            name="favorite"
            size={16}
            color={showFavoritesOnly ? "white" : colors.muted}
          />
          <Text
            style={{
              color: showFavoritesOnly ? "white" : colors.foreground,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            Favorites
          </Text>
        </Pressable>

        {/* Sort Menu */}
        <Pressable
          onPress={() => setShowSortMenu(!showSortMenu)}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.7 : 1,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
              marginRight: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            },
          ]}
        >
          <MaterialIcons name="sort" size={16} color={colors.muted} />
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
            Sort
          </Text>
        </Pressable>

        {/* Clear Filters */}
        {(searchText.length > 0 || showFavoritesOnly) && (
          <Pressable
            onPress={onClearFilters}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.7 : 1,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 6,
              },
            ]}
          >
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
              Clear
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Sort Menu Dropdown */}
      {showSortMenu && (
        <View className="px-4 pb-3 gap-2">
          {[
            { label: "Newest First", value: "date-desc" as any },
            { label: "Oldest First", value: "date-asc" as any },
            { label: "Title A-Z", value: "title-asc" as any },
            { label: "Title Z-A", value: "title-desc" as any },
            { label: "By Type", value: "type" as any },
          ].map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                onSortChange(option.value);
                setShowSortMenu(false);
              }}
              style={({ pressed }) => [
                {
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: sortBy === option.value ? colors.primary : colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                },
              ]}
            >
              <Text
                style={{
                  color: sortBy === option.value ? "white" : colors.foreground,
                  fontSize: 14,
                  fontWeight: "500",
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Library Screen
// ============================================================================

export default function LibraryScreen() {
  const colors = useColors();
  const {
    filteredItems,
    loading,
    filters,
    setSearchText,
    setSortBy,
    toggleFavoritesOnly,
    clearFilters,
    loadLibraryItems,
    toggleFavorite,
    deleteItem,
  } = useLibrary();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLibraryItems();
    setRefreshing(false);
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      {/* Header */}
      <View className="px-4 py-4 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Library</Text>
        <Text className="text-xs text-muted mt-1">{filteredItems.length} items</Text>
      </View>

      {/* Filter Bar */}
      <FilterBar
        searchText={filters.searchText}
        onSearchChange={setSearchText}
        sortBy={filters.sortBy}
        onSortChange={setSortBy}
        showFavoritesOnly={filters.showFavoritesOnly}
        onToggleFavoritesOnly={toggleFavoritesOnly}
        onClearFilters={clearFilters}
      />

      {/* Items List */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <MaterialIcons name="hourglass-empty" size={48} color={colors.muted} />
          <Text className="text-muted mt-4">Loading...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3">
          <MaterialIcons name="library-books" size={64} color={colors.muted} />
          <Text className="text-lg font-semibold text-foreground">No Items Found</Text>
          <Text className="text-sm text-muted text-center px-4 max-w-xs">
            {filters.searchText || filters.showFavoritesOnly
              ? "Try adjusting your filters"
              : "Add items from Inbox to build your library"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LibraryItem
              item={item}
              onToggleFavorite={toggleFavorite}
              onToggleArchive={() => Promise.resolve()}
              onDelete={deleteItem}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={{ flexGrow: 1 }}
          scrollEnabled={filteredItems.length > 0}
        />
      )}
    </ScreenContainer>
  );
}
