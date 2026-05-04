/**
 * インラインパネルを「タブ幅に近い」まで広げる幅の純粋計算（content-entry から利用）。
 */

import {
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
  INLINE_PANEL_PLACEMENT_FLOATING,
  INLINE_PANEL_VIEWPORT_WIDE_OFF,
  INLINE_PANEL_VIEWPORT_WIDE_ONCE
} from './storageKeys.js';

/**
 * body 末尾フォールバック用（720px キャップ・従来どおり）。
 * @param {number} innerWidth
 * @returns {number}
 */
export function resolveViewportRelaxedPanelWidthPx(innerWidth) {
  const vw = Math.round(Number(innerWidth) || 0);
  return Math.min(720, Math.max(320, vw - 24));
}

/** 方針「常に／1回」で使うタブ幅ベース（上限 1920px・下限 320px）。 */
const VIEWPORT_WIDE_POLICY_MAX_PX = 1920;

/**
 * @param {number} innerWidth
 * @returns {number}
 */
export function resolveViewportWidePolicyTargetWidthPx(innerWidth) {
  const vw = Math.round(Number(innerWidth) || 0);
  const w = Math.max(320, vw - 24);
  return Math.min(w, VIEWPORT_WIDE_POLICY_MAX_PX);
}

/**
 * @param {{
 *   baselineWidthPx: number,
 *   viewportInnerWidth: number,
 *   placement: string,
 *   policy: 'off' | 'always' | 'once',
 *   onceDone: boolean
 * }} opts
 * @returns {number}
 */
export function resolveWidenedInlinePanelWidthPx(opts) {
  const {
    baselineWidthPx,
    viewportInnerWidth,
    placement,
    policy,
    onceDone
  } = opts;
  const base = Math.max(1, Math.round(Number(baselineWidthPx) || 0));
  if (
    placement === INLINE_PANEL_PLACEMENT_FLOATING ||
    placement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
  ) {
    return base;
  }
  if (policy === INLINE_PANEL_VIEWPORT_WIDE_OFF) return base;
  if (policy === INLINE_PANEL_VIEWPORT_WIDE_ONCE && onceDone) return base;
  const relaxed = resolveViewportWidePolicyTargetWidthPx(viewportInnerWidth);
  return Math.max(base, relaxed);
}

/**
 * `once` 方針で消費フラグを立てるべきか（呼出元で storage 書き込み）。
 * @param {{
 *   policy: string,
 *   onceDone: boolean,
 *   placement: string,
 *   documentVisibilityState?: string
 * }} opts
 * @returns {boolean}
 */
export function shouldConsumeViewportWideOnce(opts) {
  if (opts.policy !== INLINE_PANEL_VIEWPORT_WIDE_ONCE) return false;
  if (opts.onceDone) return false;
  const vis = String(opts.documentVisibilityState || 'visible');
  if (vis !== 'visible') return false;
  const p = String(opts.placement || '');
  return (
    p === INLINE_PANEL_PLACEMENT_BELOW || p === INLINE_PANEL_PLACEMENT_BESIDE
  );
}
