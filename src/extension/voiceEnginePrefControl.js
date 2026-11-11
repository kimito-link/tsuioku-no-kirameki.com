/**
 * 会場とコメビュの計算モード選択。希望がまだ無いあいだ、読み上げ ON で出す。
 * CPU がはじめから選ばれている。保存するのは利用者が選んだときだけ。
 * 選んだあとはポップアップの設定で変えられる。
 */
import { KEY_VOICE_ENGINE_PREF } from '../lib/voiceKeys.js';
import { normalizeVoiceEnginePref, voiceEnginePrefOrDefault } from '../lib/voiceEnginePref.js';

/**
 * @param {Document} doc
 * @param {{
 *   get?: (keys: string[]) => Promise<Record<string, unknown>|null|undefined>,
 *   set?: (value: Record<string, unknown>) => Promise<unknown>|void,
 *   onChanged?: (fn: (changes: Record<string, { newValue?: unknown }>, area?: string) => void) => void
 * }} [storage]
 */
export function mountVoiceEnginePref(doc, storage) {
  const store = storage || defaultStorage();
  const label = doc.createElement('label');
  label.className = 'nlsb-voice-pref';
  label.hidden = true;
  label.style.cssText = 'margin-left:8px;color:#7a828e;font-size:12px;font-weight:400;';
  label.append(doc.createTextNode('計算モード '));
  const select = doc.createElement('select');
  select.setAttribute('aria-label', '読み上げの計算モード');
  for (const [value, text] of [['cpu', 'CPU'], ['gpu', 'GPU']]) {
    const opt = doc.createElement('option');
    opt.value = value;
    opt.textContent = text;
    select.append(opt);
  }
  select.value = 'cpu';
  label.append(select);
  let revealed = false;
  const paint = (/** @type {unknown} */ value) => { select.value = voiceEnginePrefOrDefault(value); };
  select.addEventListener('change', () => {
    const next = select.value === 'gpu' ? 'gpu' : 'cpu';
    void store.set?.({ [KEY_VOICE_ENGINE_PREF]: next });
  });
  try {
    store.onChanged?.((changes, area) => {
      if (area && area !== 'local') return;
      if (!changes || !(KEY_VOICE_ENGINE_PREF in changes)) return;
      paint(changes[KEY_VOICE_ENGINE_PREF]?.newValue);
    });
  } catch { /* 次に開いたときに読み直す */ }
  return {
    label,
    async noteEnabled() {
      let unset = false;
      try {
        const bag = /** @type {Record<string, unknown>|null|undefined} */ (await store.get?.([KEY_VOICE_ENGINE_PREF]));
        const cur = normalizeVoiceEnginePref(bag?.[KEY_VOICE_ENGINE_PREF]);
        unset = !cur;
        paint(cur || 'cpu');
      } catch {
        unset = true;
        paint('cpu');
      }
      if (unset) revealed = true;
      label.hidden = !revealed;
    },
    noteDisabled() {
      if (!revealed) label.hidden = true;
    }
  };
}

function defaultStorage() {
  const local = typeof chrome !== 'undefined' ? chrome.storage?.local : null;
  const onChanged = typeof chrome !== 'undefined' ? chrome.storage?.onChanged : null;
  return {
    get: (/** @type {string[]} */ keys) => (local ? local.get(keys) : Promise.resolve({})),
    set: (/** @type {Record<string, unknown>} */ value) => (local ? local.set(value) : Promise.resolve()),
    onChanged: onChanged ? (/** @type {(changes: Record<string, { newValue?: unknown }>, area?: string) => void} */ fn) => onChanged.addListener(fn) : undefined
  };
}
