import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    deviceId: text("device_id").notNull(),
    deviceName: text("device_name").notNull(),
    platform: text("platform").notNull(),
    pushToken: text("push_token"),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    lastActiveAt: integer("last_active_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index("device_user_idx").on(table.userId),
    deviceIdx: index("device_device_id_idx").on(table.deviceId),
  })
);
