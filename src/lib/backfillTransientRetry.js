/**
 * v0.1.431: 過去ログ一括バックフィルの「一過性 stop での自動リトライ」判定（純ロジック）。
 *
 * 背景（実機 lv350625305 等で観測）:
 *   過去ログの入口探し（NDGR backward URI 探索）が、押したタイミングによっては一時的に
 *   空振りする（`?at=now` 直後で過去がまだ封済み化していない／view URI がローテート直後 等）。
 *   その結果 `backward_exhausted` 等で seg=0 のまま終わり、one-shot guard（_backfillTriedLiveId）
 *   で二度と自動再試行されず、記録が 11% 等の途中で固定されていた。UI も「少し経ってから
 *   もう一度押すと取れることがある」と案内している＝これを自動化する。
 *
 *   ただし無限・無駄な再試行は避ける: 完了(reached_start)/やり切り(no_progress, cap_*)/
 *   意図的中断(aborted)では再試行しない。一過性と分かっている stop だけ、回数上限つきで
 *   再試行する。隠れタブや自動取り込み OFF では再試行しない（呼び出し側で条件を渡す）。
 *
 * @module backfillTransientRetry
 */

/**
 * 「もう一度やれば取れることがある（一過性）」stop の集合。これ以外は再試行しない。
 * @type {ReadonlySet<string>}
 */
export const BACKFILL_TRANSIENT_STOP_REASONS = new Set([
  'backward_exhausted',
  'no_entry',
  'no_view_base',
  'rate_limited',
  // v0.1.467: 時間 cap（15分）は「続きがある長尺配信で時間が足りなかっただけ」なので
  //   一過性扱いにして続きから再試行する。cap_rows/cap_bytes は容量ガードで再試行しない。
  'cap_elapsed'
]);

/**
 * v0.1.658「一気に取れない(59%停止)」根治: no_progress は本来「やり切り」扱いで自動リトライ
 *   対象外だったが、実機(公式4355/記録2548=59%)で「疎なコメント区間で no_progress になり、
 *   その先にまだ大量のコメントがあるのに固定される」事象が頻発。official 件数に大きく届いて
 *   いない no_progress は「疎区間で一時的に進めなかっただけ」とみて、回数上限つきで続きから
 *   自動リトライする。official に十分近い(95%超)no_progress は本当に取り切ったとみてリトライ
 *   しない(無限ループ防止)。判定は shouldScheduleBackfillTransientRetry に recordedCount/
 *   officialCount を渡して行う。
 * @type {ReadonlySet<string>}
 */
export const BACKFILL_GAP_RETRY_STOP_REASONS = new Set(['no_progress']);

/** official に対しこの割合未満なら「まだ続きがある」とみて no_progress でも再試行する。 */
export const BACKFILL_GAP_RETRY_COVERAGE = 0.95;

/**
 * バックフィル終了後、一過性 stop として自動リトライをスケジュールすべきかを判定する。
 *
 * @param {object} args
 * @param {string} args.stopReason 直近の巡回の stop 理由。
 * @param {number} args.retriedCount この liveId で既に自動リトライした回数。
 * @param {number} args.maxRetries 自動リトライ上限。
 * @param {boolean} args.autoEnabled 自動取り込みが ON か。
 * @param {boolean} args.tabHidden タブが現在 hidden か（hidden なら叩かない）。
 * @param {number} [args.recordedCount] v0.1.658: 現在の記録件数（no_progress の gap 判定用）。
 * @param {number} [args.officialCount] v0.1.658: 公式コメント件数（no_progress の gap 判定用）。
 * @returns {boolean} true なら「一定時間後に one-shot guard を解除して再試行」してよい。
 */
export function shouldScheduleBackfillTransientRetry(args) {
  const stopReason = String(args?.stopReason || '');
  const retriedCount = Number(args?.retriedCount);
  const maxRetries = Number(args?.maxRetries);
  if (!args?.autoEnabled) return false;
  if (args?.tabHidden) return false;

  // v0.1.658: no_progress でも、official に大きく届いていなければ「疎区間で進めなかっただけ・
  //   まだ続きがある」とみて回数上限つきで再試行する(59%停止の救済)。
  if (BACKFILL_GAP_RETRY_STOP_REASONS.has(stopReason)) {
    const rec = Number(args?.recordedCount);
    const off = Number(args?.officialCount);
    // official が不明 or 0 のときは判定できない＝従来どおり再試行しない(誤った無限ループ回避)。
    if (!Number.isFinite(off) || off <= 0) return false;
    if (!Number.isFinite(rec) || rec < 0) return false;
    // official に十分近い(95%超)なら取り切ったとみて再試行しない。
    if (rec >= off * BACKFILL_GAP_RETRY_COVERAGE) return false;
    // gap が大きい no_progress は続きがあるとみて再試行(回数上限は守る=無限ループ防止)。
    if (!Number.isFinite(retriedCount) || !Number.isFinite(maxRetries)) return false;
    if (retriedCount >= maxRetries) return false;
    return true;
  }

  if (!BACKFILL_TRANSIENT_STOP_REASONS.has(stopReason)) return false;
  // cap_elapsed は「長尺配信で時間が足りなかっただけ」なので回数制限なしで続ける。
  // 他の一過性 stop（入口探し失敗等）は上限を守って無限ループを防ぐ。
  if (stopReason !== 'cap_elapsed') {
    if (!Number.isFinite(retriedCount) || !Number.isFinite(maxRetries)) return false;
    if (retriedCount >= maxRetries) return false;
  }
  return true;
}
