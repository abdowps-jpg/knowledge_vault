import { radii, space, shadows } from "@/theme.config";

/**
 * Returns the project's design tokens for use inside RN `StyleSheet`
 * contexts (where Tailwind classes don't apply — style callbacks,
 * Platform-specific styles, dynamic spacing).
 *
 * Paired with `tailwind.config.js`: `rounded-md` on a className equals
 * `radii.md` in a style object. Single source of truth is `theme.config.js`.
 */
export function useTokens() {
  return { radii, space, shadows };
}

export type Radii = typeof radii;
export type Space = typeof space;
export type Shadows = typeof shadows;
