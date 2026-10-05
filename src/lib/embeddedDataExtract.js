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

/**
 * embedded-data props から配信終了時刻を epoch ms として取得する（v0.1.1557）。
 * 実測で確認したキーは `program.endTime`（Unix 秒）のみ。無ければ null。
 * @param {Record<string, any> | null | undefined} props
 * @returns {number | null}
 */
export function pickProgramEndAt(props) {
  if (!props || typeof props !== 'object') return null;
  const c = props?.program?.endTime;
  if (c == null) return null;
  if (typeof c === 'string' && c.length >= 10) {
    const t = new Date(c).getTime();
    return Number.isFinite(t) && t > 0 ? t : null;
  }
  if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
    return c < 1e12 ? c * 1000 : c;
  }
  return null;
}

/**
 * embedded-data props の `program.status` を trim + 大文字で返す（"ENDED" 等）。無ければ null。
 * @param {Record<string, any> | null | undefined} props
 * @returns {string | null}
 */
export function pickProgramStatus(props) {
  if (!props || typeof props !== 'object') return null;
  const s = props?.program?.status;
  if (typeof s !== 'string') return null;
  const t = s.trim().toUpperCase();
  return t ? t : null;
}

/**
 * 終了済み枠（タイムシフト等）の経過を「開始〜終了」で固定するための判定（v0.1.1557）。
 *
 * 背景: 経過は従来 `Date.now() − beginTime` だけで計算しており、2023 年の放送を
 * タイムシフトで開くと「26703時間」と出た（lv342383970 実測）。埋め込みデータには
 * `program.status:"ENDED"` と `program.endTime` が入っているのに読んでいなかった。
 *
 * - `ended=true`（status が ENDED）のときだけ `elapsedMin` を `endTime − beginTime` で返す。
 *   endTime が無い / end < begin の異常データは null（呼び出し側は「—」に倒す。
 *   終了が確定している枠に `now − begin` の嘘の数字を出さない＝AGENTS §3.6）。
 * - `ended=false`（ON_AIR / status 不明）のとき `elapsedMin` は常に null＝呼び出し側は従来どおり
 *   `now − begin` へ落ちる。生放送の挙動は変えない。
 * @param {Record<string, any> | null | undefined} props
 * @returns {{ ended: boolean, elapsedMin: number | null }}
 */
export function describeEmbeddedProgramElapsed(props) {
  const ended = pickProgramStatus(props) === 'ENDED';
  if (!ended) return { ended: false, elapsedMin: null };
  const beginMs = pickProgramBeginAt(props);
  const endMs = pickProgramEndAt(props);
  if (beginMs == null || endMs == null || endMs < beginMs) return { ended: true, elapsedMin: null };
  return { ended: true, elapsedMin: Math.round((endMs - beginMs) / 60000) };
}
