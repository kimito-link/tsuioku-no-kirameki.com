/**
 * v0.1.765「最終系(a): 入口が死んだ時だけ forward crawl を起動して再接続」の判定(純ロジック)。
 *
 * 背景(最強モード会議+実機 fastDiag で確定・正本=[[reference_backfill_reconnect_meeting_2026-06-16]]):
 *   backfill も realtime も「プレイヤーが叩く NDGR fetch を横から傍受」する受動アーキ。プレイヤーの
 *   NDGR ストリームが切れると拡張の受信も止まり、過去を遡る入口 URL(view token)の新しいものが
 *   観測されなくなる。token は数分でローテーションするので、古い token では過去ログが 0 件しか
 *   返らず「再接続待ち」のまま永久に増えない(実機: ndgrLastReceivedAgo 11分・seg:0 rows:0
 *   backward_exhausted・backfill 取り込み 0 件)。
 *
 * 会議の全会一致+司令塔裏取りの最終系=拡張が能動的に NDGR を独立 long-poll(ndgrForwardCrawl)する。
 *   forward が走ると、その fetch が page-intercept を通り observeNdgrViewUri→最新 token を維持し続け、
 *   backfill は常に生きた入口を持つ(自己持続)。本関数は段階導入の (a)on-demand: 「入口が死んでいる」
 *   と判定したときだけ forward を起動する最小トリガ(常時 ON=(b)は実機検証後)。
 *
 * 純関数(I/O しない。呼び出し側が状態を渡す)。「無駄打ちしない」=本当に死んでいるときだけ true。
 *
 * @module forwardReactivation
 */

/**
 * NDGR の入口が「死んでいる(=forward で能動再取得すべき)」かを判定する。
 *
 * 「コメントは来ているが入口だけ古い/全部切れた」=死、と「本当に遡り切った」=正常終了、を区別する。
 *   死の署名(実機 fastDiag)= ①NDGR 受信が一定時間途絶えている(lastReceivedAgoMs が大) かつ
 *   ②backfill が seg:0 / rows:0(この巡回で1件も取れず)で backward_exhausted/no_entry/no_view_base
 *   で終わっている かつ ③まだ公式とのギャップが残っている(records << official)。
 *   一方、rows>0 で遡れた末の backward_exhausted は「本当に遡り切った」=死ではない(false)。
 *
 * @param {object} args
 * @param {number} args.ndgrLastReceivedAgoMs NDGR から最後に受信してからの経過 ms(大きいほど切断疑い)。
 * @param {number} args.staleThresholdMs 受信途絶を「切断」とみなすしきい(例 120_000)。
 * @param {string} args.backfillStopReason 直近の backfill 停止理由。
 * @param {number} args.backfillSegThisRun 直近巡回で辿った区画数(seg)。
 * @param {number} args.backfillRowsThisRun 直近巡回で取れた行数(rows)。
 * @param {number} args.recordedCount 実記録総数。
 * @param {number} args.officialCount 公式コメント数(分母)。
 * @param {boolean} [args.forwardAlreadyRunning] forward が既に走っているなら起動不要(false)。
 * @returns {boolean} true なら「入口が死んでいる」= forward を起動して新鮮な入口を取り戻すべき。
 */
export function shouldActivateForwardForDeadEntry(args) {
  if (!args) return false;
  // 既に forward が走っているなら、それが入口を維持するので再起動不要。
  if (args.forwardAlreadyRunning) return false;

  // ① NDGR 受信が途絶えている(切断疑い)。新鮮に受信できているなら入口は生きている=触らない。
  const ago = Number(args.ndgrLastReceivedAgoMs);
  const threshold = Number(args.staleThresholdMs);
  if (!Number.isFinite(ago) || !Number.isFinite(threshold) || threshold <= 0) return false;
  if (ago < threshold) return false;

  // ② backfill が「入口で 0 件のまま終わった」署名。rows>0 で遡れたなら『本当に遡り切った』=死でない。
  const reason = String(args.backfillStopReason || '');
  const deadReasons = new Set(['backward_exhausted', 'no_entry', 'no_view_base']);
  if (!deadReasons.has(reason)) return false;
  const seg = Number(args.backfillSegThisRun) || 0;
  const rows = Number(args.backfillRowsThisRun) || 0;
  if (seg > 0 || rows > 0) return false; // 1区画でも辿れた=入口は生きていた=死でない

  // ③ まだ公式とのギャップが残っている(取り切っていない)。実質達成済みなら再取得不要。
  const recorded = Number(args.recordedCount);
  const official = Number(args.officialCount);
  if (!Number.isFinite(official) || official <= 0) return false;
  const rec = Number.isFinite(recorded) && recorded >= 0 ? recorded : 0;
  // 公式の 95% 以上取れているなら実質達成=死とみなさない(残りは gift/system 等の差の可能性)。
  if (rec >= official * 0.95) return false;

  return true;
}

/** 受信途絶を「切断」とみなす既定しきい(ms)。実機 fastDiag の 11分に対し、十分早く検知しつつ
 *  一時的な疎区間で誤発火しない 120 秒。 */
export const FORWARD_REACTIVATION_STALE_MS = 120_000;
