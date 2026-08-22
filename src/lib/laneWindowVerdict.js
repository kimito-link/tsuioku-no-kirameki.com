/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】応援レーンを「窓」にするかどうかの判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】レーンを窓にする条件はこのファイルのみ
 *
 * laneWindowVerdict.js — ★多人数のとき、レーンを「窓」で見せるかを決める。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★これは「上限(cap)」ではない
 *   窓は【見せ方】を変えるだけで、★タイルを1枚も消さない。
 *   DOM には全員が居たままで、スクロールすれば全員に到達できる。
 *   ③WEB鏡・会場の顔ぶれにも影響しない(鏡は DOM を読まず buckets から作る)。
 *
 *   ★cap(上限で切る)は v0.1.1234 で撤廃済み。実配信で238人が会場に載らず
 *     「①DOM≠鏡」になった。v0.1.1052 でも同型(①211≠③99)。
 *     ★同じ穴を3度目に踏まないため、この箱は【件数を減らす判断を一切しない】。
 *
 * ■ ★なぜ今これが要るのか(前提が消えたのに対策が戻らなかった型)
 *   v0.1.1051 上限48→200 ＋【40vh の縦スクロール枠】を追加
 *   v0.1.1139 上限200→48 ＋ ★枠を撤去(「48なら要らない」)
 *   v0.1.1232 ★①の上限を撤廃
 *   v0.1.1234 ★③鏡の cap も撤廃
 *   ⟹ ★上限は消えたのに、枠は戻らなかった。
 *     実機(857人)でタイルが数百枚展開し、画面を突き抜けた。
 *     実測: 基準DOM 1,100個 → 857枚で 5,385個(推奨1,500の3.6倍)。
 *
 * ■ ★使わない手口(このリポで実測否定済み)
 *   content-visibility … v0.1.648 で撤去(18,300件配信で白化)。★2回撤去している
 *   contain: size      … 2026-08-19 実測で高さ0・クリック判定が壊れた
 *   ⟹ 素直な max-height + overflow-y だけを使う。
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * 窓にする下限[枚]。
 *
 * ★49の根拠: 48は v0.1.1139〜1232 で実際に使われていた上限値＝
 *   「48枚までは窓なしで収まっていた」という実績がある。
 *   その1枚上から窓にすれば、★従来の体験を1枚も変えない。
 */
export const LANE_WINDOW_MIN_TILES = 49;

/**
 * レーンを窓にするか。
 *
 * @param {object} input
 * @param {unknown} input.tileCount このレーンのタイル枚数(buckets の件数。★DOM は読まない)
 * @param {unknown} [input.isVenue] 会場モードか(会場は元々スクロールする器を持つ＝対象外)
 * @returns {{ windowed: boolean, reason: string }} ★判定は構造で返す(文字列に閉じない)
 */
export function judgeLaneWindow(input) {
  const isVenue = input?.isVenue === true;
  if (isVenue) {
    return { windowed: false, reason: 'venue-has-own-scroll' };
  }

  /*
   * ★測れていない件数で窓を出さない(「無い」と「まだ分からない」を混ぜない)。
   * ★Number(null) は 0 になるので Number() に通す前に型で弾く。
   *   このリポは同じ穴を2026-08-21 だけで4回踏んでいる
   *   (popupDomCensus / aboutBlankGapVerdict / parityVerdict / improvementLedger)。
   *   ★今回もテストが先に見つけた。
   */
  const raw = input?.tileCount;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return { windowed: false, reason: 'count-unknown' };
  }
  const n = raw;
  if (n < LANE_WINDOW_MIN_TILES) {
    return { windowed: false, reason: 'fits-without-window' };
  }
  return { windowed: true, reason: 'many-tiles' };
}
