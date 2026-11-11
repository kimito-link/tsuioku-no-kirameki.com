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

// チャンネルの「いま配信中」ページの形。YouTube は /@名前/live を古い形(/名前/live 等)へ送り直すことがある
//   (2026-11-11 実機: /@weathernews/live → /weathernews/live で「watch ページが見つかりません」)。どの形でも同じに扱う。
//   /<名前>/live の <名前> が YouTube 自身のページ(/feed/… 等)のときは配信ページではない。
const YT_RESERVED_TOP = new Set([
  'watch', 'live', 'live_chat', 'live_chat_replay', 'shorts', 'feed', 'results', 'playlist', 'embed', 'hashtag',
  'gaming', 'music', 'premium', 'kids', 'account', 'signin', 'logout', 'redirect', 'post', 'source', 'podcasts',
  'sports', 'news', 'learning', 'fashion', 'courses', 'trending', 'upload', 'studio', 'about', 't', 's', 'yt',
  'api', 'youtubei', 'storefront', 'movies', 'channel', 'c', 'user', 'attribution_link', 'howyoutubeworks', 'ads',
  'creators', 'img', 'sw.js', 'manifest.webmanifest', 'favicon.ico', 'robots.txt',
]);

/**
 * チャンネルの「いま配信中」ページ(/@名前/live・/名前/live・/c/名前/live・/user/名前/live・/channel/UC…/live)の
 * URL を、比較用のパス(末尾の / なし)にする。それ以外は ''。YouTube 以外(TikTok の /@名前/live 等)も ''。
 * @param {string} rawUrl
 * @returns {string}
 */
export function ytHandleLivePath(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''), 'https://www.youtube.com');
    const host = u.hostname.toLowerCase();
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return '';
    const path = u.pathname.replace(/\/$/, '');
    if (/^\/@[^/]+\/live$/.test(path)) return path;
    if (/^\/(?:c|user)\/[^/]+\/live$/.test(path)) return path;
    if (/^\/channel\/UC[A-Za-z0-9_-]{22}\/live$/.test(path)) return path;
    const m = path.match(/^\/([^/@]+)\/live$/);
    if (m && !YT_RESERVED_TOP.has(m[1].toLowerCase())) return path;
    return '';
  } catch {
    return '';
  }
}

/**
 * チャンネルの「いま配信中」ページを、まとめが出来る前の仮の配信キーにする。YouTube 以外は ''。
 * 仮のキーがあると横の欄はすぐ YouTube の「読み込み中」になる。
 * 例: /@名前/live → ytlive:@名前 ・ /名前/live → ytlive:名前 ・ /channel/UC…/live → ytlive:channel/UC…
 * @param {string} rawUrl
 * @returns {string}
 */
export function ytHandleLivePendingKey(rawUrl) {
  const path = ytHandleLivePath(rawUrl);
  if (!path) return '';
  let part = path.slice(1, path.length - '/live'.length);
  try {
    part = decodeURIComponent(part);
  } catch {
    /* 名前はそのまま */
  }
  return part ? `ytlive:${part}` : '';
}

/**
 * 仮の配信キーから、画面に出すチャンネルの呼び名を取り出す(@名前 / 名前)。
 * /channel/UC… の形は名前が分からないので ''。仮のキーでなければ ''。
 * @param {unknown} key
 */
export function ytHandleOfPendingKey(key) {
  const m = String(key || '').match(/^ytlive:(.+)$/);
  if (!m) return '';
  const part = m[1];
  if (part.startsWith('@')) return part;
  if (/^channel\//.test(part)) return '';
  return part.replace(/^(?:c|user)\//, '');
}

/** 仮の配信キー → そのチャンネルのページ。仮のキーでなければ ''。 @param {unknown} key */
export function ytChannelUrlOfPendingKey(key) {
  const m = String(key || '').match(/^ytlive:(.+)$/);
  return m ? `https://www.youtube.com/${encodeURI(m[1])}` : '';
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
    // チャンネルの「いま配信中」ページは YouTube だけ。TikTok も /@名前/live の形を使う。
    if (/\/live\/?$/.test(p) && !p.startsWith('/live/')) return Boolean(ytHandleLivePath(rawUrl));
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
