import AsyncStorage from "@react-native-async-storage/async-storage";
import { Item, Task, JournalEntry } from "@/lib/db/schema";

// ============================================================================
// Types
// ============================================================================

export interface SyncQueue {
  id: string;
  action: "create" | "update" | "delete";
  entityType: "item" | "task" | "journal";
  entityId: string;
  data: any;
  timestamp: number;
  synced: boolean;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime?: number;
  pendingChanges: number;
  syncError?: string;
}

export interface ConflictResolution {
  strategy: "last-write-wins" | "local-wins" | "server-wins";
  resolvedAt: number;
}

// ============================================================================
// Cloud Sync Service
// ============================================================================

export class CloudSyncService {
  private static instance: CloudSyncService;
  private syncStatus: SyncStatus = {
    isSyncing: false,
    pendingChanges: 0,
  };
  private syncQueue: SyncQueue[] = [];
  private conflictStrategy: "last-write-wins" | "local-wins" | "server-wins" =
    "last-write-wins";

  private constructor() {
    this.initializeSync();
  }

  static getInstance(): CloudSyncService {
    if (!CloudSyncService.instance) {
      CloudSyncService.instance = new CloudSyncService();
    }
    return CloudSyncService.instance;
  }

  /**
   * Initialize sync system
   */
  private async initializeSync(): Promise<void> {
    try {
      // Load sync queue from storage
      await this.loadSyncQueue();

      // Load sync settings
      await this.loadSyncSettings();

      console.log("Cloud sync initialized");
    } catch (error) {
      console.error("Error initializing cloud sync:", error);
    }
  }

  /**
   * Load sync queue from storage
   */
  private async loadSyncQueue(): Promise<void> {
    try {
      const queueData = await AsyncStorage.getItem("sync_queue");
      if (queueData) {
        this.syncQueue = JSON.parse(queueData);
        this.syncStatus.pendingChanges = this.syncQueue.filter(
          (item) => !item.synced
        ).length;
      }
    } catch (error) {
      console.error("Error loading sync queue:", error);
    }
  }

  /**
   * Load sync settings
   */
  private async loadSyncSettings(): Promise<void> {
    try {
      const settings = await AsyncStorage.getItem("sync_settings");
      if (settings) {
        const parsed = JSON.parse(settings);
        this.conflictStrategy = parsed.conflictStrategy || "last-write-wins";
      }
    } catch (error) {
      console.error("Error loading sync settings:", error);
    }
  }

  /**
   * Add item to sync queue
   */
  async queueChange(
    action: "create" | "update" | "delete",
    entityType: "item" | "task" | "journal",
    entityId: string,
    data: any
  ): Promise<void> {
    try {
      const queueItem: SyncQueue = {
        id: `${Date.now()}_${Math.random()}`,
        action,
        entityType,
        entityId,
        data,
        timestamp: Date.now(),
        synced: false,
      };

      this.syncQueue.push(queueItem);
      this.syncStatus.pendingChanges = this.syncQueue.filter(
        (item) => !item.synced
      ).length;

      // Save to storage
      await AsyncStorage.setItem("sync_queue", JSON.stringify(this.syncQueue));
    } catch (error) {
      console.error("Error queueing change:", error);
    }
  }

  /**
   * Perform sync with backend
   */
  async performSync(): Promise<boolean> {
    if (this.syncStatus.isSyncing) {
      console.log("Sync already in progress");
      return false;
    }

    this.syncStatus.isSyncing = true;

    try {
      // In a real implementation, this would:
      // 1. Connect to backend API
      // 2. Send pending changes
      // 3. Receive server updates
      // 4. Resolve conflicts
      // 5. Update local database

      console.log("Starting sync with backend...");

      // Simulate sync delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mark all items as synced (in real implementation, only after successful upload)
      for (const item of this.syncQueue) {
        item.synced = true;
      }

      await AsyncStorage.setItem("sync_queue", JSON.stringify(this.syncQueue));

      this.syncStatus.lastSyncTime = Date.now();
      this.syncStatus.pendingChanges = 0;
      this.syncStatus.syncError = undefined;

      console.log("Sync completed successfully");
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.syncStatus.syncError = errorMessage;
      console.error("Error during sync:", error);
      return false;
    } finally {
      this.syncStatus.isSyncing = false;
    }
  }

  /**
   * Resolve conflicts using selected strategy
   */
  private resolveConflict(
    localData: any,
    serverData: any,
    localTimestamp: number,
    serverTimestamp: number
  ): any {
    switch (this.conflictStrategy) {
      case "last-write-wins":
        return localTimestamp > serverTimestamp ? localData : serverData;

      case "local-wins":
        return localData;

      case "server-wins":
        return serverData;

      default:
        return localData;
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Set conflict resolution strategy
   */
  setConflictStrategy(
    strategy: "last-write-wins" | "local-wins" | "server-wins"
  ): void {
    this.conflictStrategy = strategy;
    AsyncStorage.setItem(
      "sync_settings",
      JSON.stringify({ conflictStrategy: strategy })
    );
  }

  /**
   * Enable/disable cloud sync
   */
  async setSyncEnabled(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem("sync_enabled", String(enabled));
      if (enabled) {
        await this.performSync();
      }
    } catch (error) {
      console.error("Error setting sync enabled:", error);
    }
  }

  /**
   * Check if cloud sync is enabled
   */
  async isSyncEnabled(): Promise<boolean> {
    try {
      const enabled = await AsyncStorage.getItem("sync_enabled");
      return enabled === "true";
    } catch (error) {
      console.error("Error checking sync enabled:", error);
      return false;
    }
  }

  /**
   * Clear sync queue
   */
  async clearSyncQueue(): Promise<void> {
    try {
      this.syncQueue = [];
      this.syncStatus.pendingChanges = 0;
      await AsyncStorage.setItem("sync_queue", JSON.stringify([]));
    } catch (error) {
      console.error("Error clearing sync queue:", error);
    }
  }

  /**
   * Get pending changes count
   */
  getPendingChangesCount(): number {
    return this.syncQueue.filter((item) => !item.synced).length;
  }

  /**
   * Get sync queue for debugging
   */
  getSyncQueue(): SyncQueue[] {
    return [...this.syncQueue];
  }
}
