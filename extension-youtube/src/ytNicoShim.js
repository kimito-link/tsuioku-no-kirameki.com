// ytNicoShim.js — ニコ生版のサイドパネル(本物の popup-entry.js)を、YouTube の記録で動かすための「入口の差し替え」。
/* global window, history, URL */
//
// ★りんく「一旦ソースをごっそり写してから変えて」「完全コピーしてから変える約束かえないで」(2026-11-03)。
//   画面(popup.html)もプログラム(popup-entry.js)もニコ生版そのものを使う。違うのは「どこからコメントを読むか」だけ。
//   WEB版(app/live-view.js)が本物の popup-entry を chrome シムで動かしているのと同じ型。
//
// このモジュールは popup-entry より【先に】評価されること(sidepanel-nico-entry.js の import 順で保証)。
// やること:
//   1. URL に ?inline=1&dock=sidepanel を足す(ニコ生版のサイドパネルと同じ起動モード)。
//   2. chrome.tabs の結果に出る YouTube の視聴タブを、ニコ生の watch URL(疑似 lv)に見せる。
//   3. chrome.storage.local.get で nls_comments_<疑似lv> を聞かれたら、YouTube の記録(IndexedDB)から作って返す。
//      それ以外のキー(設定など)は本物の storage にそのまま読み書きする=ニコ生版の設定スイッチがそのまま動く。
//   4. YouTube 側の記録が増えたら(yt_stream_summaries の変化)、nls_comments_<疑似lv> が変わったと popup に知らせる。

import { getYtStreamCommentsByVideoId } from './ytIdbStore.js';
import { parseYtVideoIdFromUrl, isYtWatchLikeUrl } from '../../src/lib/youtube/ytPageMeta.js';

const KEY_YT_SUMMARIES = 'yt_stream_summaries';
const COMMENTS_PREFIX = 'nls_comments_';

// ---- 1. 起動モード(popup-entry が読み込み時に location.search を読むので、先に書いておく) ----
try {
  const u = new URL(window.location.href);
  if (u.searchParams.get('inline') !== '1' || u.searchParams.get('dock') !== 'sidepanel') {
    u.searchParams.set('inline', '1');
    u.searchParams.set('dock', 'sidepanel');
    history.replaceState(null, '', u.href);
  }
} catch {
  /* no-op */
}

// ---- 2. videoId ⇔ 疑似 lv ----
/** @type {Map<string, string>} lv → videoId */
const videoIdByLv = new Map();
/** @type {Map<string, string>} videoId → lv */
const lvByVideoId = new Map();

/**
 * videoId から決まった疑似 lv(lv + 12桁)を作る。同じ videoId はいつも同じ lv。
 * @param {string} videoId
 * @returns {string}
 */
export function pseudoLvForVideoId(videoId) {
  const id = String(videoId || '');
  if (!id) return '';
  const known = lvByVideoId.get(id);
  if (known) return known;
  // FNV-1a 64bit 相当を 2 本の 32bit で作り、12桁に丸める(衝突は実用上起きない)
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < id.length; i += 1) {
    const c = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  const n = ((h1 % 1000000) * 1000000 + (h2 % 1000000)) % 1000000000000;
  const lv = `lv${String(9 * 100000000000 + (n % 100000000000))}`;
  lvByVideoId.set(id, lv);
  videoIdByLv.set(lv, id);
  return lv;
}

/** @param {string} lv */
export function videoIdForPseudoLv(lv) {
  return videoIdByLv.get(String(lv || '').toLowerCase()) || '';
}

/**
 * YouTube の視聴タブなら、url をニコ生 watch URL(疑似 lv)に差し替えた写しを返す。
 * @template {{ url?: string, pendingUrl?: string, title?: string }} T
 * @param {T} tab
 * @returns {T}
 */
function mapTab(tab) {
  if (!tab || typeof tab !== 'object') return tab;
  const url = String(tab.url || tab.pendingUrl || '');
  if (!isYtWatchLikeUrl(url)) return tab;
  const vid = parseYtVideoIdFromUrl(url);
  if (!vid) return tab;
  const lv = pseudoLvForVideoId(vid);
  return { ...tab, url: `https://live.nicovideo.jp/watch/${lv}`, pendingUrl: undefined, __ytUrl: url };
}

// ---- 3. YouTube の記録 → ニコ生のコメント行 ----
/**
 * @param {any} r YouTube の記録 1 件(ytIdbStore)
 * @param {number} i 記録順の番号(0 始まり)
 * @param {string} lv
 */
export function ytRecordToNicoEntry(r, i, lv) {
  const channelId = String(r?.channelId || '').trim();
  const name = String(r?.name || '').trim();
  const at = Number(r?.recordedAt || 0) || Date.now();
  return {
    id: String(r?.id || r?.pk || `yt${i}`),
    liveId: lv,
    commentNo: String(i + 1),
    text: String(r?.text || ''),
    userId: channelId || (name ? `name:${name}` : ''),
    nickname: name,
    avatarUrl: String(r?.iconUrl || ''),
    capturedAt: at,
    ytKind: String(r?.kind || 'text'),
    ytAmount: Number(r?.amount || 0),
    ytCurrency: String(r?.currency || ''),
  };
}

/**
 * YouTube の配信のまとめ(yt_stream_summaries の1件)を、ニコ生版の視聴ページスナップショットの形にする。
 * @param {any} sum
 * @param {string} videoId
 * @param {string} tabTitle
 */
export function ytSummaryToNicoSnapshot(sum, videoId, tabTitle) {
  const lv = pseudoLvForVideoId(videoId);
  // null を Number() すると 0 になり「0人」と出てしまうので、数のときだけ使う
  const viewers = typeof sum?.concurrentViewers === 'number' ? sum.concurrentViewers : NaN;
  const startedAt = Number(sum?.createdAt || 0);
  const chId = String(sum?.broadcasterChannelId || '');
  return {
    title: tabTitle || String(sum?.title || ''),
    url: `https://live.nicovideo.jp/watch/${lv}`,
    liveId: lv,
    broadcastTitle: String(sum?.title || ''),
    broadcasterName: String(sum?.broadcasterName || ''),
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    tags: [],
    startAtText: '',
    links: [],
    metas: [],
    scripts: [],
    noopenerLinks: [],
    broadcasterUserId: chId,
    broadcasterPageUrl: chId ? `https://www.youtube.com/channel/${chId}` : '',
    broadcasterIconUrl: String(sum?.broadcasterIconUrl || ''),
    // YouTube の「N 人が視聴中」は同時接続そのもの。ニコ生版の「公式の同接」の欄に入れる(推定でなく直接値として出る)。
    // YouTube には延べの来場者数が無いので、来場は空のまま(ニコ生版は「(取得不可)」と出す)。
    viewerCountFromDom: null,
    viewerCountSource: 'dom',
    officialViewerCount: Number.isFinite(viewers) && viewers >= 0 ? viewers : null,
    officialStatsUpdatedAt: Number(sum?.updatedAt || 0) || Date.now(),
    streamAgeMin: startedAt > 0 ? Math.max(0, Math.round((Date.now() - startedAt) / 60000)) : null,
  };
}

/** @param {string} lv */
async function buildCommentsForLv(lv) {
  const vid = videoIdForPseudoLv(lv);
  if (!vid) return undefined;
  const items = await getYtStreamCommentsByVideoId(vid);
  return (Array.isArray(items) ? items : []).map((r, i) => ytRecordToNicoEntry(r, i, lv));
}

// ---- chrome の差し替え(本物の上に薄くかぶせる) ----
const real = /** @type {any} */ (globalThis).chrome;
if (real && real.storage && real.storage.local && real.tabs) {
  const realLocal = real.storage.local;
  const realGet = realLocal.get.bind(realLocal);
  // 前に開いた配信の疑似 lv(nls_last_watch_url 等に残る)も引けるよう、記録のある配信を先に全部登録しておく
  const knownVideosReady = Promise.resolve(realGet(KEY_YT_SUMMARIES))
    .then((bag) => {
      for (const vid of Object.keys((bag && bag[KEY_YT_SUMMARIES]) || {})) pseudoLvForVideoId(vid);
    })
    .catch(() => {});

  /**
   * @param {any} keys
   * @returns {Promise<Record<string, any>>}
   */
  const shimGet = async (keys) => {
    await knownVideosReady;
    const list =
      keys == null ? null : Array.isArray(keys) ? keys.map(String) : typeof keys === 'string' ? [keys] : Object.keys(keys);
    const bag = /** @type {Record<string, any>} */ (await realGet(keys));
    if (list) {
      for (const k of list) {
        if (!k.startsWith(COMMENTS_PREFIX)) continue;
        const lv = k.slice(COMMENTS_PREFIX.length).toLowerCase();
        if (!videoIdForPseudoLv(lv)) continue;
        const arr = await buildCommentsForLv(lv);
        if (arr) bag[k] = arr;
      }
    }
    return bag;
  };
  realLocal.get = (/** @type {any} */ keys, /** @type {any} */ cb) => {
    const p = shimGet(keys);
    if (typeof cb === 'function') {
      p.then(cb, () => cb({}));
      return undefined;
    }
    return p;
  };

  /** @param {Function} fn */
  const wrapTabsFn = (fn) => {
    return (/** @type {any[]} */ ...args) => {
      const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      const p = Promise.resolve(fn.apply(real.tabs, args)).then((res) =>
        Array.isArray(res) ? res.map(mapTab) : mapTab(res),
      );
      if (cb) {
        p.then(cb, () => cb(undefined));
        return undefined;
      }
      return p;
    };
  };
  // 写す前の本物(YouTube の URL のまま)を控えておく
  const realTabsGetFn = real.tabs.get.bind(real.tabs);
  const realTabsGet = (/** @type {number} */ id) => Promise.resolve(realTabsGetFn(id));
  real.tabs.query = wrapTabsFn(real.tabs.query);
  real.tabs.get = wrapTabsFn(real.tabs.get);

  // ---- ニコ生版が視聴タブ(の content script)へ送る問い合わせのうち、YouTube でも答えられるものを答える ----
  const realSendMessage = real.tabs.sendMessage.bind(real.tabs);
  /**
   * @param {number} tabId
   * @param {any} message
   * @returns {Promise<any> | null} null = YouTube では扱わない(本物へ流す)
   */
  const answerForYtTab = (tabId, message) => {
    const type = String(message?.type || '');
    if (type === 'NLS_EXPORT_WATCH_SNAPSHOT') {
      return realTabsGet(tabId).then(async (tab) => {
        const url = String(tab?.url || '');
        const vid = parseYtVideoIdFromUrl(url);
        if (!vid) return { ok: false, error: 'not_youtube' };
        const bag = await realGet(KEY_YT_SUMMARIES);
        const sum = (bag && bag[KEY_YT_SUMMARIES] && bag[KEY_YT_SUMMARIES][vid]) || {};
        return { ok: true, snapshot: ytSummaryToNicoSnapshot(sum, vid, String(tab?.title || '')) };
      });
    }
    if (type === 'NLS_POST_COMMENT') {
      return realTabsGet(tabId).then(async (tab) => {
        const vid = parseYtVideoIdFromUrl(String(tab?.url || ''));
        const res = await real.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: vid, text: String(message?.text || '') });
        return res && res.ok ? { ok: true } : { ok: false, error: String(res?.reason || res?.error || 'send_failed') };
      });
    }
    return null;
  };
  real.tabs.sendMessage = (/** @type {any[]} */ ...args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const [tabId, message] = args;
    const p = realTabsGet(tabId)
      .then((tab) => (isYtWatchLikeUrl(String(tab?.url || '')) ? answerForYtTab(tabId, message) : null))
      .catch(() => null)
      .then((answered) => (answered ? answered : realSendMessage(...args)));
    if (cb) {
      p.then(cb, () => cb(undefined));
      return undefined;
    }
    return p;
  };

  // 視聴タブの変化(タブ切替・URL 変化)は、写したタブで popup に渡す
  for (const evName of ['onUpdated', 'onCreated']) {
    const ev = real.tabs[evName];
    if (!ev || typeof ev.addListener !== 'function') continue;
    const add = ev.addListener.bind(ev);
    ev.addListener = (/** @type {Function} */ fn) =>
      add((/** @type {any[]} */ ...a) => {
        const out = a.map((x) => (x && typeof x === 'object' && 'url' in x ? mapTab(x) : x));
        return fn(...out);
      });
  }

  // ---- 4. YouTube の記録が増えたら、コメントのキーが変わったと知らせる ----
  const onChanged = real.storage.onChanged;
  if (onChanged && typeof onChanged.addListener === 'function') {
    /** @type {Function[]} */
    const listeners = [];
    const add = onChanged.addListener.bind(onChanged);
    onChanged.addListener = (/** @type {Function} */ fn) => {
      listeners.push(fn);
      add(fn);
    };
    add((/** @type {Record<string, any>} */ changes, /** @type {string} */ area) => {
      if (area !== 'local' || !changes[KEY_YT_SUMMARIES]) return;
      const next = changes[KEY_YT_SUMMARIES].newValue || {};
      const prev = changes[KEY_YT_SUMMARIES].oldValue || {};
      for (const vid of Object.keys(next)) {
        if (prev[vid] && Number(prev[vid].updatedAt || 0) === Number(next[vid]?.updatedAt || 0)) continue;
        const lv = pseudoLvForVideoId(vid);
        void buildCommentsForLv(lv).then((arr) => {
          if (!arr) return;
          const synth = { [`${COMMENTS_PREFIX}${lv}`]: { newValue: arr } };
          for (const fn of listeners) {
            try {
              fn(synth, 'local');
            } catch {
              /* 1 つの受け手の失敗で他を止めない */
            }
          }
        });
      }
    });
  }
}
