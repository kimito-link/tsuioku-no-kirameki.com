/**
 * ポップアップの「読み上げの声を絞る」の配線(2026-10-24 P3)。
 *
 * - 起動時に保存値(既定 'off')を読んで選択肢に出す。
 * - 変えたら1回だけ保存する。会場とコメビュは、次に読み上げを ON にしたときに読む
 *   (配信の途中で常連の声を入れ替えないため、ON の途中では切り替えない)。
 *
 * DOM/chrome API に触れるのでここは src/extension/popup 配下。値の正規化は src/lib/voiceNarrowing.js。
 */
import {
  KEY_VOICE_NARROW_MODE,
  normalizeVoiceNarrowMode
} from '../../lib/voiceNarrowing.js';

/**
 * @param {Document|null|undefined} root
 * @param {{
 *   get: (key: string) => Promise<Record<string, unknown>|null|undefined>,
 *   set: (items: Record<string, unknown>) => Promise<unknown>
 * }} storage
 */
export function wireVoiceNarrowSelect(root, storage) {
  if (!root || typeof root.getElementById !== 'function') return;
  const select = /** @type {HTMLSelectElement|null} */ (root.getElementById('voiceNarrowSelect'));
  if (!select || select.dataset.nlWired === '1') return;
  select.dataset.nlWired = '1';

  select.addEventListener('change', () => {
    const mode = normalizeVoiceNarrowMode(select.value);
    select.value = mode;
    void Promise.resolve(storage.set({ [KEY_VOICE_NARROW_MODE]: mode })).catch(() => {});
  });

  void Promise.resolve(storage.get(KEY_VOICE_NARROW_MODE))
    .then((bag) => { select.value = normalizeVoiceNarrowMode(bag?.[KEY_VOICE_NARROW_MODE]); })
    .catch(() => { select.value = 'off'; });
}
