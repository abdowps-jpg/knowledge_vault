import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useColors } from "@/hooks/use-colors";
import { useInbox } from "@/lib/context/inbox-context";

type ActionKey = "quick-note" | "quick-task" | "journal-entry" | "scan-save";

interface ActionConfig {
  key: ActionKey;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
}

function QuickActionItem({
  index,
  action,
  progress,
  onPress,
}: {
  index: number;
  action: ActionConfig;
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const colors = useColors();
  const actionStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      progress.value,
      [0, 1],
      [0, -(index + 1) * 62],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    const scale = interpolate(progress.value, [0, 1], [0.7, 1], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          right: 0,
          bottom: 0,
        },
        actionStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingVertical: 10,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          minWidth: 176,
        }}
      >
        <MaterialIcons name={action.icon} size={18} color={colors.primary} />
        <Text className="text-foreground font-semibold ml-2">{action.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function QuickActionsFab() {
  const colors = useColors();
  const router = useRouter();
  const { openQuickAdd } = useInbox();

  const [isOpen, setIsOpen] = useState(false);
  const progress = useSharedValue(0);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    progress.value = withTiming(next ? 1 : 0, { duration: 220 });
  };

  const close = () => {
    setIsOpen(false);
    progress.value = withTiming(0, { duration: 200 });
  };

  const actions = useMemo<ActionConfig[]>(
    () => [
      {
        key: "quick-note",
        label: "✏️ Quick Note",
        icon: "edit-note",
        onPress: () => openQuickAdd("note"),
      },
      {
        key: "quick-task",
        label: "✅ Quick Task",
        icon: "check-circle",
        onPress: () => openQuickAdd("task"),
      },
      {
        key: "journal-entry",
        label: "📝 Journal Entry",
        icon: "menu-book",
        onPress: () => router.push("/(app)/(tabs)/journal?openCreate=1"),
      },
      {
        key: "scan-save",
        label: "📷 Scan & Save",
        icon: "photo-camera",
        onPress: () => openQuickAdd("note", { autoPickImage: true }),
      },
    ],
    [openQuickAdd, router]
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View
      pointerEvents={isOpen ? "auto" : "box-none"}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 80,
      }}
    >
      {isOpen ? (
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.25)",
            },
            backdropStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={close} />
        </Animated.View>
      ) : null}

      <View pointerEvents="box-none" style={{ flex: 1, alignItems: "flex-end", justifyContent: "flex-end", paddingRight: 16, paddingBottom: 90 }}>
        {isOpen
          ? actions.map((action, index) => (
              <QuickActionItem
                key={action.key}
                index={index}
                action={action}
                progress={progress}
                onPress={() => {
                  close();
                  action.onPress();
                }}
              />
            ))
          : null}

        <Pressable
          onPress={toggle}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            elevation: 6,
          }}
        >
          <MaterialIcons name={isOpen ? "close" : "bolt"} size={26} color="white" />
        </Pressable>
      </View>
    </View>
  );
}
