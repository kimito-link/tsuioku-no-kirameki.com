/**
 * v0.1.754 会場の3時間安定化(星野ロミ・メソッド会議の本質解・6体ほぼ全会一致):
 * 在席(誰が会場の席にいるか)を「30秒毎に storage の全コメントを集計し直す(O(N)・3時間で
 * 数万件→メインスレッド圧迫→会場停止)」から「onLiveComments で【通過した瞬間に touch する
 * in-memory Map】+ 時間窓/LRU で有界化(O(席数)一定)」へ。
 *
 * storage は「初回 hydrate(1回)」と「standalone(venue.html)/フォールバック」だけに退く。
 * チャンク差分集計(venueIncrementalAggregate)は hydrate/standalone/rollback の土台として温存。
 *
 * 全関数 DOM/chrome 非依存=単体テスト可能。ホットパス(通過毎 touch)で Map を毎回複製すると
 * それ自体が O(N) になるため、touchRoster/pruneRoster は渡された Map を in-place 変更する
 * (closure state を直接更新・3時間でも複製コストゼロ)。rosterToVenueRows/isRosterEntryVip は純 return。
 *
 * 設計上の要(契約):
 *   - rosterToVenueRows は venueRowsFromUserLaneCandidates と同形(preCount/preHasGift/preGiftCount/
 *     capturedAt)を必ず出す。これが無いと collectVenueParticipants が全員 count=1 扱いになり
 *     VIP常連光らせ(selectVenueVipRegularKeys)が死ぬ(v0.1.734 の轍)。
 *   - touchRoster は requireText 既定 true(本文の無い行=配信者本人のDOM観測等を席に入れない・v0.1.740)。
 *   - userId 無し(匿名)は席に入れない(席は数値IDのアバターで成立・吹き出しは別経路)。
 *
 * @module venueLiveRoster
 */

import { hasRealThumbnail, VENUE_FULLSCREEN_MAX_SEATS } from './venueSeats.js';

/** 常連/支援者(=保持窓を延長する軸)の発言数しきい値。これ以上 or ギフト有りで vip。 */
export const VENUE_ROSTER_VIP_COMMENT_THRESHOLD = 5;
/** 通常在席の時間窓(ms)。最終発言からこの時間で退席。 */
export const VENUE_ROSTER_WINDOW_MS = 4 * 60_000;
/** VIP(常連/支援者)の時間窓(ms)。常連は長く席に残す。 */
export const VENUE_ROSTER_VIP_WINDOW_MS = 15 * 60_000;
/** 在席 Map の上限(席数)。超過分は最古の非VIPから LRU 退席。 */
export const VENUE_ROSTER_MAX_SEATS = VENUE_FULLSCREEN_MAX_SEATS;

/**
 * @typedef {{
 *   userId: string,
 *   name: string,
 *   avatar: string,
 *   firstSeen: number,
 *   lastSeen: number,
 *   commentCount: number,
 *   giftCount: number,
 *   vip: boolean
 * }} RosterEntry
 */

/**
 * 常連/支援者か(保持窓の延長軸)。発言数しきい値以上 or ギフト有り。
 * @param {{ commentCount?: number, giftCount?: number }} entry
 * @returns {boolean}
 */
export function isRosterEntryVip(entry) {
  const c = Math.max(0, Math.floor(Number(entry?.commentCount) || 0));
  const g = Math.max(0, Math.floor(Number(entry?.giftCount) || 0));
  return g > 0 || c >= VENUE_ROSTER_VIP_COMMENT_THRESHOLD;
}

/**
 * 通過した1コメントで在席 Map を in-place 更新する。新規は挿入、既存は加算+lastSeen更新。
 * @param {Map<string, RosterEntry>} roster
 * @param {{ userId?: unknown, text?: unknown, nickname?: unknown, name?: unknown, avatarUrl?: unknown }} row
 * @param {number} nowMs 現在時刻(ライブ行は capturedAt を持たないので呼び出し側が渡す)
 * @param {{ requireText?: boolean, isGift?: boolean }} [opts]
 * @returns {RosterEntry|null} 更新/作成したエントリ。userId無し/本文空(requireText時)は null。
 */
export function touchRoster(roster, row, nowMs, opts = {}) {
  if (!(roster instanceof Map) || !row || typeof row !== 'object') return null;
  const userId = String(row.userId ?? '').trim();
  if (!userId) return null; // 匿名(userId無し)は席に座らない
  const requireText = opts.requireText !== false; // 既定 true(v0.1.740)
  const text = String(row.text ?? '').trim();
  if (requireText && !text) return null;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const isGift = opts.isGift === true;
  const incomingName = String(row.nickname ?? row.name ?? '').trim();
  const incomingAvatar = String(row.avatarUrl ?? '').trim();

  let e = roster.get(userId);
  if (!e) {
    e = {
      userId,
      name: incomingName,
      avatar: incomingAvatar,
      firstSeen: now,
      lastSeen: now,
      commentCount: 1,
      giftCount: isGift ? 1 : 0,
      vip: false
    };
    e.vip = isRosterEntryVip(e);
    roster.set(userId, e);
    return e;
  }
  // 既存: 加算・lastSeen更新(firstSeen不変)・name/avatar はベター選択。
  e.lastSeen = Math.max(e.lastSeen || 0, now);
  e.commentCount = (e.commentCount || 0) + 1;
  if (isGift) e.giftCount = (e.giftCount || 0) + 1;
  if (!e.name && incomingName) e.name = incomingName; // 非空を採用・下げない
  // avatar: 実サムネ(http)を優先。実を非実(空/data:)で上書きしない。
  if (incomingAvatar && hasRealThumbnail(incomingAvatar) && !hasRealThumbnail(e.avatar)) {
    e.avatar = incomingAvatar;
  } else if (!e.avatar && incomingAvatar) {
    e.avatar = incomingAvatar;
  }
  e.vip = isRosterEntryVip(e);
  return e;
}

/**
 * 在席 Map を時間窓+LRU で有界化(in-place)。3時間でも size は O(席数) に保たれる。
 *   1) 窓超え退席: now - lastSeen > (vip ? vipWindowMs : windowMs) を delete。
 *   2) maxSeats 超過: 最古 lastSeen の【非VIP】から退席。非VIPが尽きたら VIP も古い順に退席。
 * @param {Map<string, RosterEntry>} roster
 * @param {number} nowMs
 * @param {{ windowMs?: number, vipWindowMs?: number, maxSeats?: number }} [opts]
 * @returns {Map<string, RosterEntry>} 同じ roster(in-place)
 */
export function pruneRoster(roster, nowMs, opts = {}) {
  if (!(roster instanceof Map)) return roster;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const windowMs =
    Number.isFinite(opts.windowMs) && opts.windowMs > 0 ? opts.windowMs : VENUE_ROSTER_WINDOW_MS;
  const vipWindowMs =
    Number.isFinite(opts.vipWindowMs) && opts.vipWindowMs > 0
      ? opts.vipWindowMs
      : VENUE_ROSTER_VIP_WINDOW_MS;
  const maxSeats =
    Number.isFinite(opts.maxSeats) && opts.maxSeats > 0
      ? Math.floor(opts.maxSeats)
      : VENUE_ROSTER_MAX_SEATS;

  // 1) 窓超え退席。
  for (const [uid, e] of roster) {
    const win = e.vip ? vipWindowMs : windowMs;
    if (now - (e.lastSeen || 0) > win) roster.delete(uid);
  }

  // 2) LRU 退席(満席時)。非VIP最古から。
  if (roster.size > maxSeats) {
    const entries = Array.from(roster.values()).sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0));
    // 非VIP→VIP の順に「最古から」並べ、超過分を退席。
    const order = [
      ...entries.filter((e) => !e.vip),
      ...entries.filter((e) => e.vip)
    ];
    let over = roster.size - maxSeats;
    for (const e of order) {
      if (over <= 0) break;
      roster.delete(e.userId);
      over -= 1;
    }
  }
  return roster;
}

/**
 * 在席 Map を buildVenueSeating の入力行(VenueRow[])へ変換する純関数。
 * venueRowsFromUserLaneCandidates と同形(preCount/preHasGift/preGiftCount/capturedAt)を必ず出す
 * =VIP常連光らせ等が同一経路で動く。lastSeen 降順(最新発言が上位席)。
 * @param {Map<string, RosterEntry>} roster
 * @returns {Array<{userId: string, name: string, avatar: string, text: string, capturedAt: number, preCount: number, preHasGift: boolean, preGiftCount: number}>}
 */
export function rosterToVenueRows(roster) {
  if (!(roster instanceof Map)) return [];
  const out = [];
  for (const e of roster.values()) {
    const giftCount = Math.max(0, Math.floor(Number(e.giftCount) || 0));
    out.push({
      userId: e.userId,
      name: String(e.name || ''),
      avatar: String(e.avatar || ''),
      text: '',
      capturedAt: Math.max(0, Number(e.lastSeen) || 0),
      preCount: Math.max(1, Math.floor(Number(e.commentCount) || 0) || 1),
      preHasGift: giftCount > 0,
      preGiftCount: giftCount
    });
  }
  out.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
  return out;
}

/**
 * 開いた瞬間の catch-up: storage 集計済み候補(UserLaneCandidate[])で在席を seed(in-place)。
 * lastSeen は _laneSortAt(実発言時刻)から。既に【ライブで存在する】エントリは上書きしない
 * (非clobber=ライブの新しい lastSeen を保持・二重加算しない)=冪等。
 * @param {Map<string, RosterEntry>} roster
 * @param {ReadonlyArray<{userId?: unknown, nickname?: unknown, avatarUrl?: unknown, commentCount?: unknown, giftCount?: unknown, _laneSortAt?: unknown}>} candidates
 * @param {{ maxSeats?: number }} [opts]
 * @returns {Map<string, RosterEntry>}
 */
export function hydrateRosterFromCandidates(roster, candidates, opts = {}) {
  if (!(roster instanceof Map) || !Array.isArray(candidates)) return roster;
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const userId = String(c.userId ?? '').trim();
    if (!userId) continue;
    if (roster.has(userId)) continue; // 非clobber: ライブ済みは触らない(冪等)
    const lastSeen = Math.max(0, Number(c._laneSortAt) || 0);
    const e = {
      userId,
      name: String(c.nickname ?? '').trim(),
      avatar: String(c.avatarUrl ?? '').trim(),
      firstSeen: lastSeen,
      lastSeen,
      commentCount: Math.max(1, Math.floor(Number(c.commentCount) || 0) || 1),
      giftCount: Math.max(0, Math.floor(Number(c.giftCount) || 0)),
      vip: false
    };
    e.vip = isRosterEntryVip(e);
    roster.set(userId, e);
  }
  // hydrate 直後に席数上限へ寄せる(古い参加者を seed しすぎない)。
  const maxSeats =
    Number.isFinite(opts.maxSeats) && opts.maxSeats > 0
      ? Math.floor(opts.maxSeats)
      : VENUE_ROSTER_MAX_SEATS;
  if (roster.size > maxSeats) {
    const order = Array.from(roster.values()).sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0));
    let over = roster.size - maxSeats;
    for (const e of order) {
      if (over <= 0) break;
      if (e.vip) continue; // hydrate 段でも VIP は残す
      roster.delete(e.userId);
      over -= 1;
    }
  }
  return roster;
}
