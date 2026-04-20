const PRIVATE_IP_RANGES = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^fc/i,
  /^fe80/i,
];

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
]);

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 512 * 1024;

export type LinkMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
};

function isBlockedUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (PRIVATE_IP_RANGES.some((rx) => rx.test(host))) return true;
  return false;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    });
}

function extractMeta(html: string, patterns: RegExp[]): string | null {
  for (const rx of patterns) {
    const match = rx.exec(html);
    if (match && match[1]) {
      const value = decodeHtmlEntities(match[1].trim());
      if (value.length > 0) return value.slice(0, 1000);
    }
  }
  return null;
}

function resolveUrl(base: string, maybeRelative: string | null): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

export async function fetchLinkMetadata(rawUrl: string): Promise<LinkMetadata | null> {
  if (isBlockedUrl(rawUrl)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; KnowledgeVaultBot/1.0; +https://knowledgevault.app)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) return null;

    const finalUrl = response.url || rawUrl;
    if (isBlockedUrl(finalUrl)) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('html') && !contentType.includes('xml')) return null;

    const reader = response.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder('utf-8', { fatal: false });
    let html = '';
    let bytesRead = 0;
    while (bytesRead < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (bytesRead >= MAX_HTML_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    html += decoder.decode();

    const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html);
    const head = headMatch ? headMatch[1] : html.slice(0, 50_000);

    const title = extractMeta(head, [
      /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]);
    const description = extractMeta(head, [
      /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i,
    ]);
    const imageRaw = extractMeta(head, [
      /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    ]);
    const siteName = extractMeta(head, [
      /<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i,
    ]);
    const faviconRaw = extractMeta(head, [
      /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
    ]);

    const image = resolveUrl(finalUrl, imageRaw);
    const favicon = resolveUrl(finalUrl, faviconRaw ?? '/favicon.ico');

    return {
      title,
      description: description ? description.slice(0, 500) : null,
      image,
      siteName,
      favicon,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
