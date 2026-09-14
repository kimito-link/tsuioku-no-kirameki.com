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
 * state(run 跨ぎの高水位・全員名簿)に載せる uids の上限人数。
 * これを超える配信は state を書かない=毎 run フル(cap で守られる)。
 * 50B×5000=250KB/配信の上限見積(設計 §5.5)。
 */
export const TALLY_STATE_UIDS_MAX = 5000;

/**
 * @typedef {{ rank: number, uid: string, name: string, count: number, anon: boolean }} CommentRanker
 */

/**
 * @typedef {{ name: string, count: number, anon: boolean }} TallyUidEntry
 */

/**
 * @typedef {{
 *   rankers: CommentRanker[],
 *   commenters: number,
 *   comments: number,
 *   anonCommenters: number,
 *   uids: Record<string, TallyUidEntry>
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
 * @param {{ broadcasterUid?: unknown, limit?: number, seed?: { uids?: Record<string, { name?: unknown, count?: unknown, anon?: unknown }>, comments?: unknown } }} [opts]
 *   `broadcasterUid` 配信者本人の数値 ID(この人は「応援した人」ではないので数えない)。
 *   `seed` 前回 run の結果(`result().uids`・`comments`)。run 跨ぎで先着順と累計を保つために
 *     渡す。`byUid` を seed の挿入順で事前充填し、`comments` を seed 値から始める。
 *     ★`seenNo` は空のまま=前回分の重複除去は呼び出し側の水位フィルタ
 *     (rowsBeyondWater)が担う。ここで seed の no を seenNo に入れると本文/番号を
 *     持ち回ることになり、また水位フィルタとの二重防御で「前回領域を数え直さない」
 *     契約が曖昧になる(ネガコンでこの分離を固定)。
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

  // ★seed(前回 run の結果)を挿入順で事前充填する=先着順を run 跨ぎで保つ。
  //   seenNo は空のまま(前回分は呼び出し側の水位フィルタが弾く・上の jsdoc 参照)。
  const seed = opts && opts.seed && typeof opts.seed === 'object' ? opts.seed : null;
  if (seed) {
    const seedUids = seed.uids && typeof seed.uids === 'object' ? seed.uids : null;
    if (seedUids) {
      for (const [uid, v] of Object.entries(seedUids)) {
        const key = String(uid ?? '').trim();
        if (!key) continue;
        if (broadcaster && key === broadcaster) continue;
        const rawCount = Math.floor(Number(v && v.count));
        byUid.set(key, {
          name: trimName(v ? v.name : '', TALLY_NAME_MAX),
          count: Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 0,
          anon: (v && v.anon) === true
        });
      }
    }
    const seedComments = Math.floor(Number(seed.comments));
    if (Number.isFinite(seedComments) && seedComments > 0) comments = seedComments;
  }

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
      // ★全員(上位 10 ではない)を挿入順=先着順で返す。state に載せて次 run の seed にする。
      //   ★既存 4 キー(rankers/commenters/comments/anonCommenters)は不変。
      /** @type {Record<string, { name: string, count: number, anon: boolean }>} */
      const uids = {};
      for (const [uid, v] of byUid) uids[uid] = { name: v.name, count: v.count, anon: v.anon };
      return { rankers, commenters: entries.length, comments, anonCommenters, uids };
    }
  };
}

/**
 * @typedef {{ maxNo: number|null, maxVpos: number|null, minNo: number|null, minVpos: number|null }} CommentWater
 */

/**
 * 有限数だけ返す。null / undefined / 非有限は null(★`Number(null)===0` の罠を避ける)。
 * @param {unknown} v
 * @returns {number|null}
 */
function finiteOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 行から数値 `no`(commentNo)を取り出す。有限数だけ・それ以外は null。
 * @param {any} row
 * @returns {number|null}
 */
function rowNo(row) {
  const raw = row && row.commentNo != null ? row.commentNo : null;
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * 行から数値 `vpos`(センチ秒)を取り出す。有限かつ 0 以上だけ・それ以外は null。
 * ★minVposOf / minNoOf(ndgrBackfillCrawl.js:327-355)と同じ判定に揃える。
 * @param {any} row
 * @returns {number|null}
 */
function rowVpos(row) {
  const raw = row && row.vpos != null ? row.vpos : null;
  if (raw == null) return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * 前回の高水位より「外側」(新しい/古い)にある行だけ返す(設計 §5.2)。
 *
 * ★二重計上を防ぐ要。増分集計では区画が前回領域と重なるため、前回数えた行を弾く。
 *   `no > maxNo`(新しい側)/ `no < minNo`(古い側)/ `no` 無しは `vpos` で同じ判定。
 *   `no` も `vpos` も無い行は捨てる(位置が決められない=二重計上の恐れ)。
 *   ★water が全部 null(初回)なら全行を返す(このとき no も vpos も無い行も採用する)。
 *
 * @param {unknown} rows `NdgrMergeRow[]`
 * @param {CommentWater} [water]
 * @returns {any[]}
 */
export function rowsBeyondWater(rows, water) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const w = water && typeof water === 'object' ? water : null;
  const maxNo = w ? finiteOrNull(w.maxNo) : null;
  const minNo = w ? finiteOrNull(w.minNo) : null;
  const maxVpos = w ? finiteOrNull(w.maxVpos) : null;
  const minVpos = w ? finiteOrNull(w.minVpos) : null;
  const noWater = maxNo == null && minNo == null && maxVpos == null && minVpos == null;
  if (noWater) return rows.filter((r) => r && typeof r === 'object');
  /** @type {any[]} */
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const no = rowNo(row);
    if (no != null) {
      if ((maxNo != null && no > maxNo) || (minNo != null && no < minNo)) out.push(row);
      continue;
    }
    const vp = rowVpos(row);
    if (vp != null) {
      if ((maxVpos != null && vp > maxVpos) || (minVpos != null && vp < minVpos)) out.push(row);
      continue;
    }
    // ★no も vpos も無い行は位置が決められない=捨てる(water あり時)。
  }
  return out;
}

/**
 * 前回水位 `prev` と今回の行 `rows` から新しい高水位を畳む(設計 §5.3)。
 *
 * ★`no` は Number() 有限のみ・`vpos` は 0 以上の有限のみ(minNoOf/minVposOf と同じ)。
 *   `prev` の各値は「無い(null)」として畳み込みに参加しない。
 *
 * @param {unknown} rows `NdgrMergeRow[]`
 * @param {CommentWater} [prev]
 * @returns {CommentWater}
 */
export function waterOf(rows, prev) {
  const p = prev && typeof prev === 'object' ? prev : null;
  let maxNo = p ? finiteOrNull(p.maxNo) : null;
  let minNo = p ? finiteOrNull(p.minNo) : null;
  let maxVpos = p ? finiteOrNull(p.maxVpos) : null;
  let minVpos = p ? finiteOrNull(p.minVpos) : null;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const no = rowNo(row);
      if (no != null) {
        if (maxNo == null || no > maxNo) maxNo = no;
        if (minNo == null || no < minNo) minNo = no;
      }
      const vp = rowVpos(row);
      if (vp != null) {
        if (maxVpos == null || vp > maxVpos) maxVpos = vp;
        if (minVpos == null || vp < minVpos) minVpos = vp;
      }
    }
  }
  return { maxNo, maxVpos, minNo, minVpos };
}
