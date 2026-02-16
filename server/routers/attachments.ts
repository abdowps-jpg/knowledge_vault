import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { attachments } from '../schema/attachments';
import { publicProcedure, router } from '../trpc';

export const attachmentsRouter = router({
  // Save attachment metadata (MVP: base64 stored in fileUrl)
  create: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        fileUrl: z.string().min(1),
        filename: z.string().min(1),
        type: z.enum(['image', 'audio']).default('image'),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const newAttachment = {
          id: randomUUID(),
          itemId: input.itemId,
          journalId: null,
          fileUrl: input.fileUrl,
          filename: input.filename,
          type: input.type,
          fileSize: input.fileUrl.length,
          duration: null,
          transcription: null,
        };

        await db.insert(attachments).values(newAttachment);
        return newAttachment;
      } catch (error) {
        console.error('Error creating attachment:', error);
        return null;
      }
    }),

  // Get all attachments for item
  list: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        limit: z.number().min(1).max(100).default(30).optional(),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const cursor = input.cursor ?? 0;
        const limit = input.limit ?? 30;
        const result = await db
          .select()
          .from(attachments)
          .where(and(eq(attachments.itemId, input.itemId), eq(attachments.type, 'image')))
          .orderBy(desc(attachments.createdAt))
          .limit(limit)
          .offset(cursor);

        return result || [];
      } catch (error) {
        console.error('Error fetching attachments:', error);
        return [];
      }
    }),

  // Delete attachment
  delete: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await db.delete(attachments).where(eq(attachments.id, input.id));
        return { success: true };
      } catch (error) {
        console.error('Error deleting attachment:', error);
        return { success: false };
      }
    }),
});
