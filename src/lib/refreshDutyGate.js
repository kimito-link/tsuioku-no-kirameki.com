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
// ★v0.1.1984: 重い描き直しのあと、外からの変化(storage の知らせ)が1つも来ていないなら、定期の見回りは QUIET_MAX_REST_MS まで休む。
//   終わった配信の大きな記録を開いているだけのとき、何も変わっていないのに 8万行を読み直して描き直していた
//   (手元の計測・CPU 4倍遅く・2,000人ぶんのマスあり: 1回 約10秒を 40秒おき)。変化の知らせが来たら次の見回りは通す。
export const REFRESH_DUTY_QUIET_MAX_REST_MS = 300_000;

/**
 * @param {{ restFactor?: number, minCostMs?: number, maxRestMs?: number, quietMaxRestMs?: number }} [opts]
 */
export function createRefreshDutyGate(opts = {}) {
  const restFactor = Number.isFinite(opts.restFactor) ? Math.max(0, Number(opts.restFactor)) : REFRESH_DUTY_REST_FACTOR;
  const minCostMs = Number.isFinite(opts.minCostMs) ? Math.max(0, Number(opts.minCostMs)) : REFRESH_DUTY_MIN_COST_MS;
  const maxRestMs = Number.isFinite(opts.maxRestMs) ? Math.max(0, Number(opts.maxRestMs)) : REFRESH_DUTY_MAX_REST_MS;
  const quietMaxRestMs = Number.isFinite(opts.quietMaxRestMs) ? Math.max(0, Number(opts.quietMaxRestMs)) : REFRESH_DUTY_QUIET_MAX_REST_MS;
  let restUntil = 0;
  /** 直前の1回の始まり・終わり・重かったか、最後に外からの変化を見た時刻 */
  let lastStart = 0;
  let lastEnd = 0;
  let lastHeavy = false;
  let lastChangeAt = 0;
  const diag = { runs: 0, skipped: 0, skippedQuiet: 0, changes: 0, lastChangeKeys: '', lastCostMs: 0, lastRestMs: 0, maxCostMs: 0 };
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
      lastStart = s;
      lastEnd = e;
      lastHeavy = cost >= minCostMs;
    },
    /**
     * 外からの変化(自分の書き込み以外の storage の知らせ)を見た。
     * @param {number} nowMs
     * @param {string[]} [keys] 変わったキー(計器用)
     */
    noteChange(nowMs, keys) {
      const now = Number(nowMs);
      if (!Number.isFinite(now)) return;
      diag.changes += 1;
      // どのキーの変化だったか(犯人探し用・キーの族だけ。配信の番号は落とす)
      if (Array.isArray(keys)) diag.lastChangeKeys = keys.slice(0, 4).map((k) => String(k).replace(/\d{4,}/g, '#').slice(0, 40)).join(',');
      if (now > lastChangeAt) lastChangeAt = now;
    },
    /**
     * 定期の見回りを今回は見送るか。
     * @param {number} nowMs
     */
    shouldSkip(nowMs) {
      const now = Number(nowMs);
      if (!Number.isFinite(now)) return false;
      if (now < restUntil) {
        diag.skipped += 1;
        return true;
      }
      // 重い1回のあと、その始まりより後に変化を1つも見ていないなら、まだ休む(始まりより後の変化は読み落としているかもしれないので通す)
      if (lastHeavy && lastChangeAt < lastStart && now < lastEnd + quietMaxRestMs) {
        diag.skipped += 1;
        diag.skippedQuiet += 1;
        return true;
      }
      return false;
    }
  };
}
