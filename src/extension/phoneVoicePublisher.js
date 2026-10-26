/**
 * v0.1.1740: status.html?publisher=1 の「スマホへ声を送る係」の配線(本物の VOICEVOX・WebCodecs・chrome.storage・fetch)。
 *   判定と順番は src/lib/phoneVoiceSender.js。ここは部品を差し込むだけ。
 */
import { createPhoneVoiceSender } from '../lib/phoneVoiceSender.js';
import { encodeWavToOggOpus } from '../lib/phoneVoiceEncode.js';
import { listVoicevoxStyleIds, synthesizeVoice } from '../lib/voicevoxClient.js';
import { KEY_VOICE_ASSIGNMENTS, KEY_VOICE_READ_NAME_ENABLED } from '../lib/voiceKeys.js';

/**
 * @param {() => { creds: { mode: string, viewToken: string, headers: Record<string, string> }, ingestUrl: string }|null} getTarget
 *   送り先(送信のたびに最新の鍵と URL を返す)。null なら送らない。
 */
export function createPcPhoneVoice(getTarget) {
  return createPhoneVoiceSender({
    listStyleIds: () => listVoicevoxStyleIds(),
    loadSettings: async () => {
      const bag = await chrome.storage.local.get([KEY_VOICE_ASSIGNMENTS, KEY_VOICE_READ_NAME_ENABLED]);
      return { assignments: bag?.[KEY_VOICE_ASSIGNMENTS], readName: bag?.[KEY_VOICE_READ_NAME_ENABLED] === true };
    },
    // stream を渡さないので必ず丸ごとの WAV(または null)が返る。
    synth: async (text, voice) => /** @type {ArrayBuffer|null} */ (await synthesizeVoice(text, voice)),
    encode: (wav) => encodeWavToOggOpus(wav),
    post: async (clip) => {
      const t = getTarget();
      if (!t) return false;
      const body = t.creds.mode === 'shared' ? { ...clip, v: t.creds.viewToken } : clip;
      const res = await fetch(`${t.ingestUrl}?action=voice`, { method: 'POST', headers: t.creds.headers, body: JSON.stringify(body) });
      return res.ok;
    }
  });
}
