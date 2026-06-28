# DoubaoRaw — Watermark-Free Image Downloader for Doubao AI

[繁體中文](#繁體中文) | [English](#english)

---

## 繁體中文

一款 Chrome 擴充功能，能自動偵測豆包（doubao.com）AI 生成圖片的無浮水印原始 URL，並提供一鍵下載功能。

### 功能特色

- **懸停下載按鈕**：滑鼠移到圖片上，右上角自動出現下載按鈕，點擊即可下載無浮水印原圖。
- **攔截「保存」按鈕**：可選擇性攔截頁面原本的保存按鈕，改為下載無浮水印原始檔案。
- **歷史紀錄面板**：右下角浮動 Pill 顯示已偵測到的圖片數量，展開後可下載、開新分頁、或複製圖片 URL。
- **自動掃描**：每 5 秒、頁面獲得焦點時、以及點擊頁面時自動重新掃描，持續收集新出現的原圖 URL。

### 安裝方式

1. 下載或 Clone 本 Repository。
2. 開啟 Chrome，前往 `chrome://extensions/`。
3. 開啟右上角的**開發人員模式**。
4. 點擊**載入未封裝項目**，選擇本專案的資料夾。
5. 安裝完成後，前往 doubao.com 即可使用。

### 使用方式

#### 懸停下載

1. 在豆包頁面瀏覽或生成 AI 圖片。
2. 將滑鼠移到圖片上，右上角出現綠色下載按鈕。
3. 點擊後瀏覽器自動下載無浮水印原圖，檔名格式為 `doubao-<hash前12碼>.png`。

#### 攔截「保存」按鈕

1. 點擊右下角的浮動 Pill 開啟面板。
2. 勾選「**攔截「保存」按鈕，自動下載無浮水印原圖**」。
3. 之後點擊豆包頁面上的保存/下載按鈕時，自動改為下載無浮水印原始檔案。

#### 歷史紀錄面板

- 點擊右下角 Pill 展開面板，面板中每張圖片提供三個操作：
  - **下載**：下載無浮水印原圖至本機。
  - **新分頁**：在新分頁中開啟原始圖片 URL。
  - **複製**：將原始圖片 URL 複製至剪貼簿。
- 點擊**清空**可清除所有歷史紀錄。

### 抓取原始圖片的原理

#### 問題背景

豆包 AI 生成圖片在頁面顯示的版本帶有浮水印，URL 指向 `image_compressed` 等縮圖端點。真正的無浮水印原圖（`image_raw` 或 `image_raw_b`）存在於伺服器上，但不直接出現在 `<img>` 標籤的 `src` 屬性中。

#### 三層偵測機制

**1. 攔截 XHR / Fetch 網路請求**（`inject-hook.js`）

`inject-hook.js` 以 MAIN world 注入頁面，劫持原生的 `XMLHttpRequest` 與 `fetch`：

```
原生 fetch
  → 被 Hook 的 fetch
  → 掃描 Response body 中的 image_raw URL
  → 透過 postMessage 傳給 content script
```

當頁面呼叫 AI 生成 API 並取回 JSON 結果時，Hook 即時從 Response 中截取含 `x-signature` 簽名的完整可下載 URL。

**2. 掃描頁面狀態**（`content.js` → `scanPageStateForRaws`）

定期掃描 `document.documentElement.innerHTML`、`localStorage`，以及常見的全域變數（`_CHAT_APP_`、`__NEXT_DATA__` 等），以正規表達式搜尋符合以下條件的 URL：

- 路徑包含 `image_raw`
- 包含 `x-signature=` 查詢參數（有效簽名 URL 的特徵）
- 路徑中帶有 32 位元十六進位 hash（圖片唯一識別碼）

**3. Background Script 推送**（`background.js`）

Background Service Worker 透過 `chrome.webRequest` API 監聽所有網路請求，偵測到含 `image_raw` 的請求時，主動推送給 content script 更新列表。

#### URL 去重與優先級

每張圖片以 URL 路徑中的 32 位元 MD5 hash 作為唯一 Key，相同 hash 出現多個 URL 時優先保留：

1. `image_raw_b`（通常解析度更高）優先於 `image_raw`
2. 含 `x-signature` 的 URL 優先於不含的

#### 下載流程

```
1. content script 以 fetch() 從原始 URL 取得 Blob
2. 建立 Blob URL（URL.createObjectURL）
3. 動態插入隱藏的 <a download> 標籤並模擬點擊
4. 60 秒後自動釋放 Blob URL（URL.revokeObjectURL）
```

下載直接由 content script 在頁面 origin 下執行，無需額外的 Native Host。

### 專案檔案說明

| 檔案 | 說明 |
| --- | --- |
| `manifest.json` | 擴充功能設定（權限、content scripts、background） |
| `content.js` | 主要邏輯：UI、掃描、下載、歷史面板 |
| `content.css` | 懸停按鈕、Toast、面板的樣式 |
| `background.js` | Service Worker：監聽網路請求、儲存 URL、推送給 content script |
| `inject-hook.js` | 注入 MAIN world，Hook XHR 與 fetch 截取 API 回應 |
| `page-hook.js` | 在主世界中轉發訊息給 content script |

---

## English

A Chrome extension that automatically detects watermark-free original image URLs from Doubao (doubao.com) AI-generated images and provides one-click downloading.

### Features

- **Hover download button**: Move your mouse over any detected image and a download button appears in the top-right corner — click to download the watermark-free original.
- **"Save" button interception**: Optionally intercept Doubao's built-in save/download buttons to redirect them to the clean original file instead.
- **History panel**: A floating pill in the bottom-right corner shows how many images have been detected. Click it to open a history panel with download, open, and copy options for each image.
- **Auto-scan**: Automatically re-scans every 5 seconds, on page focus, and on click — continuously collecting new raw image URLs as they appear.

### Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the project folder.
5. Done — navigate to doubao.com and start using it.

### How to Use

#### Hover to Download

1. Browse or generate AI images on Doubao.
2. Hover your mouse over an image — a green download button appears in the top-right corner.
3. Click it. The browser downloads the watermark-free original, saved as `doubao-<first-12-chars-of-hash>.png`.

#### Intercept the "Save" Button

1. Click the floating pill in the bottom-right to open the panel.
2. Check **"Intercept 'Save' button to auto-download watermark-free originals"**.
3. From now on, clicking Doubao's native save/download buttons will trigger a clean download instead.

#### History Panel

- Click the pill to expand the panel. Each detected image shows three actions:
  - **Download**: Save the watermark-free original to your machine.
  - **New tab**: Open the raw image URL in a new tab.
  - **Copy**: Copy the raw image URL to your clipboard.
- Click **Clear** to wipe all history.

### How It Detects Original Images

#### Background

Images displayed on Doubao carry watermarks and point to compressed/thumbnail endpoints (e.g., `image_compressed`). The true watermark-free originals (`image_raw` or `image_raw_b`) exist on the server but are never placed directly in `<img src>` attributes on the page.

#### Three-Layer Detection

**1. XHR / Fetch Interception** (`inject-hook.js`)

`inject-hook.js` is injected into the page's MAIN world and patches the native `XMLHttpRequest` and `fetch`:

```
Native fetch
  → Hooked fetch
  → Scan Response body for image_raw URLs
  → Forward to content script via postMessage
```

When the page calls the AI generation API and receives a JSON response, the hook immediately extracts the full downloadable URL — including the `x-signature` auth parameter — before the page has a chance to discard it.

**2. Page State Scanning** (`content.js` → `scanPageStateForRaws`)

Periodically scans `document.documentElement.innerHTML`, `localStorage`, and common global variables (`_CHAT_APP_`, `__NEXT_DATA__`, etc.) using a regex that looks for URLs matching all of:

- Path contains `image_raw`
- Query string contains `x-signature=` (the signed, downloadable URL marker)
- Path contains a 32-character hex hash (the unique image identifier)

**3. Background Script Push** (`background.js`)

The background Service Worker listens to all network traffic via `chrome.webRequest`. When it detects a request containing `image_raw`, it proactively pushes the entry to the content script via `chrome.tabs.sendMessage`.

#### Deduplication and Priority

Each image is keyed by the 32-character MD5 hash in its URL path (`rawMap`). When multiple URLs share the same hash, the extension keeps the best one:

1. `image_raw_b` (typically higher resolution) takes priority over `image_raw`
2. URLs containing `x-signature` take priority over those without

#### Download Flow

```
1. content script fetches the raw URL directly → receives a Blob
2. Creates a Blob URL (URL.createObjectURL)
3. Injects a hidden <a download> tag and triggers a simulated click
4. Revokes the Blob URL after 60 seconds (URL.revokeObjectURL)
```

Because the download runs inside the content script under the page's own origin, it sidesteps most cross-origin restrictions without requiring a Native Messaging host.

### File Overview

| File | Description |
| --- | --- |
| `manifest.json` | Extension config: permissions, content scripts, background |
| `content.js` | Core logic: UI, scanning, downloading, history panel |
| `content.css` | Styles for the hover button, toast notifications, and panel |
| `background.js` | Service Worker: intercepts network requests, stores URLs, pushes to content script |
| `inject-hook.js` | Injected into MAIN world to hook XHR and fetch for API response interception |
| `page-hook.js` | Relay script that forwards messages from the main world to the content script |
