import React, { useEffect } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { useToastList } from "@/hooks/use-toast";
import { toastManager, type ToastVariant } from "@/lib/toast-manager";

const ICON: Record<ToastVariant, keyof typeof MaterialIcons.glyphMap> = {
  success: "check-circle",
  error: "error",
  warning: "warning",
  info: "info",
};

export function ToastHost() {
  const toasts = useToastList();
  const colors = useColors();

  // Esc dismisses the topmost toast on web — matches keyboard-nav expectations.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const top = toastManager.getSnapshot().at(-1);
      if (top) toastManager.dismiss(top.id);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (toasts.length === 0) return null;

  const bgFor = (v: ToastVariant): string => {
    switch (v) {
      case "success":
        return colors.success;
      case "error":
        return colors.error;
      case "warning":
        return colors.warning;
      default:
        return colors.primary;
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: Platform.OS === "web" ? 24 : 92,
        left: 16,
        right: 16,
        zIndex: 9999,
        gap: 8,
      }}
    >
      {toasts.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => toastManager.dismiss(t.id)}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${t.variant}: ${t.message}. Tap to dismiss.`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 10,
            backgroundColor: bgFor(t.variant),
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
        >
          <MaterialIcons name={ICON[t.variant]} size={20} color="#fff" />
          <Text style={{ color: "#fff", flex: 1, fontWeight: "600", fontSize: 14 }}>
            {t.message}
          </Text>
          <Text style={{ color: "#fff", opacity: 0.7, fontSize: 18, lineHeight: 18 }}>×</Text>
        </Pressable>
      ))}
    </View>
  );
}
