function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

export function parseNaturalDate(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Exact YYYY-MM-DD.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const normalized = raw.toLowerCase();
  const now = new Date();

  if (normalized === "today" || normalized === "اليوم") {
    return toDateOnlyString(now);
  }
  if (
    normalized === "tomorrow" ||
    normalized === "tmr" ||
    normalized === "غدا" ||
    normalized === "بكرة"
  ) {
    return toDateOnlyString(addDays(now, 1));
  }
  if (
    normalized === "next week" ||
    normalized === "week" ||
    normalized === "الاسبوع الجاي" ||
    normalized === "الأسبوع الجاي"
  ) {
    return toDateOnlyString(addDays(now, 7));
  }
  if (
    normalized === "this weekend" ||
    normalized === "weekend" ||
    normalized === "نهاية الاسبوع" ||
    normalized === "نهاية الأسبوع"
  ) {
    const day = now.getDay(); // 0 sunday
    const daysUntilSaturday = (6 - day + 7) % 7 || 7;
    return toDateOnlyString(addDays(now, daysUntilSaturday));
  }

  const inDaysMatch = normalized.match(/^in\s+(\d+)\s+days?$/);
  if (inDaysMatch) {
    const days = Number(inDaysMatch[1]);
    if (Number.isInteger(days) && days >= 0 && days <= 3650) {
      return toDateOnlyString(addDays(now, days));
    }
  }

  const afterDaysArabic = normalized.match(/^بعد\s+(\d+)\s+يوم$/);
  if (afterDaysArabic) {
    const days = Number(afterDaysArabic[1]);
    if (Number.isInteger(days) && days >= 0 && days <= 3650) {
      return toDateOnlyString(addDays(now, days));
    }
  }

  return null;
}
