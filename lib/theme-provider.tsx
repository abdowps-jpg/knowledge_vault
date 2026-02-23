import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { SchemeColors, type ColorScheme } from "@/constants/theme";
import { ACCENT_THEME_TOKENS, type AccentTheme } from "@/lib/theme-presets";
import { loadAppSettings, saveAppSettings } from "@/lib/settings-storage";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  accentTheme: AccentTheme;
  setAccentTheme: (theme: AccentTheme) => void;
  palette: typeof SchemeColors.light;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? "light";
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(systemScheme);
  const [accentTheme, setAccentThemeState] = useState<AccentTheme>("ocean");

  const palette = useMemo(() => {
    return {
      ...SchemeColors[colorScheme],
      ...ACCENT_THEME_TOKENS[accentTheme][colorScheme],
    };
  }, [accentTheme, colorScheme]);

  const applyWebFontSize = useCallback((size: "small" | "medium" | "large") => {
    if (typeof document === "undefined") return;
    const px = size === "small" ? 14 : size === "large" ? 18 : 16;
    document.documentElement.style.fontSize = `${px}px`;
  }, []);

  const applyScheme = useCallback((scheme: ColorScheme, theme: AccentTheme) => {
    const mergedPalette = {
      ...SchemeColors[scheme],
      ...ACCENT_THEME_TOKENS[theme][scheme],
    };
    nativewindColorScheme.set(scheme);
    Appearance.setColorScheme?.(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      Object.entries(mergedPalette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    applyScheme(scheme, accentTheme);
  }, [accentTheme, applyScheme]);

  const setAccentTheme = useCallback((theme: AccentTheme) => {
    setAccentThemeState(theme);
    applyScheme(colorScheme, theme);
    loadAppSettings()
      .then((settings) => saveAppSettings({ ...settings, accentTheme: theme }))
      .catch((error) => {
        console.error("Failed persisting accent theme:", error);
      });
  }, [applyScheme, colorScheme]);

  useEffect(() => {
    loadAppSettings()
      .then((settings) => {
        const resolvedScheme = settings.theme === "auto" ? systemScheme : settings.theme;
        const resolvedAccent = settings.accentTheme ?? "ocean";
        const resolvedFontSize = settings.fontSize ?? "medium";
        setColorSchemeState(resolvedScheme);
        setAccentThemeState(resolvedAccent);
        applyScheme(resolvedScheme, resolvedAccent);
        applyWebFontSize(resolvedFontSize);
      })
      .catch((error) => {
        console.error("Failed loading theme settings:", error);
        applyScheme(colorScheme, accentTheme);
      });
  }, [accentTheme, applyScheme, applyWebFontSize, colorScheme, systemScheme]);

  useEffect(() => {
    applyScheme(colorScheme, accentTheme);
  }, [accentTheme, applyScheme, colorScheme]);

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": palette.primary,
        "color-background": palette.background,
        "color-surface": palette.surface,
        "color-foreground": palette.foreground,
        "color-muted": palette.muted,
        "color-border": palette.border,
        "color-success": palette.success,
        "color-warning": palette.warning,
        "color-error": palette.error,
      }),
    [palette],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
      accentTheme,
      setAccentTheme,
      palette,
    }),
    [accentTheme, colorScheme, palette, setAccentTheme, setColorScheme],
  );
  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
