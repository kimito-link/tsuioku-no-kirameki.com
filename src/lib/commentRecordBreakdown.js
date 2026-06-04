/**
 * v0.1.627: コメント記録カードの「内訳」表示用・純関数。
 *
 * ユーザー証言「コメント記録の数があわないし、何処に反映されているかわからない レポートとPOPに」
 * の解消用。`公式 N / 記録 M` の M が何で構成されているかを目に見える形で出すための集計。
 *
 * 設計判断:
 *   - ギフト/広告(nicoad) は persistableCommentRow.js:32-36 で**保存時点で除外済み**のため、
 *     記録には含まれない。よって本関数の対象は「保存された後の rows」のみ。
 *   - 内訳カテゴリ:
 *       normal           - 通常コメント(一般人 + 配信者本人含む応援系)
 *       interestArrival  - 「○○が好きなN人が来場しました」
 *       followNotice     - フォロー通知(Phase B で parser 追加・現状 0)
 *       otherSystem      - その他システムメッセージ(運営アナウンス等)
 *   - 「ギフト・広告は別カウント」をユーザーに明示するため、合計テキスト表示側で
 *     "ギフト・広告は別カードを参照" を出すのが UX 上の正解。
 *
 * @module commentRecordBreakdown
 */

import { parseInterestArrivalComment } from './parseInterestArrivalComment.js';

/**
 * @typedef {{
 *   total: number,
 *   normal: number,
 *   interestArrival: number,
 *   followNotice: number,
 *   otherSystem: number
 * }} CommentRecordBreakdown
 */

/**
 * 保存されたコメント配列の内訳を集計する。
 *
 * @param {readonly object[]} comments 保存後の rows(各々 `{text, commentType?, isSystem?}` を持つ想定)
 * @returns {CommentRecordBreakdown}
 */
export function summarizeCommentRecordBreakdown(comments) {
  let interestArrival = 0;
  const followNotice = 0; // Phase B 用 placeholder(現状はパーサ未実装で常に 0)
  let otherSystem = 0;
  let normal = 0;
  const total = Array.isArray(comments) ? comments.length : 0;
  if (!total) {
    return { total: 0, normal: 0, interestArrival: 0, followNotice: 0, otherSystem: 0 };
  }
  for (const c of comments) {
    if (!c || typeof c !== 'object') continue;
    const text = String(/** @type {any} */ (c).text ?? '');
    if (parseInterestArrivalComment(text)) {
      interestArrival += 1;
      continue;
    }
    // Phase B 用 placeholder: parseFollowNoticeComment 実装後にここで分岐追加。
    const commentType = /** @type {any} */ (c).commentType;
    const isSystem = /** @type {any} */ (c).isSystem === true;
    if (commentType === 'generalSystemMessage' || isSystem) {
      otherSystem += 1;
      continue;
    }
    normal += 1;
  }
  return { total, normal, interestArrival, followNotice, otherSystem };
}

/**
 * 内訳を popup の sub 行用テキストに整形する。0 件カテゴリは省略。
 * 全部 normal の場合は空文字を返す(行ごと非表示にする側で hidden 制御)。
 *
 * @param {CommentRecordBreakdown} breakdown
 * @returns {string}
 */
export function formatCommentRecordBreakdownLine(breakdown) {
  if (!breakdown || breakdown.total <= 0) return '';
  if (breakdown.normal === breakdown.total) return '';
  /** @type {string[]} */
  const parts = [];
  if (breakdown.normal > 0) parts.push(`通常 ${breakdown.normal.toLocaleString('ja-JP')}`);
  if (breakdown.interestArrival > 0) {
    parts.push(`興味来場 ${breakdown.interestArrival.toLocaleString('ja-JP')}`);
  }
  if (breakdown.followNotice > 0) {
    parts.push(`フォロー通知 ${breakdown.followNotice.toLocaleString('ja-JP')}`);
  }
  if (breakdown.otherSystem > 0) {
    parts.push(`システム ${breakdown.otherSystem.toLocaleString('ja-JP')}`);
  }
  if (!parts.length) return '';
  return `内訳: ${parts.join(' / ')}`;
}
