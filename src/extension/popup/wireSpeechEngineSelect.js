/**
 * ポップアップとコメビュの「読み上げエンジン」の配線。
 * 保存先は voiceKeys の2キー。会場とコメビュは storage の変化で同じ選択になる。
 */
import { SPEECH_ENGINES, normalizeSpeechEngineFallback, normalizeSpeechEngineId, speechEngineById } from '../../lib/speechEngineCatalog.js';
import { KEY_SPEECH_ENGINE, KEY_SPEECH_ENGINE_FALLBACK } from '../../lib/voiceKeys.js';

/**
 * @param {Document|null|undefined} root
 * @param {{
 *   get: (key: string | string[]) => Promise<Record<string, unknown>|null|undefined>,
 *   set: (items: Record<string, unknown>) => Promise<unknown>
 * }} storage
 */
export function wireSpeechEngineSelect(root, storage) {
  if (!root || typeof root.getElementById !== 'function' || !storage) return;
  const select = /** @type {HTMLSelectElement|null} */ (root.getElementById('speechEngineSelect'));
  const fallback = /** @type {HTMLInputElement|null} */ (root.getElementById('speechEngineFallback'));
  const hint = root.getElementById('speechEngineHint');
  if (select && select.dataset.nlWired !== '1') {
    select.dataset.nlWired = '1';
    const paintHint = () => {
      const engine = speechEngineById(normalizeSpeechEngineId(select.value));
      const text = engine?.hint || '';
      select.title = text;
      if (hint) hint.textContent = text;
    };
    select.addEventListener('change', () => {
      const id = normalizeSpeechEngineId(select.value);
      select.value = id;
      paintHint();
      void Promise.resolve(storage.set({ [KEY_SPEECH_ENGINE]: id })).catch(() => {});
    });
    paintHint();
  }
  if (fallback && fallback.dataset.nlWired !== '1') {
    fallback.dataset.nlWired = '1';
    fallback.addEventListener('change', () => {
      const value = fallback.checked ? 'os' : 'off';
      void Promise.resolve(storage.set({ [KEY_SPEECH_ENGINE_FALLBACK]: value })).catch(() => {});
    });
  }
  void Promise.resolve(storage.get([KEY_SPEECH_ENGINE, KEY_SPEECH_ENGINE_FALLBACK]))
    .then((bag) => {
      if (select) {
        select.value = normalizeSpeechEngineId(bag?.[KEY_SPEECH_ENGINE]);
        const engine = speechEngineById(select.value);
        select.title = engine?.hint || '';
        if (hint) hint.textContent = engine?.hint || '';
      }
      if (fallback) fallback.checked = normalizeSpeechEngineFallback(bag?.[KEY_SPEECH_ENGINE_FALLBACK]) !== 'off';
    })
    .catch(() => {
      if (select) select.value = 'voicevox';
      if (fallback) fallback.checked = true;
    });
}

/** 画面の選択肢がカタログとずれていないかの確認用。 */
export function speechEngineOptionIds() {
  return SPEECH_ENGINES.map((engine) => engine.id);
}
