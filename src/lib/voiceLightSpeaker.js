/**
 * voiceLightSpeaker.js — ブラウザの読み上げ(speechSynthesis・Windows では PC に入っている声)で1件読む。
 *
 * ■ 役割: voicePlayer が「VOICEVOX が追いつかない」ときに使う軽い声の口(voiceLightFallback.js が判定)。
 * ■ 使い方: createLightSpeaker() → available() / voices() / speak(text, tone)。
 *   speechSynthesis が無い場所(テスト・古い環境)では null を返す=軽い声は使わず VOICEVOX だけで読む。
 * ■ 終わりの合図(end/error)が来ないことがあるので、文字数から見積もった時間で必ず打ち切る。
 *
 * @module voiceLightSpeaker
 */
import { pickJapaneseVoices } from './voiceLightFallback.js';

/** 1文字あたりの読み上げ時間の上限の見積もり(ms)。これ+余裕で打ち切る。 */
const MAX_MS_PER_CHAR = 400;
const WATCHDOG_EXTRA_MS = 5000;

/**
 * @param {{ synth?: any, Utterance?: any }} [deps]
 * @returns {null | {
 *   available: () => boolean,
 *   voices: () => any[],
 *   speak: (text: string, tone: { voiceIndex: number, pitch: number, rate: number }, hooks?: { onStart?: () => void }) => Promise<boolean>,
 *   cancel: () => void
 * }}
 */
export function createLightSpeaker(deps = {}) {
  const synth = deps.synth ?? globalThis.speechSynthesis;
  const Utterance = deps.Utterance ?? globalThis.SpeechSynthesisUtterance;
  if (!synth || typeof synth.speak !== 'function' || typeof Utterance !== 'function') return null;
  /** @type {any[]} */
  let cached = [];
  const refresh = () => {
    try { cached = pickJapaneseVoices(synth.getVoices?.() || []); } catch { cached = []; }
  };
  refresh();
  // 声の一覧はあとから届くことがある(Chrome は最初の getVoices() が空)。
  try { synth.addEventListener?.('voiceschanged', refresh); } catch { /* 一覧が増えなくても読める声で読む */ }
  return {
    available: () => { if (!cached.length) refresh(); return cached.length > 0; },
    voices: () => cached,
    cancel: () => { try { synth.cancel(); } catch { /* no-op */ } },
    speak(text, tone, hooks = {}) {
      return new Promise((resolve) => {
        if (!cached.length) refresh();
        const t = String(text || '');
        if (!t || !cached.length) { resolve(false); return; }
        let started = false;
        let done = false;
        const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve(started); };
        const u = new Utterance(t);
        u.voice = cached[tone.voiceIndex % cached.length];
        u.lang = u.voice?.lang || 'ja-JP';
        u.pitch = tone.pitch;
        u.rate = tone.rate;
        u.onstart = () => { started = true; try { hooks.onStart?.(); } catch { /* 吹き出し側の失敗で読みを止めない */ } };
        u.onend = finish;
        u.onerror = finish;
        const timer = setTimeout(() => { try { synth.cancel(); } catch { /* no-op */ } finish(); }, t.length * MAX_MS_PER_CHAR + WATCHDOG_EXTRA_MS);
        try { synth.speak(u); } catch { finish(); }
      });
    }
  };
}
