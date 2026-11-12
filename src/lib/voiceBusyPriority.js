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
 * 2026-11-12(会議の第3段): 混雑中の「大事でない」コメントの点数。
 *   視聴者委員の決まり: 課金・ランキング・常連は足さない(ギフトは既に必ず読むので二重の優遇になる)。
 *   上げるのは「配信者への質問」と「この配信でまだ一度も声で読まれていない人」だけ。
 * @param {{ text?: unknown, neverVoiced?: boolean }} input
 * @returns {number}
 */
export function scoreVoiceWhenBusy(input) {
  let score = 0;
  if (isVoiceQuestionText(input?.text)) score += VOICE_BUSY_SCORE_QUESTION;
  if (input?.neverVoiced === true) score += VOICE_BUSY_SCORE_NEVER_VOICED;
  return score;
}

/** 質問の点。 */
export const VOICE_BUSY_SCORE_QUESTION = 2;
/** まだ一度も読まれていない人の点。 */
export const VOICE_BUSY_SCORE_NEVER_VOICED = 2;
/** 待ちがこの件数以上なら、両方そろった件(4点)だけ読む。それ未満の混雑なら2点で読む。 */
export const VOICE_BUSY_DEEP_QUEUE_MIN = 4;

/**
 * 配信者に聞いている文か(？で終わる・「〜ですか」等で終わる)。
 * @param {unknown} text
 * @returns {boolean}
 */
export function isVoiceQuestionText(text) {
  if (typeof text !== 'string') return false;
  const t = text.trim().replace(/[\s\u3000!！。、…~〜wｗ笑]+$/u, '');
  if (!t) return false;
  if (/[?？]$/u.test(text.trim().replace(/[\s\u3000]+$/u, ''))) return true;
  return /(ですか|ますか|でしょうか|ません?か|かな|なに|何|なんで|どこ|いつ|だれ|誰|どう|どれ)$/u.test(t);
}

/**
 * 混雑していて、かつ大事でないなら読まない。
 *   2026-11-12: score(scoreVoiceWhenBusy)を渡すと、混雑が浅い間(待ち2〜3件)は2点以上、
 *   深い間(待ち4件以上)は4点以上の件も読む。score を渡さなければ従来どおり。読む順番は変えない。
 * @param {{ queueLength?: unknown, importance?: VoiceImportance, score?: unknown }} input
 * @returns {boolean} true=読まない(吹き出しだけ)
 */
export function shouldSkipVoiceWhenBusy(input) {
  const n = Number(input?.queueLength);
  const busy = Number.isFinite(n) && n >= VOICE_BUSY_QUEUE_MIN;
  if (!busy || input?.importance) return false;
  const score = Number(input?.score);
  if (!Number.isFinite(score) || score <= 0) return true;
  const need = n >= VOICE_BUSY_DEEP_QUEUE_MIN
    ? VOICE_BUSY_SCORE_QUESTION + VOICE_BUSY_SCORE_NEVER_VOICED
    : Math.min(VOICE_BUSY_SCORE_QUESTION, VOICE_BUSY_SCORE_NEVER_VOICED);
  return score < need;
}

/** @returns {{ liveId: string, voiced: Set<string> }} */
export function createVoiceVoicedState() {
  return { liveId: '', voiced: new Set() };
}

/**
 * この配信で声で読まれた人を覚える(配信が変わったら数え直す・人数は有界)。
 * @param {{ liveId: string, voiced: Set<string> }} state
 * @param {unknown} liveId
 * @param {unknown} userKey
 */
export function noteVoiceVoiced(state, liveId, userKey) {
  if (!state || !(state.voiced instanceof Set)) return;
  syncVoicedLive(state, liveId);
  const key = String(userKey ?? '').trim();
  if (!key || state.voiced.has(key)) return;
  if (state.voiced.size >= VOICE_FIRST_SPEAKER_CAP) {
    const oldest = state.voiced.values().next().value;
    if (oldest !== undefined) state.voiced.delete(oldest);
  }
  state.voiced.add(key);
}

/**
 * この配信でまだ一度も声で読まれていない人か。
 * @param {{ liveId: string, voiced: Set<string> }} state
 * @param {unknown} liveId
 * @param {unknown} userKey
 * @returns {boolean}
 */
export function isVoiceNeverVoiced(state, liveId, userKey) {
  if (!state || !(state.voiced instanceof Set)) return false;
  syncVoicedLive(state, liveId);
  const key = String(userKey ?? '').trim();
  return !!key && !state.voiced.has(key);
}

/** @param {{ liveId: string, voiced: Set<string> }} state @param {unknown} liveId */
function syncVoicedLive(state, liveId) {
  const lv = String(liveId ?? '').trim().toLowerCase();
  if (lv && lv !== state.liveId) {
    state.liveId = lv;
    state.voiced.clear();
  }
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
