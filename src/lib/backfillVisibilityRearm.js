/**
 * v0.1.633: 過去ログ一括バックフィルの「タブ可視状態に戻った時の再開(rearm)」判定（純ロジック）。
 *
 * 背景（退行の真因・2026-06-05 確定）:
 *   v0.1.621 で「タブ切替で abort された backfill は、可視に戻った次 tick で続きから自動再開」を
 *   入れたが、visibilitychange が devtools 開閉 / focus 移動 / popup 開閉で毎秒級に連発すると
 *   abort→即 restart の無限再起動ループになり trickle しか取れなくなった（v0.1.624 で顕在化）。
 *
 *   v0.1.624 の緩和は「直近の rearm から 30 秒経つまで再開しない」一律クールダウンだったが、
 *   これには重大な副作用があった: rearm タイムスタンプ初期値 0 のため、配信を開いて最初の
 *   hidden で 1 回だけ rearm してタイムスタンプを刻み、以後 30 秒は二度と再開しない。
 *   パネルを開く / フォーカス移動が watch タブの hidden を起こすため、開いた直後 30 秒が
 *   完全沈黙 ＝「以前は一気に取れたのに取れなくなった」退行そのもの（実機 lv350679746:
 *   公式 947 件に対し記録 1 件・取得率 0%）。
 *
 *   本モジュールは一律時間クールダウンを「発火回数ベース ＋ 初回保証」に置き換える:
 *     1. **初回保証**: この liveId でまだ一度も rearm していなければ、常に再開を許可する
 *        （開いた直後の沈黙を作らない）。
 *     2. **発火回数ベース抑制**: 直近 windowMs 以内の visibility_paused 回数が maxPausesInWindow
 *        以上のときだけ抑制する（単発の hidden は即再開・連発ループだけ止める）。
 *
 * @module backfillVisibilityRearm
 */

/** 連発判定の観測窓（ms）。この窓内の visibility_paused 回数で抑制を決める。 */
export const VISIBILITY_REARM_WINDOW_MS = 8_000;
/** 観測窓内にこの回数以上 visibility_paused したら「連発ループ」とみなし抑制する。 */
export const VISIBILITY_REARM_MAX_PAUSES_IN_WINDOW = 3;

/**
 * 直近の visibility_paused タイムスタンプ列から「観測窓内に残っているもの」だけを返す。
 * 呼び出し側は now を push してからこの関数で間引いて保持すると配列が無限に伸びない。
 *
 * @param {number[]} timestamps これまでの visibility_paused 時刻（ms）。
 * @param {number} now 現在時刻（ms）。
 * @param {number} [windowMs=VISIBILITY_REARM_WINDOW_MS] 観測窓（ms）。
 * @returns {number[]} 窓内に残るタイムスタンプ（昇順・元の順序を保つ）。
 */
export function pruneRecentVisibilityPauses(
  timestamps,
  now,
  windowMs = VISIBILITY_REARM_WINDOW_MS
) {
  const list = Array.isArray(timestamps) ? timestamps : [];
  const n = Number(now);
  const w = Number(windowMs);
  if (!Number.isFinite(n) || !Number.isFinite(w) || w <= 0) return [];
  return list.filter((t) => {
    // typeof チェックで null/'x' 等を弾く（Number(null)=0 が窓内にすり抜けるのを防ぐ）。
    if (typeof t !== 'number' || !Number.isFinite(t)) return false;
    return n - t < w;
  });
}

/**
 * 可視に戻った（または hidden で abort された）backfill を「続きから再開してよいか」を判定する。
 *
 * 一律時間クールダウンではなく「初回保証 ＋ 発火回数ベース抑制」で、開いた直後の沈黙を作らずに
 * 連発ループだけ止める。
 *
 * @param {object} args
 * @param {boolean} args.hasRearmedThisLive この liveId で既に一度でも rearm 済みか。
 *   false（＝まだ一度も再開していない）なら初回保証で常に許可する。
 * @param {number[]} args.recentPauseTimestamps 観測窓内に残っている visibility_paused 時刻列
 *   （pruneRecentVisibilityPauses で間引いた後のもの）。今回の now を含めて渡す。
 * @param {number} [args.maxPausesInWindow=VISIBILITY_REARM_MAX_PAUSES_IN_WINDOW]
 *   この回数以上なら連発ループとみなし抑制する。
 * @returns {boolean} true なら one-shot guard を解除して続きから再開してよい。
 */
export function shouldRearmBackfillAfterVisibility(args) {
  // 初回保証: この liveId でまだ一度も再開していないなら、連発判定に関わらず必ず許可する。
  //   これが無いと「開いた直後の最初の hidden でカウンタだけ進み、以後沈黙」になる退行が起きる。
  if (!args?.hasRearmedThisLive) return true;
  const recent = Array.isArray(args?.recentPauseTimestamps)
    ? args.recentPauseTimestamps
    : [];
  const maxInWindow = Number.isFinite(Number(args?.maxPausesInWindow))
    ? Number(args.maxPausesInWindow)
    : VISIBILITY_REARM_MAX_PAUSES_IN_WINDOW;
  // 観測窓内の visibility_paused が閾値未満 ＝ 単発 / 散発なので即再開を許可。
  // 閾値以上 ＝ devtools 開閉等の連発ループなので、このターンは抑制して暴走を止める。
  return recent.length < maxInWindow;
}
