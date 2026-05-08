/**
 * ギフト貢献ストリップの再描画が必要か判定するキー。
 *
 * @param {string} liveId
 * @param {{ userKey: string, throwCount: number, capturedAt: number, nickname?: string }[]} rows
 * @returns {string}
 */
export function giftRankStripStableKey(liveId, rows) {
  const lid = String(liveId || '').trim().toLowerCase();
  const arr = Array.isArray(rows) ? rows : [];
  if (!arr.length) {
    return `${lid}\n0\n`;
  }
  const body = arr
    .map((r) => {
      const k = String(r?.userKey ?? '');
      const c = Math.max(0, Math.floor(Number(r?.throwCount) || 0));
      const t = Math.max(0, Math.floor(Number(r?.capturedAt) || 0));
      const nick = String(r?.nickname ?? '').trim();
      return `${k}:${c}:${t}:${nick}`;
    })
    .join('\n');
  return `${lid}\n${arr.length}\n${body}`;
}
