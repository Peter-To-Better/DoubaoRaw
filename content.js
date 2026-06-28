const ROOT_ID = "__doubao_clip_root__";
const BTN_ID = "__doubao_dl_btn__";
const TOAST_ID = "__doubao_clip_toast__";
const INTERCEPT_KEY = "__doubao_clip_intercept__";

const SVG_DOWNLOAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="vertical-align:middle"><path d="M12 4v12M6 12l6 6 6-6"/><line x1="4" y1="20" x2="20" y2="20"/></svg>';
const SVG_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="vertical-align:middle"><polyline points="20 6 9 17 4 12"/></svg>';
const SVG_XMARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="vertical-align:middle"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const SVG_IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align:middle"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
const SAVE_BTN_TEXT = /^(保存|保存图片|下载|下载图片|另存为|另存)$/;

const rawMap = new Map();
const downloadingHashes = new Set();
let contextDead = false;
let currentImg = null;
let hideTimeout = null;
let dlBtn = null;
let interceptSave = true;
try { interceptSave = localStorage.getItem(INTERCEPT_KEY) !== "off"; } catch {}

function isContextAlive() {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

function safeSend(msg, cb) {
  if (!isContextAlive()) { markDead(); cb?.(null); return; }
  try {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) { markDead(); cb?.(null); return; }
      cb?.(resp);
    });
  } catch { markDead(); cb?.(null); }
}

function markDead() {
  if (contextDead) return;
  contextDead = true;
  const root = document.getElementById(ROOT_ID);
  if (root) {
    const banner = root.querySelector(".dc-dead");
    if (banner) banner.style.display = "block";
  }
}

function extractHash(url) {
  if (!url) return null;
  try {
    const u = new URL(url, location.href);
    const m = u.pathname.match(/[a-f0-9]{32}/i);
    return m ? m[0].toLowerCase() : null;
  } catch { return null; }
}

function decodeEscapes(s) {
  return s
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003[dD]/g, '=')
    .replace(/\\u003[fF]/g, '?')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

function scanPageStateForRaws() {
  const sources = [document.documentElement.innerHTML];
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('jam_') || /events|console|network|log/i.test(k)) continue;
      sources.push(localStorage.getItem(k) || '');
    }
  } catch {}
  for (const k of ['_CHAT_APP_', '_ROUTER_DATA', '__INITIAL_STATE__', '__NEXT_DATA__']) {
    try {
      const v = window[k];
      if (v) sources.push(typeof v === 'string' ? v : JSON.stringify(v));
    } catch {}
  }
  let added = 0;
  for (const text of sources) {
    const decoded = decodeEscapes(text);
    for (const m of decoded.matchAll(/https?:\/\/[^\s"'<>\\)]+image_raw[^\s"'<>\\)]+/g)) {
      const url = m[0].replace(/[\\,;]+$/, '');
      if (!/x-signature=/.test(url)) continue;
      const hm = url.match(/\/([a-f0-9]{32})\.(?:jpe?g|png)/);
      if (!hm) continue;
      const hash = hm[1];
      const existing = rawMap.get(hash);
      const isRawB = /image_raw_b/.test(url);
      const existingHasSig = existing && /x-signature=/.test(existing.url);
      if (
        !existing ||
        !existingHasSig ||
        (isRawB && !/image_raw_b/.test(existing.url))
      ) {
        rawMap.set(hash, { url, source: 'state', size: existing?.size || 0, ts: Date.now() });
        added++;
      }
    }
  }
  if (added > 0) {
    updatePill();
    const panel = document.querySelector('#' + ROOT_ID + ' .dc-panel');
    if (panel && !panel.hasAttribute('hidden')) renderList();
  }
  return added;
}

async function downloadCleanByHash(hash) {
  const entry = rawMap.get(hash);
  if (!entry) return { ok: false, reason: 'no_url' };
  try {
    const r = await fetch(entry.url);
    if (!r.ok) return { ok: false, reason: 'http_' + r.status };
    const blob = await r.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `doubao-${hash.slice(0, 12)}.png`;
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    return { ok: true, size: blob.size };
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }
}

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
  return bytes + " B";
}

function urlBasename(url) {
  try {
    const u = new URL(url);
    return u.pathname.split("/").filter(Boolean).pop() || "image";
  } catch { return "image"; }
}

// -------- Hover download button --------

function ensureDlBtn() {
  if (dlBtn && document.body.contains(dlBtn)) return dlBtn;
  dlBtn = document.createElement("button");
  dlBtn.id = BTN_ID;
  dlBtn.type = "button";
  dlBtn.title = "下載原圖（去浮水印）";
  dlBtn.innerHTML = SVG_DOWNLOAD;

  dlBtn.addEventListener("mouseenter", () => clearTimeout(hideTimeout));
  dlBtn.addEventListener("mouseleave", scheduleHide);

  dlBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!currentImg) return;
    const clickedImg = currentImg;
    const hash = extractHash(clickedImg.currentSrc || clickedImg.src);
    if (!hash) return;
    if (downloadingHashes.has(hash)) return;

    downloadingHashes.add(hash);
    refreshHoverBtnState();

    const resp = await downloadCleanByHash(hash);

    downloadingHashes.delete(hash);

    const hoveringSameHash =
      currentImg && extractHash(currentImg.currentSrc || currentImg.src) === hash;

    if (hoveringSameHash) {
      dlBtn.classList.remove("dc-loading");
      if (resp.ok) {
        dlBtn.classList.add("dc-success");
        dlBtn.innerHTML = SVG_CHECK;
      } else {
        dlBtn.classList.add("dc-error");
        dlBtn.innerHTML = SVG_XMARK;
      }
      setTimeout(() => {
        dlBtn.classList.remove("dc-success", "dc-error");
        if (currentImg && extractHash(currentImg.currentSrc || currentImg.src) === hash) {
          dlBtn.innerHTML = SVG_DOWNLOAD;
        } else {
          refreshHoverBtnState();
        }
      }, 1500);
    } else {
      refreshHoverBtnState();
    }

    if (!resp.ok) showToast("下載失敗：" + resp.reason, "error");
  });

  (document.body || document.documentElement).appendChild(dlBtn);
  return dlBtn;
}

function positionBtn(img) {
  const rect = img.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 80) return false;
  const btn = ensureDlBtn();
  btn.style.top = (rect.top + 8) + "px";
  btn.style.left = (rect.right - 44) + "px";
  return true;
}

function hasRawFor(img) {
  if (!img || img.tagName !== "IMG") return false;
  const src = img.currentSrc || img.src || "";
  if (!/byteimg\.com/i.test(src)) return false;
  const hash = extractHash(src);
  return hash ? rawMap.has(hash) : false;
}

function refreshHoverBtnState() {
  if (!dlBtn || !currentImg) return;
  const hash = extractHash(currentImg.currentSrc || currentImg.src);
  if (!hash) return;
  if (downloadingHashes.has(hash)) {
    dlBtn.classList.add("dc-loading");
    dlBtn.classList.remove("dc-success", "dc-error");
    dlBtn.innerHTML = '<span class="dc-spinner"></span>';
  } else if (!dlBtn.classList.contains("dc-success") && !dlBtn.classList.contains("dc-error")) {
    dlBtn.classList.remove("dc-loading");
    dlBtn.innerHTML = SVG_DOWNLOAD;
  }
}

function showBtnFor(img) {
  if (!positionBtn(img)) return;
  const btn = ensureDlBtn();
  btn.style.display = "flex";
  refreshHoverBtnState();
}

function scheduleHide() {
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    if (dlBtn) dlBtn.style.display = "none";
    currentImg = null;
  }, 250);
}

document.addEventListener("mouseover", (e) => {
  const img = e.target?.closest?.("img");
  if (!img) return;
  if (!hasRawFor(img)) return;
  currentImg = img;
  clearTimeout(hideTimeout);
  showBtnFor(img);
}, true);

document.addEventListener("mouseout", (e) => {
  if (!currentImg) return;
  const img = e.target?.closest?.("img");
  if (img === currentImg) scheduleHide();
}, true);

const reposition = () => {
  if (!currentImg || !dlBtn || dlBtn.style.display === "none") return;
  positionBtn(currentImg);
};
window.addEventListener("scroll", reposition, true);
window.addEventListener("resize", reposition);

// -------- Toast --------

function showToast(text, kind) {
  let t = document.getElementById(TOAST_ID);
  if (!t) {
    t = document.createElement("div");
    t.id = TOAST_ID;
    (document.body || document.documentElement).appendChild(t);
  }
  t.innerHTML = "";
  if (kind === "loading") {
    const sp = document.createElement("span");
    sp.className = "dc-spinner";
    t.appendChild(sp);
  }
  t.appendChild(document.createTextNode(text));
  t.className = "dc-show" + (kind === "error" ? " dc-toast-err" : "");
  clearTimeout(t.__hideTimer);
  if (kind !== "loading") {
    t.__hideTimer = setTimeout(() => { t.className = ""; }, 2400);
  }
}

// -------- Intercept "保存" button --------

function findVisibleAiImage() {
  let best = null, bestArea = 0;
  for (const img of document.images) {
    const src = img.currentSrc || img.src || "";
    if (!/byteimg\.com/i.test(src)) continue;
    if (!extractHash(src)) continue;
    const rect = img.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 150) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    if (rect.right < 0 || rect.left > window.innerWidth) continue;
    const area = rect.width * rect.height;
    if (area > bestArea) { best = img; bestArea = area; }
  }
  return best;
}

function looksLikeSaveButton(target) {
  let el = target;
  for (let i = 0; i < 5 && el && el.nodeType === 1; i++, el = el.parentElement) {
    const text = (el.textContent || "").trim();
    if (text && text.length <= 8 && SAVE_BTN_TEXT.test(text)) return true;
  }
  return false;
}

document.addEventListener("click", async (e) => {
  if (!interceptSave) return;
  if (!looksLikeSaveButton(e.target)) return;

  const img = findVisibleAiImage();
  if (!img) return;
  const hash = extractHash(img.currentSrc || img.src);
  if (!hash) return;
  scanPageStateForRaws();
  if (!rawMap.has(hash)) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  showToast("正在下載原圖（去浮水印）…", "loading");
  const resp = await downloadCleanByHash(hash);
  if (resp.ok) {
    showToast("已下載無浮水印原圖 (" + (resp.size / 1024 / 1024).toFixed(1) + " MB)");
  } else {
    showToast("下載失敗：" + resp.reason, "error");
  }
}, true);

// -------- Status pill + history panel --------

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;
  root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <div class="dc-pill" data-count="0">
      <span class="dc-pill-icon">${SVG_IMAGE}</span>
      <span class="dc-pill-count">0</span>
    </div>
    <div class="dc-panel" hidden>
      <div class="dc-header">
        <span class="dc-title">已偵測到的原圖</span>
        <button class="dc-close" type="button">×</button>
      </div>
      <div class="dc-dead" style="display:none">插件已重新載入，請重新整理此頁面。</div>
      <div class="dc-hint">
        滑鼠移到圖片上會顯示下載按鈕。下方清單為歷史紀錄。
        <label class="dc-toggle-row">
          <input type="checkbox" class="dc-intercept" />
          <span>攔截「保存」按鈕，自動下載無浮水印原圖</span>
        </label>
      </div>
      <div class="dc-list"></div>
      <div class="dc-actions">
        <button class="dc-clear" type="button">清空</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(root);

  root.querySelector(".dc-pill").addEventListener("click", () => togglePanel());
  root.querySelector(".dc-close").addEventListener("click", () => togglePanel(false));
  root.querySelector(".dc-clear").addEventListener("click", (e) => {
    e.stopPropagation();
    safeSend({ type: "CLEAR" }, () => { rawMap.clear(); updatePill(); renderList(); });
  });
  const intercept = root.querySelector(".dc-intercept");
  intercept.checked = interceptSave;
  intercept.addEventListener("change", () => {
    interceptSave = intercept.checked;
    try { localStorage.setItem(INTERCEPT_KEY, interceptSave ? "on" : "off"); } catch {}
    showToast(interceptSave ? "已啟用「保存」攔截" : "已停用「保存」攔截");
  });
  return root;
}

function updatePill() {
  const root = ensureRoot();
  const pill = root.querySelector(".dc-pill");
  const n = rawMap.size;
  pill.dataset.count = n;
  root.querySelector(".dc-pill-count").textContent = n;
}

function togglePanel(force) {
  const root = ensureRoot();
  const panel = root.querySelector(".dc-panel");
  const open = force ?? panel.hasAttribute("hidden");
  if (open) {
    panel.removeAttribute("hidden");
    renderList();
  } else {
    panel.setAttribute("hidden", "");
  }
}

function renderList() {
  const root = ensureRoot();
  const list = root.querySelector(".dc-list");
  list.innerHTML = "";
  const entries = Array.from(rawMap.entries())
    .map(([hash, v]) => ({ hash, ...v }))
    .sort((a, b) => b.ts - a.ts);
  if (!entries.length) {
    list.innerHTML = '<div class="dc-empty">尚未偵測到原圖。瀏覽或載入豆包圖片即會自動收集。</div>';
    return;
  }
  const maxSize = Math.max(...entries.map(e => e.size || 0));
  entries.forEach((e, idx) => {
    const isBig = e.size && e.size === maxSize;
    const isNew = idx === 0;
    const item = document.createElement("div");
    item.className = "dc-item" + (isBig ? " is-biggest" : "");
    const tags = [];
    if (isNew) tags.push('<span class="dc-tag newest">NEW</span>');
    if (isBig) tags.push('<span class="dc-tag star">★</span>');
    item.innerHTML = `
      <div class="dc-thumb"><img src="${e.url}" alt=""></div>
      <div class="dc-meta">
        <div class="dc-row1">${tags.join("")}<span class="dc-size">${formatSize(e.size)}</span></div>
        <div class="dc-url" title="${e.url}">${e.hash.slice(0, 16)}…</div>
        <div class="dc-row2">
          <button data-act="download" type="button">下載</button>
          <button data-act="open" type="button">新分頁</button>
          <button data-act="copy" type="button">複製</button>
        </div>
      </div>
    `;
    const thumbImg = item.querySelector(".dc-thumb img");
    if (thumbImg) thumbImg.addEventListener("error", () => { thumbImg.style.visibility = "hidden"; });
    item.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const act = btn.dataset.act;
        if (act === "download") {
          if (downloadingHashes.has(e.hash)) return;
          downloadingHashes.add(e.hash);
          btn.disabled = true;
          btn.innerHTML = '<span class="dc-spinner"></span>';
          refreshHoverBtnState();
          const resp = await downloadCleanByHash(e.hash);
          downloadingHashes.delete(e.hash);
          btn.disabled = false;
          btn.innerHTML = "";
          btn.textContent = resp.ok ? "✓" : "✕";
          refreshHoverBtnState();
          if (!resp.ok) showToast(resp.reason, "error");
          setTimeout(() => (btn.textContent = "下載"), 1200);
        } else if (act === "open") {
          window.open(e.url, "_blank", "noopener");
        } else if (act === "copy") {
          try {
            await navigator.clipboard.writeText(e.url);
            btn.textContent = "已複製";
          } catch {
            btn.textContent = "失敗";
          }
          setTimeout(() => (btn.textContent = "複製"), 1200);
        }
      });
    });
    list.appendChild(item);
  });
}

// -------- Messages --------

try {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "RAW_FOUND") {
      rawMap.set(msg.hash, msg.entry);
      updatePill();
      const panel = document.querySelector(`#${ROOT_ID} .dc-panel`);
      if (panel && !panel.hasAttribute("hidden")) renderList();
      if (currentImg && hasRawFor(currentImg)) showBtnFor(currentImg);
    }
    if (msg.type === "TOGGLE_PANEL") {
      togglePanel();
    }
  });
} catch { markDead(); }

ensureRoot();
ensureDlBtn();
safeSend({ type: "GET_ALL" }, (resp) => {
  if (!resp?.entries) return;
  for (const e of resp.entries) {
    rawMap.set(e.hash, { url: e.url, pathname: e.pathname, size: e.size, ts: e.ts, source: 'network' });
  }
  updatePill();
});

scanPageStateForRaws();
setInterval(scanPageStateForRaws, 5000);
window.addEventListener("focus", scanPageStateForRaws);
document.addEventListener("click", () => setTimeout(scanPageStateForRaws, 300), true);

// 接收 page-hook.js 從主世界送過來的 image_raw URLs
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (e.data?.source !== "__doubao_clip__" || e.data?.type !== "raws") return;
  const urls = e.data.urls || [];
  let added = 0;
  for (const u of urls) {
    const url = String(u).replace(/[\\,;]+$/, "");
    if (!/x-signature=/.test(url)) continue;
    const m = url.match(/\/([a-f0-9]{32})\.(?:jpe?g|png)/);
    if (!m) continue;
    const hash = m[1];
    const existing = rawMap.get(hash);
    const isRawB = /image_raw_b/.test(url);
    const existingHasSig = existing && /x-signature=/.test(existing.url);
    if (
      !existing ||
      (!existingHasSig) ||
      (isRawB && !/image_raw_b/.test(existing.url))
    ) {
      rawMap.set(hash, { url, source: "api", ts: Date.now() });
      added++;
    }
  }
  if (added > 0) {
    updatePill();
    const panel = document.querySelector("#" + ROOT_ID + " .dc-panel");
    if (panel && !panel.hasAttribute("hidden")) renderList();
    if (currentImg && hasRawFor(currentImg)) showBtnFor(currentImg);
  }
});
