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
 * v0.1.1743: 声にする順番待ちの上限。PC の会場の読み上げの列(voiceLagBudget の最大8)と同じ。
 *   以前は1回の送信で新着の新しい5件だけを読み、残りは「読んだ」扱いで二度と読まなかった
 *   (実機で3分にコメント約60件・声19本)。今は合成中に来た分も列に残し、溢れたときだけ古い方を捨てる。
 */
export const PHONE_VOICE_BACKLOG_MAX = 8;

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
 * 鏡の行のうち、コメントなのに番号が無い行の数(番号が無いと声にできない)。
 * @param {unknown} rows
 */
function countRowsWithoutNumber(rows) {
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  for (const r of rows) {
    if (r && typeof r === 'object' && /** @type {any} */ (r).kind !== 'gift' && !/^\d{1,10}$/.test(String(/** @type {any} */ (r).no ?? ''))) n += 1;
  }
  return n;
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
  /** @type {{ no: string, userId: string, name: string, text: string }[]} */
  let pending = [];
  /** @type {number[]} */
  let styleIds = [];
  let styleAt = 0;
  /** @type {PhoneVoiceState|''} */
  let state = '';
  /**
   * v0.1.1746: 声にならなかったコメントがどこで落ちたかを数える(実機で3分にコメント55件・声28本だったため)。
   *   picked=声にする列に入れた / overflow=列が溢れて捨てた / noNumber=最新の鏡でコメント番号が無い行(声にできない)
   *   failed=合成・縮め・送信のどれかで失敗 / sent=送れた / ticks=呼ばれた回数(送信の返事の回数)
   */
  const counts = { ticks: 0, picked: 0, overflow: 0, noNumber: 0, failed: 0, sent: 0, since: now() };

  /**
   * @param {{ wanted: boolean, liveId?: string, rows?: unknown[] }} a
   * @returns {Promise<number>} 送れた件数
   */
  async function tick(a) {
    // 欲しがられていない間は覚えたことを忘れる=次に ON にしたとき過去のコメントをまとめて読まない。
    if (!a || !a.wanted) {
      seen = null;
      pending = [];
      state = '';
      return 0;
    }
    counts.ticks += 1;
    const lv = String(a.liveId || '');
    if (lv !== liveId) {
      liveId = lv;
      seen = null;
      pending = [];
    }
    // 合成中でも新着は列に足す(以前は合成中の回を丸ごと飛ばし、次の回で新しい5件だけ読んでいた)。
    // 溢れはこの下で数えてから捨てる(pickNewVoiceRows の中で黙って切らない)。
    const r = pickNewVoiceRows({ rows: Array.isArray(a.rows) ? a.rows : [], seen, max: 1000 });
    seen = r.seen;
    counts.picked += r.picks.length;
    counts.noNumber = countRowsWithoutNumber(a.rows);
    const merged = pending.concat(r.picks);
    counts.overflow += Math.max(0, merged.length - PHONE_VOICE_BACKLOG_MAX);
    pending = merged.slice(-PHONE_VOICE_BACKLOG_MAX);
    if (busy || !pending.length) return 0;
    busy = true;
    let sent = 0;
    try {
      if (!styleIds.length && now() - styleAt >= STYLE_RETRY_MS) {
        styleAt = now();
        styleIds = await safe(deps.listStyleIds, /** @type {number[]} */ ([]));
      }
      if (!styleIds.length) {
        state = 'voicevox_down';
        counts.failed += pending.length;
        pending = [];
        return 0;
      }
      const settings = (await safe(deps.loadSettings, null)) || {};
      // 合成している間に次の回が列へ足した分も、この回のうちに続けて読む。
      while (pending.length) {
        const p = /** @type {{ no: string, userId: string, name: string, text: string }} */ (pending.shift());
        const voice = resolveVoiceForUser(comeviewUserKeyForRow(p) || 'anon', settings.assignments, styleIds);
        const text = buildVoiceReadingText({ name: settings.readName ? p.name : '', text: p.text });
        const wav = await safe(() => deps.synth(text, voice), null);
        if (!wav) {
          // 合成できない=VOICEVOX が止まった可能性。次の回に声の一覧から確かめ直す。
          counts.failed += 1 + pending.length;
          styleIds = [];
          state = 'voicevox_down';
          pending = [];
          break;
        }
        const ogg = await safe(() => deps.encode(wav), null);
        if (!ogg) {
          counts.failed += 1 + pending.length;
          state = 'no_encoder';
          pending = [];
          break;
        }
        state = 'ok';
        if (await safe(() => deps.post({ no: p.no, ogg: bytesToBase64(ogg) }), false)) sent += 1;
        else counts.failed += 1;
      }
    } finally {
      busy = false;
    }
    counts.sent += sent;
    return sent;
  }

  return {
    tick,
    /** スマホに見せる状態(まだ1件も試していなければ '')。 */
    state: () => state,
    /** v0.1.1746: 声にならなかったコメントの内訳(スナップショットの phoneVoiceStats で読める)。 */
    stats: () => ({ ...counts, pending: pending.length })
  };
}
