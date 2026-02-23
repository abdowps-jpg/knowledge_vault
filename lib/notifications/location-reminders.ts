import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const LOCATION_REMINDER_CACHE_KEY = "location-reminder-cache-v1";

type TaskLike = {
  id: string;
  title?: string | null;
  isCompleted?: boolean;
  locationLat?: string | null;
  locationLng?: string | null;
  locationRadiusMeters?: number | null;
};

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function checkLocationTaskReminders(tasks: TaskLike[]) {
  if (Platform.OS === "web") return;
  try {
    const Location = await import("expo-location");
    const Notifications = await import("expo-notifications");

    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      const requested = await Location.requestForegroundPermissionsAsync();
      if (!requested.granted) return;
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const currentLat = current.coords.latitude;
    const currentLng = current.coords.longitude;
    const dateKey = new Date().toISOString().slice(0, 10);

    const cacheRaw = await AsyncStorage.getItem(LOCATION_REMINDER_CACHE_KEY);
    const cache: Record<string, string> = cacheRaw ? JSON.parse(cacheRaw) : {};
    let mutated = false;

    for (const task of tasks) {
      if (task.isCompleted) continue;
      const lat = toNumber(task.locationLat);
      const lng = toNumber(task.locationLng);
      if (lat === null || lng === null) continue;
      const radius = task.locationRadiusMeters && task.locationRadiusMeters > 0 ? task.locationRadiusMeters : 200;
      const distance = haversineDistanceMeters(currentLat, currentLng, lat, lng);
      if (distance > radius) continue;

      if (cache[task.id] === dateKey) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Location Reminder",
          body: task.title ? `You're near: ${task.title}` : "You're near a task location.",
          data: { type: "location-task-reminder", taskId: task.id },
        },
        trigger: null,
      });
      cache[task.id] = dateKey;
      mutated = true;
    }

    if (mutated) {
      await AsyncStorage.setItem(LOCATION_REMINDER_CACHE_KEY, JSON.stringify(cache));
    }
  } catch (error) {
    console.error("[LocationReminder] Failed checking nearby tasks:", error);
  }
}
