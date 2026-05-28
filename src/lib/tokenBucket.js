/**
 * PR5（feat/multitab-scale-ultraC）: トークンバケットによるグローバル流量制御の純ロジック。
 *
 * 背景（[[reference_multitab_scale_ultraC_leader_election]]）:
 *   SW が代表 fetch（koken/nicoad/event 等）する全リクエストを1つのバケットに通すと、タブ数に
 *   関係なくグローバルに流量を抑えられる（7タブでも 7×にならない・429 回避）。SW は拡張に1つ
 *   なのでバケットも自然にグローバル。
 *
 *   この関数は「容量 capacity・補充レート refillPerSec のバケットから今トークンを取れるか」を
 *   時刻注入で純粋に判定する（chrome/タイマー非依存・vitest 可能）。SW は ESM import 不可なので
 *   配線時はこの挙動を SW へ手書きコピーし契約をこの test で固定する。
 *
 * @module tokenBucket
 */

/**
 * @typedef {{ capacity: number, refillPerSec: number, tokens: number, lastRefillMs: number }} TokenBucketState
 */

/**
 * バケット初期状態を作る（満タンで開始）。
 * @param {number} capacity 最大トークン数（バースト上限）
 * @param {number} refillPerSec 1 秒あたりの補充トークン数
 * @param {number} nowMs
 * @returns {TokenBucketState}
 */
export function createTokenBucket(capacity, refillPerSec, nowMs) {
  const cap = Number.isFinite(capacity) && capacity > 0 ? capacity : 1;
  const rate = Number.isFinite(refillPerSec) && refillPerSec > 0 ? refillPerSec : 1;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  return { capacity: cap, refillPerSec: rate, tokens: cap, lastRefillMs: now };
}

/**
 * 経過時間ぶんトークンを補充した次状態を返す（capacity を上限にクランプ）。純粋。
 * @param {TokenBucketState} state
 * @param {number} nowMs
 * @returns {TokenBucketState}
 */
export function refillTokenBucket(state, nowMs) {
  if (!state || typeof state !== 'object') return createTokenBucket(1, 1, nowMs);
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  // ⚠️ lastRefillMs が 0 のとき `|| now` だと falsy で now に化け elapsed=0 になる（0 落とし穴）。
  //   Number.isFinite で明示判定する。
  const lastRefill = Number.isFinite(Number(state.lastRefillMs))
    ? Number(state.lastRefillMs)
    : now;
  const elapsedMs = Math.max(0, now - lastRefill);
  const added = (elapsedMs / 1000) * (Number(state.refillPerSec) || 0);
  const tokens = Math.min(
    Number(state.capacity) || 0,
    (Number(state.tokens) || 0) + added
  );
  return { ...state, tokens, lastRefillMs: now };
}

/**
 * 今トークンを1つ取れるなら取って `{ allowed:true, state }` を返す。取れなければ
 * `{ allowed:false, state, waitMs }`（waitMs = 次に1トークン貯まるまでの目安 ms）。純粋。
 *
 * @param {TokenBucketState} state
 * @param {number} nowMs
 * @param {number} [cost] 消費トークン数（既定 1）
 * @returns {{ allowed: boolean, state: TokenBucketState, waitMs: number }}
 */
export function tryTakeToken(state, nowMs, cost = 1) {
  const refilled = refillTokenBucket(state, nowMs);
  const need = Number.isFinite(cost) && cost > 0 ? cost : 1;
  if (refilled.tokens >= need) {
    return {
      allowed: true,
      state: { ...refilled, tokens: refilled.tokens - need },
      waitMs: 0
    };
  }
  const deficit = need - refilled.tokens;
  const rate = Number(refilled.refillPerSec) || 1;
  const waitMs = Math.ceil((deficit / rate) * 1000);
  return { allowed: false, state: refilled, waitMs };
}
