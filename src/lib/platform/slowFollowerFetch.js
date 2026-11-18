/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】公開の人数を、いつ1回読むかの間隔
 * 【この箱に入らないもの】fetch / storage / chrome.*
 * 【書けるstorageキー】なし
 *
 * 開始時に1回、その後は約5分に1回、終わりに1回。失敗したら間隔を倍にして、最大20分。
 * タブが隠れている間の定期読みはしない。終わりの1回は隠れてもよい。
 */

export const SLOW_FOLLOWER_FETCH_MS = 5 * 60 * 1000;
export const SLOW_FOLLOWER_BACKOFF_MAX_MS = 20 * 60 * 1000;
const END_GAP_MS = 15 * 1000;

/**
 * @typedef {{ nextAt: number, failStreak: number, lastTryAt: number }} SlowFollowerClock
 */

/** @returns {SlowFollowerClock} */
export function freshSlowFollowerClock() {
  return { nextAt: 0, failStreak: 0, lastTryAt: 0 };
}

/**
 * @param {SlowFollowerClock | null | undefined} state
 * @param {number} now
 * @param {{ hasTarget?: boolean, hidden?: boolean, force?: boolean }} [opts]
 */
export function slowFollowerFetchDue(state, now, opts = {}) {
  if (!opts.hasTarget) return false;
  const t = Math.floor(Number(now) || 0);
  if (!(t > 0)) return false;
  const last = Math.floor(Number(state?.lastTryAt) || 0);
  if (opts.force) return !(last && t - last < END_GAP_MS);
  if (opts.hidden) return false;
  const next = Math.floor(Number(state?.nextAt) || 0);
  return !next || t >= next;
}

/**
 * @param {SlowFollowerClock | null | undefined} state
 * @param {number} now
 * @param {boolean} ok
 * @returns {SlowFollowerClock}
 */
export function slowFollowerFetchAdvance(state, now, ok) {
  const t = Math.floor(Number(now) || 0);
  const prev = Math.max(0, Math.floor(Number(state?.failStreak) || 0));
  const failStreak = ok ? 0 : Math.min(4, prev + 1);
  const wait = ok
    ? SLOW_FOLLOWER_FETCH_MS
    : Math.min(SLOW_FOLLOWER_BACKOFF_MAX_MS, SLOW_FOLLOWER_FETCH_MS * 2 ** Math.max(0, failStreak - 1));
  return { nextAt: t + wait, failStreak, lastTryAt: t };
}

/**
 * 1配信につき読み取りは1本。配信が変わったら間隔を最初からにする。
 * 読み取りそのものは呼び出し側。ここは「今読んでよいか」だけ。
 */
export function createSlowFollowerFetch() {
  /** @type {SlowFollowerClock} */
  let state = freshSlowFollowerClock();
  let key = '';
  let busy = false;
  let gen = 1;
  return {
    /** @returns {string} */
    currentKey() {
      return key;
    },
    /**
     * 読んでよいとき、その読み取りの番号(1以上)。まだ早い・他を読んでいるときは 0。
     * @param {string} nextKey
     * @param {{ now?: number, hidden?: boolean, force?: boolean }} [opts]
     */
    claim(nextKey, opts = {}) {
      const id = String(nextKey || '');
      if (!id) return 0;
      if (id !== key) {
        key = id;
        state = freshSlowFollowerClock();
        gen += 1;
      }
      if (busy) return 0;
      const now = opts.now == null ? Date.now() : opts.now;
      if (!slowFollowerFetchDue(state, now, { hasTarget: true, hidden: opts.hidden === true, force: opts.force === true })) return 0;
      busy = true;
      return gen;
    },
    /**
     * @param {number} ticket
     * @param {boolean} ok
     * @param {number} [now]
     */
    finish(ticket, ok, now = Date.now()) {
      busy = false;
      if (ticket !== gen) return;
      state = slowFollowerFetchAdvance(state, now, ok === true);
    },
  };
}
