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

/**
 * 書き直しの最短間隔[ms]。コメントが速い配信で、全件の複製を毎秒走らせない。
 */
export const SESSION_COMMENT_PERSIST_MIN_INTERVAL_MS = 30_000;

/**
 * 件数がこの倍率以上に増えたら書き直す。
 *   再オープンで命中する条件は「保存分 ≥ 現在の件数の80%」(isSessionCommentCacheFresh)。
 *   1/1.15 ≒ 87% なので、この倍率で書き直していれば保存分は常に命中条件(80%)を満たし続ける。
 */
export const SESSION_COMMENT_PERSIST_GROWTH_RATIO = 1.15;

/**
 * 全件配列を chrome.storage.session へ複製(structured clone)する必要があるか(純関数)。
 *
 * ■ 直す不具合(2026-10-12・perf-ab/profile-popup.mjs --settle 65 で実測)
 *   視聴ページ内パネルは、読み込みの約1分後から占有率が約95%に張り付く。その中の約3割(20秒窓で約6秒)が、
 *   heavy の全件読みのたびに全件配列を session へ書く処理だった(複製はメインスレッドのネイティブ処理)。
 *   同じ配信・ほぼ同じ件数でも refresh のたびに書き直していたが、この保存が効く(再オープンで命中する)
 *   のは保存分が現在の80%以上あるときだけで、書き直すべきなのは件数が増えて足りなくなるときだけ。
 *
 * ■ 判定
 *   書く: 初回/別の配信/時計が戻った/入力が壊れている(判定できないときは従来どおり書く側に倒す)
 *   書く: 最短間隔(30秒)を過ぎていて、件数が保存時の 1.15 倍以上に増えた
 *   書かない: それ以外
 *
 * @param {{ lv?: unknown, len?: unknown, at?: unknown }|null|undefined} prev 最後に書いた記録(この文書の記憶)
 * @param {string} lv 今の配信
 * @param {number} arrLen 今書こうとしている配列の件数
 * @param {number} nowMs
 * @returns {boolean}
 */
export function shouldPersistSessionCommentCache(prev, lv, arrLen, nowMs) {
  const want = String(lv || '').trim().toLowerCase();
  if (!want || !prev || typeof prev !== 'object') return true;
  if (prev.lv !== want) return true;
  const len = Number(prev.len);
  const at = Number(prev.at);
  if (!Number.isFinite(len) || len <= 0 || !Number.isFinite(at)) return true;
  if (nowMs < at) return true;
  if (nowMs - at < SESSION_COMMENT_PERSIST_MIN_INTERVAL_MS) return false;
  const n = Number(arrLen);
  if (!Number.isFinite(n)) return true;
  return n >= len * SESSION_COMMENT_PERSIST_GROWTH_RATIO;
}
