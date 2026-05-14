/**
 * 応援ランキングストリップの DOM を組み直す必要があるか判定するキー。
 * 件数上位・ユーザー別件数に加え、行ごとの表示名（ enrich 後）を含める。
 * 件数が不変でもプロフィールキャッシュで正式名に切り替わったとき再描画する。
 *
 * @param {string} liveId
 * @param {number} entryCount storage にあるコメント総数（増減検知用）
 * @param {{ userKey: string, count: number, nickname?: string }[]} stripRooms ストリップに並べる行（先頭 N 件）
 * @returns {string}
 */
export function topSupportRankStripStableKey(liveId, entryCount, stripRooms) {
  const lid = String(liveId || '').trim().toLowerCase();
  const n = Math.max(0, Math.floor(Number(entryCount) || 0));
  const rows = Array.isArray(stripRooms) ? stripRooms : [];
  if (!rows.length) {
    return `${lid}\n${n}\n`;
  }
  const body = rows
    .map((r) => {
      const k = String(r?.userKey ?? '');
      const c = Math.max(0, Math.floor(Number(r?.count) || 0));
      const nick = String(r?.nickname ?? '').trim();
      return `${k}:${c}:${nick}`;
    })
    .join('\n');
  return `${lid}\n${n}\n${body}`;
}
