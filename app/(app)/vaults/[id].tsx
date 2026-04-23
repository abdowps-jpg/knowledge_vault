import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FAB } from "@/components/fab";
import { AddTaskModal } from "@/components/add-task-modal";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type TabKey = "items" | "tasks" | "activity";

export default function VaultDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const vaultId = typeof id === "string" ? id : "";

  const [activeTab, setActiveTab] = React.useState<TabKey>("items");
  const [showAddTask, setShowAddTask] = React.useState(false);

  const vaultsQuery = trpc.vaults.listMine.useQuery();
  const vault = (vaultsQuery.data ?? []).find((v) => v.id === vaultId);
  const role = vault?.role;
  const isViewer = role === "viewer";

  const itemsQuery = trpc.items.list.useQuery(
    { vaultId, limit: 50 },
    { enabled: Boolean(vaultId) && activeTab === "items" }
  );
  const tasksQuery = trpc.tasks.list.useQuery(
    { vaultId, limit: 50 },
    { enabled: Boolean(vaultId) && activeTab === "tasks" }
  );
  const feedQuery = trpc.vaults.feed.useQuery(
    { vaultId, limit: 30 },
    { enabled: Boolean(vaultId) && activeTab === "activity" }
  );

  if (!vaultId) {
    return (
      <ScreenContainer>
        <ErrorState error={new Error("Missing vault id")} onRetry={() => router.back()} />
      </ScreenContainer>
    );
  }

  if (vaultsQuery.isLoading) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!vault) {
    return (
      <ScreenContainer>
        <ErrorState
          error={new Error("Vault not found or no access")}
          onRetry={() => vaultsQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  const tabs: { key: TabKey; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
    { key: "items", label: "Items", icon: "note" },
    { key: "tasks", label: "Tasks", icon: "check-circle-outline" },
    { key: "activity", label: "Activity", icon: "history" },
  ];

  return (
    <ScreenContainer>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ padding: 4, marginRight: 8 }}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text
            style={{ color: colors.foreground, fontSize: 18, fontWeight: "700", flex: 1 }}
            numberOfLines={1}
          >
            {vault.name}
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", textTransform: "uppercase" }}>
              {role}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: active ? colors.primary : "transparent",
                }}
              >
                <MaterialIcons
                  name={tab.icon}
                  size={16}
                  color={active ? "#ffffff" : colors.muted}
                />
                <Text
                  style={{
                    color: active ? "#ffffff" : colors.muted,
                    fontSize: 13,
                    fontWeight: active ? "700" : "500",
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {activeTab === "items" ? (
        <ItemsTab
          query={itemsQuery}
          colors={colors}
          onOpen={(itemId) => router.push(`/(app)/item/${itemId}` as any)}
        />
      ) : activeTab === "tasks" ? (
        <TasksTab query={tasksQuery} colors={colors} />
      ) : (
        <ActivityTab query={feedQuery} colors={colors} />
      )}

      {!isViewer && activeTab === "tasks" ? (
        <FAB
          label="Add task"
          icon={<MaterialIcons name="add" size={28} color="#ffffff" />}
          onPress={() => setShowAddTask(true)}
        />
      ) : null}

      <AddTaskModal
        visible={showAddTask}
        onClose={() => setShowAddTask(false)}
        onSuccess={() => {
          tasksQuery.refetch().catch(() => undefined);
        }}
        defaultVaultId={vaultId}
        lockVault
      />
    </ScreenContainer>
  );
}

function ItemsTab({
  query,
  colors,
  onOpen,
}: {
  query: {
    isLoading: boolean;
    error: unknown;
    data: { items: any[]; nextCursor?: number } | undefined;
    refetch: () => unknown;
  };
  colors: ReturnType<typeof useColors>;
  onOpen: (itemId: string) => void;
}) {
  if (query.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (query.error) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon="inbox"
        title="No items yet"
        subtitle="Items saved to this vault will show up here."
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
      {items.map((item: any) => (
        <Pressable
          key={item.id}
          onPress={() => onOpen(item.id)}
          accessibilityRole="button"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }} numberOfLines={1}>
            {item.title || "Untitled"}
          </Text>
          {item.content ? (
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
              {item.content}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function TasksTab({
  query,
  colors,
}: {
  query: {
    isLoading: boolean;
    error: unknown;
    data: { items: any[]; nextCursor?: number } | undefined;
    refetch: () => unknown;
  };
  colors: ReturnType<typeof useColors>;
}) {
  if (query.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (query.error) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const tasks = query.data?.items ?? [];
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="playlist-add-check"
        title="No tasks yet"
        subtitle="Tasks created in this vault will appear here."
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
      {tasks.map((task: any) => (
        <View
          key={task.id}
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <MaterialIcons
            name={task.isCompleted ? "check-circle" : "radio-button-unchecked"}
            size={20}
            color={task.isCompleted ? colors.success : colors.muted}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.foreground,
                fontWeight: "600",
                textDecorationLine: task.isCompleted ? "line-through" : "none",
              }}
              numberOfLines={1}
            >
              {task.title}
            </Text>
            {task.dueDate ? (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Due {task.dueDate}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function ActivityTab({
  query,
  colors,
}: {
  query: {
    isLoading: boolean;
    error: unknown;
    data: any[] | undefined;
    refetch: () => unknown;
  };
  colors: ReturnType<typeof useColors>;
}) {
  if (query.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (query.error) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const events = query.data ?? [];
  if (events.length === 0) {
    return <EmptyState icon="history" title="No activity yet" subtitle="Vault events will show up here." />;
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
      {events.map((event: any) => {
        const ts = event.createdAt ? new Date(event.createdAt) : null;
        return (
          <View
            key={event.id}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 12,
            }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>{event.action}</Text>
            {event.resourceKind ? (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                {event.resourceKind}
                {event.resourceId ? `: ${event.resourceId}` : ""}
              </Text>
            ) : null}
            {ts ? (
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
                {ts.toLocaleString()}
              </Text>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
