// venue-overlay.js — YouTube 視聴ページの会場モードボタンと、ページに重ねる会場
/* eslint-disable */
(() => {
  // extension-youtube/src/venue-overlay-content.js
  var BTN_ID = "ytNlsbVenueToggle";
  var FRAME_ID = "ytNlsbVenueFrame";
  var EXT_ORIGIN = new URL(chrome.runtime.getURL("/")).origin;
  function currentVideoId() {
    if (location.pathname !== "/watch") return "";
    try {
      return String(new URLSearchParams(location.search).get("v") || "");
    } catch {
      return "";
    }
  }
  function ensureStyle() {
    if (document.getElementById("ytNlsbVenueStyle")) return;
    const st = document.createElement("style");
    st.id = "ytNlsbVenueStyle";
    st.textContent = `
#${BTN_ID}{position:fixed;right:20px;bottom:20px;z-index:2147483000;min-height:44px;padding:12px 20px;
border:2px solid rgba(255,255,255,.9);border-radius:999px;background:linear-gradient(135deg,#ff8fb1,#ff6f9c);color:#fff;
letter-spacing:.02em;box-shadow:0 6px 20px rgba(214,51,108,.45),0 2px 6px rgba(0,0,0,.25);cursor:pointer;
font:inherit;font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;font-size:15px;font-weight:700;line-height:1;
transition:transform 180ms ease,box-shadow 180ms ease}
#${BTN_ID}:hover{background:linear-gradient(135deg,#ff7ea6,#ff5e91);transform:translateY(-2px);
box-shadow:0 10px 26px rgba(214,51,108,.55),0 2px 6px rgba(0,0,0,.25)}
html.yt-nlsb-venue-open #${BTN_ID}{display:none}
#${FRAME_ID}{position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147482000;background:transparent}
html.yt-nlsb-venue-open{overflow:hidden}
`;
    (document.head || document.documentElement).appendChild(st);
  }
  var moved = null;
  function playerEl() {
    return (
      /** @type {HTMLElement|null} */
      document.querySelector("#movie_player") || document.querySelector(".html5-video-player")
    );
  }
  function placePlayer(rect) {
    const p = playerEl();
    if (!p || !(rect.w > 40 && rect.h > 40)) return;
    if (!moved || moved.el !== p) moved = { el: p, style: p.getAttribute("style") || "" };
    let w = rect.w;
    let h = Math.round(w * 9 / 16);
    if (h > rect.h) {
      h = rect.h;
      w = Math.round(h * 16 / 9);
    }
    const x = rect.x + Math.round((rect.w - w) / 2);
    const y = rect.y + Math.round((rect.h - h) / 2);
    p.style.cssText = `${moved.style};position:fixed!important;left:${x}px!important;top:${y}px!important;width:${w}px!important;height:${h}px!important;z-index:2147482500!important;`;
    window.dispatchEvent(new Event("resize"));
    void writeDiag({ placed: true, rect, player: { x, y, w, h }, got: rectOf(p) });
  }
  function restorePlayer() {
    if (!moved) return;
    if (moved.style) moved.el.setAttribute("style", moved.style);
    else moved.el.removeAttribute("style");
    moved = null;
    window.dispatchEvent(new Event("resize"));
  }
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }
  async function writeDiag(part) {
    try {
      const prev = (await chrome.storage.local.get("yt_diag_venue_overlay"))?.yt_diag_venue_overlay || {};
      await chrome.storage.local.set({ yt_diag_venue_overlay: { ...prev, ...part, at: Date.now(), video: currentVideoId() } });
    } catch {
    }
  }
  function openVenue() {
    const vid = currentVideoId();
    if (!vid || document.getElementById(FRAME_ID)) return;
    const f = document.createElement("iframe");
    f.id = FRAME_ID;
    f.src = chrome.runtime.getURL(`venue.html?vid=${encodeURIComponent(vid)}&overlay=1`);
    f.setAttribute("allow", "autoplay");
    document.documentElement.appendChild(f);
    document.documentElement.classList.add("yt-nlsb-venue-open");
    void writeDiag({ open: true, placed: false, playerFound: !!playerEl() });
  }
  function closeVenue() {
    document.getElementById(FRAME_ID)?.remove();
    document.documentElement.classList.remove("yt-nlsb-venue-open");
    restorePlayer();
    void writeDiag({ open: false });
  }
  window.addEventListener("message", (ev) => {
    if (ev.origin !== EXT_ORIGIN) return;
    const d = (
      /** @type {any} */
      ev.data
    );
    if (!d || d.source !== "yt-venue") return;
    if (d.type === "close") closeVenue();
    else if (d.type === "safe-rect" && d.rect && document.getElementById(FRAME_ID)) placePlayer(d.rect);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && document.getElementById(FRAME_ID)) closeVenue();
  });
  function ensureButton() {
    const vid = currentVideoId();
    let btn = document.getElementById(BTN_ID);
    if (!vid) {
      btn?.remove();
      if (document.getElementById(FRAME_ID)) closeVenue();
      return;
    }
    if (btn) return;
    ensureStyle();
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "🏟 会場モード";
    btn.addEventListener("click", openVenue);
    (document.body || document.documentElement).appendChild(btn);
  }
  var lastVid = "";
  setInterval(() => {
    const vid = currentVideoId();
    if (vid !== lastVid && document.getElementById(FRAME_ID)) closeVenue();
    lastVid = vid;
    ensureButton();
  }, 1e3);
  ensureButton();
})();
