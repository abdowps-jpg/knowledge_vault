import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('./local.db');
export const db = drizzle(sqlite, { schema });

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
