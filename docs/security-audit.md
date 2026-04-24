# Security Audit — User-Generated Content (UGC) Rendering

**Date:** 2026-04-23
**Scope:** Every path where user-supplied data flows into HTML / DOM — server
HTML responses, the `/app` minimal web client, and the React Native/Expo web
build.
**Method:** ripgrep for HTML sinks (`dangerouslySetInnerHTML`, `innerHTML`,
`document.write`, `outerHTML`, `insertAdjacentHTML`, `res.send` with HTML,
`.type('html')`), then per-sink trace of what data reaches it and whether
escaping is applied.

## Summary

| Path | Sink | Escaping | Verdict |
|---|---|---|---|
| `server/_core/index.ts` `/p/:token` (public link HTML) | template-literal `${...}` | `escapeHtml()` + `safeExternalUrl()` | OK |
| `server/_core/index.ts` `/p/:token.json` (public link JSON) | `res.json()` | n/a — JSON; URL gated via `safeExternalUrl()` | OK |
| `server/_core/index.ts` `/` landing page | template literal | no UGC — fully static | OK |
| `server/_core/index.ts` `/privacy`, `/terms` | template literal via `legalPage()` | no UGC — fully static | OK |
| `server/_core/index.ts` `/app` (minimal web client) | template literal (page shell), client `innerHTML` (item/task lists) | server: no UGC; client: `esc()` + `safeUrl()` (defined in `/app.js`) | OK |
| `server/_core/index.ts` `/app.js` `renderItems` / `renderTasks` | `list.innerHTML = ...` | every UGC field passed through `esc()`; URLs through `safeUrl()` | OK |
| `server/_core/index.ts` `/email/inbound` | normalizes HTML to plain text via regex strip; never re-rendered as HTML | n/a — text only, but **see note 1** | OK with caveat |
| `components/rich-text-editor.tsx:256` `webEditorRef.current.innerHTML = markdownToHtml(value)` | `innerHTML` | `escapeHtml()` on text, **but** `markdownToHtml`'s link rule interpolates the href raw | **VULNERABLE — see Finding 1** |

No use of `dangerouslySetInnerHTML` anywhere in the codebase
(`grep -r "dangerouslySetInnerHTML"` → 0 matches).

---

## Finding 1 — Stored XSS in `markdownToHtml` link href (web only)

**Severity:** High (stored, cross-user reachable, client-side)
**File:** `components/rich-text-editor.tsx`
**Lines:** 35–42 (`renderInlineMarkdown`), 256 (sink)
**Affects:** Web build only (`Platform.OS === 'web'`). Native builds use
`react-native-markdown-display` which does not interpret `javascript:` URLs.

### What's wrong

`renderInlineMarkdown` HTML-escapes the input first, then runs a markdown-link
regex:

```ts
out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
```

`$2` is the bracketed URL captured from the *escaped* string. HTML-escaping
does not touch `javascript:`, `data:`, `vbscript:`, or backticks. The result
HTML string is then assigned to `webEditorRef.current.innerHTML` (line 256),
producing a real `<a>` element whose `href` is attacker-controlled.

### Working payload

```markdown
[click me](javascript:alert`xss`)
```

After processing, the DOM contains:

```html
<a href="javascript:alert`xss`">click me</a>
```

Clicking the link executes `alert("xss")`. Backticks bypass the regex's
`[^)]+` (which only excludes `)`), and they're valid as JS template-literal
tag-call syntax — so an attacker who needs to call a function with a string
argument doesn't need parentheses.

### Reachability — why this is cross-user, not just self-XSS

`RichTextEditor` is mounted in:

- `app/(app)/item/[id].tsx:573` — item detail editor
- `app/(app)/(tabs)/index.tsx:779` — inbox edit
- `components/quick-add-modal.tsx:597` — new item
- `app/(app)/(tabs)/journal.tsx:282` — journal entry

Item content can originate from another user via **`itemShares`** with edit
permission (a collaborator pastes the malicious markdown into a shared item;
the recipient opens it on web; XSS fires in the recipient's session, with
their JWT in `localStorage` and `AsyncStorage`). The shared-item path is in
`server/routers/item-shares.ts` and is part of the Phase 2 collaboration
features.

Self-XSS is also a concern — pasting from a malicious site into the editor
puts the payload into the user's own item content, which then fires every
time *they* open the item on the web build.

### Fix (applied in this PR)

The security-critical helpers were extracted to `lib/markdown-safe-html.ts`
(pure, no RN deps) so they can be unit-tested from Node. `rich-text-editor.tsx`
now imports `renderInlineMarkdown` from that file. The href now passes through
an allow-list:

```ts
export function safeMarkdownLinkHref(raw: string): string {
  try {
    // No base URL — rejects relative inputs. `new URL("javascript:alert(1)")`
    // still parses (absolute URL, scheme `javascript:`), so the protocol
    // allow-list is what blocks XSS.
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") {
      return u.href;
    }
  } catch {}
  return "#";
}
```

Output links also gain `rel="noopener noreferrer"`. Regression tests live
in `tests/markdown-safe-html.test.ts` covering `javascript:`, `data:`,
`vbscript:`, `file:`, case-insensitivity, whitespace-padding, and the
legitimate http/https/mailto cases.

The `htmlToMarkdown` reverse direction (line 154–157) preserves `href` from
the editor's DOM — it's filtered on the next render trip through
`markdownToHtml`, so the round-trip is safe.

---

## Server-side defenses verified

### `escapeHtml` (`server/_core/index.ts:1816`)

Escapes `& < > " '` — the standard five. Applied to every UGC field rendered
in `/p/:token`:

```ts
const title = escapeHtml(item.title || 'Untitled');                                // 1930
const contentHtml = escapeHtml(item.content ?? '').replace(/\n/g, '<br>');         // 1931
const urlLink = safeUrl                                                            // 1933
  ? `<p><a href="${escapeHtml(safeUrl)}" rel="nofollow noreferrer">${escapeHtml(safeUrl)}</a></p>`
  : '';
```

Note that `\n → <br>` is applied *after* escaping, so a `<br>` from
attacker input would already be `&lt;br&gt;` and only literal newlines
become real `<br>` tags. Correct order.

### `safeExternalUrl` (`server/_core/index.ts:1827`)

Parses with `new URL()` and accepts only `http:` / `https:`. Rejects
`javascript:`, `data:`, `vbscript:`, `file:`, `about:`. Applied at every
place an item URL is rendered into HTML or returned via the public-link
JSON endpoint.

### Email-inbound HTML stripping (`server/_core/index.ts:903-906`)

```ts
// normalizedBody is plain-text only — do NOT render it as HTML anywhere.
// The regex strip is not a safe HTML sanitizer (nested tags like
// <scr<script>ipt> evade it); we rely on the output being text-only.
const normalizedBody = textBody || htmlBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
```

The comment is correct: the regex strip is **not** an HTML sanitizer. Safe
only because the output goes into a `description` text column and is
rendered through React Native `<Text>` (auto-escaped) on the client.
**Action item if anyone ever renders task descriptions via `dangerouslySetInnerHTML`
or `markdownToHtml`: do a real sanitizer first** (e.g. `sanitize-html` or
DOMPurify on web).

### Client `/app.js` (`server/_core/index.ts:1407-1673`)

Defines `esc()` (line 1424) and `safeUrl()` (1428). Every UGC interpolation
into `innerHTML` goes through `esc()`, including the `data-id`, item title,
type, location, snippet, and date. URLs go through `safeUrl()` before being
re-escaped for the href attribute. Manually traced lines 1462–1473 and
1489–1501 — every `${i.<field>}` is wrapped in `esc()`.

---

## Negatives — checks that found nothing

- `grep -r "dangerouslySetInnerHTML"` → 0 matches.
- `grep -r "document.write"` → 0 matches.
- `grep -r "outerHTML"` → 0 matches.
- `grep -r "insertAdjacentHTML"` → 0 matches.
- `grep -r "eval("` → 0 matches in app/server code.
- `grep -r "Function("` → no dynamic `new Function()` from UGC.
- All `res.send(...)` HTML sinks are either fully static (landing, privacy,
  terms, manifest, SVG icons, sw.js, init.js) or pass UGC through
  `escapeHtml` / `safeExternalUrl`.

---

## Recommendations (post-fix)

1. **Add a regression test** for `markdownToHtml` covering: `javascript:`,
   `data:`, `vbscript:`, backtick-only payloads, and the legitimate http
   case. Suggested location: `tests/rich-text-editor.test.ts`.
2. **Consider DOMPurify on web** as a defence-in-depth layer around the
   `webEditorRef.current.innerHTML = …` sink. The fix above closes the
   known hole; DOMPurify would catch future markdown-rule additions that
   reintroduce raw interpolation.
3. **CSP `script-src` audit** — the existing CSP (set in
   `server/_core/index.ts` security headers around line 294-300) does not
   currently set `script-src`. Adding `script-src 'self'` would have made
   the `javascript:` payload above non-exploitable even without the fix,
   because `javascript:` URLs are blocked under any non-trivial CSP. This
   is a separate, larger change (would need `'unsafe-inline'` or nonces
   for the `/app` and `/p/:token` inline `<script>`/`<style>`), tracked
   for a follow-up.
4. **Item content max length is enforced server-side at insert** (Zod
   schema in `server/routers/items.ts`) which limits payload size, not
   content. No change needed.
