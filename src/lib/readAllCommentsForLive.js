/**
 * 放送の全コメントを「IndexedDB(SW集約書きの正本) → chrome.storage チャンク → テール」の
 * 優先順で読む共有リーダ。
 *
 * v0.1.881: popup-entry.js のローカル `readAllCommentsForLive`(v0.1.853 の正本)を【そのまま】
 *   共有 lib に抽出。popup と live-view(応援ライブビュー)が同じ多段ソースで全コメントを読むことで、
 *   応援者ランキング/レポートが「IDB に無いだけ(=chrome.storage チャンクに在る)」で空になる退行を断つ。
 *   会議結論=自作の再現でなく本物を両方が import。chrome.storage 依存は getMany 注入でテスト可能に。
 *
 * 設計(seam): I/O(chrome.storage.local.get / IDB open)は呼び出し側が deps で渡す。lib 本体は
 *   優先順ロジックだけを持つ(純粋寄り)。popup/live-view はそれぞれ本物の I/O を渡す=スタブ無し。
 */

import { readChunkedComments } from './commentChunkStore.js';
import { commentsStorageKey } from './storageKeys.js';
import { TAIL_MAX_ROWS, tailStorageKey } from './commentTailBuffer.js';
import { mergeTailRowsIntoDisplay } from './mergeTailRowsIntoDisplay.js';
import { parseArrivalCommentText } from './parseArrivalComment.js';

/** 書き出しの本体読み。視聴中は組み立てに数秒かかることがある。短い時間切れでテールだけに落ちない。 */
export const EXPORT_COMMENT_READ_TIMEOUT_MS = 20_000;

/**
 * テール行を表示用に正規化(text 空除去・id/liveId/capturedAt 補完)。popup の同名ヘルパと同一。
 * @param {unknown} rows
 * @param {string} lv
 * @param {number} nowMs
 * @returns {Array<Record<string, unknown>>}
 */
export function normalizeTailRowsForDisplay(rows, lv, nowMs) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const lid = String(lv || '').trim().toLowerCase();
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = /** @type {Record<string, unknown>} */ (rows[i]);
    if (!r || typeof r !== 'object') continue;
    const text = String(r.text ?? '').trim();
    if (!text) continue;
    const cap = Number(r.capturedAt);
    const hasCap = Number.isFinite(cap) && cap > 0;
    // 来場文の時刻は取り込み時に入っている。表示のときに「今」を打つと、
    // 別の時刻の本物の来場が同じ瞬間に見え、件数を落とす。
    /** @type {Record<string, unknown>} */
    const row = {
      ...r,
      id: String(r.id || `nls_tail_${lid}_${i}`),
      liveId: lid,
      text
    };
    if (hasCap) row.capturedAt = cap;
    else if (!parseArrivalCommentText(text)) row.capturedAt = nowMs;
    out.push(row);
  }
  return out;
}

/**
 * 放送の全コメントを多段ソースで読む。優先: IDB → chrome.storage チャンク → テール連結。
 *
 * @param {string} lv lv123...
 * @param {{
 *   readAllFromCommentDb: (lv: string) => Promise<unknown[]|null>,
 *   getMany: (keys: string[]) => Promise<Record<string, unknown>>,
 *   nowMs: number
 * }} deps
 *   - readAllFromCommentDb: 拡張オリジン IDB から全件(無ければ null)。popup/live-view が本物を渡す。
 *   - getMany: chrome.storage.local.get 相当(リトライ付きでも素でも可)。
 *   - nowMs: Date.now()(テスト固定用に注入)。
 * @returns {Promise<unknown[]>}
 */
export async function readAllCommentsForLive(lv, deps) {
  const { readAllFromCommentDb, getMany, nowMs } = deps;
  // IDB に当該 live のデータがあれば最優先（SW 集約書きの正本）。
  const fromDb = await readAllFromCommentDb(lv);
  if (Array.isArray(fromDb) && fromDb.length) return fromDb;
  const mainKey = commentsStorageKey(lv);
  /** @type {unknown[]} */
  let rows = [];
  try {
    const res = await readChunkedComments(lv, mainKey, (keys) => getMany(keys));
    rows = Array.isArray(res.rows) ? res.rows : [];
  } catch {
    rows = [];
  }
  try {
    const tKey = tailStorageKey(lv);
    const tailBag = await getMany([tKey]);
    const tail = normalizeTailRowsForDisplay(
      /** @type {Record<string, unknown>} */ (tailBag)[tKey],
      lv,
      nowMs
    );
    if (tail.length) rows = mergeTailRowsIntoDisplay(rows, tail, { liveId: lv });
  } catch {
    /* テールは任意（取れなければ本体のみ） */
  }
  return rows;
}

/**
 * 本体が空で、テールが画面用の上限以上なら、本体の読みが間に合わず最新分だけが返った。
 * 記録の本体は別にあるので、もう一度読む。テールだけの本物の記録(上限未満)は読み直さない。
 * @param {unknown} bodyRows
 * @param {unknown} tailRows
 */
export function exportBodyNeedsAnotherRead(bodyRows, tailRows) {
  const bodyN = Array.isArray(bodyRows) ? bodyRows.length : 0;
  const tailN = Array.isArray(tailRows) ? tailRows.length : 0;
  return bodyN === 0 && tailN >= TAIL_MAX_ROWS;
}

/**
 * 書き出しの行。本体があればテールは未保存の足し分だけ。本体が空のときはテールを残す(捨てない)。
 * @param {unknown} bodyRows
 * @param {unknown} tailRows
 * @param {string} liveId
 */
export function assembleExportComments(bodyRows, tailRows, liveId) {
  const body = Array.isArray(bodyRows) ? bodyRows : [];
  const tail = Array.isArray(tailRows) ? tailRows : [];
  if (!tail.length) return body;
  if (!body.length) return tail;
  return mergeTailRowsIntoDisplay(body, tail, { liveId });
}

/**
 * @param {string} lv
 * @param {(keys: string[]) => Promise<Record<string, unknown>>} getMany
 * @param {number} nowMs
 */
async function readStoredBodyAndTail(lv, getMany, nowMs) {
  const mainKey = commentsStorageKey(lv);
  /** @type {unknown[]} */
  let rows = [];
  try {
    const res = await readChunkedComments(lv, mainKey, (keys) => getMany(keys));
    rows = Array.isArray(res.rows) ? res.rows : [];
  } catch {
    rows = [];
  }
  /** @type {unknown[]} */
  let tail = [];
  try {
    const tKey = tailStorageKey(lv);
    const tailBag = await getMany([tKey]);
    tail = normalizeTailRowsForDisplay(
      /** @type {Record<string, unknown>} */ (tailBag)[tKey],
      lv,
      nowMs
    );
  } catch {
    tail = [];
  }
  return { rows, tail };
}

/**
 * 書き出し専用の全件。視聴タブが開いているあいだ、画面用テールは最新 TAIL_MAX_ROWS 件だけになる。
 * 本体の読みが時間切れで空だと、そのテールだけを書き出して前半が落ちる。本体が空でテールが上限以上なら、
 * 組み立てが終わったあとの本体をもう一度読む。表示の見回りはここを使わない。
 * @param {string} lv
 * @param {{
 *   readAllFromCommentDb: (lv: string) => Promise<unknown[]|null>,
 *   getMany: (keys: string[]) => Promise<Record<string, unknown>>,
 *   nowMs: number
 * }} deps
 */
export async function readCommentsForExport(lv, deps) {
  const { readAllFromCommentDb, getMany, nowMs } = deps;
  const fromDb = await readAllFromCommentDb(lv);
  const dbRows = Array.isArray(fromDb) ? fromDb : [];
  let stored = await readStoredBodyAndTail(lv, getMany, nowMs);
  if (exportBodyNeedsAnotherRead(stored.rows, stored.tail)) {
    const again = await readStoredBodyAndTail(lv, getMany, nowMs);
    if (again.rows.length) stored = again;
  }
  // 視聴中の画面用テール(最新2000件)より、保存した本体の長い方を正本にする。短い方で上書きしない。
  const body = stored.rows.length >= dbRows.length ? stored.rows : dbRows;
  return assembleExportComments(body, stored.tail, lv);
}
