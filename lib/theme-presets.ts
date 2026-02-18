export type AccentTheme = "ocean" | "sunset" | "forest" | "lavender" | "midnight" | "coral";

type ThemeTokens = {
  primary: string;
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  error: string;
};

export const ACCENT_THEME_LABELS: Record<AccentTheme, string> = {
  ocean: "Ocean",
  sunset: "Sunset",
  forest: "Forest",
  lavender: "Lavender",
  midnight: "Midnight",
  coral: "Coral",
};

export const ACCENT_THEME_PREVIEW: Record<AccentTheme, string> = {
  ocean: "#0a7ea4",
  sunset: "#f97316",
  forest: "#2f855a",
  lavender: "#8b5cf6",
  midnight: "#1d4ed8",
  coral: "#fb7185",
};

export const ACCENT_THEME_TOKENS: Record<AccentTheme, { light: Partial<ThemeTokens>; dark: Partial<ThemeTokens> }> = {
  ocean: {
    light: { primary: "#0a7ea4" },
    dark: { primary: "#0ea5b7" },
  },
  sunset: {
    light: { primary: "#f97316", surface: "#fff7ed" },
    dark: { primary: "#fb923c", surface: "#2d1d12" },
  },
  forest: {
    light: { primary: "#2f855a", surface: "#f0fdf4" },
    dark: { primary: "#34d399", surface: "#102318" },
  },
  lavender: {
    light: { primary: "#8b5cf6", surface: "#f5f3ff" },
    dark: { primary: "#a78bfa", surface: "#1f1933" },
  },
  midnight: {
    light: { primary: "#1d4ed8", background: "#f8fafc", surface: "#e2e8f0" },
    dark: { primary: "#60a5fa", background: "#0b1220", surface: "#111c31" },
  },
  coral: {
    light: { primary: "#fb7185", surface: "#fff1f2" },
    dark: { primary: "#fda4af", surface: "#2f151b" },
  },
};
