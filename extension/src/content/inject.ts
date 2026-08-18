(function() {
  // Intercept fetch requests
  const originalFetch = window.fetch;
  window.fetch = function(...args: any[]) {
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
      if (typeof url === 'string') {
        if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('.webm') || url.includes('.mkv')) {
          const absUrl = new URL(url, window.location.href).toString();
          window.dispatchEvent(new CustomEvent("adc_media_url_found", { detail: { url: absUrl } }));
        }
      }
    } catch (e) {
      // ignore
    }
    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequests
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
    try {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('.m3u8') || urlStr.includes('.mp4') || urlStr.includes('.webm') || urlStr.includes('.mkv')) {
        const absUrl = new URL(urlStr, window.location.href).toString();
        window.dispatchEvent(new CustomEvent("adc_media_url_found", { detail: { url: absUrl } }));
      }
    } catch (e) {
      // ignore
    }
    return originalOpen.call(this, method, url, ...args as [any, any?, any?]);
  };
})();
export {};
