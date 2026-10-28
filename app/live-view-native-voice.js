/**
 * v0.1.1763: iPhone アプリ(mobile/・Capacitor)の中だけで使う、iPhone 内蔵の声の読み上げ(🗣)。
 *
 * ■ なぜ別にしたか
 *   live-view-voice.js は PC の VOICEVOX の声を WEB 画面の中(Web Audio)で鳴らす。アプリが裏に回ると
 *   WEB 画面の音は止まりやすく、PC の VOICEVOX が動いていないと声が無い。アプリの中では、
 *   コメントの文字を iPhone 本体の読み上げ(AVSpeechSynthesizer・@capacitor-community/text-to-speech)
 *   に渡す=画面を閉じても読み、PC の VOICEVOX が無くても読める。
 * ■ 画面を閉じても止めない仕組み
 *   読み上げ ON の間は、無音の音を WEB 画面でくり返し鳴らす(音を鳴らしているアプリは裏でも止められない。
 *   Info.plist の UIBackgroundModes=audio とセット)。これで新着の取りに行きも続く。
 * ■ 形は live-view-voice.js と同じ(isOn / isReady / pcState / toggle / wake / onSnapshot / onPlay / onChange)。
 *   加えて onRows(rows) でコメント鏡の行を受け取り、新しいコメントだけを読む(最初の1回は覚えるだけ)。
 * ■ アプリの外・プラグインが無い古いアプリでは null を返す(呼び出し側は PC の声の読み上げを使う)。
 *
 * @module live-view-native-voice
 */
import { PHONE_VOICE_QUEUE_MAX, pickNewVoiceRows } from '../src/lib/phoneVoice.js';
import { normalizeVoiceReadingBody } from '../src/lib/voiceReadingNormalize.js';

const STORE_KEY = 'nls_phone_voice_v1';
/** 1件で読む最大の文字数(長文で次のコメントが何十秒も待たされないように)。 */
export const NATIVE_SPEECH_MAX_CHARS = 60;
/** 声の長さの見積もり(1文字あたり ms)。吹き出しを声に合わせる目安にだけ使う。 */
const MS_PER_CHAR = 140;
/**
 * 無音の WAV(8kHz・8bit・モノラル)を data: URL で作る。裏で止められないための「鳴らし続ける音」。
 * @param {number} [seconds]
 */
export function silentWavDataUrl(seconds = 0.5) {
  const n = Math.max(1, Math.round(8000 * seconds));
  const bytes = new Uint8Array(44 + n);
  const dv = new DataView(bytes.buffer);
  const str = (/** @type {number} */ o, /** @type {string} */ t) => { for (let i = 0; i < t.length; i += 1) bytes[o + i] = t.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  str(36, 'data'); dv.setUint32(40, n, true);
  bytes.fill(128, 44); // 8bit の無音は 128
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function readOn() {
  try { return globalThis.localStorage?.getItem(STORE_KEY) === 'on'; } catch { return false; }
}
function writeOn(on) {
  try { globalThis.localStorage?.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* 覚えられなくても読める */ }
}

/**
 * 読み上げる文字にする。URL は「リンク」、w の連続は「わら」、8 の連続は「パチパチ」、長すぎる文は切る。読むものが無ければ ''。
 * @param {string} text
 */
export function speechTextForComment(text) {
  // 2026-10-28: PC の読み上げと同じ整え方(拍手の 8・同じ文字の連打も)を共有する(voiceReadingNormalize.js)。
  let t = normalizeVoiceReadingBody(text, { urlWord: 'リンク' });
  if (t.length > NATIVE_SPEECH_MAX_CHARS) t = `${t.slice(0, NATIVE_SPEECH_MAX_CHARS)} 以下略`;
  return t;
}

/**
 * @param {{ cap?: any, Audio?: any }} [a]
 * @returns {null | {
 *   kind: 'native', isOn: () => boolean, isReady: () => boolean, pcState: () => string,
 *   toggle: () => boolean, wake: () => void, onSnapshot: (j: any) => void, poll: () => Promise<void>,
 *   onRows: (rows: any[]) => number, onPlay: (f: (no: string, ms: number) => void) => void, onChange: (f: () => void) => void
 * }}
 */
export function createNativeSpeechVoice(a = {}) {
  const cap = a.cap !== undefined ? a.cap : /** @type {any} */ (globalThis).Capacitor;
  let tts = null;
  try {
    if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
      const has = typeof cap.isPluginAvailable === 'function' ? cap.isPluginAvailable('TextToSpeech') : Boolean(cap.Plugins && cap.Plugins.TextToSpeech);
      if (has) tts = (cap.Plugins && cap.Plugins.TextToSpeech) || (typeof cap.registerPlugin === 'function' ? cap.registerPlugin('TextToSpeech') : null);
    }
  } catch { tts = null; }
  if (!tts) return null;
  const AudioCtor = a.Audio !== undefined ? a.Audio : globalThis.Audio;

  let on = readOn();
  /** @type {Set<string>|null} null = まだ1回も見ていない(最初の1回は覚えるだけ)。 */
  let seen = null;
  /** @type {{ no: string, text: string }[]} */
  let queue = [];
  let speaking = false;
  /** @type {any} */
  let keepAlive = null;
  let keepAliveOk = false;
  const listeners = new Set();
  /** @type {Set<(no: string, durationMs: number) => void>} */
  const playListeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch { /* 描き直しの失敗は無視 */ } });

  /** タップの中で呼ぶ。無音をくり返し鳴らして、裏に回っても止められないようにする。 */
  function startKeepAlive() {
    if (!AudioCtor) return;
    try {
      try {
        const session = /** @type {any} */ (globalThis.navigator)?.audioSession;
        if (session && session.type !== 'playback') session.type = 'playback';
      } catch { /* 無い端末では何もしない */ }
      if (!keepAlive) {
        keepAlive = new AudioCtor(silentWavDataUrl());
        keepAlive.loop = true;
        keepAlive.preload = 'auto';
      }
      const p = keepAlive.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { keepAliveOk = true; notify(); }, () => { keepAliveOk = false; notify(); });
      } else {
        keepAliveOk = true;
      }
    } catch {
      keepAliveOk = false;
    }
  }
  function stopKeepAlive() {
    try { if (keepAlive) keepAlive.pause(); } catch { /* 止められなくても害は無い */ }
    keepAliveOk = false;
  }

  function speakNext() {
    if (speaking || !on) return;
    const item = queue.shift();
    if (!item) return;
    speaking = true;
    const ms = Math.max(800, item.text.length * MS_PER_CHAR);
    playListeners.forEach((f) => { try { f(item.no, ms); } catch { /* 知らせ先の失敗で読み上げを止めない */ } });
    const done = () => { speaking = false; speakNext(); };
    try {
      // queueStrategy 1 = 前の声を切らずに後ろへ足す。category は iOS では使われない(Android 用)。
      Promise.resolve(tts.speak({ text: item.text, lang: 'ja-JP', rate: 1.1, pitch: 1.0, volume: 1.0, category: 'playback', queueStrategy: 1 }))
        .then(done, done);
    } catch { done(); }
  }

  return {
    kind: 'native',
    isOn: () => on,
    /** 声そのものは iPhone が出すのでいつでも鳴る。裏で続けるための無音が鳴っているかを「準備できた」とする。 */
    isReady: () => keepAliveOk,
    /** PC の VOICEVOX は使わないので、いつも 'ok'(会場の吹き出しを声に合わせてよい)。 */
    pcState: () => 'ok',
    toggle() {
      on = !on;
      writeOn(on);
      if (on) {
        startKeepAlive();
      } else {
        stopKeepAlive();
        queue = [];
        try { void Promise.resolve(tts.stop()).catch(() => {}); } catch { /* 止められなくても次は読まない */ }
      }
      notify();
      return on;
    },
    /** タップの中で呼ぶ(ON のまま開いた後の最初のタップ)。 */
    wake() {
      if (on && !keepAliveOk) startKeepAlive();
    },
    onSnapshot() { /* PC の VOICEVOX の状態は使わない */ },
    /** PC の声を取りに行かない(コメントの文字は onRows で受け取る)。 */
    async poll() {},
    /** コメント鏡の行。新しいコメントだけを読む列に足す。読む列に足した件数を返す。 @param {any[]} rows */
    onRows(rows) {
      const r = pickNewVoiceRows({ rows, seen, max: PHONE_VOICE_QUEUE_MAX });
      seen = r.seen;
      if (!on) return 0;
      let added = 0;
      for (const p of r.picks) {
        const text = speechTextForComment(p.text);
        if (!text) continue;
        queue.push({ no: p.no, text });
        added += 1;
      }
      // 追いつけないときは古い方から捨てる(遅れて読むより、いまのコメントを読む)。
      if (queue.length > PHONE_VOICE_QUEUE_MAX) queue = queue.slice(-PHONE_VOICE_QUEUE_MAX);
      speakNext();
      return added;
    },
    onPlay: (f) => { playListeners.add(f); },
    onChange: (f) => { listeners.add(f); }
  };
}
