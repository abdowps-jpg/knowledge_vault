import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { VoiceInputButton } from "@/components/voice-input-button";
import {
  getCurrentUserId,
  getOrCreateDeviceId,
  saveCurrentUserId,
  saveStayLoggedIn,
  saveToken,
} from "@/lib/auth-storage";
import { clearAllData } from "@/lib/db/storage";
import { clearSyncQueue } from "@/lib/sync-manager";
import { loadAppSettings, saveAppSettings } from "@/lib/settings-storage";

export default function LoginScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const registerDevice = trpc.devices.register.useMutation();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (result) => {
      console.log("[Auth/Login] Login mutation succeeded for:", result.user?.email);
      console.log("Login response:", result);
      try {
        const previousUserId = await getCurrentUserId();
        if (previousUserId && previousUserId !== result.user.id) {
          // Prevent cross-account data leakage on shared device.
          await clearAllData();
          await clearSyncQueue();
        }
        await saveCurrentUserId(result.user.id);
        await saveToken(result.token);
        console.log("Token saved:", result.token);
        console.log("[Auth/Login] Token saved successfully");
        await saveStayLoggedIn(stayLoggedIn);
        console.log("[Auth/Login] Stay logged in preference saved:", stayLoggedIn);
        const currentSettings = await loadAppSettings();
        await saveAppSettings({
          ...currentSettings,
          username: result.user.username?.trim() || currentSettings.username,
          email: result.user.email?.trim().toLowerCase() || currentSettings.email,
        });
      } catch (error) {
        console.error("[Auth/Login] Failed saving auth state:", error);
        Alert.alert("Login Failed", "Could not save your session. Please try again.");
        return;
      }

      // Device registration is non-blocking for login flow.
      try {
        const deviceId = await getOrCreateDeviceId();
        await registerDevice.mutateAsync({
          deviceId,
          deviceName: `${Platform.OS}-device`,
          platform: Platform.OS,
        });
        console.log("[Auth/Login] Device registration succeeded:", deviceId);
      } catch (error) {
        console.warn("[Auth/Login] Device registration failed (continuing):", error);
      }

      try {
        await utils.invalidate();
      } catch (error) {
        console.warn("[Auth/Login] Cache invalidation failed (continuing):", error);
      }

      console.log("[Auth/Login] Navigating to app tabs");
      console.log("Navigating to home");
      router.replace("/(app)/(tabs)" as any);
    },
    onError: (error) => {
      if (/not registered|create an account/i.test(error.message)) {
        Alert.alert("Email not registered", "You need to register first.", [
          {
            text: "Register",
            onPress: () => router.push("/(auth)/register" as any),
          },
          { text: "Cancel", style: "cancel" },
        ]);
        return;
      }
      if (/verify your email/i.test(error.message)) {
        Alert.alert("Email verification required", "Please verify your email first.", [
          {
            text: "Verify now",
            onPress: () => {
              const normalizedEmail = email.trim().toLowerCase();
              router.push({
                pathname: "/(auth)/verify-email" as any,
                params: normalizedEmail ? { email: normalizedEmail } : undefined,
              });
            },
          },
          { text: "Cancel", style: "cancel" },
        ]);
        return;
      }
      console.error("[Auth/Login] Login mutation failed:", error);
      Alert.alert("Login Failed", error.message || "Unable to sign in.");
    },
  });

  const handleLogin = async () => {
    console.log("Login button pressed");
    if (!email.trim() || !password) {
      Alert.alert("Validation", "Email and password are required.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    console.log("Calling login API with:", { email: normalizedEmail });
    console.log("[Auth/Login] Attempting login for:", normalizedEmail);
    try {
      await loginMutation.mutateAsync({ email: normalizedEmail, password });
    } catch (error) {
      // Error alert is handled in mutation onError.
      console.error("[Auth/Login] handleLogin caught error:", error);
    }
  };
  const isLoading = loginMutation.isPending;

  return (
    <View className="flex-1 bg-background px-6 justify-center">
      <Text className="text-3xl font-bold text-foreground mb-2">Welcome Back</Text>
      <Text className="text-muted mb-6">Sign in to continue</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-3"
        placeholderTextColor="#9ca3af"
      />
      <VoiceInputButton
        language="en-US"
        label="Mic for email"
        onTranscript={(spoken) => setEmail((prev) => `${prev} ${spoken}`.trim())}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Password"
        className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-4"
        placeholderTextColor="#9ca3af"
      />

      <Pressable
        onPress={() => setStayLoggedIn((v) => !v)}
        className="flex-row items-center mb-5"
      >
        <View className={`w-5 h-5 rounded border mr-2 ${stayLoggedIn ? "bg-primary border-primary" : "border-border"}`} />
        <Text className="text-foreground">Stay logged in</Text>
      </Pressable>

      <TouchableOpacity
        onPress={handleLogin}
        disabled={isLoading}
        style={{
          backgroundColor: "#0a7ea4",
          borderRadius: 12,
          padding: 16,
          alignItems: "center",
          opacity: isLoading ? 0.7 : 1,
        }}
      >
        {isLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Login</Text>
        )}
      </TouchableOpacity>

      <View className="flex-row justify-center mt-4">
        <Text className="text-muted">Don't have an account? </Text>
        <Pressable onPress={() => router.push("/(auth)/register" as any)}>
          <Text className="text-primary font-semibold">Register</Text>
        </Pressable>
      </View>
    </View>
  );
}
