/**
 * StatObservation - ニコ生から取得する数値の「契約付き観測値」純関数 factory。
 *
 * 設計（Opus 4.7 Phase 1: 契約先行）:
 *   観測値に「型」ではなく「契約」を与える。不変条件を満たさない入力は
 *   - 重大な違反（liveId 空、source 不明）→ null を返して生成自体させない
 *   - 軽い違反（value 異常、semantic enum 外）→ semantic = unknown に降格
 *   - 形式不一致（evidence 非配列、observedAt 非数値）→ 無害な default にフォールバック
 *
 *   evidence 配列が肝。「なぜそう分類したか」をログに残せるので、後から
 *   「なんで viewers=4500 を totalVisitors と判定したのか？」を コードを再実行せずに 追える。
 *
 *   ニコ生の仕様が静かに変わっても、型ではなく契約違反として CI で落ちる。
 *
 * 既存コード非干渉:
 *   - concurrentEstimate.js / wsStatisticsExtract.js / page-intercept-entry.js
 *     は触らない (DO_NOT_REWRITE)
 *   - popup-entry.js への配線は次セッション
 *
 * このファイルは Phase 1 の核。Phase 2 で observationStore を追加する。
 */

import { isStatSemantic, isStatSource, STAT_SEMANTIC } from './vocabulary.js';

/**
 * @typedef {import('./vocabulary.js').StatSemantic} StatSemantic
 * @typedef {import('./vocabulary.js').StatSource} StatSource
 */

/**
 * @typedef {{
 *   kind: string,
 *   raw: unknown
 * }} StatObservationEvidence
 */

/**
 * @typedef {{
 *   semantic: StatSemantic,
 *   value: number,
 *   source: StatSource,
 *   liveId: string,
 *   observedAt: number,
 *   freshMs: number,
 *   evidence: readonly StatObservationEvidence[]
 * }} StatObservation
 */

/**
 * @typedef {{
 *   semantic?: unknown,
 *   value?: unknown,
 *   source?: unknown,
 *   liveId?: unknown,
 *   observedAt?: unknown,
 *   freshMs?: unknown,
 *   evidence?: unknown
 * }} StatObservationInput
 */

/**
 * 入力から `StatObservation` を作る純関数 factory。
 *
 * 不変条件違反の重さで分岐:
 *   - liveId 空 / source enum 外 → null を返す（生成しない）
 *   - value 異常 / semantic enum 外 → semantic を 'unknown' に降格
 *   - evidence 非配列 / observedAt 非数値 / freshMs 負数 → 無害な default に正規化
 *
 * 返り値は freeze 済み（呼び出し側からの mutation 禁止）。
 *
 * @param {StatObservationInput} input
 * @returns {StatObservation | null}
 */
export function createStatObservation(input) {
  if (!input || typeof input !== 'object') return null;

  // 不変条件 1: liveId は必須（空ならそもそも観測値を作らない）
  const liveIdRaw = typeof input.liveId === 'string' ? input.liveId.trim() : '';
  if (!liveIdRaw) return null;

  // 不変条件 2: source は enum 値必須（出所不明データは取らない）
  if (!isStatSource(input.source)) return null;

  // 不変条件 3: value は finite non-negative number、それ以外は semantic を unknown に降格
  const valueRaw = input.value;
  const validValue =
    typeof valueRaw === 'number' &&
    Number.isFinite(valueRaw) &&
    valueRaw >= 0;
  const value = validValue ? valueRaw : 0;

  // semantic は enum 値必須、それ以外は unknown へ正規化。
  // value が異常値の場合も unknown へ降格（呼び出し側が cumulative と主張しても信用しない）。
  const semantic = !validValue
    ? STAT_SEMANTIC.UNKNOWN
    : isStatSemantic(input.semantic)
      ? /** @type {StatSemantic} */ (input.semantic)
      : STAT_SEMANTIC.UNKNOWN;

  // observedAt は number、それ以外は現在時刻にフォールバック
  const observedAt =
    typeof input.observedAt === 'number' && Number.isFinite(input.observedAt)
      ? input.observedAt
      : Date.now();

  // freshMs は non-negative number、それ以外は 0 にフォールバック
  const freshMs =
    typeof input.freshMs === 'number' &&
    Number.isFinite(input.freshMs) &&
    input.freshMs >= 0
      ? input.freshMs
      : 0;

  // evidence は配列必須、それ以外は空配列にフォールバック。要素は frozen にする。
  const evidenceArr = Array.isArray(input.evidence) ? input.evidence : [];
  const frozenEvidence = Object.freeze(
    evidenceArr.map((e) => {
      if (!e || typeof e !== 'object') {
        return Object.freeze({ kind: '', raw: e });
      }
      const ev = /** @type {{ kind?: unknown, raw?: unknown }} */ (e);
      return Object.freeze({
        kind: typeof ev.kind === 'string' ? ev.kind : '',
        raw: ev.raw
      });
    })
  );

  return Object.freeze({
    semantic,
    value,
    source: /** @type {StatSource} */ (input.source),
    liveId: liveIdRaw,
    observedAt,
    freshMs,
    evidence: frozenEvidence
  });
}
