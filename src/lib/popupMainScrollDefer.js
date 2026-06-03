/**
 * 拡張ポップアップ `.nl-main` スクロール中に重い DOM 更新を見送るかどうか。
 * content-entry の DOM 取得 defer と同思想（スクロール中のメインスレッド奪取を避ける）。
 */

/** @param {number} lastScrollAtMs @param {number} [nowMs] @param {number} [deferMs] */
export function shouldDeferHeavyPopupPaintDuringScroll(
  lastScrollAtMs,
  nowMs = Date.now(),
  deferMs = 180
) {
  if (!Number.isFinite(lastScrollAtMs) || lastScrollAtMs <= 0) return false;
  if (!Number.isFinite(nowMs) || !Number.isFinite(deferMs) || deferMs <= 0) return false;
  return nowMs - lastScrollAtMs < deferMs;
}
