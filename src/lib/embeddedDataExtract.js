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
 * embedded-data props から参加中の企画イベント ID（planningEvent.id）を取り出す。
 * 第2弾「同じイベントに参加している他の配信者」の取得に使う planningEventId。
 * 正の整数のみ受理（API の SSRF 面と整合）。
 * @param {Record<string, any>} props
 * @returns {string | null} 数値文字列（例 "472"）または null
 */
export function pickPlanningEventId(props) {
  if (!props || typeof props !== 'object') return null;
  const raw = props?.planningEvent?.id;
  if (raw == null) return null;
  const id = String(raw).trim();
  if (!/^[1-9]\d{0,17}$/.test(id)) return null;
  return id;
}

/**
 * この配信が企画イベントに参加中か（programAudition.isEnabled）。
 * イベント参加証拠＝[[reference_event_participant_broadcaster_ranking_research]]。
 * @param {Record<string, any>} props
 * @returns {boolean}
 */
export function pickIsEventParticipating(props) {
  if (!props || typeof props !== 'object') return false;
  return props?.programAudition?.isEnabled === true;
}

/**
 * embedded-data props から配信開始時刻を epoch ms として取得する。
 * ISO 8601 文字列・Unix 秒・epoch ms のいずれにも対応。
 * @param {Record<string, any>} props
 * @returns {number | null} epoch ms or null
 */
export function pickProgramBeginAt(props) {
  if (!props || typeof props !== 'object') return null;
  const candidates = [
    props?.program?.beginAt,
    props?.program?.beginTime,
    props?.program?.openTime,
    props?.program?.vposBaseAt,
    props?.program?.schedule?.begin,
    props?.program?.schedule?.openTime,
    props?.socialGroup?.programBeginTime,
    props?.program?.nicoliveProgramId ? undefined : undefined,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === 'string' && c.length >= 10) {
      const t = new Date(c).getTime();
      if (Number.isFinite(t) && t > 0) return t;
    }
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
      return c < 1e12 ? c * 1000 : c;
    }
  }
  return null;
}
