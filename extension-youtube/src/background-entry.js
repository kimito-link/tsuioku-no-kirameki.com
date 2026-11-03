// background-entry.js — YouTube Live コメントの IndexedDB 全件記録・配信要約・Offscreen 読み上げ管理 Service Worker
/* global chrome, setTimeout, clearTimeout */

import {
  VOICEVOX_BASE_URL,
  probeVoicevoxAlive,
  listVoicevoxStyleIds,
} from '../../src/lib/voicevoxClient.js';
import {
  YT_VOICE_MODES,
  YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD,
  YT_DEFAULT_STYLE_IDS,
  resolveYtVoiceForChannel,
  enqueueYtVoiceItem,
} from '../../src/lib/youtube/ytVoiceQueue.js';
import { mergeYtStreamSummary } from '../../src/lib/youtube/ytStreamStorePolicy.js';
import { appendYtStreamCommentsIdb } from './ytIdbStore.js';
import { parseYtVideoIdFromUrl } from '../../src/lib/youtube/ytPageMeta.js';
import { pickJapaneseVoices, lightVoiceToneFor } from '../../src/lib/voiceLightFallback.js';

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
  /** VOICEVOX が追いつかない間 PC の声で読むか: 'auto'(既定) / 'off'(VOICEVOX だけで読む) */
  lightVoice: 'auto',
  availableStyleIds: Array.from(YT_DEFAULT_STYLE_IDS),
});

/** 並列メッセージによる storage / IndexedDB 競合を防ぐ直列化キュー */
let storageJobChain = Promise.resolve();

/** @type {Promise<void> | null} */
let creatingOffscreenPromise = null;

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
 * サイドパネルを閉じていても VOICEVOX 再生を継続するための Offscreen Document を起動・維持する。
 * @returns {Promise<boolean>}
 */
async function ensureOffscreenDocument() {
  try {
    if (!chrome?.offscreen?.createDocument) return false;
    if (chrome.runtime?.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      if (Array.isArray(contexts) && contexts.length > 0) {
        return true;
      }
    } else if (typeof chrome.offscreen.hasDocument === 'function') {
      const has = await chrome.offscreen.hasDocument();
      if (has) return true;
    }

    if (!creatingOffscreenPromise) {
      creatingOffscreenPromise = chrome.offscreen
        .createDocument({
          url: 'offscreen.html',
          reasons: ['AUDIO_PLAYBACK'],
          justification:
            'サイドパネルを閉じていても VOICEVOX によるチャット読み上げ音声を再生し続けるため',
        })
        .catch((err) => {
          const msg = String(err?.message || err || '');
          if (!msg.includes('Only a single offscreen')) {
            throw err;
          }
        })
        .finally(() => {
          creatingOffscreenPromise = null;
        });
    }
    await creatingOffscreenPromise;
    return true;
  } catch {
    return false;
  }
}

/**
 * Offscreen Document へ読み上げキュー消化の合図を送る。
 */
async function nudgeOffscreenDrain() {
  const ready = await ensureOffscreenDocument();
  if (!ready) return;
  try {
    chrome.runtime.sendMessage({ type: 'YT_OFFSCREEN_DRAIN' }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // ignore
  }
}

/**
 * 送信元タブ URL から videoId (`v=`) を抽出するフォールバック。
 * @param {any} sender
 * @returns {string}
 */
function extractVideoIdFromSender(sender) {
  return parseYtVideoIdFromUrl(String(sender?.url || '')) || parseYtVideoIdFromUrl(String(sender?.tab?.url || ''));
}

/**
 * PC に入っている日本語の声(chrome.tts・Windows では Haruka / Ayumi / Ichiro など)。
 * @returns {Promise<{ name: string, lang: string }[]>}
 */
async function getJapaneseTtsVoices() {
  if (!chrome?.tts?.getVoices) return [];
  const raw = await new Promise((resolve) => {
    try {
      chrome.tts.getVoices((vs) => resolve(Array.isArray(vs) ? vs : []));
    } catch {
      resolve([]);
    }
  });
  return pickJapaneseVoices(
    /** @type {any[]} */ (raw).map((v) => ({
      name: String(v.voiceName || ''),
      voiceURI: String(v.voiceName || ''),
      lang: String(v.lang || ''),
      localService: v.remote !== true,
    })),
  );
}

/**
 * 1件を PC の声で読み、読み終わる(か打ち切る)まで待つ。人ごとの声・高さ・速さは lightVoiceToneFor。
 * @param {string} text
 * @param {string} userKey
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function speakLightTts(text, userKey) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, reason: 'empty' };
  const voices = await getJapaneseTtsVoices();
  if (!voices.length) return { ok: false, reason: 'no-voice' };
  const tone = lightVoiceToneFor(userKey, voices.length);
  const voice = voices[tone.voiceIndex % voices.length];
  return new Promise((resolve) => {
    let started = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: started, reason: started ? '' : 'not-started' });
    };
    const timer = setTimeout(() => {
      try {
        chrome.tts.stop();
      } catch {
        // no-op
      }
      finish();
    }, t.length * 400 + 5000);
    try {
      chrome.tts.speak(
        t,
        {
          voiceName: voice.name,
          lang: voice.lang || 'ja-JP',
          pitch: tone.pitch,
          rate: tone.rate,
          enqueue: false,
          onEvent: (ev) => {
            if (ev.type === 'start') started = true;
            else if (['end', 'interrupted', 'cancelled', 'error'].includes(ev.type)) {
              if (ev.type === 'end') started = true;
              finish();
            }
          },
        },
        () => {
          if (chrome.runtime.lastError) finish();
        },
      );
    } catch {
      finish();
    }
  });
}

/**
 * サイドパネルのコメントを、その配信を開いているタブのチャット欄へ渡して送信させる。
 * @param {string} videoId
 * @param {string} text
 */
async function relayCommentToChatFrame(videoId, text) {
  const tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*'] });
  const scored = tabs
    .map((t) => {
      const vid = parseYtVideoIdFromUrl(String(t.url || ''));
      let score = 0;
      if (videoId && vid === videoId) score += 10;
      if (String(t.url || '').includes('/live_chat')) score += 2;
      if (t.active) score += 1;
      return { t, score };
    })
    .filter((x) => x.score >= (videoId ? 10 : 1))
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { ok: false, reason: 'no-tab' };
  let last = { ok: false, reason: 'no-chat-frame' };
  for (const { t } of scored) {
    if (typeof t.id !== 'number') continue;
    try {
      const res = await chrome.tabs.sendMessage(t.id, { type: 'YT_SEND_COMMENT_TO_FRAME', videoId, text });
      if (res && res.ok) return res;
      if (res) last = res;
    } catch {
      // そのタブにチャット欄が無い
    }
  }
  return last;
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
ensureOffscreenDocument();
/**
 * 拡張を更新すると、開いている YouTube のタブの中の古いプログラム(content script)は切れて、
 * 記録も人数も黙って止まる(2026-11-03 実機: 記録 975 のまま30分止まった)。
 * ニコ生版の reloadExistingWatchTabs と同じく、更新のときに視聴タブを読み込み直す。
 * @param {string} reason
 */
async function reloadExistingYtWatchTabs(reason) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/watch*', 'https://www.youtube.com/live/*'] });
  } catch {
    return;
  }
  let reloaded = 0;
  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;
    try {
      await chrome.tabs.reload(tab.id);
      reloaded += 1;
    } catch {
      // no-op
    }
  }
  try {
    await chrome.storage.local.set({ yt_last_auto_tab_reload: { at: Date.now(), reason, tabCount: tabs.length, reloaded } });
  } catch {
    // no-op
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  setupSidePanelBehavior();
  ensureOffscreenDocument();
  if (details && details.reason === 'update') void reloadExistingYtWatchTabs('update');
});
chrome.runtime.onStartup?.addListener(() => {
  ensureOffscreenDocument();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'YT_CAPTURE_FRAME') {
    (async () => {
      const want = String(message.videoId || '');
      const tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*'] });
      const sorted = tabs
        .filter((t) => !String(t.url || '').includes('/live_chat'))
        .sort((a, b) => {
          const sa = (parseYtVideoIdFromUrl(String(a.url || '')) === want ? 10 : 0) + (a.active ? 1 : 0);
          const sb = (parseYtVideoIdFromUrl(String(b.url || '')) === want ? 10 : 0) + (b.active ? 1 : 0);
          return sb - sa;
        });
      for (const t of sorted) {
        if (typeof t.id !== 'number') continue;
        try {
          const res = await chrome.tabs.sendMessage(t.id, { type: 'YT_CAPTURE_FRAME_IN_PAGE' }, { frameId: 0 });
          if (res) return res;
        } catch {
          // そのタブに content script が無い
        }
      }
      return { ok: false, reason: 'no-tab' };
    })()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, reason: String(err) }));
    return true;
  }

  if (message.type === 'YT_SPEAK_LIGHT') {
    const payload = message.payload || {};
    speakLightTts(String(payload.text || ''), String(payload.userKey || ''))
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, reason: String(err) }));
    return true;
  }

  if (message.type === 'YT_REPORT_VOICE_ENGINE') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const data = await chrome.storage.local.get([STORAGE_KEYS.VOICE_STATE]);
      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      const overloaded = payload.overloaded === true;
      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_STATE]: {
          ...prevState,
          engineOverloaded: overloaded,
          lightVoiceActive: payload.lightActive === true,
          // 一度でも混雑したら「読み上げが遅い PC」として GPU の案内を出し続ける(ニコ生版 KEY_VOICE_WEAK_PC と同じ考え)
          weakPcSeen: prevState.weakPcSeen === true || overloaded,
          updatedAt: Date.now(),
        },
      });
      return { ok: true };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_SEND_COMMENT') {
    relayCommentToChatFrame(String(message.videoId || ''), String(message.text || ''))
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, reason: String(err) }));
    return true;
  }

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
          broadcasterIconUrl: payload.broadcasterIconUrl
            ? String(payload.broadcasterIconUrl)
            : undefined,
          concurrentViewers:
            typeof payload.concurrentViewers === 'number' ? payload.concurrentViewers : undefined,
          startedAt: typeof payload.startedAt === 'number' ? payload.startedAt : undefined,
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
      const prevVoiceState = data[STORAGE_KEYS.VOICE_STATE] || {};
      let voiceState = {
        ...prevVoiceState,
        effectiveMode: prevVoiceState.effectiveMode || settings.mode,
        autoSwitched: Boolean(prevVoiceState.autoSwitched),
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
      let enqueuedAny = false;
      if (settings.enabled) {
        for (const newItem of idbResult.newlyAdded) {
          const prevLen = voiceQueue.length;
          const enq = enqueueYtVoiceItem(voiceQueue, newItem, {
            mode: settings.mode,
            broadcasterName,
            availableStyleIds: settings.availableStyleIds,
            assignments,
          });
          voiceQueue = enq.queue;
          if (voiceQueue.length > prevLen) {
            enqueuedAny = true;
          }
          assignments = enq.assignments;
          voiceState = {
            ...voiceState,
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
      if (settings.enabled && (enqueuedAny || voiceQueue.length > 0)) {
        nudgeOffscreenDrain();
      }
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
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_QUEUE,
      ]);
      const settings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      if (!settings.enabled || queue.length === 0) {
        return { ok: true, entry: null, remaining: queue.length, enabled: Boolean(settings.enabled) };
      }
      const [entry, ...rest] = queue;
      await chrome.storage.local.set({ [STORAGE_KEYS.VOICE_QUEUE]: rest });
      return {
        ok: true,
        entry,
        remaining: rest.length,
        enabled: true,
        lightVoice: settings.lightVoice === 'off' ? 'off' : 'auto',
      };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_REPORT_VOICEVOX_STATUS') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const online = Boolean(payload.online);
      const reason = String(payload.reason || (online ? 'ok' : 'unreachable'));
      const availableStyleIds =
        Array.isArray(payload.availableStyleIds) && payload.availableStyleIds.length > 0
          ? payload.availableStyleIds
          : null;

      const data = await chrome.storage.local.get([
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_STATE,
        STORAGE_KEYS.VOICE_QUEUE,
      ]);
      const currentSettings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      if (availableStyleIds) {
        currentSettings.availableStyleIds = availableStyleIds;
      }
      const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      const isOverThreshold =
        currentSettings.enabled !== false &&
        currentSettings.mode === YT_VOICE_MODES.ALL &&
        queue.length >= YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;

      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      const nextState = {
        ...prevState,
        effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : currentSettings.mode,
        autoSwitched: isOverThreshold,
        voicevoxOnline: online,
        voicevoxReason: reason,
        availableStyleCount: currentSettings.availableStyleIds.length,
        voicevoxCheckedAt: Date.now(),
        updatedAt: Date.now(),
      };

      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_SETTINGS]: currentSettings,
        [STORAGE_KEYS.VOICE_STATE]: nextState,
      });
      return { ok: true, state: nextState };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_REPORT_VOICE_SPOKEN') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const data = await chrome.storage.local.get([STORAGE_KEYS.VOICE_STATE]);
      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      const nextState = {
        ...prevState,
        lastSpokenSummary: String(payload.lastSpokenSummary || ''),
        lastSpokenAt: Date.now(),
        updatedAt: Date.now(),
      };
      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_STATE]: nextState,
      });
      return { ok: true };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_RECHECK_VOICEVOX') {
    runSerialized(async () => {
      await ensureOffscreenDocument();
      const probe = await probeVoicevoxAlive({ baseUrl: VOICEVOX_BASE_URL });
      const online = Boolean(probe.ok);
      const reason = probe.ok ? 'ok' : probe.reason === 'timeout' ? 'timeout' : 'unreachable';
      let styles = [];
      if (online) {
        styles = await listVoicevoxStyleIds({ baseUrl: VOICEVOX_BASE_URL });
      }
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_STATE,
        STORAGE_KEYS.VOICE_QUEUE,
      ]);
      const currentSettings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      if (styles.length > 0) {
        currentSettings.availableStyleIds = styles;
      }
      const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      const isOverThreshold =
        currentSettings.enabled !== false &&
        currentSettings.mode === YT_VOICE_MODES.ALL &&
        queue.length >= YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;

      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      const nextState = {
        ...prevState,
        effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : currentSettings.mode,
        autoSwitched: isOverThreshold,
        voicevoxOnline: online,
        voicevoxReason: reason,
        availableStyleCount: currentSettings.availableStyleIds.length,
        voicevoxCheckedAt: Date.now(),
        updatedAt: Date.now(),
      };
      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_SETTINGS]: currentSettings,
        [STORAGE_KEYS.VOICE_STATE]: nextState,
      });
      if (online && currentSettings.enabled && queue.length > 0) {
        nudgeOffscreenDrain();
      }
      return { ok: true, online, reason, state: nextState };
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
        STORAGE_KEYS.VOICE_STATE,
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

      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      const updates = {
        [STORAGE_KEYS.VOICE_SETTINGS]: next,
        [STORAGE_KEYS.VOICE_STATE]: {
          ...prevState,
          effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : next.mode,
          autoSwitched: isOverThreshold,
          availableStyleCount: Array.isArray(next.availableStyleIds)
            ? next.availableStyleIds.length
            : prevState.availableStyleCount || YT_DEFAULT_STYLE_IDS.length,
          updatedAt: Date.now(),
        },
      };
      if (next.enabled === false) {
        updates[STORAGE_KEYS.VOICE_QUEUE] = [];
      }
      await chrome.storage.local.set(updates);
      if (next.enabled && nextQueue.length > 0) {
        nudgeOffscreenDrain();
      }
      return { ok: true, settings: next };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_CLEAR_VOICE_QUEUE') {
    runSerialized(async () => {
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_STATE,
      ]);
      const settings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_QUEUE]: [],
        [STORAGE_KEYS.VOICE_STATE]: {
          ...prevState,
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
