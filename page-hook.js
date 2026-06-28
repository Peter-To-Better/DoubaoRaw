(() => {
  function decode(s) {
    return s
      .replace(/\\u002[fF]/g, '/')
      .replace(/\\u0026/g, '&')
      .replace(/\\u003[dD]/g, '=')
      .replace(/\\u003[fF]/g, '?')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&');
  }

  function extract(text) {
    if (!text || !text.includes('image_raw')) return [];
    const decoded = decode(text);
    return [...new Set(decoded.match(/https?:[^"'\s\\)]+image_raw[^"'\s\\)]+/g) || [])]
      .map(u => u.replace(/[\\,;]+$/, ''))
      .filter(u => /x-signature=/.test(u));
  }

  function notify(urls) {
    if (!urls.length) return;
    window.postMessage({ source: '__doubao_clip__', type: 'raws', urls }, '*');
  }

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const r = await origFetch.apply(this, args);
    try {
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('json') || ct.includes('text') || ct.includes('event-stream')) {
        r.clone().text().then(t => {
          const urls = extract(t);
          if (urls.length) notify(urls);
        }).catch(() => {});
      }
    } catch {}
    return r;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(...a) {
    this.addEventListener('load', () => {
      try {
        const urls = extract(this.responseText);
        if (urls.length) notify(urls);
      } catch {}
    });
    return origSend.apply(this, a);
  };
})();
