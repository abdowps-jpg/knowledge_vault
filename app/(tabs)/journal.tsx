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
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const MOOD_EMOJI: Record<string, string> = {
  happy: "😄",
  calm: "😌",
  neutral: "😐",
  sad: "😔",
  frustrated: "😤",
  tired: "😴",
};

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTimeLabel(value: unknown): string {
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

export default function JournalScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();

  const today = React.useMemo(() => getTodayDateString(), []);

  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showEntryModal, setShowEntryModal] = React.useState(false);
  const [selectedEntry, setSelectedEntry] = React.useState<any | null>(null);

  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [mood, setMood] = React.useState("");
  const [contentError, setContentError] = React.useState("");
  const [deletingEntryId, setDeletingEntryId] = React.useState<string | null>(null);

  const { data: entries = [], isLoading, error, refetch } = trpc.journal.list.useQuery({
    startDate: today,
    endDate: today,
    limit: 100,
  });

  React.useEffect(() => {
    if (error) {
      console.error("Journal query failed:", error);
    }
  }, [error]);

  const createEntry = trpc.journal.create.useMutation({
    onSuccess: () => {
      utils.journal.list.invalidate();
      setShowCreateModal(false);
      setTitle("");
      setContent("");
      setMood("");
      setContentError("");
    },
  });

  const deleteEntry = trpc.journal.delete.useMutation({
    onSuccess: () => {
      utils.journal.list.invalidate();
    },
    onSettled: () => {
      setDeletingEntryId(null);
    },
  });

  const handleCreate = async () => {
    const cleanContent = content.trim();
    if (!cleanContent) {
      setContentError("Content is required");
      return;
    }

    setContentError("");
    try {
      await createEntry.mutateAsync({
        entryDate: today,
        title: title.trim() || null,
        content: cleanContent,
        mood: mood.trim() || null,
        location: null,
        weather: null,
      });
    } catch (err) {
      console.error("Failed to create journal entry:", err);
      Alert.alert("Error", "Failed to create journal entry");
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Entry", "Are you sure you want to delete this entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingEntryId(id);
            await deleteEntry.mutateAsync({ id });
          } catch (err) {
            console.error("Failed to delete journal entry:", err);
            Alert.alert("Error", "Failed to delete journal entry");
          }
        },
      },
    ]);
  };

  const openEntry = (entry: any) => {
    setSelectedEntry(entry);
    setShowEntryModal(true);
  };

  return (
    <ScreenContainer>
      <View className="p-4 border-b border-border">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <MaterialIcons name="book" size={32} color={colors.primary} />
            <Text className="text-2xl font-bold text-foreground ml-2">Journal</Text>
          </View>
          <Pressable
            onPress={() => setShowCreateModal(true)}
            className="bg-primary rounded-lg p-2 items-center justify-center"
          >
            <MaterialIcons name="add" size={22} color="white" />
          </Pressable>
        </View>
        <Text className="text-muted mt-2">{new Date().toLocaleDateString("ar-EG")}</Text>
      </View>

      <ScrollView className="flex-1 p-4">
        {isLoading ? (
          <View className="items-center mt-8">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-muted mt-4">Loading entries...</Text>
          </View>
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : entries.length === 0 ? (
          <View className="items-center justify-center mt-8">
            <MaterialIcons name="menu-book" size={64} color={colors.muted} />
            <Text className="text-muted text-center mt-4">No entries for today</Text>
          </View>
        ) : (
          (entries as any[]).map((entry) => {
            const moodEmoji = entry.mood ? MOOD_EMOJI[entry.mood] || "🙂" : "🙂";
            const isDeleting = deleteEntry.isPending && deletingEntryId === entry.id;

            return (
              <View key={entry.id} className="bg-surface p-4 rounded-lg mb-3 border border-border">
                <View className="flex-row items-start justify-between">
                  <Pressable onPress={() => openEntry(entry)} className="flex-1 mr-3">
                    <View className="flex-row items-center mb-1">
                      <Text className="text-lg mr-2">{moodEmoji}</Text>
                      <Text className="font-semibold text-foreground flex-1">
                        {entry.title || "Untitled Entry"}
                      </Text>
                    </View>
                    <Text className="text-muted text-sm" numberOfLines={3}>
                      {entry.content}
                    </Text>
                    <Text className="text-muted text-xs mt-2">{getTimeLabel(entry.createdAt)}</Text>
                  </Pressable>

                  <Pressable onPress={() => handleDelete(entry.id)} disabled={isDeleting} className="p-1">
                    {isDeleting ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <MaterialIcons name="delete" size={20} color={colors.error} />
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6 max-h-3/4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-xl font-bold text-foreground mb-4">New Entry</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput
                placeholder="Title (optional)"
                placeholderTextColor={colors.muted}
                value={title}
                onChangeText={setTitle}
                className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
                style={{ color: colors.foreground }}
              />
              <TextInput
                placeholder="How was your day?"
                placeholderTextColor={colors.muted}
                value={content}
                onChangeText={(value) => {
                  setContent(value);
                  if (contentError) setContentError("");
                }}
                multiline
                numberOfLines={5}
                className="bg-background border border-border rounded-lg p-3 text-foreground mb-1"
                style={{ color: colors.foreground, textAlignVertical: "top" }}
              />
              {contentError ? (
                <Text className="text-xs mb-3" style={{ color: colors.error }}>
                  {contentError}
                </Text>
              ) : (
                <View className="mb-3" />
              )}
              <TextInput
                placeholder="Mood (happy, calm, neutral...)"
                placeholderTextColor={colors.muted}
                value={mood}
                onChangeText={setMood}
                className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
                style={{ color: colors.foreground }}
              />
            </ScrollView>
            <View className="flex-row gap-3 mt-4">
              <Pressable onPress={() => setShowCreateModal(false)} style={{ flex: 1 }}>
                <View className="bg-border rounded-lg py-3 items-center">
                  <Text className="text-foreground font-semibold">Cancel</Text>
                </View>
              </Pressable>
              <Pressable onPress={handleCreate} disabled={createEntry.isPending} style={{ flex: 1 }}>
                <View className="bg-primary rounded-lg py-3 items-center">
                  {createEntry.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-semibold">Save</Text>
                  )}
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showEntryModal} transparent animationType="fade" onRequestClose={() => setShowEntryModal(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6 max-h-3/4" style={{ backgroundColor: colors.surface }}>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-foreground">Entry Details</Text>
              <Pressable onPress={() => setShowEntryModal(false)}>
                <MaterialIcons name="close" size={22} color={colors.foreground} />
              </Pressable>
            </View>
            {selectedEntry ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="flex-row items-center mb-2">
                  <Text className="text-lg mr-2">
                    {selectedEntry.mood ? MOOD_EMOJI[selectedEntry.mood] || "🙂" : "🙂"}
                  </Text>
                  <Text className="font-semibold text-foreground flex-1">
                    {selectedEntry.title || "Untitled Entry"}
                  </Text>
                </View>
                <Text className="text-muted text-xs mb-3">{getTimeLabel(selectedEntry.createdAt)}</Text>
                <Text className="text-foreground leading-6">{selectedEntry.content}</Text>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
