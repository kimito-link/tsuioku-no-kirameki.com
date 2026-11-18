/**
 * 【層】L0 判定層(純粋関数)と、裏方の1回読み
 * 【この箱に入るもの】記録を終えるときのフォロワー数の読み取り
 * 【書けるstorageキー】なし(保存は background が既存の標本の口で行う)
 *
 * ページが閉じる瞬間の fetch は、移動で消える(0.1.2161 の実機: 停止時刻に通信が無い)。
 * SHOWROOM とふわっちは、既にあるホスト権限の公開 URL を拡張の裏方が1回読む。
 * きっかけはタブを閉じたとき、配信ページから別の URL へ移ったとき、配信が終わったとき。
 * Twitch の公開窓口はホスト権限に無いので、ここでは読まない(ページが生きている間だけ、ページ自身が読む)。
 * 1つの記録につき1回。読めた時刻を標本の時刻にする。失敗しても古い人数の時刻は書き換えない。
 */

import { platformFetchTimeoutSignal } from './fetchTimeout.js';
import { isSrStreamKey, srRoomKeyOfStreamKey, srRoomProfileUrl, parseSrRoomKeyFromUrl } from '../showroom/srParse.js';
import { isWwStreamKey, wwUserProfileUrl, parseWwLiveIdFromUrl } from '../whowatch/wwParse.js';
import { followerSampleFromShowroom, followerSampleFromWhowatchProfile } from './followerCountSample.js';

/**
 * @typedef {{
 *   tabId: number,
 *   platform: 'showroom' | 'whowatch',
 *   videoKey: string,
 *   roomKey?: string,
 *   roomId?: string,
 *   userId?: string,
 *   livePageId?: string,
 * }} FollowerEndArm
 */

/**
 * ページからの知らせを、裏方が読んでよい形にする。URL は受け取らない(任意のアドレスは読まない)。
 * @param {unknown} raw
 * @param {unknown} tabId
 * @returns {FollowerEndArm | null}
 */
export function normalizeFollowerEndArm(raw, tabId) {
  const row = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : null;
  const id = Number(tabId);
  if (!row || !Number.isInteger(id) || id < 1) return null;
  const platform = String(row.platform || '');
  const videoKey = String(row.videoKey || '');
  // Twitch は新しいホスト権限が要るので、裏方では読まない。
  if (platform === 'twitch') return null;
  if (platform === 'showroom') {
    const roomId = String(row.roomId || '');
    const roomKey = String(row.roomKey || '');
    if (!/^\d{1,20}$/.test(roomId) || !isSrStreamKey(videoKey) || srRoomKeyOfStreamKey(videoKey) !== roomKey) return null;
    return { tabId: id, platform, videoKey, roomKey, roomId };
  }
  if (platform === 'whowatch') {
    const userId = String(row.userId || '');
    const livePageId = String(row.livePageId || '');
    if (!/^\d{1,20}$/.test(userId) || !/^\d{1,20}$/.test(livePageId) || videoKey !== `ww.${livePageId}.${userId}` || !isWwStreamKey(videoKey)) return null;
    return { tabId: id, platform, videoKey, userId, livePageId };
  }
  return null;
}

/**
 * まだその配信のページにいるか。別の URL なら、記録の終わりとして読む。
 * @param {FollowerEndArm} arm
 * @param {unknown} url
 */
export function stillOnFollowerLive(arm, url) {
  const u = String(url || '');
  if (arm.platform === 'showroom') return parseSrRoomKeyFromUrl(u) === String(arm.roomKey || '');
  if (arm.platform === 'whowatch') return parseWwLiveIdFromUrl(u) === String(arm.livePageId || '');
  return false;
}

/**
 * タブの URL 変化から、終わりの読みの出来事を決める。
 * `tabs` 権限があっても about:blank は url が欠けることがある。読み込み開始だけが届いたら、
 * 覚えてある記録を「URL が見えない移動」として扱う。タイトルだけの変化では読まない。
 * @param {unknown} info chrome.tabs.onUpdated の changeInfo
 * @returns {{ type: 'url', url: string } | { type: 'unseen-url' } | null}
 */
export function followerEndEventFromTabChange(info) {
  const row = info && typeof info === 'object' ? /** @type {Record<string, unknown>} */ (info) : {};
  if (typeof row.url === 'string' && row.url) return { type: 'url', url: row.url };
  if (row.status === 'loading') return { type: 'unseen-url' };
  return null;
}

/**
 * この出来事で読む記録。同じ記録は done に入ったあとは読まない。配信ページのままの URL 変化では読まない。
 * leave はページが閉じる知らせ自身が記録を持ってよい(裏方が覚えている登録が消えていても読む)。
 * @param {readonly FollowerEndArm[]} arms
 * @param {ReadonlySet<string>} done
 * @param {{ type: 'removed' | 'url' | 'stream-end' | 'leave' | 'unseen-url', tabId?: number, url?: string, videoKey?: string, arm?: FollowerEndArm | null }} event
 * @returns {FollowerEndArm | null}
 */
export function followerEndReadForEvent(arms, done, event) {
  const list = Array.isArray(arms) ? arms : [];
  /** @type {FollowerEndArm | null} */
  let arm = null;
  if (event.type === 'stream-end') {
    arm = list.find((a) => a.videoKey === event.videoKey) || null;
  } else if (event.type === 'leave' || event.type === 'unseen-url') {
    const embedded = event.arm && event.arm.videoKey ? event.arm : null;
    arm = embedded || list.find((a) => a.tabId === event.tabId) || null;
  } else if (event.type === 'removed' || event.type === 'url') {
    arm = list.find((a) => a.tabId === event.tabId) || null;
    if (arm && event.type === 'url' && stillOnFollowerLive(arm, event.url)) return null;
  }
  if (!arm || !arm.videoKey || done.has(arm.videoKey)) return null;
  return arm;
}

/**
 * 裏方の1回読み。時刻は応答を読み終えたとき。失敗は null(古い標本は触らない)。
 * @param {FollowerEndArm} arm
 * @param {{ fetch: typeof fetch, now?: () => number, abortSignalCtor?: { timeout?: (ms: number) => AbortSignal } }} deps
 * @returns {Promise<{ at: number, count: number, rounded: boolean, source: string, noun?: string, force: true } | null>}
 */
export async function fetchFollowerEndSample(arm, deps) {
  const fetchFn = deps?.fetch;
  const now = typeof deps?.now === 'function' ? deps.now : () => Date.now();
  if (!arm || typeof fetchFn !== 'function') return null;
  const signal = platformFetchTimeoutSignal(undefined, deps.abortSignalCtor);
  try {
    if (arm.platform === 'showroom') {
      const url = srRoomProfileUrl(arm.roomId || '');
      if (!url) return null;
      const res = await fetchFn(url, { credentials: 'omit', headers: { Accept: 'application/json' }, signal });
      if (!res?.ok) return null;
      const sample = followerSampleFromShowroom(await res.json());
      if (!sample) return null;
      return { ...sample, at: now(), force: true };
    }
    if (arm.platform === 'whowatch') {
      const url = wwUserProfileUrl(arm.userId || '');
      if (!url) return null;
      const res = await fetchFn(url, { credentials: 'omit', headers: { Accept: 'application/json' }, signal });
      if (!res?.ok) return null;
      const sample = followerSampleFromWhowatchProfile(await res.json());
      if (!sample) return null;
      return { ...sample, at: now(), force: true };
    }
  } catch {
    return null;
  }
  return null;
}
