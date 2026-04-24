import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Drop-in replacement for `expo-secure-store` that uses `localStorage` on
// web instead of relying on SDK 54's implicit fallback.
//
// WARNING: web values are stored in plain `localStorage` — not encrypted,
// readable by any script on the same origin. This is acceptable for auth
// tokens (same trust model as a session cookie) but do NOT use this
// wrapper to store secrets that must survive a compromised origin (e.g.
// raw passwords, encryption keys). Native iOS/Android continue to use
// the real keychain-backed SecureStore.
//
// The `SecureStoreOptions` third argument is ignored on web. Those flags
// are platform-specific (iOS keychain accessibility, Android auth
// requirements) and have no meaningful analogue in the browser.

export async function setItemAsync(
  key: string,
  value: string,
  options?: SecureStore.SecureStoreOptions
): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Safari private mode and some embedded webviews throw on write.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value, options);
}

export async function getItemAsync(
  key: string,
  options?: SecureStore.SecureStoreOptions
): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key, options);
}

export async function deleteItemAsync(
  key: string,
  options?: SecureStore.SecureStoreOptions
): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {}
    return;
  }
  await SecureStore.deleteItemAsync(key, options);
}
