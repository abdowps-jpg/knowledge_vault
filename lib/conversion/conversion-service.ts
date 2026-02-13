import {
  Item,
  Note,
  Quote,
  Link,
  Audio,
  Task,
  JournalEntry,
  ItemType,
} from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

/**
 * Service for converting and moving items between different sections
 */
export class ConversionService {
  private static instance: ConversionService;

  private constructor() {}

  static getInstance(): ConversionService {
    if (!ConversionService.instance) {
      ConversionService.instance = new ConversionService();
    }
    return ConversionService.instance;
  }

  /**
   * Convert any Item to Note (generic conversion)
   */
  convertToNote(item: Item): Note {
    return {
      id: uuidv4(),
      type: ItemType.NOTE,
      title: item.title || "Untitled Note",
      content: item.content,
      categoryId: item.categoryId,
      tags: item.tags || [],
      isFavorite: false,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Convert any Item to Task
   */
  convertToTask(item: Item): Task {
    return {
      id: uuidv4(),
      type: ItemType.TASK,
      title: item.title || "Untitled Task",
      content: item.content,
      categoryId: item.categoryId,
      tags: item.tags || [],
      isFavorite: false,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      priority: "medium",
      isCompleted: false,
      completedAt: undefined,
      recurrencePattern: "none",
      parentTaskId: undefined,
    };
  }

  /**
   * Convert Task to Note
   */
  convertTaskToNote(task: Task): Note {
    return {
      id: uuidv4(),
      type: ItemType.NOTE,
      title: task.title,
      content: task.content,
      categoryId: task.categoryId,
      tags: task.tags || [],
      isFavorite: false,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Convert JournalEntry to Note
   */
  convertJournalToNote(entry: JournalEntry): Note {
    return {
      id: uuidv4(),
      type: ItemType.NOTE,
      title: `Journal Entry - ${new Date(entry.entryDate).toLocaleDateString()}`,
      content: entry.content,
      categoryId: entry.categoryId,
      tags: entry.tags || [],
      isFavorite: false,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Convert Item between sections
   * Returns the converted item or null if conversion is not possible
   */
  convertItem(
    item: Item,
    toType: "note" | "task" | "journal"
  ): Item | null {
    if (item.type === toType) {
      return item;
    }

    switch (toType) {
      case "note":
        if (item.type === "task") {
          return this.convertTaskToNote(item as Task);
        }
        if (item.type === "journal") {
          return this.convertJournalToNote(item as JournalEntry);
        }
        return this.convertToNote(item);

      case "task":
        return this.convertToTask(item);

      case "journal":
        // Converting to journal is not supported
        return null;

      default:
        return null;
    }
  }

  /**
   * Check if conversion is possible
   */
  canConvert(fromType: string, toType: string): boolean {
    if (fromType === toType) return true;

    const validConversions = [
      ["note", "task"],
      ["quote", "note"],
      ["quote", "task"],
      ["link", "note"],
      ["link", "task"],
      ["audio", "note"],
      ["audio", "task"],
      ["task", "note"],
      ["journal", "note"],
      ["journal", "task"],
    ];

    return validConversions.some(
      ([from, to]) => from === fromType && to === toType
    );
  }

  /**
   * Get conversion options for a given item type
   */
  getConversionOptions(
    fromType: string
  ): Array<{
    type: string;
    label: string;
    description: string;
  }> {
    const allTypes = [
      { type: "note", label: "Note", description: "Simple note" },
      { type: "quote", label: "Quote", description: "Quoted text" },
      { type: "link", label: "Link", description: "Web link" },
      { type: "audio", label: "Audio", description: "Audio recording" },
      { type: "task", label: "Task", description: "Action item" },
      { type: "journal", label: "Journal", description: "Daily entry" },
    ];

    return allTypes.filter((t) => this.canConvert(fromType, t.type));
  }

  /**
   * Duplicate an item (create a copy)
   */
  duplicateItem(item: Item): Item {
    const duplicated = { ...item };
    duplicated.id = uuidv4();
    duplicated.createdAt = new Date();
    duplicated.updatedAt = new Date();

    // Reset task-specific fields if it's a task
    if (duplicated.type === "task") {
      const task = duplicated as Task;
      task.isCompleted = false;
      task.completedAt = undefined;
    }

    return duplicated;
  }
}
