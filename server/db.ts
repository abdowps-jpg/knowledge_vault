import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { ENV } from './_core/env';

const client = createClient({
  url: ENV.tursoUrl,
  authToken: ENV.tursoToken,
});

export const db = drizzle(client, { schema });

type OAuthUserRecord = {
  id?: string;
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  lastSignedIn?: Date | null;
};

const oauthUserCache = new Map<string, OAuthUserRecord>();

export async function getUserByOpenId(openId: string): Promise<OAuthUserRecord | null> {
  return oauthUserCache.get(openId) ?? null;
}

export async function upsertUser(user: OAuthUserRecord): Promise<void> {
  const current = oauthUserCache.get(user.openId) ?? { openId: user.openId };
  oauthUserCache.set(user.openId, { ...current, ...user });
}
