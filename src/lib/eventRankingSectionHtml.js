// eventRankingSectionHtml.js
// v0.1.810(星野ロミ式コンポーネント化・第3弾): popup-entry.js の巨大 HTML ビルダー
//   buildHtmlReportDocument(1482行)から、純粋な「イベント順位セクション」生成部を抽出(挙動完全不変)。
//   正本=council/hoshinoromi-componentize-factor-SYNTHESIS.md。Codex の事前調査で安全対象として特定
//   (Codex CLI は usage limit で起動不可→司令塔が characterization-test-first で直接実装)。
//
// この関数は DOM/chrome/await/可変モジュール状態を一切参照しない純関数。依存は escapeHtml/escapeAttr/
//   buildUserProfileLinkedLabelHtml の既存 lib 3つだけ=lib 側で直接 import すれば引数注入も不要(罠ゼロ)。

import { escapeHtml, escapeAttr } from './htmlEscape.js';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';

/**
 * イベント順位セクションの HTML を組み立てる。
 * eventRankingModel が無効ならイベント不参加/未取得として空文字(セクションごと省略・fail-soft)。
 * @param {unknown} eventRankingModel buildEventRankingReportModel の戻り(self/eventName/rows/isStale)
 * @param {{ userId?: unknown }|null|undefined} [broadcasterProfileModel] 配信者本人のプロフィール(自分の数字IDリンク用)
 * @returns {string}
 */
export function buildEventRankingSectionHtml(eventRankingModel, broadcasterProfileModel) {
  let eventRankingSectionHtml = '';
  try {
    const erm = /** @type {any} */ (eventRankingModel);
    if (erm && typeof erm === 'object') {
      const fmtN = (/** @type {number} */ n) => Number(n).toLocaleString('en-US');
      const self = erm.self && typeof erm.self === 'object' ? erm.self : null;
      const evName = String(erm.eventName || '').trim();
      const rows = Array.isArray(erm.rows) ? erm.rows : [];

      const headParts = [];
      if (evName) headParts.push(`<p class="event-rank__name">🏆 ${escapeHtml(evName)}</p>`);
      if (self && (self.rank != null || self.score != null)) {
        const selfUid = String(broadcasterProfileModel?.userId || '').trim();
        const selfNameHtml = self.broadcasterName
          ? /^\d{1,18}$/.test(selfUid)
            ? buildUserProfileLinkedLabelHtml(selfUid, String(self.broadcasterName))
            : escapeHtml(String(self.broadcasterName))
          : '';
        const who = self.broadcasterName ? `${selfNameHtml}さん` : 'この配信者さん';
        const rk = self.rank != null ? `現在 <strong>${escapeHtml(String(self.rank))}</strong> 位` : '';
        const sc = self.score != null ? ` 💎 <strong>${escapeHtml(fmtN(self.score))}</strong>` : '';
        headParts.push(`<p class="event-rank__self">${who} ${rk}${sc}</p>`);
        if (self.rank != null && self.rank > 1 && self.diffToNext != null && self.diffToNext > 0) {
          headParts.push(`<p class="event-rank__diff">あと 💎 ${escapeHtml(fmtN(self.diffToNext))} で ${escapeHtml(String(self.rank - 1))} 位</p>`);
        }
      }

      const rowsHtml = rows
        .map((/** @type {any} */ r) => {
          const rank = escapeHtml(String(r.rank));
          const rowUid = String(r.userId || '').trim();
          const rawName = String(r.name || '名無し');
          const name = /^\d{1,18}$/.test(rowUid)
            ? buildUserProfileLinkedLabelHtml(rowUid, rawName)
            : escapeHtml(rawName);
          const score = escapeHtml(fmtN(Number(r.score) || 0));
          // model 側で http/https のみに正規化済み。出力時も二重で scheme 検証（S-2）。
          const thumb = /^https?:\/\//i.test(String(r.thumbnailUrl || '')) ? String(r.thumbnailUrl) : '';
          const imgInner = thumb
            ? `<img class="event-rank__thumb" src="${escapeAttr(thumb)}" alt="" width="28" height="28" decoding="async" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'" />`
            : `<span class="event-rank__thumb event-rank__thumb--none" aria-hidden="true"></span>`;
          const img = /^\d{1,18}$/.test(rowUid)
            ? `<a href="https://www.nicovideo.jp/user/${encodeURIComponent(rowUid)}" target="_blank" rel="noopener noreferrer" class="nl-user-thumb-link">${imgInner}</a>`
            : imgInner;
          return (
            `<tr>` +
            `<td class="event-rank__rank">${rank}</td>` +
            `<td>${img}</td>` +
            `<td class="event-rank__user">${name}</td>` +
            `<td class="event-rank__score">💎 ${score}</td>` +
            `</tr>`
          );
        })
        .join('');

      const staleNote = erm.isStale
        ? `<p class="event-rank__stale">※ この順位は少し前に取得した値です（配信中に変動します）。</p>`
        : '';

      if (headParts.length > 0 || rowsHtml) {
        eventRankingSectionHtml =
          `<section class="card" id="sec-event-ranking" style="margin-top:12px;">` +
          `<h2>イベント順位</h2>` +
          `<p class="guide-lead">この配信が参加しているイベントの💎スコア順ランキングなのだ（公式の表示に準拠）。</p>` +
          (headParts.length ? `<div class="event-rank__head">${headParts.join('')}</div>` : '') +
          (rowsHtml
            ? `<table class="event-rank__table"><thead><tr><th>順位</th><th></th><th>配信者</th><th>累計💎</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
            : '') +
          staleNote +
          `</section>`;
      }
    }
  } catch {
    eventRankingSectionHtml = '';
  }
  return eventRankingSectionHtml;
}
