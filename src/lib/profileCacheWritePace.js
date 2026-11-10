/**
 * 横の欄が「名前・顔の控え」(nls_user_comment_profile_v1)を書く間隔(v0.1.1976)。
 *
 * ★経緯(PC 実測 0.1.1975・Kick 8万1千行・約6,500人): 横の欄は記録を組み立てるたびに、控えに1人でも
 *   名前や顔が増えると控えの全体(1回 約400KB)を書いていた。110秒に9回・3.6MB。chrome.storage.onChanged は
 *   新旧の値を拡張の全ページへ配るので、外枠と iframe がそれぞれ約7MB を受け取っていた(受け取りの合計の半分)。
 *   → 控えが小さいうち(ニコ生の普段の規模)は今までどおり毎回書く。大きくなったら書く最短間隔を空ける。
 *     間に増えた分は捨てずに、間隔が空いたら最後の状態を1回だけ書く(横の欄の中の控えは今までどおり即使う)。
 */

/** これ以下の人数の控えは今までどおり(間隔0=毎回書く) */
export const PROFILE_CACHE_PACE_FREE_PEOPLE = 2000;
/** 大きい控えを書く最短間隔(ms) */
export const PROFILE_CACHE_PACE_GAP_MS = 30000;

/**
 * @param {number} people 控えの人数
 * @returns {number} 最短間隔(ms)
 */
export function profileCacheWriteGapMs(people) {
  const n = Number(people);
  if (!Number.isFinite(n) || n <= PROFILE_CACHE_PACE_FREE_PEOPLE) return 0;
  return PROFILE_CACHE_PACE_GAP_MS;
}

/**
 * 控えの書き込みの間隔係(状態つき)。
 *   offer(people) が true なら呼び出し側はいつもどおり save に控えを入れる。
 *   false なら入れない。そのとき係は間隔が空いた時点で flush() を1回だけ呼ぶ(最後の状態を書かせる)。
 * @param {{ flush: () => void, now?: () => number, setTimer?: (fn: () => void, ms: number) => any }} deps
 */
export function createProfileCacheWritePacer(deps) {
  const now = deps.now || (() => Date.now());
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  let lastAt = 0;
  /** @type {any} */
  let timer = null;
  const diag = { now: 0, deferred: 0, flushedLater: 0 };
  return {
    diag,
    /**
     * @param {number} people 控えの人数
     * @returns {boolean} true = いま書く
     */
    offer(people) {
      const t = now();
      const gap = profileCacheWriteGapMs(people);
      const since = t - lastAt;
      if (!lastAt || gap <= 0 || since < 0 || since >= gap) {
        lastAt = t;
        diag.now += 1;
        return true;
      }
      diag.deferred += 1;
      if (!timer) {
        timer = setTimer(() => {
          timer = null;
          lastAt = now();
          diag.flushedLater += 1;
          try { deps.flush(); } catch { /* 次の offer で書ける */ }
        }, gap - since);
      }
      return false;
    }
  };
}
