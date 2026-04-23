import React from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useTokens } from "@/hooks/use-tokens";

type Props = ViewProps & {
  /** Elevation level. `flat` = no shadow (default), `raised` = subtle card shadow. */
  elevation?: "flat" | "raised";
  /** Padding preset; maps to `space.*`. Default `md`. */
  padding?: "none" | "sm" | "md" | "lg";
  /** If true, adds a 1px border in `colors.border`. */
  bordered?: boolean;
  /** Extra style overrides. */
  style?: StyleProp<ViewStyle>;
};

export function Card({
  elevation = "flat",
  padding = "md",
  bordered = true,
  style,
  children,
  ...rest
}: Props) {
  const colors = useColors();
  const { radii, space, shadows } = useTokens();

  const padValue =
    padding === "none" ? 0 : padding === "sm" ? space.sm : padding === "md" ? space.md : space.lg;

  return (
    <View
      style={[
        {
          borderRadius: radii.lg,
          padding: padValue,
          backgroundColor: colors.surface,
          borderWidth: bordered ? 1 : 0,
          borderColor: bordered ? colors.border : "transparent",
          ...(elevation === "raised" ? shadows.card : null),
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
