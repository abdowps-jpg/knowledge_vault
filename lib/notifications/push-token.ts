import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_REGISTERED_TOKEN_KEY = "push_token.last_registered_v1";

function currentPlatform(): "ios" | "android" | "web" | null {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "web") return "web";
  return null;
}

export async function getExpoPushToken(): Promise<string | null> {
  const platform = currentPlatform();
  if (!platform || platform === "web") return null;
  try {
    const Notifications = await import("expo-notifications");
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      if (req.status !== "granted") return null;
    }
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return result.data ?? null;
  } catch (err) {
    console.warn("[PushToken] fetch failed:", err);
    return null;
  }
}

export async function registerPushTokenOnce(params: {
  isLoggedIn: boolean;
  register: (input: {
    token: string;
    platform: "ios" | "android" | "web";
    deviceName?: string;
  }) => Promise<unknown>;
  deviceName?: string;
}): Promise<void> {
  if (!params.isLoggedIn) return;
  const platform = currentPlatform();
  if (!platform || platform === "web") return;

  const token = await getExpoPushToken();
  if (!token) return;

  try {
    const previous = await AsyncStorage.getItem(LAST_REGISTERED_TOKEN_KEY);
    const composite = `${platform}:${token}`;
    if (previous === composite) return;

    await params.register({
      token,
      platform,
      deviceName: params.deviceName,
    });
    await AsyncStorage.setItem(LAST_REGISTERED_TOKEN_KEY, composite);
  } catch (err) {
    console.warn("[PushToken] register failed:", err);
  }
}
