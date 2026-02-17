import React, { createContext, useContext, useState, useCallback } from "react";
import { Item, ItemType } from "@/lib/db/schema";
import * as storage from "@/lib/db/storage";
import { addToQueue } from "@/lib/sync-queue";
import { syncUp } from "@/lib/sync-manager";

// ============================================================================
// Types
// ============================================================================

export interface QuickAddModalState {
  isOpen: boolean;
  activeTab: "note" | "quote" | "link" | "audio" | "task";
  autoPickImage?: boolean;
}

export interface InboxContextType {
  // Items
  items: Item[];
  loading: boolean;
  refreshing: boolean;

  // Quick Add Modal
  quickAddModal: QuickAddModalState;
  openQuickAdd: (
    tab?: "note" | "quote" | "link" | "audio" | "task",
    options?: { autoPickImage?: boolean }
  ) => void;
  closeQuickAdd: () => void;
  setActiveTab: (tab: "note" | "quote" | "link" | "audio" | "task") => void;

  // Item Operations
  loadInboxItems: () => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  updateItem: (itemId: string, updates: Partial<Omit<Item, "id" | "createdAt">>) => Promise<Item | null>;
  moveToLibrary: (itemId: string, categoryId?: string) => Promise<void>;
  convertToTask: (itemId: string, dueDate?: Date, priority?: "low" | "medium" | "high") => Promise<void>;
  addItem: (item: Omit<Item, "id" | "createdAt" | "updatedAt">) => Promise<Item>;
}

// ============================================================================
// Context
// ============================================================================

const InboxContext = createContext<InboxContextType | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quickAddModal, setQuickAddModal] = useState<QuickAddModalState>({
    isOpen: false,
    activeTab: "note",
    autoPickImage: false,
  });

  // Load inbox items
  const loadInboxItems = useCallback(async () => {
    try {
      setLoading(true);
      const inboxItems = await storage.getInboxItems();
      setItems(inboxItems);
    } catch (error) {
      console.error("Error loading inbox items:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete item
  const deleteItemHandler = useCallback(async (itemId: string) => {
    try {
      await storage.deleteItem(itemId);
      await addToQueue({ entity: "item", action: "delete", payload: { id: itemId } });
      await syncUp().catch(() => undefined);
      await loadInboxItems();
    } catch (error) {
      console.error("Error deleting item:", error);
      throw error;
    }
  }, [loadInboxItems]);

  const updateItemHandler = useCallback(
    async (itemId: string, updates: Partial<Omit<Item, "id" | "createdAt">>) => {
      try {
        const updated = await storage.updateItem(itemId, updates);
        if (updated) {
          await addToQueue({ entity: "item", action: "upsert", payload: updated as unknown as Record<string, unknown> });
          await syncUp().catch(() => undefined);
        }
        await loadInboxItems();
        return updated;
      } catch (error) {
        console.error("Error updating item:", error);
        throw error;
      }
    },
    [loadInboxItems]
  );

  // Move to library
  const moveToLibrary = useCallback(async (itemId: string, categoryId?: string) => {
    try {
      const item = await storage.getItemById(itemId);
      if (!item) throw new Error("Item not found");

      // Update item to remove from inbox (if we implement inbox concept)
      // For now, just mark it as organized
      await storage.updateItem(itemId, {
        ...item,
        categoryId,
      });
      await loadInboxItems();
    } catch (error) {
      console.error("Error moving item to library:", error);
      throw error;
    }
  }, [loadInboxItems]);

  // Convert to task
  const convertToTaskHandler = useCallback(
    async (itemId: string, dueDate?: Date, priority?: "low" | "medium" | "high") => {
      try {
        const item = await storage.getItemById(itemId);
        if (!item) throw new Error("Item not found");

        // Create a new task from the item
        const newTask: Omit<Item, "id" | "createdAt" | "updatedAt"> = {
          type: ItemType.TASK,
          title: item.title,
          content: item.content,
          categoryId: item.categoryId,
          tags: item.tags,
          isFavorite: false,
          isArchived: false,
          dueDate,
          priority: (priority as any) || "medium",
          isCompleted: false,
          recurrencePattern: "none",
        } as any;

        // Create the task
        await storage.createItem(newTask);

        // Delete the original item
        await storage.deleteItem(itemId);

        await loadInboxItems();
      } catch (error) {
        console.error("Error converting item to task:", error);
        throw error;
      }
    },
    [loadInboxItems]
  );

  // Add item
  const addItemHandler = useCallback(
    async (item: Omit<Item, "id" | "createdAt" | "updatedAt">) => {
      try {
        const newItem = await storage.createItem(item);
        await addToQueue({ entity: "item", action: "upsert", payload: newItem as unknown as Record<string, unknown> });
        await syncUp().catch(() => undefined);
        await loadInboxItems();
        return newItem;
      } catch (error) {
        console.error("Error adding item:", error);
        throw error;
      }
    },
    [loadInboxItems]
  );

  // Quick Add Modal handlers
  const openQuickAdd = useCallback(
    (tab?: "note" | "quote" | "link" | "audio" | "task", options?: { autoPickImage?: boolean }) => {
      setQuickAddModal({
        isOpen: true,
        activeTab: tab || "note",
        autoPickImage: options?.autoPickImage ?? false,
      });
    },
    []
  );

  const closeQuickAdd = useCallback(() => {
    setQuickAddModal({
      isOpen: false,
      activeTab: "note",
      autoPickImage: false,
    });
  }, []);

  const setActiveTab = useCallback((tab: "note" | "quote" | "link" | "audio" | "task") => {
    setQuickAddModal((prev) => ({
      ...prev,
      activeTab: tab,
    }));
  }, []);

  // Load items on mount
  React.useEffect(() => {
    loadInboxItems();
  }, [loadInboxItems]);

  const value: InboxContextType = {
    items,
    loading,
    refreshing,
    quickAddModal,
    openQuickAdd,
    closeQuickAdd,
    setActiveTab,
    loadInboxItems,
    deleteItem: deleteItemHandler,
    updateItem: updateItemHandler,
    moveToLibrary,
    convertToTask: convertToTaskHandler,
    addItem: addItemHandler,
  };

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useInbox() {
  const context = useContext(InboxContext);
  if (!context) {
    throw new Error("useInbox must be used within InboxProvider");
  }
  return context;
}
