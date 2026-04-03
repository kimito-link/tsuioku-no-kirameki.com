/**
 * ニコニコ生放送 URL / パスから lv ID を取り出す（純関数・DOM非依存）
 */

const LV_RE = /\blv\d+/i;

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
function isLocalE2EWatchHost(u) {
  const host = u.hostname.toLowerCase();
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  return (
    u.protocol === 'http:' &&
    (host === '127.0.0.1' || host === 'localhost') &&
    port === '3456'
  );
}

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
