/**
 * v0.1.1740: PC 側の「スマホへ声を送る係」。status.html?publisher=1 の送信の返事が voiceWanted:true の間だけ動く。
 *   新しいコメント → PC と同じ声の割り当てで VOICEVOX 合成 → Ogg Opus → 送信。
 *   VOICEVOX・合成・送信の部品は差し込み(テストで本物を使わない)。どれかが失敗しても、その1件を捨てるだけ。
 *
 * @module phoneVoiceSender
 */
import { pickNewVoiceRows } from './phoneVoice.js';
import { resolveVoiceForUser } from './voiceAssignment.js';
import { buildVoiceReadingText } from './voicevoxClient.js';
import { comeviewUserKeyForRow } from './comeviewActions.js';

/** 声の一覧(styleIds)を取り直す間隔。VOICEVOX を後から起動しても拾えるように。 */
const STYLE_RETRY_MS = 30_000;

/**
 * 失敗を既定値にたたむ(部品の失敗でその1件を捨てるだけにする)。
 * @template T
 * @param {() => Promise<T>} fn
 * @param {T} fallback
 * @returns {Promise<T>}
 */
async function safe(fn, fallback) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** @param {Uint8Array} u8 */
export function bytesToBase64(u8) {
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * スマホに見せる読み上げの状態。
 *   'ok' = 声を作れている / 'voicevox_down' = PC の VOICEVOX が起動していない / 'no_encoder' = この Chrome で声を縮められない
 * @typedef {'ok'|'voicevox_down'|'no_encoder'} PhoneVoiceState
 */

/**
 * @param {{
 *   listStyleIds: () => Promise<number[]>,
 *   loadSettings: () => Promise<{ assignments?: unknown, readName?: boolean }>,
 *   synth: (text: string, voice: { styleId: number, pitchOffset: number, speedOffset: number }) => Promise<ArrayBuffer|null>,
 *   encode: (wav: ArrayBuffer) => Promise<Uint8Array|null>,
 *   post: (clip: { no: string, ogg: string }) => Promise<boolean>,
 *   now?: () => number
 * }} deps
 */
export function createPhoneVoiceSender(deps) {
  const now = deps.now || (() => Date.now());
  /** @type {Set<string>|null} */
  let seen = null;
  let liveId = '';
  let busy = false;
  /** @type {number[]} */
  let styleIds = [];
  let styleAt = 0;
  /** @type {PhoneVoiceState|''} */
  let state = '';

  /**
   * @param {{ wanted: boolean, liveId?: string, rows?: unknown[] }} a
   * @returns {Promise<number>} 送れた件数
   */
  async function tick(a) {
    // 欲しがられていない間は覚えたことを忘れる=次に ON にしたとき過去のコメントをまとめて読まない。
    if (!a || !a.wanted) {
      seen = null;
      state = '';
      return 0;
    }
    const lv = String(a.liveId || '');
    if (lv !== liveId) {
      liveId = lv;
      seen = null;
    }
    if (busy) return 0;
    const r = pickNewVoiceRows({ rows: Array.isArray(a.rows) ? a.rows : [], seen });
    seen = r.seen;
    if (!r.picks.length) return 0;
    busy = true;
    let sent = 0;
    try {
      if (!styleIds.length && now() - styleAt >= STYLE_RETRY_MS) {
        styleAt = now();
        styleIds = await safe(deps.listStyleIds, /** @type {number[]} */ ([]));
      }
      if (!styleIds.length) {
        state = 'voicevox_down';
        return 0;
      }
      const settings = (await safe(deps.loadSettings, null)) || {};
      for (const p of r.picks) {
        const voice = resolveVoiceForUser(comeviewUserKeyForRow(p) || 'anon', settings.assignments, styleIds);
        const text = buildVoiceReadingText({ name: settings.readName ? p.name : '', text: p.text });
        const wav = await safe(() => deps.synth(text, voice), null);
        if (!wav) {
          // 合成できない=VOICEVOX が止まった可能性。次の回に声の一覧から確かめ直す。
          styleIds = [];
          state = 'voicevox_down';
          break;
        }
        const ogg = await safe(() => deps.encode(wav), null);
        if (!ogg) {
          state = 'no_encoder';
          break;
        }
        state = 'ok';
        if (await safe(() => deps.post({ no: p.no, ogg: bytesToBase64(ogg) }), false)) sent += 1;
      }
    } finally {
      busy = false;
    }
    return sent;
  }

  return {
    tick,
    /** スマホに見せる状態(まだ1件も試していなければ '')。 */
    state: () => state
  };
}
