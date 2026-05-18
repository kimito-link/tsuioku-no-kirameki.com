/**
 * ギフト検出を契機にした「公式イベント DOM bundle 追加 persist」のスロットル判定。
 *
 * F(v0.1.282): ユーザー要望「ギフトアイテムが出た時はリアルタイム反映ほしい」。
 * content は通常 `OFFICIAL_EVENT_DOM_SCRAPE_MS`(=5s) 周期で `nls_event_dom_<lv>`
 * を書く（番組累計pt/ギフト履歴/広告ランキングの正本）。固定位相の 5s 周期だと
 * gift 投下直後〜最大 5s 表示が遅れる。新規ギフト観測を契機に追加 persist を
 * 1 回挟むことで体感ラグをほぼ無くす。ただし gift storm で毎回 scrape すると
 * 過負荷（crash hardening を脅かす）なので、最小間隔 `minIntervalMs`（scrape
 * 周期と整合させる前提）でスロットルする純関数。副作用なし。
 *
 * @param {unknown} nowMs        現在時刻（Date.now()）
 * @param {unknown} lastFireAtMs 直近に追加 persist した時刻（未発火/リセットは 0）
 * @param {unknown} minIntervalMs スロットル最小間隔（ms, 通常 5000）
 * @returns {boolean} 追加 persist を発火してよいなら true
 */
export function shouldRefireOfficialBundleForGift(
  nowMs,
  lastFireAtMs,
  minIntervalMs
) {
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return false;
  const last = Number(lastFireAtMs);
  const minRaw = Number(minIntervalMs);
  const interval = Number.isFinite(minRaw) && minRaw >= 0 ? minRaw : 0;
  // 初回・未設定・liveId 切替リセット直後（0 / 非有限）は即発火を許す
  if (!Number.isFinite(last) || last <= 0) return true;
  // 境界（ちょうど interval 経過）は発火可
  return now - last >= interval;
}
