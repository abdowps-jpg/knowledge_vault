import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateEnv } from '../server/_core/validate-env';

describe('validateEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('passes in development with zero env set (warnings only, no hard errors)', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const { ok, issues } = validateEnv();
    expect(ok).toBe(true);
    // We still expect some warnings, but none at the "error" severity
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('fails in production when JWT_SECRET is missing', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://example.com';
    process.env.EMAIL_FROM = 'ops@example.com';
    process.env.RESEND_API_KEY = 're_xxx';
    process.env.EMAIL_WEBHOOK_SECRET = 'sek';
    process.env.BUILT_IN_FORGE_API_KEY = 'fk_xxx';

    const { ok, issues } = validateEnv();
    expect(ok).toBe(false);
    expect(issues.find((i) => i.key === 'JWT_SECRET')?.severity).toBe('error');
  });

  it('fails in production when JWT_SECRET is the placeholder', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.JWT_SECRET = 'replace_with_a_long_random_secret';
    process.env.ALLOWED_ORIGINS = 'https://example.com';
    process.env.EMAIL_FROM = 'ops@example.com';
    process.env.RESEND_API_KEY = 're_xxx';
    process.env.EMAIL_WEBHOOK_SECRET = 'sek';
    process.env.BUILT_IN_FORGE_API_KEY = 'fk_xxx';

    const { ok, issues } = validateEnv();
    expect(ok).toBe(false);
    expect(issues.find((i) => i.key === 'JWT_SECRET')?.severity).toBe('error');
  });

  it('fails in production when ALLOWED_ORIGINS is missing', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.EMAIL_FROM = 'ops@example.com';
    process.env.RESEND_API_KEY = 're_xxx';
    process.env.EMAIL_WEBHOOK_SECRET = 'sek';
    process.env.BUILT_IN_FORGE_API_KEY = 'fk_xxx';

    const { ok, issues } = validateEnv();
    expect(ok).toBe(false);
    expect(issues.find((i) => i.key === 'ALLOWED_ORIGINS')?.severity).toBe('error');
  });

  it('passes in production when all required env is set properly', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-real-long-random-secret-with-many-chars';
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    process.env.EMAIL_FROM = 'ops@example.com';
    process.env.RESEND_API_KEY = 're_xxx';
    process.env.EMAIL_WEBHOOK_SECRET = 'sek';
    process.env.BUILT_IN_FORGE_API_KEY = 'fk_xxx';

    const { ok, issues } = validateEnv();
    expect(ok).toBe(true);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });
});
