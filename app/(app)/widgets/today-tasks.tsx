import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

function isToday(isoDate?: string | null): boolean {
  if (!isoDate) return false;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export default function WidgetTodayTasksScreen() {
  const colors = useColors();
  const router = useRouter();

  const tasksQuery = trpc.tasks.list.useInfiniteQuery(
    {
      sortOrder: "asc",
      limit: 50,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const tasks = React.useMemo(() => {
    const all = tasksQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];
    return all.filter((task: any) => !task.isCompleted && isToday(task.dueDate)).slice(0, 12);
  }, [tasksQuery.data]);

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <View className="px-4 py-4 border-b border-border">
        <Text className="text-xl font-bold text-foreground">Today's Tasks Widget</Text>
        <Text className="text-sm text-muted mt-1">Compact list optimized for widget deep-link target.</Text>
      </View>

      {tasksQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView className="flex-1 p-4">
          {tasks.length === 0 ? (
            <Text style={{ color: colors.muted }}>No tasks due today.</Text>
          ) : (
            tasks.map((task: any) => (
              <Pressable
                key={task.id}
                onPress={() => router.push({ pathname: "/(app)/(tabs)/actions", params: { taskId: task.id } })}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 8,
                  backgroundColor: colors.surface,
                }}
              >
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>{task.title}</Text>
                <Text style={{ color: colors.muted, marginTop: 2, fontSize: 12 }}>{task.dueDate || "Today"}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
