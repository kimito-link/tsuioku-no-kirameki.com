/**
 * インラインパネルを「タブ幅に近い」まで広げる幅の純粋計算（content-entry から利用）。
 */

import { INLINE_VIEWPORT_BESIDE_MIN_WIDTH } from './inlinePanelLayout.js';
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

/*
 * ── 大画面での横付き(beside)昇格（opt-in） ─────────────────────────────
 *
 * 課題: `effectiveInlinePanelPlacement`(inlinePanelLayout.js) は
 * 「beside を狭いタブで below に**降格**」するのみで、below/未設定を beside に
 * **昇格**するコードは存在しない。初期既定は install 時 1 度きり
 * (`suggestInitialInlinePanelPlacement`)。よって狭い窓で初回起動したユーザーは
 * below 固定のまま、後で画面を広げても永久に横付きにならない（実機報告）。
 *
 * 方針（会議室 4 AI 合意）:
 *   - 無条件の自動昇格は却下。USER_EXPLICIT（ユーザーが意図的に配置を選んだ）の
 *     意思を**逆方向に侵害**し、リサイズ時の beside⇆below 往復も生むため。
 *   - `effectiveInlinePanelPlacement` の純関数契約（降格のみ）は崩さない。
 *     昇格は「**保存値を 1 回だけ書き換える**」別関数として分離する。
 *   - 既存 viewportWide ポリシー(off/always/once)の作法に乗せる。
 *
 * 本関数は純粋判定のみ。storage 書き込み・DOM・await は呼出元（content start /
 * storage.onChanged の外側、同期変数経由）が担う。描画ホットパスからは呼ばない。
 */

/** 昇格対象になりうる保存値か（below / 未設定のみ。dock_bottom/floating は明示性が高く対象外） */
function isPlacementUpgradeCandidate(stored) {
  const s = String(stored || '').trim();
  return s === '' || s === INLINE_PANEL_PLACEMENT_BELOW;
}

/**
 * 大画面のとき below/未設定 を beside に「昇格」すべきか判定し、昇格後の保存値を返す。
 * 昇格不要なら null（呼出元は何も書かない）。
 *
 * @param {{
 *   stored: string,
 *   userExplicit: boolean,
 *   viewportInnerWidth: number,
 *   policy: 'off' | 'always' | 'once' | string,
 *   onceDone: boolean
 * }} opts
 * @returns {typeof INLINE_PANEL_PLACEMENT_BESIDE | null}
 */
export function suggestPlacementUpgradeForWideViewport(opts) {
  const {
    stored,
    userExplicit,
    viewportInnerWidth,
    policy,
    onceDone
  } = opts || {};
  // ユーザーが配置を明示選択済みなら、その意思を最優先（昇格しない）。
  if (userExplicit === true) return null;
  // off は機能無効。
  if (policy === INLINE_PANEL_VIEWPORT_WIDE_OFF) return null;
  // floating / dock_bottom / 既に beside は対象外。below / 未設定のみ。
  if (!isPlacementUpgradeCandidate(stored)) return null;
  // 横付きが現実的に収まるタブ幅未満では昇格しない（降格と同じ閾値）。
  const w = Number(viewportInnerWidth) || 0;
  if (w < INLINE_VIEWPORT_BESIDE_MIN_WIDTH) return null;
  // 「1 回だけ」方針で既に消費済みなら昇格しない。
  if (policy === INLINE_PANEL_VIEWPORT_WIDE_ONCE && onceDone === true) {
    return null;
  }
  return INLINE_PANEL_PLACEMENT_BESIDE;
}

/**
 * 昇格を「1 回だけ」方針で消費したフラグ（onceDone）を立てるべきか。
 * 実際に昇格保存が起きたとき（suggestPlacementUpgradeForWideViewport が beside を返した）
 * かつ policy === once のときだけ true。always では消費しない（毎回評価し続ける）。
 * @param {{ policy: string, upgradedTo: string | null }} opts
 * @returns {boolean}
 */
export function shouldConsumePlacementUpgradeOnce(opts) {
  if (!opts) return false;
  if (opts.policy !== INLINE_PANEL_VIEWPORT_WIDE_ONCE) return false;
  return opts.upgradedTo === INLINE_PANEL_PLACEMENT_BESIDE;
}
