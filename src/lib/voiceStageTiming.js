// voiceStageTiming.js — 読み上げの遅れを「段階ごと」に測る計器(印字専用・読み上げの挙動には一切介入しない)。
//
// 背景(2026-10-22 りんく実機・計画書 /mnt/project-files/voice/voice-lag-volume-plan.md P1):
//   ノートPC(内蔵GPU)で「追いつくが若干遅れる」。既存の体感遅延(e2e)は【キュー投入→再生】しか
//   測っておらず、(1)受信→キュー(保存のまとめ書き 最大1.5秒) (2)エンジンが前の合成で詰まっていた時間
//   (3)初めて使う声のモデル読み込み(ノートPCで初回7.7秒) を区別できなかった。
//   ここはその区別をつける純関数と、合成1件ごとの計測器。会場(VoicePlayer)とコメビュの両実装が共用する。

import { updateVoiceServiceTimeEma } from './voiceLagBudget.js';

/** 受信→キューの値として信じる上限(ms)。これを超えるのは時計ずれ・過去ログ再生等=計測から除外。 */
export const VOICE_UPSTREAM_SANE_MAX_MS = 60_000;

/**
 * 2つの時刻の間隔(ms)。受信→キュー投入、キュー投入→取り出し などに使う。
 * 測れない/信用できない値(欠損・時計の逆転・上限超え)は -1。
 * @param {unknown} fromMs
 * @param {unknown} toMs
 * @returns {number}
 */
export function measureVoiceGapMs(fromMs, toMs) {
  const cap = Number(fromMs);
  const enq = Number(toMs);
  if (!Number.isFinite(cap) || cap <= 0 || !Number.isFinite(enq) || enq <= 0) return -1;
  const ms = enq - cap;
  if (ms < 0 || ms > VOICE_UPSTREAM_SANE_MAX_MS) return -1;
  return Math.round(ms);
}

/**
 * diag の EMA フィールドへ1サンプル畳み込む(負値=未計測は無視)。
 * @param {Record<string, any>} diag
 * @param {string} field
 * @param {unknown} sampleMs
 */
export function foldVoiceStageEma(diag, field, sampleMs) {
  const v = Number(sampleMs);
  if (!diag || typeof diag !== 'object' || !Number.isFinite(v) || v < 0) return;
  diag[field] = Math.round(updateVoiceServiceTimeEma(diag[field], v));
}

/**
 * 合成1件ごとの計測器。VOICEVOX エンジンは実測でほぼ直列(3件同時でも15%しか縮まない)なので、
 * k件目の合成は (k-1)件目が終わるまでエンジン内で待たされる。その待ち(engineWaitMs)を
 * 「前の合成の完了時刻 − 自分の依頼時刻」で推定し、合成そのものの時間と分けて記録する。
 * 初めて使う styleId は cold として別に数える(モデル初回読み込みの疑いを数字で確かめるため)。
 *
 * @param {{ now?: () => number }} [deps]
 */
export function createVoiceSynthTracker(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  /** @type {Set<string>} */
  const seenStyles = new Set();
  /** 直前に依頼した合成の「完了時刻」を返す Promise(連鎖)。 */
  /** @type {Promise<number>} */
  let prevDone = Promise.resolve(0);

  return {
    /**
     * @param {unknown} styleId
     * @returns {{ cold: boolean, end: (timing?: { queryMs?: number, synthMs?: number }, ok?: boolean) => { cold: boolean, ok: boolean, totalMs: number, engineWaitMs: number, queryMs: number, synthMs: number } }}
     */
    begin(styleId) {
      const startAt = now();
      const key = String(styleId ?? '');
      const cold = !seenStyles.has(key);
      seenStyles.add(key);
      let prevDoneAt = -1;
      prevDone.then((t) => { prevDoneAt = t; }, () => {});
      /** @type {(t: number) => void} */
      let resolveSelf = () => {};
      prevDone = new Promise((r) => { resolveSelf = r; });
      let ended = false;
      /** @type {ReturnType<ReturnType<typeof createVoiceSynthTracker>['begin']>['end']} */
      const end = (timing = {}, ok = true) => {
        const endAt = now();
        if (!ended) {
          ended = true;
          resolveSelf(endAt);
        }
        const q = Number(timing?.queryMs);
        const s = Number(timing?.synthMs);
        return {
          cold,
          ok: ok === true,
          totalMs: Math.max(0, endAt - startAt),
          engineWaitMs: prevDoneAt > startAt ? Math.min(prevDoneAt, endAt) - startAt : 0,
          queryMs: Number.isFinite(q) && q >= 0 ? Math.round(q) : -1,
          synthMs: Number.isFinite(s) && s >= 0 ? Math.round(s) : -1
        };
      };
      return { cold, end };
    }
  };
}

/**
 * 計測器の結果を diag へ反映する。失敗した合成は時間を EMA に混ぜない(打ち切り8秒が平均を汚すため)。
 * cold(初めての声)は warm と別の物差しに入れる=「初回だけ遅い」のか「いつも遅い」のかを分ける。
 * @param {Record<string, any>} diag
 * @param {ReturnType<ReturnType<ReturnType<typeof createVoiceSynthTracker>['begin']>['end']>} r
 */
export function recordVoiceSynthStage(diag, r) {
  if (!diag || typeof diag !== 'object' || !r) return;
  if (!r.ok) return;
  foldVoiceStageEma(diag, 'engineWaitEmaMs', r.engineWaitMs);
  foldVoiceStageEma(diag, 'audioQueryEmaMs', r.queryMs);
  // synthesis の純時間 = 応答までの時間からエンジン待ちを引いたもの(待ちは synthesis 側で起きる前提)。
  if (r.synthMs >= 0) foldVoiceStageEma(diag, 'synthesisEmaMs', Math.max(0, r.synthMs - r.engineWaitMs));
  const ownMs = Math.max(0, r.totalMs - r.engineWaitMs);
  if (r.cold) {
    diag.coldSynthTotal = (Number(diag.coldSynthTotal) || 0) + 1;
    diag.coldSynthMaxMs = Math.max(Number(diag.coldSynthMaxMs) || 0, Math.round(ownMs));
    diag.lastColdSynthMs = Math.round(ownMs);
  } else {
    foldVoiceStageEma(diag, 'warmSynthEmaMs', ownMs);
  }
}

/**
 * 状態速報の1行に添える内訳。何も測れていなければ ''(ノイズにしない)。
 * @param {Record<string, any>|null|undefined} snap
 * @returns {string}
 */
export function formatVoiceStageBreakdown(snap) {
  if (!snap || typeof snap !== 'object') return '';
  /** @param {unknown} ms */
  const sec = (ms) => `${(Number(ms) / 1000).toFixed(1)}秒`;
  /** @param {unknown} ms */
  const ok = (ms) => Number.isFinite(Number(ms)) && Number(ms) >= 0;
  const parts = [];
  if (ok(snap.upstreamEmaMs)) parts.push(`受信→キュー${sec(snap.upstreamEmaMs)}`);
  if (ok(snap.queueWaitEmaMs)) parts.push(`順番待ち${sec(snap.queueWaitEmaMs)}`);
  if (ok(snap.engineWaitEmaMs)) parts.push(`エンジン詰まり${sec(snap.engineWaitEmaMs)}`);
  if (ok(snap.warmSynthEmaMs)) {
    const q = ok(snap.audioQueryEmaMs) ? Math.round(Number(snap.audioQueryEmaMs)) : -1;
    const s = ok(snap.synthesisEmaMs) ? Math.round(Number(snap.synthesisEmaMs)) : -1;
    const split = q >= 0 && s >= 0 ? `(query${q}ms+synth${s}ms)` : '';
    parts.push(`合成${sec(snap.warmSynthEmaMs)}${split}`);
  }
  const cold = Number(snap.coldSynthTotal) || 0;
  if (cold > 0) parts.push(`初めての声${cold}件(最大${sec(snap.coldSynthMaxMs)})`);
  if (!parts.length) return '';
  return `遅れの段階(${parts.join('・')})`;
}
