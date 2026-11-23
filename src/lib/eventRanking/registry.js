/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】イベント順位の定義（id・名前・公式URL・組・期間・色）と、日付による選択
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし（キーの接頭辞を返すだけ）
 * 【正本宣言】新しいイベントを足すときは、このファイルの EVENTS に1件足すだけ
 *
 * registry.js — サーバが GET してよい公式URLは、ここに書いた sourceUrls だけ。
 */

import { jstDateString } from '../kouhaku/time.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   heading: string|null,
 *   color: string,
 *   background: string
 * }} EventGroup
 * @typedef {{
 *   id: string,
 *   name: string,
 *   sourceUrls: string[],
 *   noteUrls: string[],
 *   groups: EventGroup[],
 *   periodLabel: string,
 *   fetchStart: string,
 *   fetchUntil: string,
 *   storagePrefix: string
 * }} RankingEvent
 */

/** 公式ページとして許すホスト。新しい公式サイトはここに1行足す（EVENTS と同じファイル）。 */
export const OFFICIAL_HOSTS = ['blog.nicovideo.jp'];

const EVENT_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * 紅白歌枠合戦2026。storagePrefix は導入時の Redis キーのまま。
 * 新しいイベントは storagePrefix を `event:v1:<id>` にする。
 * @type {RankingEvent[]}
 */
export const EVENTS = [
  {
    id: 'kouhaku-2026',
    name: '紅白歌枠合戦2026',
    sourceUrls: ['https://blog.nicovideo.jp/niconews/15106'],
    noteUrls: [
      'https://blog.nicovideo.jp/niconews/15102',
      'https://blog.nicovideo.jp/niconews/15104'
    ],
    groups: [
      { id: 'aka', label: '紅組', heading: '紅組', color: '#9d2948', background: '#ffe4ea' },
      { id: 'shiro', label: '白組', heading: '白組', color: '#8a5a12', background: '#fffdf8' }
    ],
    periodLabel: '2026年11月16日 0:00 〜 11月29日 23:59（日本時間）',
    fetchStart: '2026-11-16',
    fetchUntil: '2026-12-02',
    storagePrefix: 'kouhaku:v1'
  }
];

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isEventId(value) {
  return EVENT_ID_RE.test(String(value || ''));
}

/**
 * @param {string} id
 * @returns {RankingEvent|null}
 */
export function getEvent(id) {
  if (!isEventId(id)) return null;
  return EVENTS.find((event) => event.id === id) || null;
}

/**
 * @param {RankingEvent} event
 * @returns {string}
 */
export function boardPath(event) {
  return `/live/event/${event.id}/`;
}

/**
 * 画面の列の分け方。組の数だけを見る。紅白かどうかは見ない。
 * 2組は左右2列。1組以下は1列。3組以上は横に並べ、狭い画面では横スクロール。
 * @param {number} count
 * @returns {'teams teams--1'|'teams teams--2'|'teams teams--many'}
 */
export function teamBoardClass(count) {
  const n = Number(count);
  if (n >= 3) return 'teams teams--many';
  if (n === 2) return 'teams teams--2';
  return 'teams teams--1';
}

/**
 * @param {RankingEvent} event
 * @param {string} userId
 * @returns {string}
 */
export function personPath(event, userId) {
  return `/live/event/${event.id}/u/${userId}/`;
}

/**
 * 今日が取得期間の中なら、開始が一番遅いもの。
 * 期間中が無ければ、終わったものの中で終了が一番遅いもの。
 * それも無ければ、次に始まるもの。
 * @param {Date} now
 * @param {RankingEvent[]} [events]
 * @returns {RankingEvent|null}
 */
export function selectEvent(now, events = EVENTS) {
  const today = jstDateString(now);
  const list = events.filter((event) => isEventId(event.id));
  const active = list.filter((event) => today >= event.fetchStart && today <= event.fetchUntil);
  if (active.length) return latest(active, 'fetchStart');
  const past = list.filter((event) => today > event.fetchUntil);
  if (past.length) return latest(past, 'fetchUntil');
  const upcoming = list.filter((event) => today < event.fetchStart);
  if (!upcoming.length) return null;
  return upcoming.slice().sort((a, b) => (a.fetchStart < b.fetchStart ? -1 : 1))[0];
}

/**
 * @param {RankingEvent[]} events
 * @param {'fetchStart'|'fetchUntil'} key
 * @returns {RankingEvent}
 */
function latest(events, key) {
  return events.slice().sort((a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0))[0];
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isOfficialSourceUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && OFFICIAL_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * レジストリに書いた sourceUrls だけを取得してよい。
 * @param {string} url
 * @returns {boolean}
 */
export function isRegisteredSource(url) {
  const normalized = String(url || '').split('?')[0];
  return EVENTS.some((event) => event.sourceUrls.includes(normalized)) && isOfficialSourceUrl(normalized);
}

/**
 * @param {RankingEvent} event
 * @param {string} teamId
 * @returns {string}
 */
export function groupLabel(event, teamId) {
  const group = event.groups.find((item) => item.id === teamId);
  return group ? group.label : '';
}

/**
 * @returns {{ id: string, name: string, path: string, fetchStart: string, fetchUntil: string }[]}
 */
export function eventCatalog() {
  return EVENTS.map((event) => ({
    id: event.id,
    name: event.name,
    path: boardPath(event),
    fetchStart: event.fetchStart,
    fetchUntil: event.fetchUntil
  }));
}
