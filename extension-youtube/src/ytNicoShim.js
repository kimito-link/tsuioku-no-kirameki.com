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

import { computePseudoLvForVideoId } from '../../src/lib/youtube/ytPseudoLv.js';
import { makeYtDefaultIconJudge, YT_DEFAULT_ICON_STORE_KEY } from './ytDefaultIcon.js';
import { countYtStreamComments, getYtStreamCommentsByVideoId, getYtStreamCommentsSince } from './ytIdbStore.js';
import { buildCommentSummary, summaryStorageKey } from '../../src/lib/commentSummary.js';
import { ytPostedAtFromClock, ytReplayPostedAt } from '../../src/lib/youtube/ytPostedAt.js';
import { buildGiftThrowLedgerTableSectionHtml, buildGiftThrowLedgerTableRowHtml } from '../../src/lib/giftThrowLedgerTableHtml.js';
import { ytWording, ytWordingTopFanToSuperChatRank, ytWordingSuperChatRankToTopFan, ytWordingForPlatform, ytWordingPlatformFixed, ytWordingPlatformOfficial } from '../../src/lib/youtube/ytWording.js';
import { ytSuperChatTierColor, ytSuperChatFromRowText } from '../../src/lib/youtube/ytSuperChatTier.js';
import { parseYtVideoIdFromUrl, isYtWatchLikeUrl, ytHandleLivePath, ytHandleLivePendingKey, ytHandleOfPendingKey, ytPendingChannelPageUrl } from '../../src/lib/youtube/ytPageMeta.js';
import { platformOfStreamKey, platformOfPersonKey, platformChannelOfUrl, platformOfHostname, STREAM_PLATFORMS, placeholderStreamKeyForChannel, isPlaceholderStreamKey } from '../../src/lib/platform/streamPlatform.js';
import { splitTextByEmotes, isEmoteName, isSafeEmoteUrl } from '../../src/lib/platform/streamEmotes.js';
import { buildYtGiftBags } from './ytGiftToNico.js';
import { ytCommentSendReasonText } from '../../src/lib/youtube/ytCommentSendReason.js';
import { TAIL_MAX_ROWS } from '../../src/lib/commentTailBuffer.js';
import { ytTailAfterFull } from '../../src/lib/youtube/ytTailAfterFull.js';
import { ytImportantVoiceReasons } from '../../src/lib/youtube/ytVoicePriority.js';
import { ytLocalAssetUrlFor } from './ytLocalAssetUrls.js';
import { buildZeroPtSenderLabels, isZeroPtCountText } from '../../src/lib/youtube/ytZeroPtGiftLabel.js';
import { YT_LAST_STREAM_URL_KEY } from './pfLastStreamUrl.js';
import { readYtPanelStreamKey } from '../../src/lib/youtube/ytPanelRoute.js';
import { callerNameFromStack, createPanelStreamDiag, panelStreamDiagContext, serviceOfStreamKey, YT_PANEL_STREAM_DIAG_KEY_PREFIX } from '../../src/lib/youtube/ytPanelStreamDiag.js';
import { createStaleFrameHold } from '../../src/lib/youtube/ytStaleFrameHold.js';
import { ytFullRefreshIntervalMs } from '../../src/lib/youtube/ytFullRefreshInterval.js';
import { dropPseudoLvCommentWrites } from '../../src/lib/youtube/ytShimCommentWrites.js';
import { shouldYieldForBigRecord, yieldToMainThread } from '../../src/lib/bigRecordYield.js';
import { tallySupportItems } from '../../src/lib/platform/platformMetrics.js';
import { watchPlatformMetricChrome } from '../../src/lib/platform/platformMetricChrome.js';

const KEY_YT_SUMMARIES = 'yt_stream_summaries';
// 視聴ページの中(content script)で動いているか。ニコ生版の会場は視聴ページの中で動く(content-entry.js の mountVenueBarButton)。
//   YouTube 版も同じく視聴ページの中で会場を動かす(venue-inline-entry.js)。そのときは:
//   ・記録(IndexedDB)は拡張のもので、ページからは読めないので background に読んでもらう
//   ・画面の直しは会場の中だけ(YouTube のページ自体の文字は触らない)
//   ・chrome.tabs は無い(タブの写しはしない)
export const YT_SHIM_IN_PAGE = typeof location !== 'undefined' && location.protocol !== 'chrome-extension:';
const COMMENTS_PREFIX = 'nls_comments_';
// ニコ生版の「テール」(まだ本体に畳み込んでいない新着)。ニコ生版の popup は、本体の全件を一度読んだら
// 同じ配信のあいだはその控えを使い回し、新着はテールから足す。YouTube 版は本体とテールを分けて持たないので、
// テールにも全件を渡す(popup が既存の重複畳み込み=mergeTailRowsIntoDisplay で控えと重ねて、増えた分だけが足される)。
// これが無いと、控えのまま件数も最新コメントも止まる(0.1.11 までの「リアルタイムで反映されない」)。
const TAIL_PREFIX = 'nls_ctail_';
const SUMMARY_PREFIX = summaryStorageKey('');
// ニコ生版のテールは最新 TAIL_MAX_ROWS(2,000)件まで(commentTailBuffer.js)。会場は読んだコメントを最新 4,000 件まで覚えて
//   (venueSpeech.js SEEN_CAP)、それより古いものは忘れる。YouTube 版がテールに全件(例 7,451件)を渡すと、忘れた古いコメントを
//   新しいと思って何度も吹き出し・読み上げていた(2026-11-04 りんく実機「同じ言葉を連呼」「吹き出しが出すぎ」・計器 1分2,051件)。
//   会場(視聴ページの中・venue.html)には、ニコ生版と同じく最新 2,000 件だけをテールとして渡す。
const IS_VENUE_CONTEXT = YT_SHIM_IN_PAGE || (typeof location !== 'undefined' && /\/(?:yt-)?venue\.html$/.test(String(location.pathname || '')));
/** @param {any[]} arr */
const tailForContext = (arr) => (IS_VENUE_CONTEXT && Array.isArray(arr) && arr.length > TAIL_MAX_ROWS ? arr.slice(arr.length - TAIL_MAX_ROWS) : arr);
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
  if (!/\/(?:yt-)?sidepanel\.html$/.test(u.pathname)) throw new Error('not_sidepanel');
  if (u.searchParams.get('inline') !== '1' || u.searchParams.get('dock') !== 'sidepanel') {
    u.searchParams.set('inline', '1');
    u.searchParams.set('dock', 'sidepanel');
    history.replaceState(null, '', u.href);
  }
} catch {
  /* no-op */
}

// 0.1.1949: 外枠(sidepanel-iframe-boot-entry)が src に焼いた「どの配信か」('yt:<videoId>' / '<サービス id>:<login>')。サイドパネルだけ
const PANEL_STREAM_KEY = (() => {
  try {
    return /\/(?:yt-)?sidepanel\.html$/.test(String(location.pathname || '')) ? readYtPanelStreamKey(location.search) : '';
  } catch {
    return '';
  }
})();
/** @param {string} key 外枠の配信キー → サービス(YouTube は null=言葉を変えない) */
function platformOfPanelStreamKey(key) {
  const id = String(key || '').split(':')[0];
  return id && id !== 'yt' ? LIST_PLATFORMS.find((p) => p.id === id) || null : null;
}
const LIST_PLATFORMS = Object.values(STREAM_PLATFORMS);

// ---- 2. videoId ⇔ 疑似 lv ----
/** @type {Map<string, string>} lv → videoId */
const videoIdByLv = new Map();
const IS_MARKETING_PAGE = typeof location !== 'undefined' && /marketing-export\.html$/.test(String(location.pathname || ''));
/** @type {Set<string>} チャットのリプレイ(アーカイブ)で記録した動画 */
const replayVideoIds = new Set();
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
  const lv = computePseudoLvForVideoId(id);
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
  if (!isWatchLikeTabUrl(url)) return tab;
  const vid = streamKeyForWatchUrl(url);
  if (!vid) {
    panelDiag.unmappedWatchTab(url); // 計器: 配信のページなのに写せない(記録の無い部屋など)
    return tab;
  }
  const lv = pseudoLvForVideoId(vid);
  return { ...tab, url: `https://live.nicovideo.jp/watch/${lv}`, pendingUrl: undefined, __ytUrl: url };
}

// ---- 2a. Twitch・Kick の視聴タブ(council/twitch-support-PLAN.md・kick-support-PLAN.md) ----
// Twitch・Kick の記録は YouTube と同じ置き場に、配信キー 'tw.<login>.<配信番号>' / 'kk.<slug>.<配信番号>'(videoId の位置)で入っている。
//   タブの URL(twitch.tv/<login>・kick.com/<slug>)には配信番号が無いので、そのチャンネルのいちばん新しい記録の配信キーを使う。
/** @param {string} keyHead 'tw.' / 'kk.' @param {string} login */
function newestKeyForChannel(keyHead, login) {
  const pre = `${keyHead}${login}.`;
  let best = '';
  let bestAt = -1;
  for (const [key, sum] of Object.entries(knownSummaries || {})) {
    if (!key.startsWith(pre)) continue;
    const at = Number(sum?.updatedAt || 0);
    if (at > bestAt) {
      bestAt = at;
      best = key;
    }
  }
  return best;
}

/**
 * /@名前/live は URL に動画 id が無い。まとめに残した sourceUrl のパスが一致する配信を返す。
 * @param {string} url
 * @param {Record<string, any> | null | undefined} summaries
 * @returns {string}
 */
export function videoIdForYtHandleLive(url, summaries) {
  const path = ytHandleLivePath(url);
  if (!path) return '';
  let best = '';
  let bestAt = -1;
  const bag = summaries && typeof summaries === 'object' ? summaries : {};
  for (const [key, sum] of Object.entries(bag)) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(key)) continue;
    const stored = ytHandleLivePath(sum?.sourceUrl);
    if (!stored || stored !== path) continue;
    const at = Number(sum?.viewersReadAt || sum?.updatedAt || 0);
    if (at >= bestAt) {
      bestAt = at;
      best = key;
    }
  }
  return best;
}

/**
 * YouTube の視聴 URL → 配信キー。/@名前/live は、まとめが無くても仮のキーを返す。
 * @param {string} url
 * @param {Record<string, any> | null | undefined} summaries
 */
export function resolveYtWatchStreamKey(url, summaries) {
  if (!isYtWatchLikeUrl(url)) return '';
  return parseYtVideoIdFromUrl(url) || videoIdForYtHandleLive(url, summaries) || ytHandleLivePendingKey(url);
}

/** 視聴タブの URL → 配信キー(YouTube は videoId・Twitch/Kick は記録のある配信キー)。分からなければ '' @param {string} url */
export function streamKeyForWatchUrl(url) {
  const u = String(url || '');
  if (isYtWatchLikeUrl(u)) return resolveYtWatchStreamKey(u, knownSummaries);
  const ch = platformChannelOfUrl(u);
  if (!ch) return '';
  // 0.1.1947: 記録の無いチャンネル(配信前の部屋など)は仮のキー '<頭><login>.00000' で「記録 0」を見せる。
  //   空を返すとタブが写らず、popup は探り読み→「最近更新された別の配信」へ落ちていた(PC 計測 0.1.1946: unmappedWatchTabs 124)
  return newestKeyForChannel(ch.platform.keyHead, ch.login) || placeholderStreamKeyForChannel(ch.platform, ch.login);
}

/** 1本の配信を見ているタブか(YouTube の視聴ページ・Twitch/Kick のチャンネルページ) @param {string} url */
export function isWatchLikeTabUrl(url) {
  return isYtWatchLikeUrl(String(url || '')) || Boolean(platformChannelOfUrl(String(url || '')));
}

/** 配信キー → その配信のページ(YouTube の動画・Twitch/Kick のチャンネル) @param {string} key */
export function watchUrlForStreamKey(key) {
  const k = String(key || '');
  if (!k) return '';
  const p = platformOfStreamKey(k);
  if (p) return p.channelUrl(p.loginOfStreamKey(k));
  return `https://www.youtube.com/watch?v=${k}`;
}

/** @type {Map<string, string>} Twitch/Kick の人の鍵(tw:<user-id> / kk:<user-id>)→ login(ページの URL に使う) */
const loginByPersonKey = new Map();

// ---- 2b. YouTube の人 ⇔ ニコ生版が「本人のID」として扱える数字のID ----
// ニコ生版は「数字のユーザーID」の人だけを本人として上の段(りんく・こん太)へ並べる(匿名 a: はたぬ姉)。
// YouTube のチャンネルID(UC…)は数字でないので、そのままだと全員たぬ姉に落ちる。
// → 同じ人にはいつも同じ 10 桁の数字を割り当てて渡す(ニコ生版のルールはそのまま・入口で形だけ合わせる)。
/** @type {Map<string, string>} 数字ID → YouTube の人の鍵(UC… か name:表示名) */
const ytKeyByNumericUid = new Map();
/** @type {Map<string, string>} YouTube の人の鍵 → 数字ID */
const numericUidByYtKey = new Map();
/** 数字IDを新しく割り当てた回数(画面の直しを、知らなかった人の分だけやり直すため) */
let uidRegVersion = 0;

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
  uidRegVersion += 1;
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
  const key = ytKeyForNumericUid(uid).replace(/^topfan:/, '');
  const pp = platformOfPersonKey(key);
  if (pp) return pp.channelUrl(key.startsWith(`${pp.personHead}@`) ? key.slice(4) : loginByPersonKey.get(key) || '');
  if (/^UC[A-Za-z0-9_-]{22}$/.test(key)) return `https://www.youtube.com/channel/${key}`;
  const h = key.startsWith('handle:@') ? key.slice('handle:@'.length) : '';
  // YouTube の @ハンドルは日本語などの文字も使える(例 @ぶらっくしろっぷ)。英数字だけを通していたので、
  //   日本語ハンドルの人はリンクが外れてクリックしても何も起きなかった(2026-11-08 りんく)。
  return /^[\p{L}\p{M}\p{N}._-]{3,30}$/u.test(h) ? `https://www.youtube.com/@${encodeURIComponent(h)}` : '';
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
export function ytRecordToNicoEntry(r, i, lv, personKey, stableNo) {
  const channelId = String(r?.channelId || '').trim();
  const name = String(r?.name || '').trim();
  const key = personKey || channelId || (name ? `name:${name}` : '');
  if (platformOfPersonKey(key) && r?.login) loginByPersonKey.set(key, String(r.login));
  const at = Number(r?.recordedAt || 0) || Date.now();
  // 配信が終わったあとにアーカイブから埋めた分は、書かれた本当の時刻(postedAtMs)を持っている
  const postedAt = Number(r?.postedAtMs) > 0
    ? Number(r.postedAtMs)
    : r?.replay
    ? ytReplayPostedAt(String(r?.ts || ''), Number(r?._streamStartedAt || 0), at)
    : ytPostedAtFromClock(String(r?.ts || ''), at);
  // マーケHTML の時間の分析は capturedAt(記録した時刻)で並べる。アーカイブは開いた時・見た時に記録するので
  // 動画の中の時刻と関係なく偏る→マーケ画面でだけ、アーカイブの行は「動画の中で書かれた時刻」を記録時刻として渡す。
  // (サイドパネル・コメビュは「いま来た」の判定に capturedAt を使うので変えない)
  const capturedAt = r?.replay && IS_MARKETING_PAGE && postedAt > 0 ? postedAt : at;
  return {
    id: String(r?.id || r?.pk || `yt${i}`),
    liveId: lv,
    // コメントの番号はニコ生版では本物の番号(変わらない)。会場・コメビュはこの番号で「もう読んだか」を見分ける。
    //   並び順(配信者の行を最後に回す等)で振ると、新しいコメントが来るたびに同じコメントの番号が変わり、
    //   読んだコメントを新しいと思って読み直し(「ほか○件」にまとまる)、本当の新着を読み飛ばしていた(2026-11-04 りんく実機)。
    //   初めて見た順の番号(ytStableOrder と同じ)にする。
    commentNo: String(Number.isFinite(stableNo) && /** @type {number} */ (stableNo) >= 0 ? /** @type {number} */ (stableNo) + 1 : i + 1),
    text: String(r?.text || ''),
    userId: numericUidForYtKey(key),
    ytChannelId: /^UC/.test(key) ? key : channelId,
    nickname: name,
    // 会場の吹き出しの発言者名は row.name を読む(venueSpeech.js)。ニコ生版の行は nickname だけなので名前のある人も
    //   「匿名NNN」と出ていた(ニコ生は匿名の人が多く目立たない)。YouTube は全員に名前があるので、同じ名前を name にも入れる。
    name,
    avatarUrl: String(r?.iconUrl || ''),
    capturedAt,
    // チャット欄の時刻表示から求めた「書かれた時刻」(受け取った時刻とずれるのは開いたときに残っていた分)
    // リプレイ(アーカイブ)は時刻表示が経過時間なので、配信の開始時刻 + 経過時間にする
    ytPostedAt: postedAt,
    ytKind: String(r?.kind || 'text'),
    ...(platformOfPersonKey(channelId) ? { ytPlatform: platformOfPersonKey(channelId)?.id, ...(Number(r?.giftCount) > 0 ? { ytGiftCount: Number(r.giftCount) } : {}) } : {}),
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
/**
 * 配信の開始時刻。前の動画の開始時刻がそのまま移ってしまった記録(古い版で記録したもの)は信じない:
 * 自分より先に記録を始めた別の動画と同じ開始時刻なら、それは前の動画のもの。
 * @param {any} sum
 * @param {string} videoId
 * @param {Record<string, any>} [all]
 */
function ytTrustedStartedAt(sum, videoId, all) {
  const t = Number(sum?.startedAt || 0);
  if (!(t > 0)) return 0;
  const mine = Number(sum?.createdAt || 0);
  for (const [vid, other] of Object.entries(all || knownSummaries || {})) {
    if (vid === videoId) continue;
    if (Number(other?.startedAt) === t && Number(other?.createdAt || 0) <= mine) return 0;
  }
  return t;
}

/**
 * @param {any} sum
 * @param {string} videoId
 * @param {string} tabTitle
 * @param {Record<string, any>} [all] 全部の配信のまとめ(開始時刻の取り違えを見分けるため)
 */
export function ytSummaryToNicoSnapshot(sum, videoId, tabTitle, all) {
  const lv = pseudoLvForVideoId(videoId);
  // null を Number() すると 0 になり「0人」と出てしまうので、数のときだけ使う
  const viewers = typeof sum?.concurrentViewers === 'number' ? sum.concurrentViewers : NaN;
  // 配信の本当の開始時刻(ページの「ライブ配信開始日」)。記録を始めた時刻で代わりにすると、
  // 長い配信を開いた直後に「経過 0分」になる。分からないあいだは出さない。
  const trustedStart = ytTrustedStartedAt(sum, videoId, all);
  const startedAt = trustedStart;
  const ucId = String(sum?.broadcasterChannelId || '');
  const handle = String(sum?.broadcasterHandle || '');
  // UC… が分からない配信は、記録の中の同じ名前の人(配信者がチャットに書いていれば UC… が分かる)→ @名前 の順で決める
  const ucFromRecords = !ucId && handle ? ucByNameHint.get(normName(handle)) || '' : '';
  const chId = ucId || ucFromRecords;
  const bKey = chId || (handle ? `handle:${handle}` : '');
  const bUid = bKey ? numericUidForYtKey(bKey) : '';
  const pendingHandle = ytHandleOfPendingKey(videoId);
  const plat = platformOfStreamKey(videoId);
  if (plat && chId.startsWith(plat.personHead) && handle) loginByPersonKey.set(chId, handle.replace(/^@/, ''));
  // 配信者のアイコンがまとめに無いときは、配信者がチャットに書いた記録のアイコンを使う
  const bIcon = String(sum?.broadcasterIconUrl || '') || ytIconForNumericUid(bUid);
  if (bUid && bIcon) ytIconByNumericUid.set(bUid, bIcon);
  return {
    title: tabTitle || String(sum?.title || ''),
    url: `https://live.nicovideo.jp/watch/${lv}`,
    liveId: lv,
    broadcastTitle: String(sum?.title || ''),
    // 仮キー(記録の無い部屋)は記録に名前が無いので、URL のチャンネル名を出す(別の配信の名前に倒さない)
    broadcasterName: String(sum?.broadcasterName || '') || (plat && isPlaceholderStreamKey(videoId) ? plat.loginOfStreamKey(videoId) : '') || pendingHandle,
    thumbnailUrl: plat
      ? plat.thumbUrl(plat.loginOfStreamKey(videoId))
      : pendingHandle
        ? ''
        : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    tags: [],
    startAtText: '',
    links: [],
    metas: [],
    scripts: [],
    noopenerLinks: [],
    broadcasterUserId: bUid,
    broadcasterPageUrl: plat
      ? plat.channelUrl(plat.loginOfStreamKey(videoId))
      : chId
      ? `https://www.youtube.com/channel/${chId}`
      : pendingHandle
        ? ytPendingChannelPageUrl(videoId)
        : handle
          ? `https://www.youtube.com/${encodeURI(handle)}`
          : '',
    broadcasterIconUrl: bIcon,
    // YouTube の「N 人が視聴中」は同時接続そのもの。ニコ生版の「公式の同接」の欄に入れる(推定でなく直接値として出る)。
    // YouTube には延べの来場者数が無いので、来場は空のまま(ニコ生版は「(取得不可)」と出す)。
    viewerCountFromDom: null,
    noVisitorTotal: true, // 会場が自分で数字の帯を作るとき、同接を「来場」として出さない印(src/lib/venueStatCardsSelf.js)
    recordedCountHint: typeof sum?.itemCount === 'number' ? sum.itemCount : null, // 同じく、記録件数(まとめの itemCount)
    viewerCountSource: 'dom',
    officialViewerCount: Number.isFinite(viewers) && viewers > 0 ? viewers : null, // 0 は「まだ読めていない」(開始時の0人で平均が下がっていた)
    officialViewerStale: Number.isFinite(viewers) && viewers > 0 && sum?.viewersStale === true,
    officialViewerReadAt: Number(sum?.viewersReadAt || 0) || null,
    officialStatsUpdatedAt: Number(sum?.updatedAt || 0) || Date.now(),
    // アーカイブ(チャットのリプレイで記録した配信)は今も配信中ではないので、開始からの経過は出さない(2週間前の配信が「372時間」になる)
    //   配信が終わっていたら(endedAt)、終わった時刻までで止める
    streamAgeMin:
      startedAt > 0 && !replayVideoIds.has(videoId)
        ? Math.max(0, Math.round(((Number(sum?.endedAt) > startedAt ? Number(sum.endedAt) : Date.now()) - startedAt) / 60000))
        : null,
    // ニコ生の来場・広告pt・ギフトpt を、このサービスの数字として出さない(src/lib/platform/platformMetrics.js)。
    platform: plat?.id || 'youtube',
    officialViewersOnly: true,
    platformFacts: {
      viewers: Number.isFinite(viewers) && viewers > 0 ? viewers : null,
      streamAgeProvenance: trustedStart > 0 ? 'official' : '',
      support: supportTallyByVid.get(String(videoId || '')) || null,
    },
  };
}

/** この画面で数えたサポートの合計(配信キー → tally)。まとめ(yt_stream_summaries)には書かない。 */
/** @type {Map<string, any>} */
const supportTallyByVid = new Map();
/** @type {() => void} */
let schedulePlatformChrome = () => {};
/** 記録の控えが変わったときだけ数え直す。まだ読んでいなければチップ自体を出さない。 */
function noteSupportTally(vid) {
  const cache = inPageCommentCache.get(vid);
  const ver = cache ? Number(cache.ver) || 0 : -1;
  const prev = supportTallyByVid.get(vid);
  if (prev && prev.ready === true && prev.ver === ver) return;
  const rows = cache?.byPk ? [...cache.byPk.values()] : [];
  const t = tallySupportItems(rows);
  t.ver = ver;
  supportTallyByVid.set(vid, t);
  schedulePlatformChrome();
}

/** @param {string} name */
// ★v0.1.1986: 同じ名前は何万回も聞かれる(8万行・6,500人の配信で、組み立てのたびに行ごとに2〜3回)。文字列は前の答えを使う(結果は同じ)。
/** @type {Map<string, string>} */
const normNameMemo = new Map();
const normName = (name) => {
  if (typeof name !== 'string') return String(name || '').trim().replace(/^@/, '').toLowerCase();
  let v = normNameMemo.get(name);
  if (v === undefined) {
    v = name.trim().replace(/^@/, '').toLowerCase();
    if (normNameMemo.size >= 50_000) normNameMemo.clear();
    normNameMemo.set(name, v);
  }
  return v;
};

/** @param {unknown} url @returns {string} https の顔の画像だけ(仮の絵・空は '') */
function ytUsableIcon(url) {
  // ★v0.1.1986: ふつうの形(https:// で始まり、最後が半角の文字)は整形と正規表現を通さずに返す(結果は同じ)
  if (typeof url === 'string' && url.startsWith('https://')) {
    const last = url.charCodeAt(url.length - 1);
    if (last > 32 && last < 127) return url;
  }
  const u = String(url || '').trim();
  return /^https:\/\//i.test(u) ? u : '';
}

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
    const icon = ytUsableIcon(r?.iconUrl);
    if (!icon) continue;
    const k = keyOf(r);
    if (k) iconByKey.set(k, icon);
  }
  return { keyOf, iconOf: (key) => iconByKey.get(key) || '' };
}

/** @type {Map<string, { at: number, p: Promise<any[] | undefined>, done?: boolean }>} 同じ瞬間に何本も聞かれても IndexedDB は1回だけ読む(組み立て中は重ねない) */
const commentsCache = new Map();
/** 入口の動きの記録(画面の「詳細」や開発者ツールから見られる: globalThis.__ytNicoShimDiag) */
const shimDiag = { builds: 0, buildJoined: 0, buildReused: 0, buildPhaseFirst: /** @type {any} */ (null), buildPhaseMax: /** @type {any} */ (null), buildPhaseLast: /** @type {any} */ (null), buildMsTotal: 0, buildMsMax: 0, buildMsLast: 0, buildRowsLast: 0, staleFrameHeld: 0, notifyCoalesced: 0, liveRows: 0, lastLiveRowsAt: 0, notified: 0, listeners: 0, lastNotifiedAt: 0, lastCount: 0, commentGets: 0, commentWritesDropped: 0, commentRowsWriteDropped: 0, summaryAnswered: 0, tailDeferred: 0, tailShort: 0, keysAsked: /** @type {string[]} */ ([]) };
/** @type {any} */ (globalThis).__ytNicoShimDiag = shimDiag;
// 0.1.1946: 横の欄・コメビュが「どの配信を出したか」の計器(council/panel-stream-selection-SPEC.md §6)。画面の動きは変えない
const PANEL_SERVICE = PANEL_STREAM_KEY ? (PANEL_STREAM_KEY.startsWith('yt:') ? 'youtube' : PANEL_STREAM_KEY.split(':')[0]) : '';
const panelDiagCore = createPanelStreamDiag({
  now: () => Date.now(),
  lvToKey: (lv) => videoIdForPseudoLv(lv),
  panelService: PANEL_SERVICE,
});
// 0.1.1958: 外枠が焼いたサービスと違う配信を聞かれた=まもなく作り直される古い画面。最初の食い違いから3秒は返事を待たせる
const staleFrameHold = createStaleFrameHold({ now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
/** @param {string} lv */
const isOtherServiceThanPanel = (lv) => {
  if (!PANEL_SERVICE) return false;
  const s = serviceOfStreamKey(videoIdForPseudoLv(lv));
  return !!s && s !== PANEL_SERVICE;
};
const PANEL_DIAG_CTX = panelStreamDiagContext(typeof location !== 'undefined' ? location.pathname : '');
let panelDiagTimer = 0;
// 書き込みは 10 秒に1回まで(yt_diag_live_rows と同じ型・yt_diag_ は描き直さないキー=selfWrittenStorageKeys.js)。画面ごとに別のキー
const panelDiagWriteNow = () => {
  try {
    const c = /** @type {any} */ (globalThis).chrome;
    if (!c?.runtime?.id || !c?.storage?.local) return;
    void Promise.resolve(c.storage.local.set({ [`${YT_PANEL_STREAM_DIAG_KEY_PREFIX}${PANEL_DIAG_CTX}`]: panelDiagCore.snapshot() })).catch(() => {});
  } catch {
    /* 計器は本体を止めない */
  }
};
const panelDiagSoon = () => {
  if (panelDiagTimer) return;
  panelDiagTimer = /** @type {any} */ (setTimeout(() => {
    panelDiagTimer = 0;
    panelDiagWriteNow();
  }, 10_000));
};
// 0.1.1951: 前の iframe の累計を引き継ぐ(外枠が配信ごとに作り直すので、数がその iframe の分しか残らなかった)
try {
  const c0 = /** @type {any} */ (globalThis).chrome;
  if (c0?.runtime?.id && c0?.storage?.local) {
    const key0 = `${YT_PANEL_STREAM_DIAG_KEY_PREFIX}${PANEL_DIAG_CTX}`;
    void Promise.resolve(c0.storage.local.get(key0)).then((bag) => panelDiagCore.seedLifetime(bag?.[key0]), () => {});
  }
} catch {
  /* no-op */
}
/** 記録したら書き込みを予約する写し(計器の失敗で本体を止めない) */
const panelDiag = /** @type {ReturnType<typeof createPanelStreamDiag>} */ (
  Object.fromEntries(
    Object.entries(panelDiagCore).map(([name, fn]) => [
      name,
      (/** @type {any[]} */ ...a) => {
        try {
          const r = /** @type {any} */ (fn)(...a);
          // storage の変化を数えただけでは書かない(自分の書き込みの変化で書き続ける輪を作らない)
          if (name === 'asked' && r === true) panelDiagWriteNow(); // 食い違いは iframe が作り直される前にすぐ残す
          else if (name !== 'snapshot' && name !== 'storageChanged' && name !== 'seedLifetime') panelDiagSoon();
          return r;
        } catch {
          return undefined;
        }
      },
    ]),
  )
);
/** @type {any} */ (globalThis).__ytPanelStreamDiag = panelDiagCore;
/** popup が最後にコメントを聞いてきた配信(=いま画面に出ている配信) */
let lastAskedLv = '';
/** @type {any} 配信ページが最後に書いた「最後に見た配信」(yt_last_stream_url の値) */
let lastStreamValue = null;
/** 最後に「最後に見た配信」として知らせた疑似 lv */
let lastAnnouncedLv = '';
/**
 * 0.1.1953: この画面が最近コメントを聞いた配信(lv → 最後に聞いた時刻)。探り読みは入れない。
 *   記録の更新の知らせ(notifyLv)は、この画面が見ている配信だけに出す。
 * @type {Map<string, number>}
 */
const recentlyAskedLvs = new Map();
const RECENT_ASK_MS = 60_000;
/** @param {string} lv */
function isWatchedByThisScreen(lv) {
  if (!recentlyAskedLvs.size) return true; // まだ何も聞かれていない(開いた直後)は従来どおり
  const at = recentlyAskedLvs.get(lv);
  return at != null && Date.now() - at < RECENT_ASK_MS;
}
/** @type {(lv: string, reason: string) => void} 知らせる口(storage の見張りを付けたところで差し替わる) */
let announceLastWatch = () => {};
/**
 * ★v0.1.1981: この画面に最後に全件(nls_comments_)として渡した配列(配信ごと)。
 *   横の欄・コメビュのテールは「全件を一度読んだあとの新着」を足すためのもの(上の TAIL_PREFIX の説明)。
 *   いま組み上がっている配列が、最後に全件として渡したものと同じ(=それ以降に何も増えていない)なら、
 *   テールは最新 TAIL_MAX_ROWS 件で足りる(ニコ生版のテールと同じ大きさ)。8万行の配信で、3秒ごとにテールとして
 *   8万行を渡し、popup が毎回 8万行+8万行を重ね直していた(手元の計測・CPU 4倍遅く: 300秒のうち 36秒)。
 *   全件を渡したあとに記録が増えた・全件をまだ渡していないときは、今までどおり全件を渡す(取りこぼさない)。
 * @type {Map<string, any[]>}
 */
const lastFullAnswered = new Map();
/** @param {string} lv @param {any[]} arr */
function tailForScreen(lv, arr) {
  if (IS_VENUE_CONTEXT) return tailForContext(arr);
  // ★v0.1.1983: 生放送の途中(全件を渡したあとに増えた)も、増えた行と最新 TAIL_MAX_ROWS 件だけを渡す(ytTailAfterFull.js)。
  const t = ytTailAfterFull(arr, lastFullAnswered.get(lv), TAIL_MAX_ROWS);
  if (t.short) shimDiag.tailShort = (Number(shimDiag.tailShort) || 0) + 1;
  return t.rows;
}
/** @type {Set<string>} 一度でも組み上がった配信(v0.1.1978: 最初の組み立て中だけ、軽量読みのテールを待たせない) */
const everBuiltLvs = new Set();
/** @param {string} lv */
function buildCommentsForLv(lv) {
  const hit = commentsCache.get(lv);
  if (hit && Date.now() - hit.at < 1500) return hit.p;
  // 0.1.1964: 組み立て中(まだ終わっていない)なら、それを待つ。1.5秒を過ぎるたびに新しい組み立てを始めると、
  //   1回が数秒かかる大きな配信で組み立てが何本も重なり、互いに遅らせ合っていた(PC 実測 Kick 13,000行: 482秒で 303回・合計 766秒)
  if (hit && !hit.done) {
    shimDiag.buildJoined = (Number(shimDiag.buildJoined) || 0) + 1;
    return hit.p;
  }
  // 0.1.1962 計器: 組み立て1回の時間と行数(1万行超で横の欄が遅れる件の名指し用)
  const t0 = Date.now();
  const p = buildCommentsForLvUncached(lv);
  /** @type {{ at: number, p: Promise<any[] | undefined>, done?: boolean }} */
  const slot = { at: Date.now(), p, done: false };
  const finish = () => {
    slot.done = true;
    // 終わった時刻から1.5秒は使い回す(始めた時刻だと、長い組み立てのあと即座にもう1本始まる)
    slot.at = Date.now();
  };
  void p.then(finish, finish);
  void p.then((arr) => {
    const ms = Date.now() - t0;
    shimDiag.builds = (Number(shimDiag.builds) || 0) + 1;
    shimDiag.buildMsTotal = (Number(shimDiag.buildMsTotal) || 0) + ms;
    shimDiag.buildMsMax = Math.max(Number(shimDiag.buildMsMax) || 0, ms);
    shimDiag.buildMsLast = ms;
    shimDiag.buildRowsLast = Array.isArray(arr) ? arr.length : 0;
    if (Array.isArray(arr)) everBuiltLvs.add(lv);
  }, () => {});
  commentsCache.set(lv, slot);
  return p;
}

/**
 * @param {string} lv
 * @param {any} [summary] yt_stream_summaries の1件(配信の開始時刻に使う)
 */
async function buildGiftBagsForLv(lv, summary) {
  const entries = await buildCommentsForLv(lv);
  if (!entries) return undefined;
  const startedAt = ytTrustedStartedAt(summary, videoIdForPseudoLv(lv));
  // 0.1.1962: 同じ組み立て結果(1.5秒の使い回し)・同じ開始時刻なら、ギフトの袋も前の答えを使う(1回の読みでギフトのキーを5つ聞かれる)
  const memo = giftBagsMemo.get(entries);
  if (memo && memo.lv === lv && memo.startedAt === startedAt) return memo.bags;
  const bags = buildYtGiftBags(entries, lv, { startedAt });
  giftBagsMemo.set(entries, { lv, startedAt, bags });
  return bags;
}
/** @type {WeakMap<any[], { lv: string, startedAt: number, bags: any }>} 組み立てた行の配列 → ギフトの袋 */
const giftBagsMemo = new WeakMap();

/** @type {WeakMap<any[], Map<string, { uid: string, icon: string }>>} 組み立てた行の配列 → 名前から人を引く表 */
const nameIndexMemo = new WeakMap();
/**
 * 記録の行から「名前 → 数字IDと顔」の表を作る。同じ配列(組み立ての使い回し)なら前に作った表を返す。
 *   0.1.2011: 公式の順位を聞かれるたびに全行から作り直していた(会社の PC・8万行・CPU 4倍遅く: 90秒に68回・約2秒)。
 * @param {any[]} entries
 * @returns {Map<string, { uid: string, icon: string }>}
 */
export function ytNameIndexOf(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const hit = nameIndexMemo.get(list);
  if (hit) return hit;
  /** @type {Map<string, { uid: string, icon: string }>} */
  const byName = new Map();
  for (const e of list) {
    const n = normName(e?.nickname);
    if (n && e?.userId) byName.set(n, { uid: String(e.userId), icon: String(e.avatarUrl || '') || byName.get(n)?.icon || '' });
  }
  if (Array.isArray(entries)) nameIndexMemo.set(list, byName);
  return byName;
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
  const byName = ytNameIndexOf(entries);
  return {
    liveId: lv,
    capturedAt: Number(board.capturedAt) || Date.now(),
    lastOk: true,
    lastStatus: 200,
    source: 'youtube-top-fans',
    rows: rows.map((/** @type {any} */ r) => {
      const name = String(r?.name || '');
      const hit = byName.get(normName(name));
      // ★トップファンの行には数字IDを付けない(userPageUrl なし)。
      //   数字IDがあると、ニコ生版はこの欄の数字(XP)を「その人が投げたギフトの pt」としてレーンの顔に 🎁 で付け、
      //   ギフトを投げた人としてりんく段に上げる(0.1.53 実機)。別の数字IDにすると、今度は同じ人がレーンに
      //   もう1人増える(0.1.55 実機: @しお漬け が2人)。ID の無い公式の行として渡せば、名前と顔だけの欄になり、どこにも結びつかない。
      const icon = String(r?.iconUrl || '') || hit?.icon || '';
      return {
        rank: Number(r?.rank) || 0,
        name,
        contribution: Number(r?.xp) || 0,
        isAnonymous: false,
        thumbnailUrl: icon,
      };
    }),
  };
}

/** @param {string} lv */
/**
 * 配信ごとに「最初に見た順」を覚える(id → 番号)。ニコ生版の画面は、一度並べたコメントの順が変わらない前提
 * (アイコンの一覧は「はじめの360件で固定」し、新しいコメントは後ろに足すだけ)。記録の並び(受け取った時刻順)の
 * 途中に後から行が入ると、それより後ろのマスが全部1つずつずれ、一覧全体がちらついていた
 * (2026-11-04 計器: 10秒で約335マスが「1つ前のマスのコメント」に入れ替わっていた)。
 * 一度並べた行の順は変えず、新しく見た行は必ず最後に足す。
 * @type {Map<string, Map<string, number>>}
 */
const stableOrderByLv = new Map();
/**
 * @param {string} lv
 * @param {any[]} list 記録の行(受け取った時刻順)
 * @returns {any[]} 一度並べた順を保った行
 */
/** @param {any} r @param {number} i */
function ytStableKeyOf(r, i) {
  return String(r?.id || r?.pk || `#${i}`);
}
/**
 * その行を初めて見た順の番号(0 から)。ytStableOrder を通った行だけ(通っていなければ -1)。
 * @param {string} lv
 * @param {any} r
 */
export function ytStableNoOf(lv, r) {
  const n = stableOrderByLv.get(lv)?.get(ytStableKeyOf(r, -1));
  return typeof n === 'number' ? n : -1;
}
export function ytStableOrder(lv, list) {
  let ord = stableOrderByLv.get(lv);
  if (!ord) {
    ord = new Map();
    stableOrderByLv.set(lv, ord);
  }
  const keyOf = ytStableKeyOf;
  /** @type {number[]} */
  const ns = new Array(list.length);
  // 0.1.1956: 記録はたいてい既に初めて見た順に並んでいる。そのときは並べ替えずにそのまま返す(数千行を毎回並べ直していた)
  let sorted = true;
  for (let i = 0; i < list.length; i++) {
    const k = keyOf(list[i], i);
    let n = ord.get(k);
    if (n === undefined) {
      n = ord.size;
      ord.set(k, n);
    }
    ns[i] = n;
    if (i > 0 && n < ns[i - 1]) sorted = false;
  }
  if (sorted) return list.slice();
  return list
    .map((r, i) => ({ r, n: ns[i] }))
    .sort((a, b) => a.n - b.n)
    .map((x) => x.r);
}

/**
 * 配信者が書いたコメントは列の最後に回す。ニコ生版は配信者のコメントを一覧から除くが、除く判断(配信者の数字ID)が
 * 読み直しごとに揺れると(UC… が後から分かる等)、配信者のコメントがある回と無い回で、それより後ろのマスが全部
 * 1つずつずれる(2026-11-04 計器: 読み直しのたびに約335マスが前後に入れ替わり、配信者のコメントは1件)。
 * 最後にあれば、除かれても除かれなくても前のマスは動かない。
 * @param {any[]} list
 * @param {any} sum yt_stream_summaries の1件
 */
export function ytOwnerRowsLast(list, sum) {
  const ch = String(sum?.broadcasterChannelId || '');
  const handle = normName(sum?.broadcasterHandle);
  const isOwner = (/** @type {any} */ r) =>
    (Array.isArray(r?.badges) && r.badges.includes('owner')) ||
    (!!ch && String(r?.channelId || '') === ch) ||
    (!!handle && normName(r?.name) === handle);
  if (!list.some(isOwner)) return list;
  return [...list.filter((r) => !isOwner(r)), ...list.filter(isOwner)];
}

/**
 * 視聴ページの中の会場の記録の控え(配信ごと)。初回とときどき(行数に応じて30秒〜5分ごと・v0.1.1969)は全件、あいだは新しく記録された分だけを background にもらう
 * (3秒ごとに全件を受け取り直すと、長い配信でメッセージが大きくなり、失敗すると空の会場になる・Grok の点検 2026-11-04)。
 * @type {Map<string, { byPk: Map<string, any>, lastRecordedAt: number, fullAt: number, ver?: number, sorted?: any[], sortedVer?: number }>}
 */
const inPageCommentCache = new Map();
/**
 * ★v0.1.1981: 控えの行を受け取った時刻順に並べた配列。控えが変わっていなければ(ver が同じ)前に並べたものを返す
 *   (8万行を、聞かれるたびに並べ直していた)。
 * @param {{ byPk: Map<string, any>, ver?: number, sorted?: any[], sortedVer?: number }} c
 */
function sortedRowsOfCache(c) {
  const ver = Number(c.ver) || 0;
  if (c.sorted && c.sortedVer === ver) return c.sorted;
  c.sorted = [...c.byPk.values()].sort((a, b) => Number(a?.recordedAt || 0) - Number(b?.recordedAt || 0));
  c.sortedVer = ver;
  return c.sorted;
}
/** @type {Map<string, number>} 直接届いた行(YT_LIVE_ROWS)で作り直す間だけ、background に聞きに行かない */
const inPageSkipFetchUntil = new Map();
/**
 * @param {string} vid
 * @returns {Promise<any[] | null>} null = 受け取れなかった(前の控えも無い)
 */
/**
 * 0.1.1955: 記録の読み出し口。視聴ページの中は background に頼み、拡張の画面(横の欄・コメビュ)は IndexedDB を直接読む。
 *   どちらも初回とときどき(行数に応じて30秒〜5分ごと・v0.1.1969)は全件、あいだは新しく記録された分だけ(横の欄が毎秒約4回、7,000行を全部読み直していた・PC 実測)。
 * @param {string} vid
 * @param {number | undefined} afterRecordedAt undefined = 全件
 * @returns {Promise<any[]>}
 */
async function fetchStreamRows(vid, afterRecordedAt) {
  if (!YT_SHIM_IN_PAGE) {
    return afterRecordedAt === undefined ? getYtStreamCommentsByVideoId(vid) : getYtStreamCommentsSince(vid, afterRecordedAt);
  }
  const res = await real?.runtime?.sendMessage?.(
    afterRecordedAt === undefined ? { type: 'YT_GET_STREAM_COMMENTS', videoId: vid } : { type: 'YT_GET_STREAM_COMMENTS', videoId: vid, afterRecordedAt },
  );
  if (!res || res.ok === false || !Array.isArray(res.items)) throw new Error('no_items');
  return res.items;
}
async function getCommentsViaBackground(vid) {
  const cur = inPageCommentCache.get(vid);
  const now = Date.now();
  // 直接届いた行で作り直すときは、background へ聞きに行かない(往復の分だけ吹き出しが遅れる)
  if (cur && inPageSkipFetchUntil.get(vid) > now) {
    inPageSkipFetchUntil.delete(vid);
    return sortedRowsOfCache(cur);
  }
  // ★v0.1.1969: 全件の読み直し間隔を行数に比例(5,000行まで30秒・上限5分)。5万行で30秒ごとに約28MBを受け取っていた
  const full = !cur || now - cur.fullAt > ytFullRefreshIntervalMs(cur.byPk.size);
  try {
    const items = await fetchStreamRows(vid, full ? undefined : /** @type {NonNullable<typeof cur>} */ (cur).lastRecordedAt);
    const next = full ? { byPk: new Map(), lastRecordedAt: 0, fullAt: now, ver: 0 } : /** @type {NonNullable<typeof cur>} */ (cur);
    // ★v0.1.1981: 控えが本当に変わったときだけ番号を進める。「新しい分だけ」の読み出しは最後の1行をもう一度返すので、
    //   受け取った行があるだけでは変わったことにならない(中身が同じ行は数えない)。
    let changed = false;
    for (const r of items) {
      const k = String(r?.pk || r?.id || '');
      if (!k) continue;
      if (!changed) {
        const old = full ? undefined : next.byPk.get(k);
        if (!old || JSON.stringify(old) !== JSON.stringify(r)) changed = true;
      }
      next.byPk.set(k, r);
      const at = Number(r?.recordedAt || 0);
      if (at > next.lastRecordedAt) next.lastRecordedAt = at;
    }
    if (changed) next.ver = (Number(next.ver) || 0) + 1;
    inPageCommentCache.set(vid, next);
  } catch {
    // 受け取れなかったときは空にせず、前の控えをそのまま使う(誰もいない会場にしない)
    if (!cur) return null;
    // 全件の受け取りに失敗したら、次は新しい分だけを受け取る(全件は30秒後に試し直す)。
    //   そうしないと3秒ごとに全件を頼み続けて、新しいコメントが会場に入らないまま止まる(Grok の点検 2026-11-04)。
    if (full) cur.fullAt = now;
  }
  const c = inPageCommentCache.get(vid);
  if (!c) return null;
  return sortedRowsOfCache(c);
}

/** 会場の読み上げで大事なコメントのキー(venueSpeech.js の venueSpeechKey と同じ形 no:<番号>) */
/** @type {Map<string, string>} キー → 大事な理由(kind/badge/first) */
const ytVoiceImportantKeys = new Map();
/** @param {string} key @returns {string} 大事な理由(大事でなければ '') */
export function ytImportantVoiceReasonOfKey(key) {
  return ytVoiceImportantKeys.get(String(key || '')) || '';
}
/** @param {string} key */
export function ytIsImportantVoiceKey(key) {
  return ytVoiceImportantKeys.has(String(key || ''));
}

/**
 * 0.1.1966 計器: 組み立て1回の段ごとの時間。最初の1回(開いた直後)と、合計が最も長かった回を残す。
 * @param {{ fetchMs: number, storageMs: number, sideWaitMs: number, mapMs: number, rows: number }} ph
 */
function recordBuildPhases(ph) {
  const total = ph.fetchMs + ph.sideWaitMs + ph.mapMs;
  const at = Date.now();
  if (!shimDiag.buildPhaseFirst) shimDiag.buildPhaseFirst = { ...ph, total, at };
  const max = /** @type {any} */ (shimDiag.buildPhaseMax);
  if (!max || total > Number(max.total || 0)) shimDiag.buildPhaseMax = { ...ph, total, at };
  shimDiag.buildPhaseLast = { ...ph, total, at };
}
/**
 * ★v0.1.1981: 前に組み立てた結果の控え(配信ごと)。記録の行も、顔の控え(順位表・@名前・後から引いた顔)も、配信者の情報も
 *   変わっていなければ、同じ結果をそのまま返す。横の欄は3秒ごとに全件を聞いてくるので、8万行の配信では
 *   何も変わっていなくても毎回 8万行を組み立て直していた(手元の計測・CPU 4倍遅く: 420秒で 105回・合計 59秒)。
 * @type {Map<string, { cache: any, ver: number, epoch: number, sumSig: string, out: any[] }>}
 */
const builtMemo = new Map();
/**
 * ★v0.1.1983: 記録の行(控えの中の同じ物)→ 前に作った popup 用の行と、そのときの材料。
 *   材料(配信・人のキー・顔・開始時刻・番号・並びの位置)が全部同じなら、作り直さずに前の行を返す。
 *   控えの行が差し替わる(全件の読み直し・同じ行の更新)と別の物になるので、自動で作り直しになる。
 * @type {WeakMap<object, { lv: string, key: string, icon: string, st: number, no: number, i: number, e: any }>}
 */
const builtEntryMemo = new WeakMap();
/** 顔の控え(順位表・@名前・後から引いた顔・文字アイコンの見分け)が変わるたびに進む番号 */
let buildSideEpoch = 0;
/** @param {string[]} keys storage で変わったキー */
function noteBuildSideKeysChanged(keys) {
  for (const k of keys) {
    if (k.startsWith('yt_leaderboard_') || k === 'yt_handle_icons' || /^yt_[a-z]{2}_icons$/.test(k) || k === YT_DEFAULT_ICON_STORE_KEY) {
      buildSideEpoch += 1;
      return;
    }
  }
}
/** @param {any} sum 配信のまとめのうち、組み立てに使う所だけ */
const buildSumSig = (sum) => `${String(sum?.broadcasterChannelId || '')}|${String(sum?.broadcasterHandle || '')}`;
async function buildCommentsForLvUncached(lv) {
  const vid = videoIdForPseudoLv(lv);
  if (!vid) return undefined;
  // 0.1.1966: 記録の読み出しと、顔の控え3つ(順位表・@名前・後から引いた顔)の読み出しを同時に始める(前は1つずつ待っていた)。
  //   あわせて各段の時間を計器に残す(開いた直後の最初の組み立てが Kick 1万8千行で 70秒・どこで待っているかの名指し用)。
  const tStart = Date.now();
  const lbKey = `yt_leaderboard_${vid}`;
  const vidPlat = platformOfStreamKey(vid);
  /** @param {string} key */
  const getKey = (key) => {
    try {
      return Promise.resolve(real?.storage?.local?.get?.(key)).then((bag) => bag?.[key], () => undefined);
    } catch {
      return Promise.resolve(undefined);
    }
  };
  let tStorageDone = 0;
  const sidePromise = Promise.all([getKey(lbKey), getKey('yt_handle_icons'), vidPlat ? getKey(vidPlat.lateIconsKey) : Promise.resolve(undefined)]).then((r) => {
    tStorageDone = Date.now();
    return r;
  });
  const items = await getCommentsViaBackground(vid);
  const tFetchDone = Date.now();
  if (items == null) return undefined;
  noteSupportTally(vid);
  // ★v0.1.1981: 何も変わっていなければ前の結果を返す(アーカイブの行がある配信は、開始時刻が他の配信のまとめにも左右されるので使わない)
  const memoCache = inPageCommentCache.get(vid);
  const memoSumSig = buildSumSig(knownSummaries?.[vid]);
  const memo = builtMemo.get(lv);
  if (memo && memoCache && memo.cache === memoCache && memo.ver === (Number(memoCache.ver) || 0) && memo.epoch === buildSideEpoch && memo.sumSig === memoSumSig) {
    await sidePromise.catch(() => undefined);
    shimDiag.buildReused = (Number(shimDiag.buildReused) || 0) + 1;
    return memo.out;
  }
  const memoVer = memoCache ? Number(memoCache.ver) || 0 : -1;
  const memoEpoch = buildSideEpoch;
  // ★v0.1.1997: 数万行の記録では、読み出しの続きで組み立てまで一気に走らせない(src/lib/bigRecordYield.js)。
  //   拡張の画面(横の欄・コメビュ)だけ。視聴ページの中(会場)は今までと同じ。
  const yieldBig = !YT_SHIM_IN_PAGE && shouldYieldForBigRecord(Array.isArray(items) ? items.length : 0);
  if (yieldBig) await yieldToMainThread();
  const [lb, handleIconsRaw, lateIconsRaw] = await sidePromise;
  const tSideDone = Date.now();
  const list = ytOwnerRowsLast(ytStableOrder(lv, Array.isArray(items) ? items : []), knownSummaries?.[vid]);
  // 顔の分からない人(YouTube のギフトだけ送った人など)は、トップファンの順位表の顔を名前で引く
  /** @type {Map<string, string>} */
  const boardIconByName = new Map();
  try {
    for (const row of Array.isArray(lb?.rows) ? lb.rows : []) {
      const icon = ytUsableIcon(row?.iconUrl);
      if (icon && row?.name) boardIconByName.set(normName(row.name), icon);
    }
  } catch {
    /* 順位表が無くても記録は出す */
  }
  // @名前 しか分からない人の顔(裏でチャンネルのページから引いたもの)
  /** @type {Record<string, { icon?: string }>} */
  const handleIcons = handleIconsRaw && typeof handleIconsRaw === 'object' ? handleIconsRaw : {};
  // Twitch/Kick: 記録のときに顔が間に合わなかった人の顔(視聴ページがあとで引いたもの・tw-/kick-content-entry.js)
  /** @type {Record<string, string>} */
  const twLateIcons = vidPlat && lateIconsRaw && typeof lateIconsRaw === 'object' ? lateIconsRaw : {};
  /** @type {Set<string>} 顔を引きに行く @名前 */
  const wantHandles = new Set();
  const who = buildYtPersonResolver(list);
  // 会場の読み上げ: 混んでいるときは大事なコメントだけ読む(りんく決定 2026-11-04)。どれが大事かの印をここで付ける
  const important = IS_VENUE_CONTEXT ? ytImportantVoiceReasons(list, (r) => who.keyOf(r)) : null;
  let streamStartedAt = 0;
  if (list.some((r) => r?.replay)) {
    replayVideoIds.add(vid);
    try {
      const bag = await real.storage.local.get(KEY_YT_SUMMARIES);
      const sum = bag?.[KEY_YT_SUMMARIES]?.[vid];
      streamStartedAt = ytTrustedStartedAt(sum, vid, bag?.[KEY_YT_SUMMARIES]);
    } catch {
      /* 分からなければ受け取った時刻 */
    }
  }
  let rowsMade = 0;
  const out = list.map((r, i) => {
    const key = who.keyOf(r);
    // スパチャの欄の顔は読み込み前の仮の絵(data: など)のことがある。https の顔だけ使い、無ければ同じ人の別の記録の顔を使う。
    const nm = String(r?.name || '').trim();
    const handleKey = nm.startsWith('@') ? nm.toLowerCase() : '';
    let icon = ytUsableIcon(r?.iconUrl) || who.iconOf(key) || boardIconByName.get(normName(r?.name)) || '';
    if (!icon && r?.login) icon = ytUsableIcon(twLateIcons[String(r.login)]) || '';
    if (!icon && handleKey) {
      icon = ytUsableIcon(handleIcons[handleKey]?.icon);
      if (!icon && !handleIcons[handleKey]) wantHandles.add(nm);
    }
    // ★v0.1.1983: 前の組み立てと材料が同じ行は、前に作った行をそのまま使う(生放送の途中は新着のたびに全行を作り直していた)。
    const no = ytStableNoOf(lv, r);
    const prev = r && typeof r === 'object' ? builtEntryMemo.get(r) : undefined;
    /** @type {ReturnType<typeof ytRecordToNicoEntry>} */
    let e;
    if (prev && prev.lv === lv && prev.key === key && prev.icon === icon && prev.st === streamStartedAt && prev.no === no && prev.i === i) {
      e = prev.e;
    } else {
      e = ytRecordToNicoEntry({ ...r, iconUrl: icon, _streamStartedAt: streamStartedAt }, i, lv, key, no);
      if (r && typeof r === 'object') builtEntryMemo.set(r, { lv, key, icon, st: streamStartedAt, no, i, e });
      rowsMade += 1;
    }
    if (icon && e.userId) ytIconByNumericUid.set(e.userId, icon);
    if (important?.[i]) ytVoiceImportantKeys.set(`no:${e.commentNo}`, important[i]);
    return e;
  });
  if (yieldBig) await yieldToMainThread();
  // 記録から配信者の UC… が分かることがあるので、配信者の登録をやり直す
  registerBroadcastersFromSummaries();
  if (memoCache && memoVer >= 0 && !replayVideoIds.has(vid)) builtMemo.set(lv, { cache: memoCache, ver: memoVer, epoch: memoEpoch, sumSig: memoSumSig, out });
  else builtMemo.delete(lv);
  shimDiag.rowsMadeLast = rowsMade;
  shimDiag.rowsReusedLast = out.length - rowsMade;
  recordBuildPhases({ fetchMs: tFetchDone - tStart, storageMs: (tStorageDone || tSideDone) - tStart, sideWaitMs: tSideDone - tFetchDone, mapMs: Date.now() - tSideDone, rows: out.length });
  if (wantHandles.size) {
    try {
      void Promise.resolve(real?.runtime?.sendMessage?.({ type: 'YT_HANDLE_ICONS', handles: [...wantHandles].slice(0, 5) })).catch(() => {});
    } catch {
      /* 次の読み直しでまた頼む */
    }
  }
  return out;
}

// マーケ画面などは配信者の情報を保存済みの控えから読むので、ytSummaryToNicoSnapshot が呼ばれず
// 配信者の数字ID → YouTube の対応が分からないまま(ニコニコのリンク・ID のまま)になる。記録のある配信の配信者を先に登録する。
/** @type {Record<string, any>} */
let knownSummaries = {};
// 「ギフト貢献度」の欄に入れたのが YouTube のトップファン(XP)か、スパチャの合計の順位(pt)か。言葉の直しを切り替える。
let kokenIsTopFans = true;
// Twitch/Kick の配信で「ギフト貢献度」の欄にそのサービスの公式ランキング(Kick の Kicks ランキング等)が入っているか。
//   入っていなければ記録から数えた合計の順位(既定)。言葉の直しを切り替える
let platformOfficial = false;
/** Twitch の公式ランキングの期間('ALLTIME' / 'MONTH' / 'WEEK' / 'DAY'・Kick は累計なので空) */
let platformBoardPeriod = '';
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

// 0.1.99 りんく(2026-11-05)「自分でちゃんと設定している人は認知してほしい」: 最初からの文字アイコンのままの人は
//   りんく欄ではなくこん太欄へ。段を決める部品(supportGridDisplayTier.js)は YouTube 版のビルドで
//   globalThis.__ytIsDefaultIconUid を見る(scripts/build-youtube-ext.mjs)。
/** @type {ReturnType<typeof makeYtDefaultIconJudge>|null} */
const ytDefaultIconJudge = real?.storage?.local ? makeYtDefaultIconJudge(real) : null;
/** @param {string} uid */
/** @type {any} */ (globalThis).__ytIsDefaultIconUid = (uid) => {
  const icon = ytIconByNumericUid.get(String(uid || ''));
  return !!icon && !!ytDefaultIconJudge?.isDefault(icon);
};
if (real && real.storage && real.storage.local && (real.tabs || YT_SHIM_IN_PAGE)) {
  const realLocal = real.storage.local;
  const realGet = realLocal.get.bind(realLocal);
  // 前に開いた配信の疑似 lv(nls_last_watch_url 等に残る)も引けるよう、記録のある配信を先に全部登録しておく
  const knownVideosReady = Promise.resolve(realGet([KEY_YT_SUMMARIES, YT_LAST_STREAM_URL_KEY]))
    .then((bag) => {
      knownSummaries = (bag && bag[KEY_YT_SUMMARIES]) || {};
      lastStreamValue = (bag && bag[YT_LAST_STREAM_URL_KEY]) || null;
      for (const vid of Object.keys(knownSummaries)) pseudoLvForVideoId(vid);
      registerBroadcastersFromSummaries();
    })
    .catch(() => {});

  // ---- 「最後に見た配信」(0.1.1948・council/panel-stream-selection-SPEC.md §4-C2) ----
  //   正本は配信ページ自身が書く yt_last_stream_url(pfLastStreamUrl.js・ニコ生版 rememberWatchPageUrl の写し)。
  //   shim はそれを疑似 lv の nls_last_watch_url に【翻訳するだけ】。以前は「記録が最近更新された配信」で推測していたので、
  //   裏で記録中の YouTube タブに引っ張られていた(PC 計測 0.1.1946: source newest 1106 / page 0)。
  /** @param {any} v yt_last_stream_url の値 @returns {string} 疑似 lv('' = 分からない) */
  const lvOfLastStream = (v) => {
    const url = String(v?.url || '');
    const key = url ? streamKeyForWatchUrl(url) : '';
    return key ? pseudoLvForVideoId(key) : '';
  };
  const lastWatchUrl = async () => {
    await knownVideosReady;
    const lv = lvOfLastStream(lastStreamValue);
    if (lv) {
      panelDiag.lastWatch('page', lv);
      if (!lastAnnouncedLv) lastAnnouncedLv = lv;
      return `https://live.nicovideo.jp/watch/${lv}`;
    }
    // まだどのページも書いていない(入れたばかり)ときだけ、最近更新された配信を使う(計器 source:'newest' に出る)
    const sums = /** @type {Record<string, any>} */ (await realGet(KEY_YT_SUMMARIES))?.[KEY_YT_SUMMARIES];
    const vid = newestVideoIdOf(sums);
    panelDiag.lastWatch(vid ? 'newest' : 'none', vid ? pseudoLvForVideoId(vid) : '');
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
    // 計器: 1回の読みでコメントを2配信以上聞く = popup の探り読み(collectDataBackedWatchLvs)
    const askedCommentLvs = new Set(
      (list || []).filter((k) => k.startsWith(COMMENTS_PREFIX)).map((k) => k.slice(COMMENTS_PREFIX.length).toLowerCase()),
    );
    const isProbe = askedCommentLvs.size >= 2;
    /** @type {Promise<any> | null} */
    let sumsOnce = null;
    const probeT0 = Date.now();
    if (list) {
      for (const k of list) {
        if (k === LAST_WATCH_URL_KEY) {
          // ニコ生版のコメビュ等は「最後に見ていた配信」をこのキーから決める。YouTube 版では、
          // 記録がいちばん新しく更新された配信(=いま見ている配信)の疑似 watch URL を渡す。
          const url = await lastWatchUrl();
          if (url) bag[k] = url;
          continue;
        }
        if (k.startsWith(COMMENTS_PREFIX) || k.startsWith(TAIL_PREFIX)) {
          const lv = k.slice((k.startsWith(TAIL_PREFIX) ? TAIL_PREFIX : COMMENTS_PREFIX).length).toLowerCase();
          if (!videoIdForPseudoLv(lv)) continue;
          // 0.1.1950: 探り読み(popup の collectDataBackedWatchLvs が1回で全タブの comments を聞く)には答えない(SPEC §4-C3)。
          //   ニコ生版の探り読みは軽い get だが、YouTube 系では全タブの全件を IndexedDB から組み(PC 計測 最大 27秒)、
          //   lastAskedLv を最後のタブへ書き換えて言葉のサービスまで変えていた。前面が配信ページなら探り読みは走らないので、
          //   答えないときは popup が「最後に見た配信」(yt_last_stream_url の翻訳)へ進む=層 C が正しい答えを持つ。
          if (isProbe) {
            panelDiag.asked(lv, true);
            continue;
          }
          panelDiag.asked(lv, isProbe);
          if (await staleFrameHold.wait(isOtherServiceThanPanel(lv))) shimDiag.staleFrameHeld = staleFrameHold.heldCount();
          lastAskedLv = lv;
          recentlyAskedLvs.set(lv, Date.now());
          shimDiag.commentGets += 1;
          // ★v0.1.1978: 横の欄の軽量読み(テールと件数の控えを一緒に聞く)には、最初の組み立てが終わるまでテールを待たせない。
          //   待たせると件数の控えまで一緒に遅れ、popup は 900ms×4回の時間切れで何も受け取れなかった。
          //   組み立ては始めておく(あとから来る全件の読み出しと知らせが使う)。一度組み上がった配信は今までどおり待って渡す。
          if (!IS_VENUE_CONTEXT && k.startsWith(TAIL_PREFIX) && !everBuiltLvs.has(lv) && list.includes(`${SUMMARY_PREFIX}${lv}`)) {
            void buildCommentsForLv(lv).catch(() => {});
            shimDiag.tailDeferred = (Number(shimDiag.tailDeferred) || 0) + 1;
            continue;
          }
          const arr = await buildCommentsForLv(lv);
          if (arr) {
            if (k.startsWith(TAIL_PREFIX)) bag[k] = tailForScreen(lv, arr);
            else {
              bag[k] = arr;
              lastFullAnswered.set(lv, arr);
            }
          }
          continue;
        }
        // ★v0.1.1978: 件数だけの軽い控え(nls_csummary_<lv>)にも答える。ニコ生版の横の欄は、開いた直後にこれで
        //   「記録 N 件」を出し、全件はあとから読む(popup の軽量読み)。YouTube 系は答えていなかったので、
        //   8万行の配信では全件を読み終わるまで数字が空だった(PC 実測・遅い条件で2分以上)。行数は IndexedDB で数えるだけ。
        //   視聴ページの中(YT_SHIM_IN_PAGE)は IndexedDB に届かないので今までどおり。
        if (!YT_SHIM_IN_PAGE && k.startsWith(SUMMARY_PREFIX)) {
          const lv = k.slice(SUMMARY_PREFIX.length).toLowerCase();
          const vid = videoIdForPseudoLv(lv);
          if (!vid || isProbe) continue;
          try {
            const n = await countYtStreamComments(vid);
            if (n > 0) {
              bag[k] = buildCommentSummary({ liveId: lv, recordedCount: n, recentRows: [] });
              shimDiag.summaryAnswered = (Number(shimDiag.summaryAnswered) || 0) + 1;
            }
          } catch {
            /* 数えられなければ今までどおり(全件の読み出しを待つ) */
          }
          continue;
        }
        const g = GIFT_KEY_PREFIXES.find(([pre]) => k.startsWith(pre));
        if (!g) continue;
        const lv = k.slice(g[0].length).toLowerCase();
        const vid = videoIdForPseudoLv(lv);
        if (!vid) continue;
        if (await staleFrameHold.wait(isOtherServiceThanPanel(lv))) shimDiag.staleFrameHeld = staleFrameHold.heldCount();
        // 0.1.1962: 1回の読みでギフトのキーを5つ聞かれても、配信の一覧(yt_stream_summaries)を読むのは1回だけ
        if (!sumsOnce) sumsOnce = Promise.resolve(realGet(KEY_YT_SUMMARIES));
        const sums = /** @type {Record<string, any>} */ (await sumsOnce);
        const gifts = /** @type {Record<string, any> | undefined} */ (
          await buildGiftBagsForLv(lv, sums?.[KEY_YT_SUMMARIES]?.[vid])
        );
        let v = gifts ? gifts[g[1]] : null;
                if (g[1] === 'subApp') {
          const hist = Array.isArray(gifts?.subApp?.history) ? gifts.subApp.history : [];
          zeroPtGifts = hist.filter((h) => !(Number(h?.points) > 0));
          allThrowHistory = hist;
          rebuildLaneKindLabels(hist);
          scheduleTopFanRest();
        }
        // 応援レーンの「ギフト列」は ギフトを投げた人(nls_gift_users_)と一緒にこのキーを読み、
        //   ここに入っている人を「ギフトを投げた人」として並べる。トップファンの XP はチャットや視聴でもたまり、
        //   ギフトではないので、その読みにはスパチャ・ギフトの合計だけを渡す(XP の人がギフト列に並んでいた)。
        const laneRead = !!list && list.some((x) => x.startsWith('nls_gift_users_'));
        if (g[1] === 'koken' && !laneRead) {
          // トップファンの順位があれば、そちらを「ギフト貢献度」にする(YouTube 公式の応援ランキング)
          const lbKey = `yt_leaderboard_${vid}`;
          const lb = /** @type {Record<string, any>} */ (await realGet(lbKey))?.[lbKey];
          const fromBoard = lb ? ytLeaderboardToKoken(lb, (await buildCommentsForLv(lv)) || [], lv) : null;
          if (fromBoard) {
            v = fromBoard;
            topFanRestRows = fromBoard.rows.slice(10);
            scheduleTopFanRest();
          } else topFanRestRows = [];
          const plat = screenPlatform();
          if (plat) platformBoardPeriod = fromBoard ? String(lb?.period || '') : '';
          if (plat && platformOfficial !== !!fromBoard) {
            platformOfficial = !!fromBoard;
            rewordTopFanHeadings((t) => t);
          }
          if (v != null) {
            const wasTopFans = kokenIsTopFans;
            kokenIsTopFans = !!fromBoard;
            if (wasTopFans && !kokenIsTopFans) rewordTopFanHeadings(ytWordingTopFanToSuperChatRank);
            if (!wasTopFans && kokenIsTopFans) rewordTopFanHeadings(ytWordingSuperChatRankToTopFan);
          }
        }
        if (v != null) bag[k] = v;
      }
    }
    if (isProbe) panelDiag.probe(askedCommentLvs.size, Date.now() - probeT0);
    return bag;
  };
  // 数字カードの写し(状態速報・会場が読む)にも、来場は「—」で書く。YouTube に延べの来場者数は無く、
  //   ニコ生版の部品が同接の数を来場として写していた(2026-11-04 計器: official.viewers が同接と同じ 1,065)。
  const realSet = realLocal.set.bind(realLocal);
  realLocal.set = (/** @type {any} */ items, /** @type {any} */ cb) => {
    // ★v0.1.1974: 疑似 lv のコメントの控え(全件 約5.5MB)は書かない。正本は IndexedDB で、読み出しはここが IndexedDB から組む
    {
      const d = dropPseudoLvCommentWrites(items, (lv) => !!videoIdForPseudoLv(lv));
      if (d.dropped) {
        shimDiag.commentWritesDropped += d.dropped;
        shimDiag.commentRowsWriteDropped += d.droppedBytesApprox;
        items = d.items;
        if (!Object.keys(items).length) return Promise.resolve(typeof cb === 'function' ? cb() : undefined);
      }
    }
    if (items && typeof items === 'object' && LAST_WATCH_URL_KEY in items) {
      panelDiag.popupLastWatchWrite(items[LAST_WATCH_URL_KEY]);
      // 0.1.1948: popup(ニコ生版)が疑似 lv の URL を nls_last_watch_url に書こうとしたら、本物の配信ページの URL に戻して
      //   yt_last_stream_url へ向け直す(ニコ生の引き出しに疑似 lv を漏らさない)。同じ配信なら書かない(書き合いで描き直しを起こさない)
      const m = /\/watch\/(lv\d{1,15})/.exec(String(items[LAST_WATCH_URL_KEY] || ''));
      const key = m ? videoIdForPseudoLv(m[1].toLowerCase()) : '';
      if (key) {
        items = { ...items };
        delete items[LAST_WATCH_URL_KEY];
        const url = watchUrlForStreamKey(key);
        if (url && pseudoLvForVideoId(key) !== lvOfLastStream(lastStreamValue)) {
          lastStreamValue = { url, key, at: Date.now() };
          items[YT_LAST_STREAM_URL_KEY] = lastStreamValue;
        }
        if (!Object.keys(items).length) return Promise.resolve(typeof cb === 'function' ? cb() : undefined);
      }
    }
    try {
      const m = items && items.nls_stat_cards_mirror_v1;
      if (m && typeof m === 'object' && m.official && typeof m.official === 'object') {
        items = {
          ...items,
          nls_stat_cards_mirror_v1: {
            ...m,
            official: { ...m.official, viewers: { text: '—', isPlaceholder: true } },
          },
        };
        const st = items.nls_stat_cards_mirror_v1.official;
        if (typeof st.summaryText === 'string') st.summaryText = st.summaryText.replace(/来[\d,]+\s*·\s*/, '');
      }
    } catch {
      /* 直せなくても書き込みは止めない */
    }
    return realSet(items, cb);
  };
  realLocal.get = (/** @type {any} */ keys, /** @type {any} */ cb) => {
    const p = shimGet(keys);
    if (typeof cb === 'function') {
      p.then(cb, () => cb({}));
      return undefined;
    }
    return p;
  };

  if (real.tabs) {
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
  // 計器: 前面タブの問い合わせ({active:true})の結果と時間(MAP §4-2・PC 仮説 H-a の裏取り)。結果は変えない
  const realTabsQueryFn = real.tabs.query.bind(real.tabs);
  const measuredTabsQuery = (/** @type {any[]} */ ...args) => {
    const opts = args[0];
    if (!opts || typeof opts !== 'object' || opts.active !== true) return realTabsQueryFn(...args);
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const t0 = Date.now();
    const caller = callerNameFromStack(new Error().stack); // 0.1.1951: 問い合わせの多さの犯人探し(関数名だけ)
    const p = Promise.resolve(realTabsQueryFn(...args)).then((res) => {
      const first = Array.isArray(res) ? res[0] : null;
      const url = String(first?.url || first?.pendingUrl || '');
      const key = url && isWatchLikeTabUrl(url) ? streamKeyForWatchUrl(url) : '';
      panelDiag.activeQuery({ url, mappedKey: key, ms: Date.now() - t0, empty: !first, caller });
      return res;
    });
    if (cb) {
      p.then(cb, () => cb(undefined));
      return undefined;
    }
    return p;
  };
  real.tabs.query = wrapTabsFn(measuredTabsQuery);
  // 0.1.1951: windows.getLastFocused の tabs も写す(層 B の写し漏れ・SPEC §7)。計器は「写す前に配信のページで、写せなかった」回数を数える
  if (real.windows && typeof real.windows.getLastFocused === 'function') {
    const realGetLastFocused = real.windows.getLastFocused.bind(real.windows);
    real.windows.getLastFocused = (/** @type {any[]} */ ...args) => {
      const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      const p = Promise.resolve(realGetLastFocused(...args)).then((w) => {
        const act = Array.isArray(w?.tabs) ? w.tabs.find((/** @type {any} */ t) => t?.active) : null;
        const actUrl = String(act?.url || act?.pendingUrl || '');
        panelDiag.lastFocused(!!act && isWatchLikeTabUrl(actUrl) && !streamKeyForWatchUrl(actUrl));
        return w && Array.isArray(w.tabs) ? { ...w, tabs: w.tabs.map(mapTab) } : w;
      });
      if (cb) {
        p.then(cb, () => cb(undefined));
        return undefined;
      }
      return p;
    };
  }
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
        const vid = streamKeyForWatchUrl(url);
        if (!vid) return { ok: false, error: 'not_youtube' };
        const bag = await realGet(KEY_YT_SUMMARIES);
        const sum = (bag && bag[KEY_YT_SUMMARIES] && bag[KEY_YT_SUMMARIES][vid]) || {};
        // 先に記録を読む(アーカイブかどうか・配信者の UC… が記録から分かるため)
        const gifts = await buildGiftBagsForLv(pseudoLvForVideoId(vid), sum).catch(() => undefined);
        const snapshot = /** @type {Record<string, any>} */ (
          ytSummaryToNicoSnapshot(sum, vid, String(tab?.title || ''), (bag && bag[KEY_YT_SUMMARIES]) || {})
        );
        // 「ギフトpt」= YouTube の有料の応援の合計(円にしたおよその額)
        if (gifts && gifts.totalPoints > 0) snapshot.officialGiftPoints = gifts.totalPoints;
        return { ok: true, snapshot };
      });
    }
    if (type === 'NLS_CAPTURE_SCREENSHOT') {
      // ニコ生版の「スクショ」= 動画の今のコマを画像にする。YouTube 版はもともと持っている YT_CAPTURE_FRAME で撮る。
      return realTabsGet(tabId).then(async (tab) => {
        const vid = streamKeyForWatchUrl(String(tab?.url || ''));
        const res = await real.runtime.sendMessage({ type: 'YT_CAPTURE_FRAME', videoId: vid });
        if (res && res.ok && typeof res.dataUrl === 'string') {
          return { ok: true, dataUrl: res.dataUrl, liveId: pseudoLvForVideoId(vid) };
        }
        return { ok: false, errorCode: String(res?.reason || 'capture_failed') };
      });
    }
    if (type === 'NLS_EXPORT_INTERCEPT_CACHE') {
      // ニコ生版はここで、視聴ページが通信から拾った人の情報(名前・顔)をもらう。YouTube 版は記録そのものに
      // 名前と顔が入っているので、渡す物は無い。答えないと「ページとの通信に失敗しました」と出るので、空で正常と答える。
      return realTabsGet(tabId).then((tab) => {
        const vid = streamKeyForWatchUrl(String(tab?.url || ''));
        return { ok: true, items: [], liveId: vid ? pseudoLvForVideoId(vid) : '', frameHref: String(tab?.url || '') };
      });
    }
    if (type === 'NLS_POST_COMMENT') {
      return realTabsGet(tabId).then(async (tab) => {
        const vid = streamKeyForWatchUrl(String(tab?.url || ''));
        const res = await real.runtime.sendMessage({ type: 'YT_SEND_COMMENT', videoId: vid, text: String(message?.text || '') });
        if (res && res.ok) return { ok: true };
        // 0.1.1912: 理由コード(not-signed-in 等)をそのまま出さず、サイドパネル・会場と同じ日本語にする。
        const code = String(res?.reason || res?.error || 'send_failed');
        return { ok: false, error: ytCommentSendReasonText(code, String(res?.note || ''), platformOfStreamKey(vid)?.id || '') || code };
      });
    }
    return null;
  };
  real.tabs.sendMessage = (/** @type {any[]} */ ...args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const [tabId, message] = args;
    const p = realTabsGet(tabId)
      .then((tab) => (isWatchLikeTabUrl(String(tab?.url || '')) ? answerForYtTab(tabId, message) : null))
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

  } // real.tabs

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
    /**
     * 「最後に見た配信」が変わったと popup・コメビュに知らせる(本物の nls_last_watch_url の変化と同じ形)。同じ配信は続けて配らない。
     * @param {string} lv @param {string} reason 'page'(ページが書いた)/ 'resolve'(部屋の引き当てが変わった)
     */
    announceLastWatch = (lv, reason) => {
      if (!lv || lv === lastAnnouncedLv) return;
      lastAnnouncedLv = lv;
      panelDiag.announce(lv, reason);
      const synthUrl = { [LAST_WATCH_URL_KEY]: { newValue: `https://live.nicovideo.jp/watch/${lv}` } };
      for (const fn of listeners) {
        try {
          fn(synthUrl, 'local');
        } catch {
          /* no-op */
        }
      }
    };
    /** @type {Map<string, string>} lv → 最後に知らせた記録の「件数:最後のid」 */
    const lastNotified = new Map();
    /**
     * その配信の記録を読み直し、変わっていれば popup に「コメント(とギフト)のキーが変わった」と知らせる。
     * 失敗しても次の回で必ずやり直す(1回の失敗で画面の更新を止めない)。
     * @param {string} lv
     * @param {any} summary
     */
    /**
     * 0.1.1955: 同じ配信の組み立てが走っている間に来た知らせは1回にまとめる(終わってからもう1回だけ組み立てる)。
     *   PC 実測: 知らせ 429回/分に対し組み立て 221回/分・1回 7,000行で、横の欄の空き時間が60秒中0.4秒だった。
     * @type {Map<string, { again: boolean, summary: any, p: Promise<void> }>}
     */
    const notifyRunning = new Map();
    /** @param {string} lv @param {any} summary */
    const notifyLv = (lv, summary) => {
      const cur = notifyRunning.get(lv);
      if (cur) {
        cur.again = true;
        if (summary !== undefined) cur.summary = summary;
        shimDiag.notifyCoalesced = (Number(shimDiag.notifyCoalesced) || 0) + 1;
        return cur.p;
      }
      const st = { again: false, summary, p: Promise.resolve() };
      st.p = (async () => {
        try {
          do {
            st.again = false;
            await notifyLvOnce(lv, st.summary);
          } while (st.again);
        } finally {
          notifyRunning.delete(lv);
        }
      })();
      notifyRunning.set(lv, st);
      return st.p;
    };
    /** @param {string} lv @param {any} summary */
    const notifyLvOnce = async (lv, summary) => {
      // 0.1.1964: 組み立て中のものがあれば終わるのを待ってから作り直す(2本同時に走らせない)
      const running = commentsCache.get(lv);
      if (running && !running.done) await running.p.catch(() => undefined);
      commentsCache.delete(lv);
      const arr = await buildCommentsForLv(lv).catch(() => undefined);
      if (!arr) return;
      const sig = `${arr.length}:${arr.length ? arr[arr.length - 1].id : ''}`;
      if (lastNotified.get(lv) === sig) return;
      lastNotified.set(lv, sig);
      /** @type {Record<string, { newValue: any }>} */
      const synth = { [`${COMMENTS_PREFIX}${lv}`]: { newValue: arr }, [`${TAIL_PREFIX}${lv}`]: { newValue: tailForContext(arr) } };
      try {
        const gifts = /** @type {Record<string, any>} */ (buildYtGiftBags(arr, lv, { startedAt: ytTrustedStartedAt(summary, videoIdForPseudoLv(lv)) }));
        if (gifts && gifts.count > 0) {
          for (const [pre, field] of GIFT_KEY_PREFIXES) {
            const v = gifts[field];
            if (v != null) synth[`${pre}${lv}`] = { newValue: v };
          }
        }
      } catch {
        /* ギフトが作れなくてもコメントは知らせる */
      }
      // ★トップファン(XP)はここでは流さない。変わったよの知らせの中身(newValue)をそのまま使う受け手
      //   (応援レーンのギフト列)が XP の人を「ギフトを投げた人」としてりんく段に上げてしまう(0.1.51 で実例)。
      //   ギフト貢献度の欄は知らせを受けて読み直すので、読み直しのときにトップファンを渡す(上の shimGet)。
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
      noteBuildSideKeysChanged(Object.keys(changes)); // v0.1.1981: 顔の控えが変わったら、組み立ての控えを使わない
      panelDiag.storageChanged(Object.keys(changes)); // 0.1.1951: どのキーの変化が描き直しを呼んでいるか(問い合わせの多さの犯人探し)
      // 顔が新しく分かったら、件数が同じでも描き直してもらう
      // 最初からの文字アイコンの見分けが増えたら、段(りんく/こん太)が変わるので描き直してもらう(0.1.99)
      if (changes[YT_DEFAULT_ICON_STORE_KEY]) ytDefaultIconJudge?.merge(changes[YT_DEFAULT_ICON_STORE_KEY].newValue);
      if ((changes.yt_handle_icons || changes.yt_tw_icons || changes.yt_kk_icons || changes.yt_ww_icons || changes.yt_sr_icons || changes.yt_mx_icons || changes.yt_tt_icons || changes[YT_DEFAULT_ICON_STORE_KEY]) && lastAskedLv) {
        lastNotified.delete(lastAskedLv);
        void notifyLv(lastAskedLv, undefined);
      }
      for (const ck of Object.keys(changes)) {
        if (!ck.startsWith('yt_leaderboard_')) continue;
        const vid = ck.slice('yt_leaderboard_'.length);
        const lv = pseudoLvForVideoId(vid);
        void buildCommentsForLv(lv).then((arr) => {
          // 知らせの中身はスパチャ・ギフトの合計(XP ではない)。欄は知らせを受けて読み直し、そこでトップファンを受け取る
          const sum = knownSummaries?.[vid];
          const gifts = /** @type {Record<string, any>} */ (buildYtGiftBags(arr || [], lv, { startedAt: ytTrustedStartedAt(sum, vid) }));
          const synth = { [`nls_koken_api_contrib_${lv}`]: { newValue: gifts?.koken ?? null } };
          for (const fn of listeners) {
            try {
              fn(synth, 'local');
            } catch {
              /* no-op */
            }
          }
        });
      }
      if (changes[YT_LAST_STREAM_URL_KEY]) {
        lastStreamValue = changes[YT_LAST_STREAM_URL_KEY].newValue || null;
        announceLastWatch(lvOfLastStream(lastStreamValue), 'page');
      }
      if (!changes[KEY_YT_SUMMARIES]) return;
      const next = changes[KEY_YT_SUMMARIES].newValue || {};
      knownSummaries = next; // Twitch/Kick のタブ → 配信キーの引き当て(newestKeyForChannel)が新しい配信を知るため
      const prev = changes[KEY_YT_SUMMARIES].oldValue || {};
      // 見ている配信が変わったら「最後に見ていた配信」も変わったと知らせる(コメビュが新しい配信へ追従する)
      // 0.1.1948: 記録の更新で「最後に見た配信が変わった」とは知らせない(裏のタブの記録で別の配信へ飛ばない・PC 計測 1946: 362回)。
      //   例外は1つ: いま見ている部屋の引き当てが変わったとき(記録の無かった部屋が配信を始めた=仮のキー→本物のキー)
      if (lastAnnouncedLv) announceLastWatch(lvOfLastStream(lastStreamValue), 'resolve');
      for (const vid of Object.keys(next)) {
        if (prev[vid] && Number(prev[vid].updatedAt || 0) === Number(next[vid]?.updatedAt || 0)) continue;
        // 0.1.1953: この画面が見ていない配信の記録は組み立てない(裏のタブの全件を IndexedDB から毎回組み、
        //   見ている配信の更新が数秒遅れていた・PC 実測 1952 Kick 中央値 3.5秒)。ニコ生版の受け手も自分の lv だけ見る
        const lvOf = pseudoLvForVideoId(vid);
        if (!isWatchedByThisScreen(lvOf)) {
          panelDiag.notify(false);
          continue;
        }
        panelDiag.notify(true);
        void notifyLv(lvOf, next[vid]);
      }
    });
    // 2026-11-05 りんく「もっとリアルタイムに」: background が保存より先に届けた新しい行(YT_LIVE_ROWS)を控えに足して、すぐ会場に知らせる。
    //   (保存→まとめの書き込み→知らせ、を待たない。ニコ生版の部品はそのまま=知らせの中身が早く来るだけ)
    /** @type {number[]} */
    const liveLagSamples = [];
    let liveDiagTimer = 0;
    const writeLiveDiagSoon = () => {
      if (liveDiagTimer) return;
      liveDiagTimer = /** @type {any} */ (setTimeout(() => {
        liveDiagTimer = 0;
        try {
          if (!real.runtime?.id) return;
          const sorted = [...liveLagSamples].sort((a, b) => a - b);
          const pick = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : -1);
          void real.storage.local.set({
            yt_diag_live_rows: {
              at: Date.now(),
              liveRows: shimDiag.liveRows,
              lastLiveRowsAt: shimDiag.lastLiveRowsAt,
              notified: shimDiag.notified,
              lastNotifiedAt: shimDiag.lastNotifiedAt,
              lastCount: shimDiag.lastCount,
              seenToBubbleMs: { n: sorted.length, p50: pick(0.5), p90: pick(0.9), max: sorted.length ? sorted[sorted.length - 1] : -1, last: liveLagSamples.slice(-10) },
            },
          }).catch(() => {});
        } catch {
          /* 計器は本体を止めない */
        }
      }, 3000));
    };
    if (YT_SHIM_IN_PAGE && real.runtime?.onMessage?.addListener) {
      real.runtime.onMessage.addListener((/** @type {any} */ msg) => {
        if (!msg || msg.type !== 'YT_LIVE_ROWS' || !Array.isArray(msg.items)) return;
        const vid = String(msg.videoId || '');
        const cur = inPageCommentCache.get(vid);
        if (!cur) return; // まだ会場がこの配信を読んでいない(最初の全件で入る)
        let added = 0;
        for (const r of msg.items) {
          const k = String(r?.pk || r?.id || '');
          if (!k || cur.byPk.has(k)) continue;
          cur.byPk.set(k, r);
          added += 1;
        }
        if (!added) return;
        cur.ver = (Number(cur.ver) || 0) + 1;
        shimDiag.liveRows = (Number(shimDiag.liveRows) || 0) + added;
        shimDiag.lastLiveRowsAt = Date.now();
        inPageSkipFetchUntil.set(vid, Date.now() + 1000);
        const seen = msg.items.map((r) => Number(r?.seenAt) || 0).filter((x) => x > 0);
        void notifyLv(pseudoLvForVideoId(vid), undefined).then(() => {
          // 計器(0.1.93): チャット欄で拾ってから会場に渡し終える(吹き出しが出る)までの時間。会場の吹き出しは知らせの中で同期で出る
          const now = Date.now();
          for (const t of seen) liveLagSamples.push(now - t);
          if (liveLagSamples.length > 60) liveLagSamples.splice(0, liveLagSamples.length - 60);
          writeLiveDiagSoon();
        });
      });
    }
    // 知らせが来なくても(まとめの書き込みが遅れる・落ちる)、開いている配信は3秒ごとに記録を見直す
    // ★拡張が入れ替わった(更新された)あと、開いたままのコメビュ等の窓では chrome.* が使えなくなり、
    //   ここが毎回「Extension context invalidated」を投げてエラー一覧に積もる。切れていたら見回りをやめる。
    const pollTimer = setInterval(() => {
      try {
        if (!real.runtime?.id) {
          clearInterval(pollTimer);
          // 開いたままの窓は新しい版で開き直す(1分に1回まで)。視聴ページの中の会場はページを読み直さない(YouTube を巻き込む)
          if (!YT_SHIM_IN_PAGE) try {
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
  const key = ytKeyForNumericUid(uid).replace(/^topfan:/, '');
  if (!key) return '';
  // Twitch の人は @ログイン名(YouTube の @ハンドルと同じ扱い)。分からなければ出さない(tw:数字 は人には意味が無い)
  const pp = platformOfPersonKey(key);
  if (pp && key.startsWith(`${pp.personHead}@`)) return `@${key.slice(4)}`;
  // ふわっちの匿名の人(ww:n:名前)は ID が無い。空欄にせず「匿名」と出す(ニコ生の 184 と同じ扱い)
  if (pp && key.startsWith(`${pp.personHead}n:`)) return '匿名';
  if (pp) return loginByPersonKey.get(key) ? `@${loginByPersonKey.get(key)}` : '';
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
      return vid ? watchUrlForStreamKey(vid) : all;
    })
    .replace(PSEUDO_LV_RE, (lv) => streamLabelForText(videoIdForPseudoLv(lv)) || lv);
}

/**
 * 文の中に出す配信の名前。YouTube は動画ID のまま。Twitch・Kick・ふわっち 等の配信キー(ww.番号.番号)は
 *   人が読めないので、配信の題 → 「配信者の名前の配信」→ 「サービス名の配信」の順で出す。
 * @param {string} key
 */
function streamLabelForText(key) {
  if (!key) return '';
  const plat = platformOfStreamKey(key);
  if (!plat) return key;
  const sum = /** @type {any} */ (knownSummaries)?.[key];
  const title = String(sum?.title || '').trim();
  if (title) return title;
  const who = String(sum?.broadcasterName || '').trim();
  return who ? `${who}の配信` : `${plat.name}の配信`;
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

/**
 * 応援レーン(りんく段・ギフト列・広告列)のタイルの1行目に出す札。ニコ生版は投げた人に「ギフト」「広告」の札を出す。
 * YouTube 版は数字ID(=UC…)が出て長い文字列になっていたので、その人が何で応援したかの札にする(2026-11-04 りんく「完コピじゃない」)。
 * @type {Map<string, string>} 数字ID → スパチャ / ギフト / メンバー / ステッカー
 */
const laneKindLabelByUid = new Map();
/** @param {any[]} hist */
function rebuildLaneKindLabels(hist) {
  const rank = { スパチャ: 4, ギフト: 3, メンバー: 2, ステッカー: 1 };
  laneKindLabelByUid.clear();
  for (const h of Array.isArray(hist) ? hist : []) {
    const uid = String(h?.userId || '');
    if (!uid) continue;
    const name = String(h?.itemName || '');
    const kind = /スーパーチャット/.test(name) ? 'スパチャ' : /メンバー/.test(name) ? 'メンバー' : /ステッカー/.test(name) ? 'ステッカー' : 'ギフト';
    const cur = laneKindLabelByUid.get(uid);
    if (!cur || rank[/** @type {keyof typeof rank} */ (kind)] > rank[/** @type {keyof typeof rank} */ (cur)]) laneKindLabelByUid.set(uid, kind);
  }
  // 札が分かる前に描かれたタイル(1行目が UC… に直された後)も札にする。描き直しを待たない。
  if (typeof document === 'undefined' || !laneKindLabelByUid.size) return;
  /** @type {Map<string, string>} 画面の1行目の文字(UC… / @名前) → 札 */
  const byShown = new Map();
  for (const [uid, kind] of laneKindLabelByUid) {
    const shown = ytLabelForUid(uid);
    if (shown) byShown.set(shown, kind);
  }
  rewriteLaneFirstLines(byShown);
}
const SUPPORT_LANE_SEL = '#sceneStoryUserLaneLink, #sceneStoryUserLaneGift, #sceneStoryUserLaneAd';
/**
 * 応援レーンの各タイルで、1行目(最初に見つかった、ID と同じ文字の行)だけを札に直す。
 * @名前 しか分からない人は1行目と2行目(名前)が同じ文字なので、最初の1つだけ直す(名前は残す)。
 * @param {Map<string, string>} byShown
 */
const LANE_KIND_WORD_SET = new Set(['スパチャ', 'ギフト', 'メンバー', 'ステッカー']);
function rewriteLaneFirstLines(byShown) {
  if (typeof document === 'undefined' || !byShown.size) return;
  for (const lane of document.querySelectorAll(SUPPORT_LANE_SEL)) {
    for (const tile of Array.from(lane.children)) {
      // 札がもう付いているタイルは触らない(付いた後にもう一度呼ばれると、2行目の名前まで札にしてしまう・0.1.65 実機)
      if (tile.hasAttribute('data-yt-kind-done')) continue;
      // 0.1.1965: 札が付いているかを innerText(タイルごとにレイアウトを計算する)ではなく、文字の部品で見る。
      //   Kick 1万7千行・りんく段 2,046人で、ギフトの履歴が変わるたびに全タイルの innerText を読み、自己時間の上位だった。
      /** @type {Text[]} */
      const texts = [];
      const w = document.createTreeWalker(tile, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) texts.push(/** @type {Text} */ (n));
      if (texts.some((n) => LANE_KIND_WORD_SET.has(String(n.nodeValue || '').trim()))) {
        tile.setAttribute('data-yt-kind-done', '1');
        continue;
      }
      for (const n of texts) {
        const k = byShown.get(String(n.nodeValue || '').trim());
        if (k) {
          // @ハンドルを1行目に入れ替えた後のタイルは UC… が2行目にあるので、1行目=札・2行目=@ハンドルに直す(0.1.97)
          const nameEl = n.parentElement;
          const idEl = nameEl?.classList.contains('nl-story-userlane-meta__name') ? nameEl.previousElementSibling : null;
          if (idEl?.classList.contains('nl-story-userlane-meta__id')) {
            n.nodeValue = String(idEl.textContent || '');
            idEl.textContent = k;
          } else n.nodeValue = k;
          tile.setAttribute('data-yt-kind-done', '1');
          break;
        }
      }
    }
  }
}
/** @param {Text} node */
function fixTextNode(node) {
  const parentTag = node.parentNode && /** @type {Element} */ (node.parentNode).tagName;
  if (parentTag === 'SCRIPT' || parentTag === 'STYLE') return; // 動く中身・見た目の指定は書き換えない
  const v = String(node.nodeValue || '');
  // 小さい数字カードの「来場」は、ニコ生版では延べの来場者数。YouTube には延べが無く、ニコ生版の部品が同接(視聴中の人数)を
  //   代わりに入れて「同接と同じ数」が出ていた。取れない数なので、ニコ生版の取れないときと同じ「—」にする。
  if (node.parentElement?.id === 'officialStatNicoViewers') {
    if (v !== '—') node.nodeValue = '—';
    node.parentElement.classList.add('is-placeholder');
    return;
  }
  {
    const uid = v.trim();
    if (/^8\d{9}$/.test(uid) && laneKindLabelByUid.has(uid) && node.parentElement?.closest(SUPPORT_LANE_SEL)) {
      node.nodeValue = /** @type {string} */ (laneKindLabelByUid.get(uid));
      return;
    }
    // 0.1.97 りんく(2026-11-05)「@ああああ を先に出して後で ID」: 人物タイル(応援レーン・会場の席)は
    //   1行目に @ハンドル、2行目に UC… を出す。YouTube はチャンネル ID より @ハンドルの方がその人だと分かる。
    //   (ニコ生版の部品は1行目=ID・2行目=名前で描くので、ここで入れ替える。札の人は上の分岐で1行目=札のまま)
    const idEl = node.parentElement;
    if (/^8\d{9}$/.test(uid) && idEl?.classList.contains('nl-story-userlane-meta__id') && ytKeyForNumericUid(uid)) {
      const nameEl = idEl.nextElementSibling;
      const nm = String(nameEl?.textContent || '').trim();
      const label = ytLabelForUid(uid);
      if (nameEl?.classList.contains('nl-story-userlane-meta__name') && nm && label && nm !== label && !/^8\d{9}$/.test(nm)) {
        node.nodeValue = nm;
        nameEl.textContent = label;
        return;
      }
    }
  }
  let next = screenWording(v); // ニコニコの言葉 → YouTube(Twitch・Kick)の言葉(決まった文言だけ)
  if (/8\d{9}/.test(next)) next = next.replace(PSEUDO_UID_RE, (uid) => (ytKeyForNumericUid(uid) ? ytLabelForUid(uid) : uid));
  if (/lv9\d{11}/.test(next)) next = ytFixPseudoLvText(next);
  if (next !== v) node.nodeValue = next;
}

/** いま画面に出ている配信のサービス(Twitch/Kick・YouTube なら null)。言葉に使うので公式ランキングの期間も載せる */
function screenPlatform() {
  const p = screenPlatformBase();
  return p && platformBoardPeriod ? { ...p, boardPeriod: platformBoardPeriod } : p;
}
/** いま画面に出ている配信のサービス(Twitch/Kick・YouTube なら null。視聴ページの中ならそのページのサービス) */
function screenPlatformBase() {
  if (YT_SHIM_IN_PAGE) return platformOfHostname(location.hostname);
  if (lastAskedLv) return platformOfStreamKey(videoIdForPseudoLv(lastAskedLv));
  // 画面がまだコメントを聞いてくる前(最初の描画)は、外枠が src に焼いた配信のサービス(0.1.1949)。無ければ最近記録が増えた配信
  if (PANEL_STREAM_KEY) return platformOfPanelStreamKey(PANEL_STREAM_KEY);
  return platformOfStreamKey(newestVideoIdOf(knownSummaries));
}

/** 横の欄の数字を、今の配信のサービスに合わせる。視聴ページの中(会場)にはニコ生のチップが無いので何もしない。 */
function installPlatformMetricChromeOnce() {
  if (YT_SHIM_IN_PAGE || typeof document === 'undefined') return;
  const boot = () => {
    if (!document.getElementById('watchConcurrentCard') && !document.getElementById('officialStatNicoAdPts')) return;
    schedulePlatformChrome = watchPlatformMetricChrome(document, () => {
      const base = screenPlatformBase();
      const id = base?.id || 'youtube';
      const vid = lastAskedLv ? videoIdForPseudoLv(lastAskedLv) : '';
      const sum = vid ? knownSummaries?.[vid] : null;
      const facts = sum
        ? ytSummaryToNicoSnapshot(sum, vid, '', knownSummaries).platformFacts
        : { viewers: null, support: vid ? supportTallyByVid.get(vid) || null : null };
      return { platform: id, facts };
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
installPlatformMetricChromeOnce();

/** 画面の決まった文言の置き換え。Twitch/Kick の配信なら、YouTube の言葉にした所だけをさらにそのサービスの言葉に @param {string} t */
function screenWording(t) {
  // Twitch にはトップファンの順位表が無い=ランキング欄は最初から「合計の順位」の言葉で描く
  const p = screenPlatform();
  if (!p) return ytWording(t, { topFans: kokenIsTopFans });
  if (platformOfficial) {
    // 公式ランキングの言葉(Kick 公式の Kicks ランキング)。YouTube の言葉にした所はそのサービスの言葉に
    const w1 = ytWording(t, { topFans: true });
    const o = ytWordingPlatformOfficial(w1, p);
    return w1 !== t ? o.split('スーパーチャット').join(p.paid).split('スパチャ').join(p.paid).split('YouTube').join(p.name) : o;
  }
  const w = ytWording(t, { topFans: false });
  return w !== t ? ytWordingForPlatform(w, p) : ytWordingPlatformFixed(w, p);
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
  // title と aria-label(読み上げソフトが読む)の両方を直す
  for (const name of ['title', 'aria-label']) {
    const t = el.getAttribute(name);
    if (!t) continue;
    let next = screenWording(t);
    if (/8\d{9}/.test(next)) next = next.replace(PSEUDO_UID_RE, (uid) => (ytKeyForNumericUid(uid) ? ytLabelForUid(uid) || '' : uid));
    if (next !== t) el.setAttribute(name, next);
  }
}

// ニコ生版はアイコンが無い人の顔を数字IDから(ニコニコの置き場所に)作るが、疑似IDなのでそこには無い。
// その人の YouTube のアイコンが分かっていれば、それに差し替える(分からなければニコ生版の代わりの顔のまま)。
const NICO_USERICON_RE = /nicoaccount\/usericon\/(?:s\/)?\d+\/(8\d{9})\.jpg/;
/** @param {Element} img */
function fixImg(img) {
  const src = String(img.getAttribute('src') || '');
  const m = src.match(NICO_USERICON_RE) || String(img.getAttribute('data-yt-nico-src') || '').match(NICO_USERICON_RE);
  if (!m) return;
  const icon = ytIconForNumericUid(m[1]);
  if (icon && icon !== src) img.setAttribute('src', icon);
}

// スーパーチャットには絵が無いので、ニコ生版は灰色の四角を出す。YouTube と同じ金額の色で塗り、吹き出しの印を載せる。
const EMPTY_THUMB_SEL = '[class*="thumb--empty"]';
const SC_BUBBLE_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='white' d='M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'/%3E%3Ctext x='12' y='14' font-size='9' font-family='Arial' font-weight='700' text-anchor='middle' fill='%23333'%3E%24%3C/text%3E%3C/svg%3E\") center/70% no-repeat";
// ギフト貢献度の欄がスパチャの合計の順位だと分かった時点で、もう「トップファン」と直して出した文字を戻す
// (逆に、アーカイブのあとでトップファンの順位表がある配信へ移ったら、トップファンの言葉に戻す)
/** @param {(s: string) => string} reword */
function rewordTopFanHeadings(reword) {
  if (typeof document === 'undefined' || !document.body) return;
  // 視聴ページの中では会場の中だけ(YouTube のページの文字は触らない)
  const base = YT_SHIM_IN_PAGE ? document.getElementById('nlsb-venue-root') : document.body;
  if (!base) return;
  const plat = screenPlatform();
  const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const v = String(n.nodeValue || '');
    let next = reword(v);
    // Twitch/Kick の画面なら、入れ替えた見出しもそのサービスの言葉に(入れ替えだけだと「Twitch のスパチャの合計順」が残った)
    if (plat) next = platformOfficial ? ytWordingPlatformOfficial(next, plat) : ytWordingPlatformFixed(next, plat);
    if (next !== v) n.nodeValue = next;
  }
}

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
    decorateEmotes(/** @type {Text} */ (root));
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
  el.querySelectorAll('[title], [aria-label]').forEach(fixTitleAttr);
  if (el.matches(EMPTY_THUMB_SEL)) fixEmptyThumb(el);
  el.querySelectorAll(EMPTY_THUMB_SEL).forEach(fixEmptyThumb);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  /** @type {Text[]} */
  const texts = [];
  while ((n = walker.nextNode())) {
    fixTextNode(/** @type {Text} */ (n));
    if (emoteDictReady()) texts.push(/** @type {Text} */ (n));
  }
  // 絵文字の置き換えは文字の場所を入れ替えるので、歩き終えてから
  for (const t of texts) decorateEmotes(t);
}

// マーケHTML などの保存ファイルは、画面の直し(上の fixSubtree)が届かない文字列として作られる。
// HTML の Blob を作る瞬間に、同じ直しをその文字列にもかける(失敗したら元のまま)。
/**
 * マーケHTML のうち、YouTube では中身が無い・大きすぎて見にくい所を整える(保存するファイルだけ)。
 * - フォロー情報の2章: ニコニコにしか無い情報で、YouTube では全員「—」。ファイルの半分近く(数MB)を占めて重い→外す
 * - ギフトの瞬間: YouTube はスパチャが数秒おきに飛ぶので1枚に数百件並ぶ→各カード 8 件まで+「ほか N 件」
 * @param {Document} doc
 */
function ytTrimMarketingDoc(doc) {
  for (const id of ['mkt-commenter-follow', 'mkt-commenter-follow-analytics']) {
    doc.getElementById(id)?.remove();
    doc.querySelectorAll(`a[href="#${id}"]`).forEach((a) => (a.closest('li') || a).remove());
  }
  // 来場者数のカードの「未取得」は故障に見えるので「—」(YouTube には来場者数がない)
  doc.querySelectorAll('#mkt-participation-lead *').forEach((el) => {
    if (el.children.length === 0 && String(el.textContent || '').trim() === '未取得') el.textContent = '—';
  });
  // ギフトの章では名前の後ろの「（UC…）」を外す(ID の列があるので二重になって長い)
  const ledger = doc.getElementById('mkt-gift-ledger');
  if (ledger) {
    const w = doc.createTreeWalker(ledger, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const v = String(n.nodeValue || '');
      if (v.includes('（UC')) n.nodeValue = v.replace(/（UC[^（）]*）/g, '');
    }
  }
  const KEEP = 8;
  doc.querySelectorAll('ul.mkt-gm-gifts').forEach((ul) => {
    const items = Array.from(ul.children);
    if (items.length <= KEEP + 1) return;
    for (const li of items.slice(KEEP)) li.remove();
    const more = doc.createElement('li');
    more.className = 'mkt-gm-gift';
    more.textContent = `ほか ${items.length - KEEP} 件（全部はギフト投げ履歴の表にあります）`;
    ul.appendChild(more);
  });
}

/** @param {string} html */
function ytFixHtmlString(html) {
  try {
    // 拡張の画面の中では on…="…" の書き込みは CSP で止められ、画像の読み込み失敗などのたびにエラーが積もる
    // (外して戻す方式は、読み込み失敗が後から来るので効かなかった)。読み込む前に文字列のまま別の名前にしておき、
    // 書き出したあとで元に戻す。拡張の画面の中では一度もプログラムとして存在しない。保存ファイルには元のまま入る。
    const OFF = 'data-ytoff-on';
    const parked = html.replace(/(\s)on([a-z]+=)/gi, `$1${OFF}$2`);
    const doc = new DOMParser().parseFromString(parked, 'text/html');
    // 投げ一覧の作り直しは疑似ID入りの行を足すので、YouTube への直し(fixSubtree)より先に
    ytRebuildMarketingLedger(doc);
    fixSubtree(doc.documentElement);
    if (doc.getElementById('mkt-kpi')) ytTrimMarketingDoc(doc);
    // 全文検索の索引(data-search)にも疑似 lv・数字ID が入っているので、同じく YouTube に戻す
    doc.querySelectorAll('[data-search]').forEach((el) => {
      const v = String(el.getAttribute('data-search') || '');
      let next = /lv9\d{11}/.test(v) ? ytFixPseudoLvText(v) : v;
      if (/8\d{9}/.test(next)) next = next.replace(PSEUDO_UID_RE, (uid) => (ytKeyForNumericUid(uid) ? ytLabelForUid(uid) || uid : uid));
      if (next !== v) el.setAttribute('data-search', next);
    });
    const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
    const out = (doctype ? doctype[0] + '\n' : '') + doc.documentElement.outerHTML;
    return out.split(OFF).join('on');
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

// ニコ生版のこの欄はニコ生の画面に合わせて10位までだが、YouTube のトップファンは50位まで公開されている。
//   YouTube 版だけ、11位から下を欄の下に畳んで足す(りんく 2026-11-04)。ニコ生版の描き直しで消えたら付け直す。
/** @type {any[]} */
let topFanRestRows = [];
let topFanRestQueued = false;
function scheduleTopFanRest() {
  if (topFanRestQueued || typeof document === 'undefined') return;
  topFanRestQueued = true;
  setTimeout(() => {
    topFanRestQueued = false;
    ensureTopFanRest();
  }, 0);
}
// 顔の絵が無い(トップファンの画面がまだ絵を読み込んでいない・読み込みに失敗した)ときは、YouTube と同じく頭文字の丸を出す
/** @param {string} url @param {string} name */
function ytFaceOrLetter(url, name) {
  const wrap = document.createElement('span');
  const letter = (String(name || '').replace(/^@/, '').trim().charAt(0) || '?').toUpperCase();
  let hue = 0;
  for (const ch of String(name || '')) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  wrap.textContent = letter;
  wrap.style.cssText = `width:22px;height:22px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;background:hsl(${hue} 45% 50%);overflow:hidden;position:relative;`;
  if (/^https:\/\//.test(url)) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = url;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    img.addEventListener('error', () => img.remove(), { once: true });
    wrap.appendChild(img);
  }
  return wrap;
}

// 投げ一覧: ニコ生版の表は pt が 0 の行を出さない(ニコ生のギフトには必ず pt がある)。YouTube の「ギフト」
//   (ジュエルのスタンプ)は金額が画面に出ないので落ちていた(見出し4件・表2行)。YouTube 版だけ、ニコ生版と同じ
//   表の部品(buildGiftThrowLedgerTableSectionHtml)で、金額の出ない行も入れた表に描き直す(pt は「—」)。
//   別の欄で足すとニコ生版の表と見た目がそろわなかった(りんく「ニコ生の方がきれい」2026-11-04)。
/** @type {any[]} */
let zeroPtGifts = [];
/** @type {any[]} */
let allThrowHistory = [];
/**
 * 投げ一覧の表を YouTube 向けに整える(パネルとマーケHTMLで共通)。
 * @param {ParentNode} root
 */
function ytDecorateLedger(root) {
  const next = root;
  // 金額の出ない行の pt は「— pt」ではなく「—」
  next.querySelectorAll('td[data-label="pt"]').forEach((td) => {
    if (/^—/.test(String(td.textContent || '').trim())) td.textContent = '—';
  });
  // アカウント欄の「（UC…）」は ID 列と重なって長いので名前だけにする
  next.querySelectorAll('td.nl-gift-ledger-sender, td.mkt-gift-sender').forEach((td) => {
    const walker = (td.ownerDocument || document).createTreeWalker(td, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      n.nodeValue = String(n.nodeValue || '').replace(/（[^（）]*）\s*$/, '');
    }
  });
  // 絵の無いギフトは空の四角ではなく印を入れる(メンバー加入は★・スパチャは¥・ステッカーは✦・ほかは🎁)
  next.querySelectorAll('.nl-gift-ledger-row__thumb--empty, .mkt-gift-ledger-row__thumb--empty').forEach((box) => {
    const name = String(box.parentElement?.textContent || '');
    box.textContent = /メンバー/.test(name) ? '★' : /スーパーチャット/.test(name) ? '¥' : /ステッカー/.test(name) ? '✦' : '🎁';
    box.style.cssText += ';display:inline-flex;align-items:center;justify-content:center;font-size:16px;line-height:1;border-radius:6px;background:#e8f4ff;color:#2b7bd6';
  });
  // 絵の読み込みに失敗したら消す(拡張の画面ではインラインの onerror が使えない)
  next.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
}

/**
 * マーケHTMLの「投げ一覧」は pt の無い行を落とす(ニコ生のギフトは必ず pt があるため)。
 * YouTube はメンバー加入・ギフトに金額が無いので、パネルと同じくニコ生の表の部品で全件の行に作り直す。
 * 共有用に伏せる出力のときは触らない(伏せていない名前を足さないため)。
 * @param {Document} doc
 */
function ytRebuildMarketingLedger(doc) {
  const section = doc.getElementById('mkt-gift-ledger');
  if (!section || !allThrowHistory.length) return;
  if (String(doc.body?.textContent || '').includes('共有向けに表示名を伏せた出力')) return;
  const rows = allThrowHistory.slice(0, 200).map((h) => ({
    timeLabel: String(h.time || '—'),
    itemName: String(h.itemName || 'ギフト'),
    points: Number(h.points) > 0 ? Math.trunc(Number(h.points)) : NaN,
    thumbnailUrl: String(h.thumbnailUrl || ''),
    userId: String(h.userId || ''),
    senderLabel: String(h.senderName || ''),
    senderAvatarUrl: String(h.senderAvatarUrl || ''),
    source: screenPlatform()?.id || 'youtube',
  }));
  const html = rows
    .map((r, i) => buildGiftThrowLedgerTableRowHtml(r, i))
    .join('')
    .replace(/nl-gift-ledger-sender/g, 'mkt-gift-sender')
    .replace(/nl-gift-ledger-evidence/g, 'mkt-gift-evidence')
    .replace(/nl-gift-ledger-thumb/g, 'mkt-gift-thumb')
    .replace(/nl-gift-ledger-mono/g, 'mkt-mono')
    .replace(/nl-gift-ledger-/g, 'mkt-gift-ledger-')
    .replace(/\bnl-num\b/g, 'mkt-num')
    .replace(/nl-user-thumb-link/g, 'mkt-user-thumb-link');
  let table = section.querySelector('table.mkt-gift-ledger-table');
  if (!table) {
    const head = doc.createElement('h3');
    head.className = 'mkt-subhead';
    head.textContent = '投げ一覧（新しい順）';
    const wrap = doc.createElement('div');
    wrap.className = 'mkt-table-scroll';
    wrap.innerHTML = '<table class="mkt-rank mkt-gift-ledger-table"><thead><tr><th>#</th><th>時刻</th><th>アイテム</th><th>サムネ</th><th>アカウント</th><th>ID</th><th>pt</th><th>出典</th></tr></thead><tbody></tbody></table>';
    section.append(head, wrap);
    table = wrap.querySelector('table');
  }
  const tbody = table?.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = html;
  const note = table.closest('.mkt-table-scroll')?.previousElementSibling;
  if (note && note.classList.contains('mkt-note') && /表示は新しい順に/.test(String(note.textContent))) note.remove();
  if (allThrowHistory.length > rows.length) {
    const p = doc.createElement('p');
    p.className = 'mkt-note';
    p.textContent = `表示は新しい順に ${rows.length} 件まで（全 ${allThrowHistory.length} 件）。`;
    table.closest('.mkt-table-scroll')?.before(p);
  }
  ytDecorateLedger(tbody);
}

/**
 * 「この番組へのギフト履歴」の送り主カードで、金額の出ない応援(YouTube のギフト・メンバーシップギフト等)だけの人は
 *   「0pt」ではなく何を送ったかを出し、ホバーで中身が分かるようにする(ytZeroPtGiftLabel.js)。
 */
function ytLabelZeroPtGiftCards() {
  const body = document.getElementById('northStarLaneBody-giftHistory');
  if (!body || !zeroPtGifts.length) return;
  const labels = buildZeroPtSenderLabels(allThrowHistory);
  if (!labels.size) return;
  body.querySelectorAll('[role="listitem"]').forEach((line) => {
    const countEl = line.querySelector('.nl-top-support-rank__count');
    if (!countEl || !isZeroPtCountText(countEl.textContent)) return;
    const name = String(line.querySelector('.nl-top-support-rank__name')?.textContent || '').trim();
    const info = labels.get(name);
    if (!info) return;
    countEl.textContent = info.label;
    line.setAttribute('title', info.title);
  });
}

function ensureZeroPtGifts() {
  ytLabelZeroPtGiftCards();
  const panel = document.getElementById('northStarLaneThrows-giftHistory');
  if (!panel || panel.hidden || !zeroPtGifts.length) return;
  const section = panel.querySelector('section.nl-gift-ledger-section');
  if (!section) return;
  const sig = allThrowHistory.map((h) => String(h.kokenHistoryId || '')).join('|');
  if (section.getAttribute('data-yt-all') === sig) return;
  const shown = allThrowHistory.slice(0, 20);
  const rows = shown.map((h) => ({
    timeLabel: String(h.time || '—'),
    itemName: String(h.itemName || 'ギフト'),
    points: Number(h.points) > 0 ? Math.trunc(Number(h.points)) : NaN,
    thumbnailUrl: String(h.thumbnailUrl || ''),
    userId: String(h.userId || ''),
    senderLabel: String(h.senderName || ''),
    senderAvatarUrl: String(h.senderAvatarUrl || ''),
    source: screenPlatform()?.id || 'youtube',
  }));
  const html = buildGiftThrowLedgerTableSectionHtml(rows, {
    totalCount: allThrowHistory.length,
    shownCount: rows.length,
    payloadSource: screenPlatform()?.id || 'youtube',
  });
  if (!html) return;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const next = holder.firstElementChild;
  if (!next) return;
  next.setAttribute('data-yt-all', sig);
  ytDecorateLedger(next);
  section.replaceWith(next);
}

function ensureTopFanRest() {
  ensureZeroPtGifts();
  const body = document.getElementById('northStarLaneBody-contributionRanking');
  const old = document.getElementById('yt-topfan-rest');
  const rows = kokenIsTopFans ? topFanRestRows : [];
  if (!body || !rows.length || !body.querySelector('img, [class*="thumb"]')) {
    if (old) old.remove();
    return;
  }
  const sig = rows.map((r) => `${r.rank}:${r.name}:${r.contribution}`).join('|');
  if (old && old.parentElement === body && old.getAttribute('data-sig') === sig) return;
  const wasOpen = !!(old && /** @type {HTMLDetailsElement} */ (old).open);
  if (old) old.remove();
  const det = document.createElement('details');
  det.id = 'yt-topfan-rest';
  det.setAttribute('data-sig', sig);
  det.open = wasOpen;
  det.style.cssText = 'margin:8px 4px 2px;font-size:12px;';
  const sum = document.createElement('summary');
  sum.textContent = `11位から下（${rows.length}人）`;
  sum.style.cssText = 'cursor:pointer;color:#2563eb;';
  det.appendChild(sum);
  const ol = document.createElement('ol');
  ol.style.cssText = 'list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px 10px;';
  for (const r of rows) {
    const li = document.createElement('li');
    li.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0;';
    const rank = document.createElement('span');
    rank.textContent = String(r.rank || '');
    rank.style.cssText = 'width:22px;text-align:right;color:#64748b;flex:none;';
    li.appendChild(rank);
    const name = String(r.name || '');
    li.appendChild(ytFaceOrLetter(String(r.thumbnailUrl || ''), name));
    const a = document.createElement('a');
    a.textContent = name;
    if (/^@\S+$/.test(name)) {
      a.href = `https://www.youtube.com/${encodeURIComponent(name).replace(/^%40/, '@')}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;color:inherit;';
    li.appendChild(a);
    const xp = document.createElement('span');
    xp.textContent = `${Number(r.contribution || 0).toLocaleString('ja-JP')} XP`;
    xp.style.cssText = 'color:#64748b;flex:none;';
    li.appendChild(xp);
    ol.appendChild(li);
  }
  det.appendChild(ol);
  body.appendChild(det);
}

function startDomFixer() {
  if (YT_SHIM_IN_PAGE) {
    // 視聴ページの中では、会場(ニコ生版 venueBar.js の root)の中だけを直す。会場は開いたときに作られるので出るまで待つ
    const root = document.getElementById('nlsb-venue-root');
    if (!root) {
      // 視聴ページ以外(ホームなど)では会場は出ないので、見に行く間をあける
      const onWatch = /^\/(watch|live\/)/.test(String(location.pathname || ''));
      setTimeout(startDomFixer, onWatch ? 500 : 3000);
      return;
    }
    startDomFixerOn(root, true);
    return;
  }
  if (!document.body) return;
  hideNicoOnlyParts();
  startEmotes();
  startDomFixerOn(document.body, /\/(?:yt-)?venue\.html$/.test(String(location.pathname || '')));
}

/**
 * ニコ生の公式の設定を切り替えるだけの部品(なふだ)は、YouTube・Twitch・Kick には相手が無い
 * (押してもニコ生の視聴タブを探して「配信のタブが開いていません」になる・説明文も「ニコ生そのものの設定」「放送者さん」)。
 * 画面の写しは変えず、見せないだけにする(2026-11-08 Kick 実測で見える文字に残っていた)。
 */
function hideNicoOnlyParts() {
  if (document.getElementById('yt-hide-nico-only')) return;
  const st = document.createElement('style');
  st.id = 'yt-hide-nico-only';
  st.textContent = '.nl-nameplate-inline, .nl-record-sub:has(#nameplateOnBtn) { display: none !important; }';
  (document.head || document.documentElement).appendChild(st);
}
// ---- Twitch・Kick の絵文字を画像で見せる(0.1.1928) ----
// 記録の本文は絵文字の名前(Kappa・KEKW)のまま。コメントの本文が出る所だけ、名前と同じ語を画像に見せる。
//   ★文字は消さない(画像は背景にして文字を透明にする)= textContent を読む部品(PICK UP のドラッグ・
//   吹き出しの書き直し判定など)はそのまま動く。画像が読めなければ文字のまま(§3.6)。
/** コメントの本文が出る所(コメビュの一覧・会場の吹き出し・ピン・PICK UP・人の詳細・ホバーの最後の一言) */
const EMOTE_HOST_SEL =
  '.nl-tl-row__text, .nlsb-bubble-text, .cv-panel-text, .cv-pin-text, .nlsb-hover-card__last-text, .nlsb-pickup__body';
/** サービス(twitch/kick)→ 名前 → URL @type {Map<string, Map<string, string>>} */
const emoteDicts = new Map();
/** URL → 読めたか(読み込み中は Promise) @type {Map<string, boolean | Promise<boolean>>} */
const emoteImgState = new Map();

/** 今の画面のサービスの対応表(YouTube・ニコ生なら null) */
function currentEmoteDict() {
  const p = screenPlatformBase();
  const d = p ? emoteDicts.get(p.id) : null;
  return d && d.size ? d : null;
}
function emoteDictReady() {
  return emoteDicts.size > 0 && currentEmoteDict() !== null;
}

/** @param {string} key @param {unknown} raw */
function setEmoteDict(key, raw) {
  const p = key ? Object.values(STREAM_PLATFORMS).find((x) => x.emotesKey === key) : null;
  if (!p) return;
  /** @type {Map<string, string>} */
  const m = new Map();
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
      if (isEmoteName(k) && isSafeEmoteUrl(v)) m.set(k, String(v));
    }
  }
  const had = emoteDicts.get(p.id)?.size || 0;
  emoteDicts.set(p.id, m);
  // 新しく覚えた絵文字は、もう出ている本文にも当てる
  if (m.size > had && document.body) {
    for (const el of document.querySelectorAll(EMOTE_HOST_SEL)) {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      /** @type {Text[]} */
      const ts = [];
      for (let n = w.nextNode(); n; n = w.nextNode()) ts.push(/** @type {Text} */ (n));
      ts.forEach(decorateEmotes);
    }
  }
}

function startEmotes() {
  const keys = Object.values(STREAM_PLATFORMS).map((p) => p.emotesKey).filter(Boolean);
  try {
    Promise.resolve(real?.storage?.local?.get?.(keys))
      .then((got) => {
        for (const k of keys) if (got?.[k]) setEmoteDict(k, got[k]);
      })
      .catch(() => {});
    real?.storage?.onChanged?.addListener?.((/** @type {any} */ changes, /** @type {string} */ area) => {
      if (area && area !== 'local') return;
      for (const k of keys) if (changes?.[k]) setEmoteDict(k, changes[k].newValue);
    });
  } catch {
    /* 絵文字が出なくても本文は文字で出る */
  }
  if (!document.getElementById('yt-emote-style')) {
    const st = document.createElement('style');
    st.id = 'yt-emote-style';
    st.textContent =
      '.nl-emote.is-ready{display:inline-block;width:1.6em;height:1.6em;vertical-align:middle;overflow:hidden;' +
      'white-space:nowrap;color:transparent !important;-webkit-text-fill-color:transparent;text-shadow:none !important;' +
      'background:center/contain no-repeat;margin:0 .08em;line-height:1.6em;font-size:inherit}';
    (document.head || document.documentElement).appendChild(st);
  }
}

/** 画像を先に読んでみる(読めたものだけ画像にする) @param {string} url */
function loadEmoteImg(url) {
  const st = emoteImgState.get(url);
  if (st !== undefined) return Promise.resolve(st);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  }).then((ok) => {
    emoteImgState.set(url, /** @type {boolean} */ (ok));
    if (emoteImgState.size > 2000) emoteImgState.clear();
    return /** @type {boolean} */ (ok);
  });
  emoteImgState.set(url, p);
  return p;
}

/** @param {HTMLElement} span @param {string} url */
function showEmoteImg(span, url) {
  void loadEmoteImg(url).then((ok) => {
    if (!ok || !span.isConnected) return;
    span.style.backgroundImage = `url("${url}")`;
    span.classList.add('is-ready');
  });
}

/**
 * コメントの本文の文字のうち、絵文字の名前と同じ語を画像の部品にする。
 * @param {Text} node
 */
function decorateEmotes(node) {
  try {
    const parent = node.parentElement;
    if (!parent || parent.classList.contains('nl-emote')) return;
    const dict = currentEmoteDict();
    if (!dict) return;
    if (!parent.closest(EMOTE_HOST_SEL)) return;
    const segs = splitTextByEmotes(String(node.nodeValue || ''), dict);
    if (!segs) return;
    const frag = document.createDocumentFragment();
    for (const sg of segs) {
      if (sg.t === 'text') {
        frag.appendChild(document.createTextNode(sg.v));
        continue;
      }
      const span = document.createElement('span');
      span.className = 'nl-emote';
      span.textContent = sg.name;
      span.title = sg.name;
      frag.appendChild(span);
      showEmoteImg(span, sg.url);
    }
    node.replaceWith(frag);
  } catch {
    /* 失敗したら文字のまま */
  }
}

/**
 * @param {Element} target
 * @param {boolean} isVenue
 */
function startDomFixerOn(target, isVenue) {
  fixSubtree(target);
  // 画面に先に出た数字IDは、あとで誰か分かっても文字が変わらないので直しが届かない(会場の席で実例)。
  //   会場の画面だけ、新しく人を覚えたときに【文字だけ】直し直す。
  //   ★画像や全体の直し直しはしない(サイドパネルで全体を直し直したら顔の一覧がちらついた・0.1.51)
  if (isVenue) {
    let fixedAtVersion = uidRegVersion;
    setInterval(() => {
      if (fixedAtVersion === uidRegVersion || document.hidden) return;
      fixedAtVersion = uidRegVersion;
      try {
        const w = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (/8\d{9}/.test(String(n.nodeValue || ''))) fixTextNode(/** @type {Text} */ (n));
        }
      } catch {
        /* no-op */
      }
    }, 2000);
  }
  new MutationObserver((muts) => {
    if ((topFanRestRows.length || zeroPtGifts.length) && muts.some((m) => m.type === 'childList' && !(m.target instanceof Element && m.target.closest('#yt-topfan-rest, [data-yt-all]')))) scheduleTopFanRest();
    for (const m of muts) {
      if (m.type === 'characterData') {
        fixTextNode(/** @type {Text} */ (m.target));
        decorateEmotes(/** @type {Text} */ (m.target));
      }
      else if (m.type === 'attributes') {
        const el = /** @type {Element} */ (m.target);
        if (m.attributeName === 'href' && el.tagName === 'A') fixAnchor(el);
        else if (m.attributeName === 'title' || m.attributeName === 'aria-label') fixTitleAttr(el);
        else if (m.attributeName === 'src' && el.tagName === 'IMG') fixImg(el);
        else if (m.attributeName === 'data-nl-uid') fixUidLabelAttr(el);
      } else m.addedNodes.forEach(fixSubtree);
    }
  }).observe(target, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href', 'title', 'aria-label', 'src', 'data-nl-uid'],
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

// ---- 会場モードの入口(YouTube 版だけ) ----
// ニコ生版は視聴ページに「🏟 会場モード」ボタンを出すが、YouTube 版はサイドパネルのコメビュの隣に置く。
//   開くのはニコ生版の会場(venue.html)の完全コピー。lv はいちばん新しく記録した配信の疑似 lv。
function ensureVenueButton() {
  if (!/\/(?:yt-)?sidepanel\.html$/.test(String(location.pathname || ''))) return;
  const anchor = document.getElementById('openComeviewVoiceBtn') || document.getElementById('openComeviewBtn');
  if (!anchor || document.getElementById('ytOpenVenueBtn')) return;
  const btn = /** @type {HTMLButtonElement} */ (anchor.cloneNode(false));
  btn.id = 'ytOpenVenueBtn';
  btn.title = '会場モードを別ウィンドウで開く';
  btn.setAttribute('aria-label', '会場モードを別ウィンドウで開きます。');
  btn.innerHTML =
    '<span class="nl-compose-qbtn__row"><span class="nl-compose-qbtn__emoji" aria-hidden="true">🏟</span><span class="nl-compose-qbtn__word">会場</span></span>';
  btn.addEventListener('click', () => {
    void (async () => {
      const sums = (await chrome.storage.local.get(KEY_YT_SUMMARIES))?.[KEY_YT_SUMMARIES];
      const vid = newestVideoIdOf(sums);
      if (!vid) return;
      const url = chrome.runtime.getURL('venue.html') + `?lv=${pseudoLvForVideoId(vid)}`;
      try {
        await chrome.windows.create({ url, type: 'popup', width: 1280, height: 760 });
      } catch {
        window.open(url, '_blank', 'width=1280,height=760');
      }
    })();
  });
  anchor.after(btn);
}
// ★2026-11-04 りんく「そもそもこのかたちをのぞんでいない いらない」: 別窓の会場は出さない(ボタンを付けない)。
//   埋め込みは配信によって 152-4(外への埋め込み不可)で映らない。作るならニコ生と同じ視聴ページに重ねる形(未定)。
const YT_VENUE_WINDOW_ENABLED = false;
if (YT_VENUE_WINDOW_ENABLED && typeof document !== 'undefined' && /\/(?:yt-)?sidepanel\.html$/.test(String(location.pathname || ''))) {
  const tryVenue = () => {
    ensureVenueButton();
    if (!document.getElementById('ytOpenVenueBtn')) setTimeout(tryVenue, 1000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryVenue, { once: true });
  else tryVenue();
}

// 会場モードの真ん中の映像は、ニコ生版ではニコ生の埋め込みプレイヤー。YouTube 版はその動画の YouTube の埋め込みにする。
if (typeof document !== 'undefined' && /\/(?:yt-)?venue\.html$/.test(String(location.pathname || ''))) {
  const swapEmbed = (/** @type {Element} */ el, tries = 0) => {
    if (!(el instanceof HTMLIFrameElement)) return;
    const m = String(el.getAttribute('src') || '').match(/^https:\/\/live\.nicovideo\.jp\/embed\/(lv\d+)/i);
    if (!m) return;
    // 視聴ページの上に重ねた会場では、真ん中はページの本物のプレーヤーが映る(埋め込みは使わない=152-4 が出ない)
    if (/[?&]overlay=1\b/.test(String(location.search || ''))) {
      el.remove();
      return;
    }
    const vid = videoIdForPseudoLv(m[1].toLowerCase());
    // 疑似 lv と動画の対応は記録を読んでから決まる。まだなら少し待って試し直す
    if (!vid) {
      if (tries < 20) setTimeout(() => swapEmbed(el, tries + 1), 300);
      return;
    }
    // Twitch・Kick・ふわっちの配信に YouTube の埋め込みを作ると、YouTube のエラー(152-4)が映る(2026-11-08 PC 実測)。
    //   そのサービスの映像は外へ埋め込めないので、枠ごと外す(視聴ページに重ねた会場と同じ)
    if (platformOfStreamKey(vid)) {
      el.remove();
      return;
    }
    el.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    el.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    el.src = `https://www.youtube.com/embed/${encodeURIComponent(vid)}?autoplay=1&mute=1`;
  };
  const scan = (/** @type {ParentNode} */ root) => root.querySelectorAll?.('iframe').forEach((f) => swapEmbed(f));
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n instanceof Element) { swapEmbed(n); scan(n); }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

// ちらつき対策: ニコ生版は顔を描くたびに、数字IDから作ったニコニコの顔の場所(nicoaccount/usericon/…)を src に入れる。
//   画面に出てから YouTube の顔に差し替える(上の fixImg)と、描き直しのたびに一瞬ニコニコ側の絵(無い→代わりの絵)が
//   映ってちらつく。src を入れる瞬間に YouTube の顔へ置き換えて、最初から正しい絵を読ませる。
//   (分からない人はそのまま=いままでどおり)
// ★視聴ページの中(content script)では入れない: 隔離された世界から包んだ src/setAttribute で画像を読ませると、Chrome が
//   「Unsafe attempt to load URL … from frame」で弾き、会場のキャラ画像や顔が読めなかった(2026-11-04 りんく実機・エラー一覧の
//   スタックが venue-inline.js の set / setAttribute)。会場の顔は startDomFixerOn(root) の差し替えで直す。
if (!YT_SHIM_IN_PAGE && typeof HTMLImageElement !== 'undefined' && typeof Element !== 'undefined') {
  /** @param {any} v */
  const mapSrc = (v) => {
    const s = String(v ?? '');
    const m = s.match(NICO_USERICON_RE);
    if (!m) return v;
    return ytIconForNumericUid(m[1]) || v;
  };
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc && desc.set && desc.get) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: desc.enumerable,
        get() {
          return desc.get.call(this);
        },
        set(v) {
          desc.set.call(this, mapSrc(v));
        },
      });
    }
    const realSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (this instanceof HTMLImageElement && String(name).toLowerCase() === 'src') return realSetAttr.call(this, name, mapSrc(value));
      return realSetAttr.call(this, name, value);
    };
    const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (ih && ih.set && ih.get) {
      const GLOBAL_RE = /https?:\/\/[^"'\s<>]*?nicoaccount\/usericon\/(?:s\/)?\d+\/(8\d{9})\.jpg[^"'\s<>]*/g;
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true,
        enumerable: ih.enumerable,
        get() {
          return ih.get.call(this);
        },
        set(v) {
          // 計器(0.1.60): 応援アイコンの一覧が丸ごと消される(作り直し)とき、誰が呼んだかを数える
          if (v === '' && this.id === 'sceneStoryGrowth') {
            try {
              const why = /** @type {any} */ (globalThis).__ytFlickerWhy;
              if (why) {
                const names = String(new Error().stack || '')
                  .split('\n')
                  .slice(2, 8)
                  .map((l) => (/at (?:async )?([\w$.<>]+) \(/.exec(l) || [])[1] || '?')
                  .join('<');
                why.clears[names] = (why.clears[names] || 0) + 1;
                const imgs = this.querySelectorAll('img');
                const icons = this.querySelectorAll('img.nl-story-growth-icon');
                const k = `imgs${imgs.length}/icons${icons.length}/cells${this.childElementCount}`;
                why.before[k] = (why.before[k] || 0) + 1;
              }
            } catch {
              /* 計器は描画を止めない */
            }
          }
          let s = v;
          if (typeof s === 'string' && s.includes('usericon')) {
            s = s.replace(GLOBAL_RE, (all, uid) => {
              const icon = ytIconForNumericUid(uid);
              return icon ? icon.replace(/&/g, '&amp;').replace(/"/g, '&quot;') : all;
            });
          }
          ih.set.call(this, s);
        },
      });
    }
  } catch {
    /* 差し替えられなくても、上の fixImg がいままでどおり直す */
  }
}

// 視聴ページの中(content script)の会場: YouTube のページの見張り(connection-allowlist-report-only)は、Google/YouTube 以外への
//   読み込みを全部エラー一覧に報告する(止めはしない)。会場のキャラの表情が変わるたび・顔を描くたびに積もり、
//   「すべて削除しても無限に出る」(2026-11-04 りんく実機)。画像を入れる瞬間に、つなぎに行かない形へ置き換える:
//   ・拡張の中の画像 → 同じ中身の blob:(ytLocalAssetUrls.js)
//   ・ニコニコの顔(疑似ID) → その人の YouTube の顔(分かれば)。分からなければ読まずに失敗させる(data:,)=
//     ニコ生版で顔が無いとき(404)と同じく、ニコ生版の代わりの顔が出る。元の場所は data-yt-nico-src に残し、
//     あとで YouTube の顔が分かったら fixImg が差し替える。
if (YT_SHIM_IN_PAGE && typeof HTMLImageElement !== 'undefined' && typeof Element !== 'undefined') {
  const NIMG_RE = /^https?:\/\/[^/]*\.nimg\.jp\//i;
  /** @param {any} v @returns {{ src: any, nico: string }} */
  const mapPageSrc = (v) => {
    const s = String(v ?? '');
    if (s.startsWith('chrome-extension://')) return { src: ytLocalAssetUrlFor(s), nico: '' };
    if (!NIMG_RE.test(s)) return { src: v, nico: '' };
    const m = s.match(NICO_USERICON_RE);
    const icon = m ? ytIconForNumericUid(m[1]) : '';
    return icon ? { src: icon, nico: '' } : { src: 'data:,', nico: s };
  };
  try {
    const realSetAttr = Element.prototype.setAttribute;
    const realGetAttr = Element.prototype.getAttribute;
    Element.prototype.getAttribute = function (name) {
      const v = realGetAttr.call(this, name);
      if (this instanceof HTMLImageElement && String(name).toLowerCase() === 'src') {
        return realGetAttr.call(this, 'data-yt-nico-src') || v;
      }
      return v;
    };
    // 読まずに失敗させるのは、ニコニコの置き場所が「無い(404)」と答えるくらい間を置いてから。
    //   すぐ失敗させると、ニコ生版の顔の見張りが同じ人の2つ目の顔を描く前に失敗を覚えてしまい、
    //   代わりの顔の見た目(枠と背景)が1つ目と2つ目で変わる(試験ページで 12 人中 6 人)。
    /** @param {Element} img @param {() => void} fail */
    const failLater = (img, fail) => {
      const want = realGetAttr.call(img, 'data-yt-nico-src');
      setTimeout(() => {
        if (realGetAttr.call(img, 'data-yt-nico-src') === want) fail();
      }, 150);
    };
    /** @param {Element} img @param {string} nico */
    const keepNico = (img, nico) => {
      if (nico) realSetAttr.call(img, 'data-yt-nico-src', nico);
      else if (img.hasAttribute('data-yt-nico-src')) img.removeAttribute('data-yt-nico-src');
    };
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc && desc.set && desc.get) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: desc.enumerable,
        // ニコ生版の部品(顔の読み込み見張り)は src を読んで「誰の顔が失敗したか」を決めるので、元の場所を見せる
        get() {
          return realGetAttr.call(this, 'data-yt-nico-src') || desc.get.call(this);
        },
        set(v) {
          const r = mapPageSrc(v);
          keepNico(this, r.nico);
          if (r.nico) failLater(this, () => desc.set.call(this, 'data:,'));
          else desc.set.call(this, r.src);
        },
      });
    }
    Element.prototype.setAttribute = function (name, value) {
      if (this instanceof HTMLImageElement && String(name).toLowerCase() === 'src') {
        const r = mapPageSrc(value);
        keepNico(this, r.nico);
        if (r.nico) return failLater(this, () => realSetAttr.call(this, name, 'data:,'));
        return realSetAttr.call(this, name, r.src);
      }
      return realSetAttr.call(this, name, value);
    };
    // 会場の席の顔は innerHTML の <img src="…"> で入る(venueBar.js の nlsb-roster-avatar)
    const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (ih && ih.set && ih.get) {
      const SRC_RE = /\bsrc="((?:https?:\/\/[^"/]*\.nimg\.jp\/|chrome-extension:\/\/)[^"]*)"/gi;
      /** @param {string} t */
      const unesc = (t) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      /** @param {string} t */
      const esc = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true,
        enumerable: ih.enumerable,
        get() {
          return ih.get.call(this);
        },
        set(v) {
          let html = v;
          if (typeof html === 'string' && (html.includes('nimg.jp') || html.includes('chrome-extension://'))) {
            html = html.replace(SRC_RE, (all, raw) => {
              const r = mapPageSrc(unesc(raw));
              return r.nico ? `data-yt-nico-src="${esc(r.nico)}"` : `src="${esc(String(r.src))}"`;
            });
          }
          ih.set.call(this, html);
          if (html !== v) {
            for (const img of this.querySelectorAll('img[data-yt-nico-src]:not([src])')) failLater(img, () => realSetAttr.call(img, 'src', 'data:,'));
          }
        },
      });
    }
  } catch {
    /* 包めなければ元のまま(画像は出る・報告が残るだけ) */
  }
}

// ---- 計器: ちらつき(顔の絵の差し替え・作り直し)を数える(サイドパネル・会場) ----
// アイコン一覧が「はじめの360件で固定」になったとき、一覧の上に目立つ一言を出す(2026-11-04 りんく「ではそれで」)。
//   固定はニコ生版と同じ(顔が動かず人を追える)。ただ、下の小さい説明だけでは「増えない=止まった」に見えるので、
//   いまの件数と「新しい人は上の応援レーンに出ている」ことを一覧の真上に書く。ニコ生版の部品には手を入れない。
if (typeof document !== 'undefined' && /\/(?:yt-)?sidepanel\.html$/.test(String(location.pathname || ''))) {
  const paintGridNote = () => {
    const grid = document.getElementById('sceneStoryGrowth');
    const label = document.getElementById('sceneStoryGaugeLabel');
    if (!grid || !label || !grid.parentNode) return;
    const m = String(label.textContent || '').match(/応援\s*([\d,]+)\s*コメント（グリッドははじめの\s*([\d,]+)\s*件で固定・そのあとの\s*([\d,]+)\s*件/);
    let note = document.getElementById('ytGridFullNote');
    if (!m) {
      if (note) note.remove();
      return;
    }
    if (!note) {
      note = document.createElement('div');
      note.id = 'ytGridFullNote';
      note.setAttribute('role', 'status');
      note.style.cssText =
        'margin:6px 0;padding:6px 10px;border-radius:8px;background:#fff4d6;border:1px solid #f0c36d;color:#5a4300;font-size:12px;font-weight:700;line-height:1.5;';
      grid.parentNode.insertBefore(note, grid);
    }
    const text = `いま ${m[1]} 件。この一覧は顔が動かないように、はじめの ${m[2]} 件で止めています。そのあとの ${m[3]} 件(新しく来た人)は、上の応援レーンに出ています。`;
    if (note.textContent !== text) note.textContent = text;
  };
  setInterval(paintGridNote, 2000);
}

// りんく「こちらに確認もとめないで計器で検知して」(2026-11-04)。10秒ごとに storage の yt_diag_flicker に書く。
//   srcChanges: 画面にある img の src が変わった回数 / imgAdds: img が新しく作られた回数(描き直し)
//   flips: 同じ img が10秒の間に2回以上 src を変えた数(=ちらつきの本体) / byTransition: 「前の絵の種類→次」の回数
if (typeof document !== 'undefined' && /\/(?:yt-)?(sidepanel|venue)\.html$/.test(String(location.pathname || ''))) {
  const kindOf = (/** @type {string} */ src) => {
    const s = String(src || '');
    if (!s) return 'empty';
    if (s.startsWith('data:image/svg')) return 'data-svg';
    if (s.startsWith('data:')) return 'data';
    if (/nicoaccount\/usericon/.test(s)) return 'nico-usericon';
    if (/yt\d?\.ggpht\.com|googleusercontent/.test(s)) return 'yt-face';
    if (/gstatic\.com/.test(s)) return 'gstatic';
    if (s.startsWith('chrome-extension:')) return 'ext-image';
    return 'other';
  };
  /** @type {any} */ (globalThis).__ytFlickerWhy = { clears: {}, before: {}, idChanges: 0, idSamples: [], srcSamples: [] };
  /** @type {WeakMap<Element, number>} */
  let perImg = new WeakMap();
  let win = { srcChanges: 0, imgAdds: 0, flips: 0, byTransition: /** @type {Record<string, number>} */ ({}), where: /** @type {Record<string, number>} */ ({}) };
  const whereOf = (/** @type {Element} */ el) => {
    const host = el.closest('[id]');
    return host ? `#${host.id}`.slice(0, 60) : '?';
  };
  const start = () => {
    if (!document.body) return;
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'data-comment-id') {
          // 同じマスが別のコメントに入れ替わった(並びがずれた)回数
          if (m.oldValue && m.oldValue !== /** @type {Element} */ (m.target).getAttribute('data-comment-id')) {
            const why = /** @type {any} */ (globalThis).__ytFlickerWhy;
            why.idChanges += 1;
            if (why.idSamples.length < 4) {
              why.idSamples.push({ idx: /** @type {Element} */ (m.target).getAttribute('data-comment-index'), from: String(m.oldValue).slice(0, 40), to: String(/** @type {Element} */ (m.target).getAttribute('data-comment-id')).slice(0, 40) });
            }
          }
          continue;
        }
        if (m.type === 'attributes' && m.target instanceof HTMLImageElement && m.attributeName === 'src') {
          const img = m.target;
          const t = `${kindOf(m.oldValue || '')}→${kindOf(img.getAttribute('src') || '')}`;
          if (t.split('→')[0] === t.split('→')[1] && m.oldValue === img.getAttribute('src')) continue;
          win.srcChanges += 1;
          {
            const why = /** @type {any} */ (globalThis).__ytFlickerWhy;
            if (why.srcSamples.length < 3 && img.closest('#sceneStoryGrowth')) {
              why.srcSamples.push({ idx: img.getAttribute('data-comment-index'), from: String(m.oldValue || '').slice(-60), to: String(img.getAttribute('src') || '').slice(-60) });
            }
          }
          win.byTransition[t] = (win.byTransition[t] || 0) + 1;
          const n = (perImg.get(img) || 0) + 1;
          perImg.set(img, n);
          if (n === 2) {
            win.flips += 1;
            const w = whereOf(img);
            win.where[w] = (win.where[w] || 0) + 1;
          }
        } else if (m.type === 'childList') {
          for (const n of m.addedNodes) {
            if (!(n instanceof Element)) continue;
            const c = n instanceof HTMLImageElement ? 1 : n.getElementsByTagName('img').length;
            if (c) {
              win.imgAdds += c;
              const w = `add:${whereOf(n)}`;
              win.where[w] = (win.where[w] || 0) + c;
            }
          }
        }
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'data-comment-id'], attributeOldValue: true });
    setInterval(() => {
      const why = /** @type {any} */ (globalThis).__ytFlickerWhy;
      const snap = { at: Date.now(), page: location.pathname.split('/').pop(), version: chrome.runtime.getManifest?.().version, ...win, why: { ...why } };
      /** @type {any} */ (globalThis).__ytFlickerWhy = { clears: {}, before: {}, idChanges: 0, idSamples: [], srcSamples: [] };
      win = { srcChanges: 0, imgAdds: 0, flips: 0, byTransition: {}, where: {} };
      perImg = new WeakMap();
      void (async () => {
        try {
          const key = 'yt_diag_flicker';
          const prev = (await real.storage.local.get(key))?.[key];
          const list = Array.isArray(prev) ? prev : [];
          list.push(snap);
          await real.storage.local.set({ [key]: list.slice(-60) });
          // 画面の写し(0.1.61): 応援レーン各段の人数・先頭5タイルの文字と顔の種類、上の数字カードの文字。
          //   ニコ生版と並べて比べるため(りんくに見え方を聞かない)。最新1件だけ yt_diag_lanes に置く。
          const tileOf = (/** @type {Element} */ t) => {
            const img = t.querySelector('img');
            return {
              lines: String(/** @type {HTMLElement} */ (t).innerText || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 5),
              img: img ? kindOf(img.getAttribute('src') || '') : 'none',
            };
          };
          /** @type {Record<string, any>} */
          const lanes = {};
          for (const name of ['Link', 'Gift', 'Ad', 'Konta', 'Tanu']) {
            const el = document.getElementById(`sceneStoryUserLane${name}`);
            if (!el) continue;
            const tiles = Array.from(el.children).filter((c) => c.querySelector('img'));
            const guide = document.getElementById(name === 'Link' ? 'sceneStoryUserLaneGuideLinesTop' : `sceneStoryUserLaneGuideLinesMid${name}`);
            lanes[name] = {
              shown: /** @type {HTMLElement} */ (el).offsetParent !== null,
              guide: String(/** @type {HTMLElement|null} */ (guide)?.innerText || '').slice(0, 80),
              n: tiles.length,
              first: tiles.slice(0, 5).map(tileOf),
            };
          }
          /** @type {Record<string, string>} */
          const cards = {};
          for (const id of ['topSupportRankStrip', 'watchConcurrentCard', 'supportVisualLiveCard', 'northStarLaneBody-contributionRanking', 'northStarLaneBody-giftHistory', 'northStarLaneBody-adRanking', 'northStarLaneBody-programPoints', 'northStarLaneBody-eventRank']) {
            const el = /** @type {HTMLElement|null} */ (document.getElementById(id));
            if (el) cards[id] = String(el.innerText || '').replace(/\s+/g, ' ').slice(0, 300);
          }
          await real.storage.local.set({ yt_diag_lanes: { at: Date.now(), version: snap.version, lanes, cards } });
        } catch {
          /* 計器が失敗しても画面は止めない */
        }
      })();
    }, 10000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
/** テスト用(人物タイルの行の入れ替えを確かめる) */
export { fixTextNode as __fixTextNodeForTest };
