// Pure functions extracted from rich-text-editor.tsx so the security-critical
// escaping logic can be unit-tested without the React Native runtime.
// See docs/security-audit.md (Finding 1) for the XSS that drove this split.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeMarkdownLinkHref(raw: string): string {
  try {
    // No base URL — reject relatives. `new URL("javascript:alert(1)")` still
    // parses (it's a valid absolute URL with the `javascript:` scheme), so
    // the protocol allow-list is what actually blocks the XSS.
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") {
      return u.href;
    }
  } catch {}
  return "#";
}

export function renderInlineMarkdown(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    return `<a href="${escapeHtml(safeMarkdownLinkHref(href))}" rel="noopener noreferrer">${label}</a>`;
  });
  return out;
}
