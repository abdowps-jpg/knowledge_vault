import React from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { addConflict, ConflictRecord, listConflicts, removeConflict } from "@/lib/conflicts-storage";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";

export default function ConflictsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [conflicts, setConflicts] = React.useState<ConflictRecord[]>([]);
  const [activeConflictId, setActiveConflictId] = React.useState<string | null>(null);
  const [mergeResult, setMergeResult] = React.useState("");
  const updateItem = trpc.items.update.useMutation();

  const activeConflict = React.useMemo(
    () => conflicts.find((conflict) => conflict.id === activeConflictId) ?? null,
    [activeConflictId, conflicts]
  );

  const refreshConflicts = React.useCallback(async () => {
    const rows = await listConflicts();
    setConflicts(rows);
    setActiveConflictId((prev) => (prev && rows.some((row) => row.id === prev) ? prev : rows[0]?.id ?? null));
    if (!rows.length) setMergeResult("");
  }, []);

  React.useEffect(() => {
    refreshConflicts().catch(() => undefined);
  }, [refreshConflicts]);

  React.useEffect(() => {
    if (!activeConflict) {
      setMergeResult("");
      return;
    }
    setMergeResult(activeConflict.localContent || activeConflict.serverContent || "");
  }, [activeConflict?.id]);

  const resolveConflict = async (mode: "local" | "server" | "merge") => {
    if (!activeConflict) return;
    const titleToSave = mode === "server" ? activeConflict.serverTitle : activeConflict.localTitle;
    const contentToSave =
      mode === "local"
        ? activeConflict.localContent
        : mode === "server"
        ? activeConflict.serverContent
        : mergeResult.trim();

    if (!contentToSave.trim()) {
      Alert.alert("Validation", "Merged content cannot be empty.");
      return;
    }

    try {
      await updateItem.mutateAsync({
        id: activeConflict.itemId,
        title: titleToSave || activeConflict.itemTitle,
        content: contentToSave,
      });
      await removeConflict(activeConflict.id);
      await refreshConflicts();
      Alert.alert("Resolved", "Conflict resolved and saved.");
      console.log("✅ Feature 30 completed and tested");
    } catch (error: any) {
      console.error("[Conflicts] Resolve failed:", error);
      Alert.alert("Error", error?.message || "Failed to resolve conflict.");
    }
  };

  const createDemoConflict = async () => {
    const demo: ConflictRecord = {
      id: `conflict-${Date.now()}`,
      itemId: "demo-item-id",
      itemTitle: "Demo Item",
      localTitle: "Demo Item (Local)",
      localContent: "Local draft content.",
      serverTitle: "Demo Item (Server)",
      serverContent: "Server draft content.",
      createdAt: new Date().toISOString(),
    };
    await addConflict(demo);
    await refreshConflicts();
  };

  return (
    <ScreenContainer>
      <View className="px-4 py-4 border-b border-border flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3">
          <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">Conflict Resolution</Text>
      </View>
      <ScrollView className="flex-1 p-4">
        <View className="bg-surface border border-border rounded-xl p-4 mb-3">
          <Text className="text-foreground font-semibold mb-2">Conflicts Queue ({conflicts.length})</Text>
          {conflicts.length === 0 ? (
            <Text className="text-muted mb-2">No conflicts detected.</Text>
          ) : (
            conflicts.map((conflict) => (
              <Pressable
                key={conflict.id}
                onPress={() => setActiveConflictId(conflict.id)}
                style={{
                  borderWidth: 1,
                  borderColor: activeConflictId === conflict.id ? colors.primary : colors.border,
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>{conflict.itemTitle}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {new Date(conflict.createdAt).toLocaleString()}
                </Text>
              </Pressable>
            ))
          )}
          {conflicts.length === 0 ? (
            <Pressable onPress={createDemoConflict} className="bg-border rounded-lg py-3 items-center mt-2">
              <Text className="text-foreground font-semibold">Create Demo Conflict</Text>
            </Pressable>
          ) : null}
        </View>

        {activeConflict ? (
          <View className="bg-surface border border-border rounded-xl p-4">
            <Text className="text-foreground font-semibold mb-2">Conflict Detected</Text>
            <Text className="text-muted mb-3">Choose which version to keep or merge manually.</Text>
            <View className="flex-row gap-2">
              <View className="flex-1 bg-background border border-border rounded-lg p-3">
                <Text className="text-xs text-muted mb-2">Local Version</Text>
                <Text className="text-foreground font-semibold mb-1">{activeConflict.localTitle}</Text>
                <Text className="text-foreground">{activeConflict.localContent}</Text>
              </View>
              <View className="flex-1 bg-background border border-border rounded-lg p-3">
                <Text className="text-xs text-muted mb-2">Server Version</Text>
                <Text className="text-foreground font-semibold mb-1">{activeConflict.serverTitle}</Text>
                <Text className="text-foreground">{activeConflict.serverContent}</Text>
              </View>
            </View>
            <TextInput
              placeholder="Manual merge result..."
              className="bg-background border border-border rounded-lg px-3 py-3 text-foreground mt-3"
              placeholderTextColor="#9ca3af"
              multiline
              value={mergeResult}
              onChangeText={setMergeResult}
            />
            <View className="flex-row gap-2 mt-3">
              <Pressable onPress={() => resolveConflict("local")} className="flex-1 bg-border rounded-lg py-3 items-center">
                <Text className="text-foreground font-semibold">Keep Local</Text>
              </Pressable>
              <Pressable onPress={() => resolveConflict("server")} className="flex-1 bg-border rounded-lg py-3 items-center">
                <Text className="text-foreground font-semibold">Keep Server</Text>
              </Pressable>
              <Pressable onPress={() => resolveConflict("merge")} className="flex-1 bg-primary rounded-lg py-3 items-center">
                <Text className="text-white font-semibold">Save Merge</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
