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
