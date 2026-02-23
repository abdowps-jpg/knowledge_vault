import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const REVIEWS_STORAGE_KEY = "reviews.entries.v1";

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ReviewsScreen() {
  const colors = useColors();
  const [wins, setWins] = React.useState("");
  const [improvements, setImprovements] = React.useState("");
  const [nextFocus, setNextFocus] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const tasksQuery = trpc.tasks.list.useInfiniteQuery(
    {
      sortOrder: "desc",
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const completed = React.useMemo(() => {
    const all = tasksQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];
    return all.filter((task: any) => task.isCompleted && task.completedAt);
  }, [tasksQuery.data]);

  const now = new Date();
  const weekStart = startOfWeek(now);

  const completedToday = completed.filter((task: any) => isSameDay(new Date(task.completedAt), now));
  const completedThisWeek = completed.filter((task: any) => new Date(task.completedAt).getTime() >= weekStart.getTime());

  const handleSaveReview = async (type: "daily" | "weekly") => {
    try {
      setSaving(true);
      const existingRaw = await AsyncStorage.getItem(REVIEWS_STORAGE_KEY);
      const existing = existingRaw ? (JSON.parse(existingRaw) as any[]) : [];
      const entry = {
        id: `${Date.now()}-${type}`,
        type,
        createdAt: new Date().toISOString(),
        wins: wins.trim(),
        improvements: improvements.trim(),
        nextFocus: nextFocus.trim(),
        completedTaskIds: (type === "daily" ? completedToday : completedThisWeek).map((task: any) => task.id),
      };
      await AsyncStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify([entry, ...existing].slice(0, 200)));
      Alert.alert("Saved", `${type === "daily" ? "Daily" : "Weekly"} review saved.`);
      setWins("");
      setImprovements("");
      setNextFocus("");
    } catch (error) {
      console.error("[Reviews] Failed saving review:", error);
      Alert.alert("Error", "Failed to save review.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <ScrollView className="flex-1 p-4">
        <Text className="text-2xl font-bold text-foreground mb-2">Daily & Weekly Review</Text>
        <Text className="text-sm text-muted mb-4">Reflect, learn, and plan next actions.</Text>

        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.surface, marginBottom: 12 }}>
          <Text style={{ color: colors.foreground, fontWeight: "700", marginBottom: 8 }}>Completed Today ({completedToday.length})</Text>
          {tasksQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : completedToday.length === 0 ? (
            <Text style={{ color: colors.muted }}>No completed tasks today.</Text>
          ) : (
            completedToday.map((task: any) => (
              <Text key={task.id} style={{ color: colors.foreground, marginBottom: 4 }}>
                • {task.title}
              </Text>
            ))
          )}
        </View>

        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.surface, marginBottom: 12 }}>
          <Text style={{ color: colors.foreground, fontWeight: "700", marginBottom: 8 }}>Completed This Week ({completedThisWeek.length})</Text>
          {completedThisWeek.length === 0 ? (
            <Text style={{ color: colors.muted }}>No completed tasks this week.</Text>
          ) : (
            completedThisWeek.slice(0, 8).map((task: any) => (
              <Text key={task.id} style={{ color: colors.foreground, marginBottom: 4 }}>
                • {task.title}
              </Text>
            ))
          )}
        </View>

        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.surface }}>
          <Text style={{ color: colors.foreground, fontWeight: "700", marginBottom: 8 }}>Reflection Prompts</Text>
          <TextInput
            value={wins}
            onChangeText={setWins}
            placeholder="What went well today?"
            placeholderTextColor={colors.muted}
            multiline
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.foreground,
              backgroundColor: colors.background,
              minHeight: 80,
              marginBottom: 10,
              textAlignVertical: "top",
            }}
          />
          <TextInput
            value={improvements}
            onChangeText={setImprovements}
            placeholder="What can be improved?"
            placeholderTextColor={colors.muted}
            multiline
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.foreground,
              backgroundColor: colors.background,
              minHeight: 80,
              marginBottom: 10,
              textAlignVertical: "top",
            }}
          />
          <TextInput
            value={nextFocus}
            onChangeText={setNextFocus}
            placeholder="What is your focus next?"
            placeholderTextColor={colors.muted}
            multiline
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.foreground,
              backgroundColor: colors.background,
              minHeight: 80,
              marginBottom: 10,
              textAlignVertical: "top",
            }}
          />

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => handleSaveReview("daily")}
              disabled={saving}
              style={{ flex: 1, borderRadius: 10, backgroundColor: colors.primary, paddingVertical: 12, alignItems: "center" }}
            >
              {saving ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "700" }}>Save Daily</Text>}
            </Pressable>
            <Pressable
              onPress={() => handleSaveReview("weekly")}
              disabled={saving}
              style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ color: colors.foreground, fontWeight: "700" }}>Save Weekly</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
