/**
 * ヘッダーの「パネル位置」クイックバー用 純関数（v0.1.334）。
 *
 * 詳細設定の奥にある inlinePanelPlacement ラジオ（dock_bottom/below/beside/floating）を、
 * ビルドバッジ付近のヘッダーから「現在値の明示 + 横付き/下の直接切替 + 詳細への導線」で
 * 操作しやすくする。本モジュールは表示ロジック（値→ラベル/トグル状態）だけを純粋に担い、
 * 保存は呼び出し側が既存 saveInlinePanelPlacement を使う（storage キーを増やさない＝
 * 二重管理しない）。
 *
 * @see src/lib/storageKeys.js - INLINE_PANEL_PLACEMENT 値定数 / normalizeInlinePanelPlacement
 * @see src/lib/inlinePanelPlacementResolver.js - effectiveInlinePanelPlacement（実効降格）
 */

/**
 * 配置値 → ヘッダー表示用の短い日本語ラベル。
 * @type {Readonly<Record<string, string>>}
 */
const PLACEMENT_LABELS = Object.freeze({
  dock_bottom: '画面下いっぱい',
  below: 'プレイヤー行の下',
  beside: '横付き',
  floating: 'ポップアップ風'
});

/**
 * 配置値を日本語ラベルに（不明値は「下」相当の安全側）。
 * @param {string} placement
 * @returns {string}
 */
export function placementQuickLabel(placement) {
  const p = String(placement || '').trim();
  return PLACEMENT_LABELS[p] || PLACEMENT_LABELS.below;
}

/**
 * クイックバーの表示モデルを純粋に組み立てる。
 *
 * - currentLabel: 現在保存されている配置のラベル。
 * - effectiveNote: 実効配置が保存値と違う（例: beside を選んだが狭タブで below 降格）
 *   ときだけ「(今は〜で表示中)」の補足。同じ/不明なら ''。
 * - besideActive / belowActive: 2 トグルチップの押下状態（保存値基準）。dock_bottom/
 *   floating のときは両方 false（「他の位置」を選んでいる）。
 *
 * @param {{ placement?: string, effectivePlacement?: string }} input
 * @returns {{ currentLabel: string, effectiveNote: string, besideActive: boolean, belowActive: boolean }}
 */
export function buildPlacementQuickbarModel(input) {
  const placement = String(input?.placement || '').trim() || 'dock_bottom';
  const eff = String(input?.effectivePlacement || '').trim();
  const currentLabel = placementQuickLabel(placement);

  let effectiveNote = '';
  if (eff && eff !== placement) {
    // 実効が保存値と異なる＝降格/昇格が起きている。誤解防止に実効も明示。
    effectiveNote = `（今は${placementQuickLabel(eff)}で表示中）`;
  }

  return {
    currentLabel,
    effectiveNote,
    besideActive: placement === 'beside',
    belowActive: placement === 'below'
  };
}
