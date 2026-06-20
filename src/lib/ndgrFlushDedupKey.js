/**
 * ndgrFlushDedupKey.js — NDGR フラッシュ時の重複排除キーを作る純関数(v0.1.836)。
 *
 * 背景(匿名救済): flushNdgrChatRowsBatch の旧キーは `${commentNo}\t${text}` で commentNo 依存。
 * 匿名(184)コメントは番号が付かないことがあり、番号無し行を救うと旧キーでは別人の同一本文
 * (「w」「888」等)が全部衝突して1件に潰れる=せっかく救った匿名コメントを大量ロストする。
 *
 * 行種で分岐:
 *  - 番号あり → `n:${commentNo}\t${text}`(従来と同値の重複排除=既存挙動不変)。
 *  - 番号無し → `a:${userId}\t${text}\t${vpos}`(同一人物=同一 hashedUserId が 同一本文 を 同一位置
 *    で=真の重複だけ潰す。vpos が違えば別コメントとして残す)。
 *
 * 受理は呼び出し側で別途行う(本関数はキー生成のみ・null を返したら受理不可)。
 * userId も番号も無い行は識別不能なので null(=受理しない)。設計正本=council/anon-comment-rescue-SYNTHESIS.md。
 *
 * @param {{ commentNo?: unknown, text: string, userId?: unknown, vpos?: unknown }} row
 * @returns {string|null} 重複排除キー。識別子が無い番号無し行は null。
 */
export function ndgrFlushDedupKey(row) {
  if (!row || typeof row !== 'object') return null;
  const no = String(row.commentNo ?? '').trim();
  const text = typeof row.text === 'string' ? row.text : '';
  if (no) return `n:${no}\t${text}`;
  // 番号無し: 識別子(userId=rawUserId||hashedUserId)が無ければ重複排除も受理もできない。
  const uid = String(row.userId ?? '').trim();
  if (!uid) return null;
  const vpos =
    row.vpos == null || row.vpos === '' ? '' : String(row.vpos).trim();
  return `a:${uid}\t${text}\t${vpos}`;
}
