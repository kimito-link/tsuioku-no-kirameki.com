// 応援ルームカード（renderUserRooms の各 <li class="room-card">）の inner HTML を組む純関数。
//   popup-entry.js:renderUserRooms から「view-model → HTML 文字列」部分だけを抽出（pure refactor・挙動不変）。
//   ★非純粋な部分（サムネ解決 pickSupportGrowthTileForStory / storyAvatarLoadGuard / 生成後の
//     querySelector 配線）は popup に残す。ここは渡された確定値から文字列を作るだけ。
//   依存は既存 lib（htmlEscape / supportGrowthTileSrc）のみ＝循環 import なし。
import { escapeHtml, escapeAttr } from './htmlEscape.js';
import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';

/**
 * ルームカード1枚の inner HTML を返す（popup の li.innerHTML にそのまま入る）。
 *
 * @param {object} input
 * @param {string} input.userKey      ユーザーキー（数値 ID or 匿名キー）
 * @param {string} input.label        表示名（displayUserLabel で確定済み）
 * @param {string} input.displayThumb 表示するサムネ src（load guard 通過後の確定値）
 * @param {number} input.count        総応援件数
 * @param {number} input.recentCount  直近5分の件数
 * @param {string} input.lastText     最新コメント本文（無ければ ''）
 * @param {boolean} input.isUnknown   投稿者ID未取得か
 * @param {number} input.maxTotal     表示中ルームの最大 count（バー幅の分母・>=1）
 * @param {number} input.maxRecent    表示中ルームの最大 recentCount（バー幅の分母・>=1）
 * @param {boolean} input.compactRooms compact 表示か（true なら棒グラフ行を出さない）
 * @returns {string} li.innerHTML 文字列
 */
export function buildRoomCardInnerHtml(input) {
  const r = /** @type {Record<string, unknown>} */ (
    input && typeof input === 'object' ? input : {}
  );
  const userKey = String(r.userKey == null ? '' : r.userKey);
  const label = String(r.label == null ? '' : r.label);
  const displayThumb = String(r.displayThumb == null ? '' : r.displayThumb);
  const count = Number(r.count) || 0;
  const recentCount = Number(r.recentCount) || 0;
  const lastText = String(r.lastText == null ? '' : r.lastText);
  const isUnknown = r.isUnknown === true;
  const maxTotal = Number(r.maxTotal) || 1;
  const maxRecent = Number(r.maxRecent) || 1;
  const compactRooms = r.compactRooms === true;

  const thumbRp = isHttpOrHttpsUrl(displayThumb) ? ' referrerpolicy="no-referrer"' : '';
  const avatarImgHtml = `<img class="nl-ticker-latest__avatar room-card__avatar" alt="" src="${escapeAttr(displayThumb)}" decoding="async" data-on-error-fallback="blank"${thumbRp}>`;
  // 原則「サムネ・ハンドル・ID はひとかたまり」: 数値 ID はサムネ+名前を同じアンカーで括る。
  const roomLinkable = !isUnknown && /^\d{1,18}$/.test(userKey);
  const aOpen = (/** @type {string} */ cls) => `<a class="${cls}" href="https://www.nicovideo.jp/user/${encodeURIComponent(userKey)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(label)} のユーザーページを開く">`;
  const avatarHtml = roomLinkable ? `${aOpen('room-card__id-link')}${avatarImgHtml}</a>` : avatarImgHtml;
  const nameHtml = roomLinkable
    ? `${aOpen('room-card__id-link room-name')}${escapeHtml(label)}</a>`
    : `<span class="room-name" title="${escapeHtml(userKey)}">${escapeHtml(label)}</span>`;
  const totalPercent = Math.max(6, Math.min(100, (count / maxTotal) * 100));
  const recentPercent =
    recentCount > 0 ? Math.max(4, Math.min(100, (recentCount / maxRecent) * 100)) : 0;
  const deltaLabel = recentCount > 0 ? `+${recentCount} / 5分` : '±0 / 5分';
  const hint = isUnknown
    ? '<div class="room-hint">投稿者ID未取得のコメントをここにまとめています。</div>'
    : '';
  // compact/full は「棒グラフ行の有無」だけ違う。共通部(アバター+名前+プレビュー+hint)を共有。
  const barRowHtml = compactRooms
    ? ''
    : `<div class="room-bar-row"><div class="room-bar-track"><div class="room-bar-total" style="width:${totalPercent.toFixed(2)}%"></div><div class="room-bar-recent" style="width:${recentPercent.toFixed(2)}%"></div></div><span class="room-delta ${recentCount > 0 ? 'up' : ''}">${deltaLabel}</span></div>`;
  const previewHtml = lastText ? `<div class="room-preview">${escapeHtml(lastText)}</div>` : '';
  return `
      <div class="room-card__row">
        ${avatarHtml}
        <div class="room-main">
          <div class="room-name-row">${nameHtml}</div>
          ${barRowHtml}
          ${previewHtml}
          ${hint}
        </div>
      </div>
    `;
}
