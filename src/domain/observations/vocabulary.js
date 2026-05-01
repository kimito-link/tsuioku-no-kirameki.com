/**
 * 観測層 (StatObservation) の語彙集 - 不変な enum 定義のみ。
 *
 * 設計（Opus 4.7 Phase 1: vocabulary first）:
 *   ニコ生から取得する数値（同接・来場者数・視聴中ユーザー数・コメ数）を
 *   「semantic（意味）」と「source（取得経路）」で型として固定する。
 *
 *   現コードは viewerCountFromDom のように DOM 由来か embedded-data 由来かが
 *   暗黙だった。enum で語彙を分けることで、UI レイヤや HTML レポートで
 *   「同接と来場者を混ぜない」契約が型レベルで強制できる。
 *
 *   既存の concurrentEstimate.js / wsStatisticsExtract.js / page-intercept-entry.js
 *   は触らず、隣に新しい層を組む（DO_NOT_REWRITE 方針）。
 *
 * ステージ: Phase 1 (核のみ)
 *   - vocabulary（このファイル）
 *   - StatObservation（純関数 factory）
 *   - StatObservation.test（不変条件先行）
 *
 * 後続 Phase（次セッション以降）:
 *   - observationStore（リングバッファ）
 *   - F1〜F3 失敗モード policy
 *   - concurrentInputBuilder（popup-entry.js への薄い 1 行差分）
 *   - 観測診断 HTML タブ
 */

/**
 * 観測値の意味 - 「この数字は同接か、来場者か、不明か」を型で固定する。
 *
 *   - CONCURRENT: 同時接続中の人数（時系列で増減する）
 *   - CUMULATIVE: 累計来場者数（単調増加するはず）
 *   - UNKNOWN:    数字は取れたが意味不明 / 整合性違反で降格された
 */
export const STAT_SEMANTIC = Object.freeze({
  CONCURRENT: 'concurrent',
  CUMULATIVE: 'cumulative',
  UNKNOWN: 'unknown'
});

/**
 * @typedef {'concurrent' | 'cumulative' | 'unknown'} StatSemantic
 */

/**
 * 観測値の取得経路 - 「どこから拾った数字か」を型で固定する。
 *
 *   - OFFICIAL_STATS: ニコ生公式の statistics WebSocket メッセージ
 *   - EMBEDDED_DATA:  watch ページの #embedded-data JSON
 *   - DOM_TEXT:       DOM 表示要素から正規表現で抽出
 *   - WEBSOCKET:      ndgr / chat 系の WebSocket フレーム
 */
export const STAT_SOURCE = Object.freeze({
  OFFICIAL_STATS: 'official-stats',
  EMBEDDED_DATA: 'embedded-data',
  DOM_TEXT: 'dom-text',
  WEBSOCKET: 'ws'
});

/**
 * @typedef {'official-stats' | 'embedded-data' | 'dom-text' | 'ws'} StatSource
 */

/**
 * @returns {readonly StatSemantic[]}
 */
export function listStatSemantics() {
  return Object.freeze([
    STAT_SEMANTIC.CONCURRENT,
    STAT_SEMANTIC.CUMULATIVE,
    STAT_SEMANTIC.UNKNOWN
  ]);
}

/**
 * @returns {readonly StatSource[]}
 */
export function listStatSources() {
  return Object.freeze([
    STAT_SOURCE.OFFICIAL_STATS,
    STAT_SOURCE.EMBEDDED_DATA,
    STAT_SOURCE.DOM_TEXT,
    STAT_SOURCE.WEBSOCKET
  ]);
}

/**
 * @param {unknown} v
 * @returns {v is StatSemantic}
 */
export function isStatSemantic(v) {
  return (
    v === STAT_SEMANTIC.CONCURRENT ||
    v === STAT_SEMANTIC.CUMULATIVE ||
    v === STAT_SEMANTIC.UNKNOWN
  );
}

/**
 * @param {unknown} v
 * @returns {v is StatSource}
 */
export function isStatSource(v) {
  return (
    v === STAT_SOURCE.OFFICIAL_STATS ||
    v === STAT_SOURCE.EMBEDDED_DATA ||
    v === STAT_SOURCE.DOM_TEXT ||
    v === STAT_SOURCE.WEBSOCKET
  );
}
