/**
 * 状態画面(status.html)の自動更新の間隔を決める(純関数)。v0.1.1698
 *
 * ■ なぜ要るか(2026-10-19・実機の census)
 *   サイドパネルの中の【見えない送信担当】(status.html?publisher=1)も、画面を見せる通常の状態画面と同じ2秒周期で
 *   refresh→renderAll(DOM 描画・AI共有の全文生成)を回していた。拡張の全ページは主スレッド1本を共有するため、
 *   送信担当の status が稼働の約25〜30%(2分で長い処理が約300回)を占めていた。
 *   送信担当は画面を誰にも見せない。送信の間隔は既定120秒・web_stale は180秒なので、10秒周期で足りる(鮮度は変わらない)。
 * ■ 通常の状態画面(人が見る)は従来どおり2秒。
 * @module statusRefreshInterval
 */

/** 人が見る通常の状態画面の更新間隔(ms)。 */
export const STATUS_REFRESH_INTERVAL_MS = 2000;
/**
 * 見えない送信担当の更新間隔(ms)。v0.1.1736: 10秒→5秒。ただし実際に描き直すのは
 *   スマホが開いている間だけ5秒ごと、それ以外は2回に1回(=10秒ごと・今までと同じ重さ)。shouldRunPublisherTick 参照。
 */
export const STATUS_PUBLISHER_REFRESH_INTERVAL_MS = 5_000;

/**
 * v0.1.1736: 送信担当のこの回を描き直すか。スマホが開いている(サーバーの目印が30秒以内)なら毎回=5秒、
 *   開いていなければ偶数回だけ=10秒。誰も見ていないときに PC を重くしない。
 * @param {{ tickNo: number, viewerActive: boolean }} a
 * @returns {boolean}
 */
export function shouldRunPublisherTick(a) {
  if (a && a.viewerActive === true) return true;
  return (Math.floor(Number(a && a.tickNo) || 0) % 2) === 0;
}

/**
 * @param {{ publisher?: boolean }} [opts]
 * @returns {number}
 */
export function statusRefreshIntervalMs(opts) {
  return opts && opts.publisher === true ? STATUS_PUBLISHER_REFRESH_INTERVAL_MS : STATUS_REFRESH_INTERVAL_MS;
}
