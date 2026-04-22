/**
 * Boot-time environment validation.
 *
 * In production, the server must fail fast if any required secret is missing
 * or obviously wrong (still the default). This prevents silent misconfiguration
 * that would only surface on the first login attempt.
 *
 * In dev, we emit warnings but don't halt, so `pnpm dev` still works with a
 * minimal setup.
 */

type ValidationIssue = {
  key: string;
  severity: 'error' | 'warn';
  message: string;
};

const BANNED_JWT_DEFAULTS = new Set([
  '',
  'replace_with_a_long_random_secret',
  'change-me',
  'secret',
  'todo',
]);

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isPlaceholder(value: string | undefined, bans: Set<string>): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return bans.has(normalized);
}

export function validateEnv(): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const prod = isProduction();

  // JWT signing secret — critical. If missing or default, auth is insecure.
  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt.length < 24 || BANNED_JWT_DEFAULTS.has(jwt.trim().toLowerCase())) {
    issues.push({
      key: 'JWT_SECRET',
      severity: prod ? 'error' : 'warn',
      message:
        'JWT_SECRET is missing, too short (<24 chars), or still the placeholder value. Generate a random 32+ char secret.',
    });
  }

  // Allowed origins in production — required for CORS to be meaningful.
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (prod && (!allowedOrigins || allowedOrigins.trim().length === 0)) {
    issues.push({
      key: 'ALLOWED_ORIGINS',
      severity: 'error',
      message:
        'ALLOWED_ORIGINS must be set in production (comma-separated list of origins that can call the API).',
    });
  }

  // Email provider for verification / password reset.
  const emailFrom = process.env.EMAIL_FROM;
  const resendKey = process.env.RESEND_API_KEY;
  if (prod && (!emailFrom || !resendKey)) {
    issues.push({
      key: 'EMAIL_FROM / RESEND_API_KEY',
      severity: 'error',
      message: 'Email provider is not configured. Registration + password reset will fail in production.',
    });
  }

  // Inbound email webhook secret.
  const emailWebhookSecret = process.env.EMAIL_WEBHOOK_SECRET;
  if (prod && !emailWebhookSecret) {
    issues.push({
      key: 'EMAIL_WEBHOOK_SECRET',
      severity: 'error',
      message:
        'EMAIL_WEBHOOK_SECRET is not set. The /email/inbound endpoint will reject all traffic in production.',
    });
  }

  // Forge (LLM) credentials — AI features need these.
  const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;
  if (prod && !forgeKey) {
    issues.push({
      key: 'BUILT_IN_FORGE_API_KEY',
      severity: 'warn',
      message: 'LLM API key is not set. All AI features (tagging, summaries, search) will fail.',
    });
  }

  // Sentry — optional but recommended in production.
  if (prod && !process.env.SENTRY_DSN) {
    issues.push({
      key: 'SENTRY_DSN',
      severity: 'warn',
      message: 'SENTRY_DSN is not set. Errors will only be logged to stdout, not forwarded to Sentry.',
    });
  }

  // DATABASE_URL — we read it but do not yet use it (still SQLite). Warn if
  // someone thinks they are on Postgres.
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
    issues.push({
      key: 'DATABASE_URL',
      severity: 'warn',
      message:
        'DATABASE_URL points at Postgres, but the server currently uses local SQLite. The Postgres URL is ignored.',
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  return { ok: !hasErrors, issues };
}

export function printValidation(report: { ok: boolean; issues: ValidationIssue[] }): void {
  if (report.issues.length === 0) {
    console.log('[env] ✓ environment validation passed');
    return;
  }
  for (const issue of report.issues) {
    const tag = issue.severity === 'error' ? '❌' : '⚠️';
    console[issue.severity === 'error' ? 'error' : 'warn'](`[env] ${tag} ${issue.key}: ${issue.message}`);
  }
  if (report.ok) {
    console.log('[env] — continuing (warnings only, no hard failures)');
  }
}
