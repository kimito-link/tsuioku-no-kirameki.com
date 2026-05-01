/**
 * 複数 watch タブで popup.html の prewarm が同時に走るのを防ぐ
 * lease ベースのコーディネータ純粋関数。
 *
 * 設計（0.1.42 X）:
 *   各 watch タブが独立に `prewarmInlinePopupIframe` を実行すると、複数タブが
 *   visible 並行状態のとき全タブで popup.html（10000+ 行 JS）が並列ロード
 *   され、CPU 取り合いで個々の prewarm が遅延 → kon-ta クリック時に iframe
 *   未ロードでパネル表示が遅くなる。
 *
 *   このヘルパは chrome.storage.local の "lease" を介して **同時に prewarm
 *   を走らせるタブを 1 つに絞る** first-write-wins 方式を提供する純粋関数。
 *
 *   各タブは起動時に乱数 instanceId を持ち、prewarm 前にこの関数で判定:
 *     - 'claim'   → lease を自分の名前で書き込んで prewarm を実行
 *     - 'proceed' → 既に自分が lease を持っている、そのまま prewarm 続行
 *     - 'defer'   → 他タブが prewarm 中、一定時間後に再試行
 *
 *   prewarm 完了 / エラー時に lease を空文字に release。タブが落ちて release
 *   されないケースは leaseTimeoutMs（既定 10s）後に他タブが claim 横取り。
 */

/**
 * @typedef {'claim' | 'proceed' | 'defer'} PrewarmLeaseAction
 */

/**
 * @param {{
 *   currentLeaseHolder: unknown,
 *   currentLeaseAt: unknown,
 *   selfId: string,
 *   now: number,
 *   leaseTimeoutMs?: number
 * }} input
 * @returns {PrewarmLeaseAction}
 */
export function decidePrewarmLeaseAction(input) {
  const selfId = String(input.selfId || '').trim();
  if (!selfId) return 'defer';

  const now = Number(input.now);
  const leaseTimeoutMs = Number(input.leaseTimeoutMs ?? 10_000);

  const holder = String(input.currentLeaseHolder ?? '').trim();
  const heldAt = Number(input.currentLeaseAt ?? 0);

  // lease が空 / 無効 → claim
  if (!holder) return 'claim';

  // 自分が保持中 → そのまま続行
  if (holder === selfId) return 'proceed';

  // 他者が保持中 — TTL 判定
  if (!Number.isFinite(heldAt) || heldAt <= 0) {
    // タイムスタンプが壊れている → 保守的に defer
    return 'defer';
  }

  // 未来の timestamp（時計ズレ・別 PC の clock skew）→ defer
  if (heldAt > now) return 'defer';

  const elapsed = now - heldAt;
  if (elapsed > leaseTimeoutMs) {
    // 古い lease → 横取り
    return 'claim';
  }

  return 'defer';
}
