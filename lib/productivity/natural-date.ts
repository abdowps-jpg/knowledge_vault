import * as chrono from "chrono-node";

export type NaturalDateMatch = {
  date: string;
  text: string;
};

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

function parseFallbackKeywords(raw: string, now: Date): NaturalDateMatch | null {
  const normalized = raw.trim().toLowerCase();

  if (normalized === "today") {
    return { date: toDateOnlyString(now), text: raw.trim() };
  }

  if (normalized === "tomorrow" || normalized === "tmr") {
    return { date: toDateOnlyString(addDays(now, 1)), text: raw.trim() };
  }

  if (normalized === "next week" || normalized === "week") {
    return { date: toDateOnlyString(addDays(now, 7)), text: raw.trim() };
  }

  if (normalized === "this weekend" || normalized === "weekend") {
    const day = now.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7 || 7;
    return { date: toDateOnlyString(addDays(now, daysUntilSaturday)), text: raw.trim() };
  }

  const inDaysMatch = normalized.match(/^in\s+(\d+)\s+days?$/);
  if (inDaysMatch) {
    const days = Number(inDaysMatch[1]);
    if (Number.isInteger(days) && days >= 0 && days <= 3650) {
      return { date: toDateOnlyString(addDays(now, days)), text: raw.trim() };
    }
  }

  return null;
}

export function extractNaturalDate(input: string, referenceDate: Date = new Date()): NaturalDateMatch | null {
  const raw = input.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { date: raw, text: raw };
  }

  const keywordMatch = parseFallbackKeywords(raw, referenceDate);
  if (keywordMatch) return keywordMatch;

  const parsed = chrono.parse(raw, referenceDate, { forwardDate: true });
  if (!parsed || parsed.length === 0) return null;

  const firstMatch = parsed[0];
  const resolvedDate = firstMatch.start.date();
  if (Number.isNaN(resolvedDate.getTime())) return null;

  return {
    date: toDateOnlyString(resolvedDate),
    text: firstMatch.text,
  };
}

export function parseNaturalDate(input: string): string | null {
  return extractNaturalDate(input)?.date ?? null;
}
