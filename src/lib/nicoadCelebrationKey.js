/**
 * ニコ広/ギフトのシステムコメント演出を「同じコメントで二度光らせない」ための
 * 重複排除キーを、コメント1件と liveId から決める純関数。
 *
 * 優先順位:
 *  - commentNo（無ければ id）があれば `${lid}|no:${no}` で一意化（最も信頼できる）。
 *  - どちらも無ければ capturedAt と本文先頭80字で `${lid}|t:${at}|${text}` を組む。
 *
 * popup-entry.js から抽出（挙動は完全に元のまま）。外部状態・DOM・グローバルに依存しない。
 */

/**
 * @param {unknown} entry コメント1件（commentNo/id/text/capturedAt を読む）
 * @param {string} liveId
 * @returns {string}
 */
export function nicoadCommentCelebrationKey(entry, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  const no = String(
    /** @type {{ commentNo?: unknown, id?: unknown }} */ (entry)?.commentNo ??
      /** @type {{ id?: unknown }} */ (entry)?.id ??
      ''
  ).trim();
  const text = String(/** @type {{ text?: unknown }} */ (entry)?.text ?? '').trim();
  if (no) return `${lid}|no:${no}`;
  const at = Number(/** @type {{ capturedAt?: unknown }} */ (entry)?.capturedAt) || 0;
  return `${lid}|t:${at}|${text.slice(0, 80)}`;
}
