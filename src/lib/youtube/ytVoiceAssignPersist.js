/**
 * YouTube 系(YouTube・Twitch・Kick ほか)の「人ごとの声の割り当て」(yt_voice_assignments)を
 * chrome.storage へ書く間隔を決める(v0.1.1968)。
 *
 * ★経緯(PC 実測 0.1.1967・Kick 約5.5万行): 記録係はコメントの束ごとに、変わっていなくても
 *   割り当て全体(約340KB)を書き直していた。chrome.storage.onChanged は拡張の全ページへ新旧の値を
 *   配るので、横の欄だけで 125秒に59回・約40MB(onChanged 全体の93%)を受け取り、メインスレッドが数分止まった。
 *   割り当ては userKey からの決定論的な計算(assignVoiceForUser)の控えなので、書き込みが少し遅れても
 *   声は変わらない(service worker が眠って書き損ねても、同じ声の候補なら同じ声が計算し直される)。
 *   → 変わったときだけ、かつ最短 YT_VOICE_ASSIGN_PERSIST_MS に1回だけ書く。
 */
export const YT_VOICE_ASSIGN_PERSIST_MS = 30000;

/**
 * いま書くか / 後で書くか / 書かないか。
 * @param {{ dirty: boolean, lastWrittenAt: number, now: number, minGapMs?: number }} s
 * @returns {'now' | 'later' | 'none'}
 */
export function ytVoiceAssignPersistDecision(s) {
  if (!s || !s.dirty) return 'none';
  const gap = Number.isFinite(s.minGapMs) ? Number(s.minGapMs) : YT_VOICE_ASSIGN_PERSIST_MS;
  const last = Number(s.lastWrittenAt) || 0;
  const now = Number(s.now) || 0;
  return now - last >= gap ? 'now' : 'later';
}
