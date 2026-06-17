/**
 * 人物プロファイル畳み込み（person-tile-unify 第1コミット・2026-06-17）。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 目的: userId を主キーに「その人の全アクション(コメント本文・ギフト)」を1オブジェクトへ畳み込む正本。
 *   人物タイル(popup 応援アイコン列・会場の席)が、件数だけでなく中身(最新コメント/ギフト)を
 *   同じ集約から引けるようにする土台。設計正本: docs/person-tile-architecture.md /
 *   council/person-tile-unify-SYNTHESIS.md。
 *
 * 【星野ロミ式の制約・厳守】
 *   - 新規 storage 書き込みゼロ: 引数 rows(既に IndexedDB/chunk から読んだ配列)を畳み込むだけ。永続化しない。
 *   - 有界: recentComments / recentGifts は cap(既定 5/5)で頭打ち。全件は持たない(hot path で重くしない)。
 *   - gift 判定は userLaneCandidatesFromStorage と同一基準(isGift===true || gift!=null || kind==='gift')。
 *     ドリフト防止のため判定を1関数 isGiftRow に集約し、両者が将来ズレないようにする。
 *   - ads(広告/貢献度)は保存コメント行に独立フィールドが無い(別経路=nicoad/北極星レーン)。推測で読まず、
 *     将来 contributionScore を外から注入する口(opts.contributionScoreByUserId)だけ用意する。
 * ───────────────────────────────────────────────────────────────────────────
 */

import { normalizeLv } from '../shared/niconico/liveId.js';

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   liveId: string,
 *   commentCount: number,
 *   giftCount: number,
 *   recentComments: readonly { text: string, capturedAt: number }[],
 *   recentGifts: readonly { text: string, capturedAt: number }[],
 *   lastActionAt: number,
 *   contributionScore?: number
 * }} PersonProfile
 */

/**
 * 保存コメント行が「ギフト行」かを判定する純関数。
 * userLaneCandidatesFromStorage の giftCount 集計(:174)と【同一基準】。両者がズレないようここに正本化。
 * @param {unknown} row
 * @returns {boolean}
 */
export function isGiftRow(row) {
  const r = /** @type {{ isGift?: unknown, gift?: unknown, kind?: unknown }} */ (row || {});
  return r.isGift === true || r.gift != null || r.kind === 'gift';
}

/** @param {unknown} row @returns {number} */
function rowCapturedAt(row) {
  const v = Number(/** @type {{ capturedAt?: unknown }} */ (row || {})?.capturedAt);
  return Number.isFinite(v) ? v : 0;
}

/** @param {unknown} row @returns {string} */
function rowText(row) {
  return String(/** @type {{ text?: unknown }} */ (row || {})?.text ?? '').trim();
}

/** @param {unknown} row @param {string} targetNorm @returns {boolean} */
function rowMatchesLive(row, targetNorm) {
  if (!targetNorm) return true;
  const o = /** @type {{ liveId?: unknown, lvId?: unknown }} */ (row || {});
  return normalizeLv(o?.liveId) === targetNorm || normalizeLv(o?.lvId) === targetNorm;
}

/**
 * 保存コメント行配列を userId 単位の人物プロファイルへ畳み込む純関数。
 *
 * @param {Array<Record<string, unknown>>} rows 正規化済み保存コメント行(userId/text/capturedAt/gift 等)
 * @param {string|null|undefined} liveId 指定時はこの放送の行だけ畳み込む(別放送混入を防ぐ)。空なら絞らない。
 * @param {{
 *   maxRecentComments?: number,
 *   maxRecentGifts?: number,
 *   contributionScoreByUserId?: Record<string, number> | Map<string, number> | null
 * }} [opts]
 * @returns {ReadonlyMap<string, Readonly<PersonProfile>>} userId → プロファイル(新しいアクション順は値で持つ)
 */
export function buildPersonProfilesFromRows(rows, liveId, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const targetNorm = normalizeLv(liveId);
  const maxC = Number.isFinite(Number(opts.maxRecentComments))
    ? Math.max(0, Math.floor(Number(opts.maxRecentComments)))
    : 5;
  const maxG = Number.isFinite(Number(opts.maxRecentGifts))
    ? Math.max(0, Math.floor(Number(opts.maxRecentGifts)))
    : 5;
  /** @param {string} uid @returns {number|undefined} */
  const scoreOf = (uid) => {
    const s = opts.contributionScoreByUserId;
    if (!s) return undefined;
    const v = s instanceof Map ? s.get(uid) : s[uid];
    return Number.isFinite(Number(v)) ? Number(v) : undefined;
  };

  /** @type {Map<string, { userId: string, nickname: string, liveId: string, commentCount: number, giftCount: number, comments: { text: string, capturedAt: number }[], gifts: { text: string, capturedAt: number }[], lastActionAt: number }>} */
  const byUid = new Map();

  for (const row of list) {
    const uid = String(/** @type {{ userId?: unknown }} */ (row || {})?.userId ?? '').trim();
    if (!uid) continue; // userId が無い行は人物に固定できない(来場者数 PV と同じく除外)
    if (!rowMatchesLive(row, targetNorm)) continue;

    let p = byUid.get(uid);
    if (!p) {
      p = {
        userId: uid,
        nickname: '',
        liveId: targetNorm || normalizeLv(/** @type {{ liveId?: unknown }} */ (row)?.liveId),
        commentCount: 0,
        giftCount: 0,
        comments: [],
        gifts: [],
        lastActionAt: 0
      };
      byUid.set(uid, p);
    }

    const at = rowCapturedAt(row);
    if (at > p.lastActionAt) p.lastActionAt = at;
    const nick = String(/** @type {{ nickname?: unknown }} */ (row)?.nickname ?? '').trim();
    if (nick && !p.nickname) p.nickname = nick;

    const text = rowText(row);
    if (isGiftRow(row)) {
      p.giftCount += 1;
      if (text) p.gifts.push({ text, capturedAt: at });
    } else {
      p.commentCount += 1;
      if (text) p.comments.push({ text, capturedAt: at });
    }
  }

  /** @type {Map<string, Readonly<PersonProfile>>} */
  const out = new Map();
  for (const [uid, p] of byUid) {
    // 新しい順に cap。元配列の順序に依存しないよう capturedAt で並べてから先頭 max 件。
    const recentComments = p.comments
      .slice()
      .sort((a, b) => b.capturedAt - a.capturedAt)
      .slice(0, maxC)
      .map((c) => Object.freeze(c));
    const recentGifts = p.gifts
      .slice()
      .sort((a, b) => b.capturedAt - a.capturedAt)
      .slice(0, maxG)
      .map((g) => Object.freeze(g));
    const score = scoreOf(uid);
    out.set(
      uid,
      Object.freeze({
        userId: p.userId,
        nickname: p.nickname,
        liveId: p.liveId,
        commentCount: p.commentCount,
        giftCount: p.giftCount,
        recentComments: Object.freeze(recentComments),
        recentGifts: Object.freeze(recentGifts),
        lastActionAt: p.lastActionAt,
        ...(score != null ? { contributionScore: score } : {})
      })
    );
  }
  return out;
}
