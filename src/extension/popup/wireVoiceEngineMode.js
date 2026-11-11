/**
 * ポップアップの読み上げ設定。計算モードの希望（CPU が既定）と、接続中に分かる実モード。
 * エンジンへ聞くのは、読み上げ ON のときと、つながっていなくて再試行が成功したときだけ。
 */
import { KEY_VOICE_ENGINE_PREF, KEY_VOICE_READING_ENABLED } from '../../lib/voiceKeys.js';
import { resolveVoiceLoadingView, voiceEngineModeFromProbe } from '../../lib/voiceLoadingState.js';
import {
  normalizeVoiceEnginePref,
  voiceEngineConnectionLines,
  voiceEnginePrefOrDefault
} from '../../lib/voiceEnginePref.js';
import { probeVoiceEngineDevices, probeVoicevoxAlive } from '../../lib/voicevoxClient.js';

/** 会場の再接続と同じ間隔。つながるまでのあいだだけ。 */
const RETRY_MS = 8000;

/**
 * @param {Document|null|undefined} root
 * @param {{
 *   isReadingOn?: () => Promise<boolean>,
 *   onReadingChanged?: (fn: (on: boolean) => void) => void,
 *   getPref?: () => Promise<unknown>,
 *   setPref?: (pref: 'cpu'|'gpu') => Promise<unknown>|void,
 *   onPrefChanged?: (fn: (pref: 'cpu'|'gpu') => void) => void,
 *   probeAlive?: () => Promise<boolean|{ ok?: boolean, reason?: string }>,
 *   probeDevices?: () => Promise<unknown>,
 *   retryMs?: number,
 *   schedule?: (fn: () => void, ms: number) => unknown,
 *   clear?: (id: unknown) => void
 * }} [deps]
 */
export function wireVoiceEngineMode(root, deps = {}) {
  if (!root || typeof root.getElementById !== 'function') return;
  const el = root.getElementById('voiceEngineMode');
  if (!el || el.dataset.nlWired === '1') return;
  el.dataset.nlWired = '1';
  const select = /** @type {HTMLSelectElement|null} */ (root.getElementById('voiceEnginePref'));
  const isReadingOn = deps.isReadingOn || defaultIsReadingOn;
  const getPref = deps.getPref || defaultGetPref;
  const setPref = deps.setPref || defaultSetPref;
  const probeAlive = deps.probeAlive || (() => probeVoicevoxAlive());
  const probeDevices = deps.probeDevices || (() => probeVoiceEngineDevices());
  const retryMs = typeof deps.retryMs === 'number' ? deps.retryMs : RETRY_MS;
  const schedule = deps.schedule || ((fn, ms) => setTimeout(fn, ms));
  const clear = deps.clear || ((id) => clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (id)));
  let timer = /** @type {unknown} */ (0);
  let serial = 0;
  let pref = /** @type {'cpu'|'gpu'} */ ('cpu');
  let lastInfo = /** @type {unknown} */ (null);
  let connected = false;

  const paintMode = () => {
    if (!connected) return;
    const reported = lastInfo && typeof lastInfo === 'object' ? /** @type {{ mode?: unknown }} */ (lastInfo).mode : null;
    const lines = voiceEngineConnectionLines({
      pref,
      actual: voiceEngineModeFromProbe(lastInfo),
      cpuOnly: reported === 'cpu'
    });
    el.textContent = lines.note ? `${lines.status} ${lines.note}` : lines.status;
    el.hidden = !el.textContent;
    if (el.style) el.style.color = '#7a828e';
    el.classList?.toggle?.('is-error', false);
  };
  const paint = (/** @type {string} */ text, /** @type {boolean} */ error) => {
    el.textContent = text;
    el.hidden = !text;
    if (el.style) el.style.color = error ? '#ffb4a2' : '#7a828e';
    el.classList?.toggle?.('is-error', error);
  };
  const stop = () => {
    if (timer) { clear(timer); timer = 0; }
  };
  const notConnected = (/** @type {unknown} */ result) => {
    const raw = result && typeof result === 'object' ? /** @type {{ reason?: unknown }} */ (result).reason : '';
    const reason = raw === 'timeout' || raw === 'http-error' || raw === 'no-fetch' || raw === 'refused' ? raw : 'refused';
    return resolveVoiceLoadingView('notfound', 'venue', reason).text;
  };
  const aliveOf = (/** @type {unknown} */ result) => {
    if (result === true) return true;
    return !!(result && typeof result === 'object' && /** @type {{ ok?: boolean }} */ (result).ok === true);
  };
  const applyPref = (/** @type {unknown} */ value, /** @type {boolean} */ writeDefault) => {
    const saved = normalizeVoiceEnginePref(value);
    pref = saved || 'cpu';
    if (select) select.value = pref;
    if (!saved && writeDefault) void setPref('cpu');
  };

  if (select && select.dataset.nlWired !== '1') {
    select.dataset.nlWired = '1';
    select.addEventListener('change', () => {
      pref = select.value === 'gpu' ? 'gpu' : 'cpu';
      void setPref(pref);
      if (connected) paintMode();
    });
  }
  void Promise.resolve(getPref()).then((value) => applyPref(value, false), () => applyPref('cpu', false));

  /** @param {boolean} [wanted] */
  const run = (wanted) => {
    const mine = ++serial;
    stop();
    const go = (/** @type {boolean} */ on) => {
      if (mine !== serial) return;
      if (!on) {
        connected = false;
        paint('', false);
        return;
      }
      void Promise.resolve(getPref()).then((value) => {
        if (mine !== serial) return;
        applyPref(value, true);
        return Promise.resolve(probeAlive());
      }).then((result) => {
        if (mine !== serial || result === undefined) return null;
        if (!aliveOf(result)) {
          connected = false;
          paint(notConnected(result), true);
          if (retryMs > 0) timer = schedule(() => { void Promise.resolve(isReadingOn()).then((still) => run(still)); }, retryMs);
          return null;
        }
        return Promise.resolve(probeDevices()).then((info) => {
          if (mine !== serial) return;
          connected = true;
          lastInfo = info;
          paintMode();
        });
      }).catch(() => {
        if (mine !== serial) return;
        connected = false;
        paint(notConnected(null), true);
        if (retryMs > 0) timer = schedule(() => { void Promise.resolve(isReadingOn()).then((still) => run(still)); }, retryMs);
      });
    };
    if (typeof wanted === 'boolean') go(wanted);
    else void Promise.resolve(isReadingOn()).then((on) => go(on === true), () => go(false));
  };

  try { deps.onReadingChanged?.((on) => run(on)); } catch { /* 次に開いたときに読み直す */ }
  try {
    deps.onPrefChanged?.((next) => {
      pref = voiceEnginePrefOrDefault(next);
      if (select) select.value = pref;
      if (connected) paintMode();
    });
  } catch { /* 設定を開き直したときに読み直す */ }
  run();
}

async function defaultIsReadingOn() {
  try {
    const bag = await chrome.storage.local.get(KEY_VOICE_READING_ENABLED);
    return bag?.[KEY_VOICE_READING_ENABLED] === true;
  } catch {
    return false;
  }
}

async function defaultGetPref() {
  try {
    const bag = await chrome.storage.local.get(KEY_VOICE_ENGINE_PREF);
    return bag?.[KEY_VOICE_ENGINE_PREF];
  } catch {
    return null;
  }
}

function defaultSetPref(/** @type {'cpu'|'gpu'} */ pref) {
  try {
    return chrome.storage.local.set({ [KEY_VOICE_ENGINE_PREF]: pref });
  } catch {
    return Promise.resolve();
  }
}
