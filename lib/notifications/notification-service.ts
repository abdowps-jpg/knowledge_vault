import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================================
// Types
// ============================================================================

export interface NotificationSettings {
  enabled: boolean;
  taskReminders: boolean;
  taskReminderTime: number; // minutes before due date
  spacedRepetition: boolean;
  spacedRepetitionFrequency: "daily" | "weekly" | "biweekly";
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export interface ScheduledNotification {
  id: string;
  itemId: string;
  type: "task-reminder" | "spaced-repetition";
  scheduledTime: Date;
  title: string;
  body: string;
}

// ============================================================================
// Default Settings
// ============================================================================

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  taskReminders: true,
  taskReminderTime: 15, // 15 minutes before
  spacedRepetition: true,
  spacedRepetitionFrequency: "weekly",
  soundEnabled: true,
  vibrationEnabled: true,
};

// ============================================================================
// Notification Service
// ============================================================================

export class NotificationService {
  private static instance: NotificationService;
  private settings: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS;

  private constructor() {
    this.initializeNotifications();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize notification system
   */
  private async initializeNotifications(): Promise<void> {
    try {
      // Set notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: this.settings.soundEnabled,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      // Load settings
      await this.loadSettings();

      // Request permissions
      await this.requestPermissions();
    } catch (error) {
      console.error("Error initializing notifications:", error);
    }
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === "granted";
    } catch (error) {
      console.error("Error requesting notification permissions:", error);
      return false;
    }
  }

  /**
   * Load notification settings from storage
   */
  async loadSettings(): Promise<void> {
    try {
      // Load settings from AsyncStorage
      const stored = await AsyncStorage.getItem("notification_settings");
      if (stored) {
        this.settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error("Error loading notification settings:", error);
    }
  }

  /**
   * Save notification settings to storage
   */
  async saveSettings(settings: Partial<NotificationSettings>): Promise<void> {
    try {
      this.settings = { ...this.settings, ...settings };
      await AsyncStorage.setItem("notification_settings", JSON.stringify(this.settings));
    } catch (error) {
      console.error("Error saving notification settings:", error);
    }
  }

  /**
   * Get current settings
   */
  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  /**
   * Schedule task reminder notification
   */
  async scheduleTaskReminder(
    itemId: string,
    taskTitle: string,
    dueDate: Date
  ): Promise<string | null> {
    try {
      if (!this.settings.enabled || !this.settings.taskReminders) {
        return null;
      }

      // Calculate reminder time
      const reminderTime = new Date(dueDate.getTime() - this.settings.taskReminderTime * 60000);

      // Don't schedule if reminder time is in the past
      if (reminderTime < new Date()) {
        return null;
      }

      // Calculate seconds until reminder
      const secondsUntilReminder = Math.floor((reminderTime.getTime() - Date.now()) / 1000);

      // Schedule notification
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Task Reminder",
          body: `${taskTitle} is due soon`,
          data: { itemId, type: "task-reminder" },
          sound: this.settings.soundEnabled ? "default" : undefined,
          badge: 1,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, secondsUntilReminder),
        },
      });

      return notificationId;
    } catch (error) {
      console.error("Error scheduling task reminder:", error);
      return null;
    }
  }

  /**
   * Schedule spaced repetition notification
   */
  async scheduleSpacedRepetitionReminder(
    itemId: string,
    itemTitle: string,
    nextReviewDate: Date
  ): Promise<string | null> {
    try {
      if (!this.settings.enabled || !this.settings.spacedRepetition) {
        return null;
      }

      // Don't schedule if review date is in the past
      if (nextReviewDate < new Date()) {
        return null;
      }

      // Calculate seconds until review
      const secondsUntilReview = Math.floor((nextReviewDate.getTime() - Date.now()) / 1000);

      // Schedule notification
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Time to Review",
          body: `Review: ${itemTitle}`,
          data: { itemId, type: "spaced-repetition" },
          sound: this.settings.soundEnabled ? "default" : undefined,
          badge: 1,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, secondsUntilReview),
        },
      });

      return notificationId;
    } catch (error) {
      console.error("Error scheduling spaced repetition reminder:", error);
      return null;
    }
  }

  /**
   * Cancel scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error("Error canceling notification:", error);
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error("Error canceling all notifications:", error);
    }
  }

  /**
   * Get all scheduled notifications
   */
  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error("Error getting scheduled notifications:", error);
      return [];
    }
  }

  /**
   * Handle notification response (when user taps notification)
   */
  onNotificationResponse(
    callback: (notification: Notifications.Notification) => void
  ): () => void {
    return Notifications.addNotificationResponseReceivedListener((response) => {
      callback(response.notification);
    }).remove;
  }

  /**
   * Handle notification received (when app is in foreground)
   */
  onNotificationReceived(
    callback: (notification: Notifications.Notification) => void
  ): () => void {
    return Notifications.addNotificationReceivedListener((notification) => {
      callback(notification);
    }).remove;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get next spaced repetition date based on SM-2 algorithm
 */
export function getNextSpacedRepetitionDate(
  lastReviewDate: Date,
  interval: number,
  frequency: "daily" | "weekly" | "biweekly"
): Date {
  const nextDate = new Date(lastReviewDate);

  switch (frequency) {
    case "daily":
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case "weekly":
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case "biweekly":
      nextDate.setDate(nextDate.getDate() + 14);
      break;
  }

  // Set to 9 AM
  nextDate.setHours(9, 0, 0, 0);

  return nextDate;
}
