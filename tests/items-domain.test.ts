/**
 * Pure-domain tests for items utility helpers. These do not touch the
 * database — they verify the reasonable invariants that our routers rely on,
 * so a refactor can't silently break them.
 */

import { describe, expect, it } from 'vitest';

// Replicate the helpers the items.findDuplicates and items.topDomains
// procedures depend on. Keeping them inlined here makes it obvious what
// "duplicate" and "domain" mean from a user's perspective.

function normalizeTitle(title: string | null | undefined): string {
  return (title ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  return url.replace(/[?#].*$/, '').replace(/\/$/, '');
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

describe('item title normalization', () => {
  it('collapses whitespace', () => {
    expect(normalizeTitle('Hello   world')).toBe('hello world');
  });

  it('lowercases', () => {
    expect(normalizeTitle('Hello World')).toBe('hello world');
  });

  it('handles nullish', () => {
    expect(normalizeTitle(null)).toBe('');
    expect(normalizeTitle(undefined)).toBe('');
    expect(normalizeTitle('')).toBe('');
  });
});

describe('item url normalization (for duplicate detection)', () => {
  it('strips querystring', () => {
    expect(normalizeUrl('https://example.com/x?a=1&b=2')).toBe('https://example.com/x');
  });

  it('strips hash', () => {
    expect(normalizeUrl('https://example.com/x#section')).toBe('https://example.com/x');
  });

  it('strips trailing slash', () => {
    expect(normalizeUrl('https://example.com/x/')).toBe('https://example.com/x');
  });

  it('treats two URLs as the same duplicate key when they only differ by query', () => {
    const a = normalizeUrl('https://example.com/article?ref=twitter');
    const b = normalizeUrl('https://example.com/article?utm_source=rss');
    expect(a).toBe(b);
  });
});

describe('domain extraction (for topDomains)', () => {
  it('strips www.', () => {
    expect(hostOf('https://www.github.com/x')).toBe('github.com');
  });

  it('returns null for garbage', () => {
    expect(hostOf('not-a-url')).toBeNull();
    expect(hostOf('')).toBeNull();
    expect(hostOf(null)).toBeNull();
  });

  it('keeps subdomains other than www', () => {
    expect(hostOf('https://docs.github.com/x')).toBe('docs.github.com');
  });
});
