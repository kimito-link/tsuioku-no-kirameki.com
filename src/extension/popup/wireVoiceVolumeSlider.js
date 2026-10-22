/**
 * ポップアップの「読み上げ音量」スライダーの配線(2026-10-22 P2・りんく要望「ボリューム調整を POP から」)。
 *
 * - 起動時に保存値(既定100%)を読んでスライダーと表示に出す。
 * - 動かしている間は表示だけ更新し、指を離したとき(change)に1回だけ保存する(storage を連打しない)。
 * - 保存値は会場(VoicePlayer)とコメビュが storage.onChanged で拾い、次に鳴らす声から効く。
 *
 * DOM/chrome API に触れるのでここは src/extension/popup 配下。値の正規化は src/lib/voiceVolume.js。
 */
import {
  KEY_VOICE_VOLUME_PERCENT,
  normalizeVoiceVolumePercent
} from '../../lib/voiceVolume.js';

/**
 * @param {Document|null|undefined} root
 * @param {{
 *   get: (key: string) => Promise<Record<string, unknown>|null|undefined>,
 *   set: (items: Record<string, unknown>) => Promise<unknown>
 * }} storage
 */
export function wireVoiceVolumeSlider(root, storage) {
  if (!root || typeof root.getElementById !== 'function') return;
  const input = /** @type {HTMLInputElement|null} */ (root.getElementById('voiceVolumeRange'));
  const label = root.getElementById('voiceVolumeValue');
  if (!input || input.dataset.nlWired === '1') return;
  input.dataset.nlWired = '1';

  const show = (/** @type {number} */ pct) => {
    input.value = String(pct);
    if (label) label.textContent = `${pct}%`;
  };

  input.addEventListener('input', () => {
    if (label) label.textContent = `${normalizeVoiceVolumePercent(input.value)}%`;
  });
  input.addEventListener('change', () => {
    const pct = normalizeVoiceVolumePercent(input.value);
    show(pct);
    void Promise.resolve(storage.set({ [KEY_VOICE_VOLUME_PERCENT]: pct })).catch(() => {});
  });

  void Promise.resolve(storage.get(KEY_VOICE_VOLUME_PERCENT))
    .then((bag) => show(normalizeVoiceVolumePercent(bag?.[KEY_VOICE_VOLUME_PERCENT])))
    .catch(() => show(normalizeVoiceVolumePercent(undefined)));
}
