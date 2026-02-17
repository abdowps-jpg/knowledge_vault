import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { devices } from "../schema/devices";
import { protectedProcedure, router } from "../trpc";

export const devicesRouter = router({
  register: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1),
        deviceName: z.string().min(1),
        platform: z.string().min(1),
        pushToken: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db
        .select()
        .from(devices)
        .where(and(eq(devices.userId, ctx.user.id), eq(devices.deviceId, input.deviceId)))
        .limit(1);

      if (existing[0]) {
        await db
          .update(devices)
          .set({
            deviceName: input.deviceName,
            platform: input.platform,
            pushToken: input.pushToken ?? null,
            isActive: true,
            lastActiveAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(devices.id, existing[0].id));
        return { success: true, device: existing[0] };
      }

      const newDevice = {
        id: randomUUID(),
        userId: ctx.user.id,
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        platform: input.platform,
        pushToken: input.pushToken ?? null,
        isActive: true,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(devices).values(newDevice);
      return { success: true, device: newDevice };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(devices)
      .where(eq(devices.userId, ctx.user.id))
      .orderBy(desc(devices.lastActiveAt));
    return rows ?? [];
  }),

  signOutDevice: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(devices)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(devices.id, input.id), eq(devices.userId, ctx.user.id)));
      return { success: true };
    }),

  signOutAllDevices: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(devices)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(devices.userId, ctx.user.id));
    return { success: true };
  }),
});
