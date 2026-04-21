import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
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

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, unknown> }
): Promise<void> {
  try {
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
