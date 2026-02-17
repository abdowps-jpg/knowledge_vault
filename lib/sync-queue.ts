import AsyncStorage from "@react-native-async-storage/async-storage";

export type SyncEntity = "item" | "task" | "journal";
export type SyncAction = "upsert" | "delete";

export interface SyncQueueEntry {
  id: string;
  entity: SyncEntity;
  action: SyncAction;
  payload: Record<string, unknown>;
  queuedAt: string;
}

const KEY = "kv_sync_queue_v1";

export async function getQueue(): Promise<SyncQueueEntry[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as SyncQueueEntry[]) : [];
}

async function saveQueue(queue: SyncQueueEntry[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(queue));
}

export async function addToQueue(entry: Omit<SyncQueueEntry, "id" | "queuedAt">): Promise<SyncQueueEntry> {
  const queue = await getQueue();
  const next: SyncQueueEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  };
  queue.push(next);
  await saveQueue(queue);
  return next;
}

export async function removeFromQueue(entryId: string): Promise<void> {
  const queue = await getQueue();
  await saveQueue(queue.filter((q) => q.id !== entryId));
}

export async function clearQueue(): Promise<void> {
  await saveQueue([]);
}
