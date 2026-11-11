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
 *   speak: (text: string, tone: { voiceIndex: number, pitch: number, rate: number, volume?: number }, hooks?: { onStart?: () => void }) => Promise<boolean>,
 *   cancel: () => void,
 *   lastError: () => string
 * }}
 */
export function createLightSpeaker(deps = {}) {
  const synth = deps.synth ?? globalThis.speechSynthesis;
  const Utterance = deps.Utterance ?? globalThis.SpeechSynthesisUtterance;
  if (!synth || typeof synth.speak !== 'function' || typeof Utterance !== 'function') return null;
  /** @type {any[]} */
  let cached = [];
  /**
   * 2026-11-09: 直前の1件が失敗した理由(SpeechSynthesisErrorEvent.error・成功なら '')。
   *   Chrome は読み込み直したあと一度もクリックしていないページでは 'not-allowed' で鳴らさない
   *   (りんくの PC で実際に無音になり、クリックで鳴り始めた)。理由を捨てると画面で案内できないので残す。
   */
  let lastError = '';
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
    lastError: () => lastError,
    speak(text, /** @type {{ voiceIndex: number, pitch: number, rate: number, volume?: number }} */ tone, hooks = {}) {
      return new Promise((resolve) => {
        if (!cached.length) refresh();
        const t = String(text || '');
        if (!t || !cached.length) { resolve(false); return; }
        let started = false;
        let done = false;
        lastError = '';
        const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve(started); };
        const u = new Utterance(t);
        u.voice = cached[tone.voiceIndex % cached.length];
        u.lang = u.voice?.lang || 'ja-JP';
        u.pitch = tone.pitch;
        u.rate = tone.rate;
        if (Number.isFinite(tone.volume)) u.volume = Math.min(1, Math.max(0, tone.volume));
        u.onstart = () => { started = true; try { hooks.onStart?.(); } catch { /* 吹き出し側の失敗で読みを止めない */ } };
        u.onend = finish;
        u.onerror = (/** @type {any} */ ev) => {
          const code = typeof ev?.error === 'string' ? ev.error : 'unknown';
          // 自分で止めた(cancel/割り込み)のは失敗の理由にしない。
          if (code !== 'canceled' && code !== 'interrupted') lastError = code;
          finish();
        };
        const timer = setTimeout(() => { try { synth.cancel(); } catch { /* no-op */ } finish(); }, t.length * MAX_MS_PER_CHAR + WATCHDOG_EXTRA_MS);
        try { synth.speak(u); } catch { lastError = 'speak-threw'; finish(); }
      });
    }
  };
}
