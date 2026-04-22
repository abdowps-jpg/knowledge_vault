import { useEffect, useState } from "react";
import { I18nManager, NativeModules, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { en } from "./strings/en";
import { ar } from "./strings/ar";

function detectDeviceLocale(): "en" | "ar" {
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      const lang = (navigator.language || "en").slice(0, 2).toLowerCase();
      return lang === "ar" ? "ar" : "en";
    }
    const settings = NativeModules.SettingsManager?.settings as
      | { AppleLocale?: string; AppleLanguages?: string[] }
      | undefined;
    const iosLocale = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
    const androidLocale = NativeModules.I18nManager?.localeIdentifier as string | undefined;
    const raw = (iosLocale ?? androidLocale ?? "en").toLowerCase();
    return raw.startsWith("ar") ? "ar" : "en";
  } catch {
    return "en";
  }
}

export type Locale = "en" | "ar";
export type Dict = typeof en;

const STORAGE_KEY = "app.locale";
const CATALOGS: Record<Locale, Dict> = { en, ar };
const RTL_LOCALES: Locale[] = ["ar"];

let currentLocale: Locale = "en";
const subscribers = new Set<(l: Locale) => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function isRTL(locale: Locale = currentLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function t<K extends keyof Dict>(key: K): Dict[K];
export function t(key: string): string;
export function t(key: string): string {
  const dict = CATALOGS[currentLocale] as Record<string, string>;
  const fallback = (CATALOGS.en as Record<string, string>)[key];
  return dict[key] ?? fallback ?? key;
}

export async function setLocale(locale: Locale): Promise<void> {
  if (currentLocale === locale) return;
  currentLocale = locale;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore storage failures — in-memory change still applies
  }
  try {
    const shouldBeRtl = isRTL(locale);
    if (I18nManager.isRTL !== shouldBeRtl) {
      I18nManager.allowRTL(shouldBeRtl);
      I18nManager.forceRTL(shouldBeRtl);
      // A real app restart (Updates.reloadAsync) picks up the RTL flip;
      // for web and quick switches the in-app layout continues to work.
    }
  } catch {
    // ignore — I18nManager may throw on web
  }
  subscribers.forEach((fn) => fn(locale));
}

export async function initLocale(): Promise<Locale> {
  try {
    const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as Locale | null;
    if (stored === "en" || stored === "ar") {
      currentLocale = stored;
      return stored;
    }
  } catch {
    // fall through to device preference
  }
  const guessed: Locale = detectDeviceLocale();
  currentLocale = guessed;
  return guessed;
}

export function useLocale(): {
  locale: Locale;
  isRTL: boolean;
  setLocale: (l: Locale) => Promise<void>;
  t: typeof t;
} {
  const [locale, setLocaleState] = useState<Locale>(currentLocale);

  useEffect(() => {
    const fn = (l: Locale) => setLocaleState(l);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  return {
    locale,
    isRTL: isRTL(locale),
    setLocale,
    t,
  };
}
