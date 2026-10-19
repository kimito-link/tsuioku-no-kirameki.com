/**
 * 応援マス(グリッド)を「増えた分だけ足す」か「全部作り直す」かの判定(純関数・I/O禁止)。v0.1.1689
 *
 * ■ なぜ要るか(2026-10-19・実機の報告「POPのここがちらちらする」)
 *   新コメが1件増えるたび、グリッドは全マス(最大360)を作り直していた。作り直した <img> は合成済みの顔(PNG)と
 *   その鍵を失い、仮の顔(SVG)から描き直しになる。灰色の仮顔と合成済みの顔が混ざって見えるちらつきの最有力。
 *   既存のマスはそのまま残し、増えた分だけ足せば、顔は最初から出たままになる。
 *
 * ■ 足してよい条件(どれか外れたら従来どおり全部作り直す=安全側)
 *   - すでに1枚以上描いていて、これから増える(描いた数 < 目標)。
 *   - 画面の <img> の数が「描いた数」と一致している(ずれていたら信用せず作り直す)。
 *   - 窓の先頭が 0(スライドしていない=index と絶対位置が一致する)。
 * @module storyGrowthAppendPlan
 */

/**
 * @param {{ renderedCount?: number, targetCount?: number, domCount?: number, sourceOffset?: number }} s
 * @returns {boolean}
 */
export function canAppendStoryGrowthCells(s) {
  const a = s && typeof s === 'object' ? s : {};
  const rendered = Number(a.renderedCount);
  const target = Number(a.targetCount);
  const dom = Number(a.domCount);
  const offset = Number(a.sourceOffset) || 0;
  if (![rendered, target, dom].every(Number.isFinite)) return false;
  if (rendered <= 0) return false;
  if (target <= rendered) return false;
  if (dom !== rendered) return false;
  if (offset !== 0) return false;
  return true;
}
