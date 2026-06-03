/**
 * Watch メタカード「観客」ブロック用 ViewModel（DOM 非依存）。
 *
 * フィールドの意味（誤マージ防止）:
 * - `programStats.watchCount` / 補完後の `viewerCountFromDom` … 累計来場（ページ寄せ）。
 * - `officialViewerCount` … 公式 statistics 系。`resolveConcurrentViewers` の direct 判定用。
 *   `mergeProgramStatsWatchIntoWatchMetaSnapshot` ではここへ流さない（0.1.278）。
 *
 * `snapshot` は呼び出し側でマージ済みであること（本 VM 内では二重マージしない）。
 */

import { resolveConcurrentViewers } from './concurrentEstimate.js';
import { summarizeRecordedCommenters } from './liveCommenterStats.js';
import { watchMetaConcurrentGateFromSnapshot } from './popupWatchMetaConcurrentGate.js';
import { buildWatchAudienceNote } from './watchAudienceCopy.js';
import {
  concurrentResolutionMethodTitlePart,
  SPARSE_CONCURRENT_ESTIMATE_NOTE
} from './watchConcurrentEstimateUiCopy.js';
import { resolveWatchMetaCardState } from './watchMetaCardStateGate.js';

/**
 * @typedef {Record<string, unknown>} WatchMetaSnapshotMerged
 */

/**
 * @typedef {{
 *   viewerCount: number|null,
 *   concurrentEstimated: number|null
 * }} WatchMetaCardReactionPrev
 */

/**
 * @typedef {{
 *   text: string,
 *   isPlaceholder: boolean,
 *   numericVisitorCount: number|null,
 *   charReactionDelta: number|null
 * }} WatchMetaVisitorVm
 */

/**
 * @typedef {{
 *   phase: 'loading'|'ready',
 *   estText: string,
 *   estIsPlaceholder: boolean,
 *   estTitle: string|null,
 *   subText: string,
 *   concurrentLoadingHidden: boolean,
 *   concurrentReadyHidden: boolean,
 *   ariaBusy: boolean,
 *   numericEstimated: number|null,
 *   charReactionDelta: number|null
 * }} WatchMetaConcurrentVm
 */

/**
 * @typedef {{ text: string, title: string|null }} WatchMetaLabeledTextVm
 */

/**
 * @typedef {{
 *   visitor: WatchMetaVisitorVm,
 *   concurrent: WatchMetaConcurrentVm,
 *   uniqueUsers: WatchMetaLabeledTextVm,
 *   commentsNoId: WatchMetaLabeledTextVm,
 *   audienceNote: WatchMetaLabeledTextVm,
 *   nextPrevForReactions: WatchMetaCardReactionPrev
 * }} WatchMetaCardAudienceViewModel
 */

/**
 * @typedef {{
 *   applied?: boolean,
 *   basis?: string,
 *   sampleCount?: number,
 *   multiplierScale?: number|null
 * }} WatchMetaCalibrationInfo
 */

/**
 * @param {WatchMetaSnapshotMerged} snapshot
 * @param {{
 *   commentEntries?: readonly unknown[],
 *   nowMs: number,
 *   prevForReactions: WatchMetaCardReactionPrev,
 *   profile?: import('./concurrentEstimate.js').PlatformProfile|string|null,
 *   calibration?: WatchMetaCalibrationInfo|null
 * }} opts
 * @returns {WatchMetaCardAudienceViewModel}
 */
export function buildWatchMetaCardAudienceViewModel(snapshot, opts) {
  const commentEntries = Array.isArray(opts?.commentEntries)
    ? opts.commentEntries
    : [];
  const nowMs = typeof opts?.nowMs === 'number' && Number.isFinite(opts.nowMs)
    ? opts.nowMs
    : Date.now();
  const prev = opts?.prevForReactions && typeof opts.prevForReactions === 'object'
    ? opts.prevForReactions
    : { viewerCount: null, concurrentEstimated: null };

  const vc = snapshot.viewerCountFromDom;
  const recentActive =
    typeof snapshot.recentActiveUsers === 'number' ? snapshot.recentActiveUsers : 0;
  const { showConcurrent, sparseConcurrent } =
    watchMetaConcurrentGateFromSnapshot(
      /** @type {import('./popupWatchMetaConcurrentGate.js').WatchMetaConcurrentSnapshot} */ (
        snapshot
      )
    );

  const stateGate = resolveWatchMetaCardState({
    snapshot:
      /** @type {import('./watchMetaCardStateGate.js').WatchMetaCardSnapshotShape} */ (
        snapshot
      ),
    snapshotFetchInflight: false,
    snapshotFetchError: ''
  });

  /** @type {number|null} */
  let numericVisitor = null;
  if (typeof vc === 'number' && Number.isFinite(vc) && vc >= 0) {
    numericVisitor = vc;
  }

  /** @type {WatchMetaVisitorVm} */
  const visitor = {
    text:
      stateGate.shouldUseSnapshotForViewer && typeof vc === 'number'
        ? vc.toLocaleString('ja-JP')
        : stateGate.viewerLabel,
    isPlaceholder: !(
      stateGate.shouldUseSnapshotForViewer && typeof vc === 'number'
    ),
    numericVisitorCount: numericVisitor,
    charReactionDelta: null
  };
  if (
    numericVisitor != null &&
    prev.viewerCount != null &&
    numericVisitor > prev.viewerCount
  ) {
    visitor.charReactionDelta = numericVisitor - prev.viewerCount;
  }

  /** @type {WatchMetaConcurrentVm} */
  let concurrent;
  /** @type {number|null} */
  let nextConcurrentEstimated = prev.concurrentEstimated;

  if (showConcurrent) {
    const streamAge =
      typeof snapshot.streamAgeMin === 'number' && snapshot.streamAgeMin >= 0
        ? snapshot.streamAgeMin
        : undefined;
    // 研究中シグナル D 用：公式 statistics コメント増分 ÷ サンプル窓（分）でコメ/分を近似。
    // 表示の主値には影響せず、base.signalD / blended の観察用（較正前は診断のみ）。
    const commentsPerMin = (() => {
      const delta = snapshot.officialStatisticsCommentsDelta;
      const winMs = snapshot.officialCommentSampleWindowMs;
      if (
        typeof delta === 'number' &&
        Number.isFinite(delta) &&
        delta > 0 &&
        typeof winMs === 'number' &&
        Number.isFinite(winMs) &&
        winMs > 0
      ) {
        return delta / (winMs / 60000);
      }
      return undefined;
    })();
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
          ? Math.max(
              0,
              snapshot.officialCommentCount -
                snapshot.officialStatisticsCommentsDelta
            )
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
      streamAgeMin: streamAge,
      commentsPerMin,
      // 自動補正（オートキャリブレーション）: 較正データから導いた係数プロファイル。
      // 未指定なら従来どおり既定（ニコ生）プロファイルで推定（挙動互換）。
      profile: opts?.profile ?? undefined
    });

    const directLike = resolved.method === 'official';
    const staleOfficialZero =
      resolved.method === 'official' &&
      resolved.estimated <= 0 &&
      typeof vc === 'number' &&
      vc > 0;
    const unresolvedFallback =
      staleOfficialZero ||
      (!directLike &&
        resolved.method === 'fallback' &&
        resolved.estimated <= 0 &&
        resolved.base.method === 'none');
    if (unresolvedFallback) {
      concurrent = {
        phase: 'loading',
        estText: '推定中',
        estIsPlaceholder: true,
        estTitle:
          '来場者数は取得済みです。コメント参加者または配信経過から推定材料を集めています。',
        subText: '材料待ち',
        concurrentLoadingHidden: true,
        concurrentReadyHidden: false,
        ariaBusy: true,
        numericEstimated: null,
        charReactionDelta: null
      };
      nextConcurrentEstimated = prev.concurrentEstimated;
    } else {
      nextConcurrentEstimated = resolved.estimated;

    const estStr = resolved.estimated.toLocaleString('ja-JP');
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
    // 研究中シグナル C/D/blend の診断表示（主値には未統合・観察/較正用）。
    // official のときも併記して「公式同接 vs 研究中シグナル」の答え合わせに使う。
    {
      /** @type {string[]} */
      const rs = [];
      if (base.signalC > 0) rs.push(`C[リトル]≈${base.signalC}`);
      if (base.signalD > 0) rs.push(`D[密度]≈${base.signalD}`);
      if (base.blended > 0) {
        rs.push(`blend≈${base.blended}(${base.blendedSignalCount}信号)`);
      }
      if (rs.length > 0) parts.push(`研究中 ${rs.join(' ')}`);
    }
    if (sparseConcurrent) {
      parts.push(SPARSE_CONCURRENT_ESTIMATE_NOTE);
    }
    // 自動補正（オートキャリブレーション）が効いているときは診断に明示する。
    // official のときは表示値に影響しないため注記しない（公式直値が優先）。
    if (
      opts?.calibration &&
      opts.calibration.applied &&
      resolved.method !== 'official'
    ) {
      const c = opts.calibration;
      const basisLabel = c.basis === 'official' ? '真値' : '自己整合';
      const scaleStr =
        typeof c.multiplierScale === 'number' && Number.isFinite(c.multiplierScale)
          ? `×${c.multiplierScale}`
          : '';
      const cntStr =
        typeof c.sampleCount === 'number' && c.sampleCount > 0 ? ` ${c.sampleCount}件` : '';
      parts.push(`自動補正ON(${basisLabel}${cntStr}${scaleStr ? ` 倍率${scaleStr}` : ''})`);
    }

    /** @type {string} */
    let subText;
    if (resolved.method === 'official') {
      subText = '直接値';
    } else if (resolved.method === 'nowcast') {
      subText =
        resolved.freshnessMs != null
          ? `${Math.round(resolved.freshnessMs / 1000)}秒前から補間`
          : '補間';
    } else if (base.method === 'combined') {
      subText = `${base.activeCommenters}人×${base.multiplier} + 滞留${base.retentionPct}%`;
    } else {
      subText = `5分内 ${base.activeCommenters}人×${base.multiplier}`;
    }

    /** @type {number|null} */
    let concurrentReactionDelta = null;
    if (
      prev.concurrentEstimated != null &&
      resolved.estimated !== prev.concurrentEstimated
    ) {
      concurrentReactionDelta = Math.abs(
        resolved.estimated - prev.concurrentEstimated
      );
    }

    concurrent = {
      phase: 'ready',
      estText: `${directLike ? '' : '~'}${estStr}`,
      estIsPlaceholder: false,
      estTitle: parts.join(' | '),
      subText,
      concurrentLoadingHidden: true,
      concurrentReadyHidden: false,
      ariaBusy: false,
      numericEstimated: resolved.estimated,
      charReactionDelta: concurrentReactionDelta
    };
    }
  } else {
    concurrent = {
      phase: 'loading',
      estText: '計測中…',
      estIsPlaceholder: true,
      estTitle: null,
      subText: '人',
      concurrentLoadingHidden: false,
      concurrentReadyHidden: true,
      ariaBusy: true,
      numericEstimated: null,
      charReactionDelta: null
    };
  }

  const st = summarizeRecordedCommenters(commentEntries);

  /** @type {WatchMetaLabeledTextVm} */
  let uniqueUsers;
  if (st.uniqueKnownUserIds > 0) {
    uniqueUsers = {
      text: st.uniqueKnownUserIds.toLocaleString('ja-JP'),
      title: 'userId が取れたコメントについての distinct 数'
    };
  } else if (st.distinctAvatarUrls > 0) {
    uniqueUsers = {
      text: `≈${st.distinctAvatarUrls}`,
      title:
        'userId 未取得のため、記録された https アイコン URL の種類数を参考表示（重複アイコンは1にまとまります）'
    };
  } else {
    uniqueUsers = {
      text: '0',
      title:
        'userId も有効な avatarUrl も無いコメントのみのときは 0 のままです'
    };
  }

  const n = Math.max(0, Math.floor(Number(st.commentsWithoutUserId) || 0));
  const note = buildWatchAudienceNote({ snapshot });

  /** @type {number|null} */
  let nextViewerCount = prev.viewerCount;
  if (numericVisitor != null) {
    nextViewerCount = numericVisitor;
  }

  return {
    visitor,
    concurrent,
    uniqueUsers,
    commentsNoId: {
      text: n.toLocaleString('ja-JP'),
      title: null
    },
    audienceNote: {
      text: note.body,
      title: note.title
    },
    nextPrevForReactions: {
      viewerCount: nextViewerCount,
      concurrentEstimated: nextConcurrentEstimated
    }
  };
}
