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
      
      const isYoutube = window.location.hostname.includes("youtube.com") || window.location.hostname.includes("youtu.be");
      
      if (isYoutube) {
        // Send page URL for YouTube (handles playlists/videos correctly via yt-dlp)
        chrome.runtime.sendMessage({
          type: "downloadYoutubeFromContent",
          url: window.location.href
        });
      } else {
        const src = video.currentSrc || video.src;
        if (!src) {
          alert("No direct video source URL found.");
          return;
        }
        
        if (src.startsWith("blob:")) {
          alert("This video uses adaptive streaming (blob). Only direct video source URLs (e.g. MP4) or YouTube pages can be downloaded directly.");
          return;
        }
        
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
