import React from "react";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { LineChart } from "react-native-chart-kit";

import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
}

export default function AdminScreen() {
  const colors = useColors();
  const whoamiQuery = trpc.admin.whoami.useQuery();
  const isAdmin = whoamiQuery.data?.isAdmin === true;

  const statsQuery = trpc.admin.systemStats.useQuery(undefined, { enabled: isAdmin });
  const usersQuery = trpc.admin.listUsers.useQuery({ limit: 50 }, { enabled: isAdmin });
  const feedbackQuery = trpc.admin.listFeedback.useQuery({ limit: 30 }, { enabled: isAdmin });
  const auditQuery = trpc.admin.recentAuditEvents.useQuery({ limit: 50 }, { enabled: isAdmin });
  const trendsQuery = trpc.admin.systemTrends.useQuery(undefined, { enabled: isAdmin });
  const failedWebhooksQuery = trpc.admin.failedWebhooks.useQuery({ limit: 50 }, { enabled: isAdmin });

  const [drillUserId, setDrillUserId] = React.useState<string | null>(null);
  const usageQuery = trpc.admin.userUsage.useQuery(
    { userId: drillUserId ?? "" },
    { enabled: isAdmin && Boolean(drillUserId) }
  );

  const setActive = trpc.admin.setUserActive.useMutation({
    onSuccess: () => usersQuery.refetch().catch(() => undefined),
  });
  const grantAdmin = trpc.admin.grantAdmin.useMutation({
    onSuccess: () => usersQuery.refetch().catch(() => undefined),
  });
  const markAddressed = trpc.admin.markFeedbackAddressed.useMutation({
    onSuccess: () => feedbackQuery.refetch().catch(() => undefined),
  });

  if (whoamiQuery.isLoading) {
    return (
      <ScreenContainer>
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (whoamiQuery.error) {
    return (
      <ScreenContainer>
        <ErrorState error={whoamiQuery.error} onRetry={() => void whoamiQuery.refetch()} />
      </ScreenContainer>
    );
  }

  if (!isAdmin) {
    return (
      <ScreenContainer>
        <View style={{ padding: 24, alignItems: "center", paddingTop: 80 }}>
          <Text style={{ fontSize: 44 }}>🔒</Text>
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 18, marginTop: 12 }}>
            Admin access required
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 8 }}>
            Only users with the admin role can view this screen.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const stats = statsQuery.data;

  const chartWidth = Math.max(280, Dimensions.get("window").width - 64);
  const chartConfig = {
    backgroundColor: colors.surface,
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) =>
      `${colors.primary}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`,
    labelColor: () => colors.muted,
    propsForBackgroundLines: { stroke: colors.border, strokeDasharray: "" },
    propsForDots: { r: "2" },
  };
  const sparseLabels = Array.from({ length: 30 }, (_, i) =>
    i === 0 ? "-29d" : i === 15 ? "-14d" : i === 29 ? "today" : ""
  );

  const drillUser = drillUserId
    ? (usersQuery.data ?? []).find((u: any) => u.id === drillUserId)
    : null;

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>Admin</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
          System stats, users, feedback, audit.
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Stats */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {stats
            ? [
                { label: "Users", value: stats.users.total },
                { label: "Active", value: stats.users.active },
                { label: "New / wk", value: stats.users.newThisWeek },
                { label: "Items", value: stats.content.items },
                { label: "Tasks", value: stats.content.tasks },
                { label: "Journal", value: stats.content.journal },
                { label: "Feedback", value: stats.feedback },
                { label: "Uptime (h)", value: Math.round(stats.serverUptimeSeconds / 3600) },
              ].map((s) => (
                <View
                  key={s.label}
                  style={{
                    width: "23%",
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 16 }}>{s.value}</Text>
                  <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                    {s.label}
                  </Text>
                </View>
              ))
            : null}
        </View>

        {/* Users */}
        <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15, marginTop: 20, marginBottom: 8 }}>
          Users
        </Text>
        {usersQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (usersQuery.data ?? []).length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 13, paddingVertical: 12 }}>No users yet.</Text>
        ) : (
          (usersQuery.data ?? []).map((u: any) => (
            <View
              key={u.id}
              style={{
                padding: 10,
                marginBottom: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontWeight: "700" }}>
                    {u.username || u.email}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{u.email}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {u.isAdmin ? (
                    <View
                      style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.primary + "22" }}
                    >
                      <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                        admin
                      </Text>
                    </View>
                  ) : null}
                  {!u.isActive ? (
                    <View
                      style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.error + "22" }}
                    >
                      <Text style={{ color: colors.error, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                        disabled
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                <Pressable
                  onPress={() => setActive.mutate({ userId: u.id, isActive: !u.isActive })}
                  style={{
                    flex: 1,
                    paddingVertical: 6,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "600" }}>
                    {u.isActive ? "Deactivate" : "Reactivate"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => grantAdmin.mutate({ userId: u.id, isAdmin: !u.isAdmin })}
                  style={{
                    flex: 1,
                    paddingVertical: 6,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.primary,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "600" }}>
                    {u.isAdmin ? "Revoke admin" : "Grant admin"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        {/* Feedback */}
        <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15, marginTop: 20, marginBottom: 8 }}>
          Feedback ({feedbackQuery.data?.length ?? 0})
        </Text>
        {(feedbackQuery.data ?? []).slice(0, 10).map((f: any) => {
          const isAddressed = Boolean(f.addressedAt);
          return (
            <View
              key={f.id}
              style={{
                padding: 10,
                marginBottom: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: isAddressed ? 0.7 : 1,
              }}
            >
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <View
                  style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.background }}
                >
                  <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                    {f.kind}
                  </Text>
                </View>
                <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 13, flex: 1 }} numberOfLines={1}>
                  {f.subject}
                </Text>
                {isAddressed ? (
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 999,
                      backgroundColor: colors.success + "22",
                    }}
                  >
                    <Text style={{ color: colors.success, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                      addressed
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }} numberOfLines={3}>
                {f.body}
              </Text>
              {isAddressed && f.addressedNote ? (
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6, fontStyle: "italic" }}>
                  Note: {f.addressedNote}
                </Text>
              ) : null}
              {!isAddressed ? (
                <Pressable
                  onPress={() => markAddressed.mutate({ id: f.id })}
                  disabled={markAddressed.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark feedback "${f.subject}" as addressed`}
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.primary,
                    opacity: markAddressed.isPending ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>
                    Mark as addressed
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}

        {/* Audit */}
        <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15, marginTop: 20, marginBottom: 8 }}>
          Recent audit events
        </Text>
        {(auditQuery.data ?? []).slice(0, 20).map((a: any) => (
          <View
            key={a.id}
            style={{
              padding: 8,
              marginBottom: 4,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{a.action}</Text>
              <Text style={{ color: colors.muted, fontSize: 10 }}>
                {a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}
              </Text>
            </View>
            {a.ip ? (
              <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
                {a.userId} · {a.ip}
              </Text>
            ) : null}
          </View>
        ))}

        {/* User drill-down */}
        <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15, marginTop: 20, marginBottom: 8 }}>
          User drill-down
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 8 }}>
          Pick a user to see their 30-day AI usage, storage, and content counts.
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
          {(usersQuery.data ?? []).length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>No users available.</Text>
          ) : (
            (usersQuery.data ?? []).map((u: any) => {
              const selected = u.id === drillUserId;
              return (
                <Pressable
                  key={u.id}
                  onPress={() => setDrillUserId(selected ? null : u.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary : colors.background,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? "#ffffff" : colors.foreground,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                    numberOfLines={1}
                  >
                    {u.username || u.email}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {drillUserId ? (
          <View
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 13 }}>
              {drillUser?.username || drillUser?.email || drillUserId}
            </Text>
            {usageQuery.isLoading ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : usageQuery.error ? (
              <Text style={{ color: colors.error, fontSize: 12, marginTop: 6 }}>
                Failed to load usage: {String(usageQuery.error.message ?? "")}
              </Text>
            ) : usageQuery.data ? (
              <>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {[
                    { label: "Items", value: String(usageQuery.data.itemsCount) },
                    { label: "Tasks", value: String(usageQuery.data.tasksCount) },
                    { label: "Item storage", value: formatBytes(usageQuery.data.storageBytes) },
                    {
                      label: "AI / 30d",
                      value: String(usageQuery.data.aiCalls30d.reduce((a, b) => a + b, 0)),
                    },
                  ].map((s) => (
                    <View
                      key={s.label}
                      style={{
                        width: "23%",
                        padding: 8,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13 }}>{s.value}</Text>
                      <Text
                        style={{ color: colors.muted, fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginTop: 2 }}
                      >
                        {s.label}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 10, marginBottom: 4 }}>
                  AI calls per day (last 30)
                </Text>
                {usageQuery.data.aiCalls30d.some((v) => v > 0) ? (
                  <LineChart
                    data={{ labels: sparseLabels, datasets: [{ data: usageQuery.data.aiCalls30d }] }}
                    width={chartWidth}
                    height={160}
                    chartConfig={chartConfig}
                    bezier
                    withDots={false}
                    withInnerLines={false}
                    style={{ borderRadius: 6, marginLeft: -8 }}
                  />
                ) : (
                  <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 16, textAlign: "center" }}>
                    No AI calls in the last 30 days.
                  </Text>
                )}
              </>
            ) : null}
          </View>
        ) : null}

        {/* System trends */}
        <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15, marginTop: 20, marginBottom: 8 }}>
          System trends
        </Text>
        {trendsQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : trendsQuery.error ? (
          <Text style={{ color: colors.error, fontSize: 12 }}>
            Failed to load trends: {String(trendsQuery.error.message ?? "")}
          </Text>
        ) : trendsQuery.data ? (
          <View style={{ gap: 12 }}>
            <View
              style={{
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
                Signups (30d)
              </Text>
              {trendsQuery.data.signups30d.some((v) => v > 0) ? (
                <LineChart
                  data={{ labels: sparseLabels, datasets: [{ data: trendsQuery.data.signups30d }] }}
                  width={chartWidth}
                  height={160}
                  chartConfig={chartConfig}
                  bezier
                  withDots={false}
                  withInnerLines={false}
                  style={{ borderRadius: 6, marginLeft: -8, marginTop: 6 }}
                />
              ) : (
                <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 16, textAlign: "center" }}>
                  No new signups in the last 30 days.
                </Text>
              )}
            </View>

            <View
              style={{
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
                Daily active users (30d)
              </Text>
              {trendsQuery.data.dau30d.some((v) => v > 0) ? (
                <LineChart
                  data={{ labels: sparseLabels, datasets: [{ data: trendsQuery.data.dau30d }] }}
                  width={chartWidth}
                  height={160}
                  chartConfig={chartConfig}
                  bezier
                  withDots={false}
                  withInnerLines={false}
                  style={{ borderRadius: 6, marginLeft: -8, marginTop: 6 }}
                />
              ) : (
                <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 16, textAlign: "center" }}>
                  No activity recorded in the last 30 days.
                </Text>
              )}
            </View>
          </View>
        ) : null}

        {/* Failed webhooks */}
        <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15, marginTop: 20, marginBottom: 8 }}>
          Failed webhooks ({failedWebhooksQuery.data?.length ?? 0})
        </Text>
        {failedWebhooksQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : failedWebhooksQuery.error ? (
          <Text style={{ color: colors.error, fontSize: 12 }}>
            Failed to load webhooks: {String(failedWebhooksQuery.error.message ?? "")}
          </Text>
        ) : (failedWebhooksQuery.data ?? []).length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 13, paddingVertical: 12 }}>
            No failing webhook deliveries.
          </Text>
        ) : (
          (failedWebhooksQuery.data ?? []).map((hook: any) => (
            <View
              key={hook.id}
              style={{
                padding: 10,
                marginBottom: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text
                  style={{ color: colors.foreground, fontSize: 12, fontWeight: "600", flex: 1 }}
                  numberOfLines={1}
                >
                  {hook.url}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: colors.error + "22",
                    marginLeft: 8,
                  }}
                >
                  <Text style={{ color: colors.error, fontSize: 10, fontWeight: "700" }}>
                    {hook.lastStatus ?? "—"}
                  </Text>
                </View>
              </View>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
                {hook.event} · failures: {hook.failureCount}
                {hook.lastDeliveredAt
                  ? ` · last: ${new Date(hook.lastDeliveredAt).toLocaleString()}`
                  : ""}
              </Text>
            </View>
          ))
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </ScreenContainer>
  );
}
