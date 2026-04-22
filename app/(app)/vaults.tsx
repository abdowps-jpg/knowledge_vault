import React from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Vault = {
  id: string;
  name: string;
  description: string | null;
  role: "owner" | "editor" | "viewer";
};

export default function VaultsScreen() {
  const colors = useColors();
  const vaultsQuery = trpc.vaults.listMine.useQuery();
  const createVault = trpc.vaults.create.useMutation({
    onSuccess: () => vaultsQuery.refetch().catch(() => undefined),
  });
  const inviteMember = trpc.vaults.invite.useMutation();
  const leaveVault = trpc.vaults.leave.useMutation({
    onSuccess: () => vaultsQuery.refetch().catch(() => undefined),
  });
  const deleteVault = trpc.vaults.delete.useMutation({
    onSuccess: () => vaultsQuery.refetch().catch(() => undefined),
  });

  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");

  const [activeVault, setActiveVault] = React.useState<Vault | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"editor" | "viewer">("viewer");

  const membersQuery = trpc.vaults.listMembers.useQuery(
    { vaultId: activeVault?.id ?? "" },
    { enabled: Boolean(activeVault?.id) }
  );
  const feedQuery = trpc.vaults.feed.useQuery(
    { vaultId: activeVault?.id ?? "", limit: 20 },
    { enabled: Boolean(activeVault?.id) }
  );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert("Validation", "Name is required.");
      return;
    }
    try {
      await createVault.mutateAsync({ name, description: newDescription.trim() || undefined });
      setShowCreate(false);
      setNewName("");
      setNewDescription("");
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to create vault.");
    }
  };

  const handleInvite = async () => {
    if (!activeVault) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert("Validation", "Email is required.");
      return;
    }
    try {
      await inviteMember.mutateAsync({ vaultId: activeVault.id, email, role: inviteRole });
      setInviteEmail("");
      membersQuery.refetch().catch(() => undefined);
      Alert.alert("Invited", `${email} has been added as ${inviteRole}.`);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to invite.");
    }
  };

  const handleLeave = () => {
    if (!activeVault) return;
    Alert.alert("Leave vault?", `You will lose access to "${activeVault.name}".`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            await leaveVault.mutateAsync({ vaultId: activeVault.id });
            setActiveVault(null);
          } catch (err: any) {
            Alert.alert("Error", err?.message ?? "Failed to leave.");
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    if (!activeVault) return;
    Alert.alert("Delete vault?", `This permanently removes "${activeVault.name}" and all its members.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteVault.mutateAsync({ id: activeVault.id });
            setActiveVault(null);
          } catch (err: any) {
            Alert.alert("Error", err?.message ?? "Failed to delete.");
          }
        },
      },
    ]);
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>Shared Vaults</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
          Workspaces you share with other people.
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }}>
        <View style={{ padding: 16 }}>
          {vaultsQuery.isLoading ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : !vaultsQuery.data || vaultsQuery.data.length === 0 ? (
            <View
              style={{
                padding: 24,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                backgroundColor: colors.surface,
                alignItems: "center",
              }}
            >
              <MaterialIcons name="group" size={40} color={colors.muted} />
              <Text style={{ color: colors.foreground, fontWeight: "700", marginTop: 12 }}>
                No vaults yet
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 4 }}>
                Create a vault to share a set of notes, tasks, or goals with teammates.
              </Text>
            </View>
          ) : (
            vaultsQuery.data.map((v) => {
              const vault: Vault = {
                id: v.id,
                name: v.name,
                description: v.description ?? null,
                role: v.role,
              };
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setActiveVault(vault)}
                  style={{
                    padding: 14,
                    marginBottom: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15 }}>{v.name}</Text>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: colors.background,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                        {v.role}
                      </Text>
                    </View>
                  </View>
                  {v.description ? (
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }} numberOfLines={2}>
                      {v.description}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })
          )}

          <Pressable
            onPress={() => setShowCreate(true)}
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 12,
              backgroundColor: colors.primary,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>+ New Vault</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: colors.surface }}>
            <Text className="text-xl font-bold text-foreground mb-3">New Vault</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Name"
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                color: colors.foreground,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 10,
              }}
            />
            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Description (optional)"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                color: colors.foreground,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 14,
                textAlignVertical: "top",
              }}
            />
            <View className="flex-row gap-3">
              <Pressable onPress={() => setShowCreate(false)} style={{ flex: 1 }}>
                <View className="rounded-lg py-3 items-center" style={{ backgroundColor: colors.border }}>
                  <Text className="text-foreground font-semibold">Cancel</Text>
                </View>
              </Pressable>
              <Pressable onPress={handleCreate} disabled={createVault.isPending} style={{ flex: 1 }}>
                <View className="rounded-lg py-3 items-center" style={{ backgroundColor: colors.primary }}>
                  {createVault.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold">Create</Text>
                  )}
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(activeVault)} transparent animationType="fade" onRequestClose={() => setActiveVault(null)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6 max-h-[88%]" style={{ backgroundColor: colors.surface }}>
            {activeVault ? (
              <ScrollView style={{ maxHeight: 540 }}>
                <Text className="text-xl font-bold text-foreground">{activeVault.name}</Text>
                {activeVault.description ? (
                  <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
                    {activeVault.description}
                  </Text>
                ) : null}
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textTransform: "uppercase", fontWeight: "700" }}>
                  Your role: {activeVault.role}
                </Text>

                {activeVault.role !== "viewer" ? (
                  <View style={{ marginTop: 16 }}>
                    <Text style={{ color: colors.foreground, fontWeight: "700", marginBottom: 6 }}>
                      Invite by email
                    </Text>
                    <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
                      <TextInput
                        value={inviteEmail}
                        onChangeText={setInviteEmail}
                        placeholder="user@example.com"
                        placeholderTextColor={colors.muted}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        style={{
                          flex: 1,
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                          borderWidth: 1,
                          borderRadius: 8,
                          color: colors.foreground,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      />
                      <Pressable
                        onPress={handleInvite}
                        disabled={inviteMember.isPending || !inviteEmail.trim()}
                        style={{
                          backgroundColor: colors.primary,
                          paddingHorizontal: 14,
                          borderRadius: 8,
                          justifyContent: "center",
                          opacity: inviteMember.isPending || !inviteEmail.trim() ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "700" }}>Invite</Text>
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
                      {(["viewer", "editor"] as const).map((r) => (
                        <Pressable
                          key={r}
                          onPress={() => setInviteRole(r)}
                          style={{
                            flex: 1,
                            paddingVertical: 6,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: inviteRole === r ? colors.primary : colors.border,
                            backgroundColor: inviteRole === r ? colors.primary : colors.background,
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: inviteRole === r ? "#fff" : colors.foreground,
                              fontWeight: "600",
                              fontSize: 12,
                              textTransform: "capitalize",
                            }}
                          >
                            {r}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                <Text style={{ color: colors.foreground, fontWeight: "700", marginTop: 8 }}>Members</Text>
                {membersQuery.isLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  (membersQuery.data ?? []).map((m: any) => (
                    <View
                      key={m.id}
                      style={{
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View>
                        <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                          {m.user?.username || m.user?.email || "Member"}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 11 }}>
                          {m.user?.email}
                        </Text>
                      </View>
                      <Text style={{ color: colors.muted, fontSize: 11, textTransform: "uppercase", fontWeight: "700" }}>
                        {m.role}
                      </Text>
                    </View>
                  ))
                )}

                <Text style={{ color: colors.foreground, fontWeight: "700", marginTop: 16 }}>
                  Recent activity
                </Text>
                {feedQuery.isLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (feedQuery.data ?? []).length === 0 ? (
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>No activity yet.</Text>
                ) : (
                  (feedQuery.data ?? []).map((e: any) => (
                    <View key={e.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{e.action}</Text>
                      <Text style={{ color: colors.muted, fontSize: 10 }}>
                        {e.createdAt ? new Date(e.createdAt).toLocaleString() : ""}
                      </Text>
                    </View>
                  ))
                )}

                <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
                  {activeVault.role === "owner" ? (
                    <Pressable
                      onPress={handleDelete}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: colors.error,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "700" }}>Delete vault</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={handleLeave}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.error,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: colors.error, fontWeight: "700" }}>Leave vault</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setActiveVault(null)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: colors.border,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: colors.foreground, fontWeight: "700" }}>Close</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
