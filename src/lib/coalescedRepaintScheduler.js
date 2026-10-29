/**
 * 【層】L0 判定層(依存ゼロ・chrome.* 非依存。yieldToBrowserPaint のみ依存)
 * 【この箱に入るもの】「同一tick内の複数回の予約要求を1回のコールバック実行に束ねる」
 *   pending フラグ式の最小スケジューラ
 * 【この箱に入らないもの】待ち方そのものの実装(rAF×2段+setTimeout競走は yieldToBrowserPaint.js
 *   が正本・ここで再実装しない)
 *
 * ★なぜ切り出したか(2026-09-21・段A: 即時プッシュの黒白重い根治)
 *   `popup-entry.js` の即時プッシュ受信ハンドラ(`handleInstantCommentPushMessage`)は
 *   受信するたびに同期で重い repaint(`renderStoryUserLane` 経由の DOM 再構築)を直呼びしていた。
 *   短時間に複数回プッシュが届くと、その回数だけ同期 repaint が連続実行され、
 *   イベントループを止める一因になっていた(HANDOFF 実測: 6942ms のイベントループ停止)。
 *   ここでは「複数回の予約要求のうち、実際に描くのは1フレームに1回だけでよい」という
 *   束ね(coalesce)だけを担当する。nonce検証・merge・描画本体のロジックには一切関与しない。
 *
 * ★コールバックの契約(重要・将来ここを変えるときの地雷警告)
 *   コールバックは引数を取らず、**実行される瞬間に最新のグローバル状態を都度読み直す**ことを
 *   前提にしている(例: `repaintStoryUserLaneWithInstantPushBuffer` は呼ばれた時点の
 *   `_instantPushBuffer` を読む)。これにより「予約中に状態がクリアされた(配信切替等)」場合も、
 *   コールバック側の早期return等で自然に無害化される。もしコールバックを
 *   「予約時点のスナップショットを閉じ込めて実行する」形に変えると、この安全性は崩れるので
 *   その場合は別途スナップショット鮮度の検討が必要になる。
 *
 * @module coalescedRepaintScheduler
 */
import { yieldToBrowserPaint } from './yieldToBrowserPaint.js';

/**
 * @param {() => void} callback 束ねられた末に1回だけ呼ばれる同期コールバック。
 *   実行時点の最新状態を自分で読みに行く関数であること(上記契約を参照)。
 * @param {{
 *   yieldFn?: () => Promise<void>,
 *   minIntervalMs?: () => number,
 *   nowFn?: () => number,
 *   setTimeoutFn?: (fn: () => void, ms: number) => unknown
 * }} [opts]
 *   yieldFn: 待ち方の差し替え(テスト用)。既定は yieldToBrowserPaint。
 *   minIntervalMs: ★v0.1.1816 前回の実行からこの ms は空ける(実行のたびに聞く・0 以下なら空けない)。
 *     空けている間に来た予約は束ねられ、空いた時点で1回だけ実行する(最新状態を読む契約は同じ)。
 *     視聴ページに隠れて入っている popup は新着ごとに記録全体から数え直すので、隠れている間だけ間隔を空ける。
 *   nowFn / setTimeoutFn: テスト用の差し替え。
 * @returns {{ schedule: () => void, isPending: () => boolean }}
 */
export function createCoalescedRepaintScheduler(callback, opts = {}) {
  const yieldFn = (opts && opts.yieldFn) || yieldToBrowserPaint;
  const minIntervalMs = opts && typeof opts.minIntervalMs === 'function' ? opts.minIntervalMs : null;
  const nowFn = (opts && opts.nowFn) || (() => Date.now());
  const setTimeoutFn = (opts && opts.setTimeoutFn) || ((fn, ms) => setTimeout(fn, ms));
  let pending = false;
  let lastRunAt = -Infinity;

  function run() {
    pending = false;
    lastRunAt = nowFn();
    callback();
  }

  function schedule() {
    if (pending) return; // 既に予約済みなら何もしない(束ね本体)
    pending = true;
    yieldFn().then(() => {
      let gap = 0;
      if (minIntervalMs) {
        try { gap = Number(minIntervalMs()) || 0; } catch { gap = 0; }
      }
      const waitMs = gap > 0 ? lastRunAt + gap - nowFn() : 0;
      if (waitMs > 0) {
        setTimeoutFn(run, waitMs);
        return;
      }
      run();
    });
  }

  function isPending() {
    return pending;
  }

  return { schedule, isPending };
}
