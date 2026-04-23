export const themeColors: {
  primary: { light: string; dark: string };
  background: { light: string; dark: string };
  surface: { light: string; dark: string };
  foreground: { light: string; dark: string };
  muted: { light: string; dark: string };
  border: { light: string; dark: string };
  success: { light: string; dark: string };
  warning: { light: string; dark: string };
  error: { light: string; dark: string };
};

export const radii: {
  none: 0;
  sm: 6;
  md: 8;
  lg: 12;
  xl: 16;
  pill: 9999;
};

export const space: {
  xs: 4;
  sm: 8;
  md: 12;
  lg: 16;
  xl: 24;
  "2xl": 32;
  "3xl": 40;
};

type ShadowStack = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
};

export const shadows: {
  card: ShadowStack;
  overlay: ShadowStack;
  fab: ShadowStack;
};

declare const themeConfig: {
  themeColors: typeof themeColors;
  radii: typeof radii;
  space: typeof space;
  shadows: typeof shadows;
};

export default themeConfig;
