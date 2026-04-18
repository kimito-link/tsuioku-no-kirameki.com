/**
 * インラインパネルの placement（below / beside / floating / dock_bottom）を切り替える際に、
 * 前モードで付けたインラインスタイル・クラスをすべて落とすための純関数群。
 *
 * 旧実装は clearInlineHostFloatingLayout が「floating / dock_bottom を外すとき」だけの
 * 前提で部分的に reset しており、以下のようなバグ #3「パネル位置を変えるとおかしくなる」
 * の原因になっていた:
 *
 *   - renderInlinePanelFloatingHost が clearInlineHostFloatingLayout を呼ばないまま
 *     width / marginLeft / boxSizing / display / opacity / pointerEvents を上書き
 *   - clearInlineHostFloatingLayout が width / maxWidth / marginLeft / boxSizing を
 *     reset リストに入れていない
 *   - renderPageFrameOverlay が below/beside → floating の遷移で cleanup を通らない
 *
 * これらを一発で直すため、「placement 切替時に消すべきインラインスタイル名の正本 list」
 * と「placement 切替時に剥がすべきクラス名の正本 list」をこのモジュールで一元管理する。
 * DOM への適用側（content-entry.js）は applyResetToHost() 経由で使う。
 */

/**
 * placement 切替時に空文字でクリアすべき host 要素のインラインスタイル名リスト。
 * 順序には意味はないが、追加漏れを防ぐ意図で floating / dock_bottom が set する
 * プロパティを網羅する。
 *
 * 【重要】display / opacity / pointerEvents と aria-hidden は「visibility state」であって
 * 「placement」ではない。ensureInlinePopupHost() は新規作成時に display:none +
 * aria-hidden:true でホストを「デフォルト非表示」にする。もしこのリストに display を
 * 入れてしまうと、placement リセット（毎レンダ先頭で走る）が初期の非表示を剥がして
 * ホストを勝手に可視化してしまい、ユーザーがクリックしていないのに panel がページ上に
 * いきなり出る症状を招く。visibility 系は render 側の責務として触らない。
 */
export const INLINE_HOST_RESETTABLE_STYLE_PROPERTIES = Object.freeze([
  'position',
  'top',
  'right',
  'left',
  'bottom',
  'width',
  'maxWidth',
  'maxHeight',
  'marginLeft',
  'boxSizing',
  'overflow',
  'overflowX',
  'overflowY',
  'boxShadow',
  'borderRadius',
  'background',
  'zIndex'
]);

/** placement 切替時に必ず外すクラス名リスト（現状は floating / dock-bottom のみ）。 */
export const INLINE_HOST_PLACEMENT_CLASSES = Object.freeze([
  'nls-inline-host--floating',
  'nls-inline-host--dock-bottom'
]);

/**
 * プレーンオブジェクトや HTMLElement に対して placement reset を適用する。
 * classList / style.property への write を行うだけの副作用関数。
 *
 * テストやコールサイトの単純化のため、host が HTMLElement でなくても
 * classList.remove / style[prop] = '' の shape だけ満たせば動くようにしてある。
 *
 * 【意図的に触らないもの】
 *   - style.display / opacity / pointerEvents
 *   - aria-hidden 属性
 *   これらは visibility state であり、render 側（renderInlineHostAnchoredToVideo /
 *   renderInlinePanelFloatingHost など）が条件に応じて書き込む責務を持つ。
 *   placement reset がこれらに触ると、ensureInlinePopupHost() が初期に付けた
 *   display:none / aria-hidden:true を剥がして panel を勝手に可視化してしまう。
 *
 * @param {{
 *   classList?: { remove: (name: string) => void },
 *   style?: Record<string, string>
 * } | null | undefined} host
 */
export function applyInlineHostPlacementReset(host) {
  if (!host) return;
  if (host.classList && typeof host.classList.remove === 'function') {
    for (const cls of INLINE_HOST_PLACEMENT_CLASSES) {
      host.classList.remove(cls);
    }
  }
  if (host.style) {
    for (const prop of INLINE_HOST_RESETTABLE_STYLE_PROPERTIES) {
      host.style[prop] = '';
    }
  }
}
