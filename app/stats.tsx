import React from "react";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { BarChart, LineChart, PieChart } from "react-native-chart-kit";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { ErrorState } from "@/components/error-state";

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="bg-surface rounded-lg border border-border p-4 flex-1 min-w-[46%] mb-3">
      <Text className="text-xs text-muted">{label}</Text>
      <Text className="text-2xl font-bold text-foreground mt-1">{value}</Text>
    </View>
  );
}

export default function StatsScreen() {
  const colors = useColors();
  const router = useRouter();

  const summaryQuery = trpc.stats.getSummary.useQuery();
  const chartQuery = trpc.stats.getChartData.useQuery();
  const insightsQuery = trpc.stats.getInsights.useQuery();

  const isLoading = summaryQuery.isLoading || chartQuery.isLoading || insightsQuery.isLoading;
  const error = summaryQuery.error || chartQuery.error || insightsQuery.error;
  const chartWidth = Math.max(320, Dimensions.get("window").width - 32);

  const chartConfig = {
    backgroundColor: colors.surface,
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `${colors.primary}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`,
    labelColor: () => colors.muted,
    propsForBackgroundLines: { stroke: colors.border, strokeDasharray: "" },
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-muted mt-3">Loading statistics...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
        <View className="p-4 border-b border-border flex-row items-center">
          <Pressable onPress={() => router.back()} className="mr-2">
            <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Statistics</Text>
        </View>
        <View className="flex-1 p-4">
          <ErrorState
            error={error}
            onRetry={() => {
              summaryQuery.refetch();
              chartQuery.refetch();
              insightsQuery.refetch();
            }}
          />
        </View>
      </ScreenContainer>
    );
  }

  const summary = summaryQuery.data!;
  const chartData = chartQuery.data!;
  const insights = insightsQuery.data!;

  const pieData = [
    {
      name: "Completed",
      count: chartData.tasksCompletionRate.completed,
      color: colors.success,
      legendFontColor: colors.foreground,
      legendFontSize: 12,
    },
    {
      name: "Pending",
      count: chartData.tasksCompletionRate.pending,
      color: colors.warning,
      legendFontColor: colors.foreground,
      legendFontSize: 12,
    },
  ];

  return (
    <ScreenContainer>
      <View className="p-4 border-b border-border flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-2">
          <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <MaterialIcons name="analytics" size={28} color={colors.primary} />
        <Text className="text-2xl font-bold text-foreground ml-2">Statistics</Text>
      </View>

      <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
        <View className="flex-row flex-wrap justify-between">
          <SummaryCard label="Total Notes" value={summary.totalNotes} />
          <SummaryCard label="Total Tasks" value={summary.totalTasks} />
          <SummaryCard label="Journal Entries" value={summary.totalJournalEntries} />
          <SummaryCard label="Tasks Done This Week" value={summary.completedTasksThisWeek} />
        </View>
        <View className="bg-surface rounded-lg border border-border p-4 mb-4">
          <Text className="text-sm text-muted">Current Streak</Text>
          <Text className="text-2xl font-bold text-foreground mt-1">{summary.currentStreak} days</Text>
        </View>

        <View className="bg-surface rounded-lg border border-border p-3 mb-4">
          <Text className="text-base font-semibold text-foreground mb-2">Items Created per Week</Text>
          <BarChart
            data={{
              labels: chartData.itemsPerWeek.labels,
              datasets: [{ data: chartData.itemsPerWeek.values }],
            }}
            width={chartWidth}
            height={220}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={chartConfig}
            fromZero
            showValuesOnTopOfBars
            style={{ borderRadius: 8 }}
          />
        </View>

        <View className="bg-surface rounded-lg border border-border p-3 mb-4">
          <Text className="text-base font-semibold text-foreground mb-2">Tasks Completion Rate</Text>
          <PieChart
            data={pieData}
            width={chartWidth}
            height={220}
            accessor="count"
            backgroundColor="transparent"
            chartConfig={chartConfig}
            paddingLeft="8"
            absolute
          />
        </View>

        <View className="bg-surface rounded-lg border border-border p-3 mb-4">
          <Text className="text-base font-semibold text-foreground mb-2">Journal Entries per Month</Text>
          <LineChart
            data={{
              labels: chartData.journalPerMonth.labels,
              datasets: [{ data: chartData.journalPerMonth.values }],
            }}
            width={chartWidth}
            height={220}
            chartConfig={chartConfig}
            bezier
            style={{ borderRadius: 8 }}
          />
        </View>

        <View className="bg-surface rounded-lg border border-border p-4 mb-4">
          <Text className="text-base font-semibold text-foreground mb-2">Insights</Text>
          <Text className="text-sm text-muted mb-2">
            Most Productive Day: <Text className="text-foreground font-semibold">{insights.mostProductiveDay}</Text>
          </Text>
          <Text className="text-sm text-muted mb-2">
            Average Items per Day: <Text className="text-foreground font-semibold">{insights.averageItemsPerDay}</Text>
          </Text>
          <Text className="text-sm text-muted mb-1">Most Used Tags:</Text>
          {insights.mostUsedTags.length === 0 ? (
            <Text className="text-sm text-muted">No tag usage yet.</Text>
          ) : (
            insights.mostUsedTags.map((tag: { name: string; count: number }) => (
              <Text key={tag.name} className="text-sm text-foreground">
                • {tag.name} ({tag.count})
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
