import React from "react";
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/use-colors";

type Props = Omit<PressableProps, "style"> & {
  /** Required so screen readers announce what the button does. */
  label: string;
  /** Optional — short hint about the outcome ("double tap to delete"). */
  hint?: string;
  /** Role override. Defaults to "button". */
  role?: "button" | "link" | "checkbox" | "tab" | "menuitem" | "switch";
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** Extra focus-ring style on web when the element is keyboard-focused. */
  focusRingColor?: string;
};

/**
 * Drop-in replacement for `Pressable` that always wires an accessibility label
 * and role, and renders a visible focus ring on web for keyboard users.
 *
 * Mobile behavior is identical to Pressable. Web adds `outline` via style.
 */
export function A11yPressable({
  label,
  hint,
  role = "button",
  style,
  focusRingColor,
  children,
  ...rest
}: Props) {
  const colors = useColors();
  const ring = focusRingColor ?? colors.primary;

  const styleFn = (state: { pressed: boolean }): StyleProp<ViewStyle> => {
    const base = typeof style === "function" ? style(state) : style;
    if (Platform.OS !== "web") return base;
    // react-native-web extends the style-callback state with `focused`.
    const focused = (state as { focused?: boolean }).focused ?? false;
    return [
      base,
      focused ? { outlineWidth: 2, outlineStyle: "solid", outlineColor: ring, outlineOffset: 2 } : null,
    ];
  };

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      focusable
      style={styleFn}
      {...rest}
    >
      {children as any}
    </Pressable>
  );
}
