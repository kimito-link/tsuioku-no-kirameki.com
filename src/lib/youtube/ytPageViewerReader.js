// ytPageViewerReader.js — YouTube のページ自身の世界で、同時視聴者数を data 属性に置く。
// 画面に「N 人が視聴中」が描かれる前でも、ytInitialData と updated_metadata には数がある。
// 隔離された content script はその属性を読む。ここでは DOM の文字は変えない。

import {
  concurrentViewersFromUpdatedMetadata,
  concurrentViewersInInnertube,
  parseYtInitialDataAssignment,
  videoIdFromYtInitialData,
} from './ytConcurrentViewers.js';
import { parseYtVideoIdFromUrl } from './ytPageMeta.js';

const VID_RE = /^[A-Za-z0-9_-]{11}$/;

/** @param {unknown} v */
function isVid(v) {
  return typeof v === 'string' && VID_RE.test(v);
}

/** @param {unknown} body */
function videoIdFromRequestBody(body) {
  if (body && typeof body === 'object' && isVid(/** @type {any} */ (body).videoId)) {
    return /** @type {any} */ (body).videoId;
  }
  if (typeof body !== 'string') return '';
  const m = body.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/);
  return m ? m[1] : '';
}

/**
 * ページの世界で fetch / XHR と ytInitialData を見て、documentElement に数を書く。
 * チャット欄 iframe と、ページの中の別フレームでは動かない。
 */
export function startYtPageViewerReader() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.top !== window) return;
  if (/\/live_chat/.test(String(location.pathname || ''))) return;
  const root0 = document.documentElement;
  if (!root0 || root0.getAttribute('data-nl-yt-viewers-hook') === '1') return;
  root0.setAttribute('data-nl-yt-viewers-hook', '1');

  /** @type {{ videoId: string, count: number } | null} */
  let pending = null;

  const pageVideoId = () => {
    const fromUrl = parseYtVideoIdFromUrl(String(location.href || ''));
    if (fromUrl) return fromUrl;
    const attr = String(document.documentElement?.getAttribute('data-nl-yt-video-id') || '');
    if (isVid(attr)) return attr;
    try {
      const canon = parseYtVideoIdFromUrl(
        String(document.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''),
      );
      if (canon) return canon;
    } catch {
      /* まだ head が無い */
    }
    const fromData = videoIdFromYtInitialData(/** @type {any} */ (window).ytInitialData);
    return isVid(fromData) ? fromData : '';
  };

  /** @param {string} videoId @param {number} count */
  const publish = (videoId, count) => {
    if (!isVid(videoId) || !Number.isFinite(count)) return;
    const root = document.documentElement;
    if (!root) return;
    const pageId = pageVideoId();
    if (pageId && pageId !== videoId) return;
    root.setAttribute('data-nl-yt-video-id', videoId);
    root.setAttribute('data-nl-yt-viewers', String(Math.floor(count)));
  };

  const flushPending = () => {
    const pageId = pageVideoId();
    if (!pending || !pageId || pending.videoId !== pageId) return;
    publish(pageId, pending.count);
    pending = null;
  };

  /** @param {any} data @param {unknown} body */
  const noteMetadata = (data, body) => {
    const reqId = videoIdFromRequestBody(body);
    const pageId = pageVideoId();
    if (reqId && pageId && reqId !== pageId) return;
    const id = pageId || reqId;
    if (!id) return;
    const count = concurrentViewersFromUpdatedMetadata(data, id);
    if (count == null) return;
    if (!pageId) {
      pending = { videoId: id, count };
      return;
    }
    publish(pageId, count);
  };

  const readInitial = () => {
    const pageId = pageVideoId();
    /** @type {any} */
    let data = /** @type {any} */ (window).ytInitialData;
    if (!data || typeof data !== 'object') {
      const scripts = document.querySelectorAll('script');
      for (let i = 0; i < scripts.length; i += 1) {
        const text = String(scripts[i].textContent || '');
        if (!text.includes('ytInitialData')) continue;
        data = parseYtInitialDataAssignment(text);
        if (data) break;
      }
    }
    if (!data || typeof data !== 'object') {
      flushPending();
      return;
    }
    const dataId = videoIdFromYtInitialData(data);
    const id = pageId || dataId;
    if (!id || (pageId && dataId && pageId !== dataId)) {
      flushPending();
      return;
    }
    const count = concurrentViewersInInnertube(data, id);
    if (count != null) publish(id, count);
    else flushPending();
  };

  /** @type {MutationObserver | null} */
  let obs = null;
  const arm = () => {
    const run = () => {
      try {
        readInitial();
      } catch {
        /* 1回失敗しても次の更新で読む */
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
    if (obs) obs.disconnect();
    obs = new MutationObserver(() => {
      if (document.documentElement?.getAttribute('data-nl-yt-viewers')) {
        obs?.disconnect();
        obs = null;
        return;
      }
      run();
    });
    const root = document.documentElement;
    if (root) obs.observe(root, { childList: true, subtree: true });
    setTimeout(() => {
      obs?.disconnect();
      obs = null;
    }, 15000);
  };

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      const ret = origFetch.apply(this, /** @type {any} */ (arguments));
      try {
        const url = typeof input === 'string' ? input : String(/** @type {any} */ (input)?.url || '');
        if (url.includes('youtubei/v1/updated_metadata')) {
          const body = init && init.body;
          Promise.resolve(ret)
            .then((res) => {
              if (!res || typeof res.clone !== 'function') return;
              res.clone().json().then((/** @type {any} */ data) => noteMetadata(data, body)).catch(() => {});
            })
            .catch(() => {});
        }
      } catch {
        /* ページの fetch は止めない */
      }
      return ret;
    };
  }

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (/** @type {string} */ _method, /** @type {string} */ url) {
    try {
      /** @type {any} */ (this).__nlUrl = String(url || '');
    } catch {
      /* no-op */
    }
    return origOpen.apply(this, /** @type {any} */ (arguments));
  };
  XMLHttpRequest.prototype.send = function (/** @type {any} */ body) {
    try {
      if (String(/** @type {any} */ (this).__nlUrl || '').includes('youtubei/v1/updated_metadata')) {
        this.addEventListener('load', () => {
          try {
            noteMetadata(JSON.parse(String(this.responseText || '')), body);
          } catch {
            /* 応答が JSON でなければ捨てる */
          }
        });
      }
    } catch {
      /* ページの XHR は止めない */
    }
    return origSend.apply(this, /** @type {any} */ (arguments));
  };

  arm();
  window.addEventListener('yt-navigate-finish', () => {
    pending = null;
    const root = document.documentElement;
    root?.removeAttribute('data-nl-yt-viewers');
    root?.removeAttribute('data-nl-yt-video-id');
    setTimeout(arm, 0);
  });
}
