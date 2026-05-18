/**
 * インライン配置・幅・ビューポート幅・浮遊アンカーの chrome.storage.local 正本まわり。
 * popup-entry の巨大化と保存値の散在による再発を抑えるため、正規化と storage patch を集約する。
 */

import {
  KEY_INLINE_FLOATING_ANCHOR,
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
  KEY_INLINE_PANEL_WIDTH_MODE,
  INLINE_FLOATING_ANCHOR_BOTTOM_LEFT,
  INLINE_FLOATING_ANCHOR_TOP_RIGHT,
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
  INLINE_PANEL_PLACEMENT_FLOATING,
  INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
  INLINE_PANEL_VIEWPORT_WIDE_OFF,
  INLINE_PANEL_VIEWPORT_WIDE_ONCE,
  INLINE_PANEL_WIDTH_PLAYER_ROW,
  INLINE_PANEL_WIDTH_VIDEO,
  normalizeInlinePanelPlacement,
  normalizeInlinePanelWidthMode
} from './storageKeys.js';

/**
 * @typedef {'placement' | 'width_mode' | 'viewport_wide_policy' | 'floating_anchor'} InlinePanelStorageWriteFailureKind
 */

/**
 * @param {InlinePanelStorageWriteFailureKind} kind
 * @returns {string}
 */
export function buildInlinePanelStorageSetFailedMessage(kind) {
  return `inline_panel_${kind}_storage_set_failed`;
}

/**
 * AI 共有診断用: storage.local.get の戻りから popup.storageReadback を組み立てる。
 * @param {Record<string, unknown>} rb
 * @returns {{
 *   placementRaw: unknown,
 *   placementNormalized: ReturnType<typeof normalizeInlinePanelPlacement>,
 *   placementUserExplicit: boolean,
 *   widthModeRaw: unknown,
 *   widthModeNormalized: ReturnType<typeof normalizeInlinePanelWidthMode>
 * }}
 */
export function buildAiShareInlinePanelStorageReadback(rb) {
  const bag = rb && typeof rb === 'object' ? rb : {};
  return {
    placementRaw: bag[KEY_INLINE_PANEL_PLACEMENT] ?? null,
    placementNormalized: normalizeInlinePanelPlacement(
      bag[KEY_INLINE_PANEL_PLACEMENT]
    ),
    // 横付き根本修正(3baa77d)の確証用: ユーザー明示選択フラグが storage に
    // 定着しているか。次回診断で true なら「明示選択が保存・保護されている」
    // ＝修正が効いている。false のまま横付き戻りが続くなら別機構を疑う。
    placementUserExplicit: bag[KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT] === true,
    widthModeRaw: bag[KEY_INLINE_PANEL_WIDTH_MODE] ?? null,
    widthModeNormalized: normalizeInlinePanelWidthMode(
      bag[KEY_INLINE_PANEL_WIDTH_MODE]
    )
  };
}

/**
 * @param {unknown} value
 * @returns {typeof INLINE_PANEL_PLACEMENT_BESIDE | typeof INLINE_PANEL_PLACEMENT_FLOATING | typeof INLINE_PANEL_PLACEMENT_DOCK_BOTTOM | typeof INLINE_PANEL_PLACEMENT_BELOW}
 */
export function coerceInlinePanelPlacementForStorage(value) {
  if (value === INLINE_PANEL_PLACEMENT_BESIDE) return INLINE_PANEL_PLACEMENT_BESIDE;
  if (value === INLINE_PANEL_PLACEMENT_FLOATING) return INLINE_PANEL_PLACEMENT_FLOATING;
  if (value === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
    return INLINE_PANEL_PLACEMENT_DOCK_BOTTOM;
  }
  return INLINE_PANEL_PLACEMENT_BELOW;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function storagePatchInlinePanelPlacement(value) {
  return {
    [KEY_INLINE_PANEL_PLACEMENT]: coerceInlinePanelPlacementForStorage(value)
  };
}

/**
 * popup でユーザーが配置を明示選択したときの保存 patch。
 * 配置キーと「明示選択フラグ」を **1 回の storage.set でアトミックに**書く
 * （フラグだけ立つ / 配置だけ巻き戻る非アトミック窓を作らない）。
 * フラグが立つと below→dock / suggestInitial 等の移行が以後上書きしない。
 * @param {unknown} value
 * @returns {Record<string, string | boolean>}
 */
export function storagePatchInlinePanelPlacementWithExplicit(value) {
  return {
    [KEY_INLINE_PANEL_PLACEMENT]: coerceInlinePanelPlacementForStorage(value),
    [KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT]: true
  };
}

/**
 * popup 保存後の読み戻し検証（純）。storage から読み直した bag の配置値が、
 * 保存しようとした値（coerce 後）と一致するかを判定する。
 * 不一致＝保存が定着していない / 別経路で上書きされた、を popup 側で検知して
 * 「横付きにしたのに黙って下に戻る」を可視化するために使う。
 * @param {Record<string, unknown> | null | undefined} readbackBag
 * @param {unknown} intendedValue
 * @returns {boolean} 一致＝検証 OK なら true
 */
export function isInlinePanelPlacementWriteVerified(readbackBag, intendedValue) {
  const bag =
    readbackBag && typeof readbackBag === 'object' ? readbackBag : {};
  return (
    normalizeInlinePanelPlacement(bag[KEY_INLINE_PANEL_PLACEMENT]) ===
    coerceInlinePanelPlacementForStorage(intendedValue)
  );
}

/**
 * @param {unknown} value
 * @returns {typeof INLINE_PANEL_WIDTH_VIDEO | typeof INLINE_PANEL_WIDTH_PLAYER_ROW}
 */
export function coerceInlinePanelWidthModeForStorage(value) {
  return value === INLINE_PANEL_WIDTH_VIDEO
    ? INLINE_PANEL_WIDTH_VIDEO
    : INLINE_PANEL_WIDTH_PLAYER_ROW;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function storagePatchInlinePanelWidthMode(value) {
  return {
    [KEY_INLINE_PANEL_WIDTH_MODE]: coerceInlinePanelWidthModeForStorage(value)
  };
}

/**
 * @param {unknown} value
 * @returns {typeof INLINE_PANEL_VIEWPORT_WIDE_ALWAYS | typeof INLINE_PANEL_VIEWPORT_WIDE_ONCE | typeof INLINE_PANEL_VIEWPORT_WIDE_OFF}
 */
export function coerceInlinePanelViewportWidePolicyForStorage(value) {
  if (value === INLINE_PANEL_VIEWPORT_WIDE_ALWAYS) {
    return INLINE_PANEL_VIEWPORT_WIDE_ALWAYS;
  }
  if (value === INLINE_PANEL_VIEWPORT_WIDE_ONCE) {
    return INLINE_PANEL_VIEWPORT_WIDE_ONCE;
  }
  return INLINE_PANEL_VIEWPORT_WIDE_OFF;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string | boolean>}
 */
export function storagePatchInlinePanelViewportWidePolicy(value) {
  const v = coerceInlinePanelViewportWidePolicyForStorage(value);
  return {
    [KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY]: v,
    [KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]: false
  };
}

/**
 * @param {unknown} value
 * @returns {typeof INLINE_FLOATING_ANCHOR_BOTTOM_LEFT | typeof INLINE_FLOATING_ANCHOR_TOP_RIGHT}
 */
export function coerceInlineFloatingAnchorForStorage(value) {
  return value === INLINE_FLOATING_ANCHOR_BOTTOM_LEFT
    ? INLINE_FLOATING_ANCHOR_BOTTOM_LEFT
    : INLINE_FLOATING_ANCHOR_TOP_RIGHT;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function storagePatchInlineFloatingAnchor(value) {
  return {
    [KEY_INLINE_FLOATING_ANCHOR]: coerceInlineFloatingAnchorForStorage(value)
  };
}
