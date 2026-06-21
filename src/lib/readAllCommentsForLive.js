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
import { tailStorageKey } from './commentTailBuffer.js';

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
    out.push({
      ...r,
      id: String(r.id || `nls_tail_${lid}_${i}`),
      liveId: lid,
      text,
      capturedAt: Number.isFinite(cap) && cap > 0 ? cap : nowMs
    });
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
    if (tail.length) rows = rows.concat(tail);
  } catch {
    /* テールは任意（取れなければ本体のみ） */
  }
  return rows;
}
