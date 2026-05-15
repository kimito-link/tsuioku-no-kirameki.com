/**
 * インラインパネル host element が toolbar 起点の「前面化」操作を受けられる
 * 状態かを判定する純粋関数。content-entry 側の DOM 直接アクセスを切り離し、
 * unit test 可能にしておくことで、判定条件の追加/変更で再帰実装ミスを防ぐ。
 *
 * 経緯（B1 race fix）:
 *   content-entry 側の `focusInlinePanelHostFromToolbar` は `renderPageFrameOverlay()`
 *   後に host の可視状態を見て boolean を返す。挿入直後は layout 未確定で rect が
 *   小さい瞬間があるため、**応答用**の軽量判定は `shouldRespondFocusedNowFromToolbar`、
 *   **iframe フォーカス用**の厳しめ判定は `isInlinePanelHostReadyForFocus`（必要なら
 *   pollUntil）に分離している。
 */

/**
 * @param {{ isConnected: boolean } | null | undefined} host
 * @param {{
 *   getComputedStyle: (el: object) => { display: string, visibility: string },
 *   getBoundingClientRect: (el: object) => { width: number, height: number },
 *   minSize?: number
 * }} deps
 * @returns {boolean}
 */
export function isInlinePanelHostReadyForFocus(host, deps) {
  if (!host || !host.isConnected) return false;
  const cs = deps.getComputedStyle(host);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  const r = deps.getBoundingClientRect(host);
  const min = typeof deps.minSize === 'number' ? deps.minSize : 120;
  return r.width >= min && r.height >= min;
}

/**
 * 0.1.15 (M/N): toolbar からの NLS_FOCUS_INLINE_PANEL 受信時に、background.js
 * へ「インライン側で扱った（focused=true）」を即座に応答するべきかの判定。
 *
 * 旧 isInlinePanelHostReadyForFocus は rect 120×120 を待っていたため、
 *   - rect が確定しない transient タイミングで pollUntil(500ms) 待ち
 *   - 待った末に false を返すと background が popup 窓を開く
 *   - 一度 close ボタンで display:none された host も rect=0 → false
 * となり「kon-ta 押下で popup 窓も同時に開く」「kon-ta 再押下で panel が
 * 出ずに popup だけ出る」という user-visible bug を起こしていた。
 *
 * 0.1.43 (Y): 0.1.18 以降の prewarm 機構で、host が DOM 上にあっても
 *   display:none / offscreen のまま「見えない」状態が増えた。renderPageFrameOverlay
 *   が何らかの理由（プレイヤー未検出・タブ非アクティブ等）で host を可視化
 *   できなかった場合、isConnected=true だけで focused=true を返すと
 *   background が popup window fallback を起動せず、ユーザーから「kon-ta
 *   押しても何も出ない」現象になる。computedStyle が利用可能なら
 *   display !== 'none' && visibility !== 'hidden' も確認し、不可視ならば
 *   false を返して background に popup window fallback を任せる。
 *
 * @param {{ isConnected: boolean } | null | undefined} host
 * @param {{
 *   getComputedStyle?: (el: object) => { display: string, visibility: string }
 * }} [deps] computedStyle が取れる環境（DOM）では渡す。省略時は isConnected のみ判定。
 * @returns {boolean}
 */
export function shouldRespondFocusedNowFromToolbar(host, deps) {
  if (!host) return false;
  if (host.isConnected !== true) return false;
  // deps 未指定（旧呼び出し互換）→ isConnected のみで判断
  if (!deps || typeof deps.getComputedStyle !== 'function') return true;
  try {
    const cs = deps.getComputedStyle(host);
    if (!cs || typeof cs !== 'object') return true;
    if (cs.display === 'none') return false;
    if (cs.visibility === 'hidden') return false;
    return true;
  } catch {
    // computedStyle 取得失敗（detached 等）→ 保守的に true（popup window race を避ける）
    return true;
  }
}
