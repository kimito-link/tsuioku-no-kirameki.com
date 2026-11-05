// voiceBusyPriority.js
// v0.1.1861: 読み上げが混んでいる時は「大事なもの」だけ読む(ニコ生版・会場とコメビュで共用)。
//
// りんくの決定(2026-11-04・YouTube 版と同じ): 混雑=読み上げ待ちが2件以上。そのとき大事でない
//   コメントは読まない(吹き出しは出す)。大事なもの=ギフト・ニコニ広告・配信者・その配信で初めての
//   コメント。モデレーターは今の受信データに印が無いので判定できない(印が来たら isModerator で足す)。
//   性能は GPU に頼らず、ふつうの CPU の PC を基準にする=「速くする」より「どれを読むか選ぶ」。
//
// DOM/chrome.* 非依存の純関数(テスト対象)。

import { parseGiftCommentText, parseNicoadCommentText } from './parseGiftComment.js';

/** 読み上げ待ちがこの件数以上なら「混雑」。 */
export const VOICE_BUSY_QUEUE_MIN = 2;

/** 「その配信で初めて」を覚える人数の上限(長い配信でも記憶を有界にする)。 */
export const VOICE_FIRST_SPEAKER_CAP = 20000;

/**
 * @typedef {'gift'|'ad'|'broadcaster'|'moderator'|'first'|''} VoiceImportance
 */

/**
 * 1件が「大事なもの」かを判定する。大事でなければ ''。
 * @param {{
 *   kind?: unknown,
 *   text?: unknown,
 *   userId?: unknown,
 *   isModerator?: unknown,
 *   broadcasterUid?: unknown,
 *   firstInLive?: boolean
 * }} input
 * @returns {VoiceImportance}
 */
export function classifyVoiceImportance(input) {
  const o = input && typeof input === 'object' ? input : {};
  if (o.kind === 'gift') return 'gift';
  const text = typeof o.text === 'string' ? o.text : '';
  if (text) {
    // ニコ生はギフト・広告もコメント本文で届く(「○○さんがギフト「…（10pt）」を贈りました」等)。
    if (parseGiftCommentText(text)) return 'gift';
    if (parseNicoadCommentText(text)) return 'ad';
  }
  const uid = String(o.userId ?? '').trim();
  const caster = String(o.broadcasterUid ?? '').trim();
  if (uid && caster && uid === caster) return 'broadcaster';
  if (o.isModerator === true) return 'moderator';
  if (o.firstInLive === true) return 'first';
  return '';
}

/**
 * 混雑していて、かつ大事でないなら読まない。
 * @param {{ queueLength?: unknown, importance?: VoiceImportance }} input
 * @returns {boolean} true=読まない(吹き出しだけ)
 */
export function shouldSkipVoiceWhenBusy(input) {
  const n = Number(input?.queueLength);
  const busy = Number.isFinite(n) && n >= VOICE_BUSY_QUEUE_MIN;
  return busy && !input?.importance;
}

/**
 * ギフト・広告は待ち行列の前に入れる(従来の kind:'gift' と同じ扱い)。配信者・初コメは順番を変えない。
 * @param {VoiceImportance} importance
 * @returns {'high'|'normal'}
 */
export function voicePriorityForImportance(importance) {
  return importance === 'gift' || importance === 'ad' ? 'high' : 'normal';
}

/** @returns {{ liveId: string, seen: Set<string> }} */
export function createVoiceFirstSpeakerState() {
  return { liveId: '', seen: new Set() };
}

/**
 * この配信でその人の初めてのコメントかを返し、覚える(state を書き換える)。
 * 配信が変わったら数え直す。人のキーが空なら「初めて」とは言わない。
 * @param {{ liveId: string, seen: Set<string> }} state
 * @param {unknown} liveId
 * @param {unknown} userKey
 * @returns {boolean}
 */
export function noteVoiceSpeakerInLive(state, liveId, userKey) {
  if (!state || !(state.seen instanceof Set)) return false;
  const lv = String(liveId ?? '').trim().toLowerCase();
  if (lv !== state.liveId) {
    state.liveId = lv;
    state.seen.clear();
  }
  const key = String(userKey ?? '').trim();
  if (!key) return false;
  if (state.seen.has(key)) return false;
  if (state.seen.size >= VOICE_FIRST_SPEAKER_CAP) {
    // 古い順に1件忘れる(Set は入れた順)。
    const oldest = state.seen.values().next().value;
    if (oldest !== undefined) state.seen.delete(oldest);
  }
  state.seen.add(key);
  return true;
}
