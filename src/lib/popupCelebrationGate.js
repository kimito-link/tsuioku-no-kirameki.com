/**
 * popup / watch 埋め込みパネル再描画時の応援演出ゲート（単一の開幕判定）。
 *
 * heavy 全件読み完了・マイルストーン storage プライム完了・件数整合・開幕クールダウンを
 * ここに集約し、popup-entry 側のバラバラなガードを置き換える。
 */

import {
  COMMENT_MILESTONE_REPRIME_MIN_JUMP,
  shouldDeferCelebrationsUntilHeavySettled
} from './watchPopupCelebrationGuard.js';

/** 記録件数と配列長 / 公式 chunk total の許容差（軽量→heavy ジャンプ検知と同スケール） */
export const RECORD_OFFICIAL_ALIGN_MAX_GAP = COMMENT_MILESTONE_REPRIME_MIN_JUMP;

/** パネル／refresh 開始直後の演出禁止（INLINE 中継含む） */
export const POPUP_CELEBRATION_OPEN_COOLDOWN_MS = 3000;

/**
 * @typedef {{
 *   heavySettled?: boolean,
 *   recordCount?: number|null,
 *   arrayLength?: number|null,
 *   officialChunkTotal?: number|null,
 *   hasReliableFullArray?: boolean
 * }} CommentLoadPhase
 */

/**
 * @param {{ now?: () => number }} [deps]
 */
export function createPopupCelebrationGate(deps = {}) {
  const now = deps.now ?? (() => Date.now());

  /** @type {string} */
  let liveId = '';
  let heavySettled = false;
  let primeComplete = false;
  /** @type {number|null} */
  let recordCount = null;
  /** @type {number|null} */
  let arrayLength = null;
  /** @type {number|null} */
  let officialChunkTotal = null;
  let hasReliableFullArray = false;
  let openCooldownUntil = 0;
  /** @type {string} */
  let lastRefreshSessionKey = '';
  /** @type {Promise<void>|null} */
  let primeInFlight = null;
  let debugEnabled = false;

  /**
   * liveId が変わったときだけ内部フェーズをリセット。同一配信の再開だけではリセットしない。
   *
   * @param {string} nextLiveId
   * @param {{ refreshSessionKey?: string|number }} [opts]
   */
  function beginPopupRefresh(nextLiveId, opts = {}) {
    const lid = String(nextLiveId || '').trim().toLowerCase();
    if (lid && lid !== liveId) {
      liveId = lid;
      heavySettled = false;
      primeComplete = false;
      recordCount = null;
      arrayLength = null;
      officialChunkTotal = null;
      hasReliableFullArray = false;
      primeInFlight = null;
    }
    const sessionKey =
      opts.refreshSessionKey != null ? String(opts.refreshSessionKey) : '';
    if (sessionKey && sessionKey !== lastRefreshSessionKey) {
      lastRefreshSessionKey = sessionKey;
      openCooldownUntil = now() + POPUP_CELEBRATION_OPEN_COOLDOWN_MS;
      logCelebrationDebug('gate', {
        event: 'session_open',
        liveId: lid || liveId,
        cooldownMs: POPUP_CELEBRATION_OPEN_COOLDOWN_MS
      });
    }
  }

  /**
   * @param {CommentLoadPhase} phase
   */
  function setCommentLoadPhase(phase) {
    if (phase.heavySettled === true) heavySettled = true;
    if (phase.heavySettled === false) heavySettled = false;
    if (phase.recordCount != null && Number.isFinite(phase.recordCount)) {
      recordCount = Math.floor(phase.recordCount);
    }
    if (phase.arrayLength != null && Number.isFinite(phase.arrayLength)) {
      arrayLength = Math.floor(phase.arrayLength);
    }
    if (phase.officialChunkTotal != null && Number.isFinite(phase.officialChunkTotal)) {
      officialChunkTotal = Math.floor(phase.officialChunkTotal);
    }
    if (phase.hasReliableFullArray === true) hasReliableFullArray = true;
    if (phase.hasReliableFullArray === false) hasReliableFullArray = false;
  }

  function markPrimeComplete() {
    primeComplete = true;
    logCelebrationDebug('gate', { event: 'prime_complete', liveId });
  }

  function resetPrimeForRepriming() {
    primeComplete = false;
    primeInFlight = null;
  }

  /**
   * @returns {boolean}
   */
  function isWithinOpeningCooldown() {
    return now() < openCooldownUntil;
  }

  /**
   * @returns {boolean}
   */
  function isRecordCountAligned() {
    if (recordCount == null) return false;
    if (arrayLength != null && recordCount - arrayLength > RECORD_OFFICIAL_ALIGN_MAX_GAP) {
      return false;
    }
    if (
      officialChunkTotal != null &&
      Math.abs(recordCount - officialChunkTotal) > RECORD_OFFICIAL_ALIGN_MAX_GAP
    ) {
      return false;
    }
    return true;
  }

  /**
   * @returns {boolean}
   */
  function canFireCelebrations() {
    if (!liveId) return false;
    if (shouldDeferCelebrationsUntilHeavySettled(!heavySettled)) return false;
    if (!hasReliableFullArray) return false;
    if (!primeComplete) return false;
    if (!isRecordCountAligned()) return false;
    if (isWithinOpeningCooldown()) return false;
    return true;
  }

  /**
   * @returns {boolean}
   */
  function canNoteCommentMilestoneHighWater() {
    return canFireCelebrations();
  }

  /**
   * 演出 DOM 再生（support / bahamut / INLINE 中継）の最終ガード。
   * @returns {boolean}
   */
  function isCelebrationPlaybackBlocked() {
    return !canFireCelebrations();
  }

  /**
   * 自分の広告・ギフト等の即時演出用。heavy 全件待ち・マイルストーン prime は要求しない。
   * @returns {boolean}
   */
  function canPlayViewerActionCelebration() {
    return Boolean(liveId);
  }

  /**
   * @returns {boolean}
   */
  function isViewerActionCelebrationBlocked() {
    return !canPlayViewerActionCelebration();
  }

  /**
   * マイルストーン storage プライム完了後にだけコールバックを実行（重複呼び出しは共有）。
   *
   * @param {() => void | Promise<void>} runPrime
   * @returns {Promise<void>}
   */
  async function runAfterPrime(runPrime) {
    if (!primeComplete) {
      if (!primeInFlight) {
        primeInFlight = (async () => {
          try {
            await runPrime();
            markPrimeComplete();
          } finally {
            primeInFlight = null;
          }
        })();
      }
      await primeInFlight;
    }
  }

  /**
   * @param {boolean} enabled
   */
  function setCelebrationDebugEnabled(enabled) {
    debugEnabled = enabled === true;
  }

  /**
   * @param {string} tag
   * @param {Record<string, unknown>} [detail]
   */
  function logCelebrationDebug(tag, detail = {}) {
    const globalFlag =
      typeof globalThis !== 'undefined' &&
      /** @type {any} */ (globalThis).__NLS_CELEB_DEBUG__ === true;
    if (!debugEnabled && !globalFlag) return;
    try {
      console.info('[nls-celeb]', tag, {
        liveId,
        heavySettled,
        primeComplete,
        recordCount,
        arrayLength,
        officialChunkTotal,
        canFire: canFireCelebrations(),
        ...detail
      });
    } catch {
      /* no-op */
    }
  }

  /**
   * @returns {Record<string, unknown>}
   */
  function getDebugSnapshot() {
    return {
      liveId,
      heavySettled,
      primeComplete,
      recordCount,
      arrayLength,
      officialChunkTotal,
      hasReliableFullArray,
      openCooldownUntil,
      canFireCelebrations: canFireCelebrations()
    };
  }

  return {
    beginPopupRefresh,
    setCommentLoadPhase,
    markPrimeComplete,
    resetPrimeForRepriming,
    canFireCelebrations,
    canNoteCommentMilestoneHighWater,
    isCelebrationPlaybackBlocked,
    canPlayViewerActionCelebration,
    isViewerActionCelebrationBlocked,
    isWithinOpeningCooldown,
    runAfterPrime,
    setCelebrationDebugEnabled,
    logCelebrationDebug,
    getDebugSnapshot
  };
}
