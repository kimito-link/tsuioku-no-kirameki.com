/**
 * ニコニコ生放送 URL / パスから lv ID を取り出す（純関数・DOM非依存）
 */

const LV_RE = /\blv\d+/i;

/**
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function extractLiveIdFromUrl(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const m = u.pathname.match(LV_RE) || u.href.match(LV_RE);
    return m ? m[0].toLowerCase() : null;
  } catch {
    const m = s.match(LV_RE);
    return m ? m[0].toLowerCase() : null;
  }
}

/**
 * Playwright 用ローカルモック（127.0.0.1:3456 のみ）。本番ホストは従来どおり。
 */
/**
 * @param {URL} u
 */
function isLocalE2EWatchHost(u) {
  const host = u.hostname.toLowerCase();
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  return (
    u.protocol === 'http:' &&
    (host === '127.0.0.1' || host === 'localhost') &&
    port === '3456'
  );
}

/**
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
export function isNicoLiveWatchUrl(url) {
  try {
    const u = new URL(String(url || ''));
    const host = u.hostname.toLowerCase();
    const pathOk = /\/watch\/lv\d+/i.test(u.pathname);
    if (isLocalE2EWatchHost(u)) return pathOk;
    if (!host.includes('nicovideo.jp')) return false;
    return pathOk;
  } catch {
    return false;
  }
}

/**
 * スナップショット取得・コメント送信など「同じ watch 放送か」の緩い一致。
 * クエリ・ハッシュの差でタブ URL と storage の URL がずれても lv が同じなら true。
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function watchPageUrlsMatchForSnapshot(a, b) {
  const la = extractLiveIdFromUrl(a);
  const lb = extractLiveIdFromUrl(b);
  if (la && lb) return la === lb;
  try {
    const ua = new URL(String(a || ''));
    const ub = new URL(String(b || ''));
    if (ua.origin !== ub.origin) return false;
    const pa = ua.pathname.replace(/\/$/, '');
    const pb = ub.pathname.replace(/\/$/, '');
    return pa === pb;
  } catch {
    return String(a || '').trim() === String(b || '').trim();
  }
}
