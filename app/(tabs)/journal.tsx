import React, { useState } from "react";
import {
  FlatList,
  Text,
  View,
  Pressable,
  TextInput,
  Modal,
  RefreshControl,
  Alert,
  ScrollView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import { useJournal } from "@/lib/context/journal-context";
import { Item } from "@/lib/db/schema";
import * as Haptics from "expo-haptics";

// ============================================================================
// Helper Functions
// ============================================================================

const MOODS = [
  { emoji: "😄", label: "Happy", value: "happy" },
  { emoji: "😌", label: "Calm", value: "calm" },
  { emoji: "😐", label: "Neutral", value: "neutral" },
  { emoji: "😔", label: "Sad", value: "sad" },
  { emoji: "😤", label: "Frustrated", value: "frustrated" },
  { emoji: "😴", label: "Tired", value: "tired" },
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================================
// Calendar Component
// ============================================================================

interface CalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  hasEntryForDate: (date: Date) => boolean;
}

function Calendar({ selectedDate, onDateSelect, hasEntryForDate }: CalendarProps) {
  const colors = useColors();
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days: (number | null)[] = [];

  // Add empty cells for days before month starts
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  // Add days of month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  const monthName = new Date(year, month).toLocaleString("en-US", { month: "long" });

  return (
    <View className="bg-surface rounded-lg p-4 gap-3">
      <Text className="text-lg font-bold text-foreground text-center">
        {monthName} {year}
      </Text>

      {/* Weekday headers */}
      <View className="flex-row gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <View key={day} className="flex-1">
            <Text className="text-xs font-semibold text-muted text-center">{day}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <View className="gap-1">
        {Array.from({ length: Math.ceil(days.length / 7) }).map((_, weekIndex) => (
          <View key={weekIndex} className="flex-row gap-1">
            {(days as (number | null)[]).slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
              const isToday =
                day &&
                new Date().getDate() === day &&
                new Date().getMonth() === month &&
                new Date().getFullYear() === year;

              const isSelected =
                day &&
                selectedDate.getDate() === day &&
                selectedDate.getMonth() === month &&
                selectedDate.getFullYear() === year;

              const dateForDay = day ? new Date(year, month, day) : null;
              const hasEntry = dateForDay ? hasEntryForDate(dateForDay) : false;

              return (
                <Pressable
                  key={`${weekIndex}-${dayIndex}`}
                  onPress={() => {
                    if (day) {
                      onDateSelect(new Date(year, month, day));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                  disabled={!day}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      aspectRatio: 1,
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: 8,
                      backgroundColor: isSelected ? colors.primary : colors.background,
                      opacity: pressed && day ? 0.7 : 1,
                      borderWidth: isToday ? 2 : 0,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  {day && (
                    <View className="items-center gap-1">
                      <Text
                        style={{
                          color: isSelected ? "white" : colors.foreground,
                          fontWeight: isToday ? "bold" : "600",
                          fontSize: 12,
                        }}
                      >
                        {day}
                      </Text>
                      {hasEntry && (
                        <View
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: isSelected ? "white" : colors.primary,
                          }}
                        />
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// Entry Item Component
// ============================================================================

interface EntryItemProps {
  entry: Item;
  onDelete: (entryId: string) => Promise<void>;
}

function EntryItem({ entry, onDelete }: EntryItemProps) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const mood = (entry as any).mood;

  const handleDelete = async () => {
    Alert.alert("Delete Entry", "Are you sure you want to delete this entry?", [
      { text: "Cancel", onPress: () => {} },
      {
        text: "Delete",
        onPress: async () => {
          try {
            setLoading(true);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await onDelete(entry.id);
          } catch (error) {
            console.error("Error deleting entry:", error);
            Alert.alert("Error", "Failed to delete entry");
          } finally {
            setLoading(false);
          }
        },
        style: "destructive",
      },
    ]);
  };

  const moodEmoji = MOODS.find((m) => m.value === mood)?.emoji;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderLeftColor: colors.primary,
        borderLeftWidth: 4,
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-2">
            {moodEmoji && <Text className="text-xl">{moodEmoji}</Text>}
            <Text className="text-xs text-muted">{formatTime(entry.createdAt)}</Text>
          </View>
          <Text className="text-sm text-foreground leading-relaxed" numberOfLines={4}>
            {entry.content}
          </Text>
          {(entry as any).location && (
            <View className="flex-row items-center gap-2 mt-2">
              <MaterialIcons name="location-on" size={12} color={colors.muted} />
              <Text className="text-xs text-muted">{(entry as any).location}</Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={handleDelete}
          disabled={loading}
          style={({ pressed }) => [{ opacity: pressed || loading ? 0.6 : 0.8, padding: 8 }]}
        >
          <MaterialIcons name="delete" size={18} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

// ============================================================================
// New Entry Modal
// ============================================================================

interface NewEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (content: string, mood?: string, location?: string) => Promise<void>;
}

function NewEntryModal({ visible, onClose, onSave }: NewEntryModalProps) {
  const colors = useColors();
  const [content, setContent] = useState("");
  const [selectedMood, setSelectedMood] = useState<string | undefined>();
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) {
      Alert.alert("Error", "Please write something");
      return;
    }

    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await onSave(content, selectedMood, location || undefined);
      setContent("");
      setSelectedMood(undefined);
      setLocation("");
      onClose();
    } catch (error) {
      console.error("Error saving entry:", error);
      Alert.alert("Error", "Failed to save entry");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <ScreenContainer className="bg-background" containerClassName="bg-background">
        {/* Header */}
        <View className="px-4 py-4 border-b border-border flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">New Entry</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
          {/* Content Input */}
          <Text className="text-sm font-semibold text-foreground mb-2">What's on your mind?</Text>
          <TextInput
            placeholder="Write your thoughts here..."
            value={content}
            onChangeText={setContent}
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={6}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 8,
              padding: 12,
              color: colors.foreground,
              fontSize: 16,
              textAlignVertical: "top",
              fontFamily: "System",
            }}
          />

          {/* Mood Selector */}
          <Text className="text-sm font-semibold text-foreground mt-6 mb-3">How are you feeling?</Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {MOODS.map((mood) => (
              <Pressable
                key={mood.value}
                onPress={() => setSelectedMood(mood.value)}
                style={({ pressed }) => [
                  {
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor:
                      selectedMood === mood.value ? colors.primary : colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 20,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  },
                ]}
              >
                <Text className="text-lg">{mood.emoji}</Text>
                <Text
                  style={{
                    color: selectedMood === mood.value ? "white" : colors.foreground,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {mood.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Location Input */}
          <Text className="text-sm font-semibold text-foreground mb-2">Location (optional)</Text>
          <View className="flex-row items-center gap-2 bg-surface rounded-8 px-3 py-2 border border-border mb-6">
            <MaterialIcons name="location-on" size={20} color={colors.muted} />
            <TextInput
              placeholder="Where are you?"
              value={location}
              onChangeText={setLocation}
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                color: colors.foreground,
                fontSize: 16,
              }}
            />
          </View>

          {/* Save Button */}
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
              },
            ]}
          >
            <Text className="text-base font-semibold text-white">
              {loading ? "Saving..." : "Save Entry"}
            </Text>
          </Pressable>
        </ScrollView>
      </ScreenContainer>
    </Modal>
  );
}

// ============================================================================
// Journal Screen
// ============================================================================

export default function JournalScreen() {
  const colors = useColors();
  const {
    selectedDate,
    entriesForSelectedDate,
    loading,
    setSelectedDate,
    goToToday,
    goToPreviousDay,
    goToNextDay,
    loadEntries,
    createEntry,
    deleteEntry,
    hasEntryForDate,
  } = useJournal();
  const [refreshing, setRefreshing] = useState(false);
  const [showNewEntryModal, setShowNewEntryModal] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  };

  const handleSaveEntry = async (content: string, mood?: string, location?: string) => {
    await createEntry(content, mood, location);
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      {/* Header */}
      <View className="px-4 py-4 border-b border-border">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-2xl font-bold text-foreground">Journal</Text>
          <Pressable
            onPress={goToToday}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="text-sm font-semibold text-primary">Today</Text>
          </Pressable>
        </View>
        <Text className="text-sm text-muted">{formatDate(selectedDate)}</Text>
      </View>

      {/* Calendar */}
      <ScrollView showsVerticalScrollIndicator={false} className="px-4 py-4">
        <Calendar
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
          hasEntryForDate={hasEntryForDate}
        />

        {/* Date Navigation */}
        <View className="flex-row items-center justify-between mt-4 gap-2">
          <Pressable
            onPress={goToPreviousDay}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.6 : 1,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flex: 1,
                alignItems: "center",
              },
            ]}
          >
            <MaterialIcons name="chevron-left" size={24} color={colors.foreground} />
          </Pressable>

          <Text className="text-sm font-semibold text-foreground flex-1 text-center">
            {entriesForSelectedDate.length} entries
          </Text>

          <Pressable
            onPress={goToNextDay}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.6 : 1,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flex: 1,
                alignItems: "center",
              },
            ]}
          >
            <MaterialIcons name="chevron-right" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Entries List */}
        <View className="mt-4">
          {loading ? (
            <View className="items-center justify-center py-8">
              <MaterialIcons name="hourglass-empty" size={48} color={colors.muted} />
              <Text className="text-muted mt-2">Loading...</Text>
            </View>
          ) : entriesForSelectedDate.length === 0 ? (
            <View className="items-center justify-center py-8">
              <MaterialIcons name="edit-note" size={48} color={colors.muted} />
              <Text className="text-lg font-semibold text-foreground mt-3">No entries yet</Text>
              <Text className="text-sm text-muted text-center mt-1">
                Tap the + button to create your first entry
              </Text>
            </View>
          ) : (
            entriesForSelectedDate.map((entry) => (
              <EntryItem key={entry.id} entry={entry} onDelete={deleteEntry} />
            ))
          )}
        </View>

        {/* Spacer for FAB */}
        <View className="h-20" />
      </ScrollView>

      {/* FAB - New Entry */}
      <View className="absolute bottom-6 right-6">
        <Pressable
          onPress={() => setShowNewEntryModal(true)}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.8 : 1,
              backgroundColor: colors.primary,
              width: 56,
              height: 56,
              borderRadius: 28,
              justifyContent: "center",
              alignItems: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 5,
            },
          ]}
        >
          <MaterialIcons name="add" size={28} color="white" />
        </Pressable>
      </View>

      {/* New Entry Modal */}
      <NewEntryModal
        visible={showNewEntryModal}
        onClose={() => setShowNewEntryModal(false)}
        onSave={handleSaveEntry}
      />
    </ScreenContainer>
  );
}
