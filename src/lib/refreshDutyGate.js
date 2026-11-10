// refreshDutyGate.js — 定期の描き直し(3秒ごとの見回り)が、画面を描き直しだけで埋めないようにする門(純関数)。
//
// ★v0.1.1981(りんく方針「どんな低スペックPCでも動くように」): 横の欄は3秒ごとに全部を読み直して描き直す。
//   1回が3秒より長くかかる配信(8万行・遅い PC)では、終わった直後に次が始まり、画面が操作を受け付ける時間が
//   ほとんど無かった(手元の計測・CPU 4倍遅く: 420秒のうち空きは 10秒)。
//   直前の1回にかかった時間の REST_FACTOR 倍は次を始めない=描き直しに使うのは多くても全体の 1/(1+REST_FACTOR)。
//   軽い配信(1回が MIN_COST_MS 未満)は今までどおり毎回通す。休む長さは MAX_REST_MS まで(止まったままにしない)。
//   新しいコメントは storage の変化の知らせで別に描き直される(この門は定期の見回りだけに使う)。

export const REFRESH_DUTY_REST_FACTOR = 3;
export const REFRESH_DUTY_MIN_COST_MS = 1000;
export const REFRESH_DUTY_MAX_REST_MS = 60_000;

/**
 * @param {{ restFactor?: number, minCostMs?: number, maxRestMs?: number }} [opts]
 */
export function createRefreshDutyGate(opts = {}) {
  const restFactor = Number.isFinite(opts.restFactor) ? Math.max(0, Number(opts.restFactor)) : REFRESH_DUTY_REST_FACTOR;
  const minCostMs = Number.isFinite(opts.minCostMs) ? Math.max(0, Number(opts.minCostMs)) : REFRESH_DUTY_MIN_COST_MS;
  const maxRestMs = Number.isFinite(opts.maxRestMs) ? Math.max(0, Number(opts.maxRestMs)) : REFRESH_DUTY_MAX_REST_MS;
  let restUntil = 0;
  const diag = { runs: 0, skipped: 0, lastCostMs: 0, lastRestMs: 0, maxCostMs: 0 };
  return {
    diag,
    /**
     * 描き直し1回が終わった。
     * @param {number} startedAtMs
     * @param {number} endedAtMs
     */
    noteRun(startedAtMs, endedAtMs) {
      const s = Number(startedAtMs);
      const e = Number(endedAtMs);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return;
      const cost = e - s;
      diag.runs += 1;
      diag.lastCostMs = Math.round(cost);
      if (cost > diag.maxCostMs) diag.maxCostMs = Math.round(cost);
      const rest = cost < minCostMs ? 0 : Math.min(maxRestMs, cost * restFactor);
      diag.lastRestMs = Math.round(rest);
      restUntil = e + rest;
    },
    /**
     * 定期の見回りを今回は見送るか。
     * @param {number} nowMs
     */
    shouldSkip(nowMs) {
      const now = Number(nowMs);
      if (!Number.isFinite(now) || now >= restUntil) return false;
      diag.skipped += 1;
      return true;
    }
  };
}
