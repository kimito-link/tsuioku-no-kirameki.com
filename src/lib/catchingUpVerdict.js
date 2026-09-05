/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】「この配信はまだ追いつき中か」の判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】追いつき中の判定はこのファイルのみ
 *
 * catchingUpVerdict.js — ★「まだ取り込んでいる途中か」を1箇所で決める。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★なぜ切り出したか(2026-08-22)
 *   同じ判定が status-entry.js の【2箇所】に別々の式で書かれていて、
 *   片方だけ `rec > 0` を持っていた。★条件が食い違うと、片方だけ偽陽性を出す。
 *
 * ■ ★実損: 「取得率が下がり続けています(100%→0%)」の誤報
 *   実機(2026-08-22)は取得率30%の【追いつき中】で、同じ速報が
 *   「🟢 正常 — 記録は本家コメ以下＝正常」とも書いていた。
 *
 *   時系列で追うと、配信を開いた直後にこうなる:
 *     0秒  記録0 / 公式0     → 率null(判定から除外)
 *    10秒  記録0 / 公式1,029 → ★率0% ・ rec>0 が false なので catchingUp=false
 *    40秒  記録50            → catchingUp=true
 *   ★この「10秒の点」だけが catchingUp=false で積まれ、
 *     率0%とセットで「単調低下」の材料になった。
 *
 * ■ ★型: 今日4件目の「無い」と「まだ分からない」の混同
 *   記録0件は【追いつき中ではない】ではなく【まだ始まっていない】。
 *   ★放送中で率が100%未満なら、記録0件でも追いつき中として扱う
 *   (記録0件はむしろ"これから取り込む"側＝警告を抑止するのが正しい)。
 *   → 一般則は src/lib/unknownVsAbsent.js
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * 1配信が「まだ追いつき中(取り込み途中)」か。
 *
 * ★true の間は、取得率が見かけ上下がっても【劣化ではない】。
 *   新配信を途中参加で開くと分母(公式)が判明して 100%→低% に落ちるのは正常。
 *
 * @param {object} input
 * @param {unknown} [input.endedAt] 放送終了時刻(あれば終了済み＝追いつき中ではない)
 * @param {unknown} [input.recordedCount] 記録件数。★0でも追いつき中でありうる
 * @param {unknown} [input.officialCount] 公式コメント総数
 * @returns {boolean}
 */
export function isCatchingUp(input) {
  const ended = input?.endedAt;
  // ★終了済みなら追いつき中ではない(もう増えない)
  if (ended != null && ended !== false && ended !== '') return false;

  const off = Number(input?.officialCount);
  const rec = Number(input?.recordedCount);
  // ★公式が分からないうちは「まだ分からない」＝追いつき中として扱う(警告を抑止する側へ倒す)
  if (!Number.isFinite(off) || off <= 0) return true;
  if (!Number.isFinite(rec) || rec < 0) return true;

  // ★率が100%未満なら追いつき中。記録0件でも同じ(まだ始まっていないだけ)。
  return (rec / off) * 100 < 100;
}

/**
 * 配信の一覧から「1つでも追いつき中があるか」。
 *
 * @param {Array<{endedAt?: unknown, recordedCount?: unknown, officialCount?: unknown}>} lives
 * @returns {boolean}
 */
export function anyCatchingUp(lives) {
  if (!Array.isArray(lives)) return false;
  return lives.some((lv) => isCatchingUp(lv || {}));
}
