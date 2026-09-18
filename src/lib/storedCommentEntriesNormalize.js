/**
 * 保存済みコメント配列の重複潰し（純粋関数）。
 *
 * popup-entry.js から Track A（refactor Phase 4）で切り出した
 * `normalizeStoredCommentEntries`（挙動不変・呼び出し元 1 箇所: UI 表示前の正規化）。
 * 旧バグで混ざった「複数コメント連結行」や、読み直しで取得時刻が振り直されて
 * 別行に数えられた重複を、dedupe キーで 1 行にマージする。DOM/fetch/chrome/
 * module-level 状態に依存しないため lib へ移せる。時点の解釈は storedCommentDedupeKey
 * に委ね、この箱では一切行わない。
 *
 * 依存はすべて既存 lib（`storedCommentDedupeKey` / `storedCommentDedupeMerge`）から import。
 */

import { storedCommentDedupeKey } from './storedCommentDedupeKey.js';
import { mergeStoredCommentDedupeVariants } from './storedCommentDedupeMerge.js';

/**
 * @typedef {Record<string, unknown>} PopupCommentEntry
 */

/**
 * 保存済みコメント配列を、dedupe キーで重複統合して返す。既存挙動そのまま。
 *
 * @param {PopupCommentEntry[]} entries
 * @returns {{ next: PopupCommentEntry[], changed: boolean }}
 */
export function normalizeStoredCommentEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length <= 1) return { next: list, changed: false };

  /** @type {PopupCommentEntry[]} */
  const out = [];
  /** @type {Map<string, number>} */
  const indexByKey = new Map();
  let changed = false;

  /**
   * @param {PopupCommentEntry} prev
   * @param {PopupCommentEntry} next
   * @returns {PopupCommentEntry}
   */
  const mergeVariant = (prev, next) =>
    /** @type {PopupCommentEntry} */ (
      mergeStoredCommentDedupeVariants(
        /** @type {Record<string, unknown>} */ (prev),
        /** @type {Record<string, unknown>} */ (next)
      )
    );

  for (const raw of list) {
    const entry = /** @type {PopupCommentEntry} */ (raw);
    // ★v0.1.1313: キー生成は純関数 storedCommentDedupeKey が正本(経緯・時点の扱いは
    //   そちらの冒頭)。旧キーは取得時刻を生のまま含み、読み直しで時刻が振り直されると
    //   同じコメントが別行として数えられていた(＝「記録101%」の残り火)。時点の解釈は
    //   ここでは一切行わず storedCommentDedupeKey に委ねる。
    const key = storedCommentDedupeKey(entry);
    const existingIndex = indexByKey.get(key);
    if (existingIndex == null) {
      indexByKey.set(key, out.length);
      out.push(entry);
      continue;
    }
    const merged = mergeVariant(out[existingIndex], entry);
    if (merged !== out[existingIndex]) {
      changed = true;
      out[existingIndex] = merged;
    } else {
      changed = true;
    }
  }

  return { next: out, changed: changed || out.length !== list.length };
}
