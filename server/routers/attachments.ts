import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { attachments } from '../schema/attachments';
import { items } from '../schema/items';
import { journal } from '../schema/journal';
import { protectedProcedure, router } from '../trpc';

export const attachmentsRouter = router({
  // Save attachment metadata (MVP: base64 stored in fileUrl)
  create: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        fileUrl: z.string().min(1),
        filename: z.string().min(1),
        type: z.enum(['image', 'audio']).default('image'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const ownerItem = await db
          .select()
          .from(items)
          .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
          .limit(1);
        if (ownerItem.length === 0) {
          return null;
        }

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
  list: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        limit: z.number().min(1).max(100).default(30).optional(),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const ownerItem = await db
          .select()
          .from(items)
          .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
          .limit(1);
        if (ownerItem.length === 0) {
          return [];
        }

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
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const rows = await db.select().from(attachments).where(eq(attachments.id, input.id)).limit(1);
        if (rows.length === 0) {
          return { success: false };
        }

        const target = rows[0];
        let authorized = false;

        if (target.itemId) {
          const ownerItem = await db
            .select()
            .from(items)
            .where(and(eq(items.id, target.itemId), eq(items.userId, ctx.user.id)))
            .limit(1);
          authorized = ownerItem.length > 0;
        } else if (target.journalId) {
          const ownerEntry = await db
            .select()
            .from(journal)
            .where(and(eq(journal.id, target.journalId), eq(journal.userId, ctx.user.id)))
            .limit(1);
          authorized = ownerEntry.length > 0;
        }

        if (!authorized) {
          return { success: false };
        }

        await db.delete(attachments).where(eq(attachments.id, input.id));
        return { success: true };
      } catch (error) {
        console.error('Error deleting attachment:', error);
        return { success: false };
      }
    }),

  uploadAudio: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        filename: z.string().min(1),
        audioBase64: z.string().min(1),
        duration: z.number().max(300).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const ownerItem = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
        .limit(1);
      if (ownerItem.length === 0) {
        return { success: false, reason: "item_not_found" as const };
      }

      const bytes = Math.ceil((input.audioBase64.length * 3) / 4);
      if (bytes > 5 * 1024 * 1024) {
        return { success: false, reason: "file_too_large" as const };
      }

      const record = {
        id: randomUUID(),
        itemId: input.itemId,
        journalId: null,
        type: "audio" as const,
        filename: input.filename,
        fileUrl: input.audioBase64,
        fileSize: bytes,
        duration: input.duration ?? null,
        transcription: null,
      };
      await db.insert(attachments).values(record);
      return {
        success: true,
        attachment: record,
      };
    }),

  extractText: protectedProcedure
    .input(
      z.object({
        attachmentId: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const rows = await db.select().from(attachments).where(eq(attachments.id, input.attachmentId)).limit(1);
        if (rows.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Attachment not found' });
        }

        const target = rows[0];
        if (target.type !== 'image' || !target.itemId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'OCR is supported only for item images' });
        }

        const ownerItem = await db
          .select()
          .from(items)
          .where(and(eq(items.id, target.itemId), eq(items.userId, ctx.user.id)))
          .limit(1);
        if (ownerItem.length === 0) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized to read this attachment' });
        }

        const imageSource = target.fileUrl;
        if (!imageSource || imageSource.trim().length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Attachment image is empty' });
        }

        const { recognize } = await import('tesseract.js');
        const result = await recognize(imageSource, 'eng');
        const text = (result?.data?.text ?? '').trim();
        const confidence = Number(result?.data?.confidence ?? 0);

        return {
          success: true,
          text,
          confidence,
          attachmentId: target.id,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[attachments.extractText] OCR failed:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to extract text from image' });
      }
    }),
});
