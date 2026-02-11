import { z } from "zod";

// ============================================================================
// Enums & Constants
// ============================================================================

export const ItemType = {
  NOTE: "note",
  QUOTE: "quote",
  LINK: "link",
  AUDIO: "audio",
  TASK: "task",
  JOURNAL: "journal",
} as const;

export type ItemTypeValue = typeof ItemType[keyof typeof ItemType];

export const TaskPriority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type TaskPriorityValue = typeof TaskPriority[keyof typeof TaskPriority];

export const RecurrencePattern = {
  NONE: "none",
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
} as const;

export type RecurrencePatternValue = typeof RecurrencePattern[keyof typeof RecurrencePattern];

export const MoodLevel = {
  TERRIBLE: 1,
  BAD: 2,
  NEUTRAL: 3,
  GOOD: 4,
  EXCELLENT: 5,
} as const;

export type MoodLevelValue = typeof MoodLevel[keyof typeof MoodLevel];

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  createdAt: z.date(),
});

export type Tag = z.infer<typeof TagSchema>;

export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  color: z.string().optional(),
  createdAt: z.date(),
});

export type Category = z.infer<typeof CategorySchema>;

export const AttachmentSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  fileType: z.enum(["image", "audio"]),
  filePath: z.string(),
  originalName: z.string(),
  createdAt: z.date(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

export const BaseItemSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([ItemType.NOTE, ItemType.QUOTE, ItemType.LINK, ItemType.AUDIO, ItemType.TASK, ItemType.JOURNAL]),
  title: z.string().min(1).max(500),
  content: z.string(),
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string().uuid()).default([]),
  isFavorite: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type BaseItem = z.infer<typeof BaseItemSchema>;

export const QuoteSchema = BaseItemSchema.extend({
  type: z.literal(ItemType.QUOTE),
  source: z.string().optional(),
  author: z.string().optional(),
});

export type Quote = z.infer<typeof QuoteSchema>;

export const NoteSchema = BaseItemSchema.extend({
  type: z.literal(ItemType.NOTE),
});

export type Note = z.infer<typeof NoteSchema>;

export const LinkSchema = BaseItemSchema.extend({
  type: z.literal(ItemType.LINK),
  url: z.string().url(),
});

export type Link = z.infer<typeof LinkSchema>;

export const AudioSchema = BaseItemSchema.extend({
  type: z.literal(ItemType.AUDIO),
  audioPath: z.string(),
  duration: z.number().optional(),
});

export type Audio = z.infer<typeof AudioSchema>;

export const TaskSchema = BaseItemSchema.extend({
  type: z.literal(ItemType.TASK),
  dueDate: z.date().optional(),
  priority: z.enum([TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH]).default(TaskPriority.MEDIUM),
  isCompleted: z.boolean().default(false),
  completedAt: z.date().optional(),
  recurrencePattern: z.enum([RecurrencePattern.NONE, RecurrencePattern.DAILY, RecurrencePattern.WEEKLY, RecurrencePattern.MONTHLY, RecurrencePattern.YEARLY]).default(RecurrencePattern.NONE),
  parentTaskId: z.string().uuid().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const JournalEntrySchema = BaseItemSchema.extend({
  type: z.literal(ItemType.JOURNAL),
  entryDate: z.date(),
  location: z.string().optional(),
  weather: z.string().optional(),
  mood: z.enum(["1", "2", "3", "4", "5"]).optional(),
  isLocked: z.boolean().default(false),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const ItemSchema = z.union([NoteSchema, QuoteSchema, LinkSchema, AudioSchema, TaskSchema, JournalEntrySchema]);

export type Item = Note | Quote | Link | Audio | Task | JournalEntry;

export const ReviewScheduleSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  lastReviewedAt: z.date().optional(),
  nextReviewAt: z.date(),
  reviewInterval: z.number().default(1), // in days
  reviewCount: z.number().default(0),
  easeFactor: z.number().default(2.5), // SM-2 algorithm
});

export type ReviewSchedule = z.infer<typeof ReviewScheduleSchema>;

// ============================================================================
// Database Query/Response Types
// ============================================================================

export type ItemWithRelations = Item & {
  category?: Category;
  attachments: Attachment[];
};

export type TaskWithSubtasks = Task & {
  subtasks: Task[];
};

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateItemRequest {
  type: ItemTypeValue;
  title: string;
  content: string;
  categoryId?: string;
  tags?: string[];
  source?: string; // for quotes
  author?: string; // for quotes
  url?: string; // for links
  audioPath?: string; // for audio
}

export interface UpdateItemRequest {
  title?: string;
  content?: string;
  categoryId?: string;
  tags?: string[];
  isFavorite?: boolean;
  isArchived?: boolean;
  source?: string;
  author?: string;
  url?: string;
}

export interface CreateTaskRequest {
  title: string;
  content?: string;
  dueDate?: Date;
  priority?: TaskPriorityValue;
  recurrencePattern?: RecurrencePatternValue;
  categoryId?: string;
  tags?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  content?: string;
  dueDate?: Date;
  priority?: TaskPriorityValue;
  isCompleted?: boolean;
  recurrencePattern?: RecurrencePatternValue;
  categoryId?: string;
  tags?: string[];
}

export interface CreateJournalEntryRequest {
  title: string;
  content: string;
  entryDate: Date;
  location?: string;
  weather?: string;
  mood?: MoodLevelValue;
  tags?: string[];
}

export interface UpdateJournalEntryRequest {
  title?: string;
  content?: string;
  location?: string;
  weather?: string;
  mood?: MoodLevelValue;
  isLocked?: boolean;
  tags?: string[];
}

export interface SearchFilters {
  query?: string;
  type?: ItemTypeValue[];
  categoryId?: string;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  isFavorite?: boolean;
  isArchived?: boolean;
  taskStatus?: "completed" | "pending"; // for tasks
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
