import AsyncStorage from "@react-native-async-storage/async-storage";
import { createTRPCClient } from "@/lib/trpc";
import { clearQueue, getQueue, removeFromQueue, type SyncQueueEntry } from "@/lib/sync-queue";

const LAST_SYNC_KEY = "kv_last_sync_at";

export async function getLastSyncTime(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function setLastSyncTime(ts: number): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY, String(ts));
}

export async function getSyncQueue(): Promise<SyncQueueEntry[]> {
  return getQueue();
}

export async function clearSyncQueue(): Promise<void> {
  await clearQueue();
}

export async function syncUp(): Promise<{ synced: number; failed: number }> {
  const client = createTRPCClient();
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const items: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];
  const journal: Record<string, unknown>[] = [];

  for (const q of queue) {
    if (q.entity === "item") items.push(q.payload);
    if (q.entity === "task") tasks.push(q.payload);
    if (q.entity === "journal") journal.push(q.payload);
  }

  const response = await client.sync.batchSync.mutate({ items, tasks, journal });
  let synced = 0;
  let failed = 0;
  for (const result of response.results) {
    if (result.success) synced += 1;
    else failed += 1;
  }

  if (synced > 0) {
    for (const entry of queue) {
      await removeFromQueue(entry.id);
    }
  }
  await setLastSyncTime(response.serverTimestamp);
  return { synced, failed };
}

export async function syncDown(): Promise<{
  items: unknown[];
  tasks: unknown[];
  journal: unknown[];
  serverTimestamp: number;
}> {
  const client = createTRPCClient();
  const since = await getLastSyncTime();
  const [items, tasks, journal] = await Promise.all([
    client.items.syncItems.query({ since: since ?? undefined }),
    client.tasks.syncTasks.query({ since: since ?? undefined }),
    client.journal.syncJournal.query({ since: since ?? undefined }),
  ]);

  const serverTimestamp = Date.now();
  await setLastSyncTime(serverTimestamp);

  return {
    items,
    tasks,
    journal,
    serverTimestamp,
  };
}

export async function fullSync() {
  const up = await syncUp();
  const down = await syncDown();
  return { up, down };
}
