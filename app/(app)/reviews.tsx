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
  const weeklyReview = trpc.ai.weeklyReview.useMutation();
  const [review, setReview] = React.useState<{
    overview: string;
    themes: string[];
    progress: string[];
    focusAreas: string[];
    counts: { items: number; tasks: number; journal: number; completedTasks: number };
  } | null>(null);

  const handleGenerateWeeklyReview = async () => {
    try {
      const res = await weeklyReview.mutateAsync();
      setReview(res);
    } catch (err: any) {
      console.error("[Reviews] Weekly review failed:", err);
      Alert.alert("AI", err?.message ?? "Failed to generate weekly review.");
    }
  };

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

        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 12,
            backgroundColor: colors.surface,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>
              AI Weekly Review
            </Text>
            <Pressable
              onPress={handleGenerateWeeklyReview}
              disabled={weeklyReview.isPending}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                opacity: weeklyReview.isPending ? 0.5 : 1,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 11 }}>
                {weeklyReview.isPending ? "Thinking…" : review ? "Refresh" : "Generate"}
              </Text>
            </Pressable>
          </View>
          {!review && !weeklyReview.isPending ? (
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
              Synthesize the last 7 days into themes, progress, and focus for next week.
            </Text>
          ) : null}
          {review && review.counts.items + review.counts.tasks + review.counts.journal === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
              No captures this week yet.
            </Text>
          ) : null}
          {review && review.overview ? (
            <>
              <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19, marginTop: 10 }}>
                {review.overview}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>
                {review.counts.items} items · {review.counts.completedTasks}/{review.counts.tasks} tasks done · {review.counts.journal} journal entries
              </Text>
              {review.themes.length > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Themes</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {review.themes.map((t, i) => (
                      <View
                        key={i}
                        style={{
                          backgroundColor: colors.background,
                          borderWidth: 1,
                          borderColor: colors.border,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                        }}
                      >
                        <Text style={{ color: colors.foreground, fontSize: 12 }}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
              {review.progress.length > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Progress</Text>
                  {review.progress.map((p, i) => (
                    <Text key={i} style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>
                      ✓ {p}
                    </Text>
                  ))}
                </View>
              ) : null}
              {review.focusAreas.length > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Focus next week</Text>
                  {review.focusAreas.map((f, i) => (
                    <Text key={i} style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>
                      → {f}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </View>

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
