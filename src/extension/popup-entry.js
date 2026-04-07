// @ts-nocheck — popup UI; DOM/Chrome API が広く any 相当
import {
  extractLiveIdFromUrl,
  isNicoLiveWatchUrl,
  watchPageUrlsMatchForSnapshot
} from '../lib/broadcastUrl.js';
import { resolveWatchUrlFromTabAndStash } from '../lib/popupWatchUrlResolve.js';
import {
  anonymousNicknameFallback,
  compactNicoLaneUserId
} from '../lib/nicoAnonymousDisplay.js';
import {
  KEY_INLINE_PANEL_WIDTH_MODE,
  KEY_CALM_PANEL_MOTION,
  EXTENSION_SOFT_CACHE_STORAGE_KEYS,
  KEY_POPUP_FRAME,
  KEY_POPUP_FRAME_CUSTOM,
  KEY_LAST_WATCH_URL,
  KEY_RECORDING,
  KEY_DEEP_HARVEST_QUIET_UI,
  KEY_SELF_POSTED_RECENTS,
  KEY_USER_COMMENT_PROFILE_CACHE,
  KEY_COMMENT_PANEL_STATUS,
  KEY_COMMENT_INGEST_LOG,
  KEY_STORAGE_WRITE_ERROR,
  KEY_THUMB_AUTO,
  KEY_THUMB_INTERVAL_MS,
  KEY_COMMENT_ENTER_SEND,
  KEY_STORY_GROWTH_COLLAPSED,
  KEY_SUPPORT_VISUAL_EXPANDED,
  KEY_USAGE_TERMS_ACK,
  KEY_VOICE_AUTOSEND,
  KEY_VOICE_INPUT_DEVICE,
  KEY_DEV_MONITOR_TREND_PREFIX,
  INLINE_PANEL_WIDTH_PLAYER_ROW,
  INLINE_PANEL_WIDTH_VIDEO,
  commentsStorageKey,
  giftUsersStorageKey,
  isCommentEnterSendEnabled,
  isRecordingEnabled,
  isDeepHarvestQuietUiEnabled,
  normalizeInlinePanelWidthMode,
  normalizeCalmPanelMotion
} from '../lib/storageKeys.js';
import { normalizeSupportVisualExpanded } from '../lib/supportVisualExpanded.js';
import { computeScrollDeltaToRevealInParent } from '../lib/nlMainScrollReveal.js';
import { commentComposeKeyAction } from '../lib/commentComposeShortcuts.js';
import {
  audioConstraintsForDevice,
  probeMicrophoneLevel
} from '../lib/voiceInputDevices.js';
import { buildScreenshotFilename } from '../lib/videoCapture.js';
import { isThumbAutoEnabled, normalizeThumbIntervalMs } from '../lib/thumbSettings.js';
import {
  buildDedupeKey,
  normalizeCommentText
} from '../lib/commentRecord.js';
import { summarizeRecordedCommenters } from '../lib/liveCommenterStats.js';
import { resolveConcurrentViewers } from '../lib/concurrentEstimate.js';
import { watchMetaConcurrentGateFromSnapshot } from '../lib/popupWatchMetaConcurrentGate.js';
import {
  concurrentResolutionMethodTitlePart,
  SPARSE_CONCURRENT_ESTIMATE_NOTE
} from '../lib/watchConcurrentEstimateUiCopy.js';
import { parseViewerCountFromLooseText } from '../lib/liveAudienceDom.js';
import { pickLatestCommentEntry } from '../lib/pickLatestComment.js';
import {
  aggregateCommentsByUser,
  displayUserLabel,
  shortUserKeyDisplay,
  UNKNOWN_USER_KEY
} from '../lib/userRooms.js';
import {
  supportOrdinalForIndex,
  supportSameUserTotalInEntries,
  supportUserKeyFromEntry
} from '../lib/userSupportGridAccent.js';
import {
  applyUserCommentProfileMapToEntries,
  hydrateUserCommentProfileMapFromStorage,
  normalizeUserCommentProfileMap,
  pruneUserCommentProfileMap,
  readStorageBagWithRetry,
  upsertUserCommentProfileFromEntry,
  upsertUserCommentProfileFromIntercept
} from '../lib/userCommentProfileCache.js';
import {
  resolveSupportGrowthTileSrc,
  commentEnrichmentAvatarScore,
  isHttpOrHttpsUrl,
  isAnonymousStyleNicoUserId,
  isWeakNiconicoUserIconHttpUrl,
  pickSupportGrowthFallbackTileSrc,
  userLaneDedupeKey,
  userLaneResolvedThumbScore,
  NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS
} from '../lib/supportGrowthTileSrc.js';
import { createSupportAvatarLoadGuard } from '../lib/supportGrowthAvatarLoad.js';
import { entriesRelatedForStoryDetail } from '../lib/storyDetailRelatedEntries.js';
import { storageErrorRelevantToLiveId } from '../lib/storageErrorState.js';
import {
  commentPanelStatusRelevantToLiveId,
  parseCommentPanelStatusPayload
} from '../lib/commentPanelStatus.js';
import { escapeHtml, escapeAttr } from '../lib/htmlEscape.js';
import { topSupportRankLineModels } from '../lib/topSupportRankStripLines.js';
import { TOP_SUPPORT_RANK_STRIP_MAX } from '../lib/topSupportRankStripConfig.js';
import { topSupportRankStripStableKey } from '../lib/topSupportRankStripStableKey.js';
import {
  SUPPORT_GRID_TIER_KONTA,
  SUPPORT_GRID_TIER_RINK,
  supportGridDisplayTier
} from '../lib/supportGridDisplayTier.js';
import {
  bucketStoryUserLanePicks,
  flattenStoryUserLaneBuckets
} from '../lib/storyUserLaneBuckets.js';
import {
  buildStoryUserLaneGuideFootHtml,
  buildStoryUserLaneGuideKontaHtml,
  buildStoryUserLaneGuideTanuHtml,
  buildStoryUserLaneGuideTopHtml
} from '../lib/storyUserLaneGuideHtml.js';
import {
  buildHtmlReportConceptGuideCardHtml,
  buildHtmlReportSaveGuideCardHtml
} from '../lib/htmlReportConceptGuide.js';
import { buildWatchAudienceNote } from '../lib/watchAudienceCopy.js';
import { parseCommentIngestLog } from '../lib/commentIngestLog.js';
import { pickDevMonitorDebugSubset } from '../lib/devMonitorDebugSubset.js';
import {
  summarizeStoredCommentAvatarStats,
  summarizeStoredCommentProfileGaps
} from '../lib/devMonitorAvatarStats.js';
import {
  appendTrendPoint,
  persistTrendPointChrome,
  readMergedTrendSeries,
  readTrendSeries,
  trendHasCountSamples,
  trendToSparklineArrays
} from '../lib/devMonitorTrendSession.js';
import { aggregateMarketingReport } from '../lib/marketingAggregate.js';
import { buildMarketingDashboardHtml } from '../lib/marketingChartsHtml.js';
import {
  buildDevMonitorDlChartsHtml,
  commentTypeDistribution,
  htmlAcquisitionSparklines,
  htmlCaptureRatioBar,
  htmlCommentTypeBars,
  htmlDualCountSparklines,
  htmlOfficialVsRecordedBar,
  htmlProfileGapBars,
  htmlWsStalenessBar,
  officialVsRecordedBarState,
  profileGapBarSeries,
  wsStalenessState
} from '../lib/devMonitorViz.js';
import { buildStoryAvatarDiagHtml } from '../lib/storyAvatarDiagLine.js';
import { pickStrongerUserId } from '../lib/userIdPreference.js';
import {
  countCommentsInWindowMs,
  commentsPerMinuteFromWindow
} from '../lib/commentVelocityWindow.js';
import { maybeFlushBroadcastSessionSummarySample } from '../lib/broadcastSessionSummaryFlush.js';
import {
  listBroadcastSessionSummaryForLive,
  openBroadcastSessionSummaryDb
} from '../lib/broadcastSessionSummaryDb.js';

/**
 * @typedef {{
 *   id?: string,
 *   liveId?: string,
 *   commentNo?: string,
 *   userId?: string|null,
 *   nickname?: string,
 *   text?: string,
 *   avatarUrl?: string,
 *   selfPosted?: boolean,
 *   capturedAt?: number
 * }} PopupCommentEntry
 */

/**
 * @typedef {{
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
 *   viewerAvatarUrl?: string,
 *   viewerNickname?: string,
 *   viewerUserId?: string,
 *   broadcasterUserId?: string,
 *   viewerCountFromDom?: number|null,
 *   viewerCountSource?: 'ws'|'embedded'|'dom'|'none',
 *   officialViewerCount?: number|null,
 *   officialCommentCount?: number|null,
 *   officialStatsUpdatedAt?: number|null,
 *   officialStatsFreshnessMs?: number|null,
 *   officialViewerIntervalMs?: number|null,
 *   officialStatisticsCommentsDelta?: number|null,
 *   officialReceivedCommentsDelta?: number|null,
 *   officialCommentSampleWindowMs?: number|null,
 *   officialCaptureRatio?: number|null,
 *   totalComments?: number|null,
 *   streamAgeMin?: number|null,
 *   recentActiveUsers?: number,
 *   _debug?: Record<string, unknown>
 * }} WatchPageSnapshot
 */

/** @param {string} id */
function $(id) {
  return document.getElementById(id);
}

function syncVoiceCommentButton() {
  if (!hasExtensionContext()) return;
  const post = /** @type {HTMLButtonElement|null} */ ($('postCommentBtn'));
  const voice = /** @type {HTMLButtonElement|null} */ ($('voiceCommentBtn'));
  const srCheck = /** @type {HTMLButtonElement|null} */ ($('voiceSrCheck'));
  if (!voice) return;
  voice.title =
    '聞き取りは watch ページ上で行います（タップで開始・もう一度で停止）';
  const dis = Boolean(post?.disabled);
  voice.disabled = dis;
  if (srCheck) {
    srCheck.disabled = dis;
    srCheck.title = dis
      ? 'watchページを開くと使えます'
      : 'watchページ上で短い音声認識テストをします';
  }
}

const INLINE_MODE = (() => {
  try {
    return new URLSearchParams(window.location.search).get('inline') === '1';
  } catch {
    return false;
  }
})();

/** watch ページ埋め込み iframe（サイドパネル用 `dock=sidepanel` とは UI を分ける） */
const INLINE_EMBED_WATCH = (() => {
  if (!INLINE_MODE) return false;
  try {
    return new URLSearchParams(window.location.search).get('dock') !== 'sidepanel';
  } catch {
    return true;
  }
})();

/** サイドパネル iframe（`popup.html?inline=1&dock=sidepanel`） */
const INLINE_SIDE_PANEL = (() => {
  if (!INLINE_MODE) return false;
  try {
    return new URLSearchParams(window.location.search).get('dock') === 'sidepanel';
  } catch {
    return false;
  }
})();

function applyResponsivePopupLayout() {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;

  root.classList.toggle('nl-inline', INLINE_MODE);
  body.classList.toggle('nl-inline', INLINE_MODE);
  root.classList.toggle('nl-inline-embed-watch', INLINE_EMBED_WATCH);
  body.classList.toggle('nl-inline-embed-watch', INLINE_EMBED_WATCH);
  root.classList.toggle('nl-skin-panel-dark', !INLINE_MODE || INLINE_SIDE_PANEL);
  body.classList.toggle('nl-skin-panel-dark', !INLINE_MODE || INLINE_SIDE_PANEL);

  if (INLINE_MODE) {
    const iw = Math.round(window.innerWidth || 360);
    const ih = Math.round(window.innerHeight || 400);
    const width = Math.max(260, iw);
    const height = Math.max(180, ih);
    const baseFont =
      width >= 900 ? 15.5 : width >= 720 ? 15.25 : width >= 520 ? 15 : 14.5;

    root.style.setProperty('--nl-pop-width', `${width}px`);
    root.style.setProperty('--nl-pop-height', `${height}px`);
    root.style.setProperty('--nl-base-font', `${baseFont}px`);
    body.classList.remove('nl-tight', 'nl-compact');
    return;
  }

  const sw = Number(window.screen?.availWidth || window.innerWidth || 1366);
  const sh = Number(window.screen?.availHeight || window.innerHeight || 768);

  const widthMin = sw >= 1920 ? 400 : sw >= 1440 ? 380 : sw >= 1100 ? 360 : 340;
  const widthMax = sw >= 1920 ? 520 : sw >= 1600 ? 500 : sw >= 1366 ? 470 : 440;
  const width = Math.max(widthMin, Math.min(widthMax, Math.round(sw * 0.265)));

  const heightMax = sh >= 900 ? 960 : sh >= 800 ? 900 : 860;
  const heightMin = sh >= 760 ? 700 : sh >= 660 ? 640 : 560;
  const baseHeight = Math.max(heightMin, Math.min(heightMax, Math.round(sh * 0.88)));
  const header = /** @type {HTMLElement|null} */ (
    document.querySelector('.nl-header')
  );
  const main = /** @type {HTMLElement|null} */ (
    document.querySelector('.nl-main')
  );
  const contentHeight =
    header && main ? Math.ceil(header.scrollHeight + main.scrollHeight + 2) : 0;
  const height = Math.min(heightMax, Math.max(baseHeight, contentHeight));
  const baseFont =
    width >= 500
      ? 16.25
      : width >= 460
        ? 15.75
        : width >= 420
          ? 15.25
          : width >= 380
            ? 14.75
            : 14.25;

  root.style.setProperty('--nl-pop-width', `${width}px`);
  root.style.setProperty('--nl-pop-height', `${height}px`);
  root.style.setProperty('--nl-base-font', `${baseFont}px`);

  const innerH = Number(window.innerHeight || height);
  const tight = innerH < 520 || height < 520;
  const compact = innerH < 580 || height < 580 || width < 340;
  body.classList.toggle('nl-tight', tight);
  body.classList.toggle('nl-compact', compact);
}

// ---------------------------------------------------------------------------
// キャラクター表情リアクション共通
// ---------------------------------------------------------------------------
const CHARA_BOUNCE_CLASSES = ['nl-chara-bounce-small', 'nl-chara-bounce-medium', 'nl-chara-bounce-big'];

const CHARA_IMG_BASE = 'images/yukkuri-charactore-english';

const RINKU_IMGS = /** @type {const} */ ({
  default: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,
  small:   `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-closed.png`,
  medium:  `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,
  big:     `${CHARA_IMG_BASE}/link/link-yukkuri-blink-mouth-open.png`,
});

const KONTA_IMGS = /** @type {const} */ ({
  default: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,
  small:   `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-closed.png`,
  medium:  `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,
  big:     `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-blink-mouth-open.png`,
});

const TANUNEE_IMGS = /** @type {const} */ ({
  default: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,
  small:   `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.png`,
  medium:  `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,
  big:     `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-blink-mouth-open.png`,
});

/** @type {Map<Element, number>} */
const _charaRevertTimers = new Map();

/**
 * @param {Element|null} iconEl
 * @param {{
 *   delta: number,
 *   thresholds: [number, number, number],
 *   images: { default: string, small: string, medium: string, big: string },
 * }} opts
 */
function triggerCharaReaction(iconEl, { delta, thresholds, images }) {
  if (!iconEl || delta <= 0) return;
  const [t1, t2, t3] = thresholds;
  /** @type {'small'|'medium'|'big'} */
  let rank;
  if (delta >= t3) rank = 'big';
  else if (delta >= t2) rank = 'medium';
  else if (delta >= t1) rank = 'small';
  else return;

  const bounceClass = `nl-chara-bounce-${rank}`;

  /** @type {HTMLImageElement} */ (iconEl).src = images[rank];
  for (const c of CHARA_BOUNCE_CLASSES) iconEl.classList.remove(c);
  void /** @type {HTMLElement} */ (iconEl).offsetWidth;
  iconEl.classList.add(bounceClass);

  const prev = _charaRevertTimers.get(iconEl);
  if (prev) clearTimeout(prev);
  _charaRevertTimers.set(iconEl, window.setTimeout(() => {
    /** @type {HTMLImageElement} */ (iconEl).src = images.default;
    _charaRevertTimers.delete(iconEl);
  }, 600));
}

let _prevSupportCount = /** @type {number|null} */ (null);

/** @type {string|null} */
let _lastTopSupportRankStripStableKey = null;

/**
 * @param {string} value
 * @param {WatchPageSnapshot|null} [watchSnapshot] 公式コメント数の併記用
 */
function setCountDisplay(value, watchSnapshot = null) {
  const countEl = $('count');
  if (countEl) {
    countEl.textContent = value;
    countEl.classList.toggle('is-placeholder', value === '-' || value === '');
  }
  const liveStatEl = $('liveStatComments');
  if (liveStatEl) liveStatEl.textContent = value;

  const officialEl = /** @type {HTMLElement|null} */ ($('liveStatCommentsOfficial'));
  if (officialEl) {
    const oc = watchSnapshot?.officialCommentCount;
    if (typeof oc === 'number' && Number.isFinite(oc) && oc >= 0) {
      officialEl.hidden = false;
      const recorded = parseInt(value, 10);
      let line = `公式 ${oc.toLocaleString('ja-JP')} 件`;
      if (!Number.isNaN(recorded) && recorded >= 0 && oc > 0) {
        if (recorded <= oc) {
          line += ` · 記録は公式の約${Math.round((recorded / oc) * 100)}%`;
        } else {
          line += ' · 記録が先行（公式表示の更新待ちのことがあります）';
        }
      }
      officialEl.textContent = line;
      officialEl.title =
        '公式は配信開始からの累計です。同じタブで見続け、NDGR（ページ内インターセプト）が効いているときは記録が公式にかなり近づく使い方も多いです。途中入室だと入室前の分だけ公式が先に増え、率は一気に低く見えます。左はこのPCのストレージの行数。仮想リスト・記録OFF・非表示タブ・サイト改修・ストレージ上限でも差が出ます。';
    } else {
      officialEl.hidden = true;
      officialEl.textContent = '';
      officialEl.removeAttribute('title');
    }
  }

  const num = parseInt(value, 10);
  if (!Number.isNaN(num) && _prevSupportCount != null && num > _prevSupportCount) {
    const card = document.getElementById('supportVisualLiveCard');
    const icon = card?.querySelector('.nl-live-stat-icon');
    triggerCharaReaction(icon ?? null, {
      delta: num - _prevSupportCount,
      thresholds: [1, 3, 10],
      images: RINKU_IMGS,
    });
  }
  if (!Number.isNaN(num)) _prevSupportCount = num;
}

/**
 * 最新コメント帯は ID より見た目の名前を優先する。
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} liveId
 * @param {PopupCommentEntry[]|null|undefined} [entries]
 */
function commentTickerDisplayLabel(entry, liveId, entries) {
  if (!entry) return '';
  const nickname = String(entry.nickname || '').trim();
  if (nickname) return nickname;
  const ownPosted = isOwnPostedSupportComment(entry, liveId, entries);
  const viewerNick = String(watchMetaCache.snapshot?.viewerNickname || '').trim();
  if (ownPosted && viewerNick) return viewerNick;
  const userId = String(entry.userId || '').trim();
  if (userId) return displayUserLabel(userId);
  return '';
}

/** @param {PopupCommentEntry[]} comments */
function renderCommentTicker(comments) {
  const segA = $('commentTickerSegA');
  const segB = $('commentTickerSegB');
  const scroll = /** @type {HTMLElement|null} */ ($('commentTickerScroll'));
  const viewport = /** @type {HTMLElement|null} */ ($('commentTickerViewport'));
  if (!segA || !segB || !scroll) return;

  const list = Array.isArray(comments) ? comments : [];
  const latest = /** @type {PopupCommentEntry|null} */ (pickLatestCommentEntry(list));
  const placeholder =
    '<span class="nl-ticker-item nl-ticker-latest">まだ応援コメントがないのだ… 記録ONでたまるよ</span>';

  scroll.classList.add('is-paused', 'is-latest-only');
  segB.innerHTML = '';

  if (!latest) {
    segA.innerHTML = placeholder;
    if (viewport) viewport.classList.add('is-empty');
    return;
  }
  if (viewport) viewport.classList.remove('is-empty');

  const liveId = String(latest.liveId || STORY_SOURCE_STATE.liveId || '');
  const label = commentTickerDisplayLabel(latest, liveId, list);
  const avatarSrc = storyGrowthTileSrcForEntry(latest, liveId, list);
  const rawText = String(latest.text || '').trim();
  const noStr = String(latest.commentNo || '').trim();
  const noPrefix = /^\d+$/.test(noStr) ? `No.${noStr} ` : '';
  const textFallback =
    rawText ||
    (noStr ? `（本文なし・${noPrefix.trim()}）` : '（本文なし）');
  const textShown = truncateText(rawText || textFallback, 72);
  const tip = label
    ? `${noPrefix}${label}：${rawText || '（コメント本文なし）'}`
    : `${noPrefix}${rawText || '（コメント本文なし）'}`;
  const labelHtml = label
    ? `<span class="nl-ticker-latest__name">${escapeHtml(label)}</span><span class="nl-ticker-latest__colon">：</span>`
    : '';

  segA.innerHTML =
    `<span class="nl-ticker-item nl-ticker-latest" aria-live="polite">` +
    `<span class="nl-ticker-latest__row">` +
    `<img class="nl-ticker-latest__avatar" alt="" src="${escapeHtml(avatarSrc)}">` +
    labelHtml +
    `<span class="nl-ticker-latest__text">${escapeHtml(textShown)}</span>` +
    `</span>` +
    `</span>`;
  const line = /** @type {HTMLSpanElement|null} */ (segA.querySelector('.nl-ticker-latest'));
  if (line) line.title = tip;
  const avatar = /** @type {HTMLImageElement|null} */ (
    segA.querySelector('.nl-ticker-latest__avatar')
  );
  if (avatar && isHttpOrHttpsUrl(avatarSrc)) {
    avatar.referrerPolicy = 'no-referrer';
  }
}

/**
 * @param {string} message
 * @param {'idle'|'error'|'success'} kind
 */
function setPostStatus(message, kind = 'idle') {
  const status = $('postStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('error', 'success');
  if (kind === 'error') status.classList.add('error');
  if (kind === 'success') status.classList.add('success');
}

const COMMENT_POST_UI_STATE = {
  submitting: false
};

/** 拡張コンテキスト無効化・更新手順の共通文案（UI とヒントで揃える） */
const EXTENSION_RELOAD_USER_GUIDE_JA =
  'chrome://extensions を開き、「君斗りんくの追憶のきらめき」の「更新」で拡張を再読み込みしてください。';

/** コメント送信まわりのエラーに、再読み込み案内を1回だけ足す */
function withCommentSendTroubleshootHint(message) {
  const s = String(message || '').trim();
  if (!s) return '';
  if (
    /再読み込み（F5）|chrome:\/\/extensions|うまくいかないとき|「更新」/.test(s)
  ) {
    return s;
  }
  return `${s}\n※うまくいかないとき：watchページを再読み込み（F5）。${EXTENSION_RELOAD_USER_GUIDE_JA}`;
}

/** @param {unknown} err */
function isExtensionContextInvalidatedError(err) {
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String(/** @type {{ message?: unknown }} */ (err).message || '')
      : String(err || '');
  return /Extension context invalidated/i.test(msg);
}

function hasExtensionContext() {
  try {
    return Boolean(
      globalThis.chrome?.runtime?.id && globalThis.chrome?.storage?.local
    );
  } catch {
    return false;
  }
}

let extensionContextErrorGuardInstalled = false;
function installExtensionContextErrorGuard() {
  if (extensionContextErrorGuardInstalled) return;
  extensionContextErrorGuardInstalled = true;
  globalThis.addEventListener('unhandledrejection', (ev) => {
    if (!isExtensionContextInvalidatedError(ev.reason)) return;
    ev.preventDefault();
  });
  globalThis.addEventListener('error', (ev) => {
    if (!isExtensionContextInvalidatedError(ev.error || ev.message)) return;
    ev.preventDefault();
  });
}

/**
 * @param {Record<string, unknown>} bag
 * @returns {Promise<boolean>}
 */
async function storageSetSafe(bag) {
  if (!hasExtensionContext()) return false;
  try {
    await chrome.storage.local.set(bag);
    return true;
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) return false;
    throw e;
  }
}

/**
 * @param {string|string[]} key
 * @returns {Promise<boolean>}
 */
async function storageRemoveSafe(key) {
  if (!hasExtensionContext()) return false;
  try {
    await chrome.storage.local.remove(key);
    return true;
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) return false;
    throw e;
  }
}

/**
 * @template T
 * @param {string|string[]} key
 * @param {T} fallback
 * @returns {Promise<T>}
 */
async function storageGetSafe(key, fallback) {
  if (!hasExtensionContext()) return fallback;
  try {
    return /** @type {T} */ (await chrome.storage.local.get(key));
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) return fallback;
    throw e;
  }
}

function renderExtensionContextBanner(visible) {
  const el = $('extensionContextBanner');
  if (!el) return;
  if (visible) el.removeAttribute('hidden');
  else el.setAttribute('hidden', '');
}

/** @type {{ key: string, snapshot: WatchPageSnapshot|null }} */
const watchMetaCache = {
  key: '',
  snapshot: null
};

/** 遅延フェーズの描画が直近の refresh に属するか判定する */
let watchPopupRefreshGeneration = 0;

/** E2E / 体感計測用: メインコンテンツの初回ペイントが終わった印 */
function markPopupRefreshContentPainted() {
  try {
    document.documentElement.setAttribute('data-nl-popup-content-painted', '1');
  } catch {
    // no-op
  }
}

function hideCommentVelocityLine() {
  const el = $('commentVelocityLine');
  if (!el) return;
  el.setAttribute('hidden', '');
  el.textContent = '';
}

/**
 * @param {PopupCommentEntry[]} displayEntries
 */
function updateCommentVelocityLine(displayEntries) {
  const el = $('commentVelocityLine');
  if (!el) return;
  const windowMs = 60_000;
  const now = Date.now();
  const list = Array.isArray(displayEntries) ? displayEntries : [];
  const n = countCommentsInWindowMs(list, now, windowMs);
  if (n <= 0) {
    el.setAttribute('hidden', '');
    el.textContent = '';
    return;
  }
  el.removeAttribute('hidden');
  const perMin = commentsPerMinuteFromWindow(n, windowMs);
  el.textContent = `直近1分: 約 ${perMin.toFixed(1)} 件/分（${n}件）`;
}

/**
 * @param {string} liveId
 */
async function renderSessionSummaryComparePanel(liveId) {
  const mount = $('sessionSummaryCompareMount');
  if (!mount) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || typeof indexedDB === 'undefined') {
    mount.innerHTML =
      '<p class="nl-sub">視聴ページを開くと、ここにサマリの推移が出ます。</p>';
    return;
  }
  /** @type {IDBDatabase|undefined} */
  let db;
  try {
    db = await openBroadcastSessionSummaryDb();
    const rows = await listBroadcastSessionSummaryForLive(db, lid, 24);
    if (!rows.length) {
      mount.innerHTML =
        '<p class="nl-sub">まだサンプルがありません（更新が進むと溜まります）。</p>';
      return;
    }
    const header =
      '<table class="nl-session-summary-table"><thead><tr>' +
      '<th>時刻</th><th>記録コメント</th><th>ユニークUID</th><th>ギフトユーザー</th><th>同接推定</th><th>公式コメ</th>' +
      '</tr></thead><tbody>';
    const body = rows
      .map((r) => {
        const t = new Date(r.capturedAt).toLocaleString('ja-JP');
        const peak =
          r.peakConcurrentEstimate != null && Number.isFinite(r.peakConcurrentEstimate)
            ? String(r.peakConcurrentEstimate)
            : '—';
        const oc =
          r.officialCommentCount != null && Number.isFinite(r.officialCommentCount)
            ? String(r.officialCommentCount)
            : '—';
        return `<tr><td>${escapeHtml(t)}</td><td>${r.commentStorageCount}</td><td>${r.uniqueKnownCommenters}</td><td>${r.giftUserCount}</td><td>${escapeHtml(peak)}</td><td>${escapeHtml(oc)}</td></tr>`;
      })
      .join('');
    mount.innerHTML = `${header}${body}</tbody></table>`;
  } catch {
    mount.innerHTML =
      '<p class="nl-sub">IndexedDB の読み込みに失敗しました。</p>';
  } finally {
    try {
      db?.close();
    } catch {
      // no-op
    }
  }
}

/**
 * @param {string} liveId
 */
async function renderGiftQuickStatsPanel(liveId) {
  const mount = $('giftQuickStatsMount');
  if (!mount) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) {
    mount.innerHTML = '';
    return;
  }
  try {
    const gk = giftUsersStorageKey(lid);
    const bag = await chrome.storage.local.get(gk);
    const raw = bag[gk];
    const users = Array.isArray(raw) ? raw : [];
    if (!users.length) {
      mount.innerHTML =
        '<p class="nl-sub">まだギフト・広告ユーザーが記録されていません。</p>';
      return;
    }
    const sorted = [...users].sort(
      (a, b) => (b.capturedAt || 0) - (a.capturedAt || 0)
    );
    const top = sorted.slice(0, 15);
    mount.innerHTML =
      `<p class="nl-sub">${users.length} 名を記録中（直近順に最大15件）</p><ul class="nl-gift-quick-list">` +
      top
        .map((u) => {
          const nick = escapeHtml(String(u.nickname || '').trim() || '(noname)');
          const uid = escapeHtml(String(u.userId || '').trim());
          return `<li><span class="nl-gift-nick">${nick}</span> <code class="nl-gift-uid">${uid}</code></li>`;
        })
        .join('') +
      '</ul>';
  } catch {
    mount.textContent = '読み込みに失敗しました。';
  }
}

/**
 * @param {string} liveId
 */
async function downloadSessionSummaryJson(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || typeof indexedDB === 'undefined') return;
  /** @type {IDBDatabase|undefined} */
  let db;
  try {
    db = await openBroadcastSessionSummaryDb();
    const rows = await listBroadcastSessionSummaryForLive(db, lid, 500);
    const json = JSON.stringify(rows, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({
        url,
        filename: `nicolivelog-session-summary-${lid}-${Date.now()}.json`,
        saveAs: true,
        conflictAction: 'uniquify'
      });
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  } catch {
    // no-op
  } finally {
    try {
      db?.close();
    } catch {
      // no-op
    }
  }
}

const INTERCEPT_BACKFILL_STATE = {
  liveId: '',
  deepTried: false
};

const DEFAULT_FRAME_ID = 'light';

const LEGACY_FRAME_ALIAS = {
  trio: 'light',
  rink: 'light',
  konta: 'sunset',
  tanunee: 'midnight'
};

const FRAME_PRESETS = {
  light: {
    label: 'ライト',
    vars: {
      '--nl-bg': '#fffaf2',
      '--nl-bg-soft': '#eef8ff',
      '--nl-surface': '#ffffff',
      '--nl-text': '#1f2937',
      '--nl-muted': '#5b6475',
      '--nl-border': '#d5e3f5',
      '--nl-accent': '#0f8fd8',
      '--nl-accent-hover': '#0b73ad',
      '--nl-header-start': '#0f8fd8',
      '--nl-header-end': '#14b8a6',
      '--nl-frame-outline': 'rgb(255 255 255 / 22%)'
    }
  },
  dark: {
    label: 'ダーク',
    vars: {
      '--nl-bg': '#0b1220',
      '--nl-bg-soft': '#111827',
      '--nl-surface': '#0f172a',
      '--nl-text': '#e5e7eb',
      '--nl-muted': '#94a3b8',
      '--nl-border': '#243244',
      '--nl-accent': '#60a5fa',
      '--nl-accent-hover': '#3b82f6',
      '--nl-header-start': '#1e293b',
      '--nl-header-end': '#334155',
      '--nl-frame-outline': 'rgb(255 255 255 / 18%)'
    }
  },
  midnight: {
    label: 'ミッドナイト',
    vars: {
      '--nl-bg': '#0b1022',
      '--nl-bg-soft': '#1b1f3a',
      '--nl-surface': '#10182f',
      '--nl-text': '#e2e8f0',
      '--nl-muted': '#9fb1ca',
      '--nl-border': '#2a3761',
      '--nl-accent': '#7dd3fc',
      '--nl-accent-hover': '#38bdf8',
      '--nl-header-start': '#1e1b4b',
      '--nl-header-end': '#1d4ed8',
      '--nl-frame-outline': 'rgb(255 255 255 / 22%)'
    }
  },
  sunset: {
    label: 'サンセット',
    vars: {
      '--nl-bg': '#fff7ed',
      '--nl-bg-soft': '#ffedd5',
      '--nl-surface': '#fffbf6',
      '--nl-text': '#1f2937',
      '--nl-muted': '#6b7280',
      '--nl-border': '#f5d0b5',
      '--nl-accent': '#ea580c',
      '--nl-accent-hover': '#c2410c',
      '--nl-header-start': '#fb923c',
      '--nl-header-end': '#f43f5e',
      '--nl-frame-outline': 'rgb(255 255 255 / 30%)'
    }
  }
};

const DEFAULT_CUSTOM_FRAME = Object.freeze({
  headerStart: '#0f8fd8',
  headerEnd: '#14b8a6',
  accent: '#0f8fd8'
});

/** @param {string} id */
function hasFramePreset(id) {
  return Object.prototype.hasOwnProperty.call(FRAME_PRESETS, id);
}

/** @param {unknown} raw */
function normalizeFrameId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (!id) return '';
  return (
    LEGACY_FRAME_ALIAS[/** @type {keyof typeof LEGACY_FRAME_ALIAS} */ (id)] || id
  );
}

/** @param {string} id */
function getFramePreset(id) {
  return hasFramePreset(id)
    ? FRAME_PRESETS[/** @type {keyof typeof FRAME_PRESETS} */ (id)]
    : null;
}

/** @type {{ id: string, custom: { headerStart: string, headerEnd: string, accent: string } }} */
const popupFrameState = {
  id: DEFAULT_FRAME_ID,
  custom: { ...DEFAULT_CUSTOM_FRAME }
};

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
function sanitizeCustomFrame(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    headerStart: normalizeHexColor(
      /** @type {{ headerStart?: unknown }} */ (source).headerStart,
      DEFAULT_CUSTOM_FRAME.headerStart
    ),
    headerEnd: normalizeHexColor(
      /** @type {{ headerEnd?: unknown }} */ (source).headerEnd,
      DEFAULT_CUSTOM_FRAME.headerEnd
    ),
    accent: normalizeHexColor(
      /** @type {{ accent?: unknown }} */ (source).accent,
      DEFAULT_CUSTOM_FRAME.accent
    )
  };
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function resolveFrameVars(frameId, custom) {
  if (frameId !== 'custom') {
    return getFramePreset(frameId)?.vars || FRAME_PRESETS[DEFAULT_FRAME_ID].vars;
  }
  const safe = sanitizeCustomFrame(custom);
  return {
    '--nl-bg': '#f7fbff',
    '--nl-bg-soft': '#e8f4ff',
    '--nl-surface': '#ffffff',
    '--nl-text': '#1f2937',
    '--nl-muted': '#5b6475',
    '--nl-border': '#cfe0f4',
    '--nl-accent': safe.accent,
    '--nl-accent-hover': darkenHexColor(safe.accent, 0.2),
    '--nl-header-start': safe.headerStart,
    '--nl-header-end': safe.headerEnd,
    '--nl-frame-outline': 'rgb(255 255 255 / 28%)'
  };
}

/** @param {string} frameId */
function frameLabel(frameId) {
  return frameId === 'custom'
    ? 'カスタム'
    : getFramePreset(frameId)?.label || FRAME_PRESETS[DEFAULT_FRAME_ID].label;
}

/** @param {string} frameId */
function renderFrameSelection(frameId) {
  const labelEl = $('frameCurrentLabel');
  if (labelEl) labelEl.textContent = frameLabel(frameId);
  const chips = Array.from(document.querySelectorAll('.nl-frame-chip'));
  for (const chip of chips) {
    const id = String(chip.getAttribute('data-frame-id') || '');
    const active = id === frameId;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-selected', active ? 'true' : 'false');
  }
}

/** @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function renderCustomFrameEditor(custom) {
  const safe = sanitizeCustomFrame(custom);
  const start = /** @type {HTMLInputElement|null} */ ($('frameHeaderStart'));
  const end = /** @type {HTMLInputElement|null} */ ($('frameHeaderEnd'));
  const accent = /** @type {HTMLInputElement|null} */ ($('frameAccent'));
  if (start) start.value = safe.headerStart;
  if (end) end.value = safe.headerEnd;
  if (accent) accent.value = safe.accent;
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function applyPopupFrame(frameId, custom) {
  const root = document.documentElement;
  const normalized = normalizeFrameId(frameId);
  const selectedFrame =
    normalized === 'custom' || hasFramePreset(normalized)
      ? normalized
      : DEFAULT_FRAME_ID;
  const vars = resolveFrameVars(selectedFrame, custom);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  renderFrameSelection(selectedFrame);
  renderCustomFrameEditor(custom);
  syncFrameShareInput();
}

/** 配色プリセットが外側の details 内にあるため、カスタム編集時は開いておく */
function openFrameThemeSectionIfPresent() {
  const theme = /** @type {HTMLDetailsElement|null} */ ($('frameThemeDetails'));
  if (theme) theme.open = true;
}

async function loadPopupFrameSettings() {
  const bag = await chrome.storage.local.get([
    KEY_POPUP_FRAME,
    KEY_POPUP_FRAME_CUSTOM
  ]);
  const rawFrameId = normalizeFrameId(bag[KEY_POPUP_FRAME]);
  const frameId =
    rawFrameId === 'custom' || hasFramePreset(rawFrameId)
      ? rawFrameId
      : DEFAULT_FRAME_ID;
  const custom = sanitizeCustomFrame(bag[KEY_POPUP_FRAME_CUSTOM]);
  popupFrameState.id = frameId;
  popupFrameState.custom = custom;
  applyPopupFrame(frameId, custom);
  if (frameId === 'custom') openFrameThemeSectionIfPresent();
}

async function savePopupFrameSettings() {
  await chrome.storage.local.set({
    [KEY_POPUP_FRAME]: popupFrameState.id,
    [KEY_POPUP_FRAME_CUSTOM]: popupFrameState.custom
  });
}

/** @param {string} text */
function encodeBase64UrlUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** @param {string} text */
function decodeBase64UrlUtf8(text) {
  let base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) base64 += '='.repeat(4 - pad);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * @param {string} frameId
 * @param {{ headerStart: string, headerEnd: string, accent: string }} custom
 */
function createFrameShareCode(frameId, custom) {
  const normalized = normalizeFrameId(frameId);
  const safeId =
    normalized === 'custom' || hasFramePreset(normalized)
      ? normalized
      : DEFAULT_FRAME_ID;
  const payload = {
    v: 1,
    frame: safeId,
    custom: sanitizeCustomFrame(custom)
  };
  const encoded = encodeBase64UrlUtf8(JSON.stringify(payload));
  return `nlsframe.${encoded}`;
}

/** @param {string} raw */
function parseFrameShareCode(raw) {
  const code = String(raw || '').trim();
  if (!code) {
    throw new Error('共有コードが空です。');
  }

  const payloadText = code.startsWith('nlsframe.')
    ? decodeBase64UrlUtf8(code.slice('nlsframe.'.length))
    : code;
  const payload = JSON.parse(payloadText);
  const source = payload && typeof payload === 'object' ? payload : {};
  const frameValue = normalizeFrameId(
    /** @type {{ frame?: unknown }} */ (source).frame || ''
  );
  const frameId =
    frameValue === 'custom' || hasFramePreset(frameValue)
      ? frameValue
      : DEFAULT_FRAME_ID;

  return {
    frameId,
    custom: sanitizeCustomFrame(
      /** @type {{ custom?: unknown }} */ (source).custom || {}
    )
  };
}

/** @param {string} message @param {'idle'|'error'|'success'} kind */
function setFrameShareStatus(message, kind = 'idle') {
  const status = $('frameShareStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('error', 'success');
  if (kind === 'error') status.classList.add('error');
  if (kind === 'success') status.classList.add('success');
}

/**
 * watch 内インラインフレーム（`popup.html?inline=1`）では親ページの Permissions Policy により
 * `navigator.clipboard` がブロックされることがあるため、埋め込み時は execCommand を優先する。
 * @param {string} text
 * @returns {Promise<boolean>}
 */
function copyTextViaExecCommand(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'true');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  area.style.top = '0';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  area.focus();
  area.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(area);
  return copied;
}

async function copyTextToClipboard(text) {
  let embedded = false;
  try {
    embedded = window.self !== window.top;
  } catch {
    embedded = true;
  }
  if (embedded) {
    return copyTextViaExecCommand(text);
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyTextViaExecCommand(text);
  }
}

function syncFrameShareInput() {
  const input = /** @type {HTMLTextAreaElement|null} */ ($('frameShareCode'));
  if (!input) return;
  input.value = createFrameShareCode(popupFrameState.id, popupFrameState.custom);
}

/** ストーリー枠は りんく上半身（応援カウンター） */
const STORY_RINK_FACE_IMG = 'images/toumeilink.png';
/** 記録ON・件数0のときのストーリー顔（PNG タイル既定とは別の差し絵） */
const STORY_RINK_COLLECTING_JPG = 'images/icon/kewXCUOt_400x400.jpg';
/**
 * 応援グリッドで「そのコメントにサムネURLが無い」ときの既定タイル（ゆっくり。キャラ削除ではない）
 */
const STORY_GRID_DEFAULT_TILE_IMG =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
/** ユーザーレーン案内（りんく・こん太・たぬ姉） */
const STORY_GUIDE_FACE_RINK =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
const STORY_GUIDE_FACE_KONTA =
  'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png';
const STORY_GUIDE_FACE_TANU =
  'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png';
/**
 * 匿名・404 等のフォールバック。拡張内 SVG ではなくニコ公式 defaults（視聴ページの見え方に寄せる）
 */
const STORY_REMOTE_FAILED_PLACEHOLDER_IMG = NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS;

/**
 * ゆっくり既定タイル向けの「枠付き」スタイル。公式 usericon / defaults には付けない。
 * @param {string} requestedSrc
 * @param {string} displaySrc
 */
function storyTileUsesYukkuriTvStyle(requestedSrc, displaySrc) {
  const r = String(requestedSrc || '');
  const d = String(displaySrc || '');
  return (
    r.includes('yukkuri-charactore-english') ||
    d.includes('yukkuri-charactore-english')
  );
}

/** @param {HTMLImageElement} img */
function applyStoryAvatarTvFallbackClass(img) {
  if (!(img instanceof HTMLImageElement)) return;
  try {
    const s = String(img.currentSrc || img.src || '');
    if (/nicoaccount\/usericon\/defaults\//i.test(s)) return;
  } catch {
    // no-op
  }
  if (img.classList.contains('nl-story-userlane-avatar')) {
    img.classList.add('nl-avatar--tv-fallback');
    return;
  }
  if (img.classList.contains('nl-story-growth-icon')) {
    img.classList.add('nl-story-growth-icon--tv-fallback');
    return;
  }
  if (img.classList.contains('nl-story-detail-img')) {
    img.classList.add('nl-story-detail-img--tv-fallback');
  }
}

const storyAvatarLoadGuard = createSupportAvatarLoadGuard({
  fallbackSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
  onFallbackApplied: applyStoryAvatarTvFallbackClass
});

const MAX_SELF_POSTED_ITEMS = 48;
const SELF_POST_DUPLICATE_WINDOW_MS = 5000;
/** コメント送信後、DOM 保存までに許容する遅延（ms） */
const SELF_POST_MATCH_LATE_MS = 10 * 60 * 1000;
/** capturedAt が送信記録より少し手前に見えるケースの許容（ms） */
const SELF_POST_MATCH_EARLY_MS = 30 * 1000;
const SELF_POST_RECENT_TTL_MS = 24 * 60 * 60 * 1000;

/** @type {{ liveId: string, at: number, textNorm: string }[]} */
let selfPostedRecentsCache = [];

const SELF_POST_MATCH_CACHE = {
  entriesRef: /** @type {PopupCommentEntry[]|null} */ (null),
  liveId: '',
  recentFingerprint: '',
  entriesFingerprint: '',
  matchedIds: new Set()
};

/**
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} [fallbackLiveId]
 */
function popupEntryStableId(entry, fallbackLiveId = '') {
  if (!entry) return '';
  const id = String(entry.id || '').trim();
  if (id) return id;
  const lid = String(entry.liveId || fallbackLiveId || STORY_SOURCE_STATE.liveId || '')
    .trim()
    .toLowerCase();
  return `legacy:${buildDedupeKey(lid, {
    commentNo: entry.commentNo,
    text: String(entry.text || ''),
    capturedAt: entry.capturedAt
  })}`;
}

/** @param {PopupCommentEntry[]} entries */
function selfPostedEntryFingerprint(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return '0';
  const first = list[0];
  const last = list[list.length - 1];
  return `${list.length}|${popupEntryStableId(first)}|${popupEntryStableId(last)}|${Number(last?.capturedAt || 0)}`;
}

/**
 * self-posted 履歴と保存済みコメントを 1対1 で突き合わせる。
 * 同文コメントが他人に存在しても、自分が送った件数ぶんだけ self 扱いにする。
 *
 * @param {PopupCommentEntry[]} entries
 * @param {string} liveId
 * @returns {Set<string>}
 */
function buildOwnPostedMatchedIdSet(entries, liveId) {
  return matchSelfPostedRecentsToEntries(entries, liveId).matchedIds;
}

/**
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {Set<string>}
 */
function getOwnPostedMatchedIdSet(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim().toLowerCase();
  const recentFingerprint = selfPostedRecentsFingerprintForLive(lid);
  const entriesFingerprint = selfPostedEntryFingerprint(list);
  if (
    SELF_POST_MATCH_CACHE.entriesRef === list &&
    SELF_POST_MATCH_CACHE.liveId === lid &&
    SELF_POST_MATCH_CACHE.recentFingerprint === recentFingerprint &&
    SELF_POST_MATCH_CACHE.entriesFingerprint === entriesFingerprint
  ) {
    return SELF_POST_MATCH_CACHE.matchedIds;
  }
  const matchedIds = buildOwnPostedMatchedIdSet(list, lid);
  SELF_POST_MATCH_CACHE.entriesRef = list;
  SELF_POST_MATCH_CACHE.liveId = lid;
  SELF_POST_MATCH_CACHE.recentFingerprint = recentFingerprint;
  SELF_POST_MATCH_CACHE.entriesFingerprint = entriesFingerprint;
  SELF_POST_MATCH_CACHE.matchedIds = matchedIds;
  return matchedIds;
}

/**
 * @param {Record<string, unknown>} bag
 */
function applySelfPostedRecentsFromBag(bag) {
  try {
    const raw = bag[KEY_SELF_POSTED_RECENTS];
    const items =
      raw && typeof raw === 'object' && Array.isArray(raw.items)
        ? raw.items
        : [];
    const now = Date.now();
    selfPostedRecentsCache = items.filter(
      (x) =>
        x &&
        typeof x.liveId === 'string' &&
        typeof x.textNorm === 'string' &&
        typeof x.at === 'number' &&
        now - x.at < SELF_POST_RECENT_TTL_MS
    );
  } catch {
    selfPostedRecentsCache = [];
  }
}

/**
 * @param {string} liveId
 * @param {string} rawText
 */
async function appendSelfPostedComment(liveId, rawText) {
  const lid = String(liveId || '').trim().toLowerCase();
  const textNorm = normalizeCommentText(rawText);
  if (!lid || !textNorm) return;
  const at = Date.now();
  const next = selfPostedRecentsCache.filter((it) => at - it.at < SELF_POST_RECENT_TTL_MS);
  const duplicated = next.some(
    (it) =>
      String(it.liveId || '').trim().toLowerCase() === lid &&
      String(it.textNorm || '') === textNorm &&
      Math.abs(at - (Number(it.at) || 0)) < SELF_POST_DUPLICATE_WINDOW_MS
  );
  if (duplicated) return;
  next.push({ liveId: lid, at, textNorm });
  while (next.length > MAX_SELF_POSTED_ITEMS) next.shift();
  selfPostedRecentsCache = next;
  try {
    await storageSetSafe({
      [KEY_SELF_POSTED_RECENTS]: { items: next }
    });
  } catch {
    // no-op
  }
}

/**
 * 送信失敗時に直前の楽観追記を1件だけ戻す
 * @param {string} liveId
 * @param {string} rawText
 */
async function revertLastSelfPostedComment(liveId, rawText) {
  const lid = String(liveId || '').trim().toLowerCase();
  const textNorm = normalizeCommentText(rawText);
  if (!lid || !textNorm) return;
  let bestIdx = -1;
  let bestAt = -1;
  for (let i = 0; i < selfPostedRecentsCache.length; i += 1) {
    const it = selfPostedRecentsCache[i];
    if (String(it.liveId).toLowerCase() !== lid) continue;
    if (it.textNorm !== textNorm) continue;
    const t = Number(it.at) || 0;
    if (t >= bestAt) {
      bestAt = t;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return;
  const next = selfPostedRecentsCache.filter((_, i) => i !== bestIdx);
  selfPostedRecentsCache = next;
  try {
    await storageSetSafe({
      [KEY_SELF_POSTED_RECENTS]: { items: next }
    });
  } catch {
    // no-op
  }
}

/**
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} liveId
 * @param {PopupCommentEntry[]|null|undefined} [entries]
 */
function isOwnPostedSupportComment(entry, liveId, entries = STORY_SOURCE_STATE.entries) {
  if (!entry) return false;
  if (entry.selfPosted) return true;
  const lid = String(liveId || STORY_SOURCE_STATE.liveId || '').trim().toLowerCase();
  if (!lid) return false;
  const list = Array.isArray(entries) ? entries : [];
  if (list.length > 0) {
    const matchedIds = getOwnPostedMatchedIdSet(list, lid);
    return matchedIds.has(popupEntryStableId(entry, lid));
  }
  const norm = normalizeCommentText(entry.text);
  if (!norm) return false;
  const cap = Number(entry.capturedAt) || 0;
  for (const it of selfPostedRecentsCache) {
    if (String(it.liveId).toLowerCase() !== lid) continue;
    if (it.textNorm !== norm) continue;
    if (
      cap >= it.at - SELF_POST_MATCH_EARLY_MS &&
      cap <= it.at + SELF_POST_MATCH_LATE_MS
    ) {
      return true;
    }
  }
  return false;
}

/** 永続プロファイルキャッシュ（refresh ごとに再読込） */
let popupUserCommentProfileMap = /** @type {null|Record<string, { nickname?: string, avatarUrl?: string, updatedAt: number }>} */ (
  null
);

/**
 * 永続 userId プロファイルキャッシュを arr と同期（学習・欠損補完・prune）
 * @param {PopupCommentEntry[]} arr
 * @returns {{ arr: PopupCommentEntry[], commentsPatched: boolean, cacheTouched: boolean }}
 */
function popupMergeUserCommentProfileCache(arr) {
  if (!popupUserCommentProfileMap) {
    return { arr, commentsPatched: false, cacheTouched: false };
  }
  let cacheTouched = false;
  for (const e of arr) {
    if (upsertUserCommentProfileFromEntry(popupUserCommentProfileMap, e)) {
      cacheTouched = true;
    }
  }
  const ap = applyUserCommentProfileMapToEntries(arr, popupUserCommentProfileMap);
  const nextArr = ap.patched > 0 ? ap.next : arr;
  const beforeK = Object.keys(popupUserCommentProfileMap).length;
  popupUserCommentProfileMap = pruneUserCommentProfileMap(popupUserCommentProfileMap);
  if (Object.keys(popupUserCommentProfileMap).length !== beforeK) {
    cacheTouched = true;
  }
  return {
    arr: nextArr,
    commentsPatched: ap.patched > 0,
    cacheTouched
  };
}

/**
 * @param {{
 *   refreshGen: number,
 *   commentsKey: string,
 *   getArr: () => PopupCommentEntry[],
 *   setArr: (next: PopupCommentEntry[]) => void,
 *   paint: () => void
 * }} ctx
 */
async function runDeferredUserCommentProfileHydrate(ctx) {
  const { refreshGen, commentsKey, getArr, setArr, paint } = ctx;
  try {
    if (!hasExtensionContext()) return;
    if (refreshGen !== watchPopupRefreshGeneration) return;
    const bag = await readStorageBagWithRetry(
      () => chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE),
      { attempts: 4, delaysMs: [0, 60, 150, 300] }
    );
    if (refreshGen !== watchPopupRefreshGeneration) return;
    if (!popupUserCommentProfileMap) return;
    const late = normalizeUserCommentProfileMap(
      bag[KEY_USER_COMMENT_PROFILE_CACHE]
    );
    if (!Object.keys(late).length) return;
    const hydrated = hydrateUserCommentProfileMapFromStorage(
      popupUserCommentProfileMap,
      late
    );
    if (!hydrated) return;
    const prof = popupMergeUserCommentProfileCache(getArr());
    setArr(prof.arr);
    const save = {};
    if (prof.commentsPatched) save[commentsKey] = prof.arr;
    if (prof.cacheTouched || hydrated) {
      save[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
    }
    if (Object.keys(save).length) {
      await storageSetSafe(save);
    }
    if (refreshGen !== watchPopupRefreshGeneration) return;
    paint();
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) return;
  }
}

/**
 * 初回 paint 後にアイドル時間でプロファイルキャッシュを再読込（ストレージ反映の遅れを吸収）
 * @param {Parameters<typeof runDeferredUserCommentProfileHydrate>[0]} ctx
 */
function scheduleDeferredUserCommentProfileHydrate(ctx) {
  const run = () => {
    void runDeferredUserCommentProfileHydrate(ctx);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 900 });
  } else {
    setTimeout(run, 200);
  }
}

/**
 * 同一 userId で過去に取れた avatarUrl を再利用する（仮想スクロールの欠落補完）
 * @param {unknown} userId
 */
function rememberedAvatarUrlForUserId(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return '';
  const fromCache = String(
    popupUserCommentProfileMap?.[uid]?.avatarUrl || ''
  ).trim();
  if (
    fromCache &&
    isHttpOrHttpsUrl(fromCache) &&
    !isWeakNiconicoUserIconHttpUrl(fromCache)
  ) {
    return fromCache;
  }
  const list = STORY_SOURCE_STATE?.entries;
  if (!Array.isArray(list) || list.length === 0) return '';
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const e = list[i];
    if (String(e?.userId || '').trim() !== uid) continue;
    const av = String(e?.avatarUrl || '').trim();
    if (
      av &&
      isHttpOrHttpsUrl(av) &&
      !isWeakNiconicoUserIconHttpUrl(av)
    ) {
      return av;
    }
  }
  return '';
}

/** @param {string} raw */
function avatarCompareKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return s;
  }
}

/** @param {string} a @param {string} b */
function isSameAvatarUrl(a, b) {
  const ka = avatarCompareKey(a);
  const kb = avatarCompareKey(b);
  return Boolean(ka && kb && ka === kb);
}

/** @param {PopupCommentEntry[]} entries */
function countEntriesWithUserId(entries) {
  let n = 0;
  for (const e of entries) {
    if (String(e?.userId || '').trim()) n += 1;
  }
  return n;
}

/** @param {PopupCommentEntry[]} entries */
function countEntriesWithAvatar(entries) {
  let n = 0;
  for (const e of entries) {
    if (isHttpOrHttpsUrl(String(e?.avatarUrl || '').trim())) n += 1;
  }
  return n;
}

/** @param {PopupCommentEntry[]} entries */
function countUniqueAvatarEntries(entries) {
  const set = new Set();
  for (const e of entries) {
    const k = avatarCompareKey(String(e?.avatarUrl || '').trim());
    if (k) set.add(k);
  }
  return set.size;
}

/**
 * userId から組み立てた URL も含め、実際に表示へ使える avatar 数を数える
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {{ total: number, unique: number }}
 */
function countResolvedAvatarEntries(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim();
  if (!lid || !list.length) return { total: 0, unique: 0 };
  let total = 0;
  const unique = new Set();
  for (const entry of list) {
    const src = storyGrowthAvatarSrcCandidate(entry, lid, list);
    const key = avatarCompareKey(src);
    if (!key) continue;
    total += 1;
    unique.add(key);
  }
  return { total, unique: unique.size };
}

/**
 * @param {string} liveId
 * @returns {number}
 */
function countPendingSelfPostedRecentsForLive(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return 0;
  let n = 0;
  for (const it of selfPostedRecentsCache) {
    if (String(it.liveId).toLowerCase() === lid) n += 1;
  }
  return n;
}

/**
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {number}
 */
function countOwnPostedEntries(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !list.length) return 0;
  const matchedIds = getOwnPostedMatchedIdSet(list, lid);
  let n = 0;
  for (const entry of list) {
    if (Boolean(entry?.selfPosted) || matchedIds.has(popupEntryStableId(entry, lid))) {
      n += 1;
    }
  }
  return n;
}

/**
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @returns {number}
 */
function countSavedOwnPostedEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let n = 0;
  for (const entry of list) {
    if (entry?.selfPosted) n += 1;
  }
  return n;
}

/**
 * self-posted 履歴と保存済みコメントの対応関係だけを計算する。
 * pending のまま残っている recents は consumedIndexes に含まれない。
 *
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {{ matchedIds: Set<string>, consumedIndexes: Set<number> }}
 */
function matchSelfPostedRecentsToEntries(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim().toLowerCase();
  /** @type {Set<string>} */
  const matchedIds = new Set();
  /** @type {Set<number>} */
  const consumedIndexes = new Set();
  if (!lid || !list.length || !selfPostedRecentsCache.length) {
    return { matchedIds, consumedIndexes };
  }

  const recents = selfPostedRecentsCache
    .map((it, itemIndex) => ({
      itemIndex,
      liveId: String(it?.liveId || '').trim().toLowerCase(),
      at: Number(it?.at) || 0,
      textNorm: String(it?.textNorm || '')
    }))
    .filter((it) => it.liveId === lid && it.at > 0 && it.textNorm)
    .sort((a, b) => a.at - b.at || a.itemIndex - b.itemIndex);
  if (!recents.length) {
    return { matchedIds, consumedIndexes };
  }

  /** @type {Map<string, { id: string, capturedAt: number, index: number }[]>} */
  const byText = new Map();
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    const textNorm = normalizeCommentText(entry?.text);
    const id = popupEntryStableId(entry, lid);
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

  for (const recent of recents) {
    const bucket = byText.get(recent.textNorm);
    if (!bucket?.length) continue;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestIndex = Number.POSITIVE_INFINITY;
    for (const candidate of bucket) {
      if (matchedIds.has(candidate.id)) continue;
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
    matchedIds.add(best.id);
    consumedIndexes.add(recent.itemIndex);
  }

  return { matchedIds, consumedIndexes };
}

/**
 * popup 側で自己投稿の後追い確定を行う。
 * content 側で確定し損ねた既存保存コメントにも selfPosted を焼き込み、
 * 消費済みの保留キューを storage から取り除く。
 *
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {{ next: PopupCommentEntry[], remaining: { liveId: string, at: number, textNorm: string }[], changed: boolean, pendingChanged: boolean }}
 */
function reconcileStoredOwnPostedEntries(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !list.length || !selfPostedRecentsCache.length) {
    return {
      next: list,
      remaining: selfPostedRecentsCache,
      changed: false,
      pendingChanged: false
    };
  }

  const { matchedIds, consumedIndexes } = matchSelfPostedRecentsToEntries(list, lid);

  if (!matchedIds.size && !consumedIndexes.size) {
    return {
      next: list,
      remaining: selfPostedRecentsCache,
      changed: false,
      pendingChanged: false
    };
  }

  let changed = false;
  const next = list.map((entry) => {
    const id = popupEntryStableId(entry, lid);
    if (!id || !matchedIds.has(id) || entry?.selfPosted) return entry;
    changed = true;
    return { ...entry, selfPosted: true };
  });

  return {
    next,
    remaining: selfPostedRecentsCache.filter((_, i) => !consumedIndexes.has(i)),
    changed,
    pendingChanged: consumedIndexes.size > 0
  };
}

/**
 * 保存済みコメントへ未反映の自己投稿だけ、UI 表示用に仮エントリ化する。
 *
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {PopupCommentEntry[]}
 */
function buildDisplayCommentEntries(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !selfPostedRecentsCache.length) return list;

  const { consumedIndexes } = matchSelfPostedRecentsToEntries(list, lid);
  const viewerUid = String(watchMetaCache.snapshot?.viewerUserId || '').trim();
  const viewerNick = String(watchMetaCache.snapshot?.viewerNickname || '').trim();
  const viewerAvatarUrl = String(watchMetaCache.snapshot?.viewerAvatarUrl || '').trim();

  /** @type {PopupCommentEntry[]} */
  const pending = selfPostedRecentsCache
    .map((it, itemIndex) => ({ it, itemIndex }))
    .filter(({ it, itemIndex }) => {
      if (consumedIndexes.has(itemIndex)) return false;
      return (
        String(it?.liveId || '').trim().toLowerCase() === lid &&
        Number(it?.at) > 0 &&
        Boolean(String(it?.textNorm || '').trim())
      );
    })
    .sort((a, b) => (Number(a.it?.at) || 0) - (Number(b.it?.at) || 0))
    .map(({ it, itemIndex }) => ({
      id: `pending-self:${lid}:${itemIndex}:${Number(it?.at) || 0}`,
      liveId: lid,
      text: String(it?.textRaw || it?.textNorm || '').trim(),
      userId: viewerUid || null,
      nickname: viewerNick,
      avatarUrl: isHttpOrHttpsUrl(viewerAvatarUrl) ? viewerAvatarUrl : '',
      selfPosted: true,
      capturedAt: Number(it?.at) || Date.now()
    }));

  if (!pending.length) return list;
  return [...list, ...pending];
}

/**
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} [liveId]
 * @param {PopupCommentEntry[]|null|undefined} [entries]
 * @returns {string} user icon URL。無ければ空
 */
function storyGrowthAvatarSrcCandidate(entry, liveId, entries = STORY_SOURCE_STATE.entries) {
  const snap = watchMetaCache.snapshot;
  const own = isOwnPostedSupportComment(entry, String(liveId || ''), entries);
  const bc = String(snap?.broadcasterUserId || '').trim();
  const entUid = String(entry?.userId || '').trim();
  const avatarUrl = String(entry?.avatarUrl || '').trim();
  const viewerAvatarUrl = String(snap?.viewerAvatarUrl || '').trim();
  const mistakenBroadcaster =
    !own && Boolean(bc && entUid && bc === entUid);
  const fallbackAvatar =
    mistakenBroadcaster || (viewerAvatarUrl && isSameAvatarUrl(avatarUrl, viewerAvatarUrl) && !own)
      ? ''
      : rememberedAvatarUrlForUserId(entUid);
  const effectiveAvatar =
    viewerAvatarUrl && isSameAvatarUrl(avatarUrl, viewerAvatarUrl) && !own
      ? ''
      : avatarUrl;
  const src = resolveSupportGrowthTileSrc({
    entryAvatarUrl: effectiveAvatar || fallbackAvatar,
    userId: mistakenBroadcaster ? null : entry?.userId ?? null,
    isOwnPosted: own,
    viewerAvatarUrl: snap?.viewerAvatarUrl,
    defaultSrc: ''
  });
  return isHttpOrHttpsUrl(src) ? src : '';
}

/**
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} [liveId]
 * @param {PopupCommentEntry[]|null|undefined} [entries]
 */
function storyGrowthTileSrcForEntry(entry, liveId, entries = STORY_SOURCE_STATE.entries) {
  const candidate = storyGrowthAvatarSrcCandidate(entry, liveId, entries);
  if (candidate) return candidate;
  return pickSupportGrowthFallbackTileSrc(
    entry?.userId,
    '',
    STORY_GRID_DEFAULT_TILE_IMG,
    STORY_REMOTE_FAILED_PLACEHOLDER_IMG
  );
}

/**
 * 応援ユーザーレーンの並び順。大きいほど「個人サムネ＋強い表示名」に近い（supportGridDisplayTier と一致）。
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} httpCandidate storyGrowthAvatarSrcCandidate
 * @returns {0|1|2|3}
 */
function userLaneProfileCompletenessTier(entry, httpCandidate) {
  const uid = String(entry?.userId || '').trim();
  if (!uid) return 0;
  const nick = String(entry?.nickname || '').trim();
  const rawAv = String(entry?.avatarUrl || '').trim();
  const t = supportGridDisplayTier({
    userId: uid,
    nickname: nick,
    httpAvatarCandidate: httpCandidate,
    storedAvatarUrl: rawAv
  });
  if (t === SUPPORT_GRID_TIER_RINK) return 3;
  if (t === SUPPORT_GRID_TIER_KONTA) return 2;
  return 1;
}

/**
 * ユーザーレーンの ID 行・名前行（プランの文言ルール）
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {unknown} httpCandidate storyGrowthAvatarSrcCandidate の戻り
 * @param {string} [userLaneDedupeKey] userLaneDedupeKey の戻り（t: / s: は userId 無しでも列に載る理由の表示用）
 */
function storyUserLaneMetaLines(entry, httpCandidate, userLaneDedupeKey = '') {
  const uid = String(entry?.userId || '').trim();
  const nick = String(entry?.nickname || '').trim();
  const hasHttp = isHttpOrHttpsUrl(httpCandidate);
  const dk = String(userLaneDedupeKey || '');

  if (!uid) {
    if (dk.startsWith('t:')) {
      return {
        idLine: '—',
        nameLine: 'ユーザーID未取得（サムネURLで区別）'
      };
    }
    if (dk.startsWith('s:')) {
      return {
        idLine: '—',
        nameLine: 'ユーザーID未取得（行IDで区別）'
      };
    }
    return { idLine: '—', nameLine: 'ID未取得' };
  }

  if (isAnonymousStyleNicoUserId(uid)) {
    const idLine = compactNicoLaneUserId(uid);
    const nameLine = anonymousNicknameFallback(uid, nick);
    return {
      idLine: idLine || '—',
      nameLine: nameLine || '—'
    };
  }

  const idLine = shortUserKeyDisplay(uid) || uid;
  const numeric = /^\d{5,14}$/.test(uid);
  if (numeric && hasHttp && nick) {
    return { idLine, nameLine: nick };
  }
  if (numeric && !nick) {
    return { idLine, nameLine: '（未取得）' };
  }
  if (nick) {
    return { idLine, nameLine: nick };
  }
  return { idLine, nameLine: '（未取得）' };
}

const STORY_HOP_STATE = {
  clearTimer: /** @type {ReturnType<typeof setTimeout>|null} */ (null)
};

/** @param {HTMLElement} avatarsEl */
function triggerStoryFaceHop(avatarsEl) {
  if (STORY_HOP_STATE.clearTimer) {
    clearTimeout(STORY_HOP_STATE.clearTimer);
    STORY_HOP_STATE.clearTimer = null;
  }
  const face = avatarsEl.querySelector('.nl-story-face');
  if (!face) return;
  face.classList.remove('is-hop');
  void avatarsEl.offsetWidth;
  face.classList.add('is-hop');
  STORY_HOP_STATE.clearTimer = window.setTimeout(() => {
    face.classList.remove('is-hop');
    STORY_HOP_STATE.clearTimer = null;
  }, 580);
}

/** @param {unknown} value @param {number} max */
function truncateText(value, max) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * @param {string} lead
 * @param {string} sub
 * @param {{
 *   liveId?: string,
 *   delta?: number,
 *   reaction?: 'idle'|'pulse'|'burst'|'sparkle',
 *   count?: number,
 *   faceSrc?: string
 * }} [opts]
 */
function setSceneStory(lead, sub, opts = {}) {
  const story = /** @type {HTMLElement|null} */ (document.querySelector('.nl-story'));
  const img = /** @type {HTMLImageElement|null} */ ($('sceneStoryImg'));
  const leadEl = $('sceneStoryLead');
  const subEl = $('sceneStorySub');
  const deltaEl = $('sceneStoryDelta');
  const growthEl = /** @type {HTMLElement|null} */ ($('sceneStoryGrowth'));
  const gaugeEl = /** @type {HTMLElement|null} */ ($('sceneStoryGauge'));
  const gaugeLabel = $('sceneStoryGaugeLabel');
  const delta = Math.max(0, Number(opts.delta || 0));
  const liveId = String(opts.liveId || '');
  const count = Math.max(0, Number(opts.count || 0));
  const facePick = String(opts.faceSrc || '').trim();
  if (img) img.src = facePick || STORY_RINK_FACE_IMG;
  if (leadEl) leadEl.textContent = lead;
  if (subEl) subEl.textContent = sub;
  if (deltaEl) {
    if (delta > 0) {
      deltaEl.hidden = false;
      deltaEl.textContent = `+${delta}`;
    } else {
      deltaEl.hidden = true;
      deltaEl.textContent = '';
    }
  }
  syncStoryGrowth(liveId, count, growthEl);
  if (gaugeEl) {
    gaugeEl.classList.toggle('is-hot', delta > 0);
    gaugeEl.setAttribute(
      'aria-label',
      `応援コメントアイコン: 累計 ${count.toLocaleString('ja-JP')} コメント`
    );
  }
  if (gaugeLabel) {
    gaugeLabel.textContent =
      count <= 0
        ? '応援 0 コメント'
        : `応援 ${count.toLocaleString('ja-JP')} コメント / ホバーでプレビュー・クリックで詳細固定（Esc・外側クリックで閉じる）`;
  }
  if (!story) return;
  const reaction = String(opts.reaction || 'idle');
  const avatars = /** @type {HTMLElement|null} */ (story.querySelector('.nl-story-avatars'));
  if (avatars) {
    avatars.classList.toggle('is-hop-strong', reaction === 'burst' || reaction === 'sparkle');
  }
  if (delta > 0 && !STORY_REACTION_STATE.reducedMotion && avatars) {
    triggerStoryFaceHop(avatars);
  }
  story.classList.remove('is-pulse', 'is-burst', 'is-sparkle');
  if (STORY_REACTION_STATE.reducedMotion) return;
  if (STORY_REACTION_STATE.clearTimer) {
    clearTimeout(STORY_REACTION_STATE.clearTimer);
    STORY_REACTION_STATE.clearTimer = null;
  }
  if (reaction === 'pulse') story.classList.add('is-pulse');
  if (reaction === 'burst') story.classList.add('is-burst');
  if (reaction === 'sparkle') {
    story.classList.add('is-burst');
    story.classList.add('is-sparkle');
  }
  STORY_REACTION_STATE.clearTimer = window.setTimeout(() => {
    story.classList.remove('is-pulse', 'is-burst', 'is-sparkle');
    STORY_REACTION_STATE.clearTimer = null;
  }, 920);
}

const STORY_REACTION_STATE = {
  liveId: '',
  lastCount: null,
  clearTimer: null,
  reducedMotion:
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
};

const STORY_GROWTH_STATE = {
  liveId: '',
  renderedCount: 0,
  targetCount: 0,
  root: /** @type {HTMLElement|null} */ (null),
  timer: /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  /** クリックで固定したコメントの安定 ID（`comment.id` ベース、レガシーは dedupe キー） */
  pinnedCommentId: /** @type {string|null} */ (null),
  /** ホバー一時プレビュー（固定中は無視・上書きしない） */
  hoverPreviewCommentId: /** @type {string|null} */ (null),
  /** syncStorySourceEntries の内容が変わったあと DOM を付け直すための簡易シグネチャ */
  sourceSig: '',
  /** ホバー解除の遅延用 */
  hoverClearTimer: /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  /** ホバー中アイコンの viewport 座標 */
  hoverAnchorRect: /** @type {DOMRect|null} */ (null),
  /** ホバー再取得用の最後のポインタ座標 */
  hoverClientX: Number.NaN,
  /** ホバー再取得用の最後のポインタ座標 */
  hoverClientY: Number.NaN
};

/** @returns {'light'|'dark'} */
function getStoryColorScheme() {
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

let storyGrowthColorSchemeListenerBound = false;

function ensureStoryGrowthColorSchemeListener() {
  if (storyGrowthColorSchemeListenerBound) return;
  storyGrowthColorSchemeListenerBound = true;
  if (typeof window.matchMedia !== 'function') return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    const root = STORY_GROWTH_STATE.root;
    if (root) patchStoryGrowthIconsFromSource(root, {});
    renderStoryUserLane();
  };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
  } else {
    mq.addListener(onChange);
  }
}

/** アイコン列が参照するコメント（全件） */
const STORY_SOURCE_STATE = {
  liveId: '',
  entries: /** @type {PopupCommentEntry[]} */ ([])
};

/** 開発監視エクスポート用・直近の render 引数 */
let lastDevMonitorPanelParams = /** @type {null|object} */ (null);

const STORY_AVATAR_DIAG_STATE = {
  total: 0,
  withUid: 0,
  withAvatar: 0,
  uniqueAvatar: 0,
  resolvedAvatar: 0,
  resolvedUniqueAvatar: 0,
  selfShown: 0,
  selfSaved: 0,
  selfPending: 0,
  selfPendingMatched: 0,
  interceptItems: 0,
  interceptWithUid: 0,
  interceptWithAvatar: 0,
  mergedPatched: 0,
  mergedUidReplaced: 0,
  stripped: 0,
  /** watch ページ content の interceptedUsers サイズ（スナップショット _debug.intercept）。未取得は -1 */
  interceptMapOnPage: -1,
  /** 直近の NLS_EXPORT_INTERCEPT_CACHE 成功時の export 行数（マージ前の配列長） */
  interceptExportRows: 0,
  /** 直近 export 試行の理由コード（no_watch_tab / export_rejected / message_failed / ok_empty / ok 等） */
  interceptExportCode: '',
  /** export 失敗時の短い補足（PII なし） */
  interceptExportDetail: ''
};

/** renderStoryUserLane の見た目が同じなら DOM を付け直さない（高流量時のちらつき抑制） */
let storyUserLaneLastRenderSig = '';

/** @param {PopupCommentEntry|null|undefined} entry */
function commentStableId(entry) {
  return popupEntryStableId(entry);
}

/** @param {string} stableId */
function getStoryEntryByStableId(stableId) {
  const want = String(stableId || '').trim();
  if (!want) return null;
  for (const e of STORY_SOURCE_STATE.entries) {
    if (commentStableId(e) === want) return e;
  }
  return null;
}

function storyHoverPreviewEnabled() {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function cancelStoryHoverClearTimer() {
  if (STORY_GROWTH_STATE.hoverClearTimer) {
    clearTimeout(STORY_GROWTH_STATE.hoverClearTimer);
    STORY_GROWTH_STATE.hoverClearTimer = null;
  }
}

/** @param {Element|null|undefined} el */
function updateStoryHoverAnchorFromElement(el) {
  if (!(el instanceof Element)) {
    STORY_GROWTH_STATE.hoverAnchorRect = null;
    return;
  }
  try {
    STORY_GROWTH_STATE.hoverAnchorRect = el.getBoundingClientRect();
  } catch {
    STORY_GROWTH_STATE.hoverAnchorRect = null;
  }
}

/** @param {{ clientX?: number, clientY?: number }|null|undefined} ev */
function updateStoryHoverPointerFromEvent(ev) {
  const x = Number(ev?.clientX);
  const y = Number(ev?.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  STORY_GROWTH_STATE.hoverClientX = x;
  STORY_GROWTH_STATE.hoverClientY = y;
}

/** @returns {HTMLImageElement|null} */
function findStoryHoverIconFromPointer() {
  const root = STORY_GROWTH_STATE.root;
  const x = STORY_GROWTH_STATE.hoverClientX;
  const y = STORY_GROWTH_STATE.hoverClientY;
  if (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    typeof document.elementFromPoint === 'function'
  ) {
    const hit = document.elementFromPoint(x, y);
    if (hit instanceof Element) {
      const img = hit.closest('img.nl-story-growth-icon');
      if (img instanceof HTMLImageElement && (!root || root.contains(img))) {
        return img;
      }
      if ($('sceneStoryDetail')?.contains(hit)) return null;
    }
  }
  if (!root) return null;
  try {
    const hovered = root.querySelector('img.nl-story-growth-icon:hover');
    return hovered instanceof HTMLImageElement ? hovered : null;
  } catch {
    return null;
  }
}

/** DOM 更新で data-comment-id が差し替わっても、カーソル下のアイコンへ追従する */
function reconcileStoryHoverPreviewFromPointer() {
  if (STORY_GROWTH_STATE.pinnedCommentId) return false;
  const img = findStoryHoverIconFromPointer();
  if (!img) return false;
  const sid = String(img.getAttribute('data-comment-id') || '').trim();
  if (!sid) return false;
  STORY_GROWTH_STATE.hoverPreviewCommentId = sid;
  updateStoryHoverAnchorFromElement(img);
  cancelStoryHoverClearTimer();
  return true;
}

function scheduleStoryHoverClear() {
  cancelStoryHoverClearTimer();
  STORY_GROWTH_STATE.hoverClearTimer = window.setTimeout(() => {
    STORY_GROWTH_STATE.hoverClearTimer = null;
    if (!STORY_GROWTH_STATE.pinnedCommentId) {
      if (reconcileStoryHoverPreviewFromPointer()) {
        renderStoryCommentDetailPanel();
        return;
      }
      STORY_GROWTH_STATE.hoverPreviewCommentId = null;
      STORY_GROWTH_STATE.hoverAnchorRect = null;
      renderStoryCommentDetailPanel();
    }
  }, 140);
}

function clearPinnedStoryComment() {
  STORY_GROWTH_STATE.pinnedCommentId = null;
  STORY_GROWTH_STATE.hoverPreviewCommentId = null;
  STORY_GROWTH_STATE.hoverAnchorRect = null;
  cancelStoryHoverClearTimer();
  syncGrowthIconSelection(STORY_GROWTH_STATE.root);
  renderStoryCommentDetailPanel();
}

/** @param {HTMLElement|null} root */
function syncGrowthIconSelection(root) {
  if (!root) return;
  const pin = STORY_GROWTH_STATE.pinnedCommentId;
  for (const el of root.querySelectorAll('img.nl-story-growth-icon')) {
    const id = el.getAttribute('data-comment-id');
    const on = Boolean(pin && id && id === pin);
    el.classList.toggle('is-selected', on);
    const cell = el.closest('.nl-story-growth-cell');
    if (cell instanceof HTMLElement) {
      cell.classList.toggle('nl-story-growth-cell--selected', on);
    }
  }
}

let storyGlobalDismissBound = false;

function ensureStoryGlobalDismissHandlers() {
  if (storyGlobalDismissBound) return;
  storyGlobalDismissBound = true;
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!STORY_GROWTH_STATE.pinnedCommentId) return;
    ev.preventDefault();
    clearPinnedStoryComment();
  });
  document.addEventListener(
    'pointerdown',
    (ev) => {
      if (!STORY_GROWTH_STATE.pinnedCommentId) return;
      const t = ev.target;
      if (!(t instanceof Node)) return;
      const g = $('sceneStoryGrowth');
      const d = $('sceneStoryDetail');
      if (g?.contains(t) || d?.contains(t)) return;
      clearPinnedStoryComment();
    },
    false
  );
}

function bindStoryDetailHoverBridge() {
  const detail = $('sceneStoryDetail');
  if (!detail || detail.dataset.nlDetailHoverBound === '1') return;
  detail.dataset.nlDetailHoverBound = '1';
  detail.addEventListener('pointerenter', () => {
    cancelStoryHoverClearTimer();
  });
  detail.addEventListener('pointerleave', (ev) => {
    if (STORY_GROWTH_STATE.pinnedCommentId) return;
    const rel = ev.relatedTarget;
    if (rel instanceof Element && rel.closest?.('#sceneStoryGrowth')) return;
    if (rel instanceof Element && rel.closest?.('img.nl-story-growth-icon'))
      return;
    STORY_GROWTH_STATE.hoverPreviewCommentId = null;
    STORY_GROWTH_STATE.hoverAnchorRect = null;
    renderStoryCommentDetailPanel();
  });
}

/**
 * @param {string} liveId
 * @param {'light'|'dark'} colorScheme
 * @param {Array<{ displaySrc: string, meta: { idLine: string, nameLine: string }, profileTier: number, entry: PopupCommentEntry }>} picked
 * @param {number} sourceEntryCount STORY_SOURCE_STATE.entries の長さ（picked=0 でもリスト更新で再描画するため）
 */
function storyUserLaneRenderSignature(
  liveId,
  colorScheme,
  picked,
  sourceEntryCount
) {
  const lid = String(liveId || '').trim().toLowerCase();
  const scheme = String(colorScheme || 'light');
  if (!picked.length) {
    const n = Math.max(0, Math.floor(Number(sourceEntryCount) || 0));
    return `${lid}|${scheme}|0|src:${n}`;
  }
  const parts = picked.map((p) => {
    const sid = commentStableId(p.entry);
    return [
      sid,
      p.displaySrc,
      p.meta.idLine,
      p.meta.nameLine,
      String(p.profileTier)
    ].join('\u001f');
  });
  return `${lid}|${scheme}|${picked.length}\u001e${parts.join('\u001e')}`;
}

function renderStoryUserLane() {
  const stack = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneStack'));
  const laneRink = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneRink'));
  const laneKonta = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneKonta'));
  const laneTanu = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneTanu'));
  const hintRink = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneRinkHint'));
  const rinkWrap = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneRinkWrap'));
  const guideTop = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideTop'));
  const guideLinesTop = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesTop'));
  const guideMidKonta = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideMidKonta'));
  const guideLinesMidKonta = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesMidKonta'));
  const guideMidTanu = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideMidTanu'));
  const guideLinesMidTanu = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesMidTanu'));
  const guideBottom = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideBottom'));
  const guideLinesBottom = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesBottom'));
  if (!stack || !laneRink || !laneKonta || !laneTanu) return;

  const clearMidGuides = () => {
    if (guideMidKonta) guideMidKonta.hidden = true;
    if (guideLinesMidKonta) guideLinesMidKonta.innerHTML = '';
    if (guideMidTanu) guideMidTanu.hidden = true;
    if (guideLinesMidTanu) guideLinesMidTanu.innerHTML = '';
  };

  const resetLaneTierCells = () => {
    laneRink.innerHTML = '';
    laneKonta.innerHTML = '';
    laneTanu.innerHTML = '';
    laneRink.hidden = true;
    laneKonta.hidden = true;
    laneTanu.hidden = true;
    if (hintRink) hintRink.hidden = true;
    if (rinkWrap) rinkWrap.hidden = true;
  };

  const hideUserLaneStackFully = () => {
    resetLaneTierCells();
    clearMidGuides();
    stack.hidden = true;
  };

  const entries = Array.isArray(STORY_SOURCE_STATE.entries)
    ? STORY_SOURCE_STATE.entries
    : [];
  if (!entries.length) {
    storyUserLaneLastRenderSig = '';
    hideUserLaneStackFully();
    if (guideTop) guideTop.hidden = true;
    if (guideLinesTop) guideLinesTop.innerHTML = '';
    if (guideBottom) guideBottom.hidden = true;
    if (guideLinesBottom) guideLinesBottom.innerHTML = '';
    return;
  }

  const limit = INLINE_MODE ? 48 : 24;
  const seen = new Set();
  const liveId = String(STORY_SOURCE_STATE.liveId || '');
  const laneScheme = getStoryColorScheme();

  /** @type {{ entryIndex: number, profileTier: number, thumbScore: number, displaySrc: string, title: string, entry: PopupCommentEntry, meta: { idLine: string, nameLine: string } }[]} */
  const candidates = [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    const uidRaw = String(e?.userId || '').trim();
    if (!uidRaw) continue;
    const httpCandidate = storyGrowthAvatarSrcCandidate(e, liveId);
    const dedupeKey = userLaneDedupeKey({
      userId: uidRaw,
      avatarHttpCandidate: '',
      stableId: ''
    });
    if (!dedupeKey) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const displaySrc = pickSupportGrowthFallbackTileSrc(
      e?.userId,
      httpCandidate,
      STORY_GRID_DEFAULT_TILE_IMG,
      STORY_REMOTE_FAILED_PLACEHOLDER_IMG
    );
    if (!displaySrc) continue;
    const label = storyGrowthDisplayLabel(e, liveId) || 'ユーザー';
    const meta = storyUserLaneMetaLines(e, httpCandidate, dedupeKey);
    const thumbScore = userLaneResolvedThumbScore(e?.userId, httpCandidate);
    const profileTier = userLaneProfileCompletenessTier(e, httpCandidate);
    candidates.push({
      entryIndex: i,
      profileTier,
      thumbScore,
      displaySrc,
      title: label,
      entry: e,
      meta
    });
  }

  const laneUidSortRank = (uidRaw) => {
    const s = String(uidRaw || '').trim();
    if (/^\d{5,14}$/.test(s)) return 0;
    if (/^a:/i.test(s)) return 1;
    return 2;
  };

  candidates.sort((a, b) => {
    if (b.profileTier !== a.profileTier) return b.profileTier - a.profileTier;
    if (b.thumbScore !== a.thumbScore) return b.thumbScore - a.thumbScore;
    const ua = String(a.entry?.userId || '').trim();
    const ub = String(b.entry?.userId || '').trim();
    const ra = laneUidSortRank(ua);
    const rb = laneUidSortRank(ub);
    if (ra !== rb) return ra - rb;
    if (ua !== ub) return ua < ub ? -1 : ua > ub ? 1 : 0;
    return b.entryIndex - a.entryIndex;
  });

  const buckets = bucketStoryUserLanePicks(candidates, limit);
  const picked = flattenStoryUserLaneBuckets(buckets);

  const laneSig = storyUserLaneRenderSignature(
    liveId,
    laneScheme,
    picked,
    entries.length
  );
  if (laneSig === storyUserLaneLastRenderSig) {
    return;
  }
  storyUserLaneLastRenderSig = laneSig;

  if (!picked.length) {
    resetLaneTierCells();
    stack.hidden = false;
    if (guideLinesTop) {
      guideLinesTop.innerHTML = buildStoryUserLaneGuideTopHtml(
        STORY_GUIDE_FACE_RINK
      );
    }
    if (guideTop) guideTop.hidden = false;
    if (guideLinesMidKonta) {
      guideLinesMidKonta.innerHTML = buildStoryUserLaneGuideKontaHtml(
        STORY_GUIDE_FACE_KONTA
      );
    }
    if (guideMidKonta) guideMidKonta.hidden = false;
    if (guideLinesMidTanu) {
      guideLinesMidTanu.innerHTML = buildStoryUserLaneGuideTanuHtml(
        STORY_GUIDE_FACE_TANU
      );
    }
    if (guideMidTanu) guideMidTanu.hidden = false;
    if (guideLinesBottom) {
      guideLinesBottom.innerHTML = buildStoryUserLaneGuideFootHtml(0);
    }
    if (guideBottom) guideBottom.hidden = false;
    return;
  }

  /**
   * @param {HTMLElement} el
   * @param {typeof candidates[number][]} items
   */
  const fillLaneTier = (el, items) => {
    el.innerHTML = '';
    if (!items.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const frag = document.createDocumentFragment();
    for (const p of items) {
      const cell = document.createElement('span');
      cell.className = 'nl-story-userlane-cell';

      const img = document.createElement('img');
      img.className = 'nl-story-userlane-avatar';
      const requestedLane = p.displaySrc;
      const displayLane = storyAvatarLoadGuard.pickDisplaySrc(requestedLane);
      img.src = displayLane;
      storyAvatarLoadGuard.noteRemoteAttempt(img, requestedLane);
      img.classList.toggle(
        'nl-avatar--tv-fallback',
        storyTileUsesYukkuriTvStyle(requestedLane, displayLane)
      );
      img.alt = '';
      const fullUid = String(p.entry?.userId || '').trim();
      const tip =
        fullUid && fullUid !== p.meta.idLine
          ? `${p.title} | ${fullUid}`
          : p.title;
      img.title = tip;
      cell.title = tip;
      img.decoding = 'async';
      if (isHttpOrHttpsUrl(img.src)) {
        img.referrerPolicy = 'no-referrer';
      }

      const metaEl = document.createElement('span');
      metaEl.className = 'nl-story-userlane-meta';
      const idRow = document.createElement('span');
      idRow.className = 'nl-story-userlane-meta__id';
      idRow.textContent = p.meta.idLine;
      const nameRow = document.createElement('span');
      nameRow.className = 'nl-story-userlane-meta__name';
      nameRow.textContent = p.meta.nameLine;
      metaEl.appendChild(idRow);
      metaEl.appendChild(nameRow);

      cell.appendChild(img);
      cell.appendChild(metaEl);
      frag.appendChild(cell);
    }
    el.appendChild(frag);
  };

  fillLaneTier(laneRink, buckets.rink);
  fillLaneTier(laneKonta, buckets.konta);
  fillLaneTier(laneTanu, buckets.tanu);

  if (hintRink) {
    const showRinkHint =
      buckets.rink.length === 0 &&
      (buckets.konta.length > 0 || buckets.tanu.length > 0);
    hintRink.hidden = !showRinkHint;
  }

  if (rinkWrap) {
    const showRinkWrap = !laneRink.hidden || (hintRink && !hintRink.hidden);
    rinkWrap.hidden = !showRinkWrap;
  }

  stack.setAttribute(
    'aria-label',
    `最近の応援ユーザーサムネイル 合計${picked.length}件`
  );
  stack.hidden = false;

  if (guideLinesTop) {
    guideLinesTop.innerHTML = buildStoryUserLaneGuideTopHtml(
      STORY_GUIDE_FACE_RINK
    );
  }
  if (guideTop) guideTop.hidden = false;
  if (guideLinesMidKonta) {
    guideLinesMidKonta.innerHTML = buildStoryUserLaneGuideKontaHtml(
      STORY_GUIDE_FACE_KONTA
    );
  }
  if (guideMidKonta) guideMidKonta.hidden = false;
  if (guideLinesMidTanu) {
    guideLinesMidTanu.innerHTML = buildStoryUserLaneGuideTanuHtml(
      STORY_GUIDE_FACE_TANU
    );
  }
  if (guideMidTanu) guideMidTanu.hidden = false;
  if (guideLinesBottom) {
    guideLinesBottom.innerHTML = buildStoryUserLaneGuideFootHtml(picked.length);
  }
  if (guideBottom) guideBottom.hidden = false;
}

function renderStoryAvatarDiag() {
  const el = /** @type {HTMLElement|null} */ ($('storyAvatarDiag'));
  if (!el) return;
  const html = buildStoryAvatarDiagHtml(STORY_AVATAR_DIAG_STATE);
  if (html == null) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.innerHTML = html;
  el.hidden = false;
}

function resetStoryAvatarDiagState() {
  STORY_AVATAR_DIAG_STATE.total = 0;
  STORY_AVATAR_DIAG_STATE.withUid = 0;
  STORY_AVATAR_DIAG_STATE.withAvatar = 0;
  STORY_AVATAR_DIAG_STATE.uniqueAvatar = 0;
  STORY_AVATAR_DIAG_STATE.resolvedAvatar = 0;
  STORY_AVATAR_DIAG_STATE.resolvedUniqueAvatar = 0;
  STORY_AVATAR_DIAG_STATE.selfShown = 0;
  STORY_AVATAR_DIAG_STATE.selfSaved = 0;
  STORY_AVATAR_DIAG_STATE.selfPending = 0;
  STORY_AVATAR_DIAG_STATE.selfPendingMatched = 0;
  STORY_AVATAR_DIAG_STATE.interceptItems = 0;
  STORY_AVATAR_DIAG_STATE.interceptWithUid = 0;
  STORY_AVATAR_DIAG_STATE.interceptWithAvatar = 0;
  STORY_AVATAR_DIAG_STATE.mergedPatched = 0;
  STORY_AVATAR_DIAG_STATE.mergedUidReplaced = 0;
  STORY_AVATAR_DIAG_STATE.stripped = 0;
  STORY_AVATAR_DIAG_STATE.interceptMapOnPage = -1;
  STORY_AVATAR_DIAG_STATE.interceptExportRows = 0;
  STORY_AVATAR_DIAG_STATE.interceptExportCode = '';
  STORY_AVATAR_DIAG_STATE.interceptExportDetail = '';
  renderStoryAvatarDiag();
}

/** @param {WatchPageSnapshot|null|undefined} snap */
function syncInterceptMapDiagFromSnapshot(snap) {
  const d = snap?._debug;
  STORY_AVATAR_DIAG_STATE.interceptMapOnPage =
    d &&
    typeof d.intercept === 'number' &&
    Number.isFinite(d.intercept) &&
    d.intercept >= 0
      ? Math.floor(d.intercept)
      : -1;
}

/**
 * @param {string} liveId
 * @param {PopupCommentEntry[]} arr
 */
function syncStorySourceEntries(liveId, arr) {
  const nextLiveId = String(liveId || '');
  const list = Array.isArray(arr) ? arr : [];

  if (STORY_SOURCE_STATE.liveId !== nextLiveId) {
    STORY_SOURCE_STATE.liveId = nextLiveId;
    STORY_GROWTH_STATE.pinnedCommentId = null;
    STORY_GROWTH_STATE.hoverPreviewCommentId = null;
    cancelStoryHoverClearTimer();
  }

  STORY_SOURCE_STATE.entries = list;

  const pin = STORY_GROWTH_STATE.pinnedCommentId;
  if (pin && !list.some((e) => commentStableId(e) === pin)) {
    STORY_GROWTH_STATE.pinnedCommentId = null;
    STORY_GROWTH_STATE.hoverPreviewCommentId = null;
    cancelStoryHoverClearTimer();
  }

  if (!STORY_GROWTH_STATE.pinnedCommentId && STORY_GROWTH_STATE.hoverPreviewCommentId) {
    reconcileStoryHoverPreviewFromPointer();
  }

  syncGrowthIconSelection(STORY_GROWTH_STATE.root);
  renderStoryUserLane();
  renderStoryAvatarDiag();
  renderStoryCommentDetailPanel();
}

/**
 * @param {number} index 表示スロット（0 始まり、capped 配列上のインデックス）
 * @returns {PopupCommentEntry|null}
 */
function getStoryEntryByIndex(index) {
  const entries = STORY_SOURCE_STATE.entries;
  if (!Number.isFinite(index) || index < 0 || index >= entries.length) return null;
  return entries[index];
}

function renderStoryCommentDetailPanel() {
  const wrap = /** @type {HTMLElement|null} */ ($('sceneStoryDetail'));
  const img = /** @type {HTMLImageElement|null} */ ($('sceneStoryDetailImg'));
  const userEl = $('sceneStoryDetailUser');
  const userMetaEl = $('sceneStoryDetailUserMeta');
  const textEl = $('sceneStoryDetailText');
  const metaEl = $('sceneStoryDetailMeta');
  const listEl = /** @type {HTMLUListElement|null} */ ($('sceneStoryDetailList'));
  if (!wrap || !userEl || !userMetaEl || !textEl || !metaEl || !listEl) return;

  const pinned = STORY_GROWTH_STATE.pinnedCommentId;
  const hover = STORY_GROWTH_STATE.hoverPreviewCommentId;
  const effectiveId = pinned || hover;
  const isHoverBubble = Boolean(!pinned && hover);

  wrap.classList.toggle('is-preview', Boolean(!pinned && hover));
  wrap.classList.toggle('is-pinned-detail', Boolean(pinned));
  wrap.classList.toggle('is-hover-bubble', isHoverBubble);
  wrap.classList.remove('is-hover-below');

  if (!effectiveId) {
    wrap.hidden = true;
    listEl.innerHTML = '';
    wrap.style.removeProperty('left');
    wrap.style.removeProperty('top');
    wrap.style.removeProperty('--nl-story-detail-arrow-left');
    return;
  }

  let entry = getStoryEntryByStableId(effectiveId);
  if (!entry && isHoverBubble && reconcileStoryHoverPreviewFromPointer()) {
    entry = getStoryEntryByStableId(STORY_GROWTH_STATE.hoverPreviewCommentId);
  }
  if (!entry) {
    wrap.hidden = true;
    listEl.innerHTML = '';
    return;
  }

  const userId = String(entry.userId || '').trim();
  const lidForOwn = String(entry.liveId || STORY_SOURCE_STATE.liveId || '');
  const ownPosted = isOwnPostedSupportComment(
    entry,
    lidForOwn,
    STORY_SOURCE_STATE.entries
  );
  const viewerNick = String(
    watchMetaCache.snapshot?.viewerNickname || ''
  ).trim();
  const viewerUid = String(
    watchMetaCache.snapshot?.viewerUserId || ''
  ).trim();

  if (img) {
    const requestedDetail = storyGrowthTileSrcForEntry(
      entry,
      String(entry.liveId || STORY_SOURCE_STATE.liveId || '')
    );
    const displayDetail = storyAvatarLoadGuard.pickDisplaySrc(requestedDetail);
    img.src = displayDetail;
    storyAvatarLoadGuard.noteRemoteAttempt(img, requestedDetail);
    img.classList.toggle(
      'nl-story-detail-img--tv-fallback',
      storyTileUsesYukkuriTvStyle(requestedDetail, displayDetail)
    );
    if (isHttpOrHttpsUrl(img.src)) {
      img.referrerPolicy = 'no-referrer';
      img.classList.add('nl-story-detail-img--remote');
    } else {
      img.removeAttribute('referrerpolicy');
      img.classList.remove('nl-story-detail-img--remote');
    }
  }
  userEl.textContent = storyGrowthDisplayLabel(entry, lidForOwn);
  if (userId) {
    userMetaEl.textContent = `ID: ${userId}`;
  } else if (ownPosted) {
    if (viewerUid) {
      userMetaEl.textContent = `ID（ヘッダーから推定）: ${viewerUid}`;
    } else if (viewerNick) {
      userMetaEl.textContent = `表示名（ヘッダー）: ${viewerNick}`;
    } else {
      userMetaEl.textContent =
        'コメント行に投稿者IDはありません。送信履歴と一致するため「自分のコメント」として表示しています。';
    }
  } else {
    userMetaEl.textContent = 'ID未取得（DOMに投稿者情報なし）';
  }
  textEl.textContent = String(entry.text || '').trim() || '（コメント本文なし）';
  const commentNo = String(entry.commentNo || '').trim() || '-';
  const at = formatDateTime(entry.capturedAt || 0);
  const liveId = String(entry.liveId || STORY_SOURCE_STATE.liveId || '').trim() || '-';
  const modeLabel = pinned ? '固定' : 'プレビュー';
  metaEl.textContent = `${modeLabel} · No.${commentNo} / ${at} / ${liveId}`;

  const recent = storyDetailRecentEntries(
    STORY_SOURCE_STATE.entries,
    entry,
    lidForOwn,
    { limit: 5 }
  );
  listEl.innerHTML = '';
  listEl.hidden = recent.length === 0;
  for (const row of recent) {
    const li = document.createElement('li');
    const no = String(row.commentNo || '').trim() || '-';
    const line = String(row.text || '').trim() || '（コメント本文なし）';
    li.textContent = `#${no} ${truncateText(line, 72)}`;
    listEl.appendChild(li);
  }

  wrap.hidden = false;
  wrap.style.removeProperty('left');
  wrap.style.removeProperty('top');
  wrap.style.removeProperty('--nl-story-detail-arrow-left');

  if (isHoverBubble && STORY_GROWTH_STATE.hoverAnchorRect) {
    const anchor = STORY_GROWTH_STATE.hoverAnchorRect;
    const margin = 8;
    const gap = 10;
    const minLeft = 6;
    const maxWidth = Math.min(280, Math.max(180, window.innerWidth - 16));
    wrap.style.maxWidth = `${maxWidth}px`;
    wrap.style.visibility = 'hidden';
    const measuredWidth = Math.min(maxWidth, Math.max(180, wrap.offsetWidth || 220));
    const measuredHeight = wrap.offsetHeight || 120;
    const anchorCenter = anchor.left + anchor.width / 2;
    let left = Math.round(anchorCenter - measuredWidth / 2);
    left = Math.max(minLeft, Math.min(left, window.innerWidth - measuredWidth - minLeft));
    let top = Math.round(anchor.top - measuredHeight - gap);
    let below = false;
    if (top < margin) {
      top = Math.round(anchor.bottom + gap);
      below = true;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - measuredHeight - margin));
    const arrowLeft = Math.max(
      14,
      Math.min(measuredWidth - 14, Math.round(anchorCenter - left))
    );
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;
    wrap.style.setProperty('--nl-story-detail-arrow-left', `${arrowLeft}px`);
    wrap.classList.toggle('is-hover-below', below);
    wrap.style.visibility = '';
  } else {
    wrap.style.maxWidth = '';
    wrap.style.visibility = '';
  }
}

/**
 * アイコン URL の変化で応援タイルを再同期するための簡易フィンガープリント
 * @param {PopupCommentEntry[]} entries
 */
function storyAvatarFingerprint(entries) {
  let h = 0;
  for (let i = 0; i < entries.length; i++) {
    const u = entries[i]?.avatarUrl;
    if (!u || typeof u !== 'string') continue;
    h = (h * 33 + u.length + i) | 0;
    const start = Math.max(0, u.length - 8);
    for (let j = start; j < u.length; j++) {
      h = (h * 31 + u.charCodeAt(j)) | 0;
    }
  }
  return h;
}

/** 視聴者アイコン取得後に応援タイルを再同期するため */
function watchViewerAvatarFingerprint() {
  const u = watchMetaCache.snapshot?.viewerAvatarUrl;
  if (!u || typeof u !== 'string') return '0';
  let h = 0;
  h = (h * 33 + u.length) | 0;
  const start = Math.max(0, u.length - 12);
  for (let j = start; j < u.length; j += 1) {
    h = (h * 31 + u.charCodeAt(j)) | 0;
  }
  return `${u.length}|${h}`;
}

function watchViewerUserIdFingerprint() {
  const id = watchMetaCache.snapshot?.viewerUserId;
  if (!id || typeof id !== 'string') return '0';
  let h = 0;
  const start = Math.max(0, id.length - 8);
  for (let j = start; j < id.length; j += 1) {
    h = (h * 31 + id.charCodeAt(j)) | 0;
  }
  return `${id.length}|${h}`;
}

/** 自己投稿キャッシュ更新で sync がスキップされないようにする */
function selfPostedRecentsFingerprintForLive(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return '0';
  let h = 0;
  let maxAt = 0;
  let n = 0;
  for (const it of selfPostedRecentsCache) {
    if (String(it.liveId).toLowerCase() !== lid) continue;
    n += 1;
    maxAt = Math.max(maxAt, Number(it.at) || 0);
    const tn = it.textNorm;
    for (let k = 0; k < tn.length; k += 1) {
      h = (h * 31 + tn.charCodeAt(k)) | 0;
    }
  }
  return `${n}|${maxAt}|${h}`;
}

/**
 * ストーリー詳細リスト用。
 * userId があるときは同一 userId の直近、ID未取得でも自己投稿と分かるときは
 * 自分が打ったコメントだけを直近順で出す。
 *
 * @param {PopupCommentEntry[]} entries
 * @param {PopupCommentEntry|null|undefined} focusEntry
 * @param {string} liveId
 * @param {{ limit?: number }} [opts]
 * @returns {PopupCommentEntry[]}
 */
function storyDetailRecentEntries(entries, focusEntry, liveId, opts = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const entry = focusEntry || null;
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 5;
  if (!entry || list.length === 0) return [];

  const uid = String(entry.userId || '').trim();
  if (uid) {
    return entriesRelatedForStoryDetail(list, entry, { limit });
  }

  if (!isOwnPostedSupportComment(entry, liveId, list)) return [];
  return list
    .filter((row) => isOwnPostedSupportComment(row, liveId, list))
    .slice(-limit)
    .reverse();
}

/** @param {string} text */
function storyCommentTextPenalty(text) {
  const s = normalizeCommentText(text).replace(/\n+/g, ' ').trim();
  if (!s) return Number.POSITIVE_INFINITY;
  const numberedTokens =
    s.match(/(?:^|[\s\u3000])\d{3,9}(?=\s+\S)/g)?.length || 0;
  return s.length + Math.max(0, numberedTokens - 1) * 240;
}

/**
 * 同一 commentNo の重複保存があるとき、短く自然な本文と欠損の少ないメタを優先する。
 * 旧バグで混ざった「複数コメント連結行」を UI 表示前に潰す。
 *
 * @param {PopupCommentEntry[]} entries
 * @returns {{ next: PopupCommentEntry[], changed: boolean }}
 */
function normalizeStoredCommentEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length <= 1) return { next: list, changed: false };

  /** @type {PopupCommentEntry[]} */
  const out = [];
  /** @type {Map<string, number>} */
  const indexByKey = new Map();
  let changed = false;

  /**
   * @param {PopupCommentEntry} prev
   * @param {PopupCommentEntry} next
   * @returns {PopupCommentEntry}
   */
  const mergeVariant = (prev, next) => {
    const prevText = normalizeCommentText(prev.text);
    const nextText = normalizeCommentText(next.text);
    const preferNextText =
      Boolean(nextText) &&
      (storyCommentTextPenalty(nextText) < storyCommentTextPenalty(prevText));
    const userId =
      String(next.userId || '').trim() || String(prev.userId || '').trim() || null;
    const nickname =
      String(next.nickname || '').trim() || String(prev.nickname || '').trim() || '';
    const avatarUrl =
      String(next.avatarUrl || '').trim() || String(prev.avatarUrl || '').trim() || '';
    const selfPosted = Boolean(prev.selfPosted) || Boolean(next.selfPosted);
    return {
      ...prev,
      ...(preferNextText ? { text: nextText || prevText } : {}),
      ...(userId ? { userId } : { userId: null }),
      ...(nickname ? { nickname } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(selfPosted ? { selfPosted: true } : {})
    };
  };

  for (const raw of list) {
    const entry = /** @type {PopupCommentEntry} */ (raw);
    const no = String(entry?.commentNo || '').trim();
    const key =
      /^\d+$/.test(no)
        ? `no:${no}`
        : `${String(entry?.liveId || '').trim().toLowerCase()}|${normalizeCommentText(entry?.text || '')}|${Number(entry?.capturedAt || 0)}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex == null) {
      indexByKey.set(key, out.length);
      out.push(entry);
      continue;
    }
    const merged = mergeVariant(out[existingIndex], entry);
    if (merged !== out[existingIndex]) {
      changed = true;
      out[existingIndex] = merged;
    } else {
      changed = true;
    }
  }

  return { next: out, changed: changed || out.length !== list.length };
}

/** @returns {string} */
function storySourceSignature() {
  const e = STORY_SOURCE_STATE.entries;
  if (!e.length) return '';
  const first = e[0];
  const last = e[e.length - 1];
  const av = storyAvatarFingerprint(e);
  const lid = String(STORY_SOURCE_STATE.liveId || '').trim().toLowerCase();
  const vf = watchViewerAvatarFingerprint();
  const uf = watchViewerUserIdFingerprint();
  const pf = selfPostedRecentsFingerprintForLive(lid);
  return `${e.length}|${first?.capturedAt ?? ''}|${last?.capturedAt ?? ''}|${last?.id ?? ''}|a:${av}|v:${vf}|u:${uf}|p:${pf}`;
}

/**
 * @param {HTMLElement} root
 */
function bindStoryGrowthInteractions(root) {
  if (root.dataset.nlStoryGrowthBound === '1') return;
  root.dataset.nlStoryGrowthBound = '1';

  ensureStoryGlobalDismissHandlers();
  bindStoryDetailHoverBridge();

  root.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const img = t.closest('img.nl-story-growth-icon');
    if (!img || !root.contains(img)) return;
    const sid = img.getAttribute('data-comment-id');
    if (!sid) return;
    cancelStoryHoverClearTimer();
    STORY_GROWTH_STATE.hoverPreviewCommentId = null;
    STORY_GROWTH_STATE.pinnedCommentId =
      STORY_GROWTH_STATE.pinnedCommentId === sid ? null : sid;
    syncGrowthIconSelection(root);
    renderStoryCommentDetailPanel();
  });

  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const t = /** @type {HTMLElement} */ (ev.target);
    if (!t.matches('img.nl-story-growth-icon')) return;
    ev.preventDefault();
    t.click();
  });

  root.addEventListener('pointerover', (ev) => {
    if (!storyHoverPreviewEnabled()) return;
    if (STORY_GROWTH_STATE.pinnedCommentId) return;
    updateStoryHoverPointerFromEvent(ev);
    const el = ev.target;
    const img =
      el instanceof Element ? el.closest('img.nl-story-growth-icon') : null;
    if (!img || !root.contains(img)) return;
    const sid = img.getAttribute('data-comment-id');
    if (!sid) return;
    cancelStoryHoverClearTimer();
    STORY_GROWTH_STATE.hoverPreviewCommentId = sid;
    updateStoryHoverAnchorFromElement(img);
    renderStoryCommentDetailPanel();
  });

  root.addEventListener('pointermove', (ev) => {
    if (!storyHoverPreviewEnabled()) return;
    if (STORY_GROWTH_STATE.pinnedCommentId) return;
    updateStoryHoverPointerFromEvent(ev);
    const el = ev.target;
    const img =
      el instanceof Element ? el.closest('img.nl-story-growth-icon') : null;
    if (!img || !root.contains(img)) return;
    const sid = img.getAttribute('data-comment-id');
    if (!sid || STORY_GROWTH_STATE.hoverPreviewCommentId !== sid) return;
    updateStoryHoverAnchorFromElement(img);
    renderStoryCommentDetailPanel();
  });

  root.addEventListener('pointerout', (ev) => {
    if (!storyHoverPreviewEnabled()) return;
    if (STORY_GROWTH_STATE.pinnedCommentId) return;
    updateStoryHoverPointerFromEvent(ev);
    const el = ev.target;
    const img =
      el instanceof Element ? el.closest('img.nl-story-growth-icon') : null;
    if (!img || !root.contains(img)) return;
    const rel = ev.relatedTarget;
    if (rel instanceof Element) {
      if (rel.closest?.('img.nl-story-growth-icon') && root.contains(rel)) return;
      if ($('sceneStoryDetail')?.contains(rel)) return;
    }
    scheduleStoryHoverClear();
  });
}

function clearStoryGrowthTimer() {
  if (!STORY_GROWTH_STATE.timer) return;
  clearTimeout(STORY_GROWTH_STATE.timer);
  STORY_GROWTH_STATE.timer = null;
}

/** @param {number} count */
function resolveStoryIconSize(count) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const compact =
    document.body?.classList.contains('nl-compact') ||
    document.body?.classList.contains('nl-tight');
  if (INLINE_MODE) {
    if (total <= 20) return 40;
    if (total <= 80) return 34;
    if (total <= 200) return 30;
    if (total <= 500) return 26;
    if (total <= 1200) return 22;
    if (total <= 3000) return 18;
    if (total <= 6000) return 14;
    return 12;
  }
  if (compact) {
    if (total <= 18) return 16;
    if (total <= 120) return 12;
    return 10;
  }
  if (total <= 18) return 18;
  if (total <= 140) return 13;
  return 10;
}

/**
 * 応援アイコン・詳細パネル共通の表示名（自分投稿＋ヘッダー表示名を反映）
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} [liveId]
 */
function storyGrowthDisplayLabel(entry, liveId) {
  if (!entry) return '';
  const userId = String(entry.userId || '').trim();
  const nickname = String(entry.nickname || '').trim();
  const userKey = userId || UNKNOWN_USER_KEY;
  const lid = String(liveId || STORY_SOURCE_STATE.liveId || '');
  const ownPosted = isOwnPostedSupportComment(entry, lid);
  const snap = watchMetaCache.snapshot;
  const viewerNick = String(snap?.viewerNickname || '').trim();
  const viewerUid = String(snap?.viewerUserId || '').trim();
  if (ownPosted) {
    if (userId) return displayUserLabel(userId, nickname || viewerNick);
    if (viewerUid) return displayUserLabel(viewerUid, nickname || viewerNick);
    if (viewerNick) return viewerNick;
    return '自分（このブラウザで送信したコメント）';
  }
  if (!userId && nickname) return nickname;
  return displayUserLabel(userKey, nickname);
}

/**
 * @param {HTMLImageElement} img
 * @param {number} index
 * @param {boolean} isNew
 */
function storyGrowthImgAssignSrc(img, nextSrc) {
  const next = String(nextSrc || '').trim();
  if (!next) {
    if (!img.hasAttribute('src')) return;
    img.removeAttribute('src');
    return;
  }
  const attr = img.getAttribute('src');
  if (attr === next) return;
  try {
    const resolvedNext = new URL(next, document.baseURI).href;
    if (img.src === resolvedNext) return;
  } catch {
    /* 相対パス等で解決できないときは従来どおり代入 */
  }
  img.src = next;
}

function applyStoryGrowthIconAttributes(img, index, isNew) {
  const entry = getStoryEntryByIndex(index);
  const stable = commentStableId(entry);
  const selected = Boolean(stable && STORY_GROWTH_STATE.pinnedCommentId === stable);

  img.className = isNew ? 'nl-story-growth-icon is-new' : 'nl-story-growth-icon';
  if (selected) img.classList.add('is-selected');
  const requestedTile = storyGrowthTileSrcForEntry(entry, STORY_SOURCE_STATE.liveId);
  const displayTile = storyAvatarLoadGuard.pickDisplaySrc(requestedTile);
  storyGrowthImgAssignSrc(img, displayTile);
  storyAvatarLoadGuard.noteRemoteAttempt(img, requestedTile);
  img.classList.toggle(
    'nl-story-growth-icon--tv-fallback',
    storyTileUsesYukkuriTvStyle(requestedTile, displayTile)
  );
  if (isHttpOrHttpsUrl(img.src)) {
    img.referrerPolicy = 'no-referrer';
    img.classList.add('nl-story-growth-icon--remote');
  } else {
    img.removeAttribute('referrerpolicy');
    img.classList.remove('nl-story-growth-icon--remote');
  }

  const entries = STORY_SOURCE_STATE.entries;
  const storyKey = entry ? supportUserKeyFromEntry(entry) : UNKNOWN_USER_KEY;
  const ordinal = supportOrdinalForIndex(entries, index);
  img.classList.remove('nl-story-growth-icon--user-accent');

  const cell = img.closest('.nl-story-growth-cell');
  if (cell instanceof HTMLElement) {
    cell.style.removeProperty('--nl-user-accent');
    cell.classList.remove('nl-story-growth-cell--accent');
    cell.classList.remove('nl-story-growth-cell--user-accent');
    if (ordinal > 1) {
      cell.classList.add('nl-story-growth-cell--repeat');
      cell.setAttribute('data-support-ordinal', String(ordinal));
    } else {
      cell.classList.remove('nl-story-growth-cell--repeat');
      cell.removeAttribute('data-support-ordinal');
    }
    cell.classList.toggle('nl-story-growth-cell--selected', selected);
  }

  const userLabel = storyGrowthDisplayLabel(entry, STORY_SOURCE_STATE.liveId);
  const text = truncateText(entry?.text || '', 26);
  img.setAttribute('data-comment-index', String(index));
  if (stable) img.setAttribute('data-comment-id', stable);
  else img.removeAttribute('data-comment-id');
  img.setAttribute('role', 'button');
  img.setAttribute('tabindex', '0');
  const hoverHint = storyHoverPreviewEnabled()
    ? 'マウスを乗せるとプレビュー、'
    : '';
  const totalSame = supportSameUserTotalInEntries(entries, storyKey);
  const sameUserBlurb =
    entry && totalSame > 1
      ? `同一ユーザー${ordinal}件目、一覧に同ユーザー計${totalSame}件。`
      : '';
  img.setAttribute(
    'aria-label',
    entry
      ? `${index + 1}件目 ${userLabel} ${text || 'コメント'}。${sameUserBlurb}${hoverHint}Enter または Space で詳細の固定・解除`
      : `${index + 1}件目のコメント`
  );
  img.title = entry
    ? `#${entry.commentNo || '-'} ${userLabel}（${sameUserBlurb}${hoverHint}クリックで詳細）`
    : `${index + 1}件目`;
  img.alt = '';
}

/**
 * @param {boolean} isNew
 * @param {number} index
 */
function createStoryGrowthCell(isNew, index) {
  const cell = document.createElement('span');
  cell.className = 'nl-story-growth-cell';
  const media = document.createElement('span');
  media.className = 'nl-story-growth-cell__media';
  const img = document.createElement('img');
  media.appendChild(img);
  cell.appendChild(media);
  applyStoryGrowthIconAttributes(img, index, isNew);
  return cell;
}

/**
 * innerHTML を捨てずにコメント内容だけ追従（代表88件で更新のたび全消ししない）
 * @param {HTMLElement} root
 * @param {{ pulseLast?: boolean }} [opts]
 */
function patchStoryGrowthIconsFromSource(root, opts = {}) {
  const n = STORY_GROWTH_STATE.renderedCount;
  const imgs = root.querySelectorAll('img.nl-story-growth-icon');
  if (imgs.length !== n) {
    rebuildStoryGrowth(root, n);
    return;
  }
  for (let i = 0; i < n; i += 1) {
    applyStoryGrowthIconAttributes(/** @type {HTMLImageElement} */ (imgs[i]), i, false);
  }
  if (opts.pulseLast && n > 0) {
    const last = /** @type {HTMLImageElement} */ (imgs[n - 1]);
    last.classList.remove('is-new');
    void last.offsetWidth;
    last.classList.add('is-new');
    window.setTimeout(() => last.classList.remove('is-new'), 820);
  }
}

/**
 * @param {HTMLElement} root
 * @param {number} total
 */
function rebuildStoryGrowth(root, total) {
  root.innerHTML = '';
  if (total <= 0) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < total; i += 1) {
    frag.appendChild(createStoryGrowthCell(false, i));
  }
  root.appendChild(frag);
}

/**
 * @param {string} liveId
 * @param {number} count
 * @param {HTMLElement|null} root
 */
function syncStoryGrowth(liveId, count, root) {
  const nextLiveId = String(liveId || '');
  const targetFull = Math.max(0, Math.floor(Number(count) || 0));
  const target = targetFull;
  const changedLive = STORY_GROWTH_STATE.liveId !== nextLiveId;
  const changedRoot = STORY_GROWTH_STATE.root !== root;

  if (changedLive || changedRoot) {
    clearStoryGrowthTimer();
    if (changedLive) {
      storyAvatarLoadGuard.clearFailedUrls();
    }
    STORY_GROWTH_STATE.liveId = nextLiveId;
    STORY_GROWTH_STATE.renderedCount = 0;
    STORY_GROWTH_STATE.targetCount = 0;
    STORY_GROWTH_STATE.sourceSig = '';
    STORY_GROWTH_STATE.root = root;
    if (root) root.innerHTML = '';
  }

  STORY_GROWTH_STATE.root = root;
  STORY_GROWTH_STATE.targetCount = target;

  if (!root) return;
  bindStoryGrowthInteractions(root);
  ensureStoryGrowthColorSchemeListener();

  const iconPx = `${resolveStoryIconSize(target)}px`;
  const storyBody = root.closest('.nl-story-body');
  if (storyBody instanceof HTMLElement) {
    storyBody.style.setProperty('--nl-story-icon-size', iconPx);
  } else {
    root.style.setProperty('--nl-story-icon-size', iconPx);
  }

  if (STORY_GROWTH_STATE.renderedCount > STORY_GROWTH_STATE.targetCount) {
    STORY_GROWTH_STATE.renderedCount = STORY_GROWTH_STATE.targetCount;
    rebuildStoryGrowth(root, STORY_GROWTH_STATE.renderedCount);
  }

  const tgt = STORY_GROWTH_STATE.targetCount;
  const rnd = STORY_GROWTH_STATE.renderedCount;
  /*
   * 以前は setTimeout で1セルずつ追加していたが、開いた直後に「滝」のように見えるため、
   * 件数が足りないときは常に一括で rebuild する（差分が1件だけでもタイマー列は使わない）。
   */
  if (rnd < tgt && tgt > 0) {
    clearStoryGrowthTimer();
    rebuildStoryGrowth(root, tgt);
    STORY_GROWTH_STATE.renderedCount = tgt;
    patchStoryGrowthIconsFromSource(root, { pulseLast: true });
    STORY_GROWTH_STATE.sourceSig = storySourceSignature();
  }

  const nextSig = storySourceSignature();
  const needSourceSync =
    STORY_GROWTH_STATE.renderedCount > 0 &&
    STORY_GROWTH_STATE.renderedCount === STORY_GROWTH_STATE.targetCount &&
    nextSig !== STORY_GROWTH_STATE.sourceSig;
  STORY_GROWTH_STATE.sourceSig = nextSig;
  if (needSourceSync) {
    patchStoryGrowthIconsFromSource(root, { pulseLast: true });
  }

  if (STORY_GROWTH_STATE.renderedCount === 0 && root.childElementCount > 0) {
    root.innerHTML = '';
  }
}

/**
 * @param {string} liveId
 * @param {number} commentCount
 * @returns {{ count: number, delta: number, reaction: 'idle'|'pulse'|'burst'|'sparkle' }}
 */
function computeStoryReaction(liveId, commentCount) {
  const count = Math.max(0, Number(commentCount) || 0);
  const nextLiveId = String(liveId || '');
  if (STORY_REACTION_STATE.liveId !== nextLiveId) {
    STORY_REACTION_STATE.liveId = nextLiveId;
    STORY_REACTION_STATE.lastCount = count;
    return { count, delta: 0, reaction: 'idle' };
  }

  const prev = STORY_REACTION_STATE.lastCount;
  STORY_REACTION_STATE.lastCount = count;
  if (!Number.isFinite(prev) || prev == null || count <= prev) {
    return { count, delta: 0, reaction: 'idle' };
  }

  const delta = count - prev;
  if (delta >= 20 || count % 20 === 0) {
    return { count, delta, reaction: 'sparkle' };
  }
  if (delta >= 5 || count % 5 === 0) {
    return { count, delta, reaction: 'burst' };
  }
  return { count, delta, reaction: 'pulse' };
}

/**
 * @param {{
 *   hasWatch: boolean,
 *   recording: boolean,
 *   commentCount: number,
 *   liveId: string,
 *   snapshot: WatchPageSnapshot|null
 * }} state
 */
function renderCharacterScene(state) {
  const { hasWatch, recording, commentCount, liveId, snapshot } = state;
  const roleCopy = '1コメントごとに、りんくが1体ずつ増えるよ。';

  if (!hasWatch) {
    STORY_REACTION_STATE.liveId = '';
    STORY_REACTION_STATE.lastCount = 0;
    syncStorySourceEntries('', []);
    setSceneStory(
      'りんくがみんなの応援コメントを集める準備中だよ。',
      recording
        ? `記録はON。watchページが開いたら応援コメントの可視化を始めるよ。${roleCopy}`
        : `watchページを開いたら、りんくが応援コメントの可視化を始めるよ。${roleCopy}`,
      {
        liveId: '',
        delta: 0,
        reaction: 'idle',
        count: 0
      }
    );
    return;
  }

  const title = truncateText(snapshot?.broadcastTitle || '', 25);
  const caster = truncateText(snapshot?.broadcasterName || '', 18);
  const tags = Array.isArray(snapshot?.tags)
    ? snapshot.tags.filter((v) => String(v || '').trim()).slice(0, 2)
    : [];

  const reaction = computeStoryReaction(liveId, commentCount);

  if (recording && commentCount <= 0) {
    setSceneStory(
      'りんくがみんなの応援コメントを集めています',
      `「${title || liveId || '放送'}」を開いたままにしてね。数字がすぐ増えないときは、右のコメント一覧が仮想スクロールのため少し待つか、一覧を少しスクロールすると取り込みやすいよ。${roleCopy}`,
      {
        liveId,
        delta: 0,
        reaction: 'idle',
        count: reaction.count,
        faceSrc: STORY_RINK_COLLECTING_JPG
      }
    );
    return;
  }

  const countLabel = reaction.count.toLocaleString('ja-JP');
  setSceneStory(
    'りんくがみんなの応援コメントを集めているよ！',
    recording
      ? `いま ${countLabel} コメント。${reaction.delta > 0 ? `応援が +${reaction.delta} コメント増えたよ。` : `「${title || liveId || '放送'}」を見守っているよ。`} ${roleCopy}`
      : `記録OFF。ONにすると「${title || liveId || '放送'}」の応援コメントを可視化できるよ。${caster ? ` 配信者: ${caster}。` : ''}${tags.length ? ` タグ: ${tags.join(' / ')}。` : ''}${roleCopy}`,
    {
      liveId,
      delta: reaction.delta,
      reaction: reaction.reaction,
      count: reaction.count
    }
  );
}

function clearWatchMetaCard() {
  const wrap = $('watchMeta');
  const title = $('watchTitle');
  const broadcaster = $('watchBroadcaster');
  const thumb = /** @type {HTMLImageElement} */ ($('watchThumb'));
  const tags = $('watchTags');
  const audience = $('watchAudience');
  const viewerDomEl = $('watchViewerDom');
  const concurrentEstEl = $('watchConcurrentEst');
  const concurrentSubEl = $('watchConcurrentSub');
  const concurrentLoadingEl = $('watchConcurrentLoading');
  const concurrentReadyEl = $('watchConcurrentReady');
  const concurrentCard = /** @type {HTMLElement|null} */ ($('watchConcurrentCard'));
  const uniqueEl = $('watchUniqueUsers');
  const noIdEl = $('watchCommentsNoId');
  const noteEl = $('watchAudienceNote');
  if (!wrap || !title || !broadcaster || !thumb || !tags) return;
  if (concurrentLoadingEl) concurrentLoadingEl.hidden = true;
  if (concurrentReadyEl) concurrentReadyEl.hidden = false;
  if (concurrentCard) concurrentCard.removeAttribute('aria-busy');
  wrap.hidden = true;
  title.textContent = '-';
  broadcaster.textContent = '-';
  thumb.hidden = true;
  thumb.removeAttribute('src');
  tags.innerHTML = '';
  if (audience) audience.hidden = true;
  if (viewerDomEl) viewerDomEl.textContent = '—';
  if (concurrentEstEl) {
    concurrentEstEl.textContent = '—';
    concurrentEstEl.removeAttribute('title');
  }
  if (concurrentSubEl) concurrentSubEl.textContent = '人';
  if (uniqueEl) {
    uniqueEl.textContent = '—';
    uniqueEl.removeAttribute('title');
  }
  if (noIdEl) noIdEl.textContent = '—';
  if (noteEl) {
    noteEl.textContent = '';
    noteEl.removeAttribute('title');
  }
}

let _prevConcurrentEstimated = /** @type {number|null} */ (null);
let _prevViewerCount = /** @type {number|null} */ (null);

/**
 * @param {WatchPageSnapshot|null} snapshot
 * @param {PopupCommentEntry[]} [commentEntries]
 */
function renderWatchMetaCard(snapshot, commentEntries = []) {
  const wrap = $('watchMeta');
  const title = $('watchTitle');
  const broadcaster = $('watchBroadcaster');
  const thumb = /** @type {HTMLImageElement} */ ($('watchThumb'));
  const tags = $('watchTags');
  const audience = $('watchAudience');
  const viewerDomEl = $('watchViewerDom');
  const concurrentEstEl = $('watchConcurrentEst');
  const concurrentSubEl = $('watchConcurrentSub');
  const concurrentLoadingEl = $('watchConcurrentLoading');
  const concurrentReadyEl = $('watchConcurrentReady');
  const concurrentCard = /** @type {HTMLElement|null} */ ($('watchConcurrentCard'));
  const uniqueEl = $('watchUniqueUsers');
  const noIdEl = $('watchCommentsNoId');
  const noteEl = $('watchAudienceNote');
  if (!wrap || !title || !broadcaster || !thumb || !tags) return;
  if (!snapshot) {
    clearWatchMetaCard();
    return;
  }

  const titleText = String(snapshot.broadcastTitle || snapshot.title || '-').trim() || '-';
  const broadcasterText = String(snapshot.broadcasterName || '-').trim() || '-';
  const tagList = Array.isArray(snapshot.tags)
    ? snapshot.tags.filter((v) => String(v || '').trim()).slice(0, 10)
    : [];

  title.textContent = titleText;
  broadcaster.textContent = broadcasterText;
  tags.innerHTML = '';
  for (const tag of tagList) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = tag;
    tags.appendChild(chip);
  }

  const thumbnail = String(snapshot.thumbnailUrl || '').trim();
  if (thumbnail) {
    thumb.src = thumbnail;
    thumb.hidden = false;
  } else {
    thumb.hidden = true;
    thumb.removeAttribute('src');
  }

  const vc = snapshot.viewerCountFromDom;
  if (viewerDomEl) {
    viewerDomEl.textContent =
      typeof vc === 'number' && Number.isFinite(vc) && vc >= 0
        ? String(vc)
        : '—';
  }
  if (typeof vc === 'number' && Number.isFinite(vc) && vc >= 0) {
    if (_prevViewerCount != null && vc > _prevViewerCount) {
      const visitorsCard = viewerDomEl?.closest('.nl-live-stat-card');
      const icon = visitorsCard?.querySelector('.nl-live-stat-icon');
      triggerCharaReaction(icon ?? null, {
        delta: vc - _prevViewerCount,
        thresholds: [1, 10, 50],
        images: TANUNEE_IMGS,
      });
    }
    _prevViewerCount = vc;
  }
  const recentActive = typeof snapshot.recentActiveUsers === 'number'
    ? snapshot.recentActiveUsers
    : 0;
  if (concurrentEstEl) {
    const nowMs = Date.now();
    const { showConcurrent, sparseConcurrent } = watchMetaConcurrentGateFromSnapshot(snapshot);
    // showConcurrent が false のときは下の else でスピナー継続（aria-busy）。
    // 条件は popupWatchMetaConcurrentGate.js / popupConcurrentEstimateGate.js の単体テストを参照。
    if (showConcurrent) {
      if (concurrentLoadingEl) concurrentLoadingEl.hidden = true;
      if (concurrentReadyEl) concurrentReadyEl.hidden = false;
      if (concurrentCard) concurrentCard.removeAttribute('aria-busy');
      const streamAge = typeof snapshot.streamAgeMin === 'number' && snapshot.streamAgeMin >= 0
        ? snapshot.streamAgeMin : undefined;
      const resolved = resolveConcurrentViewers({
        nowMs,
        officialViewers:
          typeof snapshot.officialViewerCount === 'number' &&
          Number.isFinite(snapshot.officialViewerCount)
            ? snapshot.officialViewerCount
            : undefined,
        officialUpdatedAtMs:
          typeof snapshot.officialStatsUpdatedAt === 'number' &&
          Number.isFinite(snapshot.officialStatsUpdatedAt)
            ? snapshot.officialStatsUpdatedAt
            : undefined,
        officialViewerIntervalMs:
          typeof snapshot.officialViewerIntervalMs === 'number' &&
          Number.isFinite(snapshot.officialViewerIntervalMs) &&
          snapshot.officialViewerIntervalMs > 0
            ? snapshot.officialViewerIntervalMs
            : undefined,
        previousStatisticsComments:
          typeof snapshot.officialCommentCount === 'number' &&
          Number.isFinite(snapshot.officialCommentCount) &&
          typeof snapshot.officialStatisticsCommentsDelta === 'number' &&
          Number.isFinite(snapshot.officialStatisticsCommentsDelta)
            ? Math.max(0, snapshot.officialCommentCount - snapshot.officialStatisticsCommentsDelta)
            : undefined,
        currentStatisticsComments:
          typeof snapshot.officialCommentCount === 'number' &&
          Number.isFinite(snapshot.officialCommentCount)
            ? snapshot.officialCommentCount
            : undefined,
        receivedCommentsDelta:
          typeof snapshot.officialReceivedCommentsDelta === 'number' &&
          Number.isFinite(snapshot.officialReceivedCommentsDelta)
            ? snapshot.officialReceivedCommentsDelta
            : undefined,
        recentActiveUsers: recentActive,
        totalVisitors: typeof vc === 'number' && vc > 0 ? vc : undefined,
        streamAgeMin: streamAge
      });
      const directLike = resolved.method === 'official';
      concurrentEstEl.textContent = `${directLike ? '' : '~'}${resolved.estimated}`;

      if (
        _prevConcurrentEstimated != null &&
        resolved.estimated !== _prevConcurrentEstimated &&
        concurrentCard
      ) {
        const icon = concurrentCard.querySelector('.nl-live-stat-icon');
        triggerCharaReaction(icon, {
          delta: Math.abs(resolved.estimated - _prevConcurrentEstimated),
          thresholds: [1, 20, 100],
          images: KONTA_IMGS,
        });
      }
      _prevConcurrentEstimated = resolved.estimated;

      /** @type {string[]} */
      const parts = [];
      parts.push(concurrentResolutionMethodTitlePart(resolved.method));
      if (resolved.freshnessMs != null) {
        parts.push(`更新 ${Math.round(resolved.freshnessMs / 1000)} 秒前`);
      }
      if (resolved.captureRatio != null) {
        parts.push(`コメント捕捉率 ${Math.round(resolved.captureRatio * 100)}%`);
      }
      if (
        typeof snapshot.officialCommentSampleWindowMs === 'number' &&
        Number.isFinite(snapshot.officialCommentSampleWindowMs) &&
        snapshot.officialCommentSampleWindowMs > 0
      ) {
        parts.push(`窓 ${Math.round(snapshot.officialCommentSampleWindowMs / 1000)} 秒`);
      }
      const base = resolved.base;
      if (resolved.method !== 'official') {
        const baseMethod =
          base.method === 'combined'
            ? '複合'
            : base.method === 'retention_only'
              ? '滞留'
              : base.method === 'active_only'
                ? 'コメ率'
                : '欠測';
        parts.push(`${base.activeCommenters}人×${base.multiplier}≈${base.signalA}`);
        if (base.signalB > 0) parts.push(`滞留${base.retentionPct}%≈${base.signalB}`);
        parts.push(`base:${baseMethod}`);
      }
      parts.push(`信頼度 ${Math.round(resolved.confidence * 100)}%`);
      if (sparseConcurrent) {
        parts.push(SPARSE_CONCURRENT_ESTIMATE_NOTE);
      }
      concurrentEstEl.title = parts.join(' | ');
      if (concurrentSubEl) {
        if (resolved.method === 'official') {
          concurrentSubEl.textContent = '直接値';
        } else if (resolved.method === 'nowcast') {
          concurrentSubEl.textContent =
            resolved.freshnessMs != null
              ? `${Math.round(resolved.freshnessMs / 1000)}秒前から補間`
              : '補間';
        } else if (base.method === 'combined') {
          concurrentSubEl.textContent =
            `${base.activeCommenters}人×${base.multiplier} + 滞留${base.retentionPct}%`;
        } else {
          concurrentSubEl.textContent = `5分内 ${base.activeCommenters}人×${base.multiplier}`;
        }
      }
    } else {
      if (concurrentLoadingEl) concurrentLoadingEl.hidden = false;
      if (concurrentReadyEl) concurrentReadyEl.hidden = true;
      if (concurrentCard) concurrentCard.setAttribute('aria-busy', 'true');
      concurrentEstEl.textContent = '';
      concurrentEstEl.removeAttribute('title');
      if (concurrentSubEl) concurrentSubEl.textContent = '';
    }
  }
  const st = summarizeRecordedCommenters(
    Array.isArray(commentEntries) ? commentEntries : []
  );
  if (uniqueEl) {
    if (st.uniqueKnownUserIds > 0) {
      uniqueEl.textContent = String(st.uniqueKnownUserIds);
      uniqueEl.title = 'userId が取れたコメントについての distinct 数';
    } else if (st.distinctAvatarUrls > 0) {
      uniqueEl.textContent = `≈${st.distinctAvatarUrls}`;
      uniqueEl.title =
        'userId 未取得のため、記録された https アイコン URL の種類数を参考表示（重複アイコンは1にまとまります）';
    } else {
      uniqueEl.textContent = '0';
      uniqueEl.title =
        'userId も有効な avatarUrl も無いコメントのみのときは 0 のままです';
    }
  }
  if (noIdEl) noIdEl.textContent = String(st.commentsWithoutUserId);
  if (noteEl) {
    const { body, title } = buildWatchAudienceNote({ snapshot });
    noteEl.textContent = body;
    noteEl.title = title;
  }
  if (audience) audience.hidden = false;

  wrap.hidden = false;
}

/** @param {string} viewerLiveId 現在表示中の lv（小文字想定）・無ければ空 */
function applyStorageErrorBannerFromBag(bag, viewerLiveId = '') {
  const banner = $('storageErrorBanner');
  const detail = $('storageErrorDetail');
  if (!banner || !detail) return;

  const raw = bag[KEY_STORAGE_WRITE_ERROR];
  if (
    raw &&
    typeof raw === 'object' &&
    'at' in raw &&
    typeof /** @type {{ at: unknown }} */ (raw).at === 'number'
  ) {
    const err = /** @type {{ at: number; liveId?: string; message?: string }} */ (raw);
    if (!storageErrorRelevantToLiveId(err, viewerLiveId)) {
      banner.classList.remove('is-visible');
      detail.textContent = '';
      return;
    }
    banner.classList.add('is-visible');
    const parts = [];
    if (err.liveId) parts.push(`放送: ${String(err.liveId)}`);
    if (err.message) parts.push(String(err.message));
    detail.textContent = parts.length ? `（${parts.join(' / ')}）` : '';
  } else {
    banner.classList.remove('is-visible');
    detail.textContent = '';
  }
}

/** @param {string} viewerLiveId */
function applyCommentHarvestBannerFromBag(bag, viewerLiveId = '') {
  const banner = $('commentHarvestBanner');
  const detail = $('commentHarvestBannerDetail');
  if (!banner || !detail) return;

  const payload = parseCommentPanelStatusPayload(bag[KEY_COMMENT_PANEL_STATUS]);
  if (
    payload &&
    commentPanelStatusRelevantToLiveId(payload, viewerLiveId)
  ) {
    banner.removeAttribute('hidden');
    const parts = [];
    if (payload.liveId) parts.push(`放送: ${String(payload.liveId)}`);
    if (payload.code) parts.push(String(payload.code));
    detail.textContent = parts.length ? `（${parts.join(' / ')}）` : '';
  } else {
    banner.setAttribute('hidden', '');
    detail.textContent = '';
  }
}

/**
 * @param {number} totalRecent
 * @param {number} activeUsers
 * @param {number} heatPercent
 * @param {string} heatText
 */
function renderRoomHeatSummary(totalRecent, activeUsers, heatPercent, heatText) {
  const summary = /** @type {HTMLElement|null} */ ($('roomHeatSummary'));
  const meta = $('roomHeatMeta');
  const fill = /** @type {HTMLElement|null} */ ($('roomHeatFill'));
  const note = $('roomHeatNote');
  if (!summary || !meta || !fill || !note) return;
  summary.hidden = false;
  meta.textContent = `+${totalRecent}件 / ${activeUsers}人`;
  fill.style.width = `${Math.max(0, Math.min(100, Number(heatPercent) || 0)).toFixed(2)}%`;
  note.textContent = `${heatText}（この5分で増えた件数）`;
}

/**
 * 応援カード直下に、上位ユーザーの順位・件数・サムネ・ID・表示名を出す（記録コメントの集計）。
 * @param {{ userKey: string, nickname: string, count: number, avatarUrl?: string }[]} stripRooms
 */
function renderTopSupportRankStrip(stripRooms) {
  const strip = /** @type {HTMLElement|null} */ ($('topSupportRankStrip'));
  if (!strip) return;
  if (!stripRooms.length) {
    strip.hidden = true;
    strip.innerHTML = '';
    strip.setAttribute('aria-hidden', 'true');
    return;
  }
  strip.hidden = false;
  strip.removeAttribute('aria-hidden');
  strip.setAttribute(
    'aria-label',
    '記録した応援コメントをユーザー別に数えた件数の多い順'
  );
  const rankScheme = getStoryColorScheme();
  const models = topSupportRankLineModels(stripRooms, {
    defaultThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
    anonymousFallbackThumbSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
    colorScheme: rankScheme
  });
  const html = models
    .map((m) => {
      const placeHtml =
        m.placeNumber != null
          ? `<span class="nl-top-support-rank__place" aria-hidden="true">${m.placeNumber}</span>`
          : `<span class="nl-top-support-rank__place nl-top-support-rank__place--empty" aria-hidden="true"></span>`;
      const full = escapeAttr(m.fullLabelForTitle);
      const displayThumb = storyAvatarLoadGuard.pickDisplaySrc(m.thumbSrc);
      const thumbRp = isHttpOrHttpsUrl(displayThumb)
        ? ' referrerpolicy="no-referrer"'
        : '';
      const idText = escapeHtml(m.idShort);
      const nameText = escapeHtml(m.nameLine);
      const idTitle = m.isUnknown ? '' : escapeAttr(m.idTitle);
      let lineClass = `nl-top-support-rank__line${m.isUnknown ? ' nl-top-support-rank__line--unknown' : ''}`;
      let lineStyle = '';
      if (m.hasAccent && m.accentColorCss) {
        lineClass += ' nl-top-support-rank__line--has-accent';
        lineStyle = ` style="--nl-rank-accent:${escapeAttr(m.accentColorCss)}"`;
      }
      return `<div class="${lineClass}"${lineStyle} role="listitem" title="${full}">
        ${placeHtml}
        <span class="nl-top-support-rank__count">${m.count}件</span>
        <span class="nl-top-support-rank__thumb-wrap">
          <img class="nl-top-support-rank__thumb" src="${escapeAttr(displayThumb)}" alt="" decoding="async"${thumbRp} />
        </span>
        <span class="nl-top-support-rank__id" title="${idTitle}">${idText}</span>
        <span class="nl-top-support-rank__name">${nameText}</span>
      </div>`;
    })
    .join('');
  strip.innerHTML = `<p class="nl-top-support-rank__note">記録内・ユーザー別の応援件数が多い順です。</p><div class="nl-top-support-rank__list" role="list">${html}</div>`;
  const thumbs = strip.querySelectorAll('img.nl-top-support-rank__thumb');
  models.forEach((m, i) => {
    const img = thumbs[i];
    if (!(img instanceof HTMLImageElement)) return;
    if (isHttpOrHttpsUrl(m.thumbSrc)) {
      storyAvatarLoadGuard.noteRemoteAttempt(img, m.thumbSrc);
    }
  });
}

/**
 * @param {PopupCommentEntry[]} entries
 * @param {string} [liveId] ランキングストリップの再描画キー用
 */
function renderUserRooms(entries, liveId = '') {
  const ul = /** @type {HTMLUListElement} */ ($('userRoomList'));
  if (!ul) return;

  const list = Array.isArray(entries) ? entries : [];
  const latestAt = list.reduce((max, e) => {
    const at = Number(e?.capturedAt || 0);
    return at > max ? at : max;
  }, 0);
  const recentWindowMs = 5 * 60 * 1000;
  const recentThreshold = latestAt > 0 ? latestAt - recentWindowMs : Infinity;
  /** @type {Map<string, number>} */
  const recentMap = new Map();
  for (const e of list) {
    const at = Number(e?.capturedAt || 0);
    if (at <= 0 || at < recentThreshold) continue;
    const uid = e?.userId ? String(e.userId).trim() : '';
    const userKey = uid || UNKNOWN_USER_KEY;
    recentMap.set(userKey, (recentMap.get(userKey) || 0) + 1);
  }
  const recentCounts = Array.from(recentMap.values());
  const totalRecent = recentCounts.reduce((sum, v) => sum + v, 0);
  const activeUsers = recentCounts.filter((v) => v > 0).length;
  const heatPercent = totalRecent > 0 ? Math.min(100, Math.log10(totalRecent + 1) * 38) : 0;
  const heatText =
    totalRecent >= 50
      ? '増加がとても大きい'
      : totalRecent >= 20
        ? '増加が大きい'
        : totalRecent >= 5
          ? '増加あり'
          : '増加は少なめ';
  renderRoomHeatSummary(totalRecent, activeUsers, heatPercent, heatText);

  const rooms = aggregateCommentsByUser(list);
  ul.innerHTML = '';

  if (!rooms.length) {
    _lastTopSupportRankStripStableKey = null;
    renderTopSupportRankStrip([]);
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = 'まだコメントがありません';
    ul.appendChild(li);
    return;
  }

  const rankedRooms = rooms
    .map((room) => ({
      ...room,
      recentCount: recentMap.get(room.userKey) || 0
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const uidA = a.userKey === UNKNOWN_USER_KEY ? '' : a.userKey;
      const uidB = b.userKey === UNKNOWN_USER_KEY ? '' : b.userKey;
      const scoreA = userLaneResolvedThumbScore(uidA, a.avatarUrl);
      const scoreB = userLaneResolvedThumbScore(uidB, b.avatarUrl);
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount;
      return b.lastAt - a.lastAt;
    });

  const denseLayout =
    document.body?.classList.contains('nl-tight') ||
    document.body?.classList.contains('nl-compact');
  const compactRooms = !INLINE_MODE;
  const MAX_VISIBLE_ROOMS = compactRooms ? 1 : denseLayout ? 2 : 3;
  const stripSlice = rankedRooms.slice(0, TOP_SUPPORT_RANK_STRIP_MAX);
  const stripKey = topSupportRankStripStableKey(liveId, list.length, stripSlice);
  if (stripKey !== _lastTopSupportRankStripStableKey) {
    _lastTopSupportRankStripStableKey = stripKey;
    renderTopSupportRankStrip(stripSlice);
  }
  const visibleRooms = rankedRooms.slice(0, MAX_VISIBLE_ROOMS);
  const maxTotal = Math.max(1, ...visibleRooms.map((v) => v.count));
  const maxRecent = Math.max(1, ...visibleRooms.map((v) => v.recentCount));

  for (const r of visibleRooms) {
    const li = document.createElement('li');
    li.classList.add('room-card');
    const label = displayUserLabel(r.userKey, r.nickname);
    const isUnknown = r.userKey === UNKNOWN_USER_KEY;
    const uidForThumb = isUnknown ? '' : r.userKey;
    const thumbSrc = pickSupportGrowthFallbackTileSrc(
      uidForThumb,
      r.avatarUrl,
      STORY_GRID_DEFAULT_TILE_IMG,
      STORY_REMOTE_FAILED_PLACEHOLDER_IMG
    );
    const displayThumb = storyAvatarLoadGuard.pickDisplaySrc(thumbSrc);
    const thumbRp = isHttpOrHttpsUrl(displayThumb)
      ? ' referrerpolicy="no-referrer"'
      : '';
    const avatarHtml = `<img class="nl-ticker-latest__avatar room-card__avatar" alt="" src="${escapeAttr(displayThumb)}" decoding="async"${thumbRp}>`;
    const totalPercent = Math.max(6, Math.min(100, (r.count / maxTotal) * 100));
    const recentPercent =
      r.recentCount > 0 ? Math.max(4, Math.min(100, (r.recentCount / maxRecent) * 100)) : 0;
    const deltaLabel = r.recentCount > 0 ? `+${r.recentCount} / 5分` : '±0 / 5分';
    const hint = isUnknown
      ? '<div class="room-hint">投稿者ID未取得のコメントをここにまとめています。</div>'
      : '';
    li.innerHTML = compactRooms
      ? `
      <div class="room-card__row">
        ${avatarHtml}
        <div class="room-main">
          <div class="room-name-row">
            <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
          </div>
          ${r.lastText ? `<div class="room-preview">${escapeHtml(r.lastText)}</div>` : ''}
          ${hint}
        </div>
      </div>
    `
      : `
      <div class="room-card__row">
        ${avatarHtml}
        <div class="room-main">
          <div class="room-name-row">
            <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
          </div>
          <div class="room-bar-row">
            <div class="room-bar-track">
              <div class="room-bar-total" style="width:${totalPercent.toFixed(2)}%"></div>
              <div class="room-bar-recent" style="width:${recentPercent.toFixed(2)}%"></div>
            </div>
            <span class="room-delta ${r.recentCount > 0 ? 'up' : ''}">${deltaLabel}</span>
          </div>
          ${
            r.lastText
              ? `<div class="room-preview">${escapeHtml(r.lastText)}</div>`
              : ''
          }
          ${hint}
        </div>
      </div>
    `;
    ul.appendChild(li);
    const avImg = li.querySelector('img.room-card__avatar');
    if (avImg instanceof HTMLImageElement && isHttpOrHttpsUrl(thumbSrc)) {
      storyAvatarLoadGuard.noteRemoteAttempt(avImg, thumbSrc);
    }
  }

  if (rankedRooms.length > visibleRooms.length) {
    const rest = rankedRooms.length - visibleRooms.length;
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = `ほか ${rest} ユーザー（上位のみ表示）`;
    ul.appendChild(li);
  }
}

/**
 * @param {string} watchUrl
 * @param {object} message
 * @returns {Promise<unknown>}
 */
async function sendMessageToWatchTabs(watchUrl, message) {
  const candidates = await collectWatchTabCandidates(watchUrl);

  for (const candidate of candidates) {
    try {
      return await tabsSendMessageWithRetry(candidate.id, message);
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {{ no: string, uid: string, name: string, av: string }[]}
 */
function normalizeInterceptCacheItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const item = /** @type {{ no?: unknown, uid?: unknown, name?: unknown, av?: unknown }} */ (
      v
    );
    const no = String(item.no || '').trim();
    const uid = String(item.uid || '').trim();
    if (!no) continue;
    const name = String(item.name || '').trim();
    const av = isHttpOrHttpsUrl(item.av) ? String(item.av || '').trim() : '';
    if (!uid && !name && !av) continue;
    out.push({ no, uid, name, av });
  }
  return out;
}

/**
 * 同一 commentNo の intercept 情報をマージする。
 * @param {{ no: string, uid: string, name: string, av: string }[]} items
 * @returns {{ no: string, uid: string, name: string, av: string }[]}
 */
function mergeInterceptCacheItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  /** @type {Map<string, { no: string, uid: string, name: string, av: string }>} */
  const byNo = new Map();
  for (const it of items) {
    const no = String(it?.no || '').trim();
    if (!no) continue;
    const prev = byNo.get(no);
    if (!prev) {
      byNo.set(no, {
        no,
        uid: String(it?.uid || '').trim(),
        name: String(it?.name || '').trim(),
        av: isHttpOrHttpsUrl(it?.av) ? String(it.av || '').trim() : ''
      });
      continue;
    }
    byNo.set(no, {
      no,
      uid: String(it?.uid || '').trim() || prev.uid,
      name: String(it?.name || '').trim() || prev.name,
      av: (isHttpOrHttpsUrl(it?.av) ? String(it.av || '').trim() : '') || prev.av
    });
  }
  return [...byNo.values()];
}

/**
 * @param {string} watchUrl
 * @param {{ deep?: boolean }} [opts]
 * @returns {Promise<{ items: { no: string, uid: string, name: string, av: string }[], diag: { code: string, detail: string } }>}
 */
async function requestInterceptCacheFromOpenTab(watchUrl, opts = {}) {
  /** @type {{ code: string, detail: string }} */
  const diag = { code: 'no_watch_tab', detail: '' };
  const candidates = await collectWatchTabCandidates(watchUrl);
  if (!candidates.length) {
    return { items: [], diag };
  }

  /** @type {{ no: string, uid: string, name: string, av: string }[]} */
  const merged = [];
  let sawOkTrue = false;
  let sawOkFalse = false;
  let lastRejectError = '';
  let sawSendError = false;

  for (const candidate of candidates) {
    try {
      const ranked = await listWatchFramesWithInnerText(candidate.id);
      const tried = new Set();
      const tryOrder = [...ranked.map((r) => r.frameId), 0];
      for (const fid of tryOrder) {
        if (tried.has(fid)) continue;
        tried.add(fid);
        try {
          const res = /** @type {{ ok?: boolean, items?: unknown, error?: unknown }|null} */ (
            await tabsSendMessageWithRetry(
              candidate.id,
              {
                type: 'NLS_EXPORT_INTERCEPT_CACHE',
                ...(opts.deep ? { deep: true } : {})
              },
              { frameId: fid, maxAttempts: 5, delayMs: 90 }
            )
          );
          if (!res) continue;
          if (res.ok === true) {
            sawOkTrue = true;
            const chunk = normalizeInterceptCacheItems(res.items);
            merged.push(...chunk);
            continue;
          }
          if (res.ok === false) {
            sawOkFalse = true;
            const er = String(res.error || '').trim();
            if (er) lastRejectError = er;
          }
        } catch {
          sawSendError = true;
        }
      }
    } catch {
      sawSendError = true;
    }
  }

  const items = mergeInterceptCacheItems(merged);
  if (items.length > 0) {
    diag.code = 'ok';
    diag.detail = '';
  } else if (sawOkTrue) {
    diag.code = 'ok_empty';
    diag.detail =
      '取り込みは成功しましたが0件でした。watchを開いたままポップアップを更新するか、ページを再読み込みしてください。';
  } else if (sawOkFalse) {
    diag.code = 'export_rejected';
    diag.detail = lastRejectError
      ? lastRejectError.slice(0, 120)
      : 'ページ側が取り込みを拒否しました';
  } else if (sawSendError) {
    diag.code = 'message_failed';
    diag.detail = 'ページとの通信に失敗しました（タブの再読み込みを試してください）';
  } else {
    diag.code = 'no_success_response';
    diag.detail = 'ページから応答がありません（対象のwatchタブが開いているか確認してください）';
  }

  return { items, diag };
}

/**
 * @param {PopupCommentEntry[]} entries
 * @param {{ no: string, uid: string, name: string, av: string }[]} items
 * @param {{ preferInterceptUidSet?: Set<string> }} [opts]
 * @returns {{ next: PopupCommentEntry[], patched: number, uidReplaced: number }}
 */
function mergeCommentsWithInterceptCache(entries, items, opts = {}) {
  if (!Array.isArray(entries) || entries.length === 0 || items.length === 0) {
    return {
      next: Array.isArray(entries) ? entries : [],
      patched: 0,
      uidReplaced: 0
    };
  }

  /** @type {Map<string, { no: string, uid: string, name: string, av: string }>} */
  const byNo = new Map();
  for (const it of items) {
    const prev = byNo.get(it.no);
    if (!prev) {
      byNo.set(it.no, it);
      continue;
    }
    byNo.set(it.no, {
      no: it.no,
      uid: it.uid || prev.uid,
      name: it.name || prev.name,
      av: it.av || prev.av
    });
  }

  /** @type {Map<string, { total: number, mismatch: number, hitUids: Set<string> }>} */
  const mismatchByCurrentUid = new Map();
  for (const e of entries) {
    const no = String(e?.commentNo || '').trim();
    if (!no) continue;
    const hit = byNo.get(no);
    if (!hit?.uid) continue;
    const curUid = String(e?.userId || '').trim();
    if (!curUid) continue;
    const st =
      mismatchByCurrentUid.get(curUid) || {
        total: 0,
        mismatch: 0,
        hitUids: new Set()
      };
    st.total += 1;
    if (curUid !== hit.uid) {
      st.mismatch += 1;
      st.hitUids.add(hit.uid);
    }
    mismatchByCurrentUid.set(curUid, st);
  }
  const preferInterceptUidSet =
    opts.preferInterceptUidSet instanceof Set ? opts.preferInterceptUidSet : new Set();
  /** @param {string} curUid */
  const shouldReplaceUid = (curUid) => {
    if (!curUid) return false;
    if (preferInterceptUidSet.has(curUid)) return true;
    const st = mismatchByCurrentUid.get(curUid);
    if (!st || st.total < 4) return false;
    if (st.hitUids.size < 3) return false;
    return st.mismatch >= Math.ceil(st.total * 0.6);
  };

  let patched = 0;
  let uidReplaced = 0;
  const next = entries.map((e) => {
    const no = String(e?.commentNo || '').trim();
    if (!no) return e;
    const hit = byNo.get(no);
    if (!hit) return e;

    const curUid = String(e?.userId || '').trim();
    const curName = String(e?.nickname || '').trim();
    const curAv = String(e?.avatarUrl || '').trim();
    let changed = false;
    /** @type {PopupCommentEntry} */
    let out = e;

    if (hit.uid) {
      const tie = shouldReplaceUid(curUid) ? 'incoming' : 'existing';
      const chosen = pickStrongerUserId(curUid, hit.uid, tie);
      if (chosen && chosen !== curUid) {
        if (curUid) uidReplaced += 1;
        out = { ...out, userId: chosen };
        changed = true;
      }
    }
    if (hit.name && !curName) {
      out = { ...out, nickname: hit.name };
      changed = true;
    }
    const uidForAv = String(out.userId || '').trim();
    const hitAv = String(hit.av || '').trim();
    if (hitAv && isHttpOrHttpsUrl(hitAv)) {
      const curSc = commentEnrichmentAvatarScore(uidForAv, curAv);
      const hitSc = commentEnrichmentAvatarScore(uidForAv, hitAv);
      if (hitSc > curSc) {
        out = { ...out, avatarUrl: hitAv };
        changed = true;
      }
    }

    if (changed) patched += 1;
    return out;
  });

  return { next, patched, uidReplaced };
}

/**
 * 誤って「自分のサムネ」を他者コメントに付けた履歴を除去する。
 * @param {PopupCommentEntry[]} entries
 * @param {string} liveId
 * @param {WatchPageSnapshot|null|undefined} snapshot
 * @returns {{ next: PopupCommentEntry[], patched: number }}
 */
function stripViewerAvatarContamination(entries, liveId, snapshot) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { next: Array.isArray(entries) ? entries : [], patched: 0 };
  }
  const viewerAvatar = String(snapshot?.viewerAvatarUrl || '').trim();
  const viewerUid = String(snapshot?.viewerUserId || '').trim();
  const broadcasterUid = String(snapshot?.broadcasterUserId || '').trim();
  if (!isHttpOrHttpsUrl(viewerAvatar) && !viewerUid && !broadcasterUid) {
    return { next: entries, patched: 0 };
  }

  const ownPostedIds = getOwnPostedMatchedIdSet(entries, liveId);
  let patched = 0;
  const next = entries.map((e) => {
    let changed = false;
    const out = { ...e };
    const isOwn = e?.selfPosted || ownPostedIds.has(popupEntryStableId(e, liveId));
    if (viewerUid && String(e?.userId || '').trim() === viewerUid) {
      if (!isOwn) {
        delete out.userId;
        changed = true;
      }
    }
    if (broadcasterUid && String(e?.userId || '').trim() === broadcasterUid) {
      if (!isOwn) {
        delete out.userId;
        changed = true;
      }
    }
    const av = String(e?.avatarUrl || '').trim();
    if (
      isHttpOrHttpsUrl(viewerAvatar) &&
      av &&
      isSameAvatarUrl(av, viewerAvatar) &&
      !isOwn
    ) {
      delete out.avatarUrl;
      changed = true;
    }
    if (!changed) return e;
    patched += 1;
    return out;
  });
  return { next, patched };
}

/**
 * 音声入力用: watch URL に一致するタブID（前面の watch を優先）
 * @param {string} watchUrl
 * @returns {Promise<number|null>}
 */
async function findWatchTabIdForVoice(watchUrl) {
  const list = await collectWatchTabCandidates(watchUrl);
  return list[0]?.id ?? null;
}

/** @param {HTMLElement|null} statusEl @param {string} message @param {'idle'|'error'|'success'} kind */
function setCaptureStatus(statusEl, message, kind = 'idle') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove('error', 'success');
  if (kind === 'error') statusEl.classList.add('error');
  if (kind === 'success') statusEl.classList.add('success');
}

/** @param {string|undefined} code */
function screenshotErrorMessage(code) {
  switch (code) {
    case 'not_watch':
      return 'watchページのタブを開いた状態で試してください。';
    case 'no_video':
      return '動画プレイヤーが見つかりません。';
    case 'not_ready':
      return '動画の準備ができていません。しばらくしてから再試行してください。';
    case 'tainted_canvas':
      return 'ブラウザの制限でこの配信は直接キャプチャできません。';
    default:
      return 'キャプチャに失敗しました。';
  }
}

async function applyThumbSelectFromStorage() {
  const sel = /** @type {HTMLSelectElement|null} */ ($('thumbInterval'));
  if (!sel) return;
  const bag = await chrome.storage.local.get([KEY_THUMB_AUTO, KEY_THUMB_INTERVAL_MS]);
  const auto = isThumbAutoEnabled(bag[KEY_THUMB_AUTO]);
  const ms = normalizeThumbIntervalMs(bag[KEY_THUMB_INTERVAL_MS]);
  const v = auto && ms > 0 ? String(ms) : '0';
  const allowed = new Set(['0', '30000', '60000', '300000']);
  sel.value = allowed.has(v) ? v : '0';
}

async function applyVoiceAutosendFromStorage() {
  const cb = /** @type {HTMLInputElement|null} */ ($('voiceAutoSend'));
  if (!cb) return;
  const bag = await chrome.storage.local.get(KEY_VOICE_AUTOSEND);
  cb.checked = bag[KEY_VOICE_AUTOSEND] !== false;
}

async function applyCommentEnterSendFromStorage() {
  const cb = /** @type {HTMLInputElement|null} */ ($('commentEnterSend'));
  if (!cb) return;
  const bag = await chrome.storage.local.get(KEY_COMMENT_ENTER_SEND);
  cb.checked = isCommentEnterSendEnabled(bag[KEY_COMMENT_ENTER_SEND]);
}

/** storage 反映中は details の toggle で永続化しない */
let suppressSupportVisualTogglePersist = false;

/** toggle handler 自身が persist 中 → onChanged の safeRefresh を抑制 */
let ownSupportVisualPersistInFlight = false;

/** loadPopupFrameSettings.finally が複数回走る／同一ページで init が重なるとリスナーが二重になり、1クリックで2回トグルして見た目が変わらない */
let supportVisualUiWired = false;

/**
 * 拡張ポップアップは `.nl-main` が overflow:auto のため、scrollIntoView だけだと飛び先がずれることがある。
 * メイン領域の scrollTop を直接調整する。
 * @param {HTMLElement} el
 */
function scrollNlMainToRevealElement(el) {
  const main = /** @type {HTMLElement|null} */ (document.querySelector('.nl-main'));
  if (!main || !el) return;
  const pad = 12;
  const parentRect = main.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const delta = computeScrollDeltaToRevealInParent(
    { top: parentRect.top, bottom: parentRect.bottom },
    { top: elRect.top, bottom: elRect.bottom },
    pad
  );
  if (delta !== 0) main.scrollTop += delta;
}

/** 開いた直後のレイアウト確定後にコールバック（1フレームでは高さ未反映のことがある） */
function afterNextLayout(cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cb();
    });
  });
}

/** @type {ResizeObserver|null} */
let supportVisualScrollObserver = null;

/**
 * details 展開後、コンテンツ body の高さ変化に追従してスクロール補正する。
 * 応援ビジュアル展開時の body 高さ変化（アイコングリッドの一括再描画など）にも追従できるよう
 * ResizeObserver で監視し、一定時間後に自動 disconnect する。
 * @param {HTMLDetailsElement|null} details
 */
function scheduleScrollOpenSupportVisualDetails(details) {
  if (!details) return;
  cleanupSupportVisualScrollObserver();
  const body = details.querySelector('.nl-support-visual-details__body');
  const target = /** @type {HTMLElement} */ (body || details);

  const runScroll = () => {
    if (!details.open) return;
    const detailsEl = /** @type {HTMLElement} */ (details);
    scrollNlMainToRevealElement(detailsEl);
    scrollNlMainToRevealElement(target);
  };

  supportVisualScrollObserver = new ResizeObserver(() => runScroll());
  supportVisualScrollObserver.observe(target);

  afterNextLayout(runScroll);

  globalThis.setTimeout(() => {
    cleanupSupportVisualScrollObserver();
  }, 800);
}

function cleanupSupportVisualScrollObserver() {
  if (supportVisualScrollObserver) {
    supportVisualScrollObserver.disconnect();
    supportVisualScrollObserver = null;
  }
}

function setUsageTermsGateDismissedUi() {
  document.documentElement.setAttribute('data-nl-usage-terms-ack', '1');
}

function writeUsageTermsAckToLocalMirror() {
  try {
    globalThis.localStorage?.setItem(KEY_USAGE_TERMS_ACK, '1');
  } catch {
    // no-op
  }
}

/** 利用条件オーバーレイは出さず、同意済みとして storage に同期する（本文は popup.html に残し参照用） */
async function applyUsageTermsGateState() {
  setUsageTermsGateDismissedUi();
  if (!hasExtensionContext()) return;
  writeUsageTermsAckToLocalMirror();
  try {
    await storageSetSafe({ [KEY_USAGE_TERMS_ACK]: true });
  } catch {
    // no-op
  }
}

/**
 * refresh / applyResponsivePopupLayout 完了後に呼ぶ軽量補正。
 * details が開いているときだけ 1 回スクロール位置を確認・補正する。
 */
function correctSupportVisualScrollIfOpen() {
  const details = /** @type {HTMLDetailsElement|null} */ (
    document.getElementById('supportVisualDetails')
  );
  if (!details?.open) return;
  const body = details.querySelector('.nl-support-visual-details__body');
  const target = /** @type {HTMLElement} */ (body || details);
  scrollNlMainToRevealElement(/** @type {HTMLElement} */ (details));
  scrollNlMainToRevealElement(target);
}

async function applySupportVisualExpandedFromStorage() {
  const details = /** @type {HTMLDetailsElement|null} */ ($('supportVisualDetails'));
  if (!details) return;
  const bag = await storageGetSafe(KEY_SUPPORT_VISUAL_EXPANDED, {});
  const raw = bag[KEY_SUPPORT_VISUAL_EXPANDED];
  const open = normalizeSupportVisualExpanded(raw, { inlineMode: INLINE_MODE });
  /* 同じ値への再代入でも toggle が飛ぶ環境があり、永続化ハンドラが二重に走る */
  if (details.open === open) {
    return;
  }
  suppressSupportVisualTogglePersist = true;
  try {
    details.open = open;
  } finally {
    suppressSupportVisualTogglePersist = false;
  }
}

async function applyStoryGrowthCollapsedFromStorage() {
  const btn = /** @type {HTMLButtonElement|null} */ ($('storyGrowthCollapseBtn'));
  const bag = await chrome.storage.local.get(KEY_STORY_GROWTH_COLLAPSED);
  const collapsed = bag[KEY_STORY_GROWTH_COLLAPSED] === true;
  document.body?.classList.toggle('nl-story-growth-collapsed', collapsed);
  if (btn) {
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.textContent = collapsed ? 'アイコン列を表示' : 'アイコン列を隠す';
  }
}

/** @param {HTMLElement|null} el @param {string} text @param {'idle'|'error'|'success'} [kind] */
function setVoiceDeviceCheckStatus(el, text, kind = 'idle') {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('error', 'success');
  if (kind === 'error') el.classList.add('error');
  if (kind === 'success') el.classList.add('success');
}

async function refreshVoiceInputDeviceList() {
  const sel = /** @type {HTMLSelectElement|null} */ ($('voiceInputDevice'));
  const statusEl = $('voiceDeviceCheckStatus');
  if (!sel) return;
  const previous = sel.value;
  const bag = await chrome.storage.local.get(KEY_VOICE_INPUT_DEVICE);
  const stored = String(bag[KEY_VOICE_INPUT_DEVICE] || '');
  setVoiceDeviceCheckStatus(statusEl, '一覧を読み込み中…', 'idle');
  try {
    try {
      const warm = await navigator.mediaDevices.getUserMedia({ audio: true });
      warm.getTracks().forEach((t) => t.stop());
    } catch {
      //
    }
    const list = await navigator.mediaDevices.enumerateDevices();
    const inputs = list.filter((d) => d.kind === 'audioinput');
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '既定（システムデフォルト）';
    sel.appendChild(opt0);
    for (const d of inputs) {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `マイク (${d.deviceId.slice(0, 10)}…)`;
      sel.appendChild(o);
    }
    const ids = new Set(Array.from(sel.options, (o) => o.value));
    const pick =
      (previous && ids.has(previous) ? previous : '') ||
      (stored && ids.has(stored) ? stored : '');
    sel.value = pick;
    if (pick !== stored) {
      await chrome.storage.local.set({ [KEY_VOICE_INPUT_DEVICE]: pick });
    }
    setVoiceDeviceCheckStatus(
      statusEl,
      inputs.length
        ? `マイク ${inputs.length} 台を検出しました`
        : '入力デバイスが見つかりません',
      'idle'
    );
  } catch {
    setVoiceDeviceCheckStatus(statusEl, 'デバイス一覧を取得できませんでした。', 'error');
  }
}

/**
 * 開発監視向け: サムネ・ID・表示名・コメント（公式比）の取得率をチャートで表示。
 *
 * @param {{
 *   snapshot: WatchPageSnapshot|null,
 *   liveId: string,
 *   displayCount: number,
 *   storageCount: number,
 *   avatarStats?: import('../lib/devMonitorAvatarStats.js').StoredCommentAvatarStats|null,
 * }} p
 */
function renderAcquisitionDashboard(p) {
  const host = $('devMonitorAcquisition');
  if (!host) return;

  const liveId = String(p.liveId || '').trim();
  if (!liveId) {
    host.innerHTML =
      '<section class="nl-acquisition nl-acquisition--empty" aria-label="データ取得率">' +
      '<p class="nl-acquisition__empty">ニコ生 watch を開いた状態でポップアップを開くと、取得率チャートが表示されます（記録0件でも表示）。</p>' +
      '</section>';
    return;
  }

  const avs = p.avatarStats;
  const t = avs && typeof avs.total === 'number' ? Math.max(0, avs.total) : 0;
  const thumb = t > 0 ? (avs.withHttpAvatar / t) * 100 : 0;
  const idPct = t > 0 ? ((t - avs.missingUserId) / t) * 100 : 0;
  const nick = t > 0 ? (avs.withNickname / t) * 100 : 0;
  const oc =
    p.snapshot &&
    typeof p.snapshot.officialCommentCount === 'number' &&
    Number.isFinite(p.snapshot.officialCommentCount)
      ? p.snapshot.officialCommentCount
      : null;
  /** @type {number|null} */
  let commentPct = null;
  if (oc != null && oc > 0) {
    commentPct = Math.min(100, (p.displayCount / oc) * 100);
  }
  const radarComment = commentPct != null ? commentPct : 0;

  const cx = 60;
  const cy = 60;
  const R = 44;
  const vals = [thumb, idPct, nick, radarComment];
  const polyPts = vals
    .map((pct, i) => {
      const th = -Math.PI / 2 + (i * Math.PI) / 2;
      const rr = (Math.max(0, Math.min(100, pct)) / 100) * R;
      const x = cx + rr * Math.cos(th);
      const y = cy + rr * Math.sin(th);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const ringPts = [0, 1, 2, 3]
    .map((i) => {
      const th = -Math.PI / 2 + (i * Math.PI) / 2;
      const x = cx + R * Math.cos(th);
      const y = cy + R * Math.sin(th);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const midR = R * 0.5;
  const midPts = [0, 1, 2, 3]
    .map((i) => {
      const th = -Math.PI / 2 + (i * Math.PI) / 2;
      const x = cx + midR * Math.cos(th);
      const y = cy + midR * Math.sin(th);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const axisLines = [0, 1, 2, 3]
    .map((i) => {
      const th = -Math.PI / 2 + (i * Math.PI) / 2;
      const x2 = cx + R * Math.cos(th);
      const y2 = cy + R * Math.sin(th);
      return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(
        2
      )}" stroke="#94a3b8" stroke-width="0.45" opacity="0.4"/>`;
    })
    .join('');

  const fmt = (n) => `${n.toFixed(1)}%`;
  const commentBar = commentPct != null ? fmt(commentPct) : '—';

  const wThumb = Math.max(0, thumb);
  const wId = Math.max(0, idPct);
  const wNick = Math.max(0, nick);
  const wComm = commentPct != null ? Math.max(0, commentPct) : 0;
  const wSum = wThumb + wId + wNick + wComm;
  /** @type {string} */
  let pieDiskBackground = '#94a3b8';
  if (wSum > 0.001) {
    let a = 0;
    /** @type {string[]} */
    const segs = [];
    const pushSeg = (frac, color) => {
      const deg = (frac / wSum) * 360;
      const b = a + deg;
      segs.push(`${color} ${a}deg ${b}deg`);
      a = b;
    };
    pushSeg(wThumb, '#0f8fd8');
    pushSeg(wId, '#6366f1');
    pushSeg(wNick, '#ea580c');
    pushSeg(wComm, '#0d9488');
    pieDiskBackground = `conic-gradient(${segs.join(',')})`;
  }

  const footExtra =
    t <= 0
      ? '記録0件のためサムネ・ID・名前は0%。ログイン不要で表示します。'
      : '';
  const footMain =
    commentPct != null
      ? 'コメント＝記録の表示件数÷公式コメント数（上限100%）。'
      : 'コメント率は公式件数が無いとき「—」（レーダー・円のコメント分は0扱い）。';
  const foot = escapeHtml(footExtra ? `${footMain} ${footExtra}` : footMain);

  host.innerHTML =
    '<section class="nl-acquisition" aria-label="データ取得率">' +
    '<h3 class="nl-acquisition__title">現在のデータ取得率</h3>' +
    '<div class="nl-acquisition__charts">' +
    '<div class="nl-acquisition__radar">' +
    '<svg viewBox="0 0 120 120" aria-hidden="true">' +
    axisLines +
    `<polygon fill="none" stroke="#94a3b8" stroke-width="0.55" opacity="0.45" points="${ringPts}" />` +
    `<polygon fill="none" stroke="#94a3b8" stroke-width="0.45" opacity="0.32" points="${midPts}" />` +
    `<polygon fill="rgb(15 143 216 / 22%)" stroke="#0f8fd8" stroke-width="1.2" points="${polyPts}" />` +
    '</svg>' +
    '<span class="nl-acquisition__cap">4項目バランス（レーダー）</span>' +
    '</div>' +
    '<div class="nl-acquisition__bars">' +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">サムネ</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--thumb" style="width:${Math.min(
      100,
      thumb
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(thumb)
    )}</p></div>` +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">ID</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--id" style="width:${Math.min(
      100,
      idPct
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(idPct)
    )}</p></div>` +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">名前</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--nick" style="width:${Math.min(
      100,
      nick
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(nick)
    )}</p></div>` +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">コメ</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--comment" style="width:${commentPct != null ? Math.min(100, commentPct) : 0}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      commentBar
    )}</p></div>` +
    '</div>' +
    '<div class="nl-acquisition__pie">' +
    '<div class="nl-acquisition__pie-disk"></div>' +
    '<span class="nl-acquisition__cap">構成比（円）</span>' +
    '</div>' +
    '</div>' +
    '<ul class="nl-acquisition__legend">' +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--thumb" aria-hidden="true"></span>アイコン画像のURL（取れている割合）</li>` +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--id" aria-hidden="true"></span>ユーザーID（取れている割合）</li>` +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--nick" aria-hidden="true"></span>表示名・ニックネーム（付いている割合）</li>` +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--comment" aria-hidden="true"></span>コメント（記録÷公式）</li>` +
    '</ul>' +
    `<p class="nl-acquisition__footnote">${foot}</p>` +
    '</section>';

  const disk = host.querySelector('.nl-acquisition__pie-disk');
  if (disk instanceof HTMLElement) {
    disk.style.background = pieDiskBackground;
  }

  const win = typeof globalThis !== 'undefined' ? globalThis : window;
  appendTrendPoint(win, liveId, {
    thumb,
    idPct,
    nick,
    commentPct,
    displayCount: p.displayCount,
    storageCount: p.storageCount
  });
  void persistTrendPointChrome(liveId, {
    thumb,
    idPct,
    nick,
    commentPct,
    displayCount: p.displayCount,
    storageCount: p.storageCount
  });
}

/**
 * @param {{
 *   snapshot: WatchPageSnapshot|null,
 *   liveId: string,
 *   displayCount: number,
 *   storageCount: number,
 *   avatarStats?: import('../lib/devMonitorAvatarStats.js').StoredCommentAvatarStats|null,
 *   profileGaps?: import('../lib/devMonitorAvatarStats.js').StoredCommentProfileGaps|null
 * }} p
 */
function renderDevMonitorSecondaryViz(p, opts = {}) {
  const vizHost = $('devMonitorViz');
  if (!vizHost) return;
  const liveId = String(p.liveId || '').trim();
  if (!liveId) {
    vizHost.innerHTML =
      '<div class="nl-dev-monitor-viz">' +
      '<p class="nl-viz-block__empty">ニコ生の視聴ページ（watch）を開くと、件数の比較や推移のグラフが表示されます。</p>' +
      '</div>';
    return;
  }

  const win = typeof globalThis !== 'undefined' ? globalThis : window;
  const trend =
    opts.mergedTrend != null ? opts.mergedTrend : readTrendSeries(win, liveId);
  const persisted = Boolean(opts.mergedTrend);

  const snap = p.snapshot;
  const oc =
    snap &&
    typeof snap.officialCommentCount === 'number' &&
    Number.isFinite(snap.officialCommentCount)
      ? snap.officialCommentCount
      : null;

  /** @type {string[]} */
  const parts = [];
  parts.push(
    htmlOfficialVsRecordedBar(
      officialVsRecordedBarState({
        displayCount: p.displayCount,
        officialCount: oc
      })
    )
  );
  if (
    snap &&
    typeof snap.officialCaptureRatio === 'number' &&
    Number.isFinite(snap.officialCaptureRatio)
  ) {
    parts.push(htmlCaptureRatioBar(snap.officialCaptureRatio));
  }
  const gaps = p.profileGaps;
  if (gaps && p.storageCount > 0) {
    parts.push(htmlProfileGapBars(profileGapBarSeries(gaps)));
  }
  const dbg =
    snap?._debug && typeof snap._debug === 'object'
      ? /** @type {Record<string, unknown>} */ (snap._debug)
      : null;
  if (
    dbg &&
    dbg.commentTypeVisibleSample != null &&
    typeof dbg.commentTypeVisibleSample === 'object'
  ) {
    parts.push(
      htmlCommentTypeBars(
        commentTypeDistribution(
          /** @type {Record<string, unknown>} */ (dbg.commentTypeVisibleSample)
        )
      )
    );
  }
  if (dbg && typeof dbg.wsAge === 'number') {
    parts.push(htmlWsStalenessBar(wsStalenessState(dbg.wsAge)));
  }
  if (trend.length >= 1) {
    const series = trendToSparklineArrays(trend);
    parts.push(htmlAcquisitionSparklines(series, { persisted }));
    if (trendHasCountSamples(trend)) {
      parts.push(htmlDualCountSparklines(series.displaySeries, series.storageSeries));
    }
  }
  vizHost.innerHTML = `<div class="nl-dev-monitor-viz">${parts.filter(Boolean).join('')}</div>`;
}

/**
 * @param {{
 *   snapshot: WatchPageSnapshot|null,
 *   liveId: string,
 *   displayCount: number,
 *   storageCount: number,
 *   avatarStats?: import('../lib/devMonitorAvatarStats.js').StoredCommentAvatarStats|null,
 *   profileGaps?: import('../lib/devMonitorAvatarStats.js').StoredCommentProfileGaps|null
 * }} p
 */
function renderDevMonitorPanel(p) {
  lastDevMonitorPanelParams = p;
  const mktBtn = /** @type {HTMLButtonElement|null} */ ($('devMonitorExportMarketingBtn'));
  if (mktBtn) mktBtn.disabled = !String(p.liveId || '').trim();
  const statsEl = $('devMonitorStats');
  const jsonEl = $('devMonitorJson');
  const dlChartsEl = $('devMonitorDlCharts');
  renderAcquisitionDashboard(p);
  renderDevMonitorSecondaryViz(p);
  if (dlChartsEl) {
    dlChartsEl.innerHTML = buildDevMonitorDlChartsHtml(p);
  }
  if (!statsEl || !jsonEl) return;

  const win = typeof globalThis !== 'undefined' ? globalThis : window;
  const lid = String(p.liveId || '').trim();
  if (lid) {
    void readMergedTrendSeries(win, lid).then((merged) => {
      renderDevMonitorSecondaryViz(p, { mergedTrend: merged });
    });
  }

  const snap = p.snapshot;
  const oc =
    snap &&
    typeof snap.officialCommentCount === 'number' &&
    Number.isFinite(snap.officialCommentCount)
      ? snap.officialCommentCount
      : null;
  const gap =
    oc != null && p.liveId ? oc - p.displayCount : null;

  /** @type {[string, string][]} */
  const rows = [];
  rows.push(['配信ID（lv…）', p.liveId || '—']);
  rows.push(['このPCに保存した件数', String(p.storageCount)]);
  rows.push(['一覧に出している件数', String(p.displayCount)]);
  rows.push(['公式の累計コメント数', oc != null ? String(oc) : '—']);
  rows.push(['公式との差（公式−一覧）', gap != null ? String(gap) : '—']);
  rows.push([
    '差が出る主な理由（参考）',
    '画面に載っていないコメントは取り込めません。種類の扱いの違い・通信の切れ・サイトの作り変わりなどが重なり得ます（下の「種類の内訳」も参照）。'
  ]);
  rows.push([
    '公式と「記録」のちがい',
    '公式は放送の累計です。記録は、このPCの拡張が実際に取れた行だけです（タイムシフト・別タブ・高流量・仕様変更で差が出ます）。'
  ]);

  const avs = p.avatarStats;
  if (avs && avs.total > 0) {
    rows.push(['アイコンURLが残っている件数', String(avs.withHttpAvatar)]);
    rows.push(['アイコンURLが無い件数', String(avs.withoutHttpAvatar)]);
    rows.push([
      'アイコンURLがある割合',
      `${((avs.withHttpAvatar / avs.total) * 100).toFixed(1)}%`
    ]);
    rows.push(['既定アイコン相当のみの件数', String(avs.syntheticDefaultAvatar)]);
    rows.push(['表示名（ニックネーム）がある件数', String(avs.withNickname)]);
    rows.push(['表示名が無い件数', String(avs.withoutNickname)]);
    rows.push(['ユーザーIDが数字の件数', String(avs.numericUserId)]);
    rows.push(['ユーザーIDが匿名風などの件数', String(avs.nonNumericUserId)]);
    rows.push(['ユーザーIDが取れていない件数', String(avs.missingUserId)]);
  }

  const gaps = p.profileGaps;
  if (gaps && p.storageCount > 0) {
    rows.push(['── 利用者の種類別（IDがある行だけ）', '──']);
    rows.push(['数字ID・アイコンあり', String(gaps.numericUidWithHttpAvatar)]);
    rows.push(['数字ID・アイコンなし', String(gaps.numericUidWithoutHttpAvatar)]);
    rows.push(['匿名風ID・アイコンあり', String(gaps.anonStyleUidWithHttpAvatar)]);
    rows.push(['匿名風ID・アイコンなし', String(gaps.anonStyleUidWithoutHttpAvatar)]);
    rows.push(['数字ID・名前あり', String(gaps.numericWithNickname)]);
    rows.push(['数字ID・名前なし', String(gaps.numericWithoutNickname)]);
    rows.push(['匿名風・名前あり', String(gaps.anonWithNickname)]);
    rows.push(['匿名風・名前なし', String(gaps.anonWithoutNickname)]);
  }

  if (snap?._debug && typeof snap._debug === 'object') {
    const d = /** @type {Record<string, unknown>} */ (snap._debug);
    if (typeof d.wsAge === 'number')
      rows.push(['配信ページの更新からの経過（ms・参考）', String(d.wsAge)]);
    if (d.intercept != null)
      rows.push(['視聴ページ内の利用者メモ（件数）', String(d.intercept)]);
    if (d.ndgr != null && String(d.ndgr).trim())
      rows.push(['配信データの内部状態（記号・開発向け）', String(d.ndgr)]);
    if (d.ndgrLdStream != null && String(d.ndgrLdStream).trim()) {
      rows.push(['配信データの受信状況（記号・開発向け）', String(d.ndgrLdStream)]);
    }
    if (
      d.commentTypeVisibleSample != null &&
      typeof d.commentTypeVisibleSample === 'object' &&
      Object.keys(d.commentTypeVisibleSample).length
    ) {
      rows.push([
        'いま画面に出ているコメントの種類（内部キー）',
        JSON.stringify(d.commentTypeVisibleSample)
      ]);
    }
    if (d.piPost != null) {
      rows.push(['ページが受け取った取り込み指示（件数）', String(d.piPost)]);
    }
    if (d.piEnq != null) {
      rows.push(['ページが処理待ちにした件数', String(d.piEnq)]);
    }
  }

  {
    const st = STORY_AVATAR_DIAG_STATE;
    if (p.liveId && (st.interceptMapOnPage >= 0 || st.interceptExportCode || st.interceptExportRows > 0)) {
      rows.push(['── 直近の取り込み（ポップアップから）', '──']);
      rows.push([
        'watchタブ内の一時対応表（件数）',
        st.interceptMapOnPage >= 0 ? String(st.interceptMapOnPage) : '—'
      ]);
      rows.push(['取り込んだ行数', String(st.interceptExportRows)]);
      rows.push(['結果コード', st.interceptExportCode || '—']);
      if (String(st.interceptExportDetail || '').trim()) {
        rows.push(['補足メッセージ', String(st.interceptExportDetail).trim()]);
      }
    }
  }

  statsEl.innerHTML = rows
    .map(
      ([dt, dd]) =>
        `<div class="nl-dev-monitor__row"><dt>${escapeHtml(dt)}</dt><dd>${escapeHtml(dd)}</dd></div>`
    )
    .join('');

  if (!p.liveId) {
    jsonEl.textContent =
      'watch を開いているときにスナップショットが入ります。本文は出しません。';
    return;
  }
  const debugSub = pickDevMonitorDebugSubset(
    snap?._debug && typeof snap._debug === 'object'
      ? /** @type {Record<string, unknown>} */ (snap._debug)
      : undefined
  );
  const outJson = { ...debugSub };
  if (avs && avs.total > 0) {
    outJson.avatarStats = avs;
  }
  if (gaps && p.storageCount > 0) {
    outJson.profileGaps = gaps;
  }
  jsonEl.textContent = JSON.stringify(outJson, null, 2);
}

/** 収録・スクショ向け: `html.nl-calm-motion` でループアニメ等を止める */
function applyCalmPanelMotionClass(enabled) {
  document.documentElement.classList.toggle('nl-calm-motion', Boolean(enabled));
}

async function refresh() {
  if (!hasExtensionContext()) {
    renderExtensionContextBanner(true);
    return;
  }
  renderExtensionContextBanner(false);

  const liveEl = $('liveId');
  const toggle = /** @type {HTMLInputElement} */ ($('recordToggle'));
  const exportBtn = /** @type {HTMLButtonElement} */ ($('exportJson'));
  const captureBtn = /** @type {HTMLButtonElement|null} */ ($('captureScreenshot'));
  const thumbCountEl = $('thumbCount');
  const commentInput = /** @type {HTMLTextAreaElement} */ ($('commentInput'));
  const postBtn = /** @type {HTMLButtonElement} */ ($('postCommentBtn'));

  try {
  document.documentElement.removeAttribute('data-nl-popup-content-painted');
  const [tabs, openBag] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.local.get([
      KEY_SELF_POSTED_RECENTS,
      KEY_LAST_WATCH_URL,
      KEY_RECORDING,
      KEY_DEEP_HARVEST_QUIET_UI,
      KEY_INLINE_PANEL_WIDTH_MODE,
      KEY_CALM_PANEL_MOTION,
      KEY_STORAGE_WRITE_ERROR,
      KEY_COMMENT_PANEL_STATUS
    ])
  ]);
  applySelfPostedRecentsFromBag(openBag);
  const calmOn = normalizeCalmPanelMotion(openBag[KEY_CALM_PANEL_MOTION], {
    inlineDefault: INLINE_MODE
  });
  applyCalmPanelMotionClass(calmOn);
  const calmMotionElHydrate = /** @type {HTMLInputElement|null} */ ($('calmPanelMotion'));
  if (calmMotionElHydrate) calmMotionElHydrate.checked = calmOn;
  const { url, fromActiveTab } = resolveWatchUrlFromTabAndStash(
    tabs[0],
    openBag[KEY_LAST_WATCH_URL]
  );
  const resolvedLv = extractLiveIdFromUrl(url);
  const viewerLvForError =
    isNicoLiveWatchUrl(url) && resolvedLv ? resolvedLv : '';
  applyStorageErrorBannerFromBag(openBag, viewerLvForError);
  applyCommentHarvestBannerFromBag(openBag, viewerLvForError);

  toggle.checked = isRecordingEnabled(openBag[KEY_RECORDING]);
  toggle.disabled = false;

  const deepHarvestQuietEl = /** @type {HTMLInputElement|null} */ (
    $('deepHarvestQuietUiToggle')
  );
  if (deepHarvestQuietEl) {
    deepHarvestQuietEl.checked = isDeepHarvestQuietUiEnabled(
      openBag[KEY_DEEP_HARVEST_QUIET_UI]
    );
    deepHarvestQuietEl.disabled = false;
  }

  const panelMode = normalizeInlinePanelWidthMode(
    openBag[KEY_INLINE_PANEL_WIDTH_MODE]
  );
  const radioPlayerRow = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelWidthPlayerRow')
  );
  const radioVideoOnly = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelWidthVideo')
  );
  if (radioPlayerRow && radioVideoOnly) {
    radioPlayerRow.checked = panelMode === INLINE_PANEL_WIDTH_PLAYER_ROW;
    radioVideoOnly.checked = panelMode === INLINE_PANEL_WIDTH_VIDEO;
  }
  syncVoiceCommentButton();

  if (!isNicoLiveWatchUrl(url)) {
    if (liveEl) liveEl.textContent = '（ニコ生watchを開いてください）';
    setCountDisplay('-');
    renderCommentTicker([]);
    exportBtn.disabled = true;
    exportBtn.dataset.watchUrl = '';
    if (captureBtn) {
      captureBtn.disabled = true;
      captureBtn.dataset.watchUrl = '';
    }
    if (thumbCountEl) thumbCountEl.textContent = '-';
    watchMetaCache.key = '';
    watchMetaCache.snapshot = null;
    clearWatchMetaCard();
    popupUserCommentProfileMap = null;
    syncStorySourceEntries('', []);
    resetStoryAvatarDiagState();
    renderCharacterScene({
      hasWatch: false,
      recording: toggle.checked,
      commentCount: 0,
      liveId: '',
      snapshot: null
    });
    if (postBtn) postBtn.disabled = true;
    setReloadWatchTabUiDisabled(true);
    syncVoiceCommentButton();
    if (commentInput) {
      commentInput.placeholder = 'watchページを開くとコメント送信できます';
    }
    renderUserRooms([], '');
    renderDevMonitorPanel({
      snapshot: null,
      liveId: '',
      displayCount: 0,
      storageCount: 0,
      avatarStats: null,
      profileGaps: null
    });
    hideCommentVelocityLine();
    void renderSessionSummaryComparePanel('');
    void renderGiftQuickStatsPanel('');
    markPopupRefreshContentPainted();
    return;
  }

  const lv = extractLiveIdFromUrl(url);
  if (liveEl) {
    liveEl.textContent = lv && !fromActiveTab ? `${lv}（直近の視聴ページ）` : lv || '-';
  }

  if (!lv) {
    setCountDisplay('-');
    renderCommentTicker([]);
    exportBtn.disabled = true;
    exportBtn.dataset.watchUrl = '';
    if (captureBtn) {
      captureBtn.disabled = true;
      captureBtn.dataset.watchUrl = '';
    }
    if (thumbCountEl) thumbCountEl.textContent = '-';
    watchMetaCache.key = '';
    watchMetaCache.snapshot = null;
    clearWatchMetaCard();
    popupUserCommentProfileMap = null;
    syncStorySourceEntries('', []);
    resetStoryAvatarDiagState();
    renderCharacterScene({
      hasWatch: true,
      recording: toggle.checked,
      commentCount: 0,
      liveId: '',
      snapshot: null
    });
    if (postBtn) postBtn.disabled = true;
    setReloadWatchTabUiDisabled(true);
    syncVoiceCommentButton();
    if (commentInput) {
      commentInput.placeholder = 'コメントを入力して送信';
    }
    renderUserRooms([], '');
    renderDevMonitorPanel({
      snapshot: null,
      liveId: '',
      displayCount: 0,
      storageCount: 0,
      avatarStats: null,
      profileGaps: null
    });
    hideCommentVelocityLine();
    void renderSessionSummaryComparePanel('');
    void renderGiftQuickStatsPanel('');
    markPopupRefreshContentPainted();
    return;
  }

  const snapshotKey = `${lv}|${url}|s17`;
  const key = commentsStorageKey(lv);
  const snapshotCacheHit =
    watchMetaCache.key === snapshotKey && watchMetaCache.snapshot != null;
  let watchSnapshot = snapshotCacheHit ? watchMetaCache.snapshot : null;

  if (!snapshotCacheHit) {
    watchMetaCache.key = snapshotKey;
    watchMetaCache.snapshot = null;
  }

  /** @type {Record<string, unknown>} */
  const data = await readStorageBagWithRetry(
    () =>
      chrome.storage.local.get([key, KEY_USER_COMMENT_PROFILE_CACHE]),
    { attempts: 4, delaysMs: [0, 50, 120, 280] }
  );
  let arr = Array.isArray(data[key]) ? data[key] : [];
  popupUserCommentProfileMap = normalizeUserCommentProfileMap(
    data[KEY_USER_COMMENT_PROFILE_CACHE]
  );
  const normalizedStored = normalizeStoredCommentEntries(
    /** @type {PopupCommentEntry[]} */ (arr)
  );
  if (normalizedStored.changed) {
    arr = normalizedStored.next;
  }
  const profAfterNormalize = popupMergeUserCommentProfileCache(arr);
  arr = profAfterNormalize.arr;
  if (
    normalizedStored.changed ||
    profAfterNormalize.commentsPatched ||
    profAfterNormalize.cacheTouched
  ) {
    const save = {};
    if (normalizedStored.changed || profAfterNormalize.commentsPatched) {
      save[key] = arr;
    }
    if (profAfterNormalize.cacheTouched) {
      save[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
    }
    if (Object.keys(save).length) {
      await storageSetSafe(save);
    }
  }
  STORY_AVATAR_DIAG_STATE.total = arr.length;
  STORY_AVATAR_DIAG_STATE.withUid = countEntriesWithUserId(arr);
  STORY_AVATAR_DIAG_STATE.withAvatar = countEntriesWithAvatar(arr);
  STORY_AVATAR_DIAG_STATE.uniqueAvatar = countUniqueAvatarEntries(arr);
  {
    const resolvedAvatar = countResolvedAvatarEntries(arr, lv);
    STORY_AVATAR_DIAG_STATE.resolvedAvatar = resolvedAvatar.total;
    STORY_AVATAR_DIAG_STATE.resolvedUniqueAvatar = resolvedAvatar.unique;
  }
  STORY_AVATAR_DIAG_STATE.selfShown = countOwnPostedEntries(arr, lv);
  STORY_AVATAR_DIAG_STATE.selfSaved = countSavedOwnPostedEntries(arr);
  STORY_AVATAR_DIAG_STATE.selfPending = countPendingSelfPostedRecentsForLive(lv);
  STORY_AVATAR_DIAG_STATE.selfPendingMatched = getOwnPostedMatchedIdSet(arr, lv).size;
  STORY_AVATAR_DIAG_STATE.interceptItems = 0;
  STORY_AVATAR_DIAG_STATE.interceptWithUid = 0;
  STORY_AVATAR_DIAG_STATE.interceptWithAvatar = 0;
  STORY_AVATAR_DIAG_STATE.mergedPatched = 0;
  STORY_AVATAR_DIAG_STATE.mergedUidReplaced = 0;
  STORY_AVATAR_DIAG_STATE.stripped = 0;
  STORY_AVATAR_DIAG_STATE.interceptExportRows = 0;
  STORY_AVATAR_DIAG_STATE.interceptExportCode = '';
  STORY_AVATAR_DIAG_STATE.interceptExportDetail = '';
  syncInterceptMapDiagFromSnapshot(watchSnapshot);
  const strippedViewerAvatar = stripViewerAvatarContamination(
    arr,
    lv,
    watchSnapshot
  );
  if (strippedViewerAvatar.patched > 0) {
    arr = strippedViewerAvatar.next;
    const profAfterStrip = popupMergeUserCommentProfileCache(arr);
    arr = profAfterStrip.arr;
    const saveStrip = { [key]: arr };
    if (profAfterStrip.cacheTouched) {
      saveStrip[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
    }
    await storageSetSafe(saveStrip);
  }
  STORY_AVATAR_DIAG_STATE.stripped = strippedViewerAvatar.patched;
  if (INTERCEPT_BACKFILL_STATE.liveId !== lv) {
    INTERCEPT_BACKFILL_STATE.liveId = lv;
    INTERCEPT_BACKFILL_STATE.deepTried = false;
  }
  const missingIdCount = arr.reduce(
    (sum, e) => (String(e?.userId || '').trim() ? sum : sum + 1),
    0
  );
  const shouldDeep =
    !INTERCEPT_BACKFILL_STATE.deepTried &&
    arr.length >= 30 &&
    missingIdCount >= Math.ceil(arr.length * 0.4);

  function paintWatchPopupUi() {
    syncInterceptMapDiagFromSnapshot(watchSnapshot);
    STORY_AVATAR_DIAG_STATE.total = arr.length;
    STORY_AVATAR_DIAG_STATE.withUid = countEntriesWithUserId(arr);
    STORY_AVATAR_DIAG_STATE.withAvatar = countEntriesWithAvatar(arr);
    STORY_AVATAR_DIAG_STATE.uniqueAvatar = countUniqueAvatarEntries(arr);
    {
      const resolvedAvatar = countResolvedAvatarEntries(arr, lv);
      STORY_AVATAR_DIAG_STATE.resolvedAvatar = resolvedAvatar.total;
      STORY_AVATAR_DIAG_STATE.resolvedUniqueAvatar = resolvedAvatar.unique;
    }
    STORY_AVATAR_DIAG_STATE.selfShown = countOwnPostedEntries(arr, lv);
    STORY_AVATAR_DIAG_STATE.selfSaved = countSavedOwnPostedEntries(arr);
    STORY_AVATAR_DIAG_STATE.selfPending = countPendingSelfPostedRecentsForLive(lv);
    STORY_AVATAR_DIAG_STATE.selfPendingMatched = getOwnPostedMatchedIdSet(arr, lv).size;
    const displayEntries = buildDisplayCommentEntries(arr, lv);
    STORY_AVATAR_DIAG_STATE.selfShown = countOwnPostedEntries(displayEntries, lv);
    setCountDisplay(String(displayEntries.length), watchSnapshot);
    renderCommentTicker(/** @type {PopupCommentEntry[]} */ (displayEntries));
    exportBtn.disabled = false;
    exportBtn.dataset.liveId = lv;
    exportBtn.dataset.storageKey = key;
    exportBtn.dataset.watchUrl = url;
    if (captureBtn) {
      captureBtn.disabled = false;
      captureBtn.dataset.watchUrl = url;
    }
    if (postBtn) postBtn.disabled = COMMENT_POST_UI_STATE.submitting;
    setReloadWatchTabUiDisabled(false);
    syncVoiceCommentButton();
    if (commentInput) {
      commentInput.placeholder = 'コメントを入力して送信';
    }
    syncStorySourceEntries(lv, displayEntries);
    renderUserRooms(arr, lv);
    renderCharacterScene({
      hasWatch: true,
      recording: toggle.checked,
      commentCount: displayEntries.length,
      liveId: lv,
      snapshot: watchSnapshot
    });
    renderWatchMetaCard(watchSnapshot, arr);
    const growthEl = /** @type {HTMLElement|null} */ ($('sceneStoryGrowth'));
    if (growthEl) patchStoryGrowthIconsFromSource(growthEl);

    renderDevMonitorPanel({
      snapshot: watchSnapshot,
      liveId: lv,
      displayCount: displayEntries.length,
      storageCount: arr.length,
      avatarStats: summarizeStoredCommentAvatarStats(arr),
      profileGaps: summarizeStoredCommentProfileGaps(arr)
    });
    updateCommentVelocityLine(
      /** @type {PopupCommentEntry[]} */ (displayEntries)
    );
  }

  if (!snapshotCacheHit) {
    paintWatchPopupUi();
    markPopupRefreshContentPainted();
    const snapResult = await requestWatchPageSnapshotFromOpenTab(url);
    watchMetaCache.snapshot = snapResult.snapshot;
    watchSnapshot = watchMetaCache.snapshot;
    const strippedAfterSnap = stripViewerAvatarContamination(
      arr,
      lv,
      watchSnapshot
    );
    if (strippedAfterSnap.patched > 0) {
      arr = strippedAfterSnap.next;
      await storageSetSafe({ [key]: arr });
    }
    STORY_AVATAR_DIAG_STATE.stripped += strippedAfterSnap.patched;
  }

  const refreshGen = ++watchPopupRefreshGeneration;

  if (thumbCountEl) thumbCountEl.textContent = '…';
  paintWatchPopupUi();
  markPopupRefreshContentPainted();
  scheduleDeferredUserCommentProfileHydrate({
    refreshGen,
    commentsKey: key,
    getArr: () => arr,
    setArr: (next) => {
      arr = next;
    },
    paint: () => paintWatchPopupUi()
  });
  void maybeFlushBroadcastSessionSummarySample({
    liveId: lv,
    watchUrl: url,
    comments: arr,
    snapshot: watchSnapshot,
    recording: toggle.checked
  });
  void renderSessionSummaryComparePanel(lv);
  void renderGiftQuickStatsPanel(lv);

  void (async () => {
    try {
      if (refreshGen !== watchPopupRefreshGeneration) return;
      const interceptResult = await requestInterceptCacheFromOpenTab(url, {
        deep: shouldDeep
      });
      const interceptItems = interceptResult.items;
      const interceptDiag = interceptResult.diag;
      if (refreshGen !== watchPopupRefreshGeneration) return;
      if (shouldDeep) {
        INTERCEPT_BACKFILL_STATE.deepTried = true;
      }
      STORY_AVATAR_DIAG_STATE.interceptExportRows = interceptItems.length;
      STORY_AVATAR_DIAG_STATE.interceptExportCode = interceptDiag.code;
      STORY_AVATAR_DIAG_STATE.interceptExportDetail = interceptDiag.detail || '';
      syncInterceptMapDiagFromSnapshot(watchSnapshot);
      if (interceptItems.length > 0) {
        STORY_AVATAR_DIAG_STATE.interceptItems = interceptItems.length;
        STORY_AVATAR_DIAG_STATE.interceptWithUid = interceptItems.reduce(
          (sum, it) => (it.uid ? sum + 1 : sum),
          0
        );
        STORY_AVATAR_DIAG_STATE.interceptWithAvatar = interceptItems.reduce(
          (sum, it) => (it.av ? sum + 1 : sum),
          0
        );
        const suspectUidSet = new Set(
          [
            String(watchSnapshot?.viewerUserId || '').trim(),
            String(watchSnapshot?.broadcasterUserId || '').trim()
          ].filter(Boolean)
        );
        const merged = mergeCommentsWithInterceptCache(arr, interceptItems, {
          preferInterceptUidSet: suspectUidSet
        });
        STORY_AVATAR_DIAG_STATE.mergedPatched = merged.patched;
        STORY_AVATAR_DIAG_STATE.mergedUidReplaced = merged.uidReplaced;
        if (merged.patched > 0) {
          arr = merged.next;
        }
        let interceptCacheTouched = false;
        for (const it of interceptItems) {
          if (upsertUserCommentProfileFromIntercept(popupUserCommentProfileMap, it)) {
            interceptCacheTouched = true;
          }
        }
        const profAfterIntercept = popupMergeUserCommentProfileCache(arr);
        arr = profAfterIntercept.arr;
        if (
          merged.patched > 0 ||
          profAfterIntercept.commentsPatched ||
          profAfterIntercept.cacheTouched ||
          interceptCacheTouched
        ) {
          const saveIc = {};
          if (merged.patched > 0 || profAfterIntercept.commentsPatched) {
            saveIc[key] = arr;
          }
          if (
            profAfterIntercept.cacheTouched ||
            interceptCacheTouched
          ) {
            saveIc[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
          }
          if (Object.keys(saveIc).length) {
            await storageSetSafe(saveIc);
          }
        }
      } else {
        STORY_AVATAR_DIAG_STATE.interceptItems = 0;
        STORY_AVATAR_DIAG_STATE.interceptWithUid = 0;
        STORY_AVATAR_DIAG_STATE.interceptWithAvatar = 0;
      }
      const reconciledOwnPosted = reconcileStoredOwnPostedEntries(arr, lv);
      if (reconciledOwnPosted.changed || reconciledOwnPosted.pendingChanged) {
        arr = reconciledOwnPosted.next;
        selfPostedRecentsCache = reconciledOwnPosted.remaining;
        await storageSetSafe({
          [key]: arr,
          [KEY_SELF_POSTED_RECENTS]: { items: selfPostedRecentsCache }
        });
      }
      if (refreshGen !== watchPopupRefreshGeneration) return;
      const stats = /** @type {{ ok?: boolean, count?: number }|null} */ (
        await sendMessageToWatchTabs(url, { type: 'NLS_THUMB_STATS' })
      );
      if (refreshGen !== watchPopupRefreshGeneration) return;
      if (thumbCountEl) {
        thumbCountEl.textContent =
          stats && stats.ok === true && typeof stats.count === 'number'
            ? String(stats.count)
            : '0';
      }
      paintWatchPopupUi();
    } catch (e) {
      if (isExtensionContextInvalidatedError(e)) {
        renderExtensionContextBanner(true);
        return;
      }
      if (thumbCountEl && refreshGen === watchPopupRefreshGeneration) {
        thumbCountEl.textContent = '0';
      }
    }
  })();
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) {
      renderExtensionContextBanner(true);
      return;
    }
    throw e;
  }
}

/** @param {number|string} value */
function formatDateTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '-';
  try {
    return new Date(n).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return '-';
  }
}

/**
 * pathname+search が一致するタブを優先（別クエリの同 lv タブより先）
 * @param {{ id: number, url: string }[]} candidates
 * @param {string} watchUrl
 */
function prioritizeWatchTabCandidates(candidates, watchUrl) {
  const w = String(watchUrl || '').trim();
  if (!w) return candidates;
  try {
    const ref = new URL(w);
    const refKey = `${ref.pathname.replace(/\/$/, '')}${ref.search}`;
    return [...candidates].sort((a, b) => {
      const rank = (url) => {
        try {
          const u = new URL(url);
          const k = `${u.pathname.replace(/\/$/, '')}${u.search}`;
          return k === refKey ? 0 : 1;
        } catch {
          return 2;
        }
      };
      return rank(a.url) - rank(b.url);
    });
  } catch {
    return candidates;
  }
}

/**
 * 対象 watch と同じ lv のタブだけ集める（前面が別放送なら除外）
 * @param {string} watchUrl
 */
async function collectWatchTabCandidates(watchUrl) {
  /** @type {{ id: number, url: string }[]} */
  const out = [];
  const w = String(watchUrl || '').trim();
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const tryAdd = (/** @type {chrome.tabs.Tab|undefined} */ tab) => {
    if (!tab?.id || typeof tab.url !== 'string') return;
    if (!isNicoLiveWatchUrl(tab.url)) return;
    if (w && !watchPageUrlsMatchForSnapshot(tab.url, w)) return;
    if (out.some((x) => x.id === tab.id)) return;
    out.push({ id: tab.id, url: tab.url });
  };

  tryAdd(activeTab);

  if (w) {
    try {
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) tryAdd(tab);
    } catch {
      // tabs 権限なし
    }
  }

  return prioritizeWatchTabCandidates(out, w);
}

/**
 * コメント送信先の watch タブを再読み込み（tabs 権限なしで scripting + host 権限を利用）
 * @param {string} watchUrl
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function reloadWatchTabForUrl(watchUrl) {
  const w = String(watchUrl || '').trim();
  if (!w || !isNicoLiveWatchUrl(w)) {
    return { ok: false, error: 'watchページが見つかりません。' };
  }
  const candidates = await collectWatchTabCandidates(w);
  for (const c of candidates) {
    try {
      await chrome.tabs.reload(c.id);
      return { ok: true };
    } catch {
      // tabs.reload 失敗 → scripting でフォールバック
      try {
        await chrome.scripting.executeScript({
          target: { tabId: c.id },
          func: () => { globalThis.location.reload(); }
        });
        return { ok: true };
      } catch {
        // 次の候補
      }
    }
  }
  return {
    ok: false,
    error: 'watchタブの再読み込みに失敗しました。タブを手動で更新してください。'
  };
}

/** メイン送信横とパネル内の再読み込みボタンを同じ disabled にそろえる */
function setReloadWatchTabUiDisabled(disabled) {
  const v = Boolean(disabled);
  const main = /** @type {HTMLButtonElement|null} */ ($('reloadWatchTabBtn'));
  const panel = /** @type {HTMLButtonElement|null} */ ($('reloadWatchTabPanelBtn'));
  if (main) main.disabled = v;
  if (panel) panel.disabled = v;
}

let _reloadWatchTabFromPopupInFlight = false;

/**
 * watch タブ再読み込み（UI 共通。dataset.watchUrl が空なら何もしない）
 */
async function triggerReloadWatchTabFromPopup() {
  const exportBtnEl = /** @type {HTMLButtonElement|null} */ ($('exportJson'));
  const watchUrl = exportBtnEl?.dataset.watchUrl || '';
  if (!watchUrl || _reloadWatchTabFromPopupInFlight) return;
  _reloadWatchTabFromPopupInFlight = true;
  setReloadWatchTabUiDisabled(true);
  setPostStatus('watchページを再読み込みしています…', 'idle');
  try {
    const r = await reloadWatchTabForUrl(watchUrl);
    if (r.ok) {
      setPostStatus(
        '再読み込みを実行しました。数秒後にポップアップを開き直すと反映されます。',
        'success'
      );
    } else {
      setPostStatus(
        withCommentSendTroubleshootHint(r.error || '再読み込みに失敗しました。'),
        'error'
      );
    }
  } catch {
    setPostStatus(
      withCommentSendTroubleshootHint('再読み込みに失敗しました。'),
      'error'
    );
  } finally {
    _reloadWatchTabFromPopupInFlight = false;
    setReloadWatchTabUiDisabled(false);
  }
}

/**
 * 全フレームをスコア付けし innerText 断片を返す（about:blank の子フレームも含む）
 * @param {number} tabId
 * @returns {Promise<{ frameId: number, score: number, text: string }[]>}
 */
async function listWatchFramesWithInnerText(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const href = String(location.href || '');
        const panel = !!(
          document.querySelector('.ga-ns-comment-panel') ||
          document.querySelector('.comment-panel') ||
          document.querySelector('[class*="comment-data-grid"]')
        );
        const hasVideo = !!document.querySelector('video');
        const inner = document.body?.innerText || '';
        const len = inner.length;
        const text = inner.slice(0, 120_000);
        const score =
          (panel ? 8_000_000 : 0) +
          (hasVideo ? 400_000 : 0) +
          Math.min(len, 5_000_000) +
          (/\/watch\/lv\d+/i.test(href) ? 50_000 : 0) +
          (href.includes('nicovideo.jp') && href.includes('watch') ? 25_000 : 0);
        return { score, text, href };
      }
    });
    /** @type {{ frameId: number, score: number, text: string }[]} */
    const out = [];
    for (const row of results || []) {
      const res = row?.result;
      if (!res || typeof res.score !== 'number') continue;
      const fid = typeof row.frameId === 'number' ? row.frameId : 0;
      out.push({
        frameId: fid,
        score: res.score,
        text: String(res.text || '')
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  } catch {
    return [];
  }
}

/**
 * innerText 断片から視聴者数を拾う（content より先にポップアップ側で試す）
 * @param {{ frameId: number, score: number, text: string }[]} frames
 * @returns {number|null}
 */
function probeViewerCountFromFrameTexts(frames) {
  for (const f of frames) {
    const n = parseViewerCountFromLooseText(f.text);
    if (n != null) return n;
  }
  return null;
}

/**
 * @param {WatchPageSnapshot} snap
 * @param {number|null} probe
 */
function mergeViewerProbeIntoSnapshot(snap, probe) {
  if (!snap || probe == null) return snap;
  const cur = snap.viewerCountFromDom;
  if (typeof cur === 'number' && Number.isFinite(cur) && cur >= 0) return snap;
  return { ...snap, viewerCountFromDom: probe };
}

/**
 * content script 注入直後はReceiving end does not existになりやすいので再試行
 * @param {number} tabId
 * @param {object} message
 * @param {{ maxAttempts?: number, delayMs?: number, frameId?: number }} [retryOpts]
 */
async function tabsSendMessageWithRetry(tabId, message, retryOpts = {}) {
  const max = retryOpts.maxAttempts ?? 8;
  const delayMs = retryOpts.delayMs ?? 75;
  const frameId = retryOpts.frameId !== undefined ? retryOpts.frameId : 0;
  const opts = { frameId };
  /** @type {unknown} */
  let lastErr = null;
  for (let i = 0; i < max; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message, opts);
    } catch (e) {
      lastErr = e;
      if (i < max - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

/**
 * @param {string} watchUrl
 * @returns {Promise<{ snapshot: WatchPageSnapshot|null, error: string }>}
 */
async function requestWatchPageSnapshotFromOpenTab(watchUrl) {
  const candidates = await collectWatchTabCandidates(watchUrl);

  if (!candidates.length) {
    return {
      snapshot: null,
      error: 'watchタブが見つからないため、head情報は取得できませんでした。'
    };
  }

  for (const candidate of candidates) {
    try {
      const ranked = await listWatchFramesWithInnerText(candidate.id);
      const viewerProbe = probeViewerCountFromFrameTexts(ranked);
      const tried = new Set();
      const tryOrder = [
        ...ranked.map((r) => r.frameId),
        0
      ];
      for (const fid of tryOrder) {
        if (tried.has(fid)) continue;
        tried.add(fid);
        try {
          const res = await tabsSendMessageWithRetry(
            candidate.id,
            { type: 'NLS_EXPORT_WATCH_SNAPSHOT' },
            { frameId: fid, maxAttempts: 5, delayMs: 90 }
          );
          if (res?.ok && res.snapshot) {
            const merged = mergeViewerProbeIntoSnapshot(
              /** @type {WatchPageSnapshot} */ (res.snapshot),
              viewerProbe
            );
            return { snapshot: merged, error: '' };
          }
        } catch {
          // 次の frameId
        }
      }
    } catch {
      // try next candidate tab
    }
  }

  return {
    snapshot: null,
    error:
      'watchページからの情報取得に失敗しました。放送タブを開いた状態でポップアップを再度開いてください。'
  };
}

/**
 * @param {string} text
 * @param {string} watchUrl
 * @returns {Promise<{ ok: boolean, error: string }>}
 */
async function requestPostCommentToOpenTab(text, watchUrl) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'コメントが空です。' };
  }

  const candidates = await collectWatchTabCandidates(watchUrl);

  if (!candidates.length) {
    return {
      ok: false,
      error: 'watchタブが見つかりません。放送タブを開いてから送信してください。'
    };
  }

  /** @type {string} */
  let lastDetail = '';
  for (const candidate of candidates) {
    try {
      const ranked = await listWatchFramesWithInnerText(candidate.id);
      const tried = new Set();
      const tryOrder = [...ranked.map((r) => r.frameId), 0];
      for (const fid of tryOrder) {
        if (tried.has(fid)) continue;
        tried.add(fid);
        try {
          const res = await tabsSendMessageWithRetry(
            candidate.id,
            {
              type: 'NLS_POST_COMMENT',
              text: trimmed
            },
            { frameId: fid, maxAttempts: 5, delayMs: 120 }
          );
          if (res?.ok) {
            return { ok: true, error: '' };
          }
          if (res && typeof res === 'object' && 'error' in res && res.error) {
            lastDetail = String(res.error);
          }
        } catch (e) {
          const msg =
            e && typeof e === 'object' && 'message' in e
              ? String(/** @type {{ message?: unknown }} */ (e).message || '')
              : String(e || '');
          if (msg) lastDetail = msg;
        }
      }
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String(/** @type {{ message?: unknown }} */ (e).message || '')
          : String(e || '');
      if (msg) lastDetail = msg;
    }
  }

  return {
    ok: false,
    error: lastDetail
      ? `コメント送信に失敗しました。（${lastDetail}）`
      : 'コメント送信に失敗しました。放送タブを再読み込みして再試行してください。'
  };
}

/** @param {string} key */
function isFriendlyHtmlReportMetaKey(key) {
  const k = String(key || '').toLowerCase().trim();
  if (
    k === 'description' ||
    k === 'keywords' ||
    k === 'og:title' ||
    k === 'og:description' ||
    k === 'og:image' ||
    k === 'og:url' ||
    k === 'og:site_name' ||
    k === 'og:type' ||
    k === 'twitter:title' ||
    k === 'twitter:description' ||
    k.startsWith('twitter:image')
  ) {
    return true;
  }
  return false;
}

/** @param {string} key */
function friendlyHtmlReportMetaLabel(key) {
  const k = String(key || '').toLowerCase().trim();
  const labels = {
    description: 'ページ説明（meta）',
    keywords: 'キーワード（meta）',
    'og:title': 'シェア用タイトル（Open Graph）',
    'og:description': 'シェア用説明（Open Graph）',
    'og:image': 'シェア用画像URL（Open Graph）',
    'og:url': '正規URL（Open Graph）',
    'og:site_name': 'サイト名（Open Graph）',
    'og:type': '種類（Open Graph）',
    'twitter:title': 'シェア用タイトル（X）',
    'twitter:description': 'シェア用説明（X）'
  };
  if (k.startsWith('twitter:image')) return 'シェア用画像（X）';
  return labels[k] || key;
}

/**
 * @param {{ key: string, value: string }[]|undefined} metas
 * @returns {{ friendly: { key: string, value: string }[], technical: { key: string, value: string }[] }}
 */
function partitionMetasForHtmlReport(metas) {
  const all = Array.isArray(metas) ? metas : [];
  /** @type {{ key: string, value: string }[]} */
  const friendly = [];
  /** @type {{ key: string, value: string }[]} */
  const technical = [];
  for (const v of all) {
    if (!v || !String(v.key || '').trim()) continue;
    if (isFriendlyHtmlReportMetaKey(v.key)) friendly.push(v);
    else technical.push(v);
  }
  return { friendly, technical };
}

/** HTMLレポート用（保存ファイルに埋め込むため data URL 化する） */
const YUKKURI_REPORT_IMAGES = {
  rink: 'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png',
  konta: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png',
  tanu: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png'
};

/** @param {ArrayBuffer} buffer */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** @param {string} relativePath extension ルートからのパス */
async function fetchExtensionPngAsDataUrl(relativePath) {
  try {
    if (!chrome?.runtime?.getURL) return '';
    const url = chrome.runtime.getURL(relativePath);
    const res = await fetch(url);
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    return `data:image/png;base64,${arrayBufferToBase64(buf)}`;
  } catch {
    return '';
  }
}

/**
 * @param {string} dataUrl
 * @param {string} fallbackClass
 * @param {string} fallbackChar
 */
function yukkuriReportAvatarHtml(dataUrl, fallbackClass, fallbackChar) {
  if (dataUrl) {
    return `<img class="yukkuri-avatar-img" src="${escapeAttr(dataUrl)}" alt="" width="72" height="72" decoding="async" />`;
  }
  return `<div class="yukkuri-avatar ${fallbackClass}" aria-hidden="true">${escapeHtml(fallbackChar)}</div>`;
}

/**
 * @param {PopupCommentEntry[]} comments
 * @param {WatchPageSnapshot|null} snapshot
 * @param {string} snapshotError
 * @param {string} liveId
 * @param {string} watchUrl
 * @returns {Promise<string>}
 */
async function buildHtmlReportDocument(
  comments,
  snapshot,
  snapshotError,
  liveId,
  watchUrl
) {
  const exportedAtIso = new Date().toISOString();
  const exportedAtJst = formatDateTime(Date.now());
  const safeLiveId = escapeHtml(liveId);
  const safeWatchUrl = escapeHtml(watchUrl || snapshot?.url || '-');
  const safeTitle = escapeHtml(snapshot?.title || '-');
  const safeBroadcastTitle = escapeHtml(
    snapshot?.broadcastTitle || snapshot?.title || '-'
  );
  const safeBroadcasterName = escapeHtml(snapshot?.broadcasterName || '-');
  const safeStartAtText = escapeHtml(snapshot?.startAtText || '-');
  const safeThumbnailUrl = escapeAttr(snapshot?.thumbnailUrl || '');
  const safeSnapshotError = snapshotError ? escapeHtml(snapshotError) : '';
  const tags = Array.isArray(snapshot?.tags)
    ? snapshot.tags.filter((v) => String(v || '').trim())
    : [];

  const [dataRink, dataKonta, dataTanu] = await Promise.all([
    fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.rink),
    fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.konta),
    fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.tanu)
  ]);
  const avatarRink = yukkuriReportAvatarHtml(dataRink, 'yukkuri-avatar--rink', 'り');
  const avatarKonta = yukkuriReportAvatarHtml(dataKonta, 'yukkuri-avatar--konta', 'こ');
  const avatarTanu = yukkuriReportAvatarHtml(dataTanu, 'yukkuri-avatar--tanu', 'た');
  const yukkuriAvatars = {
    avatarRinkHtml: avatarRink,
    avatarKontaHtml: avatarKonta,
    avatarTanuHtml: avatarTanu
  };
  const htmlReportConceptGuideCardHtml =
    buildHtmlReportConceptGuideCardHtml(yukkuriAvatars);
  const htmlReportSaveGuideCardHtml =
    buildHtmlReportSaveGuideCardHtml(yukkuriAvatars);

  const roomRows = aggregateCommentsByUser(comments).map((room) => {
    const label = displayUserLabel(room.userKey, room.nickname);
    const search = escapeAttr(
      `${label} ${room.nickname || ''} ${room.userKey} ${room.lastText || ''} ${room.count}`.toLowerCase()
    );
    return `
      <tr class="search-item" data-search="${search}">
        <td>${escapeHtml(label)}</td>
        <td>${room.count}</td>
        <td>${escapeHtml(room.lastText || '')}</td>
      </tr>
    `;
  });

  const commentRows = comments.map((c, idx) => {
    const commentNo = String(c.commentNo || '').trim();
    const text = String(c.text || '').trim();
    const userId = c.userId ? String(c.userId) : '';
    const userLabel = displayUserLabel(userId || UNKNOWN_USER_KEY);
    const search = escapeAttr(
      `${commentNo} ${text} ${userId} ${userLabel} ${c.liveId || ''}`.toLowerCase()
    );
    return `
      <tr class="search-item" data-search="${search}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(commentNo || '-')}</td>
        <td>${escapeHtml(userLabel)}</td>
        <td>${escapeHtml(text || '-')}</td>
        <td>${escapeHtml(formatDateTime(c.capturedAt || 0))}</td>
      </tr>
    `;
  });

  /** @param {{ rel: string, href: string, as: string, type: string }[]} links */
  const linkRows = (links) =>
    links.map((v) => {
      const search = escapeAttr(
        `${v.rel} ${v.href} ${v.as} ${v.type}`.toLowerCase()
      );
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.rel)}</td>
          <td>${escapeHtml(v.href || '-')}</td>
          <td>${escapeHtml(v.as || '-')}</td>
          <td>${escapeHtml(v.type || '-')}</td>
        </tr>
      `;
    });

  /** @param {{ key: string, value: string }[]} metas */
  const metaRows = (metas) =>
    metas.map((v) => {
      const search = escapeAttr(`${v.key} ${v.value}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.key)}</td>
          <td>${escapeHtml(v.value || '-')}</td>
        </tr>
      `;
    });

  /** @param {{ src: string, type: string }[]} scripts */
  const scriptRows = (scripts) =>
    scripts.map((v) => {
      const search = escapeAttr(`${v.src} ${v.type}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.type || 'text/javascript')}</td>
          <td>${escapeHtml(v.src || '-')}</td>
        </tr>
      `;
    });

  /** @param {{ text: string, href: string }[]} links */
  const noopenerRows = (links) =>
    links.map((v) => {
      const search = escapeAttr(`${v.text} ${v.href}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.text || '-')}</td>
          <td>${escapeHtml(v.href || '-')}</td>
        </tr>
      `;
    });

  const headLinkRows = snapshot ? linkRows(snapshot.links) : [];
  const { friendly: friendlyMetas, technical: technicalMetas } =
    partitionMetasForHtmlReport(snapshot?.metas);
  const friendlyMetaRowsHtml = friendlyMetas.map((v) => {
    const label = friendlyHtmlReportMetaLabel(v.key);
    const search = escapeAttr(`${v.key} ${v.value} ${label}`.toLowerCase());
    return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(label)}</td>
          <td class="mono">${escapeHtml(v.value || '-')}</td>
        </tr>`;
  });
  const headTechnicalMetaRows = metaRows(technicalMetas);
  const headScriptRows = snapshot ? scriptRows(snapshot.scripts) : [];
  const headNoopenerRows = snapshot ? noopenerRows(snapshot.noopenerLinks) : [];

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>君斗りんくの追憶のきらめき レポート ${safeLiveId}</title>
    <style>
      :root {
        --bg: #0b1220;
        --panel: #111b2e;
        --panel-border: #1f2a44;
        --text: #e2e8f0;
        --muted: #93a4be;
        --accent: #38bdf8;
        --chip: #1d4ed8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Noto Sans JP", sans-serif;
        color: var(--text);
        background: linear-gradient(160deg, #0b1220, #0f172a 45%, #111827);
      }
      .wrap { max-width: 1200px; margin: 0 auto; padding: 20px 16px 32px; }
      .hero {
        background: linear-gradient(130deg, #0369a1, #0e7490);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 14px;
        padding: 14px 16px;
        margin-bottom: 14px;
      }
      .hero h1 { margin: 0; font-size: 1.15rem; }
      .hero p { margin: 6px 0 0; font-size: 0.86rem; opacity: 0.96; }
      .search-box {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 14px;
      }
      .search-box input {
        width: 100%;
        border-radius: 10px;
        border: 1px solid #334155;
        background: #0f172a;
        color: var(--text);
        padding: 10px 12px;
        font-size: 14px;
      }
      .search-box .hint { margin-top: 7px; color: var(--muted); font-size: 12px; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
      section.card {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 12px;
      }
      section.card h2 {
        margin: 0 0 10px;
        font-size: 0.95rem;
        color: #f8fafc;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th, td {
        border-bottom: 1px solid #24324f;
        text-align: left;
        vertical-align: top;
        padding: 7px 6px;
      }
      th { color: #bfdbfe; font-weight: 700; font-size: 11px; }
      td { color: var(--text); }
      .pill {
        display: inline-block;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        background: var(--chip);
        color: #fff;
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        word-break: break-all;
      }
      .thumb-wrap {
        width: 100%;
        max-width: 320px;
        border-radius: 10px;
        border: 1px solid #2f3f61;
        overflow: hidden;
        background: #0b1220;
      }
      .thumb-wrap img {
        display: block;
        width: 100%;
        height: auto;
      }
      .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tag-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: #1e3a8a;
        color: #dbeafe;
        font-size: 11px;
        line-height: 1.2;
      }
      .warn {
        margin-top: 10px;
        border-radius: 10px;
        border: 1px solid #7f1d1d;
        background: #450a0a;
        color: #fecaca;
        padding: 10px;
        font-size: 12px;
      }
      .footer-note {
        margin-top: 16px;
        color: var(--muted);
        font-size: 11px;
      }
      .guide-lead {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 0.88rem;
        line-height: 1.45;
      }
      .yukkuri-guide-card .guide-lead {
        color: #cbd5e1;
        font-size: clamp(0.85rem, 2.2vw, 0.93rem);
        line-height: 1.62;
        max-width: 52rem;
      }
      .yukkuri-guide-card h2 { margin-bottom: 6px; }
      .yukkuri-guide {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .yukkuri-row {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px;
      }
      /* 右寄せアバターは本文列が極端に狭くなり日本語が崩れるため、常に左アバター＋右本文 */
      .yukkuri-row--reverse {
        flex-direction: row;
      }
      .yukkuri-avatar {
        width: clamp(48px, 12vw, 56px);
        height: clamp(48px, 12vw, 56px);
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: clamp(1rem, 3.5vw, 1.2rem);
        color: #0f172a;
        border: 2px solid rgba(255, 255, 255, 0.28);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      }
      .yukkuri-avatar--rink {
        background: linear-gradient(145deg, #fecdd3, #fda4af);
      }
      .yukkuri-avatar--konta {
        background: linear-gradient(145deg, #bbf7d0, #4ade80);
      }
      .yukkuri-avatar--tanu {
        background: linear-gradient(145deg, #fde68a, #fbbf24);
      }
      .yukkuri-avatar-img {
        width: clamp(52px, 14vw, 72px);
        height: auto;
        max-height: 72px;
        object-fit: contain;
        flex-shrink: 0;
        border-radius: 10px;
        filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
      }
      .speech-bubble {
        flex: 1 1 min(100%, 280px);
        min-width: 0;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 14px;
        padding: 10px 14px;
        font-size: clamp(0.82rem, 2.4vw, 0.9rem);
        line-height: 1.5;
      }
      /* キャラ名は直下の strong のみブロック（本文内の strong はインラインのまま） */
      .speech-bubble > strong {
        display: block;
        margin-bottom: 6px;
        color: #e0f2fe;
        font-size: clamp(0.78rem, 2.2vw, 0.85rem);
      }
      .speech-bubble p strong {
        display: inline;
        color: #f0f9ff;
        font-weight: 700;
      }
      .speech-bubble p {
        margin: 0;
        color: var(--text);
        word-break: normal;
        overflow-wrap: break-word;
        line-height: 1.65;
      }
      .speech-bubble p + p {
        margin-top: 10px;
      }
      details.concept-read-more {
        margin-top: 10px;
        background: #0f172a;
        border: 1px solid #475569;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 1px 0 rgb(148 163 184 / 12%);
      }
      details.concept-read-more:first-of-type {
        margin-top: 12px;
      }
      .concept-read-more__summary {
        cursor: pointer;
        list-style: none;
        padding: clamp(11px, 2.5vw, 14px) clamp(12px, 3.5vw, 18px);
        font-weight: 700;
        color: #f8fafc;
        background: #1e293b;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        font-size: clamp(0.84rem, 2.5vw, 0.95rem);
        line-height: 1.4;
      }
      .concept-read-more__summary::-webkit-details-marker {
        display: none;
      }
      .concept-read-more__summary::before {
        content: '';
        width: 0.45em;
        height: 0.45em;
        border-right: 2.5px solid #38bdf8;
        border-bottom: 2.5px solid #38bdf8;
        transform: rotate(-45deg);
        flex-shrink: 0;
        margin-top: 0.05em;
        transition: transform 0.15s ease;
      }
      details.concept-read-more[open] .concept-read-more__summary::before {
        transform: rotate(45deg);
        margin-top: 0.15em;
      }
      .concept-read-more__summary:focus-visible {
        outline: 2px solid #7dd3fc;
        outline-offset: 2px;
      }
      .concept-read-more__tag {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #0284c7;
        color: #ffffff;
        font-size: clamp(0.7rem, 2vw, 0.78rem);
        font-weight: 800;
        letter-spacing: 0.02em;
        border: 1px solid rgb(125 211 252 / 35%);
      }
      .concept-read-more__title {
        flex: 1 1 min(100%, 14rem);
        min-width: 0;
        color: #f1f5f9;
      }
      .concept-read-more__body {
        padding: clamp(14px, 3.2vw, 22px) clamp(12px, 4vw, 26px) clamp(16px, 3.5vw, 24px);
        border-top: 1px solid #475569;
        max-width: 52rem;
        margin: 0 auto;
        box-sizing: border-box;
      }
      .concept-read-more__prose {
        margin: 0 0 clamp(10px, 2vw, 14px);
        color: #e2e8f0;
        font-size: clamp(0.84rem, 2.4vw, 0.92rem);
        line-height: 1.72;
      }
      .concept-read-more__prose strong {
        color: #f8fafc;
        font-weight: 700;
      }
      .concept-read-more__prose a,
      .concept-read-more__body a {
        color: #7dd3fc;
        font-weight: 600;
        text-decoration: underline;
        text-decoration-thickness: 1.5px;
        text-underline-offset: 3px;
      }
      .concept-read-more__prose a:hover,
      .concept-read-more__body a:hover {
        color: #bae6fd;
      }
      .concept-read-more__prose a:focus-visible,
      .concept-read-more__body a:focus-visible {
        outline: 2px solid #7dd3fc;
        outline-offset: 2px;
        border-radius: 2px;
      }
      .concept-read-more__body .speech-bubble p {
        line-height: 1.75;
      }
      /* アコーディオン内: 折り返しで1文字行・読点頭などを防ぐ（reverse で狭い列にならない） */
      .concept-read-more__body .yukkuri-row {
        flex-wrap: nowrap;
        width: 100%;
        align-items: flex-start;
      }
      .concept-read-more__body .speech-bubble {
        flex: 1 1 0;
        min-width: 0;
        max-width: 100%;
        padding: 12px 16px;
      }
      .concept-read-more__body .yukkuri-avatar,
      .concept-read-more__body .yukkuri-avatar-img {
        flex-shrink: 0;
      }
      .concept-read-more__prose:last-child {
        margin-bottom: 0;
      }
      @media (max-width: 420px) {
        .concept-read-more__summary {
          flex-direction: column;
          align-items: flex-start;
        }
        .concept-read-more__summary::before {
          align-self: flex-start;
          margin-top: 4px;
        }
      }
      details.tech-dump {
        margin-top: 12px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        overflow: hidden;
      }
      details.tech-dump > summary {
        cursor: pointer;
        list-style: none;
        padding: 12px 14px;
        font-weight: 700;
        color: #bae6fd;
        background: rgba(15, 23, 42, 0.72);
      }
      details.tech-dump > summary::-webkit-details-marker {
        display: none;
      }
      .tech-dump-inner {
        padding: 12px 14px 16px;
        border-top: 1px solid var(--panel-border);
      }
      .tech-dump-hint {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 0.82rem;
        line-height: 1.45;
      }
      .tech-dump-inner h3 {
        margin: 16px 0 8px;
        font-size: 0.82rem;
        color: #94a3b8;
        font-weight: 700;
      }
      .tech-dump-inner h3:first-of-type {
        margin-top: 0;
      }
      .hide { display: none !important; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="hero">
        <h1>君斗りんくの追憶のきらめき HTMLレポート <span class="pill">${safeLiveId}</span></h1>
        <p>出力日時: ${escapeHtml(exportedAtJst)} / ISO: ${escapeHtml(exportedAtIso)}</p>
        <p class="mono">watch URL: ${safeWatchUrl}</p>
      </header>

      <div class="search-box">
        <input id="q" type="search" placeholder="タイトル・配信者・タグ・メタ・script・コメントを横断検索（例: 珈琲 / まめ。２ / コーヒー / og:title）">
        <div id="searchResult" class="hint">検索対象: <span id="totalCount">0</span> 件</div>
      </div>

      <div class="grid">
        <section class="card">
          <h2>概要</h2>
          <table>
            <tbody>
              <tr class="search-item" data-search="${escapeAttr(liveId.toLowerCase())}"><th>liveId</th><td class="mono">${safeLiveId}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcastTitle || '').toLowerCase())}"><th>放送タイトル</th><td>${safeBroadcastTitle}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcasterName || '').toLowerCase())}"><th>配信者名</th><td>${safeBroadcasterName}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.startAtText || '').toLowerCase())}"><th>開始時刻</th><td>${safeStartAtText}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.url || watchUrl || '').toLowerCase())}"><th>URL</th><td class="mono">${safeWatchUrl}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.title || '').toLowerCase())}"><th>Titleタグ</th><td>${safeTitle}</td></tr>
              <tr><th>保存コメント数</th><td>${comments.length}</td></tr>
              <tr><th>ユーザー別件数</th><td>${aggregateCommentsByUser(comments).length}</td></tr>
            </tbody>
          </table>
          <h2 style="margin-top:12px;">サムネイル</h2>
          ${
            safeThumbnailUrl
              ? `<div class="thumb-wrap search-item" data-search="${safeThumbnailUrl.toLowerCase()}"><img src="${safeThumbnailUrl}" alt="放送サムネイル"></div>`
              : '<div class="mono">取得なし</div>'
          }
          <h2 style="margin-top:12px;">タグ</h2>
          ${
            tags.length
              ? `<div class="tag-list">${tags
                  .map(
                    (tag) =>
                      `<span class="tag-chip search-item" data-search="${escapeAttr(
                        tag.toLowerCase()
                      )}">${escapeHtml(tag)}</span>`
                  )
                  .join('')}</div>`
              : '<div class="mono">取得なし</div>'
          }
          ${
            safeSnapshotError
              ? `<div class="warn">${safeSnapshotError}</div>`
              : ''
          }
        </section>

        <section class="card">
          <h2>ユーザー別（しおり集計）</h2>
          <table>
            <thead><tr><th>ユーザー</th><th>件数</th><th>最新コメント</th></tr></thead>
            <tbody>${roomRows.join('') || '<tr><td colspan="3">データなし</td></tr>'}</tbody>
          </table>
        </section>
      </div>
      ${htmlReportConceptGuideCardHtml}
      ${htmlReportSaveGuideCardHtml}

      <section class="card" style="margin-top:12px;">
        <h2>シェア・プレビュー向けの情報</h2>
        <p class="guide-lead">SNSやブラウザのプレビューに使われることが多い項目だけ、日本語の見出しに直して載せているのだ。</p>
        <table>
          <thead><tr><th>項目</th><th>内容</th></tr></thead>
          <tbody>${
            friendlyMetaRowsHtml.join('') ||
            '<tr><td colspan="2">このページからは取得できなかったのだ</td></tr>'
          }</tbody>
        </table>
      </section>

      <details class="tech-dump">
        <summary>ページの裏側データ（アプリ連携・調査用・上級者向け）— クリックで開く</summary>
        <div class="tech-dump-inner">
          <p class="tech-dump-hint">al:android や twitter:card など、ふだん読まなくてよい行が並ぶのだ。ページの解析やトラブル調査のときに使うのだ。</p>
          <h3>head 内の link（stylesheet / icon など）</h3>
          <table>
            <thead><tr><th>rel</th><th>href</th><th>as</th><th>type</th></tr></thead>
            <tbody>${headLinkRows.join('') || '<tr><td colspan="4">取得なし</td></tr>'}</tbody>
          </table>
          <h3>メタタグ全文（上記「シェア向け」以外）</h3>
          <table>
            <thead><tr><th>key</th><th>value</th></tr></thead>
            <tbody>${headTechnicalMetaRows.join('') || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
          <h3>script（src）</h3>
          <table>
            <thead><tr><th>type</th><th>src</th></tr></thead>
            <tbody>${headScriptRows.join('') || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
          <h3>noopener リンク</h3>
          <table>
            <thead><tr><th>text</th><th>href</th></tr></thead>
            <tbody>${headNoopenerRows.join('') || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
        </div>
      </details>

      <section class="card" style="margin-top:12px;">
        <h2>保存コメント一覧</h2>
        <table>
          <thead><tr><th>#</th><th>commentNo</th><th>user</th><th>text</th><th>capturedAt</th></tr></thead>
          <tbody>${commentRows.join('') || '<tr><td colspan="5">コメントなし</td></tr>'}</tbody>
        </table>
      </section>

      <p class="footer-note">
        このHTMLは「君斗りんくの追憶のきらめき」（開発識別子 nicolivelog）がローカル生成した振り返り用レポートです。ブラウザ内で検索して再利用できます。
      </p>
    </div>

    <script>
      (() => {
        const q = document.getElementById('q');
        const all = Array.from(document.querySelectorAll('.search-item'));
        const totalEl = document.getElementById('totalCount');
        const resultEl = document.getElementById('searchResult');
        const update = () => {
          const keyword = String(q.value || '').toLowerCase().trim();
          let visible = 0;
          for (const el of all) {
            const hay = String(el.getAttribute('data-search') || '').toLowerCase();
            const hit = !keyword || hay.includes(keyword);
            el.classList.toggle('hide', !hit);
            if (hit) visible++;
          }
          totalEl.textContent = String(all.length);
          resultEl.textContent = keyword
            ? '検索結果: ' + visible + ' / ' + all.length + ' 件'
            : '検索対象: ' + all.length + ' 件';
        };
        q.addEventListener('input', update);
        update();
      })();
    </script>
  </body>
</html>`;
}

/**
 * @param {string} liveId
 * @param {string} storageKey
 * @param {string} watchUrl
 */
async function downloadCommentsHtml(liveId, storageKey, watchUrl) {
  const data = await chrome.storage.local.get(storageKey);
  const comments = Array.isArray(data[storageKey])
    ? /** @type {PopupCommentEntry[]} */ (data[storageKey])
    : [];

  const { snapshot, error } = await requestWatchPageSnapshotFromOpenTab(watchUrl);
  const html = await buildHtmlReportDocument(
    comments,
    snapshot,
    error,
    liveId,
    watchUrl
  );

  const blob = new Blob([html], {
    type: 'text/html;charset=utf-8'
  });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `nicolivelog-${liveId}-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

/** コメント・ギフト・トレンド等の storage 連打で refresh が毎回走り、応援レーンが激しくちらつくのを防ぐ */
let storageRefreshCoalesceTimer = null;
/** コメント連打で onChanged が途切れないとき、デバウンスだけだと refresh が永遠に遅延するのを防ぐ */
let storageRefreshMaxWaitTimer = null;
const STORAGE_REFRESH_COALESCE_MS = 550;
const STORAGE_REFRESH_MAX_WAIT_MS = 2200;

/** @param {string} key */
function isHighFrequencyCommentRelatedStorageKey(key) {
  const k = String(key || '');
  if (/^nls_comments_/i.test(k)) return true;
  if (/^nls_gift_users_/i.test(k)) return true;
  if (k === KEY_SELF_POSTED_RECENTS) return true;
  if (k.startsWith(KEY_DEV_MONITOR_TREND_PREFIX)) return true;
  return false;
}

/**
 * @param {Record<string, chrome.storage.StorageChange>} changes
 * @param {() => void} runRefresh
 */
function scheduleCoalescedStorageRefresh(changes, runRefresh) {
  const keys = Object.keys(changes || {});
  if (!keys.length) return;
  const allHighFreq = keys.every((k) =>
    isHighFrequencyCommentRelatedStorageKey(k)
  );
  if (!allHighFreq) {
    if (storageRefreshCoalesceTimer) {
      clearTimeout(storageRefreshCoalesceTimer);
      storageRefreshCoalesceTimer = null;
    }
    if (storageRefreshMaxWaitTimer) {
      clearTimeout(storageRefreshMaxWaitTimer);
      storageRefreshMaxWaitTimer = null;
    }
    runRefresh();
    return;
  }
  if (storageRefreshCoalesceTimer) clearTimeout(storageRefreshCoalesceTimer);
  storageRefreshCoalesceTimer = setTimeout(() => {
    storageRefreshCoalesceTimer = null;
    if (storageRefreshMaxWaitTimer) {
      clearTimeout(storageRefreshMaxWaitTimer);
      storageRefreshMaxWaitTimer = null;
    }
    runRefresh();
  }, STORAGE_REFRESH_COALESCE_MS);

  if (!storageRefreshMaxWaitTimer) {
    storageRefreshMaxWaitTimer = setTimeout(() => {
      storageRefreshMaxWaitTimer = null;
      if (storageRefreshCoalesceTimer) {
        clearTimeout(storageRefreshCoalesceTimer);
        storageRefreshCoalesceTimer = null;
      }
      runRefresh();
    }, STORAGE_REFRESH_MAX_WAIT_MS);
  }
}

function initPopup() {
  installExtensionContextErrorGuard();
  void globalThis.chrome?.storage?.local
    ?.get(KEY_CALM_PANEL_MOTION)
    ?.then((b) => {
      applyCalmPanelMotionClass(
        normalizeCalmPanelMotion(b[KEY_CALM_PANEL_MOTION], {
          inlineDefault: INLINE_MODE
        })
      );
    });
  ensureStoryGrowthColorSchemeListener();
  applyResponsivePopupLayout();
  void applyUsageTermsGateState();
  if (INLINE_MODE) {
    const watchDetails = /** @type {HTMLDetailsElement|null} */ (
      document.querySelector('.nl-watch-settings-details')
    );
    if (watchDetails) watchDetails.open = true;
    const frameThemeDetails = /** @type {HTMLDetailsElement|null} */ (
      $('frameThemeDetails')
    );
    if (frameThemeDetails) frameThemeDetails.open = true;
  }
  window.addEventListener('resize', applyResponsivePopupLayout);

  const toggle = /** @type {HTMLInputElement} */ ($('recordToggle'));
  const exportBtn = /** @type {HTMLButtonElement} */ ($('exportJson'));
  const captureBtn = /** @type {HTMLButtonElement|null} */ ($('captureScreenshot'));
  const captureStatus = $('captureStatus');
  const thumbIntervalSel = /** @type {HTMLSelectElement|null} */ ($('thumbInterval'));
  const postBtn = /** @type {HTMLButtonElement} */ ($('postCommentBtn'));
  const voiceBtn = /** @type {HTMLButtonElement|null} */ ($('voiceCommentBtn'));
  const voiceAutoSend = /** @type {HTMLInputElement|null} */ ($('voiceAutoSend'));
  const commentEnterSend = /** @type {HTMLInputElement|null} */ ($('commentEnterSend'));
  const voiceDeviceSel = /** @type {HTMLSelectElement|null} */ ($('voiceInputDevice'));
  const voiceDeviceRefreshBtn = /** @type {HTMLButtonElement|null} */ ($('voiceDeviceRefresh'));
  const voiceMicCheckBtn = /** @type {HTMLButtonElement|null} */ ($('voiceMicCheck'));
  const voiceSrCheckBtn = /** @type {HTMLButtonElement|null} */ ($('voiceSrCheck'));
  const voiceDeviceCheckStatusEl = $('voiceDeviceCheckStatus');
  const voiceLevelFill = /** @type {HTMLDivElement|null} */ ($('voiceLevelFill'));
  const voiceLevelTrack = /** @type {HTMLDivElement|null} */ ($('voiceLevelTrack'));
  const commentInput = /** @type {HTMLTextAreaElement} */ ($('commentInput'));
  const dismissErr = $('dismissStorageError');
  const frameChips = Array.from(document.querySelectorAll('.nl-frame-chip'));
  const frameEditor = /** @type {HTMLDetailsElement|null} */ ($('frameCustomEditor'));
  const saveCustomFrameBtn = $('saveCustomFrame');
  const resetCustomFrameBtn = $('resetCustomFrame');
  const copyFrameCodeBtn = $('copyFrameCode');
  const toggleFrameCodeInputBtn = $('toggleFrameCodeInput');
  const frameShareBox = $('frameShareBox');
  const frameShareCode = /** @type {HTMLTextAreaElement|null} */ ($('frameShareCode'));
  const applyFrameCodeBtn = $('applyFrameCode');

  const safeRefresh = () => {
    if (!hasExtensionContext()) return Promise.resolve();
    return refresh()
      .catch((e) => {
        if (!isExtensionContextInvalidatedError(e)) {
          // no-op
        }
      })
      .finally(() => {
        requestAnimationFrame(() => {
          applyResponsivePopupLayout();
          correctSupportVisualScrollIfOpen();
        });
      });
  };

  $('devMonitorRefresh')?.addEventListener('click', () => {
    watchMetaCache.key = '';
    watchMetaCache.snapshot = null;
    safeRefresh();
  });

  $('devMonitorExportTrendBtn')?.addEventListener('click', async () => {
    const prm = lastDevMonitorPanelParams;
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    if (!prm || !String(prm.liveId || '').trim()) {
      if (stEl) stEl.textContent = 'liveId なし';
      return;
    }
    try {
      const w = typeof globalThis !== 'undefined' ? globalThis : window;
      const trend = await readMergedTrendSeries(w, String(prm.liveId));
      const out = {
        exportedAt: new Date().toISOString(),
        liveId: prm.liveId,
        displayCount: prm.displayCount,
        storageCount: prm.storageCount,
        trendPointCount: trend.length,
        trend
      };
      const ok = await copyTextToClipboard(JSON.stringify(out, null, 2));
      if (stEl) {
        stEl.textContent = ok
          ? `コピー済み（${trend.length} 点）`
          : 'コピーに失敗しました';
      }
    } catch {
      if (stEl) stEl.textContent = 'コピーに失敗しました';
    }
  });

  $('devMonitorExportIngestBtn')?.addEventListener('click', async () => {
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    try {
      const bag = await chrome.storage.local.get(KEY_COMMENT_INGEST_LOG);
      const parsed = parseCommentIngestLog(bag[KEY_COMMENT_INGEST_LOG]);
      const prm = lastDevMonitorPanelParams;
      const lid = String(prm?.liveId || '').trim().toLowerCase();
      const items = lid
        ? parsed.items.filter((x) => x.liveId === lid)
        : parsed.items;
      const out = {
        exportedAt: new Date().toISOString(),
        filterLiveId: lid || null,
        itemCount: items.length,
        totalStored: parsed.items.length,
        items
      };
      const ok = await copyTextToClipboard(JSON.stringify(out, null, 2));
      if (stEl) {
        stEl.textContent = ok
          ? `取り込みログ ${items.length} 件コピー（全体 ${parsed.items.length}）`
          : 'コピーに失敗しました';
      }
    } catch {
      if (stEl) stEl.textContent = 'コピーに失敗しました';
    }
  });

  $('devMonitorClearIngestBtn')?.addEventListener('click', async () => {
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    try {
      await chrome.storage.local.remove(KEY_COMMENT_INGEST_LOG);
      if (stEl) stEl.textContent = '取り込みログを消去しました';
    } catch {
      if (stEl) stEl.textContent = '消去に失敗しました';
    }
  });

  $('devMonitorExportMarketingBtn')?.addEventListener('click', async () => {
    const prm = lastDevMonitorPanelParams;
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    const btn = /** @type {HTMLButtonElement|null} */ ($('devMonitorExportMarketingBtn'));
    const lid = String(prm?.liveId || '').trim();
    if (!lid) {
      if (stEl) stEl.textContent = 'liveId なし';
      return;
    }
    if (btn) btn.disabled = true;
    if (stEl) stEl.textContent = '分析中…';
    try {
      const sKey = commentsStorageKey(lid);
      const data = await chrome.storage.local.get(sKey);
      const comments = /** @type {import('../lib/commentRecord.js').StoredComment[]} */ (
        Array.isArray(data[sKey]) ? data[sKey] : []
      );
      if (comments.length === 0) {
        if (stEl) stEl.textContent = 'コメントが0件です';
        if (btn) btn.disabled = false;
        return;
      }
      const report = aggregateMarketingReport(comments, lid);
      const html = buildMarketingDashboardHtml(report);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nicolivelog-marketing-${lid}-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
      if (stEl) stEl.textContent = `DL完了（${report.totalComments}件 / ${report.uniqueUsers}人）`;
    } catch (e) {
      if (stEl) stEl.textContent = 'エラー: ' + String(e?.message || e);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  const readCustomFrameInputs = () =>
    sanitizeCustomFrame({
      headerStart: /** @type {HTMLInputElement|null} */ ($('frameHeaderStart'))
        ?.value,
      headerEnd: /** @type {HTMLInputElement|null} */ ($('frameHeaderEnd'))
        ?.value,
      accent: /** @type {HTMLInputElement|null} */ ($('frameAccent'))?.value
    });

  const applyAndSaveFrame = async (frameId) => {
    const normalized =
      frameId === 'custom' || hasFramePreset(frameId) ? frameId : DEFAULT_FRAME_ID;
    popupFrameState.id = normalized;
    if (normalized === 'custom') {
      popupFrameState.custom = readCustomFrameInputs();
      openFrameThemeSectionIfPresent();
      if (frameEditor) frameEditor.open = true;
    }
    applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    setFrameShareStatus('', 'idle');
    await savePopupFrameSettings();
  };

  dismissErr?.addEventListener('click', async () => {
    try {
      const ok = await storageRemoveSafe(KEY_STORAGE_WRITE_ERROR);
      if (!ok) return;
      safeRefresh();
    } catch {
      //
    }
  });

  $('dismissCommentHarvestBanner')?.addEventListener('click', async () => {
    try {
      const ok = await storageRemoveSafe(KEY_COMMENT_PANEL_STATUS);
      if (!ok) return;
      safeRefresh();
    } catch {
      //
    }
  });

  $('extensionCacheClearBtn')?.addEventListener('click', async () => {
    const statusEl = $('extensionCacheClearStatus');
    if (statusEl) statusEl.textContent = '';
    const confirmMsg =
      '「表示キャッシュ」を消すと、このPCが覚えたユーザー名・アイコンURLだけを忘れます。\n' +
      '記録した応援コメント・設定・定期サムネは消えません。\n' +
      'まず試していないなら、キャンセルして上の「watch を再読み込み」だけでも構いません。\n' +
      '消しますか？';
    if (!window.confirm(confirmMsg)) return;
    try {
      const keys = /** @type {string[]} */ ([...EXTENSION_SOFT_CACHE_STORAGE_KEYS]);
      const ok = await storageRemoveSafe(keys);
      if (!ok) {
        if (statusEl) {
          statusEl.textContent =
            '削除できませんでした。chrome://extensions で拡張を更新してからお試しください。';
        }
        return;
      }
      if (statusEl) {
        statusEl.textContent =
          '消しました。続けて「watch を再読み込み」を押すか、watch タブを F5 で更新してください。';
      }
      safeRefresh();
    } catch {
      if (statusEl) statusEl.textContent = '削除に失敗しました。';
    }
  });

  toggle.addEventListener('change', async () => {
    try {
      const ok = await storageSetSafe({ [KEY_RECORDING]: toggle.checked });
      if (!ok) return;
      safeRefresh();
    } catch {
      //
    }
  });

  const deepHarvestQuietToggle = /** @type {HTMLInputElement|null} */ (
    $('deepHarvestQuietUiToggle')
  );
  deepHarvestQuietToggle?.addEventListener('change', async () => {
    try {
      const ok = await storageSetSafe({
        [KEY_DEEP_HARVEST_QUIET_UI]: deepHarvestQuietToggle.checked
      });
      if (!ok) return;
    } catch {
      //
    }
  });

  const saveInlinePanelWidthMode = async (value) => {
    const v =
      value === INLINE_PANEL_WIDTH_VIDEO
        ? INLINE_PANEL_WIDTH_VIDEO
        : INLINE_PANEL_WIDTH_PLAYER_ROW;
    const ok = await storageSetSafe({ [KEY_INLINE_PANEL_WIDTH_MODE]: v });
    if (!ok) return;
    safeRefresh();
  };

  /** @type {HTMLInputElement|null} */
  const radioPlayerRowEl = $('inlinePanelWidthPlayerRow');
  /** @type {HTMLInputElement|null} */
  const radioVideoOnlyEl = $('inlinePanelWidthVideo');
  radioPlayerRowEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlinePanelWidthMode(INLINE_PANEL_WIDTH_PLAYER_ROW);
    }
  });
  radioVideoOnlyEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlinePanelWidthMode(INLINE_PANEL_WIDTH_VIDEO);
    }
  });

  const calmMotionEl = /** @type {HTMLInputElement|null} */ ($('calmPanelMotion'));
  calmMotionEl?.addEventListener('change', async () => {
    try {
      const on = Boolean(calmMotionEl.checked);
      applyCalmPanelMotionClass(on);
      await storageSetSafe({ [KEY_CALM_PANEL_MOTION]: on });
    } catch {
      //
    }
  });

  for (const chip of frameChips) {
    chip.addEventListener('click', () => {
      const frameId = String(chip.getAttribute('data-frame-id') || '');
      applyAndSaveFrame(frameId).catch(() => {});
    });
  }

  saveCustomFrameBtn?.addEventListener('click', () => {
    popupFrameState.custom = readCustomFrameInputs();
    popupFrameState.id = 'custom';
    applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    setFrameShareStatus('カスタム色を更新しました。', 'success');
    savePopupFrameSettings().catch(() => {});
  });

  resetCustomFrameBtn?.addEventListener('click', () => {
    popupFrameState.custom = { ...DEFAULT_CUSTOM_FRAME };
    renderCustomFrameEditor(popupFrameState.custom);
    if (popupFrameState.id === 'custom') {
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    }
    setFrameShareStatus('カスタム色を初期化しました。', 'success');
    savePopupFrameSettings().catch(() => {});
  });

  toggleFrameCodeInputBtn?.addEventListener('click', () => {
    if (!frameShareBox) return;
    const nextHidden = !frameShareBox.hidden;
    frameShareBox.hidden = nextHidden;
    setFrameShareStatus('', 'idle');
    if (!nextHidden) {
      syncFrameShareInput();
      frameShareCode?.focus();
      frameShareCode?.select();
    }
  });

  copyFrameCodeBtn?.addEventListener('click', () => {
    const code = createFrameShareCode(popupFrameState.id, popupFrameState.custom);
    copyTextToClipboard(code)
      .then((ok) => {
        if (ok) {
          setFrameShareStatus('共有コードをコピーしました。', 'success');
          return;
        }
        setFrameShareStatus('コピーに失敗しました。', 'error');
      })
      .catch(() => {
        setFrameShareStatus('コピーに失敗しました。', 'error');
      });
  });

  applyFrameCodeBtn?.addEventListener('click', () => {
    const raw = String(frameShareCode?.value || '');
    try {
      const parsed = parseFrameShareCode(raw);
      popupFrameState.id = parsed.frameId;
      popupFrameState.custom = parsed.custom;
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
      if (popupFrameState.id === 'custom') {
        openFrameThemeSectionIfPresent();
        if (frameEditor) frameEditor.open = true;
      }
      savePopupFrameSettings().catch(() => {});
      setFrameShareStatus('共有コードを適用しました。', 'success');
    } catch {
      setFrameShareStatus('共有コードの形式が正しくありません。', 'error');
    }
  });

  frameShareCode?.addEventListener('input', () => {
    setFrameShareStatus('', 'idle');
  });

  captureBtn?.addEventListener('click', async () => {
    const watchUrl =
      exportBtn.dataset.watchUrl || captureBtn?.dataset.watchUrl || '';
    if (!watchUrl) {
      setCaptureStatus(captureStatus, 'watchページを開いてください。', 'error');
      return;
    }
    setCaptureStatus(captureStatus, 'キャプチャ中…', 'idle');
    try {
      const res = /** @type {{ ok?: boolean, errorCode?: string, dataUrl?: string, liveId?: string }|null} */ (
        await sendMessageToWatchTabs(watchUrl, { type: 'NLS_CAPTURE_SCREENSHOT' })
      );
      if (!res?.ok || !res.dataUrl) {
        setCaptureStatus(
          captureStatus,
          screenshotErrorMessage(res?.errorCode),
          'error'
        );
        return;
      }
      const lv = res.liveId || extractLiveIdFromUrl(watchUrl) || 'unknown';
      const filename = buildScreenshotFilename(lv, 'png', Date.now());
      let saved = false;
      try {
        await chrome.downloads.download({
          url: res.dataUrl,
          filename,
          saveAs: false,
          conflictAction: 'uniquify'
        });
        saved = true;
      } catch { /* download API may fail — fall through to tab preview */ }
      if (saved) {
        setCaptureStatus(captureStatus, '保存しました。', 'success');
      } else {
        await chrome.tabs.create({ url: res.dataUrl });
        setCaptureStatus(captureStatus, '新しいタブに表示しました。右クリック→「名前を付けて画像を保存」で保存できます。', 'idle');
      }
      safeRefresh();
    } catch (err) {
      setCaptureStatus(captureStatus, `キャプチャに失敗: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  });

  thumbIntervalSel?.addEventListener('change', async () => {
    const v = Number(thumbIntervalSel.value);
    try {
      if (v === 0) {
        await storageSetSafe({
          [KEY_THUMB_AUTO]: false,
          [KEY_THUMB_INTERVAL_MS]: 0
        });
      } else {
        await storageSetSafe({
          [KEY_THUMB_AUTO]: true,
          [KEY_THUMB_INTERVAL_MS]: v
        });
      }
    } catch {
      //
    }
  });

  exportBtn.addEventListener('click', async () => {
    const lv = exportBtn.dataset.liveId;
    const key = exportBtn.dataset.storageKey;
    const watchUrl = exportBtn.dataset.watchUrl || '';
    if (!lv || !key || exportBtn.disabled) return;
    try {
      await downloadCommentsHtml(lv, key, watchUrl);
    } catch {
      // no-op
    }
  });

  $('exportSessionSummaryJsonBtn')?.addEventListener('click', async () => {
    const lv = exportBtn.dataset.liveId;
    if (!lv || exportBtn.disabled) return;
    try {
      await downloadSessionSummaryJson(lv);
    } catch {
      // no-op
    }
  });

  async function submitComment() {
    const text = String(commentInput?.value || '').trim();
    const watchUrl = exportBtn.dataset.watchUrl || '';
    if (!text) {
      setPostStatus('コメントを入力してください。', 'error');
      return;
    }
    if (!watchUrl) {
      setPostStatus('watchページを開いてから送信してください。', 'error');
      return;
    }
    const lvPost = String(exportBtn.dataset.liveId || '').trim().toLowerCase();
    let optimisticLogged = false;
    COMMENT_POST_UI_STATE.submitting = true;
    if (postBtn) postBtn.disabled = true;
    syncVoiceCommentButton();
    setPostStatus('送信中…', 'idle');
    try {
      if (lvPost && toggle.checked) {
        await appendSelfPostedComment(lvPost, text);
        optimisticLogged = true;
      }
      if (!hasExtensionContext()) return;
      const result = await requestPostCommentToOpenTab(text, watchUrl);
      if (!hasExtensionContext()) return;
      if (result.ok) {
        if (commentInput) commentInput.value = '';
        setPostStatus('コメントを送信しました。', 'success');
        const growthEl = /** @type {HTMLElement|null} */ ($('sceneStoryGrowth'));
        if (growthEl) patchStoryGrowthIconsFromSource(growthEl);
        return;
      }
      if (optimisticLogged && lvPost) {
        await revertLastSelfPostedComment(lvPost, text);
        optimisticLogged = false;
      }
      setPostStatus(
        withCommentSendTroubleshootHint(
          result.error || '送信に失敗しました。'
        ),
        'error'
      );
    } catch (e) {
      if (optimisticLogged && lvPost) {
        await revertLastSelfPostedComment(lvPost, text).catch(() => {});
      }
      if (isExtensionContextInvalidatedError(e) || !hasExtensionContext()) return;
      throw e;
    } finally {
      COMMENT_POST_UI_STATE.submitting = false;
      if (hasExtensionContext()) {
        if (postBtn) postBtn.disabled = false;
        syncVoiceCommentButton();
      }
    }
  }

  let voiceListeningUi = false;

  /** @param {number} level 0〜1 */
  const setVoiceLevelMeter = (level) => {
    const pct = Math.max(0, Math.min(100, Math.round(Number(level) * 100)));
    if (voiceLevelFill) voiceLevelFill.style.width = `${pct}%`;
    if (voiceLevelTrack) voiceLevelTrack.setAttribute('aria-valuenow', String(pct));
  };

  /** @param {boolean} on */
  const setVoiceListeningUi = (on) => {
    voiceListeningUi = on;
    if (voiceBtn) {
      voiceBtn.classList.toggle('is-listening', on);
      voiceBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (!on) setVoiceLevelMeter(0);
  };

  window.addEventListener('pagehide', () => {
    const w = exportBtn.dataset.watchUrl || '';
    if (!w || !voiceListeningUi) return;
    findWatchTabIdForVoice(w)
      .then((tabId) => {
        if (tabId == null) return;
        return chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const st = globalThis.__NLS_VOICE_STOP__;
            if (typeof st === 'function') st();
          }
        });
      })
      .catch(() => {});
    setVoiceListeningUi(false);
  });

  voiceAutoSend?.addEventListener('change', async () => {
    try {
      await storageSetSafe({
        [KEY_VOICE_AUTOSEND]: voiceAutoSend.checked
      });
    } catch {
      //
    }
  });

  commentEnterSend?.addEventListener('change', async () => {
    try {
      await storageSetSafe({
        [KEY_COMMENT_ENTER_SEND]: commentEnterSend.checked
      });
    } catch {
      //
    }
  });

  const storyGrowthCollapseBtn = $('storyGrowthCollapseBtn');
  storyGrowthCollapseBtn?.addEventListener('click', () => {
    void (async () => {
      const bag = await storageGetSafe(KEY_STORY_GROWTH_COLLAPSED, {});
      const collapsed = bag[KEY_STORY_GROWTH_COLLAPSED] === true;
      const ok = await storageSetSafe({
        [KEY_STORY_GROWTH_COLLAPSED]: !collapsed
      });
      if (!ok) return;
      await applyStoryGrowthCollapsedFromStorage();
    })();
  });

  /**
   * 応援ビジュアルの storage 永続化・スクロール補正は details の toggle に結線する。
   * applySupportVisualExpandedFromStorage の await 後に一度だけ実行（loadPopupFrameSettings.finally 内）。
   */
  const wireSupportVisualUi = () => {
    if (supportVisualUiWired) return;
    supportVisualUiWired = true;

    const supportVisualDetails = /** @type {HTMLDetailsElement|null} */ (
      $('supportVisualDetails')
    );

    /* 開閉は <summary> のネイティブ挙動のみ（件数ボタン・ライブカードからの JS トグルは一旦やめる） */
    if (supportVisualDetails) {
      supportVisualDetails.ontoggle = () => {
      if (suppressSupportVisualTogglePersist) return;
      const open = Boolean(supportVisualDetails?.open);
      if (open) {
        scheduleScrollOpenSupportVisualDetails(supportVisualDetails);
      } else {
        cleanupSupportVisualScrollObserver();
      }
      void (async () => {
        const prev = !open;
        ownSupportVisualPersistInFlight = true;
        try {
          const bag = await storageGetSafe(KEY_SUPPORT_VISUAL_EXPANDED, {});
          const rawStored = bag[KEY_SUPPORT_VISUAL_EXPANDED];
          /* undefined は「未設定」とみなし必ず set。boolean が既に同値なら他フレームが先に書いたエコーで二重 set しない */
          if (
            (rawStored === true || rawStored === false) &&
            rawStored === open
          ) {
            return;
          }
          const ok = await storageSetSafe({
            [KEY_SUPPORT_VISUAL_EXPANDED]: open
          });
          if (!ok) {
            suppressSupportVisualTogglePersist = true;
            try {
              if (supportVisualDetails) supportVisualDetails.open = prev;
            } finally {
              suppressSupportVisualTogglePersist = false;
            }
          }
        } finally {
          /* onChanged は set の解決後に届くことがあり、直後に false にすると競合する */
          globalThis.setTimeout(() => {
            ownSupportVisualPersistInFlight = false;
          }, 0);
        }
      })();
    };
    }

  };

  voiceDeviceSel?.addEventListener('change', async () => {
    try {
      await storageSetSafe({
        [KEY_VOICE_INPUT_DEVICE]: voiceDeviceSel.value
      });
    } catch {
      //
    }
  });

  voiceDeviceRefreshBtn?.addEventListener('click', () => {
    refreshVoiceInputDeviceList().catch(() => {});
  });

  voiceMicCheckBtn?.addEventListener('click', () => {
    void (async () => {
      setVoiceDeviceCheckStatus(
        voiceDeviceCheckStatusEl,
        '確認中… 短く話してください（約1秒）',
        'idle'
      );
      const id = String(voiceDeviceSel?.value || '');
      const c = audioConstraintsForDevice(id);
      const r = await probeMicrophoneLevel(c);
      if (!r.ok) {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          r.error || '音を検出できませんでした。',
          'error'
        );
        return;
      }
      setVoiceDeviceCheckStatus(
        voiceDeviceCheckStatusEl,
        `マイク入力OK（ピーク ${Math.round(r.peak)}）`,
        'success'
      );
    })();
  });

  voiceSrCheckBtn?.addEventListener('click', () => {
    void (async () => {
      const watchUrl = exportBtn.dataset.watchUrl || '';
      if (!watchUrl) {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          'watchページを開いてから「認識テスト」を使ってください。',
          'error'
        );
        return;
      }
      const tabId = await findWatchTabIdForVoice(watchUrl);
      if (tabId == null) {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          '対象のwatchタブが見つかりません。タブを前面に出して再試行してください。',
          'error'
        );
        return;
      }
      setVoiceDeviceCheckStatus(
        voiceDeviceCheckStatusEl,
        '認識テスト中… 短い文を話してください（最大5秒）',
        'idle'
      );
      try {
        const exec = await chrome.scripting.executeScript({
          target: { tabId },
          func: async (dev) => {
            const fn = globalThis.__NLS_VOICE_PROBE_SR__;
            if (typeof fn !== 'function') {
              return {
                ok: false,
                error: '拡張を再読み込みし、watchページも更新してください。'
              };
            }
            return await fn(dev);
          },
          args: [String(voiceDeviceSel?.value || '')]
        });
        const r = /** @type {{ ok?: boolean, text?: string, error?: string }|undefined} */ (
          exec?.[0]?.result
        );
        if (r?.ok === true && r.text) {
          setVoiceDeviceCheckStatus(
            voiceDeviceCheckStatusEl,
            `認識OK: 「${r.text.slice(0, 80)}${r.text.length > 80 ? '…' : ''}」`,
            'success'
          );
        } else {
          setVoiceDeviceCheckStatus(
            voiceDeviceCheckStatusEl,
            r?.error || '認識テストに失敗しました。',
            'error'
          );
        }
      } catch {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          '認識テストを実行できませんでした。',
          'error'
        );
      }
    })();
  });

  /** 埋め込み iframe 等で runtime が無いとここで落ち、以降の loadPopupFrameSettings / safeRefresh が一切走らない */
  try {
    const onMsg = chrome?.runtime?.onMessage;
    if (onMsg && typeof onMsg.addListener === 'function') {
      onMsg.addListener((msg) => {
        if (!msg || msg.type !== 'NLS_VOICE_TO_POPUP') return;
        if (typeof msg.level === 'number') {
          setVoiceLevelMeter(msg.level);
          return;
        }
        if ('partial' in msg && commentInput) {
          commentInput.value = String(msg.partial || '').slice(0, 250);
          return;
        }
        if (msg.error === true) {
          setVoiceListeningUi(false);
          setPostStatus(String(msg.message || '音声入力に失敗しました。'), 'error');
          return;
        }
        if (msg.done === true) {
          setVoiceListeningUi(false);
          const text = String(msg.text || '').trim();
          if (commentInput) commentInput.value = text.slice(0, 250);
          if (!text) {
            setPostStatus('', 'idle');
            return;
          }
          if (voiceAutoSend?.checked) {
            submitComment().catch(() => {
              setPostStatus(
                withCommentSendTroubleshootHint('送信に失敗しました。'),
                'error'
              );
            });
          } else {
            setPostStatus('内容を確認して「コメント送信」を押してください。', 'success');
          }
        }
      });
    }
  } catch {
    // no-op
  }

  voiceBtn?.addEventListener('click', () => {
    void (async () => {
      if (!commentInput || !voiceBtn || voiceBtn.disabled) return;
      const watchUrl = exportBtn.dataset.watchUrl || '';
      if (!watchUrl) {
        setPostStatus('watchページを開いてから使ってください。', 'error');
        return;
      }
      const sessionBase = String(commentInput.value || '');
      const tabId = await findWatchTabIdForVoice(watchUrl);
      if (tabId == null) {
        setPostStatus(
          '音声入力: 対象のwatchタブを前面に出すか、ページを再読み込みしてから試してください。',
          'error'
        );
        return;
      }
      const deviceId = String(voiceDeviceSel?.value || '');
      try {
        const exec = await chrome.scripting.executeScript({
          target: { tabId },
          func: async (base, dev) => {
            const fn = globalThis.__NLS_VOICE_TOGGLE__;
            if (typeof fn !== 'function') {
              return {
                ok: false,
                error:
                  '拡張のスクリプトが古いです。watchページを再読み込みしてください。'
              };
            }
            return await fn(base, dev);
          },
          args: [sessionBase, deviceId]
        });
        const r = /** @type {{ ok?: boolean, listening?: boolean, error?: string }|undefined} */ (
          exec?.[0]?.result
        );
        if (!r || r.ok === false) {
          setVoiceListeningUi(false);
          setPostStatus(r?.error || '音声入力を切り替えられませんでした。', 'error');
          return;
        }
        if (r.listening === true) {
          setVoiceListeningUi(true);
          setPostStatus('聞いています… 終わったらもう一度「音声入力」', 'idle');
        } else {
          setVoiceListeningUi(false);
        }
      } catch {
        setVoiceListeningUi(false);
        setPostStatus('音声入力を開始できませんでした。', 'error');
      }
    })();
  });

  $('reloadWatchTabBtn')?.addEventListener('click', () => {
    void triggerReloadWatchTabFromPopup();
  });
  $('reloadWatchTabPanelBtn')?.addEventListener('click', () => {
    void triggerReloadWatchTabFromPopup();
  });

  postBtn?.addEventListener('click', () => {
    submitComment().catch(() => {
      setPostStatus(
        withCommentSendTroubleshootHint('送信に失敗しました。'),
        'error'
      );
    });
  });

  commentInput?.addEventListener('keydown', (e) => {
    const action = commentComposeKeyAction({
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      isComposing: Boolean(e.isComposing) || e.keyCode === 229,
      enterSendsComment: Boolean(commentEnterSend?.checked)
    });
    if (action !== 'submit') return;
    e.preventDefault();
    submitComment().catch(() => {
      setPostStatus(
        withCommentSendTroubleshootHint('送信に失敗しました。'),
        'error'
      );
    });
  });

  commentInput?.addEventListener('input', () => {
    setPostStatus('', 'idle');
  });

  loadPopupFrameSettings()
    .catch(() => {
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    })
    .finally(() => {
      void (async () => {
        const refreshDone = safeRefresh();
        await applySupportVisualExpandedFromStorage().catch(() => {});
        wireSupportVisualUi();
        document.documentElement.setAttribute('data-nl-support-wired', '');
        void applyThumbSelectFromStorage().catch(() => {});
        void applyVoiceAutosendFromStorage().catch(() => {});
        void applyCommentEnterSendFromStorage().catch(() => {});
        void applyStoryGrowthCollapsedFromStorage().catch(() => {});
        void refreshVoiceInputDeviceList().catch(() => {});
        await refreshDone;
      })();
    });

  try {
    const stCh = chrome?.storage?.onChanged;
    if (stCh && typeof stCh.addListener === 'function') {
      stCh.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[KEY_POPUP_FRAME] || changes[KEY_POPUP_FRAME_CUSTOM]) {
          loadPopupFrameSettings().catch(() => {});
        }
        if (changes[KEY_THUMB_AUTO] || changes[KEY_THUMB_INTERVAL_MS]) {
          applyThumbSelectFromStorage().catch(() => {});
        }
        if (changes[KEY_VOICE_AUTOSEND]) {
          applyVoiceAutosendFromStorage().catch(() => {});
        }
        if (changes[KEY_COMMENT_ENTER_SEND]) {
          applyCommentEnterSendFromStorage().catch(() => {});
        }
        if (changes[KEY_STORY_GROWTH_COLLAPSED]) {
          applyStoryGrowthCollapsedFromStorage().catch(() => {});
        }
        const skipVisualExternalSync =
          changes[KEY_SUPPORT_VISUAL_EXPANDED] && ownSupportVisualPersistInFlight;
        /*
         * onChanged から apply すると、インライン iframe とツールバーポップアップが同一 storage を共有する際に
         * 他文脈の変更で余分な details.open 代入 → toggle → 二重 persist / 見た目が元に戻る原因になる。
         * 開閉状態は各ドキュメントのユーザー操作と、loadPopupFrameSettings.finally の初回 apply のみで同期する。
         */
        const changedKeys = Object.keys(changes);
        const onlyVisualExpanded =
          changedKeys.length === 1 && changedKeys[0] === KEY_SUPPORT_VISUAL_EXPANDED;
        if (!skipVisualExternalSync || !onlyVisualExpanded) {
          scheduleCoalescedStorageRefresh(changes, () => safeRefresh());
        }
      });
    }
  } catch {
    // no-op
  }

  setInterval(() => {
    if (!hasExtensionContext()) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    watchMetaCache.key = '';
    watchMetaCache.snapshot = null;
    safeRefresh();
  }, 30_000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
