/**
 * ギフト履歴レーンの「どのデータ源を表示するか」を決める純関数（v0.1.395）。
 *
 * 背景（会議・2026-05-26）: ギフト履歴レーンには 2 系統のデータ源がある。
 *   - iframe 由来（公式サイドバー DOM / nls_gift_history_throws）: 公式の累計pt が正確だが、
 *     **ギフトタブを開いた時しか更新されない**＝タブを閉じると古い値に張り付く。
 *   - NDGR ライブ（nls_gift_events）: コメントと同じ常時接続でギフトが**リアルタイムに届く**
 *     （負荷ゼロ）が、視聴開始前のギフトは取りこぼし得る（途中参加）。
 *
 * ユーザー痛点「ギフト履歴が時間たっても変わらない」の根治には、iframe 由来が**明らかに古い**
 * ときだけ NDGR ライブへ切り替えるのが安全（正確な公式値は新しいうちは保持し、古くなったら
 * 動いている方を見せる）。hot path（NDGR/gift 受信側）には一切触れず、popup の**読み取り側**
 * だけで完結させる（鉄則「NDGR/gift hotpath 非干渉」）。
 *
 * 副作用なし・DOM 非依存。
 */

/**
 * iframe 由来データが「明らかに古い」と判断する閾値（ms）。これを超え、かつライブ側が
 * より新しいときだけライブへ切り替える。短くしすぎると正確な公式値がすぐ捨てられ、長すぎると
 * 古い値が残りやすい。120 秒は「タブを閉じてしばらく」の体感に合わせた値。
 */
export const GIFT_IFRAME_STALE_MS = 120 * 1000;

/**
 * @param {{
 *   iframeAvailable: boolean,   // iframe 由来（giftHistory/throws）に表示可能な行があるか。
 *   iframeCapturedAtMs: number, // iframe 由来データの最新取得時刻（epoch ms・無ければ 0）。
 *   liveAvailable: boolean,     // NDGR ライブ（nls_gift_events）に pt>0 の集計があるか。
 *   liveLatestAtMs: number,     // ライブ側の最新イベント時刻（epoch ms・無ければ 0）。
 *   nowMs: number,              // 現在時刻（epoch ms）。
 *   staleMs?: number,           // iframe を「古い」とみなす閾値（既定 GIFT_IFRAME_STALE_MS）。
 * }} p
 * @returns {'iframe'|'live'|'none'}
 *   'iframe'=iframe 由来を表示 / 'live'=NDGR ライブを表示 / 'none'=どちらも無し。
 */
export function pickGiftHistorySource(p) {
  if (!p || typeof p !== 'object') return 'none';
  const iframeOk = p.iframeAvailable === true;
  const liveOk = p.liveAvailable === true;
  if (!iframeOk && !liveOk) return 'none';
  if (iframeOk && !liveOk) return 'iframe';
  if (!iframeOk && liveOk) return 'live';

  // 両方ある場合: iframe を基本に保ちつつ、iframe が「明らかに古い」かつライブの方が
  // 新しいときだけライブへ切り替える。
  const now = Number(p.nowMs);
  const ic = Number(p.iframeCapturedAtMs);
  const ll = Number(p.liveLatestAtMs);
  const staleMs =
    typeof p.staleMs === 'number' && Number.isFinite(p.staleMs) && p.staleMs > 0
      ? p.staleMs
      : GIFT_IFRAME_STALE_MS;

  // 時刻が信頼できない（iframe の capturedAt 不明）なら、安全側で iframe を維持。
  if (!Number.isFinite(now) || !Number.isFinite(ic) || ic <= 0) return 'iframe';

  const iframeAgeMs = now - ic;
  const liveIsNewer = Number.isFinite(ll) && ll > ic;
  if (iframeAgeMs > staleMs && liveIsNewer) return 'live';
  return 'iframe';
}
