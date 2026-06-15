// sessionCommentCache.js
// v0.1.650: JSONキャッシュ即時表示の本丸。「開いた瞬間に全コメント表示・ローディングなし」。
//
// 真因(3視点会議で確定): IDB(commentDb.js)も即時化機構(canReuseHeavyChunkRead)も既にある。
//   唯一の穴は watchMetaCache.lastCommentsArr(popup-entry.js)が in-memory 変数で、action
//   popup を閉じると JS context ごと揮発すること。再オープンするたび IDB 全件 async 読み
//   (summary→heavy の2段階paint)に戻り、星野ロミ式「一度取れば即」が効かなかった。
//
// 解決(会議裁定): chrome.storage.session に「直近1 live の全件配列」を1本だけ persist する。
//   session は MV3 で SW 生存中メモリ保持・popup 再オープンを跨ぐ。SW 終了で消えても従来 IDB
//   経路に自動フォールバックするので後退ゼロ。版印は cdbSummary.total(= currentChunkTotal)を
//   流用し、新しいバージョン印を発明しない。
//
// この lib は chrome.* 非依存の純関数のみ(I/O は呼び出し側)。Web版(app/)への布石も兼ねる。

/** chrome.storage.session に置くキー(1 live 上書き・貯めない) */
export const SESSION_COMMENT_CACHE_KEY = 'nls_session_comment_cache_v1';

/**
 * session に persist する配列の上限。巨大配信(超長尺の公式ch等)で session quota(10MB)を
 * 圧迫しないための安全弁。これを超える分は slice で落とす(表示用キャッシュなので末尾優先で
 * 残すかは呼び出し側方針だが、ここでは先頭=古い順を保持して「全部見える」体感を優先)。
 */
export const SESSION_COMMENT_CACHE_MAX_ROWS = 30000;

/**
 * cache payload が今の lv/total と一致して即時再利用してよいか(純関数)。
 * popup-entry.js の cachedHeavyCoverageOk と同思想(80% カバレッジ)。
 *
 * @param {unknown} cache  storage.session から読んだ生値
 * @param {string} lv      今 paint している live id
 * @param {number|null} total  版印(cdbSummary.total 等)。null/0 は「不明」
 * @returns {boolean}
 */
export function isSessionCommentCacheFresh(cache, lv, total) {
  if (!cache || typeof cache !== 'object') return false;
  const c = /** @type {Record<string, unknown>} */ (cache);
  if (Number(c.v) !== 1) return false;
  const want = String(lv || '').trim().toLowerCase();
  if (!want || c.lv !== want) return false;
  if (!Array.isArray(c.arr) || c.arr.length === 0) return false;
  // total 不明(null/0)なら長さだけで許容、判明していれば 80% カバレッジを要求。
  //   total が増えた(新着追記)ときは false になり、呼び出し側が IDB 再読みして上書きする
  //   = stale-while-revalidate と同挙動で後退なし。
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) return true;
  return c.arr.length >= Math.floor(t * 0.8);
}

/**
 * session に保存するペイロードを正規化する(版印 lv+total+writtenAt・cap slice)。
 *
 * @param {string} lv
 * @param {number|null} total
 * @param {unknown[]} arr
 * @param {number} [nowMs]  テスト用に注入可(既定 Date.now())
 * @returns {{ v: number, lv: string, total: number, writtenAt: number, arr: unknown[] }}
 */
export function buildSessionCommentCache(lv, total, arr, nowMs) {
  const safeArr = Array.isArray(arr) ? arr : [];
  const capped =
    safeArr.length > SESSION_COMMENT_CACHE_MAX_ROWS
      ? safeArr.slice(0, SESSION_COMMENT_CACHE_MAX_ROWS)
      : safeArr;
  return {
    v: 1,
    lv: String(lv || '').trim().toLowerCase(),
    total: Math.max(0, Number(total) || 0),
    writtenAt: typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now(),
    arr: capped
  };
}
