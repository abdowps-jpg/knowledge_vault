import React from "react";
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useTokens } from "@/hooks/use-tokens";

type Props = Omit<PressableProps, "style" | "children"> & {
  /** Required — screen readers announce this. */
  label: string;
  /** Icon element (typically `<MaterialIcons />`). */
  icon: React.ReactNode;
  /** Background tint. Defaults to `colors.primary`. */
  background?: string;
  /** Custom size override. Defaults to 56 (standard FAB diameter). */
  size?: number;
  /** Absolute-positioned container style overrides (bottom-right by default). */
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Floating Action Button. Cross-platform shadow via `shadows.fab`, so
 * elevation works on Android AND iOS (hand-rolled callers often forgot
 * the iOS `shadowColor`/`shadowRadius` triple).
 */
export function FAB({ label, icon, background, size = 56, containerStyle, ...rest }: Props) {
  const colors = useColors();
  const { shadows } = useTokens();

  return (
    <View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          right: 18,
          bottom: 22,
          zIndex: 80,
        },
        containerStyle,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background ?? colors.primary,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.9 : 1,
          ...shadows.fab,
        })}
        {...rest}
      >
        {icon}
      </Pressable>
    </View>
  );
}
