import AsyncStorage from "@react-native-async-storage/async-storage";
import { Item, Task, JournalEntry, Tag, Category, Attachment, ReviewSchedule, ItemWithRelations } from "./schema";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEYS = {
  ITEMS: "kv_items",
  TAGS: "kv_tags",
  CATEGORIES: "kv_categories",
  ATTACHMENTS: "kv_attachments",
  REVIEW_SCHEDULES: "kv_review_schedules",
  LAST_SYNC: "kv_last_sync",
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

async function getStoredData<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (error) {
    console.error(`Error reading from storage (${key}):`, error);
    return defaultValue;
  }
}

async function setStoredData<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error writing to storage (${key}):`, error);
    throw error;
  }
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function hydrateItemDates(item: Item): Item {
  const hydrated = {
    ...item,
    createdAt: asDate(item.createdAt),
    updatedAt: asDate(item.updatedAt),
  } as Item;

  if ("dueDate" in hydrated && hydrated.dueDate) {
    (hydrated as Task).dueDate = asDate((hydrated as Task).dueDate);
  }
  if ("completedAt" in hydrated && hydrated.completedAt) {
    (hydrated as Task).completedAt = asDate((hydrated as Task).completedAt);
  }
  if ("entryDate" in hydrated && hydrated.entryDate) {
    (hydrated as JournalEntry).entryDate = asDate((hydrated as JournalEntry).entryDate);
  }

  return hydrated;
}

function hydrateTagDates(tag: Tag): Tag {
  return { ...tag, createdAt: asDate(tag.createdAt) };
}

function hydrateCategoryDates(category: Category): Category {
  return { ...category, createdAt: asDate(category.createdAt) };
}

function hydrateAttachmentDates(attachment: Attachment): Attachment {
  return { ...attachment, createdAt: asDate(attachment.createdAt) };
}

function hydrateReviewScheduleDates(schedule: ReviewSchedule): ReviewSchedule {
  return {
    ...schedule,
    nextReviewAt: asDate(schedule.nextReviewAt),
    lastReviewedAt: schedule.lastReviewedAt ? asDate(schedule.lastReviewedAt) : undefined,
  };
}

// ============================================================================
// Item Storage
// ============================================================================

export async function getAllItems(): Promise<Item[]> {
  const storedItems = await getStoredData<Item[]>(STORAGE_KEYS.ITEMS, []);
  return storedItems.map(hydrateItemDates);
}

export async function getItemById(id: string): Promise<Item | null> {
  const items = await getAllItems();
  return items.find((item) => item.id === id) || null;
}

export async function createItem(item: Omit<Item, "id" | "createdAt" | "updatedAt">): Promise<Item> {
  const items = await getAllItems();
  const newItem: Item = {
    ...item,
    id: uuidv4(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Item;
  items.push(newItem);
  await setStoredData(STORAGE_KEYS.ITEMS, items);
  return newItem;
}

export async function updateItem(id: string, updates: Partial<Omit<Item, "id" | "createdAt">>): Promise<Item | null> {
  const items = await getAllItems();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const updatedItem: Item = {
    ...items[index],
    ...updates,
    updatedAt: new Date(),
  } as Item;
  items[index] = updatedItem;
  await setStoredData(STORAGE_KEYS.ITEMS, items);
  return updatedItem;
}

export async function deleteItem(id: string): Promise<boolean> {
  const items = await getAllItems();
  const filtered = items.filter((item) => item.id !== id);
  if (filtered.length === items.length) return false;
  await setStoredData(STORAGE_KEYS.ITEMS, filtered);
  return true;
}

export async function getItemsByType(type: string): Promise<Item[]> {
  const items = await getAllItems();
  return items.filter((item) => item.type === type);
}

export async function getInboxItems(): Promise<Item[]> {
  const items = await getAllItems();
  return items
    .filter((item) => !item.isArchived && item.type !== "journal")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function searchItems(query: string): Promise<Item[]> {
  const items = await getAllItems();
  const lowerQuery = query.toLowerCase();
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(lowerQuery) ||
      item.content.toLowerCase().includes(lowerQuery) ||
      (item.tags && item.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)))
  );
}

// ============================================================================
// Tag Storage
// ============================================================================

export async function getAllTags(): Promise<Tag[]> {
  const storedTags = await getStoredData<Tag[]>(STORAGE_KEYS.TAGS, []);
  return storedTags.map(hydrateTagDates);
}

export async function createTag(name: string): Promise<Tag> {
  const tags = await getAllTags();
  const newTag: Tag = {
    id: uuidv4(),
    name,
    createdAt: new Date(),
  };
  tags.push(newTag);
  await setStoredData(STORAGE_KEYS.TAGS, tags);
  return newTag;
}

export async function deleteTag(id: string): Promise<boolean> {
  const tags = await getAllTags();
  const filtered = tags.filter((tag) => tag.id !== id);
  if (filtered.length === tags.length) return false;
  await setStoredData(STORAGE_KEYS.TAGS, filtered);
  return true;
}

// ============================================================================
// Category Storage
// ============================================================================

export async function getAllCategories(): Promise<Category[]> {
  const storedCategories = await getStoredData<Category[]>(STORAGE_KEYS.CATEGORIES, []);
  return storedCategories.map(hydrateCategoryDates);
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const categories = await getAllCategories();
  return categories.find((cat) => cat.id === id) || null;
}

export async function createCategory(name: string, color?: string): Promise<Category> {
  const categories = await getAllCategories();
  const newCategory: Category = {
    id: uuidv4(),
    name,
    color,
    createdAt: new Date(),
  };
  categories.push(newCategory);
  await setStoredData(STORAGE_KEYS.CATEGORIES, categories);
  return newCategory;
}

export async function updateCategory(id: string, updates: Partial<Omit<Category, "id" | "createdAt">>): Promise<Category | null> {
  const categories = await getAllCategories();
  const index = categories.findIndex((cat) => cat.id === id);
  if (index === -1) return null;

  const updatedCategory: Category = {
    ...categories[index],
    ...updates,
  };
  categories[index] = updatedCategory;
  await setStoredData(STORAGE_KEYS.CATEGORIES, categories);
  return updatedCategory;
}

export async function deleteCategory(id: string): Promise<boolean> {
  const categories = await getAllCategories();
  const filtered = categories.filter((cat) => cat.id !== id);
  if (filtered.length === categories.length) return false;
  await setStoredData(STORAGE_KEYS.CATEGORIES, filtered);
  return true;
}

// ============================================================================
// Attachment Storage
// ============================================================================

export async function getAllAttachments(): Promise<Attachment[]> {
  const storedAttachments = await getStoredData<Attachment[]>(STORAGE_KEYS.ATTACHMENTS, []);
  return storedAttachments.map(hydrateAttachmentDates);
}

export async function getAttachmentsByItemId(itemId: string): Promise<Attachment[]> {
  const attachments = await getAllAttachments();
  return attachments.filter((att) => att.itemId === itemId);
}

export async function createAttachment(itemId: string, fileType: "image" | "audio", filePath: string, originalName: string): Promise<Attachment> {
  const attachments = await getAllAttachments();
  const newAttachment: Attachment = {
    id: uuidv4(),
    itemId,
    fileType,
    filePath,
    originalName,
    createdAt: new Date(),
  };
  attachments.push(newAttachment);
  await setStoredData(STORAGE_KEYS.ATTACHMENTS, attachments);
  return newAttachment;
}

export async function deleteAttachment(id: string): Promise<boolean> {
  const attachments = await getAllAttachments();
  const filtered = attachments.filter((att) => att.id !== id);
  if (filtered.length === attachments.length) return false;
  await setStoredData(STORAGE_KEYS.ATTACHMENTS, filtered);
  return true;
}

// ============================================================================
// Review Schedule Storage
// ============================================================================

export async function getAllReviewSchedules(): Promise<ReviewSchedule[]> {
  const storedSchedules = await getStoredData<ReviewSchedule[]>(STORAGE_KEYS.REVIEW_SCHEDULES, []);
  return storedSchedules.map(hydrateReviewScheduleDates);
}

export async function getReviewScheduleByItemId(itemId: string): Promise<ReviewSchedule | null> {
  const schedules = await getAllReviewSchedules();
  return schedules.find((schedule) => schedule.itemId === itemId) || null;
}

export async function createReviewSchedule(itemId: string): Promise<ReviewSchedule> {
  const schedules = await getAllReviewSchedules();
  const newSchedule: ReviewSchedule = {
    id: uuidv4(),
    itemId,
    nextReviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
    reviewInterval: 1,
    reviewCount: 0,
    easeFactor: 2.5,
  };
  schedules.push(newSchedule);
  await setStoredData(STORAGE_KEYS.REVIEW_SCHEDULES, schedules);
  return newSchedule;
}

export async function updateReviewSchedule(itemId: string, updates: Partial<Omit<ReviewSchedule, "id" | "itemId">>): Promise<ReviewSchedule | null> {
  const schedules = await getAllReviewSchedules();
  const index = schedules.findIndex((schedule) => schedule.itemId === itemId);
  if (index === -1) return null;

  const updatedSchedule: ReviewSchedule = {
    ...schedules[index],
    ...updates,
  };
  schedules[index] = updatedSchedule;
  await setStoredData(STORAGE_KEYS.REVIEW_SCHEDULES, schedules);
  return updatedSchedule;
}

export async function getItemsDueForReview(): Promise<ReviewSchedule[]> {
  const schedules = await getAllReviewSchedules();
  const now = new Date();
  return schedules.filter((schedule) => new Date(schedule.nextReviewAt) <= now);
}

// ============================================================================
// Spaced Repetition Algorithm (SM-2)
// ============================================================================

export async function markItemAsReviewed(itemId: string, quality: number): Promise<ReviewSchedule | null> {
  const schedule = await getReviewScheduleByItemId(itemId);
  if (!schedule) return null;

  // SM-2 Algorithm
  let newEaseFactor = schedule.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  if (newEaseFactor < 1.3) newEaseFactor = 1.3;

  let newInterval: number;
  if (quality < 3) {
    newInterval = 1;
  } else if (schedule.reviewCount === 0) {
    newInterval = 1;
  } else if (schedule.reviewCount === 1) {
    newInterval = 3;
  } else {
    newInterval = Math.round(schedule.reviewInterval * newEaseFactor);
  }

  const nextReviewAt = new Date(Date.now() + newInterval * 24 * 60 * 60 * 1000);

  return updateReviewSchedule(itemId, {
    lastReviewedAt: new Date(),
    nextReviewAt,
    reviewInterval: newInterval,
    reviewCount: schedule.reviewCount + 1,
    easeFactor: newEaseFactor,
  });
}

// ============================================================================
// Bulk Operations
// ============================================================================

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  } catch (error) {
    console.error("Error clearing all data:", error);
    throw error;
  }
}

export async function exportAllData(): Promise<object> {
  const items = await getAllItems();
  const tags = await getAllTags();
  const categories = await getAllCategories();
  const attachments = await getAllAttachments();
  const reviewSchedules = await getAllReviewSchedules();

  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    data: {
      items,
      tags,
      categories,
      attachments,
      reviewSchedules,
    },
  };
}

export async function importData(data: any): Promise<void> {
  try {
    if (data.data) {
      if (data.data.items) await setStoredData(STORAGE_KEYS.ITEMS, data.data.items);
      if (data.data.tags) await setStoredData(STORAGE_KEYS.TAGS, data.data.tags);
      if (data.data.categories) await setStoredData(STORAGE_KEYS.CATEGORIES, data.data.categories);
      if (data.data.attachments) await setStoredData(STORAGE_KEYS.ATTACHMENTS, data.data.attachments);
      if (data.data.reviewSchedules) await setStoredData(STORAGE_KEYS.REVIEW_SCHEDULES, data.data.reviewSchedules);
    }
  } catch (error) {
    console.error("Error importing data:", error);
    throw error;
  }
}
