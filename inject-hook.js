(() => {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("page-hook.js");
  s.async = false;
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
})();
