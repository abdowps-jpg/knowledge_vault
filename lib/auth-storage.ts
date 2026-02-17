import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Alert, Platform } from "react-native";

const TOKEN_KEY = "auth_token";
const LEGACY_TOKEN_KEY = "kv_auth_token";
const STAY_LOGGED_IN_KEY = "kv_stay_logged_in";
const DEVICE_ID_KEY = "kv_device_id";

export async function saveToken(token: string): Promise<void> {
  try {
    console.log("Saving token:", token);
    if (Platform.OS === "web") {
      await AsyncStorage.setItem(TOKEN_KEY, token);
      console.log("Saving token to SecureStore");
      console.log("Using AsyncStorage fallback on web");
      return;
    }
    console.log("Saving token to SecureStore");
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    console.error("Failed saving token:", error);
    Alert.alert("Auth Error", "Failed to save login token.");
    throw error;
  }
}

export async function getToken(): Promise<string | null> {
  try {
    let token: string | null = null;
    if (Platform.OS === "web") {
      token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        const legacy = await AsyncStorage.getItem(LEGACY_TOKEN_KEY);
        if (legacy) {
          await AsyncStorage.setItem(TOKEN_KEY, legacy);
          await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
          token = legacy;
        }
      }
    } else {
      token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) {
        const legacy = await SecureStore.getItemAsync(LEGACY_TOKEN_KEY);
        if (legacy) {
          await SecureStore.setItemAsync(TOKEN_KEY, legacy);
          await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
          token = legacy;
        }
      }
    }
    console.log("Retrieved token:", token);
    console.log("Token retrieved:", !!token);
    return token;
  } catch (error) {
    console.error("Failed retrieving token:", error);
    Alert.alert("Auth Error", "Failed to retrieve login token.");
    return null;
  }
}

export async function clearToken(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
    }
    console.log("Token cleared");
  } catch (error) {
    console.error("Failed clearing token:", error);
    Alert.alert("Auth Error", "Failed to clear login token.");
    throw error;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const token = await getToken();
    const isAuthed = !!token;
    console.log("isAuthenticated:", isAuthed);
    return isAuthed;
  } catch (error) {
    console.error("Failed auth check:", error);
    Alert.alert("Auth Error", "Failed to check authentication state.");
    return false;
  }
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
