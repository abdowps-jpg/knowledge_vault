import React from "react";
import { Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function InboxScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();

  // استخدام React Query hook
  const { data: items = [], isLoading, error, refetch } = trpc.items.list.useQuery({ 
    location: 'inbox' 
  });

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

  const handleAddItem = async () => {
    try {
      await addItem.mutateAsync({
        type: 'note',
        title: 'ملاحظة تجريبية',
        content: 'تم الإضافة في: ' + new Date().toLocaleString('ar-EG'),
      });
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

  const handleMoveToLibrary = async (itemId: string) => {
    try {
      setMovingItemId(itemId);
      await moveItem.mutateAsync({
        id: itemId,
        location: "library",
      });
    } catch (err) {
      console.error("Failed to move item to library:", err);
      Alert.alert("Error", "Failed to move item to library");
    }
  };

  return (
    <ScreenContainer>
      <View className="p-4 border-b border-border">
        <View className="flex-row items-center mb-4">
          <MaterialIcons name="inbox" size={32} color={colors.primary} />
          <Text className="text-2xl font-bold text-foreground ml-2">Inbox</Text>
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

      <ScrollView className="flex-1 p-4">
        {isLoading ? (
          <View className="items-center mt-8">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-muted mt-4">جاري التحميل...</Text>
          </View>
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : items.length === 0 ? (
          <View className="items-center justify-center mt-8">
            <MaterialIcons name="inbox" size={64} color={colors.muted} />
            <Text className="text-muted text-center mt-4">
              لا توجد عناصر في Inbox
            </Text>
            <Text className="text-muted text-center mt-2 text-sm">
              اضغط الزر أعلاه لإضافة ملاحظة تجريبية
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
                <Text className="text-muted text-sm mt-1">
                  {item.content}
                </Text>
              )}
              <Text className="text-muted text-xs mt-2">
                {new Date(item.createdAt).toLocaleString('ar-EG')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
