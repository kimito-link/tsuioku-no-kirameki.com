/**
 * 応援ユーザーレーンの案内 HTML（ポップアップ・E2E と共有）
 */

import { escapeAttr, escapeHtml } from './htmlEscape.js';

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
      'こん太: 数値ユーザーIDで、表示名は強い（「匿名」「ゲスト」などの自動名でない）けれど、個人サムネがまだ確認できていない人を中段に置くよ。匿名（a:）はここには混ぜないよ。'
    )
  );
}

/** @param {string} faceTanu */
export function buildStoryUserLaneGuideTanuHtml(faceTanu) {
  return storyUserLaneGuideLine(
    faceTanu,
    escapeHtml(
      'たぬ姉: 匿名（a:）の応援、表示名やサムネが揃わない応援、ID 不明はぜんぶこの段に集めるよ。下の「状況の詳細」でどこの情報が欠けているか確認してね。'
    )
  );
}

/** @param {number} displayCount */
export function buildStoryUserLaneGuideFootHtml(displayCount) {
  const n = Math.max(0, Math.floor(Number(displayCount) || 0));
  return `<p class="nl-story-userlane-guide__foot" aria-live="polite">${escapeHtml(`いま ${n} 件を表示中`)}</p>`;
}
