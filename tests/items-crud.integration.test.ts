import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { items } from "../server/schema";
import { createTestDb } from "./helpers/in-memory-db";

describe("items CRUD (in-memory DB)", () => {
  it("inserts and reads back an item", () => {
    const db = createTestDb();
    const id = randomUUID();
    const now = new Date();
    db.insert(items)
      .values({
        id,
        userId: "user-1",
        type: "note",
        title: "Hello",
        content: "World",
        url: null,
        location: "inbox",
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const rows = db.select().from(items).where(eq(items.id, id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Hello");
    expect(rows[0].content).toBe("World");
  });

  it("list query excludes soft-deleted items", () => {
    const db = createTestDb();
    const now = new Date();
    db.insert(items)
      .values([
        {
          id: "a",
          userId: "u1",
          type: "note",
          title: "Live",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "b",
          userId: "u1",
          type: "note",
          title: "Trashed",
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
        },
      ])
      .run();
    const visible = db
      .select()
      .from(items)
      .where(and(eq(items.userId, "u1"), isNull(items.deletedAt)))
      .all();
    expect(visible.map((r) => r.title)).toEqual(["Live"]);
  });

  it("scoping by userId keeps data private", () => {
    const db = createTestDb();
    const now = new Date();
    db.insert(items)
      .values([
        { id: "1", userId: "alice", type: "note", title: "alice-item", createdAt: now, updatedAt: now },
        { id: "2", userId: "bob", type: "note", title: "bob-item", createdAt: now, updatedAt: now },
      ])
      .run();
    const alice = db.select().from(items).where(eq(items.userId, "alice")).all();
    const bob = db.select().from(items).where(eq(items.userId, "bob")).all();
    expect(alice.map((r) => r.title)).toEqual(["alice-item"]);
    expect(bob.map((r) => r.title)).toEqual(["bob-item"]);
  });

  it("update bumps updatedAt", async () => {
    const db = createTestDb();
    const earlier = new Date(Date.now() - 5_000);
    db.insert(items)
      .values({
        id: "x",
        userId: "u",
        type: "note",
        title: "before",
        createdAt: earlier,
        updatedAt: earlier,
      })
      .run();
    const now = new Date();
    db.update(items).set({ title: "after", updatedAt: now }).where(eq(items.id, "x")).run();
    const row = db.select().from(items).where(eq(items.id, "x")).all()[0];
    expect(row.title).toBe("after");
    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt.getTime() : 0;
    expect(updatedAt).toBeGreaterThanOrEqual(earlier.getTime());
  });
});
