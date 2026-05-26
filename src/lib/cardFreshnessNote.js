/**
 * カードの「鮮度」表示（最終更新からの経過）を作る純関数。
 *
 * 背景（2026-05-26 会議）: ユーザーが「数字が変わってるか不安／時間が経っても変わらない」と
 * 感じる痛点に対し、各カードに「最終更新: ○秒前・自動更新中」を出して鮮度を可視化する。
 * 公式パネル（3秒）・貢献度/広告（30秒・API 自動）は既に勝手に更新されているので、
 * それが「見える」だけで体感が大きく改善する（会議結論 C: 周期は揃えず鮮度UIを統一）。
 *
 * 副作用なし・DOM 非依存（capturedAt と now を受け取り文字列を返すだけ）。
 */

/** これを超えたら「自動更新中」の but は付けず「少し前の値」と注記する目安（90 秒）。 */
export const CARD_FRESHNESS_STALE_MS = 90 * 1000;

/**
 * 経過ミリ秒を「○秒前 / ○分前 / ○時間前」の和文に丸める。
 * @param {number} ageMs
 * @returns {string}
 */
export function formatAgoLabel(ageMs) {
  const ms = Number(ageMs);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 5) return 'たった今';
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  return `${day}日前`;
}

/**
 * カードの鮮度注記を作る。
 *
 * @param {unknown} capturedAtMs 取得時刻（epoch ms）。無効なら空文字（注記を出さない）。
 * @param {{ nowMs?: number, autoRefreshing?: boolean }} [opts]
 *   - nowMs: 現在時刻（テスト用に注入可）。
 *   - autoRefreshing: そのカードが自動更新経路に乗っているか（true なら「自動更新中」を添える）。
 * @returns {string} 例 "最終更新: 12秒前・自動更新中" / "最終更新: 3分前（少し前の値）" / ""（出さない）
 */
export function formatCardFreshnessNote(capturedAtMs, opts = {}) {
  const captured = Number(capturedAtMs);
  if (!Number.isFinite(captured) || captured <= 0) return '';
  const nowMs =
    typeof opts.nowMs === 'number' && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const ageMs = Math.max(0, nowMs - captured);
  // 未来時刻（時計ずれ）や極端に古い（>7日）は信頼できないので出さない。
  if (nowMs - captured < -60_000) return '';
  if (ageMs > 7 * 24 * 60 * 60 * 1000) return '';

  const ago = formatAgoLabel(ageMs);
  if (!ago) return '';

  const isStale = ageMs > CARD_FRESHNESS_STALE_MS;
  if (isStale) {
    // 自動更新カードでも長く経っていれば「少し前の値」と正直に出す
    // （タブが裏に居る・取得が止まっている等）。
    return `最終更新: ${ago}（少し前の値）`;
  }
  if (opts.autoRefreshing === true) {
    return `最終更新: ${ago}・自動更新中`;
  }
  return `最終更新: ${ago}`;
}
