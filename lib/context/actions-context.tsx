import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Item, ItemType } from "@/lib/db/schema";
import * as storage from "@/lib/db/storage";

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = "active" | "completed" | "overdue";
export type TaskSortOption = "due-date" | "priority" | "created-date" | "title";

export interface TaskFilters {
  status: TaskStatus;
  priority?: string;
  sortBy: TaskSortOption;
}

export interface ActionsContextType {
  // Tasks
  tasks: Item[];
  filteredTasks: Item[];
  loading: boolean;

  // Filters
  filters: TaskFilters;
  setStatus: (status: TaskStatus) => void;
  setPriority: (priority?: string) => void;
  setSortBy: (sort: TaskSortOption) => void;

  // Task Operations
  loadTasks: () => Promise<void>;
  createTask: (
    title: string,
    description?: string,
    dueDate?: Date,
    priority?: string,
    recurrencePattern?: string
  ) => Promise<Item>;
  updateTask: (itemId: string, updates: Partial<Item>) => Promise<void>;
  completeTask: (itemId: string) => Promise<void>;
  deleteTask: (itemId: string) => Promise<void>;
  getTaskStats: () => { total: number; completed: number; overdue: number };
}

// ============================================================================
// Context
// ============================================================================

const ActionsContext = createContext<ActionsContextType | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

export function ActionsProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TaskFilters>({
    status: "active",
    sortBy: "due-date",
  });

  // Load tasks
  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const allItems = await storage.getAllItems();
      // Filter to only tasks
      const taskItems = allItems.filter((item) => item.type === ItemType.TASK);
      setTasks(taskItems);
    } catch (error) {
      console.error("Error loading tasks:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let result = [...tasks];
    const now = new Date();

    // Filter by status
    switch (filters.status) {
      case "completed":
        result = result.filter((task) => (task as any).isCompleted);
        break;
      case "overdue":
        result = result.filter(
          (task) =>
            !(task as any).isCompleted &&
            (task as any).dueDate &&
            new Date((task as any).dueDate) < now
        );
        break;
      case "active":
        result = result.filter(
          (task) =>
            !(task as any).isCompleted &&
            (!(task as any).dueDate || new Date((task as any).dueDate) >= now)
        );
        break;
    }

    // Filter by priority
    if (filters.priority) {
      result = result.filter((task) => (task as any).priority === filters.priority);
    }

    // Sort tasks
    switch (filters.sortBy) {
      case "due-date":
        result.sort((a, b) => {
          const aDue = (a as any).dueDate ? new Date((a as any).dueDate).getTime() : Infinity;
          const bDue = (b as any).dueDate ? new Date((b as any).dueDate).getTime() : Infinity;
          return aDue - bDue;
        });
        break;
      case "priority":
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        result.sort((a, b) => {
          const aPriority = priorityOrder[(a as any).priority || "medium"] || 1;
          const bPriority = priorityOrder[(b as any).priority || "medium"] || 1;
          return aPriority - bPriority;
        });
        break;
      case "created-date":
        result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case "title":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }

    return result;
  }, [tasks, filters]);

  // Filter handlers
  const setStatus = useCallback((status: TaskStatus) => {
    setFilters((prev) => ({ ...prev, status }));
  }, []);

  const setPriority = useCallback((priority?: string) => {
    setFilters((prev) => ({ ...prev, priority }));
  }, []);

  const setSortBy = useCallback((sort: TaskSortOption) => {
    setFilters((prev) => ({ ...prev, sortBy: sort }));
  }, []);

  // Task operations
  const createTask = useCallback(
    async (
      title: string,
      description?: string,
      dueDate?: Date,
      priority?: string,
      recurrencePattern?: string
    ) => {
      try {
        const newTask = await storage.createItem({
          type: ItemType.TASK,
          title,
          content: description || "",
          tags: [],
          isFavorite: false,
          isArchived: false,
          dueDate,
          priority: (priority || "medium") as any,
          isCompleted: false,
          recurrencePattern: recurrencePattern || "none",
        } as any);

        await loadTasks();
        return newTask;
      } catch (error) {
        console.error("Error creating task:", error);
        throw error;
      }
    },
    [loadTasks]
  );

  const updateTask = useCallback(
    async (itemId: string, updates: Partial<Item>) => {
      try {
        const task = await storage.getItemById(itemId);
        if (!task) throw new Error("Task not found");

        await storage.updateItem(itemId, {
          ...task,
          ...updates,
        } as any);
        await loadTasks();
      } catch (error) {
        console.error("Error updating task:", error);
        throw error;
      }
    },
    [loadTasks]
  );

  const completeTask = useCallback(
    async (itemId: string) => {
      try {
        const task = await storage.getItemById(itemId);
        if (!task) throw new Error("Task not found");

        await storage.updateItem(itemId, {
          ...task,
          isCompleted: !(task as any).isCompleted,
        } as any);
        await loadTasks();
      } catch (error) {
        console.error("Error completing task:", error);
        throw error;
      }
    },
    [loadTasks]
  );

  const deleteTask = useCallback(
    async (itemId: string) => {
      try {
        await storage.deleteItem(itemId);
        await loadTasks();
      } catch (error) {
        console.error("Error deleting task:", error);
        throw error;
      }
    },
    [loadTasks]
  );

  const getTaskStats = useCallback(() => {
    const now = new Date();
    const total = tasks.length;
    const completed = tasks.filter((t) => (t as any).isCompleted).length;
    const overdue = tasks.filter(
      (t) =>
        !(t as any).isCompleted &&
        (t as any).dueDate &&
        new Date((t as any).dueDate) < now
    ).length;

    return { total, completed, overdue };
  }, [tasks]);

  // Load tasks on mount
  React.useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const value: ActionsContextType = {
    tasks,
    filteredTasks,
    loading,
    filters,
    setStatus,
    setPriority,
    setSortBy,
    loadTasks,
    createTask,
    updateTask,
    completeTask,
    deleteTask,
    getTaskStats,
  };

  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useActions() {
  const context = useContext(ActionsContext);
  if (!context) {
    throw new Error("useActions must be used within ActionsProvider");
  }
  return context;
}
