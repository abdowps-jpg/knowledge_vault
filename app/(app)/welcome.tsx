import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type ChecklistEntry = {
  step: string;
  done: boolean;
  title: string;
  description: string;
  icon: string;
};

const STEP_ROUTE: Record<string, string> = {
  welcome: "/(app)/(tabs)/",
  firstItem: "/(app)/(tabs)/library",
  firstTask: "/(app)/(tabs)/actions",
  firstJournal: "/(app)/(tabs)/journal",
  firstHabit: "/(app)/(tabs)/today",
  enablePush: "/(app)/(tabs)/settings",
  tryAI: "/(app)/(tabs)/",
};

export default function WelcomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const checklistQuery = trpc.onboarding.checklist.useQuery();
  const progressQuery = trpc.onboarding.nextStep.useQuery();
  const markStep = trpc.onboarding.markStep.useMutation({
    onSuccess: () => {
      checklistQuery.refetch().catch(() => undefined);
      progressQuery.refetch().catch(() => undefined);
    },
  });
  const reset = trpc.onboarding.reset.useMutation({
    onSuccess: () => {
      checklistQuery.refetch().catch(() => undefined);
      progressQuery.refetch().catch(() => undefined);
    },
  });

  const entries = (checklistQuery.data ?? []) as ChecklistEntry[];
  const percent = progressQuery.data?.percent ?? 0;
  const done = progressQuery.data?.isDone ?? false;

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 24 }}>
          Welcome to Knowledge Vault
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>
          Capture anything. Find everything. Act on what matters.
        </Text>

        {/* Progress bar */}
        <View style={{ marginTop: 20 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 13 }}>
              Setup progress
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{percent}%</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
            <View
              style={{
                height: 6,
                width: `${percent}%`,
                backgroundColor: done ? colors.success : colors.primary,
              }}
            />
          </View>
        </View>

        {/* Checklist */}
        <View style={{ marginTop: 22 }}>
          {checklistQuery.isLoading ? (
            <View style={{ paddingVertical: 30, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            entries.map((entry) => (
              <Pressable
                key={entry.step}
                onPress={() => {
                  const route = STEP_ROUTE[entry.step];
                  if (route) router.push(route as any);
                  if (!entry.done) {
                    markStep.mutate({ step: entry.step });
                  }
                }}
                style={{
                  padding: 14,
                  marginBottom: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: entry.done ? colors.success + "55" : colors.border,
                  backgroundColor: entry.done ? colors.success + "10" : colors.surface,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: entry.done ? colors.success : colors.primary + "22",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {entry.done ? (
                    <MaterialIcons name="check" size={18} color="#fff" />
                  ) : (
                    <MaterialIcons name="circle" size={10} color={colors.primary} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.foreground,
                      fontWeight: "700",
                      fontSize: 14,
                      textDecorationLine: entry.done ? "line-through" : "none",
                      opacity: entry.done ? 0.7 : 1,
                    }}
                  >
                    {entry.title}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                    {entry.description}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
              </Pressable>
            ))
          )}
        </View>

        {done ? (
          <View
            style={{
              marginTop: 10,
              padding: 16,
              borderRadius: 12,
              backgroundColor: colors.success + "15",
              borderWidth: 1,
              borderColor: colors.success + "55",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 32 }}>🎉</Text>
            <Text style={{ color: colors.success, fontWeight: "700", marginTop: 6 }}>
              You&apos;re all set
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 4 }}>
              Explore the tabs and come back here anytime from Settings.
            </Text>
          </View>
        ) : null}

        <Pressable onPress={() => reset.mutate()} style={{ alignSelf: "center", marginTop: 20 }}>
          <Text style={{ color: colors.muted, fontSize: 11 }}>Reset onboarding progress</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
