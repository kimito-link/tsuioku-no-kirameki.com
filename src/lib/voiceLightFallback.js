/**
 * voiceLightFallback.js — VOICEVOX が追いつかないときだけ、PC に入っている軽い声(Windows の声)で読む(純関数)。
 *
 * ■ なぜ要るか(2026-11-03・りんくの PC で実測)
 *   VOICEVOX が CPU で動く PC では1件の合成に12〜25秒かかり、毎分150件の配信には追いつけない。
 *   捨て方を工夫しても読めるのは1分に数件で、読み上げがほぼ止まって聞こえる。わんコメも同じ方向
 *   (重いエンジンが詰まったら軽い声に逃がす)を勧めている。
 * ■ いつ切り替えるか
 *   voiceEngineOverload.js の「混雑中」(時間切れが続いた)の間だけ。混雑が解けたら VOICEVOX に戻る。
 *   混雑中は VOICEVOX に読み上げを頼まず、ときどき短い文を頼んで速さだけ確かめる(戻れるかの判定)。
 * ■ 人ごとに違う声(特許出願中の中核なので必ず保つ)
 *   PC に入っている日本語の声(Haruka・Ayumi・Ichiro など)× 声の高さ5段 × 速さの組み合わせを、
 *   VOICEVOX と同じ voiceAssignment.js で人ごとに決める(同じ人はいつも同じ声)。
 *
 * @module voiceLightFallback
 */
import { assignVoiceForUser } from './voiceAssignment.js';

/** 声の高さ(SpeechSynthesisUtterance.pitch・1.0 がふつう)。スマホアプリの内蔵の声と同じ5段。 */
export const LIGHT_VOICE_PITCHES = Object.freeze([0.8, 0.95, 1.1, 1.25, 1.4]);
/** ふだんの速さ(人ごとの速さはここに voiceAssignment の speedOffset を足す)。 */
export const LIGHT_VOICE_RATE = 1.2;
/** 1件で読む最大の文字数(長文で次のコメントが何十秒も待たされないように)。 */
export const LIGHT_VOICE_MAX_CHARS = 60;
/**
 * 軽い声で読んでいる間、VOICEVOX の速さを確かめに行く間隔。
 * v0.1.1866: 30秒→6秒。戻るには速い合成が5回続く必要があり、30秒間隔だと原因が消えても戻るまで最短2分半かかっていた
 *   (短い「てすと」1回なのでエンジンの邪魔は小さい・YouTube 版 0.1.94 で確認)。
 */
export const LIGHT_VOICE_PROBE_INTERVAL_MS = 6000;
/** 速さを確かめるときに VOICEVOX に頼む文(短いほどエンジンを邪魔しない)。 */
export const LIGHT_VOICE_PROBE_TEXT = 'てすと';

/**
 * 使える日本語の声を、順番が毎回同じになるように並べて返す(PC の中だけで読む声を優先)。
 * @param {readonly { name?: string, lang?: string, localService?: boolean, voiceURI?: string }[]|null|undefined} voices
 * @returns {any[]}
 */
export function pickJapaneseVoices(voices) {
  if (!Array.isArray(voices)) return [];
  const ja = voices.filter((v) => v && /^ja([-_]|$)/i.test(String(v.lang || '')));
  const local = ja.filter((v) => v.localService === true);
  // ネットに出る声(Google 日本語など)は遅れ・失敗があるので、PC の中の声が1つでもあればそれだけ使う。
  const use = local.length ? local : ja;
  return [...use].sort((a, b) => String(a.name || a.voiceURI || '').localeCompare(String(b.name || b.voiceURI || '')));
}

/**
 * その人の軽い声(どの声・高さ・速さ)。名前の無いコメント(userKey 無し)は1つめの声のふつうの高さ。
 * @param {string} userKey
 * @param {number} voiceCount 使える日本語の声の数
 * @returns {{ voiceIndex: number, pitch: number, rate: number }}
 */
export function lightVoiceToneFor(userKey, voiceCount) {
  const n = Math.max(1, Math.floor(Number(voiceCount) || 0));
  if (!userKey) return { voiceIndex: 0, pitch: 1.0, rate: LIGHT_VOICE_RATE };
  const combos = n * LIGHT_VOICE_PITCHES.length;
  const v = assignVoiceForUser(userKey, Array.from({ length: combos }, (_, i) => i));
  const combo = Number(v.styleId) || 0;
  return {
    voiceIndex: combo % n,
    pitch: LIGHT_VOICE_PITCHES[Math.floor(combo / n) % LIGHT_VOICE_PITCHES.length],
    rate: Math.round((LIGHT_VOICE_RATE + (Number(v.speedOffset) || 0)) * 100) / 100
  };
}

/**
 * 今このコメントを軽い声で読むか。
 * @param {{ overloaded: boolean, available: boolean, setting?: string }} s
 *   setting: 'off' なら使わない(VOICEVOX だけで読みたい人向け)。既定は自動。
 */
export function shouldUseLightVoice(s) {
  return !!s && s.setting !== 'off' && s.available === true && s.overloaded === true;
}

/**
 * 軽い声で読んでいる間に VOICEVOX の速さを確かめに行くか。
 * @param {{ nowMs: number, lastProbeAt: number, inFlight: number }} s
 */
export function shouldProbeVoicevox(s) {
  if (!s || s.inFlight > 0) return false;
  return !(s.lastProbeAt > 0) || s.nowMs - s.lastProbeAt >= LIGHT_VOICE_PROBE_INTERVAL_MS;
}
