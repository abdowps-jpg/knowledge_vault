import React from "react";
import { Text, View, TouchableOpacity, ActivityIndicator, Alert, Modal, Pressable } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { offlineManager } from "@/lib/offline-manager";
import Markdown from "react-native-markdown-display";
import { Image as ExpoImage } from "expo-image";

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

export default function InboxScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();
  const [activeFilter, setActiveFilter] = React.useState<"all" | "favorites">("all");

  const itemsQuery = trpc.items.list.useInfiniteQuery(
    {
      location: "inbox",
      isFavorite: activeFilter === "favorites" ? true : undefined,
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

  React.useEffect(() => {
    if (error) {
      console.error("Inbox query failed:", error);
    }
  }, [error]);

  const addItem = trpc.items.create.useMutation({
    onSuccess: () => {
      // تحديث القائمة بعد الإضافة
      utils.items.list.invalidate();
    },
  });

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

  const handleAddItem = async () => {
    try {
      const input = {
        type: 'note' as const,
        title: 'ملاحظة تجريبية',
        content: 'تم الإضافة في: ' + new Date().toLocaleString('ar-EG'),
      };
      const result = await offlineManager.runOrQueueMutation("items.create", input, () =>
        addItem.mutateAsync(input)
      );
      if ("queued" in (result as any)) {
        Alert.alert("Queued", "Item creation will sync when you're back online.");
      }
    } catch (err) {
      console.error("Failed to create item:", err);
      Alert.alert("Error", "Failed to create item");
    }
  };

  const handleDeleteItem = (itemId: string) => {
    Alert.alert(
      "Delete Item",
      "Are you sure you want to delete this item?",
      [
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
      ]
    );
  };

  const handleMoveToLibrary = async (itemId: string) => {
    try {
      setMovingItemId(itemId);
      const input = {
        id: itemId,
        location: "library" as const,
      };
      const result = await offlineManager.runOrQueueMutation("items.update", input, () =>
        moveItem.mutateAsync(input)
      );
      if ("queued" in (result as any)) {
        Alert.alert("Queued", "Item move will sync when you're back online.");
      }
    } catch (err) {
      console.error("Failed to move item to library:", err);
      Alert.alert("Error", "Failed to move item to library");
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

  return (
    <ScreenContainer>
      <View className="p-4 border-b border-border">
        <View className="flex-row items-center mb-4">
          <MaterialIcons name="inbox" size={32} color={colors.primary} />
          <Text className="text-2xl font-bold text-foreground ml-2">Inbox</Text>
        </View>

        <View className="flex-row mb-3">
          {[
            { label: "All", value: "all" as const },
            { label: "Favorites", value: "favorites" as const },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.value}
              onPress={() => setActiveFilter(tab.value)}
              className="mr-2 px-3 py-1 rounded-full border"
              style={{
                borderColor: colors.border,
                backgroundColor: activeFilter === tab.value ? colors.primary : colors.surface,
              }}
            >
              <Text style={{ color: activeFilter === tab.value ? "white" : colors.foreground, fontSize: 12 }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <TouchableOpacity
          onPress={handleAddItem}
          disabled={addItem.isPending}
          className="bg-primary p-3 rounded-lg"
        >
          {addItem.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-center font-semibold">
              + إضافة ملاحظة تجريبية
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center mt-8">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-muted mt-4">جاري التحميل...</Text>
        </View>
      ) : error ? (
        <View className="flex-1 p-4">
          <ErrorState error={error} onRetry={refetch} />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center mt-8">
          <MaterialIcons name="inbox" size={64} color={colors.muted} />
          <Text className="text-muted text-center mt-4">
            لا توجد عناصر في Inbox
          </Text>
          <Text className="text-muted text-center mt-2 text-sm">
            اضغط الزر أعلاه لإضافة ملاحظة تجريبية
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          <FlashList
            data={items as any[]}
            estimatedItemSize={148}
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
            <View
              key={item.id}
              className="bg-surface p-4 rounded-lg mb-3 border border-border"
            >
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold text-foreground mb-1 flex-1 mr-3">
                  {item.title}
                </Text>
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={() => handleToggleFavorite(item.id)}
                    className="p-1 mr-2"
                  >
                    <MaterialIcons
                      name={item.isFavorite ? "star" : "star-outline"}
                      size={20}
                      color={colors.warning}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleMoveToLibrary(item.id)}
                    disabled={moveItem.isPending && movingItemId === item.id}
                    className="p-1 mr-2"
                  >
                    {moveItem.isPending && movingItemId === item.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <MaterialIcons name="folder" size={20} color={colors.primary} />
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
              {item.content && (
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
              )}
              <ItemAttachments itemId={item.id} />
              <Text className="text-muted text-xs mt-2">
                {new Date(item.createdAt).toLocaleString('ar-EG')}
              </Text>
            </View>
            )}
          />
        </View>
      )}
    </ScreenContainer>
  );
}
