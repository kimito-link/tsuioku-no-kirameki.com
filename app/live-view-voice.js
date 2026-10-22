/**
 * v0.1.1740: スマホの WEB版で、PC の VOICEVOX の声でコメントを読み上げる。
 *
 * ■ 流れ
 *   🗣 を ON にすると、約3秒ごとに /api/status?action=voice で新しい声を取りに行く(取りに行くこと自体が
 *   「声がほしい」目印になり、PC はその間だけ声を作って送る)。声は Ogg Opus で、Web Audio で順番に鳴らす。
 * ■ iPhone
 *   効果音と同じく、タップの中で AudioContext を起こす(🗣 を押したとき・ON のまま開いたら最初のタップ)。
 * ■ 既定は OFF(この端末で覚える)。ON にした瞬間に預かっている過去の声は鳴らさない(いまから読む)。
 *
 * @module live-view-voice
 */
import { PHONE_VOICE_QUEUE_MAX, enqueuePhoneVoice } from '../src/lib/phoneVoice.js';

const STORE_KEY = 'nls_phone_voice_v1';
/** 声を取りに行く間隔。読み上げは遅れると意味が薄いので、画面の更新(5秒)より短く。 */
export const PHONE_VOICE_POLL_MS = 3_000;

function readOn() {
  try { return globalThis.localStorage?.getItem(STORE_KEY) === 'on'; } catch { return false; }
}
function writeOn(on) {
  try { globalThis.localStorage?.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* 覚えられなくても読める */ }
}

/** @param {string} b64 */
function base64ToBuffer(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

/**
 * @param {{ token: string, fetchImpl?: typeof fetch, Ctx?: any, setIntervalImpl?: typeof setInterval }} a
 */
export function createPhoneVoice(a) {
  const fetchImpl = a.fetchImpl || ((u, i) => fetch(u, i));
  const Ctx = a.Ctx || globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext;
  const every = a.setIntervalImpl || setInterval;
  /** @type {any} */
  let ctx = null;
  let on = readOn();
  /** 最後に受け取った番号。null = まだ1回も取っていない(最初の1回は覚えるだけ)。 */
  /** @type {string|null} */
  let lastNo = null;
  /** @type {{ no: string, ogg: string }[]} */
  let queue = [];
  let playing = false;
  let inFlight = false;
  /** PC 側の状態(スナップショットの phoneVoice)。 */
  let pcState = '';
  /** @type {any} */
  let timer = null;
  const listeners = new Set();
  /** v0.1.1742: 声が鳴り始めたときに知らせる先(会場の吹き出しを声に合わせる)。v0.1.1743: 声の長さ(ms)も渡す。 */
  /** @type {Set<(no: string, durationMs: number) => void>} */
  const playListeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch { /* 描き直しの失敗は無視 */ } });

  function unlock() {
    if (!Ctx) return false;
    try {
      try {
        const session = /** @type {any} */ (globalThis.navigator)?.audioSession;
        if (session && session.type !== 'playback') session.type = 'playback';
      } catch { /* 無い端末では何もしない */ }
      if (!ctx) ctx = new Ctx();
      if (ctx.state === 'suspended') void ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
      return true;
    } catch {
      return false;
    }
  }

  function playNext() {
    if (playing || !on || !ctx || ctx.state !== 'running') return;
    const clip = queue.shift();
    if (!clip) return;
    playing = true;
    const done = () => { playing = false; playNext(); };
    try {
      ctx.decodeAudioData(base64ToBuffer(clip.ogg), (/** @type {AudioBuffer} */ buf) => {
        try {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.onended = done;
          src.start(0);
          playListeners.forEach((f) => { try { f(clip.no, Math.round((buf.duration || 0) * 1000)); } catch { /* 知らせ先の失敗で読み上げを止めない */ } });
        } catch { done(); }
      }, done);
    } catch { done(); }
  }

  async function poll() {
    if (!on || inFlight || (typeof document !== 'undefined' && document.hidden)) return;
    inFlight = true;
    try {
      const q = `/api/status?v=${encodeURIComponent(a.token)}&action=voice&after=${encodeURIComponent(lastNo || '')}`;
      const res = await fetchImpl(q, { cache: 'no-store' });
      if (!res.ok) return;
      const clips = (await res.json())?.clips;
      if (!Array.isArray(clips)) return;
      const first = lastNo === null;
      if (clips.length) lastNo = String(clips[clips.length - 1].no);
      else if (first) lastNo = '';
      if (first) return; // ON にした瞬間に預かっている過去の声は鳴らさない
      queue = enqueuePhoneVoice(queue, clips, PHONE_VOICE_QUEUE_MAX);
      playNext();
    } catch {
      /* 取れなければ次の回に */
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (timer) return;
    timer = every(() => { void poll(); }, PHONE_VOICE_POLL_MS);
    void poll();
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    lastNo = null;
    queue = [];
  }
  if (on) start();

  return {
    isOn: () => on,
    isReady: () => Boolean(ctx && ctx.state === 'running'),
    /** PC 側の状態('ok' / 'voicevox_down' / 'no_encoder' / '')。 */
    pcState: () => pcState,
    /** タップの中で呼ぶ。 */
    toggle() {
      on = !on;
      writeOn(on);
      if (on) { unlock(); start(); } else stop();
      notify();
      return on;
    },
    /** タップの中で呼ぶ(ON のまま開いた後の最初のタップ)。 */
    wake() {
      if (on && unlock()) { notify(); playNext(); }
    },
    /** スナップショットから PC 側の状態を受け取る。 @param {any} jsonBlob */
    onSnapshot(jsonBlob) {
      const s = String(jsonBlob?.phoneVoice || '');
      if (s !== pcState) { pcState = s; notify(); }
    },
    poll,
    /** 声が鳴り始めたら番号を知らせる。 @param {(no: string) => void} f */
    onPlay: (f) => playListeners.add(f),
    onChange: (/** @type {() => void} */ f) => listeners.add(f)
  };
}

const STYLE = `
#lvWebVoiceBtn{position:fixed;right:12px;bottom:calc(176px + env(safe-area-inset-bottom,0px));z-index:99995;
  min-width:44px;height:44px;padding:0 12px;border-radius:22px;border:1px solid rgba(0,0,0,.15);
  background:#fff;color:#333;font:600 15px/1 system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.18)}
#lvWebVoiceBtn[data-on="1"]{background:#3a8fd8;color:#fff;border-color:#3a8fd8}
#lvWebVoiceBtn[data-warn="1"]{background:#f3b23a;color:#3a2a00;border-color:#f3b23a}
@media (prefers-color-scheme: dark){#lvWebVoiceBtn{background:#2a2a30;color:#eee;border-color:#444}}
#openComeviewBtn{display:none!important}
`;

/** ボタンの文字。 @param {ReturnType<typeof createPhoneVoice>} v */
export function phoneVoiceLabel(v) {
  if (!v.isOn()) return { text: '🗣', warn: false, aria: '読み上げ: なし(押すと PC の VOICEVOX の声で読む)' };
  if (!v.isReady()) return { text: '🗣 タップで声', warn: false, aria: '読み上げ: あり(タップで音を出せるようにする)' };
  if (v.pcState() === 'voicevox_down') return { text: '🗣 PCのVOICEVOXが起動していません', warn: true, aria: 'PC の VOICEVOX が起動していません' };
  if (v.pcState() === 'no_encoder') return { text: '🗣 PCのChromeが古いです', warn: true, aria: 'PC の Chrome が古く、声を送れません' };
  return { text: '🗣 読み上げ中', warn: false, aria: '読み上げ: あり(押すと止める)' };
}

/**
 * 🗣 ボタンを付ける。popup の「読み上げ」ボタンも同じ切り替えにする(スマホでは別ウィンドウを開けない)。
 *   「コメビュ」は別ウィンドウ専用なのでスマホでは隠す。
 * @param {ReturnType<typeof createPhoneVoice>} voice
 */
export function mountPhoneVoiceUi(voice) {
  if (document.getElementById('lvWebVoiceBtn')) return;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.id = 'lvWebVoiceBtn';
  btn.type = 'button';
  const paint = () => {
    const l = phoneVoiceLabel(voice);
    btn.dataset.on = voice.isOn() ? '1' : '0';
    btn.dataset.warn = l.warn ? '1' : '0';
    btn.textContent = l.text;
    btn.setAttribute('aria-label', l.aria);
    const word = document.querySelector('#openComeviewVoiceBtn .nl-compose-qbtn__word');
    if (word) word.textContent = voice.isOn() ? '読み上げ中' : '読み上げ';
    // v0.1.1742: 説明文も スマホの読み上げに合わせる(元は「コメビュを別ウィンドウで開きます」のままだった)。
    const popupBtn = document.getElementById('openComeviewVoiceBtn');
    if (popupBtn) {
      popupBtn.setAttribute('aria-label', l.aria);
      popupBtn.title = l.aria;
    }
  };
  const press = () => {
    if (voice.isOn() && !voice.isReady()) voice.wake();
    else voice.toggle();
    paint();
  };
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); press(); });
  // popup の「読み上げ」: 拡張の別ウィンドウを開く処理より先に受け取って、スマホの読み上げを切り替える。
  document.addEventListener('click', (ev) => {
    const t = /** @type {Element|null} */ (ev.target instanceof Element ? ev.target : null);
    if (!t || !t.closest('#openComeviewVoiceBtn')) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    press();
  }, true);
  const wakeOnce = () => { voice.wake(); paint(); };
  document.addEventListener('pointerdown', wakeOnce, { once: true, capture: true });
  voice.onChange(paint);
  paint();
  document.body.appendChild(btn);
}
