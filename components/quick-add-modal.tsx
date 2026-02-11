import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal, ActivityIndicator, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { useInbox } from "@/lib/context/inbox-context";
import { ItemType } from "@/lib/db/schema";
import * as Haptics from "expo-haptics";

// ============================================================================
// Tab Component
// ============================================================================

interface TabProps {
  label: string;
  icon: string;
  isActive: boolean;
  onPress: () => void;
}

function Tab({ label, icon, isActive, onPress }: TabProps) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.7 : 1,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: isActive ? colors.primary : "transparent",
          marginRight: 8,
        },
      ]}
    >
      <View className="flex-row items-center gap-2">
        <MaterialIcons name={icon as any} size={18} color={isActive ? "white" : colors.muted} />
        <Text style={{ color: isActive ? "white" : colors.muted, fontSize: 12, fontWeight: isActive ? "600" : "500" }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

// ============================================================================
// Quick Add Modal Component
// ============================================================================

export function QuickAddModal() {
  const colors = useColors();
  const { quickAddModal, closeQuickAdd, setActiveTab, addItem } = useInbox();
  const [loading, setLoading] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [author, setAuthor] = useState("");

  // Reset form
  const resetForm = () => {
    setTitle("");
    setContent("");
    setUrl("");
    setSource("");
    setAuthor("");
  };

  // Handle save
  const handleSave = async () => {
    try {
      setLoading(true);

      if (!title.trim()) {
        Alert.alert("Error", "Please enter a title");
        return;
      }

      let itemData: any = {
        type: quickAddModal.activeTab === "quote" ? ItemType.QUOTE : quickAddModal.activeTab === "link" ? ItemType.LINK : ItemType.NOTE,
        title: title.trim(),
        content: content.trim() || title.trim(),
        tags: [],
        isFavorite: false,
        isArchived: false,
      };

      // Add type-specific fields
      if (quickAddModal.activeTab === "quote") {
        itemData.source = source.trim();
        itemData.author = author.trim();
      } else if (quickAddModal.activeTab === "link") {
        if (!url.trim()) {
          Alert.alert("Error", "Please enter a URL");
          return;
        }
        itemData.url = url.trim();
      }

      await addItem(itemData);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      resetForm();
      closeQuickAdd();
    } catch (error) {
      console.error("Error saving item:", error);
      Alert.alert("Error", "Failed to save item");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    closeQuickAdd();
  };

  return (
    <Modal visible={quickAddModal.isOpen} animationType="slide" transparent={false}>
      {/* Header */}
      <View style={{ backgroundColor: colors.background, paddingTop: 16 }} className="border-b border-border">
        <View className="flex-row items-center justify-between px-4 py-4">
          <Text className="text-xl font-bold text-foreground">Add to Inbox</Text>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pb-4">
          <Tab
            label="Note"
            icon="note"
            isActive={quickAddModal.activeTab === "note"}
            onPress={() => setActiveTab("note")}
          />
          <Tab
            label="Quote"
            icon="format-quote"
            isActive={quickAddModal.activeTab === "quote"}
            onPress={() => setActiveTab("quote")}
          />
          <Tab
            label="Link"
            icon="link"
            isActive={quickAddModal.activeTab === "link"}
            onPress={() => setActiveTab("link")}
          />
          <Tab
            label="Audio"
            icon="mic"
            isActive={quickAddModal.activeTab === "audio"}
            onPress={() => setActiveTab("audio")}
          />
          <Tab
            label="Task"
            icon="check-circle"
            isActive={quickAddModal.activeTab === "task"}
            onPress={() => setActiveTab("task")}
          />
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 bg-background">
        <View className="p-4 gap-4">
          {/* Note Tab */}
          {quickAddModal.activeTab === "note" && (
            <>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Title</Text>
                <TextInput
                  placeholder="Note title"
                  value={title}
                  onChangeText={setTitle}
                  placeholderTextColor={colors.muted}
                  style={{
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                  }}
                />
              </View>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Content</Text>
                <TextInput
                  placeholder="Write your note..."
                  value={content}
                  onChangeText={setContent}
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={6}
                  style={{
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                    textAlignVertical: "top",
                  }}
                />
              </View>
            </>
          )}

          {/* Quote Tab */}
          {quickAddModal.activeTab === "quote" && (
            <>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Quote</Text>
                <TextInput
                  placeholder="Enter the quote..."
                  value={title}
                  onChangeText={setTitle}
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={4}
                  style={{
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                    textAlignVertical: "top",
                  }}
                />
              </View>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Author</Text>
                <TextInput
                  placeholder="Author name"
                  value={author}
                  onChangeText={setAuthor}
                  placeholderTextColor={colors.muted}
                  style={{
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                  }}
                />
              </View>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Source</Text>
                <TextInput
                  placeholder="Book, article, etc."
                  value={source}
                  onChangeText={setSource}
                  placeholderTextColor={colors.muted}
                  style={{
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                  }}
                />
              </View>
            </>
          )}

          {/* Link Tab */}
          {quickAddModal.activeTab === "link" && (
            <>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">URL</Text>
                <TextInput
                  placeholder="https://example.com"
                  value={url}
                  onChangeText={setUrl}
                  placeholderTextColor={colors.muted}
                  keyboardType="url"
                  style={{
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                  }}
                />
              </View>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Title (Optional)</Text>
                <TextInput
                  placeholder="Link title"
                  value={title}
                  onChangeText={setTitle}
                  placeholderTextColor={colors.muted}
                  style={{
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                  }}
                />
              </View>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Notes (Optional)</Text>
                <TextInput
                  placeholder="Add notes about this link..."
                  value={content}
                  onChangeText={setContent}
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={4}
                  style={{
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                    textAlignVertical: "top",
                  }}
                />
              </View>
            </>
          )}

          {/* Audio Tab */}
          {quickAddModal.activeTab === "audio" && (
            <View className="items-center justify-center py-12 gap-4">
              <MaterialIcons name="mic" size={64} color={colors.primary} />
              <Text className="text-lg font-semibold text-foreground">Audio Recording</Text>
              <Text className="text-sm text-muted text-center px-4">
                Audio recording feature coming soon. You'll be able to record voice notes and automatically transcribe them.
              </Text>
            </View>
          )}

          {/* Task Tab */}
          {quickAddModal.activeTab === "task" && (
            <>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Task Title</Text>
                <TextInput
                  placeholder="What do you need to do?"
                  value={title}
                  onChangeText={setTitle}
                  placeholderTextColor={colors.muted}
                  style={{
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                  }}
                />
              </View>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Description (Optional)</Text>
                <TextInput
                  placeholder="Add more details..."
                  value={content}
                  onChangeText={setContent}
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={4}
                  style={{
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                    textAlignVertical: "top",
                  }}
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={{ backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: 1 }} className="p-4 gap-3">
        <Pressable
          onPress={handleSave}
          disabled={loading}
          style={({ pressed }) => [
            {
              opacity: pressed || loading ? 0.7 : 1,
              backgroundColor: colors.primary,
              borderRadius: 8,
              paddingVertical: 12,
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">Save to Inbox</Text>
          )}
        </Pressable>
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.7 : 1,
              backgroundColor: colors.surface,
              borderRadius: 8,
              paddingVertical: 12,
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <Text style={{ color: colors.foreground }} className="font-semibold text-base">
            Cancel
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
