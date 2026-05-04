/**
 * 応援ユーザーレーンの案内 HTML（ポップアップ・E2E と共有）
 */

import { escapeAttr, escapeHtml } from './htmlEscape.js';
import { SUPPORT_VISUAL_DEV_MONITOR_SUMMARY_LABEL } from './supportVisualStoryCopy.js';

/** @param {string} src @param {string} textEscaped 既に escapeHtml 済みの本文 */
function storyUserLaneGuideLine(src, textEscaped) {
  return (
    `<div class="nl-story-userlane-guide__line">` +
    `<img class="nl-story-userlane-guide__face" src="${escapeAttr(src)}" alt="" width="24" height="24" decoding="async" />` +
    `<span class="nl-story-userlane-guide__text">${textEscaped}</span>` +
    `</div>`
  );
}

/** @param {string} faceLink 案内アイコン URL */
export function buildStoryUserLaneGuideTopHtml(faceLink) {
  return storyUserLaneGuideLine(
    faceLink,
    escapeHtml(
      'りんく: 数値ユーザーID＋個人サムネが揃った応援だけ、この列に載せるよ。匿名（a:）はカスタム表示名やサムネが見えていても上には出さず、下の段に流す設計だよ。'
    )
  );
}

/** @param {string} faceKonta */
export function buildStoryUserLaneGuideKontaHtml(faceKonta) {
  return storyUserLaneGuideLine(
    faceKonta,
    escapeHtml(
      'こん太: 2番目の優先として、数値IDのアカウントで表示名か個人サムネのどちらかまで取れた人は、その次の段として並びやすいよ。ニコの匿名ID（a: 形式）はここには載せず、りんく条件を満たすときだけりんく、それ以外はたぬ姉側だよ。'
    )
  );
}

/** @param {string} faceTanu */
export function buildStoryUserLaneGuideTanuHtml(faceTanu) {
  return storyUserLaneGuideLine(
    faceTanu,
    escapeHtml(
      `たぬ姉: 匿名（a:）の応援、表示名やサムネが揃わない応援、ID 不明はぜんぶこの段に集めるよ。下の「${SUPPORT_VISUAL_DEV_MONITOR_SUMMARY_LABEL}」を開くと、どこの情報が欠けているか確認してね。`
    )
  );
}

/** @param {number} displayCount */
export function buildStoryUserLaneGuideFootHtml(displayCount) {
  const n = Math.max(0, Math.floor(Number(displayCount) || 0));
  return `<p class="nl-story-userlane-guide__foot" aria-live="polite">${escapeHtml(`いま ${n} 件を表示中`)}</p>`;
}

/**
 * レーン直下の「表示枠」と「記録コメント総数」をつなぐ（診断ブロックの total と同じ数を渡すこと）。
 * @param {number} laneDisplayedSlots 三段レーンに並べた合計枠数（dedupe+cap 後）
 * @param {number|undefined|null} recordedCommentRowsTotal 当放送の記録コメント行数。未指定・非有限・0 以下なら第2文なし。
 * @returns {string}
 */
export function buildStoryUserLaneGuideFootAndRecordedHtml(
  laneDisplayedSlots,
  recordedCommentRowsTotal
) {
  const foot = buildStoryUserLaneGuideFootHtml(laneDisplayedSlots);
  if (
    recordedCommentRowsTotal == null ||
    !Number.isFinite(Number(recordedCommentRowsTotal))
  ) {
    return foot;
  }
  const total = Math.max(0, Math.floor(Number(recordedCommentRowsTotal)));
  if (total <= 0) {
    return foot;
  }
  return (
    foot +
    `<p class="nl-story-userlane-guide__recorded" aria-live="polite">` +
    `この放送で記録している応援コメントは <strong>${total}</strong> 件です。` +
    `上の件数はレーンに並べた人数の合計であり、コメント件数とは数え方が異なります。` +
    `</p>`
  );
}

/** @param {string} line1 @param {string} line2 */
function storyUserLaneEmptyNoteTwoLines(line1, line2) {
  return (
    `<p class="nl-story-userlane__empty-note-p">${escapeHtml(line1)}</p>` +
    `<p class="nl-story-userlane__empty-note-p">${escapeHtml(line2)}</p>`
  );
}

/** りんく段・件数 0 のとき（案内文の条件は buildStoryUserLaneGuideTopHtml に揃える） */
export function buildStoryUserLaneEmptyNoteLinkHtml() {
  return storyUserLaneEmptyNoteTwoLines(
    'この段は「数値ユーザーID＋個人サムネがそろった応援」だけが並ぶよ。いまの記録では該当者がいません。',
    '条件を満たす応援が届くと自動で増えます。'
  );
}

/** こん太段・件数 0 */
export function buildStoryUserLaneEmptyNoteKontaHtml() {
  return storyUserLaneEmptyNoteTwoLines(
    'この段は「数値IDで、表示名か個人サムネのどちらかまで取れた応援」だけが並ぶよ。いまの記録では該当者がいません。',
    '条件を満たす応援が届くと自動で増えます。'
  );
}

/** たぬ姉段・件数 0 */
export function buildStoryUserLaneEmptyNoteTanuHtml() {
  return storyUserLaneEmptyNoteTwoLines(
    'この段は「匿名（a:）や表示名・サムネが揃わない応援、ID 不明」だけが並ぶよ。いまの記録では該当者がいません。',
    '条件を満たす応援が届くと自動で増えます。'
  );
}
