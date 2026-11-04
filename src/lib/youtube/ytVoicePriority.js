// ytVoicePriority.js — YouTube 版の会場の読み上げで、混んでいるときに「大事なコメント」だけを読むための純関数。
//   2026-11-04 りんく決定「混んだら大事なものだけ」(全部は読めない量の配信で、配信者に大事なコメントを確実に読む)。
//   大事なもの = スーパーチャット・ステッカー・メンバー加入/ギフト・YouTube のギフト・配信者/モデレーター・その配信で初めてのコメント。
//   ほかのコメントは、混んでいるときは吹き出しだけにする(読み上げの列には入れない)。

const IMPORTANT_KINDS = new Set(['superchat', 'sticker', 'membership', 'membership_gift', 'yt_gift']);
const IMPORTANT_BADGES = new Set(['owner', 'moderator']);

/** 読み上げの列にこの件数以上たまっていたら「混んでいる」。静かな配信は今までどおり全部読む。 */
export const YT_VOICE_CROWD_QUEUE = 2;

/**
 * 1件のコメントが大事か。
 * @param {{ kind?: unknown, badges?: unknown }} row YouTube の記録(1件)
 * @param {boolean} firstOfUser その配信でこの人の初めてのコメントか
 * @returns {boolean}
 */
export function ytIsImportantVoiceRow(row, firstOfUser) {
  return ytImportantVoiceReason(row, firstOfUser) !== '';
}

/**
 * 大事な理由(計器用)。大事でなければ ''。
 * @param {{ kind?: unknown, badges?: unknown }} row
 * @param {boolean} firstOfUser
 * @returns {'' | 'kind' | 'badge' | 'first'}
 */
export function ytImportantVoiceReason(row, firstOfUser) {
  if (row && typeof row === 'object') {
    if (IMPORTANT_KINDS.has(String(row.kind || ''))) return 'kind';
    const badges = Array.isArray(row.badges) ? row.badges.map((b) => String(b || '').toLowerCase()) : [];
    if (badges.some((b) => IMPORTANT_BADGES.has(b))) return 'badge';
  }
  return firstOfUser ? 'first' : '';
}

/**
 * 記録の並び(古い→新しい)から、大事なコメントの印を付ける。
 * @param {ReadonlyArray<any>} rows
 * @param {(row: any) => string} personKeyOf 人を見分けるキー
 * @returns {boolean[]} rows と同じ並びの「大事か」
 */
export function ytMarkImportantVoiceRows(rows, personKeyOf) {
  return ytImportantVoiceReasons(rows, personKeyOf).map((r) => r !== '');
}

/**
 * ytMarkImportantVoiceRows の理由つき版(計器用)。
 * @param {ReadonlyArray<any>} rows
 * @param {(row: any) => string} personKeyOf
 * @returns {Array<'' | 'kind' | 'badge' | 'first'>}
 */
export function ytImportantVoiceReasons(rows, personKeyOf) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const k = String(personKeyOf(r) || '');
    const first = !!k && !seen.has(k);
    if (k) seen.add(k);
    return ytImportantVoiceReason(r, first);
  });
}

/**
 * 混んでいるときに読み上げの列へ入れるか。
 * @param {{ important: boolean, queueLength: number }} s
 * @returns {boolean}
 */
export function ytShouldVoiceWhenCrowded(s) {
  if (s.important) return true;
  return !(Number(s.queueLength) >= YT_VOICE_CROWD_QUEUE);
}
