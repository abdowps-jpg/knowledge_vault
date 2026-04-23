import { useLocale } from "@/lib/i18n";

/**
 * Returns direction-aware style helpers for the current locale.
 *
 * Usage:
 *   const dir = useDirection();
 *   <View style={{ flexDirection: dir.row }}>
 *   <Text style={{ textAlign: dir.textAlign, writingDirection: dir.writingDirection }}>
 *
 * Pick `row` for icon+label rows so icons flip sides in RTL.
 * Pick `textAlign` for labels. Pick `writingDirection` for user-authored text
 * (item content, journal entries) so each character run renders in the right
 * direction regardless of the locale.
 */
export function useDirection(): {
  isRTL: boolean;
  row: "row" | "row-reverse";
  textAlign: "left" | "right";
  writingDirection: "ltr" | "rtl";
} {
  const { isRTL } = useLocale();
  return {
    isRTL,
    row: isRTL ? "row-reverse" : "row",
    textAlign: isRTL ? "right" : "left",
    writingDirection: isRTL ? "rtl" : "ltr",
  };
}
