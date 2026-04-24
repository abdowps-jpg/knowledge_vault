import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  renderInlineMarkdown,
  safeMarkdownLinkHref,
} from "../lib/markdown-safe-html";

// These tests lock in the fix for the stored-XSS described in
// docs/security-audit.md (Finding 1). The markdown-link regex used to
// interpolate the href raw, allowing javascript:/data: URLs to reach
// innerHTML and execute on click.

describe("safeMarkdownLinkHref", () => {
  it("accepts http and https", () => {
    expect(safeMarkdownLinkHref("http://example.com/x?y=1")).toBe("http://example.com/x?y=1");
    expect(safeMarkdownLinkHref("https://example.com/")).toBe("https://example.com/");
  });

  it("accepts mailto", () => {
    expect(safeMarkdownLinkHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  it("rejects javascript: URLs — the core XSS vector", () => {
    expect(safeMarkdownLinkHref("javascript:alert(1)")).toBe("#");
    expect(safeMarkdownLinkHref("javascript:alert`xss`")).toBe("#");
    expect(safeMarkdownLinkHref("JavaScript:alert(1)")).toBe("#");
    expect(safeMarkdownLinkHref("  javascript:alert(1)  ")).toBe("#");
  });

  it("rejects data: URLs (can host inline HTML)", () => {
    expect(safeMarkdownLinkHref("data:text/html,<script>alert(1)</script>")).toBe("#");
  });

  it("rejects vbscript:", () => {
    expect(safeMarkdownLinkHref("vbscript:msgbox(1)")).toBe("#");
  });

  it("rejects file:", () => {
    expect(safeMarkdownLinkHref("file:///etc/passwd")).toBe("#");
  });

  it("returns # for unparseable input", () => {
    expect(safeMarkdownLinkHref("not a url")).toBe("#");
    expect(safeMarkdownLinkHref("")).toBe("#");
  });
});

describe("renderInlineMarkdown", () => {
  it("escapes raw HTML in plain text", () => {
    expect(renderInlineMarkdown("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("renders a safe http link with rel=noopener", () => {
    expect(renderInlineMarkdown("[x](https://example.com/)")).toBe(
      '<a href="https://example.com/" rel="noopener noreferrer">x</a>'
    );
  });

  it("neutralizes javascript: link payload", () => {
    const out = renderInlineMarkdown("[click](javascript:alert`xss`)");
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="#"');
  });

  it("neutralizes data: link payload", () => {
    const out = renderInlineMarkdown("[click](data:text/html,<script>alert(1)</script>)");
    expect(out).not.toContain("data:");
    expect(out).toContain('href="#"');
  });

  it("still applies bold/italic/code", () => {
    expect(renderInlineMarkdown("**bold** *italic* `code`")).toBe(
      "<strong>bold</strong> <em>italic</em> <code>code</code>"
    );
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML entities", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
