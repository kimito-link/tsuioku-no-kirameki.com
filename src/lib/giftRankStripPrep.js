/**
 * NDGR 由来のギフトユーザ配列を、応援ランキングストリップと同型の行に正規化する。
 */

import { normalizeGiftThrowCount } from './giftRecord.js';
import { GIFT_RANK_STRIP_MAX } from './giftRankStripConfig.js';

/**
 * @typedef {{ userKey: string, nickname: string, count: number, avatarUrl?: string }} GiftRankStripRoom
 * topSupportRankLineModels / renderTopSupportRankStrip と同型（userKey = 数値 uid 等）
 */

/**
 * @typedef {{ userKey: string, throwCount: number, capturedAt: number, nickname: string }} GiftRankStripStableKeyRow
 */

/**
 * @param {unknown} raw
 * @returns {{ userId: string, nickname: string, throwCount: number, capturedAt: number }|null}
 */
function normalizeGiftRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const userId = String(o.userId ?? '').trim();
  if (!userId) return null;
  const nickname = String(o.nickname ?? '').trim();
  const throwCount = normalizeGiftThrowCount(o.throwCount);
  const capturedAt = Math.max(0, Math.floor(Number(o.capturedAt) || 0));
  return { userId, nickname, throwCount, capturedAt };
}

/**
 * ストリップの件数制限なしで、同一 userId マージ＋並べ替えまで済ませた行（全件）。
 * HTML レポート / マーケ分析のギフト表はここを正本にする（popup ストリップと同ロジック）。
 *
 * @param {unknown[]} raw
 * @param {{ broadcasterUid?: string }} [opts]
 * @returns {{ userId: string, nickname: string, throwCount: number, capturedAt: number }[]}
 */
export function mergeAndSortGiftUserRows(raw, opts = {}) {
  const broadcasterUid = String(opts?.broadcasterUid || '').trim();
  const list = Array.isArray(raw) ? raw : [];
  /** @type {Map<string, { userId: string, nickname: string, throwCount: number, capturedAt: number }>} */
  const byId = new Map();
  for (const item of list) {
    const row = normalizeGiftRow(item);
    if (!row) continue;
    if (broadcasterUid && row.userId === broadcasterUid) continue;
    const ex = byId.get(row.userId);
    if (!ex) {
      byId.set(row.userId, { ...row });
    } else {
      ex.throwCount = Math.max(ex.throwCount, row.throwCount);
      ex.capturedAt = Math.max(ex.capturedAt, row.capturedAt);
      if (row.nickname && !ex.nickname) ex.nickname = row.nickname;
    }
  }

  return [...byId.values()].sort((a, b) => {
    if (b.throwCount !== a.throwCount) return b.throwCount - a.throwCount;
    if (b.capturedAt !== a.capturedAt) return b.capturedAt - a.capturedAt;
    return a.userId.localeCompare(b.userId);
  });
}

/**
 * @param {unknown[]} raw
 * @param {{ broadcasterUid?: string, max?: number }} [opts]
 * @returns {{ stripRooms: GiftRankStripRoom[], stableKeyRows: GiftRankStripStableKeyRow[] }}
 */
export function prepareGiftRankStrip(raw, opts = {}) {
  const max = Math.max(
    1,
    Math.min(
      GIFT_RANK_STRIP_MAX,
      Number.isFinite(Number(opts?.max)) && Number(opts.max) > 0
        ? Math.floor(Number(opts.max))
        : GIFT_RANK_STRIP_MAX
    )
  );

  const merged = mergeAndSortGiftUserRows(raw, opts);
  const slice = merged.slice(0, max);
  return {
    stripRooms: slice.map((r) => ({
      userKey: r.userId,
      nickname: r.nickname,
      count: r.throwCount
    })),
    stableKeyRows: slice.map((r) => ({
      userKey: r.userId,
      throwCount: r.throwCount,
      capturedAt: r.capturedAt,
      nickname: r.nickname || ''
    }))
  };
}

/**
 * @param {unknown[]} raw
 * @param {{ broadcasterUid?: string, max?: number }} [opts]
 * @returns {GiftRankStripRoom[]}
 */
export function prepareGiftUsersForRankStrip(raw, opts = {}) {
  return prepareGiftRankStrip(raw, opts).stripRooms;
}

/**
 * ストリップ先頭行の数値を「当ストリップ内の最多」とみなし、2 位以降にその差分ラベルを返す。
 * ギフト帯では {@link prepareGiftRankStrip} の先頭行の throwCount が基準（本家ギフト履歴の番組累計ポイントやランキングタブの貢献度とは無関係）。
 * （応援帯では記録内応援件数が同じルールで並んでいる想定。）
 *
 * @param {number} placeNumber1Based topSupportRankLineModels の順位（1 始まり。0 以下は先頭扱いで空）
 * @param {number} rowCount
 * @param {number} stripTopCount ストリップ先頭行の数値
 * @param {'回'|'件'} counterUnit
 * @returns {string} 空なら行に余計なラベルを足さない
 */
export function formatLeaderGapLabel(
  placeNumber1Based,
  rowCount,
  stripTopCount,
  counterUnit
) {
  const unit = counterUnit === '件' ? '件' : '回';
  const p = Math.max(0, Math.floor(Number(placeNumber1Based) || 0));
  const c = Math.max(0, Math.floor(Number(rowCount) || 0));
  const t = Math.max(0, Math.floor(Number(stripTopCount) || 0));
  if (p <= 1) return '';
  const gap = Math.max(0, t - c);
  if (gap <= 0) return '最多タイ';
  return `1位まであと${gap}${unit}`;
}

/**
 * NDGR ギフト帯用（単位「回」）。{@link formatLeaderGapLabel} のエイリアス。
 *
 * @param {number} placeNumber1Based
 * @param {number} throwCount
 * @param {number} stripTopThrowCount
 */
export function formatGiftThrowGapLabel(placeNumber1Based, throwCount, stripTopThrowCount) {
  return formatLeaderGapLabel(placeNumber1Based, throwCount, stripTopThrowCount, '回');
}
