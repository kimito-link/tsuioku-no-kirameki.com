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

/** @param {string} faceRink 案内アイコン URL */
export function buildStoryUserLaneGuideTopHtml(faceRink) {
  return storyUserLaneGuideLine(
    faceRink,
    escapeHtml(
      'りんく: ニコ生のユーザー識別子（数値ID・匿名の a: 形式）が付いた応援だけがこの列に載るよ。並びでは、個人サムネと「匿名」「（未取得）」「user と英数字だけの自動名」以外の表示名がそろった人をいちばん手前に寄せるよ。匿名 ID は最上段（りんく列）には上げず、こん太列までに留めるよ。サムネとプロフィールを整えていると、配信者側からも見つけやすくなりやすい、という文脈でもあるよ。'
    )
  );
}

/** @param {string} faceKonta */
export function buildStoryUserLaneGuideKontaHtml(faceKonta) {
  return storyUserLaneGuideLine(
    faceKonta,
    escapeHtml(
      'こん太: 2番目の優先として、表示名か個人サムネのどちらかまで取れた人は、その次の段として並びやすいよ（全員を隠すわけじゃないよ）。'
    )
  );
}

/** @param {string} faceTanu */
export function buildStoryUserLaneGuideTanuHtml(faceTanu) {
  return storyUserLaneGuideLine(
    faceTanu,
    escapeHtml(
      'たぬ姉: IDが取れていないコメントは、この列には載せないよ（区別できないから）。あと取得が薄い人は並びの後ろ寄りになりやすいから、下の「状況の詳細」で欠けを確認してね。'
    )
  );
}

/** @param {number} displayCount */
export function buildStoryUserLaneGuideFootHtml(displayCount) {
  const n = Math.max(0, Math.floor(Number(displayCount) || 0));
  return `<p class="nl-story-userlane-guide__foot" aria-live="polite">${escapeHtml(`いま ${n} 件を表示中`)}</p>`;
}
