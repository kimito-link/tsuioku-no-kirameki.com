// background-entry.js — YouTube Live コメントの IndexedDB 全件記録・配信要約・読み上げキュー管理 Service Worker
/* global chrome, URL */

import {
  YT_VOICE_MODES,
  YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD,
  YT_DEFAULT_STYLE_IDS,
  resolveYtVoiceForChannel,
  enqueueYtVoiceItem,
} from '../../src/lib/youtube/ytVoiceQueue.js';
import { mergeYtStreamSummary } from '../../src/lib/youtube/ytStreamStorePolicy.js';
import { appendYtStreamCommentsIdb } from './ytIdbStore.js';

const STORAGE_KEYS = Object.freeze({
  STREAM_SUMMARIES: 'yt_stream_summaries',
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

/** 並列メッセージによる storage / IndexedDB 競合を防ぐ直列化キュー */
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
        STORAGE_KEYS.STREAM_SUMMARIES,
        STORAGE_KEYS.ACTIVE_VIDEO_ID,
      ]);
      const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
      summaries[videoId] = mergeYtStreamSummary(
        summaries[videoId],
        {
          videoId,
          title: payload.title ? String(payload.title) : undefined,
          broadcasterName: payload.broadcasterName ? String(payload.broadcasterName) : undefined,
          broadcasterChannelId: payload.broadcasterChannelId
            ? String(payload.broadcasterChannelId)
            : undefined,
        },
        Date.now(),
      );

      await chrome.storage.local.set({
        [STORAGE_KEYS.STREAM_SUMMARIES]: summaries,
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
        STORAGE_KEYS.STREAM_SUMMARIES,
        STORAGE_KEYS.ACTIVE_VIDEO_ID,
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_ASSIGNMENTS,
        STORAGE_KEYS.VOICE_QUEUE,
        STORAGE_KEYS.VOICE_STATE,
      ]);

      const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
      const prevSummary = summaries[videoId] || null;

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

      const broadcasterName =
        String(settings.broadcasterNameOverride || '').trim() ||
        String(prevSummary?.broadcasterName || '').trim();

      // 各コメントに投稿者ごとの決定論的な VOICEVOX styleId を付与
      const enrichedIncoming = [];
      for (const rawItem of incoming) {
        if (!rawItem || !rawItem.id) continue;
        const voice = resolveYtVoiceForChannel(rawItem.channelId || rawItem.name || 'anonymous', {
          availableStyleIds: settings.availableStyleIds,
          assignments,
        });
        assignments = voice.assignments;

        enrichedIncoming.push({
          ...rawItem,
          voiceUserKey: voice.userKey,
          voiceStyleId: voice.styleId,
          pitchOffset: voice.pitchOffset,
          speedOffset: voice.speedOffset,
          recordedAt: Date.now(),
        });
      }

      // IndexedDB へ全件保存（間引きなし・重複 pk のみスキップ）
      const idbResult = await appendYtStreamCommentsIdb(videoId, enrichedIncoming);

      // 新規追加されたコメントだけを読み上げキューへ投入
      if (settings.enabled) {
        for (const newItem of idbResult.newlyAdded) {
          const enq = enqueueYtVoiceItem(voiceQueue, newItem, {
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

      // chrome.storage.local にはコメント配列を置かず、配信一覧の要約だけを保存する
      summaries[videoId] = mergeYtStreamSummary(
        prevSummary,
        {
          videoId,
          chatFilterLabel: chatFilterLabel || undefined,
          itemCount: idbResult.totalCount,
        },
        Date.now(),
      );

      const updates = {
        [STORAGE_KEYS.STREAM_SUMMARIES]: summaries,
        [STORAGE_KEYS.VOICE_ASSIGNMENTS]: assignments,
        [STORAGE_KEYS.VOICE_QUEUE]: voiceQueue,
        [STORAGE_KEYS.VOICE_STATE]: voiceState,
      };
      if (videoId !== 'live_default' || !data[STORAGE_KEYS.ACTIVE_VIDEO_ID]) {
        updates[STORAGE_KEYS.ACTIVE_VIDEO_ID] = videoId;
      }

      await chrome.storage.local.set(updates);
      return {
        ok: true,
        addedCount: idbResult.newlyAdded.length,
        totalCount: idbResult.totalCount,
        videoId,
      };
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
      const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      const nextQueue = next.enabled === false ? [] : queue;
      const isOverThreshold =
        next.enabled !== false &&
        next.mode === YT_VOICE_MODES.ALL &&
        nextQueue.length >= YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;

      const updates = {
        [STORAGE_KEYS.VOICE_SETTINGS]: next,
        [STORAGE_KEYS.VOICE_STATE]: {
          effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : next.mode,
          autoSwitched: isOverThreshold,
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
      const data = await chrome.storage.local.get([STORAGE_KEYS.VOICE_SETTINGS]);
      const settings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_QUEUE]: [],
        [STORAGE_KEYS.VOICE_STATE]: {
          effectiveMode: settings.mode,
          autoSwitched: false,
          updatedAt: Date.now(),
        },
      });
      return { ok: true };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});
