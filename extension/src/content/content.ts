function initVideoDownloader() {
  const observer = new MutationObserver(() => {
    setupButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setupButtons();
}

function setupButtons() {
  const videos = document.querySelectorAll("video");
  videos.forEach((video) => {
    if (video.dataset.hasDownloadBtn) return;
    video.dataset.hasDownloadBtn = "true";

    // Create the button container
    const btn = document.createElement("div");
    btn.className = "adc-download-btn-container";
    btn.innerHTML = `
      <button class="adc-download-btn" title="Download this video">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Download Video</span>
      </button>
    `;

    // Try to position it absolutely inside the video's parent element
    const parent = video.parentElement;
    if (!parent) return;
    
    const computedStyle = window.getComputedStyle(parent);
    if (computedStyle.position === "static") {
      parent.style.position = "relative";
    }

    parent.appendChild(btn);

    // Attach click handler
    const buttonEl = btn.querySelector("button")!;
    buttonEl.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const src = video.currentSrc || video.src;
      const isDirect = src && !src.startsWith("blob:") && !src.startsWith("data:") && (src.startsWith("http://") || src.startsWith("https://"));
      
      const isMajorPlatform = 
        window.location.hostname.includes("youtube.com") || 
        window.location.hostname.includes("youtu.be") ||
        window.location.hostname.includes("facebook.com") ||
        window.location.hostname.includes("fb.watch") ||
        window.location.hostname.includes("tiktok.com") ||
        window.location.hostname.includes("instagram.com") ||
        window.location.hostname.includes("x.com") ||
        window.location.hostname.includes("twitter.com") ||
        window.location.hostname.includes("reddit.com") ||
        window.location.hostname.includes("vimeo.com") ||
        window.location.hostname.includes("twitch.tv");

      if (isMajorPlatform || !isDirect) {
        // Send page URL to download using yt-dlp native downloader
        chrome.runtime.sendMessage({
          type: "downloadYoutubeFromContent",
          url: window.location.href
        });
      } else {
        chrome.runtime.sendMessage({
          type: "downloadDirectFromContent",
          url: src,
          title: document.title || "video"
        });
      }
    });
  });
}

// Kickoff script execution
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVideoDownloader);
} else {
  initVideoDownloader();
}
export {};
