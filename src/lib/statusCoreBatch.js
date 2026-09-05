/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】コア read を1本の get にまとめるためのキー組み立てと取り出し
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】コア read のキー集合と取り出しはこのファイルのみ
 *
 * statusCoreBatch.js — コア read を【1回の get】にまとめる(純関数側)。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★実測で確定した真因(2026-08-19・27MB まで太らせた実ブラウザ)
 *
 *   | 操作 | 実測 |
 *   |---|---|
 *   | 単一キー get                | 909ms |
 *   | 全件(152キー) get           | 1,456ms |
 *   | 単一キーを **5回直列**      | **17,040ms** |
 *   | 同じ5キーを **1本**で       | **391ms** |
 *
 *   ＝**152倍のキー数で1.6倍**にしかならない(キー数はほぼ効かない)。
 *     一方 **5回直列は43倍遅い**(発行回数が支配的)。
 *
 *   交互3回(順序効果を打ち消す)でも: 直列6発行 27,049ms vs 一括1発行 4,649ms(**5.8倍**)。
 *   ★1回だけの測定では差が 0% に見えてブレに騙されかけた。**必ず交互に複数回測る**。
 *
 *   ユーザー実機の「更新所要 21,449ms」はこの直列の数字とほぼ一致する。
 *
 * ■ ★やってはいけない直し方
 *   - **Promise.all で並列化**: v0.1.867 で timeout 多発→fastDiag={}・記録0 の空表示という
 *     実害を出して撤回済み。**減らすのは「直列の本数」であって並列化ではない**。
 *   - **読むキーを減らす**: 上の実測どおり効かない(キー数はほぼ無関係)。
 *
 * ■ この module の責務
 *   「どのキーを1本にまとめるか」と「まとまった袋から各値を取り出すか」だけ。
 *   storage を叩くのは呼び出し側(status-entry.js)。
 * ───────────────────────────────────────────────────────────────────────────
 *
 * @module statusCoreBatch
 */

import { KEY_STATUS_FAST_DIAG_LITE } from './statusFastDiagLite.js';
import { KEY_AI_SHARE_POPUP_DIAG } from './aiSharePopupDiagKey.js';

/** 過去ログ取り込みの進捗(グローバル1配信分)。 */
export const KEY_BACKFILL_PROGRESS = 'nls_backfill_progress_v1';

/** 配信ごとのキー接頭辞(status-entry.js と一致させる)。 */
export const PANEL_SUMMARY_PREFIX = 'nls_panel_summary_';
export const WATCH_SNAPSHOT_PREFIX = 'nls_watch_snapshot_';
export const PERF_DIAG_PREFIX = 'nls_perf_diag_';
export const LIVE_ENDED_PREFIX = 'nls_live_ended_';

/**
 * コア read を1本にまとめるためのキー配列を作る。
 *
 * ★配信ごとの4キー(summaries)と、単一キー3本(fastDiagLite/popupDiag/backfill)を
 *   **同じ袋**で取る。キー数が増えても所要はほぼ変わらない(実測)ので、
 *   **まとめるほど得**になる。
 *
 * @param {ReadonlyArray<string>|null|undefined} lvList
 * @returns {string[]} 重複を除いたキー配列
 */
export function buildCoreBatchKeys(lvList) {
  const keys = [KEY_STATUS_FAST_DIAG_LITE, KEY_AI_SHARE_POPUP_DIAG, KEY_BACKFILL_PROGRESS];
  const list = Array.isArray(lvList) ? lvList : [];
  for (const raw of list) {
    const lv = String(raw || '').trim();
    if (!lv) continue;
    keys.push(PANEL_SUMMARY_PREFIX + lv);
    keys.push(WATCH_SNAPSHOT_PREFIX + lv);
    keys.push(PERF_DIAG_PREFIX + lv);
    keys.push(LIVE_ENDED_PREFIX + lv);
  }
  return [...new Set(keys)];
}

/**
 * 取り込み進捗を「表示に使う形」へ整える。
 * ★status-entry.js の loadBackfillProgressSafe と**同じ形**を返す(呼び出し側を変えない)。
 *
 * @param {unknown} raw
 * @returns {{lid:string, rows:number, done:number, stopReason:string, errMsg:string,
 *   seg:number, elapsedMs:number, reseeds:number}|null}
 */
export function pickBackfillProgress(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const p = /** @type {Record<string, unknown>} */ (raw);
  return {
    lid: String(p.lid || ''),
    rows: Number(p.rows) || 0,
    done: Number(p.done) || 0,
    stopReason: String(p.stopReason || ''),
    errMsg: String(p.errMsg || ''),
    seg: Number(p.seg) || 0,
    elapsedMs: Number(p.elapsedMs) || 0,
    reseeds: Number(p.reseeds) || 0
  };
}

/**
 * 1本の get で得た袋から、コア read 各項目を取り出す。
 *
 * ★**summaries は「配信ごとのキーだけ」に絞って返す**。袋には単一キー3本も
 *   混ざっているので、そのまま渡すと consumer が知らないキーを持ち込むことになる
 *   (renderAll 以下は `summaries[PANEL_SUMMARY_PREFIX+lv]` の形しか期待していない)。
 *
 * @param {Record<string, unknown>|null|undefined} bag
 * @param {ReadonlyArray<string>|null|undefined} lvList
 * @returns {{ summaries: Record<string, unknown>, fastDiag: unknown,
 *   popupDiag: unknown, backfillProgress: ReturnType<typeof pickBackfillProgress> }}
 */
export function pickCoreBatchValues(bag, lvList) {
  const b = bag && typeof bag === 'object' ? /** @type {Record<string, unknown>} */ (bag) : {};
  /** @type {Record<string, unknown>} */
  const summaries = {};
  const list = Array.isArray(lvList) ? lvList : [];
  for (const raw of list) {
    const lv = String(raw || '').trim();
    if (!lv) continue;
    for (const pre of [
      PANEL_SUMMARY_PREFIX,
      WATCH_SNAPSHOT_PREFIX,
      PERF_DIAG_PREFIX,
      LIVE_ENDED_PREFIX
    ]) {
      const k = pre + lv;
      if (k in b) summaries[k] = b[k];
    }
  }
  return {
    summaries,
    fastDiag: b[KEY_STATUS_FAST_DIAG_LITE] ?? null,
    popupDiag: b[KEY_AI_SHARE_POPUP_DIAG] ?? null,
    backfillProgress: pickBackfillProgress(b[KEY_BACKFILL_PROGRESS])
  };
}
