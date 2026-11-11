// ytPageMeta.js — YouTube 視聴ページの URL / 配信者アイコン URL を扱う純粋関数

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * YouTube の URL から videoId を取り出す。
 * 対応: /watch?v=ID ・ /live/ID ・ /live_chat?v=ID ・ /live_chat_replay?v=ID ・ youtu.be/ID
 * @param {string} rawUrl
 * @returns {string} 取れなければ ''
 */
export function parseYtVideoIdFromUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  /** @type {URL} */
  let u;
  try {
    u = new URL(rawUrl, 'https://www.youtube.com');
  } catch {
    return '';
  }
  const v = String(u.searchParams.get('v') || '').trim();
  if (VIDEO_ID_RE.test(v)) return v;
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be' && segs[0] && VIDEO_ID_RE.test(segs[0])) return segs[0];
  if ((segs[0] === 'live' || segs[0] === 'shorts') && segs[1] && VIDEO_ID_RE.test(segs[1])) {
    return segs[1];
  }
  return '';
}

/**
 * /@名前/live の URL を、比較用のパス（`/@名前/live`）にする。それ以外は ''。
 * @param {string} rawUrl
 * @returns {string}
 */
export function ytHandleLivePath(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''), 'https://www.youtube.com');
    const path = u.pathname.replace(/\/$/, '');
    return /^\/@[^/]+\/live$/.test(path) ? path : '';
  } catch {
    return '';
  }
}

/**
 * URL が「1本の動画/配信を見ているページ」か。
 * @param {string} rawUrl
 */
export function isYtWatchLikeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl, 'https://www.youtube.com');
    const p = u.pathname;
    if (p.startsWith('/live_chat')) return false;
    // /@名前/live は動画 id が URL に無い。id は canonical か ytInitialData から取る。
    return p === '/watch' || p.startsWith('/live/') || /^\/@[^/]+\/live\/?$/.test(p);
  } catch {
    return false;
  }
}

/**
 * 配信者アイコン候補から使える URL を1つ選ぶ。
 * - data: / 空 / 相対の怪しい値は捨てる
 * - ggpht / googleusercontent の `=s48-...` は `=s176-...` に上げて粗さを避ける
 * @param {Array<string|null|undefined>} candidates
 * @returns {string}
 */
export function pickYtBroadcasterIconUrl(candidates) {
  if (!Array.isArray(candidates)) return '';
  for (const raw of candidates) {
    const s = String(raw || '').trim();
    if (!s) continue;
    let abs = s;
    if (abs.startsWith('//')) abs = `https:${abs}`;
    if (!/^https:\/\//i.test(abs)) continue;
    let host = '';
    try {
      host = new URL(abs).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (!/(ggpht\.com|googleusercontent\.com|ytimg\.com)$/.test(host)) continue;
    return abs.replace(/=s(\d{2,3})-/, (m, n) => (Number(n) < 176 ? '=s176-' : m));
  }
  return '';
}
