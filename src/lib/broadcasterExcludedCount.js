// broadcasterExcludedCount.js
// v0.1.774: 記録カードの見出し数値から「配信者本人のコメント」を差し引いて、公式(本家コメ)と
//   同じ基準にする純関数。
//
// 背景(ユーザー): 記録カードの大きな数字(例 398)が公式コメント(317)より多く見える。
//   内訳は「通常314 / 配信者84」で、398 = 314 + 84。配信者本人のコメントを含むため公式より
//   多く見えていた。見出しは配信者を除いた応援コメント数(314)にして公式と揃えたい。
//
// 難所: setCountDisplay は 4 経路(panel即時/panel軽量/公式統計/メイン全件)から別タイミングの
//   生総数(配信者込み)で呼ばれ、別途モノトニックゲートで「同一 lv の最大値」に固定される。
//   - メイン全件経路だけが配信者数(breakdown._broadcasterCount)を知る。
//   - panel 経路は配信者数を知らない → 直近にメインで分かった値を流用する。
//   - 配信者込みの大きい値で先にゲート max が張り付くと、除外値へ下げられない
//     → 配信者数が判明/増加したら、その lv のゲート max を配信者数ぶん rebase する。
//
// この純関数は「配信者数の記憶更新 + ゲート rebase 量 + 見出しへの減算」を一括で解く。
// 呼び出し側(popup)は state を1つ持ち、戻り値の rebaseGateBy だけモノトニック state に適用する。

/**
 * @typedef {{ lv: string, count: number }} BroadcasterCountState
 */

/** @returns {BroadcasterCountState} 初期状態。 */
export function createBroadcasterCountState() {
  return { lv: '', count: 0 };
}

/**
 * lv を正規化(小文字・空白除去)。非 lv は ''。
 * @param {unknown} lv
 * @returns {string}
 */
function normLv(lv) {
  const s = String(lv ?? '').trim().toLowerCase();
  return /^lv\d{1,15}$/.test(s) ? s : '';
}

/**
 * 見出し生総数(配信者込み)から配信者ぶんを差し引いた表示値と、必要なゲート rebase 量を返す。
 * state は in-place 更新する(呼び出し側が単一インスタンスを保持)。
 *
 * @param {BroadcasterCountState} state          配信者数の記憶(lv 付き)
 * @param {string} lv                            現在描画中の lv
 * @param {number|null} rawCount                 設定したい生総数(配信者込み)。数値でなければ null
 * @param {number|null|undefined} breakdownBroadcasterCount
 *   メイン経路なら breakdown._broadcasterCount(配信者数)。panel 等は undefined(記憶を流用)。
 *   null は「内訳リセット(別配信/未取得)」=記憶クリア。
 * @returns {{ displayCount: number|null, rebaseGateBy: number }}
 *   displayCount: 見出しに出すべき配信者除外後の数値(rawCount が null なら null)。
 *   rebaseGateBy: モノトニックゲート max からこの lv ぶん引くべき量(0 なら不要)。
 */
export function resolveBroadcasterExcludedCount(state, lv, rawCount, breakdownBroadcasterCount) {
  const cur = normLv(lv);
  let rebaseGateBy = 0;

  if (breakdownBroadcasterCount === null) {
    // 明示リセット(別配信/未取得)。
    state.lv = '';
    state.count = 0;
  } else if (typeof breakdownBroadcasterCount === 'number' && Number.isFinite(breakdownBroadcasterCount)) {
    const bcNow = Math.max(0, Math.floor(breakdownBroadcasterCount));
    if (cur) {
      // 配信者数が新たに分かった/増えた → 既に込みの大きい値でゲートが固まっている可能性。
      //   その差分ぶんゲート max を下げる指示を返す(呼び出し側が適用)。
      if (state.lv !== cur) {
        rebaseGateBy = bcNow; // 別 lv からの初確定: 全量ぶん下げる
      } else if (bcNow > state.count) {
        rebaseGateBy = bcNow - state.count; // 同 lv で増えたぶんだけ下げる
      }
      state.lv = cur;
      state.count = bcNow;
    }
  }
  // breakdown 無し(undefined)= 記憶を流用(lv 一致時のみ)。

  if (rawCount == null || !Number.isFinite(rawCount)) {
    return { displayCount: null, rebaseGateBy };
  }
  let display = rawCount;
  if (cur && state.lv === cur && state.count > 0) {
    display = Math.max(0, rawCount - state.count);
  }
  return { displayCount: display, rebaseGateBy };
}
