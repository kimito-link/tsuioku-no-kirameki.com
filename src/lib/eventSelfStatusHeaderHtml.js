// eventSelfStatusHeaderHtml.js
// v0.1.809(星野ロミ式コンポーネント化・第2弾): popup-entry.js の純粋寄り HTML ビルダー
//   buildEventSelfStatusHeaderHtml を抽出(挙動完全不変)。
//   正本=council/hoshinoromi-componentize-factor-SYNTHESIS.md。
//
// この関数は DOM/chrome/可変モジュール状態を一切参照しない純関数。依存は:
//   - escapeHtml(既存 lib)
//   - CHARA_IMG_BASE(既存 lib 定数)
//  の2つだけ=lib 側で直接 import すれば entry 側はモジュール変数注入も不要(罠ゼロ)。

import { escapeHtml } from './htmlEscape.js';
import { CHARA_IMG_BASE } from './celebrationCharaAssets.js';

/**
 * 北極星イベントの「配信者本人の現在順位」ヘッダ HTML を組み立てる。
 * 順位が確定できなければ空文字(ヘッダを出さない)。
 * @param {{ rank?: unknown, score?: unknown, diffToNext?: unknown, eventName?: unknown }|null|undefined} self
 * @param {string} [broadcasterName]
 * @returns {string}
 */
export function buildEventSelfStatusHeaderHtml(self, broadcasterName) {
  if (!self || typeof self !== 'object') return '';
  const rank =
    typeof self.rank === 'number' && Number.isFinite(self.rank) && self.rank > 0
      ? Math.trunc(self.rank)
      : null;
  const score =
    typeof self.score === 'number' && Number.isFinite(self.score) && self.score >= 0
      ? Math.trunc(self.score)
      : null;
  const diff =
    typeof self.diffToNext === 'number' &&
    Number.isFinite(self.diffToNext) &&
    self.diffToNext >= 0
      ? Math.trunc(self.diffToNext)
      : null;
  const eventName = String(self.eventName || '').trim();
  const name = String(broadcasterName || '').trim();
  const fmt = (/** @type {number} */ n) => n.toLocaleString('en-US');

  // 本人の順位が確定できなければヘッダ自体を出さない（順位を大きく見せるのが主目的）。
  if (rank == null) return '';

  // 1-3 位はメダル絵文字、それ以外は順位数字を強調。
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
  const tierClass = rank <= 3 ? ` nl-event-self__badge--top${rank}` : '';
  const badgeInner = medal
    ? `<span class="nl-event-self__medal">${medal}</span><span class="nl-event-self__rank-num">${rank}<span class="nl-event-self__rank-suffix">位</span></span>`
    : `<span class="nl-event-self__rank-num nl-event-self__rank-num--plain">${rank}<span class="nl-event-self__rank-suffix">位</span></span>`;

  // ゆっくりりんくの語りかけ。配信者名がある時だけ名前入りに。
  const whoLabel = name ? `${escapeHtml(name)}さん` : 'この配信者さん';
  const scoreTxt = score != null ? `（💎${fmt(score)}）` : '';
  const talkMain = `${whoLabel}は現在 <strong>${rank}位</strong> ${scoreTxt}だよ！`;
  let talkPush;
  if (rank === 1) {
    talkPush = '🎉 堂々の<strong>1位</strong>！みんなで応援して守ろう！';
  } else if (diff != null && diff > 0) {
    talkPush = `あと <strong>💎${fmt(diff)}</strong> で <strong>${rank - 1}位</strong>！みんなでランキングに入れるよう応援しよう！`;
  } else {
    talkPush = 'みんなでランキングに入れるよう応援しよう！';
  }

  const eventLine = eventName
    ? `<p class="nl-event-self__event">🏆 ${escapeHtml(eventName)}</p>`
    : '';

  return (
    `<div class="nl-event-self">` +
      `<div class="nl-event-self__badge${tierClass}">${badgeInner}</div>` +
      `<div class="nl-event-self__body">` +
        eventLine +
        `<p class="nl-event-self__talk">` +
          `<img class="nl-event-self__rinku" src="${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png" alt="ゆっくりりんく" onerror="this.style.display='none'" />` +
          `<span class="nl-event-self__talk-text">${talkMain} ${talkPush}</span>` +
        `</p>` +
      `</div>` +
    `</div>`
  );
}
