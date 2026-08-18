let activeVideo: HTMLVideoElement | null = null;
let downloadBtn: HTMLDivElement | null = null;
let isHoveringButton = false;

function getVideos(): HTMLVideoElement[] {
  return Array.from(document.querySelectorAll("video"));
}

function findMediaUrls(): string[] {
  const urls: string[] = [];
  
  // 1. Check video and source elements
  document.querySelectorAll("video, source").forEach((el) => {
    const src = (el as HTMLVideoElement | HTMLSourceElement).src || el.getAttribute("src");
    if (src && !src.startsWith("blob:") && !src.startsWith("data:")) {
      urls.push(src);
    }
  });

  // 2. Scan entire HTML for .m3u8 or .mp4 URLs (including inside script tags and JSON)
  const html = document.documentElement.innerHTML;
  // Unescape backslashes (often found in JSON)
  const cleanHtml = html.replace(/\\\/|\\\\\/|\\/g, "/");
  
  const regex = /https?:\/\/[^\s"'`<>\\\{\}\[\]\(\)]+?\.(?:m3u8|mp4|webm|mkv)(?:\?[^\s"'`<>\\\{\}\[\]\(\)]*)?/gi;
  const matches = cleanHtml.match(regex);
  if (matches) {
    matches.forEach(m => {
      try {
        const urlObj = new URL(m);
        const resolved = urlObj.toString();
        if (!urls.includes(resolved)) {
          urls.push(resolved);
        }
      } catch {
        // Ignore invalid URLs
      }
    });
  }

  return urls;
}

function createDownloadButton() {
  if (downloadBtn) return;
  
  downloadBtn = document.createElement("div");
  downloadBtn.className = "adc-global-download-btn-container";
  downloadBtn.innerHTML = `
    <button class="adc-download-btn" title="Download this video">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Download Video</span>
    </button>
  `;

  document.body.appendChild(downloadBtn);

  // Hover states on button container itself
  downloadBtn.addEventListener("mouseenter", () => {
    isHoveringButton = true;
  });
  
  downloadBtn.addEventListener("mouseleave", () => {
    isHoveringButton = false;
    checkMouseLeave();
  });

  const buttonEl = downloadBtn.querySelector("button")!;
  buttonEl.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!activeVideo) return;

    const url = window.location.href;
    const src = activeVideo.currentSrc || activeVideo.src;
    const referer = document.referrer || window.location.href;
    
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

    if (isMajorPlatform) {
      chrome.runtime.sendMessage({
        type: "downloadYoutubeFromContent",
        url: url,
        referer: referer
      });
    } else {
      // Query background script's dynamic network capture cache for this tab
      chrome.runtime.sendMessage({ type: "getTabMediaUrls" }, (response) => {
        const capturedUrls: string[] = response && response.ok && Array.isArray(response.data) ? response.data : [];
        const domUrls = findMediaUrls();
        
        // Merge captured network URLs and extracted DOM URLs
        const combinedUrls = [...new Set([...capturedUrls, ...domUrls])];
        
        const m3u8Url = combinedUrls.find(u => u.includes(".m3u8"));
        const mp4Url = combinedUrls.find(u => u.includes(".mp4") || u.includes(".webm") || u.includes(".mkv"));

        if (m3u8Url) {
          chrome.runtime.sendMessage({
            type: "downloadYoutubeFromContent",
            url: m3u8Url,
            referer: referer
          });
        } else if (mp4Url) {
          chrome.runtime.sendMessage({
            type: "downloadDirectFromContent",
            url: mp4Url,
            title: document.title || "video"
          });
        } else {
          // Fallback: Use direct src if it's a HTTP URL, otherwise use frame page URL
          const isDirect = src && !src.startsWith("blob:") && !src.startsWith("data:") && (src.startsWith("http://") || src.startsWith("https://"));
          if (isDirect) {
            chrome.runtime.sendMessage({
              type: "downloadDirectFromContent",
              url: src,
              title: document.title || "video"
            });
          } else {
            chrome.runtime.sendMessage({
              type: "downloadYoutubeFromContent",
              url: url,
              referer: referer
            });
          }
        }
      });
    }
  });
}

function positionButton(video: HTMLVideoElement) {
  if (!downloadBtn) return;
  const rect = video.getBoundingClientRect();
  
  // Only position if video has non-zero width/height and is visible
  if (rect.width === 0 || rect.height === 0) return;

  // Hide if video is scrolled out of viewport bounds (or under a top sticky header)
  if (rect.bottom < 60 || rect.top > window.innerHeight - 20) {
    downloadBtn.style.display = "none";
    return;
  }

  // Check if the top-right corner of the video is covered by a sticky header, modal, etc.
  const checkX = rect.right - 20;
  const checkY = rect.top + 20;
  if (checkX >= 0 && checkX <= window.innerWidth && checkY >= 0 && checkY <= window.innerHeight) {
    const elementAtPoint = document.elementFromPoint(checkX, checkY);
    if (
      elementAtPoint && 
      !video.contains(elementAtPoint) && 
      !elementAtPoint.contains(video) && 
      elementAtPoint.tagName !== "VIDEO" &&
      !elementAtPoint.className.includes("adc-") // Do not hide when hovering over our own button
    ) {
      // It's covered by something else (like a sticky header)
      downloadBtn.style.display = "none";
      return;
    }
  }

  const top = window.scrollY + rect.top + 12;
  const left = window.scrollX + rect.right - 145; // 145px width approximate

  downloadBtn.style.top = `${top}px`;
  downloadBtn.style.left = `${left}px`;
  downloadBtn.style.display = "block";
  
  // Fade in
  setTimeout(() => {
    if (downloadBtn) {
      downloadBtn.style.opacity = "1";
      downloadBtn.style.transform = "translateY(0)";
    }
  }, 10);
}

function hideButton() {
  if (!downloadBtn) return;
  downloadBtn.style.opacity = "0";
  downloadBtn.style.transform = "translateY(-5px)";
  // Wait for transition before display:none
  setTimeout(() => {
    if (downloadBtn && downloadBtn.style.opacity === "0") {
      downloadBtn.style.display = "none";
    }
  }, 200);
}

function checkMouseLeave() {
  if (!isHoveringButton && !activeVideo) {
    hideButton();
  }
}

// Track mouse globally
let mouseX = 0;
let mouseY = 0;

document.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  
  createDownloadButton();
  
  const videos = getVideos();
  let foundVideo: HTMLVideoElement | null = null;
  
  for (const video of videos) {
    const rect = video.getBoundingClientRect();
    
    // Check if mouse is within video bounds (plus 10px padding for safety)
    const padding = 10;
    if (
      mouseX >= rect.left - padding &&
      mouseX <= rect.right + padding &&
      mouseY >= rect.top - padding &&
      mouseY <= rect.bottom + padding &&
      rect.width > 100 && rect.height > 100 // Ignore tiny video elements like trackers
    ) {
      foundVideo = video;
      break;
    }
  }

  if (foundVideo) {
    activeVideo = foundVideo;
    positionButton(foundVideo);
  } else {
    // If not hovering video, check if hovering the download button itself
    if (downloadBtn) {
      const btnRect = downloadBtn.getBoundingClientRect();
      const isOverBtn = 
        mouseX >= btnRect.left &&
        mouseX <= btnRect.right &&
        mouseY >= btnRect.top &&
        mouseY <= btnRect.bottom;
      
      if (!isOverBtn && !isHoveringButton) {
        activeVideo = null;
        hideButton();
      }
    }
  }
});

// Reposition button dynamically on scroll and resize
window.addEventListener("scroll", () => {
  if (activeVideo) {
    positionButton(activeVideo);
  }
}, { passive: true });

window.addEventListener("resize", () => {
  if (activeVideo) {
    positionButton(activeVideo);
  }
}, { passive: true });

export {};
