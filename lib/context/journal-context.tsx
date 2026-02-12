import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Item, ItemType } from "@/lib/db/schema";
import * as storage from "@/lib/db/storage";

// ============================================================================
// Types
// ============================================================================

export interface JournalContextType {
  // Entries
  entries: Item[];
  selectedDate: Date;
  entriesForSelectedDate: Item[];
  loading: boolean;

  // Navigation
  setSelectedDate: (date: Date) => void;
  goToToday: () => void;
  goToPreviousDay: () => void;
  goToNextDay: () => void;

  // Entry Operations
  loadEntries: () => Promise<void>;
  createEntry: (
    content: string,
    mood?: string,
    location?: string,
    weather?: string
  ) => Promise<Item>;
  updateEntry: (itemId: string, updates: Partial<Item>) => Promise<void>;
  deleteEntry: (itemId: string) => Promise<void>;

  // Calendar Utilities
  getEntriesForDate: (date: Date) => Item[];
  hasEntryForDate: (date: Date) => boolean;
  getEntriesForMonth: (year: number, month: number) => Map<number, Item[]>;
}

// ============================================================================
// Context
// ============================================================================

const JournalContext = createContext<JournalContextType | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  // Load entries
  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const allItems = await storage.getAllItems();
      // Filter to only journal entries
      const journalItems = allItems.filter((item) => item.type === ItemType.JOURNAL);
      setEntries(journalItems);
    } catch (error) {
      console.error("Error loading journal entries:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Get entries for selected date
  const entriesForSelectedDate = useMemo(() => {
    return entries.filter((entry) => {
      const entryDate = new Date(entry.createdAt);
      entryDate.setHours(0, 0, 0, 0);
      return entryDate.getTime() === selectedDate.getTime();
    });
  }, [entries, selectedDate]);

  // Navigation handlers
  const goToToday = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDate(today);
  }, []);

  const goToPreviousDay = useCallback(() => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  }, [selectedDate]);

  const goToNextDay = useCallback(() => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  }, [selectedDate]);

  // Entry operations
  const createEntry = useCallback(
    async (
      content: string,
      mood?: string,
      location?: string,
      weather?: string
    ) => {
      try {
        const newEntry = await storage.createItem({
          type: ItemType.JOURNAL,
          title: `Journal Entry - ${selectedDate.toLocaleDateString()}`,
          content,
          tags: [],
          isFavorite: false,
          isArchived: false,
          mood,
          location,
          weather,
        } as any);

        await loadEntries();
        return newEntry;
      } catch (error) {
        console.error("Error creating journal entry:", error);
        throw error;
      }
    },
    [selectedDate, loadEntries]
  );

  const updateEntry = useCallback(
    async (itemId: string, updates: Partial<Item>) => {
      try {
        const entry = await storage.getItemById(itemId);
        if (!entry) throw new Error("Entry not found");

        await storage.updateItem(itemId, {
          ...entry,
          ...updates,
        } as any);
        await loadEntries();
      } catch (error) {
        console.error("Error updating entry:", error);
        throw error;
      }
    },
    [loadEntries]
  );

  const deleteEntry = useCallback(
    async (itemId: string) => {
      try {
        await storage.deleteItem(itemId);
        await loadEntries();
      } catch (error) {
        console.error("Error deleting entry:", error);
        throw error;
      }
    },
    [loadEntries]
  );

  // Calendar utilities
  const getEntriesForDate = useCallback(
    (date: Date) => {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      return entries.filter((entry) => {
        const entryDate = new Date(entry.createdAt);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate.getTime() === targetDate.getTime();
      });
    },
    [entries]
  );

  const hasEntryForDate = useCallback(
    (date: Date) => {
      return getEntriesForDate(date).length > 0;
    },
    [getEntriesForDate]
  );

  const getEntriesForMonth = useCallback(
    (year: number, month: number) => {
      const monthEntries = new Map<number, Item[]>();

      entries.forEach((entry) => {
        const entryDate = new Date(entry.createdAt);
        if (entryDate.getFullYear() === year && entryDate.getMonth() === month) {
          const day = entryDate.getDate();
          if (!monthEntries.has(day)) {
            monthEntries.set(day, []);
          }
          monthEntries.get(day)!.push(entry);
        }
      });

      return monthEntries;
    },
    [entries]
  );

  // Load entries on mount
  React.useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const value: JournalContextType = {
    entries,
    selectedDate,
    entriesForSelectedDate,
    loading,
    setSelectedDate,
    goToToday,
    goToPreviousDay,
    goToNextDay,
    loadEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    getEntriesForDate,
    hasEntryForDate,
    getEntriesForMonth,
  };

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useJournal() {
  const context = useContext(JournalContext);
  if (!context) {
    throw new Error("useJournal must be used within JournalProvider");
  }
  return context;
}
