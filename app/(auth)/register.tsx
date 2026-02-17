import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
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
      Alert.alert("Register Failed", error.message || "Unable to create account.");
    },
  });

  const handleRegister = async () => {
    if (!username.trim()) {
      Alert.alert("Validation", "Username is required.");
      return;
    }
    if (!isValidEmail(email.trim())) {
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

    await registerMutation.mutateAsync({
      username: username.trim(),
      email: email.trim(),
      password,
    });
  };

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

      <Pressable
        onPress={handleRegister}
        disabled={registerMutation.isPending}
        className="bg-primary rounded-xl py-3 items-center"
      >
        {registerMutation.isPending ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold">Register</Text>
        )}
      </Pressable>

      <View className="flex-row justify-center mt-4">
        <Text className="text-muted">Already have an account? </Text>
        <Pressable onPress={() => router.push("/(auth)/login")}>
          <Text className="text-primary font-semibold">Login</Text>
        </Pressable>
      </View>
    </View>
  );
}
