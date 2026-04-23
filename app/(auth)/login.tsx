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
import { useColors } from "@/hooks/use-colors";
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
import { toast } from "@/hooks/use-toast";

export default function LoginScreen() {
  const router = useRouter();
  const colors = useColors();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const registerDevice = trpc.devices.register.useMutation();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (result) => {
      try {
        const previousUserId = await getCurrentUserId();
        if (previousUserId && previousUserId !== result.user.id) {
          // Prevent cross-account data leakage on shared device.
          await clearAllData();
          await clearSyncQueue();
        }
        await saveCurrentUserId(result.user.id);
        await saveToken(result.token);
        await saveStayLoggedIn(stayLoggedIn);
        const currentSettings = await loadAppSettings();
        await saveAppSettings({
          ...currentSettings,
          username: result.user.username?.trim() || currentSettings.username,
          email: result.user.email?.trim().toLowerCase() || currentSettings.email,
        });
      } catch (error) {
        console.error("[Auth/Login] Failed saving auth state:", error);
        toast.error("Could not save your session. Please try again.");
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
      } catch (error) {
        console.warn("[Auth/Login] Device registration failed (continuing):", error);
      }

      try {
        await utils.invalidate();
      } catch (error) {
        console.warn("[Auth/Login] Cache invalidation failed (continuing):", error);
      }

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
      toast.error(error.message || "Unable to sign in.");
    },
  });

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      toast.warning("Email and password are required.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
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
        placeholderTextColor={colors.muted}
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
        placeholderTextColor={colors.muted}
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
          backgroundColor: colors.primary,
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

      <Pressable onPress={() => router.push("/(auth)/forgot-password" as any)} className="mt-3 items-center">
        <Text className="text-primary font-semibold">Forgot Password?</Text>
      </Pressable>

      <View className="flex-row justify-center mt-4">
        <Text className="text-muted">{"Don't have an account? "}</Text>
        <Pressable onPress={() => router.push("/(auth)/register" as any)}>
          <Text className="text-primary font-semibold">Register</Text>
        </Pressable>
      </View>
    </View>
  );
}
