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
  KEY_INLINE_PANEL_AUTOSHOW_ENABLED,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE,
  normalizeInlinePanelAutoshowEnabled,
  normalizeInlinePanelViewportWidePolicy,
  normalizeInlinePanelViewportWideOnceDone,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_BELOW,
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
import { mergeGiftUserThrowEvents } from '../lib/giftRecord.js';
import {
  enrichIncomingGiftThrowUsersWithInterceptNicknames,
  upgradeGiftUserRowsWithInterceptNicknames
} from '../lib/giftDisplayNickname.js';
import {
  COMMENT_SUBMIT_CONFIRM_PROBE_MS,
  waitUntilEditorReflectsSubmit
} from '../lib/commentSubmitConfirm.js';
import { findCommentSubmitButton } from '../lib/commentPostDom.js';
import {
  findCommentPanelAssetLauncherButton,
  resolveCommentPanelAssetSearchScope
} from '../lib/nicoCommentPanelAssetLauncher.js';
import { collectLoggedInViewerProfile } from '../lib/watchPageViewerProfile.js';
import { shouldAssociateAvatarWithUser } from '../lib/avatarBroadcasterGuard.js';
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
  resolveWidenedInlinePanelWidthPx,
  shouldConsumeViewportWideOnce
} from '../lib/inlinePanelViewportWide.js';
import {
  scoreInlineHostAnchorCandidate,
  stackedLayoutAnchorOverrides,
  pickTightestEligibleAnchorRowIdx
} from '../lib/inlineHostAnchorScoring.js';
import { calculateDockBottomPanelHeight } from '../lib/inlineHostDockSizing.js';
import {
  calculateBesidePanelLayout,
  computeBesideInsertionGapPx,
  DEFAULT_BESIDE_PANEL_LIMITS
} from '../lib/inlineHostBesideSizing.js';
import { findBelowWideRowInsertAfterElement } from '../lib/inlineBelowWideRowInsert.js';
import {
  applyRecognitionResult,
  isVoiceCommentSupported,
  VOICE_COMMENT_MAX_CHARS
} from '../lib/voiceComment.js';
import { audioConstraintsForDevice } from '../lib/voiceInputDevices.js';
import { pollUntil } from '../lib/pollUntil.js';
import {
  isInlinePanelHostReadyForFocus,
  shouldRespondFocusedNowFromToolbar
} from '../lib/inlinePanelFocusGate.js';
import {
  extractEmbeddedDataProps,
  pickViewerCountFromEmbeddedData,
  pickProgramBeginAt
} from '../lib/embeddedDataExtract.js';
import { countRecentActiveUsers } from '../lib/concurrentEstimate.js';
import { summarizeOfficialCommentHistory } from '../lib/officialStatsWindow.js';
import { buildWatchSnapshotOfficialFields } from '../lib/watchSnapshotOfficialFields.js';
import { mergeUserIdForEnrichment } from '../lib/userIdPreference.js';
import {
  COMMENT_INGEST_SOURCE,
  maybeAppendCommentIngestLog
} from '../lib/commentIngestLog.js';
import { migrateFloatingInlinePanelToDockOnce } from '../lib/migrateInlinePanelFloatToDock.js';
import { migrateBelowInlinePanelToDockOnce } from '../lib/migrateInlinePanelBelowToDock.js';
import { migrateSuggestInitialInlinePanelPlacementOnce } from '../lib/migrateSuggestInitialInlinePanelPlacement.js';
import { createPersistCoalescer } from '../lib/persistThrottle.js';
import { resolveUserEntryAvatarSignals } from '../lib/userEntryAvatarResolve.js';
import { buildSilentErrorPayload, isContextInvalidatedError as isCtxInvalidated } from '../lib/reportSilentError.js';
import { cleanNdgrChatRows } from '../lib/cleanNdgrChatRows.js';
import { trimMapToMax } from '../lib/trimMap.js';
import { diagnosePersistGate } from '../lib/commentSubmitSteps.js';
import {
  INGEST_TIMING,
  SUBMIT_TIMING,
  MAP_LIMITS,
  HARVEST_TIMING,
  OFFICIAL_GAP_DEEP_TIMING
} from '../lib/timingConstants.js';
import { shouldTriggerOfficialGapDeepHarvest } from '../lib/shouldTriggerOfficialGapDeepHarvest.js';
import {
  shouldForceDeepHarvestForReason,
  shouldForceDeepHarvestRecovery,
  shouldSkipDeepHarvest
} from '../lib/shouldSkipDeepHarvest.js';
import { DEEP_HARVEST_REASONS } from '../lib/deepHarvestReason.js';
import { formatPipelinePhase } from '../lib/commentPipelineLog.js';
import { planDeepExportSweep } from '../lib/deepExportPolicy.js';
import { applyInlineHostPlacementReset } from '../lib/inlineHostLayoutReset.js';
import { filterValidSelfPostedRecents } from '../lib/selfPostedMatcher.js';
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
import { extractBroadcasterUserId } from '../lib/broadcasterUserId.js';
import { resolveChannelBroadcasterMeta } from '../lib/channelBroadcasterMeta.js';
import { decidePrewarmLeaseAction } from '../lib/prewarmCoordinator.js';
import {
  KEY_COMMENT_PANEL_AUTO_RESTORE,
  LATEST_COMMENT_BUTTON_SELECTOR,
  decideCommentPanelRestoreAction,
  normalizeCommentPanelAutoRestoreEnabled
} from '../lib/commentPanelHealthProbe.js';

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
const DEEP_HARVEST_RECOVERY_MS = HARVEST_TIMING.deepRecoveryMs;
/**
 * deep が 0 件で終わったとき（コメント一覧の仮想スクロール宿主が未確定など）に quiet deep を追いかける上限。
 * `force:true` で NDGR active の skip を避ける。多重タイマーは積まない。
 */
const DEEP_HARVEST_ZERO_ROW_RETRY_MAX = 2;
const DEEP_HARVEST_ZERO_ROW_RETRY_DELAY_MS = 1600;
/** 定期 quiet deep は既定 1-pass。この間隔ごとに 2-pass で仮想リスト取りこぼしを回収する */
const PERIODIC_DEEP_FULL_TWO_PASS_EVERY = 2;
let periodicDeepWeakPassTick = 0;
/** 長めの待ちのあいだ、オリジナルキャラクターりんくで「読み込み中」と示す（web_accessible と一致させる） */
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
/** NDGR / 本家 statistics の累計ギフト pt（視聴メッセージ経路・プレイヤー下表示に近い） */
/** @type {number|null} */
let officialGiftPoints = null;
/** NDGR / 本家 statistics の広告・応援系累計 pt */
/** @type {number|null} */
let officialAdPoints = null;
/** giftPoints / adPoints が最後に更新された時刻 */
let officialGiftAdStatsUpdatedAt = 0;
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
/**
 * Mutation から flush までの差分ノード集合（`Set<Element|Node>`）。
 * 上限は持たないが、極端バースト時はメモリ一時増の可能性がある。
 * 将来案: 閾値超で body に畳む + 即 flush（重複行とトレードオフのため実装前に実測・persist 側 dedupe を要確認）。
 * @type {Set<Element|Node>}
 */
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
/** deep が 0 件だったときの遅延リトライ予算（liveId 変更時に MAX へ） */
let deepHarvestZeroRowRetryBudget = 0;
/** @type {ReturnType<typeof setTimeout>|null} */
let deepHarvestZeroRowRetryTimer = null;
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

/** @type {ReturnType<typeof setTimeout>|null} */
let giftNickFromInterceptTimer = null;
const GIFT_NICK_FROM_INTERCEPT_DEBOUNCE_MS = 280;

function scheduleGiftNickUpgradeFromInterceptDebounced() {
  if (!hasExtensionContext()) return;
  if (giftNickFromInterceptTimer != null) clearTimeout(giftNickFromInterceptTimer);
  giftNickFromInterceptTimer = setTimeout(() => {
    giftNickFromInterceptTimer = null;
    const lid = String(liveId || '').trim().toLowerCase();
    if (!lid) return;
    void maybeUpgradeGiftUserNicknamesFromInterceptMap(lid);
  }, GIFT_NICK_FROM_INTERCEPT_DEBOUNCE_MS);
}

/**
 * intercept で得た表示名で nls_gift_users_* の内部ラベル／弱ニックを後追い上書きする。
 * @param {string} lidNorm
 */
async function maybeUpgradeGiftUserNicknamesFromInterceptMap(lidNorm) {
  if (!lidNorm || !hasExtensionContext()) return;
  try {
    const key = giftUsersStorageKey(lidNorm);
    const bag = await chrome.storage.local.get(key);
    const existing = Array.isArray(bag[key]) ? bag[key] : [];
    const { next, storageTouched } = upgradeGiftUserRowsWithInterceptNicknames(
      existing,
      (uid) => String(interceptedNicknames.get(String(uid || '').trim()) || '').trim()
    );
    if (!storageTouched) return;
    await chrome.storage.local.set({ [key]: next });
  } catch (err) {
    reportSilentErrorToStorage('giftNickInterceptUpgrade', err);
  }
}
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
/** ライブ中「公式−記録」ギャップ追い deep の最終発火時刻 */
let lastOfficialGapDeepHarvestAt = 0;

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
 * ライブ中: statistics の公式コメ累計と記録件数の差が大きいとき、quiet deep を追いで掛ける。
 * 終了検知後の maybeRunEndedBulkHarvest と併用（終了後はそちらが本体）。
 */
function maybeOfficialGapQuietDeepHarvest() {
  if (
    !shouldTriggerOfficialGapDeepHarvest({
      recording,
      liveId,
      locationAllows: locationAllowsCommentRecording(),
      documentHidden:
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible',
      harvestRunning,
      now: Date.now(),
      lastTriggeredAt: lastOfficialGapDeepHarvestAt,
      cooldownMs: OFFICIAL_GAP_DEEP_TIMING.cooldownMs,
      officialCommentCount,
      recordedCommentCount: observedRecordedCommentCount,
      minOfficial: OFFICIAL_GAP_DEEP_TIMING.minOfficialComments,
      minGapAbsolute: OFFICIAL_GAP_DEEP_TIMING.minGapAbsolute,
      gapRatio: OFFICIAL_GAP_DEEP_TIMING.gapRatioOfOfficial
    })
  ) {
    return;
  }
  lastOfficialGapDeepHarvestAt = Date.now();
  void runDeepHarvest({
    stabilityFollowUp: false,
    force: true,
    armStabilityFollowUp: false
  }).catch((err) =>
    reportSilentErrorToStorage('officialGapDeepHarvest', err)
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
    try {
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
      // 0.1.82: 永続キャッシュ書き込み時に broadcaster icon の取り違えを防ぐ
      const broadcasterCtx = {
        broadcasterUid: broadcasterUidCache,
        broadcasterIconUrl: broadcasterIconUrlCache
      };
      for (const it of mergedItems) {
        if (upsertUserCommentProfileFromIntercept(profileMap, { uid: it.uid, name: it.name, av: it.av }, broadcasterCtx)) {
          cacheTouched = true;
        }
      }
      for (const u of mergedUsers) {
        if (upsertUserCommentProfileFromIntercept(profileMap, u, broadcasterCtx)) {
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
    } finally {
      scheduleGiftNickUpgradeFromInterceptDebounced();
    }
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
  scheduleGiftNickUpgradeFromInterceptDebounced();
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
  try {
    for (const v of applied) {
      const uid = String(v.userId || '').trim();
      if (!uid) continue;
      const nick = String(v.nickname || '').trim();
      const iconRaw = String(v.iconUrl || '').trim();
      const icon = isHttpAvatarUrl(iconRaw) ? iconRaw : '';
      if (nick) interceptedNicknames.set(uid, nick);
      if (icon && isAvatarSafeToAssociate(uid, icon)) interceptedAvatars.set(uid, icon);
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
        }, {
          broadcasterUid: broadcasterUidCache,
          broadcasterIconUrl: broadcasterIconUrlCache
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
  } finally {
    scheduleGiftNickUpgradeFromInterceptDebounced();
  }
}

let broadcasterUidCache = '';
let broadcasterUidCacheAt = 0;

// 0.1.76: ギフト演出 DOM での avatar 取り違え対策。snapshot 構築時に更新され、
// interceptedAvatars.set に紐付ける uid に対するガード判定で参照される。
let broadcasterIconUrlCache = '';

function isHttpAvatarUrl(v) {
  return /^https?:\/\//i.test(String(v || '').trim());
}

/**
 * interceptedAvatars に「uid -> av」を紐付ける前に、av が現在の配信者
 * アイコンに化けていないかを判定するガード。配信者本人 uid 以外への
 * broadcasterIconUrl 紐付けを抑止する（0.1.76: ギフト演出 DOM 対策）。
 *
 * @param {string} uid
 * @param {string} av
 * @returns {boolean} true なら紐付けて良い
 */
function isAvatarSafeToAssociate(uid, av) {
  return shouldAssociateAvatarWithUser({
    uid,
    av,
    broadcasterUid: broadcasterUidCache,
    broadcasterIconUrl: broadcasterIconUrlCache
  });
}

function resetOfficialStatsState() {
  officialViewerCount = null;
  officialCommentCount = null;
  officialGiftPoints = null;
  officialAdPoints = null;
  officialGiftAdStatsUpdatedAt = 0;
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
 * @param {{
 *   viewers?: number|null,
 *   comments?: number|null,
 *   giftPoints?: number|null,
 *   adPoints?: number|null,
 *   observedAt?: number
 * }} stats
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
  if (
    typeof stats?.giftPoints === 'number' &&
    Number.isFinite(stats.giftPoints) &&
    stats.giftPoints >= 0
  ) {
    officialGiftPoints = stats.giftPoints;
    officialGiftAdStatsUpdatedAt = at;
    touched = true;
  }
  if (
    typeof stats?.adPoints === 'number' &&
    Number.isFinite(stats.adPoints) &&
    stats.adPoints >= 0
  ) {
    officialAdPoints = stats.adPoints;
    officialGiftAdStatsUpdatedAt = at;
    touched = true;
  }
  if (touched) noteOfficialCommentSample(at);
}

/**
 * page-intercept（MAIN）からの postMessage を受ける。
 * 同一 window 以外は原則拒否するが、NDGR が iframe で動くと e.source が子フレームになり、
 * 子から top へブリッジされた NLS_INTERCEPT_* / NLS_SPA_NAVIGATION は同一 origin のみ許可する。
 * @param {MessageEvent} e
 */
function isTrustedPageInterceptMessageEvent(e) {
  if (e.source === window) return true;
  if (!e.data || typeof e.data.type !== 'string') return false;
  if (typeof e.origin !== 'string' || e.origin !== window.location.origin) return false;
  const t = e.data.type;
  if (t.startsWith('NLS_INTERCEPT_')) return true;
  if (t === 'NLS_SPA_NAVIGATION') return true;
  return false;
}

window.addEventListener('message', (e) => {
  if (!isTrustedPageInterceptMessageEvent(e)) return;
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
    const gp = e.data.giftPoints;
    const ap = e.data.adPoints;
    updateOfficialStatistics({
      ...(typeof v === 'number' && Number.isFinite(v) && v >= 0 ? { viewers: v } : {}),
      ...(typeof c === 'number' && Number.isFinite(c) && c >= 0 ? { comments: c } : {}),
      ...(typeof gp === 'number' && Number.isFinite(gp) && gp >= 0 ? { giftPoints: gp } : {}),
      ...(typeof ap === 'number' && Number.isFinite(ap) && ap >= 0 ? { adPoints: ap } : {}),
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
        const enriched = enrichIncomingGiftThrowUsersWithInterceptNicknames(raw, (uid) =>
          String(interceptedNicknames.get(String(uid || '').trim()) || '').trim()
        );
        const { next, storageTouched } = mergeGiftUserThrowEvents(existing, enriched);
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

  if (e.data.type === 'NLS_SPA_NAVIGATION') {
    const newUrl = String(e.data.url || '');
    const prevUrl = String(e.data.prevUrl || '');
    const newIsWatch = isNicoLiveWatchUrl(newUrl);
    const prevIsWatch = isNicoLiveWatchUrl(prevUrl);

    if (!newIsWatch) {
      syncLiveIdFromLocation();
      return;
    }
    if (newIsWatch && prevIsWatch && extractLiveIdFromUrl(newUrl) === extractLiveIdFromUrl(prevUrl)) {
      return;
    }
    const now = Date.now();
    if (now < spaNavThrottleUntil) return;
    spaNavThrottleUntil = now + 300;
    syncLiveIdFromLocation();
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
      if (sAv && isAvatarSafeToAssociate(sUid, sAv)) interceptedAvatars.set(sUid, sAv);
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
      if (sAv && sUid && isAvatarSafeToAssociate(sUid, sAv)) interceptedAvatars.set(sUid, sAv);
      if (sUid) activeUserTimestamps.set(sUid, seenNow);
      reconcileEntries.push({ no: sNo, uid: sUid, name: sName, av: sAv });
    }
  }
  trimMapToMax(activeUserTimestamps, ACTIVE_USER_MAP_MAX);
  trimMapToMax(interceptedUsers, INTERCEPT_MAP_MAX);
  // interceptedNicknames / interceptedAvatars も同じ userId キーで蓄積するが、
  // 従来 trim 対象外だったため、長時間配信（数千〜数万 commenter）で無制限に
  // 成長してメモリを圧迫していた（plan_scenario_audit.md の S5-1）。
  // VIEWER_JOIN flush は短間隔で走るので、ここで揃って trim すれば最古エントリが
  // 順次落ちる。Map.set は既存キーを更新するだけなので「現役」のものは残る。
  trimMapToMax(interceptedNicknames, INTERCEPT_MAP_MAX);
  trimMapToMax(interceptedAvatars, INTERCEPT_MAP_MAX);
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
/** ensureInlinePopupIframe のフォールバック visibility タイマー（重複防止） */
/** @type {ReturnType<typeof setTimeout>|null} */
let inlineIframeVisibilityTimer = null;
/** renderPageFrameOverlay のリエントラント防止 */
let renderingPageFrame = false;
/** SPA 遷移 throttle: 即実行し、その後このクールダウン中は無視 */
let spaNavThrottleUntil = 0;

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
const PAGE_FRAME_LAYOUT_SCROLL_DEBOUNCE_MS =
  INGEST_TIMING.pageFrameLayoutScrollDebounceMs;
const HIDDEN_LIVE_PANEL_SCAN_STRIDE = INGEST_TIMING.hiddenLivePanelScanStride;
const AI_SHARE_FAST_DIAG_HIDDEN_MIN_MS =
  INGEST_TIMING.aiShareFastDiagHiddenMinIntervalMs;
const AI_SHARE_FAST_DIAG_VISIBLE_MIN_MS =
  INGEST_TIMING.aiShareFastDiagVisibleMinIntervalMs;
const DEFAULT_PAGE_FRAME = 'light';
const LEGACY_PAGE_FRAME_ALIAS = {
  trio: 'light',
  link: 'light',
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

/** renderPageFrameOverlay 再入でスキップされたとき、finally 後に 1 回だけ追い描画 */
let pageFrameOverlayRenderDeferred = false;
/** @type {number|null} */
let pageFrameLoopTimer = null;
/** scroll レイアウト用 rAF スロットル / resize 用デバウンス（invalidate 時に cancel） */
/** @type {ReturnType<typeof setTimeout>|null} */
let pageFrameLayoutDebounceTimer = null;
/** scroll レイアウトを 1 フレーム 1 回に抑える（連続 scroll でデバウンスが延び続けるのを防ぐ） */
/** @type {number|null} */
let pageFrameLayoutScrollRafId = null;
/** 非可視時 livePanelScan の間引き位相（0..stride-1 で 0 のときだけ実行） */
let hiddenLivePanelScanPhase = 0;
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
  if (!hosts.length) {
    // 0.1.27 (AB): singleton が disconnected のまま残っていると
    // ensureInlinePopupHost の早期 return で「DOM には居ないが singleton 経由で
    // 古い host を返す」 race が起きる。DOM に 1 件も無いなら singleton も破棄。
    if (
      nlsInlinePopupHostSingleton &&
      !nlsInlinePopupHostSingleton.isConnected
    ) {
      nlsInlinePopupHostSingleton = null;
    }
    return null;
  }
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
  // 0.1.27 (AB): 確定した primary を singleton に追従させる。これを怠ると
  // 旧 singleton（既に DOM から消えた host）が ensureInlinePopupHost の
  // fallback 経路で返り、DOM にも primary が居るのに別 host が iframe を
  // 抱えるので「画面に 2 つの host が出る」race の元になる。
  nlsInlinePopupHostSingleton = primary;
  return primary;
}

/** @param {HTMLDivElement} host */
function ensureInlinePopupIframe(host) {
  if (!(host instanceof HTMLDivElement)) return;
  const expectedSrc = (() => {
    try {
      return chrome.runtime.getURL('popup.html') + '?inline=1';
    } catch {
      return '';
    }
  })();
  const existing = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (existing && String(existing.getAttribute('src') || '').trim() === expectedSrc) {
    return;
  }
  let iframe = existing;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = INLINE_POPUP_IFRAME_ID;
    iframe.setAttribute('title', 'nicolivelog inline panel');
    iframe.setAttribute('allow', 'microphone');
    iframe.style.pointerEvents = 'auto';
    iframe.style.visibility = 'hidden';
    host.appendChild(iframe);
  }
  if (expectedSrc) {
    iframe.setAttribute('src', expectedSrc);
  }
  iframe.addEventListener(
    'load',
    () => {
      if (inlineIframeVisibilityTimer) {
        clearTimeout(inlineIframeVisibilityTimer);
        inlineIframeVisibilityTimer = null;
      }
      requestAnimationFrame(() => {
        iframe.style.visibility = 'visible';
        host.style.opacity = '1';
      });
    },
    { once: true }
  );
  if (inlineIframeVisibilityTimer) clearTimeout(inlineIframeVisibilityTimer);
  inlineIframeVisibilityTimer = setTimeout(() => {
    inlineIframeVisibilityTimer = null;
    iframe.style.visibility = 'visible';
    host.style.opacity = '1';
  }, 2000);
}

function ensureInlinePopupHost() {
  let host = pickPrimaryInlinePopupHostFromDom();
  if (host) {
    ensureInlinePopupIframe(host);
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

/**
 * placement 切替時に host 要素から前モードのインラインスタイル / クラス / aria-hidden を落とす。
 *
 * 旧実装は floating / dock_bottom を「外すとき」だけを想定していたが、
 *   - below/beside → floating で renderInlinePanelFloatingHost() が先に呼ばれて cleanup を通らない
 *   - width / maxWidth / marginLeft / boxSizing / display / opacity / pointerEvents が漏れ
 * というバグ #3「パネル位置を変えるとおかしくなる」を生んでいた。
 * 正本リストは `../lib/inlineHostLayoutReset.js` に一本化し、ここは DOM 側の入口。
 */
function clearInlineHostFloatingLayout(host) {
  if (!(host instanceof HTMLElement)) return;
  applyInlineHostPlacementReset(host);
}

/**
 * 拡張アイコンを押したときのポップアップに近い、画面角に fixed するパネル（プレイヤー DOM 非依存）。
 * 角は `inlineFloatingAnchor`（storage: nls_inline_floating_anchor）。
 */
function renderInlinePanelFloatingHost() {
  const host = ensureInlinePopupHost();
  // 前モード（below/beside/dock_bottom）の残留スタイル・クラスを先に完全リセット。
  // これを飛ばすと marginLeft / width などが前モードの値のまま上書きされ、
  // 「パネル位置を変えると画面外に飛ぶ / 横幅が残る」バグ #3 を再現する。
  clearInlineHostFloatingLayout(host);
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
  // 0.1.89: floating でも host overflow:auto は iframe 内部 scroll と二重になる
  host.style.overflow = 'hidden';
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
  // 閉じるボタン（A30）。元は floating 専用だったが、0.1.11 (B2) で dock_bottom
  // にも追加（dock_bottom も同様に panel を非表示にする手段が無く、設定画面で
  // placement を変えないと消せなかった）。一度だけ生成して再利用する。
  ensureInlinePanelCloseButton(host);
  maybeReconnectCommentMutationObserverAfterInlineLayout();
}

/**
 * インラインパネル host に「× 閉じる」ボタンを 1 つだけ用意する（floating /
 * dock_bottom 共通）。押下時は host を hide + `toolbarInitiatedShowThisSession`
 * を false に戻し、autoshow 設定でも次回ロードまで再表示しない（ユーザーが
 * 明示的に閉じた状態を尊重）。
 * @param {HTMLElement} host
 */
function ensureInlinePanelCloseButton(host) {
  if (!host) return;
  let btn = /** @type {HTMLButtonElement|null} */ (
    host.querySelector('[data-nls-inline-close]')
  );
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-nls-inline-close', '1');
    btn.setAttribute('aria-label', 'パネルを閉じる');
    btn.title = 'パネルを閉じる';
    btn.textContent = '×';
    btn.style.cssText = [
      'position:absolute',
      'top:4px',
      'right:8px',
      'z-index:2147483647',
      'width:24px',
      'height:24px',
      'border:none',
      'border-radius:999px',
      'background:rgba(15,23,42,0.65)',
      'color:#fff',
      'font-size:16px',
      'line-height:1',
      'cursor:pointer',
      'box-shadow:0 1px 3px rgba(0,0,0,0.2)'
    ].join(';');
    btn.addEventListener('click', () => {
      try {
        host.style.display = 'none';
        host.style.opacity = '0';
        host.setAttribute('aria-hidden', 'true');
        host.style.pointerEvents = 'none';
        toolbarInitiatedShowThisSession = false;
      } catch {
        // no-op
      }
    });
    host.appendChild(btn);
  }
}

/**
 * 視聴ページ下部にビューポート固定で広げる（ポップアップ風より視認しやすい既定用）。
 * プレイヤー DOM 非依存のため、ターゲット video の遅延があっても先に出せる。
 *
 * 0.1.65 (AU): panel 高さの計算を `calculateDockBottomPanelHeight` (純粋関数)
 *   に切り出し。video + コメ列の bottom が取れれば残りスペースに合わせ、取れ
 *   なければ viewport*0.4 のフォールバック。viewport / player 変化は

 *   `ensureInlineHostReflowListener` の resize listener で再呼び出しして追従する。
 */
function renderInlinePanelDockBottomHost() {
  const host = ensureInlinePopupHost();
  clearInlineHostFloatingLayout(host);
  host.classList.remove('nls-inline-host--floating');
  host.classList.add('nls-inline-host--dock-bottom');
  const viewport = nlsViewportSize();
  let vh = Number(viewport.innerHeight) || 0;
  if (vh < 280) vh = 720;

  // video + コメ列の bottom を取得（取れなければ null=フォールバック）
  let playerRowBottom = null;
  try {
    const video = document.querySelector('video');
    if (
      video instanceof HTMLVideoElement &&
      video.getBoundingClientRect().height >= 100
    ) {
      const insertAfter = findFrameInsertAnchorFromVideo(video);
      if (insertAfter instanceof HTMLElement) {
        const playerRect = resolvePlayerRowRect(video, insertAfter);
        if (
          playerRect &&
          Number.isFinite(playerRect.top) &&
          Number.isFinite(playerRect.height) &&
          playerRect.height > 0
        ) {
          playerRowBottom = playerRect.top + playerRect.height;
        }
      }
    }
  } catch {
    // no-op: 取れなければ fallback ratio が効く
  }

  const sizing = calculateDockBottomPanelHeight({
    viewportHeight: vh,
    playerRowBottom,
    contentNaturalHeight: null
  });
  const iframeInnerH = sizing.height;
  const hostMaxH = iframeInnerH + 16; // 上下の余白

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
  host.style.maxHeight = `${hostMaxH}px`;
  host.style.marginLeft = '0';
  // 0.1.89: host は iframe wrapper のみ（hostMaxH = iframeInnerH + 16 で
  //   iframe より 16px 大きいだけ）。overflow:auto だと iframe 内の .nl-main
  //   の scrollbar と二重になる症状（複数タブ時に顕在化）の根治のため hidden に。
  host.style.overflow = 'hidden';
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
  ensureInlineHostReflowListener();
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
  // 0.1.11 (B2): dock_bottom でも閉じるボタンを設置（floating と共通）。
  // 元は floating だけで「× 閉じる」を出していたが、dock_bottom も同じ理由で
  // ユーザーが明示的に閉じる手段が必要だった（設定画面に行かないと消せない）。
  ensureInlinePanelCloseButton(host);
  maybeReconnectCommentMutationObserverAfterInlineLayout();
}

/**
 * inline panel host が viewport / player rect 変化に追従するための共通 resize
 * listener。0.1.65 (AU) で dock_bottom 用に導入、0.1.66 (AV) で beside / below
 * にも対応。一度だけ登録し、以降 resize で 150ms debounce 後に再描画する。
 * Visual Viewport の変化（ズーム・モバイル UI chrome）にも追従する。
 * floating は dock / beside / below と同様に resize で再描画し、ウィンドウサイズ
 * 変化後もパネル寸法と MutationObserver 取り直しが取りこぼされないようにする。
 * beside/below で video が一時的に取れないときはレイアウトのみ skip し、
 * `maybeReconnectCommentMutationObserverAfterInlineLayout` で監視だけ更新する。
 */
let __inlineHostReflowListenerRegistered = false;
function ensureInlineHostReflowListener() {
  if (__inlineHostReflowListenerRegistered) return;
  __inlineHostReflowListenerRegistered = true;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  const reflow = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const placement = getEffectiveInlinePanelPlacement();
        if (placement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
          renderInlinePanelDockBottomHost();
        } else if (placement === INLINE_PANEL_PLACEMENT_FLOATING) {
          renderInlinePanelFloatingHost();
        } else if (
          placement === INLINE_PANEL_PLACEMENT_BESIDE ||
          placement === INLINE_PANEL_PLACEMENT_BELOW
        ) {
          // beside / below は video 必須。video が取れる時だけ再描画
          const v = document.querySelector('video');
          if (
            v instanceof HTMLVideoElement &&
            v.getBoundingClientRect().height >= 100
          ) {
            renderInlineHostAnchoredToVideo(v);
          } else {
            maybeReconnectCommentMutationObserverAfterInlineLayout();
          }
        }
      } catch {
        // no-op
      }
    }, 150);
  };
  try {
    window.addEventListener('resize', reflow, { passive: true });
    const vv = window.visualViewport;
    if (vv && typeof vv.addEventListener === 'function') {
      vv.addEventListener('resize', reflow, { passive: true });
      vv.addEventListener('scroll', reflow, { passive: true });
    }
  } catch {
    // no-op: addEventListener が使えない環境（test 等）はスキップ
  }
}

/**
 * video から親を辿り、プレイヤー列（映像＋公式コメント欄を含むブロック）相当の要素を選ぶ。
 * その要素の「直後」にホストを置くと、コメント入力バーの下〜列の下に自然に付く（video 直後だけだとバーの上に挟まることがある）。
 * body / documentElement は候補にしない（誤って最外に出さない）。
 *
 * 0.1.64 (AT): 旧スコアリング (aspect <= 3.4 / area <= viewport*0.92) は緩く、
 *   ニコ生 SPA で「視聴行 + コメント欄 + バナー一式」を含む巨大ラッパーがヒット
 *   して、その直後（description / Amazon / 関連配信の直前）にパネルが挿入される
 *   事象が頻発していた。`scoreInlineHostAnchorCandidate` (純粋関数) に切り出し、
 *   video rect とのジオメトリ整合（幅比 0.95–1.6 / 高さ比上限 / top オフセット
 *   上限）まで含めて厳格化した。0.1.63 で below → dock_bottom の応急 migration
 *   を入れているが、本関数の改善で `below` モードを再度推奨できる品質に戻す
 *   下地ができた。詳細は src/lib/inlineHostAnchorScoring.js のヘッダコメント参照。
 *
 *   0.1.109: eligible が複数あるとき **スコア最大**では浅い巨大ラッパーが選ばれ、
 *   関連放送などより下にパネルが付くことがあった。**面積最小**（プレイヤー行に密なブロック）
 *   を優先して選ぶ（pickTightestEligibleAnchorRowIdx）。
 * @param {HTMLElement} base
 */
function findFrameInsertAnchorFromVideo(base) {
  if (!(base instanceof HTMLElement)) return base;
  const viewportSize = nlsViewportSize();
  const viewport = {
    width: viewportSize.innerWidth,
    height: viewportSize.innerHeight
  };
  const videoEl =
    base instanceof HTMLVideoElement ? base : base.querySelector?.('video');
  const vr = (videoEl ?? base).getBoundingClientRect();
  const videoRect = {
    left: vr.left,
    top: vr.top,
    width: vr.width,
    height: vr.height
  };
  const anchorOverrides = stackedLayoutAnchorOverrides(viewport, videoRect);
  /** @type {{ el: HTMLElement, idx: number, area: number, score: number, width: number, height: number }[]} */
  const eligibleRows = [];
  let cur = base;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur === document.body || cur === document.documentElement) break;
    if (cur.querySelector?.(`#${INLINE_POPUP_HOST_ID}`)) {
      cur = cur.parentElement;
      continue;
    }
    const r = cur.getBoundingClientRect();
    const result = scoreInlineHostAnchorCandidate(
      {
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        viewport,
        videoRect
      },
      anchorOverrides
    );
    if (result.eligible) {
      eligibleRows.push({
        idx: eligibleRows.length,
        el: cur,
        area: Math.max(0, r.width * r.height),
        score: result.score,
        width: r.width,
        height: r.height
      });
    }
    cur = cur.parentElement;
  }
  if (!eligibleRows.length) return base;

  const pickedIdx = pickTightestEligibleAnchorRowIdx(
    eligibleRows.map(({ idx, area, score, width, height }) => ({
      idx,
      area,
      score,
      width,
      height
    })),
    videoRect
  );
  if (pickedIdx < 0 || pickedIdx >= eligibleRows.length) return base;
  return eligibleRows[pickedIdx].el;
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
 * 視聴ページで extension のインラインパネルを自動表示するかどうか（storage から更新）。
 * 既定 false（opt-in）。ユーザが popup で明示的に ON にしたときだけ自動で出る。
 * 既定 OFF の狙いは「こん太を押す前から勝手に出る」UX 不一致の回避。
 */
let inlinePanelAutoshowEnabled = normalizeInlinePanelAutoshowEnabled(undefined);

/** プレイヤー行の下／横付きでタブ幅に近いまで広げる方針（storage から更新） */
let inlinePanelViewportWidePolicy =
  normalizeInlinePanelViewportWidePolicy(undefined);

/** `once` 方針を適用済みか（storage から更新） */
let inlinePanelViewportWideOnceDone =
  normalizeInlinePanelViewportWideOnceDone(undefined);

/**
 * このタブで一度でもツールバーアイコンを押したか（セッション局所フラグ、storage には持たない）。
 * autoshow が false でもツールバーを押した瞬間から同じタブでは表示する（one-shot 解禁）。
 */
let toolbarInitiatedShowThisSession = false;

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
  const vw = nlsLayoutViewportSize().innerWidth;
  const minRowW = Math.min(720, Math.max(400, vw * 0.46));
  let node = video;
  for (let depth = 0; depth < 24 && node && node !== document.body; depth++) {
    const parent = node.parentElement;
    if (!parent) break;
    try {
      const cs = window.getComputedStyle(parent);
      const flexWrapRaw = cs.flexWrap || 'nowrap';
      if (flexWrapRaw !== 'nowrap') {
        node = parent;
        continue;
      }
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
 * `once` 方針のとき、可視タブで below/beside を初めて描画したら消費フラグを保存する。
 */
function maybePersistViewportWideOnceConsumed() {
  const eff = getEffectiveInlinePanelPlacement();
  if (
    !shouldConsumeViewportWideOnce({
      policy: inlinePanelViewportWidePolicy,
      onceDone: inlinePanelViewportWideOnceDone,
      placement: eff,
      documentVisibilityState:
        typeof document !== 'undefined' ? document.visibilityState : 'visible'
    })
  ) {
    return;
  }
  inlinePanelViewportWideOnceDone = true;
  try {
    void chrome.storage.local.set({
      [KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]: true
    });
  } catch {
    // no-op
  }
}

/**
 * タブ幅広げ時に、狭い列の中でもビューポート右端まで届くよう margin / 幅を補正する。
 * （親が overflow:hidden のときはこれでも切れるが、多くの watch レイアウトでは右へ伸びる）
 * @param {HTMLElement} host
 * @param {HTMLIFrameElement|null} iframe
 * @param {number} widenedPx
 * @param {{ innerWidth: number }} viewport
 * @param {number} baseRounded
 */
function applyViewportWideBleedToHostEdges(
  host,
  iframe,
  widenedPx,
  viewport,
  baseRounded
) {
  const vw = Math.round(Number(viewport.innerWidth) || 0);
  if (!(host instanceof HTMLElement) || vw < 400) return;
  const edge = 12;
  try {
    void host.offsetWidth;
  } catch {
    return;
  }
  let ml = 0;
  const mlStr = host.style.marginLeft;
  if (mlStr && typeof mlStr === 'string' && mlStr.endsWith('px')) {
    ml = parseFloat(mlStr) || 0;
  } else {
    try {
      ml = parseFloat(window.getComputedStyle(host).marginLeft) || 0;
    } catch {
      ml = 0;
    }
  }
  let rect = host.getBoundingClientRect();
  const left0 = Number(rect.left) || 0;
  if (left0 > edge + 0.5) {
    ml = Math.round(ml - (left0 - edge));
    host.style.marginLeft = `${ml}px`;
  }
  try {
    void host.offsetWidth;
  } catch {
    // no-op
  }
  rect = host.getBoundingClientRect();
  const left1 = Number(rect.left) || 0;
  const spanCap = Math.floor(vw - edge - left1);
  if (spanCap <= baseRounded) return;
  const finalW = Math.min(Math.round(widenedPx), spanCap);
  if (finalW <= baseRounded) return;
  host.style.width = `${finalW}px`;
  host.style.maxWidth = `${finalW}px`;
  if (iframe) {
    iframe.style.width = `${finalW}px`;
    iframe.style.maxWidth = `${finalW}px`;
  }
}

/**
 * @param {HTMLElement} host
 * @param {HTMLIFrameElement|null} iframe
 * @param {{ baselineWidthPx: number, hostAttachFallbackBody: boolean }} opts
 */
function applyInlineHostPanelWidthWithViewportWide(host, iframe, opts) {
  const { baselineWidthPx, hostAttachFallbackBody } = opts;
  const viewport = nlsViewportSize();
  const baseRounded = Math.max(1, Math.round(Number(baselineWidthPx) || 0));

  if (hostAttachFallbackBody) {
    const w = Math.min(720, Math.max(320, Math.round(viewport.innerWidth - 24)));
    host.style.width = `${w}px`;
    /*
     * max-width:100% だと親が狭いときに width を上書きしてしまう。
     * body 直下でも明示幅と揃えて確実に適用する。
     */
    host.style.maxWidth = `${w}px`;
    if (iframe) {
      iframe.style.width = `${w}px`;
      iframe.style.maxWidth = `${w}px`;
    }
    return;
  }

  const eff = getEffectiveInlinePanelPlacement();
  const widened = resolveWidenedInlinePanelWidthPx({
    baselineWidthPx,
    viewportInnerWidth: viewport.innerWidth,
    placement: eff,
    policy: inlinePanelViewportWidePolicy,
    onceDone: inlinePanelViewportWideOnceDone
  });
  host.style.width = `${widened}px`;
  /*
   * 視聴行の子 flex 内では max-width:100% が「親列の幅」になり、
   * width をタブ幅まで広げても見た目が動画列幅のまま残る（ユーザ報告）。
   * 実際に広げたときだけ max-width を明示 px にしてキャップを外す。
   */
  if (widened > baseRounded) {
    host.style.maxWidth = `${widened}px`;
  } else {
    host.style.maxWidth = '100%';
  }
  if (iframe) {
    iframe.style.width = `${widened}px`;
    if (widened > baseRounded) {
      iframe.style.maxWidth = `${widened}px`;
    } else {
      iframe.style.removeProperty('max-width');
    }
  }
  if (widened > baseRounded) {
    applyViewportWideBleedToHostEdges(host, iframe, widened, viewport, baseRounded);
  }
  maybePersistViewportWideOnceConsumed();
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
  /**
   * 0.1.66 (AV): beside 用の純粋関数で計算した panel 幅・高さ。null の時は
   * 利用可能幅不足で below フォールバック中（既存の computeInlinePanelLayout
   * を使う）。
   * @type {{ panelWidth: number, panelHeight: number, source: string } | null}
   */
  let besideLayout = null;

  if (placement === INLINE_PANEL_PLACEMENT_BESIDE) {
    const col = findBesideFlexRowColumnInsertion(video);
    if (col?.hostParent && col.insertAfter) {
      // beside 用の幅・高さを純粋関数で再計算
      const layoutVp = nlsLayoutViewportSize();
      const vrCheck = video.getBoundingClientRect();
      const insertCol = col.insertAfter;
      const columnRect =
        insertCol instanceof HTMLElement
          ? insertCol.getBoundingClientRect()
          : null;
      const ns =
        insertCol instanceof HTMLElement
          ? insertCol.nextElementSibling
          : null;
      const nextLeft =
        ns instanceof HTMLElement ? ns.getBoundingClientRect().left : null;
      const vwPx = layoutVp.innerWidth;
      const flexGapPx =
        columnRect && Number.isFinite(columnRect.right)
          ? computeBesideInsertionGapPx(columnRect.right, vwPx, nextLeft)
          : null;
      const playerRect =
        insertCol instanceof HTMLElement
          ? resolvePlayerRowRect(video, insertCol)
          : null;
      const layoutCheck = calculateBesidePanelLayout({
        videoRect: {
          left: vrCheck.left,
          top: vrCheck.top,
          width: vrCheck.width,
          height: vrCheck.height
        },
        playerRowRect: playerRect
          ? {
              left: playerRect.left,
              top: playerRect.top,
              width: playerRect.width,
              height: playerRect.height
            }
          : null,
        viewport: {
          width: layoutVp.innerWidth,
          height: layoutVp.innerHeight
        },
        contentNaturalHeight: null,
        flexInsertionGapPx: flexGapPx
      });
      if (layoutCheck) {
        insertAfter = col.insertAfter;
        hostParent = col.hostParent;
        besideFlexRowColumn = true;
        besideLayout = layoutCheck;
      } else {
        /*
         * flex ギャップ実測だけだと minWidth 未満（公式コメ列が隣接）でも、
         * viewport 右に十分な余白があれば「行内・動画列の次」に留める。
         * 実ギャップ優先で null になったときだけ body 直下 below へ落とすと
         * E2E mock や「コメ列は狭いがページ右は空いている」レイアウトで破綻する。
         */
        const layoutVpWide = nlsLayoutViewportSize();
        const vrw = video.getBoundingClientRect();
        const safeR = Number(DEFAULT_BESIDE_PANEL_LIMITS.safeRight) || 12;
        const minW = Number(DEFAULT_BESIDE_PANEL_LIMITS.minWidth) || 280;
        const viewportRightGap =
          layoutVpWide.innerWidth -
          (vrw && Number.isFinite(vrw.right) ? vrw.right : 0) -
          safeR;
        if (viewportRightGap >= minW) {
          insertAfter = col.insertAfter;
          hostParent = col.hostParent;
          besideFlexRowColumn = true;
          besideLayout = null;
        } else {
          const r = resolveInlinePanelInsertAnchor(
            domAnchor,
            INLINE_PANEL_PLACEMENT_BELOW
          );
          insertAfter = /** @type {HTMLElement} */ (r.insertAfter);
          hostParent = r.hostParent;
        }
      }
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

  /*
   * ディープ修正: Grid / 入れ子レイアウトで domAnchor が動画列の内側に留まると、
   * ホストが overflow でクリップされタブ幅に届かない。動画＋公式コメを両方含む
   * 十分な幅のうち domAnchor から見て内側で最初に当たる祖先の直後へ出す（0.1.118 の margin 補正と併用）。
   */
  if (
    placement === INLINE_PANEL_PLACEMENT_BELOW &&
    !besideFlexRowColumn &&
    video instanceof HTMLElement
  ) {
    const layoutVpWideRow = nlsLayoutViewportSize();
    const wideAfter = findBelowWideRowInsertAfterElement({
      domAnchor,
      videoEl: video,
      commentPanel: findNicoCommentPanel(document),
      viewportInnerWidth: layoutVpWideRow.innerWidth,
      viewportInnerHeight: layoutVpWideRow.innerHeight
    });
    if (wideAfter instanceof HTMLElement) {
      const wideHostParent = insertionParentForElement(wideAfter);
      if (wideHostParent) {
        insertAfter = wideAfter;
        hostParent = wideHostParent;
      }
    }
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
    maybeReconnectCommentMutationObserverAfterInlineLayout();
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
  const rowRectCapEl =
    insertAfter instanceof HTMLElement ? insertAfter : domAnchor;
  const rowRect =
    mode === 'player_row'
      ? resolvePlayerRowRect(video, rowRectCapEl)
      : null;
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
  // max-width は applyInlineHostPanelWidthWithViewportWide が最終決定（100% だと親列で潰れる）
  // 0.1.66 (AV): beside で純粋関数結果が取れていればそれを優先（幅・高さ）
  const finalPanelWidthPx = besideLayout?.panelWidth ?? panelWidthPx;
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  applyInlineHostPanelWidthWithViewportWide(host, iframe, {
    baselineWidthPx: finalPanelWidthPx,
    hostAttachFallbackBody
  });
  // beside の高さを動画行の自然高さに揃える（縦間延びの解消）
  if (besideLayout) {
    host.style.maxHeight = `${besideLayout.panelHeight}px`;
    if (iframe) {
      iframe.style.height = `${besideLayout.panelHeight}px`;
      iframe.style.maxHeight = `${besideLayout.panelHeight}px`;
    }
  }
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
  // 0.1.66 (AV): viewport / video rect 変化に追従
  ensureInlineHostReflowListener();
  maybeReconnectCommentMutationObserverAfterInlineLayout();
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
    maybeReconnectCommentMutationObserverAfterInlineLayout();
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
  // max-width は applyInlineHostPanelWidthWithViewportWide が最終決定
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  applyInlineHostPanelWidthWithViewportWide(host, iframe, {
    baselineWidthPx: panelWidthPx,
    hostAttachFallbackBody
  });
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
  maybeReconnectCommentMutationObserverAfterInlineLayout();
}

function hidePageFrameOverlay() {
  const overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
  if (overlay) overlay.style.display = 'none';
  if (inlineIframeVisibilityTimer) {
    clearTimeout(inlineIframeVisibilityTimer);
    inlineIframeVisibilityTimer = null;
  }
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
  // 0.1.27 (AB): iframe 初回ロード中（visibility:hidden で 2s）に
  // host の getBoundingClientRect が一時的に小さく見えるケースで、
  // dock_bottom フォールバックが走って host を再構成してしまう「フリッカー」
  // を抑止。iframe が src を持って居る間は「これからレイアウトされる」と
  // 見なし、サイズだけで不可視判定しない。
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe && iframe.getAttribute('src')) return true;
  const r = host.getBoundingClientRect();
  return r.width >= 120 && r.height >= 120;
}

/**
 * ツールバーから：ページ内インラインパネルを前面化（スクロール＋ iframe フォーカス）。
 *
 * 0.1.11 (B1): pollUntil で rect ≥ 120×120 を 500ms wait してから scroll/focus。
 * 0.1.15 (M/N): host が DOM に居れば即座に true を返すように変更。理由:
 *   - 旧版は rect が 120×120 になるまで pollUntil で 500ms 待ってから true 返却。
 *     その間 background は応答待ちで blocked。pollUntil が timeout で false 返却
 *     すると background が popup 窓を openOrFocusPopupWindow で開いてしまい、
 *     インラインパネルと popup 窓が「同時に出る」現象になっていた（user 報告 Bug1）。
 *   - close ボタン押下後に display:none された host は rect=0 のまま → pollUntil
 *     timeout → false → popup 窓だけ開いてインラインが「すぐ出ない」体験になる
 *     （user 報告 Bug2）。
 *   - 修正: host が DOM 上に居る（renderPageFrameOverlay で挿入済み or 既存）
 *     なら即座に focused=true 応答。scrollIntoView + iframe.focus は別タスクで
 *     fire-and-forget（pollUntil 内蔵）。応答自体は rect も layout も待たない。
 *
 * @returns {Promise<boolean>} host が DOM 上にあれば即座に true
 */
async function focusInlinePanelHostFromToolbar() {
  if (!isWatchInlinePanelTopFrame()) return false;
  if (!isNicoLiveWatchUrl(window.location.href)) return false;
  const host =
    nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
  if (!(host instanceof HTMLElement)) return false;
  /*
   * 0.1.43 (Y): prewarm された host が DOM 上にあっても display:none で残った
   *   ケースで、background に focused=true を返すと popup window fallback が
   *   起動せず「kon-ta 押しても何も出ない」現象になる。computedStyle で
   *   実際の可視状態を確認し、不可視なら false を返して background fallback
   *   に任せる。
   */
  if (!shouldRespondFocusedNowFromToolbar(host, {
    getComputedStyle: (el) => window.getComputedStyle(/** @type {Element} */ (el))
  })) return false;

  // fire-and-forget: rect 確定を待ってから scroll + iframe focus を試行。
  // 結果は応答に反映しない（応答は既に true で返している）。
  void (async () => {
    try {
      const ready = await pollUntil(
        () => {
          const h =
            nlsInlinePopupHostSingleton ||
            document.getElementById(INLINE_POPUP_HOST_ID);
          if (!(h instanceof HTMLElement)) return null;
          const isReady = isInlinePanelHostReadyForFocus(h, {
            getComputedStyle: (el) =>
              window.getComputedStyle(/** @type {Element} */ (el)),
            getBoundingClientRect: (el) =>
              /** @type {Element} */ (el).getBoundingClientRect()
          });
          return isReady ? h : null;
        },
        { timeoutMs: 500, intervalMs: 30 }
      );
      if (!ready) return;
      try {
        // ツールバーからの前面化は意図的な大きなスクロール変化になり得るので、
        // 発生する scroll イベントを user-scroll として誤カウントしないよう抑止窓を張る。
        suppressOwnScrollCountingFor(1000);
        ready.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch {
        try {
          ready.scrollIntoView();
        } catch {
          // no-op
        }
      }
      const iframe = ready.querySelector(`#${INLINE_POPUP_IFRAME_ID}`);
      if (iframe instanceof HTMLIFrameElement) {
        try {
          iframe.focus();
        } catch {
          // no-op
        }
      }
    } catch {
      // no-op: scroll/focus 失敗は致命的でない
    }
  })();

  return true;
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
      // 0.1.45 (AA): query/fragment は strip して個人情報漏れを防ぐ
      href: sanitizeWatchUrlForDiag(href),
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

/**
 * 0.1.45 (AA): AI 診断に保存する watch URL から query/fragment を strip。
 *   旧コードは `location.href.slice(0, 500)` をそのまま保存していたため、
 *   ニコ生の querystring に session token / referrer / user 識別子等が
 *   乗っていた場合、診断 dump を AI に貼ったり開発者に送ったりする際に
 *   個人情報が漏れる懸念があった。liveId と path だけ残す。
 */
function sanitizeWatchUrlForDiag(rawHref) {
  const s = String(rawHref || '');
  if (!s) return '';
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`.slice(0, 500);
  } catch {
    return s.split('?')[0].split('#')[0].slice(0, 500);
  }
}

function persistAiShareFastDiagnostics() {
  if (!hasExtensionContext()) return;
  const now = Date.now();
  const hidden =
    typeof document !== 'undefined' &&
    document.visibilityState === 'hidden';
  const minGap = hidden
    ? AI_SHARE_FAST_DIAG_HIDDEN_MIN_MS
    : AI_SHARE_FAST_DIAG_VISIBLE_MIN_MS;
  if (now - aiShareFastDiagLastPersistAt < minGap) return;
  aiShareFastDiagLastPersistAt = now;
  try {
    const payload = {
      popup: null,
      content: buildAiShareFastDiagnosticsPayload(),
      note:
        'Chrome コンソールの ERR_BLOCKED_BY_CLIENT / 広告スクリプト失敗はブロッカー由来で多く、本拡張とは無関係なことがあります。',
      resolvedTabUrl: sanitizeWatchUrlForDiag(window.location.href),
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

/**
 * レイアウトビューポート（CSS ピクセル）。横付き可否・ギャップ計算の幅上限に使う。
 * `nlsViewportSize` の visualViewport 優先は拡大表示で狭くなりやすく、実タブが広いのに
 * 常に「プレイヤー行の下」に落ちる原因になるため分離する。
 */
function nlsLayoutViewportSize() {
  try {
    const w = Number(window.innerWidth) || 0;
    const h = Number(window.innerHeight) || 0;
    return { innerWidth: Math.round(w), innerHeight: Math.round(h) };
  } catch {
    return { innerWidth: 0, innerHeight: 0 };
  }
}

function nlsViewportSize() {
  try {
    const vv = window.visualViewport;
    const vw = Number(vv?.width);
    const vh = Number(vv?.height);
    if (
      vv &&
      Number.isFinite(vw) &&
      Number.isFinite(vh) &&
      vw >= 200 &&
      vh >= 200
    ) {
      return {
        innerWidth: Math.round(vw),
        innerHeight: Math.round(vh)
      };
    }
  } catch {
    // no-op
  }
  return { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
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

/** ストレージの配置に対し、狭いタブ幅では beside を下へ逃がす（保存値はそのまま） */
function getEffectiveInlinePanelPlacement() {
  const vp = nlsLayoutViewportSize();
  return effectiveInlinePanelPlacement(inlinePanelPlacementMode, vp.innerWidth);
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
  if (renderingPageFrame) {
    pageFrameOverlayRenderDeferred = true;
    return;
  }
  if (!isWatchInlinePanelTopFrame()) {
    hidePageFrameOverlay();
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    return;
  }
  if (!isNicoLiveWatchUrl(window.location.href)) {
    hidePageFrameOverlay();
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    return;
  }
  /*
   * autoshow 設定が OFF（既定）で、かつユーザがこのタブでまだツールバーを押していない場合は、
   * インラインパネルを一切表示しない（「こん太を押す前は extension を出さない」が既定動作）。
   * ツールバークリックで toolbarInitiatedShowThisSession が立つと以降は通常どおり表示する。
   */
  if (!inlinePanelAutoshowEnabled && !toolbarInitiatedShowThisSession) {
    hidePageFrameOverlay();
    /*
     * try/finally に入らないため、ここでも監視ルートを取り直す。
     * パネル非表示中も公式コメ欄 DOM は差し替わり得る（tick 経路での取りこぼし防止）。
     */
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    return;
  }

  renderingPageFrame = true;
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
    /*
     * host が「見えない」ときの最終フォールバック。
     *
     * below / beside はプレイヤー DOM 依存なので、iframe 未ロードや target 消失で
     * 可視領域を得られないことがあり、その救済として dock_bottom に落とす意義がある。
     * 一方で floating / dock_bottom はプレイヤー DOM に依存しない body 直下の固定パネル。
     * iframe 初回ロード前に width/height が 120 未満になって一時的に不可視に見えることがあり、
     * ここで dock_bottom 再描画に走ると `nls-inline-host--floating` クラスが剥がされ、
     * floating 表示契約（E2E inline-panel-align）を壊す。
     * 「意図した配置が floating or dock_bottom のとき」はフォールバックを skip する。
     */
    if (
      !inlineHostLooksVisible() &&
      effPlacement !== INLINE_PANEL_PLACEMENT_FLOATING &&
      effPlacement !== INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
    ) {
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
    renderingPageFrame = false;
    syncWatchPageDockBodyReserve();
    /*
     * 配置を何度も切り替えると公式コメ欄が差し替わり、MutationObserver が古い
     * ノードを見続けて記録が止まることがある。再レイアウトのたびに監視ルートを取り直す。
     * scroll は rAF・resize はデバウンス経由でも `renderPageFrameOverlay` を通す。
     */
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    /*
     * 再入スキップ分は microtask ではなく同一スタックで追い描画する。
     * microtask だと直後の interval tick が先に走り、まだ floating 未適用の
     * below レイアウトで上書きされる race が出る（E2E below→floating）。
     */
    let overlayDrain = 0;
    while (pageFrameOverlayRenderDeferred && overlayDrain < 16) {
      pageFrameOverlayRenderDeferred = false;
      overlayDrain += 1;
      renderPageFrameOverlay();
    }
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
    KEY_INLINE_FLOATING_ANCHOR,
    KEY_INLINE_PANEL_AUTOSHOW_ENABLED,
    KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
    KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE
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
  inlinePanelAutoshowEnabled = normalizeInlinePanelAutoshowEnabled(
    bag[KEY_INLINE_PANEL_AUTOSHOW_ENABLED]
  );
  inlinePanelViewportWidePolicy = normalizeInlinePanelViewportWidePolicy(
    bag[KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY]
  );
  inlinePanelViewportWideOnceDone = normalizeInlinePanelViewportWideOnceDone(
    bag[KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]
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

  function tickPageFrameLayoutFromInterval() {
    if (!hasExtensionContext()) return;
    /*
     * バックグラウンド（非可視）タブではインライン host のレイアウトは不要なのに
     * 毎 tick で renderPageFrameOverlay（動画探索・ターゲット走査）が走り、
     * watch タブを多数開いたとき CPU がタブ数にほぼ比例して増える。
     * 可視でないときはパネル描画を skip し、公式コメ欄の監視ルート取り直しだけ残す
     *（DOM 差し替え時の記録途切れ対策は維持）。
     */
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden' &&
      isWatchInlinePanelTopFrame() &&
      isNicoLiveWatchUrl(window.location.href)
    ) {
      maybeReconnectCommentMutationObserverAfterInlineLayout();
    } else {
      renderPageFrameOverlay();
    }
  }

  /** scroll/resize 由来。Playwright/headless で visibility が hidden の間も DOM 反映が必要なため常にフル描画 */
  function tickPageFrameLayoutFromScrollResize() {
    if (!hasExtensionContext()) return;
    renderPageFrameOverlay();
  }

  function tickPageFrameMaintenance() {
    if (!hasExtensionContext()) return;
    maybeRunEndedBulkHarvest();
    maybeOfficialGapQuietDeepHarvest();
    persistAiShareFastDiagnostics();
    // 0.1.32 (AG): バックグラウンドで prewarm を skip した分、tick で再 schedule
    // を試みる。visibilitychange は tick を呼ぶので、可視化された瞬間に prewarm
    // が再開する（schedulePrewarmInlinePopupIframe は done flag で idempotent）。
    schedulePrewarmInlinePopupIframe();
  }

  function tickFromInterval() {
    tickPageFrameLayoutFromInterval();
    tickPageFrameMaintenance();
  }

  function scheduleScrollThrottledPageFrameLayout() {
    if (pageFrameLayoutScrollRafId != null) return;
    pageFrameLayoutScrollRafId = requestAnimationFrame(() => {
      pageFrameLayoutScrollRafId = null;
      tickPageFrameLayoutFromScrollResize();
    });
  }

  function scheduleResizeDebouncedPageFrameLayout() {
    if (pageFrameLayoutDebounceTimer != null) {
      clearTimeout(pageFrameLayoutDebounceTimer);
    }
    pageFrameLayoutDebounceTimer = setTimeout(() => {
      pageFrameLayoutDebounceTimer = null;
      tickPageFrameLayoutFromScrollResize();
    }, PAGE_FRAME_LAYOUT_SCROLL_DEBOUNCE_MS);
  }

  function onPageFrameVisibilityChange() {
    if (pageFrameLayoutScrollRafId != null) {
      try {
        cancelAnimationFrame(pageFrameLayoutScrollRafId);
      } catch {
        // no-op
      }
      pageFrameLayoutScrollRafId = null;
    }
    if (pageFrameLayoutDebounceTimer != null) {
      clearTimeout(pageFrameLayoutDebounceTimer);
      pageFrameLayoutDebounceTimer = null;
    }
    if (document.visibilityState === 'visible') {
      hiddenLivePanelScanPhase = 0;
      tickPageFrameLayoutFromInterval();
      tickPageFrameMaintenance();
    } else {
      tickPageFrameLayoutFromInterval();
    }
  }

  pageFrameLoopTimer = setInterval(tickFromInterval, PAGE_FRAME_LOOP_MS);
  window.addEventListener('scroll', scheduleScrollThrottledPageFrameLayout, {
    passive: true
  });
  window.addEventListener('resize', scheduleResizeDebouncedPageFrameLayout);
  document.addEventListener('visibilitychange', onPageFrameVisibilityChange);
  tickFromInterval();
  // 0.1.17 (S): kon-ta 押下時の体感遅延を縮めるため、watch ページ表示から
  // ~2 秒経ったら裏で popup.html iframe を boot しておく。host は display:none
  // のまま append するので画面には出ないが、iframe は読み込みを進めてくれる。
  // 押下時にはすでに popup.html がパース済みなので「ぱっと出る」。
  schedulePrewarmInlinePopupIframe();
}

let prewarmInlinePopupTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);
let prewarmInlinePopupDone = false;

/**
 * 0.1.32 (AG): バックグラウンドタブでは prewarm をスキップ（CPU・帯域の節約）。
 * 複数の watch タブを同時に開いたときに、visible でないタブの popup.html
 * 並列ロードが kon-ta 押下時の体感反応を悪化させる現象を抑止。可視化された
 * 時点で改めて schedulePrewarmInlinePopupIframe が呼ばれる（visibilitychange
 * リスナーが startPageFrameLoop の tick を発火させ、tick の最後で prewarm
 * schedule が再走る）。
 */
function schedulePrewarmInlinePopupIframe() {
  if (prewarmInlinePopupDone) return;
  if (prewarmInlinePopupTimer) return;
  if (!isWatchInlinePanelTopFrame()) return;
  if (!isNicoLiveWatchUrl(window.location.href)) return;
  // 可視タブのみ prewarm。background タブはユーザー操作までは何もしない。
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  // 0.1.33 (AH): 2 秒 → 800ms に短縮。kon-ta 即押し時の体感反応を上げる。
  // 可視タブのみ対象なので CPU 取り合いは少ないはず。
  prewarmInlinePopupTimer = setTimeout(() => {
    prewarmInlinePopupTimer = null;
    prewarmInlinePopupIframe();
  }, 800);
}

/*
 * 0.1.42 (X): prewarm lease を chrome.storage.local で取り合う。
 *   複数 watch タブが visible 並行状態のとき、全タブが popup.html を並列
 *   ロードして CPU を取り合うため、kon-ta 押下時のパネル表示が遅くなる
 *   問題への対策。一度に prewarm するタブを 1 つに絞り、完了後に他タブが
 *   順次 prewarm する。
 */
const PREWARM_LEASE_KEY = 'nls_prewarm_lease_v1';
const PREWARM_LEASE_TIMEOUT_MS = 10_000;
const PREWARM_LEASE_RETRY_MS = 1_500;
const prewarmInstanceId = (() => {
  try {
    return `nlpw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `nlpw-fallback-${Date.now().toString(36)}`;
  }
})();

async function tryAcquirePrewarmLease() {
  try {
    const bag = await chrome.storage.local.get(PREWARM_LEASE_KEY);
    const cur = /** @type {{holder?: string, at?: number}|null} */ (bag[PREWARM_LEASE_KEY] ?? null);
    const action = decidePrewarmLeaseAction({
      currentLeaseHolder: cur?.holder,
      currentLeaseAt: cur?.at,
      selfId: prewarmInstanceId,
      now: Date.now(),
      leaseTimeoutMs: PREWARM_LEASE_TIMEOUT_MS
    });
    if (action === 'proceed') return true;
    if (action === 'defer') return false;
    // 'claim' → 自分の名前で書き込む
    await chrome.storage.local.set({
      [PREWARM_LEASE_KEY]: { holder: prewarmInstanceId, at: Date.now() }
    });
    return true;
  } catch {
    // storage 失敗時は coordination 諦めて prewarm 実行（fail-open）
    return true;
  }
}

async function releasePrewarmLeaseIfMine() {
  try {
    const bag = await chrome.storage.local.get(PREWARM_LEASE_KEY);
    const cur = /** @type {{holder?: string}|null} */ (bag[PREWARM_LEASE_KEY] ?? null);
    if (cur?.holder === prewarmInstanceId) {
      await chrome.storage.local.set({
        [PREWARM_LEASE_KEY]: { holder: '', at: 0 }
      });
    }
  } catch {
    // no-op
  }
}

function prewarmInlinePopupIframe() {
  if (prewarmInlinePopupDone) return;
  if (!hasExtensionContext()) return;
  if (!isWatchInlinePanelTopFrame()) return;
  if (!isNicoLiveWatchUrl(window.location.href)) return;
  void (async () => {
    const acquired = await tryAcquirePrewarmLease();
    if (!acquired) {
      // 他タブが prewarm 中。一定時間後に再試行。
      if (!prewarmInlinePopupDone && !prewarmInlinePopupTimer) {
        prewarmInlinePopupTimer = setTimeout(() => {
          prewarmInlinePopupTimer = null;
          prewarmInlinePopupIframe();
        }, PREWARM_LEASE_RETRY_MS);
      }
      return;
    }
    try {
      const host = ensureInlinePopupHost();
      if (!(host instanceof HTMLElement)) {
        await releasePrewarmLeaseIfMine();
        return;
      }
      if (host.parentNode !== document.body) {
        // 画面に出さないままで body に挿入。iframe は display:none でも load する。
        host.style.display = 'none';
        host.setAttribute('aria-hidden', 'true');
        // レイアウトに影響しないよう offscreen に固定。
        host.style.position = 'fixed';
        host.style.top = '-99999px';
        host.style.left = '-99999px';
        host.style.width = '420px';
        host.style.height = '600px';
        host.style.pointerEvents = 'none';
        document.body.appendChild(host);
      }
      prewarmInlinePopupDone = true;
    } catch {
      // 失敗しても致命的ではない（kon-ta 押下時に通常パスで host が作られる）
    } finally {
      // lease は次のタブが直ぐ prewarm 始められるよう速やかに release
      await releasePrewarmLeaseIfMine();
    }
  })();
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

/**
 * ニコ生公式のギフト・アイテム等の起動 UI を開く（コメント欄付近のボタンを 1 回クリック）。
 * 課金・在庫の確定は本家のモーダルに任せる。
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function openCommentPanelAssetPickerFromContentAsync() {
  if (!canPostCommentInThisFrame()) {
    return { ok: false, error: 'コメント欄のあるwatchフレームが見つかりません。' };
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

  const scope = resolveCommentPanelAssetSearchScope(
    editor instanceof HTMLElement ? editor : null
  );

  const launcher = findCommentPanelAssetLauncherButton(
    scope,
    editor instanceof HTMLElement ? editor : null
  );
  if (!launcher) {
    return {
      ok: false,
      error:
        'ギフト・アイテムを開くボタンが見つかりませんでした。watchを前面に出し、コメント欄が表示されているか確認のうえ再読み込みしてください。'
    };
  }

  try {
    if (launcher instanceof HTMLElement) {
      launcher.focus({ preventScroll: true });
    }
    launcher.click();
    await new Promise((r) => setTimeout(r, SUBMIT_TIMING.reactSettleMs));
    return { ok: true };
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String(/** @type {{ message?: unknown }} */ (err).message || 'click_failed')
        : 'click_failed';
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
    /** @type {{liveId: string, at: number, textNorm: string, textRaw?: string}} */
    const item = { liveId: lid, at: now, textNorm };
    // popup 側の appendSelfPostedComment と同じく、pending 表示の改行・空白保持の
    // ため生本文を optional で保持する（filterValidSelfPostedRecents が pass-through）。
    if (typeof rawText === 'string' && rawText) item.textRaw = rawText;
    next.push(item);
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
 *   broadcasterPageUrl: string,
 *   broadcasterIconUrl: string,
 *   broadcasterLevel: number|null,
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

  /*
   * 0.1.39 (U): /user/{id}/live_programs 形式 anchor を全件収集して
   *   `extractBroadcasterUserId` の defense-in-depth に渡す。
   *   関連配信サイドバーに他配信者リンクが先に並ぶケース（lv350421699 RIO）
   *   でも、本配信者リンクの `?ref=watch_user_information` を見つけられる。
   *   `streamLink` (配信者名取り出し用) 自体は従来どおり「先頭 hit」を採るが、
   *   broadcasterUserId の方は配列を渡して ref マーカ付きを優先する。
   */
  const streamLinkAnchors = Array.from(
    document.querySelectorAll('a[href*="/user/"]')
  ).filter((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    return (
      /\/user\/\d+/.test(href) &&
      /\/live_programs(?:\?|$)/.test(href) &&
      text &&
      !/^https?:\/\//i.test(text)
    );
  });
  const streamLink = streamLinkAnchors[0];
  const streamLinkHrefCandidates = streamLinkAnchors.map((a) =>
    String(a.getAttribute('href') || '')
  );
  /*
   * 配信者名の優先順位:
   *   1. embedded-data の program.supplier.name  — ニコ生が表示する「配信表示名」そのもの
   *   2. streamLink テキスト                     — /user/{id}/live_programs リンクのアンカーテキスト
   *   3. meta author / twitter:creator           — ページレベルのメタ情報
   *   4. DOM [class*="userName"] フォールバック   — コメント欄等の汚染リスクあり（最終手段）
   *
   * ユーザーが配信上のニックネームを変えている場合（例: アカウント名 きラリ → 配信表示名 太ももちゃん）、
   * streamLink は「きラリ」を返すが、embedded-data supplier.name は「太ももちゃん」を返す。
   * 視聴者が画面で見る名前に合わせるため embedded-data を最優先にする。
   */
  const embeddedProps = (() => {
    try { return extractEmbeddedDataProps(document); } catch { return null; }
  })();
  /*
   * 0.1.40 (V): 公式チャンネル放送（運営・業者）の broadcaster メタを抽出。
   *   一般ユーザー放送と embedded-data の構造が違い、`supplier.name` は提供
   *   会社名（"株式会社ドワンゴ" 等）で、画面で見える本来のチャンネル名は
   *   `socialGroup.name`、URL は `socialGroup.socialGroupPageUrl`。
   *   詳細は lib/channelBroadcasterMeta.js。
   */
  const channelMeta = resolveChannelBroadcasterMeta(embeddedProps);
  const broadcasterNameFromEmbedded = clean(
    channelMeta.kind === 'channel'
      ? channelMeta.name
      : (embeddedProps?.program?.supplier?.name ?? '')
  );
  const broadcasterNameFromMeta = clean(
    metaGet(metaMap, ['author', 'twitter:creator', 'profile:username'])
  );
  const broadcasterNameFromStreamLink = clean(streamLink?.textContent || '');
  const broadcasterNameFromDomFallback = clean(
    document.querySelector('[class*="userName"], [class*="streamerName"]')
      ?.textContent || ''
  );
  const broadcasterName =
    broadcasterNameFromEmbedded ||
    broadcasterNameFromStreamLink ||
    broadcasterNameFromMeta ||
    broadcasterNameFromDomFallback;

  /*
   * 0.1.38 (T): lv350420992 で発生した broadcasterUserId 取り違え
   *   （streamLink が Nasu 45300945 を拾い、本配信者 刑事桃 115713314 が
   *    レーン除外フィルタを素通りして こん太レーン に混入）への対策。
   *   embedded-data は配信者本人を指す authoritative なソースなので、
   *   DOM の streamLink より先に参照する。詳細は lib/broadcasterUserId.js。
   */
  const broadcasterUserId = extractBroadcasterUserId({
    embeddedSupplierProgramProviderId: embeddedProps?.program?.supplier?.programProviderId,
    embeddedSupplierId: embeddedProps?.program?.supplier?.id,
    embeddedSupplierPageUrl: embeddedProps?.program?.supplier?.pageUrl,
    streamLinkHrefCandidates
  });

  /*
   * 0.1.20 (U): 公式チャンネル / 業者放送のフォロー導線。
   * `broadcasterUserId` が数値で取れるのはユーザー / コミュ放送までで、運営・業者の
   * チャンネル放送は `supplier.pageUrl` が `https://ch.nicovideo.jp/<handle>` 形式に
   * なる。生 URL を snapshot に持ち出して popup 側で channel タイルに切替える。
   */
  const broadcasterPageUrl = (() => {
    // 0.1.40 (V): チャンネル放送は socialGroup 側に URL があるので最優先
    if (channelMeta.kind === 'channel' && channelMeta.pageUrl) {
      return channelMeta.pageUrl;
    }
    const raw = String(embeddedProps?.program?.supplier?.pageUrl ?? '').trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    return '';
  })();
  const broadcasterIconUrl = (() => {
    // 0.1.40 (V): チャンネル放送は socialGroup.thumbnailImageUrl を最優先
    if (channelMeta.kind === 'channel' && channelMeta.iconUrl) {
      return channelMeta.iconUrl;
    }
    const supplier = embeddedProps?.program?.supplier;
    /** @type {string[]} */
    const candidates = [];
    if (supplier && typeof supplier === 'object') {
      const icons = /** @type {Record<string, unknown>|null} */ (supplier.icons ?? null);
      if (icons && typeof icons === 'object') {
        for (const key of ['uri150x150', 'uri90x90', 'uri50x50']) {
          const v = icons[key];
          if (typeof v === 'string') candidates.push(v);
        }
      }
      if (typeof supplier.iconUrl === 'string') candidates.push(supplier.iconUrl);
    }
    const sg = embeddedProps?.socialGroup;
    if (sg && typeof sg === 'object') {
      // 新フィールド名（thumbnailImageUrl）+ 旧フィールド名 両方を後方互換で見る
      for (const key of [
        'thumbnailImageUrl',
        'thumbnailSmallImageUrl',
        'thumbnailUrl',
        'thumbnailSmallUrl'
      ]) {
        const v = /** @type {Record<string, unknown>} */ (sg)[key];
        if (typeof v === 'string') candidates.push(v);
      }
    }
    for (const c of candidates) {
      if (/^https?:\/\//i.test(c)) return c;
    }
    return '';
  })();

  // 0.1.76: ギフト演出 DOM での avatar 取り違え対策。snapshot 構築のたびに
  // module-level cache を更新して、後続の interceptedAvatars.set ガードで参照する。
  broadcasterIconUrlCache = broadcasterIconUrl;

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
    broadcasterPageUrl,
    broadcasterIconUrl,
    broadcasterLevel: (() => {
      try {
        const lv = embeddedProps?.program?.supplier?.level ?? embeddedProps?.socialGroup?.level ?? embeddedProps?.user?.userLevel;
        if (typeof lv === 'number' && Number.isFinite(lv) && lv > 0) return lv;
        const parsed = parseInt(String(lv), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      } catch { return null; }
    })(),
    viewerCountFromDom,
    viewerCountSource,
    ...buildWatchSnapshotOfficialFields({
      nowMs: Date.now(),
      officialViewerCount,
      officialCommentCount,
      officialStatsUpdatedAt,
      officialCommentStatsUpdatedAt,
      officialViewerIntervalMs,
      officialCommentSummary,
      officialGiftPoints,
      officialAdPoints,
      officialGiftAdStatsUpdatedAt
    }),
    totalComments: wsCommentCount,
    streamAgeMin: (() => {
      // Priority 1: WebSocket schedule message
      if (programBeginAtMs != null && Number.isFinite(programBeginAtMs)) {
        const age = (Date.now() - programBeginAtMs) / 60000;
        if (age >= 0) return Math.round(age);
      }
      // Priority 2: embedded-data props（上で取得済みの embeddedProps を再利用）
      const beginMs = embeddedProps ? pickProgramBeginAt(embeddedProps) : null;
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
      // 0.1.45 (AA): query/fragment は strip して個人情報漏れを防ぐ
      href: sanitizeWatchUrlForDiag(href),
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

/*
 * 0.1.43 (Y): content.js は manifest.json の all_frames:true で iframe を含む
 *   全フレームに注入される。さらに SPA navigation で再注入されると、トップ
 *   レベルで `chrome.runtime.onMessage.addListener` を呼ぶたびに listener が
 *   累積し、NLS_FOCUS_INLINE_PANEL に複数フレームから応答 → sendResponse の
 *   port が複数解釈されて Chrome が「The message port closed before a response
 *   was received」を投げ、background.js 側が popup window fallback を誤発火
 *   する原因になる。globalThis に bound flag を立てて idempotent にする。
 */
const __NLS_MSG_LISTENER_BOUND_KEY__ = '__NLS_CONTENT_MSG_LISTENER_BOUND__';
const nlsContentMsgListenerHost =
  typeof globalThis !== 'undefined' ? globalThis : window;
if (!(/** @type {Record<string, unknown>} */ (nlsContentMsgListenerHost))[__NLS_MSG_LISTENER_BOUND_KEY__]) {
  /** @type {Record<string, unknown>} */ (nlsContentMsgListenerHost)[__NLS_MSG_LISTENER_BOUND_KEY__] = true;
  bindContentScriptMessageListener();
}

function bindContentScriptMessageListener() {
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!hasExtensionContext()) return;
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

  if (msg.type === 'NLS_FOCUS_INLINE_PANEL') {
    if (!isWatchInlinePanelTopFrame()) {
      return false;
    }
    /*
     * ユーザが明示的にツールバーを押した瞬間から、このタブでは autoshow 設定に
     * 関わらずインラインパネルを表示する（opt-in の opt-out: 「一度開いてみたい」に応える）。
     * autoshow=true のユーザには何の影響もない（既に表示中）。
     */
    toolbarInitiatedShowThisSession = true;
    // gate 条件が変わるので即再描画（次の tick を待たずに panel が出る）
    try {
      renderPageFrameOverlay();
    } catch {
      // no-op: 初回描画の例外は tick loop 側で回収される
    }
    /*
     * kon-ta 押下時点で deep harvest がまだ pending（timer 生存）かつ quiet UI 有効なら、
     * ゲートで抑止していた loading インジケータをここで出す。
     * autoshow OFF で視聴を開始 → harvest は裏で動いているが UI は沈黙 → kon-ta 押下で顕在化、の筋。
     */
    try {
      if (deepHarvestTimer != null && deepHarvestQuietUi) {
        ensureDeepHarvestLoadingUi();
      }
    } catch {
      // no-op: loading UI は補助表示なので失敗しても本筋に影響しない
    }
    /*
     * 0.1.11 (B1 race fix): focusInlinePanelHostFromToolbar が async になったので
     * sendResponse は IIFE 末尾で呼び、listener は `return true` でチャネルを
     * 維持する（Chrome MV3: 非同期 sendResponse の必須パターン）。
     */
    void (async () => {
      let focused = false;
      try {
        focused = await focusInlinePanelHostFromToolbar();
      } catch {
        // no-op: poll/scroll 失敗は致命的ではない
      }
      try {
        sendResponse({ ok: true, focused });
      } catch {
        // no-op: 呼び出し元が消えていることもある
      }
    })();
    return true;
  }

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

  if (msg.type === 'NLS_OPEN_COMMENT_ASSET_PICKER') {
    if (!canPostCommentInThisFrame()) {
      sendResponse({
        ok: false,
        error: 'このフレームにはコメント欄がありません。'
      });
      return true;
    }
    void openCommentPanelAssetPickerFromContentAsync()
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          ok: false,
          error:
            err && typeof err === 'object' && 'message' in err
              ? String(/** @type {{ message?: unknown }} */ (err).message || 'asset_picker_failed')
              : 'asset_picker_failed'
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
            quietScroll: deepPlan.quietScroll,
            preferRecentScrollEndFirst: true
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
            if (uid && av && isAvatarSafeToAssociate(uid, av)) interceptedAvatars.set(uid, av);
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
}

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

/**
 * 既に `pickCommentMutationObserverRoot` で得たルートへ接続（二重 pick 回避用）。
 * @param {Element} nextRoot
 */
function reconnectMutationObserverToRoot(nextRoot) {
  if (!mutationObserver || !nextRoot) return;
  const prev = observedMutationRoot;
  const prevDetached =
    prev &&
    prev instanceof Node &&
    /** @type {Node} */ (prev).isConnected === false;
  if (!prevDetached && prev === nextRoot) return;
  try {
    mutationObserver.disconnect();
  } catch {
    // no-op
  }
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

function reconnectMutationObserver() {
  if (!mutationObserver) return;
  reconnectMutationObserverToRoot(pickCommentMutationObserverRoot(document));
}

/**
 * インライン host の移動・再レイアウト後に公式コメ欄の監視を取り直す。
 * `renderPageFrameOverlay` 以外（resize debounce の `renderInlineHostAnchoredToVideo` 等）でも呼ぶ。
 */
function maybeReconnectCommentMutationObserverAfterInlineLayout() {
  if (
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !mutationObserver
  ) {
    return;
  }
  try {
    const nextRoot = pickCommentMutationObserverRoot(document);
    const prev = observedMutationRoot;
    const prevDetached =
      prev &&
      prev instanceof Node &&
      /** @type {Node} */ (prev).isConnected === false;
    if (!prevDetached && prev === nextRoot) return;
    reconnectMutationObserverToRoot(nextRoot);
  } catch {
    // no-op
  }
}

function detectBroadcasterUserIdFromDom() {
  const now = Date.now();
  if (broadcasterUidCache && now - broadcasterUidCacheAt < 3000) {
    return broadcasterUidCache;
  }
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  /*
   * 0.1.39 (U): collectWatchPageSnapshot と同じ defense-in-depth ロジックを
   *   ここでも使う。embedded-data も読めるなら supplier.programProviderId を
   *   最優先にし、DOM フォールバック時も `?ref=watch_user_information` 付き
   *   anchor を優先する。3 秒キャッシュは引き続き有効。
   */
  const streamLinkAnchors = Array.from(
    document.querySelectorAll('a[href*="/user/"]')
  ).filter((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    return (
      /\/user\/\d+/.test(href) &&
      /\/live_programs(?:\?|$)/.test(href) &&
      text &&
      !/^https?:\/\//i.test(text)
    );
  });
  const streamLinkHrefCandidates = streamLinkAnchors.map((a) =>
    String(a.getAttribute('href') || '')
  );
  let embeddedSupplier = null;
  try {
    const props = extractEmbeddedDataProps(document);
    embeddedSupplier = props?.program?.supplier ?? null;
  } catch {
    embeddedSupplier = null;
  }
  broadcasterUidCache = extractBroadcasterUserId({
    embeddedSupplierProgramProviderId: embeddedSupplier?.programProviderId,
    embeddedSupplierId: embeddedSupplier?.id,
    embeddedSupplierPageUrl: embeddedSupplier?.pageUrl,
    streamLinkHrefCandidates
  });
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
    // 表示用 URL と tier 判定用の観測信号を userEntryAvatarResolve に一任する。
    // ここで 2 本を混ぜない設計が「視認性／混入の再発」を止めるための要。
    // 0.1.77: ギフト演出 DOM での broadcaster icon 取り違え対策で、
    //         broadcasterUid + broadcasterIconUrl も渡してガード判定させる。
    const { displayAvatarUrl, avatarObserved } = resolveUserEntryAvatarSignals({
      userId,
      rowAv,
      interceptEntryAv,
      interceptMapAv,
      broadcasterUid: broadcasterUidCache,
      broadcasterIconUrl: broadcasterIconUrlCache
    });
    return {
      ...r,
      userId,
      ...(nickname ? { nickname } : {}),
      ...(displayAvatarUrl ? { avatarUrl: displayAvatarUrl } : {}),
      ...(avatarObserved ? { avatarObserved: true } : {})
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
const PERSIST_BURST_THRESHOLD = INGEST_TIMING.coalescerBurstThreshold;

const persistCoalescer = createPersistCoalescer(async (/** @type {ParsedCommentRow[]} */ batch) => {
  const job = persistCommentRowsChain.then(() => persistCommentRowsImpl(batch));
  persistCommentRowsChain = job.catch((err) => reportSilentErrorToStorage('persist', err));
  await job;
}, MIN_PERSIST_INTERVAL_MS, PERSIST_BURST_THRESHOLD);

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
  const pipelineT0 = Date.now();
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
    console.debug(formatPipelinePhase('start', {
      liveId,
      existingCount: existing.length,
      incomingCount: enriched.length
    }));
    const pendingRaw = bag[KEY_SELF_POSTED_RECENTS];
    // TTL 切れ（24h 超過）の self-posted recent を除外する。これがないと、前日に
    // 同じ放送（再生・リプレイ・タイトル流用など）で投稿した自コメ recent が、
    // 翌日同テキストの他人コメントと誤マッチして `selfPosted: true` を永続的に
    // 焼き込んでしまう（Storage H8）。型ガードと TTL を `filterValidSelfPostedRecents`
    // に集約。
    const pendingItems = filterValidSelfPostedRecents(pendingRaw);
    const mergedRows = mergeNewComments(
      liveId,
      existing,
      enriched
    );
    let { next, storageTouched } = mergedRows;
    observedRecordedCommentCount = next.length;
    noteOfficialCommentSample(Date.now());
    const { added } = mergedRows;
    console.debug(formatPipelinePhase('merge', {
      added: added.length,
      storageTouched
    }));
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
    // 0.1.82: 永続キャッシュ書き込み時の broadcaster icon 取り違え防止
    const broadcasterCtx2 = {
      broadcasterUid: broadcasterUidCache,
      broadcasterIconUrl: broadcasterIconUrlCache
    };
    for (const r of enriched) {
      if (upsertUserCommentProfileFromEntry(profileMap, r, broadcasterCtx2)) cacheTouched = true;
    }
    for (const e of next) {
      if (upsertUserCommentProfileFromEntry(profileMap, e, broadcasterCtx2)) cacheTouched = true;
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
      liveObservedUserIds,
      // 0.1.82: 過去の汚染データ（broadcaster icon が viewer uid に焼き込まれている）
      //   が hydrate ループで in-memory cache に戻るのを防ぐ
      {
        broadcasterUid: broadcasterUidCache,
        broadcasterIconUrl: broadcasterIconUrlCache
      }
    );

    if (!storageTouched && !pendingTouched && !cacheTouched) {
      console.debug(formatPipelinePhase('skip', { reason: 'no changes' }));
      return;
    }

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
    /*
     * 0.1.44 (Z): KEY_AUTO_BACKUP_STATE は content（commentCount/updatedAt
     *   /lastCommentAt/watchUrl 担当）と background SW（lastBackupAt/
     *   lastBackedUpdatedAt/lastBackupCount 担当）の両方が更新する。
     *   旧コードは bag を冒頭で 1 回読んだだけで write したため、その間に
     *   background が更新した backup 系フィールドを stale 値で上書きする
     *   race があった（重複バックアップが IDB に溜まる原因）。
     *   write 直前に再 read → background 担当フィールドは fresh 値、content
     *   担当フィールドは新規値で merge し、他の live のエントリは fresh state
     *   をそのまま使う。
     */
    const lidLowerForBackup = String(liveId || '').trim().toLowerCase();
    const freshBackupBag = await chrome.storage.local.get(KEY_AUTO_BACKUP_STATE);
    const autoBackupState = normalizeAutoBackupState(freshBackupBag[KEY_AUTO_BACKUP_STATE]);
    const freshLiveMeta = autoBackupState.lives[lidLowerForBackup] || {
      lastBackupAt: 0,
      lastBackedUpdatedAt: 0,
      lastBackupCount: 0
    };
    autoBackupState.lives[lidLowerForBackup] = {
      liveId: lidLowerForBackup,
      commentCount: next.length,
      updatedAt,
      lastCommentAt,
      watchUrl: backupWatchUrl,
      // background SW 所有: fresh 値をそのまま使う（content では更新しない）
      lastBackupAt: Math.max(0, Number(freshLiveMeta.lastBackupAt) || 0),
      lastBackedUpdatedAt: Math.max(0, Number(freshLiveMeta.lastBackedUpdatedAt) || 0),
      lastBackupCount: Math.max(0, Number(freshLiveMeta.lastBackupCount) || 0)
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
    const keysWritten = (storageTouched || pendingTouched ? 2 : 0) + (cacheTouched ? 1 : 0) + (ingestLogPayload ? 1 : 0);
    console.debug(formatPipelinePhase('commit', { keysWritten }));
    console.debug(formatPipelinePhase('done', {
      totalCount: next.length,
      elapsedMs: Date.now() - pipelineT0
    }));
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
      lastOfficialGapDeepHarvestAt = 0;
      resetDeepHarvestStabilityFollowUp();
      /*
       * 別 lv に切り替えた直後も lastCompletedAt が直前放送のままだと recovery が false になり、
       * NDGR が既に動いていると deep が skip され backlog が長時間残る（0.1.41 以降の経路）。
       */
      deepHarvestPipelineStats.lastCompletedAt = 0;
      periodicDeepWeakPassTick = 0;
      armDeepHarvestZeroRowRetryForNewLiveSession();
      interceptedUsers.clear();
      interceptedNicknames.clear();
      interceptedAvatars.clear();
      activeUserTimestamps.clear();
      broadcasterUidCache = '';
      broadcasterUidCacheAt = 0;
      broadcasterIconUrlCache = '';
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
      lastOfficialGapDeepHarvestAt = 0;
      resetDeepHarvestStabilityFollowUp();
      /*
       * 別 lv に切り替えた直後も lastCompletedAt が直前放送のままだと recovery が false になり、
       * NDGR が既に動いていると deep が skip され backlog が長時間残る（0.1.41 以降の経路）。
       */
      deepHarvestPipelineStats.lastCompletedAt = 0;
      periodicDeepWeakPassTick = 0;
      armDeepHarvestZeroRowRetryForNewLiveSession();
      interceptedUsers.clear();
      interceptedNicknames.clear();
      interceptedAvatars.clear();
      activeUserTimestamps.clear();
      broadcasterUidCache = '';
      broadcasterUidCacheAt = 0;
      broadcasterIconUrlCache = '';
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
  lastOfficialGapDeepHarvestAt = 0;
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
  /*
   * 拡張起点の UI は autoshow OFF（既定）かつツールバー未押下のあいだは一切描画しない。
   * 「こん太アイコンを押すまで視聴ページに何も出ない」という opt-in 契約を、
   * インラインパネル本体だけでなく loading インジケータにも貫徹するためのゲート。
   * autoshow=true のユーザ／toolbar 押下後のタブでは従来どおり表示される。
   */
  if (!inlinePanelAutoshowEnabled && !toolbarInitiatedShowThisSession) return;
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
    'コメント記録の準備をしています。もう少し待っててね！' +
    '</div>';
  host.appendChild(img);
  host.appendChild(text);
  try {
    document.documentElement.appendChild(host);
  } catch {
    // no-op
  }
}

function clearDeepHarvestZeroRowRetrySchedule() {
  if (deepHarvestZeroRowRetryTimer != null) {
    clearTimeout(deepHarvestZeroRowRetryTimer);
    deepHarvestZeroRowRetryTimer = null;
  }
}

function armDeepHarvestZeroRowRetryForNewLiveSession() {
  clearDeepHarvestZeroRowRetrySchedule();
  deepHarvestZeroRowRetryBudget = DEEP_HARVEST_ZERO_ROW_RETRY_MAX;
}

function maybeScheduleDeepHarvestZeroRowRetry() {
  if (deepHarvestZeroRowRetryBudget <= 0) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  if (deepHarvestZeroRowRetryTimer != null) return;

  deepHarvestZeroRowRetryBudget -= 1;
  deepHarvestZeroRowRetryTimer = setTimeout(() => {
    deepHarvestZeroRowRetryTimer = null;
    if (
      harvestRunning ||
      !recording ||
      !liveId ||
      !locationAllowsCommentRecording()
    ) {
      return;
    }
    void runDeepHarvest({
      stabilityFollowUp: false,
      force: true,
      armStabilityFollowUp: false
    }).catch((err) => reportSilentErrorToStorage('deepHarvest', err));
  }, DEEP_HARVEST_ZERO_ROW_RETRY_DELAY_MS);
}

function cancelPendingDeepHarvest() {
  if (deepHarvestTimer) {
    clearTimeout(deepHarvestTimer);
    deepHarvestTimer = null;
  }
  clearDeepHarvestZeroRowRetrySchedule();
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
 * 定期の取りこぼし拾い。quietScroll（opacity:0）で視覚的な「滝」は起きにくい。
 * recovery が要らない間も、PERIODIC_DEEP_FULL_TWO_PASS_EVERY 回に 1 回は 2-pass で全域を寄せる。
 */
function tryPeriodicQuietDeepHarvest() {
  if (!hasExtensionContext()) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  if (document.hidden) return;
  if (harvestRunning) return;
  resetDeepHarvestStabilityFollowUp();
  const needsRecovery = shouldForceDeepHarvestRecovery({
    lastCompletedAt: deepHarvestPipelineStats.lastCompletedAt,
    now: Date.now(),
    recoveryMs: DEEP_HARVEST_RECOVERY_MS
  });
  periodicDeepWeakPassTick += 1;
  const useWeakSinglePassOnly =
    !needsRecovery &&
    periodicDeepWeakPassTick % PERIODIC_DEEP_FULL_TWO_PASS_EVERY !== 0;
  void runDeepHarvest({
    stabilityFollowUp: useWeakSinglePassOnly,
    force: needsRecovery
  });
}

/**
 * バックグラウンドに回したあと visible に戻ったとき、仮想リストの取りこぼしを拾い直す。
 * 連打で deep が積まないよう短いデバウンスのみ。
 */
function onTabVisibleForCommentHarvest() {
  if (document.visibilityState !== 'visible') return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  scanVisibleCommentsNow();
  const now = Date.now();
  const needsRecovery = shouldForceDeepHarvestRecovery({
    lastCompletedAt: deepHarvestPipelineStats.lastCompletedAt,
    now,
    recoveryMs: DEEP_HARVEST_RECOVERY_MS
  });
  if (!needsRecovery && now - lastTabVisibleHarvestAt < TAB_VISIBLE_HARVEST_MIN_MS) return;
  lastTabVisibleHarvestAt = now;
  if (tabVisibleHarvestDebounceTimer != null) {
    clearTimeout(tabVisibleHarvestDebounceTimer);
  }
  tabVisibleHarvestDebounceTimer = setTimeout(() => {
    tabVisibleHarvestDebounceTimer = null;
    if (recording && liveId && locationAllowsCommentRecording() && !document.hidden) {
      void runDeepHarvest({
        stabilityFollowUp: !needsRecovery,
        force: needsRecovery
      });
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
  /*
   * 0.1.41 (W): NDGR が active な間 deep harvest を全 skip すると、配信途中
   *   参加時の backlog（既に積まれていた数百件のコメント）が永遠に取れない
   *   現象が発生していた（ユーザー報告: 公式 324 件・記録 55 件 = 17%）。
   *   `tryPeriodicQuietDeepHarvest` / `onTabVisibleForCommentHarvest` は
   *   recovery を計算して force=true を渡しているが、`scheduleDeepHarvest`
   *   経路（liveIdChange / recordingOn / tabVisible reason）は force=false
   *   のため NDGR active で skip されていた。runDeepHarvest 自体に
   *   recovery 判定を OR で入れる defense-in-depth。
   */
  if (!opts.force) {
    const nowMs = Date.now();
    const ndgrSkip = shouldSkipDeepHarvest({
      ndgrLastReceivedAt,
      now: nowMs,
      thresholdMs: HARVEST_TIMING.ndgrActiveThresholdMs
    });
    const needsRecovery = shouldForceDeepHarvestRecovery({
      lastCompletedAt: deepHarvestPipelineStats.lastCompletedAt,
      now: nowMs,
      recoveryMs: HARVEST_TIMING.deepRecoveryMs
    });
    if (ndgrSkip && !needsRecovery) {
      return;
    }
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
      respectTyping: false,
      preferRecentScrollEndFirst: true
    });
    await persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.DEEP });
    deepHarvestPipelineStats.lastCompletedAt = Date.now();
    deepHarvestPipelineStats.lastRowCount = rows.length;
    deepHarvestPipelineStats.runCount += 1;
    deepHarvestPipelineStats.lastError = false;
    if (rows.length > 0) {
      deepHarvestZeroRowRetryBudget = DEEP_HARVEST_ZERO_ROW_RETRY_MAX;
    } else {
      maybeScheduleDeepHarvestZeroRowRetry();
    }
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
  // 注: probeAndRestoreCommentPanelHealth はここでは呼ばない。
  // scroll イベントで発火すると、ユーザが古いコメントを読むために手動で
  // 上にスクロールしているときにも発火してしまい、せっかく上げた位置を
  // 最下部に戻して邪魔してしまう。定期 tick（LIVE_PANEL_SCAN_MS 間隔）から
  // だけ呼ぶことで、ユーザ操作と衝突しないようにする。
}

/**
 * 設定（デフォルト ON）。false が storage に明示保存されているときだけ OFF。
 * @type {boolean}
 */
let commentPanelAutoRestoreEnabled = true;
/**
 * 前回 `click_latest_button` / `scroll_panel_into_view` を実行した epoch ms。
 * 0 or 負値 = まだ一度も実行していない。
 * @type {number}
 */
let lastCommentPanelRestoreActionAt = 0;

/**
 * ユーザが能動的にスクロール操作した最後の epoch ms。
 * wheel / touchmove / スクロール系キー / スクロールバードラッグ由来の scroll で更新。
 * probeAndRestoreCommentPanelHealth が直近操作中（既定 5 秒以内）は自動復旧を
 * 抑止するためのフラグ（ユーザが上にスクロール中に panel.scrollIntoView で
 * 強制的に戻される問題の根治）。
 * @type {number}
 */
let lastUserInitiatedScrollAt = 0;

/**
 * 自分で scrollIntoView を叩いた直後、その副作用として firing する scroll イベントを
 * 「ユーザスクロール」と誤認しないためのサプレッション締切（epoch ms）。
 * @type {number}
 */
let ownScrollSuppressionUntil = 0;

/**
 * content script 側が自分で panel.scrollIntoView などを呼ぶ直前に使う。
 * 指定 ms だけ scroll イベントの user-scroll 更新を抑止する。
 * @param {number} ms
 */
function suppressOwnScrollCountingFor(ms) {
  const dur = Number.isFinite(ms) ? /** @type {number} */ (ms) : 800;
  ownScrollSuppressionUntil = Date.now() + dur;
}

/** wheel/touch/key で呼ぶ（これらは確実にユーザ起点）。 */
function noteUserInitiatedScroll() {
  lastUserInitiatedScrollAt = Date.now();
}

/**
 * scroll イベントで呼ぶ。スクロールバードラッグはこれでしか検知できないが、
 * 自分が叩いた scrollIntoView による scroll も発火するため、サプレッション窓で弾く。
 */
function noteScrollEventMaybeFromUser() {
  if (Date.now() < ownScrollSuppressionUntil) return;
  lastUserInitiatedScrollAt = Date.now();
}

let userScrollListenersAttached = false;
function attachUserScrollListeners() {
  if (userScrollListenersAttached) return;
  if (typeof window === 'undefined' || !window.addEventListener) return;
  userScrollListenersAttached = true;
  const opts = { passive: true, capture: true };
  window.addEventListener('wheel', noteUserInitiatedScroll, opts);
  window.addEventListener('touchmove', noteUserInitiatedScroll, opts);
  // スクロールバー本体をマウスでドラッグした場合は wheel/touch イベントが発火しない。
  // scroll イベントで補足するが、自分の scrollIntoView 由来の scroll は
  // suppressOwnScrollCountingFor() で弾く。
  window.addEventListener('scroll', noteScrollEventMaybeFromUser, opts);
  if (typeof document !== 'undefined' && document && document.addEventListener) {
    document.addEventListener('scroll', noteScrollEventMaybeFromUser, opts);
  }
  window.addEventListener(
    'keydown',
    (ev) => {
      const k = ev && ev.key;
      if (
        k === 'PageUp' ||
        k === 'PageDown' ||
        k === 'Home' ||
        k === 'End' ||
        k === 'ArrowUp' ||
        k === 'ArrowDown' ||
        k === ' ' ||
        k === 'Spacebar'
      ) {
        noteUserInitiatedScroll();
      }
    },
    opts
  );
}

async function readCommentPanelAutoRestoreFromStorage() {
  if (!hasExtensionContext()) return;
  try {
    const bag = await chrome.storage.local.get(KEY_COMMENT_PANEL_AUTO_RESTORE);
    commentPanelAutoRestoreEnabled = normalizeCommentPanelAutoRestoreEnabled(
      bag[KEY_COMMENT_PANEL_AUTO_RESTORE]
    );
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      // no-op: storage 失敗時は既定値（true）のまま
    }
  }
}

/**
 * コメントパネルが「下に流れて見えない／viewport 外に追いやられている」状態を
 * 検出して、可能なら復旧アクションを 1 つだけ実行する。
 * 純粋モジュール `commentPanelHealthProbe` に判断を委ねる（DOM 触りはここだけ）。
 */
async function probeAndRestoreCommentPanelHealth() {
  if (!commentPanelAutoRestoreEnabled) return;
  if (!hasExtensionContext()) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;

  const panel = findNicoCommentPanel(document);
  /** @type {{ top: number, height: number } | null} */
  let panelRect = null;
  if (panel && typeof panel.getBoundingClientRect === 'function') {
    try {
      const r = panel.getBoundingClientRect();
      panelRect = { top: r.top, height: r.height };
    } catch {
      panelRect = null;
    }
  }

  const host = findCommentListScrollHost(document);
  /** @type {{ scrollTop: number, scrollHeight: number, clientHeight: number } | null} */
  let scrollHost = null;
  if (host) {
    scrollHost = {
      scrollTop: Number(host.scrollTop) || 0,
      scrollHeight: Number(host.scrollHeight) || 0,
      clientHeight: Number(host.clientHeight) || 0
    };
  }

  /** @type {HTMLButtonElement | null} */
  let latestButton = null;
  try {
    latestButton = /** @type {HTMLButtonElement | null} */ (
      document.querySelector(LATEST_COMMENT_BUTTON_SELECTOR)
    );
  } catch {
    latestButton = null;
  }

  const decision = decideCommentPanelRestoreAction({
    enabled: true,
    now: Date.now(),
    lastActionAt: lastCommentPanelRestoreActionAt,
    lastUserScrollAt: lastUserInitiatedScrollAt,
    panelPresent: !!panel,
    panelRect,
    viewportHeight: Number(window.innerHeight) || 0,
    scrollHost,
    hasLatestButton: !!latestButton
  });

  if (decision.action === 'click_latest_button') {
    if (!latestButton) return;
    try {
      latestButton.click();
      lastCommentPanelRestoreActionAt = Date.now();
    } catch {
      // 押せなかったときは次 tick で再挑戦（lastActionAt を更新しない）
    }
    return;
  }

  if (decision.action === 'scroll_panel_into_view') {
    if (!panel || typeof panel.scrollIntoView !== 'function') return;
    try {
      // 自分で発火させる scroll イベントが user-scroll として誤カウントされないよう抑止窓を張る。
      suppressOwnScrollCountingFor(800);
      panel.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      lastCommentPanelRestoreActionAt = Date.now();
    } catch {
      // no-op: scrollIntoView が未対応のブラウザは次 tick で諦める
    }
  }
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
    // SPA 遷移で watch から非 watch（/my/follow など）に移ってもこの interval は
    // 止まらないため、毎回 URL が watch かを再判定する。watch でなければ
    // 12 秒ごとに別ページを fetch することになるので確実に skip する。
    if (!isNicoLiveWatchUrl(href)) { _pollDiag.err = 'not-watch'; return; }
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
  await readCommentPanelAutoRestoreFromStorage();
  // ユーザの能動的スクロール操作を検出し、probeAndRestoreCommentPanelHealth が
  // 直近操作中は自動復旧を抑止できるようにする（手動で上に押し上げても戻される問題の対策）。
  attachUserScrollListeners();
  if (isWatchInlinePanelTopFrame()) {
    ensurePageFrameStyle();
    await migrateFloatingInlinePanelToDockOnce({
      get: (keys) => chrome.storage.local.get(keys),
      set: (obj) => chrome.storage.local.set(obj)
    }).catch(() => ({ changed: false }));
    /*
     * 0.1.63 (AS): below → dock_bottom のワンショット migration。
     *   ニコ生 SPA の親要素レイアウト変更により、`below` モードでパネルが
     *   ページ最下部に出てしまう問題（ユーザー報告「前はちゃんと出ていたが
     *   いつからかおかしくなった」）の暫定対策。
     */
    await migrateBelowInlinePanelToDockOnce({
      get: (keys) => chrome.storage.local.get(keys),
      set: (obj) => chrome.storage.local.set(obj)
    }).catch(() => ({ changed: false }));
    try {
      const layoutW = Number(window.innerWidth) || 0;
      await migrateSuggestInitialInlinePanelPlacementOnce({
        get: (keys) => chrome.storage.local.get(keys),
        set: (obj) => chrome.storage.local.set(obj),
        layoutInnerWidth: layoutW
      });
    } catch {
      // no-op
    }
    await loadPageFrameSettings().catch(() => {});
    if (isNicoLiveWatchUrl(window.location.href)) {
      startPageFrameLoop();
    }
  }
  bindNativeSelfPostedRecorder();

  // 0.1.29 (AD): start() が二度呼ばれた場合に旧 observer を必ず disconnect。
  // 通常は __nlsBootGlobal flag で二重 start を防いでいるが、SPA 遷移や
  // 拡張再注入の特殊系で守りに作る。
  if (mutationObserver) {
    try { mutationObserver.disconnect(); } catch { /* no-op */ }
    mutationObserver = null;
    observedMutationRoot = null;
  }

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

    if (
      changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY] ||
      changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]
    ) {
      if (isWatchInlinePanelTopFrame()) {
        if (changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY]) {
          inlinePanelViewportWidePolicy =
            normalizeInlinePanelViewportWidePolicy(
              changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY].newValue
            );
        }
        if (changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]) {
          inlinePanelViewportWideOnceDone =
            normalizeInlinePanelViewportWideOnceDone(
              changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE].newValue
            );
        }
        renderPageFrameOverlay();
      }
    }

    if (changes[KEY_INLINE_PANEL_AUTOSHOW_ENABLED]) {
      if (isWatchInlinePanelTopFrame()) {
        inlinePanelAutoshowEnabled = normalizeInlinePanelAutoshowEnabled(
          changes[KEY_INLINE_PANEL_AUTOSHOW_ENABLED].newValue
        );
        // OFF にしたときは toolbar セッションフラグもリセットして完全非表示に戻す
        if (!inlinePanelAutoshowEnabled) {
          toolbarInitiatedShowThisSession = false;
          // gate が閉じたあとも残っていた loading UI を即掃除（パネル本体は hidePageFrameOverlay 側）
          removeDeepHarvestLoadingUi();
        }
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

    if (changes[KEY_COMMENT_PANEL_AUTO_RESTORE]) {
      commentPanelAutoRestoreEnabled = normalizeCommentPanelAutoRestoreEnabled(
        changes[KEY_COMMENT_PANEL_AUTO_RESTORE].newValue
      );
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

  // 拡張 context invalidated（chrome://extensions の再読み込み等）後は、
  // 各 setInterval が「early return するだけの空 tick」を永続的に走らせ続ける。
  // タブを閉じない限り CPU を食うので、id を保持して invalidate 時に
  // clearInterval する（ML1: 0.1.9-5 で popup 側だけ修正したのを content にも揃える）。
  /** @type {number|null} */
  let liveIdPollIntervalId = null;
  /** @type {number|null} */
  let livePanelScanIntervalId = null;
  /** @type {number|null} */
  let deepHarvestPeriodicIntervalId = null;
  /** @type {number|null} */
  let statsPollIntervalId = null;
  const stopContentIntervalsIfContextInvalidated = () => {
    if (hasExtensionContext()) return false;
    if (liveIdPollIntervalId != null) {
      clearInterval(liveIdPollIntervalId);
      liveIdPollIntervalId = null;
    }
    if (livePanelScanIntervalId != null) {
      clearInterval(livePanelScanIntervalId);
      livePanelScanIntervalId = null;
    }
    if (deepHarvestPeriodicIntervalId != null) {
      clearInterval(deepHarvestPeriodicIntervalId);
      deepHarvestPeriodicIntervalId = null;
    }
    if (statsPollIntervalId != null) {
      clearInterval(statsPollIntervalId);
      statsPollIntervalId = null;
    }
    // 0.1.29 (AD): 拡張リロード後、旧 MutationObserver が DOM 変化のたびに
    // 走り続けて CPU を消費する。callback 内の hasExtensionContext() check で
    // 早期 return するが、observer 自体を disconnect しておく方が確実。
    try {
      mutationObserver?.disconnect();
    } catch {
      // no-op: 既に disconnect 済み・参照不正
    }
    // 0.1.29 (AD): thumbTimerId も同様に止める。runThumbCaptureTick 内で
    // hasExtensionContext check しているがここで明示的に止めれば
    // 無駄な setInterval tick を完全に消せる。
    if (typeof thumbTimerId === 'number') {
      try {
        clearInterval(thumbTimerId);
      } catch {
        // no-op
      }
      thumbTimerId = null;
    }
    if (pageFrameLayoutScrollRafId != null) {
      try {
        cancelAnimationFrame(pageFrameLayoutScrollRafId);
      } catch {
        // no-op
      }
      pageFrameLayoutScrollRafId = null;
    }
    if (pageFrameLayoutDebounceTimer != null) {
      try {
        clearTimeout(pageFrameLayoutDebounceTimer);
      } catch {
        // no-op
      }
      pageFrameLayoutDebounceTimer = null;
    }
    // 0.1.45 (AA): pageFrameLoopTimer も止める。旧コードはこの timer を
    // 止めずに tick の冒頭で early return するだけだったため、setInterval
    // slot と CPU が tab 寿命まで消費され続ける問題があった。
    if (pageFrameLoopTimer != null) {
      try {
        clearInterval(pageFrameLoopTimer);
      } catch {
        // no-op
      }
      pageFrameLoopTimer = null;
    }
    return true;
  };

  liveIdPollIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        syncLiveIdFromLocation();
      }, LIVE_POLL_MS)
    )
  );

  livePanelScanIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        if (
          !recording ||
          !liveId ||
          !locationAllowsCommentRecording()
        ) {
          return;
        }
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          hiddenLivePanelScanPhase =
            (hiddenLivePanelScanPhase + 1) % HIDDEN_LIVE_PANEL_SCAN_STRIDE;
          if (hiddenLivePanelScanPhase !== 0) return;
        } else {
          hiddenLivePanelScanPhase = 0;
        }
        scanVisibleCommentsNow();
        void probeAndRestoreCommentPanelHealth();
      }, LIVE_PANEL_SCAN_MS)
    )
  );

  deepHarvestPeriodicIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        tryPeriodicQuietDeepHarvest();
      }, DEEP_HARVEST_PERIODIC_MS)
    )
  );

  document.addEventListener('visibilitychange', onTabVisibleForCommentHarvest);

  pollStatsFromPage();
  statsPollIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          return;
        }
        pollStatsFromPage();
      }, STATS_POLL_MS)
    )
  );
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
