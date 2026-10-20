/**
 * newVsRepeatBasis.js — マーケレポートの「新規 vs 常連」を出してよいか判定する純関数(2026-10-20)。
 *
 * 背景: コメントが多い配信(2,500件超)では、生成を軽くするため過去配信を読まない(pastBroadcasts=[])。
 *   その状態で classifyCommentersAgainstHistory に空の履歴を渡すと、過去に誰も居ない扱いで全員が「新規」に分類され、
 *   「新規 100%・リピーター 0・ヘビー常連 0」が注記なしで出る=嘘の数字(AGENTS §12.7/§12.8: 0 や 100% を捏造しない)。
 *   過去の配信を1枠も突き合わせていないなら、この分類は【できていない】。数字を出さず、理由を出す。
 *
 * @module newVsRepeatBasis
 */

/**
 * @param {number|string|null|undefined} pastBroadcastCount 突き合わせに使えた過去配信の枠数
 * @returns {{ ok: boolean, note: string }}
 */
export function judgeNewVsRepeatBasis(pastBroadcastCount) {
  const n = Number(pastBroadcastCount);
  if (Number.isFinite(n) && n > 0) return { ok: true, note: '' };
  return {
    ok: false,
    note:
      '過去の配信を読み込んでいないため、新規／リピーター／ヘビー常連は未集計です' +
      '(コメントの多い配信では、生成を軽くするため過去配信の読み込みを省略します)。' +
      '過去を突き合わせないと全員が「新規」になってしまうので、数字は出していません。'
  };
}
