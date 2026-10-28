// @ts-nocheck
/* global process -- サーバー(Vercel 関数)専用の部品。api/ と同じく env を読む */
/**
 * v0.1.1823: 配信者中継(ファン用の読むだけのリンク)の Redis 係。api/status.js・api/device.js から呼ぶ。
 *   POST /api/status?action=fan  { on: true }  → ファン用リンクを返す(あれば同じものを延ばして返す)
 *   POST /api/status?action=fan  { on: false } → 取り消す(古いリンクは 404)
 *   GET  /api/status?v=fan_…                    → 配信者の最新を【読むだけ】で返す(api/status.js)
 * 決まりごとは src/lib/fanLink.js。
 */

import { utcHour, utcMonth, MONTH_QUOTA_TTL_SECONDS } from '../lib/deviceAuth.js';
import { FAN_LINK_TTL_SECONDS, fanKeys, fanRealtimeVerdict, isFanToken } from '../lib/fanLink.js';
import { incrWithExpiry, randomToken, upstash } from './deviceStore.js';

const VIEW_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * ファン用リンクを出す(既にあれば同じものの寿命を延ばす)。
 * @param {string} token 配信者の閲覧トークン(鍵の照合は呼び出し側)
 * @returns {Promise<string>}
 */
export async function enableFanLink(token) {
  const prev = await upstash(['GET', fanKeys.owner(token)]);
  if (isFanToken(prev)) {
    const still = await upstash(['GET', fanKeys.fan(prev)]);
    if (still === token) {
      await upstash(['EXPIRE', fanKeys.fan(prev), String(FAN_LINK_TTL_SECONDS)]);
      await upstash(['EXPIRE', fanKeys.owner(token), String(FAN_LINK_TTL_SECONDS)]);
      return prev;
    }
  }
  const fanToken = `fan_${randomToken(16)}`;
  await upstash(['SET', fanKeys.fan(fanToken), token, 'EX', String(FAN_LINK_TTL_SECONDS)]);
  await upstash(['SET', fanKeys.owner(token), fanToken, 'EX', String(FAN_LINK_TTL_SECONDS)]);
  return fanToken;
}

/**
 * 取り消す(閲覧URLの作り直し・スマホで見るを OFF にしたときも呼ぶ)。
 * @param {string} token 配信者の閲覧トークン
 */
export async function revokeFanLink(token) {
  const prev = await upstash(['GET', fanKeys.owner(token)]);
  if (isFanToken(prev)) await upstash(['DEL', fanKeys.fan(prev)]);
  await upstash(['DEL', fanKeys.owner(token)]);
}

/**
 * ファン用リンク → 配信者の閲覧トークン。無い・取り消し済みなら ''。
 * @param {string} fanToken
 * @returns {Promise<string>}
 */
export async function resolveFanLink(fanToken) {
  if (!isFanToken(fanToken)) return '';
  const v = await upstash(['GET', fanKeys.fan(fanToken)]);
  return typeof v === 'string' && VIEW_TOKEN_RE.test(v) && !isFanToken(v) ? v : '';
}

/**
 * ファンにリアルタイムの許可を出してよいか(数えてから判定)。
 * @param {string} token 配信者の閲覧トークン
 * @param {number} nowMs
 */
export async function allowFanRealtime(token, nowMs) {
  const hourCount = await incrWithExpiry(fanKeys.rtHour(token, utcHour(nowMs)), 2 * 60 * 60);
  const monthCount = await incrWithExpiry(fanKeys.rtMonth(utcMonth(nowMs)), MONTH_QUOTA_TTL_SECONDS);
  return fanRealtimeVerdict({
    hourCount,
    hourLimit: Number(process.env.FAN_REALTIME_HOURLY_LIMIT) || undefined,
    monthCount,
    monthLimit: Number(process.env.FAN_REALTIME_MONTHLY_LIMIT) || undefined
  });
}

/**
 * 閲覧URLを作り直したとき、ファン用リンクは新しい閲覧トークンへ付け替える
 * (作り直しは配信者の URL が漏れたときの対策=ファンに配ったリンクまで切らない)。
 * @param {string} oldToken
 * @param {string} newToken
 */
export async function moveFanLink(oldToken, newToken) {
  const prev = await upstash(['GET', fanKeys.owner(oldToken)]);
  await upstash(['DEL', fanKeys.owner(oldToken)]);
  if (!isFanToken(prev)) return;
  await upstash(['SET', fanKeys.fan(prev), newToken, 'EX', String(FAN_LINK_TTL_SECONDS)]);
  await upstash(['SET', fanKeys.owner(newToken), prev, 'EX', String(FAN_LINK_TTL_SECONDS)]);
}
