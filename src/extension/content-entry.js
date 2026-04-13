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
  KEY_INLINE_PANEL_PLACEMENT,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_FLOATING,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
  KEY_INLINE_FLOATING_ANCHOR,
  INLINE_FLOATING_ANCHOR_BOTTOM_LEFT,
  KEY_LAST_WATCH_URL,
  KEY_POPUP_FRAME,
  KEY_POPUP_FRAME_CUSTOM,
  KEY_RECORDING,
  KEY_DEEP_HARVEST_QUIET_UI,
  KEY_SELF_POSTED_RECENTS,
  KEY_USER_COMMENT_PROFILE_CACHE,
  KEY_COMMENT_PANEL_STATUS,
  KEY_COMMENT_INGEST_LOG,
  KEY_STORAGE_WRITE_ERROR,
  KEY_THUMB_AUTO,
  KEY_THUMB_INTERVAL_MS,
  commentsStorageKey,
  giftUsersStorageKey,
  isRecordingEnabled,
  isDeepHarvestQuietUiEnabled,
  normalizeInlinePanelWidthMode,
  normalizeInlinePanelPlacement,
  normalizeInlineFloatingAnchor
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
import {
  backfillNumericSyntheticAvatarsOnStoredComments,
  mergeNewComments,
  normalizeCommentText
} from '../lib/commentRecord.js';
import { anonymousNicknameFallback } from '../lib/nicoAnonymousDisplay.js';
import {
  applyUserCommentProfileMapToEntries,
  normalizeUserCommentProfileMap,
  pruneUserCommentProfileMap,
  readStorageBagWithRetry,
  upsertUserCommentProfileFromEntry,
  upsertUserCommentProfileFromIntercept
} from '../lib/userCommentProfileCache.js';
import { mergeGiftUsers } from '../lib/giftRecord.js';
import {
  COMMENT_SUBMIT_CONFIRM_PROBE_MS,
  waitUntilEditorReflectsSubmit
} from '../lib/commentSubmitConfirm.js';
import { findCommentSubmitButton } from '../lib/commentPostDom.js';
import { collectLoggedInViewerProfile } from '../lib/watchPageViewerProfile.js';
import {
  closestHarvestableNicoCommentRow,
  extractCommentsFromNode,
  NICO_USER_ICON_IMG_LAZY_ATTRS
} from '../lib/nicoliveDom.js';
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
  effectiveInlinePanelPlacement,
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
import { buildWatchSnapshotOfficialFields } from '../lib/watchSnapshotOfficialFields.js';
import {
  pickStrongestAvatarUrlForUser
} from '../lib/supportGrowthTileSrc.js';
import { mergeUserIdForEnrichment } from '../lib/userIdPreference.js';
import {
  COMMENT_INGEST_SOURCE,
  maybeAppendCommentIngestLog
} from '../lib/commentIngestLog.js';
import { migrateFloatingInlinePanelToDockOnce } from '../lib/migrateInlinePanelFloatToDock.js';
import { createPersistCoalescer } from '../lib/persistThrottle.js';
import { enrichmentAvatarWithCanonicalFallback } from '../lib/enrichmentAvatarFallback.js';
import { buildSilentErrorPayload, isContextInvalidatedError as isCtxInvalidated } from '../lib/reportSilentError.js';
import { cleanNdgrChatRows } from '../lib/cleanNdgrChatRows.js';
import { trimMapToMax } from '../lib/trimMap.js';
import { diagnosePersistGate } from '../lib/commentSubmitSteps.js';
import { INGEST_TIMING, SUBMIT_TIMING, MAP_LIMITS, HARVEST_TIMING } from '../lib/timingConstants.js';
import {
  shouldForceDeepHarvestForReason,
  shouldSkipDeepHarvest
} from '../lib/shouldSkipDeepHarvest.js';
import { DEEP_HARVEST_REASONS } from '../lib/deepHarvestReason.js';
import { planDeepExportSweep } from '../lib/deepExportPolicy.js';
import {
  mergeNdgrBacklogWithCap,
  shouldDeferNdgrFlushUntilLiveId
} from '../lib/ndgrBacklog.js';
import { mergeStoredCommentsWithIntercept } from '../lib/mergeStoredCommentsWithIntercept.js';
import {
  isWatchProgramEndedText,
  shouldRunEndedBulkHarvest
} from '../lib/watchProgramEndState.js';
import { hydrateInterceptAvatarMapFromProfile } from '../lib/interceptAvatarHydration.js';

/**
 * @typedef {{ commentNo: string, text: string, userId: string|null, avatarUrl?: string, avatarObserved?: boolean }} ParsedCommentRow
 */

const DEBOUNCE_MS = INGEST_TIMING.debounceMs;
const LIVE_POLL_MS = INGEST_TIMING.livePollMs;
const STATS_POLL_MS = INGEST_TIMING.statsPollMs;
/** 返信サジェスト等と同様に DOM 更新がテキスト差し替えだけのときの取りこぼし防止 */
const LIVE_PANEL_SCAN_MS = INGEST_TIMING.panelScanMs;
const DEEP_HARVEST_DELAY_MS = HARVEST_TIMING.delayMs;
/**
 * 仮想コメント一覧の deep harvest はスクロールホストの scrollTop を段階的に動かすため、
 * 視聴ページを開いた直後に「メインのコメントが滝のように流れる」ように見える。
 * 初回・録画ON 直後だけ遅らせ、ユーザーが画面に慣れてから走査する。
 * 長すぎるとこの間は仮想バッファ外の過去コメントが deep で拾えず、記録件数が伸びにくい。
 */
const DEEP_HARVEST_QUIET_UI_MS = HARVEST_TIMING.quietUiMs;
/**
 * runDeepHarvest の仮想走査: 待ちを短く・ステップを粗くし「滝」時間を圧縮（2pass で取りこぼし吸収）。
 * インターセプト export の deep は別途 waitMs を指定。
 */
const DEEP_HARVEST_SCROLL_WAIT_MS = HARVEST_TIMING.scrollWaitMs;
const DEEP_HARVEST_SCROLL_STEP_RATIO = 0.52;
/** 2 周目の deep の直前ギャップ（仮想 DOM の再配置で取りこぼした行の再出現を待つ） */
const DEEP_HARVEST_SECOND_PASS_GAP_MS = HARVEST_TIMING.secondPassGapMs;
/**
 * 長時間配信で仮想バッファ外の取りこぼしを減らす低頻度 deep（タブが visible で記録中のみ）。
 * QUIET UI は runDeepHarvest 内では使わず、定期経路も滝 UI 用ローディングは出さない。
 * quietScroll で滝を不可視にしつつ 90 秒間隔で走査。可視のみだと取りこぼしが大きい。
 */
const DEEP_HARVEST_PERIODIC_MS = HARVEST_TIMING.periodicMs;
/**
 * 初回（scheduleDeepHarvest 経由）の deep 成功後、仮想 DOM が落ち着いてからの軽い追い走査。
 * 定期 deep 直後に同タイマーが重なると「滝が二度続く」ため、定期開始時はタイマーを解除する。
 */
const DEEP_HARVEST_STABILITY_FOLLOWUP_MS = HARVEST_TIMING.stabilityFollowUpMs;
/** 長めの待ちのあいだ、ゆっくりりんくで「読み込み中」と示す（web_accessible と一致させる） */
const DEEP_HARVEST_LOADING_HOST_ID = 'nl-deep-harvest-loading';
const DEEP_HARVEST_LOADING_IMG_PATH =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
const BOOTSTRAP_DELAYS_MS = [400, 2000, 4500];
/** @type {ReturnType<typeof setTimeout>|null} */
let tabVisibleHarvestDebounceTimer = null;
/** visible 復帰時の重い再走査を抑える冷却時間 */
const TAB_VISIBLE_HARVEST_MIN_MS = 12_000;
let lastTabVisibleHarvestAt = 0;
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
/** deep harvest の遅延＋ローディング UI（storage、既定オン） */
let deepHarvestQuietUi = true;
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
/** statistics の comments が最後に更新された時刻（公式コメント数の鮮度用） */
let officialCommentStatsUpdatedAt = 0;
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
/** deep harvest 成功ごとに更新（スナップショット `_debug.harvestPipeline` 用） */
const deepHarvestPipelineStats = {
  lastCompletedAt: 0,
  lastRowCount: 0,
  runCount: 0,
  lastError: false
};
/** 直近の persistCommentRowsImpl に渡った行数（0 = 未実行またはスキップ） */
let lastPersistCommentBatchSize = 0;
/** @type {string[]} */
let lastPersistGateFailures = [];
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
const ACTIVE_USER_MAP_MAX = MAP_LIMITS.activeUserMax;
/** flushInterceptViewerJoin と page 側 viewerJoinDedupeAt と揃えた短時間重複抑制（ms） */
const VIEWER_JOIN_FLUSH_SUPPRESS_MS = 2500;
/** userId→nickname の補助マップ */
/** @type {Map<string, string>} */
const interceptedNicknames = new Map();
/** userId→avatarUrl の補助マップ */
/** @type {Map<string, string>} */
const interceptedAvatars = new Map();
/** commentNo→ユーザー補完用。長時間・高流量で古い番号から削ると一覧再走査の取りこぼしが増えやすい */
const INTERCEPT_MAP_MAX = MAP_LIMITS.interceptMax;

/** NDGR が最後にデータを送ってきた時刻（deep harvest スキップ判定用） */
let ndgrLastReceivedAt = 0;

/** NDGR 本文 postMessage をデバウンスして storage 書き込み回数を抑える */
/** @type {{ commentNo: string, text: string, userId: string|null, nickname?: string }[]} */
let ndgrChatRowsPending = [];
/** @type {ReturnType<typeof setTimeout>|null} */
let ndgrChatRowsFlushTimer = null;
const NDGR_CHAT_ROWS_FLUSH_MS = INGEST_TIMING.ndgrFlushMs;
/** バックログが大きいときはタイマーを待たずに flush（高流量時の遅延・競合緩和） */
const NDGR_PENDING_FLUSH_THRESHOLD = INGEST_TIMING.ndgrPendingThreshold;
/** liveId 未確定時の一時保持上限（古い行から切り捨て） */
const NDGR_PENDING_MAX = INGEST_TIMING.ndgrPendingMax;
const INTERCEPT_RECONCILE_MS = INGEST_TIMING.interceptReconcileMs;
const ENDED_HARVEST_CHECK_MS = INGEST_TIMING.endedHarvestCheckMs;

/** @type {{ no: string, uid: string, name: string, av: string }[]} */
let interceptReconcilePendingEntries = [];
/** @type {{ uid: string, name: string, av: string }[]} */
let interceptReconcilePendingUsers = [];
/** @type {ReturnType<typeof setTimeout>|null} */
let interceptReconcileTimer = null;
/** 配信終了後の一括 deep harvest 実行済み liveId */
let endedBulkHarvestTriggeredLiveId = '';
/** 配信終了判定の最終チェック時刻 */
let endedBulkHarvestLastCheckedAt = 0;

function clearNdgrChatRowsPending() {
  ndgrChatRowsPending.length = 0;
  if (ndgrChatRowsFlushTimer != null) {
    clearTimeout(ndgrChatRowsFlushTimer);
    ndgrChatRowsFlushTimer = null;
  }
}

function clearInterceptReconcilePending() {
  interceptReconcilePendingEntries.length = 0;
  interceptReconcilePendingUsers.length = 0;
  if (interceptReconcileTimer != null) {
    clearTimeout(interceptReconcileTimer);
    interceptReconcileTimer = null;
  }
}

/**
 * 視聴ページから「配信終了」らしき文言を軽量に拾う。
 * @returns {boolean}
 */
function detectWatchProgramEndedFromDom() {
  const candidates = [];
  const pushText = (v) => {
    const s = String(v || '').trim();
    if (!s) return;
    candidates.push(s.slice(0, 600));
  };
  try {
    pushText(document.querySelector('[class*="program" i] [class*="status" i]')?.textContent);
    pushText(document.querySelector('[class*="timeshift" i]')?.textContent);
    pushText(document.querySelector('main')?.textContent);
  } catch {
    // no-op
  }
  if (!candidates.length) return false;
  return candidates.some((t) => isWatchProgramEndedText(t));
}

function maybeRunEndedBulkHarvest() {
  if (!hasExtensionContext()) return;
  const now = Date.now();
  if (now - endedBulkHarvestLastCheckedAt < ENDED_HARVEST_CHECK_MS) return;
  endedBulkHarvestLastCheckedAt = now;
  const endedDetected = detectWatchProgramEndedFromDom();
  if (
    !shouldRunEndedBulkHarvest({
      recording,
      liveId,
      locationAllows: locationAllowsCommentRecording(),
      endedDetected,
      lastTriggeredLiveId: endedBulkHarvestTriggeredLiveId
    })
  ) {
    return;
  }
  endedBulkHarvestTriggeredLiveId = String(liveId || '').trim();
  void runDeepHarvest({ force: true }).catch((err) =>
    reportSilentErrorToStorage('endedBulkHarvest', err)
  );
}

/**
 * @param {{ no: string, uid: string, name: string, av: string }[]} entries
 * @param {{ uid: string, name: string, av: string }[]} users
 */
function queueInterceptReconcile(entries, users) {
  if (!entries.length && !users.length) return;
  interceptReconcilePendingEntries.push(...entries);
  interceptReconcilePendingUsers.push(...users);
  if (interceptReconcileTimer != null) return;
  interceptReconcileTimer = setTimeout(() => {
    interceptReconcileTimer = null;
    const entrySlice = interceptReconcilePendingEntries;
    const userSlice = interceptReconcilePendingUsers;
    interceptReconcilePendingEntries = [];
    interceptReconcilePendingUsers = [];
    void runInterceptReconcile(entrySlice, userSlice);
  }, INTERCEPT_RECONCILE_MS);
}

/**
 * @param {{ no: string, uid: string, name: string, av: string }[]} entries
 * @param {{ uid: string, name: string, av: string }[]} users
 */
async function runInterceptReconcile(entries, users) {
  if (!recording || !liveId || !locationAllowsCommentRecording() || !hasExtensionContext()) {
    return;
  }
  const lidAtQueue = liveId;
  const mergedByNo = new Map();
  for (const it of entries) {
    const no = String(it?.no || '').trim();
    if (!no) continue;
    const prev = mergedByNo.get(no) || { no, uid: '', name: '', av: '' };
    const uid = String(it?.uid || '').trim() || prev.uid;
    const name = String(it?.name || '').trim() || prev.name;
    const av = isHttpAvatarUrl(it?.av) ? String(it.av || '').trim() : prev.av;
    if (!uid && !name && !av) continue;
    mergedByNo.set(no, { no, uid, name, av });
  }
  const mergedUsersByUid = new Map();
  for (const u of users) {
    const uid = String(u?.uid || '').trim();
    if (!uid) continue;
    const prev = mergedUsersByUid.get(uid) || { uid, name: '', av: '' };
    const name = String(u?.name || '').trim() || prev.name;
    const av = isHttpAvatarUrl(u?.av) ? String(u.av || '').trim() : prev.av;
    mergedUsersByUid.set(uid, { uid, name, av });
  }
  const mergedItems = [...mergedByNo.values()];
  const mergedUsers = [...mergedUsersByUid.values()];
  if (!mergedItems.length && !mergedUsers.length) return;

  const key = commentsStorageKey(lidAtQueue);
  const job = persistCommentRowsChain.then(async () => {
    const bag = await readStorageBagWithRetry(
      () => chrome.storage.local.get([key, KEY_USER_COMMENT_PROFILE_CACHE]),
      { attempts: 4, delaysMs: [0, 50, 120, 280] }
    );
    const existing = Array.isArray(bag[key]) ? bag[key] : [];
    let next = existing;
    let commentsTouched = false;
    if (mergedItems.length) {
      const merged = mergeStoredCommentsWithIntercept(existing, mergedItems);
      if (merged.patched > 0) {
        next = merged.next;
        commentsTouched = true;
      }
    }

    let profileMap = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
    let cacheTouched = false;
    for (const it of mergedItems) {
      if (upsertUserCommentProfileFromIntercept(profileMap, { uid: it.uid, name: it.name, av: it.av })) {
        cacheTouched = true;
      }
    }
    for (const u of mergedUsers) {
      if (upsertUserCommentProfileFromIntercept(profileMap, u)) {
        cacheTouched = true;
      }
    }
    const applied = applyUserCommentProfileMapToEntries(next, profileMap);
    if (applied.patched > 0) {
      next = applied.next;
      commentsTouched = true;
    }
    const pruned = pruneUserCommentProfileMap(profileMap);
    if (Object.keys(pruned).length !== Object.keys(profileMap).length) {
      profileMap = pruned;
      cacheTouched = true;
    }
    if (!commentsTouched && !cacheTouched) return;
    /** @type {Record<string, unknown>} */
    const saveBag = {};
    if (commentsTouched) saveBag[key] = next;
    if (cacheTouched) saveBag[KEY_USER_COMMENT_PROFILE_CACHE] = profileMap;
    await chrome.storage.local.set(saveBag);
  });
  persistCommentRowsChain = job.catch((err) => reportSilentErrorToStorage('interceptReconcile', err));
  await job;
}

/**
 * @param {{ commentNo: string, text: string, userId: string|null, nickname?: string }[]} batch
 */
async function flushNdgrChatRowsBatch(batch) {
  if (!batch.length) return;
  if (
    shouldDeferNdgrFlushUntilLiveId({
      recording,
      locationAllows: locationAllowsCommentRecording(),
      liveId
    })
  ) {
    ndgrChatRowsPending = mergeNdgrBacklogWithCap(
      ndgrChatRowsPending,
      batch,
      NDGR_PENDING_MAX
    );
    if (ndgrChatRowsFlushTimer == null) {
      ndgrChatRowsFlushTimer = setTimeout(() => {
        ndgrChatRowsFlushTimer = null;
        const slice = ndgrChatRowsPending;
        ndgrChatRowsPending = [];
        void flushNdgrChatRowsBatch(slice);
      }, NDGR_CHAT_ROWS_FLUSH_MS);
    }
    return;
  }
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
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
  const merged = [...byKey.values()].map((r) => {
    const uid = String(r.userId || '').trim();
    const nick = anonymousNicknameFallback(uid, r.nickname);
    return nick ? { ...r, nickname: nick } : r;
  });
  for (const r of merged) {
    const u = String(r.userId || '').trim();
    const n = String(r.nickname || '').trim();
    if (u && n) interceptedNicknames.set(u, n);
  }
  await persistCommentRows(merged, { source: COMMENT_INGEST_SOURCE.NDGR });
}

/**
 * @param {{ commentNo: string, text: string, userId: string|null, nickname?: string }[]} rows
 */
function schedulePersistNdgrChatRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  if (!recording || !locationAllowsCommentRecording()) return;
  ndgrLastReceivedAt = Date.now();
  ndgrChatRowsPending = mergeNdgrBacklogWithCap(
    ndgrChatRowsPending,
    rows,
    NDGR_PENDING_MAX
  );
  if (ndgrChatRowsPending.length >= NDGR_PENDING_FLUSH_THRESHOLD) {
    if (ndgrChatRowsFlushTimer != null) {
      clearTimeout(ndgrChatRowsFlushTimer);
      ndgrChatRowsFlushTimer = null;
    }
    const slice = ndgrChatRowsPending;
    ndgrChatRowsPending = [];
    void flushNdgrChatRowsBatch(slice);
    return;
  }
  if (ndgrChatRowsFlushTimer != null) return;
  ndgrChatRowsFlushTimer = setTimeout(() => {
    ndgrChatRowsFlushTimer = null;
    const slice = ndgrChatRowsPending;
    ndgrChatRowsPending = [];
    void flushNdgrChatRowsBatch(slice);
  }, NDGR_CHAT_ROWS_FLUSH_MS);
}

/**
 * MAIN からの視聴者入室（ネットワーク優先）。コメント NDGR バッチとは別経路で即時反映する。
 * @param {unknown[]} viewers
 */
async function flushInterceptViewerJoin(viewers) {
  if (!Array.isArray(viewers) || !viewers.length) return;
  if (!liveId || !hasExtensionContext()) return;
  const seenNow = Date.now();
  /** 同一 postMessage 内の重複 userId を除外 */
  const seenInFlush = new Set();
  /** @type {Record<string, unknown>[]} */
  const applied = [];
  for (const v of viewers) {
    if (!v || typeof v !== 'object') continue;
    const uid = String(/** @type {{ userId?: unknown }} */ (v).userId || '').trim();
    if (!uid) continue;
    if (seenInFlush.has(uid)) continue;
    const lastActive = activeUserTimestamps.get(uid);
    if (
      lastActive != null &&
      seenNow - lastActive < VIEWER_JOIN_FLUSH_SUPPRESS_MS
    ) {
      continue;
    }
    seenInFlush.add(uid);
    applied.push(/** @type {Record<string, unknown>} */ (v));
  }
  if (!applied.length) return;
  for (const v of applied) {
    const uid = String(v.userId || '').trim();
    if (!uid) continue;
    const nick = String(v.nickname || '').trim();
    const iconRaw = String(v.iconUrl || '').trim();
    const icon = isHttpAvatarUrl(iconRaw) ? iconRaw : '';
    if (nick) interceptedNicknames.set(uid, nick);
    if (icon) interceptedAvatars.set(uid, icon);
    activeUserTimestamps.set(uid, seenNow);
  }
  if (activeUserTimestamps.size > ACTIVE_USER_MAP_MAX) {
    const excess = activeUserTimestamps.size - ACTIVE_USER_MAP_MAX;
    const iter = activeUserTimestamps.keys();
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value;
      if (key != null) activeUserTimestamps.delete(key);
    }
  }
  try {
    const bag = await chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE);
    const profileMap = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
    let cacheTouched = false;
    for (const v of applied) {
      const uid = String(v.userId || '').trim();
      if (!uid) continue;
      const nick = String(v.nickname || '').trim();
      const iconUrl = isHttpAvatarUrl(v.iconUrl)
        ? String(v.iconUrl || '').trim()
        : '';
      if (
        upsertUserCommentProfileFromEntry(profileMap, {
          userId: uid,
          nickname: nick,
          avatarUrl: iconUrl
        })
      ) {
        cacheTouched = true;
      }
    }
    if (cacheTouched) {
      await chrome.storage.local.set({ [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap });
    }
    await chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR);
  } catch (err) {
    if (isContextInvalidatedError(err) || !hasExtensionContext()) return;
    try {
      await chrome.storage.local.set({
        [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err)
      });
    } catch {
      /* no-op */
    }
  }
}

let broadcasterUidCache = '';
let broadcasterUidCacheAt = 0;

function isHttpAvatarUrl(v) {
  return /^https?:\/\//i.test(String(v || '').trim());
}

function resetOfficialStatsState() {
  officialViewerCount = null;
  officialCommentCount = null;
  officialCommentStatsUpdatedAt = 0;
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

/** `#embedded-data` の遅延出現後に programBeginAt を一度だけ埋める（L3 補助） */
function maybeFillProgramBeginFromEmbeddedData() {
  if (
    programBeginAtMs != null &&
    Number.isFinite(programBeginAtMs) &&
    programBeginAtMs > 0
  ) {
    return;
  }
  const props = extractEmbeddedDataProps(document);
  if (!props) return;
  const t = pickProgramBeginAt(props);
  if (t != null && Number.isFinite(t) && t > 0) {
    programBeginAtMs = t;
  }
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
    officialCommentStatsUpdatedAt = at;
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

  if (e.data.type === 'NLS_INTERCEPT_VIEWER_JOIN') {
    const raw = e.data.viewers;
    if (Array.isArray(raw) && raw.length) {
      const run = () => {
        void flushInterceptViewerJoin(raw);
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(run);
      else setTimeout(run, 0);
    }
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
      const cleaned = cleanNdgrChatRows(raw);
      if (cleaned.length) schedulePersistNdgrChatRows(cleaned);
    }
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_GIFT_USERS') {
    const raw = e.data.users;
    if (Array.isArray(raw) && raw.length && liveId && hasExtensionContext()) {
      const key = giftUsersStorageKey(liveId);
      chrome.storage.local.get(key).then((bag) => {
        const existing = Array.isArray(bag[key]) ? bag[key] : [];
        const { next, storageTouched } = mergeGiftUsers(existing, raw);
        if (storageTouched) {
          chrome.storage.local.set({ [key]: next }).catch((err) => {
            if (!isContextInvalidatedError(err) && hasExtensionContext()) {
              try {
                chrome.storage.local.set({
                  [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err)
                });
              } catch { /* best-effort */ }
            }
          });
        }
      }).catch((err) => reportSilentErrorToStorage('gift', err));
    }
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_COMMENT_POST') {
    const body = e.data.body;
    if (body && typeof body === 'object') {
      const no = String(body.no ?? body.commentNo ?? '').trim();
      const text = String(body.body ?? body.text ?? '').trim();
      if (no && text) {
        const uid = String(body.userId ?? body.user_id ?? '').trim() || null;
        persistCommentRows([{ commentNo: no, text, userId: uid }]);
      }
    }
    return;
  }

  if (e.data.type !== 'NLS_INTERCEPT_USERID') return;
  const entries = e.data.entries;
  const users = e.data.users;
  const seenNow = Date.now();
  /** @type {{ uid: string, name: string, av: string }[]} */
  const reconcileUsers = [];
  /** @type {{ no: string, uid: string, name: string, av: string }[]} */
  const reconcileEntries = [];
  if (Array.isArray(users)) {
    for (const { uid, name, av } of users) {
      const sUid = String(uid || '').trim();
      const sName = String(name || '').trim();
      const sAv = isHttpAvatarUrl(av) ? String(av).trim() : '';
      if (!sUid) continue;
      if (sName) interceptedNicknames.set(sUid, sName);
      if (sAv) interceptedAvatars.set(sUid, sAv);
      activeUserTimestamps.set(sUid, seenNow);
      reconcileUsers.push({ uid: sUid, name: sName, av: sAv });
    }
  }
  if (Array.isArray(entries)) {
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
      reconcileEntries.push({ no: sNo, uid: sUid, name: sName, av: sAv });
    }
  }
  trimMapToMax(activeUserTimestamps, ACTIVE_USER_MAP_MAX);
  trimMapToMax(interceptedUsers, INTERCEPT_MAP_MAX);
  queueInterceptReconcile(reconcileEntries, reconcileUsers);
});
/** @type {number|null} */
let lastWatchUrlTimer = null;

const PAGE_FRAME_STYLE_ID = 'nls-watch-prikura-style';
const PAGE_FRAME_OVERLAY_ID = 'nls-watch-prikura-frame';
const INLINE_POPUP_HOST_ID = 'nls-inline-popup-host';
const INLINE_POPUP_IFRAME_ID = 'nls-inline-popup-iframe';
const KEY_AI_SHARE_FAST_DIAG = 'nls_ai_share_fast_diag_v1';

/** getElementById はツリー未接続ノードに効かないため、ホストは参照を保持する */
/** @type {HTMLDivElement|null} */
let nlsInlinePopupHostSingleton = null;

/** インラインパネル描画の例外（AI 共有・切り分け用） */
const nlsInlinePanelRenderErrors = [];
const NLS_INLINE_PANEL_RENDER_ERR_MAX = 14;

function noteInlinePanelRenderError(where, err) {
  try {
    nlsInlinePanelRenderErrors.push({
      t: Date.now(),
      where: String(where || '').slice(0, 80),
      message: String(
        err && typeof err === 'object' && 'message' in err
          ? /** @type {{ message?: unknown }} */ (err).message
          : err || ''
      ).slice(0, 500)
    });
    while (nlsInlinePanelRenderErrors.length > NLS_INLINE_PANEL_RENDER_ERR_MAX) {
      nlsInlinePanelRenderErrors.shift();
    }
  } catch {
    // no-op
  }
}
const PAGE_FRAME_LOOP_MS = INGEST_TIMING.pageFrameLoopMs;
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
let aiShareFastDiagLastPersistAt = 0;

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
      opacity: 0;
      transition: opacity 0.25s ease-in-out;
      pointer-events: auto;
      position: relative;
      z-index: 2147482000;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      flex: 0 0 auto;
      flex-shrink: 0;
      align-self: flex-start;
    }
    #${INLINE_POPUP_HOST_ID}:focus,
    #${INLINE_POPUP_HOST_ID}:focus-within {
      outline: none !important;
      box-shadow: none !important;
    }
    #${INLINE_POPUP_HOST_ID} iframe {
      width: 100%;
      /* 応援グリッドが見える高さにしつつ、旧 820px 級の塔は避ける（内側スクロール） */
      height: min(560px, 58vh);
      min-height: 240px;
      max-height: min(720px, 72vh);
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
    #${INLINE_POPUP_HOST_ID}.nls-inline-host--floating {
      -webkit-overflow-scrolling: touch;
    }
    #${INLINE_POPUP_HOST_ID}.nls-inline-host--dock-bottom {
      -webkit-overflow-scrolling: touch;
      min-height: 200px;
      /* 読み込み遅延時に黒ベタ面が残らないよう透明寄りにする */
      background: transparent;
    }
    #${INLINE_POPUP_HOST_ID}.nls-inline-host--dock-bottom iframe {
      width: 100% !important;
      height: min(520px, 52vh);
      min-height: 220px;
      max-height: min(680px, 56vh);
      background: transparent;
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

/**
 * 重複 host を掃除し、使うべき inline host を 1 つに決める。
 * @returns {HTMLDivElement|null}
 */
function pickPrimaryInlinePopupHostFromDom() {
  /** @type {HTMLDivElement[]} */
  const hosts = Array.from(
    document.querySelectorAll(`#${INLINE_POPUP_HOST_ID}`)
  ).filter((n) => n instanceof HTMLDivElement);
  if (!hosts.length) return null;
  const connected = hosts.filter((h) => h.isConnected);
  const primary = connected[0] || hosts[0];
  for (const h of hosts) {
    if (h === primary) continue;
    try {
      h.remove();
    } catch {
      // no-op
    }
  }
  return primary;
}

/** @param {HTMLDivElement} host */
function ensureInlinePopupIframe(host) {
  if (!(host instanceof HTMLDivElement)) return;
  let iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = INLINE_POPUP_IFRAME_ID;
    iframe.setAttribute('title', 'nicolivelog inline panel');
    iframe.setAttribute('allow', 'microphone');
    iframe.style.pointerEvents = 'auto';
    iframe.style.visibility = 'hidden';
    host.appendChild(iframe);
  }
  const expectedSrc = (() => {
    try {
      return chrome.runtime.getURL('popup.html') + '?inline=1';
    } catch {
      return '';
    }
  })();
  const currentSrc = String(iframe.getAttribute('src') || '').trim();
  if (expectedSrc && currentSrc !== expectedSrc) {
    iframe.setAttribute('src', expectedSrc);
  }
  iframe.addEventListener(
    'load',
    () => {
      requestAnimationFrame(() => {
        iframe.style.visibility = 'visible';
        host.style.opacity = '1';
      });
    },
    { once: true }
  );
  setTimeout(() => {
    iframe.style.visibility = 'visible';
    host.style.opacity = '1';
  }, 2000);
}

function ensureInlinePopupHost() {
  let host = pickPrimaryInlinePopupHostFromDom();
  if (host) {
    ensureInlinePopupIframe(host);
    if (host.style.opacity !== '1') host.style.opacity = '1';
    nlsInlinePopupHostSingleton = host;
    return host;
  }
  if (
    nlsInlinePopupHostSingleton &&
    nlsInlinePopupHostSingleton.id === INLINE_POPUP_HOST_ID
  ) {
    ensureInlinePopupIframe(nlsInlinePopupHostSingleton);
    return nlsInlinePopupHostSingleton;
  }
  host = document.createElement('div');
  host.id = INLINE_POPUP_HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  host.style.display = 'none';
  host.style.pointerEvents = 'auto';
  host.style.width = '100%';

  ensureInlinePopupIframe(host);
  nlsInlinePopupHostSingleton = host;
  return host;
}

/**
 * インラインホストが insertAfter の直後（Element ツリー上）に付いているか。
 * 間に空白 Text だけが入ると `previousSibling === insertAfter` にならず、毎ティック誤って
 * insertBefore し続け公式コメント欄が滝のように再描画されることがある。
 * @param {HTMLElement} host
 * @param {ParentNode} hostParent
 * @param {HTMLElement} insertAfter
 */
function inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter) {
  if (!(host instanceof HTMLElement) || !(insertAfter instanceof HTMLElement)) {
    return (
      host.parentNode === hostParent && host.previousSibling === insertAfter
    );
  }
  return (
    host.parentNode === hostParent &&
    host.previousElementSibling === insertAfter
  );
}

/** 画面上固定モード用のインラインスタイルを消し、プレイヤー周りへの再挿入に備える */
function clearInlineHostFloatingLayout(host) {
  if (!(host instanceof HTMLElement)) return;
  host.classList.remove('nls-inline-host--floating');
  host.classList.remove('nls-inline-host--dock-bottom');
  host.style.position = '';
  host.style.top = '';
  host.style.right = '';
  host.style.left = '';
  host.style.bottom = '';
  host.style.maxHeight = '';
  host.style.overflow = '';
  host.style.overflowX = '';
  host.style.overflowY = '';
  host.style.boxShadow = '';
  host.style.borderRadius = '';
  host.style.background = '';
  host.style.zIndex = '';
}

/**
 * 拡張アイコンを押したときのポップアップに近い、画面角に fixed するパネル（プレイヤー DOM 非依存）。
 * 角は `inlineFloatingAnchor`（storage: nls_inline_floating_anchor）。
 */
function renderInlinePanelFloatingHost() {
  const host = ensureInlinePopupHost();
  host.classList.remove('nls-inline-host--dock-bottom');
  const viewport = nlsViewportSize();
  let vh = Number(viewport.innerHeight) || 0;
  if (vh < 200) vh = 640;
  const pad = 12;
  const panelW = Math.min(420, Math.max(280, viewport.innerWidth - pad * 2));
  const maxH = Math.min(Math.round(vh * 0.92), 900);
  const iframeH = Math.min(580, Math.round(vh * 0.78));

  if (host.parentNode !== document.body) {
    document.body.appendChild(host);
  }
  host.classList.add('nls-inline-host--floating');
  host.style.position = 'fixed';
  if (inlineFloatingAnchor === INLINE_FLOATING_ANCHOR_BOTTOM_LEFT) {
    host.style.top = '';
    host.style.right = '';
    host.style.bottom = `calc(${pad}px + env(safe-area-inset-bottom, 0px))`;
    host.style.left = `calc(${pad}px + env(safe-area-inset-left, 0px))`;
  } else {
    host.style.bottom = '';
    host.style.left = '';
    host.style.top = `calc(${pad}px + env(safe-area-inset-top, 0px))`;
    host.style.right = `calc(${pad}px + env(safe-area-inset-right, 0px))`;
  }
  host.style.width = `${panelW}px`;
  host.style.maxWidth = `${panelW}px`;
  host.style.maxHeight = `${maxH}px`;
  host.style.overflow = 'auto';
  host.style.overflowX = 'hidden';
  host.style.marginLeft = '0';
  host.style.boxSizing = 'border-box';
  host.style.zIndex = '2147483646';
  host.style.boxShadow =
    '0 12px 40px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(15, 23, 42, 0.08)';
  host.style.borderRadius = '14px';
  host.style.background = 'transparent';

  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe) {
    iframe.style.width = `${panelW}px`;
    iframe.style.height = `${Math.min(iframeH, maxH - 12)}px`;
    iframe.style.maxHeight = `${Math.min(iframeH, maxH - 12)}px`;
  }
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
}

/**
 * 視聴ページ下部にビューポート固定で広げる（ポップアップ風より視認しやすい既定用）。
 * プレイヤー DOM 非依存のため、ターゲット video の遅延があっても先に出せる。
 */
function renderInlinePanelDockBottomHost() {
  const host = ensureInlinePopupHost();
  clearInlineHostFloatingLayout(host);
  host.classList.remove('nls-inline-host--floating');
  host.classList.add('nls-inline-host--dock-bottom');
  const viewport = nlsViewportSize();
  let vh = Number(viewport.innerHeight) || 0;
  if (vh < 280) vh = 720;
  const maxDockH = watchDockPanelMaxHeightPx();
  const iframeInnerH = Math.max(
    200,
    Math.min(maxDockH - 16, Math.round(vh * 0.5))
  );

  if (host.parentNode !== document.body) {
    document.body.appendChild(host);
  }
  host.style.position = 'fixed';
  host.style.left = '0';
  host.style.right = '0';
  host.style.bottom = 'env(safe-area-inset-bottom, 0px)';
  host.style.top = '';
  host.style.width = '100%';
  host.style.maxWidth = '100%';
  host.style.maxHeight = `${maxDockH}px`;
  host.style.marginLeft = '0';
  host.style.overflow = 'auto';
  host.style.overflowX = 'hidden';
  host.style.boxSizing = 'border-box';
  host.style.zIndex = '2147483646';
  host.style.boxShadow =
    '0 -10px 36px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06)';
  host.style.borderRadius = '14px 14px 0 0';
  host.style.background = 'transparent';

  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe) {
    iframe.style.width = '100%';
    iframe.style.height = `${iframeInnerH}px`;
    iframe.style.maxHeight = `${iframeInnerH}px`;
  }
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
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
  /*
   * comment-data-grid 等と union すると「視聴行」より画面全体級に膨らむことがある。
   * 挿入アンカー（プレイヤー列ラッパー）の幅を上限に戻し、埋め込みパネルが横に暴れないようにする。
   */
  if (ar.width >= 260 && best.width > ar.width + 4) {
    best = {
      left: ar.left,
      top: Math.min(best.top, ar.top),
      width: ar.width,
      height: Math.max(best.height, ar.height)
    };
  }

  return best;
}

/** インラインパネル幅モード（storage から更新） */
let inlinePanelWidthMode = normalizeInlinePanelWidthMode(undefined);

/** インラインパネル配置（below＝プレイヤー行の下・beside＝親 flex 任せ） */
let inlinePanelPlacementMode = normalizeInlinePanelPlacement(undefined);

/** floating 時の画面角（top_right＝従来・bottom_left＝左下固定） */
let inlineFloatingAnchor = normalizeInlineFloatingAnchor(undefined);

/**
 * ShadowRoot 直下ノードは parentElement が null でも、parentNode 上では insertBefore 可能。
 * ここを無視すると hostParent が常に null になりパネルが一度も DOM に載らない。
 * @param {HTMLElement} el
 * @returns {ParentNode|null}
 */
function insertionParentForElement(el) {
  if (!(el instanceof HTMLElement)) return null;
  if (el.parentElement) return el.parentElement;
  const pn = el.parentNode;
  if (
    pn &&
    typeof pn.insertBefore === 'function' &&
    typeof pn.appendChild === 'function'
  ) {
    return /** @type {ParentNode} */ (pn);
  }
  return null;
}

/**
 * ホストの挿入先（HTMLElement または ShadowRoot）。getBoundingClientRect は ShadowRoot に無い。
 * @param {ParentNode|null|undefined} hostParent
 * @param {{ innerWidth: number, innerHeight: number }} viewport
 */
function getInsertionContainerRect(hostParent, viewport) {
  if (hostParent instanceof HTMLElement) {
    const r = hostParent.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height
    };
  }
  if (hostParent instanceof ShadowRoot) {
    const h = hostParent.host;
    if (h instanceof HTMLElement) {
      const r = h.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height
      };
    }
  }
  return {
    left: 0,
    top: 0,
    width: viewport.innerWidth,
    height: viewport.innerHeight
  };
}

/**
 * flex 行の子にパネルを置くとワイド画面で動画の横に回り込む。`below` では行コンテナの直後へ逃がす。
 * @param {HTMLElement} domAnchor findFrameInsertAnchorFromVideo の結果
 * @param {string} placement normalizeInlinePanelPlacement の戻り
 * @returns {{ insertAfter: HTMLElement, hostParent: ParentNode|null }}
 */
function resolveInlinePanelInsertAnchor(domAnchor, placement) {
  if (!(domAnchor instanceof HTMLElement)) {
    return {
      insertAfter: /** @type {HTMLElement} */ (domAnchor),
      hostParent: null
    };
  }
  if (
    placement === INLINE_PANEL_PLACEMENT_FLOATING ||
    placement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
  ) {
    return {
      insertAfter: domAnchor,
      hostParent: null
    };
  }
  if (placement === INLINE_PANEL_PLACEMENT_BESIDE) {
    return {
      insertAfter: domAnchor,
      hostParent: insertionParentForElement(domAnchor)
    };
  }
  const rowLikeEl = domAnchor.parentElement;
  if (!rowLikeEl) {
    return {
      insertAfter: domAnchor,
      hostParent: insertionParentForElement(domAnchor)
    };
  }
  try {
    const cs = window.getComputedStyle(rowLikeEl);
    const isRowFlex =
      cs.display === 'flex' &&
      (cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse');
    if (isRowFlex) {
      const rowHostParent = insertionParentForElement(rowLikeEl);
      if (rowHostParent) {
        return { insertAfter: rowLikeEl, hostParent: rowHostParent };
      }
    }
  } catch {
    // no-op
  }
  return {
    insertAfter: domAnchor,
    hostParent: insertionParentForElement(domAnchor)
  };
}

/**
 * 横付き: `<video>` の直後だとプレイヤー内ラッパー（overflow 等）に閉じ込められ見えないことがある。
 * 視聴行の flex で「動画側カラム」（video を含む直接の子ブロック）の次へ出す。
 * @param {HTMLVideoElement} video
 * @returns {{ insertAfter: HTMLElement, hostParent: ParentNode }|null}
 */
function findBesideFlexRowColumnInsertion(video) {
  if (!(video instanceof HTMLElement)) return null;
  const vw = window.innerWidth;
  const minRowW = Math.min(720, Math.max(400, vw * 0.46));
  let node = video;
  for (let depth = 0; depth < 24 && node && node !== document.body; depth++) {
    const parent = node.parentElement;
    if (!parent) break;
    try {
      const cs = window.getComputedStyle(parent);
      const isRowFlex =
        cs.display === 'flex' &&
        (cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse');
      if (
        isRowFlex &&
        node.parentElement === parent &&
        parent.children.length >= 2
      ) {
        const rr = parent.getBoundingClientRect();
        if (rr.width >= minRowW) {
          return { insertAfter: node, hostParent: parent };
        }
      }
    } catch {
      // no-op
    }
    node = parent;
  }
  return null;
}

/**
 * 幅はモードに応じて視聴行または video のみ。DOM 上はプレイヤー列（findFrameInsertAnchorFromVideo）の直後に置く。
 */
function renderInlineHostAnchoredToVideo(video) {
  clearInlineHostFloatingLayout(ensureInlinePopupHost());
  const placement = getEffectiveInlinePanelPlacement();
  if (placement === INLINE_PANEL_PLACEMENT_FLOATING) {
    renderInlinePanelFloatingHost();
    return;
  }
  if (placement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
    renderInlinePanelDockBottomHost();
    return;
  }
  const domAnchor = findFrameInsertAnchorFromVideo(video);
  const insertResolveAnchor =
    placement === INLINE_PANEL_PLACEMENT_BESIDE ? video : domAnchor;

  /** @type {HTMLElement} */
  let insertAfter;
  /** @type {ParentNode|null} */
  let hostParent;
  /** flex 行の子として「動画列の次」に置けた（ニコ生の内側ラッパー脱出） */
  let besideFlexRowColumn = false;

  if (placement === INLINE_PANEL_PLACEMENT_BESIDE) {
    const col = findBesideFlexRowColumnInsertion(video);
    if (col?.hostParent && col.insertAfter) {
      insertAfter = col.insertAfter;
      hostParent = col.hostParent;
      besideFlexRowColumn = true;
    } else {
      const r = resolveInlinePanelInsertAnchor(
        insertResolveAnchor,
        placement
      );
      insertAfter = /** @type {HTMLElement} */ (r.insertAfter);
      hostParent = r.hostParent;
    }
  } else {
    const r = resolveInlinePanelInsertAnchor(domAnchor, placement);
    insertAfter = /** @type {HTMLElement} */ (r.insertAfter);
    hostParent = r.hostParent;
  }

  /** 挿入解決が完全に失敗したときでもパネルゼロを避ける（body 末尾・簡易幅） */
  let hostAttachFallbackBody = false;
  if (!hostParent) {
    hostParent = document.body;
    hostAttachFallbackBody = true;
  }
  const host = ensureInlinePopupHost();
  const vr = video.getBoundingClientRect();
  if (vr.width < 260 || vr.height < 140) {
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
    return;
  }
  const viewport = nlsViewportSize();
  const pr = getInsertionContainerRect(hostParent, viewport);
  /*
   * 行の途中カラムに入るときは player_row 幅（視聴行全体）だと列からはみ出すので video 基準に寄せる。
   */
  const mode =
    besideFlexRowColumn || inlinePanelWidthMode === 'video'
      ? 'video'
      : 'player_row';
  const rowRect =
    mode === 'player_row' ? resolvePlayerRowRect(video, domAnchor) : null;
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
  if (hostAttachFallbackBody) {
    if (host.parentNode !== hostParent) hostParent.appendChild(host);
  } else {
    if (
      !inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter)
    ) {
      insertAfter.insertAdjacentElement('afterend', host);
    }
  }
  host.style.boxSizing = 'border-box';
  host.style.marginLeft =
    hostAttachFallbackBody || besideFlexRowColumn ? '0' : `${marginLeftPx}px`;
  host.style.maxWidth = '100%';
  host.style.width = hostAttachFallbackBody
    ? `${Math.min(720, Math.max(320, Math.round(viewport.innerWidth - 24)))}px`
    : `${panelWidthPx}px`;
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe)
    iframe.style.width = hostAttachFallbackBody
      ? host.style.width
      : `${panelWidthPx}px`;
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
}

/** @param {HTMLElement} target */
function renderInlinePopupHost(target) {
  if (!(target instanceof HTMLElement)) return;
  clearInlineHostFloatingLayout(ensureInlinePopupHost());
  const effPlacement = getEffectiveInlinePanelPlacement();
  if (effPlacement === INLINE_PANEL_PLACEMENT_FLOATING) {
    renderInlinePanelFloatingHost();
    return;
  }
  if (effPlacement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
    renderInlinePanelDockBottomHost();
    return;
  }

  /*
   * ラッパー div がターゲットでも内側 video の表示幅が 260 未満（レターボックス等）だと
   * renderInlineHostAnchoredToVideo が即非表示にする。旧挙動はラッパー基準で出していたので、
   * その場合はコンテナ経路へ落とす。
   */
  let video = null;
  if (target instanceof HTMLVideoElement) {
    video = target;
  } else {
    const cand = pickInlinePanelVideoWithinTarget(target);
    if (cand) {
      const vr = cand.getBoundingClientRect();
      if (vr.width >= 260 && vr.height >= 140) {
        video = cand;
      }
    }
  }
  if (video) {
    renderInlineHostAnchoredToVideo(video);
    return;
  }

  const currentRect = target.getBoundingClientRect();
  const hostEarly = ensureInlinePopupHost();
  if (currentRect.width < 260 || currentRect.height < 140) {
    hostEarly.style.display = 'none';
    hostEarly.setAttribute('aria-hidden', 'true');
    return;
  }

  const placement = getEffectiveInlinePanelPlacement();
  const { insertAfter, hostParent: resolvedHostParent } =
    resolveInlinePanelInsertAnchor(target, placement);
  let hostParent = resolvedHostParent;
  let hostAttachFallbackBody = false;
  if (!hostParent) {
    hostParent = document.body;
    hostAttachFallbackBody = true;
  }

  const host = ensureInlinePopupHost();
  const viewport = nlsViewportSize();
  const pr = getInsertionContainerRect(hostParent, viewport);
  const mode =
    inlinePanelWidthMode === 'video' ? 'video' : 'player_row';
  const rowRect =
    mode === 'player_row'
      ? {
          left: currentRect.left,
          top: currentRect.top,
          width: currentRect.width,
          height: currentRect.height
        }
      : null;
  const { panelWidthPx, marginLeftPx } = computeInlinePanelLayout(mode, {
    videoRect: {
      width: currentRect.width,
      height: currentRect.height,
      top: currentRect.top,
      left: currentRect.left
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

  if (hostAttachFallbackBody) {
    if (host.parentNode !== hostParent) hostParent.appendChild(host);
  } else {
    if (
      !inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter)
    ) {
      insertAfter.insertAdjacentElement('afterend', host);
    }
  }
  host.style.boxSizing = 'border-box';
  host.style.marginLeft = hostAttachFallbackBody ? '0' : `${marginLeftPx}px`;
  host.style.maxWidth = '100%';
  host.style.width = hostAttachFallbackBody
    ? `${Math.min(720, Math.max(320, Math.round(viewport.innerWidth - 24)))}px`
    : `${panelWidthPx}px`;
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe)
    iframe.style.width = hostAttachFallbackBody
      ? host.style.width
      : `${panelWidthPx}px`;
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
}

function hidePageFrameOverlay() {
  const overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
  if (overlay) overlay.style.display = 'none';
  const host =
    nlsInlinePopupHostSingleton ||
    document.getElementById(INLINE_POPUP_HOST_ID);
  if (host) {
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
  }
  stableFrameTarget = null;
  syncWatchPageDockBodyReserve();
}

function inlineHostLooksVisible() {
  const host =
    nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
  if (!(host instanceof HTMLElement)) return false;
  if (!host.isConnected) return false;
  const cs = window.getComputedStyle(host);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  const r = host.getBoundingClientRect();
  return r.width >= 120 && r.height >= 120;
}

function buildAiShareFastDiagnosticsPayload() {
  const href = String(window.location.href || '');
  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  const target = findWatchFrameTargetElement();
  /** @type {Record<string, unknown>|null} */
  let targetBrief = null;
  if (target instanceof HTMLElement) {
    const r = target.getBoundingClientRect();
    targetBrief = {
      tag: String(target.tagName || '').toLowerCase(),
      id: String(target.id || '').slice(0, 100),
      cls: String(target.className || '').slice(0, 200),
      rectW: Math.round(r.width),
      rectH: Math.round(r.height)
    };
  }
  const host =
    nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
  /** @type {Record<string, unknown>|null} */
  let hostBrief = null;
  if (host instanceof HTMLElement) {
    const cs = window.getComputedStyle(host);
    const r = host.getBoundingClientRect();
    hostBrief = {
      isConnected: host.isConnected,
      inlineDisplay: host.style.display || '',
      computedDisplay: cs.display,
      computedVisibility: cs.visibility,
      rectTop: Math.round(r.top),
      rectLeft: Math.round(r.left),
      rectW: Math.round(r.width),
      rectH: Math.round(r.height),
      parentNodeName: host.parentNode ? host.parentNode.nodeName : '',
      parentIsShadowRoot: host.parentNode instanceof ShadowRoot
    };
  }
  return {
    exportedAt: new Date().toISOString(),
    frame: {
      isTop,
      href: href.slice(0, 500),
      userAgent: String(navigator.userAgent || '').slice(0, 280)
    },
    contentScript: {
      hasExtensionContext: hasExtensionContext(),
      executionStarted: true,
      dataNlsActive: document.documentElement?.getAttribute?.('data-nls-active') ?? null,
      shouldRunWatchContentInThisFrame: shouldRunWatchContentInThisFrame()
    },
    watch: {
      isNicoLiveWatchUrl: isNicoLiveWatchUrl(href)
    },
    player: {
      videoCount: document.querySelectorAll('video').length,
      frameTarget: targetBrief
    },
    inlinePanel: {
      placementMode: inlinePanelPlacementMode,
      placementEffective: getEffectiveInlinePanelPlacement(),
      viewportInnerWidth: nlsViewportSize().innerWidth,
      widthMode: inlinePanelWidthMode,
      floatingAnchor: inlineFloatingAnchor,
      host: hostBrief,
      recentRenderErrors: nlsInlinePanelRenderErrors.slice()
    },
    pageFrameLoopTimerActive: Boolean(pageFrameLoopTimer),
    romiDebug: {
      recording,
      liveId: String(liveId || ''),
      harvestRunning,
      deepHarvestRunCount: deepHarvestPipelineStats.runCount,
      deepHarvestLastRowCount: deepHarvestPipelineStats.lastRowCount,
      deepHarvestLastCompletedAt: deepHarvestPipelineStats.lastCompletedAt || 0,
      deepHarvestLastError: deepHarvestPipelineStats.lastError,
      ndgrPending: ndgrChatRowsPending.length,
      ndgrLastReceivedAgo:
        ndgrLastReceivedAt > 0 ? Math.max(0, Date.now() - ndgrLastReceivedAt) : null,
      interceptMapSize: interceptedUsers.size,
      interceptNicknameSize: interceptedNicknames.size,
      interceptAvatarSize: interceptedAvatars.size,
      lastPersistBatch: lastPersistCommentBatchSize,
      persistGateFailures: Array.isArray(lastPersistGateFailures)
        ? lastPersistGateFailures.slice(0, 8)
        : [],
      endedBulkHarvestTriggeredLiveId: String(endedBulkHarvestTriggeredLiveId || ''),
      endedBulkHarvestLastCheckedAgo:
        endedBulkHarvestLastCheckedAt > 0
          ? Math.max(0, Date.now() - endedBulkHarvestLastCheckedAt)
          : null
    }
  };
}

function persistAiShareFastDiagnostics() {
  if (!hasExtensionContext()) return;
  const now = Date.now();
  if (now - aiShareFastDiagLastPersistAt < 1500) return;
  aiShareFastDiagLastPersistAt = now;
  try {
    const payload = {
      popup: null,
      content: buildAiShareFastDiagnosticsPayload(),
      note:
        'Chrome コンソールの ERR_BLOCKED_BY_CLIENT / 広告スクリプト失敗はブロッカー由来で多く、本拡張とは無関係なことがあります。',
      resolvedTabUrl: String(window.location.href || '').slice(0, 500),
      persistedAt: new Date().toISOString()
    };
    void chrome.storage.local.set({ [KEY_AI_SHARE_FAST_DIAG]: payload });
  } catch {
    // no-op
  }
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

/** ドックパネルと同じ上限高さ（padding-bottom 予約と共有） */
function watchDockPanelMaxHeightPx() {
  let ih = Number(nlsViewportSize().innerHeight) || 0;
  /*
   * バックグラウンドタブ・描画直前など innerHeight が 0 に近いと maxDockH=0 になり
   * パネルが完全に潰れることがある。
   */
  if (ih < 280) ih = 720;
  const capped = Math.min(Math.round(ih * 0.58), 720);
  return Math.max(260, capped);
}

/**
 * 旧実装で html に付けていた padding-bottom は、ニコ生の高さ計算と干渉し
 * 「画面の半分がまっしろ」のように見えることがあったため廃止。
 * 残存スタイルがあればここで除去する。
 */
function syncWatchPageDockBodyReserve() {
  if (!isWatchInlinePanelTopFrame()) return;
  try {
    document.documentElement.style.removeProperty('padding-bottom');
  } catch {
    // no-op
  }
}

/** ストレージの配置に対し、狭いビューポートでは beside を下へ逃がす（保存値はそのまま） */
function getEffectiveInlinePanelPlacement() {
  return effectiveInlinePanelPlacement(
    inlinePanelPlacementMode,
    nlsViewportSize().innerWidth
  );
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

/**
 * フレームターゲットが video 以外（プレイヤー枠 div）のとき、内包 video を拾って
 * renderInlineHostAnchoredToVideo に渡す（配置モードが効く経路に乗せる）
 * @param {HTMLElement} target
 * @returns {HTMLVideoElement|null}
 */
function pickInlinePanelVideoWithinTarget(target) {
  if (!(target instanceof HTMLElement)) return null;
  if (target instanceof HTMLVideoElement) {
    const r = target.getBoundingClientRect();
    return r.width >= 260 && r.height >= 140 ? target : null;
  }
  const list = Array.from(target.querySelectorAll('video')).filter(
    (v) => v instanceof HTMLVideoElement
  );
  for (const v of list) {
    const r = v.getBoundingClientRect();
    const st = window.getComputedStyle(v);
    if (
      r.width >= 260 &&
      r.height >= 140 &&
      st.visibility !== 'hidden' &&
      st.display !== 'none'
    ) {
      return v;
    }
  }
  const picked = pickBestInlinePanelVideo();
  if (picked && target.contains(picked)) return picked;
  return null;
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

/**
 * ページ内インラインパネルは最上位フレームだけに出す。
 * all_frames 注入のサブフレーム（プレイヤー内 iframe 等）にまで挿すと親幅が狭くチラつき二重表示になる。
 * @returns {boolean}
 */
function isWatchInlinePanelTopFrame() {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

/** 視聴ページの動画周り装飾枠（#nls-watch-prikura-frame）は表示しない。インライン用ホストの配置のみ行う。 */
function renderPageFrameOverlay() {
  if (!isWatchInlinePanelTopFrame()) {
    hidePageFrameOverlay();
    return;
  }
  if (!isNicoLiveWatchUrl(window.location.href)) {
    hidePageFrameOverlay();
    return;
  }

  try {
    const overlay = ensurePageFrameOverlay();
    overlay.style.display = 'none';
    const effPlacement = getEffectiveInlinePanelPlacement();
    if (effPlacement === INLINE_PANEL_PLACEMENT_FLOATING) {
      renderInlinePanelFloatingHost();
    } else if (effPlacement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
      renderInlinePanelDockBottomHost();
    } else {
      const target = findWatchFrameTargetElement();
      if (!target) {
        /*
         * below / beside はプレイヤー未検出だと従来ゼロ表示だった。
         * 視聴ページではドックに落とし、何も出ない状態を避ける。
         */
        renderInlinePanelDockBottomHost();
      } else {
        const rect = target.getBoundingClientRect();
        if (rect.width < 260 || rect.height < 140) {
          renderInlinePanelDockBottomHost();
        } else {
          renderInlinePopupHost(target);
        }
      }
    }
    if (!inlineHostLooksVisible()) {
      /* 例外は出ていないが host が見えていないケースを救済 */
      renderInlinePanelDockBottomHost();
    }
  } catch (e) {
    noteInlinePanelRenderError('renderPageFrameOverlay', e);
    try {
      /* 途中失敗時の最終フォールバック（何も出ない状態を避ける） */
      renderInlinePanelDockBottomHost();
    } catch (fallbackErr) {
      noteInlinePanelRenderError('renderPageFrameOverlay:fallback', fallbackErr);
    }
  } finally {
    syncWatchPageDockBodyReserve();
  }
  /*
   * プレイヤー遅延で初回だけ target が無いとき、ここでループを積まないと再描画が永遠に走らない。
   * ループ本体は pageFrameLoopTimer で重複開始しない。
   */
  startPageFrameLoop();
}

async function loadPageFrameSettings() {
  if (!hasExtensionContext()) return;
  const bag = await chrome.storage.local.get([
    KEY_POPUP_FRAME,
    KEY_POPUP_FRAME_CUSTOM,
    KEY_INLINE_PANEL_WIDTH_MODE,
    KEY_INLINE_PANEL_PLACEMENT,
    KEY_INLINE_FLOATING_ANCHOR
  ]);
  inlinePanelWidthMode = normalizeInlinePanelWidthMode(
    bag[KEY_INLINE_PANEL_WIDTH_MODE]
  );
  inlinePanelPlacementMode = normalizeInlinePanelPlacement(
    bag[KEY_INLINE_PANEL_PLACEMENT]
  );
  inlineFloatingAnchor = normalizeInlineFloatingAnchor(
    bag[KEY_INLINE_FLOATING_ANCHOR]
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
    maybeRunEndedBulkHarvest();
    persistAiShareFastDiagnostics();
  };

  pageFrameLoopTimer = setInterval(tick, PAGE_FRAME_LOOP_MS);
  window.addEventListener('scroll', tick, { passive: true });
  window.addEventListener('resize', tick);
  document.addEventListener('visibilitychange', tick);
  tick();
}

function hasExtensionContext() {
  try {
    return Boolean(chrome?.runtime?.id && chrome?.storage?.local);
  } catch {
    return false;
  }
}

/** @param {unknown} err */
function isContextInvalidatedError(err) {
  return isCtxInvalidated(err);
}

/** @param {string} context @param {unknown} err */
function reportSilentErrorToStorage(context, err) {
  const p = buildSilentErrorPayload(context, err, liveId);
  if (!p.shouldReport || !hasExtensionContext()) return;
  try {
    chrome.storage.local.set({ [KEY_STORAGE_WRITE_ERROR]: { at: p.at, ...(p.liveId ? { liveId: p.liveId } : {}), ...(p.message ? { message: p.message } : {}) } });
  } catch { /* best-effort */ }
}

/** @param {Element|null|undefined} el */
function isVisibleElement(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (!el.isConnected || el.hidden) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  try {
    if (typeof el.getClientRects === 'function' && el.getClientRects().length > 0) {
      return true;
    }
  } catch {
    // no-op
  }
  return true;
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
  const inScope = findCommentSubmitButton(scope, editor);
  if (inScope) return inScope;
  return findCommentSubmitButton(document, editor);
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
  const scopedEditor = editor instanceof HTMLElement ? editor : null;

  const btnInScope = findCommentSubmitButton(scope, scopedEditor);
  if (btnInScope) {
    btnInScope.click();
    return true;
  }

  if (form && typeof form.requestSubmit === 'function') {
    form.requestSubmit();
    return true;
  }

  const btnGlobal = findCommentSubmitButton(document, scopedEditor);
  if (btnGlobal) {
    btnGlobal.click();
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
  return waitUntilEditorReflectsSubmit({
    expectedNormalized: expected,
    readNormalized: () => {
      const currentEditor =
        editor.isConnected && isVisibleElement(editor)
          ? editor
          : findCommentEditorElement();
      return normalizeCommentText(readCommentEditorText(currentEditor));
    },
    probeEndpointsMs: COMMENT_SUBMIT_CONFIRM_PROBE_MS
  });
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
    timeoutMs: SUBMIT_TIMING.editorPollTimeoutMs,
    intervalMs: SUBMIT_TIMING.editorPollIntervalMs
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
    await new Promise((r) => setTimeout(r, SUBMIT_TIMING.reactSettleMs));

    const submitOnce = async () => {
      const btn = await pollUntil(() => findVisibleEnabledSubmitForEditor(editor), {
        timeoutMs: SUBMIT_TIMING.buttonPollTimeoutMs,
        intervalMs: SUBMIT_TIMING.buttonPollIntervalMs
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
        error:
          '公式の送信ボタンを見つけられませんでした。watchページを再読み込みし、コメント欄が見える状態で再試行してください。'
      };
    }
    if (await confirmSubmittedCommentAsync(editor, text)) {
      return { ok: true };
    }

    if (!(await submitOnce())) {
      return {
        ok: false,
        error:
          'コメント送信を確認できませんでした。watchページを前面に出し、必要なら再読み込みしてから再試行してください。'
      };
    }
    if (await confirmSubmittedCommentAsync(editor, text)) {
      return { ok: true };
    }
    return {
      ok: false,
      error:
        'コメント送信を確認できませんでした。watchページを前面に出し、必要なら再読み込みしてから再試行してください。'
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
  const probes = [...COMMENT_SUBMIT_CONFIRM_PROBE_MS];
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
 *   officialCommentStatsUpdatedAt: number|null,
 *   officialCommentStatsFreshnessMs: number|null,
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
      interceptNicknames: interceptedNicknames.size,
      interceptAvatars: interceptedAvatars.size,
      fiberDiag: document.documentElement?.getAttribute('data-nls-fiber-diag') || '',
      harvestPipeline: {
        ...deepHarvestPipelineStats,
        harvestRunning,
        ndgrPending: ndgrChatRowsPending.length,
        ndgrLastReceivedAgo: ndgrLastReceivedAt > 0 ? Date.now() - ndgrLastReceivedAt : null,
        lastPersistBatch: lastPersistCommentBatchSize,
        persistGateFailures: lastPersistGateFailures
      },
      embeddedVC: _edProps ? pickViewerCountFromEmbeddedData(_edProps) : null,
      officialVsRecorded:
        officialCommentCount != null &&
        Number.isFinite(officialCommentCount) &&
        officialCommentCount >= 0
          ? {
              officialComments: officialCommentCount,
              recordedComments: observedRecordedCommentCount
            }
          : null,
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
      _debug.ndgrLdStream = docEl.getAttribute('data-nls-ld-stream') || '';
    }

    try {
      /** @type {Record<string, number>} */
      const ctHist = {};
      document.querySelectorAll('div.table-row[data-comment-type]').forEach((el) => {
        const t = el.getAttribute('data-comment-type') || '?';
        ctHist[t] = (ctHist[t] || 0) + 1;
      });
      _debug.commentTypeVisibleSample = ctHist;
    } catch {
      // no-op
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
    ...buildWatchSnapshotOfficialFields({
      nowMs: Date.now(),
      officialViewerCount,
      officialCommentCount,
      officialStatsUpdatedAt,
      officialCommentStatsUpdatedAt,
      officialViewerIntervalMs,
      officialCommentSummary
    }),
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

/**
 * ポップアップ「AI に貼る診断」用。コメント本文・ユーザー固有情報は含めない。
 * @returns {Record<string, unknown>}
 */
function buildAiSharePageDiagnostics() {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const href = String(window.location.href || '');
  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }

  const target = findWatchFrameTargetElement();
  const placementEffective = getEffectiveInlinePanelPlacement();
  /** @type {Record<string, unknown>|null} */
  let insertionPlan = null;
  if (placementEffective === INLINE_PANEL_PLACEMENT_FLOATING) {
    insertionPlan = {
      mode: 'floating',
      description: 'fixed top-right on viewport; not inserted into player DOM'
    };
  } else if (placementEffective === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
    insertionPlan = {
      mode: 'dock_bottom',
      description:
        'fixed full-width bottom of viewport; not inserted into player DOM'
    };
  } else if (target instanceof HTMLElement) {
    let video = null;
    if (target instanceof HTMLVideoElement) {
      video = target;
    } else {
      const cand = pickInlinePanelVideoWithinTarget(target);
      if (cand) {
        const vr = cand.getBoundingClientRect();
        if (vr.width >= 260 && vr.height >= 140) video = cand;
      }
    }
    let insertResolve = target;
    if (video) {
      const domAnchor = findFrameInsertAnchorFromVideo(video);
      insertResolve =
        placementEffective === INLINE_PANEL_PLACEMENT_BESIDE
          ? video
          : domAnchor;
    }
    /** @type {HTMLElement} */
    let insertAfter;
    /** @type {ParentNode|null} */
    let hostParent;
    let besideFlexRowColumnChosen = false;
    if (video && placementEffective === INLINE_PANEL_PLACEMENT_BESIDE) {
      const col = findBesideFlexRowColumnInsertion(video);
      if (col?.hostParent && col.insertAfter) {
        insertAfter = col.insertAfter;
        hostParent = col.hostParent;
        besideFlexRowColumnChosen = true;
      } else {
        const r = resolveInlinePanelInsertAnchor(
          insertResolve,
          placementEffective
        );
        insertAfter = /** @type {HTMLElement} */ (r.insertAfter);
        hostParent = r.hostParent;
      }
    } else {
      const r = resolveInlinePanelInsertAnchor(
        insertResolve,
        placementEffective
      );
      insertAfter = /** @type {HTMLElement} */ (r.insertAfter);
      hostParent = r.hostParent;
    }
    const hpKind =
      hostParent == null
        ? 'null'
        : hostParent instanceof ShadowRoot
          ? 'ShadowRoot'
          : hostParent instanceof HTMLElement
            ? String(hostParent.nodeName || '').toLowerCase()
            : typeof hostParent;
    insertionPlan = {
      insertResolveTag:
        insertResolve instanceof HTMLElement
          ? String(insertResolve.tagName || '').toLowerCase()
          : '?',
      insertAfterTag:
        insertAfter instanceof HTMLElement
          ? String(insertAfter.tagName || '').toLowerCase()
          : '?',
      hostParentKind: hpKind,
      usedVideoPath: Boolean(video),
      besideFlexRowColumnChosen
    };
  }

  const host =
    nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
  /** @type {Record<string, unknown>|null} */
  let hostBrief = null;
  if (host) {
    const cs = window.getComputedStyle(host);
    const r = host.getBoundingClientRect();
    hostBrief = {
      isConnected: host.isConnected,
      inlineDisplay: host.style.display || '',
      computedDisplay: cs.display,
      computedVisibility: cs.visibility,
      rectTop: Math.round(r.top),
      rectLeft: Math.round(r.left),
      rectW: Math.round(r.width),
      rectH: Math.round(r.height),
      parentNodeName: host.parentNode ? host.parentNode.nodeName : '',
      parentIsShadowRoot: host.parentNode instanceof ShadowRoot
    };
  }

  /** @type {Record<string, unknown>|null} */
  let targetBrief = null;
  if (target instanceof HTMLElement) {
    const r = target.getBoundingClientRect();
    targetBrief = {
      tag: String(target.tagName || '').toLowerCase(),
      id: String(target.id || '').slice(0, 100),
      cls: String(target.className || '').slice(0, 200),
      rectW: Math.round(r.width),
      rectH: Math.round(r.height)
    };
  }

  return {
    exportedAt: new Date().toISOString(),
    frame: {
      isTop,
      href: href.slice(0, 500),
      userAgent: String(navigator.userAgent || '').slice(0, 280)
    },
    contentScript: {
      hasExtensionContext: hasExtensionContext(),
      executionStarted: Boolean(g.__NLS_CONTENT_ENTRY_STARTED__),
      dataNlsActive:
        document.documentElement?.getAttribute?.('data-nls-active') ?? null,
      shouldRunWatchContentInThisFrame: shouldRunWatchContentInThisFrame()
    },
    watch: {
      isNicoLiveWatchUrl: isNicoLiveWatchUrl(href)
    },
    player: {
      videoCount: document.querySelectorAll('video').length,
      frameTarget: targetBrief
    },
    inlinePanel: {
      placementMode: inlinePanelPlacementMode,
      placementEffective,
      besideNarrowViewportFallback:
        inlinePanelPlacementMode === INLINE_PANEL_PLACEMENT_BESIDE &&
        placementEffective !== inlinePanelPlacementMode,
      viewportInnerWidth: nlsViewportSize().innerWidth,
      widthMode: inlinePanelWidthMode,
      floatingAnchor: inlineFloatingAnchor,
      insertionPlan,
      host: hostBrief,
      recentRenderErrors: nlsInlinePanelRenderErrors.slice()
    },
    pageFrameLoopTimerActive: Boolean(pageFrameLoopTimer),
    romiDebug: {
      recording,
      liveId: String(liveId || ''),
      harvestRunning,
      deepHarvestRunCount: deepHarvestPipelineStats.runCount,
      deepHarvestLastRowCount: deepHarvestPipelineStats.lastRowCount,
      deepHarvestLastCompletedAt: deepHarvestPipelineStats.lastCompletedAt || 0,
      deepHarvestLastError: deepHarvestPipelineStats.lastError,
      ndgrPending: ndgrChatRowsPending.length,
      ndgrLastReceivedAgo:
        ndgrLastReceivedAt > 0 ? Math.max(0, Date.now() - ndgrLastReceivedAt) : null,
      interceptMapSize: interceptedUsers.size,
      interceptNicknameSize: interceptedNicknames.size,
      interceptAvatarSize: interceptedAvatars.size,
      lastPersistBatch: lastPersistCommentBatchSize,
      persistGateFailures: Array.isArray(lastPersistGateFailures)
        ? lastPersistGateFailures.slice(0, 8)
        : [],
      endedBulkHarvestTriggeredLiveId: String(endedBulkHarvestTriggeredLiveId || ''),
      endedBulkHarvestLastCheckedAgo:
        endedBulkHarvestLastCheckedAt > 0
          ? Math.max(0, Date.now() - endedBulkHarvestLastCheckedAt)
          : null
    }
  };
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
    if (!canPostCommentInThisFrame()) {
      sendResponse({
        ok: false,
        error: 'このフレームにはコメント欄がありません。'
      });
      return true;
    }
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
        const deepPlan = planDeepExportSweep({
          deep,
          ndgrLastReceivedAt,
          now: Date.now(),
          thresholdMs: HARVEST_TIMING.ndgrActiveThresholdMs
        });
        if (deepPlan.shouldRunSweep && locationAllowsCommentRecording()) {
          const rows = await harvestVirtualCommentList({
            document,
            extractCommentsFromNode,
            waitMs: 42,
            respectTyping: false,
            quietScroll: deepPlan.quietScroll
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
      } catch (err) {
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String(
                /** @type {{ message?: unknown }} */ (err).message ||
                  'intercept_export_error'
              )
            : 'intercept_export_error';
        sendResponse({
          ok: false,
          error: msg.length > 220 ? `${msg.slice(0, 220)}…` : msg
        });
      }
    })();
    return true;
  }

  if (msg.type === 'NLS_AI_SHARE_PAGE_DIAGNOSTICS') {
    try {
      persistAiShareFastDiagnostics();
      sendResponse({
        ok: true,
        diagnostics: buildAiSharePageDiagnostics()
      });
    } catch (err) {
      sendResponse({
        ok: false,
        error: String(
          err && typeof err === 'object' && 'message' in err
            ? /** @type {{ message?: unknown }} */ (err).message
            : err || 'diag_failed'
        )
      });
    }
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

async function readDeepHarvestQuietUiFromStorage() {
  if (!hasExtensionContext()) {
    deepHarvestQuietUi = true;
    return;
  }
  try {
    const bag = await chrome.storage.local.get(KEY_DEEP_HARVEST_QUIET_UI);
    deepHarvestQuietUi = isDeepHarvestQuietUiEnabled(bag[KEY_DEEP_HARVEST_QUIET_UI]);
  } catch {
    deepHarvestQuietUi = true;
  }
}

/** @param {HTMLImageElement} img */
function bindCommentRowUserIconLoadOnce(img) {
  if (!(img instanceof HTMLImageElement)) return;
  if (img.dataset.nlsCommentAvBound === '1') return;
  img.dataset.nlsCommentAvBound = '1';
  img.addEventListener('load', onCommentPanelUserIconLoaded, { passive: true });
}

/** @param {Event} ev */
function onCommentPanelUserIconLoaded(ev) {
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  const t = ev.target;
  if (!(t instanceof HTMLImageElement)) return;
  const row = closestHarvestableNicoCommentRow(t);
  if (row) {
    pendingRoots.add(row);
    scheduleFlush();
  }
}

/** @param {Element|Document|null} root */
function bindCommentPanelUserIconLoads(root) {
  if (!root || !root.querySelectorAll) return;
  try {
    root.querySelectorAll('img').forEach((img) => {
      bindCommentRowUserIconLoadOnce(/** @type {HTMLImageElement} */ (img));
    });
  } catch {
    // no-op
  }
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
    attributeFilter: [...NICO_USER_ICON_IMG_LAZY_ATTRS, 'srcset']
  });
  bindCommentPanelUserIconLoads(observedMutationRoot);
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
 * DOM 抽出結果を interceptedUsers マップで補完（userId + nickname + av）。
 * intercept / DOM 経由で取得したアバター URL のみをマージ（合成 CDN URL は含めない）。
 * @param {ParsedCommentRow[]} rows
 * @returns {{ commentNo: string, text: string, userId: string|null, nickname?: string, avatarUrl?: string, avatarObserved?: boolean }[]}
 */
function enrichRowsWithInterceptedUserIds(rows) {
  /** intercept マップが空でも、数字 userId なら CDN 推定サムネを付与する（NDGR 単独時の取得率向上） */
  const broadcasterUid = detectBroadcasterUserIdFromDom();
  return rows.map((r) => {
    const no = String(r.commentNo ?? '').trim();
    const entry = no ? interceptedUsers.get(no) : undefined;
    const rowUid = r.userId ? String(r.userId).trim() : '';
    const interceptedUid = entry?.uid ? String(entry.uid).trim() : '';
    const rowLikelyContaminated =
      Boolean(rowUid && broadcasterUid && rowUid === broadcasterUid);
    const mergedUid = mergeUserIdForEnrichment(
      rowUid,
      interceptedUid,
      rowLikelyContaminated
    );
    const userId = mergedUid;
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
      anonymousNicknameFallback(userId, '') ||
      '';
    const rowAv = String(r.avatarUrl || '').trim();
    const interceptEntryAv =
      canUseInterceptMeta && isHttpAvatarUrl(entry?.av)
        ? String(entry?.av || '').trim()
        : '';
    const interceptMapAv =
      userId && isHttpAvatarUrl(interceptedAvatars.get(String(userId)))
        ? String(interceptedAvatars.get(String(userId)) || '').trim()
        : '';
    const canonicalFallback = enrichmentAvatarWithCanonicalFallback(
      userId, interceptEntryAv, interceptMapAv, rowAv
    );
    const av = pickStrongestAvatarUrlForUser(userId, [
      interceptEntryAv,
      interceptMapAv,
      rowAv,
      canonicalFallback
    ]);
    const observed = Boolean(rowAv || interceptEntryAv || interceptMapAv);
    return {
      ...r,
      userId,
      ...(nickname ? { nickname } : {}),
      ...(av ? { avatarUrl: av } : {}),
      ...(observed ? { avatarObserved: true } : {})
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

/** NDGR・MutationObserver・deep harvest が同時に来ても storage の merge が壊れないよう直列化 */
let persistCommentRowsChain = Promise.resolve();

const MIN_PERSIST_INTERVAL_MS = INGEST_TIMING.coalescerMinMs;

const persistCoalescer = createPersistCoalescer(async (/** @type {ParsedCommentRow[]} */ batch) => {
  const job = persistCommentRowsChain.then(() => persistCommentRowsImpl(batch));
  persistCommentRowsChain = job.catch((err) => reportSilentErrorToStorage('persist', err));
  await job;
}, MIN_PERSIST_INTERVAL_MS);

/**
 * @param {ParsedCommentRow[]|null|undefined} rows
 * @param {{ source?: string }} [opts] ndgr | mutation | deep | visible
 */
function persistCommentRows(rows, _opts = {}) {
  const gate = diagnosePersistGate({
    hasRows: !!rows?.length,
    recording,
    liveId: liveId || '',
    locationAllows: locationAllowsCommentRecording(),
    hasExtensionContext: hasExtensionContext()
  });
  if (!gate.pass) {
    if (gate.failures.length && rows?.length) {
      lastPersistGateFailures = gate.failures;
    }
    return;
  }
  lastPersistGateFailures = [];
  persistCoalescer.enqueue(/** @type {ParsedCommentRow[]} */ (rows));
}

/**
 * @param {ParsedCommentRow[]|null|undefined} rows
 * @param {{ source?: string }} [opts]
 */
async function persistCommentRowsImpl(rows, opts = {}) {
  if (
    !rows?.length ||
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !hasExtensionContext()
  ) {
    return;
  }
  lastPersistCommentBatchSize = rows.length;
  const enriched = enrichRowsWithInterceptedUserIds(rows);
  const key = commentsStorageKey(liveId);
  try {
    const bag = await readStorageBagWithRetry(
      () =>
        chrome.storage.local.get([
          key,
          KEY_SELF_POSTED_RECENTS,
          KEY_AUTO_BACKUP_STATE,
          KEY_LAST_WATCH_URL,
          KEY_USER_COMMENT_PROFILE_CACHE,
          KEY_COMMENT_INGEST_LOG
        ]),
      { attempts: 4, delaysMs: [0, 50, 120, 280] }
    );
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

    let profileMap = normalizeUserCommentProfileMap(
      bag[KEY_USER_COMMENT_PROFILE_CACHE]
    );
    let cacheTouched = false;
    for (const r of enriched) {
      if (upsertUserCommentProfileFromEntry(profileMap, r)) cacheTouched = true;
    }
    for (const e of next) {
      if (upsertUserCommentProfileFromEntry(profileMap, e)) cacheTouched = true;
    }
    const profileApplied = applyUserCommentProfileMapToEntries(next, profileMap);
    if (profileApplied.patched > 0) {
      next = profileApplied.next;
      storageTouched = true;
    }
    const bfAv = backfillNumericSyntheticAvatarsOnStoredComments(next);
    if (bfAv.patched > 0) {
      next = bfAv.next;
      storageTouched = true;
    }
    const profileKeysBefore = Object.keys(profileMap).length;
    profileMap = pruneUserCommentProfileMap(profileMap);
    if (Object.keys(profileMap).length !== profileKeysBefore) cacheTouched = true;

    /* 次バッチの enrich 精度向上: current live で観測済み userId のみ補完（他配信混入を避ける） */
    const liveObservedUserIds = new Set();
    for (const item of next) {
      const uid = String(item?.userId || '').trim();
      if (uid) liveObservedUserIds.add(uid);
    }
    hydrateInterceptAvatarMapFromProfile(
      interceptedAvatars,
      profileMap,
      liveObservedUserIds
    );

    if (!storageTouched && !pendingTouched && !cacheTouched) return;

    /** @type {Record<string, unknown>|null} */
    let ingestLogPayload = null;
    if (storageTouched || pendingTouched) {
      const src = String(opts?.source || 'unknown').slice(0, 32);
      ingestLogPayload = maybeAppendCommentIngestLog(bag[KEY_COMMENT_INGEST_LOG], {
        t: Date.now(),
        liveId: String(liveId || '').trim().toLowerCase(),
        source: src,
        batchIn: rows.length,
        added: added.length,
        totalAfter: next.length,
        official:
          officialCommentCount != null && Number.isFinite(officialCommentCount)
            ? Math.floor(officialCommentCount)
            : null
      });
    }

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
    if (storageTouched || pendingTouched) {
      await chrome.storage.local.set({
        [key]: next,
        [KEY_AUTO_BACKUP_STATE]: autoBackupState,
        ...(ingestLogPayload ? { [KEY_COMMENT_INGEST_LOG]: ingestLogPayload } : {}),
        ...(pendingTouched
          ? { [KEY_SELF_POSTED_RECENTS]: { items: consumed.remainingItems } }
          : {}),
        ...(cacheTouched
          ? { [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap }
          : {})
      });
    } else if (cacheTouched) {
      await chrome.storage.local.set({
        [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap
      });
    }
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
      clearInterceptReconcilePending();
      endedBulkHarvestTriggeredLiveId = '';
      endedBulkHarvestLastCheckedAt = 0;
      resetDeepHarvestStabilityFollowUp();
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
      ndgrLastReceivedAt = 0;
      liveId = ctx.liveId;
      reconnectMutationObserver();
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest(DEEP_HARVEST_REASONS.liveIdChange);
      applyThumbSchedule();
    } else {
      liveId = ctx.liveId;
      reconnectMutationObserver();
      if (ndgrChatRowsPending.length) {
        const slice = ndgrChatRowsPending;
        ndgrChatRowsPending = [];
        void flushNdgrChatRowsBatch(slice);
      }
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
      clearInterceptReconcilePending();
      endedBulkHarvestTriggeredLiveId = '';
      endedBulkHarvestLastCheckedAt = 0;
      resetDeepHarvestStabilityFollowUp();
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
      ndgrLastReceivedAt = 0;
      liveId = next;
      reconnectMutationObserver();
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest(DEEP_HARVEST_REASONS.liveIdChange);
      applyThumbSchedule();
    } else {
      liveId = next;
      reconnectMutationObserver();
      if (ndgrChatRowsPending.length) {
        const slice = ndgrChatRowsPending;
        ndgrChatRowsPending = [];
        void flushNdgrChatRowsBatch(slice);
      }
    }
    renderPageFrameOverlay();
    return;
  }

  liveId = null;
  ndgrLastReceivedAt = 0;
  cancelPendingDeepHarvest();
  void clearCommentHarvestPanelDiagnostic();
  clearNdgrChatRowsPending();
  clearInterceptReconcilePending();
  endedBulkHarvestTriggeredLiveId = '';
  endedBulkHarvestLastCheckedAt = 0;
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
  if (!pendingRoots.size) return;
  if (!hasExtensionContext()) {
    pendingRoots.clear();
    return;
  }
  if (!recording) {
    pendingRoots.clear();
    return;
  }
  /*
   * liveId 未取得・iframe 判定の一瞬だけ false になる場合でも pending を捨てない。
   * syncLiveIdFromLocation が body を積み直すまで保持し、取りこぼしを減らす。
   */
  if (!liveId || !locationAllowsCommentRecording()) {
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
  await persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.MUTATION });
}

function scheduleFlush() {
  if (!recording || !liveId) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToStorage().catch((err) => reportSilentErrorToStorage('flush', err));
  }, DEBOUNCE_MS);
}

/** @type {number|null} */
let deepHarvestTimer = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let deepHarvestStabilityFollowUpTimer = null;
/** 同一視聴セッションで追い deep を二重に積まない */
let deepHarvestStabilityFollowUpScheduled = false;

function resetDeepHarvestStabilityFollowUp() {
  if (deepHarvestStabilityFollowUpTimer != null) {
    clearTimeout(deepHarvestStabilityFollowUpTimer);
    deepHarvestStabilityFollowUpTimer = null;
  }
  deepHarvestStabilityFollowUpScheduled = false;
}

function removeDeepHarvestLoadingUi() {
  try {
    document.getElementById(DEEP_HARVEST_LOADING_HOST_ID)?.remove();
  } catch {
    // no-op
  }
}

function ensureDeepHarvestLoadingUi() {
  if (!hasExtensionContext()) return;
  if (document.getElementById(DEEP_HARVEST_LOADING_HOST_ID)) return;
  let imgUrl = '';
  try {
    imgUrl = chrome.runtime.getURL(DEEP_HARVEST_LOADING_IMG_PATH);
  } catch {
    imgUrl = '';
  }
  const host = document.createElement('div');
  host.id = DEEP_HARVEST_LOADING_HOST_ID;
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.setAttribute(
    'aria-label',
    'コメント一覧の読み込み準備中。しばらくお待ちください。'
  );
  host.style.cssText = [
    'position:fixed',
    /* ドック（画面下全幅）と重ならないよう左上付近。旧: 右下でドックと干渉し「消えたあとなにも」と誤認されやすい */
    'z-index:2147483647',
    'left:max(14px,env(safe-area-inset-left))',
    'top:max(72px,calc(env(safe-area-inset-top) + 56px))',
    'right:auto',
    'bottom:auto',
    'max-width:min(320px,calc(100vw - 32px))',
    'box-sizing:border-box',
    'padding:12px 14px',
    'border-radius:12px',
    'background:rgba(255,255,255,0.96)',
    'color:#1a1a1a',
    'font:14px/1.45 system-ui,-apple-system,sans-serif',
    'box-shadow:0 4px 24px rgba(0,0,0,0.12)',
    'display:flex',
    'align-items:center',
    'gap:12px',
    'pointer-events:none'
  ].join(';');
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.width = 48;
  img.height = 48;
  img.style.cssText =
    'width:48px;height:48px;object-fit:contain;flex-shrink:0;border-radius:8px';
  if (imgUrl) img.src = imgUrl;
  const text = document.createElement('div');
  text.style.cssText = 'min-width:0';
  text.innerHTML =
    '<div style="font-weight:600;margin:0 0 2px">読み込み中…</div>' +
    '<div style="font-size:12px;opacity:0.78;margin:0;line-height:1.35">' +
    'コメント記録の準備をしています。ゆっくりしていってね！' +
    '</div>';
  host.appendChild(img);
  host.appendChild(text);
  try {
    document.documentElement.appendChild(host);
  } catch {
    // no-op
  }
}

function cancelPendingDeepHarvest() {
  if (deepHarvestTimer) {
    clearTimeout(deepHarvestTimer);
    deepHarvestTimer = null;
  }
  resetDeepHarvestStabilityFollowUp();
  removeDeepHarvestLoadingUi();
}

/** @param {string} reason */
function scheduleDeepHarvest(reason) {
  if (!recording || !liveId || !locationAllowsCommentRecording()) {
    cancelPendingDeepHarvest();
    return;
  }
  if (deepHarvestTimer) clearTimeout(deepHarvestTimer);
  const wantQuietSchedule =
    deepHarvestQuietUi &&
    (reason === 'startup' || reason === 'recording-on');
  const delayMs = wantQuietSchedule
    ? Math.max(DEEP_HARVEST_DELAY_MS, DEEP_HARVEST_QUIET_UI_MS)
    : DEEP_HARVEST_DELAY_MS;
  if (!wantQuietSchedule) {
    removeDeepHarvestLoadingUi();
  } else {
    ensureDeepHarvestLoadingUi();
  }
  deepHarvestTimer = setTimeout(() => {
    deepHarvestTimer = null;
    removeDeepHarvestLoadingUi();
    /* トースト除去直後にインライン枠の padding / 表示を再同期（ドックと干渉解消後の見え方） */
    if (isWatchInlinePanelTopFrame() && isNicoLiveWatchUrl(window.location.href)) {
      renderPageFrameOverlay();
    }
    resetDeepHarvestStabilityFollowUp();
    runDeepHarvest({
      armStabilityFollowUp: true,
      force: shouldForceDeepHarvestForReason(reason)
    }).catch((err) => reportSilentErrorToStorage('deepHarvest', err));
  }, delayMs);
}

/**
 * 定期の取りこぼし拾い。quietScroll 付き単一パス deep で仮想リスト全域を走査する。
 * opacity:0 なので視覚的な「滝」は起きない。安定フォローは積まない。
 */
function tryPeriodicQuietDeepHarvest() {
  if (!hasExtensionContext()) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  if (document.hidden) return;
  if (harvestRunning) return;
  resetDeepHarvestStabilityFollowUp();
  void runDeepHarvest({ stabilityFollowUp: true });
}

/**
 * バックグラウンドに回したあと visible に戻ったとき、仮想リストの取りこぼしを拾い直す。
 * 連打で deep が積まないよう短いデバウンスのみ。
 */
function onTabVisibleForCommentHarvest() {
  if (document.visibilityState !== 'visible') return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  // 軽い走査は毎回実行して、画面復帰直後の取りこぼしを減らす。
  scanVisibleCommentsNow();
  const now = Date.now();
  // 重い deep harvest だけを間引く。
  if (now - lastTabVisibleHarvestAt < TAB_VISIBLE_HARVEST_MIN_MS) return;
  lastTabVisibleHarvestAt = now;
  if (tabVisibleHarvestDebounceTimer != null) {
    clearTimeout(tabVisibleHarvestDebounceTimer);
  }
  tabVisibleHarvestDebounceTimer = setTimeout(() => {
    tabVisibleHarvestDebounceTimer = null;
    if (recording && liveId && locationAllowsCommentRecording() && !document.hidden) {
      void runDeepHarvest({ stabilityFollowUp: true });
    }
  }, 850);
}

/**
 * @param {{ armStabilityFollowUp?: boolean, stabilityFollowUp?: boolean, force?: boolean }} [opts]
 *   armStabilityFollowUp: true のときだけ成功後に遅延フォロー deep を積む（scheduleDeepHarvest 経路のみ）。
 *   stabilityFollowUp: 遅延フォロー本体。1 パスのみで「滝」を短くする。
 */
async function runDeepHarvest(opts = {}) {
  if (
    harvestRunning ||
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording()
  ) {
    return;
  }
  if (
    !opts.force &&
    shouldSkipDeepHarvest({
      ndgrLastReceivedAt,
      now: Date.now(),
      thresholdMs: HARVEST_TIMING.ndgrActiveThresholdMs
    })
  ) {
    return;
  }
  harvestRunning = true;
  try {
    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode,
      waitMs: DEEP_HARVEST_SCROLL_WAIT_MS,
      twoPass: !opts.stabilityFollowUp,
      twoPassGapMs: DEEP_HARVEST_SECOND_PASS_GAP_MS,
      scrollStepClientHeightRatio: DEEP_HARVEST_SCROLL_STEP_RATIO,
      quietScroll: true,
      respectTyping: false
    });
    await persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.DEEP });
    deepHarvestPipelineStats.lastCompletedAt = Date.now();
    deepHarvestPipelineStats.lastRowCount = rows.length;
    deepHarvestPipelineStats.runCount += 1;
    deepHarvestPipelineStats.lastError = false;
  } catch {
    deepHarvestPipelineStats.lastError = true;
  } finally {
    harvestRunning = false;
    if (
      opts.armStabilityFollowUp === true &&
      !opts.stabilityFollowUp &&
      !deepHarvestPipelineStats.lastError &&
      recording &&
      liveId &&
      locationAllowsCommentRecording() &&
      !deepHarvestStabilityFollowUpScheduled
    ) {
      deepHarvestStabilityFollowUpScheduled = true;
      deepHarvestStabilityFollowUpTimer = setTimeout(() => {
        deepHarvestStabilityFollowUpTimer = null;
        if (recording && liveId && locationAllowsCommentRecording()) {
          void runDeepHarvest({ stabilityFollowUp: true });
        }
      }, DEEP_HARVEST_STABILITY_FOLLOWUP_MS);
    }
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
  void persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.VISIBLE });
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
      t = setTimeout(() => scanVisibleCommentsNow(), INGEST_TIMING.visibleScanDelayMs);
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
  await readDeepHarvestQuietUiFromStorage();
  if (isWatchInlinePanelTopFrame()) {
    ensurePageFrameStyle();
    await migrateFloatingInlinePanelToDockOnce({
      get: (keys) => chrome.storage.local.get(keys),
      set: (obj) => chrome.storage.local.set(obj)
    }).catch(() => ({ changed: false }));
    await loadPageFrameSettings().catch(() => {});
    if (isNicoLiveWatchUrl(window.location.href)) {
      startPageFrameLoop();
    }
  }
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
        rec.addedNodes.forEach((/** @type {Node} */ n) => {
          enqueueNode(n);
          if (n.nodeType === Node.ELEMENT_NODE) {
            bindCommentPanelUserIconLoads(/** @type {Element} */ (n));
          }
        });
      } else if (rec.type === 'characterData' && rec.target?.parentElement) {
        const row = closestHarvestableNicoCommentRow(rec.target.parentElement);
        if (row) pendingRoots.add(row);
        else pendingRoots.add(rec.target.parentElement);
      } else if (rec.type === 'attributes' && rec.target?.nodeType === Node.ELEMENT_NODE) {
        const el = /** @type {Element} */ (rec.target);
        if (el.tagName === 'IMG') {
          const row = closestHarvestableNicoCommentRow(el);
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
      if (isWatchInlinePanelTopFrame()) {
        loadPageFrameSettings().catch(() => {});
      }
    }

    if (changes[KEY_INLINE_PANEL_WIDTH_MODE]) {
      if (isWatchInlinePanelTopFrame()) {
        inlinePanelWidthMode = normalizeInlinePanelWidthMode(
          changes[KEY_INLINE_PANEL_WIDTH_MODE].newValue
        );
        renderPageFrameOverlay();
      }
    }

    if (changes[KEY_INLINE_PANEL_PLACEMENT]) {
      if (isWatchInlinePanelTopFrame()) {
        inlinePanelPlacementMode = normalizeInlinePanelPlacement(
          changes[KEY_INLINE_PANEL_PLACEMENT].newValue
        );
        renderPageFrameOverlay();
      }
    }

    if (changes[KEY_INLINE_FLOATING_ANCHOR]) {
      if (isWatchInlinePanelTopFrame()) {
        inlineFloatingAnchor = normalizeInlineFloatingAnchor(
          changes[KEY_INLINE_FLOATING_ANCHOR].newValue
        );
        renderPageFrameOverlay();
      }
    }

    if (changes[KEY_THUMB_AUTO] || changes[KEY_THUMB_INTERVAL_MS]) {
      readThumbSettings()
        .then(() => applyThumbSchedule())
        .catch(() => {});
    }

    if (changes[KEY_DEEP_HARVEST_QUIET_UI]) {
      deepHarvestQuietUi = isDeepHarvestQuietUiEnabled(
        changes[KEY_DEEP_HARVEST_QUIET_UI].newValue
      );
      if (
        !deepHarvestQuietUi &&
        recording &&
        liveId &&
        locationAllowsCommentRecording() &&
        deepHarvestTimer
      ) {
        cancelPendingDeepHarvest();
        scheduleDeepHarvest(DEEP_HARVEST_REASONS.liveIdChange);
      } else if (!deepHarvestQuietUi) {
        removeDeepHarvestLoadingUi();
      }
    }

    if (changes[KEY_RECORDING]) {
      recording = isRecordingEnabled(changes[KEY_RECORDING].newValue);
      if (recording) {
        pendingRoots.add(document.body);
        reconnectMutationObserver();
        scheduleFlush();
        scheduleDeepHarvest(DEEP_HARVEST_REASONS.recordingOn);
        tryAttachScrollHookSoon();
      } else {
        ndgrLastReceivedAt = 0;
        cancelPendingDeepHarvest();
        resetOfficialCommentSamplingState();
        void clearCommentHarvestPanelDiagnostic();
      }
    }
  });

  if (recording && liveId) {
    pendingRoots.add(document.body);
    scheduleFlush();
    scheduleDeepHarvest(DEEP_HARVEST_REASONS.startup);
    tryAttachScrollHookSoon();
    for (const ms of BOOTSTRAP_DELAYS_MS) {
      setTimeout(() => {
        if (recording && liveId && locationAllowsCommentRecording()) {
          maybeFillProgramBeginFromEmbeddedData();
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

  setInterval(() => {
    tryPeriodicQuietDeepHarvest();
  }, DEEP_HARVEST_PERIODIC_MS);

  document.addEventListener('visibilitychange', onTabVisibleForCommentHarvest);

  pollStatsFromPage();
  setInterval(() => {
    if (!hasExtensionContext()) return;
    pollStatsFromPage();
  }, STATS_POLL_MS);
}

/*
 * document の data-nls-active だけだと、拡張の再読み込み後に isolated world が新しくなっても
 * 属性が残り start() が二度と走らず、記録・パネルがすべて死ぬ。実行ごとの global フラグで開始する。
 */
const __nlsBootGlobal = typeof globalThis !== 'undefined' ? globalThis : window;
if (!__nlsBootGlobal.__NLS_CONTENT_ENTRY_STARTED__) {
  __nlsBootGlobal.__NLS_CONTENT_ENTRY_STARTED__ = true;
  try {
    document.documentElement.setAttribute('data-nls-active', '1');
  } catch {
    // no-op
  }
  start().catch((err) => reportSilentErrorToStorage('start', err));
}
