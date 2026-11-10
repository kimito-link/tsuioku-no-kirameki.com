// refreshStageClock.js — 描き直し1回(refresh)が「いまどの段にいるか・各段に何ミリ秒かかったか」を残す計器(純関数)。
//
// ★v0.1.1985: PC の実測(8万行の配信・CPU 4倍遅く)で、画面は動いているのに最初の描き直しが5分たっても終わらなかった。
//   長い処理(longtask)はほとんど無く、何かの返事を待っている。どの待ちかを名指しするために、段の入口で印を付ける。
//   値は globalThis.__refreshStageDiag で読める(DevTools・自動試験用)。画面の動きは変えない。

/**
 * @returns {{
 *   diag: { runs: number, stage: string, stageSinceMs: number, startedAtMs: number, lastTotals: Record<string, number>, lastTotalMs: number, maxStage: string, maxStageMs: number },
 *   begin: (nowMs: number) => void,
 *   enter: (name: string, nowMs: number) => void,
 *   end: (nowMs: number) => void
 * }}
 */
export function createRefreshStageClock() {
  /** @type {Record<string, number>} */
  let totals = {};
  const diag = {
    runs: 0,
    /** いまいる段('idle' = 描き直していない) */
    stage: 'idle',
    /** その段に入った時刻 */
    stageSinceMs: 0,
    /** いまの(または最後の)1回が始まった時刻 */
    startedAtMs: 0,
    /** 最後に終わった1回の、段ごとの合計 ms */
    lastTotals: /** @type {Record<string, number>} */ ({}),
    lastTotalMs: 0,
    /** これまでで一番長かった段と、その ms */
    maxStage: '',
    maxStageMs: 0
  };
  /** @param {number} now */
  const close = (now) => {
    if (diag.stage === 'idle') return;
    const ms = Math.max(0, now - diag.stageSinceMs);
    totals[diag.stage] = (totals[diag.stage] || 0) + ms;
    if (ms > diag.maxStageMs) {
      diag.maxStageMs = Math.round(ms);
      diag.maxStage = diag.stage;
    }
  };
  return {
    diag,
    begin(nowMs) {
      const now = Number(nowMs);
      if (!Number.isFinite(now)) return;
      close(now);
      totals = {};
      diag.runs += 1;
      diag.stage = 'start';
      diag.stageSinceMs = now;
      diag.startedAtMs = now;
    },
    enter(name, nowMs) {
      const now = Number(nowMs);
      if (!Number.isFinite(now) || diag.stage === 'idle') return;
      close(now);
      diag.stage = String(name || '?');
      diag.stageSinceMs = now;
    },
    end(nowMs) {
      const now = Number(nowMs);
      if (!Number.isFinite(now) || diag.stage === 'idle') return;
      close(now);
      /** @type {Record<string, number>} */
      const rounded = {};
      for (const [k, v] of Object.entries(totals)) rounded[k] = Math.round(v);
      diag.lastTotals = rounded;
      diag.lastTotalMs = Math.round(now - diag.startedAtMs);
      diag.stage = 'idle';
      diag.stageSinceMs = now;
    }
  };
}
