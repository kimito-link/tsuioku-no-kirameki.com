/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】推しページの共有URL(X と LINE。https のみ)
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / line: スキーム
 * 【書けるstorageキー】なし
 * 【正本宣言】共有URLの形はこのファイルのみ。X の組み立ては xIntentUrl.js を使う
 *
 * share.js — LINE のアプリ内ブラウザ向けに openExternalBrowser=1 を付ける。
 */

import { getEvent, groupLabel, personPath } from '../eventRanking/registry.js';
import { teamLabel } from './constants.js';
import { formatGap, formatPt, formatSigned } from './format.js';
import { buildXIntentUrl } from '../xIntentUrl.js';

/**
 * @typedef {import('./calc.js').RankedEntry} RankedEntry
 */

/**
 * @param {string} userId
 * @param {string} [eventId]
 * @returns {string}
 */
export function pagePath(userId, eventId = 'kouhaku-2026') {
  const event = getEvent(eventId) || getEvent('kouhaku-2026');
  return event ? personPath(event, userId) : `/live/event/${eventId}/u/${userId}/`;
}

/**
 * LINE のアプリ内ブラウザから外部ブラウザへ出すための共有URL。
 * @param {string} siteUrl
 * @param {string} userId
 * @param {string} [eventId]
 * @returns {string}
 */
export function sharePageUrl(siteUrl, userId, eventId) {
  const origin = String(siteUrl || '').replace(/\/$/, '');
  const url = new URL(`${origin}${pagePath(userId, eventId)}`);
  url.searchParams.set('openExternalBrowser', '1');
  return url.toString();
}

/**
 * @param {RankedEntry} entry
 * @param {string} officialUpdateLabel
 * @param {import('../eventRanking/registry.js').RankingEvent|null} [event]
 * @returns {string}
 */
export function buildShareText(entry, officialUpdateLabel, event) {
  const named = event && typeof event === 'object' ? event : null;
  const eventName = named && named.name ? named.name : '紅白歌枠合戦2026';
  const known = named || getEvent('kouhaku-2026');
  const label = (known && groupLabel(known, entry.team)) || teamLabel(entry.team);
  const lines = [
    `${eventName} ${label} ${entry.rank}位`,
    entry.displayName,
    `公式スコア ${formatPt(entry.score)}pt`,
    formatGap(entry)
  ];
  if (entry.scoreDelta !== null) {
    lines.push(`前回の公式更新から ${formatSigned(entry.scoreDelta)}pt`);
  }
  if (officialUpdateLabel) lines.push(`公式更新: ${officialUpdateLabel}`);
  lines.push('公式の順位を元にした応援ページ');
  return lines.join('\n');
}

/**
 * @param {string} pageUrl
 * @returns {string}
 */
export function lineShareUrl(pageUrl) {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl)}`;
}

/**
 * @param {RankedEntry} entry
 * @param {string} siteUrl
 * @param {string} officialUpdateLabel
 * @param {import('../eventRanking/registry.js').RankingEvent|null} [event]
 * @returns {{ text: string, pageUrl: string, xUrl: string, lineUrl: string }}
 */
export function buildShareLinks(entry, siteUrl, officialUpdateLabel, event) {
  const pageUrl = sharePageUrl(siteUrl, entry.userId, event && event.id);
  const text = buildShareText(entry, officialUpdateLabel, event);
  return {
    text,
    pageUrl,
    xUrl: buildXIntentUrl({ text, url: pageUrl }),
    lineUrl: lineShareUrl(pageUrl)
  };
}
