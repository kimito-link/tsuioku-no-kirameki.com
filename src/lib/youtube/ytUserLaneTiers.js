// ytUserLaneTiers.js — ニコ生版「アイコン列」（りんく・ギフト・広告・こん太・たぬ姉の段）を YouTube の応援者に当てはめる純粋関数
// @layer L0 — 純粋計算（副作用・ブラウザ API なし）
//
// ニコ生版の段の意味（extension/popup.html #sceneStoryUserLaneStack）をそのまま写す:
//   りんく段 … ID・表示名・個人サムネがそろった人
//   ギフト段 … 投げ銭をした人（YouTube ではスーパーチャット・ステッカー）
//   広告段   … 公式の応援枠（YouTube ではメンバー加入・メンバーシップギフト・メンバーバッジ）
//   こん太段 … 表示名かサムネのどちらかまで取れた人
//   たぬ姉段 … それ以外（チャンネルID不明・情報が薄い人）
// 1人は1つの段にだけ出す（上の段が優先）。段の中は直近に動いた順。

export const YT_USER_LANE_TIER_KEYS = Object.freeze(['link', 'gift', 'member', 'konta', 'tanu']);

const UC_RE = /^UC[A-Za-z0-9_-]{22}$/;

/** @param {any} u */
function hasRealIcon(u) {
  const s = String(u?.iconUrl || '').trim();
  return /^https:\/\//i.test(s);
}

/** @param {any} u */
function hasRealName(u) {
  const n = String(u?.name || '').trim();
  return n !== '' && n !== String(u?.channelId || '').trim();
}

/**
 * @param {any} u
 * @returns {'link'|'gift'|'member'|'konta'|'tanu'}
 */
export function classifyYtUserLaneTier(u) {
  if (!u || typeof u !== 'object') return 'tanu';
  const paid = Number(u.superchatCount || 0) + Number(u.stickerCount || 0);
  if (paid > 0) return 'gift';
  if (Number(u.giftCount || 0) > 0 || Number(u.membershipCount || 0) > 0 || u.isMember === true) {
    return 'member';
  }
  const hasId = UC_RE.test(String(u.channelId || ''));
  const icon = hasRealIcon(u);
  const name = hasRealName(u);
  if (hasId && icon && name) return 'link';
  if (hasId && (icon || name)) return 'konta';
  return 'tanu';
}

/**
 * @param {any[]} commenters ytSupportRanking の commenters
 * @param {{ limitPerTier?: number }} [opts]
 * @returns {{
 *   tiers: Record<'link'|'gift'|'member'|'konta'|'tanu', any[]>,
 *   totals: Record<'link'|'gift'|'member'|'konta'|'tanu', number>,
 *   displayed: number,
 *   total: number
 * }}
 */
export function buildYtUserLaneTiers(commenters, opts = {}) {
  const limit = Math.max(1, Math.floor(Number(opts.limitPerTier) || 60));
  /** @type {Record<string, any[]>} */
  const all = { link: [], gift: [], member: [], konta: [], tanu: [] };
  const seen = new Set();
  const list = Array.isArray(commenters) ? commenters : [];
  for (const u of list) {
    if (!u || typeof u !== 'object') continue;
    const key = String(u.channelId || u.name || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all[classifyYtUserLaneTier(u)].push(u);
  }
  const byRecent = (/** @type {any} */ a, /** @type {any} */ b) => Number(b.lastTs || 0) - Number(a.lastTs || 0);
  all.gift.sort((a, b) => {
    const d = Number(b.superchatTotalAmount || 0) - Number(a.superchatTotalAmount || 0);
    return d !== 0 ? d : byRecent(a, b);
  });
  all.member.sort((a, b) => {
    const d =
      Number(b.giftCount || 0) + Number(b.membershipCount || 0) -
      (Number(a.giftCount || 0) + Number(a.membershipCount || 0));
    return d !== 0 ? d : byRecent(a, b);
  });
  all.link.sort(byRecent);
  all.konta.sort(byRecent);
  all.tanu.sort(byRecent);

  /** @type {any} */
  const tiers = {};
  /** @type {any} */
  const totals = {};
  let displayed = 0;
  let total = 0;
  for (const k of YT_USER_LANE_TIER_KEYS) {
    totals[k] = all[k].length;
    tiers[k] = all[k].slice(0, limit);
    displayed += tiers[k].length;
    total += all[k].length;
  }
  return { tiers, totals, displayed, total };
}
