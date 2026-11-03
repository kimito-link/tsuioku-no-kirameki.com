// ytNicoShim.js — ニコ生版のサイドパネル(本物の popup-entry.js)を、YouTube の記録で動かすための「入口の差し替え」。
/* global window, history, URL, document, NodeFilter, MutationObserver, setInterval, clearInterval, setTimeout, sessionStorage, location */
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
import { ytPostedAtFromClock, ytReplayPostedAt } from '../../src/lib/youtube/ytPostedAt.js';
import { ytWording } from '../../src/lib/youtube/ytWording.js';
import { ytSuperChatTierColor, ytSuperChatFromRowText } from '../../src/lib/youtube/ytSuperChatTier.js';
import { parseYtVideoIdFromUrl, isYtWatchLikeUrl } from '../../src/lib/youtube/ytPageMeta.js';
import { buildYtGiftBags } from './ytGiftToNico.js';

const KEY_YT_SUMMARIES = 'yt_stream_summaries';
const COMMENTS_PREFIX = 'nls_comments_';
// ニコ生版の「テール」(まだ本体に畳み込んでいない新着)。ニコ生版の popup は、本体の全件を一度読んだら
// 同じ配信のあいだはその控えを使い回し、新着はテールから足す。YouTube 版は本体とテールを分けて持たないので、
// テールにも全件を渡す(popup が既存の重複畳み込み=mergeTailRowsIntoDisplay で控えと重ねて、増えた分だけが足される)。
// これが無いと、控えのまま件数も最新コメントも止まる(0.1.11 までの「リアルタイムで反映されない」)。
const TAIL_PREFIX = 'nls_ctail_';
const LAST_WATCH_URL_KEY = 'nls_last_watch_url';
/** @param {Record<string, any> | undefined} sums yt_stream_summaries */
function newestVideoIdOf(sums) {
  let best = '';
  let bestAt = -1;
  for (const [vid, sum] of Object.entries(sums || {})) {
    const at = Number(sum?.updatedAt || 0);
    if (at > bestAt) {
      bestAt = at;
      best = vid;
    }
  }
  return best;
}
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
  // サイドパネル(sidepanel.html)だけ。マーケ等の別ページは自分の URL のまま動かす
  if (!/\/sidepanel\.html$/.test(u.pathname)) throw new Error('not_sidepanel');
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
/** @type {Map<string, string>} 記録で見えた「名前 → UC…」(配信者のチャンネルを名前から引くため) */
const ucByNameHint = new Map();

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
    // チャット欄の時刻表示から求めた「書かれた時刻」(受け取った時刻とずれるのは開いたときに残っていた分)
    // リプレイ(アーカイブ)は時刻表示が経過時間なので、配信の開始時刻 + 経過時間にする
    ytPostedAt: r?.replay
      ? ytReplayPostedAt(String(r?.ts || ''), Number(r?._streamStartedAt || 0), at)
      : ytPostedAtFromClock(String(r?.ts || ''), at),
    ytKind: String(r?.kind || 'text'),
    ...(r?.giftName ? { ytGiftName: String(r.giftName) } : {}),
    ...(r?.giftImageUrl ? { ytGiftImageUrl: String(r.giftImageUrl) } : {}),
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
  const ucId = String(sum?.broadcasterChannelId || '');
  const handle = String(sum?.broadcasterHandle || '');
  // UC… が分からない配信は、記録の中の同じ名前の人(配信者がチャットに書いていれば UC… が分かる)→ @名前 の順で決める
  const ucFromRecords = !ucId && handle ? ucByNameHint.get(normName(handle)) || '' : '';
  const chId = ucId || ucFromRecords;
  const bKey = chId || (handle ? `handle:${handle}` : '');
  const bUid = bKey ? numericUidForYtKey(bKey) : '';
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
    broadcasterPageUrl: chId
      ? `https://www.youtube.com/channel/${chId}`
      : handle
        ? `https://www.youtube.com/${encodeURI(handle)}`
        : '',
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
    if (n) ucByNameHint.set(n, ch);
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
const shimDiag = { notified: 0, listeners: 0, lastNotifiedAt: 0, lastCount: 0, commentGets: 0, keysAsked: /** @type {string[]} */ ([]) };
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

/**
 * YouTube の「トップファン」(XP 順位)を、ニコ生版の「ギフト貢献度」(公式ランキング)の形にする。
 * 順位表には @handle しか無いので、記録の中の同じ名前の人(=同じ数字ID)に結びつける。
 * @param {any} board yt_leaderboard_<videoId>
 * @param {any[]} entries ニコ生形のコメント行
 * @param {string} lv
 */
export function ytLeaderboardToKoken(board, entries, lv) {
  const rows = Array.isArray(board?.rows) ? board.rows : [];
  if (!rows.length) return null;
  /** @type {Map<string, { uid: string, icon: string }>} */
  const byName = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    const n = normName(e?.nickname);
    if (n && e?.userId) byName.set(n, { uid: String(e.userId), icon: String(e.avatarUrl || '') || byName.get(n)?.icon || '' });
  }
  return {
    liveId: lv,
    capturedAt: Number(board.capturedAt) || Date.now(),
    lastOk: true,
    lastStatus: 200,
    source: 'youtube-top-fans',
    rows: rows.map((/** @type {any} */ r) => {
      const name = String(r?.name || '');
      const hit = byName.get(normName(name));
      const uid = hit?.uid || numericUidForYtKey(`handle:${name.startsWith('@') ? name : `@${name}`}`);
      const icon = String(r?.iconUrl || '') || hit?.icon || '';
      if (icon) ytIconByNumericUid.set(uid, icon);
      return {
        rank: Number(r?.rank) || 0,
        name,
        contribution: Number(r?.xp) || 0,
        isAnonymous: false,
        thumbnailUrl: icon,
        userPageUrl: `https://www.nicovideo.jp/user/${uid}`,
      };
    }),
  };
}

/** @param {string} lv */
async function buildCommentsForLvUncached(lv) {
  const vid = videoIdForPseudoLv(lv);
  if (!vid) return undefined;
  const items = await getYtStreamCommentsByVideoId(vid);
  const list = Array.isArray(items) ? items : [];
  const who = buildYtPersonResolver(list);
  let streamStartedAt = 0;
  if (list.some((r) => r?.replay)) {
    try {
      const bag = await real.storage.local.get(KEY_YT_SUMMARIES);
      const sum = bag?.[KEY_YT_SUMMARIES]?.[vid];
      streamStartedAt = Number(sum?.startedAt || 0);
    } catch {
      /* 分からなければ受け取った時刻 */
    }
  }
  const out = list.map((r, i) => {
    const key = who.keyOf(r);
    const icon = String(r?.iconUrl || '').trim() || who.iconOf(key);
    const e = ytRecordToNicoEntry({ ...r, iconUrl: icon, _streamStartedAt: streamStartedAt }, i, lv, key);
    if (icon && e.userId) ytIconByNumericUid.set(e.userId, icon);
    return e;
  });
  // 記録から配信者の UC… が分かることがあるので、配信者の登録をやり直す
  registerBroadcastersFromSummaries();
  return out;
}

// マーケ画面などは配信者の情報を保存済みの控えから読むので、ytSummaryToNicoSnapshot が呼ばれず
// 配信者の数字ID → YouTube の対応が分からないまま(ニコニコのリンク・ID のまま)になる。記録のある配信の配信者を先に登録する。
/** @type {Record<string, any>} */
let knownSummaries = {};
function registerBroadcastersFromSummaries() {
  for (const [vid, sum] of Object.entries(knownSummaries)) {
    try {
      ytSummaryToNicoSnapshot(sum, vid, '');
    } catch {
      /* 1件壊れていても残りは登録する */
    }
  }
}

// ---- chrome の差し替え(本物の上に薄くかぶせる) ----
const real = /** @type {any} */ (globalThis).chrome;
if (real && real.storage && real.storage.local && real.tabs) {
  const realLocal = real.storage.local;
  const realGet = realLocal.get.bind(realLocal);
  // 前に開いた配信の疑似 lv(nls_last_watch_url 等に残る)も引けるよう、記録のある配信を先に全部登録しておく
  const knownVideosReady = Promise.resolve(realGet(KEY_YT_SUMMARIES))
    .then((bag) => {
      knownSummaries = (bag && bag[KEY_YT_SUMMARIES]) || {};
      for (const vid of Object.keys(knownSummaries)) pseudoLvForVideoId(vid);
      registerBroadcastersFromSummaries();
    })
    .catch(() => {});

  const lastWatchUrlFromSummaries = async () => {
    const sums = /** @type {Record<string, any>} */ (await realGet(KEY_YT_SUMMARIES))?.[KEY_YT_SUMMARIES];
    const vid = newestVideoIdOf(sums);
    return vid ? `https://live.nicovideo.jp/watch/${pseudoLvForVideoId(vid)}` : '';
  };

  /**
   * @param {any} keys
   * @returns {Promise<Record<string, any>>}
   */
  const shimGet = async (keys) => {
    await knownVideosReady;
    const list =
      keys == null ? null : Array.isArray(keys) ? keys.map(String) : typeof keys === 'string' ? [keys] : Object.keys(keys);
    const bag = /** @type {Record<string, any>} */ (await realGet(keys));
    if (list) for (const k of list) if (/^nls_/.test(k) && !shimDiag.keysAsked.includes(k.replace(/lv\d+/, 'LV'))) shimDiag.keysAsked.push(k.replace(/lv\d+/, 'LV'));
    if (list) {
      for (const k of list) {
        if (k === LAST_WATCH_URL_KEY) {
          // ニコ生版のコメビュ等は「最後に見ていた配信」をこのキーから決める。YouTube 版では、
          // 記録がいちばん新しく更新された配信(=いま見ている配信)の疑似 watch URL を渡す。
          const url = await lastWatchUrlFromSummaries();
          if (url) bag[k] = url;
          continue;
        }
        if (k.startsWith(COMMENTS_PREFIX) || k.startsWith(TAIL_PREFIX)) {
          const lv = k.slice((k.startsWith(TAIL_PREFIX) ? TAIL_PREFIX : COMMENTS_PREFIX).length).toLowerCase();
          if (!videoIdForPseudoLv(lv)) continue;
          lastAskedLv = lv;
          shimDiag.commentGets += 1;
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
        let v = gifts ? gifts[g[1]] : null;
        if (g[1] === 'koken') {
          // トップファンの順位があれば、そちらを「ギフト貢献度」にする(YouTube 公式の応援ランキング)
          const lbKey = `yt_leaderboard_${vid}`;
          const lb = /** @type {Record<string, any>} */ (await realGet(lbKey))?.[lbKey];
          const fromBoard = lb ? ytLeaderboardToKoken(lb, (await buildCommentsForLv(lv)) || [], lv) : null;
          if (fromBoard) v = fromBoard;
        }
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
      const synth = { [`${COMMENTS_PREFIX}${lv}`]: { newValue: arr }, [`${TAIL_PREFIX}${lv}`]: { newValue: arr } };
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
      try {
        const vid = videoIdForPseudoLv(lv);
        const lbKey = `yt_leaderboard_${vid}`;
        const lb = /** @type {Record<string, any>} */ (await realGet(lbKey))?.[lbKey];
        const fromBoard = lb ? ytLeaderboardToKoken(lb, arr, lv) : null;
        if (fromBoard) synth[`nls_koken_api_contrib_${lv}`] = { newValue: fromBoard };
      } catch {
        /* no-op */
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
      if (area !== 'local') return;
      for (const ck of Object.keys(changes)) {
        if (!ck.startsWith('yt_leaderboard_')) continue;
        const vid = ck.slice('yt_leaderboard_'.length);
        const lv = pseudoLvForVideoId(vid);
        void buildCommentsForLv(lv).then((arr) => {
          const koken = ytLeaderboardToKoken(changes[ck].newValue, arr || [], lv);
          if (!koken) return;
          const synth = { [`nls_koken_api_contrib_${lv}`]: { newValue: koken } };
          for (const fn of listeners) {
            try {
              fn(synth, 'local');
            } catch {
              /* no-op */
            }
          }
        });
      }
      if (!changes[KEY_YT_SUMMARIES]) return;
      const next = changes[KEY_YT_SUMMARIES].newValue || {};
      const prev = changes[KEY_YT_SUMMARIES].oldValue || {};
      // 見ている配信が変わったら「最後に見ていた配信」も変わったと知らせる(コメビュが新しい配信へ追従する)
      const newestNext = newestVideoIdOf(next);
      if (newestNext && newestNext !== newestVideoIdOf(prev)) {
        const synthUrl = { [LAST_WATCH_URL_KEY]: { newValue: `https://live.nicovideo.jp/watch/${pseudoLvForVideoId(newestNext)}` } };
        for (const fn of listeners) {
          try {
            fn(synthUrl, 'local');
          } catch {
            /* no-op */
          }
        }
      }
      for (const vid of Object.keys(next)) {
        if (prev[vid] && Number(prev[vid].updatedAt || 0) === Number(next[vid]?.updatedAt || 0)) continue;
        void notifyLv(pseudoLvForVideoId(vid), next[vid]);
      }
    });
    // 知らせが来なくても(まとめの書き込みが遅れる・落ちる)、開いている配信は3秒ごとに記録を見直す
    // ★拡張が入れ替わった(更新された)あと、開いたままのコメビュ等の窓では chrome.* が使えなくなり、
    //   ここが毎回「Extension context invalidated」を投げてエラー一覧に積もる。切れていたら見回りをやめる。
    const pollTimer = setInterval(() => {
      try {
        if (!real.runtime?.id) {
          clearInterval(pollTimer);
          // 開いたままの窓は新しい版で開き直す(1分に1回まで)
          try {
            const last = Number(sessionStorage.getItem('nl_yt_page_orphan_reload_at') || 0);
            if (Date.now() - last > 60_000) {
              sessionStorage.setItem('nl_yt_page_orphan_reload_at', String(Date.now()));
              setTimeout(() => location.reload(), 1500);
            }
          } catch {
            /* no-op */
          }
          return;
        }
        const lv = lastAskedLv;
        if (!lv) return;
        const vid = videoIdForPseudoLv(lv);
        if (!vid) return;
        void Promise.resolve(realGet(KEY_YT_SUMMARIES))
          .then((bag) => notifyLv(lv, bag?.[KEY_YT_SUMMARIES]?.[vid]))
          .catch(() => {});
      } catch {
        clearInterval(pollTimer);
      }
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

// 疑似 lv(lv9…)の放送 URL・番号は YouTube の動画に戻す(分かる配信だけ)。
const PSEUDO_WATCH_URL_RE = /https?:\/\/live\.nicovideo\.jp\/watch\/(lv9\d{11})/g;
const PSEUDO_LV_RE = /\blv9\d{11}\b/g;
/** @param {string} text */
function ytFixPseudoLvText(text) {
  return String(text)
    .replace(PSEUDO_WATCH_URL_RE, (all, lv) => {
      const vid = videoIdForPseudoLv(lv);
      return vid ? `https://www.youtube.com/watch?v=${vid}` : all;
    })
    .replace(PSEUDO_LV_RE, (lv) => videoIdForPseudoLv(lv) || lv);
}

/** @param {Element} a */
function fixAnchor(a) {
  const href = String(a.getAttribute('href') || '');
  if (/live\.nicovideo\.jp\/watch\/lv9\d{11}/.test(href)) {
    const next = ytFixPseudoLvText(href);
    if (next !== href) a.setAttribute('href', next);
    return;
  }
  const m = href.match(NICO_USER_LINK_RE);
  if (!m || !ytKeyForNumericUid(m[1])) return;
  const yt = ytChannelUrlForNumericUid(m[1]);
  if (yt) a.setAttribute('href', yt);
  else a.removeAttribute('href');
}

/** @param {Text} node */
function fixTextNode(node) {
  const parentTag = node.parentNode && /** @type {Element} */ (node.parentNode).tagName;
  if (parentTag === 'SCRIPT' || parentTag === 'STYLE') return; // 動く中身・見た目の指定は書き換えない
  const v = String(node.nodeValue || '');
  let next = ytWording(v); // ニコニコの言葉 → YouTube の言葉(決まった文言だけ)
  if (/8\d{9}/.test(next)) next = next.replace(PSEUDO_UID_RE, (uid) => (ytKeyForNumericUid(uid) ? ytLabelForUid(uid) : uid));
  if (/lv9\d{11}/.test(next)) next = ytFixPseudoLvText(next);
  if (next !== v) node.nodeValue = next;
}

// ニコ生版のコメビュは名前の横に data-nl-uid(数字ID)を CSS で「(数字)」と出す。疑似IDなので、
// YouTube の人の見分け(UC… / @handle)を data-yt-uid-label に置き、YouTube 版のコメビュの CSS がそちらを出す
// (data-nl-uid 自体は人の詳細を開くのに使うので書き換えない)。
/** @param {Element} el */
function fixUidLabelAttr(el) {
  const uid = String(el.getAttribute('data-nl-uid') || '');
  if (!/^8\d{9}$/.test(uid) || !ytKeyForNumericUid(uid)) return;
  const label = ytLabelForUid(uid) || '';
  if (el.getAttribute('data-yt-uid-label') !== label) el.setAttribute('data-yt-uid-label', label);
}

/** @param {Element} el */
function fixTitleAttr(el) {
  const t = el.getAttribute('title');
  if (!t) return;
  let next = ytWording(t);
  if (/8\d{9}/.test(next)) next = next.replace(PSEUDO_UID_RE, (uid) => (ytKeyForNumericUid(uid) ? ytLabelForUid(uid) || '' : uid));
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

// スーパーチャットには絵が無いので、ニコ生版は灰色の四角を出す。YouTube と同じ金額の色で塗り、吹き出しの印を載せる。
const EMPTY_THUMB_SEL = '[class*="thumb--empty"]';
const SC_BUBBLE_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='white' d='M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'/%3E%3Ctext x='12' y='14' font-size='9' font-family='Arial' font-weight='700' text-anchor='middle' fill='%23333'%3E%24%3C/text%3E%3C/svg%3E\") center/70% no-repeat";
/** @param {Element} el */
function fixEmptyThumb(el) {
  const tr = el.closest('tr');
  const row = tr || el.parentElement;
  let sc = ytSuperChatFromRowText(row ? row.textContent : '');
  if (!sc) return;
  // pt の欄があればそこだけ読む(欄の文字がくっついて金額を読み違えないように)。
  const ptCell = tr && tr.querySelector('td[data-label="pt"]');
  if (ptCell) sc = ytSuperChatFromRowText(`スーパーチャット ${ptCell.textContent}`) || sc;
  // 1回ずつの行(表)は金額の色。まとめ(×件数・合計 pt)は金額が1回分ではないので YouTube の赤。
  const color = tr ? ytSuperChatTierColor(sc.yen) : '#e62117';
  if (el.getAttribute('data-yt-sc') === color) return;
  el.setAttribute('data-yt-sc', color);
  const h = /** @type {HTMLElement} */ (el);
  h.style.background = `${SC_BUBBLE_BG}, ${color}`;
  h.style.borderColor = color;
  h.style.borderRadius = '6px';
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
  if (el.hasAttribute('data-nl-uid')) fixUidLabelAttr(el);
  el.querySelectorAll('[data-nl-uid]').forEach(fixUidLabelAttr);
  el.querySelectorAll('img[src*="nicoaccount/usericon"]').forEach(fixImg);
  el.querySelectorAll('a[href*="nicovideo.jp/user/"], a[href*="live.nicovideo.jp/watch/lv9"]').forEach(fixAnchor);
  el.querySelectorAll('[title]').forEach(fixTitleAttr);
  if (el.matches(EMPTY_THUMB_SEL)) fixEmptyThumb(el);
  el.querySelectorAll(EMPTY_THUMB_SEL).forEach(fixEmptyThumb);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) fixTextNode(/** @type {Text} */ (n));
}

// マーケHTML などの保存ファイルは、画面の直し(上の fixSubtree)が届かない文字列として作られる。
// HTML の Blob を作る瞬間に、同じ直しをその文字列にもかける(失敗したら元のまま)。
/** @param {string} html */
function ytFixHtmlString(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    fixSubtree(doc.documentElement);
    const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
    return (doctype ? doctype[0] + '\n' : '') + doc.documentElement.outerHTML;
  } catch {
    return html;
  }
}
if (typeof Blob === 'function' && typeof DOMParser === 'function' && typeof document !== 'undefined') {
  const RealBlob = Blob;
  class YtFixingBlob extends RealBlob {
    /** @param {any[]} [parts] @param {BlobPropertyBag} [opts] */
    constructor(parts, opts) {
      if (opts && /^text\/html/i.test(String(opts.type || '')) && Array.isArray(parts) && parts.length === 1 && typeof parts[0] === 'string') {
        parts = [ytFixHtmlString(parts[0])];
      }
      super(parts, opts);
    }
  }
  globalThis.Blob = YtFixingBlob;
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
        else if (m.attributeName === 'data-nl-uid') fixUidLabelAttr(el);
      } else m.addedNodes.forEach(fixSubtree);
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href', 'title', 'src', 'data-nl-uid'],
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
