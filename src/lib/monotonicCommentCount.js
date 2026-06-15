// monotonicCommentCount.js
// v0.1.645: コメント記録件数の「数値ズレ」根治。
//
// 背景: popup の #count / liveStatComments は setCountDisplay() 一本で描画されるが、
//   呼び出し元が 4 経路あり、それぞれ別ソース・別タイミングの生値を渡していた:
//     - applyPanelMetricsFromContent / applyLightweightPanelSummaryCards
//         → panel.recordedCount 単独(全件 read 前で低く出る)
//     - 公式統計経路 → view.commentStorageCount
//     - メイン描画 → countToShow(= IDB/storage/panel/chunk の Math.max 正本)
//   これらが #count を上書き合戦するため、見るタイミングで「速報 7,851 / パネル 7,782 /
//   watch 7,815」のように数十件ズレ、かつ値が前後に揺れていた。
//
// 方針(ユーザー確定: 正本=最大値・現状踏襲): 表示は同一 lv 内で単調増加(モノトニック)に
//   する。どの経路から来ても「これまで表示した最大の数値」を下回らせない。記録件数は
//   原理的に減らない(コメントは消えない)ため、最大値への収束は正しい。lv が変われば
//   別配信なのでリセットする。
//
// 純関数なので popup の DOM/グローバルに依存せず単体テストできる。状態は呼び出し側が
// 保持する(MonotonicCommentCountState)。

/**
 * @typedef {Object} MonotonicCommentCountState
 * @property {string} lv      直近に確定した lv(小文字)。'' は未確定。
 * @property {number} max     その lv で表示した数値の最大。
 */

/**
 * モノトニックゲートの初期状態を作る。
 * @returns {MonotonicCommentCountState}
 */
export function createMonotonicCommentCountState() {
  return { lv: '', max: 0 };
}

/**
 * lv を正規化する(小文字・前後空白除去)。非 lv は '' を返す。
 * @param {unknown} lv
 * @returns {string}
 */
export function normalizeMonotonicLiveId(lv) {
  const s = String(lv ?? '').trim().toLowerCase();
  return /^lv\d{1,15}$/.test(s) ? s : '';
}

/**
 * 表示すべきコメント件数を「同一 lv 内で単調増加」になるよう解決する。
 *
 * - candidate が有限な数値でない(文言など)ときは null を返す。呼び出し側は
 *   ゲートを通さず candidate をそのまま表示してよい(「(未取得)」等)。
 * - lv が前回と違う / lv が空 のときはリセットして candidate を採用する。
 * - 同一 lv では max(previousMax, candidate) を表示値とし、state を更新する。
 *
 * state は in-place で更新する(呼び出し側の単一インスタンスを使う想定)。
 *
 * @param {MonotonicCommentCountState} state
 * @param {string} lv  現在描画中の lv(正規化前で可)
 * @param {unknown} candidate  各経路が表示したい件数
 * @returns {number|null}  表示すべき数値。null = ゲート対象外(文言などそのまま表示)
 */
export function resolveMonotonicCommentCount(state, lv, candidate) {
  const num =
    typeof candidate === 'number' && Number.isFinite(candidate)
      ? candidate
      : NaN;
  if (Number.isNaN(num) || num < 0) return null;

  const normLv = normalizeMonotonicLiveId(lv);
  // lv が取れない場合はゲートを通さず素通し(別配信扱いの取りこぼしを防ぐ)。
  if (!normLv) return num;

  if (state.lv !== normLv) {
    // 別配信に切り替わった → リセットして今回値を基準にする。
    state.lv = normLv;
    state.max = num;
    return num;
  }
  if (num > state.max) {
    state.max = num;
  }
  return state.max;
}
