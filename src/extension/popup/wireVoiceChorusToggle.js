/**
 * ポップアップの「合唱」の配線(2026-11-12)。
 *
 * - 起動時に保存値(既定 ON)を読んでチェックに出す。
 * - 変えたら1回だけ保存する。会場の読み上げ(VoicePlayer)は storage の変化を見て、次の声から効かせる。
 *
 * DOM/chrome API に触れるのでここは src/extension/popup 配下。値の決め方は src/lib/voiceChorus.js。
 */
import { isVoiceChorusEnabled, KEY_VOICE_CHORUS_ENABLED } from '../../lib/voiceChorus.js';

/**
 * @param {Document|null|undefined} root
 * @param {{
 *   get: (key: string) => Promise<Record<string, unknown>|null|undefined>,
 *   set: (items: Record<string, unknown>) => Promise<unknown>
 * }} storage
 */
export function wireVoiceChorusToggle(root, storage) {
  if (!root || typeof root.getElementById !== 'function') return;
  const box = /** @type {HTMLInputElement|null} */ (root.getElementById('voiceChorusToggle'));
  if (!box || box.dataset.nlWired === '1') return;
  box.dataset.nlWired = '1';

  box.addEventListener('change', () => {
    void Promise.resolve(storage.set({ [KEY_VOICE_CHORUS_ENABLED]: box.checked === true })).catch(() => {});
  });

  void Promise.resolve(storage.get(KEY_VOICE_CHORUS_ENABLED))
    .then((bag) => { box.checked = isVoiceChorusEnabled(bag?.[KEY_VOICE_CHORUS_ENABLED]); })
    .catch(() => { box.checked = true; });
}
