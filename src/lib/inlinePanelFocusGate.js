/**
 * インラインパネル host element が toolbar 起点の「前面化」操作を受けられる
 * 状態かを判定する純粋関数。content-entry 側の DOM 直接アクセスを切り離し、
 * unit test 可能にしておくことで、判定条件の追加/変更で再帰実装ミスを防ぐ。
 *
 * 経緯（B1 race fix）:
 *   `focusInlinePanelHostFromToolbar` は msg=NLS_FOCUS_INLINE_PANEL 受信直後に
 *   `renderPageFrameOverlay()` を呼んで host を挿入してから rect を見ていたが、
 *   挿入直後は layout が確定しておらず r.width=0 / r.height=0 となるケースが
 *   あり、即時判定だと false で返ってしまっていた（小さい toolbar popup だけが
 *   出てインラインに前面化されない症状）。判定だけ切り出し、呼び出し側は
 *   pollUntil で最大 500ms rAF 単位ポーリングする。
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
 * 新方針: host が DOM に居る（renderPageFrameOverlay で挿入済み or 既存）
 *   なら即座に true を返し、scroll/focus は呼び出し側で fire-and-forget。
 *   応答自体には rect も layout 完了も要らない（panel 表示自体は
 *   renderPageFrameOverlay 側で同期的に処理されるため）。
 *
 * @param {{ isConnected: boolean } | null | undefined} host
 * @returns {boolean}
 */
export function shouldRespondFocusedNowFromToolbar(host) {
  if (!host) return false;
  return host.isConnected === true;
}
