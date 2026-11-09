// twStreamKey.js — Twitch の「配信キー」(YouTube 版の videoId の位置に入る文字列)の作り方と読み方(純関数)
// @layer L0 — 純粋計算
//
// YouTube の videoId は 11 文字の英数字。Twitch は配信ごとの番号(stream.id・数字)がある。
//   キー = 'tw.<login>.<stream.id>'。11 文字の videoId とは「.」を含むので決してぶつからない。
//   stream.id が取れないとき(Twitch 側の応答が変わった等)は、配信開始の日付で代わりにする: 'tw.<login>.d<YYYYMMDDHH>'
//   (同じ日の同じ時間帯に始まった配信は1つとみなす。fail-soft・AGENTS.md §3.6)。

import { isTwLogin } from './twIrcParse.js';

export const TW_STREAM_KEY_PREFIX = 'tw.';

/** @param {unknown} key */
export function isTwStreamKey(key) {
  return /^tw\.[a-z0-9_]{3,25}\.(?:\d{1,20}|d\d{10})$/.test(String(key || ''));
}

/**
 * @param {string} login
 * @param {{ streamId?: string | number | null, startedAtMs?: number | null }} [opts]
 * @param {number} [nowMs]
 */
export function buildTwStreamKey(login, opts = {}, nowMs = Date.now()) {
  const l = String(login || '').toLowerCase();
  if (!isTwLogin(l)) return '';
  const sid = String(opts.streamId ?? '').trim();
  if (/^\d{1,20}$/.test(sid)) return `${TW_STREAM_KEY_PREFIX}${l}.${sid}`;
  const at = Number(opts.startedAtMs) > 0 ? Number(opts.startedAtMs) : nowMs;
  // 日本時間の年月日時(配信者の多くが日本にいる前提ではなく、キーが毎回同じになれば良い)
  const d = new Date(at + 9 * 3600 * 1000);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;
  return `${TW_STREAM_KEY_PREFIX}${l}.d${stamp}`;
}

/** 'tw.<login>.<id>' → login。Twitch のキーでなければ '' */
/** @param {unknown} key */
export function twLoginOfStreamKey(key) {
  const m = String(key || '').match(/^tw\.([a-z0-9_]{3,25})\./);
  return m ? m[1] : '';
}

/** 配信キー → その配信者のページ */
/** @param {unknown} key */
export function twChannelUrlOfStreamKey(key) {
  const l = twLoginOfStreamKey(key);
  return l ? `https://www.twitch.tv/${l}` : '';
}

/** login → その人のページ */
/** @param {unknown} login */
export function twChannelUrlOfLogin(login) {
  const l = String(login || '').toLowerCase();
  return isTwLogin(l) ? `https://www.twitch.tv/${l}` : '';
}
