import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createTRPCClient } from "@/lib/trpc";

type SyncStatus = "synced" | "syncing" | "offline" | "failed";

interface QueueItem {
  id: string;
  path: string;
  input: unknown;
  createdAt: string;
  attempts: number;
}

interface SyncProgress {
  done: number;
  total: number;
}

export interface OfflineSnapshot {
  isOnline: boolean;
  status: SyncStatus;
  queueLength: number;
  syncProgress: SyncProgress;
}

const STORAGE_KEY = "offline_mutation_queue_v1";

class OfflineManager {
  private queue: QueueItem[] = [];
  private listeners = new Set<(snapshot: OfflineSnapshot) => void>();
  private initialized = false;
  private isOnline = true;
  private status: SyncStatus = "synced";
  private syncing = false;
  private syncProgress: SyncProgress = { done: 0, total: 0 };
  private netUnsubscribe: (() => void) | null = null;
  private trpcClient = createTRPCClient();

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await this.loadQueue();

    const state = await NetInfo.fetch();
    this.isOnline = !!state.isConnected;
    this.status = this.isOnline ? (this.queue.length > 0 ? "failed" : "synced") : "offline";
    this.notify();

    this.netUnsubscribe = NetInfo.addEventListener((nextState) => {
      const nextOnline = !!nextState.isConnected;
      if (nextOnline === this.isOnline) return;
      this.isOnline = nextOnline;
      this.status = nextOnline ? (this.queue.length > 0 ? "syncing" : "synced") : "offline";
      this.notify();
      if (nextOnline) {
        this.syncQueue();
      }
    });

    if (this.isOnline && this.queue.length > 0) {
      this.syncQueue();
    }
  }

  destroy(): void {
    this.netUnsubscribe?.();
    this.netUnsubscribe = null;
    this.initialized = false;
  }

  getSnapshot(): OfflineSnapshot {
    return {
      isOnline: this.isOnline,
      status: this.status,
      queueLength: this.queue.length,
      syncProgress: this.syncProgress,
    };
  }

  subscribe(listener: (snapshot: OfflineSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async loadQueue(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this.queue = raw ? (JSON.parse(raw) as QueueItem[]) : [];
    } catch (error) {
      console.error("Failed loading offline queue:", error);
      this.queue = [];
    }
  }

  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error("Failed saving offline queue:", error);
    }
  }

  private isLikelyNetworkError(error: unknown): boolean {
    const message = String((error as { message?: string })?.message || error || "").toLowerCase();
    return (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("failed to fetch") ||
      message.includes("offline")
    );
  }

  async enqueueMutation(path: string, input: unknown): Promise<void> {
    this.queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path,
      input,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    await this.persistQueue();
    this.status = this.isOnline ? "failed" : "offline";
    this.notify();
  }

  async runOrQueueMutation<T>(
    path: string,
    input: unknown,
    runner: () => Promise<T>
  ): Promise<T | { queued: true }> {
    if (!this.isOnline) {
      await this.enqueueMutation(path, input);
      return { queued: true };
    }

    try {
      const result = await runner();
      this.status = this.queue.length > 0 ? "failed" : "synced";
      this.notify();
      return result;
    } catch (error) {
      if (this.isLikelyNetworkError(error)) {
        await this.enqueueMutation(path, input);
        return { queued: true };
      }
      this.status = "failed";
      this.notify();
      throw error;
    }
  }

  async syncQueue(): Promise<void> {
    if (this.syncing || !this.isOnline || this.queue.length === 0) {
      if (!this.isOnline) {
        this.status = "offline";
        this.notify();
      }
      return;
    }

    this.syncing = true;
    this.status = "syncing";
    this.syncProgress = { done: 0, total: this.queue.length };
    this.notify();

    while (this.queue.length > 0 && this.isOnline) {
      const item = this.queue[0];
      try {
        await this.trpcClient.mutation(item.path as never, item.input as never);
        this.queue.shift();
        this.syncProgress = {
          done: this.syncProgress.done + 1,
          total: this.syncProgress.total,
        };
        await this.persistQueue();
        this.notify();
      } catch (error) {
        if (this.isLikelyNetworkError(error)) {
          this.status = "offline";
          this.notify();
          break;
        }

        item.attempts += 1;
        if (item.attempts >= 3) {
          this.queue.shift();
        } else {
          this.queue.push(this.queue.shift()!);
        }
        await this.persistQueue();
        this.status = "failed";
        this.notify();
        break;
      }
    }

    this.syncing = false;
    if (!this.isOnline) {
      this.status = "offline";
    } else if (this.queue.length === 0) {
      this.status = "synced";
      this.syncProgress = { done: 0, total: 0 };
    } else {
      this.status = "failed";
    }
    this.notify();
  }
}

export const offlineManager = new OfflineManager();
