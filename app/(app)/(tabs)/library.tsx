import React from "react";
import { Text, View, TouchableOpacity, ActivityIndicator, Alert, Modal, Pressable, TextInput } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { FilterBar } from "@/components/filter-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { offlineManager } from "@/lib/offline-manager";
import Markdown from "react-native-markdown-display";
import { Image as ExpoImage } from "expo-image";

type ItemTypeFilter = "all" | "note" | "quote" | "link" | "audio";
type SortFilter = "newest" | "oldest" | "az" | "za";

function ItemAttachments({ itemId }: { itemId: string }) {
  const colors = useColors();
  const [previewImageUri, setPreviewImageUri] = React.useState<string | null>(null);
  const { data: attachments = [], isLoading } = trpc.attachments.list.useQuery({ itemId });

  if (isLoading) {
    return (
      <View className="mt-3">
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!attachments.length) return null;

  return (
    <View className="mt-3">
      <View className="flex-row items-center gap-2">
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
    </View>
  );
}

export default function LibraryScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();

  const [typeFilter, setTypeFilter] = React.useState<ItemTypeFilter>("all");
  const [categoryIdFilter, setCategoryIdFilter] = React.useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = React.useState(false);
  const [recentOnly, setRecentOnly] = React.useState(false);
  const [sortFilter, setSortFilter] = React.useState<SortFilter>("newest");
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newContent, setNewContent] = React.useState("");

  const querySort =
    sortFilter === "newest"
      ? { sortBy: "createdAt" as const, sortOrder: "desc" as const }
      : sortFilter === "oldest"
      ? { sortBy: "createdAt" as const, sortOrder: "asc" as const }
      : sortFilter === "az"
      ? { sortBy: "title" as const, sortOrder: "asc" as const }
      : { sortBy: "title" as const, sortOrder: "desc" as const };

  const itemsQuery = trpc.items.list.useInfiniteQuery(
    {
      location: "library",
      isFavorite: favoritesOnly ? true : undefined,
      type: typeFilter === "all" ? undefined : typeFilter,
      categoryId: categoryIdFilter ?? undefined,
      recentDays: recentOnly ? 7 : undefined,
      sortBy: querySort.sortBy,
      sortOrder: querySort.sortOrder,
      limit: 25,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );
  const items = React.useMemo(
    () => itemsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [itemsQuery.data]
  );
  const { isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = itemsQuery;

  const { data: categories = [], error: categoriesError } = trpc.categories.list.useQuery({
    limit: 200,
  });

  React.useEffect(() => {
    if (error) {
      console.error("Library query failed:", error);
    }
  }, [error]);

  React.useEffect(() => {
    console.log("[Library] Query status:", {
      isLoading,
      total: items.length,
      hasNextPage,
      filters: { typeFilter, favoritesOnly, recentOnly, categoryIdFilter, sortFilter },
    });
  }, [
    categoryIdFilter,
    favoritesOnly,
    hasNextPage,
    isLoading,
    items.length,
    recentOnly,
    sortFilter,
    typeFilter,
  ]);

  React.useEffect(() => {
    if (categoriesError) {
      console.error("Categories query failed:", categoriesError);
    }
  }, [categoriesError]);

  const [deletingItemId, setDeletingItemId] = React.useState<string | null>(null);
  const [movingItemId, setMovingItemId] = React.useState<string | null>(null);

  const deleteItem = trpc.items.delete.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
    },
    onSettled: () => {
      setDeletingItemId(null);
    },
  });

  const moveItem = trpc.items.update.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
    },
    onSettled: () => {
      setMovingItemId(null);
    },
  });

  const toggleFavorite = trpc.items.toggleFavorite.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
    },
  });

  const createItem = trpc.items.create.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
      setShowCreateModal(false);
      setNewTitle("");
      setNewContent("");
    },
  });

  const handleDeleteItem = (itemId: string) => {
    Alert.alert("Delete Item", "Are you sure you want to delete this item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingItemId(itemId);
            const result = await offlineManager.runOrQueueMutation("items.delete", { id: itemId }, () =>
              deleteItem.mutateAsync({ id: itemId })
            );
            if ("queued" in (result as any)) {
              Alert.alert("Queued", "Item deletion will sync when you're back online.");
            }
          } catch (err) {
            console.error("Failed to delete item:", err);
            Alert.alert("Error", "Failed to delete item");
          } finally {
            setDeletingItemId(null);
          }
        },
      },
    ]);
  };

  const handleMoveToInbox = async (itemId: string) => {
    try {
      setMovingItemId(itemId);
      const input = {
        id: itemId,
        location: "inbox" as const,
      };
      const result = await offlineManager.runOrQueueMutation("items.update", input, () =>
        moveItem.mutateAsync(input)
      );
      if ("queued" in (result as any)) {
        Alert.alert("Queued", "Item move will sync when you're back online.");
      }
    } catch (err) {
      console.error("Failed to move item to inbox:", err);
      Alert.alert("Error", "Failed to move item to inbox");
    } finally {
      setMovingItemId(null);
    }
  };

  const handleToggleFavorite = async (itemId: string) => {
    try {
      const result = await offlineManager.runOrQueueMutation("items.toggleFavorite", { id: itemId }, () =>
        toggleFavorite.mutateAsync({ id: itemId })
      );
      if ("queued" in (result as any)) {
        Alert.alert("Queued", "Favorite update will sync when you're back online.");
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
      Alert.alert("Error", "Failed to update favorite");
    }
  };

  const handleCreateLibraryItem = async () => {
    if (!newTitle.trim()) {
      Alert.alert("Validation", "Title is required.");
      return;
    }

    try {
      await createItem.mutateAsync({
        type: "note",
        title: newTitle.trim(),
        content: newContent.trim() || newTitle.trim(),
        location: "library",
      });
    } catch (error) {
      console.error("[Library] Failed creating library item:", error);
      Alert.alert("Error", "Failed to create item.");
    }
  };

  const filterOptions = React.useMemo(() => {
    const base = [
      { key: "all", label: "All Items" },
      { key: "favorites", label: "Favorites Only" },
      { key: "recent", label: "Recent (last 7 days)" },
      { key: "type:note", label: "Type: Notes" },
      { key: "type:quote", label: "Type: Quotes" },
      { key: "type:link", label: "Type: Links" },
      { key: "type:audio", label: "Type: Audio" },
    ];

    const categoryOptions = (categories as any[]).map((category) => ({
      key: `category:${category.id}`,
      label: `Category: ${category.name}`,
    }));

    return [...base, ...categoryOptions];
  }, [categories]);

  const sortOptions = [
    { key: "newest", label: "Newest First" },
    { key: "oldest", label: "Oldest First" },
    { key: "az", label: "A-Z" },
    { key: "za", label: "Z-A" },
  ];

  const handleSelectFilter = (key: string) => {
    if (key === "all") {
      setTypeFilter("all");
      setCategoryIdFilter(null);
      setFavoritesOnly(false);
      setRecentOnly(false);
      return;
    }

    if (key === "favorites") {
      setFavoritesOnly((prev) => !prev);
      return;
    }

    if (key === "recent") {
      setRecentOnly((prev) => !prev);
      return;
    }

    if (key.startsWith("type:")) {
      const value = key.replace("type:", "") as ItemTypeFilter;
      setTypeFilter((prev) => (prev === value ? "all" : value));
      return;
    }

    if (key.startsWith("category:")) {
      const value = key.replace("category:", "");
      setCategoryIdFilter((prev) => (prev === value ? null : value));
    }
  };

  const activeChips = React.useMemo(() => {
    const chips: Array<{ key: string; label: string }> = [];

    if (favoritesOnly) chips.push({ key: "favorites", label: "Favorites Only" });
    if (recentOnly) chips.push({ key: "recent", label: "Recent (7 days)" });
    if (typeFilter !== "all") {
      const labelMap: Record<string, string> = {
        note: "Notes",
        quote: "Quotes",
        link: "Links",
        audio: "Audio",
      };
      chips.push({ key: "type", label: `Type: ${labelMap[typeFilter]}` });
    }
    if (categoryIdFilter) {
      const category = (categories as any[]).find((c) => c.id === categoryIdFilter);
      chips.push({ key: "category", label: `Category: ${category?.name || "Unknown"}` });
    }

    return chips;
  }, [favoritesOnly, recentOnly, typeFilter, categoryIdFilter, categories]);

  const handleRemoveChip = (key: string) => {
    if (key === "favorites") setFavoritesOnly(false);
    if (key === "recent") setRecentOnly(false);
    if (key === "type") setTypeFilter("all");
    if (key === "category") setCategoryIdFilter(null);
  };

  const handleClearAll = () => {
    setTypeFilter("all");
    setCategoryIdFilter(null);
    setFavoritesOnly(false);
    setRecentOnly(false);
    setSortFilter("newest");
  };

  const filteredItems = items as any[];

  return (
    <ScreenContainer>
      <View className="p-4 border-b border-border">
        <View className="flex-row items-center mb-2">
          <MaterialIcons name="library-books" size={32} color={colors.primary} />
          <Text className="text-2xl font-bold text-foreground ml-2">Library</Text>
        </View>
      </View>

      <FilterBar
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        selectedSort={sortFilter}
        onSelectFilter={handleSelectFilter}
        onSelectSort={(key) => setSortFilter(key as SortFilter)}
        activeChips={activeChips}
        onRemoveChip={handleRemoveChip}
        onClearAll={handleClearAll}
      />

      {isLoading ? (
        <View className="flex-1 items-center mt-8">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-muted mt-4">Loading library items...</Text>
        </View>
      ) : error ? (
        <View className="flex-1 p-4">
          <ErrorState error={error} onRetry={refetch} />
        </View>
      ) : filteredItems.length === 0 ? (
        <View className="flex-1 items-center justify-center mt-8">
          <MaterialIcons name="library-books" size={64} color={colors.muted} />
          <Text className="text-muted text-center mt-4">No items found with current filters</Text>
          <Text className="text-muted text-center mt-2 text-sm">
            Try removing some filters or adding more items
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          <FlashList
            data={filteredItems}
            estimatedItemSize={152}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={{ padding: 16 }}
            onEndReachedThreshold={0.35}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View className="py-4">
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : null
            }
            renderItem={({ item }: { item: any }) => (
            <View key={item.id} className="bg-surface p-4 rounded-lg mb-3 border border-border">
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold text-foreground mb-1 flex-1 mr-3">{item.title}</Text>
                <View className="flex-row items-center">
                  <TouchableOpacity onPress={() => handleToggleFavorite(item.id)} className="p-1 mr-2">
                    <MaterialIcons
                      name={item.isFavorite ? "star" : "star-outline"}
                      size={20}
                      color={colors.warning}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleMoveToInbox(item.id)}
                    disabled={moveItem.isPending && movingItemId === item.id}
                    className="p-1 mr-2"
                  >
                    {moveItem.isPending && movingItemId === item.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <MaterialIcons name="inbox" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteItem(item.id)}
                    disabled={deleteItem.isPending && deletingItemId === item.id}
                    className="p-1"
                  >
                    {deleteItem.isPending && deletingItemId === item.id ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <MaterialIcons name="delete" size={20} color={colors.error} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              {item.content ? (
                <View className="mt-1">
                  <Markdown
                    style={{
                      body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
                      paragraph: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 0 },
                      heading1: { color: colors.foreground, fontSize: 18, fontWeight: "700" as const, marginBottom: 4 },
                      strong: { color: colors.foreground, fontWeight: "700" as const },
                      em: { color: colors.muted, fontStyle: "italic" as const },
                    }}
                  >
                    {item.content}
                  </Markdown>
                </View>
              ) : null}
              <ItemAttachments itemId={item.id} />
              <Text className="text-muted text-xs mt-2">{new Date(item.createdAt).toLocaleString("ar-EG")}</Text>
            </View>
            )}
          />
        </View>
      )}
      <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: colors.surface }}>
            <Text className="text-xl font-bold text-foreground mb-3">New Library Note</Text>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Title"
              placeholderTextColor={colors.muted}
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
            <TextInput
              value={newContent}
              onChangeText={setNewContent}
              placeholder="Content"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={{
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                color: colors.foreground,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 14,
                textAlignVertical: "top",
              }}
            />
            <View className="flex-row gap-3">
              <Pressable onPress={() => setShowCreateModal(false)} style={{ flex: 1 }}>
                <View className="rounded-lg py-3 items-center" style={{ backgroundColor: colors.border }}>
                  <Text className="text-foreground font-semibold">Cancel</Text>
                </View>
              </Pressable>
              <Pressable onPress={handleCreateLibraryItem} style={{ flex: 1 }} disabled={createItem.isPending}>
                <View className="rounded-lg py-3 items-center" style={{ backgroundColor: colors.primary }}>
                  {createItem.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-semibold">Create</Text>
                  )}
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Pressable
        onPress={() => setShowCreateModal(true)}
        style={{
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
        }}
      >
        <MaterialIcons name="add" size={28} color="white" />
      </Pressable>
    </ScreenContainer>
  );
}
