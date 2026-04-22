import { randomUUID } from 'crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { transcribeAudio } from '../_core/voiceTranscription';
import { attachments } from '../schema/attachments';
import { items } from '../schema/items';
import { journal } from '../schema/journal';
import { protectedProcedure, router } from '../trpc';

const MAX_ATTACHMENTS_PER_ITEM = 50;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_REMOTE_URL_LENGTH = 2048;

const IMAGE_DATA_URL_PREFIXES = ['data:image/png', 'data:image/jpeg', 'data:image/jpg', 'data:image/webp', 'data:image/gif', 'data:image/heic', 'data:image/heif'];
const AUDIO_DATA_URL_PREFIXES = ['data:audio/mpeg', 'data:audio/mp3', 'data:audio/wav', 'data:audio/wave', 'data:audio/webm', 'data:audio/ogg', 'data:audio/mp4', 'data:audio/m4a'];

function validateAttachmentPayload(fileUrl: string, declaredType: 'image' | 'audio'): { estimatedBytes: number } {
  const isDataUrl = fileUrl.startsWith('data:');
  const isHttp = /^https?:\/\//i.test(fileUrl);

  if (!isDataUrl && !isHttp) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'fileUrl must be a data: or https? URL' });
  }

  if (isHttp) {
    if (fileUrl.length > MAX_REMOTE_URL_LENGTH) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Remote URL too long' });
    }
    return { estimatedBytes: 0 };
  }

  const allowedPrefixes = declaredType === 'image' ? IMAGE_DATA_URL_PREFIXES : AUDIO_DATA_URL_PREFIXES;
  const matchesType = allowedPrefixes.some((p) => fileUrl.toLowerCase().startsWith(p));
  if (!matchesType) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Attachment MIME does not match declared type '${declaredType}'`,
    });
  }

  const commaIdx = fileUrl.indexOf(',');
  const base64Length = commaIdx >= 0 ? fileUrl.length - commaIdx - 1 : fileUrl.length;
  const estimatedBytes = Math.floor((base64Length * 3) / 4);

  const limit = declaredType === 'image' ? MAX_IMAGE_SIZE_BYTES : MAX_AUDIO_SIZE_BYTES;
  if (estimatedBytes > limit) {
    throw new TRPCError({
      code: 'PAYLOAD_TOO_LARGE',
      message: `${declaredType} exceeds max size (${Math.floor(limit / (1024 * 1024))}MB)`,
    });
  }
  return { estimatedBytes };
}

const TRANSCRIBE_WINDOW_MS = 60 * 60_000;
const TRANSCRIBE_MAX_PER_WINDOW = 30;
const transcribeUsage = new Map<string, { count: number; resetAt: number }>();

function enforceTranscribeQuota(userId: string) {
  const now = Date.now();
  const entry = transcribeUsage.get(userId);
  if (!entry || now > entry.resetAt) {
    transcribeUsage.set(userId, { count: 1, resetAt: now + TRANSCRIBE_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= TRANSCRIBE_MAX_PER_WINDOW;
}

export const attachmentsRouter = router({
  // Save attachment metadata (MVP: base64 stored in fileUrl)
  create: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        fileUrl: z.string().min(1).max(15 * 1024 * 1024),
        filename: z.string().min(1).max(255),
        type: z.enum(['image', 'audio']).default('image'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const ownerItem = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
        .limit(1);
      if (ownerItem.length === 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not the owner of this item' });
      }

      const { estimatedBytes } = validateAttachmentPayload(input.fileUrl, input.type);

      const [countRow] = await db
        .select({ total: count() })
        .from(attachments)
        .where(eq(attachments.itemId, input.itemId));
      if ((countRow?.total ?? 0) >= MAX_ATTACHMENTS_PER_ITEM) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Maximum of ${MAX_ATTACHMENTS_PER_ITEM} attachments per item allowed.`,
        });
      }

      const newAttachment = {
        id: randomUUID(),
        itemId: input.itemId,
        journalId: null,
        fileUrl: input.fileUrl,
        filename: input.filename.trim().slice(0, 255),
        type: input.type,
        fileSize: estimatedBytes > 0 ? estimatedBytes : input.fileUrl.length,
        duration: null,
        transcription: null,
      };

      await db.insert(attachments).values(newAttachment);
      return newAttachment;
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
          .where(eq(attachments.itemId, input.itemId))
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

  listForUser: protectedProcedure
    .input(
      z
        .object({
          type: z.enum(['image', 'audio']).optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const limit = input?.limit ?? 50;
      const rows = await db
        .select({
          id: attachments.id,
          itemId: attachments.itemId,
          type: attachments.type,
          filename: attachments.filename,
          fileUrl: attachments.fileUrl,
          fileSize: attachments.fileSize,
          duration: attachments.duration,
          transcription: attachments.transcription,
          createdAt: attachments.createdAt,
        })
        .from(attachments)
        .innerJoin(items, eq(items.id, attachments.itemId))
        .where(
          input?.type
            ? and(eq(items.userId, ctx.user.id), eq(attachments.type, input.type))
            : eq(items.userId, ctx.user.id)
        )
        .orderBy(desc(attachments.createdAt))
        .limit(limit);
      return rows;
    }),

  storageUsage: protectedProcedure.query(async ({ ctx }) => {
    // Join attachments to items to scope by user
    const rows = await db
      .select({
        id: attachments.id,
        type: attachments.type,
        fileSize: attachments.fileSize,
        itemUserId: items.userId,
      })
      .from(attachments)
      .leftJoin(items, eq(items.id, attachments.itemId))
      .where(eq(items.userId, ctx.user.id));

    let totalBytes = 0;
    let imageCount = 0;
    let audioCount = 0;
    let imageBytes = 0;
    let audioBytes = 0;
    for (const r of rows) {
      const size = typeof r.fileSize === 'number' ? r.fileSize : 0;
      totalBytes += size;
      if (r.type === 'image') {
        imageCount += 1;
        imageBytes += size;
      } else if (r.type === 'audio') {
        audioCount += 1;
        audioBytes += size;
      }
    }
    return {
      count: rows.length,
      totalBytes,
      images: { count: imageCount, bytes: imageBytes },
      audio: { count: audioCount, bytes: audioBytes },
    };
  }),

  transcribe: protectedProcedure
    .input(
      z.object({
        attachmentId: z.string().min(1),
        language: z.string().min(2).max(5).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!enforceTranscribeQuota(ctx.user.id)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Transcription quota exceeded. Try again later.',
        });
      }

      const rows = await db.select().from(attachments).where(eq(attachments.id, input.attachmentId)).limit(1);
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Attachment not found' });
      }
      const target = rows[0];
      if (target.type !== 'audio') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Transcription only works on audio attachments' });
      }
      if (!target.itemId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Orphaned attachment' });
      }

      const ownerItem = await db
        .select()
        .from(items)
        .where(and(eq(items.id, target.itemId), eq(items.userId, ctx.user.id)))
        .limit(1);
      if (ownerItem.length === 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized to transcribe this attachment' });
      }

      if (target.transcription && target.transcription.trim().length > 0) {
        return {
          success: true,
          text: target.transcription,
          attachmentId: target.id,
          cached: true as const,
        };
      }

      if (!target.fileUrl || !/^https?:\/\//i.test(target.fileUrl)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Audio must be accessible via a remote URL for transcription.',
        });
      }

      const result = await transcribeAudio({ audioUrl: target.fileUrl, language: input.language });
      if ('error' in result) {
        console.error('[attachments.transcribe] failed:', result);
        throw new TRPCError({
          code: result.code === 'FILE_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_SERVER_ERROR',
          message: result.error,
        });
      }

      const text = (result.text ?? '').trim().slice(0, 20000);
      await db.update(attachments).set({ transcription: text }).where(eq(attachments.id, target.id));

      return {
        success: true,
        text,
        attachmentId: target.id,
        cached: false as const,
        language: result.language,
      };
    }),
});
