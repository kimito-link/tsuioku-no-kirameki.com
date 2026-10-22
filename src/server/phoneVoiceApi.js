// @ts-nocheck
/* global process -- サーバー(Vercel 関数)専用の部品。api/ と同じく env を読む */
/**
 * v0.1.1740: スマホの読み上げ(PC の VOICEVOX の声)を預かる受け口。api/status.js から呼ぶ。
 *   POST /api/status?action=voice        PC が声1件 {no, ogg(base64)} を送る(鍵の照合は呼び出し側)。
 *   GET  /api/status?action=voice&v=&after=  スマホが「この番号より後」の声を受け取る。
 *     取りに来ること自体が「声がほしい」目印(30秒)。PC は送信の返事 voiceWanted でそれを知る。
 *   声は最新20件を2分だけ預かる(読み上げは「いま」のためのもの)。決まりごとは src/lib/phoneVoice.js。
 */

import { utcDay } from '../lib/deviceAuth.js';
import {
  DEFAULT_PHONE_VOICE_DAILY_LIMIT,
  PHONE_VOICE_KEEP,
  PHONE_VOICE_MAX_B64,
  PHONE_VOICE_TTL_SEC,
  VOICE_WANT_TTL_SEC,
  phoneVoiceKeys,
  pickVoiceClipsAfter,
  validateVoiceClip
} from '../lib/phoneVoice.js';
import { incrWithExpiry, upstash } from './deviceStore.js';

/** 声1件の送信の大きさの上限(base64 + 少しの JSON)。 */
export const MAX_VOICE_BODY_BYTES = PHONE_VOICE_MAX_B64 + 1_000;

/** いまスマホが声をほしがっているか。読めなければ false(=声を作らない側に倒す)。 */
export async function isVoiceWanted(token) {
  try {
    return Boolean(await upstash(['GET', phoneVoiceKeys.want(token)]));
  } catch {
    return false;
  }
}

/** 「声がほしい」目印を置く(最適化なので失敗は無視)。 */
export async function markVoiceWanted(token) {
  await upstash(['SET', phoneVoiceKeys.want(token), '1', 'EX', String(VOICE_WANT_TTL_SEC)]).catch(() => {});
}

/**
 * 声1件を預かる。token と quotaId は呼び出し側が鍵の照合で決めたもの。
 * @param {{ token: string, quotaId: string, body: unknown, nowMs: number }} a
 * @returns {Promise<{ code: number, json: Record<string, unknown> }>}
 */
export async function saveVoiceClip(a) {
  const clip = validateVoiceClip(a.body);
  if (!clip) return { code: 400, json: { ok: false, error: 'bad voice' } };
  const used = await incrWithExpiry(phoneVoiceKeys.quota(a.quotaId, utcDay(a.nowMs)), 2 * 24 * 60 * 60);
  const limit = Number(process.env.PHONE_VOICE_DAILY_LIMIT) || DEFAULT_PHONE_VOICE_DAILY_LIMIT;
  if (used > limit) return { code: 429, json: { ok: false, error: 'voice_quota' } };
  const key = phoneVoiceKeys.list(a.token);
  await upstash(['LPUSH', key, JSON.stringify({ no: clip.no, ogg: clip.b64 })]);
  await upstash(['LTRIM', key, '0', String(PHONE_VOICE_KEEP - 1)]);
  await upstash(['EXPIRE', key, String(PHONE_VOICE_TTL_SEC)]);
  return { code: 200, json: { ok: true, voiceWanted: await isVoiceWanted(a.token) } };
}

/**
 * スマホへ「after より後」の声を返す(古い順)。
 * @param {string} token
 * @param {unknown} after
 */
export async function loadVoiceClips(token, after) {
  const raw = await upstash(['LRANGE', phoneVoiceKeys.list(token), '0', String(PHONE_VOICE_KEEP - 1)]);
  return pickVoiceClipsAfter(raw, after);
}
