/**
 * 計器(yt_diag_*_chat)は1つの置き場を全タブで分け合う。
 * 記録していないタブ(配信が終わったページ・配信していない人のページ等)が、
 * 別のタブが少し前に「記録中」として書いた値を上書きしないための判定。
 * 2026-11-09 PC 実測: TikTok とミクチャで、終わったタブの値に一時的に入れ替わった。
 */

/** 記録中のタブの値を守る時間 */
export const DIAG_KEEP_RECORDING_MS = 120_000;

/** このタブの印 */
export function makeDiagTabToken() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * このタブの計器を書かずに見送るべきか
 * @param {unknown} prev いま置き場にある値
 * @param {{ tab: string, streamKey?: string, now: number }} me
 */
export function shouldSkipDiagWrite(prev, me) {
  if (me.streamKey) return false;
  if (!prev || typeof prev !== 'object') return false;
  const p = /** @type {{ tab?: unknown, streamKey?: unknown, updatedAt?: unknown }} */ (prev);
  if (!p.streamKey || p.tab === me.tab) return false;
  const at = Number(p.updatedAt || 0);
  return Number.isFinite(at) && me.now - at < DIAG_KEEP_RECORDING_MS;
}
