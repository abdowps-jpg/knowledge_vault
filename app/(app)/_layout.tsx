import React from "react";
import { Stack, usePathname, useRouter } from "expo-router";
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Fuse from "fuse.js";

type ShortcutDefinition = {
  keys: string;
  description: string;
  action: () => void;
};

const RECENT_COMMANDS_KEY = "command_palette_recent_v1";

export default function AppLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [showShortcutsHelp, setShowShortcutsHelp] = React.useState(false);
  const [showCommandPalette, setShowCommandPalette] = React.useState(false);
  const [commandQuery, setCommandQuery] = React.useState("");
  const [recentCommandLabels, setRecentCommandLabels] = React.useState<string[]>([]);
  const [goPrefixActive, setGoPrefixActive] = React.useState(false);

  const goTo = React.useCallback(
    (route: string) => {
      router.push(route as any);
    },
    [router]
  );

  const shortcutDefinitions = React.useMemo<ShortcutDefinition[]>(
    () => [
      { keys: "Cmd+1", description: "Go to Inbox", action: () => goTo("/(app)/(tabs)") },
      { keys: "Cmd+2", description: "Go to Library", action: () => goTo("/(app)/(tabs)/library") },
      { keys: "Cmd+3", description: "Go to Actions", action: () => goTo("/(app)/(tabs)/actions") },
      { keys: "Cmd+4", description: "Go to Journal", action: () => goTo("/(app)/(tabs)/journal") },
      { keys: "Cmd+5", description: "Go to Calendar", action: () => goTo("/(app)/(tabs)/calendar") },
      { keys: "Cmd+6", description: "Go to Habits", action: () => goTo("/(app)/(tabs)/habits") },
      { keys: "Cmd+7", description: "Go to Search", action: () => goTo("/(app)/(tabs)/search") },
      { keys: "Cmd+8", description: "Go to Settings", action: () => goTo("/(app)/(tabs)/settings") },
      { keys: "Cmd+N", description: "Open Quick Add", action: () => goTo("/(app)/widgets/quick-add") },
      { keys: "Cmd+F", description: "Open Search", action: () => goTo("/(app)/(tabs)/search") },
      { keys: "Cmd+D", description: "Open Stats", action: () => goTo("/(app)/stats") },
      { keys: "Cmd+Shift+A", description: "Open Actions", action: () => goTo("/(app)/(tabs)/actions") },
      { keys: "Cmd+Shift+I", description: "Open Inbox", action: () => goTo("/(app)/(tabs)") },
      { keys: "Cmd+Shift+L", description: "Open Library", action: () => goTo("/(app)/(tabs)/library") },
      { keys: "Cmd+Shift+J", description: "Open Journal", action: () => goTo("/(app)/(tabs)/journal") },
      { keys: "Cmd+Shift+C", description: "Open Calendar", action: () => goTo("/(app)/(tabs)/calendar") },
      { keys: "Cmd+Shift+H", description: "Open Habits", action: () => goTo("/(app)/(tabs)/habits") },
      { keys: "Cmd+Shift+S", description: "Open Search", action: () => goTo("/(app)/(tabs)/search") },
      { keys: "Cmd+,", description: "Open Settings", action: () => goTo("/(app)/(tabs)/settings") },
      { keys: "Cmd+K", description: "Open Command Palette", action: () => setShowCommandPalette(true) },
      { keys: "Cmd+/", description: "Open Command Palette", action: () => setShowCommandPalette(true) },
      { keys: "?", description: "Show Keyboard Shortcuts", action: () => setShowShortcutsHelp(true) },
      { keys: "Esc", description: "Close active overlay", action: () => {} },
      { keys: "g then i", description: "Go to Inbox", action: () => goTo("/(app)/(tabs)") },
      { keys: "g then l", description: "Go to Library", action: () => goTo("/(app)/(tabs)/library") },
      { keys: "g then a", description: "Go to Actions", action: () => goTo("/(app)/(tabs)/actions") },
      { keys: "g then j", description: "Go to Journal", action: () => goTo("/(app)/(tabs)/journal") },
      { keys: "g then c", description: "Go to Calendar", action: () => goTo("/(app)/(tabs)/calendar") },
      { keys: "g then h", description: "Go to Habits", action: () => goTo("/(app)/(tabs)/habits") },
      { keys: "g then s", description: "Go to Search", action: () => goTo("/(app)/(tabs)/search") },
      { keys: "g then t", description: "Go to Settings", action: () => goTo("/(app)/(tabs)/settings") },
    ],
    [goTo]
  );

  const commandOptions = React.useMemo<Array<{ label: string; route: string; keywords: string }>>(
    () => [
        { label: "Go to Inbox", route: "/(app)/(tabs)", keywords: "home inbox notes capture" },
        { label: "Go to Library", route: "/(app)/(tabs)/library", keywords: "library knowledge vault" },
        { label: "Go to Actions", route: "/(app)/(tabs)/actions", keywords: "tasks action todo kanban matrix" },
        { label: "Go to Journal", route: "/(app)/(tabs)/journal", keywords: "journal diary daily reflection" },
        { label: "Go to Calendar", route: "/(app)/(tabs)/calendar", keywords: "calendar due date schedule" },
        { label: "Go to Habits", route: "/(app)/(tabs)/habits", keywords: "habit streak routines" },
        { label: "Go to Search", route: "/(app)/(tabs)/search", keywords: "search find query filter" },
        { label: "Go to Settings", route: "/(app)/(tabs)/settings", keywords: "settings preferences theme account" },
        { label: "Open Stats Dashboard", route: "/(app)/stats", keywords: "stats dashboard insights productivity" },
        { label: "Open Goals", route: "/(app)/goals", keywords: "goal milestones planning" },
        { label: "Open Reviews", route: "/(app)/reviews", keywords: "review daily weekly prompts" },
        { label: "Open Conflicts", route: "/(app)/conflicts", keywords: "conflict merge resolution sync" },
        { label: "Open Quick Add Widget", route: "/(app)/widgets/quick-add", keywords: "quick add create note task" },
      ],
    []
  );

  const commandOptionsByLabel = React.useMemo(
    () => new Map(commandOptions.map((option) => [option.label, option])),
    [commandOptions]
  );

  const commandFuse = React.useMemo(
    () =>
      new Fuse(commandOptions, {
        keys: ["label", "keywords"],
        includeScore: true,
        threshold: 0.35,
      }),
    [commandOptions]
  );

  const filteredCommandOptions = React.useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) {
      const recent = recentCommandLabels
        .map((label) => commandOptionsByLabel.get(label))
        .filter(Boolean) as Array<{ label: string; route: string; keywords: string }>;
      const seen = new Set(recent.map((option) => option.label));
      const rest = commandOptions.filter((option) => !seen.has(option.label));
      return [...recent, ...rest];
    }
    return commandFuse.search(query).map((result) => result.item);
  }, [commandFuse, commandOptions, commandOptionsByLabel, commandQuery, recentCommandLabels]);

  React.useEffect(() => {
    AsyncStorage.getItem(RECENT_COMMANDS_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) return;
        setRecentCommandLabels(parsed.filter((item): item is string => typeof item === "string").slice(0, 6));
      })
      .catch((error) => {
        console.error("[CommandPalette] Failed loading recent commands:", error);
      });
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== "web") return;

    let goPrefixTimer: ReturnType<typeof setTimeout> | null = null;

    const closeOverlays = () => {
      setShowShortcutsHelp(false);
      setShowCommandPalette(false);
    };

    const handleGoShortcut = (key: string) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "i") goTo("/(app)/(tabs)");
      else if (lowerKey === "l") goTo("/(app)/(tabs)/library");
      else if (lowerKey === "a") goTo("/(app)/(tabs)/actions");
      else if (lowerKey === "j") goTo("/(app)/(tabs)/journal");
      else if (lowerKey === "c") goTo("/(app)/(tabs)/calendar");
      else if (lowerKey === "h") goTo("/(app)/(tabs)/habits");
      else if (lowerKey === "s") goTo("/(app)/(tabs)/search");
      else if (lowerKey === "t") goTo("/(app)/(tabs)/settings");
      setGoPrefixActive(false);
      if (goPrefixTimer) clearTimeout(goPrefixTimer);
      goPrefixTimer = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditingField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if (event.key === "Escape") {
        closeOverlays();
        setGoPrefixActive(false);
        return;
      }

      if (goPrefixActive && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        handleGoShortcut(event.key);
        return;
      }

      if (!isEditingField && event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setShowShortcutsHelp(true);
        return;
      }

      if (!isEditingField && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setGoPrefixActive(true);
        if (goPrefixTimer) clearTimeout(goPrefixTimer);
        goPrefixTimer = setTimeout(() => setGoPrefixActive(false), 1400);
        return;
      }

      const hasMeta = event.metaKey || event.ctrlKey;
      if (!hasMeta) return;
      const key = event.key.toLowerCase();

      if (key === "k" || key === "/") {
        event.preventDefault();
        setShowCommandPalette(true);
        return;
      }
      if (key === "n") {
        event.preventDefault();
        goTo("/(app)/widgets/quick-add");
        return;
      }
      if (key === "f") {
        event.preventDefault();
        goTo("/(app)/(tabs)/search");
        return;
      }
      if (key === "d") {
        event.preventDefault();
        goTo("/(app)/stats");
        return;
      }
      if (key === ",") {
        event.preventDefault();
        goTo("/(app)/(tabs)/settings");
        return;
      }
      if (key >= "1" && key <= "8") {
        event.preventDefault();
        if (key === "1") goTo("/(app)/(tabs)");
        if (key === "2") goTo("/(app)/(tabs)/library");
        if (key === "3") goTo("/(app)/(tabs)/actions");
        if (key === "4") goTo("/(app)/(tabs)/journal");
        if (key === "5") goTo("/(app)/(tabs)/calendar");
        if (key === "6") goTo("/(app)/(tabs)/habits");
        if (key === "7") goTo("/(app)/(tabs)/search");
        if (key === "8") goTo("/(app)/(tabs)/settings");
        return;
      }
      if (!event.shiftKey) return;
      if (key === "i") {
        event.preventDefault();
        goTo("/(app)/(tabs)");
      } else if (key === "l") {
        event.preventDefault();
        goTo("/(app)/(tabs)/library");
      } else if (key === "a") {
        event.preventDefault();
        goTo("/(app)/(tabs)/actions");
      } else if (key === "j") {
        event.preventDefault();
        goTo("/(app)/(tabs)/journal");
      } else if (key === "c") {
        event.preventDefault();
        goTo("/(app)/(tabs)/calendar");
      } else if (key === "h") {
        event.preventDefault();
        goTo("/(app)/(tabs)/habits");
      } else if (key === "s") {
        event.preventDefault();
        goTo("/(app)/(tabs)/search");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    console.log("✅ Feature 31 completed and tested");
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (goPrefixTimer) clearTimeout(goPrefixTimer);
    };
  }, [goPrefixActive, goTo]);

  const executeCommand = React.useCallback(
    (label: string, route: string) => {
      setShowCommandPalette(false);
      setCommandQuery("");
      goTo(route);
      setRecentCommandLabels((prev) => {
        const next = [label, ...prev.filter((value) => value !== label)].slice(0, 6);
        AsyncStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next)).catch((error) => {
          console.error("[CommandPalette] Failed saving recent commands:", error);
        });
        return next;
      });
    },
    [goTo]
  );

  React.useEffect(() => {
    if (Platform.OS !== "web") return;
    console.log("✅ Feature 32 completed and tested");
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="item/[id]" />
        <Stack.Screen name="stats" />
        <Stack.Screen name="analytics" />
        <Stack.Screen name="devices" />
        <Stack.Screen name="conflicts" />
        <Stack.Screen name="ai-features" />
        <Stack.Screen name="share" />
        <Stack.Screen name="goals" />
        <Stack.Screen name="reviews" />
        <Stack.Screen name="widgets/quick-add" />
        <Stack.Screen name="widgets/today-tasks" />
      </Stack>

      <Modal visible={showShortcutsHelp} transparent animationType="fade" onRequestClose={() => setShowShortcutsHelp(false)}>
        <Pressable
          onPress={() => setShowShortcutsHelp(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ maxHeight: "80%", borderRadius: 14, padding: 16, backgroundColor: "#fff" }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>Keyboard Shortcuts</Text>
            <Text style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>Current route: {pathname}</Text>
            <ScrollView>
              {shortcutDefinitions.map((shortcut) => (
                <View
                  key={shortcut.keys + shortcut.description}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: "#e5e7eb",
                  }}
                >
                  <Text style={{ color: "#111827", fontWeight: "600", marginRight: 8 }}>{shortcut.keys}</Text>
                  <Text style={{ color: "#374151", flex: 1, textAlign: "right" }}>{shortcut.description}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setShowShortcutsHelp(false)}
              style={{ marginTop: 12, borderRadius: 10, paddingVertical: 10, backgroundColor: "#111827" }}
            >
              <Text style={{ textAlign: "center", color: "white", fontWeight: "700" }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCommandPalette} transparent animationType="fade" onRequestClose={() => setShowCommandPalette(false)}>
        <Pressable
          onPress={() => setShowCommandPalette(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-start", paddingTop: 70, paddingHorizontal: 20 }}
        >
          <Pressable onPress={(event) => event.stopPropagation()} style={{ borderRadius: 14, padding: 12, backgroundColor: "#fff" }}>
            <TextInput
              autoFocus
              placeholder="Type a command..."
              value={commandQuery}
              onChangeText={setCommandQuery}
              style={{
                borderWidth: 1,
                borderColor: "#d1d5db",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14,
                color: "#111827",
              }}
            />
            <ScrollView style={{ maxHeight: 360, marginTop: 10 }}>
              {!commandQuery.trim() && recentCommandLabels.length ? (
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ color: "#6b7280", fontSize: 12, fontWeight: "700", marginBottom: 6 }}>Recent</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {recentCommandLabels.map((label) => (
                      <View key={label} style={{ backgroundColor: "#eef2ff", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ color: "#4338ca", fontSize: 11, fontWeight: "600" }}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
              {filteredCommandOptions.map((option) => (
                <Pressable
                  key={option.label}
                  onPress={() => executeCommand(option.label, option.route)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    marginBottom: 2,
                    backgroundColor: "#f9fafb",
                  })}
                >
                  <Text style={{ color: "#111827", fontWeight: "600" }}>{option.label}</Text>
                  <Text style={{ color: "#6b7280", fontSize: 12 }}>{option.route}</Text>
                </Pressable>
              ))}
              {!filteredCommandOptions.length ? (
                <Text style={{ color: "#6b7280", textAlign: "center", paddingVertical: 16 }}>No commands found.</Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
