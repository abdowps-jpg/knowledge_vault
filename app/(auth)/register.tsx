import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { clearToken, saveStayLoggedIn } from "@/lib/auth-storage";
import { clearAllData } from "@/lib/db/storage";
import { clearSyncQueue } from "@/lib/sync-manager";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function RegisterScreen() {
  const router = useRouter();
  const colors = useColors();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async (result) => {
      setErrorMessage(null);
      // Ensure register flow starts from a clean unauthenticated state.
      await clearToken();
      await saveStayLoggedIn(false);
      await clearAllData();
      await clearSyncQueue();

      if (result?.requiresVerification) {
        Alert.alert("Check your email", "We sent a 6-digit verification code to your email.");
        router.replace({
          pathname: "/(auth)/verify-email" as any,
          params: { email: email.trim().toLowerCase() },
        });
        return;
      }
      Alert.alert("Success", "Account created. Please login.");
      router.replace("/(auth)/login");
    },
    onError: (error) => {
      const message =
        error.data?.code === "CONFLICT" || /already in use/i.test(error.message)
          ? "An account with this email already exists."
          : error.message || "Unable to create account.";
      setErrorMessage(message);
    },
  });

  const handleRegister = async () => {
    if (registerMutation.isPending) return;
    setErrorMessage(null);

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedUsername) {
      Alert.alert("Validation", "Username is required.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      Alert.alert("Validation", "Please enter a valid email.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Validation", "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Validation", "Passwords do not match.");
      return;
    }

    try {
      await registerMutation.mutateAsync({
        username: normalizedUsername,
        email: normalizedEmail,
        password,
      });
    } catch {
      // User-facing error is handled in onError.
    }
  };
  const isLoading = registerMutation.isPending;

  return (
    <View className="flex-1 bg-background px-6 justify-center">
      <Text className="text-3xl font-bold text-foreground mb-2">Create Account</Text>
      <Text className="text-muted mb-6">Register to start using Knowledge Vault</Text>

      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="Username"
        className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-3"
        placeholderTextColor={colors.muted}
      />
      <VoiceInputButton
        language="en-US"
        label="Mic for username"
        onTranscript={(spoken) => setUsername((prev) => `${prev} ${spoken}`.trim())}
      />
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
        placeholder="Password (8+ chars)"
        className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-2"
        placeholderTextColor={colors.muted}
      />
      {password.length > 0 ? (
        (() => {
          const hasLower = /[a-z]/.test(password);
          const hasUpper = /[A-Z]/.test(password);
          const hasDigit = /\d/.test(password);
          const hasSymbol = /[^A-Za-z0-9]/.test(password);
          const lengthScore = password.length >= 12 ? 2 : password.length >= 8 ? 1 : 0;
          const score = lengthScore + (hasLower ? 1 : 0) + (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSymbol ? 1 : 0);
          const label = score < 3 ? "Weak" : score < 5 ? "OK" : "Strong";
          const color = score < 3 ? colors.error : score < 5 ? colors.warning : colors.success;
          const pct = Math.min(100, Math.round((score / 6) * 100));
          return (
            <View style={{ marginBottom: 12 }}>
              <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" }}>
                <View style={{ height: 4, width: `${pct}%`, backgroundColor: color }} />
              </View>
              <Text style={{ color, fontSize: 11, marginTop: 4, fontWeight: "600" }}>
                {label} · need 8+ chars, mix of upper/lower/digits/symbols
              </Text>
            </View>
          );
        })()
      ) : (
        <View style={{ marginBottom: 12 }} />
      )}
      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        placeholder="Confirm Password"
        className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-5"
        placeholderTextColor={colors.muted}
      />

      <TouchableOpacity
        onPress={handleRegister}
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
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Register</Text>
        )}
      </TouchableOpacity>

      {errorMessage ? (
        <Text style={{ color: colors.error, marginTop: 10, textAlign: "center" }}>{errorMessage}</Text>
      ) : null}

      <View className="flex-row justify-center mt-4">
        <Text className="text-muted">Already have an account? </Text>
        <Pressable onPress={() => router.push("/(auth)/login")}>
          <Text className="text-primary font-semibold">Login</Text>
        </Pressable>
      </View>
    </View>
  );
}
