import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const initialEmail = useMemo(() => (typeof params.email === "string" ? params.email : ""), [params.email]);

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const verifyMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => {
      setErrorMessage(null);
      Alert.alert("Success", "Email verified successfully. You can login now.");
      router.replace("/(auth)/login");
    },
    onError: (error) => {
      setErrorMessage(error.message || "Verification failed.");
    },
  });

  const resendMutation = trpc.auth.resendVerificationCode.useMutation({
    onSuccess: () => {
      setErrorMessage(null);
      Alert.alert("Check your email", "If an account exists, a verification code has been sent.");
    },
    onError: (error) => {
      setErrorMessage(error.message || "Failed to resend code.");
    },
  });

  const handleVerify = async () => {
    setErrorMessage(null);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();

    if (!normalizedEmail) {
      setErrorMessage("Email is required.");
      return;
    }
    if (!/^\d{6}$/.test(normalizedCode)) {
      setErrorMessage("Enter a valid 6-digit code.");
      return;
    }

    try {
      await verifyMutation.mutateAsync({ email: normalizedEmail, code: normalizedCode });
    } catch {
      // handled in onError
    }
  };

  const handleResend = async () => {
    setErrorMessage(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Email is required.");
      return;
    }
    try {
      await resendMutation.mutateAsync({ email: normalizedEmail });
    } catch {
      // handled in onError
    }
  };

  const isWorking = verifyMutation.isPending || resendMutation.isPending;

  return (
    <View className="flex-1 bg-background px-6 justify-center">
      <Text className="text-3xl font-bold text-foreground mb-2">Verify Email</Text>
      <Text className="text-muted mb-6">Enter the 6-digit code sent to your email</Text>

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
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="6-digit code"
        className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-5"
        placeholderTextColor="#9ca3af"
      />

      <TouchableOpacity
        onPress={handleVerify}
        disabled={isWorking}
        style={{
          backgroundColor: "#0a7ea4",
          borderRadius: 12,
          padding: 16,
          alignItems: "center",
          opacity: isWorking ? 0.7 : 1,
        }}
      >
        {verifyMutation.isPending ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Verify</Text>
        )}
      </TouchableOpacity>

      <Pressable onPress={handleResend} disabled={isWorking} className="items-center mt-4">
        {resendMutation.isPending ? (
          <ActivityIndicator color="#0a7ea4" />
        ) : (
          <Text className="text-primary font-semibold">Resend code</Text>
        )}
      </Pressable>

      {errorMessage ? (
        <Text style={{ color: "#dc2626", marginTop: 10, textAlign: "center" }}>{errorMessage}</Text>
      ) : null}

      <View className="flex-row justify-center mt-6">
        <Text className="text-muted">Already verified? </Text>
        <Pressable onPress={() => router.replace("/(auth)/login")}>
          <Text className="text-primary font-semibold">Go to Login</Text>
        </Pressable>
      </View>
    </View>
  );
}
