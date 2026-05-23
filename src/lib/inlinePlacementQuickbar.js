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
 * 横付きが「画面の広さ」要件で実効降格する最小幅（px）の表示用しきい値。
 * ロジックの真実は inlinePanelLayout.js の INLINE_VIEWPORT_BESIDE_MIN_WIDTH（=1100）。
 * ここはユーザー向け文言にだけ使う近似表示（「約1100px」）なので import 依存を増やさず
 * 文言を独立させる（万一定数が変わっても文言は安全側の説明に留まる）。
 */
const BESIDE_MIN_WIDTH_HINT_PX = 1100;

/**
 * クイックバーの表示モデルを純粋に組み立てる。
 *
 * - currentLabel: 現在保存されている配置のラベル。
 * - effectiveNote: 実効配置が保存値と違う（例: beside を選んだが狭タブで below 降格）
 *   ときだけ「(今は〜で表示中)」の補足。同じ/不明なら ''。
 * - besideNarrowHint: 「横付きを選んだのに実効が下（=狭ウィンドウで降格）」のときだけ、
 *   なぜ変わらないか＋どうすれば横付きになるかを行動可能に説明する文言。それ以外は ''。
 *   ⭐ これが「横付きを押しても何も変わらない」誤解の直接の解（実機 lv350592761:
 *   viewportInnerWidth 1065 < 1100 で beside→below 降格していた）。
 * - besideActive / belowActive: 2 トグルチップの押下状態（保存値基準）。dock_bottom/
 *   floating のときは両方 false（「他の位置」を選んでいる）。
 *
 * @param {{ placement?: string, effectivePlacement?: string }} input
 * @returns {{ currentLabel: string, effectiveNote: string, besideNarrowHint: string, besideActive: boolean, belowActive: boolean }}
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

  // 「横付きを選んだのに下で表示中」＝狭ウィンドウ降格。これだけは原因と対処を明示。
  let besideNarrowHint = '';
  if (placement === 'beside' && eff === 'below') {
    besideNarrowHint = `横付きは画面が広いとき（約${BESIDE_MIN_WIDTH_HINT_PX}px〜）に切り替わります。ウィンドウを広げると横に並びます。`;
  }

  return {
    currentLabel,
    effectiveNote,
    besideNarrowHint,
    besideActive: placement === 'beside',
    belowActive: placement === 'below'
  };
}
