/**
 * diagWordingGuard.js — ユーザー向け診断カードの「実害を示唆する語」を検出する純関数(v0.1.835)。
 *
 * 背景(self-verifying loop / stale-DOM v0.1.834 の教訓): 診断 advice card の cause に
 * 「公式値レーンが混乱することがある」と書いてあったが、実コード上その因果は無かった(嘘)。
 * 「散文の因果が実コードと一致するか」は意味照合で機械決定できない=全自動の嘘検出は作らない。
 * 代わりに本関数は薄い"喚起"だけする: severity が 'info'(=実害なしの位置づけ)なのに cause/action に
 * 実害示唆語(混乱/混入/汚染/破壊/失われ…)が混ざっているカードを列挙し、「info なのに不安語=実コードで
 * その因果を裏取りせよ」と人間に促す。嘘の自動判定ではないので誤検知の害は小さい(人間が確認するだけ)。
 *
 * 設計正本=council/self-verifying-loop-SYNTHESIS.md。副作用なし。
 */

/** 実害を示唆する語(info カードには不釣り合い=要裏取りのシグナル)。 */
export const HARM_WORDS = Object.freeze([
  '混乱',
  '混入',
  '汚染',
  '破壊',
  '失われ',
  '壊れ',
  '消えてしま',
  '危険'
]);

/**
 * @typedef {{ id?: unknown, severity?: unknown, symptom?: unknown, cause?: unknown, action?: unknown }} AdviceCardLike
 * @typedef {{ id: string, severity: string, word: string, field: 'cause'|'action' }} HarmHit
 */

/**
 * info カードの cause/action に含まれる実害語を列挙する(空=問題なし)。
 * @param {AdviceCardLike[]|null|undefined} cards
 * @returns {HarmHit[]}
 */
export function findHarmWordsInInfoCards(cards) {
  /** @type {HarmHit[]} */
  const hits = [];
  if (!Array.isArray(cards)) return hits;
  for (const card of cards) {
    if (!card || typeof card !== 'object') continue;
    if (card.severity !== 'info') continue; // info(実害なし位置づけ)だけが対象。
    const id = typeof card.id === 'string' ? card.id : '(no-id)';
    for (const field of /** @type {const} */ (['cause', 'action'])) {
      const text = card[field];
      if (typeof text !== 'string') continue;
      for (const word of HARM_WORDS) {
        if (text.includes(word)) {
          hits.push({ id, severity: 'info', word, field });
        }
      }
    }
  }
  return hits;
}
