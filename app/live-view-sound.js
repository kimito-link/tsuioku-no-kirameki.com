/**
 * v0.1.1737: スマホの WEB版でギフトの効果音を鳴らす(拡張の会場モードと同じ音・同じ金額帯の選び方)。
 *
 * ■ なぜ Web Audio か
 *   iPhone の Safari は、人がタップした中でしか音を鳴らし始められない(<audio> は要素ごとに1回タップが要る)。
 *   AudioContext を1回のタップで起こせば、以後は何度でも鳴らせる。音はタップの中で起こした AudioContext で鳴らす。
 * ■ 既定は音なし。右下の「🔇」を押すと「🔊」になり、以後ギフトが来たら鳴る(この端末で覚える)。
 *   次に開いたときは、画面のどこかを1回タップしたら鳴るようになる(iPhone の決まり)。
 * ■ 音のファイルは拡張と同じ /extension/sound/ (同じサイトから配っている)。
 *
 * @module live-view-sound
 */
import { EFFECT_SOUND_VARIANT_PATHS, defaultVolumeForEffectSoundKind, resolveEffectSoundPath } from '../src/lib/effectSoundPlayer.js';
import { pickPhoneGiftSound } from '../src/lib/phoneSoundCues.js';

const STORE_KEY = 'nls_phone_sound_v1';

function readOn() {
  try { return globalThis.localStorage?.getItem(STORE_KEY) === 'on'; } catch { return false; }
}
function writeOn(on) {
  try { globalThis.localStorage?.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* 覚えられなくても鳴らすことはできる */ }
}

/**
 * @param {{ fetchImpl?: typeof fetch, Ctx?: any }} [deps]
 */
export function createPhoneSoundPlayer(deps = {}) {
  const fetchImpl = deps.fetchImpl || ((u) => fetch(u));
  const Ctx = deps.Ctx || globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext;
  /** @type {any} */
  let ctx = null;
  /** @type {Map<string, Promise<AudioBuffer|null>>} */
  const buffers = new Map();
  let on = readOn();
  /** @type {Set<string>|null} */
  let seen = null;
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch { /* 描き直しの失敗は無視 */ } });

  /** タップの中で呼ぶ。AudioContext を起こす(iPhone は無音の1音を鳴らすと確実に起きる)。 */
  function unlock() {
    if (!Ctx) return false;
    try {
      if (!ctx) ctx = new Ctx();
      if (ctx.state === 'suspended') void ctx.resume();
      const b = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start(0);
      return true;
    } catch {
      return false;
    }
  }
  function load(path) {
    if (!buffers.has(path)) {
      buffers.set(path, fetchImpl(`/extension/${path}`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => (ab ? new Promise((res) => ctx.decodeAudioData(ab, res, () => res(null))) : null))
        .catch(() => null));
    }
    return buffers.get(path);
  }
  /** @param {string} kind */
  async function play(kind) {
    if (!on || !ctx || ctx.state !== 'running') return 'off';
    const path = resolveEffectSoundPath(kind, { variantPaths: EFFECT_SOUND_VARIANT_PATHS });
    if (!path) return 'no-path';
    const buf = await load(path);
    if (!buf) return 'error';
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = defaultVolumeForEffectSoundKind(kind);
    src.connect(gain).connect(ctx.destination);
    src.start(0);
    return 'played';
  }
  return {
    isOn: () => on,
    /** AudioContext が起きていて鳴らせるか(iPhone で次に開いたときはタップ待ち)。 */
    isReady: () => Boolean(ctx && ctx.state === 'running'),
    /** タップの中で呼ぶ。ON/OFF を切り替える。 */
    toggle() {
      on = !on;
      writeOn(on);
      if (on) unlock();
      notify();
      return on;
    },
    /** タップの中で呼ぶ(ON のまま開いた後の最初のタップ)。 */
    wake() {
      if (on && unlock()) notify();
    },
    /** 新しいスナップショットのコメント鏡の行。増えたギフトがあれば1回鳴らす。 @param {any[]} rows */
    onRows(rows) {
      const r = pickPhoneGiftSound({ rows, seen });
      seen = r.seen;
      if (r.kind) void play(r.kind);
      return r.kind;
    },
    play,
    onChange: (f) => listeners.add(f)
  };
}

const STYLE = `
#lvWebSoundBtn{position:fixed;right:12px;bottom:calc(72px + env(safe-area-inset-bottom,0px));z-index:99995;
  min-width:44px;height:44px;padding:0 12px;border-radius:22px;border:1px solid rgba(0,0,0,.15);
  background:#fff;color:#333;font:600 15px/1 system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.18)}
#lvWebSoundBtn[data-on="1"]{background:#e8618c;color:#fff;border-color:#e8618c}
@media (prefers-color-scheme: dark){#lvWebSoundBtn{background:#2a2a30;color:#eee;border-color:#444}}
`;

/** @param {ReturnType<typeof createPhoneSoundPlayer>} player */
export function mountPhoneSoundUi(player) {
  if (document.getElementById('lvWebSoundBtn')) return;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.id = 'lvWebSoundBtn';
  btn.type = 'button';
  const paint = () => {
    const on = player.isOn();
    btn.dataset.on = on ? '1' : '0';
    btn.textContent = !on ? '🔇' : player.isReady() ? '🔊' : '🔊 タップで音';
    btn.setAttribute('aria-label', !on ? 'ギフトの効果音: なし(押すと鳴らす)' : 'ギフトの効果音: あり(押すと止める)');
  };
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (player.isOn() && !player.isReady()) player.wake();
    else player.toggle();
    paint();
  });
  // ON のまま開いたとき: 最初のタップ(どこでも)で音を起こす。
  const wakeOnce = () => { player.wake(); paint(); };
  document.addEventListener('pointerdown', wakeOnce, { once: true, capture: true });
  player.onChange(paint);
  paint();
  document.body.appendChild(btn);
}
