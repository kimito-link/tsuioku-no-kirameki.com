/**
 * 読み上げの声の音質の設定を、この画面の合成へ効かせる(2026-10-29)。
 *
 * - 会場(watch タブ)・コメビュ・状態ページ(スマホへ送る声)で、それぞれ1回だけ呼ぶ。
 * - 起動時に保存値を読み、変わったら次の合成から効かせる(読み上げ中の文は途中で変えない)。
 * - 読めない・壊れた値は今までどおり 16kHz(voiceQuality.js の normalizeVoiceQuality)。
 */
import { KEY_VOICE_QUALITY, voiceQualitySamplingRate } from '../lib/voiceQuality.js';
import { setVoicevoxOutputSamplingRate } from '../lib/voicevoxClient.js';

let _wired = false;

export function wireVoiceQualitySetting() {
  if (_wired) return;
  _wired = true;
  try {
    void chrome.storage.local.get(KEY_VOICE_QUALITY)
      .then((bag) => { setVoicevoxOutputSamplingRate(voiceQualitySamplingRate(bag?.[KEY_VOICE_QUALITY])); })
      .catch(() => { /* no-op: 16kHz のまま */ });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes || !changes[KEY_VOICE_QUALITY]) return;
      setVoicevoxOutputSamplingRate(voiceQualitySamplingRate(changes[KEY_VOICE_QUALITY].newValue));
    });
  } catch {
    /* no-op: 拡張の文脈が無い(リロード後の古いタブ)ときは 16kHz のまま */
  }
}
