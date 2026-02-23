import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import Constants from "expo-constants";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";
import { ACCENT_THEME_LABELS, ACCENT_THEME_PREVIEW, type AccentTheme } from "@/lib/theme-presets";
import { clearAllData, exportAllData as exportLocalData, importData } from "@/lib/db/storage";
import { trpc } from "@/lib/trpc";
import { clearToken, saveStayLoggedIn, saveToken } from "@/lib/auth-storage";
import { clearSyncQueue, fullSync, getLastSyncTime } from "@/lib/sync-manager";
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  FontSizePreference,
  ThemePreference,
  getJournalReminderNotificationId,
  loadAppSettings,
  saveAppSettings,
  setJournalReminderNotificationId,
} from "@/lib/settings-storage";

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  const colors = useColors();
  return (
    <View className="mb-6">
      <Text className="text-xs font-semibold uppercase px-4 py-2" style={{ color: colors.muted }}>
        {title}
      </Text>
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderBottomColor: colors.border,
          borderTopWidth: 1,
          borderBottomWidth: 1,
        }}
      >
        {children}
      </View>
    </View>
  );
}

interface RowProps {
  icon: string;
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}

function Row({ icon, label, description, value, onPress, right }: RowProps) {
  const colors = useColors();
  const isPressable = typeof onPress === "function";
  return (
    <Pressable
      disabled={!isPressable}
      onPress={onPress}
      style={({ pressed }) => [
        {
          opacity: !isPressable ? 0.9 : pressed ? 0.7 : 1,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.surface,
        },
      ]}
    >
      <View className="flex-row items-center gap-3 flex-1">
        <MaterialIcons name={icon as never} size={22} color={colors.primary} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">{label}</Text>
          {description ? <Text className="text-xs text-muted mt-1">{description}</Text> : null}
        </View>
      </View>
      {right || (value ? <Text className="text-sm text-muted">{value}</Text> : null)}
    </Pressable>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeTime(hourValue: number, minuteValue: number): string | null {
  const h = Number(hourValue);
  const m = Number(minuteValue);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function applyWebFontSize(fontSize: FontSizePreference) {
  if (typeof document === "undefined") return;
  const px = fontSize === "small" ? 14 : fontSize === "large" ? 18 : 16;
  document.documentElement.style.fontSize = `${px}px`;
}

export default function SettingsScreen() {
  const PRIVACY_URL = "https://knowledgevault.app/privacy";
  const TERMS_URL = "https://knowledgevault.app/terms";
  const DATA_DELETION_URL = "https://knowledgevault.app/data-deletion";
  const SUPPORT_EMAIL = "support@knowledgevault.app";
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const systemScheme = useColorScheme() ?? "light";
  const { setColorScheme, setAccentTheme } = useThemeContext();
  const exportQuery = trpc.export.exportAll.useQuery(undefined, { enabled: false });
  const profileQuery = trpc.auth.getProfile.useQuery();
  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  const requestEmailChangeMutation = trpc.auth.requestEmailChange.useMutation();
  const confirmEmailChangeMutation = trpc.auth.confirmEmailChange.useMutation();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [storageUsed, setStorageUsed] = useState("0 B");

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportJson, setExportJson] = useState("");
  const [showAccountEditModal, setShowAccountEditModal] = useState(false);
  const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [pendingEmailChange, setPendingEmailChange] = useState("");

  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeTarget, setTimeTarget] = useState<"task" | "journal">("task");
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [syncingNow, setSyncingNow] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minuteOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const accountUsername = profileQuery.data?.user?.username ?? settings.username;
  const accountEmail = profileQuery.data?.user?.email ?? settings.email;
  const taskInboxEmail = profileQuery.data?.taskInboxEmail ?? "Unavailable";

  const openExternalUrl = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert("Unavailable", "This link is not available right now.");
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      console.error("Failed opening URL:", url, error);
      Alert.alert("Error", "Failed to open link.");
    }
  };

  const validateBackup = (payload: any) => {
    const container = payload?.data ?? payload;
    if (!container || typeof container !== "object") {
      return { valid: false, message: "Invalid backup format" };
    }

    const items = Array.isArray(container.items) ? container.items : [];
    const tasks = Array.isArray(container.tasks) ? container.tasks : [];
    const journalEntries = Array.isArray(container.journalEntries)
      ? container.journalEntries
      : Array.isArray(container.journal)
      ? container.journal
      : [];
    const tags = Array.isArray(container.tags) ? container.tags : [];
    const categories = Array.isArray(container.categories) ? container.categories : [];
    const attachments = Array.isArray(container.attachments) ? container.attachments : [];
    const reviewSchedules = Array.isArray(container.reviewSchedules) ? container.reviewSchedules : [];

    return {
      valid: true,
      normalized: {
        metadata: payload?.metadata ?? {
          version: payload?.version ?? "1.0.0",
          exportDate: payload?.exportDate ?? new Date().toISOString(),
        },
        data: {
          items,
          tasks,
          journalEntries,
          tags,
          categories,
          attachments,
          reviewSchedules,
        },
      },
    };
  };

  const mergeById = (current: any[], incoming: any[]) => {
    const map = new Map<string, any>();
    for (const record of current || []) {
      if (record?.id) map.set(record.id, record);
    }
    for (const record of incoming || []) {
      if (record?.id) map.set(record.id, record);
    }
    return Array.from(map.values());
  };

  const applyImport = async (strategy: "merge" | "replace", normalized: any) => {
    const incoming = normalized.data;
    const current = await exportLocalData();
    const currentData = (current as any)?.data ?? {};

    const payloadForStorage =
      strategy === "replace"
        ? {
            data: {
              items: incoming.items,
              tags: incoming.tags,
              categories: incoming.categories,
              attachments: incoming.attachments,
              reviewSchedules: incoming.reviewSchedules,
            },
          }
        : {
            data: {
              items: mergeById(currentData.items ?? [], incoming.items ?? []),
              tags: mergeById(currentData.tags ?? [], incoming.tags ?? []),
              categories: mergeById(currentData.categories ?? [], incoming.categories ?? []),
              attachments: mergeById(currentData.attachments ?? [], incoming.attachments ?? []),
              reviewSchedules: mergeById(currentData.reviewSchedules ?? [], incoming.reviewSchedules ?? []),
            },
          };

    if (strategy === "replace") {
      await clearAllData();
    }

    await importData(payloadForStorage);

    return {
      items: incoming.items.length,
      tasks: incoming.tasks.length,
      entries: incoming.journalEntries.length,
    };
  };

  const themeValue = useMemo(() => {
    if (settings.theme === "auto") return `Auto (${systemScheme})`;
    return settings.theme[0].toUpperCase() + settings.theme.slice(1);
  }, [settings.theme, systemScheme]);

  const refreshStorageUsed = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const entries = await AsyncStorage.multiGet(keys);
      const total = entries.reduce((sum, [, value]) => sum + (value ? value.length : 0), 0);
      setStorageUsed(formatBytes(total));
    } catch (error) {
      console.error("Failed calculating storage size:", error);
    }
  };

  const scheduleOrCancelJournalReminder = async (next: AppSettings) => {
    if (Platform.OS === "web") return;
    try {
      const Notifications = await import("expo-notifications");
      const existing = await getJournalReminderNotificationId();
      if (existing) {
        await Notifications.cancelScheduledNotificationAsync(existing);
        await setJournalReminderNotificationId(null);
      }

      if (!next.dailyJournalReminder) return;

      const [hourStr, minuteStr] = next.journalReminderTime.split(":");
      const hour = Number(hourStr);
      const minute = Number(minuteStr);

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Journal Reminder",
          body: "Take a minute to write your journal entry.",
          data: { type: "journal-reminder", route: "/(app)/(tabs)/journal" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: Number.isFinite(hour) ? hour : 21,
          minute: Number.isFinite(minute) ? minute : 0,
        },
      });

      await setJournalReminderNotificationId(id);
    } catch (error) {
      console.error("Failed scheduling journal reminder:", error);
    }
  };

  const persist = async (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    await saveAppSettings(next);
    await scheduleOrCancelJournalReminder(next);
  };

  const openAccountEditModal = () => {
    setEditUsername(accountUsername ?? "");
    setEditEmail(accountEmail ?? "");
    setShowAccountEditModal(true);
  };

  const handleAccountEditSave = async () => {
    const username = editUsername.trim();
    const email = editEmail.trim().toLowerCase();
    if (!username) {
      Alert.alert("Validation", "Username is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Validation", "Please enter a valid email.");
      return;
    }

    try {
      setWorking(true);
      const currentEmail = (accountEmail || "").toLowerCase();

      // Username can be updated directly.
      if (username !== (accountUsername ?? "")) {
        const usernameResult = await updateProfileMutation.mutateAsync({ username });
        await saveToken(usernameResult.token);
      }

      // Email change must be verified via code sent to the new email.
      if (email && email !== currentEmail) {
        await requestEmailChangeMutation.mutateAsync({ newEmail: email });
        setPendingEmailChange(email);
        setEmailVerificationCode("");
        setShowAccountEditModal(false);
        setShowEmailVerificationModal(true);
        Alert.alert("Verification required", "We sent a 6-digit code to your new email.");
      } else {
        const nextSettings = { ...settings, username, email: currentEmail || settings.email };
        setSettings(nextSettings);
        await saveAppSettings(nextSettings);
        setShowAccountEditModal(false);
        Alert.alert("Updated", "Account info updated successfully.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update account.";
      Alert.alert("Update Failed", message);
    } finally {
      setWorking(false);
    }
  };

  const handleConfirmEmailChange = async () => {
    const code = emailVerificationCode.trim();
    if (!/^\d{6}$/.test(code)) {
      Alert.alert("Validation", "Enter a valid 6-digit code.");
      return;
    }

    try {
      setWorking(true);
      const result = await confirmEmailChangeMutation.mutateAsync({ code });
      await saveToken(result.token);

      const nextSettings = {
        ...settings,
        username: result.user.username ?? settings.username,
        email: result.user.email,
      };
      setSettings(nextSettings);
      await saveAppSettings(nextSettings);
      setShowEmailVerificationModal(false);
      setPendingEmailChange("");
      setEmailVerificationCode("");
      Alert.alert("Updated", "Email changed successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to verify code.";
      Alert.alert("Verification Failed", message);
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadAppSettings();
        setSettings(loaded);
        const effectiveScheme = loaded.theme === "auto" ? (systemScheme as "light" | "dark") : loaded.theme;
        setColorScheme(effectiveScheme);
      } catch (error) {
        console.error("Failed loading settings:", error);
      } finally {
        setLoading(false);
        await refreshStorageUsed();
      }
    })();
  }, []);

  useEffect(() => {
    const user = profileQuery.data?.user;
    if (!user) return;
    setSettings((prev) => ({
      ...prev,
      username: user.username ?? prev.username,
      email: user.email ?? prev.email,
    }));
  }, [profileQuery.data]);

  useEffect(() => {
    getLastSyncTime().then(setLastSyncAt).catch(() => setLastSyncAt(null));
  }, []);

  const handleThemeChange = async (theme: ThemePreference) => {
    await persist({ theme });
    const effectiveScheme = theme === "auto" ? (systemScheme as "light" | "dark") : theme;
    setColorScheme(effectiveScheme);
  };

  const handleAccentThemeChange = async (accentTheme: AccentTheme) => {
    await persist({ accentTheme });
    setAccentTheme(accentTheme);
  };

  const handleFontSizeChange = async (fontSize: FontSizePreference) => {
    await persist({ fontSize });
    applyWebFontSize(fontSize);
  };

  const openTimePicker = (target: "task" | "journal") => {
    const source = target === "task" ? settings.taskReminderTime : settings.journalReminderTime;
    const [h, m] = source.split(":");
    setSelectedHour(Number(h) || 0);
    setSelectedMinute(Number(m) || 0);
    setTimeTarget(target);
    setShowTimeModal(true);
  };

  const saveTimePicker = async () => {
    const nextTime = normalizeTime(selectedHour, selectedMinute);
    if (!nextTime) {
      Alert.alert("Invalid Time", "Please enter valid hour (0-23) and minute (0-59).");
      return;
    }
    if (timeTarget === "task") {
      await persist({ taskReminderTime: nextTime });
    } else {
      await persist({ journalReminderTime: nextTime });
    }
    setShowTimeModal(false);
  };

  const handleExportData = async () => {
    try {
      setWorking(true);
      const response = await exportQuery.refetch();
      const data = response.data;
      if (!data) {
        throw new Error("No export data returned from server");
      }

      const json = JSON.stringify(data, null, 2);
      const dateLabel = new Date().toISOString().slice(0, 10);
      const filename = `knowledge-vault-backup-${dateLabel}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Export Data",
          UTI: "public.json",
        });
      } else {
        Alert.alert("Export Ready", `File saved: ${fileUri}`);
      }

      setExportJson(json);
      setShowExportModal(true);
    } catch (error) {
      console.error("Export failed:", error);
      Alert.alert("Error", "Failed to export data.");
    } finally {
      setWorking(false);
    }
  };

  const handleImportData = async () => {
    try {
      setWorking(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/json", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const selected = result.assets[0];
      const fileText = await FileSystem.readAsStringAsync(selected.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const parsed = JSON.parse(fileText);
      const validated = validateBackup(parsed);
      if (!validated.valid || !validated.normalized) {
        Alert.alert("Invalid Backup", validated.message || "The selected JSON is not a valid backup file.");
        return;
      }

      Alert.alert("Import Data", "Choose import mode", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Merge",
          onPress: async () => {
            try {
              setWorking(true);
              const summary = await applyImport("merge", validated.normalized);
              await refreshStorageUsed();
              Alert.alert(
                "Import Complete",
                `${summary.items} items, ${summary.tasks} tasks, ${summary.entries} entries imported (merge).`
              );
            } catch (error) {
              console.error("Merge import failed:", error);
              Alert.alert("Error", "Failed to merge import data.");
            } finally {
              setWorking(false);
            }
          },
        },
        {
          text: "Replace",
          style: "destructive",
          onPress: async () => {
            try {
              setWorking(true);
              const summary = await applyImport("replace", validated.normalized);
              await refreshStorageUsed();
              Alert.alert(
                "Import Complete",
                `${summary.items} items, ${summary.tasks} tasks, ${summary.entries} entries imported (replace).`
              );
            } catch (error) {
              console.error("Replace import failed:", error);
              Alert.alert("Error", "Failed to replace with imported data.");
            } finally {
              setWorking(false);
            }
          },
        },
      ]);
    } catch (error) {
      console.error("Import failed:", error);
      Alert.alert("Error", "Invalid JSON or import failed.");
    } finally {
      setWorking(false);
    }
  };

  const handleClearAllData = () => {
    Alert.alert("Clear All Data", "This will permanently remove all app data. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          try {
            setWorking(true);
            await clearAllData();
            await saveAppSettings(DEFAULT_APP_SETTINGS);
            setSettings(DEFAULT_APP_SETTINGS);
            await refreshStorageUsed();
            Alert.alert("Done", "All data cleared.");
          } catch (error) {
            console.error("Clear data failed:", error);
            Alert.alert("Error", "Failed to clear data.");
          } finally {
            setWorking(false);
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    const performLogout = async () => {
      try {
        await clearAllData();
        await clearSyncQueue();
        await clearToken();
        await saveStayLoggedIn(false);
        queryClient.clear();
        router.replace("/(auth)/login" as any);
        setTimeout(() => {
          router.replace("/(auth)/login" as any);
        }, 50);
      } catch (error) {
        console.error("Logout failed:", error);
        Alert.alert("Error", "Logout failed. Please try again.");
      }
    };

    if (Platform.OS === "web") {
      const confirmed = typeof window !== "undefined" ? window.confirm("Do you want to sign out?") : true;
      if (!confirmed) return;
      performLogout().catch((error) => {
        console.error("Logout failed:", error);
      });
      return;
    }

    Alert.alert("Logout", "Do you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          performLogout().catch((error) => {
            console.error("Logout failed:", error);
          });
        },
      },
    ]);
  };

  const handleManualSync = async () => {
    try {
      setSyncingNow(true);
      const result = await fullSync();
      setLastSyncAt(result.down.serverTimestamp);
      Alert.alert("Sync Complete", `Uploaded: ${result.up.synced}, Failed: ${result.up.failed}`);
    } catch (error) {
      Alert.alert("Sync Failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSyncingNow(false);
    }
  };

  const handleResetProductivityData = () => {
    Alert.alert("Reset Productivity Data", "Clear local productivity tracking data (goals, habits, saved searches)?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.multiRemove([
              "actions_saved_views_v1",
              "actions_focus_stats_v1",
              "actions_my_day_ids_v1",
              "actions_habits_v1",
              "actions_weekly_goals_v1",
              "actions_monthly_goals_v1",
              "search_recent_terms_v1",
              "search_saved_terms_v1",
            ]);
            Alert.alert("Done", "Productivity data reset successfully.");
          } catch (error) {
            console.error("Failed resetting productivity data:", error);
            Alert.alert("Error", "Failed to reset productivity data.");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <View className="px-4 py-4 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Settings</Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <Section title="Account">
          <Row icon="person" label="Username" value={accountUsername || "Unknown"} />
          <Row icon="email" label="Email" value={accountEmail || "Unknown"} />
          <Row
            icon="alternate-email"
            label="Task Inbox Email"
            value={taskInboxEmail}
            description="Forward emails here to create tasks automatically"
          />
          <Row
            icon="edit"
            label="Request Edit"
            description="Update your username or email"
            onPress={openAccountEditModal}
          />
          <Row icon="logout" label="Logout" onPress={handleLogout} />
        </Section>

        <Section title="Notifications">
          <Row
            icon="alarm"
            label="Task Reminders"
            description="Due-date reminders for tasks"
            right={
              <Switch
                value={settings.taskReminders}
                onValueChange={(value) => persist({ taskReminders: value })}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
          />
          <Row
            icon="schedule"
            label="Task Reminder Time"
            value={settings.taskReminderTime}
            onPress={() => openTimePicker("task")}
          />
          <Row
            icon="menu-book"
            label="Daily Journal Reminder (9 PM)"
            description="Daily reminder to write journal"
            right={
              <Switch
                value={settings.dailyJournalReminder}
                onValueChange={(value) => persist({ dailyJournalReminder: value })}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
          />
          <Row
            icon="access-time"
            label="Journal Reminder Time"
            value={settings.journalReminderTime}
            onPress={() => openTimePicker("journal")}
          />
        </Section>

        <Section title="Display">
          <Row icon="palette" label="Theme" value={themeValue} />
          <View className="px-4 pb-3 pt-1 flex-row gap-2">
            {(["light", "dark", "auto"] as ThemePreference[]).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => handleThemeChange(mode)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: settings.theme === mode ? colors.primary : colors.background,
                }}
              >
                <Text style={{ color: settings.theme === mode ? "white" : colors.foreground, fontWeight: "600" }}>
                  {mode[0].toUpperCase() + mode.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Row icon="color-lens" label="Color Theme" value={ACCENT_THEME_LABELS[settings.accentTheme]} />
          <View className="px-4 pb-3 pt-1 flex-row flex-wrap gap-2">
            {(Object.keys(ACCENT_THEME_LABELS) as AccentTheme[]).map((themeKey) => (
              <Pressable
                key={themeKey}
                onPress={() => handleAccentThemeChange(themeKey)}
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  minWidth: 100,
                  backgroundColor: settings.accentTheme === themeKey ? colors.surface : colors.background,
                }}
              >
                <View className="flex-row items-center gap-2">
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: ACCENT_THEME_PREVIEW[themeKey],
                    }}
                  />
                  <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 12 }}>
                    {ACCENT_THEME_LABELS[themeKey]}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
          <Row icon="format-size" label="Font Size" value={settings.fontSize} />
          <View className="px-4 pb-3 pt-1 flex-row gap-2">
            {(["small", "medium", "large"] as FontSizePreference[]).map((size) => (
              <Pressable
                key={size}
                onPress={() => handleFontSizeChange(size)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: settings.fontSize === size ? colors.primary : colors.background,
                }}
              >
                <Text style={{ color: settings.fontSize === size ? "white" : colors.foreground, fontWeight: "600" }}>
                  {size[0].toUpperCase() + size.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="Data">
          <Row icon="download" label="Export Data (JSON)" onPress={handleExportData} />
          <Row icon="upload-file" label="Import Data (JSON)" onPress={handleImportData} />
          <Row icon="delete-forever" label="Clear All Data" onPress={handleClearAllData} />
          <Row icon="storage" label="Storage Used" value={storageUsed} />
        </Section>

        <Section title="Cloud Sync">
          <Row
            icon="sync"
            label="Last Sync"
            value={lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Never"}
          />
          <Row
            icon="cloud-sync"
            label="Manual Sync"
            description="Push and pull latest changes now"
            onPress={handleManualSync}
            right={syncingNow ? <ActivityIndicator color={colors.primary} /> : undefined}
          />
          <Row
            icon="autorenew"
            label="Auto Sync"
            description="Sync every 5 minutes when app is active"
            right={
              <Switch
                value={settings.autoSyncEnabled}
                onValueChange={(value) => persist({ autoSyncEnabled: value })}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
          />
          <Row
            icon={syncingNow ? "cloud-upload" : "cloud-done"}
            label="Sync Status"
            value={syncingNow ? "Syncing..." : "Idle"}
          />
        </Section>

        <Section title="Transcription">
          <Row
            icon="record-voice-over"
            label="Auto-Transcribe"
            description="Automatically transcribe recorded audio"
            right={
              <Switch
                value={settings.autoTranscribe}
                onValueChange={(value) => persist({ autoTranscribe: value })}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
          />
          <Row icon="language" label="Language" value={settings.transcribeLanguage === "ar" ? "Arabic" : "English"} />
          <View className="px-4 pb-3 pt-1 flex-row gap-2">
            {(["en", "ar"] as const).map((lang) => (
              <Pressable
                key={lang}
                onPress={() => persist({ transcribeLanguage: lang })}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: settings.transcribeLanguage === lang ? colors.primary : colors.background,
                }}
              >
                <Text style={{ color: settings.transcribeLanguage === lang ? "white" : colors.foreground, fontWeight: "600" }}>
                  {lang === "ar" ? "Arabic" : "English"}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="Productivity">
          <Row icon="check-circle" label="Open Actions Dashboard" onPress={() => router.push("/(app)/(tabs)/actions" as any)} />
          <Row icon="search" label="Open Smart Search" onPress={() => router.push("/(app)/(tabs)/search" as any)} />
          <Row icon="flag" label="Goals & Milestones" onPress={() => router.push("/(app)/goals" as any)} />
          <Row icon="rate-review" label="Daily & Weekly Review" onPress={() => router.push("/(app)/reviews" as any)} />
          <Row icon="add-task" label="Widget Quick Add" onPress={() => router.push("/(app)/widgets/quick-add" as any)} />
          <Row icon="today" label="Widget Today Tasks" onPress={() => router.push("/(app)/widgets/today-tasks" as any)} />
          <Row icon="refresh" label="Reset Productivity Data" onPress={handleResetProductivityData} />
        </Section>

        <Section title="About">
          <Row icon="info" label="App Version" value={appVersion} />
          <Row icon="bar-chart" label="Statistics" onPress={() => router.push("/stats")} />
          <Row icon="insights" label="Advanced Analytics" onPress={() => router.push("/analytics" as any)} />
          <Row icon="devices" label="Device Management" onPress={() => router.push("/devices" as any)} />
          <Row icon="psychology" label="AI Features" onPress={() => router.push("/ai-features" as any)} />
          <Row icon="merge-type" label="Resolve Conflicts" onPress={() => router.push("/conflicts" as any)} />
          <Row
            icon="policy"
            label="Privacy Policy"
            onPress={() => openExternalUrl(PRIVACY_URL)}
          />
          <Row
            icon="gavel"
            label="Terms of Service"
            onPress={() => openExternalUrl(TERMS_URL)}
          />
          <Row
            icon="delete-sweep"
            label="Data Deletion"
            onPress={() => openExternalUrl(DATA_DELETION_URL)}
          />
          <Row
            icon="support-agent"
            label="Support"
            onPress={() => openExternalUrl(`mailto:${SUPPORT_EMAIL}`)}
          />
        </Section>
      </ScrollView>

      <Modal visible={showExportModal} transparent animationType="fade" onRequestClose={() => setShowExportModal(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6 max-h-[80%]" style={{ backgroundColor: colors.surface }}>
            <Text className="text-lg font-bold text-foreground mb-3">Export JSON</Text>
            <ScrollView className="border border-border rounded-lg p-3 bg-background mb-4">
              <Text style={{ color: colors.foreground, fontFamily: "monospace", fontSize: 12 }}>{exportJson}</Text>
            </ScrollView>
            <Pressable onPress={() => setShowExportModal(false)}>
              <View className="bg-primary rounded-lg py-3 items-center">
                <Text className="text-white font-semibold">Close</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showTimeModal} transparent animationType="fade" onRequestClose={() => setShowTimeModal(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: colors.surface }}>
            <Text className="text-lg font-bold text-foreground mb-2">Select Time (HH:mm)</Text>
            <Text className="text-muted mb-3">
              {`${String(selectedHour).padStart(2, "0")}:${String(selectedMinute).padStart(2, "0")}`}
            </Text>
            <View className="flex-row gap-3 mb-4">
              <View style={{ flex: 1 }}>
                <Text className="text-xs font-semibold mb-2" style={{ color: colors.muted }}>
                  Hour
                </Text>
                <ScrollView
                  style={{
                    maxHeight: 180,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    backgroundColor: colors.background,
                  }}
                >
                  {hourOptions.map((hour) => (
                    <Pressable
                      key={`hour-${hour}`}
                      onPress={() => setSelectedHour(hour)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: selectedHour === hour ? colors.primary : "transparent",
                      }}
                    >
                      <Text style={{ color: selectedHour === hour ? "white" : colors.foreground }}>
                        {String(hour).padStart(2, "0")}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flex: 1 }}>
                <Text className="text-xs font-semibold mb-2" style={{ color: colors.muted }}>
                  Minute
                </Text>
                <ScrollView
                  style={{
                    maxHeight: 180,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    backgroundColor: colors.background,
                  }}
                >
                  {minuteOptions.map((minute) => (
                    <Pressable
                      key={`minute-${minute}`}
                      onPress={() => setSelectedMinute(minute)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: selectedMinute === minute ? colors.primary : "transparent",
                      }}
                    >
                      <Text style={{ color: selectedMinute === minute ? "white" : colors.foreground }}>
                        {String(minute).padStart(2, "0")}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View className="flex-row gap-3">
              <Pressable onPress={() => setShowTimeModal(false)} style={{ flex: 1 }}>
                <View className="bg-border rounded-lg py-3 items-center">
                  <Text className="text-foreground font-semibold">Cancel</Text>
                </View>
              </Pressable>
              <Pressable onPress={saveTimePicker} style={{ flex: 1 }}>
                <View className="bg-primary rounded-lg py-3 items-center">
                  <Text className="text-white font-semibold">Save</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAccountEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAccountEditModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: colors.surface }}>
            <Text className="text-lg font-bold text-foreground mb-4">Request Account Edit</Text>

            <TextInput
              value={editUsername}
              onChangeText={setEditUsername}
              placeholder="Username"
              placeholderTextColor={colors.muted}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.foreground,
                marginBottom: 10,
                backgroundColor: colors.background,
              }}
            />

            <TextInput
              value={editEmail}
              onChangeText={setEditEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor={colors.muted}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.foreground,
                marginBottom: 16,
                backgroundColor: colors.background,
              }}
            />

            <View className="flex-row gap-3">
              <Pressable onPress={() => setShowAccountEditModal(false)} style={{ flex: 1 }}>
                <View className="bg-border rounded-lg py-3 items-center">
                  <Text className="text-foreground font-semibold">Cancel</Text>
                </View>
              </Pressable>
              <Pressable onPress={handleAccountEditSave} style={{ flex: 1 }}>
                <View className="bg-primary rounded-lg py-3 items-center">
                  <Text className="text-white font-semibold">Submit</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEmailVerificationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmailVerificationModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: colors.surface }}>
            <Text className="text-lg font-bold text-foreground mb-2">Verify New Email</Text>
            <Text className="text-sm text-muted mb-4">
              Enter the 6-digit code sent to {pendingEmailChange || "your new email"}.
            </Text>

            <TextInput
              value={emailVerificationCode}
              onChangeText={setEmailVerificationCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="6-digit code"
              placeholderTextColor={colors.muted}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.foreground,
                marginBottom: 16,
                backgroundColor: colors.background,
              }}
            />

            <View className="flex-row gap-3">
              <Pressable onPress={() => setShowEmailVerificationModal(false)} style={{ flex: 1 }}>
                <View className="bg-border rounded-lg py-3 items-center">
                  <Text className="text-foreground font-semibold">Cancel</Text>
                </View>
              </Pressable>
              <Pressable onPress={handleConfirmEmailChange} style={{ flex: 1 }}>
                <View className="bg-primary rounded-lg py-3 items-center">
                  <Text className="text-white font-semibold">Verify</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {working ? (
        <View
          style={{
            pointerEvents: "none",
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </ScreenContainer>
  );
}
