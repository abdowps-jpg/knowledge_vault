import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Item, ItemType } from "@/lib/db/schema";
import * as storage from "@/lib/db/storage";

// ============================================================================
// Types
// ============================================================================

export type SortOption = "date-desc" | "date-asc" | "title-asc" | "title-desc" | "type";

export interface LibraryFilters {
  searchText: string;
  selectedTags: string[];
  selectedCategories: string[];
  showFavoritesOnly: boolean;
  showArchivedOnly: boolean;
  sortBy: SortOption;
}

export interface LibraryContextType {
  // Items
  items: Item[];
  filteredItems: Item[];
  loading: boolean;

  // Filters
  filters: LibraryFilters;
  setSearchText: (text: string) => void;
  toggleTag: (tagId: string) => void;
  toggleCategory: (categoryId: string) => void;
  toggleFavoritesOnly: () => void;
  toggleArchivedOnly: () => void;
  setSortBy: (sort: SortOption) => void;
  clearFilters: () => void;

  // Item Operations
  loadLibraryItems: () => Promise<void>;
  toggleFavorite: (itemId: string) => Promise<void>;
  toggleArchive: (itemId: string) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  updateItemTags: (itemId: string, tagIds: string[]) => Promise<void>;
  updateItemCategory: (itemId: string, categoryId?: string) => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LibraryFilters>({
    searchText: "",
    selectedTags: [],
    selectedCategories: [],
    showFavoritesOnly: false,
    showArchivedOnly: false,
    sortBy: "date-desc",
  });

  // Load library items
  const loadLibraryItems = useCallback(async () => {
    try {
      setLoading(true);
      const allItems = await storage.getAllItems();
      setItems(allItems);
    } catch (error) {
      console.error("Error loading library items:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Filter by favorites
    if (filters.showFavoritesOnly) {
      result = result.filter((item) => item.isFavorite);
    }

    // Filter by archived
    if (filters.showArchivedOnly) {
      result = result.filter((item) => item.isArchived);
    } else {
      // By default, hide archived items
      result = result.filter((item) => !item.isArchived);
    }

    // Filter by search text
    if (filters.searchText.trim()) {
      const searchLower = filters.searchText.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(searchLower) ||
          item.content.toLowerCase().includes(searchLower)
      );
    }

    // Filter by tags
    if (filters.selectedTags.length > 0) {
      result = result.filter((item) =>
        filters.selectedTags.some((tag) => item.tags.includes(tag))
      );
    }

    // Filter by categories
    if (filters.selectedCategories.length > 0) {
      result = result.filter((item) =>
        item.categoryId && filters.selectedCategories.includes(item.categoryId)
      );
    }

    // Sort items
    switch (filters.sortBy) {
      case "date-asc":
        result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        break;
      case "date-desc":
        result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case "title-asc":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "title-desc":
        result.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case "type":
        result.sort((a, b) => a.type.localeCompare(b.type));
        break;
    }

    return result;
  }, [items, filters]);

  // Filter handlers
  const setSearchText = useCallback((text: string) => {
    setFilters((prev) => ({ ...prev, searchText: text }));
  }, []);

  const toggleTag = useCallback((tagId: string) => {
    setFilters((prev) => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tagId)
        ? prev.selectedTags.filter((id) => id !== tagId)
        : [...prev.selectedTags, tagId],
    }));
  }, []);

  const toggleCategory = useCallback((categoryId: string) => {
    setFilters((prev) => ({
      ...prev,
      selectedCategories: prev.selectedCategories.includes(categoryId)
        ? prev.selectedCategories.filter((id) => id !== categoryId)
        : [...prev.selectedCategories, categoryId],
    }));
  }, []);

  const toggleFavoritesOnly = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      showFavoritesOnly: !prev.showFavoritesOnly,
    }));
  }, []);

  const toggleArchivedOnly = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      showArchivedOnly: !prev.showArchivedOnly,
    }));
  }, []);

  const setSortBy = useCallback((sort: SortOption) => {
    setFilters((prev) => ({ ...prev, sortBy: sort }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      searchText: "",
      selectedTags: [],
      selectedCategories: [],
      showFavoritesOnly: false,
      showArchivedOnly: false,
      sortBy: "date-desc",
    });
  }, []);

  // Item operations
  const toggleFavorite = useCallback(
    async (itemId: string) => {
      try {
        const item = await storage.getItemById(itemId);
        if (!item) throw new Error("Item not found");

        await storage.updateItem(itemId, {
          ...item,
          isFavorite: !item.isFavorite,
        });
        await loadLibraryItems();
      } catch (error) {
        console.error("Error toggling favorite:", error);
        throw error;
      }
    },
    [loadLibraryItems]
  );

  const toggleArchive = useCallback(
    async (itemId: string) => {
      try {
        const item = await storage.getItemById(itemId);
        if (!item) throw new Error("Item not found");

        await storage.updateItem(itemId, {
          ...item,
          isArchived: !item.isArchived,
        });
        await loadLibraryItems();
      } catch (error) {
        console.error("Error toggling archive:", error);
        throw error;
      }
    },
    [loadLibraryItems]
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      try {
        await storage.deleteItem(itemId);
        await loadLibraryItems();
      } catch (error) {
        console.error("Error deleting item:", error);
        throw error;
      }
    },
    [loadLibraryItems]
  );

  const updateItemTags = useCallback(
    async (itemId: string, tagIds: string[]) => {
      try {
        const item = await storage.getItemById(itemId);
        if (!item) throw new Error("Item not found");

        await storage.updateItem(itemId, {
          ...item,
          tags: tagIds,
        });
        await loadLibraryItems();
      } catch (error) {
        console.error("Error updating tags:", error);
        throw error;
      }
    },
    [loadLibraryItems]
  );

  const updateItemCategory = useCallback(
    async (itemId: string, categoryId?: string) => {
      try {
        const item = await storage.getItemById(itemId);
        if (!item) throw new Error("Item not found");

        await storage.updateItem(itemId, {
          ...item,
          categoryId,
        });
        await loadLibraryItems();
      } catch (error) {
        console.error("Error updating category:", error);
        throw error;
      }
    },
    [loadLibraryItems]
  );

  // Load items on mount
  React.useEffect(() => {
    loadLibraryItems();
  }, [loadLibraryItems]);

  const value: LibraryContextType = {
    items,
    filteredItems,
    loading,
    filters,
    setSearchText,
    toggleTag,
    toggleCategory,
    toggleFavoritesOnly,
    toggleArchivedOnly,
    setSortBy,
    clearFilters,
    loadLibraryItems,
    toggleFavorite,
    toggleArchive,
    deleteItem,
    updateItemTags,
    updateItemCategory,
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error("useLibrary must be used within LibraryProvider");
  }
  return context;
}
