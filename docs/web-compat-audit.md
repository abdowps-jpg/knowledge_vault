# Web Compatibility Audit

**Date:** 2026-04-23 (initial), 2026-04-24 (SecureStore wrapper + browser-exercised verification)
**Target:** `pnpm exec expo start --web` on SDK 54 / React Native 0.81 / react-native-web 0.21

This audit classifies every React Native–adjacent dependency in `package.json`
by how it behaves on the web target, then enumerates every call site that needs
a `Platform.OS !== 'web'` guard (or a web-friendly swap) along with the fix
that was applied.

---

## 1. Works on web out of the box

These are either pure JavaScript, first-class web citizens, or already shim
themselves via `react-native-web`. No guards required.

| Module | Notes |
|---|---|
| `react`, `react-dom` | Core. |
| `react-native` + `react-native-web` | The web target itself. |
| `expo-router` | Full web support; `app/` routes are file-based on web too. |
| `nativewind` | Compiles to standard Tailwind on web. |
| `@tanstack/react-query` | Pure JS. |
| `@trpc/client`, `@trpc/react-query`, `@trpc/server` | Pure JS; server half never ships to the browser bundle. |
| `@react-navigation/native`, `/bottom-tabs`, `/elements` | Web-aware via `react-native-web`. |
| `@react-native-async-storage/async-storage` | Web fallback uses `localStorage`. |
| `@react-native-community/netinfo` | Web uses `navigator.onLine` and `connection` API. |
| `@expo/vector-icons` | Glyph fonts served as web fonts; no native bridge. |
| `@shopify/flash-list` | Falls back to `FlatList` on web; OK. |
| `expo-constants` | Web-safe; exposes manifest and `executionEnvironment`. |
| `expo-linking` | Works on web via `window.location` + `Linking.openURL`. |
| `expo-web-browser` | Opens via `window.open` on web. |
| `expo-status-bar` | No-op on web; never throws. |
| `expo-splash-screen` | No-op on web. |
| `expo-keep-awake` | No-op on web. |
| `expo-system-ui` | No-op on web. |
| `expo-symbols` | Falls through to vector-icon render. |
| `expo-font` | Loads webfonts through CSS. |
| `expo-image` | Uses `<img>` on web. |
| `expo-image-picker` | Uses `<input type="file">` on web. |
| `expo-image-manipulator` | Uses Canvas on web (slower, but works). |
| `expo-document-picker` | Uses `<input type="file">` on web. |
| `expo-sharing` | Calls `navigator.share` when available; `isAvailableAsync()` returns `false` otherwise. |
| `expo-secure-store` | SDK 54 ships an implicit `localStorage` fallback. **We no longer rely on it** — call sites go through `lib/secure-store-web-safe.ts` (see §3.2) for explicit, platform-branched behaviour. **Not secure on web — do not store real secrets.** |
| `react-native-safe-area-context` | Inset shim on web. |
| `react-native-screens` | No-op on web. |
| `react-native-gesture-handler` | Partial web support; common gestures work. |
| `react-native-reanimated` / `react-native-worklets` | Web runtime. |
| `react-native-svg` | Renders native `<svg>` on web. |
| `react-native-chart-kit` | Built on SVG; works. |
| `react-native-calendars` | Works on web. |
| `react-native-markdown-display` | Pure RN primitives. |
| `axios`, `clsx`, `tailwind-merge`, `chrono-node`, `superjson`, `uuid`, `zod`, `jose`, `jsonwebtoken`, `drizzle-orm` | Pure JS. |
| `html-docx-js`, `jspdf`, `tesseract.js` | Web-first libraries. |

---

## 2. Silent-fail on web (no-op without error)

These do not throw, but the feature they promise is unavailable. Call sites
don't need guards for correctness; we add guards anyway to avoid surprise
UX where the user taps a button and nothing happens.

| Module | Web behavior |
|---|---|
| `expo-haptics` | `impactAsync` / `notificationAsync` reject with `UnavailabilityError` in SDK 54. Guarded. |
| `expo-keep-awake` | `activateKeepAwake` is a no-op. Not called in this project. |

---

## 3. Throws on web (hard crashes unless guarded)

These modules either throw at call time or load native bindings that do not
exist on web. Every call site was reviewed and guarded.

| Module | Web behavior |
|---|---|
| `expo-local-authentication` | `hasHardwareAsync`, `authenticateAsync`, etc. throw `UnavailabilityError` on web. |
| `expo-notifications` | `scheduleNotificationAsync`, `requestPermissionsAsync`, listeners throw on web. |
| `expo-audio` | `useAudioRecorder` / `useAudioRecorderState` are unsupported on web (no `MediaRecorder` integration). `useAudioPlayer` playback does work via `<audio>` and is left unguarded. |
| `expo-file-system/legacy` | `documentDirectory`, `getInfoAsync`, `readAsStringAsync`, `writeAsStringAsync`, `deleteAsync`, `makeDirectoryAsync`, `readDirectoryAsync` all throw on web. |
| `expo-video` | Not currently imported in the app. |
| `expo-location` | Not currently imported in the app. |

### 3.1. Call-site map and fixes

Each cell below links a module → file → the guard or replacement applied.

#### `expo-haptics`

| File | Call sites | Fix |
|---|---|---|
| `components/haptic-tab.tsx` | 1 | **Already guarded** (`process.env.EXPO_OS === "ios"`). |
| `components/swipeable-row.tsx` | 1 | Inline `Platform.OS !== 'web'`. |
| `components/item-context-menu.tsx` | 3 | Inline guards on all three. |
| `components/quick-add-modal.tsx` | 2 | Inline guards. |
| `components/audio-recorder-modal.tsx` | 3 | Inline guards. |
| `app/(app)/(tabs)/today.tsx` | 2 | Inline guards. |
| `app/(app)/(tabs)/index.tsx` | 3 | Inline guards. |

#### `expo-local-authentication`

| File | Call sites | Fix |
|---|---|---|
| `lib/auth/biometric-auth.ts` | 6 public methods touch `LocalAuthentication.*` | Added a `Platform.OS === 'web'` short-circuit at the top of every method; returns safe defaults (`false`, empty arrays). PIN/SecureStore paths keep working on web. |

#### `expo-audio`

| File | Call sites | Fix |
|---|---|---|
| `lib/audio/audio-service.ts` | `requestRecordingPermissionsAsync`, FileSystem ops | Guarded; permissions short-circuit to `false` on web, directory ops resolve cleanly. |
| `components/audio-recorder-modal.tsx` | `useAudioRecorder`, `useAudioRecorderState` | Modal renders a "Recording isn't supported on web yet" placeholder instead of mounting the recorder hooks. |
| `components/audio-player.tsx` | `useAudioPlayer`, `useAudioPlayerStatus` | **Left unguarded** — playback works via HTML `<audio>` on web. |

#### `expo-notifications`

| File | Call sites | Fix |
|---|---|---|
| `lib/notifications/notification-service.ts` | `setNotificationHandler`, `requestPermissionsAsync`, `scheduleNotificationAsync` (×2), `cancelScheduledNotificationAsync`, `cancelAllScheduledNotificationsAsync`, `getAllScheduledNotificationsAsync`, `addNotificationResponseReceivedListener`, `addNotificationReceivedListener` | Every public method checks `Platform.OS === 'web'` first and returns safely (no-op, `false`, `null`, empty array). |

#### `expo-file-system/legacy`

| File | Call sites | Fix |
|---|---|---|
| `lib/audio/audio-service.ts` | `deleteAsync`, `getInfoAsync`, `readDirectoryAsync`, `makeDirectoryAsync` | Guarded; dir returns `""` / size returns `0` on web. |
| `components/quick-add-modal.tsx` | `getInfoAsync`, `readAsStringAsync` (inside audio-save branch) | The whole audio-attachment block is gated; on web, users can still save a voice note, but the separate binary upload step short-circuits. |
| `app/(app)/(tabs)/settings.tsx` | Export/import write-read block | **Already guarded** at call site (pre-existing `if (Platform.OS !== "web")` branches for OS share path). Web export path falls through to a browser-download URL. |

### 3.2. `expo-secure-store` — explicit wrapper (added 2026-04-24)

The initial audit noted SecureStore works on web via SDK 54's implicit
`localStorage` shim. That is adequate for a compile pass but has two
problems:

1. **SDK-version coupling.** If a future SDK drops the shim or changes its
   behaviour (e.g. stops accepting the options third-arg), every
   SecureStore call site silently breaks. The shim is undocumented in the
   public API.
2. **No in-repo signal** that writes on web are unencrypted. Readers of
   `lib/auth/biometric-auth.ts` see `SecureStore.setItemAsync("app_pin", …)`
   and reasonably assume keychain-level protection on every platform.

**Fix:** a thin drop-in wrapper at `lib/secure-store-web-safe.ts` exporting
`setItemAsync` / `getItemAsync` / `deleteItemAsync` with Platform-branched
bodies. On web it calls `globalThis.localStorage` directly (wrapped in
try/catch for Safari private mode); on native it delegates to
`expo-secure-store`. The file header carries a plain-English warning that
web values are not encrypted.

| File | Previous behaviour | New behaviour |
|---|---|---|
| `lib/auth/biometric-auth.ts` | `import * as SecureStore from "expo-secure-store"` — PIN, app-lock flag, entry-lock flag, entry-locked-`${id}` all written via the implicit SDK shim on web. | `import * as SecureStore from "@/lib/secure-store-web-safe"` — one-line change, all call sites unchanged, but writes on web now route through `localStorage` with a visible warning in the wrapper. |
| `lib/auth-storage.ts` | Already branches explicitly on `Platform.OS === "web"` and uses `AsyncStorage` on web. | **Left alone.** Refactoring to the wrapper for "consistency" would add diff without fixing a bug. |
| `lib/_core/auth.ts` | Already branches explicitly on `Platform.OS === "web"` and uses `localStorage` directly on web. | **Left alone**, same reason. |

The `SecureStoreOptions` third argument (iOS keychain accessibility, Android
`requireAuthentication`, etc.) is accepted by the wrapper signature for
compile-compatibility but ignored on web — those flags have no meaningful
browser analogue. Call sites that depend on keychain accessibility levels
(none currently) would silently lose that guarantee on web, which is a
correct reflection of what the platform can enforce.

---

## 4. Verification

After today's changes:

- `pnpm check` (tsc) — clean
- `pnpm test` (vitest) — **12 files / 74 tests green** (baseline bumped by
  13 XSS-regression tests in `tests/markdown-safe-html.test.ts` shipped
  alongside `docs/security-audit.md`)
- `pnpm exec expo start --web --port 8081` — see the "Runtime verification"
  section below
- **Browser-exercised smoke test** via Playwright (see §4.1)

### 4.1. Runtime verification — browser-exercised (2026-04-24)

Unlike the initial pass, which only checked Metro's compile output, today's
verification actually opened the page in headless Chromium, waited for
`networkidle`, and captured the browser console + uncaught `pageerror`
events + failed network requests.

Harness: `tmp-web-smoke.py` driven by the `webapp-testing` skill's
`with_server.py` wrapper, starting `pnpm exec expo start --web --port 8081
--non-interactive` and waiting for `localhost:8081` to accept connections
before navigation.

**Result:**

| Metric | Count |
|---|---|
| Page errors (uncaught `throw` / unhandled promise rejection) | **0** |
| Console-level `error` messages | **0** |
| Console-level `warning` messages | **0** |
| Failed network requests | 1 (see note) |
| Console info/log messages | 2 (both benign — React DevTools hint + "Running application main") |
| HTML length after bundle | 50,767 bytes |
| Screenshot | rendered the onboarding screen with "Welcome to Knowledge Vault", book icon, page dots, Next button, and a "Synced" status pill |

The one failed request was `HEAD http://localhost:8081/` → `ERR_ABORTED`
— Playwright's own pre-navigation probe that gets cancelled when the
real `GET` replaces it. Not a real app failure.

No "Unable to resolve module", no "Unimplemented", no "UnavailabilityError",
no warning about native-only APIs from Reanimated / GestureHandler / Audio.
The Sentry web-init dynamic-import in `app/_layout.tsx`
(`import("@/lib/sentry-web")`) also resolved without error.

**Coverage caveat still in force.** The smoke exercises the boot path —
root layout, auth gate, onboarding first slide, offline manager, sync
status pill, Stack render. It does NOT exercise:

- Clicking through all four onboarding slides and dismissing
- Login form submit
- Tab navigation (inbox / today / library / actions / journal)
- Item capture (quick-add modal)
- Audio recorder modal (the web fallback renders the "unsupported" placeholder)
- **The `lib/secure-store-web-safe.ts` web branches.** `BiometricAuthService`
  is currently defined but not imported by any screen (grep confirms:
  `BiometricAuthService` appears in `lib/auth/biometric-auth.ts` only).
  The wrapper migration ensures the web branches will activate the moment
  `BiometricAuthService.getInstance()` is wired into Settings; until then,
  the only runtime signal is that the import graph resolves cleanly at
  boot (which today's smoke confirms). A targeted unit test with a
  mocked `Platform.OS = "web"` and a fake `globalThis.localStorage`
  would give a stronger signal and is a reasonable follow-up.
- `/debug/throw` sentry envelope (covered in the separate security-audit PR)

For an interactive deep-dive, walking the main flows in a real browser is
still recommended before shipping a public web build.

**Expo-reported version mismatches** (unchanged from 2026-04-23):

```
@react-native-community/netinfo@11.5.2   (expected 11.4.1)
@shopify/flash-list@1.8.3                 (expected 2.0.2)
expo@54.0.29                               (expected ~54.0.33)
expo-audio@1.1.0                           (expected ~1.1.1)
expo-constants@18.0.12                     (expected ~18.0.13)
expo-font@14.0.10                          (expected ~14.0.11)
expo-linking@8.0.10                        (expected ~8.0.11)
expo-notifications@0.32.15                 (expected ~0.32.16)
expo-router@6.0.19                         (expected ~6.0.23)
expo-splash-screen@31.0.12                 (expected ~31.0.13)
expo-video@3.0.15                          (expected ~3.0.16)
```

Non-fatal advisories. `pnpm exec expo install --fix` would resolve them
in one pass.

---

## 5. Guard template reference

All call-site fixes follow one of two shapes.

**Inline no-op guard** (for fire-and-forget calls with no return value that
code paths depend on):

```ts
import { Platform } from "react-native";

if (Platform.OS !== "web") {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
```

**Top-of-method short-circuit** (for methods that must return something and
are called in many places):

```ts
async isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return await LocalAuthentication.hasHardwareAsync();
}
```

The choice is dictated by whether callers observe the return value. When they
do, short-circuit; when they don't, skip the call entirely.
