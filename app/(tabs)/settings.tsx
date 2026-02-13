import React, { useState, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  Pressable,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { NotificationService, DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/notifications/notification-service";
import { getAllItems } from "@/lib/db/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================================
// Settings Section Component
// ============================================================================

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  const colors = useColors();

  return (
    <View className="mb-6">
      <Text
        style={{ color: colors.muted }}
        className="text-xs font-semibold uppercase px-4 py-2"
      >
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

// ============================================================================
// Settings Item Component
// ============================================================================

interface SettingsItemProps {
  icon: string;
  label: string;
  description?: string;
  value?: React.ReactNode;
  onPress?: () => void;
  rightElement?: React.ReactNode;
}

function SettingsItem({
  icon,
  label,
  description,
  value,
  onPress,
  rightElement,
}: SettingsItemProps) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.7 : 1,
          backgroundColor: colors.surface,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
          flexDirection: "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
        },
      ]}
    >
      <View className="flex-row items-center gap-3 flex-1">
        <MaterialIcons name={icon as any} size={24} color={colors.primary} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">{label}</Text>
          {description && (
            <Text className="text-xs text-muted mt-1">{description}</Text>
          )}
        </View>
      </View>
      {rightElement || (
        value && (
          <Text className="text-sm text-muted">{value}</Text>
        )
      )}
    </Pressable>
  );
}

// ============================================================================
// Settings Screen
// ============================================================================

export default function SettingsScreen() {
  const colors = useColors();
  const notificationService = NotificationService.getInstance();

  // State
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    DEFAULT_NOTIFICATION_SETTINGS.enabled
  );
  const [taskReminders, setTaskReminders] = useState(
    DEFAULT_NOTIFICATION_SETTINGS.taskReminders
  );
  const [spacedRepetition, setSpacedRepetition] = useState(
    DEFAULT_NOTIFICATION_SETTINGS.spacedRepetition
  );
  const [soundEnabled, setSoundEnabled] = useState(
    DEFAULT_NOTIFICATION_SETTINGS.soundEnabled
  );
  const [vibrationEnabled, setVibrationEnabled] = useState(
    DEFAULT_NOTIFICATION_SETTINGS.vibrationEnabled
  );
  const [exporting, setExporting] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      const settings = notificationService.getSettings();
      setNotificationsEnabled(settings.enabled);
      setTaskReminders(settings.taskReminders);
      setSpacedRepetition(settings.spacedRepetition);
      setSoundEnabled(settings.soundEnabled);
      setVibrationEnabled(settings.vibrationEnabled);
    };
    loadSettings();
  }, []);

  // Handle notification toggle
  const handleNotificationsToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    await notificationService.saveSettings({ enabled: value });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Handle task reminders toggle
  const handleTaskRemindersToggle = async (value: boolean) => {
    setTaskReminders(value);
    await notificationService.saveSettings({ taskReminders: value });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Handle spaced repetition toggle
  const handleSpacedRepetitionToggle = async (value: boolean) => {
    setSpacedRepetition(value);
    await notificationService.saveSettings({ spacedRepetition: value });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Handle sound toggle
  const handleSoundToggle = async (value: boolean) => {
    setSoundEnabled(value);
    await notificationService.saveSettings({ soundEnabled: value });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Handle vibration toggle
  const handleVibrationToggle = async (value: boolean) => {
    setVibrationEnabled(value);
    await notificationService.saveSettings({ vibrationEnabled: value });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Export data
  const handleExportData = async () => {
    try {
      setExporting(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Collect all data
      const items = await getAllItems();

      const exportData = {
        exportDate: new Date().toISOString(),
        items,
        version: "1.0",
      };

      // Save to AsyncStorage as backup
      const backupKey = `backup_${Date.now()}`;
      await AsyncStorage.setItem(backupKey, JSON.stringify(exportData));

      Alert.alert("Success", "Data backup created successfully");
    } catch (error) {
      console.error("Error exporting data:", error);
      Alert.alert("Error", "Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  // Clear all data
  const handleClearAllData = () => {
    Alert.alert(
      "Clear All Data",
      "This will permanently delete all your items, tasks, and journal entries. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              // Clear all data from storage
              await AsyncStorage.clear();
              Alert.alert("Success", "All data has been cleared");
            } catch (error) {
              console.error("Error clearing data:", error);
              Alert.alert("Error", "Failed to clear data");
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      {/* Header */}
      <View className="px-4 py-4 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {/* Notifications Section */}
        <SettingsSection title="Notifications">
          <SettingsItem
            icon="notifications"
            label="Enable Notifications"
            description="Receive reminders and alerts"
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
          />

          {notificationsEnabled && (
            <>
              <SettingsItem
                icon="alarm"
                label="Task Reminders"
                description="Get notified before tasks are due"
                rightElement={
                  <Switch
                    value={taskReminders}
                    onValueChange={handleTaskRemindersToggle}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                }
              />

              <SettingsItem
                icon="repeat"
                label="Spaced Repetition"
                description="Review old items periodically"
                rightElement={
                  <Switch
                    value={spacedRepetition}
                    onValueChange={handleSpacedRepetitionToggle}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                }
              />

              <SettingsItem
                icon="volume-up"
                label="Sound"
                description="Play sound for notifications"
                rightElement={
                  <Switch
                    value={soundEnabled}
                    onValueChange={handleSoundToggle}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                }
              />

              <SettingsItem
                icon="vibration"
                label="Vibration"
                description="Vibrate on notifications"
                rightElement={
                  <Switch
                    value={vibrationEnabled}
                    onValueChange={handleVibrationToggle}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                }
              />
            </>
          )}
        </SettingsSection>

        {/* Privacy Section */}
        <SettingsSection title="Privacy & Security">
          <SettingsItem
            icon="lock"
            label="Biometric Lock"
            description="Use Face ID or Touch ID to unlock app"
            onPress={() => Alert.alert("Info", "Biometric lock feature coming soon")}
          />

          <SettingsItem
            icon="privacy-tip"
            label="Entry Privacy"
            description="Lock individual journal entries"
            onPress={() => Alert.alert("Info", "Entry privacy feature coming soon")}
          />
        </SettingsSection>

        {/* Data Section */}
        <SettingsSection title="Data & Backup">
          <SettingsItem
            icon="download"
            label="Export Data"
            description="Download all your data as JSON"
            onPress={handleExportData}
            rightElement={
              exporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
              )
            }
          />

          <SettingsItem
            icon="delete-outline"
            label="Clear All Data"
            description="Permanently delete all items and entries"
            onPress={handleClearAllData}
          />
        </SettingsSection>

        {/* About Section */}
        <SettingsSection title="About">
          <SettingsItem
            icon="info"
            label="Version"
            value="1.0.0"
          />

          <SettingsItem
            icon="help"
            label="Help & Support"
            description="Get help or report issues"
            onPress={() => {
              Linking.openURL("https://github.com/ruben-hassid/knowledge-vault");
            }}
          />

          <SettingsItem
            icon="code"
            label="Open Source"
            description="View source code on GitHub"
            onPress={() => {
              Linking.openURL("https://github.com/ruben-hassid/knowledge-vault");
            }}
          />
        </SettingsSection>

        {/* Footer */}
        <View className="px-4 py-8 items-center">
          <Text className="text-xs text-muted text-center">
            Knowledge Vault v1.0.0 • Made with ❤️
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
