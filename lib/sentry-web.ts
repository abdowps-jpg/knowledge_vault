// Web-only Sentry init. Native iOS/Android errors are NOT captured here —
// `@sentry/react-native` would be the full-coverage choice. Imported via
// dynamic import from app/_layout.tsx behind a Platform.OS === 'web' guard
// so the bundle doesn't pull `@sentry/browser` into native builds.

import { Platform } from "react-native";

let initialized = false;

export async function initSentryWeb(): Promise<void> {
  if (initialized) return;
  if (Platform.OS !== "web") return;

  // Resolve DSN from Expo public env (the only env that survives into the web bundle).
  const dsn =
    process.env.EXPO_PUBLIC_SENTRY_DSN_WEB ||
    process.env.EXPO_PUBLIC_SENTRY_DSN ||
    "";
  if (!dsn) return;

  try {
    const Sentry = await import("@sentry/browser");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      release: process.env.EXPO_PUBLIC_APP_VERSION || undefined,
      // Conservative defaults — no performance traces, no replay.
      // Both can be enabled later without changing this call site.
      tracesSampleRate: 0,
    });
    initialized = true;
  } catch (err) {
    // Don't let observability break the app boot.
    console.warn("[sentry-web] init failed:", err);
  }
}

// Convenience wrapper so call sites don't import @sentry/browser directly.
export async function captureWebException(
  error: unknown,
  context?: { userId?: string | null; route?: string | null }
): Promise<void> {
  if (Platform.OS !== "web") return;
  if (!initialized) return;
  try {
    const Sentry = await import("@sentry/browser");
    Sentry.withScope((scope) => {
      if (context?.userId) scope.setUser({ id: context.userId });
      if (context?.route) scope.setTag("route", context.route);
      Sentry.captureException(error);
    });
  } catch {
    // swallow
  }
}
