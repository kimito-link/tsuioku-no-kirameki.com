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
 * これより短い声は比が揺れるので、比の物差しに入れない(ms)。
 *   PC 実測(v0.1.1769・グラボ有り): 1秒前後の短いコメントだけで比が 200〜477 に揺れた。
 */
export const VOICE_RTF_MIN_AUDIO_MS = 600;

/**
 * どんなに速い PC でも1回の合成にかかる時間(ms)。比を出す前に引く(同じ実測で 0.2〜0.3秒)。
 *   引かないと、短いコメントが多い配信で速い PC が「弱い」と記録される。
 */
export const VOICE_RTF_FIXED_OVERHEAD_MS = 250;

/**
 * 2回目以降の合成1件を「声の長さで割った速さ」(×1000)の物差しに入れる。
 * @param {Record<string, any>} diag
 * @param {number} ownMs
 * @param {number} audioMs
 */
function foldWarmSynthRtf(diag, ownMs, audioMs) {
  if (!Number.isFinite(audioMs) || audioMs < VOICE_RTF_MIN_AUDIO_MS || !Number.isFinite(ownMs)) return;
  foldVoiceStageEma(diag, 'warmSynthRtfPermille', (Math.max(0, ownMs - VOICE_RTF_FIXED_OVERHEAD_MS) / audioMs) * 1000);
  diag.warmRtfSamples = (Number(diag.warmRtfSamples) || 0) + 1;
}

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
     * @returns {{ cold: boolean, end: (timing?: { queryMs?: number, synthMs?: number, initMs?: number, streamed?: boolean, contended?: boolean, audioMs?: number, borrowed?: boolean }, ok?: boolean) => { cold: boolean, ok: boolean, startAt: number, totalMs: number, engineWaitMs: number, queryMs: number, synthMs: number, initMs: number, streamed: boolean, contended: boolean, audioMs: number, borrowed: boolean } }}
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
        const i = Number(timing?.initMs);
        const a = Number(timing?.audioMs);
        const borrowed = timing?.borrowed === true;
        return {
          // 借りた声は温まっている声で読んだので「初めての声」に入れない(v0.1.1772)。
          cold: cold && !borrowed,
          ok: ok === true,
          startAt,
          totalMs: Math.max(0, endAt - startAt),
          engineWaitMs: prevDoneAt > startAt ? Math.min(prevDoneAt, endAt) - startAt : 0,
          queryMs: Number.isFinite(q) && q >= 0 ? Math.round(q) : -1,
          synthMs: Number.isFinite(s) && s >= 0 ? Math.round(s) : -1,
          // 2026-10-26: 合成の前に声を読み込んだ時間(voiceWarmup)。無ければ 0。
          initMs: Number.isFinite(i) && i > 0 ? Math.round(i) : 0,
          // 2026-10-26: 少しずつ受け取った(voiceStream)。時間は「最初の声が届くまで」。
          streamed: timing?.streamed === true,
          // 2026-10-26: 別の声の準備と重なった(voiceWarmup)。速さの物差しに入れない。
          contended: timing?.contended === true,
          // 2026-10-26: できた声の長さ(ms)。合成の速さを文の長さで割るのに使う。分からなければ -1。
          audioMs: Number.isFinite(a) && a > 0 ? Math.round(a) : -1,
          // v0.1.1772: まだ温まっていない声の代わりに、温まった声で読んだ(voiceWarmup)。
          borrowed
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
  if (r.borrowed) diag.voiceBorrowTotal = (Number(diag.voiceBorrowTotal) || 0) + 1;
  foldVoiceStageEma(diag, 'engineWaitEmaMs', r.engineWaitMs);
  foldVoiceStageEma(diag, 'audioQueryEmaMs', r.queryMs);
  const initMs = Number(r.initMs) > 0 ? Number(r.initMs) : 0;
  if (r.streamed) {
    // 少しずつ受け取った声は「最初の声まで」の時間なので、丸ごと合成の物差し(warm/cold)に混ぜない
    //   (混ぜると遅い PC が速く見え、弱い PC の判定が外れる)。
    diag.streamTotal = (Number(diag.streamTotal) || 0) + 1;
    foldVoiceStageEma(diag, 'streamFirstAudioEmaMs', Math.max(0, r.totalMs - r.engineWaitMs - initMs));
    return;
  }
  // synthesis の純時間 = 応答までの時間からエンジン待ちを引いたもの(待ちは synthesis 側で起きる前提)。
  if (r.synthMs >= 0) foldVoiceStageEma(diag, 'synthesisEmaMs', Math.max(0, r.synthMs - r.engineWaitMs));
  // 2026-10-26: 声の読み込み(initMs)は合成の速さではないので引く。引かないと速いPCでも
  //   初めての声が 3.5秒台になり、isWeakVoicePc が「弱いPC」と記録してしまう(消すコードは無い)。
  if (initMs > 0) {
    diag.speakerInitTotal = (Number(diag.speakerInitTotal) || 0) + 1;
    diag.speakerInitMaxMs = Math.max(Number(diag.speakerInitMaxMs) || 0, Math.round(initMs));
  }
  const ownMs = Math.max(0, r.totalMs - r.engineWaitMs - initMs);
  if (r.contended) {
    // 別の声の準備でエンジンが埋まっていた回。PC 実測で、ここを数えて速い PC が「弱い」と記録された。
    diag.contendedSynthTotal = (Number(diag.contendedSynthTotal) || 0) + 1;
    return;
  }
  if (r.cold) {
    diag.coldSynthTotal = (Number(diag.coldSynthTotal) || 0) + 1;
    diag.coldSynthMaxMs = Math.max(Number(diag.coldSynthMaxMs) || 0, Math.round(ownMs));
    diag.lastColdSynthMs = Math.round(ownMs);
  } else {
    foldVoiceStageEma(diag, 'warmSynthEmaMs', ownMs);
    diag.warmSynthSamples = (Number(diag.warmSynthSamples) || 0) + 1;
    // 2026-10-26(PC 実測 v0.1.1768): 長いコメントはグラボ有りでも 0.8〜1.2秒かかり、ms だけで見ると
    //   速い PC が「弱い」と記録された。声の長さで割った比(グラボ有り約0.12・無し約0.8)も残す。
    foldWarmSynthRtf(diag, ownMs, Number(r.audioMs));
  }
}

/**
 * 少しずつ受け取った声が届き終わったら、全体の時間を声の長さで割って同じ物差しに入れる(2026-10-26)。
 *   PC 実測: 「弱い」と記録された PC はほとんどのコメントを少しずつ受け取るので、ここで数えないと
 *   速い PC だと分かるまで(誤った記録が消えるまで)6分以上かかった。
 * @param {Record<string, any>} diag
 * @param {ReturnType<ReturnType<ReturnType<typeof createVoiceSynthTracker>['begin']>['end']>} r
 * @param {{ whenDone: Promise<boolean>, failed?: boolean, totalSamples: number, sampleRate: number }} voice
 * @param {() => number} now
 * @param {() => void} [after] 物差しに入れた後に呼ぶ(弱い/速い PC の記録)
 * @returns {Promise<void>}
 */
export function recordVoiceStreamDone(diag, r, voice, now, after) {
  if (!diag || !r || !r.ok || !r.streamed || !voice || typeof voice.whenDone?.then !== 'function') return Promise.resolve();
  return voice.whenDone.then((ok) => {
    if (ok !== true || voice.failed || r.cold || r.contended) return;
    const audioMs = voice.sampleRate > 0 ? (voice.totalSamples / voice.sampleRate) * 1000 : -1;
    const ownMs = now() - r.startAt - r.engineWaitMs - (Number(r.initMs) > 0 ? Number(r.initMs) : 0);
    foldWarmSynthRtf(diag, ownMs, audioMs);
    if (typeof after === 'function') after();
  }).catch(() => { /* 計器は本体を止めない */ });
}

/**
 * WAV(16bit PCM)の声の長さ(ms)。読めなければ -1。
 * @param {unknown} wav
 * @returns {number}
 */
export function measureWavAudioMs(wav) {
  if (!(wav instanceof ArrayBuffer) || wav.byteLength < 44) return -1;
  try {
    const v = new DataView(wav);
    if (v.getUint32(0, false) !== 0x52494646 || v.getUint32(8, false) !== 0x57415645) return -1;
    let off = 12;
    let bytesPerSec = 0;
    while (off + 8 <= wav.byteLength) {
      const id = v.getUint32(off, false);
      const size = v.getUint32(off + 4, true);
      if (id === 0x666d7420 && off + 16 <= wav.byteLength) bytesPerSec = v.getUint32(off + 16, true);
      if (id === 0x64617461) {
        if (bytesPerSec <= 0) return -1;
        const dataBytes = Math.min(size, wav.byteLength - off - 8);
        return Math.round((dataBytes / bytesPerSec) * 1000);
      }
      off += 8 + size + (size % 2);
    }
  } catch { /* 壊れた WAV は測らない */ }
  return -1;
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
  const streamed = Number(snap.streamTotal) || 0;
  if (streamed > 0 && ok(snap.streamFirstAudioEmaMs)) parts.push(`少しずつ${streamed}件(最初の声まで${sec(snap.streamFirstAudioEmaMs)})`);
  const cold = Number(snap.coldSynthTotal) || 0;
  if (cold > 0) parts.push(`初めての声${cold}件(最大${sec(snap.coldSynthMaxMs)})`);
  const init = Number(snap.speakerInitTotal) || 0;
  if (init > 0) parts.push(`声の読み込み${init}件(最大${sec(snap.speakerInitMaxMs)})`);
  const borrowed = Number(snap.voiceBorrowTotal) || 0;
  if (borrowed > 0) parts.push(`借りた声${borrowed}件`);
  if (!parts.length) return '';
  return `遅れの段階(${parts.join('・')})`;
}

/**
 * v0.1.1774計器: 声が出るまで(キュー投入→再生開始)の1件を、回ごとに集計できる形でも残す。
 *   e2eAvgMs は過去の回を引きずる EMA なので、試験の1回分の平均・最大がこれまで取れなかった。
 * @param {Record<string, any>} diag
 * @param {number} ms
 */
export function recordVoiceE2eSample(diag, ms) {
  const v = Number(ms);
  if (!diag || typeof diag !== 'object' || !Number.isFinite(v) || v < 0) return;
  diag.e2eSampleTotal = (Number(diag.e2eSampleTotal) || 0) + 1;
  diag.e2eSumMsTotal = (Number(diag.e2eSumMsTotal) || 0) + Math.round(v);
  diag.e2eMaxMs = Math.max(Number(diag.e2eMaxMs) || 0, Math.round(v));
}
