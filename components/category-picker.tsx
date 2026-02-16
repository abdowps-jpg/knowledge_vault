import React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

interface CategoryPickerProps {
  visible: boolean;
  selectedCategoryId?: string | null;
  onClose: () => void;
  onSelect: (categoryId: string | null) => void;
}

export function CategoryPicker({
  visible,
  selectedCategoryId,
  onClose,
  onSelect,
}: CategoryPickerProps) {
  const colors = useColors();
  const utils = trpc.useUtils();
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newIcon, setNewIcon] = React.useState("folder");

  const { data: categories = [], isLoading, error, refetch } = trpc.categories.list.useQuery(
    { limit: 200 },
    { enabled: visible }
  );

  const createCategory = trpc.categories.create.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      setShowCreateForm(false);
      setNewName("");
      setNewIcon("folder");
    },
  });

  const handleSelect = (categoryId: string | null) => {
    onSelect(categoryId);
    onClose();
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert("Error", "Category name is required");
      return;
    }

    try {
      await createCategory.mutateAsync({
        name,
        icon: newIcon.trim() || "folder",
      });
    } catch (err) {
      console.error("Failed to create category:", err);
      Alert.alert("Error", "Failed to create category");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="rounded-t-3xl p-6 max-h-3/4" style={{ backgroundColor: colors.surface }}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-bold text-foreground">Choose Category</Text>
            <Pressable onPress={onClose}>
              <MaterialIcons name="close" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          {isLoading ? (
            <View className="items-center py-8">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text className="text-muted mt-3">Loading categories...</Text>
            </View>
          ) : error ? (
            <View className="items-center py-8">
              <MaterialIcons name="error-outline" size={48} color={colors.error} />
              <Text style={{ color: colors.error }} className="mt-2">
                Failed to load categories
              </Text>
              <Pressable
                onPress={() => refetch()}
                className="mt-3 px-4 py-2 rounded-lg border"
                style={{ borderColor: colors.error }}
              >
                <Text style={{ color: colors.error, fontWeight: "600" }}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable
                onPress={() => handleSelect(null)}
                className="bg-background rounded-lg border p-3 mb-3 flex-row items-center"
                style={{
                  borderColor: selectedCategoryId ? colors.border : colors.primary,
                }}
              >
                <MaterialIcons name="block" size={18} color={colors.muted} />
                <Text className="text-foreground ml-2">No Category</Text>
              </Pressable>

              <View className="flex-row flex-wrap -mx-1">
                {(categories as any[]).map((category) => {
                  const isSelected = selectedCategoryId === category.id;
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => handleSelect(category.id)}
                      className="w-1/3 px-1 mb-2"
                    >
                      <View
                        className="rounded-lg border p-3 items-center"
                        style={{
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? colors.background : colors.surface,
                        }}
                      >
                        <MaterialIcons
                          name={(category.icon || "folder") as any}
                          size={22}
                          color={isSelected ? colors.primary : colors.foreground}
                        />
                        <Text className="text-xs text-foreground mt-2 text-center" numberOfLines={1}>
                          {category.name}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => setShowCreateForm((prev) => !prev)}
                className="bg-primary rounded-lg p-3 items-center mt-2"
              >
                <Text className="text-white font-semibold">Create New Category</Text>
              </Pressable>

              {showCreateForm ? (
                <View className="mt-3 bg-background border border-border rounded-lg p-3">
                  <TextInput
                    placeholder="Category name"
                    placeholderTextColor={colors.muted}
                    value={newName}
                    onChangeText={setNewName}
                    className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
                    style={{ color: colors.foreground }}
                  />
                  <TextInput
                    placeholder="Icon name (e.g. folder, star, work)"
                    placeholderTextColor={colors.muted}
                    value={newIcon}
                    onChangeText={setNewIcon}
                    className="bg-surface border border-border rounded-lg p-3 text-foreground mb-3"
                    style={{ color: colors.foreground }}
                  />
                  <Pressable
                    onPress={handleCreate}
                    disabled={createCategory.isPending}
                    className="bg-primary rounded-lg p-3 items-center"
                  >
                    {createCategory.isPending ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-white font-semibold">Save Category</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
