// inFlightGuard.js
// 状態速報「重さ根治 P3」: runStorageOpWithTimeout(storageOpTimeout.js)は Promise.race で
//   タイムアウトを有界化するが、タイムアウト後も opFn(実 IDB/chrome.storage 操作)自体は
//   裏で生き続ける。次 tick が同じ opFn を再発行すると、前回の「幽霊 read」と多重に競合し、
//   混雑をさらに悪化させる(readHeavyFromStore の heavyReadActive と同じ構造の問題)。
//
// popup-entry.js の heavyReadActive(v0.1.1037)は「実呼びする時だけ true を立て、次 poll が
//   それを見て短絡する」in-flight ガードの前例。本モジュールはそれを汎用の純関数として切り出し、
//   status-entry.js の loadCustomSoundDiagSafe(IndexedDB open+count+fetch を伴う唯一の重い
//   extras 処理・P1 で count() 化済みだが依然重い)に適用する。
//
// 設計:
//   - createInFlightGuard(opFn, { ceilingMs, now }) は { run(fallback), isInFlight() } を返す。
//   - run(fallback) 呼び出し時、前回発行した opFn() がまだ未解決なら【新規発行せず】fallback を返す。
//   - ただし前回発行から ceilingMs を超えていたら「固着」とみなし、無条件で再発行を許可する
//     (opFn 自体が永久に pending のまま壊れているケースの保険。ceilingMs 自体は解放をトリガーする
//     だけで、古い Promise を破棄するわけではない=多重 await にはなるが「読み取りを増やさない」
//     という本ガードの目的は達成される)。
//   - now は呼び出し側から注入できる(テスト容易化。既定 Date.now)。

/**
 * @template T
 * @param {() => Promise<T>} opFn 実行する非同期処理(呼ぶたびに新しい Promise を返すこと)
 * @param {{ ceilingMs?: number, now?: () => number }} [options]
 * @returns {{ run: (fallback: T) => Promise<T>, isInFlight: () => boolean }}
 */
export function createInFlightGuard(opFn, options = {}) {
  const ceilingMs = Number.isFinite(options.ceilingMs) ? Number(options.ceilingMs) : 15000;
  const now = typeof options.now === 'function' ? options.now : Date.now;

  let inFlight = false;
  let startedAt = 0;

  const isInFlight = () => inFlight;

  /**
   * @param {T} fallback in-flight 中に返す既定値(直近キャッシュ等を呼び出し側が用意する)
   * @returns {Promise<T>}
   */
  const run = async (fallback) => {
    if (inFlight) {
      const elapsed = now() - startedAt;
      if (elapsed < ceilingMs) {
        // 前回発行分がまだ解決していない= 新規発行せず fallback を返す(幽霊 read の多重化を防ぐ)。
        return fallback;
      }
      // ceilingMs 超過=固着とみなし、再発行を許可する(前回分の解決は妨げない)。
    }
    inFlight = true;
    startedAt = now();
    try {
      const result = await opFn();
      return result;
    } finally {
      inFlight = false;
    }
  };

  return { run, isInFlight };
}

// v0.1.1142(診断ページ608秒固まり根治): 上の createInFlightGuard は「in-flight中はfallbackを
//   1回返す」だけで、timeout有界化・last-good(直近成功値)の保持・幽霊readの遅延resolve収穫を
//   持たない。status-entry.js のコアread(lives/summaries/fastDiagLite/popupDiag/backfillProgress)
//   はtimeoutでrejectするとrefresh()全体がcatchへ落ちて真っ白になり(制御フローの問題)、次tickが
//   同じopFnを再発行して幽霊readと多重競合する(輻輳の増幅)。createStaleGuardedRead はこの2つを
//   同時に断つ: timeoutしてもthrowせず直近成功値をstaleで返し、in-flight中は新規発行せず、
//   幽霊のresolveを自動収穫(harvest)してlast-goodを更新する。

import { startStorageOpWithTimeout, STORAGE_OP_TIMED_OUT } from './storageOpTimeout.js';

/**
 * 2026-07-14: コアread用「stale-while-revalidate」ガード。in-flight判定はDate.now壁時計に
 *   依存する(setTimeoutの発火に頼らない=裏タブ化によるタイマースロットリングでも壊れない)。
 * @template T
 * @param {(arg?: any) => Promise<T>} opFn
 * @param {{ emptyValue?: T, reissueCeilingMs?: number, now?: () => number }} [options]
 * @returns {{
 *   read: (opts?: { timeoutMs?: number, arg?: any }) => Promise<{
 *     value: T, stale: boolean, hadData: boolean, ageMs: number, reason: string
 *   }>,
 *   getStats: () => { freshCount: number, staleServeCount: number, timeoutCount: number,
 *     lateHarvestCount: number, reissueCount: number, inFlight: boolean, pendingMs: number,
 *     lastGoodAgeMs: number }
 * }}
 */
export function createStaleGuardedRead(opFn, options = {}) {
  const reissueCeilingMs = Number.isFinite(options.reissueCeilingMs)
    ? Number(options.reissueCeilingMs)
    : 60_000;
  const emptyValue = 'emptyValue' in options ? options.emptyValue : null;
  const now = typeof options.now === 'function' ? options.now : Date.now;

  /** @type {{ op: Promise<any>, startedAt: number, seq: number }|null} */
  let pending = null;
  let seqCounter = 0;
  let lastGood = { value: emptyValue, at: 0, seq: 0 };
  const stats = {
    freshCount: 0,
    staleServeCount: 0,
    timeoutCount: 0,
    lateHarvestCount: 0,
    reissueCount: 0
  };

  /** @param {string} reason */
  const staleResult = (reason) => ({
    value: lastGood.value,
    stale: true,
    hadData: lastGood.at > 0,
    ageMs: lastGood.at > 0 ? now() - lastGood.at : -1,
    reason
  });

  /** @param {{ timeoutMs?: number, arg?: any }} [readOpts] */
  const read = async (readOpts = {}) => {
    const { timeoutMs, arg } = readOpts;
    if (pending) {
      if (now() - pending.startedAt < reissueCeilingMs) {
        stats.staleServeCount += 1;
        return staleResult('in-flight'); // 幽霊が生きている間は新規readを一切発行しない
      }
      stats.reissueCount += 1; // 固着とみなし再発行(旧幽霊のharvestは残る=遅延resolveも無駄にしない)
    }
    const seq = ++seqCounter;
    const { race, op } = startStorageOpWithTimeout(() => opFn(arg), timeoutMs);
    const mine = { op, startedAt: now(), seq };
    pending = mine;
    let servedStale = false;
    op.then((v) => {
      if (seq > lastGood.seq) {
        // 古い幽霊が新しい成功値を上書きしない(逆転防止)。
        lastGood = { value: v, at: now(), seq };
        if (servedStale) stats.lateHarvestCount += 1;
      }
    })
      .catch(() => {
        /* 幽霊のrejectは握る(unhandled rejection防止) */
      })
      .finally(() => {
        if (pending === mine) pending = null;
      });
    try {
      const value = await race;
      stats.freshCount += 1;
      return { value, stale: false, hadData: true, ageMs: 0, reason: 'fresh' };
    } catch (err) {
      servedStale = true;
      if (err === STORAGE_OP_TIMED_OUT) stats.timeoutCount += 1;
      return staleResult(err === STORAGE_OP_TIMED_OUT ? 'timeout' : 'error');
    }
  };

  const getStats = () => ({
    ...stats,
    inFlight: pending != null,
    pendingMs: pending ? now() - pending.startedAt : 0,
    lastGoodAgeMs: lastGood.at > 0 ? now() - lastGood.at : -1
  });

  return { read, getStats };
}
