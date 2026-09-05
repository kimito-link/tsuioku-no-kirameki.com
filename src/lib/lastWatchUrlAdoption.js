/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】last_watch_url の lv を「視聴中」として採用してよいかの判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】last_watch_url フォールバックの採用可否はこのファイルのみ
 *
 * lastWatchUrlAdoption.js — ★閉じた放送を「視聴中」に出さない。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★なぜ要るか(2026-08-23 ユーザー指摘)
 *   「今放送とじてだれのほうほうも見てないのに ここにでるってへんじゃない？」
 *
 *   ★実コードで確定した経緯:
 *     status-entry.js の経路3(last_watch_url フォールバック)は、
 *     watch タブが 0 のときだけ通る稀パス。
 *     そこで `panel_summary.updatedAt` を1回 read し、
 *     ★【3分以内なら視聴中として採用】していた。
 *
 *   ★穴: panel_summary は content が約2秒ごとに書く。
 *     放送を閉じた【直後】は updatedAt が数秒前＝「新しい」と判定される。
 *     ⟹ ★閉じてから最大3分、閉じた放送が「視聴中」に居座る。
 *
 * ■ ★「無い」と「まだ分からない」を分ける(このリポの繰り返しの型)
 *   このリポには `nls_live_ended_<lv>`(liveEndedFlag)という
 *   ★【終わったことを知っている印】が既にあり、status の他の場所は読んでいる
 *   (status-entry.js:1636, 3332)。★経路3だけが読んでいなかった＝配線漏れ。
 *
 *   ★鮮度は「まだ分からない」ための代理でしかない。
 *   終了の印という【直接の答え】があるなら、そちらを先に見る。
 *
 * ■ ★なぜ鮮度ガードを消さないか
 *   終了の印は content が DOM から検知して書く＝★書けないまま閉じることがある
 *   (タブを即座に閉じた・検知に失敗した)。
 *   ⟹ 印が無いときは今までどおり鮮度で判断する。★二段構え。
 *
 * ■ ★この判定がしないこと
 *   「本当に視聴中か」は判定しない。★watch タブが 0 の稀パスで、
 *   last_watch_url の lv を採用してよいかだけを決める。
 * ───────────────────────────────────────────────────────────────────────────
 */

/** 採用する。 */
export const ADOPT = 'adopt';
/** 採用しない。 */
export const REJECT = 'reject';

/**
 * @typedef {object} AdoptionVerdict
 * @property {'adopt'|'reject'} decision
 * @property {string} reason ★なぜそう決めたか(速報に出して人が検算できるように)
 */

/**
 * last_watch_url から拾った lv を「視聴中」として採用してよいか。
 *
 * ★判定の順序に意味がある:
 *   1. ★終了の印があるなら、鮮度を見るまでもなく reject(直接の答えを優先)
 *   2. 印が無いときだけ鮮度で判断(印を書けずに閉じた場合の保険)
 *
 * @param {object} input
 * @param {unknown} [input.endedAt]
 *   `nls_live_ended_<lv>` の endedAt。0 / null / undefined なら「印なし」。
 * @param {boolean} [input.fresh]
 *   panel_summary の updatedAt が鮮度しきい値以内か(isLastWatchUrlFresh の結果)。
 * @returns {AdoptionVerdict}
 */
export function judgeLastWatchUrlAdoption(input) {
  // ★終了の印を最優先で見る。あるなら鮮度がどれだけ新しくても採用しない。
  //   (閉じた直後は panel_summary が数秒前＝必ず「新しい」ため)
  const endedRaw = input?.endedAt;
  const ended = Number(endedRaw);
  if (Number.isFinite(ended) && ended > 0) {
    return {
      decision: REJECT,
      reason: '★この放送は終了済みの印があります(視聴中には出しません)'
    };
  }

  // ★印が無い＝「終わっていない」ではなく「まだ分からない」。
  //   content が印を書けずに閉じた可能性があるので、鮮度で判断する。
  if (input?.fresh === true) {
    return {
      decision: ADOPT,
      reason: '終了の印は無く、記録が新しいので視聴中とみなします'
    };
  }

  return {
    decision: REJECT,
    reason: '記録が古い(または読めない)ので視聴中とは言えません'
  };
}

/**
 * 採用してよいかを真偽値で返す薄い口(呼び出し側を短くするだけ)。
 *
 * @param {object} input judgeLastWatchUrlAdoption と同じ
 * @returns {boolean}
 */
export function shouldAdoptLastWatchUrl(input) {
  return judgeLastWatchUrlAdoption(input).decision === ADOPT;
}
