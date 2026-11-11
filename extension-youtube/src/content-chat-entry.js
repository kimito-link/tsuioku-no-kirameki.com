// content-chat-entry.js — YouTube Live チャット欄 DOM の監視・コメント取得 Content Script
/* global chrome, window, document, MutationObserver, InputEvent, setTimeout, clearTimeout, setInterval, NodeFilter, HTMLElement */

import {
  parseYtChatElement,
  extractYtWatchConcurrentViewersFromText,
} from '../../src/lib/youtube/ytChatParse.js';
import { ytReplayResponseToRecords } from '../../src/lib/youtube/ytReplayChatJson.js';
import { classifyYtChatInputBlock } from '../../src/lib/youtube/ytChatInputBlock.js';
import { createYtEchoDedupe } from '../../src/lib/youtube/ytChatEchoDedupe.js';
import {
  parseYtVideoIdFromUrl,
  isYtWatchLikeUrl,
  pickYtBroadcasterIconUrl,
} from '../../src/lib/youtube/ytPageMeta.js';
import { ytVideoIdFromChatFrameUrl } from '../../src/lib/youtube/ytChatContinuationVideoId.js';
import { relativeStreamStartedAtMs, startMsFromTimestampBlob } from '../../src/lib/youtube/ytStreamStart.js';

/** チャットを自動で「すべて」に切り替えるか（サイドパネルの設定・既定オン） */
const AUTO_ALL_CHAT_KEY = 'yt_auto_all_chat_v1';

const CHAT_ITEM_SELECTOR = [
  'yt-live-chat-text-message-renderer',
  'yt-live-chat-paid-message-renderer',
  'yt-live-chat-paid-sticker-renderer',
  'yt-live-chat-membership-item-renderer',
  'ytd-sponsorships-live-chat-gift-purchase-announcement-renderer',
  'yt-live-chat-sponsorships-gift-purchase-announcement-renderer',
  'yt-gift-message-view-model',
].join(', ');

const MAX_SEEN_IDS = 5000;

/**
 * 現在のページまたは親フレームから YouTube の videoId を特定する。
 * @returns {string}
 */
/**
 * ★0.1.1912(2026-11-06 りんく実機): チャット欄は、自分の URL の continuation から「どの配信のチャットか」を読む。
 *   親のページの動画IDは、チャット欄が前の配信のまま残っていると違う配信を指す(ABEMA のページの記録に石川典行さんの配信の人が
 *   全部入っていた)。チャット欄自身の印を親の URL より先に信じる。読めなければ今までどおり親の URL。
 * @returns {string}
 */
let frameVidHref = '';
let frameVidCached = '';
function chatFrameOwnVideoId() {
  const href = String(window.location.href || '');
  if (href === frameVidHref) return frameVidCached; // コメント1件ごとに呼ばれるので、URL が同じなら読み直さない
  frameVidHref = href;
  try {
    frameVidCached = ytVideoIdFromChatFrameUrl(href);
  } catch {
    frameVidCached = '';
  }
  return frameVidCached;
}

function publishedVideoId() {
  try {
    const id = String(document.documentElement?.getAttribute('data-nl-yt-video-id') || '');
    if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
  } catch {
    /* 属性が読めなければ URL に戻る */
  }
  return '';
}

function canonicalVideoId() {
  try {
    return parseYtVideoIdFromUrl(String(document.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''));
  } catch {
    return '';
  }
}

function resolveCurrentVideoId() {
  const frameVid = chatFrameOwnVideoId();
  if (frameVid) return frameVid;
  const own = parseYtVideoIdFromUrl(String(window.location.href || ''));
  if (own) return own;
  const canon = canonicalVideoId();
  if (canon) return canon;
  const published = publishedVideoId();
  if (published) return published;
  try {
    if (window.top && window.top !== window) {
      const top = parseYtVideoIdFromUrl(String(window.top.location.href || ''));
      if (top) return top;
    }
  } catch {
    // cross-origin 時は参照不可
  }
  return parseYtVideoIdFromUrl(String(document.referrer || ''));
}

/**
 * チャットヘッダーの表示モード（「トップチャット」／「すべてのチャット」等）を取得する。
 * @returns {string}
 */
function readChatFilterLabel() {
  try {
    const labelEl = document.querySelector(
      'yt-sort-filter-sub-menu-renderer #label, yt-live-chat-header-renderer #trigger #label',
    );
    return String(labelEl?.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/**
 * Service Worker へ安全にメッセージを送る（拡張リロード時の context invalidated を握りつぶす）。
 * @param {any} msg
 */
function safeSendMessage(msg) {
  try {
    if (!chrome?.runtime?.id) {
      reloadOrphanedPageOnce();
      return;
    }
    chrome.runtime.sendMessage(msg, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // context invalidated
  }
}

/**
 * 拡張が更新・入れ直しされると、このページの中の古いプログラムは拡張と話せなくなり、記録が黙って止まる。
 * ニコ生版(PR #559)と同じく、そうなったらページを1回だけ読み込み直して新しいプログラムに入れ替える。
 * チャット欄(iframe)の中で気づいたときも、視聴ページごと読み込み直す。10分に1回まで。
 */
function reloadOrphanedPageOnce() {
  try {
    const KEY = 'nl_yt_orphan_reload_at';
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 10 * 60 * 1000) return;
    window.sessionStorage.setItem(KEY, String(Date.now()));
    const target = window.top && window.top !== window ? window.top : window;
    target.location.reload();
  } catch {
    // 読み込み直せないときは何もしない
  }
}

/**
 * 要素から画像 URL 候補を集める（遅延読み込みで src が空のときは srcset / data 属性も見る）。
 * @param {Element | null} img
 * @returns {string[]}
 */
function collectImgUrlCandidates(img) {
  if (!img) return [];
  const out = [];
  const anyImg = /** @type {any} */ (img);
  out.push(String(anyImg.currentSrc || ''));
  out.push(String(anyImg.src || ''));
  out.push(String(img.getAttribute('src') || ''));
  const srcset = String(img.getAttribute('srcset') || '');
  if (srcset) out.push(srcset.split(',').pop()?.trim().split(/\s+/)[0] || '');
  out.push(String(img.getAttribute('data-src') || ''));
  out.push(String(img.getAttribute('data-thumb') || ''));
  return out;
}

/** 配信者アイコン（チャンネル画像）を探す。YouTube は画面構成が何度も変わるので候補を広く見る。 */
function readBroadcasterIconUrl() {
  const selectors = [
    'ytd-watch-metadata ytd-video-owner-renderer #avatar img',
    'ytd-watch-metadata #owner yt-img-shadow img',
    'ytd-watch-metadata #owner img',
    '#owner #avatar img',
    'ytd-video-owner-renderer #avatar img',
    'ytd-video-owner-renderer img',
    '#upload-info #avatar img',
    'ytd-channel-name ~ * img',
  ];
  const candidates = [];
  for (const sel of selectors) {
    try {
      document.querySelectorAll(sel).forEach((img) => {
        candidates.push(...collectImgUrlCandidates(img));
      });
    } catch {
      // ignore
    }
  }
  // 最後の手段: ページ内 JSON-LD / meta（チャンネル画像は含まれないことが多いが無害）
  try {
    const metaImg = document.querySelector('link[itemprop="thumbnailUrl"][href*="ggpht"], meta[itemprop="image"][content*="ggpht"]');
    if (metaImg) candidates.push(String(metaImg.getAttribute('href') || metaImg.getAttribute('content') || ''));
  } catch {
    // ignore
  }
  return pickYtBroadcasterIconUrl(candidates);
}

/** 同時視聴数（「◯人が視聴中」「◯ watching now」）を探す。 */
/**
 * 画面に【見えている】文字だけをつないで返す。
 * YouTube の同時視聴数は数字が回るアニメ(yt-animated-rolling-number)で、各桁に 0〜9 が縦に全部並び、
 * 1つだけが枠の中に見えている。textContent / innerText だと 0〜9 が全部つながってしまうので、
 * 文字ごとに位置を測り、はみ出しを隠している親の枠の中にある文字だけを残す。
 * @param {Element} root
 * @returns {string}
 */
function visibleTextOf(root) {
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let out = '';
    /** @type {Map<Element, DOMRect | null>} */
    const clipCache = new Map();
    const rootRect = root.getBoundingClientRect();
    /** @param {Element | null} start */
    const clipRectOf = (start) => {
      for (let e = start; e && e !== root.parentElement; e = e.parentElement) {
        if (clipCache.has(e)) return clipCache.get(e) || null;
        const st = window.getComputedStyle(e);
        if (st.overflow !== 'visible' || st.overflowY !== 'visible') {
          const r = e.getBoundingClientRect();
          clipCache.set(e, r);
          return r;
        }
      }
      return null;
    };
    let node;
    while ((node = walker.nextNode())) {
      const text = String(node.nodeValue || '');
      if (!text.trim()) {
        out += text;
        continue;
      }
      const parent = node.parentElement;
      if (parent && window.getComputedStyle(parent).visibility === 'hidden') continue;
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // 切り取る親が見つからないときは読み取り元の箱そのもので切る(縦に並んだ 0〜9 のうち箱の中の1つだけ残す)
      const clip = clipRectOf(parent) || rootRect;
      if (clip && clip.height > 0) {
        const overlap = Math.min(r.bottom, clip.bottom) - Math.max(r.top, clip.top);
        if (overlap < r.height / 2) continue;
      }
      out += text;
    }
    // 桁ごとに別の要素なので「1 9 , 3 4 9」のように空白が挟まる。数字どうしの間の空白は詰める。
    return out
      .replace(/\s+/g, ' ')
      .replace(/([0-9,.])\s+(?=[0-9,.])/g, '$1')
      .trim();
  } catch {
    return '';
  }
}

// 横の「関連動画」にも他の配信の「◯人が視聴中」が並ぶ。それを読まないよう、そこは見ない。
const OTHER_VIDEOS_SEL =
  '#secondary, #related, ytd-watch-next-secondary-results-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-rich-item-renderer, ytd-video-renderer, ytd-miniplayer';
/** @param {Node | null} n */
function isInOtherVideos(n) {
  const el = n && n.nodeType === 1 ? /** @type {Element} */ (n) : n?.parentElement || null;
  try {
    return Boolean(el && el.closest(OTHER_VIDEOS_SEL));
  } catch {
    return false;
  }
}

function isInSkippedText(n) {
  const el = n && n.nodeType === 1 ? /** @type {Element} */ (n) : n?.parentElement || null;
  try {
    return Boolean(el && el.closest('script, style, noscript'));
  } catch {
    return false;
  }
}

function readPublishedViewers() {
  try {
    const root = document.documentElement;
    const id = String(root?.getAttribute('data-nl-yt-video-id') || '');
    const pageId = resolveCurrentVideoId();
    if (!/^[A-Za-z0-9_-]{11}$/.test(id) || (pageId && id !== pageId)) return null;
    const n = Number(root.getAttribute('data-nl-yt-viewers') || '');
    if (!Number.isFinite(n) || n < 0 || n > 50_000_000) return null;
    return Math.floor(n);
  } catch {
    return null;
  }
}

function readConcurrentViewers() {
  const published = readPublishedViewers();
  if (published !== null) return published;
  const selectors = [
    'ytd-watch-metadata #description #info',
    'ytd-watch-metadata #info-container',
    'ytd-watch-info-text',
    'ytd-watch-metadata #view-count',
    '#view-count',
    'ytd-video-primary-info-renderer #count',
    'ytd-video-view-count-renderer',
    '#info',
  ];
  for (const sel of selectors) {
    /** @type {NodeListOf<Element>} */
    let nodes;
    try {
      nodes = document.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      if (isInOtherVideos(el)) continue;
      // 数字が回るアニメーション(yt-animated-rolling-number)は textContent に 0〜9 が全部並ぶので、
      // 読み上げ用の aria-label を先に見る。textContent は最後(桁の連なりは parser 側で捨てる)。
      const texts = [visibleTextOf(el), String(el.getAttribute('aria-label') || '')];
      el.querySelectorAll('[aria-label]').forEach((x) => texts.push(String(x.getAttribute('aria-label') || '')));
      texts.push(String(/** @type {HTMLElement} */ (el).innerText || ''));
      texts.push(String(el.textContent || ''));
      for (const t of texts) {
        const parsed = extractYtWatchConcurrentViewersFromText(t);
        if (parsed !== null) return parsed;
      }
    }
  }
  // 読み上げ用の名札(aria-label)に「◯人が視聴中」と書いてある要素を、ページ全体から探す
  try {
    const labeled = document.querySelectorAll('[aria-label*="視聴中"], [aria-label*="watching"]');
    for (let i = 0; i < labeled.length; i += 1) {
      if (isInOtherVideos(labeled[i])) continue;
      const parsed = extractYtWatchConcurrentViewersFromText(String(labeled[i].getAttribute('aria-label') || ''));
      if (parsed !== null) return parsed;
    }
  } catch {
    // ignore
  }
  return readViewersFromSameLine();
}

/**
 * 最後の手: 「視聴中 / watching」の文字そのものを探し、それと【同じ行の高さ】にある文字だけをつなげて読む。
 * 数字が回る表示は 0〜9 が縦に積まれていて、切り取りの親が分からなくても、
 * 見えている桁だけが「視聴中」と同じ高さに並ぶ(他の桁は上下にずれている)。
 * @returns {number | null}
 */
function readViewersFromSameLine() {
  try {
    // 見つからない場所に置かれていることがあるので、最後はページ全体を見る
    const roots = [
      ...Array.from(document.querySelectorAll('ytd-watch-metadata, #above-the-fold, ytd-watch-flexy #primary')),
      document.body,
    ].filter(Boolean);
    const range = document.createRange();
    /** @param {Node} n */
    const rectOf = (n) => {
      range.selectNodeContents(n);
      return range.getBoundingClientRect();
    };
    for (let ri = 0; ri < roots.length; ri += 1) {
      const walker = document.createTreeWalker(roots[ri], NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const v = String(node.nodeValue || '');
        if (!/視聴中|watching/i.test(v)) continue;
        if (isInOtherVideos(node) || isInSkippedText(node)) continue;
        const ref = rectOf(node);
        if (ref.height <= 0) continue;
        // 同じ行の文字を集める範囲: 4 つ上の親まで
        let box = node.parentElement;
        for (let k = 0; k < 4 && box && box.parentElement; k += 1) box = box.parentElement;
        if (!box) continue;
        const w2 = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
        let t;
        let line = '';
        while ((t = w2.nextNode())) {
          const tv = String(t.nodeValue || '');
          if (isInSkippedText(t)) continue;
          if (!tv.trim()) {
            line += tv;
            continue;
          }
          const r = rectOf(t);
          const overlap = Math.min(r.bottom, ref.bottom) - Math.max(r.top, ref.top);
          if (r.height > 0 && overlap >= Math.min(r.height, ref.height) / 2) line += tv;
        }
        const text = line
          .replace(/\s+/g, ' ')
          .replace(/([0-9,.])\s+(?=[0-9,.])/g, '$1');
        const parsed = extractYtWatchConcurrentViewersFromText(text);
        if (parsed !== null) return parsed;
      }
    }
  } catch {
    // 読めなければ null(人数は「—」のまま)
  }
  return null;
}

/**
 * 配信が本当に始まった時刻(ms)。ページの埋め込み情報 <meta itemprop="startDate"> を読む。
 * YouTube は画面遷移してもページを読み直さないので、同じページの videoId と一致するときだけ使う。
 * @param {string} videoId
 * @returns {number | null}
 */
function readStreamStartedAt(videoId) {
  try {
    const metas = document.querySelectorAll('meta[itemprop="startDate"]');
    for (let i = 0; i < metas.length; i += 1) {
      const scope = metas[i].closest('[itemscope]') || document;
      const idMeta = scope.querySelector('meta[itemprop="identifier"], meta[itemprop="videoId"]');
      const id = String(idMeta?.getAttribute('content') || '');
      // ページ内で別の動画へ移ると、この欄が前の動画のまま残ることがある(2026-11-04 実機: 前のアーカイブの
      // 開始日が次の配信に移り「経過 376時間」)。どの動画の欄か確かめられないときは読まない。
      if (id) {
        if (id !== videoId) continue;
      } else {
        const urlEl = scope.querySelector('link[itemprop="url"], meta[itemprop="url"], link[itemprop="embedUrl"]');
        const url = String(urlEl?.getAttribute('href') || urlEl?.getAttribute('content') || '');
        if (!videoId || !url.includes(videoId)) continue;
      }
      const ms = Date.parse(String(metas[i].getAttribute('content') || ''));
      if (Number.isFinite(ms) && ms > 0 && ms <= Date.now()) return ms;
    }
  } catch {
    // ignore
  }
  return null;
}

// ページ内で別の配信へ移ったあとは、上の欄が新しい配信に変わらない。同じ YouTube の視聴ページを1回だけ
//   取り寄せて、中の "startTimestamp"(配信の開始時刻・秒まで)を読む(0.1.39・目安の「3 時間前」だと
//   見るたびに最大1時間ずれ、投げ一覧の時刻が16分動いた 2026-11-04 実機)。
/** @type {Map<string, number | null>} */
const fetchedStartedAt = new Map();
/** @param {string} videoId */
function fetchExactStartedAt(videoId) {
  if (!videoId || fetchedStartedAt.has(videoId)) return;
  fetchedStartedAt.set(videoId, null);
  void fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, { credentials: 'include' })
    .then((r) => (r.ok ? r.text() : ''))
    .then((html) => {
      const m = String(html || '').match(/"startTimestamp":"([^"]+)"/);
      const ms = m ? Date.parse(m[1]) : NaN;
      if (Number.isFinite(ms) && ms > 0 && ms <= Date.now()) fetchedStartedAt.set(videoId, ms);
    })
    .catch(() => {});
}

/**
 * ページ内で別の配信へ移ったあとは上の欄が新しい配信に変わらないので、説明欄の
 * 「3 時間前にライブ配信開始」を目安に使う(分・時間・日の単位まで。無いと「経過 1分」と出ていた)。
 * @returns {number | null}
 */
function readRelativeStartedAt() {
  try {
    const box = document.querySelector('ytd-watch-metadata #info-container, ytd-watch-info-text, ytd-watch-metadata #description');
    return relativeStreamStartedAtMs(String(box?.textContent || ''), Date.now());
  } catch {
    return null;
  }
}

/** ページに埋まった startTimestamp。見つかるまで毎回探す。 @type {number | null} */
let scriptStartedAt = null;
function readStartFromScripts() {
  if (scriptStartedAt) return scriptStartedAt;
  try {
    const nodes = document.querySelectorAll('script');
    for (let i = 0; i < nodes.length; i += 1) {
      const text = String(nodes[i].textContent || '');
      if (!text.includes('startTimestamp')) continue;
      const ms = startMsFromTimestampBlob(text, Date.now());
      if (ms) {
        scriptStartedAt = ms;
        return ms;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * 同時接続が読めなかったとき、「視聴中」の近くに何が書いてあったかを控える(次に直すための手がかり)。
 * chrome.storage.local の yt_viewer_probe に最後の1回分だけ置く。
 */
let lastProbeAt = 0;
function saveViewerProbe() {
  const now = Date.now();
  if (now - lastProbeAt < 30000) return;
  lastProbeAt = now;
  try {
    /** @type {string[]} */
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && found.length < 8) {
      const v = String(node.nodeValue || '');
      if (!/視聴中|watching/i.test(v)) continue;
      if (isInOtherVideos(node) || isInSkippedText(node)) continue;
      let box = node.parentElement;
      const path = [];
      for (let k = 0; k < 5 && box; k += 1) {
        path.push(`${box.tagName.toLowerCase()}${box.id ? `#${box.id}` : ''}`);
        if (k < 4 && box.parentElement) box = box.parentElement;
      }
      found.push(
        JSON.stringify({
          text: v.slice(0, 80),
          path: path.join('<'),
          visible: box ? visibleTextOf(box).slice(0, 200) : '',
          inner: box ? String(/** @type {HTMLElement} */ (box).innerText || '').slice(0, 200) : '',
        }),
      );
    }
    const labels = Array.from(document.querySelectorAll('[aria-label*="視聴"], [aria-label*="watching"]'))
      .slice(0, 8)
      .map((x) => String(x.getAttribute('aria-label') || '').slice(0, 80));
    void chrome.storage.local.set({ yt_viewer_probe: { at: now, url: String(window.location.href), found, labels } });
  } catch {
    // ignore
  }
}

/**
 * 視聴ページ（/watch・/live/ID）で配信タイトル・配信者名・アイコン・同時視聴数を拾って SW へ通知する。
 * YouTube はページ遷移しない（SPA）ので、どのページで読み込まれても動き、URL が視聴ページの時だけ送る。
 */
// 配信が終わると、説明欄が「4 時間前にライブ配信開始」→「4 時間前にライブ配信」に変わる。
//   そのとき視聴ページを1回取り寄せて "endTimestamp"(終わった時刻)を読む(経過が終わったあとも増え続けていた)。
/** @type {Map<string, number | null>} */
const fetchedEndedAt = new Map();
function pageSaysEnded() {
  try {
    const box = document.querySelector('ytd-watch-metadata #info-container, ytd-watch-info-text, ytd-watch-metadata #description');
    const text = String(box?.textContent || '').replace(/\s+/g, ' ');
    return /\d+\s*(分|時間|日)前にライブ配信(?!開始)/.test(text) || /Streamed live/i.test(text);
  } catch {
    return false;
  }
}
/** @param {string} videoId */
function endedAtFields(videoId) {
  if (!videoId || !pageSaysEnded()) return {};
  const got = fetchedEndedAt.get(videoId);
  if (got) return { endedAt: got };
  if (fetchedEndedAt.has(videoId)) return {};
  fetchedEndedAt.set(videoId, null);
  void fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, { credentials: 'include' })
    .then((r) => (r.ok ? r.text() : ''))
    .then((html) => {
      const m = String(html || '').match(/"endTimestamp":"([^"]+)"/);
      const ms = m ? Date.parse(m[1]) : NaN;
      if (Number.isFinite(ms) && ms > 0 && ms <= Date.now()) fetchedEndedAt.set(videoId, ms);
      else fetchedEndedAt.delete(videoId); // まだ終わり時刻が載っていない→あとでもう一度
    })
    .catch(() => fetchedEndedAt.delete(videoId));
  return {};
}

/**
 * 開始時刻: ページの欄(正確)→取り寄せた視聴ページ(正確)→「N 時間前にライブ配信開始」(目安・approx)。
 * @param {string} videoId
 */
function startedAtFields(videoId) {
  const exact = readStreamStartedAt(videoId) || readStartFromScripts();
  if (exact) return { startedAt: exact };
  const fetched = fetchedStartedAt.get(videoId);
  if (fetched) return { startedAt: fetched };
  // 画面に「N 日前」が無くても、視聴ページの startTimestamp を取りに行く。
  // 取りに行かないと、記録を始めた時刻が経過になり、長い配信が「0分」になる。
  fetchExactStartedAt(videoId);
  const approx = readRelativeStartedAt();
  if (!approx) return {};
  return { startedAt: approx, startedAtApprox: true };
}

function setupWatchPageMetaObserver() {
  const sendMeta = () => {
    if (!isYtWatchLikeUrl(String(window.location.href || ''))) return;
    const videoId = resolveCurrentVideoId();
    if (!videoId) return;

    const titleEl = document.querySelector(
      'ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string',
    );
    const rawTitle =
      String(titleEl?.textContent || '').replace(/\s+/g, ' ').trim() ||
      String(document.title || '').replace(/\s*-\s*YouTube$/i, '').replace(/^\(\d+\)\s*/, '').trim();

    const ownerNameEl = document.querySelector(
      'ytd-watch-metadata #owner #channel-name a, #owner #channel-name a, ytd-video-owner-renderer #channel-name a, #upload-info #channel-name a',
    );
    const broadcasterName = String(ownerNameEl?.textContent || '').replace(/\s+/g, ' ').trim();

    let broadcasterChannelId = '';
    let broadcasterHandle = '';
    try {
      const links = document.querySelectorAll(
        'ytd-watch-metadata #owner a[href], #owner a[href], ytd-video-owner-renderer a[href]',
      );
      for (let i = 0; i < links.length && !broadcasterChannelId; i += 1) {
        const m = String(links[i].getAttribute('href') || '').match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
        if (m) broadcasterChannelId = m[1];
        const h = String(links[i].getAttribute('href') || '').match(/^\/(@[^/?#]+)/);
        if (h && !broadcasterHandle) broadcasterHandle = decodeURIComponent(h[1]);
      }
      if (!broadcasterChannelId) {
        const metaCh = document.querySelector('meta[itemprop="channelId"], meta[itemprop="identifier"][content^="UC"]');
        const c = String(metaCh?.getAttribute('content') || '');
        if (/^UC[A-Za-z0-9_-]{22}$/.test(c)) broadcasterChannelId = c;
      }
    } catch {
      // ignore
    }

    const viewers = readConcurrentViewers();
    safeSendMessage({
      type: 'YT_STREAM_META',
      payload: {
        videoId,
        title: rawTitle,
        broadcasterName,
        broadcasterChannelId,
        broadcasterHandle,
        broadcasterIconUrl: readBroadcasterIconUrl(),
        concurrentViewers: viewers,
        ...(viewers === null ? { viewersRead: false } : {}),
        sourceUrl: String(location.href || ''),
        ...startedAtFields(videoId),
        ...endedAtFields(videoId),
      },
    });
    if (viewers === null) saveViewerProbe();
  };

  sendMeta();
  setTimeout(sendMeta, 1500);
  setTimeout(sendMeta, 4000);
  setInterval(sendMeta, 5000);
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(sendMeta, 800);
    setTimeout(sendMeta, 2500);
  });
}

/**
 * チャット欄を「上位のチャット（トップチャット）」から「すべてのチャット」へ切り替える。
 * YouTube の上位チャットは一部のコメントを隠すので、記録・読み上げの取りこぼしになる。
 * メニューの並びは [上位, すべて] の順。2番目が選ばれていなければ押す。設定でオフにできる。
 */
function setupAutoAllChat() {
  let attempts = 0;
  let done = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const tryOnce = async () => {
    if (done || attempts >= 6) return;
    attempts += 1;
    let enabled = true;
    try {
      const got = await chrome.storage.local.get(AUTO_ALL_CHAT_KEY);
      enabled = got?.[AUTO_ALL_CHAT_KEY] !== false;
    } catch {
      // ignore
    }
    if (!enabled) {
      done = true;
      return;
    }
    const trigger = /** @type {HTMLElement | null} */ (
      document.querySelector(
        'yt-live-chat-header-renderer yt-sort-filter-sub-menu-renderer #trigger, yt-live-chat-header-renderer #trigger',
      )
    );
    if (!trigger) return;
    trigger.click();
    await sleep(350);
    const items = Array.from(
      document.querySelectorAll(
        'tp-yt-iron-dropdown tp-yt-paper-listbox a, tp-yt-iron-dropdown tp-yt-paper-listbox tp-yt-paper-item, yt-sort-filter-sub-menu-renderer tp-yt-paper-listbox a',
      ),
    ).filter((el) => /** @type {HTMLElement} */ (el).offsetParent !== null || el.closest('tp-yt-iron-dropdown'));
    // 同じ項目が a と paper-item の二重で拾われるのを除く
    const uniq = items.filter((el) => !items.some((o) => o !== el && o.contains(el)));
    if (uniq.length < 2) {
      trigger.click();
      return;
    }
    const allItem = /** @type {HTMLElement} */ (uniq[1]);
    const selected =
      allItem.classList.contains('iron-selected') ||
      allItem.getAttribute('aria-selected') === 'true' ||
      !!allItem.querySelector('.iron-selected, [aria-selected="true"]');
    if (selected) {
      trigger.click();
      done = true;
      return;
    }
    allItem.click();
    done = true;
  };

  setTimeout(tryOnce, 1500);
  setTimeout(tryOnce, 4000);
  setTimeout(tryOnce, 8000);
  setTimeout(tryOnce, 15000);
}

/**
 * チャット iframe（/live_chat, /live_chat_replay）でコメント要素を監視・収集する。
 */
function setupLiveChatObserver() {
  /** @type {Set<string>} */
  const seenIds = new Set();
  /** @type {Set<string>} */
  const seenWithIconIds = new Set();
  /** @type {any[]} */
  let pendingBatch = [];
  /** @type {any} */
  let flushTimer = null;
  let lastFilterLabel = '';
  // ★チャット欄の URL(/live_chat?continuation=…)には動画IDが無く、親のページの URL から決めている。
  //   YouTube は別の配信へ移ってもページを読み直さず、チャット欄はしばらく前の配信の中身のまま残るので、
  //   そのまま送ると前の配信のコメント(スパチャ)が新しい配信の記録に混ざる(0.1.12 までの実際の事故)。
  //   → 動画IDが変わった瞬間に、それまでの送り待ちは前の動画IDで送り切り、その時点で画面にある要素は
  //     前の配信のものとして二度と送らない。切り替え直後に増えた要素は少し待って、まだ画面にあれば送る。
  let boundVideoId = resolveCurrentVideoId();
  /** @type {WeakSet<Element>} */
  const staleEls = new WeakSet();
  let switchGraceUntil = 0;
  const SWITCH_GRACE_MS = 4000;
  // 0.1.1905: 自分の送ったコメントは仮の行→本物の行に id が変わるので、同じコメントを2回記録・2回読み上げていた
  //   (2026-11-06 りんく実機「2回うったことになっている」)。差し替えは1件として扱う(ytChatEchoDedupe.js)。
  const echoDedupe = createYtEchoDedupe();
  let echoDropTotal = 0;
  /** @type {WeakSet<Element>} 一度「少し待って見直す」にした行 */
  const echoWaited = new WeakSet();
  /** @type {any[]} */
  let echoDropRecent = [];

  const rememberId = (id) => {
    seenIds.add(id);
    if (seenIds.size > MAX_SEEN_IDS) {
      const first = seenIds.values().next().value;
      if (first) seenIds.delete(first);
    }
  };

  const rememberIconId = (id) => {
    seenWithIconIds.add(id);
    if (seenWithIconIds.size > MAX_SEEN_IDS) {
      const first = seenWithIconIds.values().next().value;
      if (first) seenWithIconIds.delete(first);
    }
  };

  const flushBatch = () => {
    flushTimer = null;
    const filterLabel = readChatFilterLabel();
    if (pendingBatch.length === 0 && filterLabel === lastFilterLabel) return;
    lastFilterLabel = filterLabel;

    const items = pendingBatch;
    pendingBatch = [];
    if (!boundVideoId || retired) return;
    safeSendMessage({
      type: 'YT_CHAT_ITEMS',
      payload: {
        videoId: boundVideoId,
        chatFilterLabel: filterLabel,
        items,
      },
    });
  };

  const queueFlush = () => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flushBatch, 150);
  };

  // ★0.1.36: 4秒待つだけでは、前の配信のチャット欄(この文書)が4秒を過ぎても前の配信のコメントを流し続け、
  //   それが新しい配信の記録に入っていた(初音ミクの配信の人が DaiGo さんの配信の記録に二十数件)。
  //   → 親ページの動画IDが変わったら、このチャット欄の文書はもう送らない(引退)。新しい配信のチャットは
  //     YouTube が新しいチャット欄の文書として読み込み、そちらの記録係が最初から送る。
  //     例外: このチャット欄の文書自身の URL が変わった(同じ文書のまま新しい配信のチャットへ移った)ときだけ、
  //     その時点の要素を前の配信のものとして外し、少し待ってから新しい動画IDで送り直す。
  let retired = false;
  let retiredHref = '';

  // 計器: チャット欄の配信と親のページの配信が食い違った回数(yt_diag_chat_frame_vid)。見た目は変えない。
  let mismatchCount = 0;
  let lastMismatchKey = '';
  const noteFrameTopMismatch = () => {
    try {
      const frameVid = chatFrameOwnVideoId();
      let topVid = '';
      try {
        topVid = window.top && window.top !== window ? parseYtVideoIdFromUrl(String(window.top.location.href || '')) : '';
      } catch {
        topVid = '';
      }
      if (!frameVid || !topVid || frameVid === topVid) return;
      const key = `${frameVid}>${topVid}`;
      if (key === lastMismatchKey) return;
      lastMismatchKey = key;
      mismatchCount += 1;
      if (!chrome?.runtime?.id) return;
      void chrome.storage.local
        .set({ yt_diag_chat_frame_vid: { at: Date.now(), frameVid, topVid, count: mismatchCount } })
        .catch(() => {});
    } catch {
      /* 計器は本体を止めない */
    }
  };

  const markAllStale = () => {
    try {
      const nodes = document.querySelectorAll(CHAT_ITEM_SELECTOR);
      for (let i = 0; i < nodes.length; i += 1) staleEls.add(nodes[i]);
    } catch {
      // fail-soft
    }
  };

  /** 動画IDが変わったかを見て、変わっていたら区切る */
  const checkVideoSwitch = () => {
    const vid = resolveCurrentVideoId();
    noteFrameTopMismatch();
    // チャット欄自身の印で配信が分かるときは、その印が変わった(=このチャット欄が別の配信のチャットに移った)ときだけ区切る。
    //   親のページだけが別の配信へ移っても、このチャット欄の中身はこのチャット欄の配信のものとして記録し続ける。
    if (chatFrameOwnVideoId()) {
      if (vid && vid !== boundVideoId) {
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (pendingBatch.length) flushBatch(); // 前の動画IDで送り切る
        markAllStale();
        retired = false;
        boundVideoId = vid;
        switchGraceUntil = Date.now() + SWITCH_GRACE_MS;
      }
      return;
    }
    if (retired) {
      const href = String(window.location.href || '');
      if (vid && vid !== boundVideoId && href !== retiredHref) {
        markAllStale();
        retired = false;
        boundVideoId = vid;
        switchGraceUntil = Date.now() + SWITCH_GRACE_MS;
      }
      return;
    }
    if (!vid || vid === boundVideoId) return;
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pendingBatch.length) flushBatch(); // 前の動画IDで送り切る
    markAllStale();
    retired = true;
    retiredHref = String(window.location.href || '');
  };

  // アーカイブのチャットのリプレイでは、コメントの時刻表示は「動画の中の経過時間」(例 1:23:45)で時計ではない。
  //   記録に印を付け、入口(ytNicoShim)が時計として読まないようにする。
  const isReplay = String(window.location.pathname || '').startsWith('/live_chat_replay');

  const inspectElement = (el, retryCount = 0) => {
    if (!el || typeof el.tagName !== 'string') return;
    checkVideoSwitch();
    if (retired) return;
    if (staleEls.has(el)) return;
    if (el.isConnected === false) return;
    // チャット欄の上の「固定されたメッセージ」(バナー)は、チャットに出た元のコメントの写し。
    //   開閉のたびに作り直されるので、記録すると同じコメントが何度も新しく入る(2026-11-04 りんく実機)。
    if (typeof el.closest === 'function' && el.closest('yt-live-chat-banner-renderer, yt-live-chat-banner-manager')) return;
    const waitMs = switchGraceUntil - Date.now();
    if (waitMs > 0) {
      setTimeout(() => inspectElement(el, retryCount), waitMs + 50);
      return;
    }
    const rawId = String(el.getAttribute?.('id') || '').trim();
    if (rawId && seenWithIconIds.has(rawId)) return;

    const parsed = parseYtChatElement(el);
    if (!parsed) {
      if (retryCount < 2) {
        setTimeout(() => inspectElement(el, retryCount + 1), 150);
      }
      return;
    }

    if (!seenIds.has(parsed.id)) {
      const echo = !isReplay && parsed.kind === 'text' ? echoDedupe.classify(parsed, el, { waited: echoWaited.has(el) }) : 'new';
      if (echo === 'wait') {
        echoWaited.add(el);
        setTimeout(() => inspectElement(el, retryCount), 1200);
        return;
      }
      rememberId(parsed.id);
      if (echo === 'echo') {
        rememberIconId(parsed.id); // 同じコメントの差し替え: 送らず、後で顔が入っても送り直さない
        echoDropTotal += 1;
        echoDropRecent = [...echoDropRecent, { at: Date.now(), who: String(parsed.name || '').slice(0, 40), text: String(parsed.text || '').slice(0, 40), id: String(parsed.id).slice(0, 60) }].slice(-10);
        try {
          void chrome.storage.local.set({ yt_diag_echo_drop: { at: Date.now(), total: echoDropTotal, recent: echoDropRecent } }).catch(() => {});
        } catch {
          /* 計器は本体を止めない */
        }
        return;
      }
      if (parsed.iconUrl) {
        rememberIconId(parsed.id);
      } else if (retryCount < 3) {
        setTimeout(() => inspectElement(el, retryCount + 1), 200 * (retryCount + 1));
      }
      pendingBatch.push(isReplay ? { ...parsed, replay: true, seenAt: Date.now() } : { ...parsed, seenAt: Date.now() });
      queueFlush();
      return;
    }

    // 初回取得時に遅延ロードで空だったアイコン URL が後から入った場合は補完送信する
    if (parsed.iconUrl && !seenWithIconIds.has(parsed.id)) {
      rememberIconId(parsed.id);
      pendingBatch.push(isReplay ? { ...parsed, replay: true, seenAt: Date.now() } : { ...parsed, seenAt: Date.now() });
      queueFlush();
    } else if (!parsed.iconUrl && retryCount < 3) {
      setTimeout(() => inspectElement(el, retryCount + 1), 250 * (retryCount + 1));
    } else if (!parsed.iconUrl) {
      watchLateIcon(el);
    }
  };

  // チャット欄の下の方(画面に出ていない行)は、顔の img に 1×1 の透明な絵が入っていて、
  //   画面に出たときに本物の顔(yt4.ggpht.com)に変わる。数回の読み直しでは間に合わない(ギフトの送り主で実例)。
  //   顔の src が変わったら読み直し、本物の顔が取れたら補完送信する(上の「後から入った場合」の枝)。
  /** @type {WeakSet<Element>} */
  const lateIconWatched = new WeakSet();
  /** @param {Element} el */
  const watchLateIcon = (el) => {
    if (lateIconWatched.has(el) || typeof MutationObserver !== 'function') return;
    lateIconWatched.add(el);
    const mo = new MutationObserver(() => {
      const p = parseYtChatElement(el);
      if (p && p.iconUrl) {
        mo.disconnect();
        inspectElement(el, 3);
      }
    });
    mo.observe(el, { attributes: true, subtree: true, attributeFilter: ['src', 'data-nl-author-photo'] });
    setTimeout(() => mo.disconnect(), 10 * 60 * 1000);
  };

  const scanAllExisting = (root = document) => {
    try {
      const nodes = root.querySelectorAll(CHAT_ITEM_SELECTOR);
      for (let i = 0; i < nodes.length; i += 1) {
        inspectElement(nodes[i], 0);
      }
      queueFlush();
    } catch {
      // fail-soft
    }
  };

  scanAllExisting(document);

  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i += 1) {
      const added = mutations[i].addedNodes;
      if (!added) continue;
      for (let j = 0; j < added.length; j += 1) {
        const node = /** @type {any} */ (added[j]);
        if (!node || node.nodeType !== 1) continue;
        if (typeof node.matches === 'function' && node.matches(CHAT_ITEM_SELECTOR)) {
          inspectElement(node, 0);
        }
        if (typeof node.querySelectorAll === 'function') {
          const children = node.querySelectorAll(CHAT_ITEM_SELECTOR);
          for (let k = 0; k < children.length; k += 1) {
            inspectElement(children[k], 0);
          }
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // フィルタ切替（「トップチャット」⇄「すべてのチャット」）の定期検知
  setInterval(() => {
    scanAllExisting(document);
  }, 2000);
}

/**
 * サイドパネルからのコメント送信を受けて、YouTube 本体のチャット入力欄に書いて送信ボタンを押す。
 * ログイン・送信の可否は YouTube 本体の判断に任せる（拡張は代わりに打つだけ）。
 */
function setupCommentSendBridge() {
  if (String(window.location.pathname || '').startsWith('/live_chat_replay')) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'YT_SEND_COMMENT_TO_FRAME') return undefined;
      const want = String(msg.videoId || '');
      const mine = resolveCurrentVideoId();
      if (want && mine && want !== mine) return undefined;
      (async () => {
        const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!text) return { ok: false, reason: 'empty' };
        const INPUT_SEL =
          'yt-live-chat-text-input-field-renderer #input[contenteditable], #input.yt-live-chat-text-input-field-renderer, yt-live-chat-message-input-renderer #input[contenteditable]';
        let input = /** @type {HTMLElement | null} */ (document.querySelector(INPUT_SEL));
        // 0.1.1912: チャット欄を読み込み直した直後は入力欄がまだ無いことがある。少しだけ待ってから理由を判定する。
        for (let i = 0; !input && i < 6; i += 1) {
          await sleep(250);
          input = /** @type {HTMLElement | null} */ (document.querySelector(INPUT_SEL));
        }
        if (!input) {
          // 0.1.109: ログインしていないチャットは入力欄の部品ごと無く、下の帯(#input-panel)に「ログインしてチャットを始める」の
          //   リンクだけがある(PC の別ブラウザで確認 2026-11-05)。
          // 0.1.1912: メンバー限定・登録者限定の帯(ログインしていても出る)を「ログインしていない」と言っていたのを分ける。
          const block = classifyYtChatInputBlock(document);
          try {
            chrome.storage.local.set({
              yt_diag_comment_send_fail: {
                at: Date.now(),
                videoId: mine,
                reason: block.reason,
                note: block.note,
                tags: [...new Set([...document.querySelectorAll('#input-panel *, yt-live-chat-restricted-participation-renderer')].map((el) => el.localName))]
                  .filter((t) => t.includes('-'))
                  .slice(0, 30),
              },
            });
          } catch {
            // 記録できなくても続ける
          }
          return { ok: false, reason: block.reason, note: block.note };
        }
        input.focus();
        try {
          document.execCommand('selectAll', false);
          document.execCommand('delete', false);
          document.execCommand('insertText', false, text);
        } catch {
          // ignore
        }
        if (String(input.textContent || '').trim() !== text) {
          input.textContent = text;
          input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        }
        await sleep(120);
        const btn = /** @type {HTMLButtonElement | null} */ (
          document.querySelector(
            'yt-live-chat-message-input-renderer #send-button button, #send-button yt-button-renderer button, #send-button button',
          )
        );
        if (!btn) return { ok: false, reason: 'no-send-button' };
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
          return { ok: false, reason: 'send-disabled' };
        }
        btn.click();
        await sleep(400);
        const left = String(input.textContent || '').trim();
        return { ok: left === '' || left !== text, reason: left === text ? 'still-in-box' : '' };
      })()
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, reason: String(e) }));
      return true;
    });
  } catch {
    // context invalidated
  }
}

/**
 * 0.1.113: 会場の「💲 スーパーチャット」ボタンから、YouTube 本体のスーパーチャットの窓を開く(ニコ生版 v0.1.1870 のギフトと同じ)。
 *   拡張はボタンを押すだけで、金額の選択・支払いは YouTube 本体の画面で利用者がする。
 *   ボタンはログインしていて、その配信でスーパーチャットが使えるときだけある。無ければ理由を返す(会場が「見つかりません」と出す)。
 */
/**
 * 0.1.120: スーパーチャットの画面を開いたあと3分間、チャットに流れた有料メッセージ(送り主・金額)を記録する。
 *   拡張は画面を開くだけなので、本当に送れたかは「チャットに有料メッセージが出たか」でしか分からない
 *   (りんく 2026-11-05「送れたはず」を記録で確かめられなかった)。記録先は yt_diag_superchat_paid。
 * @param {string} videoId
 */
function watchPaidAfterSuperChatOpen(videoId) {
  const list = document.querySelector('yt-live-chat-item-list-renderer #items') || document.querySelector('yt-live-chat-item-list-renderer');
  if (!list || typeof MutationObserver !== 'function') return;
  const rec = { openAt: Date.now(), videoId, paid: /** @type {{ at: number, author: string, amount: string, text: string }[]} */ ([]) };
  const text = (/** @type {Element} */ el, /** @type {string} */ sel) => String(el.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const save = () => {
    try { chrome.storage.local.set({ yt_diag_superchat_paid: rec }); } catch { /* 記録できなくても続ける */ }
  };
  save();
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element) || !/^yt-live-chat-paid-(message|sticker)-renderer$/.test(n.localName) || rec.paid.length >= 10) continue;
        rec.paid.push({ at: Date.now(), author: text(n, '#author-name'), amount: text(n, '#purchase-amount, #purchase-amount-chip'), text: text(n, '#message') });
        save();
      }
    }
  });
  mo.observe(list, { childList: true, subtree: true });
  setTimeout(() => mo.disconnect(), 180000);
}

function setupSuperChatOpenBridge() {
  if (String(window.location.pathname || '').startsWith('/live_chat_replay')) return;
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'YT_OPEN_SUPERCHAT_IN_FRAME') return undefined;
      const want = String(msg.videoId || '');
      const mine = resolveCurrentVideoId();
      if (want && mine && want !== mine) return undefined;
      try {
        // 先に未ログインを見る(ログインしていないとスーパーチャットのボタン自体が無い)。
        const panel = document.querySelector('#input-panel');
        const signedOut =
          !!panel?.querySelector('a[href*="ServiceLogin"], a[href*="accounts.google.com"]') ||
          /ログインしてチャット|Sign in to chat/i.test(String(panel?.textContent || ''));
        if (signedOut) {
          sendResponse({ ok: false, reason: 'not-signed-in' });
          return undefined;
        }
        // 0.1.114: 探すのは入力欄の帯(#input-panel・入力欄の部品)の中だけ。チャット全体を探すと、
        //   他の人のスーパーチャットに付く「この Super Chat に返信します」(#reply-button)を押してしまう(PC 実測 2026-11-05)。
        const scopes = [
          ...document.querySelectorAll('yt-live-chat-message-input-renderer'),
          ...(panel ? [panel] : []),
        ];
        const labelOf = (/** @type {Element} */ el) =>
          String(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        /** @type {HTMLElement[]} */
        const all = [];
        for (const scope of scopes) {
          for (const el of scope.querySelectorAll('button, [role="button"]')) {
            if (el.closest('#reply-button, yt-live-chat-reply-button-view-model, yt-live-chat-item-list-renderer')) continue;
            if (!all.includes(/** @type {HTMLElement} */ (el))) all.push(/** @type {HTMLElement} */ (el));
          }
        }
        // 0.1.115: りんく実機(ログイン中)で「押すと会場がしまうだけ」=何かのボタンは押せたが画面が開かなかった。
        //   名前(aria-label)でスーパーチャット/購入のボタンを優先し、無ければ #product-picker の中。押したら開いたかを見る。
        // 0.1.116: りんく実機(ログイン中)の記録=日本語のボタン名は「@<チャンネル> をサポート」(英語は Support)。
        const SC_RE = /をサポート|^Support|Super ?Chat|スーパーチャット|Super ?Sticker|スーパーステッカー|購入|Buy|\$|￥|¥/i;
        const btn =
          all.find((el) => SC_RE.test(labelOf(el))) ||
          all.find((el) => !!el.closest('#product-picker')) ||
          null;
        const diag = {
          at: Date.now(),
          videoId: mine,
          buttons: all.slice(0, 20).map((el) => ({
            label: labelOf(el),
            id: el.id || '',
            parent: el.parentElement?.closest('[id]')?.id || '',
            tag: el.parentElement?.localName || '',
            w: Math.round(el.getBoundingClientRect().width),
          })),
          picked: btn ? labelOf(btn) || btn.closest('[id]')?.id || '?' : '',
          opened: /** @type {string[]} */ ([]),
          changed: /** @type {string[]} */ ([]),
          tag: '',
          rect: /** @type {number[]} */ ([]),
        };
        try { watchPaidAfterSuperChatOpen(mine); } catch { /* 計器が動かなくても開く */ }
        const saveDiag = () => {
          try {
            chrome.storage.local.set({ yt_diag_superchat: diag });
          } catch {
            // 記録できなくても続ける
          }
        };
        // 0.1.117: すでにサポートの画面が開いている(入力欄の帯に「閉じる」が見えている)なら押さずに開いた扱い。
        //   押すと見えていないボタン(幅0)を押してしまう(りんく実機の2回目の記録)。
        const closeBtn = scopes
          .map((sc) => sc.querySelector('#close-button button, #close-button'))
          .find((el) => el && el.getBoundingClientRect().width > 0);
        if (closeBtn) {
          diag.picked = '(already-open)';
          saveDiag();
          sendResponse({ ok: true });
          return undefined;
        }
        if (btn && !(btn.getBoundingClientRect().width > 0)) diag.picked += '(width0)';
        if (!btn) {
          saveDiag();
          sendResponse({ ok: false, reason: 'no-superchat-button' });
          return undefined;
        }
        // 0.1.116: 押したあとに増えた「見える大きめの部品」を全部拾う(購入画面の部品名を決め打ちしない)。
        //   りんく実機で opened=[] だった=決め打ちの名前に当たらなかったか、押せていなかった。
        /** @type {Set<Element>} */
        const added = new Set();
        const mo = new MutationObserver((recs) => {
          for (const rec of recs) {
            if (rec.type === 'childList') rec.addedNodes.forEach((n) => n instanceof Element && added.add(n));
            else if (rec.target instanceof Element) added.add(rec.target);
          }
        });
        try {
          mo.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['hidden', 'opened', 'aria-hidden', 'style', 'aria-expanded'],
          });
        } catch {
          // 見張れなくても押すのは試す
        }
        const shown = (/** @type {Element} */ el) => {
          if (el.closest('yt-live-chat-item-list-renderer')) return false;
          const r = el.getBoundingClientRect();
          if (!(r.width >= 120 && r.height >= 60)) return false;
          const cs = getComputedStyle(el);
          return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity || 1) > 0.05;
        };
        // 0.1.117: 0.1.116 の down/up+click は開いて閉じる(2回押し)おそれがあるので click() 1回に戻す
        //   (0.1.115 の記録で、1回目の click で入力欄の帯が「閉じる」ボタンつきの画面に替わっていた)。
        const tgt = /** @type {HTMLElement} */ (btn.matches('button') ? btn : btn.querySelector('button') || btn);
        const r0 = tgt.getBoundingClientRect();
        diag.tag = tgt.localName;
        diag.rect = [Math.round(r0.left), Math.round(r0.top), Math.round(r0.width), Math.round(r0.height)];
        tgt.click();
        (async () => {
          for (let i = 0; i < 12; i += 1) {
            await new Promise((r) => setTimeout(r, 150));
            const fresh = [...added].filter((el) => el.isConnected && shown(el) && !el.contains(btn));
            // 入力欄の帯が「閉じる」つきのサポート画面に替わったのも開いた扱い(0.1.115 の記録)。
            const closeNow = scopes
              .map((sc) => sc.querySelector('#close-button button, #close-button'))
              .find((el) => el && el.getBoundingClientRect().width > 0);
            if (closeNow) fresh.push(closeNow);
            if (fresh.length) {
              mo.disconnect();
              diag.opened = fresh.slice(0, 6).map((el) => el.localName + (el.id ? '#' + el.id : ''));
              saveDiag();
              return { ok: true };
            }
          }
          mo.disconnect();
          diag.changed = [...added].slice(0, 12).map((el) => el.localName + (el.id ? '#' + el.id : ''));
          diag.unconfirmed = true;
          saveDiag();
          // 0.1.118: 正しいボタンを押せたなら、開いたのを見つけられなくても成功扱い(会場を戻すと開いた画面を隠してしまう・りんく 11-05)。
          //   会場へは「▲ 会場に戻る」で戻れる。見つけられなかった記録は yt_diag_superchat.unconfirmed に残す。
          return { ok: true, unconfirmed: true };
        })()
          .then((r) => sendResponse(r))
          .catch((e) => sendResponse({ ok: false, reason: String(e) }));
        return true;
      } catch (e) {
        sendResponse({ ok: false, reason: String(e) });
      }
      return undefined;
    });
  } catch {
    // context invalidated
  }
}

/**
 * 視聴ページの動画を1枚の PNG にする（📷 スクショ）。広告中や DRM 動画では失敗することがある。
 */
function setupVideoFrameCapture() {
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'YT_CAPTURE_FRAME_IN_PAGE') return undefined;
      try {
        const video = /** @type {HTMLVideoElement | null} */ (
          document.querySelector('#movie_player video.html5-main-video, video.html5-main-video, #movie_player video')
        );
        if (!video || !video.videoWidth) {
          sendResponse({ ok: false, reason: 'no-video' });
          return undefined;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          sendResponse({ ok: false, reason: 'no-canvas' });
          return undefined;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        sendResponse({ ok: true, dataUrl: canvas.toDataURL('image/png'), currentTime: video.currentTime });
      } catch (e) {
        sendResponse({ ok: false, reason: String(e) });
      }
      return undefined;
    });
  } catch {
    // context invalidated
  }
}

/**
 * YouTube の「トップファン」(チャット上の XP 順位)を読む。順位表はチャット欄でトップファンの画面を
 * 一度開くまで中身が無い(開いたあとは閉じても残る)。拡張からは押さず、中身があるときだけ読む。
 * 行: ytvl-live-leaderboard-item-view-model。文字は順位「1」・名前「@handle」・「84,480 XP」(2026-11-03 実ページで確認)。
 */
function setupLeaderboardReader() {
  let lastSig = '';
  const read = () => {
    const videoId = resolveCurrentVideoId();
    if (!videoId) return;
    /** @type {{ rank: number, name: string, xp: number, iconUrl: string }[]} */
    const rows = [];
    try {
      const items = document.querySelectorAll('ytvl-live-leaderboard-item-view-model');
      for (let i = 0; i < items.length; i += 1) {
        const el = items[i];
        const texts = Array.from(el.querySelectorAll('span.ytAttributedStringHost, span'))
          .map((x) => String(x.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        const rankText = texts.find((t) => /^\d{1,3}$/.test(t));
        const name = texts.find((t) => /^@\S+$/.test(t)) || '';
        const xpText = texts.find((t) => /^[0-9,]+\s*XP$/i.test(t));
        if (!rankText || !name || !xpText) continue; // 自分の「50+」の行などは飛ばす
        const img = el.querySelector('img');
        const iconUrl = String(img?.getAttribute('src') || '');
        rows.push({
          rank: Number(rankText),
          name,
          xp: Number(xpText.replace(/[^0-9]/g, '')) || 0,
          iconUrl: /^https:\/\//.test(iconUrl) ? iconUrl : '',
        });
      }
    } catch {
      return;
    }
    if (!rows.length) return;
    const sig = rows.map((r) => `${r.rank}:${r.name}:${r.xp}`).join('|');
    if (sig === lastSig) return;
    lastSig = sig;
    safeSendMessage({ type: 'YT_LEADERBOARD', payload: { videoId, rows } });
  };
  setInterval(read, 5000);
  setTimeout(read, 1500);
  // 一度だけ、拡張がトップファンを開いて50位まで読み込ませ、すぐ閉じる(毎回手で開かなくて済むように)
  setTimeout(() => void openLeaderboardOnce(read), 6000);
}

/**
 * トップファンの入口(チャット上の「◯XP」ボタン)を押して順位表を読み込ませ、下まで送ってから「戻る」で閉じる。
 * 順位表は閉じても中身が残るので、ページを開いて1回だけでよい。行が既にあるときは何もしない。
 * @param {() => void} read
 */
async function openLeaderboardOnce(read) {
  const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (document.querySelector('ytvl-live-leaderboard-item-view-model')) return;
    const btn = document.querySelector('ytvl-live-viewer-leaderboard-chat-entry-point-view-model button');
    if (!(btn instanceof HTMLElement)) return;
    btn.click();
    await sleep(1500);
    const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="PAlive_viewer_leaderboard"]');
    const box = panel?.querySelector('#content');
    for (let i = 0; i < 6 && box instanceof HTMLElement; i += 1) {
      box.scrollTop = box.scrollHeight;
      await sleep(400);
    }
    read();
    const back = panel?.querySelector('button[aria-label="戻る"], button[aria-label="Back"]');
    if (back instanceof HTMLElement) back.click();
  } catch {
    // 開けなくても記録には関係ない
  }
}

/**
 * 拡張が新しい版に入れ替わると、視聴タブは読み込み直される(古いプログラムが切れて記録が止まるのを防ぐため)。
 * アーカイブは読み込み直すと URL の &t= の位置(または最初)に戻ってしまい、同じ所のチャットを流し直すので
 * 記録が増えなくなる(2026-11-04 実機: 4,391 件のまま止まった)。読み込み直す前に見ていた位置へ戻す。
 * 生配信(長さが決まっていない動画)は触らない。
 */
function setupResumeAfterReload() {
  const KEY = 'nl_yt_resume_v1';
  const MAX_AGE_MS = 3 * 60 * 1000;
  const videoEl = () => {
    const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
    return v instanceof HTMLVideoElement ? v : null;
  };
  const isArchive = (/** @type {HTMLVideoElement} */ v) => Number.isFinite(v.duration) && v.duration > 0;
  let resumed = false;
  /** @type {{ vid?: string, t?: number, at?: number } | null} */
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    saved = null;
  }
  const tick = () => {
    const vid = parseYtVideoIdFromUrl(String(location.href || ''));
    const v = videoEl();
    if (!vid || !v) return;
    if (!resumed) {
      resumed = true;
      const t = Number(saved?.t || 0);
      const fresh = saved && saved.vid === vid && Date.now() - Number(saved.at || 0) < MAX_AGE_MS;
      if (fresh && t > 5 && isArchive(v) && t < v.duration - 5 && Math.abs(v.currentTime - t) > 5) {
        try {
          v.currentTime = t;
        } catch {
          // 戻せなくても再生は続く
        }
        return;
      }
    }
    if (!isArchive(v) || v.currentTime < 1) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ vid, t: Math.floor(v.currentTime), at: Date.now() }));
    } catch {
      // 保存できなくても記録には関係ない
    }
  };
  setInterval(tick, 3000);
}

/**
 * 配信が終わったあと、アーカイブのチャット(リプレイ)を裏で読んで記録の抜けを埋める(0.1.41)。
 * 動画は再生しない。background に「次に埋める配信」を聞き、あればこのタブが YouTube に直接問い合わせる
 * (同じ youtube.com なのでログインのまま読める)。チャットのコメントの id は画面から記録したものと同じなので、
 * 同じものは background が飛ばし、無いものだけ足す。読み上げはしない。
 */
function setupArchiveBackfillRunner() {
  let running = false;
  /** @param {any} msg @returns {Promise<any>} */
  const ask = (msg) =>
    new Promise((resolve) => {
      try {
        if (!chrome?.runtime?.id) return resolve(null);
        chrome.runtime.sendMessage(msg, (res) => {
          void chrome.runtime.lastError;
          resolve(res || null);
        });
      } catch {
        resolve(null);
      }
    });
  const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

  /** @param {string} videoId */
  const runOne = async (videoId) => {
    let calls = 0;
    let added = 0;
    try {
      const html = await (await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, { credentials: 'include' })).text();
      const clientVersion = (html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) || [])[1] || '';
      const apiKey = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1] || '';
      // ★ページの初めの方に部品の名前だけが並ぶ一覧("liveChatRenderer","…")があるので、中身の付いた所を探す(0.1.43)
      const at = html.indexOf('"liveChatRenderer":{');
      const tail = at >= 0 ? html.slice(at, at + 20000) : '';
      let cont = (tail.match(/"reloadContinuationData":\{"continuation":"([^"]+)"/) || [])[1] || '';
      if (!cont || !/"isReplay":true/.test(tail) || !clientVersion) {
        // 終わった直後はアーカイブの処理中でチャットがまだ無い→あとで試し直す
        await ask({ type: 'YT_BACKFILL_DONE', payload: { videoId, status: 'not_ready', calls, added, reason: cont ? 'no_replay' : 'no_continuation' } });
        return;
      }
      const context = { client: { clientName: 'WEB', clientVersion, hl: 'ja', gl: 'JP' } };
      const seen = new Set();
      let emptyStreak = 0;
      while (cont && calls < 3000) {
        if (seen.has(cont)) break;
        seen.add(cont);
        calls += 1;
        const url = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay?prettyPrint=false${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''}`;
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context, continuation: cont }),
        });
        if (!res.ok) throw new Error(`http_${res.status}`);
        const { items, next } = ytReplayResponseToRecords(await res.json());
        if (items.length) {
          emptyStreak = 0;
          for (let i = 0; i < items.length; i += 200) {
            const r = await ask({ type: 'YT_BACKFILL_ITEMS', payload: { videoId, items: items.slice(i, i + 200) } });
            added += Number(r?.added || 0);
          }
        } else if (++emptyStreak > 20) break;
        cont = next;
        await sleep(700); // YouTube に負担をかけないよう間をあける
      }
      await ask({ type: 'YT_BACKFILL_DONE', payload: { videoId, status: 'done', calls, added } });
    } catch (err) {
      await ask({ type: 'YT_BACKFILL_DONE', payload: { videoId, status: 'error', calls, added, reason: String(err) } });
    }
  };

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const job = await ask({ type: 'YT_BACKFILL_NEXT' });
      if (job && job.videoId) await runOne(String(job.videoId));
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 30_000);
  setInterval(() => void tick(), 120_000);
}

function init() {
  const path = String(window.location.pathname || '');
  if (path.startsWith('/live_chat')) {
    setupLiveChatObserver();
    // アーカイブのリプレイも「上位のチャットのリプレイ」⇄「チャットのリプレイ」の2択で、2つ目が全部(生配信と同じ並び)
    setupAutoAllChat();
    setupCommentSendBridge();
    setupSuperChatOpenBridge();
    setupLeaderboardReader();
  } else if (window.top === window) {
    // 最上位の YouTube ページ（トップから視聴ページへ遷移しても動くよう、どのページでも待機）
    setupWatchPageMetaObserver();
    setupVideoFrameCapture();
    setupResumeAfterReload();
    setupArchiveBackfillRunner();
    // 縦長の配信(ショートのライブ)などでは、トップファンの画面がチャット欄の中ではなく最上位のページに出る
    //   (2026-11-04 実機 JaZeZj3hZhE: トップファンが出ているのに「スパチャの合計順」になっていた)。こちらでも読む。
    setupLeaderboardReader();
  }
}

init();
