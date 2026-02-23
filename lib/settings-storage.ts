import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccentTheme } from "@/lib/theme-presets";

export type ThemePreference = "light" | "dark" | "auto";
export type FontSizePreference = "small" | "medium" | "large";

export interface AppSettings {
  username: string;
  email: string;
  taskReminders: boolean;
  dailyJournalReminder: boolean;
  taskReminderTime: string; // HH:mm
  journalReminderTime: string; // HH:mm
  theme: ThemePreference;
  accentTheme: AccentTheme;
  fontSize: FontSizePreference;
  autoSyncEnabled: boolean;
  autoTranscribe: boolean;
  transcribeLanguage: "ar" | "en";
}

const SETTINGS_KEY = "app_settings_v1";
const JOURNAL_REMINDER_NOTIFICATION_ID_KEY = "journal_reminder_notification_id";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  username: "Guest User",
  email: "guest@example.com",
  taskReminders: true,
  dailyJournalReminder: false,
  taskReminderTime: "09:00",
  journalReminderTime: "21:00",
  theme: "auto",
  accentTheme: "ocean",
  fontSize: "medium",
  autoSyncEnabled: true,
  autoTranscribe: false,
  transcribeLanguage: "en",
};

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    return {
      ...DEFAULT_APP_SETTINGS,
      ...(JSON.parse(raw) as Partial<AppSettings>),
    };
  } catch (error) {
    console.error("Failed to load app settings:", error);
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save app settings:", error);
  }
}

export async function updateAppSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadAppSettings();
  const next = { ...current, ...partial };
  await saveAppSettings(next);
  return next;
}

export async function getJournalReminderNotificationId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(JOURNAL_REMINDER_NOTIFICATION_ID_KEY);
  } catch (error) {
    console.error("Failed to read journal reminder notification id:", error);
    return null;
  }
}

export async function setJournalReminderNotificationId(id: string | null): Promise<void> {
  try {
    if (!id) {
      await AsyncStorage.removeItem(JOURNAL_REMINDER_NOTIFICATION_ID_KEY);
      return;
    }
    await AsyncStorage.setItem(JOURNAL_REMINDER_NOTIFICATION_ID_KEY, id);
  } catch (error) {
    console.error("Failed to save journal reminder notification id:", error);
  }
}
