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
import * as FileSystem from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";
import { clearAllData, exportAllData as exportLocalData, importData } from "@/lib/db/storage";
import { trpc } from "@/lib/trpc";
import { clearToken, saveStayLoggedIn } from "@/lib/auth-storage";
import { fullSync, getLastSyncTime } from "@/lib/sync-manager";
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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.7 : 1,
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

function normalizeTime(hourText: string, minuteText: string): string | null {
  const h = Number(hourText);
  const m = Number(minuteText);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  const { setColorScheme } = useThemeContext();
  const exportQuery = trpc.export.exportAll.useQuery(undefined, { enabled: false });

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [storageUsed, setStorageUsed] = useState("0 B");

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportJson, setExportJson] = useState("");

  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeTarget, setTimeTarget] = useState<"task" | "journal">("task");
  const [hourInput, setHourInput] = useState("09");
  const [minuteInput, setMinuteInput] = useState("00");
  const [syncingNow, setSyncingNow] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoTranscribe, setAutoTranscribe] = useState(false);
  const [transcribeLanguage, setTranscribeLanguage] = useState<"ar" | "en">("en");

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

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
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
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
    getLastSyncTime().then(setLastSyncAt).catch(() => setLastSyncAt(null));
  }, []);

  const handleThemeChange = async (theme: ThemePreference) => {
    await persist({ theme });
    const effectiveScheme = theme === "auto" ? (systemScheme as "light" | "dark") : theme;
    setColorScheme(effectiveScheme);
  };

  const handleFontSizeChange = async (fontSize: FontSizePreference) => {
    await persist({ fontSize });
  };

  const openTimePicker = (target: "task" | "journal") => {
    const source = target === "task" ? settings.taskReminderTime : settings.journalReminderTime;
    const [h, m] = source.split(":");
    setHourInput(h);
    setMinuteInput(m);
    setTimeTarget(target);
    setShowTimeModal(true);
  };

  const saveTimePicker = async () => {
    const nextTime = normalizeTime(hourInput, minuteInput);
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
    Alert.alert("Logout", "Do you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await clearToken();
          await saveStayLoggedIn(false);
          queryClient.clear();
          router.replace("/(auth)/login");
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
          <Row icon="person" label="Username" value={settings.username} />
          <Row icon="email" label="Email" value={settings.email} />
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
                value={autoSyncEnabled}
                onValueChange={setAutoSyncEnabled}
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
                value={autoTranscribe}
                onValueChange={setAutoTranscribe}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
          />
          <Row icon="language" label="Language" value={transcribeLanguage === "ar" ? "Arabic" : "English"} />
          <View className="px-4 pb-3 pt-1 flex-row gap-2">
            {(["en", "ar"] as const).map((lang) => (
              <Pressable
                key={lang}
                onPress={() => setTranscribeLanguage(lang)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: transcribeLanguage === lang ? colors.primary : colors.background,
                }}
              >
                <Text style={{ color: transcribeLanguage === lang ? "white" : colors.foreground, fontWeight: "600" }}>
                  {lang === "ar" ? "Arabic" : "English"}
                </Text>
              </Pressable>
            ))}
          </View>
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
            onPress={() => Linking.openURL(PRIVACY_URL)}
          />
          <Row
            icon="gavel"
            label="Terms of Service"
            onPress={() => Linking.openURL(TERMS_URL)}
          />
          <Row
            icon="delete-sweep"
            label="Data Deletion"
            onPress={() => Linking.openURL(DATA_DELETION_URL)}
          />
          <Row
            icon="support-agent"
            label="Support"
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
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
            <Text className="text-lg font-bold text-foreground mb-3">Select Time (HH:mm)</Text>
            <View className="flex-row gap-3 mb-4">
              <TextInput
                value={hourInput}
                onChangeText={setHourInput}
                keyboardType="numeric"
                maxLength={2}
                placeholder="HH"
                placeholderTextColor={colors.muted}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  backgroundColor: colors.background,
                  color: colors.foreground,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              />
              <TextInput
                value={minuteInput}
                onChangeText={setMinuteInput}
                keyboardType="numeric"
                maxLength={2}
                placeholder="mm"
                placeholderTextColor={colors.muted}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  backgroundColor: colors.background,
                  color: colors.foreground,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              />
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
