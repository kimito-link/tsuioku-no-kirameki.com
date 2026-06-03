/**
 * 配信中のマイルストーン演出（コメント件数・イベント順位 UP・ギフト件数）の判定。
 * DOM / storage は popup-entry 側で扱う。
 */

/** @typedef {'comment_milestone'|'event_rank_up'|'gift_milestone'|'ad_points_milestone'|'ad_advertiser_milestone'|'ad_points_increase'|'ad_throw'|'broadcaster_follower_milestone'|'broadcaster_follower_increase'} SupportCelebrationKind */

/** @typedef {'rinku'|'konta'|'mixed'} SupportCelebrationCharacterSet */

/**
 * @typedef {Object} SupportCelebrationSpec
 * @property {SupportCelebrationKind} kind
 * @property {string} message
 * @property {number} dropCount
 * @property {number} durationMs
 * @property {string} dedupeKey
 * @property {SupportCelebrationCharacterSet} characterSet
 * @property {'standard'|'rinku_deluge'} [dropVariant]
 */

export const COMMENT_MILESTONES = Object.freeze([10, 25, 50, 100, 200, 500, 1000]);

export const GIFT_MILESTONES = Object.freeze([1, 5, 10, 25, 50, 100]);

/** 番組累計ニコニ広告pt（1 = 初回 pt 到達） */
export const AD_POINTS_MILESTONES = Object.freeze([
  1, 1000, 5000, 10000, 50000, 100000, 500000
]);

/** 広告ランキングに載った広告主人数 */
export const AD_ADVERTISER_MILESTONES = Object.freeze([1, 3, 5, 10, 25]);

/**
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 * @param {readonly number[]} milestones
 * @returns {number|null}
 */
export function pickHighestCrossedMilestone(prev, next, milestones) {
  if (prev == null || !Number.isFinite(prev) || !Number.isFinite(next)) return null;
  if (next <= prev) return null;
  let hit = null;
  for (const m of milestones) {
    if (prev < m && next >= m) hit = m;
  }
  return hit;
}

/**
 * 累計ニコニ広告pt が既に到達しているマイルストーンの dedupeKey 一覧（起動時プライム用）。
 *
 * @param {number} adPoints
 * @returns {string[]}
 */
export function adPointsMilestoneDedupeKeysAtOrBelow(adPoints) {
  const pts = Number(adPoints);
  if (!Number.isFinite(pts) || pts < 0) return [];
  /** @type {string[]} */
  const out = [];
  for (const m of AD_POINTS_MILESTONES) {
    if (pts >= m) out.push(`ad_pts_${m}`);
  }
  return out;
}

/**
 * 既に到達しているギフト件数マイルストーンの dedupeKey 一覧（起動プライム用）。
 *
 * @param {number} giftEventCount
 * @returns {string[]}
 */
export function giftCountMilestoneDedupeKeysAtOrBelow(giftEventCount) {
  const n = Number(giftEventCount);
  if (!Number.isFinite(n) || n < 0) return [];
  /** @type {string[]} */
  const out = [];
  for (const m of GIFT_MILESTONES) {
    if (n >= m) out.push(`gift_${m}`);
  }
  return out;
}

/**
 * 既に到達しているコメント件数マイルストーンの dedupeKey 一覧（起動プライム用）。
 *
 * @param {number} commentCount
 * @returns {string[]}
 */
export function commentMilestoneDedupeKeysAtOrBelow(commentCount) {
  const n = Number(commentCount);
  if (!Number.isFinite(n) || n < 0) return [];
  /** @type {string[]} */
  const out = [];
  for (const m of COMMENT_MILESTONES) {
    if (n >= m) out.push(`comment_${m}`);
  }
  return out;
}

/**
 * 起動直後の「未取得 0 → 正本累計」ジャンプではマイルストーン演出を出さない。
 *
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 * @returns {boolean}
 */
export function isStartupAdPointsJump(prev, next) {
  if (prev == null || next == null || !Number.isFinite(prev) || !Number.isFinite(next)) {
    return false;
  }
  if (next <= prev) return false;
  if (prev <= 0 && next >= 1000) return true;
  const delta = next - prev;
  if (delta >= 8000 && prev < next * 0.05) return true;
  return false;
}

/**
 * @param {number} milestone
 * @returns {number}
 */
export function dropCountForCommentMilestone(milestone) {
  if (milestone >= 1000) return 180;
  if (milestone >= 500) return 140;
  if (milestone >= 200) return 110;
  if (milestone >= 100) return 85;
  if (milestone >= 50) return 48;
  if (milestone >= 25) return 32;
  return 22;
}

/**
 * @param {number} milestone
 * @returns {number}
 */
export function commentMilestoneDurationMs(milestone) {
  if (milestone >= 1000) return 6500;
  if (milestone >= 500) return 5600;
  if (milestone >= 200) return 5200;
  if (milestone >= 100) return 4800;
  if (milestone >= 50) return 3600;
  return 3000;
}

/**
 * @param {number} milestone
 * @returns {number}
 */
export function dropCountForGiftMilestone(milestone) {
  if (milestone >= 100) return 36;
  if (milestone >= 50) return 28;
  if (milestone >= 25) return 22;
  if (milestone >= 10) return 16;
  if (milestone >= 5) return 12;
  return 8;
}

/**
 * @param {number} milestone
 * @returns {number}
 */
export function dropCountForAdPointsMilestone(milestone) {
  if (milestone >= 500000) return 40;
  if (milestone >= 100000) return 34;
  if (milestone >= 50000) return 28;
  if (milestone >= 10000) return 22;
  if (milestone >= 5000) return 16;
  if (milestone >= 1000) return 12;
  return 10;
}

/**
 * @param {number} milestone
 * @returns {number}
 */
export function dropCountForAdAdvertiserMilestone(milestone) {
  if (milestone >= 25) return 30;
  if (milestone >= 10) return 22;
  if (milestone >= 5) return 16;
  if (milestone >= 3) return 12;
  return 10;
}

/**
 * @param {number} prevRank
 * @param {number} nextRank
 * @returns {number}
 */
export function dropCountForEventRankUp(prevRank, nextRank) {
  const delta = prevRank - nextRank;
  let base = 12 + Math.max(0, delta) * 2;
  if (nextRank <= 3) base += 20;
  else if (nextRank <= 10) base += 10;
  return Math.min(45, base);
}

/**
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 * @returns {SupportCelebrationSpec|null}
 */
export function pickCommentMilestoneCelebration(prev, next) {
  const hit = pickHighestCrossedMilestone(prev, next, COMMENT_MILESTONES);
  if (hit == null) return null;
  return {
    kind: 'comment_milestone',
    message: `アプリ記録 ${hit.toLocaleString('ja-JP')} 件達成！`,
    dropCount: dropCountForCommentMilestone(hit),
    durationMs: commentMilestoneDurationMs(hit),
    dedupeKey: `comment_${hit}`,
    characterSet: 'mixed',
    dropVariant: 'rinku_deluge'
  };
}

/**
 * 順位は数値が小さいほど上位。prevRank > nextRank のとき UP。
 *
 * @param {number|null|undefined} prevRank
 * @param {number|null|undefined} nextRank
 * @returns {SupportCelebrationSpec|null}
 */
export function pickEventRankUpCelebration(prevRank, nextRank) {
  if (
    prevRank == null ||
    nextRank == null ||
    !Number.isFinite(prevRank) ||
    !Number.isFinite(nextRank)
  ) {
    return null;
  }
  if (prevRank <= 0 || nextRank <= 0) return null;
  if (nextRank >= prevRank) return null;

  const message =
    nextRank <= 3
      ? `イベント ${nextRank} 位に突入！（${prevRank}位→${nextRank}位）`
      : `イベント順位アップ！ ${prevRank}位 → ${nextRank}位`;

  return {
    kind: 'event_rank_up',
    message,
    dropCount: dropCountForEventRankUp(prevRank, nextRank),
    durationMs: nextRank <= 3 ? 3400 : 2800,
    dedupeKey: `event_rank_${nextRank}`,
    characterSet: 'mixed'
  };
}

/**
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 * @returns {SupportCelebrationSpec|null}
 */
export function pickGiftCountMilestoneCelebration(prev, next) {
  const hit = pickHighestCrossedMilestone(prev, next, GIFT_MILESTONES);
  if (hit == null) return null;
  return {
    kind: 'gift_milestone',
    message:
      hit === 1
        ? '最初のギフトが届きました！'
        : `ギフト ${hit.toLocaleString('ja-JP')} 件目！`,
    dropCount: dropCountForGiftMilestone(hit),
    durationMs: hit >= 25 ? 3000 : 2400,
    dedupeKey: `gift_${hit}`,
    characterSet: 'mixed'
  };
}

/**
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 * @returns {SupportCelebrationSpec|null}
 */
export function pickAdPointsMilestoneCelebration(prev, next) {
  const hit = pickHighestCrossedMilestone(prev, next, AD_POINTS_MILESTONES);
  if (hit == null) return null;
  const message =
    hit === 1
      ? '最初のニコニ広告ptが付きました！'
      : `ニコニ広告 ${hit.toLocaleString('ja-JP')}pt 達成！`;
  return {
    kind: 'ad_points_milestone',
    message,
    dropCount: dropCountForAdPointsMilestone(hit),
    durationMs: hit >= 50000 ? 3200 : hit >= 10000 ? 2800 : 2400,
    dedupeKey: `ad_pts_${hit}`,
    characterSet: 'mixed',
    dropVariant: 'rinku_deluge'
  };
}

/**
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 * @returns {SupportCelebrationSpec|null}
 */
export function pickAdAdvertiserCountMilestoneCelebration(prev, next) {
  const hit = pickHighestCrossedMilestone(prev, next, AD_ADVERTISER_MILESTONES);
  if (hit == null) return null;
  const message =
    hit === 1
      ? '最初の広告主さんがランキングに登場！'
      : `広告主 ${hit.toLocaleString('ja-JP')} 人目がランキングに！`;
  return {
    kind: 'ad_advertiser_milestone',
    message,
    dropCount: dropCountForAdAdvertiserMilestone(hit),
    durationMs: hit >= 10 ? 2800 : 2400,
    dedupeKey: `ad_adv_${hit}`,
    characterSet: 'mixed',
    dropVariant: 'rinku_deluge'
  };
}

/**
 * 累計 pt の増加（マイルストーン未達でも投げた瞬間を拾う）。
 *
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 * @returns {SupportCelebrationSpec|null}
 */
export function pickAdPointsIncreaseCelebration(prev, next) {
  if (prev == null || next == null || !Number.isFinite(prev) || !Number.isFinite(next)) {
    return null;
  }
  if (next <= prev) return null;
  if (pickHighestCrossedMilestone(prev, next, AD_POINTS_MILESTONES) != null) return null;
  const delta = next - prev;
  if (delta <= 0) return null;
  return {
    kind: 'ad_points_increase',
    message: `ニコニ広告 +${delta.toLocaleString('ja-JP')} pt！`,
    dropCount: Math.min(22, 8 + Math.floor(delta / 20)),
    durationMs: delta >= 500 ? 2800 : 2400,
    dedupeKey: `ad_throw_${next}`,
    characterSet: 'mixed',
    dropVariant: 'rinku_deluge'
  };
}

/**
 * @param {{ sender: string, point: number }} parsed
 * @param {string} commentDedupeKey
 * @returns {SupportCelebrationSpec|null}
 */
export function pickNicoadCommentCelebration(parsed, commentDedupeKey) {
  if (!parsed || !commentDedupeKey) return null;
  const pt = Number(parsed.point) || 0;
  const sender = String(parsed.sender || '').trim();
  if (pt <= 0 || !sender) return null;
  return {
    kind: 'ad_throw',
    message: `${sender}さんが ${pt.toLocaleString('ja-JP')} pt 広告！`,
    dropCount: Math.min(26, 10 + Math.floor(pt / 25)),
    durationMs: pt >= 500 ? 2800 : 2400,
    dedupeKey: `ad_comment_${commentDedupeKey}`,
    characterSet: 'mixed',
    dropVariant: 'rinku_deluge'
  };
}

/**
 * @param {SupportCelebrationKind} kind
 * @returns {boolean}
 */
export function isAdSupportCelebrationKind(kind) {
  return (
    kind === 'ad_points_milestone' ||
    kind === 'ad_advertiser_milestone' ||
    kind === 'ad_points_increase' ||
    kind === 'ad_throw'
  );
}

/** 配信者プロフィールのフォロワー数（nvapi） */
export const BROADCASTER_FOLLOWER_MILESTONES = Object.freeze([
  1, 10, 50, 100, 500, 1000, 5000, 10000
]);

/**
 * @param {number} milestone
 * @returns {number}
 */
export function dropCountForBroadcasterFollowerMilestone(milestone) {
  if (milestone >= 10000) return 34;
  if (milestone >= 5000) return 28;
  if (milestone >= 1000) return 22;
  if (milestone >= 500) return 18;
  if (milestone >= 100) return 14;
  if (milestone >= 50) return 12;
  return 10;
}

/**
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 * @returns {SupportCelebrationSpec|null}
 */
export function pickBroadcasterFollowerMilestoneCelebration(prev, next) {
  const hit = pickHighestCrossedMilestone(prev, next, BROADCASTER_FOLLOWER_MILESTONES);
  if (hit == null) return null;
  const message =
    hit === 1
      ? 'フォロワーが付きました！'
      : `フォロワー ${hit.toLocaleString('ja-JP')} 人達成！`;
  return {
    kind: 'broadcaster_follower_milestone',
    message,
    dropCount: dropCountForBroadcasterFollowerMilestone(hit),
    durationMs: hit >= 1000 ? 2800 : hit >= 100 ? 2600 : 2400,
    dedupeKey: `bc_follower_${hit}`,
    characterSet: 'mixed',
    dropVariant: 'rinku_deluge'
  };
}

/**
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 * @returns {SupportCelebrationSpec|null}
 */
export function pickBroadcasterFollowerIncreaseCelebration(prev, next) {
  if (prev == null || next == null || !Number.isFinite(prev) || !Number.isFinite(next)) {
    return null;
  }
  if (next <= prev) return null;
  if (pickHighestCrossedMilestone(prev, next, BROADCASTER_FOLLOWER_MILESTONES) != null) {
    return null;
  }
  const delta = next - prev;
  if (delta <= 0) return null;
  return {
    kind: 'broadcaster_follower_increase',
    message: `フォロワー +${delta.toLocaleString('ja-JP')} 人！`,
    dropCount: Math.min(20, 8 + Math.floor(delta / 2)),
    durationMs: delta >= 10 ? 2600 : 2400,
    dedupeKey: `bc_follower_inc_${next}`,
    characterSet: 'mixed',
    dropVariant: 'rinku_deluge'
  };
}

/**
 * @param {SupportCelebrationKind} kind
 * @returns {boolean}
 */
export function isFollowerSupportCelebrationKind(kind) {
  return kind === 'broadcaster_follower_milestone' || kind === 'broadcaster_follower_increase';
}

/**
 * @param {readonly string[]|null|undefined} celebratedKeys
 * @param {string} dedupeKey
 * @returns {boolean}
 */
export function isSupportCelebrationAlreadyDone(celebratedKeys, dedupeKey) {
  if (!dedupeKey) return true;
  return Array.isArray(celebratedKeys) && celebratedKeys.includes(dedupeKey);
}

/**
 * @param {readonly string[]|null|undefined} celebratedKeys
 * @param {string} dedupeKey
 * @returns {string[]}
 */
export function markSupportCelebrationDone(celebratedKeys, dedupeKey) {
  const base = Array.isArray(celebratedKeys) ? [...celebratedKeys] : [];
  if (!dedupeKey || base.includes(dedupeKey)) return base;
  base.push(dedupeKey);
  return base;
}

/**
 * @param {Record<string, string[]>|null|undefined} state
 * @param {string} liveId
 * @returns {string[]}
 */
export function celebratedKeysForLive(state, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !state || typeof state !== 'object') return [];
  const keys = state[lid];
  return Array.isArray(keys) ? keys.filter((k) => typeof k === 'string' && k) : [];
}

/**
 * @param {Record<string, string[]>|null|undefined} state
 * @param {string} liveId
 * @param {string[]} keys
 * @returns {Record<string, string[]>}
 */
export function withCelebratedKeysForLive(state, liveId, keys) {
  const lid = String(liveId || '').trim().toLowerCase();
  const out =
    state && typeof state === 'object' ? { ...state } : /** @type {Record<string, string[]>} */ ({});
  if (!lid) return out;
  out[lid] = Array.isArray(keys) ? [...keys] : [];
  return out;
}
