import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Item, ItemType } from "@/lib/db/schema";
import * as storage from "@/lib/db/storage";

// ============================================================================
// Types
// ============================================================================

export type SearchFilterType = "all" | "note" | "quote" | "link" | "audio" | "task" | "journal";

export interface SearchFilters {
  searchText: string;
  type: SearchFilterType;
  tags: string[];
  dateRange?: { start: Date; end: Date };
}

export interface SearchContextType {
  // Search
  searchResults: Item[];
  loading: boolean;
  error: Error | null;
  filters: SearchFilters;

  // Filter handlers
  setSearchText: (text: string) => void;
  setType: (type: SearchFilterType) => void;
  toggleTag: (tagId: string) => void;
  setDateRange: (start: Date, end: Date) => void;
  clearDateRange: () => void;
  clearFilters: () => void;

  // Data loading
  loadAllItems: () => Promise<void>;
  getAllTags: () => Promise<string[]>;
}

// ============================================================================
// Context
// ============================================================================

const SearchContext = createContext<SearchContextType | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({
    searchText: "",
    type: "all",
    tags: [],
  });

  // Load all items
  const loadAllItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const items = await storage.getAllItems();
      setAllItems(items);
    } catch (error) {
      console.error("Error loading items:", error);
      setError(error instanceof Error ? error : new Error("Failed to load search data"));
    } finally {
      setLoading(false);
    }
  }, []);

  // Get all unique tags
  const getAllTags = useCallback(async () => {
    try {
      const items = await storage.getAllItems();
      const tagsSet = new Set<string>();
      items.forEach((item) => {
        item.tags.forEach((tag) => tagsSet.add(tag));
      });
      return Array.from(tagsSet).sort();
    } catch (error) {
      console.error("Error getting tags:", error);
      return [];
    }
  }, []);

  // Filter and search items
  const searchResults = useMemo(() => {
    let results = [...allItems];

    // Filter by type
    if (filters.type !== "all") {
      const typeMap: Record<SearchFilterType, string> = {
        all: ItemType.NOTE,
        note: ItemType.NOTE,
        quote: ItemType.QUOTE,
        link: ItemType.LINK,
        audio: ItemType.AUDIO,
        task: ItemType.TASK,
        journal: ItemType.JOURNAL,
      };
      results = results.filter((item) => item.type === typeMap[filters.type]);
    }

    // Filter by search text
    if (filters.searchText.trim()) {
      const searchLower = filters.searchText.toLowerCase();
      results = results.filter(
        (item) =>
          item.title.toLowerCase().includes(searchLower) ||
          item.content.toLowerCase().includes(searchLower)
      );
    }

    // Filter by tags
    if (filters.tags.length > 0) {
      results = results.filter((item) =>
        filters.tags.some((tag) => item.tags.includes(tag))
      );
    }

    // Filter by date range
    if (filters.dateRange) {
      results = results.filter((item) => {
        const itemDate = item.createdAt;
        return (
          itemDate >= filters.dateRange!.start &&
          itemDate <= filters.dateRange!.end
        );
      });
    }

    // Sort by relevance (search text match) and then by date
    if (filters.searchText.trim()) {
      results.sort((a, b) => {
        const searchLower = filters.searchText.toLowerCase();
        const aMatches = (a.title + a.content).toLowerCase().match(new RegExp(searchLower, "g"))?.length || 0;
        const bMatches = (b.title + b.content).toLowerCase().match(new RegExp(searchLower, "g"))?.length || 0;

        if (aMatches !== bMatches) {
          return bMatches - aMatches;
        }
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    } else {
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    return results;
  }, [allItems, filters]);

  // Filter handlers
  const setSearchText = useCallback((text: string) => {
    setFilters((prev) => ({ ...prev, searchText: text }));
  }, []);

  const setType = useCallback((type: SearchFilterType) => {
    setFilters((prev) => ({ ...prev, type }));
  }, []);

  const toggleTag = useCallback((tagId: string) => {
    setFilters((prev) => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter((id) => id !== tagId)
        : [...prev.tags, tagId],
    }));
  }, []);

  const setDateRange = useCallback((start: Date, end: Date) => {
    setFilters((prev) => ({ ...prev, dateRange: { start, end } }));
  }, []);

  const clearDateRange = useCallback(() => {
    setFilters((prev) => ({ ...prev, dateRange: undefined }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      searchText: "",
      type: "all",
      tags: [],
      dateRange: undefined,
    });
  }, []);

  // Load items on mount
  React.useEffect(() => {
    loadAllItems();
  }, [loadAllItems]);

  const value: SearchContextType = {
    searchResults,
    loading,
    error,
    filters,
    setSearchText,
    setType,
    toggleTag,
    setDateRange,
    clearDateRange,
    clearFilters,
    loadAllItems,
    getAllTags,
  };

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within SearchProvider");
  }
  return context;
}
