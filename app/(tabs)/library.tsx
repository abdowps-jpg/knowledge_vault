import React from "react";
import { Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function LibraryScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();

  const { data: items = [], isLoading, error, refetch } = trpc.items.list.useQuery({
    location: "library",
  });

  React.useEffect(() => {
    if (error) {
      console.error("Library query failed:", error);
    }
  }, [error]);

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
              await deleteItem.mutateAsync({ id: itemId });
            } catch (err) {
              console.error("Failed to delete item:", err);
              Alert.alert("Error", "Failed to delete item");
            }
          },
        },
      ]
    );
  };

  const handleMoveToInbox = async (itemId: string) => {
    try {
      setMovingItemId(itemId);
      await moveItem.mutateAsync({
        id: itemId,
        location: "inbox",
      });
    } catch (err) {
      console.error("Failed to move item to inbox:", err);
      Alert.alert("Error", "Failed to move item to inbox");
    }
  };

  return (
    <ScreenContainer>
      <View className="p-4 border-b border-border">
        <View className="flex-row items-center mb-4">
          <MaterialIcons name="library-books" size={32} color={colors.primary} />
          <Text className="text-2xl font-bold text-foreground ml-2">Library</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {isLoading ? (
          <View className="items-center mt-8">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-muted mt-4">Loading library items...</Text>
          </View>
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : items.length === 0 ? (
          <View className="items-center justify-center mt-8">
            <MaterialIcons name="library-books" size={64} color={colors.muted} />
            <Text className="text-muted text-center mt-4">
              No items in Library yet
            </Text>
            <Text className="text-muted text-center mt-2 text-sm">
              Move items from Inbox to keep important notes here
            </Text>
          </View>
        ) : (
          items.map((item: any) => (
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
              {item.content && (
                <Text className="text-muted text-sm mt-1">
                  {item.content}
                </Text>
              )}
              <Text className="text-muted text-xs mt-2">
                {new Date(item.createdAt).toLocaleString("ar-EG")}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
