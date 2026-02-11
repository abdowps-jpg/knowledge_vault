import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as storage from "./storage";
import { ItemType, TaskPriority } from "./schema";

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    multiRemove: vi.fn(),
  },
}));

describe("Storage - Items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create an item with generated id and timestamps", async () => {
    const mockSetItem = vi.spyOn(AsyncStorage, "setItem").mockResolvedValue(undefined);
    const mockGetItem = vi.spyOn(AsyncStorage, "getItem").mockResolvedValue("[]");

    const newItem = await storage.createItem({
      type: ItemType.NOTE,
      title: "Test Note",
      content: "This is a test note",
      tags: [],
      isFavorite: false,
      isArchived: false,
    });

    expect(newItem.id).toBeDefined();
    expect(newItem.title).toBe("Test Note");
    expect(newItem.content).toBe("This is a test note");
    expect(newItem.type).toBe(ItemType.NOTE);
    expect(newItem.createdAt).toBeInstanceOf(Date);
    expect(newItem.updatedAt).toBeInstanceOf(Date);
    expect(mockSetItem).toHaveBeenCalled();
  });

  it("should retrieve an item by id", async () => {
    const mockItem = {
      id: "test-id",
      type: ItemType.NOTE,
      title: "Test Note",
      content: "Content",
      tags: [],
      isFavorite: false,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(AsyncStorage, "getItem").mockResolvedValue(JSON.stringify([mockItem]));

    const item = await storage.getItemById("test-id");

    expect(item).toBeDefined();
    expect(item?.id).toBe("test-id");
    expect(item?.title).toBe("Test Note");
  });

  it("should delete an item", async () => {
    const mockItem = {
      id: "test-id",
      type: ItemType.NOTE,
      title: "Test Note",
      content: "Content",
      tags: [],
      isFavorite: false,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(AsyncStorage, "getItem")
      .mockResolvedValueOnce(JSON.stringify([mockItem]))
      .mockResolvedValueOnce("[]");

    const mockSetItem = vi.spyOn(AsyncStorage, "setItem").mockResolvedValue(undefined);

    const deleted = await storage.deleteItem("test-id");

    expect(deleted).toBe(true);
    expect(mockSetItem).toHaveBeenCalled();
  });

  it("should search items by title and content", async () => {
    const mockItems = [
      {
        id: "1",
        type: ItemType.NOTE,
        title: "JavaScript Tips",
        content: "Learn JavaScript",
        tags: [],
        isFavorite: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "2",
        type: ItemType.NOTE,
        title: "Python Basics",
        content: "Learn Python",
        tags: [],
        isFavorite: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.spyOn(AsyncStorage, "getItem").mockResolvedValue(JSON.stringify(mockItems));

    const results = await storage.searchItems("JavaScript");

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("JavaScript Tips");
  });
});

describe("Storage - Tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a tag", async () => {
    const mockSetItem = vi.spyOn(AsyncStorage, "setItem").mockResolvedValue(undefined);
    const mockGetItem = vi.spyOn(AsyncStorage, "getItem").mockResolvedValue("[]");

    const tag = await storage.createTag("Important");

    expect(tag.id).toBeDefined();
    expect(tag.name).toBe("Important");
    expect(tag.createdAt).toBeInstanceOf(Date);
  });

  it("should delete a tag", async () => {
    const mockTag = {
      id: "tag-1",
      name: "Important",
      createdAt: new Date(),
    };

    vi.spyOn(AsyncStorage, "getItem")
      .mockResolvedValueOnce(JSON.stringify([mockTag]))
      .mockResolvedValueOnce("[]");

    const mockSetItem = vi.spyOn(AsyncStorage, "setItem").mockResolvedValue(undefined);

    const deleted = await storage.deleteTag("tag-1");

    expect(deleted).toBe(true);
  });
});

describe("Storage - Categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a category", async () => {
    const mockSetItem = vi.spyOn(AsyncStorage, "setItem").mockResolvedValue(undefined);
    const mockGetItem = vi.spyOn(AsyncStorage, "getItem").mockResolvedValue("[]");

    const category = await storage.createCategory("Work", "#0a7ea4");

    expect(category.id).toBeDefined();
    expect(category.name).toBe("Work");
    expect(category.color).toBe("#0a7ea4");
  });
});

describe("Storage - Review Schedule (Spaced Repetition)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a review schedule", async () => {
    const mockSetItem = vi.spyOn(AsyncStorage, "setItem").mockResolvedValue(undefined);
    const mockGetItem = vi.spyOn(AsyncStorage, "getItem").mockResolvedValue("[]");

    const schedule = await storage.createReviewSchedule("item-1");

    expect(schedule.id).toBeDefined();
    expect(schedule.itemId).toBe("item-1");
    expect(schedule.reviewCount).toBe(0);
    expect(schedule.easeFactor).toBe(2.5);
    expect(schedule.nextReviewAt).toBeInstanceOf(Date);
  });

  it("should mark item as reviewed and update schedule using SM-2", async () => {
    const mockSchedule = {
      id: "schedule-1",
      itemId: "item-1",
      lastReviewedAt: undefined,
      nextReviewAt: new Date(),
      reviewInterval: 1,
      reviewCount: 0,
      easeFactor: 2.5,
    };

    vi.spyOn(AsyncStorage, "getItem")
      .mockResolvedValueOnce(JSON.stringify([mockSchedule]))
      .mockResolvedValueOnce(JSON.stringify([mockSchedule]));

    const mockSetItem = vi.spyOn(AsyncStorage, "setItem").mockResolvedValue(undefined);

    // Quality score: 4 (good)
    const updated = await storage.markItemAsReviewed("item-1", 4);

    expect(updated).toBeDefined();
    expect(updated?.reviewCount).toBe(1);
    expect(updated?.lastReviewedAt).toBeInstanceOf(Date);
    // Ease factor should be updated (SM-2 algorithm)
    expect(updated?.easeFactor).toBeGreaterThanOrEqual(2.5);
  });

  it("should get items due for review", async () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
    pastDate.setHours(0, 0, 0, 0); // Normalize time for consistent comparison

    const mockSchedules = [
      {
        id: "schedule-1",
        itemId: "item-1",
        lastReviewedAt: pastDate,
        nextReviewAt: pastDate,
        reviewInterval: 1,
        reviewCount: 1,
        easeFactor: 2.5,
      },
      {
        id: "schedule-2",
        itemId: "item-2",
        lastReviewedAt: now,
        nextReviewAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        reviewInterval: 7,
        reviewCount: 1,
        easeFactor: 2.5,
      },
    ];

    vi.spyOn(AsyncStorage, "getItem").mockResolvedValue(JSON.stringify(mockSchedules));

    const dueItems = await storage.getItemsDueForReview();

    expect(dueItems).toHaveLength(1);
    expect(dueItems[0].itemId).toBe("item-1");
  });
});

describe("Storage - Bulk Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export all data", async () => {
    const mockItems = [
      {
        id: "1",
        type: ItemType.NOTE,
        title: "Note",
        content: "Content",
        tags: [],
        isFavorite: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const mockTags = [
      {
        id: "tag-1",
        name: "Important",
        createdAt: new Date(),
      },
    ];

    vi.spyOn(AsyncStorage, "getItem")
      .mockResolvedValueOnce(JSON.stringify(mockItems))
      .mockResolvedValueOnce(JSON.stringify(mockTags))
      .mockResolvedValueOnce("[]")
      .mockResolvedValueOnce("[]")
      .mockResolvedValueOnce("[]");

    const exported = await storage.exportAllData();

    expect(exported).toHaveProperty("version");
    expect(exported).toHaveProperty("exportedAt");
    expect(exported).toHaveProperty("data");
    expect((exported as any).data.items).toHaveLength(1);
    expect((exported as any).data.tags).toHaveLength(1);
  });
});
