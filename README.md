<div align="center">

# DoubaoRaw

**一鍵下載豆包 AI 生成圖片的無浮水印原圖**<br>
Download watermark-free original images from Doubao AI in one click

[![Platform](https://img.shields.io/badge/Platform-doubao.com-FF6B35?style=flat-square)](https://www.doubao.com)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](#安裝方式)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34a853?style=flat-square)](#)
[![No Build](https://img.shields.io/badge/build-none-lightgrey?style=flat-square)](#)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#license)

**[繁體中文](#繁體中文) · [English](#english)**

[![Demo Video](https://img.youtube.com/vi/9XtyPzI1fLI/maxresdefault.jpg)](https://youtu.be/9XtyPzI1fLI)

</div>

---

## 繁體中文

豆包（doubao.com）頁面顯示的 AI 圖片帶有浮水印，真正的無浮水印原圖（`image_raw` / `image_raw_b`）隱藏在 API 回應中，不出現在任何 `<img src>` 屬性裡。DoubaoRaw 以三層機制同時偵測，並在圖片上疊加一鍵下載按鈕。

### 功能特色

| 功能 | 說明 |
| --- | --- |
| **懸停下載按鈕** | 滑鼠移到圖片上，右上角自動出現綠色下載按鈕 |
| **攔截「保存」按鈕** | 可選擇性攔截頁面原本的保存按鈕，改為下載無浮水印原始檔案 |
| **歷史紀錄面板** | 右下角浮動 Pill 顯示偵測到的圖片數量，可下載、開新分頁或複製 URL |
| **自動掃描** | 每 5 秒、頁面獲得焦點及點擊時自動掃描，持續收集新出現的原圖 |

### 安裝方式

> 不需要 Node.js、npm 或任何建置工具。

1. Clone 或下載此 Repository
2. 前往 `chrome://extensions/`，開啟右上角**開發人員模式**
3. 點擊**載入未封裝項目**，選擇本專案資料夾
4. 前往 [doubao.com](https://www.doubao.com) 即可使用

### 使用方式

**懸停下載**：滑鼠移到圖片上 → 點擊右上角綠色按鈕 → 下載完成（檔名：`doubao-<hash前12碼>.png`）

**攔截保存按鈕**：右下角 Pill → 展開面板 → 勾選「攔截『保存』按鈕」→ 之後點豆包頁面的保存/下載按鈕即自動替換為原圖下載

**歷史面板**：點右下角 Pill 展開 → 對每張圖片可執行：**下載** / **新分頁** / **複製 URL** / **清空全部**

### 偵測原理

DoubaoRaw 以三層機制確保不漏掉任何原圖 URL：

```
Layer 1 │ inject-hook.js (MAIN world)
        │ 劫持 window.fetch 與 XMLHttpRequest，從 API 回應 JSON 中即時截取 URL
        ↓
Layer 2 │ content.js → scanPageStateForRaws()
        │ 定期掃描 innerHTML、localStorage、_CHAT_APP_、__NEXT_DATA__ 等全域變數
        ↓
Layer 3 │ background.js (Service Worker)
        │ 透過 chrome.webRequest 監聽 image_raw 網路請求，主動推送給 content script
```

**去重規則**：每張圖片以 URL 路徑中的 32 字元 MD5 hash 為唯一 Key。相同 hash 出現多個 URL 時，`image_raw_b` 優先於 `image_raw`，含 `x-signature=` 優先於不含。

---

## English

Images shown on Doubao carry watermarks and point to compressed endpoints. The true watermark-free originals (`image_raw` / `image_raw_b`) live in API responses and never appear in any `<img src>` attribute. DoubaoRaw intercepts them with a three-layer detection system and overlays a one-click download button on every detected image.

### Features

| Feature | Description |
| --- | --- |
| **Hover download button** | Green download button appears over any detected image on hover |
| **"Save" button interception** | Optionally redirect Doubao's native save button to the clean original |
| **History panel** | Floating pill (bottom-right) shows detected count; expand to download, open, or copy URLs |
| **Auto-scan** | Re-scans every 5 seconds, on focus, and on click — catches images that load late |

### Installation

> No Node.js, npm, or build step required.

1. Clone or download this repository
2. Go to `chrome://extensions/` and enable **Developer mode**
3. Click **Load unpacked** and select the project folder
4. Navigate to [doubao.com](https://www.doubao.com) — you're done

### How to Use

**Hover to download**: Hover over any image → click the green button (top-right) → file saved as `doubao-<first-12-chars-of-hash>.png`

**Intercept "Save"**: Click the pill (bottom-right) → expand panel → check "Intercept Save button" → Doubao's native save buttons now download the watermark-free original

**History panel**: Click the pill to expand → per-image actions: **Download** / **New tab** / **Copy URL** / **Clear all**

### How It Works

Three detection layers run in parallel to ensure no raw URL is ever missed:

```
Layer 1 │ inject-hook.js (MAIN world)
        │ Patches window.fetch & XMLHttpRequest to scan every API response in real time
        ↓
Layer 2 │ content.js → scanPageStateForRaws()
        │ Polls innerHTML, localStorage, _CHAT_APP_, __NEXT_DATA__, etc. via regex
        ↓
Layer 3 │ background.js (Service Worker)
        │ Watches chrome.webRequest for image_raw network requests and pushes to content script
```

**Deduplication**: each image is keyed by the 32-char MD5 hash in its URL path. When multiple URLs share the same hash, `image_raw_b` beats `image_raw`; URLs with `x-signature=` beat those without.

**Download flow**: `fetch(url)` → `Blob` → `URL.createObjectURL` → hidden `<a download>` click — no Native Messaging host required.

---

## License

[MIT](LICENSE)
