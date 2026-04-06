// @ts-nocheck — content script; DOM/Chrome API が広く any 相当
import {
  extractLiveIdFromDom,
  extractLiveIdFromUrl,
  isNicoLiveWatchUrl,
  isNicoVideoJpHost
} from '../lib/broadcastUrl.js';
import {
  KEY_AUTO_BACKUP_STATE,
  KEY_INLINE_PANEL_WIDTH_MODE,
  KEY_LAST_WATCH_URL,
  KEY_POPUP_FRAME,
  KEY_POPUP_FRAME_CUSTOM,
  KEY_RECORDING,
  KEY_SELF_POSTED_RECENTS,
  KEY_COMMENT_PANEL_STATUS,
  KEY_STORAGE_WRITE_ERROR,
  KEY_THUMB_AUTO,
  KEY_THUMB_INTERVAL_MS,
  commentsStorageKey,
  isRecordingEnabled,
  normalizeInlinePanelWidthMode
} from '../lib/storageKeys.js';
import {
  pickLargestVisibleVideo,
  captureVideoToPngDataUrl
} from '../lib/videoCapture.js';
import { addThumbBlob, countThumbsForLive, isIndexedDbAvailable } from '../lib/thumbDb.js';
import {
  isThumbAutoEnabled,
  normalizeThumbIntervalMsForHost
} from '../lib/thumbSettings.js';
import { mergeNewComments, normalizeCommentText } from '../lib/commentRecord.js';
import { collectLoggedInViewerProfile } from '../lib/watchPageViewerProfile.js';
import { extractCommentsFromNode } from '../lib/nicoliveDom.js';
import {
  parseLiveViewerCountFromDocument,
  parseViewerCountFromSnapshotMetas
} from '../lib/liveAudienceDom.js';
import {
  findCommentListScrollHost,
  findNicoCommentPanel,
  harvestVirtualCommentList
} from '../lib/commentHarvest.js';
import { pickCommentMutationObserverRoot } from '../lib/observerTarget.js';
import { resolveWatchPageContext } from '../lib/watchContext.js';
import { buildStorageWriteErrorPayload } from '../lib/storageErrorState.js';
import {
  computeInlinePanelLayout,
  selectBestPlayerRectIndex
} from '../lib/inlinePanelLayout.js';
import {
  applyRecognitionResult,
  isVoiceCommentSupported,
  VOICE_COMMENT_MAX_CHARS
} from '../lib/voiceComment.js';
import { audioConstraintsForDevice } from '../lib/voiceInputDevices.js';
import { pollUntil } from '../lib/pollUntil.js';
import {
  extractEmbeddedDataProps,
  pickViewerCountFromEmbeddedData,
  pickProgramBeginAt
} from '../lib/embeddedDataExtract.js';
import { countRecentActiveUsers } from '../lib/concurrentEstimate.js';
import { summarizeOfficialCommentHistory } from '../lib/officialStatsWindow.js';

/**
 * @typedef {{ commentNo: string, text: string, userId: string|null, avatarUrl?: string }} ParsedCommentRow
 */

const DEBOUNCE_MS = 400;
const LIVE_POLL_MS = 4000;
const STATS_POLL_MS = 45_000;
/** 返信サジェスト等と同様に DOM 更新がテキスト差し替えだけのときの取りこぼし防止 */
const LIVE_PANEL_SCAN_MS = 2000;
const DEEP_HARVEST_DELAY_MS = 1200;
const BOOTSTRAP_DELAYS_MS = [400, 2000, 4500];
const MAX_SELF_POSTED_ITEMS = 48;
const SELF_POST_RECENT_TTL_MS = 24 * 60 * 60 * 1000;
const SELF_POST_NATIVE_DEDUPE_MS = 5000;
const SELF_POST_MATCH_LATE_MS = 10 * 60 * 1000;
const SELF_POST_MATCH_EARLY_MS = 30 * 1000;
const AUTO_BACKUP_LIVES_MAX = 40;
const SNAPSHOT_LINK_RELS = new Set([
  'alternate',
  'icon',
  'shortcut icon',
  'preload',
  'stylesheet'
]);

let recording = false;
/** @type {string|null} */
let liveId = null;

/** page-intercept (MAIN world) の WebSocket statistics メッセージ由来の視聴者数 */
/** @type {number|null} */
let wsViewerCount = null;
/** @type {number|null} */
let wsCommentCount = null;
/** @type {number} */
let wsViewerCountUpdatedAt = 0;
/** 直接観測できた watch statistics の viewers/comments */
/** @type {number|null} */
let officialViewerCount = null;
/** @type {number|null} */
let officialCommentCount = null;
/** @type {number} */
let officialStatsUpdatedAt = 0;
/** @type {number|null} */
let officialViewerIntervalMs = null;
/** @type {number} */
let lastOfficialViewerTickAt = 0;
/** @type {number[]} */
const officialViewerIntervals = [];
/** @type {{ at: number, statisticsComments: number, recordedComments: number }[]} */
const officialCommentHistory = [];
/** @type {number} */
let observedRecordedCommentCount = 0;
/** WebSocket schedule メッセージから取得した配信開始時刻 (epoch ms) */
/** @type {number|null} */
let programBeginAtMs = null;
/** @type {Set<Element|Node>} */
const pendingRoots = new Set();
/** @type {number|null} */
let flushTimer = null;
/** @type {MutationObserver|null} */
let mutationObserver = null;
/** @type {Element|null} */
let observedMutationRoot = null;
let nativeSelfPostRecorderBound = false;
let lastNativeSelfPost = { liveId: '', textNorm: '', at: 0 };
let harvestRunning = false;
/** @type {WeakMap<Element, true>} */
const scrollHooked = new WeakMap();

/** 定期サムネ（記録ONとは独立） */
let thumbAuto = false;
let thumbIntervalMs = 0;
/** @type {ReturnType<typeof setInterval>|null} */
let thumbTimerId = null;

/** ポップアップから scripting / メッセージで操作（watch ページ上で Speech API を実行） */
/** @type {InstanceType<NonNullable<typeof window.webkitSpeechRecognition>> | null} */
let nlsVoiceRec = null;
let nlsVoiceSessionBase = '';
let nlsVoiceSessionFinals = '';
let nlsVoiceLastDisplay = '';
/** ユーザーが「音声入力」ONのまま続行したいとき true（Chrome は文ごとに onend が出る） */
let nlsVoiceUserWantsListen = false;

/** @type {number|null} */
let nlsVoiceMeterRaf = null;
/** @type {MediaStream|null} */
let nlsVoiceMeterStream = null;
/** @type {AudioContext|null} */
let nlsVoiceMeterCtx = null;
let nlsVoiceMeterSmoothed = 0;
let nlsVoiceMeterLastSent = 0;

function nlsVoiceNotifyPopup(/** @type {Record<string, unknown>} */ payload) {
  if (!hasExtensionContext()) return;
  chrome.runtime
    .sendMessage({ type: 'NLS_VOICE_TO_POPUP', ...payload })
    .catch(() => {});
}

function nlsVoiceStopMeter() {
  if (nlsVoiceMeterRaf != null) {
    cancelAnimationFrame(nlsVoiceMeterRaf);
    nlsVoiceMeterRaf = null;
  }
  if (nlsVoiceMeterStream) {
    nlsVoiceMeterStream.getTracks().forEach((t) => t.stop());
    nlsVoiceMeterStream = null;
  }
  if (nlsVoiceMeterCtx) {
    nlsVoiceMeterCtx.close().catch(() => {});
    nlsVoiceMeterCtx = null;
  }
  nlsVoiceMeterSmoothed = 0;
  nlsVoiceNotifyPopup({ level: 0 });
}

/**
 * 音声入力中のみマイクレベルをポップアップへ送る（SpeechRecognition とは別ストリーム）
 * @param {string} deviceId
 */
async function nlsVoiceStartMeter(deviceId) {
  nlsVoiceStopMeter();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(
      audioConstraintsForDevice(deviceId)
    );
  } catch {
    return;
  }
  nlsVoiceMeterStream = stream;
  const AC =
    window.AudioContext ||
    /** @type {typeof window & { webkitAudioContext?: typeof AudioContext }} */ (
      window
    ).webkitAudioContext;
  if (typeof AC !== 'function') {
    nlsVoiceStopMeter();
    return;
  }
  let ctx;
  try {
    ctx = new AC();
  } catch {
    nlsVoiceStopMeter();
    return;
  }
  nlsVoiceMeterCtx = ctx;
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;
  src.connect(analyser);
  const timeBuf = new Uint8Array(analyser.fftSize);
  nlsVoiceMeterLastSent = 0;

  const tick = () => {
    if (!nlsVoiceMeterStream) return;
    nlsVoiceMeterRaf = requestAnimationFrame(tick);
    analyser.getByteTimeDomainData(timeBuf);
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) {
      const v = (timeBuf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeBuf.length);
    const instant = Math.min(1, rms * 4.2);
    nlsVoiceMeterSmoothed = nlsVoiceMeterSmoothed * 0.72 + instant * 0.28;
    const now = Date.now();
    if (now - nlsVoiceMeterLastSent >= 48) {
      nlsVoiceMeterLastSent = now;
      nlsVoiceNotifyPopup({ level: nlsVoiceMeterSmoothed });
    }
  };
  nlsVoiceMeterRaf = requestAnimationFrame(tick);
}

function nlsVoiceForceStop() {
  nlsVoiceUserWantsListen = false;
  nlsVoiceStopMeter();
  const r = nlsVoiceRec;
  nlsVoiceRec = null;
  if (!r) return;
  try {
    r.stop();
  } catch {
    //
  }
}

/**
 * @param {string} sessionBase
 * @param {string} deviceId 空なら既定マイク
 * @returns {Promise<{ ok: boolean, listening?: boolean, error?: string }>}
 */
async function nlsVoiceToggleOnPage(sessionBase, deviceId) {
  if (!isNicoLiveWatchUrl(window.location.href)) {
    return { ok: false, error: 'watchページ以外では音声入力できません。' };
  }
  if (nlsVoiceRec) {
    nlsVoiceForceStop();
    return { ok: true, listening: false };
  }
  if (!isVoiceCommentSupported()) {
    return { ok: false, error: 'このブラウザでは音声入力に対応していません。' };
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (typeof SR !== 'function') {
    return { ok: false, error: '音声認識APIを利用できません。' };
  }
  const id = String(deviceId || '').trim();
  nlsVoiceSessionBase = String(sessionBase || '');
  nlsVoiceSessionFinals = '';
  nlsVoiceLastDisplay = nlsVoiceSessionBase.trim().slice(0, VOICE_COMMENT_MAX_CHARS);
  nlsVoiceUserWantsListen = true;

  const rec = new SR();
  nlsVoiceRec = rec;
  rec.lang = 'ja-JP';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onresult = (/** @type {SpeechRecognitionEvent} */ e) => {
    const applied = applyRecognitionResult(
      nlsVoiceSessionBase,
      nlsVoiceSessionFinals,
      e
    );
    nlsVoiceSessionFinals = applied.sessionFinals;
    nlsVoiceLastDisplay = applied.display;
    nlsVoiceNotifyPopup({ partial: applied.display });
  };

  rec.onerror = (/** @type {SpeechRecognitionErrorEvent} */ ev) => {
    const code = ev.error || '';
    if (code === 'aborted') {
      nlsVoiceRec = null;
      return;
    }
    if (code === 'no-speech') return;
    nlsVoiceUserWantsListen = false;
    nlsVoiceRec = null;
    nlsVoiceStopMeter();
    nlsVoiceNotifyPopup({
      error: true,
      code,
      message:
        code === 'not-allowed'
          ? 'マイクが拒否されました。タブの鍵アイコンからマイクを許可してください。'
          : `音声エラー: ${code}`
    });
  };

  rec.onend = () => {
    const sameSession = nlsVoiceRec === rec;
    if (sameSession) {
      nlsVoiceRec = null;
    }
    if (nlsVoiceUserWantsListen) {
      nlsVoiceRec = rec;
      window.setTimeout(() => {
        if (!nlsVoiceUserWantsListen || nlsVoiceRec !== rec) return;
        try {
          rec.start();
        } catch {
          nlsVoiceUserWantsListen = false;
          nlsVoiceRec = null;
          nlsVoiceStopMeter();
          nlsVoiceNotifyPopup({
            done: true,
            text: nlsVoiceLastDisplay
          });
        }
      }, 0);
      return;
    }
    nlsVoiceStopMeter();
    nlsVoiceNotifyPopup({
      done: true,
      text: nlsVoiceLastDisplay
    });
  };

  try {
    rec.start();
    void nlsVoiceStartMeter(id);
    return { ok: true, listening: true };
  } catch {
    nlsVoiceUserWantsListen = false;
    nlsVoiceRec = null;
    nlsVoiceStopMeter();
    return { ok: false, error: '音声入力を開始できませんでした。' };
  }
}

/**
 * 音声認識が1文取れるかの簡易テスト（watch 上・ユーザージェスチャ連動）
 * @param {string} _deviceId
 * @returns {Promise<{ ok: boolean, text?: string, error?: string }>}
 */
async function nlsVoiceQuickSrProbe(_deviceId) {
  if (!isNicoLiveWatchUrl(window.location.href)) {
    return { ok: false, error: 'watchページで実行してください。' };
  }
  if (nlsVoiceRec) {
    return { ok: false, error: '音声入力中は使えません。先に停止してください。' };
  }
  if (!isVoiceCommentSupported()) {
    return { ok: false, error: 'このブラウザでは音声認識に対応していません。' };
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (typeof SR !== 'function') {
    return { ok: false, error: '音声認識APIを利用できません。' };
  }
  const rec = new SR();
  rec.lang = 'ja-JP';
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  return await new Promise((resolve) => {
    let settled = false;
    const settle = (/** @type {{ ok: boolean, text?: string, error?: string }} */ p) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        rec.abort();
      } catch {
        //
      }
      resolve(p);
    };

    const timer = window.setTimeout(() => {
      settle({
        ok: false,
        error: '時間内に認識できませんでした。マイクに向かって短く話してください。'
      });
    }, 5000);

    rec.onresult = (/** @type {SpeechRecognitionEvent} */ e) => {
      const text = String(e.results[0]?.[0]?.transcript || '').trim();
      settle(
        text
          ? { ok: true, text }
          : { ok: false, error: '認識結果が空でした。もう一度試してください。' }
      );
    };

    rec.onerror = (/** @type {SpeechRecognitionErrorEvent} */ ev) => {
      const code = ev.error || '';
      if (code === 'aborted') return;
      if (code === 'no-speech') {
        settle({ ok: false, error: '声が検出されませんでした。' });
        return;
      }
      settle({
        ok: false,
        error:
          code === 'not-allowed'
            ? 'マイクが拒否されています。タブの鍵アイコンから許可してください。'
            : `認識エラー: ${code}`
      });
    };

    rec.onend = () => {
      if (!settled) {
        settle({ ok: false, error: '認識が終了しましたが、文が得られませんでした。' });
      }
    };

    try {
      rec.start();
    } catch {
      window.clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ ok: false, error: 'テストを開始できませんでした。' });
      }
    }
  });
}

// ポップアップのボタン（ユーザージェスチャ）から executeScript で呼ぶ
globalThis.__NLS_VOICE_TOGGLE__ = nlsVoiceToggleOnPage;
globalThis.__NLS_VOICE_STOP__ = nlsVoiceForceStop;
globalThis.__NLS_VOICE_PROBE_SR__ = nlsVoiceQuickSrProbe;

window.addEventListener('pagehide', () => {
  nlsVoiceForceStop();
});

/** page-intercept-entry.js (MAIN world) がキャプチャした commentNo→{userId, nickname} */
/** @type {Map<string, { uid?: string, name?: string, av?: string }>} */
const interceptedUsers = new Map();
/** userId → lastSeenAt（同時接続推定用） */
/** @type {Map<string, number>} */
const activeUserTimestamps = new Map();
const ACTIVE_USER_MAP_MAX = 12000;
/** userId→nickname の補助マップ */
/** @type {Map<string, string>} */
const interceptedNicknames = new Map();
/** userId→avatarUrl の補助マップ */
/** @type {Map<string, string>} */
const interceptedAvatars = new Map();
const INTERCEPT_MAP_MAX = 8000;

/** NDGR 本文 postMessage をデバウンスして storage 書き込み回数を抑える */
/** @type {{ commentNo: string, text: string, userId: string|null, nickname?: string }[]} */
let ndgrChatRowsPending = [];
/** @type {ReturnType<typeof setTimeout>|null} */
let ndgrChatRowsFlushTimer = null;
const NDGR_CHAT_ROWS_FLUSH_MS = 120;

function clearNdgrChatRowsPending() {
  ndgrChatRowsPending.length = 0;
  if (ndgrChatRowsFlushTimer != null) {
    clearTimeout(ndgrChatRowsFlushTimer);
    ndgrChatRowsFlushTimer = null;
  }
}

/**
 * @param {{ commentNo: string, text: string, userId: string|null, nickname?: string }[]} batch
 */
async function flushNdgrChatRowsBatch(batch) {
  if (!batch.length) return;
  const byKey = new Map();
  for (const r of batch) {
    if (!r || typeof r !== 'object') continue;
    const no = String(r.commentNo ?? '').trim();
    const text = normalizeCommentText(r.text);
    if (!no || !text) continue;
    const k = `${no}\t${text}`;
    const uid = String(r.userId || '').trim();
    const nick = String(r.nickname || '').trim();
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, {
        commentNo: no,
        text,
        userId: uid || null,
        ...(nick ? { nickname: nick } : {})
      });
      continue;
    }
    const mUid = uid || String(prev.userId || '').trim();
    const mNick = nick || String(prev.nickname || '').trim();
    byKey.set(k, {
      commentNo: no,
      text,
      userId: mUid || null,
      ...(mNick ? { nickname: mNick } : {})
    });
  }
  const merged = [...byKey.values()];
  await persistCommentRows(merged);
}

/**
 * @param {{ commentNo: string, text: string, userId: string|null, nickname?: string }[]} rows
 */
function schedulePersistNdgrChatRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  ndgrChatRowsPending.push(...rows);
  if (ndgrChatRowsFlushTimer != null) return;
  ndgrChatRowsFlushTimer = setTimeout(() => {
    ndgrChatRowsFlushTimer = null;
    const slice = ndgrChatRowsPending;
    ndgrChatRowsPending = [];
    void flushNdgrChatRowsBatch(slice);
  }, NDGR_CHAT_ROWS_FLUSH_MS);
}

let broadcasterUidCache = '';
let broadcasterUidCacheAt = 0;

function isHttpAvatarUrl(v) {
  return /^https?:\/\//i.test(String(v || '').trim());
}

function resetOfficialStatsState() {
  officialViewerCount = null;
  officialCommentCount = null;
  officialStatsUpdatedAt = 0;
  officialViewerIntervalMs = null;
  lastOfficialViewerTickAt = 0;
  officialViewerIntervals.length = 0;
  resetOfficialCommentSamplingState();
}

function resetOfficialCommentSamplingState() {
  officialCommentHistory.length = 0;
  observedRecordedCommentCount = 0;
}

/** @param {number} at */
function noteOfficialViewerTick(at) {
  if (!(at > 0)) return;
  if (lastOfficialViewerTickAt > 0) {
    const delta = at - lastOfficialViewerTickAt;
    if (delta >= 15_000 && delta <= 5 * 60 * 1000) {
      officialViewerIntervals.push(delta);
      while (officialViewerIntervals.length > 8) officialViewerIntervals.shift();
      const sorted = [...officialViewerIntervals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      officialViewerIntervalMs =
        sorted.length % 2 === 1
          ? sorted[mid]
          : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
  }
  lastOfficialViewerTickAt = at;
}

/** @param {number} at */
function noteOfficialCommentSample(at) {
  if (
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !Number.isFinite(at) ||
    at <= 0 ||
    officialCommentCount == null ||
    !Number.isFinite(officialCommentCount) ||
    officialCommentCount < 0
  ) {
    return;
  }
  const next = {
    at,
    statisticsComments: officialCommentCount,
    recordedComments: observedRecordedCommentCount
  };
  const last = officialCommentHistory[officialCommentHistory.length - 1];
  if (
    last &&
    last.statisticsComments === next.statisticsComments &&
    last.recordedComments === next.recordedComments
  ) {
    last.at = next.at;
    return;
  }
  officialCommentHistory.push(next);
  while (
    officialCommentHistory.length > 48 ||
    (officialCommentHistory.length > 2 &&
      next.at - officialCommentHistory[0].at > 15 * 60 * 1000)
  ) {
    officialCommentHistory.shift();
  }
}

/**
 * statistics 着信時のタイミング・コメント数を記録する。
 *
 * statistics.viewers / watchCount は「累計来場者数」であり同時接続ではないため、
 * officialViewerCount には格納しない（= resolveConcurrentViewers の "official" パスを通さない）。
 * 同時接続の推定は estimateConcurrentViewers の fallback（コメンター法＋滞留法）に任せる。
 *
 * @param {{ viewers?: number|null, comments?: number|null, observedAt?: number }} stats
 */
function updateOfficialStatistics(stats) {
  const at =
    typeof stats?.observedAt === 'number' && Number.isFinite(stats.observedAt)
      ? stats.observedAt
      : Date.now();
  let touched = false;
  if (
    typeof stats?.viewers === 'number' &&
    Number.isFinite(stats.viewers) &&
    stats.viewers >= 0
  ) {
    officialStatsUpdatedAt = at;
    noteOfficialViewerTick(at);
    touched = true;
  }
  if (
    typeof stats?.comments === 'number' &&
    Number.isFinite(stats.comments) &&
    stats.comments >= 0
  ) {
    officialCommentCount = stats.comments;
    touched = true;
  }
  if (touched) noteOfficialCommentSample(at);
}

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (!e.data || typeof e.data.type !== 'string') return;

  if (e.data.type === 'NLS_INTERCEPT_SCHEDULE') {
    const b = e.data.begin;
    if (typeof b === 'string' && b.length >= 10) {
      const t = new Date(b).getTime();
      if (Number.isFinite(t)) programBeginAtMs = t;
    }
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_STATISTICS') {
    const now = Date.now();
    const v = e.data.viewers;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      wsViewerCount = v;
      wsViewerCountUpdatedAt = now;
    }
    const c = e.data.comments;
    if (typeof c === 'number' && Number.isFinite(c) && c >= 0) {
      wsCommentCount = c;
    }
    updateOfficialStatistics({
      ...(typeof v === 'number' && Number.isFinite(v) && v >= 0 ? { viewers: v } : {}),
      ...(typeof c === 'number' && Number.isFinite(c) && c >= 0 ? { comments: c } : {}),
      observedAt: now
    });
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_EMBEDDED_DATA') {
    const v = e.data.viewers;
    if (
      typeof v === 'number' &&
      Number.isFinite(v) &&
      v >= 0 &&
      wsViewerCount == null
    ) {
      wsViewerCount = v;
      wsViewerCountUpdatedAt = Date.now();
    }
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_CHAT_ROWS') {
    const raw = e.data.rows;
    if (Array.isArray(raw) && raw.length) {
      /** @type {{ commentNo: string, text: string, userId: string|null, nickname?: string }[]} */
      const cleaned = [];
      for (const x of raw) {
        if (!x || typeof x !== 'object') continue;
        const commentNo = String(x.commentNo ?? '').trim();
        const text = String(x.text ?? '');
        if (!commentNo) continue;
        const uid = String(x.userId ?? '').trim();
        /** @type {{ commentNo: string, text: string, userId: string|null, nickname?: string }} */
        const row = { commentNo, text, userId: uid || null };
        const nick = String(x.nickname ?? '').trim();
        if (nick) row.nickname = nick;
        cleaned.push(row);
      }
      if (cleaned.length) schedulePersistNdgrChatRows(cleaned);
    }
    return;
  }

  if (e.data.type !== 'NLS_INTERCEPT_USERID') return;
  const entries = e.data.entries;
  const users = e.data.users;
  const seenNow = Date.now();
  if (Array.isArray(users)) {
    for (const { uid, name, av } of users) {
      const sUid = String(uid || '').trim();
      const sName = String(name || '').trim();
      const sAv = isHttpAvatarUrl(av) ? String(av).trim() : '';
      if (!sUid) continue;
      if (sName) interceptedNicknames.set(sUid, sName);
      if (sAv) interceptedAvatars.set(sUid, sAv);
      activeUserTimestamps.set(sUid, seenNow);
    }
  }
  if (!Array.isArray(entries)) return;
  for (const { no, uid, name, av } of entries) {
    const sNo = String(no || '').trim();
    if (!sNo) continue;
    const sUid = String(uid || '').trim();
    const sName = String(name || '').trim();
    const sAv = isHttpAvatarUrl(av) ? String(av).trim() : '';
    if (!sUid && !sName && !sAv) continue;
    const prev = interceptedUsers.get(sNo);
    const prevUid = String(prev?.uid || '').trim();
    const prevName = String(prev?.name || '').trim();
    const prevAv = isHttpAvatarUrl(prev?.av) ? String(prev?.av || '').trim() : '';
    const nextUid = sUid || prevUid;
    const nextName = sName || prevName;
    const nextAv = sAv || prevAv;
    interceptedUsers.set(sNo, {
      ...(nextUid ? { uid: nextUid } : {}),
      ...(nextName ? { name: nextName } : {}),
      ...(nextAv ? { av: nextAv } : {})
    });
    if (sName && sUid) interceptedNicknames.set(sUid, sName);
    if (sAv && sUid) interceptedAvatars.set(sUid, sAv);
    if (sUid) activeUserTimestamps.set(sUid, seenNow);
  }
  if (activeUserTimestamps.size > ACTIVE_USER_MAP_MAX) {
    const excess = activeUserTimestamps.size - ACTIVE_USER_MAP_MAX;
    const iter = activeUserTimestamps.keys();
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value;
      if (key != null) activeUserTimestamps.delete(key);
    }
  }
  if (interceptedUsers.size > INTERCEPT_MAP_MAX) {
    const excess = interceptedUsers.size - INTERCEPT_MAP_MAX;
    const iter = interceptedUsers.keys();
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value;
      if (key != null) interceptedUsers.delete(key);
    }
  }
});
/** @type {number|null} */
let lastWatchUrlTimer = null;

const PAGE_FRAME_STYLE_ID = 'nls-watch-prikura-style';
const PAGE_FRAME_OVERLAY_ID = 'nls-watch-prikura-frame';
const INLINE_POPUP_HOST_ID = 'nls-inline-popup-host';
const INLINE_POPUP_IFRAME_ID = 'nls-inline-popup-iframe';
const PAGE_FRAME_LOOP_MS = 360;
const DEFAULT_PAGE_FRAME = 'light';
const LEGACY_PAGE_FRAME_ALIAS = {
  trio: 'light',
  rink: 'light',
  konta: 'sunset',
  tanunee: 'midnight'
};
const DEFAULT_PAGE_FRAME_CUSTOM = Object.freeze({
  headerStart: '#0f8fd8',
  headerEnd: '#14b8a6',
  accent: '#0f8fd8'
});

const PAGE_FRAME_PRESETS = {
  light: {
    headerStart: '#0f8fd8',
    headerEnd: '#14b8a6',
    accent: '#0f8fd8'
  },
  dark: {
    headerStart: '#1e293b',
    headerEnd: '#334155',
    accent: '#60a5fa'
  },
  midnight: {
    headerStart: '#1e1b4b',
    headerEnd: '#1d4ed8',
    accent: '#7dd3fc'
  },
  sunset: {
    headerStart: '#fb923c',
    headerEnd: '#f43f5e',
    accent: '#ea580c'
  }
};

/** @type {{ frameId: string, custom: { headerStart: string, headerEnd: string, accent: string } }} */
const pageFrameState = {
  frameId: DEFAULT_PAGE_FRAME,
  custom: { ...DEFAULT_PAGE_FRAME_CUSTOM }
};

/** @type {number|null} */
let pageFrameLoopTimer = null;

/** @param {string} id */
function hasPageFramePreset(id) {
  return Object.prototype.hasOwnProperty.call(PAGE_FRAME_PRESETS, id);
}

/** @param {unknown} raw */
function normalizePageFrameId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (!id) return '';
  return (
    LEGACY_PAGE_FRAME_ALIAS[/** @type {keyof typeof LEGACY_PAGE_FRAME_ALIAS} */ (id)] ||
    id
  );
}

/** @param {unknown} value @param {string} fallback */
function normalizeHexColor(value, fallback) {
  const s = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fallback;
}

/** @param {string} hex @param {number} ratio */
function darkenHexColor(hex, ratio) {
  const source = normalizeHexColor(hex, '#0f8fd8').slice(1);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(source.slice(0, 2), 16) * (1 - ratio));
  const g = clamp(parseInt(source.slice(2, 4), 16) * (1 - ratio));
  const b = clamp(parseInt(source.slice(4, 6), 16) * (1 - ratio));
  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** @param {unknown} raw */
function sanitizePageFrameCustom(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    headerStart: normalizeHexColor(
      /** @type {{ headerStart?: unknown }} */ (source).headerStart,
      DEFAULT_PAGE_FRAME_CUSTOM.headerStart
    ),
    headerEnd: normalizeHexColor(
      /** @type {{ headerEnd?: unknown }} */ (source).headerEnd,
      DEFAULT_PAGE_FRAME_CUSTOM.headerEnd
    ),
    accent: normalizeHexColor(
      /** @type {{ accent?: unknown }} */ (source).accent,
      DEFAULT_PAGE_FRAME_CUSTOM.accent
    )
  };
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function resolvePageFramePalette(frameId, custom) {
  const normalized = normalizePageFrameId(frameId);
  if (normalized === 'custom') {
    const safe = sanitizePageFrameCustom(custom);
    return {
      headerStart: safe.headerStart,
      headerEnd: safe.headerEnd,
      accent: safe.accent,
      accentDeep: darkenHexColor(safe.accent, 0.22)
    };
  }
  const preset = hasPageFramePreset(normalized)
    ? PAGE_FRAME_PRESETS[
        /** @type {keyof typeof PAGE_FRAME_PRESETS} */ (normalized)
      ]
    : PAGE_FRAME_PRESETS[DEFAULT_PAGE_FRAME];
  return {
    headerStart: preset.headerStart,
    headerEnd: preset.headerEnd,
    accent: preset.accent,
    accentDeep: darkenHexColor(preset.accent, 0.22)
  };
}

function ensurePageFrameStyle() {
  if (document.getElementById(PAGE_FRAME_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PAGE_FRAME_STYLE_ID;
  style.textContent = `
    #${PAGE_FRAME_OVERLAY_ID} {
      --nls-frame-start: #0f8fd8;
      --nls-frame-end: #14b8a6;
      --nls-frame-accent: #0f8fd8;
      --nls-frame-accent-deep: #0b73ad;
    }
    #${PAGE_FRAME_OVERLAY_ID} {
      position: fixed;
      inset: 0 auto auto 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 2147483000;
      display: none;
    }
    #${PAGE_FRAME_OVERLAY_ID} .nls-frame-outline {
      position: absolute;
      inset: 0;
      border-radius: 18px;
      border: 3px solid var(--nls-frame-accent);
      box-shadow:
        0 0 0 1px rgb(255 255 255 / 72%),
        0 14px 28px rgb(2 6 23 / 30%),
        inset 0 0 0 2px rgb(255 255 255 / 45%);
      background:
        linear-gradient(138deg, rgb(255 255 255 / 10%), transparent 34%) border-box,
        linear-gradient(145deg, rgb(15 23 42 / 4%), transparent 70%) border-box;
    }
    #${INLINE_POPUP_HOST_ID} {
      display: none;
      width: 100%;
      margin: 2px 0 2px;
      pointer-events: auto;
      position: relative;
      z-index: 2147482000;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }
    #${INLINE_POPUP_HOST_ID}:focus,
    #${INLINE_POPUP_HOST_ID}:focus-within {
      outline: none !important;
      box-shadow: none !important;
    }
    #${INLINE_POPUP_HOST_ID} iframe {
      width: 100%;
      height: 820px;
      border: none !important;
      border-radius: 0;
      box-shadow: none !important;
      outline: none !important;
      pointer-events: auto;
      background: transparent;
      display: block;
    }
    #${INLINE_POPUP_HOST_ID} iframe:focus,
    #${INLINE_POPUP_HOST_ID} iframe:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

function ensurePageFrameOverlay() {
  let overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = PAGE_FRAME_OVERLAY_ID;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `<div class="nls-frame-outline"></div>`;
  document.documentElement.appendChild(overlay);
  return overlay;
}

function ensureInlinePopupHost() {
  let host = document.getElementById(INLINE_POPUP_HOST_ID);
  if (host) return host;
  host = document.createElement('div');
  host.id = INLINE_POPUP_HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  host.style.display = 'none';
  host.style.pointerEvents = 'auto';
  host.style.width = '100%';

  const iframe = document.createElement('iframe');
  iframe.id = INLINE_POPUP_IFRAME_ID;
  iframe.setAttribute('title', 'nicolivelog inline panel');
  iframe.setAttribute('allow', 'microphone');
  iframe.style.pointerEvents = 'auto';
  try {
    iframe.src = chrome.runtime.getURL('popup.html') + '?inline=1';
  } catch {
    // no-op
  }
  host.appendChild(iframe);
  return host;
}

/**
 * video から親を辿り、プレイヤー列（映像＋公式コメント欄を含むブロック）相当の要素を選ぶ。
 * その要素の「直後」にホストを置くと、コメント入力バーの下〜列の下に自然に付く（video 直後だけだとバーの上に挟まることがある）。
 * body / documentElement は候補にしない（誤って最外に出さない）。
 * @param {HTMLElement} base
 */
function findFrameInsertAnchorFromVideo(base) {
  if (!(base instanceof HTMLElement)) return base;
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  /** @type {{ el: HTMLElement, score: number }|null} */
  let best = null;
  let cur = base;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur === document.body || cur === document.documentElement) break;
    if (cur.querySelector?.(`#${INLINE_POPUP_HOST_ID}`)) {
      cur = cur.parentElement;
      continue;
    }
    const rect = cur.getBoundingClientRect();
    const area = rect.width * rect.height;
    const aspect = rect.width / Math.max(rect.height, 1);
    if (
      rect.width >= 260 &&
      rect.height >= 140 &&
      area <= viewportArea * 0.92 &&
      aspect >= 1 &&
      aspect <= 3.4
    ) {
      const score = area * (1.25 - Math.min(Math.abs(aspect - 1.78), 1.1) * 0.2);
      if (!best || score > best.score) best = { el: cur, score };
    }
    cur = cur.parentElement;
  }
  return best?.el || base;
}

/** @param {{ left: number, top: number, width: number, height: number }} a @param {{ left: number, top: number, width: number, height: number }} b */
function unionViewRects(a, b) {
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * 動画＋公式コメント列など、視聴行としての表示矩形（フォールバックは video のみ）
 * @param {HTMLVideoElement} video
 * @param {HTMLElement} insertAfter
 */
function resolvePlayerRowRect(video, insertAfter) {
  const vr = video.getBoundingClientRect();
  /** @type {{ left: number, top: number, width: number, height: number }} */
  let best = {
    left: vr.left,
    top: vr.top,
    width: vr.width,
    height: vr.height
  };

  const widenWithEl = (el) => {
    if (!(el instanceof HTMLElement)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 64 || r.height < 100) return;
    const b = { left: r.left, top: r.top, width: r.width, height: r.height };
    const u = unionViewRects(best, b);
    if (u.width > best.width * 1.04) best = u;
  };

  try {
    const panel = findNicoCommentPanel(document);
    if (panel) widenWithEl(panel);
  } catch {
    // no-op
  }

  try {
    document
      .querySelectorAll('[class*="comment-data-grid" i]')
      .forEach((n) => widenWithEl(n));
  } catch {
    // no-op
  }

  const ar = insertAfter.getBoundingClientRect();
  if (ar.width >= vr.width * 1.06 && ar.width >= best.width * 0.95) {
    best = {
      left: ar.left,
      top: ar.top,
      width: ar.width,
      height: ar.height
    };
  }

  return best;
}

/** インラインパネル幅モード（storage から更新） */
let inlinePanelWidthMode = normalizeInlinePanelWidthMode(undefined);

/**
 * 幅はモードに応じて視聴行または video のみ。DOM 上はプレイヤー列（findFrameInsertAnchorFromVideo）の直後に置く。
 */
function renderInlineHostAnchoredToVideo(video) {
  const insertAfter = findFrameInsertAnchorFromVideo(video);
  const parent = insertAfter.parentElement;
  if (!parent) return;
  const host = ensureInlinePopupHost();
  const vr = video.getBoundingClientRect();
  if (vr.width < 260 || vr.height < 140) {
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
    return;
  }
  const pr = parent.getBoundingClientRect();
  const viewport = nlsViewportSize();
  const mode =
    inlinePanelWidthMode === 'video' ? 'video' : 'player_row';
  const rowRect =
    mode === 'player_row' ? resolvePlayerRowRect(video, insertAfter) : null;
  const { panelWidthPx, marginLeftPx } = computeInlinePanelLayout(mode, {
    videoRect: {
      width: vr.width,
      height: vr.height,
      top: vr.top,
      left: vr.left
    },
    rowRect,
    parentRect: {
      width: pr.width,
      height: pr.height,
      top: pr.top,
      left: pr.left
    },
    viewport
  });
  const insertNext = insertAfter.nextSibling;
  const needsMove =
    host.parentElement !== parent ||
    host.previousSibling !== insertAfter;
  if (needsMove) {
    if (insertNext) parent.insertBefore(host, insertNext);
    else parent.appendChild(host);
  }
  host.style.boxSizing = 'border-box';
  host.style.marginLeft = `${marginLeftPx}px`;
  host.style.maxWidth = '100%';
  host.style.width = `${panelWidthPx}px`;
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe) iframe.style.width = `${panelWidthPx}px`;
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
}

/** @param {HTMLElement} target */
function renderInlinePopupHost(target) {
  if (target instanceof HTMLVideoElement) {
    renderInlineHostAnchoredToVideo(target);
    return;
  }
  const parent = target.parentElement;
  if (!parent) return;
  const host = ensureInlinePopupHost();
  host.style.marginLeft = '';
  host.style.maxWidth = '';
  const currentRect = target.getBoundingClientRect();
  if (currentRect.width < 260 || currentRect.height < 140) {
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
    return;
  }
  if (host.parentElement !== parent || host.previousSibling !== target) {
    const next = target.nextSibling;
    if (next) parent.insertBefore(host, next);
    else parent.appendChild(host);
  }
  const panelWidth = Math.max(320, Math.round(currentRect.width));
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe) iframe.style.width = `${panelWidth}px`;
  host.style.width = `${panelWidth}px`;
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
}

function hidePageFrameOverlay() {
  const overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
  if (overlay) overlay.style.display = 'none';
  const host = document.getElementById(INLINE_POPUP_HOST_ID);
  if (host) {
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
  }
  stableFrameTarget = null;
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function applyPageFramePalette(frameId, custom) {
  const overlay = ensurePageFrameOverlay();
  const palette = resolvePageFramePalette(frameId, custom);
  overlay.style.setProperty('--nls-frame-start', palette.headerStart);
  overlay.style.setProperty('--nls-frame-end', palette.headerEnd);
  overlay.style.setProperty('--nls-frame-accent', palette.accent);
  overlay.style.setProperty('--nls-frame-accent-deep', palette.accentDeep);
}

/** @param {Element} el */
function isValidFrameTargetElement(el) {
  if (!(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  /** pickBestInlinePanelVideo / インライン描画と同じ 260×140 下限 */
  if (rect.width < 260 || rect.height < 140) return false;
  if (rect.top > window.innerHeight - 80 || rect.left > window.innerWidth - 80) {
    return false;
  }
  const aspect = rect.width / Math.max(rect.height, 1);
  if (aspect < 1.02 || aspect > 3.2) return false;
  return true;
}

/** @type {HTMLElement|null} */
let stableFrameTarget = null;

function nlsViewportSize() {
  return { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
}

/** メインの配信 video（表示矩形が最大・かつプレイヤーとして妥当）を選ぶ */
function pickBestInlinePanelVideo() {
  const viewport = nlsViewportSize();
  const list = Array.from(document.querySelectorAll('video')).filter(
    (v) => v instanceof HTMLVideoElement
  );
  if (!list.length) return null;
  const rects = list.map((v) => {
    const b = v.getBoundingClientRect();
    return { width: b.width, height: b.height, top: b.top, left: b.left };
  });
  const idx = selectBestPlayerRectIndex(rects, viewport);
  if (idx < 0) return null;
  const video = list[idx];
  const st = window.getComputedStyle(video);
  if (st.visibility === 'hidden' || st.display === 'none') return null;
  return video;
}

function findWatchFrameTargetElement() {
  let video = pickBestInlinePanelVideo();
  if (
    !video &&
    stableFrameTarget instanceof HTMLVideoElement &&
    stableFrameTarget.isConnected
  ) {
    const rect = stableFrameTarget.getBoundingClientRect();
    const st = window.getComputedStyle(stableFrameTarget);
    if (
      rect.width >= 260 &&
      rect.height >= 140 &&
      st.visibility !== 'hidden' &&
      st.display !== 'none'
    ) {
      video = stableFrameTarget;
    }
  }
  if (video) {
    stableFrameTarget = video;
    return video;
  }

  if (
    stableFrameTarget &&
    stableFrameTarget.isConnected &&
    !(stableFrameTarget instanceof HTMLVideoElement) &&
    isValidFrameTargetElement(stableFrameTarget)
  ) {
    return stableFrameTarget;
  }

  const selector =
    '[data-testid*="player" i], [class*="video-player" i], [class*="VideoPlayer" i], [class*="watch-player" i], [class*="player-container" i]';
  const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
    if (el.id === INLINE_POPUP_HOST_ID || el.id === PAGE_FRAME_OVERLAY_ID) return false;
    if (el.querySelector?.(`#${INLINE_POPUP_HOST_ID}`)) return false;
    return isValidFrameTargetElement(el);
  });
  if (!candidates.length) return null;

  let best = /** @type {HTMLElement|null} */ (null);
  let bestScore = -1;
  for (const c of candidates) {
    if (!(c instanceof HTMLElement)) continue;
    const rect = c.getBoundingClientRect();
    const area = rect.width * rect.height;
    const aspect = rect.width / Math.max(rect.height, 1);
    const score = area * (1.2 - Math.min(Math.abs(aspect - 1.78), 1.2) * 0.18);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  stableFrameTarget = best;
  return best;
}

/** 視聴ページの動画周り装飾枠（#nls-watch-prikura-frame）は表示しない。インライン用ホストの配置のみ行う。 */
function renderPageFrameOverlay() {
  if (!isNicoLiveWatchUrl(window.location.href)) {
    hidePageFrameOverlay();
    return;
  }

  const target = findWatchFrameTargetElement();
  if (!target) {
    hidePageFrameOverlay();
    return;
  }

  const rect = target.getBoundingClientRect();
  if (rect.width < 260 || rect.height < 140) {
    hidePageFrameOverlay();
    return;
  }

  const overlay = ensurePageFrameOverlay();
  overlay.style.display = 'none';
  renderInlinePopupHost(target);
}

async function loadPageFrameSettings() {
  if (!hasExtensionContext()) return;
  const bag = await chrome.storage.local.get([
    KEY_POPUP_FRAME,
    KEY_POPUP_FRAME_CUSTOM,
    KEY_INLINE_PANEL_WIDTH_MODE
  ]);
  inlinePanelWidthMode = normalizeInlinePanelWidthMode(
    bag[KEY_INLINE_PANEL_WIDTH_MODE]
  );
  const rawFrame = normalizePageFrameId(bag[KEY_POPUP_FRAME]);
  pageFrameState.frameId =
    rawFrame === 'custom' || hasPageFramePreset(rawFrame)
      ? rawFrame
      : DEFAULT_PAGE_FRAME;
  pageFrameState.custom = sanitizePageFrameCustom(bag[KEY_POPUP_FRAME_CUSTOM]);
  applyPageFramePalette(pageFrameState.frameId, pageFrameState.custom);
  renderPageFrameOverlay();
}

function startPageFrameLoop() {
  if (pageFrameLoopTimer) return;
  const tick = () => {
    if (!hasExtensionContext()) return;
    renderPageFrameOverlay();
  };

  pageFrameLoopTimer = setInterval(tick, PAGE_FRAME_LOOP_MS);
  window.addEventListener('scroll', tick, { passive: true });
  window.addEventListener('resize', tick);
  document.addEventListener('visibilitychange', tick);
  tick();
}

function hasExtensionContext() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

/** @param {unknown} err */
function isContextInvalidatedError(err) {
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String(/** @type {{ message?: unknown }} */ (err).message || '')
      : String(err || '');
  return msg.includes('Extension context invalidated');
}

/** @param {Element|null|undefined} el */
function isVisibleElement(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return el.getClientRects().length > 0;
}

/**
 * @returns {HTMLTextAreaElement|HTMLInputElement|HTMLElement|null}
 */
function findCommentEditorElement() {
  const selectors = [
    'textarea[placeholder*="コメント"]',
    'textarea[aria-label*="コメント"]',
    'textarea[name*="comment" i]',
    'input[type="text"][placeholder*="コメント"]',
    'input[type="text"][name*="comment" i]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][aria-label*="コメント"]',
    '[class*="comment-input" i] textarea',
    '[class*="comment-box" i] textarea',
    '[class*="CommentForm" i] textarea',
    '[class*="commentForm" i] textarea',
    '[data-testid*="comment" i] textarea',
    '[data-testid*="Comment" i] textarea'
  ];

  const panels = [
    document.querySelector('.ga-ns-comment-panel'),
    document.querySelector('.comment-panel'),
    document.querySelector('[class*="comment-panel" i]'),
    document.querySelector('[class*="CommentPanel" i]')
  ].filter(Boolean);

  for (const panel of panels) {
    for (const selector of selectors) {
      const list = panel.querySelectorAll(selector);
      for (const node of list) {
        if (!isVisibleElement(node)) continue;
        if (
          node instanceof HTMLTextAreaElement ||
          node instanceof HTMLInputElement ||
          node instanceof HTMLElement
        ) {
          return node;
        }
      }
    }
    const loose = panel.querySelectorAll('textarea');
    for (const node of loose) {
      if (!isVisibleElement(node)) continue;
      if (node instanceof HTMLTextAreaElement) return node;
    }
  }

  for (const selector of selectors) {
    const list = document.querySelectorAll(selector);
    for (const node of list) {
      if (!isVisibleElement(node)) continue;
      if (
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLInputElement ||
        node instanceof HTMLElement
      ) {
        return node;
      }
    }
  }
  return null;
}

/**
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} el
 * @param {string} text
 */
function setEditorText(el, text) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) {
      desc.set.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    try {
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text
        })
      );
    } catch {
      // InputEvent 非対応環境
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (el.isContentEditable) {
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  }
}

/**
 * @param {ParentNode} root
 * @returns {HTMLElement|null}
 */
/**
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} editor
 * @returns {HTMLElement|null}
 */
function findVisibleEnabledSubmitForEditor(editor) {
  if (!(editor instanceof HTMLElement)) {
    return findCommentSubmitButton(document);
  }
  const form = editor.closest('form');
  const scope =
    form ||
    editor.closest('[class*="comment" i], [role="group"]') ||
    document;
  const inScope = findCommentSubmitButton(scope);
  if (inScope) return inScope;
  return findCommentSubmitButton(document);
}

function findCommentSubmitButton(root) {
  const selectors = [
    'button[type="submit"]',
    'button[aria-label*="送信"]',
    'button[aria-label*="コメント"]',
    'button[data-testid*="send" i]',
    'button[data-testid*="comment" i]',
    'button[data-testid*="Submit" i]',
    '[role="button"][aria-label*="送信"]',
    '[class*="send" i][role="button"]',
    'button[class*="Send" i]',
    'button[class*="submit" i]'
  ];
  for (const selector of selectors) {
    const list = root.querySelectorAll(selector);
    for (const node of list) {
      if (!(node instanceof HTMLElement)) continue;
      if (!isVisibleElement(node)) continue;
      if (node.matches('[disabled],[aria-disabled="true"]')) continue;
      return node;
    }
  }
  return null;
}

/**
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} editor
 * @returns {boolean}
 */
function trySubmitComment(editor) {
  const form =
    editor instanceof HTMLElement ? editor.closest('form') : null;
  const scope =
    form ||
    (editor instanceof HTMLElement
      ? editor.closest('[class*="comment" i], [role="group"]')
      : null) ||
    document;

  const btnInScope = findCommentSubmitButton(scope);
  if (btnInScope) {
    btnInScope.click();
    return true;
  }

  const btnGlobal = findCommentSubmitButton(document);
  if (btnGlobal) {
    btnGlobal.click();
    return true;
  }

  if (form && typeof form.requestSubmit === 'function') {
    form.requestSubmit();
    return true;
  }

  editor.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true
    })
  );
  editor.dispatchEvent(
    new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true
    })
  );
  return true;
}

function canPostCommentInThisFrame() {
  if (locationAllowsCommentRecording()) return true;
  return Boolean(findCommentEditorElement());
}

/**
 * 送信操作後に入力欄が空になる/別内容へ変わるまで少し待つ。
 * 「クリックできたが実際には送れていない」を減らすための確認。
 *
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} editor
 * @param {string} rawText
 * @returns {Promise<boolean>}
 */
async function confirmSubmittedCommentAsync(editor, rawText) {
  const expected = normalizeCommentText(rawText);
  if (!expected) return false;
  const probes = [280, 700, 1400];
  let waited = 0;
  for (const probe of probes) {
    const delta = Math.max(0, probe - waited);
    waited = probe;
    if (delta > 0) {
      await new Promise((r) => setTimeout(r, delta));
    }
    const currentEditor =
      editor.isConnected && isVisibleElement(editor)
        ? editor
        : findCommentEditorElement();
    const currentText = normalizeCommentText(readCommentEditorText(currentEditor));
    if (!currentText || currentText !== expected) {
      return true;
    }
  }
  return false;
}

/**
 * React 等が入力値を反映してから送信するまで短い待ちを入れる
 * @param {string} rawText
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function postCommentFromContentAsync(rawText) {
  if (!canPostCommentInThisFrame()) {
    return { ok: false, error: 'コメント欄のあるwatchフレームが見つかりません。' };
  }
  const text = String(rawText || '').trim();
  if (!text) {
    return { ok: false, error: 'コメントが空です。' };
  }

  const editor = await pollUntil(findCommentEditorElement, {
    timeoutMs: 8000,
    intervalMs: 50
  });
  if (!editor) {
    return {
      ok: false,
      error:
        'コメント入力欄が見つかりません。ページの再読み込み直後は数秒待ってから再度お試しください。'
    };
  }

  try {
    if (editor instanceof HTMLElement) {
      editor.focus();
    }
    setEditorText(editor, text);
    await new Promise((r) => {
      requestAnimationFrame(() => requestAnimationFrame(r));
    });
    await new Promise((r) => setTimeout(r, 220));

    const submitOnce = async () => {
      const btn = await pollUntil(() => findVisibleEnabledSubmitForEditor(editor), {
        timeoutMs: 1200,
        intervalMs: 80
      });
      if (btn) {
        btn.click();
        return true;
      }
      return trySubmitComment(editor);
    };

    if (!(await submitOnce())) {
      return {
        ok: false,
        error: '送信ボタンが見つかりません。watchページを再読み込みして再試行してください。'
      };
    }
    if (await confirmSubmittedCommentAsync(editor, text)) {
      return { ok: true };
    }

    if (!(await submitOnce())) {
      return {
        ok: false,
        error: 'コメント送信を確認できませんでした。watchページを開いたまま再試行してください。'
      };
    }
    if (await confirmSubmittedCommentAsync(editor, text)) {
      return { ok: true };
    }
    return {
      ok: false,
      error: 'コメント送信を確認できませんでした。watchページを開いたまま再試行してください。'
    };
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String(/** @type {{ message?: unknown }} */ (err).message || 'post_failed')
        : 'post_failed';
    return { ok: false, error: message };
  }
}

/** @param {Element|null|undefined} node */
function resolveCommentEditorFromTarget(node) {
  if (!(node instanceof Element)) return null;
  const direct = node.closest(
    'textarea, input[type="text"], [contenteditable="true"], [contenteditable="plaintext-only"]'
  );
  if (direct instanceof HTMLElement) return direct;
  return null;
}

/** @param {HTMLElement|null|undefined} el */
function readCommentEditorText(el) {
  if (!el) return '';
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return String(el.value || '').trim();
  }
  if (el.isContentEditable) {
    return String(el.textContent || '').trim();
  }
  return '';
}

/** @param {string} rawText */
async function rememberNativeSelfPostedComment(rawText) {
  const lid = String(liveId || '').trim().toLowerCase();
  const textNorm = normalizeCommentText(rawText);
  if (!lid || !textNorm || !hasExtensionContext()) return;
  const now = Date.now();
  if (
    lastNativeSelfPost.liveId === lid &&
    lastNativeSelfPost.textNorm === textNorm &&
    now - lastNativeSelfPost.at < SELF_POST_NATIVE_DEDUPE_MS
  ) {
    return;
  }
  lastNativeSelfPost = { liveId: lid, textNorm, at: now };
  try {
    const bag = await chrome.storage.local.get(KEY_SELF_POSTED_RECENTS);
    const raw = bag[KEY_SELF_POSTED_RECENTS];
    const items =
      raw && typeof raw === 'object' && Array.isArray(raw.items) ? raw.items : [];
    const next = items.filter(
      (x) =>
        x &&
        typeof x.liveId === 'string' &&
        typeof x.textNorm === 'string' &&
        typeof x.at === 'number' &&
        now - x.at < SELF_POST_RECENT_TTL_MS
    );
    const duplicated = next.some(
      (it) =>
        String(it.liveId || '').trim().toLowerCase() === lid &&
        String(it.textNorm || '') === textNorm &&
        Math.abs(now - (Number(it.at) || 0)) < SELF_POST_NATIVE_DEDUPE_MS
    );
    if (duplicated) return;
    next.push({ liveId: lid, at: now, textNorm });
    while (next.length > MAX_SELF_POSTED_ITEMS) next.shift();
    await chrome.storage.local.set({
      [KEY_SELF_POSTED_RECENTS]: { items: next }
    });
  } catch {
    // no-op
  }
}

/**
 * 送信操作後に入力欄が空になる/変化したことを確認してから self-posted 履歴へ積む。
 * 「Enter しただけ」「送信失敗」を減らすための遅延確認。
 *
 * @param {HTMLElement} editor
 * @param {string} rawText
 */
function scheduleNativeSelfPostedConfirm(editor, rawText) {
  const expected = normalizeCommentText(rawText);
  const lid = String(liveId || '').trim().toLowerCase();
  if (!expected || !lid || !recording) return;
  const probes = [280, 700, 1400];
  let done = false;
  for (const delayMs of probes) {
    setTimeout(() => {
      if (done) return;
      if (!hasExtensionContext()) return;
      if (!recording) return;
      if (String(liveId || '').trim().toLowerCase() !== lid) return;
      const currentEditor =
        editor.isConnected && isVisibleElement(editor)
          ? editor
          : findCommentEditorElement();
      const currentText = normalizeCommentText(readCommentEditorText(currentEditor));
      if (currentText && currentText === expected) return;
      done = true;
      void rememberNativeSelfPostedComment(rawText);
    }, delayMs);
  }
}

function bindNativeSelfPostedRecorder() {
  if (nativeSelfPostRecorderBound) return;
  nativeSelfPostRecorderBound = true;

  document.addEventListener(
    'click',
    (ev) => {
      if (!ev.isTrusted) return;
      if (!liveId || !recording || !locationAllowsCommentRecording()) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const clickedButton = target.closest('button, [role="button"]');
      if (!(clickedButton instanceof HTMLElement) || !isVisibleElement(clickedButton)) {
        return;
      }
      const editor = findCommentEditorElement();
      if (!editor) return;
      const submit = findVisibleEnabledSubmitForEditor(editor);
      if (!(submit instanceof HTMLElement) || submit !== clickedButton) return;
      const text = readCommentEditorText(editor);
      if (!text) return;
      scheduleNativeSelfPostedConfirm(editor, text);
    },
    true
  );

  document.addEventListener(
    'keydown',
    (ev) => {
      if (!ev.isTrusted) return;
      if (ev.key !== 'Enter' || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) {
        return;
      }
      if (Boolean(ev.isComposing) || ev.keyCode === 229) return;
      if (!liveId || !recording || !locationAllowsCommentRecording()) return;
      const editor = resolveCommentEditorFromTarget(
        ev.target instanceof Element ? ev.target : null
      );
      if (!(editor instanceof HTMLElement) || !isVisibleElement(editor)) return;
      const current = findCommentEditorElement();
      if (current && current !== editor) return;
      const text = readCommentEditorText(editor);
      if (!text) return;
      scheduleNativeSelfPostedConfirm(editor, text);
    },
    true
  );
}

/**
 * @returns {{
 *   title: string,
  *   url: string,
 *   liveId: string|null,
 *   broadcastTitle: string,
 *   broadcasterName: string,
 *   thumbnailUrl: string,
 *   tags: string[],
 *   startAtText: string,
 *   links: { rel: string, href: string, as: string, type: string }[],
 *   metas: { key: string, value: string }[],
 *   scripts: { src: string, type: string }[],
 *   noopenerLinks: { text: string, href: string }[],
 *   viewerAvatarUrl: string,
 *   viewerNickname: string,
 *   viewerUserId: string,
 *   broadcasterUserId: string,
 *   viewerCountFromDom: number|null,
 *   viewerCountSource: 'ws'|'embedded'|'dom'|'none',
 *   officialViewerCount: number|null,
 *   officialCommentCount: number|null,
 *   officialStatsUpdatedAt: number|null,
 *   officialStatsFreshnessMs: number|null,
 *   officialViewerIntervalMs: number|null,
 *   officialStatisticsCommentsDelta: number|null,
 *   officialReceivedCommentsDelta: number|null,
 *   officialCommentSampleWindowMs: number|null,
 *   officialCaptureRatio: number|null
 * }}
 */
function collectWatchPageSnapshot() {
  /** @param {unknown} v */
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  /** @param {string} raw */
  const toAbsoluteUrl = (raw) => {
    if (!raw) return '';
    try {
      return new URL(raw, window.location.href).href;
    } catch {
      return raw;
    }
  };
  /** @param {Map<string, string>} map */
  const metaGet = (map, keys) => {
    for (const key of keys) {
      const hit = map.get(key.toLowerCase());
      if (hit) return hit;
    }
    return '';
  };

  const url = String(window.location.href || '');
  const links = [];
  document.querySelectorAll('link[rel]').forEach((el) => {
    const rel = String(el.getAttribute('rel') || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!SNAPSHOT_LINK_RELS.has(rel)) return;
    links.push({
      rel,
      href: String(el.getAttribute('href') || ''),
      as: String(el.getAttribute('as') || ''),
      type: String(el.getAttribute('type') || '')
    });
  });

  const metas = [];
  /** @type {Map<string, string>} */
  const metaMap = new Map();
  document.querySelectorAll('meta').forEach((m) => {
    const key =
      m.getAttribute('property') ||
      m.getAttribute('name') ||
      m.getAttribute('http-equiv') ||
      m.getAttribute('charset') ||
      '';
    const value = m.getAttribute('content') || m.getAttribute('charset') || '';
    if (!key) return;
    const nKey = String(key);
    const nVal = String(value);
    metas.push({ key: nKey, value: nVal });
    if (!metaMap.has(nKey.toLowerCase()) && nVal) {
      metaMap.set(nKey.toLowerCase(), nVal);
    }
  });

  const scripts = [];
  document.querySelectorAll('script[src]').forEach((s) => {
    scripts.push({
      src: String(s.getAttribute('src') || ''),
      type: String(s.getAttribute('type') || 'text/javascript')
    });
  });

  const noopenerLinks = [];
  document.querySelectorAll('a[rel~="noopener"]').forEach((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    noopenerLinks.push({ text, href });
  });

  const titleFromDocument = clean(document.title).replace(/\s+-\s+ニコニコ生放送.*$/, '');
  const titleFromMeta = clean(
    metaGet(metaMap, ['og:title', 'twitter:title', 'title'])
  );
  const h1Text = clean(document.querySelector('h1')?.textContent || '');
  const broadcastTitle = titleFromMeta || h1Text || titleFromDocument;

  const streamLink = Array.from(
    document.querySelectorAll('a[href*="/user/"]')
  ).find((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    return (
      /\/user\/\d+/.test(href) &&
      /\/live_programs(?:\?|$)/.test(href) &&
      text &&
      !/^https?:\/\//i.test(text)
    );
  });
  const broadcasterNameFromMeta = clean(
    metaGet(metaMap, ['author', 'twitter:creator', 'profile:username'])
  );
  const broadcasterNameFromDom =
    clean(streamLink?.textContent || '') ||
    clean(
      document.querySelector('[class*="userName"], [class*="streamerName"]')
        ?.textContent || ''
    );
  const broadcasterName = broadcasterNameFromDom || broadcasterNameFromMeta;

  const broadcasterUserId = (() => {
    const href = String(streamLink?.getAttribute('href') || '');
    const m = href.match(/\/user\/(\d+)/);
    return m ? m[1] : '';
  })();

  const thumbnailUrl = toAbsoluteUrl(
    clean(metaGet(metaMap, ['og:image', 'twitter:image']))
  );

  const tags = new Set();
  /** @param {unknown} t */
  const addTag = (t) => {
    const s = clean(t).replace(/^#/, '');
    if (!s || s.length > 80) return;
    tags.add(s);
  };
  clean(metaGet(metaMap, ['keywords']))
    .split(/[,、]/)
    .forEach((v) => addTag(v));
  document
    .querySelectorAll('a[href*="dic.nicovideo.jp/a/"], a[href*="dic.nicovideo.jp/l/"]')
    .forEach((a) => addTag(a.textContent));

  const startAtText = (() => {
    const fromMeta = clean(metaGet(metaMap, ['og:description', 'twitter:description']));
    const m = clean(document.title).match(
      /(\d{4}\/\d{1,2}\/\d{1,2}\([^)]*\)\s+\d{1,2}:\d{2}開始)/
    );
    return clean(m?.[1] || fromMeta);
  })();

  const viewer = collectLoggedInViewerProfile(document, url);

  const WS_STALE_MS = 120_000;
  const wsRecent =
    wsViewerCount != null &&
    wsViewerCountUpdatedAt > 0 &&
    Date.now() - wsViewerCountUpdatedAt < WS_STALE_MS;
  const officialCommentSummary = summarizeOfficialCommentHistory({
    history: officialCommentHistory,
    nowMs: Date.now(),
    targetWindowMs:
      typeof officialViewerIntervalMs === 'number' && officialViewerIntervalMs > 0
        ? officialViewerIntervalMs
        : 60_000,
    minWindowMs: 15_000
  });

  let viewerCountFromDom = null;
  /** @type {'ws'|'embedded'|'dom'|'none'} */
  let viewerCountSource = 'none';
  if (wsRecent) {
    viewerCountFromDom = wsViewerCount;
    viewerCountSource = 'ws';
  }
  if (viewerCountFromDom == null) {
    const props = extractEmbeddedDataProps(document);
    if (props) {
      viewerCountFromDom = pickViewerCountFromEmbeddedData(props);
      if (viewerCountFromDom != null) viewerCountSource = 'embedded';
    }
  }
  if (viewerCountFromDom == null) {
    viewerCountFromDom =
      parseLiveViewerCountFromDocument(document) ??
      parseViewerCountFromSnapshotMetas(metas);
    if (viewerCountFromDom != null) viewerCountSource = 'dom';
  }

  const _debug = {};
  try {
    const _edProps = extractEmbeddedDataProps(document);
    Object.assign(_debug, {
      wsViewerCount,
      wsCommentCount,
      wsAge: wsViewerCountUpdatedAt ? Date.now() - wsViewerCountUpdatedAt : -1,
      intercept: interceptedUsers.size,
      embeddedVC: _edProps ? pickViewerCountFromEmbeddedData(_edProps) : null,
      programBeginAtMs,
      embeddedBeginAt: _edProps ? pickProgramBeginAt(_edProps) : null,
      startAtText,
      edProgramKeys: _edProps?.program ? Object.keys(_edProps.program).slice(0, 20).join(',') : '',
      poll: { ..._pollDiag },
    });
    const sels = {
      tblRow: 'div.table-row',
      roleRow: '[role="row"]',
      gaPanel: '.ga-ns-comment-panel',
      cClass: '[class*="comment" i]',
      dCType: '[data-comment-type]',
      uicon: 'img[src*="usericon"], img[src*="nicoaccount"]',
      dgrid: '[class*="data-grid"]',
      dgridRow: '[class*="data-grid"] > div',
    };
    const c = {};
    for (const [k, sel] of Object.entries(sels)) {
      try { c[k] = document.querySelectorAll(sel).length; } catch { c[k] = -1; }
    }
    _debug.dom = c;

    const grid = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
    if (grid) {
      const kids = Array.from(grid.children).slice(0, 3);
      _debug.gridTag = grid.tagName;
      _debug.gridCls = (grid.className || '').substring(0, 80);
      _debug.gridKidCount = grid.children.length;
      _debug.gridKids = kids.map(ch => {
        const attrs = [];
        for (let i = 0; i < Math.min(ch.attributes.length, 6); i++) {
          const a = ch.attributes[i];
          if (a.name === 'class') continue;
          attrs.push(`${a.name}=${String(a.value).substring(0, 30)}`);
        }
        const firstChild = ch.children[0];
        const fcInfo = firstChild ? `${firstChild.tagName}.${(firstChild.className || '').substring(0, 40)}` : '';
        return {
          tag: ch.tagName,
          cls: (ch.className || '').substring(0, 80),
          childCount: ch.children.length,
          attrs: attrs.join(' '),
          fc: fcInfo,
          txt: (ch.textContent || '').substring(0, 50).replace(/\s+/g, ' ')
        };
      });
      const deepKid = grid.querySelector('div > div > div');
      if (deepKid) {
        _debug.deepSample = {
          tag: deepKid.tagName,
          cls: (deepKid.className || '').substring(0, 80),
          txt: (deepKid.textContent || '').substring(0, 60).replace(/\s+/g, ' '),
        };
      }
    }

    {
      const g2 = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
      if (g2) {
        const bdy = g2.querySelector('[class*="body"]');
        const tbl = bdy?.querySelector('[class*="table"]');
        const rc = tbl || bdy;
        if (rc) {
          const rws = Array.from(rc.children).slice(0, 3);
          _debug.tblKids = rc.children.length;
          _debug.tblRows = rws.map(r => ({
            tag: r.tagName,
            cls: (r.className || '').substring(0, 80),
            ch: r.children.length,
            role: r.getAttribute('role') || '',
            style: (r.getAttribute('style') || '').substring(0, 60),
            txt: (r.textContent || '').substring(0, 50).replace(/\s+/g, ' '),
          }));
        }
      }
    }

    const docEl = document.documentElement;
    if (docEl) {
      _debug.pi = docEl.getAttribute('data-nls-page-intercept') || '';
      _debug.piEnq = docEl.getAttribute('data-nls-page-intercept-enqueued') || '';
      _debug.piPost = docEl.getAttribute('data-nls-page-intercept-posted') || '';
      _debug.piWs = docEl.getAttribute('data-nls-page-intercept-ws') || '';
      _debug.piFetch = docEl.getAttribute('data-nls-page-intercept-fetch') || '';
      _debug.piXhr = docEl.getAttribute('data-nls-page-intercept-xhr') || '';
      _debug.fbScans = docEl.getAttribute('data-nls-fiber-scans') || '';
      _debug.fbFound = docEl.getAttribute('data-nls-fiber-found') || '';
      _debug.fbRows = docEl.getAttribute('data-nls-fiber-rows') || '';
      _debug.fbProbe = docEl.getAttribute('data-nls-fiber-probe') || '';
      _debug.fbStep = docEl.getAttribute('data-nls-fiber-step') || '';
      _debug.fbAttempts = docEl.getAttribute('data-nls-fiber-attempts') || '';
      _debug.fbErr = docEl.getAttribute('data-nls-fiber-err') || '';
      _debug.fetchLog = docEl.getAttribute('data-nls-fetch-log') || '';
      _debug.fetchOther = docEl.getAttribute('data-nls-fetch-other') || '';
      _debug.piPhase = docEl.getAttribute('data-nls-pi-phase') || '';
      _debug.ndgr = docEl.getAttribute('data-nls-ndgr') || '';
    }
  } catch { /* no-op */ }

  return {
    title: String(document.title || ''),
    url,
    liveId,
    broadcastTitle,
    broadcasterName,
    thumbnailUrl,
    tags: Array.from(tags),
    startAtText,
    links,
    metas,
    scripts,
    noopenerLinks,
    viewerAvatarUrl: viewer.viewerAvatarUrl,
    viewerNickname: viewer.viewerNickname,
    viewerUserId: viewer.viewerUserId,
    broadcasterUserId,
    viewerCountFromDom,
    viewerCountSource,
    officialViewerCount:
      typeof officialViewerCount === 'number' &&
      Number.isFinite(officialViewerCount) &&
      officialViewerCount >= 0
        ? officialViewerCount
        : null,
    officialCommentCount:
      typeof officialCommentCount === 'number' &&
      Number.isFinite(officialCommentCount) &&
      officialCommentCount >= 0
        ? officialCommentCount
        : null,
    officialStatsUpdatedAt: officialStatsUpdatedAt > 0 ? officialStatsUpdatedAt : null,
    officialStatsFreshnessMs:
      officialStatsUpdatedAt > 0 ? Math.max(0, Date.now() - officialStatsUpdatedAt) : null,
    officialViewerIntervalMs:
      typeof officialViewerIntervalMs === 'number' && officialViewerIntervalMs > 0
        ? officialViewerIntervalMs
        : null,
    officialStatisticsCommentsDelta:
      officialCommentSummary?.statisticsCommentsDelta ?? null,
    officialReceivedCommentsDelta:
      officialCommentSummary?.receivedCommentsDelta ?? null,
    officialCommentSampleWindowMs:
      officialCommentSummary?.sampleWindowMs ?? null,
    officialCaptureRatio:
      typeof officialCommentSummary?.captureRatio === 'number'
        ? officialCommentSummary.captureRatio
        : null,
    totalComments: wsCommentCount,
    streamAgeMin: (() => {
      // Priority 1: WebSocket schedule message
      if (programBeginAtMs != null && Number.isFinite(programBeginAtMs)) {
        const age = (Date.now() - programBeginAtMs) / 60000;
        if (age >= 0) return Math.round(age);
      }
      // Priority 2: embedded-data props
      const props = extractEmbeddedDataProps(document);
      const beginMs = props ? pickProgramBeginAt(props) : null;
      if (beginMs != null && Number.isFinite(beginMs)) {
        const age = (Date.now() - beginMs) / 60000;
        if (age >= 0) return Math.round(age);
      }
      // Priority 3: page title "YYYY/MM/DD(曜) HH:MM開始"
      const satm = startAtText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\([^)]*\)\s+(\d{1,2}):(\d{2})/);
      if (satm) {
        const d = new Date(+satm[1], +satm[2] - 1, +satm[3], +satm[4], +satm[5]);
        const age = (Date.now() - d.getTime()) / 60000;
        if (age >= 0 && age < 1440) return Math.round(age);
      }
      // Priority 4: player elapsed time from narrow DOM scope
      try {
        const playerArea = document.querySelector('[class*="player" i], [class*="Player" i], [id*="player" i], video')
          ?.closest('[class*="player" i], [class*="Player" i], [id*="player" i]')
          || document.querySelector('[class*="player" i], [class*="Player" i]');
        const txt = playerArea?.textContent || '';
        const pm = txt.match(/(\d{1,2}):(\d{2}):(\d{2})\s*\/\s*\d/);
        if (pm) return +pm[1] * 60 + +pm[2];
      } catch { /* no-op */ }
      return null;
    })(),
    recentActiveUsers: countRecentActiveUsers(activeUserTimestamps, Date.now()),
    _debug
  };
}

/** ポップアップからの操作はトップの watch 文書を対象にする（iframe との sendResponse 競合を避ける） */
function isWatchPageMainFrameForMessages() {
  try {
    return window.self === window.top;
  } catch {
    return true;
  }
}

function buildInterceptCacheExportItems() {
  /** @type {Map<string, string>} */
  const avatarByUid = new Map();
  for (const [uid, av] of interceptedAvatars) {
    if (uid && isHttpAvatarUrl(av) && !avatarByUid.has(uid)) {
      avatarByUid.set(uid, String(av).trim());
    }
  }
  for (const v of interceptedUsers.values()) {
    const uid = String(v?.uid || '').trim();
    const av = String(v?.av || '').trim();
    if (!uid || !isHttpAvatarUrl(av)) continue;
    if (!avatarByUid.has(uid)) avatarByUid.set(uid, av);
  }
  const items = [];
  for (const [no, v] of interceptedUsers) {
    const uid = String(v?.uid || '').trim();
    const name =
      String(v?.name || '').trim() ||
      (uid ? String(interceptedNicknames.get(uid) || '').trim() : '');
    const av =
      String(v?.av || '').trim() ||
      String(avatarByUid.get(uid) || '').trim();
    if (!uid && !name && !isHttpAvatarUrl(av)) continue;
    items.push({
      no: String(no || '').trim(),
      ...(uid ? { uid } : {}),
      ...(name ? { name } : {}),
      ...(isHttpAvatarUrl(av) ? { av } : {})
    });
  }
  const MAX = 12000;
  return items.length > MAX ? items.slice(items.length - MAX) : items;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!hasExtensionContext()) return;
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

  if (msg.type === 'NLS_CAPTURE_SCREENSHOT') {
    if (!isWatchPageMainFrameForMessages()) return;
    void (async () => {
      try {
        if (!isNicoLiveWatchUrl(window.location.href)) {
          sendResponse({ ok: false, errorCode: 'not_watch' });
          return;
        }
        const video = pickLargestVisibleVideo(document);
        if (!video) {
          sendResponse({ ok: false, errorCode: 'no_video' });
          return;
        }
        const cap = await captureVideoToPngDataUrl(video);
        if (cap.ok === false) {
          sendResponse({ ok: false, errorCode: cap.errorCode });
          return;
        }
        sendResponse({
          ok: true,
          mime: cap.mime,
          dataUrl: cap.dataUrl,
          liveId: liveId || ''
        });
      } catch {
        sendResponse({ ok: false, errorCode: 'capture_failed' });
      }
    })();
    return true;
  }

  if (msg.type === 'NLS_THUMB_STATS') {
    if (!isWatchPageMainFrameForMessages()) return;
    void (async () => {
      try {
        if (!liveId) {
          sendResponse({ ok: true, count: 0 });
          return;
        }
        const count = await countThumbsForLive(liveId);
        sendResponse({ ok: true, count });
      } catch {
        sendResponse({ ok: false, count: 0 });
      }
    })();
    return true;
  }

  if (msg.type === 'NLS_POST_COMMENT') {
    if (!canPostCommentInThisFrame()) return;
    const text =
      'text' in msg ? String(/** @type {{ text?: unknown }} */ (msg).text || '') : '';
    void postCommentFromContentAsync(text)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          ok: false,
          error:
            err && typeof err === 'object' && 'message' in err
              ? String(/** @type {{ message?: unknown }} */ (err).message || 'post_failed')
              : 'post_failed'
        })
      );
    return true;
  }

  if (msg.type === 'NLS_EXPORT_WATCH_SNAPSHOT') {
    /** watch 本体が iframe 内だけにある構成でもスナップショットを取れるよう、サブフレームも応答する */
    if (!canExportWatchSnapshotFromThisFrame()) {
      sendResponse({
        ok: false,
        error: 'watchページ以外では取得できません'
      });
      return;
    }
    syncLiveIdFromLocation();
    try {
      sendResponse({
        ok: true,
        snapshot: collectWatchPageSnapshot()
      });
    } catch (err) {
      sendResponse({
        ok: false,
        error:
          err && typeof err === 'object' && 'message' in err
            ? String(/** @type {{ message?: unknown }} */ (err).message || 'snapshot_error')
            : 'snapshot_error'
      });
    }
  }

  if (msg.type === 'NLS_EXPORT_INTERCEPT_CACHE') {
    if (!canExportWatchSnapshotFromThisFrame()) {
      sendResponse({
        ok: false,
        error: 'watchページ以外では取得できません'
      });
      return;
    }
    void (async () => {
      try {
        const deep =
          !!(
            msg &&
            typeof msg === 'object' &&
            'deep' in msg &&
            /** @type {{ deep?: unknown }} */ (msg).deep
          );
        if (deep && locationAllowsCommentRecording()) {
          const rows = await harvestVirtualCommentList({
            document,
            extractCommentsFromNode,
            waitMs: 42
          });
          for (const r of rows) {
            const no = String(r?.commentNo || '').trim();
            const uid = String(r?.userId || '').trim();
            if (!no) continue;
            const av = isHttpAvatarUrl(r?.avatarUrl) ? String(r.avatarUrl).trim() : '';
            if (!uid && !av) continue;
            const prev = interceptedUsers.get(no);
            const name = String(prev?.name || '').trim();
            const prevUid = String(prev?.uid || '').trim();
            const prevAv = isHttpAvatarUrl(prev?.av) ? String(prev?.av || '').trim() : '';
            interceptedUsers.set(no, {
              ...(uid || prevUid ? { uid: uid || prevUid } : {}),
              ...(name ? { name } : {}),
              ...(av || prevAv ? { av: av || prevAv } : {})
            });
            if (uid && av) interceptedAvatars.set(uid, av);
          }
        }
        sendResponse({ ok: true, items: buildInterceptCacheExportItems() });
      } catch {
        sendResponse({ ok: true, items: [] });
      }
    })();
    return true;
  }
});

function rememberWatchPageUrl() {
  if (!hasExtensionContext()) return;
  if (!isNicoLiveWatchUrl(window.location.href)) return;
  if (lastWatchUrlTimer) clearTimeout(lastWatchUrlTimer);
  lastWatchUrlTimer = setTimeout(() => {
    lastWatchUrlTimer = null;
    if (!hasExtensionContext()) return;
    chrome.storage.local
      .set({ [KEY_LAST_WATCH_URL]: window.location.href })
      .catch(() => {});
  }, 400);
}

async function readRecordingFlag() {
  if (!hasExtensionContext()) return false;
  const r = await chrome.storage.local.get(KEY_RECORDING);
  return isRecordingEnabled(r[KEY_RECORDING]);
}

function reconnectMutationObserver() {
  if (!mutationObserver) return;
  const nextRoot = pickCommentMutationObserverRoot(document);
  if (observedMutationRoot === nextRoot) return;
  mutationObserver.disconnect();
  observedMutationRoot = nextRoot;
  mutationObserver.observe(observedMutationRoot, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'src',
      'data-src',
      'data-lazy-src',
      'data-original',
      'srcset'
    ]
  });
}

function detectBroadcasterUserIdFromDom() {
  const now = Date.now();
  if (broadcasterUidCache && now - broadcasterUidCacheAt < 3000) {
    return broadcasterUidCache;
  }
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const streamLink = Array.from(
    document.querySelectorAll('a[href*="/user/"]')
  ).find((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    return (
      /\/user\/\d+/.test(href) &&
      /\/live_programs(?:\?|$)/.test(href) &&
      text &&
      !/^https?:\/\//i.test(text)
    );
  });
  const href = String(streamLink?.getAttribute('href') || '');
  const m = href.match(/\/user\/(\d+)/);
  broadcasterUidCache = m ? m[1] : '';
  broadcasterUidCacheAt = now;
  return broadcasterUidCache;
}

/**
 * DOM 抽出結果を interceptedUsers マップで補完（userId + nickname）
 * @param {ParsedCommentRow[]} rows
 * @returns {{ commentNo: string, text: string, userId: string|null, nickname?: string, avatarUrl?: string }[]}
 */
function enrichRowsWithInterceptedUserIds(rows) {
  if (!interceptedUsers.size && !interceptedNicknames.size && !interceptedAvatars.size) {
    return rows;
  }
  const broadcasterUid = detectBroadcasterUserIdFromDom();
  return rows.map((r) => {
    const no = String(r.commentNo ?? '').trim();
    const entry = no ? interceptedUsers.get(no) : undefined;
    const rowUid = r.userId ? String(r.userId).trim() : '';
    const interceptedUid = entry?.uid ? String(entry.uid).trim() : '';
    const rowLikelyContaminated =
      Boolean(rowUid && broadcasterUid && rowUid === broadcasterUid);
    const userId =
      (interceptedUid && (!rowUid || rowLikelyContaminated) ? interceptedUid : rowUid) ||
      interceptedUid ||
      null;
    const canUseInterceptMeta = Boolean(
      entry &&
        (
          (interceptedUid && userId === interceptedUid) ||
          String(entry?.name || '').trim() ||
          isHttpAvatarUrl(entry?.av)
        )
    );
    const rowNick = r.nickname ? String(r.nickname).trim() : '';
    const nickname =
      (canUseInterceptMeta ? String(entry?.name || '').trim() : '') ||
      rowNick ||
      (userId ? interceptedNicknames.get(String(userId)) : '') ||
      '';
    const rowAv = String(r.avatarUrl || '').trim();
    const av =
      rowAv ||
      (canUseInterceptMeta && isHttpAvatarUrl(entry?.av)
        ? String(entry?.av || '').trim()
        : userId && isHttpAvatarUrl(interceptedAvatars.get(String(userId)))
          ? String(interceptedAvatars.get(String(userId)) || '').trim()
        : '');
    return {
      ...r,
      userId,
      ...(nickname ? { nickname } : {}),
      ...(av ? { avatarUrl: av } : {})
    };
  });
}

/**
 * self-posted 保留キューと、今回新規保存されたコメントを 1対1 で突き合わせて確定させる。
 * 確定した分は entry.selfPosted=true を焼き込み、保留キューから消費する。
 *
 * @param {{ id?: string, text?: string, capturedAt?: number, selfPosted?: boolean }[]} added
 * @param {{ liveId?: string, at?: number, textNorm?: string }[]} pendingItems
 * @param {string} lid
 * @returns {{ markedIds: Set<string>, remainingItems: { liveId?: string, at?: number, textNorm?: string }[], changed: boolean }}
 */
function consumeMatchedSelfPostedRecents(added, pendingItems, lid) {
  const live = String(lid || '').trim().toLowerCase();
  const rows = Array.isArray(added) ? added : [];
  const items = Array.isArray(pendingItems) ? pendingItems : [];
  if (!live || !rows.length || !items.length) {
    return { markedIds: new Set(), remainingItems: items, changed: false };
  }

  const recents = items
    .map((it, itemIndex) => ({
      itemIndex,
      liveId: String(it?.liveId || '').trim().toLowerCase(),
      at: Number(it?.at) || 0,
      textNorm: String(it?.textNorm || '')
    }))
    .filter((it) => it.liveId === live && it.at > 0 && it.textNorm)
    .sort((a, b) => a.at - b.at || a.itemIndex - b.itemIndex);
  if (!recents.length) {
    return { markedIds: new Set(), remainingItems: items, changed: false };
  }

  /** @type {Map<string, { id: string, capturedAt: number, index: number }[]>} */
  const byText = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    const entry = rows[i];
    if (entry?.selfPosted) continue;
    const textNorm = normalizeCommentText(entry?.text);
    const id = String(entry?.id || '').trim();
    if (!textNorm || !id) continue;
    const bucket = byText.get(textNorm) || [];
    bucket.push({
      id,
      capturedAt: Number(entry?.capturedAt || 0),
      index: i
    });
    byText.set(textNorm, bucket);
  }
  for (const bucket of byText.values()) {
    bucket.sort((a, b) => {
      if (a.capturedAt !== b.capturedAt) return a.capturedAt - b.capturedAt;
      return a.index - b.index;
    });
  }

  const markedIds = new Set();
  const consumedIndexes = new Set();
  for (const recent of recents) {
    const bucket = byText.get(recent.textNorm);
    if (!bucket?.length) continue;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestIndex = Number.POSITIVE_INFINITY;
    for (const candidate of bucket) {
      if (markedIds.has(candidate.id)) continue;
      const cap = candidate.capturedAt;
      if (
        cap < recent.at - SELF_POST_MATCH_EARLY_MS ||
        cap > recent.at + SELF_POST_MATCH_LATE_MS
      ) {
        continue;
      }
      const delta = cap - recent.at;
      const score =
        Math.abs(delta) +
        (delta >= 0 ? 0 : SELF_POST_MATCH_EARLY_MS + 1);
      if (score < bestScore || (score === bestScore && candidate.index < bestIndex)) {
        best = candidate;
        bestScore = score;
        bestIndex = candidate.index;
      }
    }
    if (!best) continue;
    markedIds.add(best.id);
    consumedIndexes.add(recent.itemIndex);
  }

  if (!markedIds.size && !consumedIndexes.size) {
    return { markedIds, remainingItems: items, changed: false };
  }

  return {
    markedIds,
    remainingItems: items.filter((_, i) => !consumedIndexes.has(i)),
    changed: true
  };
}

/**
 * @param {unknown} raw
 * @returns {{ lives: Record<string, { liveId: string, commentCount: number, updatedAt: number, lastCommentAt: number, watchUrl: string, lastBackupAt: number, lastBackedUpdatedAt: number, lastBackupCount: number }> }}
 */
function normalizeAutoBackupState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawLives =
    src &&
    typeof src === 'object' &&
    'lives' in src &&
    src.lives &&
    typeof src.lives === 'object'
      ? src.lives
      : {};
  /** @type {Record<string, { liveId: string, commentCount: number, updatedAt: number, lastCommentAt: number, watchUrl: string, lastBackupAt: number, lastBackedUpdatedAt: number, lastBackupCount: number }>} */
  const lives = {};
  for (const [liveId, meta] of Object.entries(rawLives)) {
    const lid = String(liveId || '').trim().toLowerCase();
    if (!lid) continue;
    const row = meta && typeof meta === 'object' ? meta : {};
    lives[lid] = {
      liveId: lid,
      commentCount: Math.max(0, Number(row.commentCount) || 0),
      updatedAt: Math.max(0, Number(row.updatedAt) || 0),
      lastCommentAt: Math.max(0, Number(row.lastCommentAt) || 0),
      watchUrl: String(row.watchUrl || '').trim(),
      lastBackupAt: Math.max(0, Number(row.lastBackupAt) || 0),
      lastBackedUpdatedAt: Math.max(0, Number(row.lastBackedUpdatedAt) || 0),
      lastBackupCount: Math.max(0, Number(row.lastBackupCount) || 0)
    };
  }
  return { lives };
}

/**
 * @param {{ lives: Record<string, { liveId: string, commentCount: number, updatedAt: number, lastCommentAt: number, watchUrl: string, lastBackupAt: number, lastBackedUpdatedAt: number, lastBackupCount: number }> }} state
 */
function pruneAutoBackupLives(state) {
  const entries = Object.entries(state?.lives || {});
  if (entries.length <= AUTO_BACKUP_LIVES_MAX) return state;
  entries.sort((a, b) => {
    const aAt = Math.max(Number(a[1]?.updatedAt) || 0, Number(a[1]?.lastBackupAt) || 0);
    const bAt = Math.max(Number(b[1]?.updatedAt) || 0, Number(b[1]?.lastBackupAt) || 0);
    return bAt - aAt;
  });
  state.lives = Object.fromEntries(entries.slice(0, AUTO_BACKUP_LIVES_MAX));
  return state;
}

/** @param {ParsedCommentRow[]|null|undefined} rows */
async function persistCommentRows(rows) {
  if (
    !rows?.length ||
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !hasExtensionContext()
  ) {
    return;
  }
  const enriched = enrichRowsWithInterceptedUserIds(rows);
  const key = commentsStorageKey(liveId);
  try {
    const bag = await chrome.storage.local.get([
      key,
      KEY_SELF_POSTED_RECENTS,
      KEY_AUTO_BACKUP_STATE,
      KEY_LAST_WATCH_URL
    ]);
    const existing = Array.isArray(bag[key]) ? bag[key] : [];
    const pendingRaw = bag[KEY_SELF_POSTED_RECENTS];
    const pendingItems =
      pendingRaw && typeof pendingRaw === 'object' && Array.isArray(pendingRaw.items)
        ? pendingRaw.items.filter(
            (x) =>
              x &&
              typeof x.liveId === 'string' &&
              typeof x.textNorm === 'string' &&
              typeof x.at === 'number'
          )
        : [];
    const mergedRows = mergeNewComments(
      liveId,
      existing,
      enriched
    );
    let { next, storageTouched } = mergedRows;
    observedRecordedCommentCount = next.length;
    noteOfficialCommentSample(Date.now());
    const { added } = mergedRows;
    const consumed = consumeMatchedSelfPostedRecents(added, pendingItems, liveId);
    if (consumed.markedIds.size) {
      next = next.map((entry) => {
        const id = String(entry?.id || '').trim();
        if (!id || !consumed.markedIds.has(id) || entry?.selfPosted) return entry;
        return { ...entry, selfPosted: true };
      });
      storageTouched = true;
    }
    const pendingTouched = consumed.changed;
    if (!storageTouched && !pendingTouched) return;
    const updatedAt = Date.now();
    const lastCommentAt = Math.max(0, Number(next[next.length - 1]?.capturedAt || 0));
    const rememberedWatchUrl = String(bag[KEY_LAST_WATCH_URL] || '').trim();
    const backupWatchUrl = isNicoLiveWatchUrl(window.location.href)
      ? String(window.location.href || '')
      : extractLiveIdFromUrl(rememberedWatchUrl) === liveId
        ? rememberedWatchUrl
        : `https://live.nicovideo.jp/watch/${liveId}`;
    const autoBackupState = normalizeAutoBackupState(bag[KEY_AUTO_BACKUP_STATE]);
    const prevBackupMeta = autoBackupState.lives[String(liveId || '').trim().toLowerCase()] || {
      lastBackupAt: 0,
      lastBackedUpdatedAt: 0,
      lastBackupCount: 0
    };
    autoBackupState.lives[String(liveId || '').trim().toLowerCase()] = {
      liveId: String(liveId || '').trim().toLowerCase(),
      commentCount: next.length,
      updatedAt,
      lastCommentAt,
      watchUrl: backupWatchUrl,
      lastBackupAt: Math.max(0, Number(prevBackupMeta.lastBackupAt) || 0),
      lastBackedUpdatedAt: Math.max(0, Number(prevBackupMeta.lastBackedUpdatedAt) || 0),
      lastBackupCount: Math.max(0, Number(prevBackupMeta.lastBackupCount) || 0)
    };
    pruneAutoBackupLives(autoBackupState);
    await chrome.storage.local.set({
      [key]: next,
      [KEY_AUTO_BACKUP_STATE]: autoBackupState,
      ...(pendingTouched
        ? { [KEY_SELF_POSTED_RECENTS]: { items: consumed.remainingItems } }
        : {})
    });
    await chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR);
  } catch (err) {
    if (isContextInvalidatedError(err) || !hasExtensionContext()) return;
    try {
      await chrome.storage.local.set({
        [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err)
      });
    } catch {
      // no-op
    }
  }
}

function clearThumbTimer() {
  if (thumbTimerId != null) {
    clearInterval(thumbTimerId);
    thumbTimerId = null;
  }
}

function applyThumbSchedule() {
  clearThumbTimer();
  if (!hasExtensionContext()) return;
  if (!isNicoLiveWatchUrl(window.location.href)) return;
  if (!liveId) return;
  if (!thumbAuto || !thumbIntervalMs) return;
  if (!isIndexedDbAvailable()) return;

  thumbTimerId = setInterval(() => {
    void runThumbCaptureTick();
  }, thumbIntervalMs);
}

async function readThumbSettings() {
  if (!hasExtensionContext()) return;
  const bag = await chrome.storage.local.get([KEY_THUMB_AUTO, KEY_THUMB_INTERVAL_MS]);
  thumbAuto = isThumbAutoEnabled(bag[KEY_THUMB_AUTO]);
  thumbIntervalMs = normalizeThumbIntervalMsForHost(
    bag[KEY_THUMB_INTERVAL_MS],
    window.location.hostname
  );
}

async function runThumbCaptureTick() {
  if (!liveId || !isNicoLiveWatchUrl(window.location.href)) return;
  if (!isIndexedDbAvailable()) return;
  const video = pickLargestVisibleVideo(document);
  if (!video) return;
  const cap = await captureVideoToPngDataUrl(video);
  if (!cap.ok) return;
  try {
    const blob = await (await fetch(cap.dataUrl)).blob();
    await addThumbBlob(liveId, blob);
  } catch {
    // no-op
  }
}

function syncLiveIdFromLocation() {
  const href = window.location.href;
  if (isNicoLiveWatchUrl(href)) {
    rememberWatchPageUrl();
    const ctx = resolveWatchPageContext(href, liveId);
    if (ctx.liveIdChanged) {
      void clearCommentHarvestPanelDiagnostic();
      pendingRoots.clear();
      clearNdgrChatRowsPending();
      interceptedUsers.clear();
      interceptedNicknames.clear();
      interceptedAvatars.clear();
      activeUserTimestamps.clear();
      broadcasterUidCache = '';
      broadcasterUidCacheAt = 0;
      wsViewerCount = null;
      wsCommentCount = null;
      wsViewerCountUpdatedAt = 0;
      resetOfficialStatsState();
      programBeginAtMs = null;
      liveId = ctx.liveId;
      reconnectMutationObserver();
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest('live-id-change');
      applyThumbSchedule();
    } else {
      liveId = ctx.liveId;
      reconnectMutationObserver();
    }
    renderPageFrameOverlay();
    return;
  }

  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  if (hasWatchCommentPanel() && (!isTop || isNicoVideoJpHost(href))) {
    const fromUrl = extractLiveIdFromUrl(href);
    const fromDom = extractLiveIdFromDom(document);
    const next = fromUrl || fromDom || liveId;
    if (next !== liveId) {
      void clearCommentHarvestPanelDiagnostic();
      pendingRoots.clear();
      clearNdgrChatRowsPending();
      interceptedUsers.clear();
      interceptedNicknames.clear();
      interceptedAvatars.clear();
      activeUserTimestamps.clear();
      broadcasterUidCache = '';
      broadcasterUidCacheAt = 0;
      wsViewerCount = null;
      wsCommentCount = null;
      wsViewerCountUpdatedAt = 0;
      resetOfficialStatsState();
      programBeginAtMs = null;
      liveId = next;
      reconnectMutationObserver();
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest('live-id-change');
      applyThumbSchedule();
    } else {
      liveId = next;
      reconnectMutationObserver();
    }
    renderPageFrameOverlay();
    return;
  }

  liveId = null;
  void clearCommentHarvestPanelDiagnostic();
  clearNdgrChatRowsPending();
  clearThumbTimer();
  reconnectMutationObserver();
  hidePageFrameOverlay();
}

/** @param {Node|null|undefined} node */
function enqueueNode(node) {
  if (!node) return;
  if (node.nodeType === Node.ELEMENT_NODE) {
    pendingRoots.add(node);
  } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    node.childNodes.forEach((/** @type {Node} */ c) => enqueueNode(c));
  }
}

async function flushToStorage() {
  if (
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !pendingRoots.size
  ) {
    pendingRoots.clear();
    return;
  }

  /** @type {ParsedCommentRow[]} */
  const rows = [];
  for (const n of pendingRoots) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      extractCommentsFromNode(/** @type {Element} */ (n)).forEach(
        (/** @type {ParsedCommentRow} */ r) => rows.push(r)
      );
    }
  }
  pendingRoots.clear();

  if (!rows.length) return;
  await persistCommentRows(rows);
}

function scheduleFlush() {
  if (!recording || !liveId) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToStorage().catch(() => {});
  }, DEBOUNCE_MS);
}

/** @type {number|null} */
let deepHarvestTimer = null;
/** @param {string} _reason */
function scheduleDeepHarvest(_reason) {
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  if (deepHarvestTimer) clearTimeout(deepHarvestTimer);
  deepHarvestTimer = setTimeout(() => {
    deepHarvestTimer = null;
    runDeepHarvest().catch(() => {});
  }, DEEP_HARVEST_DELAY_MS);
}

async function runDeepHarvest() {
  if (
    harvestRunning ||
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording()
  ) {
    return;
  }
  harvestRunning = true;
  try {
    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode,
      waitMs: 55
    });
    await persistCommentRows(rows);
  } finally {
    harvestRunning = false;
  }
}

const COMMENT_PANEL_MISS_THRESHOLD = 5;
let commentPanelMissStreak = 0;
/** @type {null | 'warn'} */
let lastPublishedHarvestPanelState = null;

async function clearCommentHarvestPanelDiagnostic() {
  commentPanelMissStreak = 0;
  lastPublishedHarvestPanelState = null;
  if (!hasExtensionContext()) return;
  try {
    await chrome.storage.local.remove(KEY_COMMENT_PANEL_STATUS);
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      // no-op
    }
  }
}

async function syncCommentHarvestPanelStatus() {
  if (!hasExtensionContext()) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) {
    await clearCommentHarvestPanelDiagnostic();
    return;
  }
  const panel = findNicoCommentPanel(document);
  if (panel) {
    commentPanelMissStreak = 0;
    if (lastPublishedHarvestPanelState === 'warn') {
      lastPublishedHarvestPanelState = null;
      try {
        await chrome.storage.local.remove(KEY_COMMENT_PANEL_STATUS);
      } catch (err) {
        if (!isContextInvalidatedError(err)) {
          // no-op
        }
      }
    }
    return;
  }
  commentPanelMissStreak += 1;
  if (commentPanelMissStreak < COMMENT_PANEL_MISS_THRESHOLD) return;
  if (lastPublishedHarvestPanelState === 'warn') return;
  lastPublishedHarvestPanelState = 'warn';
  try {
    await chrome.storage.local.set({
      [KEY_COMMENT_PANEL_STATUS]: {
        ok: false,
        code: 'no_comment_panel',
        updatedAt: Date.now(),
        liveId: String(liveId).trim().toLowerCase()
      }
    });
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      // no-op
    }
  }
}

function scanVisibleCommentsNow() {
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  const panel = findNicoCommentPanel(document);
  const root = panel || document.body;
  const rows = extractCommentsFromNode(root);
  void persistCommentRows(rows);
  void syncCommentHarvestPanelStatus();
}

function attachCommentScrollHook() {
  const host = findCommentListScrollHost(document);
  if (!host || scrollHooked.has(host)) return false;
  scrollHooked.set(host, true);
  /** @type {number|null} */
  let t = null;
  host.addEventListener(
    'scroll',
    () => {
      if (!recording || !liveId) return;
      clearTimeout(t);
      t = setTimeout(() => scanVisibleCommentsNow(), 550);
    },
    { passive: true }
  );
  return true;
}

function tryAttachScrollHookSoon() {
  if (attachCommentScrollHook()) return;
  let n = 0;
  const id = setInterval(() => {
    n++;
    if (attachCommentScrollHook() || n > 40) clearInterval(id);
  }, 800);
}

/**
 * @returns {boolean}
 */
function hasWatchCommentPanel() {
  return !!(
    document.querySelector('.ga-ns-comment-panel') ||
    document.querySelector('.comment-panel')
  );
}

/**
 * all_frames 注入後も、広告 iframe 等では記録ループを回さない。
 * about:blank 内 SPA・embed 等は URL だけでは判定できないためコメントパネルで許可する。
 * @returns {boolean}
 */
function shouldRunWatchContentInThisFrame() {
  const href = String(window.location.href || '');
  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  if (isTop) {
    if (isNicoLiveWatchUrl(href)) return true;
    if (hasWatchCommentPanel() && isNicoVideoJpHost(href)) return true;
    return false;
  }
  return hasWatchCommentPanel();
}

/**
 * コメント記録・MutationObserver・flush 等
 * @returns {boolean}
 */
function locationAllowsCommentRecording() {
  return shouldRunWatchContentInThisFrame();
}

/**
 * スナップショット（視聴者数メタ等）を返してよいフレームか
 * @returns {boolean}
 */
function canExportWatchSnapshotFromThisFrame() {
  const href = String(window.location.href || '');
  if (isNicoLiveWatchUrl(href)) return true;
  if (!hasWatchCommentPanel()) return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return isNicoVideoJpHost(href);
}

const _pollDiag = { ran: 0, ok: 0, err: '', status: 0, htmlLen: 0, wcMatch: '', ccMatch: '' };
const POLL_TIMEOUT_MS = 12000;

async function pollStatsFromPage() {
  _pollDiag.ran += 1;
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tid = ac ? setTimeout(() => ac.abort(), POLL_TIMEOUT_MS) : null;
  try {
    const href = window.location.href;
    if (!href || !href.startsWith('http')) { _pollDiag.err = 'bad-href'; return; }
    const url = new URL(href);
    url.searchParams.delete('_nls_t');
    const resp = await fetch(url.href, {
      credentials: 'same-origin',
      ...(ac ? { signal: ac.signal } : {}),
    });
    if (tid) clearTimeout(tid);
    _pollDiag.status = resp.status;
    if (!resp.ok) { _pollDiag.err = `http-${resp.status}`; return; }
    let html = await resp.text();
    _pollDiag.htmlLen = html.length;
    if (html.includes('&quot;')) html = html.replace(/&quot;/g, '"');
    if (html.includes('&amp;')) html = html.replace(/&amp;/g, '&');
    const wc =
      html.match(/"watchCount"\s*:\s*(\d+)/) ||
      html.match(/"watching(?:Count)?"\s*:\s*(\d+)/i);
    _pollDiag.wcMatch = wc ? wc[0].substring(0, 40) : '';
    if (wc?.[1]) {
      const n = parseInt(wc[1], 10);
      if (Number.isFinite(n) && n >= 0) {
        wsViewerCount = n;
        wsViewerCountUpdatedAt = Date.now();
        _pollDiag.ok += 1;
      }
    }
    const cc =
      html.match(/"commentCount"\s*:\s*(\d+)/) ||
      html.match(/"comments"\s*:\s*(\d+)/);
    _pollDiag.ccMatch = cc ? cc[0].substring(0, 40) : '';
    if (cc?.[1]) {
      const n = parseInt(cc[1], 10);
      if (Number.isFinite(n) && n >= 0) {
        wsCommentCount = n;
      }
    }
    if (!wc && !cc) { _pollDiag.err = 'no-match'; }
  } catch (e) {
    if (tid) clearTimeout(tid);
    _pollDiag.err = String(e?.message || e || 'unknown').substring(0, 80);
  }
}

async function start() {
  if (!hasExtensionContext()) return;
  if (!shouldRunWatchContentInThisFrame()) return;
  recording = await readRecordingFlag();
  ensurePageFrameStyle();
  startPageFrameLoop();
  await loadPageFrameSettings().catch(() => {});
  bindNativeSelfPostedRecorder();

  mutationObserver = new MutationObserver((/** @type {MutationRecord[]} */ records) => {
    if (
      !recording ||
      !liveId ||
      !locationAllowsCommentRecording()
    ) {
      return;
    }
    for (const rec of records) {
      if (rec.type === 'childList') {
        rec.addedNodes.forEach((/** @type {Node} */ n) => enqueueNode(n));
      } else if (rec.type === 'characterData' && rec.target?.parentElement) {
        const row = rec.target.parentElement.closest?.(
          'div.table-row[data-comment-type="normal"]'
        );
        if (row) pendingRoots.add(row);
        else pendingRoots.add(rec.target.parentElement);
      } else if (rec.type === 'attributes' && rec.target?.nodeType === Node.ELEMENT_NODE) {
        const el = /** @type {Element} */ (rec.target);
        if (el.tagName === 'IMG') {
          const row = el.closest?.('div.table-row[data-comment-type="normal"]');
          if (row) pendingRoots.add(row);
        }
      }
    }
    if (pendingRoots.size) scheduleFlush();
  });

  syncLiveIdFromLocation();
  await readThumbSettings().catch(() => {});
  applyThumbSchedule();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!hasExtensionContext()) return;
    if (area !== 'local') return;

    if (changes[KEY_POPUP_FRAME] || changes[KEY_POPUP_FRAME_CUSTOM]) {
      loadPageFrameSettings().catch(() => {});
    }

    if (changes[KEY_INLINE_PANEL_WIDTH_MODE]) {
      inlinePanelWidthMode = normalizeInlinePanelWidthMode(
        changes[KEY_INLINE_PANEL_WIDTH_MODE].newValue
      );
      renderPageFrameOverlay();
    }

    if (changes[KEY_THUMB_AUTO] || changes[KEY_THUMB_INTERVAL_MS]) {
      readThumbSettings()
        .then(() => applyThumbSchedule())
        .catch(() => {});
    }

    if (changes[KEY_RECORDING]) {
      recording = isRecordingEnabled(changes[KEY_RECORDING].newValue);
      if (recording) {
        pendingRoots.add(document.body);
        reconnectMutationObserver();
        scheduleFlush();
        scheduleDeepHarvest('recording-on');
        tryAttachScrollHookSoon();
      } else {
        resetOfficialCommentSamplingState();
        void clearCommentHarvestPanelDiagnostic();
      }
    }
  });

  if (recording && liveId) {
    pendingRoots.add(document.body);
    scheduleFlush();
    scheduleDeepHarvest('startup');
    tryAttachScrollHookSoon();
    for (const ms of BOOTSTRAP_DELAYS_MS) {
      setTimeout(() => {
        if (recording && liveId && locationAllowsCommentRecording()) {
          scanVisibleCommentsNow();
        }
      }, ms);
    }
  }

  setInterval(() => {
    if (!hasExtensionContext()) return;
    syncLiveIdFromLocation();
  }, LIVE_POLL_MS);

  setInterval(() => {
    if (!hasExtensionContext()) return;
    if (
      !recording ||
      !liveId ||
      !locationAllowsCommentRecording()
    ) {
      return;
    }
    scanVisibleCommentsNow();
  }, LIVE_PANEL_SCAN_MS);

  pollStatsFromPage();
  setInterval(() => {
    if (!hasExtensionContext()) return;
    pollStatsFromPage();
  }, STATS_POLL_MS);
}

if (!document.documentElement.hasAttribute('data-nls-active')) {
  document.documentElement.setAttribute('data-nls-active', '1');
  start().catch(() => {});
}
