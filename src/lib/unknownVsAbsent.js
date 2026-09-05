/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】「空っぽ」を【無い】と【まだ分からない】に仕分ける判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】「無い/まだ分からない」の仕分けはこのファイルのみ
 *
 * unknownVsAbsent.js — ★このリポで【4回以上再発している型】を止めるための正本。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★何が問題だったのか(記憶 fail-open-recurs-under-new-names-2026-08-12)
 *
 *   > 真の欠陥は**「無い」と「まだ分からない」を同じ枝に入れたこと**。
 *   >   無い(別配信・初回描画)      → 通してよい
 *   >   ★未確定(起動直後・ID未設定) → 通してはいけない
 *
 *   応援レーンのタイル消失は、この1つの型が**別名で4回**再発した:
 *     DOM が 0枚 / prev <= 0 / roster <= 0 / !rosterLid
 *   ★どれも単体では正しく見える(「守る対象が無いなら止める理由が無い」)。
 *
 * ■ ★2026-08-21 に、同じ型がさらに4件見つかった(全部【別の場所】)
 *   B1 popup-entry.js:8776   `if (cnt <= 0) return null`
 *      → IDBが0件＝**まだ移行途中かもしれない**のに「chunkを読む必要なし」と決めた
 *   B2 background.js:379-397 read 失敗を `[]` に握り潰し、移行済みフラグを立てた
 *      → **失敗した(分からない)** を **無い** として確定させた
 *   ②  autoSectionCensus.js  `totalMs === 0`
 *      → ★逆向きの同型。0.7ms **測れているのに** 表示は 0ms なので
 *        「まだ何も測っていない」判定を**すり抜けた**
 *   C5 numberConsistency.js  別配信の値かもしれないのに比べた
 *
 * ■ ★だから個別に塞がない
 *   4件を個別に直しても**5件目が別の名前で来る**(記録がそう証明している)。
 *   ★この箱で「どちらなのか」を**宣言させる**。宣言しない限り UNKNOWN に倒す。
 *
 * ■ ★設計の芯: 迷ったら UNKNOWN(fail-closed)
 *   「無い」と言い切るには**根拠(測れたこと)が要る**。
 *   根拠が無い空っぽは、無いのではなく**まだ分からない**。
 * ───────────────────────────────────────────────────────────────────────────
 */

/** ★本当に無い。通してよい(別配信・初回・対象外など)。 */
export const ABSENT = 'absent';

/** ★まだ分からない。通してはいけない(起動直後・読み失敗・ID未設定など)。 */
export const UNKNOWN = 'unknown';

/** ★値がある。 */
export const PRESENT = 'present';

/**
 * @typedef {object} EmptyClassification
 * @property {'present'|'absent'|'unknown'} kind ★判定(構造で返す＝文字列に閉じない)
 * @property {boolean} comparable ★この値を他の数字と比べてよいか
 * @property {string} reason 人が読む理由(そのまま画面に出せる)
 */

/**
 * 「空っぽ」を【無い】と【まだ分からない】に仕分ける。
 *
 * ★measured を省略したら UNKNOWN に倒す(fail-closed)。
 *   「測ったのか」を書かない限り「無い」とは名乗れない、という強制。
 *
 * @param {object} input
 * @param {unknown} input.value 実際の値(0 / null / undefined / 配列など)
 * @param {boolean} [input.measured] 測れたか。★省略時は false 扱い＝UNKNOWN
 * @param {string} [input.reason] 理由(画面に出す)
 * @returns {EmptyClassification}
 */
export function classifyEmpty(input) {
  const value = input?.value;
  const measured = input?.measured === true;
  const reason = typeof input?.reason === 'string' ? input.reason : '';

  // ★「測れなかった値」を 0 として扱わない(Number(null)===0 の穴を今日4回踏んだ)
  const isEmpty =
    value == null
    || (typeof value === 'number' && (!Number.isFinite(value) || value === 0))
    || (Array.isArray(value) && value.length === 0)
    || (typeof value === 'string' && value.trim() === '');

  if (!isEmpty) {
    return { kind: PRESENT, comparable: true, reason: reason || '値があります' };
  }
  if (!measured) {
    return {
      kind: UNKNOWN,
      comparable: false,
      reason: reason || '★まだ分かりません(測れていないので「無い」とは言えません)'
    };
  }
  return { kind: ABSENT, comparable: true, reason: reason || '本当にありません(測った上で0件)' };
}

/**
 * 2つの数字を**比べてよいか**を判定する。
 *
 * ★このリポの実損: 記録3,358 と レポート409 を比べて「過小集計」と誤って名指しした。
 *   実際は ① 別配信の値かもしれない(単一グローバルキー) ② 母集団が違う
 *   ③ 片方は単調増加の高水位、で**そもそも比較不能**だった。
 *
 * ★[[lifetime-counters-without-since-cannot-be-compared]] と同じ考え方。
 *
 * @param {object} input
 * @param {string} [input.leftId] 左の出どころID(配信IDなど)
 * @param {string} [input.rightId] 右の出どころID
 * @param {string} [input.what] 何を比べようとしたか(画面に出す)
 * @returns {EmptyClassification}
 */
export function classifyComparability(input) {
  const left = String(input?.leftId ?? '').trim().toLowerCase();
  const right = String(input?.rightId ?? '').trim().toLowerCase();
  const what = typeof input?.what === 'string' && input.what ? input.what : 'この2つの数字';

  if (!left || !right) {
    return {
      kind: UNKNOWN,
      comparable: false,
      reason: `${what}は比べられません(どちらの出どころか分からないため)`
    };
  }
  if (left !== right) {
    return {
      kind: UNKNOWN,
      comparable: false,
      reason: `${what}は比べられません(別の対象の値です: ${left} と ${right})`
    };
  }
  return { kind: PRESENT, comparable: true, reason: `${what}は同じ対象なので比べられます` };
}

/**
 * ★丸めをまたいだ厳密比較を避けるための「実質ゼロ」判定。
 *
 * ★実損(2026-08-21): `totalMs === 0` で門番を作ったが、`performance.now()` の
 *   小数が積まれて 0.7 になり、**表示は 0ms なのに判定は素通り**した。
 *   ＝ ★**表示している値と判定している値が違う**のが穴。
 *
 * @param {unknown} value
 * @param {number} [epsilon] これ未満を実質ゼロとみなす(既定 0.5＝四捨五入で0msになる範囲)
 * @returns {boolean}
 */
export function isEffectivelyZero(value, epsilon = 0.5) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const eps = typeof epsilon === 'number' && Number.isFinite(epsilon) ? Math.abs(epsilon) : 0.5;
  return Math.abs(value) < eps;
}
