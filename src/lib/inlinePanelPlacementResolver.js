/**
 * インラインパネル配置の「単一の真実」コンポーネント。
 *
 * ── なぜこのモジュールが必要か（再発防止） ─────────────────────────────
 * 配置の決定知識が複数箇所に散らばっていたのが「大画面でも横付きから始まらない」
 * バグの温床だった:
 *   - 既定配置が何か（popup ラジオの checked / normalizeInlinePanelPlacement(undefined)
 *     / migrateBelowInlinePanelToDockOnce による below→dock 移行）は **dock_bottom**
 *     なのに、横付き昇格の候補判定だけが below/未設定 に限定され dock_bottom を除外
 *     していた。両者の「既定とは何か」の認識がズレ、既定ユーザー全員が昇格しなかった。
 *
 * そこで「既定（=ユーザーが意図的に選んだのではない）配置とは何か」という語彙を
 * **この 1 ファイルに集約**し、昇格候補判定も実効配置の解決もここから引く。今後
 * 既定の定義が変わっても 1 箇所の修正で昇格・解決の両方へ自動的に伝播する。
 *
 * このモジュールは純関数のみ（storage / DOM / await なし）。呼出元が同期変数経由で
 * 状態を渡し、書込は呼出元が担う（描画ホットパスから storage I/O を排除する設計）。
 */

import {
  effectiveInlinePanelPlacement,
  INLINE_VIEWPORT_BESIDE_MIN_WIDTH
} from './inlinePanelLayout.js';
import {
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
  INLINE_PANEL_VIEWPORT_WIDE_OFF
} from './storageKeys.js';

/**
 * 「既定配置」= ユーザーが意図的に選んだのではない、初期/移行で付く配置の集合。
 * floating と beside は**既定では絶対にならない**＝必ず意図的選択なので含めない。
 * 空文字（未設定）も既定扱い。
 *
 * ⭐ これが配置語彙の単一の真実。昇格候補も「既定かどうか」もここから判定する。
 */

/**
 * 配置決定の入力。呼出側が同期変数から組む。全フィールド optional
 * （部分指定や欠落でも安全に no-op になるよう各関数が防御する）。
 * @typedef {{
 *   stored?: string,
 *   userExplicit?: boolean,
 *   viewportInnerWidth?: number,
 *   policy?: 'off' | 'always' | 'once' | string,
 *   onceDone?: boolean
 * }} InlinePlacementDecisionInput
 */
export const INLINE_PANEL_DEFAULT_PLACEMENTS = Object.freeze([
  '',
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
]);

/**
 * 保存値が「既定配置（意図的選択ではない）」か。
 * @param {unknown} stored
 * @returns {boolean}
 */
export function isDefaultInlinePanelPlacement(stored) {
  const s = String(stored ?? '').trim();
  return INLINE_PANEL_DEFAULT_PLACEMENTS.includes(
    /** @type {(typeof INLINE_PANEL_DEFAULT_PLACEMENTS)[number]} */ (s)
  );
}

/**
 * 大画面のとき既定配置を横付き(beside)へ「昇格」すべきか判定。昇格不要なら null。
 *
 * USER_EXPLICIT=true（自分で配置を選んだ）は最優先で no-op＝意思を守る。
 *
 * 🐛 修正(2026-05-22 v0.1.301): 旧実装は `once` 方針のとき `onceDone` で昇格を
 * ブロックしていたが、この `onceDone`(KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE) は
 * **幅をタブ幅まで広げる機能と共有**のフラグで、過去セッションで「幅広げ once」が
 * 消費されると、配置昇格が永久に発火しなくなっていた（実機 lv350583010 で below
 * 固定の主因）。そもそも配置昇格は「保存値を beside に書き換える」ので、一度昇格
 * すれば stored=beside＝以後 isDefaultInlinePanelPlacement が false になり**自然に
 * 二度と昇格しない**。よって onceDone ゲートは不要かつ有害。撤去し、policy は
 * off 以外なら昇格する（once も always も配置昇格では同義＝1 回で恒久化）。
 * @param {InlinePlacementDecisionInput} [opts]
 * @returns {typeof INLINE_PANEL_PLACEMENT_BESIDE | null}
 */
export function resolveWideViewportPlacementUpgrade(opts) {
  const { stored, userExplicit, viewportInnerWidth, policy } = opts || {};
  if (userExplicit === true) return null;
  if (policy === INLINE_PANEL_VIEWPORT_WIDE_OFF) return null;
  // 昇格対象は「既定配置」のみ（語彙は INLINE_PANEL_DEFAULT_PLACEMENTS 一元管理）。
  if (!isDefaultInlinePanelPlacement(stored)) return null;
  const w = Number(viewportInnerWidth) || 0;
  if (w < INLINE_VIEWPORT_BESIDE_MIN_WIDTH) return null;
  // onceDone ゲートは撤去（幅広げ機能との共有フラグで誤ブロックしていた）。
  // 再昇格防止は「昇格後 stored=beside＝候補外」で自然に担保される。
  return INLINE_PANEL_PLACEMENT_BESIDE;
}

/**
 * 配置の総合解決（単一エントリポイント）。
 *
 * 1. 昇格（既定配置→beside）を判定。昇格するなら保存すべき新しい stored 値を返す。
 * 2. 昇格後（または据え置きの）保存値に対し、`effectiveInlinePanelPlacement` の
 *    降格（狭いタブで beside→below）を適用して実効配置を出す。
 *
 * これにより「保存値の昇格」と「実効値の降格」が 1 関数で一貫し、呼出側が順序を
 * 間違えたり片方を忘れたりする再発を防ぐ。
 *
 * 注: 配置昇格は once フラグに依存しない（昇格後 stored=beside で自然に再発防止）。
 * よって consumeOnce のような副作用フラグは返さない。
 *
 * @param {InlinePlacementDecisionInput} [opts]
 * @returns {{
 *   upgradeTo: (typeof INLINE_PANEL_PLACEMENT_BESIDE) | null,
 *   nextStored: string,
 *   effective: string
 * }}
 */
export function resolveInlinePanelPlacementDecision(opts) {
  /** @type {InlinePlacementDecisionInput} */
  const safe = opts || {};
  const upgradeTo = resolveWideViewportPlacementUpgrade(safe);
  const nextStored = upgradeTo ?? String(safe.stored ?? '');
  const effective = effectiveInlinePanelPlacement(
    nextStored,
    safe.viewportInnerWidth
  );
  return { upgradeTo, nextStored, effective };
}
