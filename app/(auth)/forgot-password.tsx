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

type Step = "email" | "code";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const colors = useColors();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const forgotMutation = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => {
      setStep("code");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Something went wrong.");
    },
  });

  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      Alert.alert("Success", "Your password has been reset. Please log in.", [
        { text: "OK", onPress: () => router.replace("/(auth)/login" as any) },
      ]);
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Invalid or expired code.");
    },
  });

  const handleSendCode = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Validation", "Please enter your email.");
      return;
    }
    forgotMutation.mutate({ email: trimmed });
  };

  const handleResetPassword = () => {
    if (!code.trim() || code.trim().length !== 6) {
      Alert.alert("Validation", "Please enter the 6-digit code.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Validation", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Validation", "Passwords do not match.");
      return;
    }
    resetMutation.mutate({
      email: email.trim().toLowerCase(),
      code: code.trim(),
      newPassword,
    });
  };

  const isLoading = forgotMutation.isPending || resetMutation.isPending;

  return (
    <View className="flex-1 bg-background px-6 justify-center">
      <Text className="text-3xl font-bold text-foreground mb-2">Reset Password</Text>
      <Text className="text-muted mb-6">
        {step === "email"
          ? "Enter your email to receive a reset code."
          : "Enter the code sent to your email and your new password."}
      </Text>

      {step === "email" ? (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-4"
            placeholderTextColor={colors.muted}
          />
          <TouchableOpacity
            onPress={handleSendCode}
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
              <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Send Code</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="6-digit code"
            className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-3"
            placeholderTextColor={colors.muted}
          />
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="New password"
            className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-3"
            placeholderTextColor={colors.muted}
          />
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Confirm new password"
            className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-4"
            placeholderTextColor={colors.muted}
          />
          <TouchableOpacity
            onPress={handleResetPassword}
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
              <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Reset Password</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      <Pressable onPress={() => router.back()} className="mt-4 items-center">
        <Text className="text-primary font-semibold">Back to Login</Text>
      </Pressable>
    </View>
  );
}
