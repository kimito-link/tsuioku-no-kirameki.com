/**
 * ポップアップの読み上げ欄に出す「VOICEVOX を GPU にすると速くなる」案内の配線(2026-11-03 りんく「POP とか会場モードに記載すべき」)。
 *
 * - 読み上げが遅い PC だと記録されている(KEY_VOICE_WEAK_PC=true・会場/コメビュが合成の速さを測って保存)ときだけ見せる。
 * - 記録が変わったら(storage.onChanged)すぐ出し入れする。
 * - 文言は会場・コメビュと同じ voiceLagNotice.VOICE_GPU_TIP_TEXT(場所の説明を1か所にそろえる)。
 *
 * DOM/chrome API に触れるのでここは src/extension/popup 配下。
 */
import { KEY_VOICE_WEAK_PC } from '../../lib/voiceKeys.js';
import { VOICE_GPU_TIP_TEXT } from '../../lib/voiceLagNotice.js';

/**
 * @param {Document|null|undefined} root
 * @param {{
 *   get: (key: string) => Promise<Record<string, unknown>|null|undefined>,
 *   onChanged?: (fn: (changes: Record<string, { newValue?: unknown }>) => void) => void
 * }} storage
 */
export function wireVoiceGpuTip(root, storage) {
  if (!root || typeof root.getElementById !== 'function') return;
  const el = root.getElementById('voiceGpuTip');
  if (!el || el.dataset.nlWired === '1') return;
  el.dataset.nlWired = '1';
  el.textContent = VOICE_GPU_TIP_TEXT;
  const show = (/** @type {unknown} */ weak) => { el.hidden = weak !== true; };
  show(false);
  void Promise.resolve(storage.get(KEY_VOICE_WEAK_PC))
    .then((bag) => show(bag?.[KEY_VOICE_WEAK_PC]))
    .catch(() => show(false));
  try {
    storage.onChanged?.((changes) => {
      if (changes && KEY_VOICE_WEAK_PC in changes) show(changes[KEY_VOICE_WEAK_PC]?.newValue);
    });
  } catch { /* 出し入れが遅れても次に開いたときに正しく出る */ }
}
