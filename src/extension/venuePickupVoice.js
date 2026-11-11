/**
 * 会場の PICK UP を、声が鳴り始めたコメントへ切り替える配線。
 * 読み上げ ON のあいだは届いた順の選び直しを止め、再生開始(onAudible)と、
 * 同じ配信を読んでいるもう片方のページからの知らせだけで枠を変える。
 */
import { KEY_VOICE_NOW_PLAYING } from '../lib/voiceKeys.js';
import { acceptVoiceNowPlaying, buildVoiceNowPlaying, spokenPickupPicked } from '../lib/venuePickupPlayback.js';

/**
 * @param {{
 *   getLiveId: () => unknown,
 *   apply: (picked: { why: string, entry: any }) => void,
 *   resolveSpeaker?: (speech: any) => any,
 *   storage?: { local?: { set: (v: any) => any }, onChanged?: { addListener: (fn: any) => void } }|null,
 *   now?: () => number
 * }} deps
 */
export function createVenuePickupVoiceLink(deps) {
  const now = deps.now || (() => Date.now());
  let follows = false;
  /** @param {any} speech */
  const show = (speech) => {
    let row = speech;
    if (!row?.speaker && typeof deps.resolveSpeaker === 'function') {
      try { row = { ...speech, speaker: deps.resolveSpeaker(speech) }; } catch { row = speech; }
    }
    const picked = spokenPickupPicked(row);
    if (!picked) return;
    try { deps.apply(picked); } catch { /* 枠の失敗で読み上げを止めない */ }
  };
  const storage = deps.storage || null;
  try {
    storage?.onChanged?.addListener((/** @type {any} */ changes, /** @type {string} */ area) => {
      if (area && area !== 'local') return;
      if (!follows) return;
      const next = changes && changes[KEY_VOICE_NOW_PLAYING];
      if (!next) return;
      const speech = acceptVoiceNowPlaying(next.newValue, deps.getLiveId(), now());
      if (speech) show(speech);
    });
  } catch { /* 購読できなくても、このページの再生開始では枠を変える */ }
  return {
    follows: () => follows,
    /** @param {boolean} wanted 読み上げボタンの ON/OFF */
    noteWanted(wanted) { follows = wanted === true; },
    /** このページで声が鳴り始めた。枠をそのコメントにし、同じ配信のもう片方へも知らせる。 */
    onSpoken(/** @type {any} */ speech) {
      if (!follows) return;
      show(speech);
      publishVoiceNowPlaying(storage, speech, deps.getLiveId(), now);
    }
  };
}

/**
 * 声が鳴り始めたことを保存する(会場もコメビュもここを使う)。
 * @param {{ local?: { set: (v: any) => any } }|null|undefined} storage
 * @param {any} speech
 * @param {unknown} liveId
 * @param {() => number} [now]
 */
export function publishVoiceNowPlaying(storage, speech, liveId, now = () => Date.now()) {
  const rec = buildVoiceNowPlaying(speech, liveId, now());
  if (!rec || !storage?.local || typeof storage.local.set !== 'function') return;
  try {
    const r = storage.local.set({ [KEY_VOICE_NOW_PLAYING]: rec });
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch { /* 保存できなくても、鳴っているページの枠は別途変わる */ }
}
