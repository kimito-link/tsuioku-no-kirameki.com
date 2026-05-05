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
    const hasWatchOrEmbed =
      /\/watch\//.test(u.pathname) || /\/embed\//.test(u.pathname);
    if (isLocalE2EWatchHost(u)) return hasWatchOrEmbed;
    if (!host.includes('nicovideo.jp')) return false;
    if (host === 'live.nicovideo.jp' || host === 'sp.live.nicovideo.jp') {
      return hasWatchOrEmbed;
    }
    return /\/watch\/(lv|ch)\d+/i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * 拡張がニコニコ系ページとみなすホスト（サブドメイン含む）。about:blank 等は false。
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
export function isNicoVideoJpHost(url) {
  try {
    const h = new URL(String(url || '')).hostname.toLowerCase();
    return h === 'nicovideo.jp' || h.endsWith('.nicovideo.jp');
  } catch {
    return false;
  }
}

/**
 * URL に lv が無い場合（SPA iframe / about:blank 等）に DOM から推定
 * @param {Document} doc
 * @returns {string|null}
 */
export function extractLiveIdFromDom(doc) {
  if (!doc) return null;
  const tryHref = (/** @type {string|null|undefined} */ raw) =>
    extractLiveIdFromUrl(String(raw || ''));

  for (const a of doc.querySelectorAll(
    'a[href*="/watch/lv"], a[href*="watch/lv"], a[href*="/embed/lv"], a[href*="embed/lv"]'
  )) {
    const id = tryHref(a.getAttribute('href'));
    if (id) return id;
  }
  for (const sel of [
    'meta[property="og:url"]',
    'meta[name="og:url"]',
    'link[rel="canonical"]'
  ]) {
    const el = doc.querySelector(sel);
    const raw =
      el?.getAttribute('content') || el?.getAttribute('href') || '';
    const id = tryHref(raw);
    if (id) return id;
  }
  return null;
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

/**
 * 開いているタブ URL が「解決済み watch URL」と同一放送か。
 * lv が両方から取れるときは ID のみで一致判定し、その後に
 * `watchPageUrlsMatchForSnapshot`（ch 形式など lv 無し）へフォールバック。
 *
 * @param {string | null | undefined} tabUrl
 * @param {string | null | undefined} resolvedWatchUrl storage / pick の解決結果
 * @returns {boolean}
 */
export function openWatchTabMatchesResolvedBroadcast(
  tabUrl,
  resolvedWatchUrl
) {
  const u = String(tabUrl || '').trim();
  const w = String(resolvedWatchUrl || '').trim();
  if (!isNicoLiveWatchUrl(u) || !isNicoLiveWatchUrl(w)) return false;
  const lw = extractLiveIdFromUrl(w);
  if (lw) {
    const lu = extractLiveIdFromUrl(u);
    if (lu && lu === lw) return true;
  }
  return watchPageUrlsMatchForSnapshot(u, w);
}

/**
 * 表示・診断コピー・保存 HTML 向け: query / hash を落とした watch URL。
 * storage の正本キーは変更しない（あくまで出力・表示のサニタイズ）。
 *
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function canonicalWatchUrlForDisplay(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    const q = s.split('?')[0];
    return q.split('#')[0];
  }
}
