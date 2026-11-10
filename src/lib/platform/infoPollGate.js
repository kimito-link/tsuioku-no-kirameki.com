// infoPollGate.js — 配信の情報の口を何秒おきに読むかを決める小さな門(純関数)
// @layer L0 — 純粋計算
//
// ★2026-11-09 PC 実測: TikTok の入口は「記録中のときだけ」30 秒に間引いていたため、配信が終わったページや
//   口が失敗し続けるページでは 1 秒おきに /api-live/user/room/ を読み続けた(status 4 が 73 回・失敗 146 回・最後は 403)。
//   ミクチャ・SHOWROOM の入口も同じ形だった。記録中かどうかに関係なく、同じページは決めた間隔でしか読まない。
//   - 配信中: liveMs(呼ぶ側が短くしてよい: 終わり際など)
//   - 配信していない: idleMs
//   - 失敗: failBaseMs から倍々に failMaxMs まで(成功で戻る)
//   ページ(id)が変わったらすぐ読む。

/**
 * @param {{ liveMs?: number, idleMs?: number, failBaseMs?: number, failMaxMs?: number }} [opts]
 */
export function createInfoPollGate(opts = {}) {
  const liveMs = opts.liveMs ?? 30_000;
  const idleMs = opts.idleMs ?? 60_000;
  const failBaseMs = opts.failBaseMs ?? 30_000;
  const failMaxMs = opts.failMaxMs ?? 300_000;
  let id = '';
  let at = 0;
  let waitMs = 0;
  let fails = 0;
  return {
    /**
     * 今読んでよいか
     * @param {string} pageId
     * @param {number} now
     * @param {number} [liveOverrideMs] 配信中の間隔を一時的に変える(終わり際に短く等)
     */
    due(pageId, now, liveOverrideMs) {
      if (pageId !== id) return true;
      const w = liveOverrideMs != null && waitMs === liveMs ? Math.min(liveOverrideMs, waitMs) : waitMs;
      return now - at >= w;
    },
    /**
     * 読んだ結果
     * @param {string} pageId
     * @param {'live' | 'idle' | 'fail'} outcome
     * @param {number} now
     */
    done(pageId, outcome, now) {
      if (pageId !== id) fails = 0;
      id = pageId;
      at = now;
      if (outcome === 'fail') {
        fails += 1;
        waitMs = Math.min(failMaxMs, failBaseMs * 2 ** (fails - 1));
      } else {
        fails = 0;
        waitMs = outcome === 'live' ? liveMs : idleMs;
      }
    },
    /** すぐ読み直す(ページの URL が変わったとき) */
    reset() {
      id = '';
      at = 0;
      waitMs = 0;
      fails = 0;
    },
    get fails() {
      return fails;
    },
  };
}
