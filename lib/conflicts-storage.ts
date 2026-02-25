import AsyncStorage from "@react-native-async-storage/async-storage";

export type ConflictRecord = {
  id: string;
  itemId: string;
  itemTitle: string;
  localTitle: string;
  localContent: string;
  serverTitle: string;
  serverContent: string;
  createdAt: string;
};

const CONFLICTS_KEY = "kv_conflicts_v1";

export async function listConflicts(): Promise<ConflictRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(CONFLICTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("[Conflicts] Failed listing conflicts:", error);
    return [];
  }
}

export async function saveConflicts(conflicts: ConflictRecord[]): Promise<void> {
  await AsyncStorage.setItem(CONFLICTS_KEY, JSON.stringify(conflicts));
}

export async function addConflict(record: ConflictRecord): Promise<void> {
  const current = await listConflicts();
  const next = [record, ...current.filter((conflict) => conflict.id !== record.id)].slice(0, 100);
  await saveConflicts(next);
}

export async function removeConflict(id: string): Promise<void> {
  const current = await listConflicts();
  await saveConflicts(current.filter((conflict) => conflict.id !== id));
}
