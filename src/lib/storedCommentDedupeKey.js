/**
 * 保存済みコメントの重複判定キーを作る純関数(v0.1.1313)。
 *
 * ★なぜ切り出すか（2026-08-10・「記録が本家コメを101%上回る」の残り火）
 *   popup-entry の重複畳み込みは、commentNo があればそれをキーにする。
 *   問題は【commentNo が無い行】のフォールバックキーで、従来は
 *       `${liveId}|${text}|${capturedAt}`
 *   と【capturedAt(ローカルの取り込み時刻)】を含めていた。
 *
 *   capturedAt は保存済みなら安定だが、テール等から capturedAt 無しで届いた行には
 *   読むたびに `Date.now()` が振られる(popup-entry の正規化)。
 *   ⇒ 同じコメントを別の瞬間に読み直すと【キーが変わり別行として数えられる】＝二重計上。
 *   ★匿名(184)主体の配信では commentNo を持たない行が多く、実際に踏みやすい
 *     (実機の速報でも userId 付与率 47.9%＝匿名主体だった)。
 *
 * ■ 方針
 *   フォールバックキーから capturedAt を外し、`liveId|userId|text` で畳み込む。
 *   ★ただし「同じ人が同じ文言を【本当に】複数回書く」ケースを潰さないよう、
 *     capturedAt を完全に捨てるのではなく【時間バケット】に丸めて含める。
 *     連投の再読み込みは同じバケットに入って畳み込まれ、
 *     数分後の再発言は別バケットになって残る。
 */

import { normalizeCommentText } from './commentRecord.js';
// ★時点の解釈は timeAuthority に一本化する(v0.1.1304 の判定1本化。独自実装を増やさない)。
import { toEpochMs } from './timeAuthority.js';

/**
 * 同一発言とみなす時間幅(ms)。
 * ★読み直しのタイムスタンプ揺れ(秒〜分オーダー)を吸収しつつ、
 *   後日の同一文言の再発言は別行として残す幅。
 */
export const DEDUPE_TIME_BUCKET_MS = 10 * 60 * 1000;

/**
 * 保存済みコメント1行の重複判定キーを返す。
 *
 * @param {{ commentNo?: unknown, liveId?: unknown, userId?: unknown, text?: unknown, capturedAt?: unknown }} entry
 * @param {{ bucketMs?: number }} [opts]
 * @returns {string}
 */
export function storedCommentDedupeKey(entry, opts) {
  const e = entry && typeof entry === 'object' ? entry : {};
  const no = String(e.commentNo ?? '').trim();
  // commentNo は公式が振る一意番号＝あるならこれだけで確定。
  if (/^\d+$/.test(no)) return `no:${no}`;

  const liveId = String(e.liveId ?? '').trim().toLowerCase();
  const text = normalizeCommentText(e.text ?? '');
  const userId = String(e.userId ?? '').trim();

  const bucketMs =
    Number.isFinite(Number(opts?.bucketMs)) && Number(opts?.bucketMs) > 0
      ? Number(opts?.bucketMs)
      : DEDUPE_TIME_BUCKET_MS;
  // ★時点の解釈は timeAuthority.toEpochMs に委ねる(取れなければ 0)。独自の数値判定を書かない。
  const cap = toEpochMs(e.capturedAt);
  // ★capturedAt をそのまま入れない(読み直しで変わるため)。バケットに丸める。
  const bucket = cap > 0 ? Math.floor(cap / bucketMs) : 0;

  return `t:${liveId}|${userId}|${text}|${bucket}`;
}
