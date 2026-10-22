// @ts-nocheck
/* global process -- サーバー(Vercel 関数)専用の部品。api/ と同じく env を読む */
/**
 * スマホ版の「利用者ごとの鍵」をサーバー側で扱う部品(v0.1.1730・スマホ化 利用者ごとの鍵 第a段)。
 *   api/device.js(発行・作り直し・削除)と api/status.js(利用者経由の書き込み)が共有する。
 *   判定・キー名は src/lib/deviceAuth.js(純関数)。ここは乱数・ハッシュ・Redis(Upstash REST)だけ。
 *
 *   ★writeKey そのものはサーバーに残さない(sha256 のハッシュだけ)。漏れても書き込めない。
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  DEVICE_TTL_SECONDS,
  deviceKeys,
  hexEqual,
  isValidDeviceId,
  isValidWriteKey,
  parseDeviceRecord
} from '../lib/deviceAuth.js';
import { phonePostKeys } from '../lib/phonePost.js';

/** Upstash REST へ 1 コマンド送る。失敗時は例外。 */
export async function upstash(command) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) {
    throw new Error('KV env missing');
  }
  const res = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) {
    throw new Error(`upstash ${res.status}`);
  }
  const json = await res.json();
  return json?.result;
}

export function sha256Hex(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

/** 推測困難な base64url 文字列。 */
export function randomToken(bytes) {
  return randomBytes(bytes).toString('base64url');
}

/** 新しい鍵一式を作る(保存はしない)。 */
export function newDeviceCredentials() {
  return {
    deviceId: randomToken(16),
    writeKey: randomToken(32),
    viewToken: randomToken(24)
  };
}

/** 鍵の記録を保存する(TTL つき)。 */
export async function saveDeviceRecord(deviceId, writeKey, viewToken, nowMs) {
  const rec = JSON.stringify({ h: sha256Hex(writeKey), v: viewToken, c: nowMs });
  await upstash(['SET', deviceKeys.device(deviceId), rec, 'EX', String(DEVICE_TTL_SECONDS)]);
}

/**
 * x-device-id / x-write-key ヘッダを照合する。合えば { deviceId, record }、合わなければ null。
 *   ★形が違う・記録が無い・ハッシュ不一致はすべて同じ null(どれで落ちたかを外に漏らさない)。
 */
export async function authenticateDevice(headers) {
  const deviceId = headers?.['x-device-id'];
  const writeKey = headers?.['x-write-key'];
  if (!isValidDeviceId(deviceId) || !isValidWriteKey(writeKey)) return null;
  const record = parseDeviceRecord(await upstash(['GET', deviceKeys.device(deviceId)]));
  if (!record) return null;
  if (!hexEqual(record.h, sha256Hex(writeKey))) return null;
  return { deviceId, record };
}

/** カウンタを1つ進め、初回なら期限を付ける。進めた後の値を返す。 */
export async function incrWithExpiry(key, ttlSeconds) {
  const n = Number(await upstash(['INCR', key])) || 0;
  if (n === 1) {
    try {
      await upstash(['EXPIRE', key, String(ttlSeconds)]);
    } catch {
      /* 期限付けの失敗で受け口を止めない(翌日のキーは別名) */
    }
  }
  return n;
}

/** 送信元(IP)を、そのまま残さないようハッシュにする(乱発対策のキー用)。 */
export function requesterHash(req) {
  const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || String(req.headers?.['x-real-ip'] || '') || 'unknown';
  return sha256Hex(`reg:${ip}`).slice(0, 24);
}

/**
 * スマホからのコメント(v0.1.1734)の投稿用の鍵・待ち行列を消す。
 *   閲覧URLの作り直し・同意 OFF(削除)のときに呼ぶ=古いURLからはコメントもできなくなる。
 * @param {string} token 閲覧トークン
 */
export async function revokePhonePost(token) {
  const prev = await upstash(['GET', phonePostKeys.owner(token)]);
  const keys = [phonePostKeys.owner(token), phonePostKeys.queue(token), phonePostKeys.active(token)];
  if (typeof prev === 'string' && prev) keys.push(phonePostKeys.key(prev));
  await upstash(['DEL', ...keys]);
}
