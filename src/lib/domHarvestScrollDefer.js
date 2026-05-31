/**
 * 「ユーザーが今まさにスクロール中か」を判定して、コメントの DOM ハーベスト
 * （MutationObserver 由来の重い走査）を一時的に見送ってよいかを返す純関数。
 *
 * なぜ必要か:
 *   流速の速い・長尺の配信では niconico のコメント仮想リストがスクロール中に
 *   大量の childList / characterData ミューテーションを発火する。MutationObserver
 *   コールバックはそれらを1件ずつ処理（特に characterData の closest 遡上）するため、
 *   スクロール中にメインスレッドを奪い、ホイール入力が落ちて「ガクつき」になる
 *   （v0.1.454 で img bind は対策済みだが、レコード走査自体は残っていた）。
 *
 *   コメントの一次取得は NDGR 傍受、取りこぼし回収は 550ms 間隔の
 *   scanVisibleCommentsNow（パネル全体を dedupe 付きで再ハーベスト）が担う。
 *   よってスクロール中だけ DOM ハーベストを見送っても記録は欠落しない。
 *
 * @param {number} now 現在時刻（epoch ms）
 * @param {number} lastUserScrollAt ユーザー起点スクロールの最後の時刻（epoch ms）
 * @param {number} activeWindowMs この時間内に直近スクロールがあれば「スクロール中」とみなす
 * @returns {boolean} true = ハーベストを見送ってよい（スクロール中）
 */
export function shouldDeferDomHarvestDuringScroll(now, lastUserScrollAt, activeWindowMs) {
  const t = Number(now);
  const last = Number(lastUserScrollAt);
  const win = Number(activeWindowMs);
  // 引数が不正なら「見送らない」（＝従来どおり処理する）安全側に倒す。
  if (!Number.isFinite(t) || !Number.isFinite(last) || !Number.isFinite(win)) {
    return false;
  }
  if (win <= 0) return false;
  if (last <= 0) return false; // まだ一度もスクロールしていない
  const elapsed = t - last;
  // 未来時刻（時計ずれ）など負の経過は「スクロール直後」とはみなさない。
  if (elapsed < 0) return false;
  return elapsed < win;
}
