import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { getToken } from "@/lib/auth-storage";

type RealtimeCallbacks = {
  onNotification?: (payload: Record<string, unknown>) => void;
};

function resolveBaseUrl(): string | null {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/+$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    // Assume server on localhost:3000 in dev; for production, set EXPO_PUBLIC_API_URL.
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:3000";
    }
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  const hostUri = (Constants.expoConfig as any)?.hostUri;
  if (typeof hostUri === "string" && hostUri.length > 0) {
    const host = hostUri.split(":")[0];
    return `http://${host}:3000`;
  }
  return null;
}

/**
 * Opens a Server-Sent Events connection to `/events?token=<jwt>` and fires
 * callbacks on each notification event. No-op on native platforms that don't
 * have a global EventSource.
 */
export function useRealtime(cbs: RealtimeCallbacks) {
  const savedCbs = useRef(cbs);
  savedCbs.current = cbs;

  useEffect(() => {
    if (typeof (globalThis as any).EventSource !== "function") {
      // EventSource is typically available on web only.
      return;
    }
    const base = resolveBaseUrl();
    if (!base) return;

    let cancelled = false;
    let source: any = null;
    let backoffMs = 1500;

    const connect = async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      try {
        const url = `${base}/events?token=${encodeURIComponent(token)}`;
        source = new (globalThis as any).EventSource(url);
        source.addEventListener("notification", (ev: MessageEvent) => {
          try {
            const data = JSON.parse(ev.data);
            savedCbs.current.onNotification?.(data);
          } catch {
            // ignore malformed frames
          }
        });
        source.onerror = () => {
          try {
            source?.close();
          } catch {
            // ignore
          }
          if (cancelled) return;
          const retry = Math.min(30_000, backoffMs);
          backoffMs = Math.min(30_000, Math.round(backoffMs * 1.7));
          setTimeout(connect, retry);
        };
        source.onopen = () => {
          backoffMs = 1500;
        };
      } catch (err) {
        console.warn("[realtime] connect failed", err);
      }
    };

    connect();

    return () => {
      cancelled = true;
      try {
        source?.close();
      } catch {
        // ignore
      }
    };
  }, []);
}
