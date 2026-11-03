// offscreen-entry.js — サイドパネルを閉じていても VOICEVOX 読み上げを継続する Offscreen Document プレイヤー
/* global chrome, Blob, URL, Audio, setInterval, setTimeout */

import {
  VOICEVOX_BASE_URL,
  probeVoicevoxAlive,
  listVoicevoxStyleIds,
  synthesizeVoice,
} from '../../src/lib/voicevoxClient.js';
import { YT_DEFAULT_STYLE_IDS } from '../../src/lib/youtube/ytVoiceQueue.js';

let isVoicevoxOnline = false;
let isDrainingQueue = false;

/**
 * WAV ArrayBuffer を Audio 要素で再生する。
 * @param {ArrayBuffer} wavBuffer
 * @returns {Promise<void>}
 */
function playWavBuffer(wavBuffer) {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      const cleanup = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(cleanup);
      }
    } catch {
      resolve();
    }
  });
}

/**
 * VOICEVOX の起動状態を診断し、結果を background 経由で `yt_voice_state` / `yt_voice_settings` に保存する。
 * @returns {Promise<{ online: boolean, reason: string, availableStyleIds: number[] }>}
 */
async function checkVoicevoxStatus() {
  const probe = await probeVoicevoxAlive({ baseUrl: VOICEVOX_BASE_URL });
  if (!probe.ok) {
    isVoicevoxOnline = false;
    const reason = probe.reason === 'timeout' ? 'timeout' : 'unreachable';
    await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'YT_REPORT_VOICEVOX_STATUS',
          payload: {
            online: false,
            reason,
            availableStyleIds: [],
          },
        },
        () => {
          void chrome.runtime.lastError;
          resolve(undefined);
        },
      );
    });
    return { online: false, reason, availableStyleIds: [] };
  }

  isVoicevoxOnline = true;
  const styles = await listVoicevoxStyleIds({ baseUrl: VOICEVOX_BASE_URL });
  const availableStyleIds = styles.length > 0 ? styles : Array.from(YT_DEFAULT_STYLE_IDS);

  await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'YT_REPORT_VOICEVOX_STATUS',
        payload: {
          online: true,
          reason: 'ok',
          availableStyleIds,
        },
      },
      () => {
        void chrome.runtime.lastError;
        resolve(undefined);
      },
    );
  });

  return { online: true, reason: 'ok', availableStyleIds };
}

/**
 * 読み上げキューから1件ずつ取り出して VOICEVOX で音声合成＆再生する（サイドパネル閉鎖中も動作）。
 */
async function drainVoiceQueueLoop() {
  if (isDrainingQueue) return;
  isDrainingQueue = true;

  try {
    while (true) {
      if (!isVoicevoxOnline) {
        const status = await checkVoicevoxStatus();
        if (!status.online) break;
      }

      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'YT_SHIFT_VOICE_QUEUE' }, (reply) => {
          void chrome.runtime.lastError;
          resolve(reply || { ok: false, entry: null });
        });
      });

      const entry = res?.entry;
      if (!entry) break;

      const summaryText = `読み上げ: ${entry.name || entry.channelId || 'リスナー'} (${entry.userKey} → 声 #${entry.styleId}) 「${entry.text}」`;
      chrome.runtime.sendMessage(
        {
          type: 'YT_REPORT_VOICE_SPOKEN',
          payload: {
            lastSpokenSummary: summaryText,
            lastSpokenEntry: entry,
          },
        },
        () => {
          void chrome.runtime.lastError;
        },
      );

      const wav = await synthesizeVoice(
        entry.text,
        {
          styleId: entry.styleId,
          pitchOffset: Number(entry.pitchOffset || 0),
          speedOffset: Number(entry.speedOffset || 0),
        },
        {
          baseUrl: VOICEVOX_BASE_URL,
        },
      );

      if (!wav || !(wav instanceof ArrayBuffer)) {
        await checkVoicevoxStatus();
        break;
      }

      await playWavBuffer(wav);
    }
  } finally {
    isDrainingQueue = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'YT_OFFSCREEN_DRAIN') {
    drainVoiceQueueLoop()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_OFFSCREEN_CHECK_VOICEVOX') {
    checkVoicevoxStatus()
      .then((res) => {
        setTimeout(drainVoiceQueueLoop, 20);
        sendResponse({ ok: true, ...res });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});

async function initOffscreen() {
  await checkVoicevoxStatus();
  setTimeout(drainVoiceQueueLoop, 50);
  setInterval(drainVoiceQueueLoop, 700);
  setInterval(checkVoicevoxStatus, 10000);
}

initOffscreen();
