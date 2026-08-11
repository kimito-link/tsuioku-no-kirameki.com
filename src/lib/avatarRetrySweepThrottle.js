/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】アイコン再プローブ掃引の「いま実行してよいか」の間引き判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】掃引の最小間隔(min-gap)の値と判定はこのファイルのみ。他所で数値を直書きしない
 *
 * ★なぜ popup でも再試行を有効にしたか(venue-avatar-stale-mirror-DESIGN.md §E
 *   「段階3の判断」の答え・ここが正本)
 *   設計当時は「popup側は既定null(恒久負キャッシュ)のまま」と保留していた。
 *   その判断材料が 2026-08-12 の実機で揃った:
 *     アイコン画像が 6 件読み込めていません(成功 18 件・失敗率 25%)
 *     retriedTotal: 0   ← ★一度も再試行していない
 *   ＝CDN の一時的な不調で失敗した URL が【永久に】灰色の丸のまま固着する。
 *   ユーザー報告「会場モードのサムネがなくなるの何回も起こる」の popup 版がこれ。
 *
 *   恒久負キャッシュが正当化できるのは「404=本当に未設定」の場合だけ。だが実際の
 *   失敗には timeout / 5xx / 一時的な接続断が混ざる(failedTimeout と failedError を
 *   分けて数えているのはそのため)。混ざっている以上、一度の失敗で永久に諦めるのは
 *   強すぎる。★TTL+指数バックオフがあるので、本当に404の人を何度も叩くことはない。
 *
 * ★なぜ切り出したか(2026-08-12・v0.1.1338)
 *   popup-entry.js が max-lines(22,119行)に到達し、この機能を足せなくなった。
 *   上限を上げるのは「22,000行になった原因」そのものなので採らない。
 *   判定は純粋関数なので lib へ出せる=会場・popup の両方から同じ判定を使える
 *   ([[shared-helper-hides-canonical-bugs]] の逆で、これは【判定の共有】が正しい例:
 *    面ごとに間隔がズレると「片方だけ直らない」が再発する)。
 *
 * @module avatarRetrySweepThrottle
 */

/**
 * 掃引の最小間隔。会場の diagDue(venueBar.js の3秒 min-gap)と同じ値に揃える。
 *
 * ★揃える理由: 面ごとに間隔が違うと「会場では直るが popup では直らない」という
 *   観測しにくい差になる。読み上げで実際に踏んだ「片肺」と同型。
 */
export const AVATAR_RETRY_SWEEP_MIN_GAP_MS = 3000;

/**
 * いま掃引を実行してよいか(前回からの経過で判定する)。
 *
 * ★popup は storage_changed で高頻度に再描画される(実測: 1コメントあたり最大30回)。
 *   素で毎回掃引すると hot path を痛めるので、必ずこの判定を通す。
 *
 * @param {unknown} lastAtMs 前回実行時刻(ms)。未実行なら 0 / null など
 * @param {unknown} nowMs 現在時刻(ms)
 * @param {{ minGapMs?: unknown }} [opts]
 * @returns {boolean} 実行してよければ true
 */
export function shouldSweepAvatarRetry(lastAtMs, nowMs, opts = {}) {
  const now = Number(nowMs);
  if (!Number.isFinite(now) || now <= 0) return false;
  const last = Number(lastAtMs);
  const lastSafe = Number.isFinite(last) && last > 0 ? last : 0;
  const gapRaw = Number(opts?.minGapMs);
  const gap = Number.isFinite(gapRaw) && gapRaw >= 0 ? gapRaw : AVATAR_RETRY_SWEEP_MIN_GAP_MS;
  // 未実行(0)なら即実行してよい=初回の失敗を次の描画で拾える。
  if (lastSafe <= 0) return true;
  // 時計が巻き戻った場合(now < last)は実行を許す=永久に掃引されない事故を防ぐ。
  if (now < lastSafe) return true;
  return now - lastSafe >= gap;
}
