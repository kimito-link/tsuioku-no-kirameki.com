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
 * v0.1.665「長尺配信が71%等で止まったまま」根治: リトライ/再アーム予算(7回/40回)を
 *   回復してよいかの判定。
 *
 * 真因(実機 2026-06-10・公式1263/記録899=71.2%で前面なのに永久停止):
 *   _backfillTransientRetryByLiveId(上限7)と _backfillGapRearmByLiveId(上限40・36s間隔
 *   ≒24分ぶん)は liveId 単位の【生涯予算】で、巡回が進捗しても減ったまま戻らなかった。
 *   3時間級の疎区間配信は「止まる→自動再開→前進→また止まる」を何十回も繰り返すため
 *   途中で予算が尽き、以後は gap が大きく残っていても二度と自動再開されず固定された。
 *
 * 設計: 上限は「連続空振り(全く取れない巡回の繰り返し)」を止めるための予算であって、
 *   前進している限り消費し続けるべきものではない。rows>0=その巡回で実際に区画を取れた
 *   なら予算を全回復する。真に取れない配信(入口不全等)は rows=0 の巡回が続くので
 *   従来どおり 7回/40回で有界=暴走防止は不変。
 *
 * @param {object} args
 * @param {number} args.rowsThisRun この巡回で取得した行数(_backfillProgress.rows)。
 * @returns {boolean} true なら liveId のリトライ/再アーム予算カウンタを 0 に戻してよい。
 */
export function shouldResetBackfillRetryBudgetAfterRun(args) {
  const rows = Number(args?.rowsThisRun);
  return Number.isFinite(rows) && rows > 0;
}

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
 * @param {number} [args.rows] v0.1.692: この巡回で取得した行数（aborted 一発死の再試行判定用）。
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

  // v0.1.692: aborted は従来一律リトライ対象外だったが、rows=0(その巡回で1行も取れずに死んだ)
  //   なら一過性の一発死とみて回数上限つきで再試行する(実機: 状態ページ「完了・取得0件・
  //   停止理由=aborted」のまま放置される事象の救済)。rows>0 の aborted はユーザー操作による
  //   中断や正常な部分取得の可能性があるので従来どおり再試行しない。rows 未指定(旧呼び出し)も
  //   従来どおり再試行しない(後方互換)。上限カウンタは既存の retriedCount/maxRetries に乗る。
  if (stopReason === 'aborted') {
    if (Number(args?.rows) !== 0) return false;
    if (!Number.isFinite(retriedCount) || !Number.isFinite(maxRetries)) return false;
    if (retriedCount >= maxRetries) return false;
    return true;
  }

  // v0.1.750「半分(47%)で stalled 固着」根治: stalled は従来どちらの STOP_REASONS 集合にも無く、
  //   ここまで素通りして false=再試行しなかった。だが stalled は content 側 60秒ウォッチドッグが
  //   「巡回は走っている(_backfillAbort!=null=スロット確保済)のに seg=0/rows=0 のまま入口で固まる」
  //   ときに立てる stop で、まさに【一過性の入口失敗】である(真因: cold-seek が遅い NDGR で
  //   COLD_RETRY_MAX 予算を回し切る前に 60秒を超え、clean な backward_exhausted を立てる前に
  //   abort される)。再試行に乗っていなかったため、ウォッチドッグの素の _backfillTriedLiveId=''
  //   再入が同じ遅い cold-seek を反復＝60秒ごとの無限ループ・rows=0 のまま半分で固着していた。
  //   aborted+rows=0(v0.1.692) と同型に扱う: rows=0(1行も取れず入口で固着)だけを一過性とみて
  //   backoff(指数+ジッタ)+回数上限つきで再試行に乗せる。これで「同じ場所を即再入」でなく
  //   「少し待って新鮮な ?at=now から仕切り直す」になり、tight な 60秒ループを断つ。
  //   rows>0 の stalledMidRun(途中ハング)は既に前進があり resumeFromVpos / gap-catchup で
  //   続きから再開されるので、ここで二重に予算消費させない(rows!=0 は false)。rows 未指定(旧
  //   呼び出し)も後方互換で false。上限は既存 retriedCount/maxRetries に乗る=暴走防止は不変。
  if (stopReason === 'stalled') {
    if (Number(args?.rows) !== 0) return false;
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
