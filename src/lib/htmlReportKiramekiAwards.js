import { computeKiramekiAwards } from './kiramekiAwards.js';
import { HTML_REPORT_HEAVY_COMMENT_THRESHOLD } from './reportCommentsTableSection.js';

/** HTML レポート heavy 時の「きらめきの賞」コメント判定上限。 */
export const HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_MAX = 2000;

/** heavy 時も序盤の空気を落としすぎないため、先頭側は固定で残す。 */
export const HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_HEAD = 200;

/**
 * @typedef {'full'|'sampled'} HtmlReportKiramekiAwardsMode
 */

/**
 * @typedef {Object} HtmlReportKiramekiAwardsSelection
 * @property {unknown[]} commentsForAwards
 * @property {HtmlReportKiramekiAwardsMode} mode
 * @property {number} originalCommentCount
 * @property {number} awardCommentCount
 * @property {number} heavyThreshold
 * @property {number} sampleMax
 */

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeNonNegativeInteger(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

/**
 * 先頭コメントを一定数残し、残りを均等サンプリングする。
 * 件数表示・テーブル表示は呼び出し側が実数を使い続ける前提で、賞のコメント本文判定だけを軽くする。
 *
 * @param {unknown[]} comments
 * @param {{ sampleMax?: number, headCount?: number }} [opts]
 * @returns {unknown[]}
 */
export function sampleKiramekiAwardCommentsForHtmlReport(comments, opts = {}) {
  const list = Array.isArray(comments) ? comments : [];
  const sampleMax = normalizeNonNegativeInteger(
    opts.sampleMax,
    HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_MAX
  );
  if (sampleMax <= 0) return [];
  if (list.length <= sampleMax) return list;
  if (sampleMax === 1) return [list[0]];

  const headCount = Math.min(
    normalizeNonNegativeInteger(
      opts.headCount,
      HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_HEAD
    ),
    sampleMax,
    list.length
  );
  const sampled = list.slice(0, headCount);
  const tailLimit = sampleMax - sampled.length;
  if (tailLimit <= 0) return sampled;

  const tailStart = headCount;
  const tailLength = list.length - tailStart;
  if (tailLength <= tailLimit) return sampled.concat(list.slice(tailStart));
  if (tailLimit === 1) return sampled.concat(list[list.length - 1]);

  const lastTailOffset = tailLength - 1;
  for (let i = 0; i < tailLimit; i += 1) {
    const idx = tailStart + Math.floor((i * lastTailOffset) / (tailLimit - 1));
    sampled.push(list[idx]);
  }
  return sampled;
}

/**
 * @param {unknown[]} comments
 * @param {{ heavyThreshold?: number, sampleMax?: number, headCount?: number }} [opts]
 * @returns {HtmlReportKiramekiAwardsSelection}
 */
export function selectKiramekiAwardCommentsForHtmlReport(comments, opts = {}) {
  const list = Array.isArray(comments) ? comments : [];
  const heavyThreshold = normalizeNonNegativeInteger(
    opts.heavyThreshold,
    HTML_REPORT_HEAVY_COMMENT_THRESHOLD
  );
  const sampleMax = normalizeNonNegativeInteger(
    opts.sampleMax,
    HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_MAX
  );
  if (list.length <= heavyThreshold) {
    return {
      commentsForAwards: list,
      mode: 'full',
      originalCommentCount: list.length,
      awardCommentCount: list.length,
      heavyThreshold,
      sampleMax
    };
  }

  const commentsForAwards = sampleKiramekiAwardCommentsForHtmlReport(list, {
    sampleMax,
    headCount: opts.headCount
  });
  return {
    commentsForAwards,
    mode: 'sampled',
    originalCommentCount: list.length,
    awardCommentCount: commentsForAwards.length,
    heavyThreshold,
    sampleMax
  };
}

/**
 * HTML レポート専用の賞計算入口。
 * 軽量配信では computeKiramekiAwards と同じ入力を渡し、heavy 配信だけ本文判定の入力を cap する。
 *
 * @param {import('./kiramekiAwards.js').KiramekiAwardsInput} input
 * @param {{
 *   heavyThreshold?: number,
 *   sampleMax?: number,
 *   headCount?: number,
 *   computeAwards?: (input: import('./kiramekiAwards.js').KiramekiAwardsInput) => import('./kiramekiAwards.js').KiramekiAwardsResult
 * }} [opts]
 * @returns {import('./kiramekiAwards.js').KiramekiAwardsResult & { selection: HtmlReportKiramekiAwardsSelection }}
 */
export function computeKiramekiAwardsForHtmlReport(input, opts = {}) {
  const selection = selectKiramekiAwardCommentsForHtmlReport(input?.comments, opts);
  const computeAwards =
    typeof opts.computeAwards === 'function' ? opts.computeAwards : computeKiramekiAwards;
  const result = computeAwards({
    ...input,
    comments: /** @type {import('./kiramekiAwards.js').CommentRow[]} */ (
      selection.commentsForAwards
    )
  });
  return {
    awards: Array.isArray(result?.awards) ? result.awards : [],
    userKeyToAwardIds:
      result?.userKeyToAwardIds instanceof Map ? result.userKeyToAwardIds : new Map(),
    selection
  };
}
