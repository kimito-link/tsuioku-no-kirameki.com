/**
 * 会場の PICK UP を「声が鳴り始めたコメント」に合わせる判定(純粋)。
 *
 * 読み上げ ON のとき、枠はコメントが届いた瞬間や声の作成の開始では切り替えない。
 * 実際に音が出た件だけを出す。読まずに捨てた件は出さない。
 * 読み上げ OFF のときの選び方(届いた発言から点数で選ぶ)はこのファイルでは触らない。
 * @module venuePickupPlayback
 */

/**
 * 声が鳴り始めた1件を、枠の表示関数が受け取れる形にする。本文が空なら出さない。
 * @param {{ text?: unknown, name?: unknown, userId?: unknown, key?: unknown, speaker?: unknown }|null|undefined} speech
 * @returns {{ why: 'spoken', entry: { text: string, name: string, userId: string, key: string, kind: string, speaker: any } }|null}
 */
export function spokenPickupPicked(speech) {
  const text = String(speech?.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const speaker = speech?.speaker && typeof speech.speaker === 'object' ? speech.speaker : null;
  return {
    why: 'spoken',
    entry: {
      text,
      name: String(speech?.name ?? '').trim(),
      userId: String(speech?.userId ?? '').trim(),
      key: String(speech?.key ?? '').trim(),
      kind: 'comment',
      speaker
    }
  };
}

/**
 * もう片方のページ(会場とコメビュ)へ渡す「今鳴っているコメント」。
 * 配信 id が空のときは渡さない(別の配信の枠を書き換えない)。
 * @param {{ text?: unknown, name?: unknown, userId?: unknown, key?: unknown }|null|undefined} speech
 * @param {unknown} liveId
 * @param {number} at
 * @returns {{ text: string, name: string, userId: string, key: string, liveId: string, at: number }|null}
 */
export function buildVoiceNowPlaying(speech, liveId, at) {
  const text = String(speech?.text ?? '').replace(/\s+/g, ' ').trim();
  const id = String(liveId || '').trim().toLowerCase();
  if (!text || !id) return null;
  return {
    text,
    name: String(speech?.name ?? '').trim(),
    userId: String(speech?.userId ?? '').trim(),
    key: String(speech?.key ?? '').trim(),
    liveId: id,
    at: Number(at) || 0
  };
}

/**
 * もう片方のページから届いた「今鳴っているコメント」を、この配信の枠に出してよいか。
 * 配信が違う・本文が空・古すぎるものは出さない。
 * @param {any} record
 * @param {unknown} liveId
 * @param {number} now
 * @param {number} [maxAgeMs]
 * @returns {{ text: string, name: string, userId: string, key: string }|null}
 */
export function acceptVoiceNowPlaying(record, liveId, now, maxAgeMs = 30000) {
  if (!record || typeof record !== 'object') return null;
  const here = String(liveId || '').trim().toLowerCase();
  const there = String(record.liveId || '').trim().toLowerCase();
  if (!here || !there || here !== there) return null;
  const at = Number(record.at);
  if (at > 0 && Number.isFinite(now) && now - at > maxAgeMs) return null;
  const text = String(record.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return {
    text,
    name: String(record.name ?? '').trim(),
    userId: String(record.userId ?? '').trim(),
    key: String(record.key ?? '').trim()
  };
}
