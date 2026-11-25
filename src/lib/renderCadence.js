// renderCadence.js — コメントで動く画面(①パネル・会場)が「何 ms に1回まで描き直すか」を決める共通の決まり。
// @layer L0 — 純関数と小さな計器(DOM・タイマー・通信なし。時刻は呼び出し側が渡す)
//
// ■ なぜ要るか(2026-11-25 箱の実測・GPU 切り・8コメ/秒):
//   拡張の文書(会場・横の欄・視聴ページ内のパネル)は、コメント1件ごとにそれぞれ描き直していた。
//   1つ1つの描き直しは軽いが、3つの文書 × 毎コメントで、拡張のプロセスだけで約0.6コア使っていた
//   (コメントを止めると約0.3コアに下がる=半分がコメントごとの描き直し)。
// ■ 決まり(どの画面も同じ):
//   - コメントがゆっくり(1分に27件未満)・PC に余裕あり → 今までどおり(画面ごとの元の間隔)。
//   - コメントが速い(1分に27件以上=会場の熱量「盛り上がり」と同じ境目) → 250ms に1回までまとめて描く。
//     1秒に4回は描くので、流れは止まって見えない。コメントは1件も捨てない(まとめて出すだけ)。
//   - その文書の心拍がずれている(既存の extDocBusyCensus の1秒心拍・60ms 以上) → 400ms、200ms 以上 → 800ms。
//   飾り(キャラの浮遊・観客のそよぎ)は群衆と同じ段(venueCrowdFramePolicy)に、混雑中は 8fps を足す。
// ■ 新しいタイマー・見張り・計測・設定は無い。どの合図も既にあるものだけ。

import { resolveVenueCrowdFrameMs, VENUE_CROWD_FRAME_MS_BUSY } from './venueCrowdFramePolicy.js';

/** コメントが「速い」とみなす件数/分(venueBusyCalm の熱量 0.45 × 60件/分 と同じ境目)。 */
export const RENDER_CADENCE_BUSY_PER_MIN = 27;
/** 速いときの描き直しの最短間隔。 */
export const RENDER_CADENCE_LIST_BUSY_MS = 250;
/** 心拍がずれているとき(詰まり気味)。 */
export const RENDER_CADENCE_LIST_LAG_MS = 400;
/** 心拍が大きくずれているとき(固まりかけ)。 */
export const RENDER_CADENCE_LIST_STALL_MS = 800;
export const RENDER_CADENCE_LAG_BUSY_MS = 60;
export const RENDER_CADENCE_LAG_STALL_MS = 200;

/**
 * コメントで更新される一覧(応援レーン・席など)の描き直しの最短間隔。
 * @param {{ baseMs?: number, recentLagMs?: number, busyChat?: boolean }} [s]
 * @returns {number} ms(baseMs 未満にはならない)
 */
export function resolveListRenderGapMs(s = {}) {
  const base = Math.max(0, Number(s?.baseMs) || 0);
  const lagRaw = Number(s?.recentLagMs);
  const lag = Number.isFinite(lagRaw) && lagRaw > 0 ? lagRaw : 0;
  let gap = base;
  if (s?.busyChat === true) gap = Math.max(gap, RENDER_CADENCE_LIST_BUSY_MS);
  if (lag >= RENDER_CADENCE_LAG_STALL_MS) gap = Math.max(gap, RENDER_CADENCE_LIST_STALL_MS);
  else if (lag >= RENDER_CADENCE_LAG_BUSY_MS) gap = Math.max(gap, RENDER_CADENCE_LIST_LAG_MS);
  return gap;
}

/**
 * 飾り(キャラの浮遊・観客のそよぎ)を何 ms に1回描くか。群衆の決まりに「コメントが速い間は 8fps」を足す。
 * @param {{ recentLagMs?: number, voiceOverloaded?: boolean, lightVoiceActive?: boolean, weakVoicePc?: boolean, busyChat?: boolean }} [s]
 * @returns {number}
 */
export function resolveDecorFrameMs(s = {}) {
  const base = resolveVenueCrowdFrameMs(s);
  return s?.busyChat === true ? Math.max(base, VENUE_CROWD_FRAME_MS_BUSY) : base;
}

/**
 * コメントの届く速さ(件/分)を、届いたときに渡される件数だけで見積もる(時定数10秒で古い分が薄れる)。
 * タイマーは使わない。読むときも時刻を渡す。
 * @param {{ tauMs?: number }} [opts]
 */
export function createArrivalRateMeter(opts = {}) {
  const tau = Math.max(1000, Number(opts?.tauMs) || 10_000);
  let acc = 0;
  let at = 0;
  const decayTo = (/** @type {number} */ now) => {
    if (!(at > 0)) return 0;
    const dt = Math.max(0, now - at);
    return acc * Math.exp(-dt / tau);
  };
  return {
    /** @param {number} count @param {number} nowMs */
    note(count, nowMs) {
      const n = Number(count);
      const now = Number(nowMs);
      if (!(n > 0) || !Number.isFinite(now)) return;
      acc = decayTo(now) + n;
      at = now;
    },
    /** @param {number} nowMs @returns {number} 件/分 */
    perMin(nowMs) {
      const now = Number(nowMs);
      if (!Number.isFinite(now)) return 0;
      return (decayTo(now) / tau) * 60_000;
    },
    /** @param {number} nowMs */
    isBusy(nowMs) {
      return this.perMin(nowMs) >= RENDER_CADENCE_BUSY_PER_MIN;
    },
  };
}
