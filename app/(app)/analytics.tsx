import React, { useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { BarChart, PieChart } from "react-native-chart-kit";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";

const RANGES = ["7d", "30d", "90d", "all"] as const;
const SCREEN_WIDTH = Dimensions.get("window").width - 32;

function filterByRange(data: { label: string; value: number }[], range: string) {
  if (range === "all") return data;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return data.filter((d) => d.label >= cutoffStr);
}

export default function AnalyticsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [range, setRange] = useState<(typeof RANGES)[number]>("30d");

  const productivity = trpc.analytics.getProductivity.useQuery();
  const streaks = trpc.analytics.getStreaks.useQuery();
  const distribution = trpc.analytics.getDistribution.useQuery();

  const loading = productivity.isLoading || streaks.isLoading || distribution.isLoading;

  const chartConfig = useMemo(
    () => ({
      backgroundColor: colors.surface,
      backgroundGradientFrom: colors.surface,
      backgroundGradientTo: colors.surface,
      decimalPlaces: 0,
      color: (opacity = 1) => `${colors.primary}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`,
      labelColor: () => colors.muted,
    }),
    [colors]
  );

  const itemsPerDay = useMemo(
    () => filterByRange(productivity.data?.itemsPerDay ?? [], range),
    [productivity.data, range]
  );

  const tasksPerDay = useMemo(
    () => filterByRange(productivity.data?.tasksCompletedPerDay ?? [], range),
    [productivity.data, range]
  );

  const totalItems = useMemo(
    () => (productivity.data?.itemsPerDay ?? []).reduce((s, d) => s + d.value, 0),
    [productivity.data]
  );

  const totalTasksDone = useMemo(
    () => (productivity.data?.tasksCompletedPerDay ?? []).reduce((s, d) => s + d.value, 0),
    [productivity.data]
  );

  const typeData = useMemo(
    () =>
      (distribution.data?.itemsByType ?? [])
        .filter((x) => x.value > 0)
        .map((x, idx) => ({
          name: x.label,
          value: x.value,
          color: ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"][idx % 5],
          legendFontColor: colors.foreground,
          legendFontSize: 11,
        })),
    [distribution.data, colors]
  );

  const priorityData = useMemo(
    () =>
      (distribution.data?.tasksByPriority ?? [])
        .filter((x) => x.value > 0)
        .map((x, idx) => ({
          name: x.label,
          value: x.value,
          color: ["#ef4444", "#f59e0b", "#22c55e"][idx % 3],
          legendFontColor: colors.foreground,
          legendFontSize: 11,
        })),
    [distribution.data, colors]
  );

  if (loading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View className="px-4 py-4 border-b border-border flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3">
          <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">Analytics</Text>
      </View>

      <ScrollView className="flex-1 px-4 py-4">
        {/* Range selector */}
        <View className="flex-row flex-wrap gap-2 mb-4">
          {RANGES.map((r) => (
            <Pressable
              key={r}
              onPress={() => setRange(r)}
              className={`px-3 py-2 rounded-lg border ${range === r ? "bg-primary border-primary" : "bg-surface border-border"}`}
            >
              <Text className={range === r ? "text-white font-semibold" : "text-foreground"}>{r}</Text>
            </Pressable>
          ))}
        </View>

        {/* Summary cards */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Total Items", value: totalItems, icon: "note" as const, color: colors.primary },
            { label: "Tasks Done", value: totalTasksDone, icon: "check-circle" as const, color: colors.success },
            { label: "Journal Streak", value: streaks.data?.currentJournalStreak ?? 0, icon: "local-fire-department" as const, color: colors.warning },
          ].map((stat) => (
            <View
              key={stat.label}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                backgroundColor: colors.surface,
                alignItems: "center",
              }}
            >
              <MaterialIcons name={stat.icon} size={22} color={stat.color} />
              <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, marginTop: 4 }}>
                {stat.value}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", marginTop: 2 }}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Journal streak detail */}
        <View className="bg-surface border border-border rounded-xl p-4 mb-4">
          <Text className="text-foreground font-semibold mb-2">Journal Streaks</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Current Streak</Text>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 20 }}>
                {streaks.data?.currentJournalStreak ?? 0} days
              </Text>
            </View>
            <View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Longest Streak</Text>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 20 }}>
                {streaks.data?.longestJournalStreak ?? 0} days
              </Text>
            </View>
          </View>
        </View>

        {/* Items captured per day */}
        {itemsPerDay.length > 0 ? (
          <View className="bg-surface border border-border rounded-xl p-4 mb-4">
            <Text className="text-foreground font-semibold mb-2">Items Captured</Text>
            <BarChart
              data={{
                labels: itemsPerDay.slice(-7).map((x) => x.label.slice(5)),
                datasets: [{ data: itemsPerDay.slice(-7).map((x) => x.value) }],
              }}
              width={SCREEN_WIDTH - 32}
              height={180}
              yAxisLabel=""
              yAxisSuffix=""
              chartConfig={chartConfig}
              fromZero
            />
          </View>
        ) : null}

        {/* Tasks completed per day */}
        {tasksPerDay.length > 0 ? (
          <View className="bg-surface border border-border rounded-xl p-4 mb-4">
            <Text className="text-foreground font-semibold mb-2">Tasks Completed</Text>
            <BarChart
              data={{
                labels: tasksPerDay.slice(-7).map((x) => x.label.slice(5)),
                datasets: [{ data: tasksPerDay.slice(-7).map((x) => x.value) }],
              }}
              width={SCREEN_WIDTH - 32}
              height={180}
              yAxisLabel=""
              yAxisSuffix=""
              chartConfig={chartConfig}
              fromZero
            />
          </View>
        ) : null}

        {/* Items by type */}
        {typeData.length > 0 ? (
          <View className="bg-surface border border-border rounded-xl p-4 mb-4">
            <Text className="text-foreground font-semibold mb-2">Items by Type</Text>
            <PieChart
              data={typeData}
              width={SCREEN_WIDTH - 32}
              height={200}
              accessor="value"
              backgroundColor="transparent"
              chartConfig={chartConfig}
              paddingLeft="8"
              absolute
            />
          </View>
        ) : null}

        {/* Tasks by priority */}
        {priorityData.length > 0 ? (
          <View className="bg-surface border border-border rounded-xl p-4 mb-4">
            <Text className="text-foreground font-semibold mb-2">Tasks by Priority</Text>
            <PieChart
              data={priorityData}
              width={SCREEN_WIDTH - 32}
              height={200}
              accessor="value"
              backgroundColor="transparent"
              chartConfig={chartConfig}
              paddingLeft="8"
              absolute
            />
          </View>
        ) : null}

        {/* Top tags */}
        {(distribution.data?.tagUsage ?? []).length > 0 ? (
          <View className="bg-surface border border-border rounded-xl p-4 mb-4">
            <Text className="text-foreground font-semibold mb-2">Top Tags</Text>
            {(distribution.data?.tagUsage ?? [])
              .sort((a, b) => b.value - a.value)
              .slice(0, 8)
              .map((tag) => (
                <View key={tag.label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ color: colors.foreground }}>#{tag.label}</Text>
                  <Text style={{ color: colors.muted }}>{tag.value} items</Text>
                </View>
              ))}
          </View>
        ) : null}

        {/* Empty state */}
        {totalItems === 0 && totalTasksDone === 0 ? (
          <View className="items-center py-8">
            <MaterialIcons name="bar-chart" size={48} color={colors.muted} />
            <Text className="text-muted mt-2 text-center">No data yet. Start capturing notes and completing tasks.</Text>
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </ScreenContainer>
  );
}
