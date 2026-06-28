# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DoubaoRaw is a Chrome Extension (Manifest V3) that intercepts and downloads watermark-free original images (`image_raw` / `image_raw_b`) from doubao.com. There is no build step — all files are vanilla JS/CSS loaded directly by Chrome.

## Installation / Loading

1. Go to `chrome://extensions/` → enable **Developer mode**
2. Click **Load unpacked** → select this folder
3. After any JS/CSS change, click the reload icon on the extension card in `chrome://extensions/`

No npm, no bundler, no transpilation.

## Architecture

The extension has three distinct execution contexts that communicate via messages:

### 1. MAIN world injection (`page-hook.js` → `inject-hook.js`)

`page-hook.js` runs as a content script in the **isolated world** but its sole job is to inject `inject-hook.js` into the **MAIN world** (so it shares the page's JS environment). `inject-hook.js` monkey-patches `window.fetch` and `XMLHttpRequest.prototype.send` to scan every JSON/text API response for `image_raw` URLs and forward them to the content script via `window.postMessage({ source: '__doubao_clip__', type: 'raws', urls })`.

### 2. Content script (`content.js` + `content.css`)

Runs in the **isolated world**. It is the central coordinator:

- Maintains `rawMap: Map<hash, entry>` — the source of truth for detected raw image URLs
- **Three ingestion paths** that all call into `rawMap`:
  - `window.addEventListener('message')` — receives URLs from `inject-hook.js` (XHR/fetch hook)
  - `chrome.runtime.onMessage` (`RAW_FOUND`) — receives URLs pushed by `background.js`
  - `scanPageStateForRaws()` — polls DOM innerHTML, localStorage, and global JS vars (`_CHAT_APP_`, `__NEXT_DATA__`, etc.) via regex
- Renders all UI: hover download button (`#__doubao_dl_btn__`), floating pill + history panel (`#__doubao_clip_root__`), toast notifications (`#__doubao_clip_toast__`)
- Downloads via `fetch(url) → blob → URL.createObjectURL → hidden <a download> click`

### 3. Background Service Worker (`background.js`)

- Uses `chrome.webRequest.onCompleted` to observe all network responses on doubao/byteimg/volccdn hosts
- Filters for `image/` content-type + `image_raw` in pathname + ≥ 200 KB
- Stores entries in `tabRaws: Map<tabId, Map<hash, entry>>`
- Pushes `{ type: 'RAW_FOUND', hash, entry }` to the active tab's content script
- Handles messages from content script: `GET_ALL`, `DOWNLOAD_BY_HASH`, `DOWNLOAD`, `CLEAR`
- Clears per-tab data on navigation (`webNavigation.onCommitted`) and tab close

## Key Invariants

**URL deduplication**: Each image is keyed by the 32-character hex hash extracted from the URL pathname (e.g. `/image_raw/abc123...def456.jpg`). When multiple URLs map to the same hash, priority is: `image_raw_b` > `image_raw`, and URLs with `x-signature=` > those without.

**`x-signature` requirement**: Only URLs containing `x-signature=` in the query string are accepted as valid downloadable originals. URLs without it are discarded.

**`inject-hook.js` is not a content script**: It is listed in `manifest.json` only as a web-accessible resource (implicitly). It is fetched via `chrome.runtime.getURL('inject-hook.js')` inside `page-hook.js` and injected as a `<script>` tag. This is the standard MV3 pattern for MAIN-world injection without using `"world": "MAIN"` on the script tag directly.

**Context death detection**: `content.js` checks `chrome.runtime.id` before every `sendMessage`. If the extension is reloaded without a page refresh, `contextDead` is set to `true` and a banner is shown.
