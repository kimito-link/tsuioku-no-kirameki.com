/**
 * コメントの沈黙ゾーン検出（連続 X 秒以上のコメ無し区間）+ L2 沈黙の質判定。
 *
 * 設計（0.1.22 W: マーケ分析有料コア / ラテラル思考 L2）:
 *   "沈黙 = 悪" と決めつけず、沈黙後すぐに反応が爆発する場合は
 *   「配信者の話芸が効いた瞬間（=engaged）」と分類する。
 *
 *   quality:
 *     - 'engaged'  … 沈黙後 windowMs 以内に 5 コメ以上 → ガン見系
 *     - 'departed' … 沈黙後 windowMs 以内に 0-1 コメ → 離脱系
 *     - 'neutral'  … 2-4 コメ
 *     - 'unknown'  … quality 判定オフ時
 */

/**
 * @typedef {{ capturedAt?: any, text?: any }} SilenceCommentInput
 */

/**
 * @typedef {{
 *   startAt: number,
 *   endAt: number,
 *   durationMs: number,
 *   quality: 'engaged' | 'departed' | 'neutral' | 'unknown',
 *   afterCount: number,
 *   beforeText: string,
 *   afterText: string
 * }} CommentSilenceZone
 */

/**
 * @param {SilenceCommentInput[]} comments
 * @param {{ thresholdMs?: number, quality?: { windowMs?: number } }} [opts]
 * @returns {CommentSilenceZone[]}
 */
export function detectCommentSilenceZones(comments, opts = {}) {
  const list = Array.isArray(comments) ? comments : [];
  const threshold =
    typeof opts.thresholdMs === 'number' && opts.thresholdMs > 0
      ? opts.thresholdMs
      : 60_000;
  const qualityCfg = opts.quality;
  const qualityWindowMs =
    qualityCfg && typeof qualityCfg.windowMs === 'number' && qualityCfg.windowMs > 0
      ? qualityCfg.windowMs
      : 0;

  // 破損データ除外 + capturedAt 昇順にソート（破壊しない）。
  const valid = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const at = c.capturedAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
    valid.push(c);
  }
  valid.sort(
    (a, b) =>
      /** @type {number} */ (a.capturedAt) - /** @type {number} */ (b.capturedAt)
  );
  if (valid.length < 2) return [];

  /** @type {CommentSilenceZone[]} */
  const zones = [];
  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1];
    const cur = valid[i];
    const prevAt = /** @type {number} */ (prev.capturedAt);
    const curAt = /** @type {number} */ (cur.capturedAt);
    const gap = curAt - prevAt;
    if (gap < threshold) continue;

    /** @type {CommentSilenceZone['quality']} */
    let quality = 'unknown';
    let afterCount = 0;

    if (qualityWindowMs > 0) {
      // 沈黙終わり (curAt) から windowMs 以内に何コメあるか（cur 自身も含む）
      const windowEnd = curAt + qualityWindowMs;
      for (let j = i; j < valid.length; j++) {
        const at = /** @type {number} */ (valid[j].capturedAt);
        if (at > windowEnd) break;
        afterCount += 1;
      }
      if (afterCount >= 5) quality = 'engaged';
      else if (afterCount <= 1) quality = 'departed';
      else quality = 'neutral';
    }

    zones.push({
      startAt: prevAt,
      endAt: curAt,
      durationMs: gap,
      quality,
      afterCount,
      beforeText: String(prev.text || '').slice(0, 60),
      afterText: String(cur.text || '').slice(0, 60)
    });
  }
  return zones;
}
