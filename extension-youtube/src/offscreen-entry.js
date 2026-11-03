// offscreen-entry.js — サイドパネルを閉じていても VOICEVOX 読み上げを継続する Offscreen Document プレイヤー
/* global chrome, Blob, URL, Audio, setInterval, setTimeout */

import {
  VOICEVOX_BASE_URL,
  probeVoicevoxAlive,
  listVoicevoxStyleIds,
  synthesizeVoice,
} from '../../src/lib/voicevoxClient.js';
import { YT_DEFAULT_STYLE_IDS } from '../../src/lib/youtube/ytVoiceQueue.js';
import {
  createVoiceOverloadState,
  noteVoiceSynthOutcome,
  resolveVoiceOverloadTimeouts,
} from '../../src/lib/voiceEngineOverload.js';
import {
  LIGHT_VOICE_MAX_CHARS,
  LIGHT_VOICE_PROBE_TEXT,
  shouldUseLightVoice,
  shouldProbeVoicevox,
} from '../../src/lib/voiceLightFallback.js';

let isVoicevoxOnline = false;
let isDrainingQueue = false;

/**
 * ニコ生版 voicePlayer.js と同じ「混雑」の扱い(2026-11-03・PR #557/#558 の移植)。
 * - 時間切れが続いたら混雑中: 打ち切りを長くし(問い合わせ30秒・合成45秒)、VOICEVOX には1件ずつしか頼まない
 *   (このプレイヤーはもともと1件ずつ取り出して読むので、読んでいる件が捨てられることはない)。
 * - 時間切れは「VOICEVOX が落ちた」ではないので、止めずに次の件へ進む。
 * - 混雑中は PC の声(Windows の声)で読む。人ごとの声・高さ・速さは voiceLightFallback.lightVoiceToneFor。
 *   ときどき短い文を VOICEVOX に頼んで速さを確かめ、速い合成が続いたら VOICEVOX に戻る。
 */
const overload = createVoiceOverloadState();
let synthInFlight = 0;
let lastProbeAt = 0;
/** PC の声で続けて読めなかった回数。3回続いたら使わない(無音のまま切り替え続けないため)。 */
let lightFailStreak = 0;
let lastReportedEngineKey = '';

/**
 * VOICEVOX で1件合成する(時間切れかどうかと所要時間を混雑の判定に足す)。
 * @param {string} text
 * @param {{ styleId: number, pitchOffset: number, speedOffset: number }} voice
 */
async function synthesizeTracked(text, voice) {
  let timedOut = false;
  const startedAt = Date.now();
  synthInFlight += 1;
  /** @type {ArrayBuffer | null} */
  let wav = null;
  try {
    wav = await synthesizeVoice(text, voice, {
      baseUrl: VOICEVOX_BASE_URL,
      ...resolveVoiceOverloadTimeouts(overload.overloaded),
      onFailure: (info) => {
        if (/timeout/i.test(String(/** @type {any} */ (info?.error)?.message || info?.error || ''))) timedOut = true;
      },
    });
  } catch (err) {
    if (/timeout/i.test(String(/** @type {any} */ (err)?.message || err))) timedOut = true;
    wav = null;
  } finally {
    synthInFlight = Math.max(0, synthInFlight - 1);
  }
  const ok = !!wav && wav instanceof ArrayBuffer;
  noteVoiceSynthOutcome(overload, { timedOut, ok, totalMs: Date.now() - startedAt });
  reportEngineState(false);
  return { wav: ok ? wav : null, timedOut };
}

/** PC の声で読んでいる間、ときどき VOICEVOX に短い文を頼んで速さを確かめる(結果を待たない)。 */
function maybeProbeVoicevox() {
  const nowMs = Date.now();
  if (!shouldProbeVoicevox({ nowMs, lastProbeAt, inFlight: synthInFlight })) return;
  lastProbeAt = nowMs;
  void synthesizeTracked(LIGHT_VOICE_PROBE_TEXT, { styleId: YT_DEFAULT_STYLE_IDS[0], pitchOffset: 0, speedOffset: 0 }).catch(() => null);
}

/**
 * 混雑・PC の声の状態をサイドパネル用に知らせる(変わったときだけ)。
 * @param {boolean} lightActive
 */
function reportEngineState(lightActive) {
  const key = `${overload.overloaded}|${lightActive}`;
  if (key === lastReportedEngineKey) return;
  lastReportedEngineKey = key;
  chrome.runtime.sendMessage(
    { type: 'YT_REPORT_VOICE_ENGINE', payload: { overloaded: overload.overloaded, lightActive } },
    () => {
      void chrome.runtime.lastError;
    },
  );
}

/**
 * 1件を PC の声で読む(実際の発声は service worker の chrome.tts。Offscreen は無音が30秒続くと閉じられるため)。
 * @param {any} entry
 * @returns {Promise<boolean>}
 */
function speakLight(entry) {
  const text = String(entry.text || '').slice(0, LIGHT_VOICE_MAX_CHARS);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'YT_SPEAK_LIGHT', payload: { text, userKey: String(entry.userKey || '') } },
      (reply) => {
        void chrome.runtime.lastError;
        if (reply?.reason === 'no-voice') lightFailStreak = 3;
        resolve(!!reply?.ok);
      },
    );
  });
}

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

      const useLight = shouldUseLightVoice({
        overloaded: overload.overloaded,
        available: lightFailStreak < 3,
        setting: String(res?.lightVoice || 'auto'),
      });
      reportEngineState(useLight);
      if (useLight) {
        maybeProbeVoicevox();
        const spoken = await speakLight(entry);
        lightFailStreak = spoken ? 0 : lightFailStreak + 1;
        continue;
      }

      const { wav, timedOut } = await synthesizeTracked(entry.text, {
        styleId: entry.styleId,
        pitchOffset: Number(entry.pitchOffset || 0),
        speedOffset: Number(entry.speedOffset || 0),
      });

      if (!wav) {
        // 時間切れ=VOICEVOX が混んでいるだけ。止めずに次へ(混雑中なら次から PC の声に切り替わる)。
        if (timedOut) continue;
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
