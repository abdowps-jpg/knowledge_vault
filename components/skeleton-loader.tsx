import React, { createContext, useContext, useEffect } from "react";
import { DimensionValue, StyleProp, View, ViewStyle } from "react-native";
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/use-colors";

const SkeletonOpacityContext = createContext<SharedValue<number> | null>(null);

function useSkeletonOpacity(): SharedValue<number> {
  const shared = useContext(SkeletonOpacityContext);
  const fallback = useSharedValue(0.3);
  useEffect(() => {
    if (shared) return;
    fallback.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [shared, fallback]);
  return shared ?? fallback;
}

function SkeletonBox({
  width,
  height,
  borderRadius = 6,
  style,
}: {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const opacity = useSkeletonOpacity();
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.border,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function SkeletonListItem() {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: 12,
      }}
    >
      <SkeletonBox width={20} height={20} borderRadius={4} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBox width="70%" height={16} />
        <SkeletonBox width="90%" height={12} />
        <SkeletonBox width="40%" height={10} />
      </View>
    </View>
  );
}

export function SkeletonCard() {
  const colors = useColors();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        gap: 10,
      }}
    >
      <SkeletonBox width="60%" height={16} />
      <SkeletonBox width="100%" height={12} />
      <SkeletonBox width="80%" height={12} />
      <SkeletonBox width="30%" height={10} />
    </View>
  );
}

export function SkeletonTaskRow() {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: 10,
      }}
    >
      <SkeletonBox width={22} height={22} borderRadius={11} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox width="65%" height={14} />
        <SkeletonBox width="40%" height={10} />
      </View>
      <SkeletonBox width={50} height={22} borderRadius={11} />
    </View>
  );
}

export function SkeletonJournalCard() {
  const colors = useColors();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <SkeletonBox width={24} height={24} borderRadius={12} />
        <SkeletonBox width="50%" height={16} />
      </View>
      <SkeletonBox width="100%" height={12} />
      <SkeletonBox width="70%" height={12} />
    </View>
  );
}

export function SkeletonList({
  count = 5,
  variant = "list",
}: {
  count?: number;
  variant?: "list" | "card" | "task" | "journal";
}) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);

  const Component =
    variant === "card"
      ? SkeletonCard
      : variant === "task"
      ? SkeletonTaskRow
      : variant === "journal"
      ? SkeletonJournalCard
      : SkeletonListItem;

  const wrapperStyle: StyleProp<ViewStyle> =
    variant === "card" || variant === "journal" ? { padding: 16 } : null;

  return (
    <SkeletonOpacityContext.Provider value={opacity}>
      <View style={wrapperStyle}>
        {Array.from({ length: count }).map((_, i) => (
          <Component key={i} />
        ))}
      </View>
    </SkeletonOpacityContext.Provider>
  );
}
