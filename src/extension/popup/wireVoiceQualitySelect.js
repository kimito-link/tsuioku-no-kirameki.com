/**
 * ポップアップの「読み上げの音質」の配線(2026-10-29)。
 *
 * - 起動時に保存値(既定 'standard'=16kHz)を読んで選択肢に出す。
 * - 変えたら1回だけ保存する。会場・コメビュ・スマホへ送る声は storage の変化を見て、次の合成から効かせる
 *   (src/extension/voiceQualitySetting.js)。
 *
 * DOM/chrome API に触れるのでここは src/extension/popup 配下。値の正規化は src/lib/voiceQuality.js。
 */
import {
  KEY_VOICE_QUALITY,
  normalizeVoiceQuality
} from '../../lib/voiceQuality.js';

/**
 * @param {Document|null|undefined} root
 * @param {{
 *   get: (key: string) => Promise<Record<string, unknown>|null|undefined>,
 *   set: (items: Record<string, unknown>) => Promise<unknown>
 * }} storage
 */
export function wireVoiceQualitySelect(root, storage) {
  if (!root || typeof root.getElementById !== 'function') return;
  const select = /** @type {HTMLSelectElement|null} */ (root.getElementById('voiceQualitySelect'));
  if (!select || select.dataset.nlWired === '1') return;
  select.dataset.nlWired = '1';

  select.addEventListener('change', () => {
    const quality = normalizeVoiceQuality(select.value);
    select.value = quality;
    void Promise.resolve(storage.set({ [KEY_VOICE_QUALITY]: quality })).catch(() => {});
  });

  void Promise.resolve(storage.get(KEY_VOICE_QUALITY))
    .then((bag) => { select.value = normalizeVoiceQuality(bag?.[KEY_VOICE_QUALITY]); })
    .catch(() => { select.value = 'standard'; });
}
