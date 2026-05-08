/**
 * ニコ生のギフトコメント文字列をパースする純粋関数。
 *
 * 0.1.175: NDGR 経由でギフト event が取れない番組（拡張が後から接続したケース）
 * でも、コメントテーブル DOM の `data-comment-type="gift"` 行には
 * 「○○さんがギフト「XXX（Npt）」を贈りました」という人間可読文字列が入っている。
 * これをパースすることで autoOpen を迂回してギフト送信者・アイテム・ポイントを取得する。
 *
 * 例：
 *   「シンラツさんがギフト「応援メガホン 黄（10pt）」を贈りました」
 *     → { sender: 'シンラツ', item: '応援メガホン 黄', point: 10 }
 *   「名無しさんがギフト「応援メガホン 青（5pt）」を贈りました」
 *     → { sender: '名無し', item: '応援メガホン 青', point: 5 }
 *
 * 全角・半角の括弧両方を許容（niconico 側の表記揺れ対策）。
 */

/**
 * @typedef {{ sender: string, item: string, point: number, rank?: number }} ParsedGiftComment
 */

/**
 * @param {string} text
 * @returns {ParsedGiftComment | null}
 */
export function parseGiftCommentText(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  // 0.1.177: niconico は順位プレフィックス付きで送ってくる：
  //   「【ギフト貢献4位】エマさんがギフト「応援メガホン 水色（10pt）」を贈りました」
  // 0〜複数の 【...】 を許容して sender だけを取る。順位は別フィールドに切り出す。
  // 括弧は 「」『』、ポイント括弧は （ ） / ( )
  const re = /^(?:【[^】]*】\s*)*(.+?)さんがギフト[「『](.+?)[（(](\d+)\s*pt[)）][」』]を贈りました/;
  const m = trimmed.match(re);
  if (!m) return null;
  const sender = m[1].trim();
  const item = m[2].trim();
  const point = parseInt(m[3], 10);
  if (!sender || !item || !Number.isFinite(point) || point < 0) return null;
  // 順位プレフィックスがあれば rank を抽出（「ギフト貢献N位」のみ。他の括弧形式は無視）
  const rankMatch = trimmed.match(/【ギフト貢献(\d+)位】/);
  if (rankMatch) {
    const rank = parseInt(rankMatch[1], 10);
    if (Number.isFinite(rank) && rank > 0) {
      return { sender, item, point, rank };
    }
  }
  return { sender, item, point };
}

/**
 * @param {Iterable<ParsedGiftComment>} parsedRows
 * @returns {{
 *   totalCount: number,
 *   totalPoints: number,
 *   uniqueSenderCount: number,
 *   uniqueItemCount: number,
 *   topSenders: { sender: string, totalPoints: number, count: number, latestRank?: number }[],
 *   topItems: { item: string, count: number, totalPoints: number }[]
 * }}
 */
export function summarizeGiftComments(parsedRows) {
  /** @type {Map<string, { totalPoints: number, count: number, latestRank: number | null }>} */
  const senderAgg = new Map();
  /** @type {Map<string, { count: number, totalPoints: number }>} */
  const itemAgg = new Map();
  let totalPoints = 0;
  let totalCount = 0;
  for (const o of parsedRows) {
    if (!o) continue;
    const sender = String(o.sender || '').trim();
    const item = String(o.item || '').trim();
    const point = Number(o.point) || 0;
    if (!sender || !item) continue;
    const sCur = senderAgg.get(sender) || { totalPoints: 0, count: 0, latestRank: null };
    sCur.totalPoints += point;
    sCur.count += 1;
    // 0.1.177: 順位プレフィックスがあれば最新値を保持
    if (typeof o.rank === 'number' && Number.isFinite(o.rank)) {
      sCur.latestRank = o.rank;
    }
    senderAgg.set(sender, sCur);
    const iCur = itemAgg.get(item) || { count: 0, totalPoints: 0 };
    iCur.count += 1;
    iCur.totalPoints += point;
    itemAgg.set(item, iCur);
    totalPoints += point;
    totalCount += 1;
  }
  const topSenders = [...senderAgg.entries()]
    .sort((a, b) => b[1].totalPoints - a[1].totalPoints)
    .slice(0, 10)
    .map(([sender, v]) => {
      /** @type {{ sender: string, totalPoints: number, count: number, latestRank?: number }} */
      const out = { sender, totalPoints: v.totalPoints, count: v.count };
      if (v.latestRank !== null) out.latestRank = v.latestRank;
      return out;
    });
  const topItems = [...itemAgg.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([item, v]) => ({
      item,
      count: v.count,
      totalPoints: v.totalPoints
    }));
  return {
    totalCount,
    totalPoints,
    uniqueSenderCount: senderAgg.size,
    uniqueItemCount: itemAgg.size,
    topSenders,
    topItems
  };
}
