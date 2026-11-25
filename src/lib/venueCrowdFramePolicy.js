/**
 * venueCrowdFramePolicy.js — 会場の群衆キャンバス(観客のそよぎ)を何 ms に1回描くか(純関数)。
 *
 * ■ なぜ要るか(v0.1.2214・りんく「ふつうのノートでもなめらか・低スペックでも固まらない」)
 *   群衆は 1200×350 の canvas を約18fps(55ms)で描き直す。グラフィックのハードウェアアクセラレーションが
 *   OFF だと描画は CPU で行われ、VOICEVOX を CPU で動かしている PC では合成と CPU を取り合う。
 * ■ 弱さの判定は「すでにある合図」だけを使う(新しい計測タイマー・見張りは足さない)
 *   - recentLagMs: この文書の心拍のずれ(extDocBusyCensusBoot の既存の1秒心拍の EMA)=メインスレッドが詰まっている
 *   - voiceOverloaded / lightVoiceActive: VOICEVOX が混雑して PC の声で読んでいる(voiceEngineOverload)
 *   - weakVoicePc: VOICEVOX の合成が遅い PC(voiceNarrowing.isWeakVoicePc)
 *   prefers-reduced-motion は shouldAnimateVenueCrowd がそもそも描かない(ここは関与しない)。
 * ■ 段(ふつうのノートは今までどおり 18fps)
 *   - 何も無い: 55ms(約18fps・従来どおり)
 *   - VOICEVOX が遅い PC: 83ms(約12fps)。そよぎの見た目はほぼ同じで CPU は約3分の2。
 *   - 混雑して PC の声 / 心拍のずれ 60ms 以上: 125ms(8fps)
 *   - 心拍のずれ 200ms 以上(固まりかけ): 250ms(4fps)
 *
 * @module venueCrowdFramePolicy
 */

export const VENUE_CROWD_FRAME_MS_NORMAL = 55;
export const VENUE_CROWD_FRAME_MS_WEAK_VOICE = 83;
export const VENUE_CROWD_FRAME_MS_BUSY = 125;
export const VENUE_CROWD_FRAME_MS_STALLING = 250;
/** 心拍のずれ(EMA)がこれ以上なら「詰まっている」。ふつうのノートの平常時は数 ms〜十数 ms。 */
export const VENUE_CROWD_LAG_BUSY_MS = 60;
export const VENUE_CROWD_LAG_STALL_MS = 200;

/**
 * @param {{ recentLagMs?: number, voiceOverloaded?: boolean, lightVoiceActive?: boolean, weakVoicePc?: boolean }} [s]
 * @returns {number} 描く間隔[ms]
 */
export function resolveVenueCrowdFrameMs(s = {}) {
  const lag = Number(s?.recentLagMs);
  const lagMs = Number.isFinite(lag) && lag > 0 ? lag : 0;
  if (lagMs >= VENUE_CROWD_LAG_STALL_MS) return VENUE_CROWD_FRAME_MS_STALLING;
  if (lagMs >= VENUE_CROWD_LAG_BUSY_MS || s?.voiceOverloaded === true || s?.lightVoiceActive === true) {
    return VENUE_CROWD_FRAME_MS_BUSY;
  }
  if (s?.weakVoicePc === true) return VENUE_CROWD_FRAME_MS_WEAK_VOICE;
  return VENUE_CROWD_FRAME_MS_NORMAL;
}
