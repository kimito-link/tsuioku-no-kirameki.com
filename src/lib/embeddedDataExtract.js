/**
 * ニコ生 watch ページの `#embedded-data[data-props]` から初期メタ情報を抽出する純関数。
 *
 * ページ HTML に <script id="embedded-data" data-props='{ ... }'> が埋め込まれており、
 * site.relive.webSocketUrl / program.statistics.watchCount 等が格納されている。
 */

/**
 * Document から `#embedded-data[data-props]` の JSON をパースして返す。
 * @param {Document} doc
 * @returns {Record<string, any> | null}
 */
export function extractEmbeddedDataProps(doc) {
  if (!doc) return null;
  try {
    const el = doc.getElementById('embedded-data') || doc.querySelector('#embedded-data');
    if (!el) return null;
    let raw = el.getAttribute('data-props') || '';
    if (!raw) return null;
    if (raw.includes('&quot;')) raw = raw.replace(/&quot;/g, '"');
    if (raw.includes('&amp;')) raw = raw.replace(/&amp;/g, '&');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

/**
 * embedded-data props から初期視聴者数を取得する。
 * @param {Record<string, any>} props
 * @returns {number | null}
 */
export function pickViewerCountFromEmbeddedData(props) {
  if (!props || typeof props !== 'object') return null;
  const wc = props?.program?.statistics?.watchCount;
  if (wc == null) return null;
  const n = typeof wc === 'number' ? wc : parseInt(String(wc), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * embedded-data props から視聴セッション WebSocket URL を取得する。
 * @param {Record<string, any>} props
 * @returns {string | null}
 */
export function pickWsUrlFromEmbeddedData(props) {
  if (!props || typeof props !== 'object') return null;
  const url = props?.site?.relive?.webSocketUrl;
  if (!url || typeof url !== 'string') return null;
  return url;
}

/**
 * embedded-data props から配信開始時刻(ISO 8601)を取得する。
 * program.beginAt / program.openTime / program.schedule.begin 等を探す。
 * @param {Record<string, any>} props
 * @returns {string | null} ISO 8601 文字列 or null
 */
export function pickProgramBeginAt(props) {
  if (!props || typeof props !== 'object') return null;
  const candidates = [
    props?.program?.beginAt,
    props?.program?.openTime,
    props?.program?.schedule?.begin,
    props?.program?.beginTime,
  ];
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.length >= 10) return c;
  }
  return null;
}
