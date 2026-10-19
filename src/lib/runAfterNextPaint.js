/**
 * 重い処理を「次の描画のあと」へ送る(時計・rAF は引数で受け取る純関数寄りの部品)。v0.1.1695
 *
 * ■ なぜ要るか(2026-10-19・タブ切り替えで縞が出る件)
 *   実験(パネルを開いたままタブを5回切り替え)で、パネルの文書は作り直されないと確定した(起動回数・黒い幕の記録に増分なし)。
 *   縞は「隠れていたパネルが再表示されて、次の最初のフレームが出るまで」の間。popup は再表示(visibilitychange)の瞬間に
 *   同期で safeRefresh() を始め、その最初の長い処理(100〜300ms)が、再表示後の最初のフレームより先に走って描画を遅らせていた。
 *   → 重い処理を、次の描画のあとの macrotask へ送る。画面は先に出て、データは直後に追従する(「接続中…」の再点灯も起きない=
 *   refresh は snapshot を残したまま走る既存の設計)。
 *
 * ■ 守ること
 *   - 必ず1回走る: rAF が来なくても(隠れた文書・タイマー間引き)保険の時間で走る=処理が永久に失われない。
 *   - 例外は外へ漏らさない。
 * @module runAfterNextPaint
 */

/** rAF が来ないときの保険(ms)。描画を待つには足りて、人が気づく遅れにはならない長さ。 */
export const RUN_AFTER_PAINT_FALLBACK_MS = 250;

/**
 * @param {() => void} fn
 * @param {{ raf?: (cb: () => void) => unknown, setTimer?: (cb: () => void, ms: number) => unknown }} [deps]
 */
export function runAfterNextPaint(fn, deps = {}) {
  const raf = 'raf' in deps ? deps.raf : typeof requestAnimationFrame === 'function' ? requestAnimationFrame : undefined;
  const setTimer = deps.setTimer || ((cb, ms) => setTimeout(cb, ms));
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    try {
      fn();
    } catch {
      /* 呼び手の処理の失敗を外へ漏らさない */
    }
  };
  // 保険を先に立てる(rAF が来なくても必ず走る)。
  setTimer(run, RUN_AFTER_PAINT_FALLBACK_MS);
  if (typeof raf === 'function') {
    try {
      // rAF はフレームの描画の【前】に呼ばれる。そこから macrotask へ送り、描画のあとに走らせる。
      raf(() => {
        setTimer(run, 0);
      });
    } catch {
      /* 保険が走る */
    }
  }
}
