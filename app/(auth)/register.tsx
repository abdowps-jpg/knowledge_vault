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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function RegisterScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      Alert.alert("Success", "Account created. Please login.");
      router.replace("/(auth)/login");
    },
    onError: (error) => {
      const message =
        error.data?.code === "CONFLICT" || /already in use/i.test(error.message)
          ? "An account with this email already exists."
          : error.message || "Unable to create account.";
      Alert.alert("Register Failed", message);
    },
  });

  const handleRegister = async () => {
    if (registerMutation.isPending) return;

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
        placeholderTextColor="#9ca3af"
      />
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-3"
        placeholderTextColor="#9ca3af"
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Password (8+ chars)"
        className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-3"
        placeholderTextColor="#9ca3af"
      />
      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        placeholder="Confirm Password"
        className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-5"
        placeholderTextColor="#9ca3af"
      />

      <TouchableOpacity
        onPress={handleRegister}
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
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Register</Text>
        )}
      </TouchableOpacity>

      <View className="flex-row justify-center mt-4">
        <Text className="text-muted">Already have an account? </Text>
        <Pressable onPress={() => router.push("/(auth)/login")}>
          <Text className="text-primary font-semibold">Login</Text>
        </Pressable>
      </View>
    </View>
  );
}
