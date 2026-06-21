/**
 * 「この配信の応援者ランキング(ちくらん風)」の純ロジック(v0.1.865)。
 *
 * 背景(ユーザー構想 2026-06-21「診断画面にちくらん風の画面=将来 Kimito Link ランキングに育てたい」):
 *   まず視聴中1配信の「コメントした人」を件数順に並べる(段階A)。既存の aggregateMarketingReport.topUsers
 *   (userId/nickname/avatarUrl/count・件数順)をそのまま活かす(星野ロミ式=既存データを活かす・過剰実装回避)。
 *   将来は複数配信横断の累計(段階B)へ拡張できる土台にする。
 *
 * 設計(self-verifying・星野ロミ式):
 *   - 表示専用の純関数。新規取得ゼロ。topUsers を整形して上位 N 件のランキング行にするだけ。
 *   - 匿名(184・a:hash)主体だと実人数より過大/推定寄りになる(reportPreview と同じ注意)。匿名行は
 *     「匿名」と明示し、誤読を防ぐ(信頼度メーターと同方針)。
 *   - 件数 0 や topUsers 空なら空ランキング=ノイズにしない。
 *
 * @typedef {{
 *   rank: number,         // 1 始まりの順位
 *   userId: string,
 *   name: string,         // 表示名(匿名は「匿名」)
 *   avatarUrl: string,    // アイコン URL(無ければ '')
 *   count: number,        // 応援コメント件数
 *   isAnonymous: boolean  // 匿名(a:hash / anon: / userId 空)か
 * }} SupporterRow
 */

/** @param {unknown} v @returns {number} */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** userId が匿名(a:hash / anon: prefix / 空)か。giftMomentumAnalytics と同じ匿名判定に揃える。 @param {unknown} userId */
function isAnonymousUserId(userId) {
  const id = String(userId || '').trim();
  if (!id) return true;
  return /^(__anon_|anon:|a:)/i.test(id);
}

/**
 * topUsers(aggregateMarketingReport の戻り)から応援者ランキング上位 N 件を作る純関数。
 * @param {Array<{userId?: unknown, nickname?: unknown, avatarUrl?: unknown, count?: unknown}>|null|undefined} topUsers
 * @param {{ limit?: number }} [opts]
 * @returns {SupporterRow[]}
 */
export function buildSupporterRanking(topUsers, opts = {}) {
  const limit = Math.max(1, Math.min(50, Math.floor(num(opts.limit) || 10)));
  const list = Array.isArray(topUsers) ? topUsers : [];
  /** @type {SupporterRow[]} */
  const rows = [];
  for (const u of list) {
    const count = num(u?.count);
    if (count <= 0) continue; // 0 件は応援者でない=出さない。
    const userId = String(u?.userId || '').trim();
    const anon = isAnonymousUserId(userId);
    const nickname = String(u?.nickname || '').trim();
    rows.push({
      rank: 0, // 後で採番
      userId,
      name: nickname || (anon ? '匿名' : userId || '名無し'),
      avatarUrl: String(u?.avatarUrl || '').trim(),
      count,
      isAnonymous: anon
    });
    if (rows.length >= limit) break; // topUsers は既に件数降順なので先頭から limit 件。
  }
  // 念のため件数降順で安定化(topUsers が既にソート済みでも保険)。
  rows.sort((a, b) => b.count - a.count);
  return rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * ランキングを status 速報の複数行テキストに整形(保存せず中身が分かる・AI 共有にも乗る)。
 * 空なら ''(ノイズにしない)。
 * @param {SupporterRow[]|null|undefined} rows
 * @param {{ max?: number }} [opts]
 * @returns {string}
 */
export function buildSupporterRankingLines(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '';
  const max = Math.max(1, Math.min(50, Math.floor(num(opts.max) || 5)));
  const medals = ['🥇', '🥈', '🥉'];
  const lines = list.slice(0, max).map((r) => {
    const badge = medals[r.rank - 1] || `${r.rank}.`;
    const anon = r.isAnonymous ? '(匿名)' : '';
    return `  ${badge} ${r.name}${anon} ${r.count.toLocaleString('ja-JP')}件`;
  });
  return `応援者ランキング(この配信):\n${lines.join('\n')}`;
}
