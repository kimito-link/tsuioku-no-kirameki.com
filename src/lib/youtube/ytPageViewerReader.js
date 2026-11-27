// ytPageViewerReader.js — YouTube のページ自身の世界で、同時視聴者数を data 属性に置く。
// 画面に「N 人が視聴中」が描かれる前でも、ytInitialData と updated_metadata には数がある。
// 隔離された content script はその属性を読む。ここでは DOM の文字は変えない。

import {
  concurrentViewersFromUpdatedMetadata,
  concurrentViewersInInnertube,
  parseYtInitialDataAssignment,
  subscriberCountTextInInnertube,
  videoIdFromYtInitialData,
} from './ytConcurrentViewers.js';
import { parseYtVideoIdFromUrl } from './ytPageMeta.js';
import {
  classifyYtWatchContentKind,
  viewCountInInnertube,
  ytLiveFlagsFromPlayerOrInitial,
} from './ytVideoWatchMeta.js';

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
  /**
   * v0.1.2263: ページを読み直さずに動画を移ったとき(関連動画・ミックス・検索結果から開く)、window.ytInitialData と
   *   window.ytInitialPlayerResponse は最初に開いたページのまま。YouTube が移り終わりの知らせ(yt-navigate-finish)に付けて渡す
   *   新しい動画の中身(detail.response.response / playerResponse)を控えて読む。新しい通信・Observer・タイマーは足さない。
   *   これが無いと、移った先の動画で「配信かどうか」「再生数」が書かれず、横の欄がライブの形(同時視聴者数・応援 0)になり、
   *   会場モードのボタンも動画用に切り替わらなかった。
   * @type {{ data: any, player: any } | null}
   */
  let navResponse = null;
  let hasNavigated = false;

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
    if (root.getAttribute('data-nl-yt-is-live') === '0') {
      root.removeAttribute('data-nl-yt-viewers');
      return;
    }
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
    const w = /** @type {any} */ (window);
    const matches = (/** @type {string} */ candidateId) =>
      candidateId === pageId || (!candidateId && !hasNavigated);
    let data = [navResponse?.data, w.ytInitialData].find((candidate) =>
      candidate && matches(videoIdFromYtInitialData(candidate)));
    const player = [navResponse?.player, w.ytInitialPlayerResponse].find((candidate) =>
      candidate && matches(String(candidate.videoDetails?.videoId || '')));
    if (!data) {
      for (const script of document.querySelectorAll('script')) {
        const source = String(script.textContent || '');
        if (!source.includes('ytInitialData')) continue;
        const candidate = parseYtInitialDataAssignment(source);
        if (!candidate || !matches(videoIdFromYtInitialData(candidate))) continue;
        data = candidate;
        break;
      }
    }
    const id = pageId || videoIdFromYtInitialData(data);
    if (!id || (!data && !player)) {
      flushPending();
      return;
    }
    const count = concurrentViewersInInnertube(data, id);
    const subText = subscriberCountTextInInnertube(data);
    if (subText) document.documentElement?.setAttribute('data-nl-yt-subscribers', subText);
    if (count != null) publish(id, count);
    else flushPending();
    publishVodSignals(data, player, id);
  };

  /**
   * 通常動画の再生数と、配信かどうかの印を data 属性に書く。同時視聴の属性は変えない。
   * @param {any} data
   * @param {any} player
   * @param {string} id
   */
  const publishVodSignals = (data, player, id) => {
    const root = document.documentElement;
    if (!root || !id) return;
    const views = viewCountInInnertube(data, id) ?? viewCountInInnertube(player, id);
    if (views != null) {
      root.setAttribute('data-nl-yt-view-count', String(views));
      root.setAttribute('data-nl-yt-view-count-video-id', id);
    }
    // v0.1.2263: 動画の投稿日と長さ(プレーヤーの応答に既にある値だけ)。この動画の player のときだけ(playerFor)
    const micro = player?.microformat?.playerMicroformatRenderer;
    const pub = String(micro?.publishDate || micro?.uploadDate || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(pub)) root.setAttribute('data-nl-yt-publish-date', pub.slice(0, 25));
    // v0.1.2263: 動画そのもののいいね(player の microformat.likeCount・正確な整数の文字列)。ytInitialData は探さない
    const likes = String(micro?.likeCount ?? '');
    if (/^\d+$/.test(likes)) root.setAttribute('data-nl-yt-like-count', likes);
    const len = String(player?.videoDetails?.lengthSeconds || '');
    if (/^\d+$/.test(len) && len !== '0') root.setAttribute('data-nl-yt-length-sec', len);
    const fromPlayer = ytLiveFlagsFromPlayerOrInitial(player);
    const fromData = ytLiveFlagsFromPlayerOrInitial(data);
    const isLive = fromPlayer.isLive ?? fromData.isLive;
    const isLiveContent = fromPlayer.isLiveContent ?? fromData.isLiveContent;
    if (isLive === true) root.setAttribute('data-nl-yt-is-live', '1');
    else if (isLive === false) root.setAttribute('data-nl-yt-is-live', '0');
    if (isLiveContent === true) root.setAttribute('data-nl-yt-is-live-content', '1');
    else if (isLiveContent === false) root.setAttribute('data-nl-yt-is-live-content', '0');
    if (isLive === false) root.removeAttribute('data-nl-yt-viewers');
    const viewersAttr = root.getAttribute('data-nl-yt-viewers');
    const viewersN = viewersAttr && /^\d+$/.test(viewersAttr) ? Number(viewersAttr) : null;
    const kind = classifyYtWatchContentKind({
      url: String(location.href || ''),
      isLive,
      isLiveContent,
      concurrentViewers: viewersN,
    });
    if (kind !== 'unknown') root.setAttribute('data-nl-yt-content-kind', kind);
    // v0.1.2263: 印をどの動画のものかと一緒に書く。読む側(content-chat-entry.js)は、いまの動画と違う印を使わない
    //   (移り終わりの知らせより先に 5 秒ごとの送信が走ると、前の動画の「ライブ」の印が新しい動画に付いていた)
    if (isLive != null || isLiveContent != null) root.setAttribute('data-nl-yt-kind-video-id', id);
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
  window.addEventListener('yt-navigate-finish', (/** @type {any} */ ev) => {
    pending = null;
    hasNavigated = true;
    try {
      const r = ev && ev.detail && ev.detail.response;
      navResponse = r && typeof r === 'object' && (r.response || r.playerResponse)
        ? { data: r.response || null, player: r.playerResponse || null }
        : null;
    } catch {
      navResponse = null;
    }
    const root = document.documentElement;
    root?.removeAttribute('data-nl-yt-viewers');
    root?.removeAttribute('data-nl-yt-video-id');
    root?.removeAttribute('data-nl-yt-view-count');
    root?.removeAttribute('data-nl-yt-view-count-video-id');
    root?.removeAttribute('data-nl-yt-is-live');
    root?.removeAttribute('data-nl-yt-is-live-content');
    root?.removeAttribute('data-nl-yt-content-kind');
    root?.removeAttribute('data-nl-yt-kind-video-id');
    root?.removeAttribute('data-nl-yt-publish-date');
    root?.removeAttribute('data-nl-yt-length-sec');
    root?.removeAttribute('data-nl-yt-like-count');
    setTimeout(arm, 0);
  });
}
