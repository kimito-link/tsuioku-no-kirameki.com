// trailingPublisher.js — 「先に1回・間引いた分は最後に1回」書く小さな仕組み(DOM も chrome API も触らない)。
//
// 背景(2026-10-28・読み上げの計器):
//   会場・コメビュの読み上げ計器は storage へ「3秒に1回まで」書いていたが、間引いた分を後から書かなかった。
//   そのため読み上げが止まると、最後の数件が反映される前の古い数(例: 読めた 2/5)が次に何か起きるまで残り、
//   状態速報や診断を読む人(と AI)が古い数で判断していた(PC 実機で確認)。
//   間引いた呼び出しがあれば、間隔が空いた時点で最新の状態を1回だけ書く。

/**
 * @param {() => void} publishNow 今の最新の状態を書く(呼ばれた時点の値を読むこと)
 * @param {number} gapMs 書く間隔の最小
 * @param {{ now?: () => number, setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (h: unknown) => void }} [deps]
 * @returns {{ request: () => void, cancel: () => void }}
 */
export function createTrailingPublisher(publishNow, gapMs, deps = {}) {
  const now = deps.now || (() => Date.now());
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((h) => clearTimeout(/** @type {any} */ (h)));
  const gap = Number.isFinite(gapMs) && gapMs > 0 ? gapMs : 0;
  let lastAt = -Infinity;
  /** @type {unknown} */
  let timer = null;

  const fire = () => {
    timer = null;
    lastAt = now();
    try { publishNow(); } catch { /* 計器の失敗は本体を止めない */ }
  };

  return {
    request() {
      const wait = lastAt + gap - now();
      if (wait <= 0) {
        if (timer != null) { clearTimer(timer); timer = null; }
        fire();
        return;
      }
      if (timer == null) timer = setTimer(fire, wait);
    },
    cancel() {
      if (timer != null) { clearTimer(timer); timer = null; }
    }
  };
}
