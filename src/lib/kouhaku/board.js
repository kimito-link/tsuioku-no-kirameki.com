/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】保存済みスナップショットを、画面と共有に出す形へ変える
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】紅白ページに出す項目の並びはこのファイルのみ
 *
 * board.js — 順位を先に出すためのデータ。説明文はページ側。
 */

import { boardPath, eventCatalog, getEvent, groupLabel, teamBoardClass } from '../eventRanking/registry.js';
import { FEATURES, PUBLIC_SITE_URL, teamLabel } from './constants.js';
import { rankEntries } from './calc.js';
import { formatGrowthSinceOfficial, formatGap, formatPt } from './format.js';
import { iconUrlForEntry } from './icon.js';
import { buildShareLinks, pagePath } from './share.js';

/**
 * @typedef {import('./model.js').Snapshot} Snapshot
 * @typedef {import('./calc.js').RankedEntry} RankedEntry
 * @typedef {{
 *   rank: number,
 *   userId: string,
 *   displayName: string,
 *   team: string,
 *   teamLabel: string,
 *   scoreLabel: string,
 *   gapLabel: string,
 *   deltaLabel: string,
 *   pagePath: string,
 *   iconUrl: string,
 *   shareUrl: string
 * }} PresentedEntry
 */

/**
 * 推定（日中）は読まない。フラグが off のあいだは null。
 * @returns {null}
 */
export function loadDaytimeEstimates() {
  if (!FEATURES.daytimeEstimate) return null;
  throw new Error('推定（日中）は未実装');
}

/**
 * @param {RankedEntry} entry
 * @param {string} [officialUpdateLabel]
 * @param {import('../eventRanking/registry.js').RankingEvent|null} [event]
 * @returns {PresentedEntry}
 */
export function presentEntry(entry, officialUpdateLabel, event) {
  const known = event || getEvent('kouhaku-2026');
  const share = buildShareLinks(entry, PUBLIC_SITE_URL, officialUpdateLabel || '', known);
  return {
    rank: entry.rank,
    userId: entry.userId,
    displayName: entry.displayName,
    team: entry.team,
    teamLabel: (known && groupLabel(known, entry.team)) || teamLabel(entry.team),
    scoreLabel: `${formatPt(entry.score)} pt`,
    gapLabel: formatGap(entry),
    deltaLabel: formatGrowthSinceOfficial(entry.scoreDelta),
    pagePath: pagePath(entry.userId, known && known.id),
    iconUrl: iconUrlForEntry(entry),
    shareUrl: share.xUrl
  };
}

/**
 * @param {Snapshot} snapshot
 * @param {Snapshot|null} previous
 * @param {string|null} confirmedAt
 * @param {import('../eventRanking/registry.js').RankingEvent|null} [event]
 * @returns {{
 *   kind: 'board',
 *   officialUpdateLabel: string,
 *   officialUpdateAt: string|null,
 *   fetchedAt: string,
 *   confirmedAt: string|null,
 *   sourceUrl: string,
 *   eventId: string,
 *   eventName: string,
 *   boardPath: string,
 *   periodLabel: string,
 *   catalog: { id: string, name: string, path: string, fetchStart: string, fetchUntil: string }[],
 *   layoutClass: 'teams teams--1'|'teams teams--2'|'teams teams--many',
 *   columns: { id: string, label: string, color: string, background: string, entries: PresentedEntry[] }[],
 *   aka: PresentedEntry[],
 *   shiro: PresentedEntry[]
 * }}
 */
export function presentBoard(snapshot, previous, confirmedAt, event) {
  const known = event || getEvent('kouhaku-2026');
  const groups = known ? known.groups : [];
  const columns = groups.map((group) => {
    const previousGroup = previous ? previous.entries.filter((entry) => entry.team === group.id) : null;
    return {
      id: group.id,
      label: group.label,
      color: group.color,
      background: group.background,
      entries: rankEntries(snapshot.entries.filter((entry) => entry.team === group.id), previousGroup)
        .map((entry) => presentEntry(entry, snapshot.officialUpdateLabel, known))
    };
  });
  const byId = Object.fromEntries(columns.map((column) => [column.id, column.entries]));
  return {
    kind: 'board',
    eventId: known ? known.id : '',
    eventName: known ? known.name : '',
    boardPath: known ? boardPath(known) : '',
    periodLabel: known ? known.periodLabel : '',
    layoutClass: teamBoardClass(columns.length),
    catalog: eventCatalog(),
    officialUpdateLabel: snapshot.officialUpdateLabel,
    officialUpdateAt: snapshot.officialUpdateAt,
    fetchedAt: snapshot.fetchedAt,
    confirmedAt,
    sourceUrl: snapshot.sourceUrl,
    columns,
    aka: byId.aka || [],
    shiro: byId.shiro || []
  };
}

/**
 * @param {Snapshot} snapshot
 * @param {Snapshot|null} previous
 * @param {string} userId
 * @param {string|null} confirmedAt
 * @param {boolean} inLatest
 * @param {import('../eventRanking/registry.js').RankingEvent|null} [event]
 * @returns {Record<string, unknown>|null}
 */
export function presentProfile(snapshot, previous, userId, confirmedAt, inLatest, event) {
  if (!/^\d{1,16}$/.test(userId)) return null;
  const found = snapshot.entries.find((entry) => entry.userId === userId);
  if (!found) return null;
  const previousTeam = previous ? previous.entries.filter((entry) => entry.team === found.team) : null;
  const ranked = rankEntries(
    snapshot.entries.filter((entry) => entry.team === found.team),
    previousTeam
  ).find((entry) => entry.userId === userId);
  if (!ranked) return null;
  const known = event || getEvent('kouhaku-2026');
  const share = buildShareLinks(ranked, PUBLIC_SITE_URL, snapshot.officialUpdateLabel, known);
  return {
    kind: 'profile',
    eventId: known ? known.id : '',
    eventName: known ? known.name : '',
    boardPath: known ? boardPath(known) : '',
    found: true,
    inLatest,
    officialUpdateLabel: snapshot.officialUpdateLabel,
    officialUpdateAt: snapshot.officialUpdateAt,
    fetchedAt: snapshot.fetchedAt,
    confirmedAt: inLatest ? confirmedAt : null,
    sourceUrl: snapshot.sourceUrl,
    officialUserUrl: `https://www.nicovideo.jp/user/${ranked.userId}`,
    entry: presentEntry(ranked, snapshot.officialUpdateLabel, known),
    share
  };
}

/**
 * 304 で「同じ公式更新のまま」と確認できた時刻。スナップショットより後だけ。
 * @param {Snapshot} snapshot
 * @param {string|null} lastSuccessAt
 * @returns {string|null}
 */
export function confirmedAt(snapshot, lastSuccessAt) {
  if (!lastSuccessAt) return null;
  if (new Date(lastSuccessAt).getTime() <= new Date(snapshot.fetchedAt).getTime()) return null;
  return lastSuccessAt;
}
