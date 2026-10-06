/**
 * 応援レーンのタイル 3 行目「🎁pt / 📣pt / 💬件」の合成(純関数・DOM 非依存)。
 *
 * ■ 値の出どころ(推測ゼロ・AGENTS §3.6)
 *   💬 = 拡張が記録した集約行の commentCount / 🎁 = 公式 koken 貢献度の公開 pt /
 *   📣 = 公式 nicoad 貢献度の公開 pt。uid は officialDomRankingRowsToStripRooms が
 *   userPageUrl から取り出した数値だけを採用(合成キー・匿名は誰にも付けない)。
 * ■ 不明は null(0 を捏造しない)。全部不明なら stats 自体を付けない=属性が付かない。
 * ■ 鍵を揺らさない: stats は storyLaneTierBodyKey / 描画署名 / laneSceneContentHash に入れない。
 */
import { formatNumberJa } from './htmlText.js';
import { officialDomRankingRowsToStripRooms } from './officialDomRankingRowsToStripRooms.js';
import { formatCountDelta, formatPtDelta } from './liveGiftPulse.js';

/** @typedef {{ commentCount: number|null, giftPt: number|null, adPt: number|null }} LaneTileStats */

const TIER_KEYS = ['link', 'gift', 'ad', 'konta', 'tanu'];

/** @param {unknown} n @returns {number|null} 正の整数のみ。0・負・非数は null。 */
function positiveOrNull(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * @param {LaneTileStats|undefined|null} s
 * @returns {boolean} 表示できる値が 1 つでもあるか
 */
function hasAny(s) {
  return !!s && (s.commentCount != null || s.giftPt != null || s.adPt != null);
}

/**
 * @param {unknown[]|null|undefined} rows ContributionRankerRow[]
 * @param {'contrib'|'ad'} kind
 * @returns {Map<string, number>} 数値 uid → pt
 */
function ptByNumericUid(rows, kind) {
  const m = new Map();
  if (!Array.isArray(rows)) return m;
  const rooms = officialDomRankingRowsToStripRooms(rows, { userKeyKind: kind });
  for (const r of rooms) {
    const key = String(r.userKey || '');
    const pt = positiveOrNull(r.count);
    if (/^\d+$/.test(key) && pt != null) m.set(key, pt);
  }
  return m;
}

/**
 * @param {{ aggregates?: readonly unknown[]|null, kokenRows?: unknown[]|null, nicoadRows?: unknown[]|null }} src
 * @returns {Map<string, LaneTileStats>} uid → stats(全部不明の uid は入らない)
 */
export function buildLaneTileStatsIndex(src) {
  const s = src && typeof src === 'object' ? src : {};
  const comments = new Map();
  for (const raw of Array.isArray(s.aggregates) ? s.aggregates : []) {
    const a = /** @type {{ userId?: unknown, commentCount?: unknown }} */ (raw || {});
    const uid = String(a.userId || '').trim();
    const c = positiveOrNull(a.commentCount);
    if (uid && c != null) comments.set(uid, c);
  }
  const gifts = ptByNumericUid(s.kokenRows, 'contrib');
  const ads = ptByNumericUid(s.nicoadRows, 'ad');
  /** @type {Map<string, LaneTileStats>} */
  const out = new Map();
  const uids = new Set([...comments.keys(), ...gifts.keys(), ...ads.keys()]);
  for (const uid of uids) {
    out.set(uid, {
      commentCount: comments.get(uid) ?? null,
      giftPt: gifts.get(uid) ?? null,
      adPt: ads.get(uid) ?? null
    });
  }
  return out;
}

/**
 * 非 null を優先して合成する。全部 null / 両方未定義なら undefined。
 * @param {LaneTileStats|undefined} a 先に持っている値(例: 広告段の adPt)
 * @param {LaneTileStats|undefined} b 索引から引いた値
 * @returns {LaneTileStats|undefined}
 */
export function mergeLaneTileStats(a, b) {
  const pick = (/** @type {keyof LaneTileStats} */ k) =>
    a && a[k] != null ? a[k] : b && b[k] != null ? b[k] : null;
  const merged = { commentCount: pick('commentCount'), giftPt: pick('giftPt'), adPt: pick('adPt') };
  return hasAny(merged) ? merged : undefined;
}

/**
 * 5 段すべてのアイテムに stats を載せた新しい buckets を返す(元の配列・frozen アイテムは壊さない)。
 * @template {Record<string, any[]>} B
 * @param {B} buckets
 * @param {ReadonlyMap<string, LaneTileStats>} index
 * @returns {B}
 */
export function attachLaneTileStats(buckets, index) {
  const out = /** @type {any} */ ({ ...buckets });
  for (const tier of TIER_KEYS) {
    const arr = Array.isArray(buckets?.[tier]) ? buckets[tier] : [];
    out[tier] = arr.map((item) => {
      const uid = String(item?.entry?.userId || '').trim();
      const stats = mergeLaneTileStats(item?.stats, uid ? index.get(uid) : undefined);
      return stats ? { ...item, stats } : item;
    });
  }
  return out;
}

/**
 * タイル 3 行目の文字列。順序・区切りは /live/ の liveLaneBuckets.js と同じ(🎁 📣 💬)。
 * @param {LaneTileStats|undefined|null} stats
 * @returns {string} 表示できる値が無ければ ''
 */
export function formatLaneTileStats(stats) {
  if (!stats || typeof stats !== 'object') return '';
  const parts = [];
  const g = positiveOrNull(stats.giftPt);
  const a = positiveOrNull(stats.adPt);
  const c = positiveOrNull(stats.commentCount);
  if (g != null) parts.push(`🎁${formatNumberJa(g)}`);
  if (a != null) parts.push(`📣${formatNumberJa(a)}`);
  if (c != null) parts.push(`💬${formatNumberJa(c)}`);
  return parts.join(' ');
}

/** 脚注(誠実な注記): 公式値と拡張記録の区別。 */
export function laneTileStatsLegendText() {
  return '🎁📣は公式の公開pt・💬は拡張が記録した件数';
}

/**
 * @typedef {{ giftDelta?: number, giftTier?: string, heat?: number, heatTier?: string }} LaneTilePulse
 *   giftDelta/giftTier: ギフト増分(公式 koken の標本間差分・v0.1.1565)。
 *   heat/heatTier: 直近60秒に増えたコメント件数(laneHeatTracker・v0.1.1566)。
 */

/**
 * koken 貢献度行 → createGiftPulseRegistry が読む {uid, point}(数値 uid の行だけ)。
 * @param {unknown[]|null|undefined} rows ContributionRankerRow[]
 * @returns {Array<{ uid: string, point: number }>}
 */
export function pulseRowsFromKokenRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of officialDomRankingRowsToStripRooms(rows, { userKeyKind: 'contrib' })) {
    const key = String(r.userKey || '');
    if (/^\d+$/.test(key)) out.push({ uid: key, point: Math.max(0, Number(r.count) || 0) });
  }
  return out;
}

/**
 * createGiftPulseRegistry().pulseFor の結果(byKey: 'u:<uid>' → {delta,tier})を uid → LaneTilePulse へ。
 * @param {{ byKey?: ReadonlyMap<string, { delta: number, tier: string }> }|null|undefined} result
 * @returns {Map<string, LaneTilePulse>}
 */
export function giftPulseByUid(result) {
  /** @type {Map<string, LaneTilePulse>} */
  const out = new Map();
  const byKey = result && result.byKey;
  if (!byKey || typeof byKey.forEach !== 'function') return out;
  byKey.forEach((v, key) => {
    const uid = String(key || '').replace(/^u:/, '');
    if (uid && v && v.delta > 0) out.set(uid, { giftDelta: v.delta, giftTier: String(v.tier || '') });
  });
  return out;
}

/**
 * laneHeatTracker.observe の結果 → uid → {heat, heatTier}。
 * @param {ReadonlyMap<string, { heat: number, tier: string }>|null|undefined} heatMap
 * @returns {Map<string, LaneTilePulse>}
 */
export function heatPulseByUid(heatMap) {
  /** @type {Map<string, LaneTilePulse>} */
  const out = new Map();
  if (!heatMap || typeof heatMap.forEach !== 'function') return out;
  heatMap.forEach((v, uid) => {
    if (uid && v && v.heat > 0) out.set(uid, { heat: v.heat, heatTier: String(v.tier || '') });
  });
  return out;
}

/**
 * gift と heat の uid→pulse を 1 つにまとめる(同じ uid の項目は合成)。
 * @param {ReadonlyMap<string, LaneTilePulse>} a
 * @param {ReadonlyMap<string, LaneTilePulse>} b
 * @returns {Map<string, LaneTilePulse>}
 */
export function mergeLanePulseMaps(a, b) {
  /** @type {Map<string, LaneTilePulse>} */
  const out = new Map();
  for (const m of [a, b]) {
    if (!m || typeof m.forEach !== 'function') continue;
    m.forEach((v, uid) => out.set(uid, { ...(out.get(uid) || {}), ...v }));
  }
  return out;
}

/**
 * 5 段のアイテムに pulse を載せた新しい buckets を返す(増分の無いアイテムは同じ参照のまま)。
 * @template {Record<string, any[]>} B
 * @param {B} buckets
 * @param {ReadonlyMap<string, LaneTilePulse>} pulseByUid
 * @returns {B}
 */
export function attachLaneTilePulse(buckets, pulseByUid) {
  if (!pulseByUid || pulseByUid.size === 0) return buckets;
  const out = /** @type {any} */ ({ ...buckets });
  for (const tier of TIER_KEYS) {
    const arr = Array.isArray(buckets?.[tier]) ? buckets[tier] : [];
    out[tier] = arr.map((item) => {
      const uid = String(item?.entry?.userId || '').trim();
      const p = uid ? pulseByUid.get(uid) : undefined;
      return p ? { ...item, pulse: { ...(item.pulse || {}), ...p } } : item;
    });
  }
  return out;
}

/**
 * タイルに付ける増分バッジの文字列・種別・段階。gift を優先する(同時に出さない)。
 * @param {LaneTilePulse|undefined|null} pulse
 * @returns {{ text: string, kind: ''|'gift'|'hot', tier: string }}
 */
export function formatLaneTilePulse(pulse) {
  const gift = formatPtDelta(pulse && pulse.giftDelta);
  if (gift) return { text: gift, kind: 'gift', tier: String((pulse && pulse.giftTier) || '') };
  const hot = formatCountDelta(pulse && pulse.heat);
  if (hot) return { text: hot, kind: 'hot', tier: String((pulse && pulse.heatTier) || '') };
  return { text: '', kind: '', tier: '' };
}
