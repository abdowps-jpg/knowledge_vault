import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { loadAppSettings } from "@/lib/settings-storage";

const TASK_NOTIFICATION_MAP_KEY = "task_notification_map";

type TaskNotificationMap = Record<string, string>;

export interface TaskNotificationInput {
  taskId: string;
  title: string;
  priority: "low" | "medium" | "high";
  dueDate?: string | null;
}

function toReminderDate(dueDate?: string | null, reminderTime: string = "09:00"): Date | null {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  const [hourStr, minuteStr] = reminderTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 9;
  const safeMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0;
  date.setHours(safeHour, safeMinute, 0, 0);
  return date;
}

async function getTaskNotificationMap(): Promise<TaskNotificationMap> {
  try {
    const raw = await AsyncStorage.getItem(TASK_NOTIFICATION_MAP_KEY);
    return raw ? (JSON.parse(raw) as TaskNotificationMap) : {};
  } catch (error) {
    console.error("Failed reading task notification map:", error);
    return {};
  }
}

async function setTaskNotificationMap(map: TaskNotificationMap): Promise<void> {
  try {
    await AsyncStorage.setItem(TASK_NOTIFICATION_MAP_KEY, JSON.stringify(map));
  } catch (error) {
    console.error("Failed saving task notification map:", error);
  }
}

export async function requestTaskNotificationPermissions(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Failed requesting notification permissions:", error);
    return false;
  }
}

export async function scheduleTaskDueNotification(input: TaskNotificationInput): Promise<string | null> {
  try {
    const settings = await loadAppSettings();
    if (!settings.taskReminders) return null;

    const dueAtReminderTime = toReminderDate(input.dueDate, settings.taskReminderTime);
    if (!dueAtReminderTime) return null;
    if (dueAtReminderTime.getTime() <= Date.now()) return null;

    await cancelTaskDueNotification(input.taskId);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Task Due Today",
        body: `${input.title} • Priority: ${input.priority}`,
        data: {
          type: "task-due",
          taskId: input.taskId,
          route: "/(tabs)/actions",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dueAtReminderTime,
      },
    });

    const map = await getTaskNotificationMap();
    map[input.taskId] = notificationId;
    await setTaskNotificationMap(map);

    return notificationId;
  } catch (error) {
    console.error("Failed scheduling task notification:", error);
    return null;
  }
}

export async function cancelTaskDueNotification(taskId: string): Promise<void> {
  try {
    const map = await getTaskNotificationMap();
    const notificationId = map[taskId];
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      delete map[taskId];
      await setTaskNotificationMap(map);
    }
  } catch (error) {
    console.error("Failed canceling task notification:", error);
  }
}
