import { Platform } from "react-native";

const DAILY_REVIEW_NOTIFICATION_KEY = "daily-review-notification-id";
const WEEKLY_REVIEW_NOTIFICATION_KEY = "weekly-review-notification-id";

async function getStorage() {
  const mod = await import("@react-native-async-storage/async-storage");
  return mod.default;
}

export async function scheduleReviewPrompts() {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    const AsyncStorage = await getStorage();

    const existingDaily = await AsyncStorage.getItem(DAILY_REVIEW_NOTIFICATION_KEY);
    if (existingDaily) {
      await Notifications.cancelScheduledNotificationAsync(existingDaily);
    }
    const existingWeekly = await AsyncStorage.getItem(WEEKLY_REVIEW_NOTIFICATION_KEY);
    if (existingWeekly) {
      await Notifications.cancelScheduledNotificationAsync(existingWeekly);
    }

    const dailyId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Daily Review",
        body: "It's 8:00 PM. Review your day and capture lessons learned.",
        data: { type: "daily-review", route: "/(app)/reviews" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 20,
        minute: 0,
      },
    });

    const weeklyId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Weekly Review",
        body: "Sunday 6:00 PM review is ready. Reflect and plan next week.",
        data: { type: "weekly-review", route: "/(app)/reviews" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1,
        hour: 18,
        minute: 0,
      } as any,
    });

    await AsyncStorage.setItem(DAILY_REVIEW_NOTIFICATION_KEY, dailyId);
    await AsyncStorage.setItem(WEEKLY_REVIEW_NOTIFICATION_KEY, weeklyId);
  } catch (error) {
    console.error("[ReviewNotifications] Failed scheduling prompts:", error);
  }
}
