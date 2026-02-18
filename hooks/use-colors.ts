import { Colors, type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { useColorScheme } from "./use-color-scheme";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * Returns the current theme's color palette.
 * Usage: const colors = useColors(); then colors.text, colors.background, etc.
 */
export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const colorSchema = useColorScheme();
  const { palette } = useThemeContext();
  if (!colorSchemeOverride) {
    return {
      ...palette,
      text: palette.foreground,
      background: palette.background,
      tint: palette.primary,
      icon: palette.muted,
      tabIconDefault: palette.muted,
      tabIconSelected: palette.primary,
      border: palette.border,
    } as ThemeColorPalette;
  }
  const scheme = (colorSchemeOverride ?? colorSchema ?? "light") as ColorScheme;
  return Colors[scheme];
}
