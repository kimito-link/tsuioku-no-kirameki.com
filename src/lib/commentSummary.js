/**
 * v0.1.508: コメント記録の「軽量サマリ（0 秒表示）」純関数群。
 *
 * 背景（HANDOFF 2026-05-31 §4-A / Repro の事前計算・0 秒表示概念の自前実装）:
 *   巨大放送（2 万件級）を多タブで開くと、各パネルが本体 `nls_comments_<lv>`（1 放送=
 *   1 巨大配列）を heavy read してデシリアライズしようとし、同一オリジンの watch タブが
 *   共有レンダラ上で単一ストレージ I/O を奪い合って timeout → `data={}` → 全カード「—」
 *   固定・ロード継続を招く。
 *
 *   本モジュールは「パネル初期表示に必要な最小限だけ」を小さな別キー
 *   `nls_csummary_<lv>` に書く純関数を提供する。content は記録のたびに安く更新し、
 *   popup/パネルはまずこの軽量キーを読んで即描画（件数カード・直近コメント）する。
 *   詳細（全コメント集計・レーン）は従来どおり本体配列を後追い read して段階適用する。
 *
 * 設計上の不変条件:
 *   - 接頭辞 `nls_csummary_` は `nls_comments_lv*` を列挙する clean migration / past-live
 *     読みと衝突しない（接頭辞を分離）。サマリは「表示専用の派生データ」であり正本では
 *     ない。欠落・破損しても本体配列とテールから常に再生成できる（記録は壊れない）。
 *   - 直近コメントは表示用の最小フィールドだけに間引いて保存し、サマリ自体が肥大化して
 *     書き込みコストが増えないようにする（上限 SUMMARY_RECENT_ROWS_MAX 件）。
 *
 * @module commentSummary
 */

/** サマリに保持する直近コメントの最大件数（表示の ticker / 初期 paint 用）。 */
export const SUMMARY_RECENT_ROWS_MAX = 30;

/** サマリのスキーマバージョン（将来フィールドを足したときの後方互換判定用）。 */
export const COMMENT_SUMMARY_VERSION = 1;

/**
 * 直近コメント表示で実際に使う最小フィールドだけを残す（サマリ肥大化の防止）。
 * normalizeTailRowsForDisplay（popup-entry.js）が読める形＝テール生行と互換にする。
 */
const RECENT_ROW_KEEP_KEYS = Object.freeze([
  'id',
  'text',
  'userId',
  'capturedAt',
  'commentNo',
  'no',
  'name',
  'selfPosted',
  'avatar',
  'liveId',
  'lvId'
]);

/**
 * 放送ごとのサマリ用 storage キー。`nls_comments_lv*` とは別接頭辞にして
 * 既存の prefix 列挙・clean migration と衝突させない。
 * @param {string} liveId lv123
 * @returns {string}
 */
export function summaryStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_csummary_${id}`;
}

/**
 * 直近コメント行を表示専用の最小フィールドへ間引く純関数。
 * 末尾（新しい側）から最大 max 件を採用する。
 *
 * @param {Array<Record<string, unknown>>|unknown} rows
 * @param {number} [max]
 * @returns {Array<Record<string, unknown>>}
 */
export function normalizeSummaryRecentRows(rows, max = SUMMARY_RECENT_ROWS_MAX) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : SUMMARY_RECENT_ROWS_MAX;
  const start = rows.length > cap ? rows.length - cap : 0;
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (let i = start; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r || typeof r !== 'object') continue;
    const text = String(/** @type {Record<string, unknown>} */ (r).text ?? '').trim();
    if (!text) continue;
    /** @type {Record<string, unknown>} */
    const slim = {};
    for (const k of RECENT_ROW_KEEP_KEYS) {
      const v = /** @type {Record<string, unknown>} */ (r)[k];
      if (v !== undefined && v !== null) slim[k] = v;
    }
    slim.text = text;
    out.push(slim);
  }
  return out;
}

/**
 * 有限な非負整数なら返す。それ以外は null（officialCount 等の任意値の正規化）。
 * @param {unknown} value
 * @returns {number|null}
 */
function finiteNonNegativeOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * パネル初期表示に必要な最小限だけを持つサマリオブジェクトを作る純関数。
 *
 * @param {{
 *   liveId?: string,
 *   recordedCount?: number,
 *   officialCount?: number|null,
 *   lastIngestAt?: number|null,
 *   recentRows?: Array<Record<string, unknown>>,
 *   maxRecent?: number,
 *   nowMs?: number
 * }} [opts]
 * @returns {{
 *   v: number,
 *   liveId: string,
 *   recordedCount: number,
 *   officialCount: number|null,
 *   lastIngestAt: number|null,
 *   updatedAt: number,
 *   recent: Array<Record<string, unknown>>
 * }}
 */
export function buildCommentSummary(opts = {}) {
  const liveId = String(opts.liveId || '').trim().toLowerCase();
  const recordedCount = Math.max(0, finiteNonNegativeOrNull(opts.recordedCount) ?? 0);
  const officialCount = finiteNonNegativeOrNull(opts.officialCount);
  const lastIngestAt = finiteNonNegativeOrNull(opts.lastIngestAt);
  const nowRaw = Number(opts.nowMs);
  const updatedAt = Number.isFinite(nowRaw) && nowRaw > 0 ? Math.floor(nowRaw) : Date.now();
  const recent = normalizeSummaryRecentRows(
    opts.recentRows,
    Number.isFinite(opts.maxRecent) ? opts.maxRecent : SUMMARY_RECENT_ROWS_MAX
  );
  return {
    v: COMMENT_SUMMARY_VERSION,
    liveId,
    recordedCount,
    officialCount,
    lastIngestAt,
    updatedAt,
    recent
  };
}

/**
 * 読み出したオブジェクトが想定 liveId のサマリかどうかを判定する型ガード。
 * 破損・別 lv・旧形式は false（呼び出し側は本体配列読みにフォールバックする）。
 *
 * @param {unknown} obj
 * @param {string} [liveId] 指定時は liveId 一致も要求する
 * @returns {boolean}
 */
export function isCommentSummary(obj, liveId) {
  if (!obj || typeof obj !== 'object') return false;
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (Number(o.v) !== COMMENT_SUMMARY_VERSION) return false;
  if (!Number.isFinite(Number(o.recordedCount))) return false;
  if (!Array.isArray(o.recent)) return false;
  if (liveId !== undefined) {
    const want = String(liveId || '').trim().toLowerCase();
    if (String(o.liveId || '').trim().toLowerCase() !== want) return false;
  }
  return true;
}
