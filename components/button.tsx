import React from "react";
import { ActivityIndicator, Pressable, Text, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useTokens } from "@/hooks/use-tokens";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

type Props = Omit<PressableProps, "style" | "children"> & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  style,
  ...rest
}: Props) {
  const colors = useColors();
  const { radii, space } = useTokens();

  const padY = size === "sm" ? space.sm : size === "md" ? space.md : space.lg;
  const padX = size === "sm" ? space.md : size === "md" ? space.lg : space.xl;

  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
      ? colors.error
      : variant === "secondary"
      ? colors.surface
      : "transparent";

  const fg =
    variant === "primary" || variant === "danger"
      ? "#fff"
      : colors.foreground;

  const borderWidth = variant === "secondary" || variant === "ghost" ? 1 : 0;
  const borderColor = variant === "secondary" ? colors.border : "transparent";

  const isDisabled = Boolean(disabled) || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          borderRadius: radii.md,
          paddingVertical: padY,
          paddingHorizontal: padX,
          backgroundColor: bg,
          borderWidth,
          borderColor,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          alignSelf: fullWidth ? "stretch" : "auto",
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {leadingIcon ? <View style={{ marginRight: space.sm }}>{leadingIcon}</View> : null}
          <Text style={{ color: fg, fontWeight: "700", fontSize: size === "sm" ? 13 : 14 }}>
            {label}
          </Text>
          {trailingIcon ? <View style={{ marginLeft: space.sm }}>{trailingIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
}
