import { describe, expect, it } from "vitest";
import { ar } from "../lib/i18n/strings/ar";
import { en } from "../lib/i18n/strings/en";

describe("i18n catalogs", () => {
  it("ar catalog has every key of en", () => {
    const enKeys = Object.keys(en);
    const arKeys = new Set(Object.keys(ar));
    const missing = enKeys.filter((k) => !arKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("no duplicated keys with the same value as English (forgot to translate)", () => {
    const suspicious: string[] = [];
    for (const [key, value] of Object.entries(ar)) {
      if ((en as Record<string, string>)[key] === value && /^[\x20-\x7E]+$/.test(value)) {
        suspicious.push(`${key}="${value}"`);
      }
    }
    expect(suspicious).toEqual([]);
  });

  it("every AR translation uses non-ASCII characters (rough sanity check)", () => {
    const suspicious: string[] = [];
    for (const [key, value] of Object.entries(ar)) {
      // Some values like emojis or URLs would be all-ASCII, but for our
      // current dictionary every entry should contain at least one
      // non-ASCII character.
      if (/^[\x20-\x7E]+$/.test(value)) {
        suspicious.push(key);
      }
    }
    expect(suspicious).toEqual([]);
  });
});
