const MIN_SIZE = 200 * 1024;
const HOST_PATTERNS = [
  "doubao.com",
  "byteimg.com",
  "bytedance.com",
  "bytetcc.com",
  "bytecdn.cn",
  "volccdn.com"
];

const tabRaws = new Map();

function getHeader(headers, name) {
  if (!headers) return null;
  const n = name.toLowerCase();
  for (const h of headers) if (h.name.toLowerCase() === n) return h.value;
  return null;
}

function hostMatches(url) {
  try {
    const h = new URL(url).hostname;
    return HOST_PATTERNS.some(p => h.endsWith(p));
  } catch { return false; }
}

function extractHash(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/[a-f0-9]{32}/i);
    return m ? m[0].toLowerCase() : null;
  } catch { return null; }
}

function getRawMap(tabId) {
  if (!tabRaws.has(tabId)) tabRaws.set(tabId, new Map());
  return tabRaws.get(tabId);
}

function updateBadge(tabId, count) {
  if (count > 0) {
    chrome.action.setBadgeText({ tabId, text: String(count) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#22c55e" });
  } else {
    chrome.action.setBadgeText({ tabId, text: "" });
  }
}

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;
    if (!hostMatches(details.url)) return;

    const ct = getHeader(details.responseHeaders, "content-type") || "";
    if (!ct.startsWith("image/")) return;

    let pathname;
    try { pathname = new URL(details.url).pathname; } catch { return; }
    if (!/image_raw/i.test(pathname)) return;

    const clen = parseInt(getHeader(details.responseHeaders, "content-length") || "0", 10);
    if (clen && clen < MIN_SIZE) return;

    const hash = extractHash(details.url);
    if (!hash) return;

    const map = getRawMap(details.tabId);
    const existing = map.get(hash);
    const entry = {
      url: details.url,
      pathname,
      size: clen || existing?.size || 0,
      ts: Date.now()
    };
    map.set(hash, entry);

    updateBadge(details.tabId, map.size);

    chrome.tabs.sendMessage(details.tabId, {
      type: "RAW_FOUND",
      hash,
      entry
    }).catch(() => {});
  },
  {
    urls: [
      "*://*.doubao.com/*",
      "*://*.byteimg.com/*",
      "*://*.bytedance.com/*",
      "*://*.bytetcc.com/*",
      "*://*.bytecdn.cn/*",
      "*://*.volccdn.com/*"
    ],
    types: ["image", "xmlhttprequest", "media", "other"]
  },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener((tabId) => {
  tabRaws.delete(tabId);
});

chrome.webNavigation?.onCommitted?.addListener?.((details) => {
  if (details.frameId === 0) {
    tabRaws.delete(details.tabId);
    updateBadge(details.tabId, 0);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
  } catch {
    if (!/doubao\.com/.test(tab.url || "")) {
      chrome.tabs.create({ url: "https://www.doubao.com/" });
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!sender.tab) return;
  const tabId = sender.tab.id;

  if (msg.type === "GET_ALL") {
    const map = getRawMap(tabId);
    const entries = Array.from(map.entries())
      .map(([hash, v]) => ({ hash, ...v }))
      .sort((a, b) => b.ts - a.ts);
    sendResponse({ entries });
    return true;
  }
  if (msg.type === "DOWNLOAD_BY_HASH") {
    const map = getRawMap(tabId);
    const entry = map.get(msg.hash);
    if (!entry) { sendResponse({ ok: false, reason: "not_found" }); return true; }
    chrome.downloads.download({
      url: entry.url,
      filename: `doubao-${msg.hash.slice(0, 12)}.png`,
      saveAs: false
    }, (id) => {
      sendResponse({ ok: !!id, error: chrome.runtime.lastError?.message });
    });
    return true;
  }
  if (msg.type === "DOWNLOAD") {
    chrome.downloads.download({
      url: msg.url,
      filename: msg.filename || `doubao-${Date.now()}.png`,
      saveAs: false
    }, (id) => {
      sendResponse({ ok: !!id, error: chrome.runtime.lastError?.message });
    });
    return true;
  }
  if (msg.type === "CLEAR") {
    tabRaws.delete(tabId);
    updateBadge(tabId, 0);
    sendResponse({ ok: true });
    return true;
  }
});
