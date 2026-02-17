import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { BarChart, PieChart } from "react-native-chart-kit";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";

const RANGES = ["7d", "30d", "90d", "all"] as const;

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

  if (loading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const typeData = (distribution.data?.itemsByType ?? []).map((x, idx) => ({
    name: x.label,
    value: x.value,
    color: ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"][idx % 5],
    legendFontColor: colors.foreground,
    legendFontSize: 11,
  }));

  return (
    <ScreenContainer>
      <View className="px-4 py-4 border-b border-border flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3">
          <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">Analytics</Text>
      </View>

      <ScrollView className="flex-1 px-4 py-4">
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

        <View className="bg-surface border border-border rounded-xl p-4 mb-4">
          <Text className="text-foreground font-semibold">Overview</Text>
          <Text className="text-muted mt-1">Current journal streak: {streaks.data?.currentJournalStreak ?? 0}</Text>
          <Text className="text-muted mt-1">Longest journal streak: {streaks.data?.longestJournalStreak ?? 0}</Text>
        </View>

        <View className="bg-surface border border-border rounded-xl p-3 mb-4">
          <Text className="text-foreground font-semibold mb-2">Items per Day</Text>
          <BarChart
            data={{
              labels: (productivity.data?.itemsPerDay ?? []).slice(-7).map((x) => x.label.slice(5)),
              datasets: [{ data: (productivity.data?.itemsPerDay ?? []).slice(-7).map((x) => x.value) }],
            }}
            width={340}
            height={220}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={chartConfig}
            fromZero
          />
        </View>

        <View className="bg-surface border border-border rounded-xl p-3 mb-4">
          <Text className="text-foreground font-semibold mb-2">Items by Type</Text>
          <PieChart
            data={typeData.length ? typeData : [{ name: "None", value: 1, color: "#d1d5db", legendFontColor: colors.foreground, legendFontSize: 11 }]}
            width={340}
            height={220}
            accessor="value"
            backgroundColor="transparent"
            chartConfig={chartConfig}
            paddingLeft="8"
            absolute
          />
        </View>

        <View className="bg-surface border border-border rounded-xl p-4 mb-4">
          <Text className="text-foreground font-semibold mb-2">Export</Text>
          <Text className="text-muted text-sm">TODO: PDF/CSV export and share screenshot integration.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
