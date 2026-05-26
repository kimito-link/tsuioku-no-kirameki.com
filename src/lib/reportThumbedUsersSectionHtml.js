/**
 * HTML レポートの「サムネ付きユーザー一覧」セクションを純粋に組み立てる。
 *
 * 背景（C-7: buildHtmlReportDocument の分割・pure refactor）:
 *   popup-entry.js#buildHtmlReportDocument 内にインラインで書かれていた
 *   `reportThumbCellHtml` / `thumbNumericBlockHtml` / `thumbAnonymousBlockHtml` /
 *   `thumbedUsersSectionHtml` を、挙動を 1bit も変えずに純関数へ切り出したもの。
 *
 *   入力は `categorizeUsersForThumbGrid`（src/lib/userThumbGrid.js）が返す
 *   数値 ID ユーザー配列 / 匿名ユーザー配列（いずれも ResolvedThumbGridUser[]）。
 *   出力は `<section id="sec-thumb-grid">…</section>` の HTML 文字列（両方空なら ''）。
 *
 *   モジュール状態・DOM・Date.now 等の非決定値には依存しない（入力配列だけで出力が
 *   決まる）。escape は既存 lib（escapeAttr）、ラベル整形は既存 lib
 *   （displayUserLabel / buildUserProfileLinkedLabelHtml）を用いるため循環 import なし。
 */

import { escapeAttr } from './htmlEscape.js';
import { displayUserLabel } from './userRooms.js';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';

/**
 * 1 ユーザー分のサムネセル（<li>）。
 * @param {import('./userThumbGrid.js').ResolvedThumbGridUser} u
 * @returns {string}
 */
function reportThumbCellHtml(u) {
  const label = displayUserLabel(u.userId, u.nickname || '');
  const labelHtml = buildUserProfileLinkedLabelHtml(u.userId, label);
  return `<li class="report-thumb-grid__cell">
        <span class="report-thumb-grid__avatar-wrap"><img class="report-thumb-grid__avatar" src="${escapeAttr(u.thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
        <span class="report-thumb-grid__label">${labelHtml}</span>
        <span class="report-thumb-grid__count">${u.count}件</span>
      </li>`;
}

/**
 * サムネ付きユーザー一覧セクション全体の HTML。
 * 数値 ID・匿名のどちらにもユーザーがいなければ空文字を返す。
 *
 * @param {{
 *   numericUsers?: import('./userThumbGrid.js').ResolvedThumbGridUser[],
 *   anonymousUsers?: import('./userThumbGrid.js').ResolvedThumbGridUser[]
 * }} input
 * @returns {string}
 */
export function buildReportThumbedUsersSectionHtml(input) {
  const numericUsers = Array.isArray(input?.numericUsers) ? input.numericUsers : [];
  const anonymousUsers = Array.isArray(input?.anonymousUsers)
    ? input.anonymousUsers
    : [];

  const thumbNumericBlockHtml =
    numericUsers.length > 0
      ? `
          <h3 class="report-thumb-grid__heading">数値 ID（個人サムネ・ニコ既定アイコン）<span class="report-thumb-grid__heading-count">${numericUsers.length}名</span></h3>
          <ol class="report-thumb-grid">${numericUsers.map(reportThumbCellHtml).join('')}</ol>
        `
      : '';
  const thumbAnonymousBlockHtml =
    anonymousUsers.length > 0
      ? `
          <h3 class="report-thumb-grid__heading">匿名（識別子から生成した identicon）<span class="report-thumb-grid__heading-count">${anonymousUsers.length}名</span></h3>
          <ol class="report-thumb-grid">${anonymousUsers.map(reportThumbCellHtml).join('')}</ol>
        `
      : '';
  return numericUsers.length > 0 || anonymousUsers.length > 0
    ? `
        <section class="card" id="sec-thumb-grid">
          <h2>サムネ付きユーザー一覧</h2>
          <p class="guide-lead">アイコンが解決できた応援ユーザーを件数の多い順、種別ごとに並べたのだ（各カテゴリ最大 80 名）。アイコンは ① 個人サムネ ② ニコ既定アイコン ③ 識別子から生成した identicon の優先順なのだ。</p>
          ${thumbNumericBlockHtml}
          ${thumbAnonymousBlockHtml}
        </section>
      `
    : '';
}
