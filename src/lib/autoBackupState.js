// autoBackupState.js
// v0.1.808(星野ロミ式コンポーネント化・第1弾): content-entry.js の巨大化を抑えるため、
//   auto-backup 状態の正規化/剪定を純関数として抽出(挙動完全不変・state は引数化)。
//   正本=council/hoshinoromi-componentize-factor-SYNTHESIS.md。
//
// normalizeAutoBackupState は元から完全な純関数(引数 raw のみ・DOM/chrome/モジュール変数を参照しない)。
// pruneAutoBackupLives は元はモジュール定数 AUTO_BACKUP_LIVES_MAX を参照していたので、第2引数 maxKeep に
//   依存注入する(呼び出し側 content-entry が定数を渡す)=会議の批判役が指摘した『state 引数化ミスの罠』を
//   構造的に回避する(純関数なので隠れ依存が存在しない)。

/**
 * @typedef {{ liveId: string, commentCount: number, updatedAt: number, lastCommentAt: number,
 *   watchUrl: string, lastBackupAt: number, lastBackedUpdatedAt: number, lastBackupCount: number }} AutoBackupLive
 */

/**
 * auto-backup 状態(storage 由来の生値)を正規化する。
 * 非オブジェクト/欠損は安全側(空 lives)へ・lid は小文字 trim・数値は max(0, Number||0)。
 * @param {unknown} raw
 * @returns {{ lives: Record<string, AutoBackupLive> }}
 */
export function normalizeAutoBackupState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawLives =
    src &&
    typeof src === 'object' &&
    'lives' in src &&
    /** @type {{ lives?: unknown }} */ (src).lives &&
    typeof /** @type {{ lives?: unknown }} */ (src).lives === 'object'
      ? /** @type {Record<string, unknown>} */ (/** @type {{ lives: unknown }} */ (src).lives)
      : {};
  /** @type {Record<string, AutoBackupLive>} */
  const lives = {};
  for (const [liveId, meta] of Object.entries(rawLives)) {
    const lid = String(liveId || '').trim().toLowerCase();
    if (!lid) continue;
    const row = /** @type {Record<string, unknown>} */ (
      meta && typeof meta === 'object' ? meta : {}
    );
    lives[lid] = {
      liveId: lid,
      commentCount: Math.max(0, Number(row.commentCount) || 0),
      updatedAt: Math.max(0, Number(row.updatedAt) || 0),
      lastCommentAt: Math.max(0, Number(row.lastCommentAt) || 0),
      watchUrl: String(row.watchUrl || '').trim(),
      lastBackupAt: Math.max(0, Number(row.lastBackupAt) || 0),
      lastBackedUpdatedAt: Math.max(0, Number(row.lastBackedUpdatedAt) || 0),
      lastBackupCount: Math.max(0, Number(row.lastBackupCount) || 0)
    };
  }
  return { lives };
}

/**
 * lives が maxKeep を超えたら、最近性(max(updatedAt, lastBackupAt))の降順で上位 maxKeep 件に剪定する。
 * state を in-place で更新して返す(呼び出し側は従来どおり戻り値/同一参照のどちらでも使える)。
 * @param {{ lives: Record<string, AutoBackupLive> }} state
 * @param {number} maxKeep 保持上限(content-entry の AUTO_BACKUP_LIVES_MAX を注入)
 * @returns {{ lives: Record<string, AutoBackupLive> }}
 */
export function pruneAutoBackupLives(state, maxKeep) {
  const limit = Number.isFinite(maxKeep) ? Math.max(0, Math.floor(maxKeep)) : 0;
  const entries = Object.entries(state?.lives || {});
  if (entries.length <= limit) return state;
  entries.sort((a, b) => {
    const aAt = Math.max(Number(a[1]?.updatedAt) || 0, Number(a[1]?.lastBackupAt) || 0);
    const bAt = Math.max(Number(b[1]?.updatedAt) || 0, Number(b[1]?.lastBackupAt) || 0);
    return bAt - aAt;
  });
  state.lives = Object.fromEntries(entries.slice(0, limit));
  return state;
}
