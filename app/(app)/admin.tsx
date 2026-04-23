import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function AdminScreen() {
  const colors = useColors();
  const whoamiQuery = trpc.admin.whoami.useQuery();
  const isAdmin = whoamiQuery.data?.isAdmin === true;

  const statsQuery = trpc.admin.systemStats.useQuery(undefined, { enabled: isAdmin });
  const usersQuery = trpc.admin.listUsers.useQuery({ limit: 50 }, { enabled: isAdmin });
  const feedbackQuery = trpc.admin.listFeedback.useQuery({ limit: 30 }, { enabled: isAdmin });
  const auditQuery = trpc.admin.recentAuditEvents.useQuery({ limit: 50 }, { enabled: isAdmin });

  const setActive = trpc.admin.setUserActive.useMutation({
    onSuccess: () => usersQuery.refetch().catch(() => undefined),
  });
  const grantAdmin = trpc.admin.grantAdmin.useMutation({
    onSuccess: () => usersQuery.refetch().catch(() => undefined),
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
        {(feedbackQuery.data ?? []).slice(0, 10).map((f: any) => (
          <View
            key={f.id}
            style={{
              padding: 10,
              marginBottom: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
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
            </View>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }} numberOfLines={3}>
              {f.body}
            </Text>
          </View>
        ))}

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

        <View style={{ height: 60 }} />
      </ScrollView>
    </ScreenContainer>
  );
}
