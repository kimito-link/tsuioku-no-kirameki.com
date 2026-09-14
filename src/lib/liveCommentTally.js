/**
 * liveCommentTally.js — 「コメントで応援した人」の件数だけを数える純関数(2026-09-14)。
 *
 * ■ なぜ要るか
 *   `/live/`(追憶のきらめき ランキング)は「支えた人」が主役なのに、枠が
 *   「🎁 ギフト」「📣 広告」の 2 つだけだった。拡張本体の中核である
 *   「コメントで応援した人」が公開ページに居ない。
 *
 * ■ ★数えるのは件数だけ。本文・時刻・vpos は【保存しない】
 *   誰が何件コメントしたか、という数だけをここで畳み込む。本文を持ち回らない形に
 *   することで、著作権の論点を構造で回避する(設計で決着済み・蒸し返さない)。
 *
 * ■ 入力
 *   `ndgrChatsToMergeRows()`(src/lib/ndgrChatRows.js)の出力 `NdgrMergeRow[]`。
 *   採用判定(ギフト定型文の除外・匿名ニックネーム補完・userId の決め方)は
 *   すべて向こうが済ませてある。ここでは【数えるだけ】。
 *
 * ■ 匿名(184)の扱い(ユーザー決定 2026-09-14)
 *   匿名も件数順にそのまま並べる。後ろへ送らない。表示側が「匿名NNN」＋似顔絵で
 *   識別できる形にする(anonymousDisplayLabel / anonymousIdenticonDataUrl)。
 *   匿名判定は `isAnonymousStyleNicoUserId`(supportGrowthTileSrc.js)に委ねる
 *   ＝ここで判定式を書き直さない。
 *
 * ■ 副作用なし・DOM/ネットワーク参照なし(src/lib の掟)。
 *
 * @module liveCommentTally
 */

import { isAnonymousStyleNicoUserId } from './supportGrowthTileSrc.js';

/** 表示名の最大長(コードポイント単位)。長い名前で保存形が膨らむのを防ぐ。 */
export const TALLY_NAME_MAX = 80;

/** 既定の順位表の長さ。保存形(Redis)と画面の両方がこの本数で揃う。 */
export const TALLY_DEFAULT_LIMIT = 10;

/**
 * @typedef {{ rank: number, uid: string, name: string, count: number, anon: boolean }} CommentRanker
 */

/**
 * @typedef {{
 *   rankers: CommentRanker[],
 *   commenters: number,
 *   comments: number,
 *   anonCommenters: number
 * }} CommentTallyResult
 */

/**
 * 文字列を 1 行に正規化してコードポイント単位で切り詰める(サロゲートペアを割らない)。
 * @param {unknown} v
 * @param {number} max
 * @returns {string}
 */
function trimName(v, max) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const cp = Array.from(s);
  return cp.length > max ? cp.slice(0, max).join('') : s;
}

/**
 * 1 配信ぶんの「コメントで応援した人」を数える畳み込み器を作る。
 *
 * ★同じ行を 2 度渡しても 1 回しか数えない(コメント番号がある行だけ)。巡回は区画が
 *   重なることがあるため、呼び出し側が重複を気にせず `add()` できるようにする。
 *   ★コメント番号が空の行(匿名 184 で `no` が来ないことがある)は毎回数える。
 *   ここで text+時刻の合成キーを作ると本文を持つことになるので作らない。
 *
 * @param {{ broadcasterUid?: unknown, limit?: number }} [opts]
 *   `broadcasterUid` 配信者本人の数値 ID(この人は「応援した人」ではないので数えない)。
 * @returns {{ add: (rows: unknown) => void, result: () => CommentTallyResult }}
 */
export function createCommentTally(opts) {
  const broadcaster = String((opts && opts.broadcasterUid) ?? '').trim();
  const rawLimit = opts && typeof opts.limit === 'number' ? Math.floor(opts.limit) : TALLY_DEFAULT_LIMIT;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : TALLY_DEFAULT_LIMIT;

  /** @type {Map<string, { name: string, count: number, anon: boolean }>} 先着順(Map は挿入順を保つ)。 */
  const byUid = new Map();
  /** @type {Set<string>} 既に数えたコメント番号(重複 add の防波堤)。 */
  const seenNo = new Set();
  let comments = 0;

  return {
    add(rows) {
      if (!Array.isArray(rows) || !rows.length) return;
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const uid = String(/** @type {any} */ (row).userId ?? '').trim();
        if (!uid) continue;
        if (broadcaster && uid === broadcaster) continue;
        const no = String(/** @type {any} */ (row).commentNo ?? '').trim();
        if (no) {
          if (seenNo.has(no)) continue;
          seenNo.add(no);
        }
        const anon = isAnonymousStyleNicoUserId(uid);
        const cur = byUid.get(uid);
        if (cur) {
          cur.count += 1;
          // ★名前は後から届くことがある(匿名ニックネーム補完)。空のときだけ埋める。
          if (!cur.name && !anon) {
            cur.name = trimName(/** @type {any} */ (row).nickname, TALLY_NAME_MAX);
          }
        } else {
          byUid.set(uid, {
            // ★匿名は名前を持たない(表示側が「匿名NNN」を作る)。保存形に不要な文字を入れない。
            name: anon ? '' : trimName(/** @type {any} */ (row).nickname, TALLY_NAME_MAX),
            count: 1,
            anon
          });
        }
        comments += 1;
      }
    },
    result() {
      // ★件数降順・同数は先着順(Map の挿入順を index で固定してから安定ソートに乗せる)。
      const entries = Array.from(byUid.entries()).map(([uid, v], i) => ({ uid, ...v, i }));
      entries.sort((a, b) => (b.count - a.count) || (a.i - b.i));
      const rankers = entries.slice(0, limit).map((e, i) => ({
        rank: i + 1,
        uid: e.uid,
        name: e.name,
        count: e.count,
        anon: e.anon
      }));
      let anonCommenters = 0;
      for (const e of entries) if (e.anon) anonCommenters += 1;
      return { rankers, commenters: entries.length, comments, anonCommenters };
    }
  };
}
