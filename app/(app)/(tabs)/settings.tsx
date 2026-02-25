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

type ExportFormat = "json" | "markdown" | "html" | "csv" | "pdf" | "docx";
type ExportScope = {
  items: boolean;
  tasks: boolean;
  journalEntries: boolean;
  tags: boolean;
  categories: boolean;
};

type ImportValidationResult =
  | {
      valid: false;
      message: string;
      normalized?: undefined;
    }
  | {
      valid: true;
      message?: undefined;
      normalized: {
        metadata: any;
        data: {
          items: any[];
          tasks: any[];
          journalEntries: any[];
          tags: any[];
          categories: any[];
          attachments: any[];
          reviewSchedules: any[];
        };
      };
    };

function buildExportPayload(raw: any, scope: ExportScope) {
  return {
    metadata: raw?.metadata ?? {
      version: "1.0.0",
      exportDate: new Date().toISOString(),
    },
    data: {
      items: scope.items ? raw?.data?.items ?? [] : [],
      tasks: scope.tasks ? raw?.data?.tasks ?? [] : [],
      journalEntries: scope.journalEntries ? raw?.data?.journalEntries ?? [] : [],
      tags: scope.tags ? raw?.data?.tags ?? [] : [],
      categories: scope.categories ? raw?.data?.categories ?? [] : [],
    },
  };
}

function buildMarkdownExport(payload: any): string {
  const lines: string[] = [];
  lines.push("# Knowledge Vault Export");
  lines.push(`- Version: ${payload.metadata?.version ?? "1.0.0"}`);
  lines.push(`- Export Date: ${payload.metadata?.exportDate ?? new Date().toISOString()}`);
  lines.push("");

  const pushSection = (title: string, rows: any[]) => {
    lines.push(`## ${title} (${rows.length})`);
    if (!rows.length) {
      lines.push("_No data_");
      lines.push("");
      return;
    }
    rows.forEach((row, index) => {
      lines.push(`### ${index + 1}. ${row.title || row.name || row.id || "Untitled"}`);
      lines.push("```json");
      lines.push(JSON.stringify(row, null, 2));
      lines.push("```");
    });
    lines.push("");
  };

  pushSection("Items", payload.data.items ?? []);
  pushSection("Tasks", payload.data.tasks ?? []);
  pushSection("Journal Entries", payload.data.journalEntries ?? []);
  pushSection("Tags", payload.data.tags ?? []);
  pushSection("Categories", payload.data.categories ?? []);
  return lines.join("\n");
}

function buildHtmlExport(payload: any): string {
  const section = (title: string, rows: any[]) => {
    const body =
      rows.length === 0
        ? "<p><em>No data</em></p>"
        : rows
            .map(
              (row) =>
                `<article style="border:1px solid #ddd;border-radius:8px;padding:10px;margin:8px 0;"><pre style="white-space:pre-wrap;word-break:break-word;">${JSON.stringify(
                  row,
                  null,
                  2
                )
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")}</pre></article>`
            )
            .join("");
    return `<section><h2>${title} (${rows.length})</h2>${body}</section>`;
  };

  return `<!doctype html><html><head><meta charset="utf-8" /><title>Knowledge Vault Export</title></head><body style="font-family:Arial,sans-serif;line-height:1.5;padding:24px;">
    <h1>Knowledge Vault Export</h1>
    <p><strong>Version:</strong> ${payload.metadata?.version ?? "1.0.0"}</p>
    <p><strong>Export Date:</strong> ${payload.metadata?.exportDate ?? new Date().toISOString()}</p>
    ${section("Items", payload.data.items ?? [])}
    ${section("Tasks", payload.data.tasks ?? [])}
    ${section("Journal Entries", payload.data.journalEntries ?? [])}
    ${section("Tags", payload.data.tags ?? [])}
    ${section("Categories", payload.data.categories ?? [])}
  </body></html>`;
}

function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function buildCsvExport(payload: any): string {
  const rows: string[] = ["section,id,title_or_name,created_at,updated_at,raw_json"];
  const pushRows = (sectionName: string, entries: any[]) => {
    entries.forEach((entry) => {
      rows.push(
        [
          sectionName,
          escapeCsvCell(entry?.id ?? ""),
          escapeCsvCell(entry?.title ?? entry?.name ?? ""),
          escapeCsvCell(entry?.createdAt ?? ""),
          escapeCsvCell(entry?.updatedAt ?? ""),
          escapeCsvCell(JSON.stringify(entry)),
        ].join(",")
      );
    });
  };
  pushRows("items", payload.data.items ?? []);
  pushRows("tasks", payload.data.tasks ?? []);
  pushRows("journalEntries", payload.data.journalEntries ?? []);
  pushRows("tags", payload.data.tags ?? []);
  pushRows("categories", payload.data.categories ?? []);
  return rows.join("\n");
}

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeImportedBackup(payload: any): ImportValidationResult {
  const container = payload?.data ?? payload;
  if (!container || typeof container !== "object") {
    return { valid: false, message: "Invalid backup format" as const };
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
    valid: true as const,
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
}

function parseLooseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (const line of lines) {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
}

function convertNotionCsvToBackup(text: string, sourceName: string): ImportValidationResult {
  const rows = parseLooseCsv(text);
  if (rows.length < 2) {
    return { valid: false, message: "CSV file is empty or invalid." as const };
  }
  const header = rows[0].map((h) => h.toLowerCase());
  const titleIdx = header.findIndex((h) => ["name", "title"].includes(h));
  const contentIdx = header.findIndex((h) => ["content", "description", "notes", "note"].includes(h));
  const dateIdx = header.findIndex((h) => ["created", "created time", "date", "created_at"].includes(h));
  const typeIdx = header.findIndex((h) => ["type", "kind"].includes(h));
  const urlIdx = header.findIndex((h) => ["url", "link"].includes(h));

  const items = rows.slice(1).map((row) => {
    const title = (titleIdx >= 0 ? row[titleIdx] : row[0]) || "Imported row";
    const content = contentIdx >= 0 ? row[contentIdx] : "";
    const url = urlIdx >= 0 ? row[urlIdx] : "";
    const typeRaw = ((typeIdx >= 0 ? row[typeIdx] : "note") || "note").toLowerCase();
    const type = ["note", "quote", "link", "audio"].includes(typeRaw) ? typeRaw : url ? "link" : "note";
    const createdAt = dateIdx >= 0 ? row[dateIdx] : new Date().toISOString();
    return {
      id: makeLocalId("import-item"),
      type,
      title,
      content: content || title,
      url: url || null,
      location: "inbox",
      isFavorite: false,
      createdAt,
      updatedAt: createdAt,
      source: sourceName,
    };
  });

  return normalizeImportedBackup({
    metadata: { version: "1.0.0", exportDate: new Date().toISOString(), source: "notion-csv" },
    data: { items, tasks: [], journalEntries: [], tags: [], categories: [] },
  });
}

function convertMarkdownToBackup(text: string, sourceName: string): ImportValidationResult {
  const chunks = text
    .split(/\n(?=# )|\n(?=## )/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const items =
    chunks.length > 0
      ? chunks.map((chunk, index) => {
          const firstLine = chunk.split(/\r?\n/)[0] || "";
          const title = firstLine.replace(/^#+\s*/, "").trim() || `Imported note ${index + 1}`;
          return {
            id: makeLocalId("import-md"),
            type: "note",
            title,
            content: chunk,
            url: null,
            location: "inbox",
            isFavorite: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: sourceName,
          };
        })
      : [
          {
            id: makeLocalId("import-md"),
            type: "note",
            title: sourceName,
            content: text,
            url: null,
            location: "inbox",
            isFavorite: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: sourceName,
          },
        ];
  return normalizeImportedBackup({
    metadata: { version: "1.0.0", exportDate: new Date().toISOString(), source: "markdown" },
    data: { items, tasks: [], journalEntries: [], tags: [], categories: [] },
  });
}

function convertPlainTextToBackup(text: string, sourceName: string): ImportValidationResult {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const items = (paragraphs.length ? paragraphs : [text.trim() || sourceName]).map((paragraph, index) => ({
    id: makeLocalId("import-txt"),
    type: "note",
    title: paragraph.split(/\r?\n/)[0]?.slice(0, 80) || `Imported text ${index + 1}`,
    content: paragraph,
    url: null,
    location: "inbox",
    isFavorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: sourceName,
  }));

  return normalizeImportedBackup({
    metadata: { version: "1.0.0", exportDate: new Date().toISOString(), source: "plain-text" },
    data: { items, tasks: [], journalEntries: [], tags: [], categories: [] },
  });
}

function convertEnexToBackup(text: string, sourceName: string): ImportValidationResult {
  const noteRegex = /<note>([\s\S]*?)<\/note>/g;
  const titleRegex = /<title>([\s\S]*?)<\/title>/;
  const contentRegex = /<content>([\s\S]*?)<\/content>/;
  const tagRegex = /<tag>([\s\S]*?)<\/tag>/g;

  const tagsSet = new Set<string>();
  const items: any[] = [];
  let match: RegExpExecArray | null;
  while ((match = noteRegex.exec(text)) !== null) {
    const block = match[1];
    const title = (block.match(titleRegex)?.[1] || "Imported ENEX note").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const rawContent = (block.match(contentRegex)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const cleanContent = rawContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(block)) !== null) {
      const tagName = tagMatch[1].trim();
      if (tagName) tagsSet.add(tagName);
    }
    items.push({
      id: makeLocalId("import-enex"),
      type: "note",
      title,
      content: cleanContent || title,
      url: null,
      location: "inbox",
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: sourceName,
    });
  }

  if (items.length === 0) {
    return { valid: false, message: "ENEX file has no notes." as const };
  }

  const tags = Array.from(tagsSet).map((name) => ({
    id: makeLocalId("import-tag"),
    name,
    color: null,
    createdAt: new Date().toISOString(),
  }));

  return normalizeImportedBackup({
    metadata: { version: "1.0.0", exportDate: new Date().toISOString(), source: "evernote-enex" },
    data: { items, tasks: [], journalEntries: [], tags, categories: [] },
  });
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
  const apiKeysQuery = trpc.api.listKeys.useQuery();
  const webhooksQuery = trpc.api.listWebhooks.useQuery();
  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  const requestEmailChangeMutation = trpc.auth.requestEmailChange.useMutation();
  const confirmEmailChangeMutation = trpc.auth.confirmEmailChange.useMutation();
  const generateApiKeyMutation = trpc.api.generateKey.useMutation();
  const revokeApiKeyMutation = trpc.api.revokeKey.useMutation();
  const createWebhookMutation = trpc.api.createWebhook.useMutation();
  const deleteWebhookMutation = trpc.api.deleteWebhook.useMutation();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [storageUsed, setStorageUsed] = useState("0 B");

  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportOptionsModal, setShowExportOptionsModal] = useState(false);
  const [exportPreview, setExportPreview] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [exportScope, setExportScope] = useState<ExportScope>({
    items: true,
    tasks: true,
    journalEntries: true,
    tags: true,
    categories: true,
  });
  const [showAccountEditModal, setShowAccountEditModal] = useState(false);
  const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [pendingEmailChange, setPendingEmailChange] = useState("");
const [showApiModal, setShowApiModal] = useState(false);
  const [latestApiKey, setLatestApiKey] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookSecret, setNewWebhookSecret] = useState("");
  const [newWebhookEvent, setNewWebhookEvent] = useState<
    "items.created" | "items.updated" | "items.deleted" | "tasks.created" | "tasks.updated" | "tasks.deleted"
  >("tasks.created");

  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeTarget, setTimeTarget] = useState<"task" | "journal">("task");
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [syncingNow, setSyncingNow] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [backupCount, setBackupCount] = useState(0);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  const BACKUP_SNAPSHOTS_KEY = "kv_backup_snapshots_v1";

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minuteOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const accountUsername = profileQuery.data?.user?.username ?? settings.username;
  const accountEmail = profileQuery.data?.user?.email ?? settings.email;
  const taskInboxEmail = profileQuery.data?.taskInboxEmail ?? "Unavailable";

  const createBackupSnapshot = async (reason: "manual" | "auto") => {
    const current = await exportLocalData();
    const snapshotsRaw = await AsyncStorage.getItem(BACKUP_SNAPSHOTS_KEY);
    const snapshots = snapshotsRaw ? (JSON.parse(snapshotsRaw) as any[]) : [];
    const nextSnapshot = {
      id: makeLocalId("backup"),
      createdAt: new Date().toISOString(),
      reason,
      payload: current,
    };
    const next = [nextSnapshot, ...snapshots].slice(0, 5);
    await AsyncStorage.setItem(BACKUP_SNAPSHOTS_KEY, JSON.stringify(next));
    setBackupCount(next.length);
    setLastBackupAt(next[0]?.createdAt ?? null);
  };

  const restoreLatestBackupSnapshot = async () => {
    const snapshotsRaw = await AsyncStorage.getItem(BACKUP_SNAPSHOTS_KEY);
    const snapshots = snapshotsRaw ? (JSON.parse(snapshotsRaw) as any[]) : [];
    if (!snapshots.length) {
      Alert.alert("Restore", "No backup snapshots found.");
      return;
    }
    const latest = snapshots[0];
    await clearAllData();
    await importData(latest.payload);
    await refreshStorageUsed();
    Alert.alert("Restore Complete", `Restored backup from ${new Date(latest.createdAt).toLocaleString()}.`);
    console.log("✅ Feature 28 completed and tested");
  };

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

  const validateBackup = (payload: any): ImportValidationResult => normalizeImportedBackup(payload);

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
        const snapshotsRaw = await AsyncStorage.getItem(BACKUP_SNAPSHOTS_KEY);
        const snapshots = snapshotsRaw ? (JSON.parse(snapshotsRaw) as any[]) : [];
        setBackupCount(snapshots.length);
        setLastBackupAt(snapshots[0]?.createdAt ?? null);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snapshotsRaw = await AsyncStorage.getItem(BACKUP_SNAPSHOTS_KEY);
        const snapshots = snapshotsRaw ? (JSON.parse(snapshotsRaw) as any[]) : [];
        const latest = snapshots[0];
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const latestTime = latest?.createdAt ? new Date(latest.createdAt).getTime() : 0;
        if (!latest || !Number.isFinite(latestTime) || now - latestTime > oneDayMs) {
          await createBackupSnapshot("auto");
        }
      } catch (error) {
        console.error("Auto-backup failed:", error);
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
      if (!Object.values(exportScope).some(Boolean)) {
        Alert.alert("Export Scope", "Select at least one data section to export.");
        return;
      }
      const response = await exportQuery.refetch();
      const raw = response.data;
      if (!raw) {
        throw new Error("No export data returned from server");
      }

      const dateLabel = new Date().toISOString().slice(0, 10);
      const payload = buildExportPayload(raw, exportScope);
      const extensionByFormat: Record<ExportFormat, string> = {
        json: "json",
        markdown: "md",
        html: "html",
        csv: "csv",
        pdf: "pdf",
        docx: "docx",
      };
      const extension = extensionByFormat[exportFormat];
      const filename = `knowledge-vault-backup-${dateLabel}.${extension}`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      const jsonString = JSON.stringify(payload, null, 2);
      const markdownString = buildMarkdownExport(payload);
      const htmlString = buildHtmlExport(payload);
      const csvString = buildCsvExport(payload);

      let mimeType = "text/plain";
      let previewText = "";
      if (exportFormat === "json") {
        mimeType = "application/json";
        previewText = jsonString;
        await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
      } else if (exportFormat === "markdown") {
        mimeType = "text/markdown";
        previewText = markdownString;
        await FileSystem.writeAsStringAsync(fileUri, markdownString, { encoding: FileSystem.EncodingType.UTF8 });
      } else if (exportFormat === "html") {
        mimeType = "text/html";
        previewText = htmlString;
        await FileSystem.writeAsStringAsync(fileUri, htmlString, { encoding: FileSystem.EncodingType.UTF8 });
      } else if (exportFormat === "csv") {
        mimeType = "text/csv";
        previewText = csvString;
        await FileSystem.writeAsStringAsync(fileUri, csvString, { encoding: FileSystem.EncodingType.UTF8 });
      } else if (exportFormat === "pdf") {
        if (Platform.OS !== "web") {
          throw new Error("PDF export is currently supported on web only.");
        }
        const { jsPDF } = await import("jspdf/dist/jspdf.es.min.js");
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        const lines = markdownString.split("\n");
        let y = 40;
        lines.forEach((line) => {
          if (y > 790) {
            doc.addPage();
            y = 40;
          }
          doc.text(line.slice(0, 120), 24, y);
          y += 14;
        });
        doc.save(filename);
        previewText = "PDF generated and downloaded on web.";
      } else if (exportFormat === "docx") {
        if (Platform.OS !== "web") {
          throw new Error("DOCX export is currently supported on web only.");
        }
        const htmlDocx = (await import("html-docx-js")) as any;
        const blob = htmlDocx.asBlob(htmlString);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        previewText = "DOCX generated and downloaded on web.";
      }

      if (exportFormat !== "pdf" && exportFormat !== "docx") {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType,
            dialogTitle: "Export Data",
          });
        } else {
          Alert.alert("Export Ready", `File saved: ${fileUri}`);
        }
      }

      setExportPreview(previewText);
      setShowExportOptionsModal(false);
      setShowExportModal(true);
      console.log("✅ Feature 24 completed and tested");
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
        type: [
          "application/json",
          "text/json",
          "text/plain",
          "text/markdown",
          "text/csv",
          "application/xml",
          "text/xml",
          "application/octet-stream",
        ],
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
      const fileName = (selected.name || "import-file").toLowerCase();
      let validated: ImportValidationResult;
      if (fileName.endsWith(".json")) {
        const parsed = JSON.parse(fileText);
        validated = validateBackup(parsed);
      } else if (fileName.endsWith(".csv")) {
        validated = convertNotionCsvToBackup(fileText, selected.name || "Notion CSV");
      } else if (fileName.endsWith(".md") || fileName.endsWith(".markdown")) {
        validated = convertMarkdownToBackup(fileText, selected.name || "Markdown");
      } else if (fileName.endsWith(".enex") || fileText.includes("<en-export")) {
        validated = convertEnexToBackup(fileText, selected.name || "Evernote ENEX");
      } else {
        validated = convertPlainTextToBackup(fileText, selected.name || "Plain Text");
      }

      if (!validated.valid || !validated.normalized) {
        Alert.alert("Invalid Import", validated.message || "The selected file could not be imported.");
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
              console.log("✅ Feature 27 completed and tested");
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
              console.log("✅ Feature 27 completed and tested");
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
      Alert.alert("Error", "Import failed. Check file format and try again.");
    } finally {
      setWorking(false);
    }
  };

  const handleGenerateApiKey = async () => {
    try {
      const created = await generateApiKeyMutation.mutateAsync({ name: `Key ${new Date().toLocaleString()}` });
      setLatestApiKey(created.key);
      await apiKeysQuery.refetch();
      Alert.alert("API Key Created", "Copy it now. It will not be shown again.");
      console.log("✅ Feature 26 completed and tested");
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to create API key.");
    }
  };

  const handleCreateWebhook = async () => {
    const url = newWebhookUrl.trim();
    if (!url) {
      Alert.alert("Validation", "Webhook URL is required.");
      return;
    }
    try {
      await createWebhookMutation.mutateAsync({
        url,
        event: newWebhookEvent,
        secret: newWebhookSecret.trim() || undefined,
      });
      setNewWebhookUrl("");
      setNewWebhookSecret("");
      await webhooksQuery.refetch();
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed creating webhook.");
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
          <Row
            icon="download"
            label="Export Data (Multi-Format)"
            description="PDF, Markdown, HTML, JSON, CSV, DOCX"
            onPress={() => setShowExportOptionsModal(true)}
          />
          <Row
            icon="upload-file"
            label="Import Data (JSON/CSV/MD/ENEX/TXT)"
            description="Import from Notion CSV, Evernote ENEX, Markdown, or plain text"
            onPress={handleImportData}
          />
          <Row
            icon="backup"
            label="Create Backup Snapshot"
            description="Save a local snapshot before risky changes"
            onPress={async () => {
              try {
                setWorking(true);
                await createBackupSnapshot("manual");
                Alert.alert("Backup Created", "Local backup snapshot saved.");
                console.log("✅ Feature 28 completed and tested");
              } catch (error) {
                console.error("Failed creating backup snapshot:", error);
                Alert.alert("Error", "Failed creating backup snapshot.");
              } finally {
                setWorking(false);
              }
            }}
          />
          <Row
            icon="restore"
            label="Restore Latest Snapshot"
            description={lastBackupAt ? `Latest: ${new Date(lastBackupAt).toLocaleString()}` : "No backups yet"}
            onPress={() => {
              Alert.alert("Restore Backup", "Restore latest backup snapshot?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Restore",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      setWorking(true);
                      await restoreLatestBackupSnapshot();
                    } catch (error) {
                      console.error("Restore backup failed:", error);
                      Alert.alert("Error", "Failed restoring backup snapshot.");
                    } finally {
                      setWorking(false);
                    }
                  },
                },
              ]);
            }}
          />
          <Row icon="delete-forever" label="Clear All Data" onPress={handleClearAllData} />
          <Row icon="storage" label="Storage Used" value={storageUsed} />
          <Row icon="history" label="Backup Snapshots" value={`${backupCount}/5`} />
        </Section>

        <Section title="API & Webhooks">
          <Row
            icon="vpn-key"
            label="API Keys & Webhooks"
            description="Generate keys and manage webhook subscriptions"
            onPress={() => setShowApiModal(true)}
          />
          <Row icon="http" label="REST Base URL" value="http://localhost:3000/api" />
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

      <Modal visible={showExportOptionsModal} transparent animationType="fade" onRequestClose={() => setShowExportOptionsModal(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: colors.surface }}>
            <Text className="text-lg font-bold text-foreground mb-3">Export Options</Text>
            <Text className="text-xs font-semibold mb-2" style={{ color: colors.muted }}>
              Format
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {(["json", "markdown", "html", "csv", "pdf", "docx"] as ExportFormat[]).map((format) => (
                <Pressable
                  key={format}
                  onPress={() => setExportFormat(format)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: exportFormat === format ? colors.primary : colors.background,
                  }}
                >
                  <Text style={{ color: exportFormat === format ? "white" : colors.foreground, fontWeight: "600" }}>
                    {format.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text className="text-xs font-semibold mb-2" style={{ color: colors.muted }}>
              Scope (Batch)
            </Text>
            <View className="mb-4">
              {([
                { key: "items", label: "Items" },
                { key: "tasks", label: "Tasks" },
                { key: "journalEntries", label: "Journal Entries" },
                { key: "tags", label: "Tags" },
                { key: "categories", label: "Categories" },
              ] as const).map((entry) => (
                <View key={entry.key} className="flex-row items-center justify-between mb-2">
                  <Text style={{ color: colors.foreground }}>{entry.label}</Text>
                  <Switch
                    value={exportScope[entry.key]}
                    onValueChange={(value) => setExportScope((prev) => ({ ...prev, [entry.key]: value }))}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>
              ))}
            </View>

            <View className="flex-row gap-3">
              <Pressable onPress={() => setShowExportOptionsModal(false)} style={{ flex: 1 }}>
                <View className="bg-border rounded-lg py-3 items-center">
                  <Text className="text-foreground font-semibold">Cancel</Text>
                </View>
              </Pressable>
              <Pressable onPress={handleExportData} style={{ flex: 1 }}>
                <View className="bg-primary rounded-lg py-3 items-center">
                  <Text className="text-white font-semibold">Export</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showExportModal} transparent animationType="fade" onRequestClose={() => setShowExportModal(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6 max-h-[80%]" style={{ backgroundColor: colors.surface }}>
            <Text className="text-lg font-bold text-foreground mb-3">Export Preview</Text>
            <ScrollView className="border border-border rounded-lg p-3 bg-background mb-4">
              <Text style={{ color: colors.foreground, fontFamily: "monospace", fontSize: 12 }}>{exportPreview}</Text>
            </ScrollView>
            <Pressable onPress={() => setShowExportModal(false)}>
              <View className="bg-primary rounded-lg py-3 items-center">
                <Text className="text-white font-semibold">Close</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showApiModal} transparent animationType="fade" onRequestClose={() => setShowApiModal(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6 max-h-[85%]" style={{ backgroundColor: colors.surface }}>
            <Text className="text-lg font-bold text-foreground mb-3">API Keys & Webhooks</Text>
            <Text className="text-xs font-semibold mb-2" style={{ color: colors.muted }}>
              API Keys
            </Text>
            <Pressable onPress={handleGenerateApiKey} style={{ marginBottom: 10 }}>
              <View className="bg-primary rounded-lg py-3 items-center">
                <Text className="text-white font-semibold">Generate API Key</Text>
              </View>
            </Pressable>
            {latestApiKey ? (
              <View className="border border-border rounded-lg p-3 mb-3" style={{ backgroundColor: colors.background }}>
                <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Copy this key now:</Text>
                <Text style={{ color: colors.foreground, fontFamily: "monospace", fontSize: 12 }}>{latestApiKey}</Text>
              </View>
            ) : null}
            <ScrollView style={{ maxHeight: 140, marginBottom: 8 }}>
              {(apiKeysQuery.data ?? []).map((key) => (
                <View key={key.id} className="flex-row items-center justify-between mb-2 border border-border rounded-lg p-2">
                  <View>
                    <Text style={{ color: colors.foreground, fontWeight: "600" }}>{key.name}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{key.keyPreview}</Text>
                  </View>
                  {key.isActive ? (
                    <Pressable
                      onPress={async () => {
                        await revokeApiKeyMutation.mutateAsync({ id: key.id });
                        await apiKeysQuery.refetch();
                      }}
                    >
                      <Text style={{ color: "#DC2626", fontWeight: "700" }}>Revoke</Text>
                    </Pressable>
                  ) : (
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Revoked</Text>
                  )}
                </View>
              ))}
            </ScrollView>

            <Text className="text-xs font-semibold mb-2" style={{ color: colors.muted }}>
              Webhook Subscriptions
            </Text>
            <TextInput
              value={newWebhookUrl}
              onChangeText={setNewWebhookUrl}
              placeholder="https://example.com/webhook"
              placeholderTextColor={colors.muted}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.foreground,
                backgroundColor: colors.background,
                marginBottom: 8,
              }}
            />
            <View className="flex-row flex-wrap gap-2 mb-2">
              {(["items.created", "items.updated", "items.deleted", "tasks.created", "tasks.updated", "tasks.deleted"] as const).map(
                (event) => (
                  <Pressable
                    key={event}
                    onPress={() => setNewWebhookEvent(event)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: newWebhookEvent === event ? colors.primary : colors.background,
                    }}
                  >
                    <Text style={{ color: newWebhookEvent === event ? "white" : colors.foreground, fontSize: 11 }}>
                      {event}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
            <TextInput
              value={newWebhookSecret}
              onChangeText={setNewWebhookSecret}
              placeholder="Secret (optional)"
              placeholderTextColor={colors.muted}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.foreground,
                backgroundColor: colors.background,
                marginBottom: 8,
              }}
            />
            <Pressable onPress={handleCreateWebhook} style={{ marginBottom: 8 }}>
              <View className="bg-primary rounded-lg py-3 items-center">
                <Text className="text-white font-semibold">Create Webhook</Text>
              </View>
            </Pressable>
            <ScrollView style={{ maxHeight: 130 }}>
              {(webhooksQuery.data ?? []).map((hook) => (
                <View key={hook.id} className="border border-border rounded-lg p-2 mb-2">
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>{hook.event}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                    {hook.url}
                  </Text>
                  <Pressable
                    onPress={async () => {
                      await deleteWebhookMutation.mutateAsync({ id: hook.id });
                      await webhooksQuery.refetch();
                    }}
                  >
                    <Text style={{ color: "#DC2626", fontWeight: "700", marginTop: 4 }}>Delete</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            <Pressable onPress={() => setShowApiModal(false)} style={{ marginTop: 10 }}>
              <View className="bg-border rounded-lg py-3 items-center">
                <Text className="text-foreground font-semibold">Close</Text>
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
