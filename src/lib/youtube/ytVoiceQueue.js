// ytVoiceQueue.js — YouTube Live コメント読み上げキュー・選んで読む自動切替・声割り当て（純関数）
// @layer L0 — 純粋計算（副作用・ブラウザ API なし）

import { resolveVoiceForUser } from '../voiceAssignment.js';
import { VOICE_CAPPED_STYLE_IDS, VOICE_NARROW_STYLE_IDS } from '../voiceNarrowing.js';

export const YT_VOICE_MODES = Object.freeze({
  ALL: 'all',
  SELECT: 'select',
});

/**
 * キュー長がこの件数に達したら「全部読む」から自動で「選んで読む」へ切り替えるしきい値。
 * 実測（遅い配信 ~6件/分、速い配信 ~60件/分）に基づき、1発話約3秒×8件＝約24秒分の滞留で自動切替。
 */
export const YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD = 8;

/** キューの上限長（これを超える古い通常アイテムは破棄して遅延蓄積を防ぐ） */
export const YT_VOICE_MAX_QUEUE_LENGTH = 25;

export const YT_DEFAULT_STYLE_IDS = VOICE_CAPPED_STYLE_IDS;
export const YT_SELECT_STYLE_IDS = VOICE_NARROW_STYLE_IDS;

/**
 * YouTube の channelId をニコ生の uid と衝突しない userKey (`yt:<channelId>`) に変換する。
 * @param {string} channelId
 * @returns {string}
 */
export function buildYtVoiceUserKey(channelId) {
  const clean = String(channelId || '').trim() || 'anonymous';
  return clean.startsWith('yt:') ? clean : `yt:${clean}`;
}

/**
 * チャンネルIDに対して決定論的に VOICEVOX styleId を割り当てる（同じ人には毎回同じ声）。
 *
 * @param {string} channelId
 * @param {{
 *   availableStyleIds?: number[],
 *   assignments?: Record<string, any>,
 *   now?: number
 * }} [opts]
 * @returns {{
 *   userKey: string,
 *   styleId: number,
 *   pitchOffset: number,
 *   speedOffset: number,
 *   assignments: Record<string, any>,
 *   reused: boolean
 * }}
 */
export function resolveYtVoiceForChannel(channelId, opts = {}) {
  const userKey = buildYtVoiceUserKey(channelId);
  const availableStyleIds =
    Array.isArray(opts.availableStyleIds) && opts.availableStyleIds.length > 0
      ? opts.availableStyleIds
      : Array.from(YT_DEFAULT_STYLE_IDS);

  const currentMap =
    opts.assignments && typeof opts.assignments === 'object' ? opts.assignments : {};
  const reused = Object.prototype.hasOwnProperty.call(currentMap, userKey);
  const res = resolveVoiceForUser(userKey, currentMap, availableStyleIds);

  const nextAssignments = reused
    ? currentMap
    : {
        ...currentMap,
        [userKey]: {
          styleId: res.styleId,
          pitchOffset: res.pitchOffset,
          speedOffset: res.speedOffset,
        },
      };

  return {
    userKey,
    styleId: res.styleId,
    pitchOffset: res.pitchOffset,
    speedOffset: res.speedOffset,
    assignments: nextAssignments,
    reused,
  };
}

/**
 * コメントを現在のモード（`all` / `select`）で読み上げるべきか判定する。
 *
 * - `all`: 本文があるコメント・スパチャ・ステッカー・メンバー通知をすべて読む
 * - `select`: スパチャ・ステッカー・メンバー加入・ギフト・メンバー/モデレーター/配信者バッジ付き・
 *   または本文に配信者名（`broadcasterName`）を含むコメントのみ読む
 *
 * @param {any} item
 * @param {{
 *   mode?: 'all' | 'select',
 *   broadcasterName?: string
 * }} [opts]
 * @returns {boolean}
 */
export function shouldReadYtComment(item, opts = {}) {
  if (!item || typeof item !== 'object') return false;
  const kind = String(item.kind || 'text').toLowerCase();
  const text = String(item.text || '').trim();
  const isSupportEvent =
    kind === 'superchat' ||
    kind === 'sticker' ||
    kind === 'membership' ||
    kind === 'membership_gift';

  if (!text && !isSupportEvent) return false;

  const mode = opts.mode === YT_VOICE_MODES.SELECT ? YT_VOICE_MODES.SELECT : YT_VOICE_MODES.ALL;
  if (mode === YT_VOICE_MODES.ALL) {
    return true;
  }

  // select モード判定
  if (isSupportEvent) return true;

  const badges = Array.isArray(item.badges)
    ? item.badges.map((/** @type {any} */ b) => String(b || '').toLowerCase())
    : [];
  if (badges.includes('owner') || badges.includes('moderator') || badges.includes('member')) {
    return true;
  }

  const broadcasterName = String(opts.broadcasterName || '').trim();
  if (broadcasterName && text.toLowerCase().includes(broadcasterName.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * 読み上げ用の発話テキストを組み立てる（長문は 100 文字で丸める）。
 * @param {any} item
 * @returns {string}
 */
export function formatYtSpeechText(item) {
  if (!item || typeof item !== 'object') return '';
  const kind = String(item.kind || 'text').toLowerCase();
  const name = String(item.name || '').replace(/^@/, '').trim();
  const rawText = String(item.text || '')
    .replace(/https?:\/\/\S+/g, 'URL')
    .replace(/\s+/g, ' ')
    .trim();
  const body = rawText.length > 100 ? `${rawText.slice(0, 100)}、以下略` : rawText;

  if (kind === 'superchat') {
    const prefix = name ? `${name}さん、スーパーチャットありがとうございます。` : 'スーパーチャットありがとうございます。';
    return body ? `${prefix}${body}` : prefix;
  }
  if (kind === 'sticker') {
    return name ? `${name}さん、スーパーステッカーありがとうございます。` : 'スーパーステッカーありがとうございます。';
  }
  if (kind === 'membership') {
    return name ? `${name}さん、メンバー加入ありがとうございます。${body}` : body || 'メンバー加入ありがとうございます。';
  }
  if (kind === 'membership_gift') {
    return name ? `${name}さん、メンバーシップギフトありがとうございます。` : body || 'メンバーシップギフトありがとうございます。';
  }
  return body;
}

/**
 * 読み上げキューへコメント1件を投入する。
 * キュー長が `autoSelectThreshold` 以上の場合は自動で `select`（選んで読む）モードへ切り替える。
 *
 * @param {any[]} queue
 * @param {any} item
 * @param {{
 *   mode?: 'all' | 'select',
 *   broadcasterName?: string,
 *   availableStyleIds?: number[],
 *   assignments?: Record<string, any>,
 *   autoSelectThreshold?: number,
 *   now?: number
 * }} [opts]
 * @returns {{
 *   queue: any[],
 *   enqueued: boolean,
 *   entry: any | null,
 *   effectiveMode: 'all' | 'select',
 *   autoSwitched: boolean,
 *   assignments: Record<string, any>
 * }}
 */
export function enqueueYtVoiceItem(queue, item, opts = {}) {
  const safeQueue = Array.isArray(queue) ? queue.slice() : [];
  const requestedMode =
    opts.mode === YT_VOICE_MODES.SELECT ? YT_VOICE_MODES.SELECT : YT_VOICE_MODES.ALL;
  const threshold =
    typeof opts.autoSelectThreshold === 'number' && opts.autoSelectThreshold > 0
      ? opts.autoSelectThreshold
      : YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;

  const autoSwitched = requestedMode === YT_VOICE_MODES.ALL && safeQueue.length >= threshold;
  const effectiveMode = autoSwitched ? YT_VOICE_MODES.SELECT : requestedMode;
  const currentAssignments = opts.assignments || {};

  if (!shouldReadYtComment(item, { mode: effectiveMode, broadcasterName: opts.broadcasterName })) {
    return {
      queue: safeQueue,
      enqueued: false,
      entry: null,
      effectiveMode,
      autoSwitched,
      assignments: currentAssignments,
    };
  }

  const speechText = formatYtSpeechText(item);
  if (!speechText) {
    return {
      queue: safeQueue,
      enqueued: false,
      entry: null,
      effectiveMode,
      autoSwitched,
      assignments: currentAssignments,
    };
  }

  const channelKeySource = String(item?.channelId || item?.name || 'anonymous');
  const voice = resolveYtVoiceForChannel(channelKeySource, {
    availableStyleIds: opts.availableStyleIds,
    assignments: currentAssignments,
    now: opts.now,
  });

  const entry = {
    id: String(item.id || `voice-${Date.now()}`),
    userKey: voice.userKey,
    channelId: String(item.channelId || ''),
    name: String(item.name || ''),
    text: speechText,
    styleId: voice.styleId,
    kind: String(item.kind || 'text'),
    ts: Number(item.ts || Date.now()),
  };

  const nextQueue = [...safeQueue, entry];
  if (nextQueue.length > YT_VOICE_MAX_QUEUE_LENGTH) {
    nextQueue.splice(0, nextQueue.length - YT_VOICE_MAX_QUEUE_LENGTH);
  }

  return {
    queue: nextQueue,
    enqueued: true,
    entry,
    effectiveMode,
    autoSwitched,
    assignments: voice.assignments,
  };
}
