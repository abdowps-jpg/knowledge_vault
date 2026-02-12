import React, { useState, useEffect } from "react";
import { FlatList, Text, View, Pressable, TextInput, ScrollView } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import { useSearch } from "@/lib/context/search-context";
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

function getPreview(content: string, maxLength: number = 60): string {
  return content.length > maxLength ? `${content.substring(0, maxLength)}...` : content;
}

// ============================================================================
// Search Result Item Component
// ============================================================================

interface SearchResultItemProps {
  item: Item;
}

function SearchResultItem({ item }: SearchResultItemProps) {
  const colors = useColors();

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
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-xs font-semibold text-primary">
              {getItemTypeLabel(item.type)}
            </Text>
            <Text className="text-xs text-muted">•</Text>
            <Text className="text-xs text-muted">{formatDate(item.createdAt)}</Text>
          </View>
          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {item.title || "(Untitled)"}
          </Text>
          <Text className="text-sm text-muted mt-1" numberOfLines={2}>
            {getPreview(item.content)}
          </Text>
          {item.tags.length > 0 && (
            <View className="flex-row gap-1 mt-2 flex-wrap">
              {item.tags.slice(0, 2).map((tag) => (
                <View
                  key={tag}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 4,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ color: "white", fontSize: 10, fontWeight: "600" }}>
                    {tag}
                  </Text>
                </View>
              ))}
              {item.tags.length > 2 && (
                <Text className="text-xs text-muted">+{item.tags.length - 2}</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// Search Screen
// ============================================================================

export default function SearchScreen() {
  const colors = useColors();
  const { searchResults, loading, filters, setSearchText, setType, clearFilters, loadAllItems } =
    useSearch();

  useEffect(() => {
    loadAllItems();
  }, [loadAllItems]);

  const typeOptions = [
    { label: "All", value: "all" },
    { label: "Notes", value: "note" },
    { label: "Quotes", value: "quote" },
    { label: "Links", value: "link" },
    { label: "Audio", value: "audio" },
    { label: "Tasks", value: "task" },
    { label: "Journal", value: "journal" },
  ];

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      {/* Header */}
      <View className="px-4 py-4 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Search</Text>
        <Text className="text-xs text-muted mt-1">Find anything across your knowledge</Text>
      </View>

      {/* Search Bar */}
      <View className="px-4 py-3 border-b border-border gap-3">
        <View className="flex-row items-center gap-2 bg-surface rounded-8 px-3 py-2 border border-border">
          <MaterialIcons name="search" size={20} color={colors.muted} />
          <TextInput
            placeholder="Search notes, quotes, tasks..."
            value={filters.searchText}
            onChangeText={setSearchText}
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              color: colors.foreground,
              fontSize: 16,
            }}
          />
          {filters.searchText.length > 0 && (
            <Pressable onPress={() => setSearchText("")}>
              <MaterialIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Type Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {typeOptions.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                setType(option.value as any);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={({ pressed }) => [
                {
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: filters.type === option.value ? colors.primary : colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 20,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  marginRight: 8,
                },
              ]}
            >
              <Text
                style={{
                  color: filters.type === option.value ? "white" : colors.foreground,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Clear Filters */}
        {(filters.searchText.length > 0 || filters.type !== "all") && (
          <Pressable
            onPress={clearFilters}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.7 : 1,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
                alignSelf: "flex-start",
              },
            ]}
          >
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
              Clear Filters
            </Text>
          </Pressable>
        )}
      </View>

      {/* Results */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <MaterialIcons name="hourglass-empty" size={48} color={colors.muted} />
          <Text className="text-muted mt-4">Loading...</Text>
        </View>
      ) : searchResults.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-4">
          {filters.searchText.length > 0 ? (
            <>
              <MaterialIcons name="search-off" size={64} color={colors.muted} />
              <Text className="text-lg font-semibold text-foreground">No results found</Text>
              <Text className="text-sm text-muted text-center">
                Try different keywords or filters
              </Text>
            </>
          ) : (
            <>
              <MaterialIcons name="search" size={64} color={colors.muted} />
              <Text className="text-lg font-semibold text-foreground">Start searching</Text>
              <Text className="text-sm text-muted text-center">
                Type to search across all your items
              </Text>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SearchResultItem item={item} />}
          contentContainerStyle={{ flexGrow: 1 }}
          scrollEnabled={searchResults.length > 0}
          ListHeaderComponent={
            <View className="px-4 py-3">
              <Text className="text-sm font-semibold text-muted">
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
              </Text>
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}
