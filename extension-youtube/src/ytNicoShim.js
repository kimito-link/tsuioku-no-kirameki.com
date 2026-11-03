// ytNicoShim.js — ニコ生版のサイドパネル(本物の popup-entry.js)を、YouTube の記録で動かすための「入口の差し替え」。
/* global window, history, URL, document, NodeFilter, MutationObserver, setInterval */
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
import { buildYtGiftBags } from './ytGiftToNico.js';

const KEY_YT_SUMMARIES = 'yt_stream_summaries';
const COMMENTS_PREFIX = 'nls_comments_';
// ニコ生版がギフトを読むキー(ytGiftToNico.js の説明を参照)。prefix → buildYtGiftBags の結果のどれを返すか
const GIFT_KEY_PREFIXES = /** @type {Array<[string, string]>} */ ([
  ['nls_gift_users_', 'giftUsers'],
  ['nls_gift_events_', 'giftEvents'],
  ['nls_gift_subapp_history_', 'subApp'],
  ['nls_gift_history_throws_', 'throws'],
  ['nls_koken_api_contrib_', 'koken'],
]);

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

// ---- 2b. YouTube の人 ⇔ ニコ生版が「本人のID」として扱える数字のID ----
// ニコ生版は「数字のユーザーID」の人だけを本人として上の段(りんく・こん太)へ並べる(匿名 a: はたぬ姉)。
// YouTube のチャンネルID(UC…)は数字でないので、そのままだと全員たぬ姉に落ちる。
// → 同じ人にはいつも同じ 10 桁の数字を割り当てて渡す(ニコ生版のルールはそのまま・入口で形だけ合わせる)。
/** @type {Map<string, string>} 数字ID → YouTube の人の鍵(UC… か name:表示名) */
const ytKeyByNumericUid = new Map();
/** @type {Map<string, string>} YouTube の人の鍵 → 数字ID */
const numericUidByYtKey = new Map();

/**
 * @param {string} ytKey UC… か name:表示名
 * @returns {string} 10 桁の数字(先頭は 8)
 */
export function numericUidForYtKey(ytKey) {
  const key = String(ytKey || '');
  if (!key) return '';
  const known = numericUidByYtKey.get(key);
  if (known) return known;
  let h1 = 0x9e3779b1;
  let h2 = 0x85ebca77;
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0xc2b2ae3d) >>> 0;
  }
  let n = ((h1 % 100000) * 10000 + (h2 % 10000)) % 1000000000;
  let uid = String(8000000000 + n);
  // まれに別の人と同じ数字になったら、ずらして空いている数字にする
  while (ytKeyByNumericUid.has(uid) && ytKeyByNumericUid.get(uid) !== key) {
    n = (n + 1) % 1000000000;
    uid = String(8000000000 + n);
  }
  numericUidByYtKey.set(key, uid);
  ytKeyByNumericUid.set(uid, key);
  return uid;
}

/** @param {string} uid */
export function ytKeyForNumericUid(uid) {
  return ytKeyByNumericUid.get(String(uid || '')) || '';
}

/**
 * 数字ID → その人の YouTube のページ(チャンネルが分かる人だけ)
 * @param {string} uid
 */
export function ytChannelUrlForNumericUid(uid) {
  const key = ytKeyForNumericUid(uid);
  if (/^UC[A-Za-z0-9_-]{22}$/.test(key)) return `https://www.youtube.com/channel/${key}`;
  const h = key.startsWith('handle:@') ? key.slice('handle:@'.length) : '';
  return /^[A-Za-z0-9._-]{3,30}$/.test(h) ? `https://www.youtube.com/@${h}` : '';
}

/** @type {Map<string, string>} 数字ID → その人の YouTube のアイコン(分かっている人だけ) */
const ytIconByNumericUid = new Map();

/** @param {string} uid */
export function ytIconForNumericUid(uid) {
  return ytIconByNumericUid.get(String(uid || '')) || '';
}

// ---- 3. YouTube の記録 → ニコ生のコメント行 ----
/**
 * @param {any} r YouTube の記録 1 件(ytIdbStore)
 * @param {number} i 記録順の番号(0 始まり)
 * @param {string} lv
 * @param {string} [personKey] 同じ人をまとめた鍵(UC… / handle:@… / name:…)
 */
export function ytRecordToNicoEntry(r, i, lv, personKey) {
  const channelId = String(r?.channelId || '').trim();
  const name = String(r?.name || '').trim();
  const key = personKey || channelId || (name ? `name:${name}` : '');
  const at = Number(r?.recordedAt || 0) || Date.now();
  return {
    id: String(r?.id || r?.pk || `yt${i}`),
    liveId: lv,
    commentNo: String(i + 1),
    text: String(r?.text || ''),
    userId: numericUidForYtKey(key),
    ytChannelId: /^UC/.test(key) ? key : channelId,
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
  // 配信の本当の開始時刻(ページの「ライブ配信開始日」)。分からないときだけ、記録を始めた時刻で代わりにする。
  const startedAt = Number(sum?.startedAt || 0) || Number(sum?.createdAt || 0);
  const chId = String(sum?.broadcasterChannelId || '');
  const bUid = chId ? numericUidForYtKey(chId) : '';
  // 配信者のアイコンがまとめに無いときは、配信者がチャットに書いた記録のアイコンを使う
  const bIcon = String(sum?.broadcasterIconUrl || '') || ytIconForNumericUid(bUid);
  if (bUid && bIcon) ytIconByNumericUid.set(bUid, bIcon);
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
    broadcasterUserId: bUid,
    broadcasterPageUrl: chId ? `https://www.youtube.com/channel/${chId}` : '',
    broadcasterIconUrl: bIcon,
    // YouTube の「N 人が視聴中」は同時接続そのもの。ニコ生版の「公式の同接」の欄に入れる(推定でなく直接値として出る)。
    // YouTube には延べの来場者数が無いので、来場は空のまま(ニコ生版は「(取得不可)」と出す)。
    viewerCountFromDom: null,
    viewerCountSource: 'dom',
    officialViewerCount: Number.isFinite(viewers) && viewers >= 0 ? viewers : null,
    officialStatsUpdatedAt: Number(sum?.updatedAt || 0) || Date.now(),
    streamAgeMin: startedAt > 0 ? Math.max(0, Math.round((Date.now() - startedAt) / 60000)) : null,
  };
}

/** @param {string} name */
const normName = (name) => String(name || '').trim().replace(/^@/, '').toLowerCase();

/**
 * 同じ人の記録をそろえる。YouTube は同じ人でも、チャンネルID(UC…)が取れた記録と、
 * 名前(handle:@…)しか取れなかった記録が混ざる。そのまま渡すと同じ人が2人に分かれて並ぶ(2026-11-03 実機)。
 * → 名前が同じで UC… が分かっている人がいれば、その UC… にまとめる。
 *    アイコンも、その人のどれかの記録に付いていれば全部の記録に付ける。
 * @param {any[]} items
 * @returns {{ keyOf: (r: any) => string, iconOf: (key: string) => string }}
 */
export function buildYtPersonResolver(items) {
  /** @type {Map<string, string>} 名前 → UC… */
  const ucByName = new Map();
  for (const r of items) {
    const ch = String(r?.channelId || '').trim();
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(ch)) continue;
    const n = normName(r?.name);
    if (n && !ucByName.has(n)) ucByName.set(n, ch);
  }
  /** @param {any} r */
  const keyOf = (r) => {
    const ch = String(r?.channelId || '').trim();
    if (/^UC[A-Za-z0-9_-]{22}$/.test(ch)) return ch;
    const n = normName(r?.name || (ch.startsWith('handle:') ? ch.slice('handle:'.length) : ''));
    const uc = n ? ucByName.get(n) : '';
    if (uc) return uc;
    if (ch) return ch;
    return n ? `name:${n}` : '';
  };
  /** @type {Map<string, string>} 人の鍵 → 最後に見えたアイコン */
  const iconByKey = new Map();
  for (const r of items) {
    const icon = String(r?.iconUrl || '').trim();
    if (!icon) continue;
    const k = keyOf(r);
    if (k) iconByKey.set(k, icon);
  }
  return { keyOf, iconOf: (key) => iconByKey.get(key) || '' };
}

/** @type {Map<string, { at: number, p: Promise<any[] | undefined> }>} 同じ瞬間に何本も聞かれても IndexedDB は1回だけ読む */
const commentsCache = new Map();
/** 入口の動きの記録(画面の「詳細」や開発者ツールから見られる: globalThis.__ytNicoShimDiag) */
const shimDiag = { notified: 0, listeners: 0, lastNotifiedAt: 0, lastCount: 0 };
/** @type {any} */ (globalThis).__ytNicoShimDiag = shimDiag;
/** popup が最後にコメントを聞いてきた配信(=いま画面に出ている配信) */
let lastAskedLv = '';
/** @param {string} lv */
function buildCommentsForLv(lv) {
  const hit = commentsCache.get(lv);
  if (hit && Date.now() - hit.at < 1500) return hit.p;
  const p = buildCommentsForLvUncached(lv);
  commentsCache.set(lv, { at: Date.now(), p });
  return p;
}

/**
 * @param {string} lv
 * @param {any} [summary] yt_stream_summaries の1件(配信の開始時刻に使う)
 */
async function buildGiftBagsForLv(lv, summary) {
  const entries = await buildCommentsForLv(lv);
  if (!entries) return undefined;
  return buildYtGiftBags(entries, lv, { startedAt: Number(summary?.startedAt || 0) });
}

/** @param {string} lv */
async function buildCommentsForLvUncached(lv) {
  const vid = videoIdForPseudoLv(lv);
  if (!vid) return undefined;
  const items = await getYtStreamCommentsByVideoId(vid);
  const list = Array.isArray(items) ? items : [];
  const who = buildYtPersonResolver(list);
  return list.map((r, i) => {
    const key = who.keyOf(r);
    const icon = String(r?.iconUrl || '').trim() || who.iconOf(key);
    const e = ytRecordToNicoEntry({ ...r, iconUrl: icon }, i, lv, key);
    if (icon && e.userId) ytIconByNumericUid.set(e.userId, icon);
    return e;
  });
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
        if (k.startsWith(COMMENTS_PREFIX)) {
          const lv = k.slice(COMMENTS_PREFIX.length).toLowerCase();
          if (!videoIdForPseudoLv(lv)) continue;
          lastAskedLv = lv;
          const arr = await buildCommentsForLv(lv);
          if (arr) bag[k] = arr;
          continue;
        }
        const g = GIFT_KEY_PREFIXES.find(([pre]) => k.startsWith(pre));
        if (!g) continue;
        const lv = k.slice(g[0].length).toLowerCase();
        const vid = videoIdForPseudoLv(lv);
        if (!vid) continue;
        const sums = /** @type {Record<string, any>} */ (await realGet(KEY_YT_SUMMARIES));
        const gifts = /** @type {Record<string, any> | undefined} */ (
          await buildGiftBagsForLv(lv, sums?.[KEY_YT_SUMMARIES]?.[vid])
        );
        const v = gifts ? gifts[g[1]] : null;
        if (v != null) bag[k] = v;
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
        const snapshot = /** @type {Record<string, any>} */ (ytSummaryToNicoSnapshot(sum, vid, String(tab?.title || '')));
        // 「ギフトpt」= YouTube の有料の応援の合計(円にしたおよその額)
        const gifts = await buildGiftBagsForLv(pseudoLvForVideoId(vid), sum).catch(() => undefined);
        if (gifts && gifts.totalPoints > 0) snapshot.officialGiftPoints = gifts.totalPoints;
        return { ok: true, snapshot };
      });
    }
    if (type === 'NLS_CAPTURE_SCREENSHOT') {
      // ニコ生版の「スクショ」= 動画の今のコマを画像にする。YouTube 版はもともと持っている YT_CAPTURE_FRAME で撮る。
      return realTabsGet(tabId).then(async (tab) => {
        const vid = parseYtVideoIdFromUrl(String(tab?.url || ''));
        const res = await real.runtime.sendMessage({ type: 'YT_CAPTURE_FRAME', videoId: vid });
        if (res && res.ok && typeof res.dataUrl === 'string') {
          return { ok: true, dataUrl: res.dataUrl, liveId: pseudoLvForVideoId(vid) };
        }
        return { ok: false, errorCode: String(res?.reason || 'capture_failed') };
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
    /** @type {Map<string, string>} lv → 最後に知らせた記録の「件数:最後のid」 */
    const lastNotified = new Map();
    /**
     * その配信の記録を読み直し、変わっていれば popup に「コメント(とギフト)のキーが変わった」と知らせる。
     * 失敗しても次の回で必ずやり直す(1回の失敗で画面の更新を止めない)。
     * @param {string} lv
     * @param {any} summary
     */
    const notifyLv = async (lv, summary) => {
      commentsCache.delete(lv);
      const arr = await buildCommentsForLv(lv).catch(() => undefined);
      if (!arr) return;
      const sig = `${arr.length}:${arr.length ? arr[arr.length - 1].id : ''}`;
      if (lastNotified.get(lv) === sig) return;
      lastNotified.set(lv, sig);
      /** @type {Record<string, { newValue: any }>} */
      const synth = { [`${COMMENTS_PREFIX}${lv}`]: { newValue: arr } };
      try {
        const gifts = /** @type {Record<string, any>} */ (buildYtGiftBags(arr, lv, { startedAt: Number(summary?.startedAt || 0) }));
        if (gifts && gifts.count > 0) {
          for (const [pre, field] of GIFT_KEY_PREFIXES) {
            const v = gifts[field];
            if (v != null) synth[`${pre}${lv}`] = { newValue: v };
          }
        }
      } catch {
        /* ギフトが作れなくてもコメントは知らせる */
      }
      shimDiag.notified += 1;
      shimDiag.listeners = listeners.length;
      shimDiag.lastNotifiedAt = Date.now();
      shimDiag.lastCount = arr.length;
      for (const fn of listeners) {
        try {
          fn(synth, 'local');
        } catch {
          /* 1 つの受け手の失敗で他を止めない */
        }
      }
    };
    add((/** @type {Record<string, any>} */ changes, /** @type {string} */ area) => {
      if (area !== 'local' || !changes[KEY_YT_SUMMARIES]) return;
      const next = changes[KEY_YT_SUMMARIES].newValue || {};
      const prev = changes[KEY_YT_SUMMARIES].oldValue || {};
      for (const vid of Object.keys(next)) {
        if (prev[vid] && Number(prev[vid].updatedAt || 0) === Number(next[vid]?.updatedAt || 0)) continue;
        void notifyLv(pseudoLvForVideoId(vid), next[vid]);
      }
    });
    // 知らせが来なくても(まとめの書き込みが遅れる・落ちる)、開いている配信は3秒ごとに記録を見直す
    setInterval(() => {
      const lv = lastAskedLv;
      if (!lv) return;
      const vid = videoIdForPseudoLv(lv);
      if (!vid) return;
      void Promise.resolve(realGet(KEY_YT_SUMMARIES))
        .then((bag) => notifyLv(lv, bag?.[KEY_YT_SUMMARIES]?.[vid]))
        .catch(() => {});
    }, 3000);
  }
}

// ---- 5. 画面に出た「数字ID」と「ニコニコのユーザーページへのリンク」を、YouTube の人に戻す ----
// ニコ生版は数字IDから https://www.nicovideo.jp/user/<数字> を作るので、そのままだとニコニコへ飛んでしまう。
// 描画はニコ生版のまま、出来上がった画面の上で「誰か」だけを YouTube に戻す。
const NICO_USER_LINK_RE = /^https?:\/\/(?:www\.)?nicovideo\.jp\/user\/(\d+)/;
const PSEUDO_UID_RE = /8\d{9}/g;

/** @param {string} uid */
function ytLabelForUid(uid) {
  const key = ytKeyForNumericUid(uid);
  if (!key) return '';
  if (key.startsWith('name:')) return '';
  if (key.startsWith('handle:')) return key.slice('handle:'.length);
  return key.length <= 18 ? key : `${key.slice(0, 8)}…${key.slice(-6)}`;
}

/** @param {Element} a */
function fixAnchor(a) {
  const href = String(a.getAttribute('href') || '');
  const m = href.match(NICO_USER_LINK_RE);
  if (!m || !ytKeyForNumericUid(m[1])) return;
  const yt = ytChannelUrlForNumericUid(m[1]);
  if (yt) a.setAttribute('href', yt);
  else a.removeAttribute('href');
}

/** @param {Text} node */
function fixTextNode(node) {
  const v = String(node.nodeValue || '');
  if (!/8\d{9}/.test(v)) return;
  const next = v.replace(PSEUDO_UID_RE, (uid) => (ytKeyForNumericUid(uid) ? ytLabelForUid(uid) : uid));
  if (next !== v) node.nodeValue = next;
}

/** @param {Element} el */
function fixTitleAttr(el) {
  const t = el.getAttribute('title');
  if (!t || !/8\d{9}/.test(t)) return;
  const next = t.replace(PSEUDO_UID_RE, (uid) => (ytKeyForNumericUid(uid) ? ytLabelForUid(uid) || '' : uid));
  if (next !== t) el.setAttribute('title', next);
}

// ニコ生版はアイコンが無い人の顔を数字IDから(ニコニコの置き場所に)作るが、疑似IDなのでそこには無い。
// その人の YouTube のアイコンが分かっていれば、それに差し替える(分からなければニコ生版の代わりの顔のまま)。
const NICO_USERICON_RE = /nicoaccount\/usericon\/(?:s\/)?\d+\/(8\d{9})\.jpg/;
/** @param {Element} img */
function fixImg(img) {
  const src = String(img.getAttribute('src') || '');
  const m = src.match(NICO_USERICON_RE);
  if (!m) return;
  const icon = ytIconForNumericUid(m[1]);
  if (icon && icon !== src) img.setAttribute('src', icon);
}

/** @param {Node} root */
function fixSubtree(root) {
  if (root.nodeType === 3) {
    fixTextNode(/** @type {Text} */ (root));
    return;
  }
  if (root.nodeType !== 1) return;
  const el = /** @type {Element} */ (root);
  if (el.tagName === 'A') fixAnchor(el);
  if (el.tagName === 'IMG') fixImg(el);
  fixTitleAttr(el);
  el.querySelectorAll('img[src*="nicoaccount/usericon"]').forEach(fixImg);
  el.querySelectorAll('a[href*="nicovideo.jp/user/"]').forEach(fixAnchor);
  el.querySelectorAll('[title]').forEach(fixTitleAttr);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) fixTextNode(/** @type {Text} */ (n));
}

function startDomFixer() {
  if (!document.body) return;
  fixSubtree(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') fixTextNode(/** @type {Text} */ (m.target));
      else if (m.type === 'attributes') {
        const el = /** @type {Element} */ (m.target);
        if (m.attributeName === 'href' && el.tagName === 'A') fixAnchor(el);
        else if (m.attributeName === 'title') fixTitleAttr(el);
        else if (m.attributeName === 'src' && el.tagName === 'IMG') fixImg(el);
      } else m.addedNodes.forEach(fixSubtree);
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href', 'title', 'src'],
  });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startDomFixer, { once: true });
  else startDomFixer();
}

// ニコ生版がプログラムからタブを開くとき(chrome.tabs.create / window.open)も、ニコニコのユーザーページなら YouTube へ
if (real && real.tabs && typeof real.tabs.create === 'function') {
  const realCreate = real.tabs.create.bind(real.tabs);
  real.tabs.create = (/** @type {any} */ props, /** @type {any} */ cb) => {
    const m = String(props?.url || '').match(NICO_USER_LINK_RE);
    if (m && ytKeyForNumericUid(m[1])) {
      const yt = ytChannelUrlForNumericUid(m[1]);
      if (!yt) return cb ? cb(undefined) : Promise.resolve(undefined);
      props = { ...props, url: yt };
    }
    return realCreate(props, cb);
  };
}
if (typeof window !== 'undefined' && typeof window.open === 'function') {
  const realOpen = window.open.bind(window);
  window.open = (/** @type {any} */ url, /** @type {any[]} */ ...rest) => {
    const m = String(url || '').match(NICO_USER_LINK_RE);
    if (m && ytKeyForNumericUid(m[1])) {
      const yt = ytChannelUrlForNumericUid(m[1]);
      if (!yt) return null;
      return realOpen(yt, ...rest);
    }
    return realOpen(url, ...rest);
  };
}
