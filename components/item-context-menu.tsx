import React, { useState } from "react";
import { View, Text, Pressable, Modal, Alert, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { useInbox } from "@/lib/context/inbox-context";
import { Item } from "@/lib/db/schema";
import * as Haptics from "expo-haptics";

// ============================================================================
// Item Context Menu Component
// ============================================================================

interface ItemContextMenuProps {
  item: Item | null;
  isVisible: boolean;
  onClose: () => void;
}

export function ItemContextMenu({ item, isVisible, onClose }: ItemContextMenuProps) {
  const colors = useColors();
  const { moveToLibrary, convertToTask, deleteItem } = useInbox();
  const [loading, setLoading] = useState(false);

  if (!item) return null;

  const handleMoveToLibrary = async () => {
    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await moveToLibrary(item.id);
      Alert.alert("Success", "Item moved to Library");
      onClose();
    } catch (error) {
      console.error("Error moving to library:", error);
      Alert.alert("Error", "Failed to move item to library");
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToTask = async () => {
    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await convertToTask(item.id);
      Alert.alert("Success", "Item converted to Task");
      onClose();
    } catch (error) {
      console.error("Error converting to task:", error);
      Alert.alert("Error", "Failed to convert item to task");
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
            await deleteItem(item.id);
            Alert.alert("Success", "Item deleted");
            onClose();
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
    <Modal visible={isVisible} transparent animationType="fade">
      {/* Backdrop */}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Menu Card */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            overflow: "hidden",
            width: "80%",
            maxWidth: 300,
          }}
        >
          {/* Header */}
          <View className="p-4 border-b border-border">
            <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
              {item.title || "(Untitled)"}
            </Text>
          </View>

          {/* Menu Items */}
          <View>
            {/* Move to Library */}
            <Pressable
              onPress={handleMoveToLibrary}
              disabled={loading}
              style={({ pressed }) => [
                {
                  opacity: pressed || loading ? 0.7 : 1,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomColor: colors.border,
                  borderBottomWidth: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                },
              ]}
            >
              <MaterialIcons name="library-books" size={20} color={colors.primary} />
              <Text className="flex-1 text-base font-medium text-foreground">Move to Library</Text>
              {loading && <ActivityIndicator size="small" color={colors.primary} />}
            </Pressable>

            {/* Convert to Task */}
            <Pressable
              onPress={handleConvertToTask}
              disabled={loading}
              style={({ pressed }) => [
                {
                  opacity: pressed || loading ? 0.7 : 1,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomColor: colors.border,
                  borderBottomWidth: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                },
              ]}
            >
              <MaterialIcons name="check-circle" size={20} color={colors.warning} />
              <Text className="flex-1 text-base font-medium text-foreground">Convert to Task</Text>
              {loading && <ActivityIndicator size="small" color={colors.warning} />}
            </Pressable>

            {/* Delete */}
            <Pressable
              onPress={handleDelete}
              disabled={loading}
              style={({ pressed }) => [
                {
                  opacity: pressed || loading ? 0.7 : 1,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                },
              ]}
            >
              <MaterialIcons name="delete" size={20} color={colors.error} />
              <Text className="flex-1 text-base font-medium" style={{ color: colors.error }}>
                Delete
              </Text>
              {loading && <ActivityIndicator size="small" color={colors.error} />}
            </Pressable>
          </View>

          {/* Footer */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.7 : 1,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopColor: colors.border,
                borderTopWidth: 1,
                alignItems: "center",
              },
            ]}
          >
            <Text style={{ color: colors.muted }} className="font-medium">
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
