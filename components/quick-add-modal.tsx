import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal, ActivityIndicator, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { useInbox } from "@/lib/context/inbox-context";
import { ItemType } from "@/lib/db/schema";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { AudioRecorderModal } from "./audio-recorder-modal";
import { trpc } from "@/lib/trpc";
import { RichTextEditor } from "./rich-text-editor";
import { Image as ExpoImage } from "expo-image";

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
  const utils = trpc.useUtils();
  const [loading, setLoading] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState<string | null>(null);

  const createAttachment = trpc.attachments.create.useMutation({
    onSuccess: () => {
      utils.attachments.list.invalidate();
    },
  });

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
    setSelectedImageUri(null);
    setSelectedImageBase64(null);
    setSelectedImageName(null);
  };

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow photo access to attach images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const mimeType = asset.mimeType || "image/jpeg";
      let base64Payload = asset.base64 || "";

      // Compress image before storing in base64 to reduce memory and DB size.
      if (asset.uri) {
        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: Math.min(asset.width || 1200, 1200) } }],
          { compress: 0.45, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (manipulated.base64) {
          base64Payload = manipulated.base64;
        }
      }

      if (!base64Payload) {
        Alert.alert("Error", "Could not read selected image.");
        return;
      }

      setSelectedImageUri(asset.uri);
      setSelectedImageBase64(`data:${mimeType};base64,${base64Payload}`);
      setSelectedImageName(asset.fileName || `image-${Date.now()}.jpg`);
    } catch (error) {
      console.error("Error selecting image:", error);
      Alert.alert("Error", "Failed to select image");
    }
  };

  React.useEffect(() => {
    if (!quickAddModal.isOpen) return;
    if (!quickAddModal.autoPickImage) return;
    if (selectedImageUri) return;
    if (quickAddModal.activeTab !== "note") return;

    handlePickImage();
  }, [
    quickAddModal.isOpen,
    quickAddModal.autoPickImage,
    quickAddModal.activeTab,
    selectedImageUri,
  ]);

  // Handle audio save
  const handleSaveAudio = async (audioContent: string) => {
    try {
      setLoading(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await addItem({
        type: ItemType.AUDIO,
        title: "Voice Note",
        content: audioContent,
        tags: [],
        isFavorite: false,
        isArchived: false,
      });
      setShowAudioRecorder(false);
      closeQuickAdd();
    } catch (error) {
      console.error("Error saving audio:", error);
      Alert.alert("Error", "Failed to save audio note");
    } finally {
      setLoading(false);
    }
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

      const newItem = await addItem(itemData);

      if (newItem?.id && selectedImageBase64 && selectedImageName) {
        await createAttachment.mutateAsync({
          itemId: newItem.id,
          fileUrl: selectedImageBase64,
          filename: selectedImageName,
          type: "image",
        });
      }

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
            label="Record Audio"
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
          {/* Image Attachment */}
          <View>
            <Pressable
              onPress={handlePickImage}
              style={({ pressed }) => [
                {
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  flexDirection: "row",
                  alignItems: "center",
                },
              ]}
            >
              <Text className="text-foreground font-semibold">📎 Attach Image</Text>
            </Pressable>

            {selectedImageUri ? (
              <View className="mt-2 flex-row items-center">
                <ExpoImage
                  source={{ uri: selectedImageUri }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  style={{ width: 72, height: 72, borderRadius: 8, marginRight: 10 }}
                />
                <Pressable
                  onPress={() => {
                    setSelectedImageUri(null);
                    setSelectedImageBase64(null);
                    setSelectedImageName(null);
                  }}
                >
                  <MaterialIcons name="close" size={20} color={colors.error} />
                </Pressable>
              </View>
            ) : null}
          </View>

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
                <RichTextEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Write your note in markdown..."
                  minHeight={180}
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
              <Pressable
                onPress={() => setShowAudioRecorder(true)}
                style={({ pressed }) => [{
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  paddingVertical: 12,
                  paddingHorizontal: 24,
                  gap: 8,
                  flexDirection: "row",
                  alignItems: "center",
                }]}
              >
                <MaterialIcons name="mic" size={24} color="white" />
                <Text className="text-base font-semibold text-white">Start Recording</Text>
              </Pressable>
              <Text className="text-sm text-muted text-center px-4">
                Tap to record a voice note. Transcription can be triggered after recording.
              </Text>
              <Pressable
                onPress={() => Alert.alert("Coming Soon", "TODO: Integrate transcription API call.")}
                style={({ pressed }) => [
                  {
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                  },
                ]}
              >
                <Text className="text-foreground font-semibold">Transcribe (Coming Soon)</Text>
              </Pressable>
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

      {/* Audio Recorder Modal */}
      <AudioRecorderModal
        visible={showAudioRecorder}
        onClose={() => setShowAudioRecorder(false)}
        onSave={handleSaveAudio}
      />

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
