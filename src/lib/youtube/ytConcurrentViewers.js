// ytConcurrentViewers.js — YouTube の同時視聴者数を、ページの埋め込みと updated_metadata から読む（純関数）
// 画面に「N 人が視聴中」が描かれる前でも、ytInitialData / videoViewCountRenderer には数が入っている。

import { extractYtWatchConcurrentViewersFromText } from './ytChatParse.js';

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAX_NODES = 80_000;

/** @param {unknown} v */
function isVideoId(v) {
  return typeof v === 'string' && VIDEO_ID_RE.test(v);
}

/**
 * viewCount の表示文（simpleText / runs）を1本の文字列にする。
 * @param {any} viewCount
 */
function viewCountText(viewCount) {
  if (!viewCount || typeof viewCount !== 'object') return '';
  if (typeof viewCount.simpleText === 'string') return viewCount.simpleText;
  if (Array.isArray(viewCount.runs)) {
    return viewCount.runs.map((/** @type {any} */ r) => String(r?.text || '')).join('');
  }
  return '';
}

/**
 * videoViewCountRenderer から同時視聴者数を取る。
 * 総再生回数（ライブ配信でない originalViewCount）は同時視聴として使わない。
 * @param {any} renderer
 * @returns {number | null}
 */
export function concurrentFromVideoViewCountRenderer(renderer) {
  if (!renderer || typeof renderer !== 'object') return null;
  const text = viewCountText(renderer.viewCount);
  const fromText = extractYtWatchConcurrentViewersFromText(text);
  if (fromText !== null) return fromText;
  const live = renderer.isLive === true || /視聴中|watching/i.test(text);
  if (!live) return null;
  const raw = renderer.originalViewCount;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 50_000_000) return null;
  return Math.floor(n);
}

/**
 * @param {any} data
 * @returns {string}
 */
export function videoIdFromYtInitialData(data) {
  const direct = data?.currentVideoEndpoint?.watchEndpoint?.videoId || data?.videoId;
  return isVideoId(direct) ? direct : '';
}

/**
 * 木を歩き、wantId の配信の同時視聴者数を返す。
 * 途中で別の videoId が出たら、その枝は別の動画なので使わない。
 * @param {any} data
 * @param {string} wantId
 * @returns {number | null}
 */
export function concurrentViewersInInnertube(data, wantId) {
  const want = isVideoId(wantId) ? wantId : '';
  /** @type {{ n: number }} */
  const budget = { n: 0 };
  return walkCount(data, want, want, budget, 0);
}

/**
 * @param {any} node
 * @param {string} videoId
 * @param {string} want
 * @param {{ n: number }} budget
 * @param {number} depth
 * @returns {number | null}
 */
function walkCount(node, videoId, want, budget, depth) {
  if (!node || typeof node !== 'object' || depth > 40 || budget.n > MAX_NODES) return null;
  budget.n += 1;
  if (Array.isArray(node)) {
    for (const item of node) {
      const n = walkCount(item, videoId, want, budget, depth + 1);
      if (n !== null) return n;
    }
    return null;
  }
  const vid = isVideoId(node.videoId) ? node.videoId : videoId;
  const renderer = node.videoViewCountRenderer;
  if (renderer && typeof renderer === 'object') {
    const count = concurrentFromVideoViewCountRenderer(renderer);
    if (count !== null && (!want || vid === want)) return count;
  }
  for (const key of Object.keys(node)) {
    if (key === 'videoViewCountRenderer') continue;
    const n = walkCount(node[key], vid, want, budget, depth + 1);
    if (n !== null) return n;
  }
  return null;
}

/**
 * `var ytInitialData = {...}` をオブジェクトにする。取れなければ null。
 * @param {string} source
 * @returns {any}
 */
export function parseYtInitialDataAssignment(source) {
  const text = String(source || '');
  const idx = text.indexOf('ytInitialData');
  if (idx < 0) return null;
  const brace = text.indexOf('{', idx);
  if (brace < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = brace; i < text.length; i += 1) {
    const c = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(brace, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * 画面の本文に「人が視聴中」が無く、script の ytInitialData にだけ数があるページから同時視聴者数を取る。
 * @param {string} html
 * @returns {number | null}
 */
export function concurrentViewersFromPageHtml(html) {
  const data = parseYtInitialDataAssignment(html);
  if (!data) return null;
  const id = videoIdFromYtInitialData(data);
  return concurrentViewersInInnertube(data, id);
}

/**
 * updated_metadata の応答から、指定した動画の同時視聴者数だけを取る。動画 id が違う応答は null。
 * @param {any} data
 * @param {string} videoId
 * @returns {number | null}
 */
/**
 * 応答の中の videoId を集める。無ければ空（リクエスト側の id を信じる）。
 * 別の動画の id だけが入っていたら、その応答は使わない。
 * @param {any} node
 * @param {Set<string>} ids
 * @param {number} depth
 * @param {{ n: number }} budget
 */
function collectVideoIds(node, ids, depth, budget) {
  if (!node || typeof node !== 'object' || depth > 24 || budget.n > 20_000) return;
  budget.n += 1;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoIds(item, ids, depth + 1, budget);
    return;
  }
  if (isVideoId(node.videoId)) ids.add(node.videoId);
  const endpoint = node.watchEndpoint?.videoId;
  if (isVideoId(endpoint)) ids.add(endpoint);
  for (const key of Object.keys(node)) collectVideoIds(node[key], ids, depth + 1, budget);
}

/**
 * updated_metadata の応答から、指定した動画の同時視聴者数だけを取る。
 * 応答に別の動画 id しか無ければ null。id が応答に無いときは、渡した videoId の数として読む。
 * @param {any} data
 * @param {string} videoId
 * @returns {number | null}
 */
export function concurrentViewersFromUpdatedMetadata(data, videoId) {
  if (!isVideoId(videoId)) return null;
  /** @type {Set<string>} */
  const ids = new Set();
  collectVideoIds(data, ids, 0, { n: 0 });
  if (ids.size > 0 && !ids.has(videoId)) return null;
  return concurrentViewersInInnertube(data, videoId);
}
