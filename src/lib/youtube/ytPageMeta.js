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

/** /名前/live をチャンネルの配信と見なさない、YouTube 自身の区画。 */
const YT_NOT_CHANNEL = new Set([
  'account', 'ads', 'analytics', 'api', 'attribution_link', 'c', 'channel', 'clip',
  'comment', 'copyright', 'create', 'creator', 'dashboard', 'embed', 'feed',
  'features', 'gaming', 'hashtag', 'howyoutubeworks', 'iframe_api', 'intl', 'kids',
  'live', 'live_chat', 'live_chat_replay', 'logout', 'music', 'new', 'oops', 'playlist',
  'post', 'premium', 'redirect', 'reporthistory', 'results', 'shorts', 'signin',
  'source', 'studio', 'supported_browsers', 't', 'trends', 'tv', 'upload', 'user', 'watch',
]);

/**
 * @param {string} hostname
 */
function isYoutubeHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'youtube.com' || host.endsWith('.youtube.com');
}

/**
 * /@名前/live を、まとめが出来る前の仮の配信キーにする。YouTube 以外は ''。
 * 仮のキーがあると横の欄はすぐ YouTube の「読み込み中」になる。
 * `/名前/live`・`/c/名前/live`・`/channel/番号/live`・`/user/名前/live` も同じ。
 * @param {string} rawUrl
 * @returns {string}
 */
export function ytHandleLivePendingKey(rawUrl) {
  const path = ytHandleLivePath(rawUrl);
  if (!path) return '';
  let body = path.slice(1, path.length - '/live'.length).replace(/\/$/, '');
  try {
    body = body.split('/').map((part) => decodeURIComponent(part)).join('/');
  } catch {
    /* 名前はそのまま */
  }
  return body ? `ytlive:${body}` : '';
}

/**
 * 仮の配信キーから、画面に出す名前を取り出す。仮のキーでなければ ''。
 * @param {unknown} key
 */
export function ytHandleOfPendingKey(key) {
  const m = String(key || '').match(/^ytlive:(.+)$/);
  if (!m) return '';
  const rest = m[1];
  const slash = rest.lastIndexOf('/');
  return slash >= 0 ? rest.slice(slash + 1) : rest;
}

/**
 * 仮の配信キーから、チャンネルのページ URL を作る。
 * @param {unknown} key
 * @returns {string}
 */
export function ytPendingChannelPageUrl(key) {
  const m = String(key || '').match(/^ytlive:(.+)$/);
  if (!m) return '';
  return `https://www.youtube.com/${encodeURI(m[1])}`;
}

/**
 * チャンネルの配信 URL を、比較用のパスにする。それ以外は ''。
 * `/@名前/live` に加え、`/@名前/live` が飛んだ先の `/名前/live`・`/c/名前/live`・
 * `/channel/番号/live`・`/user/名前/live` も同じ配信ページとして扱う。
 * @param {string} rawUrl
 * @returns {string}
 */
export function ytHandleLivePath(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''), 'https://www.youtube.com');
    if (!isYoutubeHost(u.hostname)) return '';
    const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    if (parts.length === 2 && parts[0].startsWith('@') && parts[0].length > 1 && parts[1] === 'live') {
      return `/${parts[0]}/live`;
    }
    if (
      parts.length === 3 &&
      parts[2] === 'live' &&
      (parts[0] === 'c' || parts[0] === 'channel' || parts[0] === 'user') &&
      parts[1]
    ) {
      return `/${parts[0]}/${parts[1]}/live`;
    }
    if (
      parts.length === 2 &&
      parts[1] === 'live' &&
      parts[0] &&
      !parts[0].startsWith('@') &&
      !YT_NOT_CHANNEL.has(parts[0].toLowerCase())
    ) {
      return `/${parts[0]}/live`;
    }
    return '';
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
    // /@名前/live と、そこから飛んだ /名前/live などは YouTube だけ。TikTok も同じ形を使う。
    if (ytHandleLivePath(rawUrl)) return true;
    return p === '/watch' || p.startsWith('/live/');
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
