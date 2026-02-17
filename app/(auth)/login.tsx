import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { getOrCreateDeviceId, saveStayLoggedIn, saveToken } from "@/lib/auth-storage";

export default function LoginScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const registerDevice = trpc.devices.register.useMutation();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (result) => {
      await saveToken(result.token);
      await saveStayLoggedIn(stayLoggedIn);
      const deviceId = await getOrCreateDeviceId();
      await registerDevice.mutateAsync({
        deviceId,
        deviceName: `${Platform.OS}-device`,
        platform: Platform.OS,
      });
      await utils.invalidate();
      router.replace("/(app)/(tabs)" as any);
    },
    onError: (error) => {
      Alert.alert("Login Failed", error.message || "Unable to sign in.");
    },
  });

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Validation", "Email and password are required.");
      return;
    }
    await loginMutation.mutateAsync({ email: email.trim(), password });
  };

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

      <Pressable
        onPress={handleLogin}
        disabled={loginMutation.isPending}
        className="bg-primary rounded-xl py-3 items-center"
      >
        {loginMutation.isPending ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold">Login</Text>
        )}
      </Pressable>

      <View className="flex-row justify-center mt-4">
        <Text className="text-muted">Don't have account? </Text>
        <Pressable onPress={() => router.push("/(auth)/register" as any)}>
          <Text className="text-primary font-semibold">Register</Text>
        </Pressable>
      </View>
    </View>
  );
}
