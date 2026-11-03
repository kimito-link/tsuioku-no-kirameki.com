// background-entry.js — YouTube Live コメントのローカル記録・読み上げキュー管理 Service Worker
/* global chrome, URL */

import {
  YT_VOICE_MODES,
  YT_DEFAULT_STYLE_IDS,
  resolveYtVoiceForChannel,
  enqueueYtVoiceItem,
} from '../../src/lib/youtube/ytVoiceQueue.js';

const MAX_ITEMS_PER_STREAM = 1500;
const STORAGE_KEYS = Object.freeze({
  STREAMS: 'yt_streams',
  ACTIVE_VIDEO_ID: 'yt_active_video_id',
  VOICE_SETTINGS: 'yt_voice_settings',
  VOICE_ASSIGNMENTS: 'yt_voice_assignments',
  VOICE_QUEUE: 'yt_voice_queue',
  VOICE_STATE: 'yt_voice_state',
});

const DEFAULT_VOICE_SETTINGS = Object.freeze({
  enabled: true,
  mode: YT_VOICE_MODES.ALL,
  broadcasterNameOverride: '',
  availableStyleIds: Array.from(YT_DEFAULT_STYLE_IDS),
});

/** 並列メッセージによる storage 上書き競合を防ぐ直列化キュー */
let storageJobChain = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function runSerialized(fn) {
  const next = storageJobChain.then(fn, fn);
  storageJobChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * 送信元タブ URL から videoId (`v=`) を抽出するフォールバック。
 * @param {any} sender
 * @returns {string}
 */
function extractVideoIdFromSender(sender) {
  try {
    const tabUrl = sender?.tab?.url || '';
    if (!tabUrl) return '';
    const u = new URL(tabUrl);
    return (u.searchParams.get('v') || '').trim();
  } catch {
    return '';
  }
}

/**
 * ストリームのアイテム配列が上限を超えた場合、応援イベント（スパチャ等）を保護しつつ古い通常コメントを間引く。
 * @param {any[]} items
 * @returns {any[]}
 */
function trimStreamItems(items) {
  if (!Array.isArray(items) || items.length <= MAX_ITEMS_PER_STREAM) {
    return items || [];
  }
  const excess = items.length - MAX_ITEMS_PER_STREAM;
  let removed = 0;
  return items.filter((item) => {
    if (removed >= excess) return true;
    const isSupport =
      item.kind === 'superchat' ||
      item.kind === 'sticker' ||
      item.kind === 'membership' ||
      item.kind === 'membership_gift';
    if (isSupport) return true;
    removed += 1;
    return false;
  });
}

function setupSidePanelBehavior() {
  try {
    if (chrome?.sidePanel?.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

setupSidePanelBehavior();
chrome.runtime.onInstalled.addListener(() => {
  setupSidePanelBehavior();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'YT_STREAM_META') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const videoId = String(payload.videoId || extractVideoIdFromSender(sender) || '').trim();
      if (!videoId) return { ok: false };

      const data = await chrome.storage.local.get([
        STORAGE_KEYS.STREAMS,
        STORAGE_KEYS.ACTIVE_VIDEO_ID,
      ]);
      const streams = data[STORAGE_KEYS.STREAMS] || {};
      const current = streams[videoId] || {
        videoId,
        title: '',
        broadcasterName: '',
        broadcasterChannelId: '',
        chatFilterLabel: '',
        items: [],
        updatedAt: Date.now(),
      };

      if (payload.title) current.title = String(payload.title);
      if (payload.broadcasterName) current.broadcasterName = String(payload.broadcasterName);
      if (payload.broadcasterChannelId) {
        current.broadcasterChannelId = String(payload.broadcasterChannelId);
      }
      current.updatedAt = Date.now();
      streams[videoId] = current;

      await chrome.storage.local.set({
        [STORAGE_KEYS.STREAMS]: streams,
        [STORAGE_KEYS.ACTIVE_VIDEO_ID]: videoId,
      });
      return { ok: true, videoId };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_CHAT_ITEMS') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const videoId =
        String(payload.videoId || extractVideoIdFromSender(sender) || '').trim() || 'live_default';
      const incoming = Array.isArray(payload.items) ? payload.items : [];
      const chatFilterLabel = String(payload.chatFilterLabel || '').trim();

      const data = await chrome.storage.local.get([
        STORAGE_KEYS.STREAMS,
        STORAGE_KEYS.ACTIVE_VIDEO_ID,
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_ASSIGNMENTS,
        STORAGE_KEYS.VOICE_QUEUE,
        STORAGE_KEYS.VOICE_STATE,
      ]);

      const streams = data[STORAGE_KEYS.STREAMS] || {};
      const stream = streams[videoId] || {
        videoId,
        title: '',
        broadcasterName: '',
        broadcasterChannelId: '',
        chatFilterLabel: '',
        items: [],
        updatedAt: Date.now(),
      };

      if (chatFilterLabel) {
        stream.chatFilterLabel = chatFilterLabel;
      }

      const settings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      let assignments = data[STORAGE_KEYS.VOICE_ASSIGNMENTS] || {};
      let voiceQueue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      let voiceState = data[STORAGE_KEYS.VOICE_STATE] || {
        effectiveMode: settings.mode,
        autoSwitched: false,
        updatedAt: Date.now(),
      };

      const existingIds = new Set(stream.items.map((x) => x.id));
      const broadcasterName =
        String(settings.broadcasterNameOverride || '').trim() ||
        String(stream.broadcasterName || '').trim();

      let addedCount = 0;
      for (const rawItem of incoming) {
        if (!rawItem || !rawItem.id || existingIds.has(rawItem.id)) continue;
        existingIds.add(rawItem.id);

        // 投稿者ごとに決定論的な VOICEVOX styleId を割り当てて記録する
        const voice = resolveYtVoiceForChannel(rawItem.channelId || rawItem.name || 'anonymous', {
          availableStyleIds: settings.availableStyleIds,
          assignments,
        });
        assignments = voice.assignments;

        const enrichedItem = {
          ...rawItem,
          voiceUserKey: voice.userKey,
          voiceStyleId: voice.styleId,
          pitchOffset: voice.pitchOffset,
          speedOffset: voice.speedOffset,
          recordedAt: Date.now(),
        };
        stream.items.push(enrichedItem);
        addedCount += 1;

        if (settings.enabled) {
          const enq = enqueueYtVoiceItem(voiceQueue, enrichedItem, {
            mode: settings.mode,
            broadcasterName,
            availableStyleIds: settings.availableStyleIds,
            assignments,
          });
          voiceQueue = enq.queue;
          assignments = enq.assignments;
          voiceState = {
            effectiveMode: enq.effectiveMode,
            autoSwitched: enq.autoSwitched,
            updatedAt: Date.now(),
          };
        }
      }

      stream.items = trimStreamItems(stream.items);
      stream.updatedAt = Date.now();
      streams[videoId] = stream;

      const updates = {
        [STORAGE_KEYS.STREAMS]: streams,
        [STORAGE_KEYS.VOICE_ASSIGNMENTS]: assignments,
        [STORAGE_KEYS.VOICE_QUEUE]: voiceQueue,
        [STORAGE_KEYS.VOICE_STATE]: voiceState,
      };
      if (videoId !== 'live_default' || !data[STORAGE_KEYS.ACTIVE_VIDEO_ID]) {
        updates[STORAGE_KEYS.ACTIVE_VIDEO_ID] = videoId;
      }

      await chrome.storage.local.set(updates);
      return { ok: true, addedCount, totalCount: stream.items.length, videoId };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_SHIFT_VOICE_QUEUE') {
    runSerialized(async () => {
      const data = await chrome.storage.local.get([STORAGE_KEYS.VOICE_QUEUE]);
      const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      if (queue.length === 0) {
        return { ok: true, entry: null, remaining: 0 };
      }
      const [entry, ...rest] = queue;
      await chrome.storage.local.set({ [STORAGE_KEYS.VOICE_QUEUE]: rest });
      return { ok: true, entry, remaining: rest.length };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_UPDATE_VOICE_SETTINGS') {
    runSerialized(async () => {
      const patch = message.payload || {};
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_QUEUE,
      ]);
      const current = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      const next = {
        ...current,
        ...patch,
      };
      const updates = {
        [STORAGE_KEYS.VOICE_SETTINGS]: next,
        [STORAGE_KEYS.VOICE_STATE]: {
          effectiveMode: next.mode,
          autoSwitched: false,
          updatedAt: Date.now(),
        },
      };
      if (next.enabled === false) {
        updates[STORAGE_KEYS.VOICE_QUEUE] = [];
      }
      await chrome.storage.local.set(updates);
      return { ok: true, settings: next };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_CLEAR_VOICE_QUEUE') {
    runSerialized(async () => {
      await chrome.storage.local.set({ [STORAGE_KEYS.VOICE_QUEUE]: [] });
      return { ok: true };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});
