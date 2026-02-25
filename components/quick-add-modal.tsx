import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal, ActivityIndicator, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
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
import { VoiceInputButton } from "./voice-input-button";
import { QUICK_TEMPLATES, type QuickTemplate } from "@/lib/templates";

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
  const router = useRouter();
  const { quickAddModal, closeQuickAdd, setActiveTab, addItem } = useInbox();
  const utils = trpc.useUtils();
  const DESTINATION_KEY = "quick_add_destination";
  const [loading, setLoading] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
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
  const [destination, setDestination] = useState<"inbox" | "library" | "actions">("inbox");
  const noteTemplates = [
    { label: "Meeting Notes", title: "Meeting Notes", content: "- Agenda\n- Decisions\n- Next steps" },
    { label: "Daily Plan", title: "Daily Plan", content: "- Top 3 priorities\n- Time blocks\n- End-of-day review" },
    { label: "Idea", title: "New Idea", content: "Problem:\nSolution:\nWhy now:\nFirst step:" },
  ];
  const quoteTemplates = [
    { label: "Book Quote", quote: "Quote text...", author: "Author Name", source: "Book Title" },
    { label: "Podcast Quote", quote: "Quote text...", author: "Speaker Name", source: "Podcast Episode" },
  ];
  const linkTemplates = [
    { label: "Article", title: "Interesting Article", content: "Key takeaway:\nAction item:" },
    { label: "Tool", title: "Useful Tool", content: "What it does:\nWhen to use:" },
  ];
  const taskTemplates = [
    { label: "Follow Up", title: "Follow up with client", content: "Send follow-up message and next steps." },
    { label: "Meeting", title: "Prepare meeting agenda", content: "Draft agenda and key discussion points." },
    { label: "شراء", title: "شراء احتياجات", content: "اكتب قائمة المشتريات المطلوبة." },
    { label: "Review", title: "Review weekly goals", content: "Check progress and adjust next priorities." },
  ];

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

  const applyTemplate = (template: QuickTemplate) => {
    try {
      setTitle(template.title);
      setContent(template.content);
      setActiveTab(template.targetTab);
      setShowTemplateModal(false);
    } catch (error) {
      console.error("Failed applying template:", error);
      Alert.alert("Error", "Failed to apply template.");
    }
  };

  React.useEffect(() => {
    if (!quickAddModal.isOpen) return;
    AsyncStorage.getItem(DESTINATION_KEY)
      .then((value) => {
        if (value === "inbox" || value === "library" || value === "actions") {
          setDestination(value);
        }
      })
      .catch((error) => {
        console.error("Failed reading quick add destination:", error);
      });
  }, [quickAddModal.isOpen]);

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
      resetForm();
      closeQuickAdd();
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(app)/(tabs)" as any);
      }
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

      if (destination === "actions") {
        itemData.type = ItemType.TASK;
        itemData.priority = "medium";
        itemData.isCompleted = false;
        itemData.recurrencePattern = "none";
      }

      if (destination === "library") {
        itemData.categoryId = itemData.categoryId ?? "library";
      }

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
      await AsyncStorage.setItem(DESTINATION_KEY, destination);
      console.log("[QuickAdd] Saved item:", newItem?.id, "destination:", destination);

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
      if (destination === "actions") {
        router.replace("/(app)/(tabs)/actions" as any);
      } else if (destination === "library") {
        router.replace("/(app)/(tabs)/library" as any);
      } else {
        router.replace("/(app)/(tabs)" as any);
      }
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
        <View className="px-4 pb-3">
          <Pressable
            onPress={() => setShowTemplateModal(true)}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.75 : 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                backgroundColor: colors.surface,
                paddingVertical: 9,
                paddingHorizontal: 12,
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
              },
            ]}
          >
            <MaterialIcons name="view-list" size={18} color={colors.primary} />
            <Text style={{ color: colors.foreground, fontWeight: "700", marginLeft: 8 }}>Use Template</Text>
          </Pressable>
        </View>
        <View className="px-4 pb-4">
          <Text className="text-xs font-semibold mb-2" style={{ color: colors.muted }}>
            Save To
          </Text>
          <View className="gap-2">
            {[
              { key: "inbox", label: "Inbox" },
              { key: "library", label: "Library" },
              { key: "actions", label: "Actions" },
            ].map((option) => (
              <Pressable
                key={option.key}
                onPress={() => setDestination(option.key as "inbox" | "library" | "actions")}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <MaterialIcons
                  name={destination === option.key ? "radio-button-checked" : "radio-button-unchecked"}
                  size={18}
                  color={destination === option.key ? colors.primary : colors.muted}
                />
                <Text style={{ color: colors.foreground, fontWeight: "600", marginLeft: 8 }}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 bg-background" keyboardShouldPersistTaps="handled">
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
                <Text className="text-sm font-semibold text-foreground mb-2">Quick Templates</Text>
                <View className="flex-row flex-wrap gap-2">
                  {noteTemplates.map((template) => (
                    <Pressable
                      key={template.label}
                      onPress={() => {
                        setTitle(template.title);
                        setContent(template.content);
                      }}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                        {template.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
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
                <VoiceInputButton
                  label="Mic for note title"
                  onTranscript={(spoken) => setTitle((prev) => `${prev} ${spoken}`.trim())}
                />
              </View>
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Content</Text>
                <VoiceInputButton
                  label="Mic for note content"
                  onTranscript={(spoken) => setContent((prev) => `${prev} ${spoken}`.trim())}
                />
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
                <Text className="text-sm font-semibold text-foreground mb-2">Quick Templates</Text>
                <View className="flex-row flex-wrap gap-2">
                  {quoteTemplates.map((template) => (
                    <Pressable
                      key={template.label}
                      onPress={() => {
                        setTitle(template.quote);
                        setAuthor(template.author);
                        setSource(template.source);
                      }}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                        {template.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
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
                <VoiceInputButton
                  label="Mic for quote"
                  onTranscript={(spoken) => setTitle((prev) => `${prev} ${spoken}`.trim())}
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
                <Text className="text-sm font-semibold text-foreground mb-2">Quick Templates</Text>
                <View className="flex-row flex-wrap gap-2">
                  {linkTemplates.map((template) => (
                    <Pressable
                      key={template.label}
                      onPress={() => {
                        setTitle(template.title);
                        setContent(template.content);
                      }}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                        {template.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
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
                <VoiceInputButton
                  label="Mic for URL"
                  onTranscript={(spoken) => setUrl((prev) => `${prev} ${spoken}`.trim())}
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
                <Text className="text-sm font-semibold text-foreground mb-2">Quick Templates</Text>
                <View className="flex-row flex-wrap gap-2">
                  {taskTemplates.map((template) => (
                    <Pressable
                      key={template.label}
                      onPress={() => {
                        setTitle(template.title);
                        setContent(template.content);
                      }}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                        {template.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
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
                <VoiceInputButton
                  label="Mic for task title"
                  onTranscript={(spoken) => setTitle((prev) => `${prev} ${spoken}`.trim())}
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
                <VoiceInputButton
                  label="Mic for task description"
                  onTranscript={(spoken) => setContent((prev) => `${prev} ${spoken}`.trim())}
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showTemplateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTemplateModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6 max-h-3/4" style={{ backgroundColor: colors.surface }}>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-foreground">Choose Template</Text>
              <Pressable onPress={() => setShowTemplateModal(false)}>
                <MaterialIcons name="close" size={22} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {QUICK_TEMPLATES.map((template) => (
                <Pressable
                  key={template.id}
                  onPress={() => applyTemplate(template)}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    backgroundColor: colors.background,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontWeight: "700" }}>{template.name}</Text>
                  <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }} numberOfLines={2}>
                    {template.content}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
            <Text className="text-white font-semibold text-base">
              {destination === "inbox" ? "Save to Inbox" : destination === "library" ? "Save to Library" : "Save to Actions"}
            </Text>
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
