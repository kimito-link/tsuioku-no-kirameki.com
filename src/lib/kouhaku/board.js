/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】保存済みスナップショットを、画面と共有に出す形へ変える
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】紅白ページに出す項目の並びはこのファイルのみ
 *
 * board.js — 順位を先に出すためのデータ。説明文はページ側。
 */

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
 *   team: 'aka'|'shiro',
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
 * @returns {PresentedEntry}
 */
export function presentEntry(entry, officialUpdateLabel) {
  const share = buildShareLinks(entry, PUBLIC_SITE_URL, officialUpdateLabel || '');
  return {
    rank: entry.rank,
    userId: entry.userId,
    displayName: entry.displayName,
    team: entry.team,
    teamLabel: teamLabel(entry.team),
    scoreLabel: `${formatPt(entry.score)} pt`,
    gapLabel: formatGap(entry),
    deltaLabel: formatGrowthSinceOfficial(entry.scoreDelta),
    pagePath: pagePath(entry.userId),
    iconUrl: iconUrlForEntry(entry),
    shareUrl: share.xUrl
  };
}

/**
 * @param {Snapshot} snapshot
 * @param {Snapshot|null} previous
 * @param {string|null} confirmedAt
 * @returns {{
 *   kind: 'board',
 *   officialUpdateLabel: string,
 *   officialUpdateAt: string|null,
 *   fetchedAt: string,
 *   confirmedAt: string|null,
 *   sourceUrl: string,
 *   aka: PresentedEntry[],
 *   shiro: PresentedEntry[]
 * }}
 */
export function presentBoard(snapshot, previous, confirmedAt) {
  const previousAka = previous ? previous.entries.filter((entry) => entry.team === 'aka') : null;
  const previousShiro = previous ? previous.entries.filter((entry) => entry.team === 'shiro') : null;
  return {
    kind: 'board',
    officialUpdateLabel: snapshot.officialUpdateLabel,
    officialUpdateAt: snapshot.officialUpdateAt,
    fetchedAt: snapshot.fetchedAt,
    confirmedAt,
    sourceUrl: snapshot.sourceUrl,
    aka: rankEntries(snapshot.entries.filter((entry) => entry.team === 'aka'), previousAka).map((entry) => presentEntry(entry, snapshot.officialUpdateLabel)),
    shiro: rankEntries(snapshot.entries.filter((entry) => entry.team === 'shiro'), previousShiro).map((entry) => presentEntry(entry, snapshot.officialUpdateLabel))
  };
}

/**
 * @param {Snapshot} snapshot
 * @param {Snapshot|null} previous
 * @param {string} userId
 * @param {string|null} confirmedAt
 * @param {boolean} inLatest
 * @returns {Record<string, unknown>|null}
 */
export function presentProfile(snapshot, previous, userId, confirmedAt, inLatest) {
  if (!/^\d{1,16}$/.test(userId)) return null;
  const found = snapshot.entries.find((entry) => entry.userId === userId);
  if (!found) return null;
  const previousTeam = previous ? previous.entries.filter((entry) => entry.team === found.team) : null;
  const ranked = rankEntries(
    snapshot.entries.filter((entry) => entry.team === found.team),
    previousTeam
  ).find((entry) => entry.userId === userId);
  if (!ranked) return null;
  const share = buildShareLinks(ranked, PUBLIC_SITE_URL, snapshot.officialUpdateLabel);
  return {
    kind: 'profile',
    found: true,
    inLatest,
    officialUpdateLabel: snapshot.officialUpdateLabel,
    officialUpdateAt: snapshot.officialUpdateAt,
    fetchedAt: snapshot.fetchedAt,
    confirmedAt: inLatest ? confirmedAt : null,
    sourceUrl: snapshot.sourceUrl,
    officialUserUrl: `https://www.nicovideo.jp/user/${ranked.userId}`,
    entry: presentEntry(ranked, snapshot.officialUpdateLabel),
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
