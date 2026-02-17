import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "kv_auth_token";
const STAY_LOGGED_IN_KEY = "kv_stay_logged_in";
const DEVICE_ID_KEY = "kv_device_id";

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}

export async function saveStayLoggedIn(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STAY_LOGGED_IN_KEY, enabled ? "true" : "false");
}

export async function getStayLoggedIn(): Promise<boolean> {
  const value = await AsyncStorage.getItem(STAY_LOGGED_IN_KEY);
  return value === "true";
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}
