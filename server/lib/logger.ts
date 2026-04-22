/**
 * Tiny structured logger. Zero dependencies. Emits one JSON line per event
 * in production (so log aggregators like Loki, Datadog, CloudWatch can
 * parse it) and falls back to a human-friendly single line in development.
 *
 * Usage:
 *   import { logger } from './logger';
 *   logger.info('user.login', { userId: 'u1', ip: '1.2.3.4' });
 *   logger.warn('webhook.retry', { hookId, attempt });
 *   logger.error('db.query.failed', { table: 'items' }, err);
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? '').toLowerCase() as Level;
  if (configured in LEVEL_ORDER) return LEVEL_ORDER[configured];
  return process.env.NODE_ENV === 'production' ? LEVEL_ORDER.info : LEVEL_ORDER.debug;
}

function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    // Obvious token-shaped substrings: JWT, bearer, api keys
    return value
      .replace(/eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}/g, 'jwt:REDACTED')
      .replace(/kv_[a-zA-Z0-9]{20,}/g, 'kv_REDACTED')
      .replace(/Bearer [a-zA-Z0-9._\-]{10,}/g, 'Bearer REDACTED');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !/password|secret|token|apiKey/i.test(k))
      .map(([k, v]) => [k, redact(v)]);
    return Object.fromEntries(entries);
  }
  return value;
}

function emit(level: Level, event: string, fields?: Record<string, unknown>, err?: unknown): void {
  if (LEVEL_ORDER[level] < minLevel()) return;
  const isProd = process.env.NODE_ENV === 'production';
  const payload = {
    t: new Date().toISOString(),
    level,
    event,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
    ...(err instanceof Error
      ? { err: { name: err.name, message: err.message, stack: isProd ? undefined : err.stack } }
      : err != null
      ? { err: String(err) }
      : {}),
  };

  const line = isProd ? JSON.stringify(payload) : prettyLine(payload);
  const sink = level === 'error' || level === 'warn' ? console.error : console.log;
  sink(line);
}

function prettyLine(payload: Record<string, unknown>): string {
  const { t, level, event, err, ...rest } = payload;
  const levelPad = String(level).toUpperCase().padEnd(5);
  const restStr = Object.keys(rest).length > 0 ? ' ' + JSON.stringify(rest) : '';
  const errStr = err ? ` err=${JSON.stringify(err)}` : '';
  return `[${t}] ${levelPad} ${event}${restStr}${errStr}`;
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => emit('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>, err?: unknown) => emit('warn', event, fields, err),
  error: (event: string, fields?: Record<string, unknown>, err?: unknown) => emit('error', event, fields, err),
};
