// ytLaneAssign.js — YouTube Live コメントの 3 レーン（りんく・こん太・たぬ姉）振り分け・集計（純関数）
// @layer L0 — 純粋計算（副作用・ブラウザ API なし）

export const YT_LANES = Object.freeze({
  RINKU: 'rinku',
  KONTA: 'konta',
  TANUNEE: 'tanunee',
});

/**
 * レーン割り当て規則の単一定数定義（§2: 定数1か所で変えられる設計）。
 * 先頭から順に評価し、最初に一致したレーンを返す。
 */
export const YT_LANE_RULES = Object.freeze([
  {
    lane: YT_LANES.RINKU,
    characterName: 'りんく',
    roleLabel: '配信者視点',
    description: '配信者本人・モデレーター',
    badges: Object.freeze(['owner', 'moderator']),
    kinds: Object.freeze([]),
    includeSupporterChannels: false,
    isDefault: false,
  },
  {
    lane: YT_LANES.KONTA,
    characterName: 'こん太',
    roleLabel: 'ファン視点',
    description: 'スパチャ・ステッカー・メンバー・メンバーシップギフトの人',
    badges: Object.freeze(['member']),
    kinds: Object.freeze(['superchat', 'sticker', 'membership', 'membership_gift']),
    includeSupporterChannels: true,
    isDefault: false,
  },
  {
    lane: YT_LANES.TANUNEE,
    characterName: 'たぬ姉',
    roleLabel: '案内役',
    description: 'それ以外の一般コメント',
    badges: Object.freeze([]),
    kinds: Object.freeze([]),
    includeSupporterChannels: false,
    isDefault: true,
  },
]);

/**
 * 1件の YouTube チャット項目を 3 レーン（`rinku` / `konta` / `tanunee`）のいずれかに割り当てる。
 *
 * @param {any} item
 * @param {{
 *   broadcasterChannelId?: string,
 *   supporterChannelIds?: Set<string> | string[]
 * }} [opts]
 * @returns {'rinku' | 'konta' | 'tanunee'}
 */
export function assignYtCommentLane(item, opts = {}) {
  if (!item || typeof item !== 'object') {
    return YT_LANES.TANUNEE;
  }

  const badges = Array.isArray(item.badges)
    ? item.badges.map((/** @type {any} */ b) => String(b || '').toLowerCase())
    : [];
  const kind = String(item.kind || 'text').toLowerCase();
  const channelId = String(item.channelId || '');
  const broadcasterChannelId = String(opts.broadcasterChannelId || '');
  const supporterSet =
    opts.supporterChannelIds instanceof Set
      ? opts.supporterChannelIds
      : Array.isArray(opts.supporterChannelIds)
        ? new Set(opts.supporterChannelIds)
        : null;

  for (const rule of YT_LANE_RULES) {
    if (rule.isDefault) {
      return /** @type {'rinku' | 'konta' | 'tanunee'} */ (rule.lane);
    }
    if (
      rule.lane === YT_LANES.RINKU &&
      broadcasterChannelId &&
      channelId &&
      channelId === broadcasterChannelId
    ) {
      return YT_LANES.RINKU;
    }
    if (rule.badges.some((b) => badges.includes(b))) {
      return /** @type {'rinku' | 'konta' | 'tanunee'} */ (rule.lane);
    }
    if (rule.kinds.includes(kind)) {
      return /** @type {'rinku' | 'konta' | 'tanunee'} */ (rule.lane);
    }
    if (rule.includeSupporterChannels && channelId && supporterSet && supporterSet.has(channelId)) {
      return /** @type {'rinku' | 'konta' | 'tanunee'} */ (rule.lane);
    }
  }

  return YT_LANES.TANUNEE;
}

/**
 * コメント配列を 3 レーンごとに振り分ける。
 *
 * @param {any[]} items
 * @param {{
 *   broadcasterChannelId?: string,
 *   supporterChannelIds?: Set<string> | string[]
 * }} [opts]
 * @returns {{ rinku: any[], konta: any[], tanunee: any[] }}
 */
export function groupYtCommentsByLane(items, opts = {}) {
  /** @type {{ rinku: any[], konta: any[], tanunee: any[] }} */
  const grouped = {
    rinku: [],
    konta: [],
    tanunee: [],
  };
  if (!Array.isArray(items)) return grouped;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const lane = assignYtCommentLane(item, opts);
    grouped[lane].push(item);
  }
  return grouped;
}
