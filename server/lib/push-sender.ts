import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { notificationPrefs } from '../schema/notification_prefs';
import { pushTokens } from '../schema/push_tokens';

type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
};

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function inQuietWindow(now: Date, start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  const m = minutesOfDay(now);
  if (start === end) return false;
  if (start < end) return m >= start && m < end;
  // wraps midnight
  return m >= start || m < end;
}

function kindFromPayload(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const t = (data as { type?: unknown }).type;
  return typeof t === 'string' ? t : null;
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, unknown> }
): Promise<void> {
  try {
    const prefsRows = await db
      .select()
      .from(notificationPrefs)
      .where(eq(notificationPrefs.userId, userId))
      .limit(1);
    const prefs = prefsRows[0];
    if (prefs) {
      const kind = kindFromPayload(payload.data);
      if (kind === 'mention' && prefs.mentionEnabled === false) return;
      if (kind === 'item_comment' && prefs.itemCommentEnabled === false) return;
      if (kind === 'item_shared' && prefs.itemSharedEnabled === false) return;
      if (kind === 'task-due' && prefs.taskDueEnabled === false) return;
      if (inQuietWindow(new Date(), prefs.quietStartMinutes ?? null, prefs.quietEndMinutes ?? null)) {
        return;
      }
      if (prefs.snoozeUntil && new Date(prefs.snoozeUntil).getTime() > Date.now()) {
        return;
      }
    }

    const tokens = await db
      .select()
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.isActive, true)));

    const validTokens = tokens.filter((t) => isExpoToken(t.token));
    if (validTokens.length === 0) return;

    const messages: PushMessage[] = validTokens.map((t) => ({
      to: t.token,
      title: payload.title.slice(0, 100),
      body: payload.body.slice(0, 300),
      data: payload.data,
      sound: 'default',
      priority: 'high',
    }));

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'accept-encoding': 'gzip, deflate',
        'content-type': 'application/json',
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error('[PushSender] Expo push failed:', response.status, await response.text().catch(() => ''));
      return;
    }

    const result = (await response.json().catch(() => null)) as {
      data?: { status: string; message?: string; details?: { error?: string } }[];
    } | null;

    if (result?.data) {
      const invalidTokenIds: string[] = [];
      result.data.forEach((entry, idx) => {
        if (entry.status === 'error' && entry.details?.error === 'DeviceNotRegistered') {
          invalidTokenIds.push(validTokens[idx].id);
        }
      });
      if (invalidTokenIds.length > 0) {
        await db
          .update(pushTokens)
          .set({ isActive: false })
          .where(inArray(pushTokens.id, invalidTokenIds));
      }
    }
  } catch (err) {
    console.error('[PushSender] delivery failed:', err);
  }
}
