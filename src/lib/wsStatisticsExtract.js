/**
 * 視聴セッション WebSocket の JSON メッセージから statistics（viewers / comments）を抽出する。
 *
 * ニコ生の視聴セッション WS (wss://a.live2.nicovideo.jp/wsapi/v2/watch/...)
 * は定期的に以下の形式のメッセージを送信する:
 *   {"type":"statistics","data":{"viewers":41,"comments":1}}
 * 新形式では watchCount / commentCount 等の可能性もある。
 */

const MAX_VIEWERS = 50_000_000;
const MAX_GIFT_AD_POINTS = 2_000_000_000;
const VIEWER_KEYS = ['viewers', 'watchCount', 'watching', 'watchingCount', 'viewerCount', 'viewCount'];
const COMMENT_KEYS = ['comments', 'commentCount'];
/** 本家 statistics / NDGR JSON で想定されるギフト累計 pt 系キー */
const GIFT_POINT_KEYS = [
  'giftPoints',
  'gift_points',
  'programGiftPoints',
  'totalGiftPoints',
  'giftPointTotal'
];
/** イベント累計スコア系（statistics JSON で観測される変形キー） */
const EVENT_GIFT_SCORE_KEYS = [
  'eventGiftScore',
  'event_gift_score',
  'eventGiftPoints',
  'event_gift_points',
  'eventScore',
  'campaignGiftPoints',
  'campaign_gift_points'
];
/** 広告・応援（変形キーはサイト改修で増える可能性あり） */
const AD_POINT_KEYS = ['adPoints', 'ad_points', 'henPoints', 'supportPoints', 'koukokuPoints'];

/**
 * @param {Record<string, unknown>} d
 * @returns {number | null}
 */
function pickViewerValue(d) {
  for (const k of VIEWER_KEYS) {
    const raw = d[k];
    if (raw == null) continue;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_VIEWERS) return n;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} d
 * @returns {number | null}
 */
function pickCommentValue(d) {
  for (const k of COMMENT_KEYS) {
    const raw = d[k];
    if (raw == null) continue;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} d
 * @param {readonly string[]} keys
 * @returns {number | null}
 */
function pickNonNegativeIntFromKeys(d, keys) {
  for (const k of keys) {
    const raw = d[k];
    if (raw == null) continue;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_GIFT_AD_POINTS) return n;
  }
  return null;
}

/**
 * パース済みオブジェクトから statistics を抽出する。
 * type:"statistics" 以外でも、既知の viewer キーがあれば抽出を試みる。
 * @param {unknown} obj
 * @returns {{
 *   viewers?: number,
 *   comments?: number | null,
 *   giftPoints?: number,
 *   adPoints?: number,
 *   eventGiftScore?: number
 * } | null}
 */
export function extractStatisticsFromParsedObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = /** @type {Record<string, unknown>} */ (obj);

  const data = o.data;
  const target =
    data && typeof data === 'object' && !Array.isArray(data)
      ? /** @type {Record<string, unknown>} */ (data)
      : o;

  const viewers =
    pickViewerValue(target) ?? (target !== o ? pickViewerValue(o) : null);
  const comments =
    pickCommentValue(target) ?? (target !== o ? pickCommentValue(o) : null);
  const giftPoints =
    pickNonNegativeIntFromKeys(target, GIFT_POINT_KEYS) ??
    (target !== o ? pickNonNegativeIntFromKeys(o, GIFT_POINT_KEYS) : null);
  const eventGiftScore =
    pickNonNegativeIntFromKeys(target, EVENT_GIFT_SCORE_KEYS) ??
    (target !== o ? pickNonNegativeIntFromKeys(o, EVENT_GIFT_SCORE_KEYS) : null);
  const adPoints =
    pickNonNegativeIntFromKeys(target, AD_POINT_KEYS) ??
    (target !== o ? pickNonNegativeIntFromKeys(o, AD_POINT_KEYS) : null);

  if (
    viewers == null &&
    comments == null &&
    giftPoints == null &&
    adPoints == null &&
    eventGiftScore == null
  ) {
    return null;
  }

  /** @type {{ viewers?: number, comments?: number | null, giftPoints?: number, adPoints?: number, eventGiftScore?: number }} */
  const out = {};
  if (viewers != null) out.viewers = viewers;
  if (comments != null) out.comments = comments;
  else if (viewers != null) out.comments = null;
  if (giftPoints != null) out.giftPoints = giftPoints;
  if (adPoints != null) out.adPoints = adPoints;
  if (eventGiftScore != null) out.eventGiftScore = eventGiftScore;
  return out;
}

/**
 * F4(v0.1.282): statistics / watchCount を「累計来場」として射影する純関数。
 *
 * ニコ生の視聴セッション statistics WS および埋め込み
 * `program.statistics.watchCount` の viewer 系値は「累計来場者数」であり
 * 同時接続ではない（content-entry.js `updateOfficialStatistics` の JSDoc が
 * 設計を明記。累計を同接候補へ昇格させると resolveConcurrentViewers で
 * 同接が過大表示になる）。
 *
 * この関数は抽出結果を `cumulativeVisitors` / `comments` に分け、
 * `concurrentCandidate` は常に `null` を返すことを ingress 契約として固定する。
 * 呼び出し側（content-entry.js の NLS_INTERCEPT_STATISTICS /
 * NLS_INTERCEPT_EMBEDDED_DATA / pollStatsFromPage 経路）が累計を同接候補
 * （wsViewerCount）へ昇格させる退行を、この純関数の test で検出できるように
 * するための境界。表示・抽出ロジックは一切変えない（加法追加）。
 *
 * @param {unknown} statsLike `extractStatisticsFromParsedObject` が受ける生
 *   オブジェクト、または `{ viewers, comments }` 等の抽出済み相当
 * @returns {{ cumulativeVisitors: number|null, comments: number|null, concurrentCandidate: null }}
 */
export function projectStatisticsAudienceSignal(statsLike) {
  const stats = extractStatisticsFromParsedObject(statsLike);
  const cumulativeVisitors =
    stats && typeof stats.viewers === 'number' ? stats.viewers : null;
  const comments =
    stats && typeof stats.comments === 'number' ? stats.comments : null;
  return { cumulativeVisitors, comments, concurrentCandidate: null };
}

/**
 * JSON 文字列から statistics を抽出する。
 * @param {string} json
 * @returns {ReturnType<typeof extractStatisticsFromParsedObject>}
 */
export function extractStatisticsFromWsJson(json) {
  if (!json || typeof json !== 'string') return null;
  try {
    const obj = JSON.parse(json);
    return extractStatisticsFromParsedObject(obj);
  } catch {
    return null;
  }
}
