// venueDragScroll.js
// 2026-06-14 会議(星野ロミ・摩擦ゼロUI): 会場を左ドラッグでパン(縦スクロール)する純ロジック。
//
// ユーザー要望「どこか左クリックしながら押すと(ドラッグで)会場内を移動できると便利」。
// DOM/イベント非依存の純関数だけ置く(テスト可能)。venueBar が pointer イベントを配線して呼ぶ。
//
// 設計: 会場(seatsHost)は overflow-y:auto。ドラッグ開始時の scrollTop と pointerY を記録し、
//   移動量ぶん scrollTop を逆向きに動かす(掴んだ点を指に追従させる自然な操作)。クリック(=ほぼ
//   動かさず離す)とドラッグを閾値で区別し、席リンクの誤クリックを防ぐ。

/** ドラッグ開始とみなす最小移動量(px)。これ未満はクリック扱い(リンクを潰さない)。 */
export const VENUE_DRAG_THRESHOLD_PX = 6;

/**
 * @typedef {{
 *   active: boolean,
 *   moved: boolean,
 *   startY: number,
 *   startScrollTop: number
 * }} VenueDragState
 */

/** ドラッグ未開始の初期状態。 */
export function initVenueDragState() {
  return { active: false, moved: false, startY: 0, startScrollTop: 0 };
}

/**
 * pointerdown: ドラッグ開始の基準を記録する純関数(新しい state を返す)。
 * @param {number} pointerY 押した Y 座標(clientY)
 * @param {number} scrollTop その時点の scrollTop
 * @returns {VenueDragState}
 */
export function beginVenueDrag(pointerY, scrollTop) {
  return {
    active: true,
    moved: false,
    startY: Number(pointerY) || 0,
    startScrollTop: Math.max(0, Number(scrollTop) || 0)
  };
}

/**
 * pointermove: 現在の Y から目標 scrollTop を計算する純関数。
 * 掴んだ点を指に追従させるため、開始 scrollTop から「下に動いた分だけ上へ戻す」。
 * 閾値を超えたら moved=true(以後リンククリックを抑止)。
 *
 * @param {VenueDragState} state
 * @param {number} pointerY 現在の Y(clientY)
 * @param {number} maxScrollTop スクロール可能な最大値(scrollHeight - clientHeight)
 * @returns {{ state: VenueDragState, scrollTop: number }}
 *   state=更新後 / scrollTop=設定すべき値(0..maxScrollTop にクランプ)
 */
export function updateVenueDrag(state, pointerY, maxScrollTop) {
  if (!state || !state.active) {
    return { state: state || initVenueDragState(), scrollTop: 0 };
  }
  const y = Number(pointerY) || 0;
  const delta = y - state.startY; // 下にドラッグ(delta>0) → 上のコンテンツを見せる(scrollTop 減)
  const max = Math.max(0, Number(maxScrollTop) || 0);
  const raw = state.startScrollTop - delta;
  const scrollTop = Math.min(max, Math.max(0, raw));
  const moved = state.moved || Math.abs(delta) >= VENUE_DRAG_THRESHOLD_PX;
  return { state: { ...state, moved }, scrollTop };
}

/**
 * pointerup/leave: ドラッグ終了。直前まで moved だったかを返してからリセットする。
 * @param {VenueDragState} state
 * @returns {{ state: VenueDragState, wasDrag: boolean }}
 *   wasDrag=true なら直後の click を抑止すべき(リンク誤発火防止)
 */
export function endVenueDrag(state) {
  const wasDrag = !!(state && state.active && state.moved);
  return { state: initVenueDragState(), wasDrag };
}
