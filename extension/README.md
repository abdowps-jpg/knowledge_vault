# Knowledge Vault — Browser Clipper

A lightweight Chrome / Edge / Firefox extension (Manifest V3) that saves the
current page, selected text, or a link to your Knowledge Vault server in one
click. Uses the existing REST API — no separate auth, just your existing
**API key** with `write` scope (or `admin`).

## Features

- **Popup capture**: quick form pre-filled with the current tab's title, URL,
  and any selected text; pick link / note / quote and a destination
  (Inbox / Library / Archive).
- **Context menu**:
  - *Save page to Knowledge Vault* (whole page)
  - *Save selection as quote* (appends source URL)
  - *Save link to Knowledge Vault* (right-click any link)
- **Keyboard shortcut**: `Alt+Shift+S` quick-saves the current page without
  opening the popup.
- **Settings page**: configure API base URL + key, with a "Test connection"
  button.
- **Dark mode** aware, no external dependencies.

## Install (developer mode)

1. In the Knowledge Vault app: **Settings → API Keys & Webhooks → Generate
   API Key** (pick the **write** scope, copy the `kv_…` key).
2. Open `chrome://extensions` (or `edge://extensions`, `about:debugging` in
   Firefox).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this `extension/` folder.
5. Click the new Vault icon → **Settings**, paste:
   - **API Base URL**: `http://localhost:3000` (dev) or your production URL.
   - **API Key**: the key from step 1.
6. Click **Test connection** — should say "Connected successfully".
7. Visit any page and click the icon, or right-click to use the context menu.

## Firefox notes

Firefox supports Manifest V3 as of FF 109+. Background service workers are
emulated, but the `chrome.*` APIs (aliased as `browser.*`) used here work
without changes. To install:

1. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…**
2. Select `extension/manifest.json`.

## Permissions, explained

- `activeTab`: read the current tab's title/URL when the popup opens.
- `contextMenus`: register the three right-click menu entries.
- `storage`: save your API base + API key in `chrome.storage.sync`.
- `notifications`: show a toast when a save succeeds or fails in the background.
- `host_permissions: <all_urls>`: needed to POST to your Knowledge Vault
  server. The extension never reads the page contents on its own — only the
  content script responds when the popup asks for the current text selection.

## CORS

The Knowledge Vault server already allows CORS from `ALLOWED_ORIGINS` but
extension requests come from `chrome-extension://<id>` which is *not* a
browser-enforced same-origin context thanks to the `host_permissions` in the
manifest — the browser bypasses CORS for listed hosts. If you build for the
Firefox Add-on store you may need to add your extension ID to
`ALLOWED_ORIGINS` on the server.

## Packaging

```bash
cd extension
zip -r ../kv-clipper.zip . -x "source.svg" "README.md"
```

Upload `kv-clipper.zip` to the Chrome Web Store or Firefox Add-ons portal.

## Icons

Placeholder PNGs are copied from the mobile app. For store submission,
generate proper 16/32/48/128 PNGs from `icons/source.svg`.
