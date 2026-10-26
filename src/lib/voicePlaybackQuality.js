// voicePlaybackQuality.js — 読み上げの「聞こえ方」を数える計器(2026-10-26・印字専用・再生には介入しない)。
//
// 背景: りんく「確かめるのも全部やってほしい ちゃんと計測できるように計器をいれればいいかも」。
//   途切れ・つっかえ・音量は人が耳で聞かないと分からなかった(PC 実測でも「聞こえ方は未確認」が残った)。
//   ここは1件の再生ごとに、次の4つを数字で残す。
//   - 途切れ: 'ended' が来たのに、実際に鳴った時間が声の長さより明らかに短い
//   - つっかえ: 少しずつ届く声で、次の分が間に合わず無音が挟まった(underrun)/丸ごと再生が明らかに長くかかった
//   - 音割れ: 鳴らした音の最大振幅が天井に張り付いた
//   - 小さすぎ: 鳴らした音の最大振幅が、音量設定の狙いより大きく下回った
//   会場(VoicePlayer)とコメビュの両方が observeVoicePlayback を使う。

import { VOICE_TARGET_RMS_RATIO } from './voiceVolume.js';
import { updateVoiceServiceTimeEma } from './voiceLagBudget.js';

/** 鳴った時間が声の長さのこれ未満なら「途切れ」。 */
export const VOICE_CUT_SHORT_RATIO = 0.85;
/** 途切れ判定の遊び(ms・イベントの遅れ)。 */
export const VOICE_CUT_SHORT_SLACK_MS = 150;
/** 丸ごと再生が声の長さのこれ倍+遊びより長くかかったら「つっかえ」。 */
export const VOICE_STALL_RATIO = 1.25;
export const VOICE_STALL_SLACK_MS = 400;
/** これ以上の振幅は「音割れ」(0〜1)。 */
export const VOICE_CLIP_LEVEL = 0.995;
/** 狙いの大きさのこれ未満なら「小さすぎ」。 */
export const VOICE_QUIET_RATIO = 0.6;

/**
 * @typedef {{
 *   expectedMs: number,
 *   playedMs: number,
 *   outcome: 'ended'|'error',
 *   started: boolean,
 *   streamed: boolean,
 *   underruns: number,
 *   underrunMaxMs: number,
 *   outPeak: number,
 *   outRms?: number,
 *   targetPeak: number,
 *   gainDropRatio: number,
 *   partial?: boolean
 * }} VoicePlaybackSample
 */

/**
 * 1件の再生を diag に入れる。
 * @param {Record<string, any>} diag
 * @param {VoicePlaybackSample} s
 */
export function recordVoicePlaybackQuality(diag, s) {
  if (!diag || typeof diag !== 'object' || !s) return;
  const inc = (/** @type {string} */ k) => { diag[k] = (Number(diag[k]) || 0) + 1; };
  /** @type {string[]} */
  const issues = [];
  if (s.outcome === 'error') {
    if (s.started) { inc('playErrorAfterStartTotal'); issues.push('error'); }
    if (issues.length) diag.lastPlayIssue = issues.join(',');
    return;
  }
  inc('playCheckedTotal');
  const exp = Number(s.expectedMs);
  const played = Number(s.playedMs);
  if (s.streamed && s.partial) {
    // 少しずつ届く途中でエンジンからの受け取りが止まり、届いた分だけ読んだ
    inc('playCutShortTotal');
    issues.push('partial');
  } else if (s.started && exp > 0 && played >= 0) {
    if (played < exp * VOICE_CUT_SHORT_RATIO - VOICE_CUT_SHORT_SLACK_MS) {
      inc('playCutShortTotal');
      issues.push(`cut${Math.round(played)}/${Math.round(exp)}ms`);
    } else if (!s.streamed && played > exp * VOICE_STALL_RATIO + VOICE_STALL_SLACK_MS) {
      inc('playStallTotal');
      issues.push(`stall${Math.round(played)}/${Math.round(exp)}ms`);
    }
  }
  if (s.streamed && Number(s.underruns) > 0) {
    inc('streamUnderrunTotal');
    diag.streamUnderrunMaxMs = Math.max(Number(diag.streamUnderrunMaxMs) || 0, Math.round(Number(s.underrunMaxMs) || 0));
    issues.push(`gap${s.underruns}x${Math.round(Number(s.underrunMaxMs) || 0)}ms`);
  }
  const peak = Number(s.outPeak);
  if (Number.isFinite(peak) && peak >= 0) {
    diag.outPeakEmaPermille = Math.round(updateVoiceServiceTimeEma(diag.outPeakEmaPermille, peak * 1000));
    if (peak >= VOICE_CLIP_LEVEL) { inc('clipItemTotal'); issues.push('clip'); }
    const target = Number(s.targetPeak);
    // v0.1.1779: 詰まった声は聞こえの大きさ(RMS)で下げるので最大振幅は狙いより低くなる。RMS が足りていれば小さすぎではない。
    const rmsNow = Number(s.outRms);
    const loudEnough = Number.isFinite(rmsNow) && rmsNow >= target * VOICE_TARGET_RMS_RATIO * VOICE_QUIET_RATIO;
    if (Number.isFinite(target) && target > 0 && peak > 0 && peak < target * VOICE_QUIET_RATIO && !loudEnough) {
      inc('quietItemTotal');
      issues.push(`quiet${Math.round(peak * 100)}/${Math.round(target * 100)}%`);
    }
  }
  // 声ごとの大きさ(RMS・dBFS)。最小と最大の差が「キャラごとの大きさのばらつき」(目安 6dB 以内)。
  const rms = Number(s.outRms);
  if (Number.isFinite(rms) && rms > 0) {
    const db = Math.round(20 * Math.log10(rms) * 10) / 10;
    // 未計測は min=999 / max=-999(voiceDiag の初期値)。
    const lo = Number(diag.outRmsDbMin);
    const hi = Number(diag.outRmsDbMax);
    diag.outRmsDbMin = Number.isFinite(lo) ? Math.min(lo, db) : db;
    diag.outRmsDbMax = Number.isFinite(hi) ? Math.max(hi, db) : db;
    diag.lastOutRmsDb = db;
  }
  if (s.streamed && Number(s.gainDropRatio) > 0 && Number(s.gainDropRatio) < 0.8) {
    // 少しずつ鳴らす途中で倍率を下げた=1文の中で声が急に小さくなった
    inc('streamGainDropTotal');
    issues.push(`drop${Math.round(Number(s.gainDropRatio) * 100)}%`);
  }
  if (issues.length) diag.lastPlayIssue = issues.join(',');
}

/**
 * 再生オブジェクト(HTMLAudio か createStreamedVoiceAudio)に聞き耳を立て、終わったら1件記録する。
 *   再生の制御には触れない(イベントを足すだけ)。止めた(pause)回は ended が来ないので数えない。
 * @param {any} audio
 * @param {{
 *   diag: Record<string, any>,
 *   playbackRate?: number,
 *   outPeak?: number,
 *   outRms?: number,
 *   targetPeak?: number,
 *   now?: () => number,
 *   onRecorded?: () => void
 * }} opts
 */
export function observeVoicePlayback(audio, opts) {
  if (!audio || typeof audio.addEventListener !== 'function' || !opts?.diag) return;
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const rate = Number(opts.playbackRate) > 0 ? Number(opts.playbackRate) : 1;
  let playingAt = -1;
  let done = false;
  /** @param {'ended'|'error'} outcome */
  const finish = (outcome) => {
    if (done) return;
    done = true;
    try {
      const q = audio.quality && typeof audio.quality === 'object' ? audio.quality : null;
      const durSec = Number(audio.duration);
      recordVoicePlaybackQuality(opts.diag, {
        expectedMs: Number.isFinite(durSec) && durSec > 0 ? (durSec * 1000) / rate : -1,
        playedMs: playingAt >= 0 ? now() - playingAt : -1,
        outcome,
        started: playingAt >= 0,
        streamed: !!q,
        underruns: q ? Number(q.underruns) || 0 : 0,
        underrunMaxMs: q ? Number(q.underrunMaxMs) || 0 : 0,
        outPeak: q && Number(q.outPeak) >= 0 ? Number(q.outPeak) : Number(opts.outPeak ?? -1),
        outRms: q && Number(q.outRms) > 0 ? Number(q.outRms) : Number(opts.outRms ?? -1),
        targetPeak: Number(opts.targetPeak ?? -1),
        gainDropRatio: q ? Number(q.gainDropRatio) || 0 : 0,
        partial: q ? q.partial === true : false
      });
      if (typeof opts.onRecorded === 'function') opts.onRecorded();
    } catch { /* 計器は本体を止めない */ }
  };
  try {
    audio.addEventListener('playing', () => { if (playingAt < 0) playingAt = now(); }, { once: true });
    audio.addEventListener('ended', () => finish('ended'), { once: true });
    audio.addEventListener('error', () => finish('error'), { once: true });
  } catch { /* addEventListener の無い偽物でも壊れない */ }
}

/**
 * 状態速報の1行。何も数えていなければ ''。
 * @param {Record<string, any>|null|undefined} snap
 * @returns {string}
 */
export function formatVoicePlaybackQuality(snap) {
  const checked = Number(snap?.playCheckedTotal) || 0;
  if (!snap || checked <= 0) return '';
  const n = (/** @type {string} */ k) => Number(snap[k]) || 0;
  const parts = [`${checked}件中`];
  parts.push(`途切れ${n('playCutShortTotal')}`);
  parts.push(`つっかえ${n('playStallTotal') + n('streamUnderrunTotal')}`);
  parts.push(`音割れ${n('clipItemTotal')}`);
  parts.push(`小さすぎ${n('quietItemTotal')}`);
  if (n('streamGainDropTotal') > 0) parts.push(`途中で小さく${n('streamGainDropTotal')}`);
  if (n('playErrorAfterStartTotal') > 0) parts.push(`再生エラー${n('playErrorAfterStartTotal')}`);
  const peak = Number(snap.outPeakEmaPermille);
  if (Number.isFinite(peak) && peak >= 0) parts.push(`音の大きさ${Math.round(peak / 10)}%`);
  const lo = Number(snap.outRmsDbMin);
  const hi = Number(snap.outRmsDbMax);
  if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo && lo < 900) {
    parts.push(`声ごとの差${Math.round((hi - lo) * 10) / 10}dB`);
  }
  return `聞こえ方(${parts.join('・')})`;
}
