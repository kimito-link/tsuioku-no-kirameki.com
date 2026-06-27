// dev monitor「取得状況サマリ」(#devMonitorGiftRankingExtras)の HTML を組む純関数。
//   popup-entry.js:renderDevMonitorGiftRankingExtras から「rows → ヘッダ + 行 HTML」部分だけ抽出
//   （pure refactor・挙動不変）。storage read・rows 算出(summarizeDevMonitorGiftRanking)・
//   空時の早期 return・delegated handler 付与・innerHTML 代入は popup に残す。依存は htmlEscape のみ＝循環なし。
import { escapeHtml } from './htmlEscape.js';

const HEADER_HTML =
  '<div class="nl-dev-monitor__row" style="opacity:0.7;font-size:0.85em;margin-top:6px;">' +
  '<dt>── 取得状況サマリ（AI 共有診断と同じ raw data） ──</dt><dd></dd></div>';

/**
 * 取得状況サマリ行 [dt, dd][] をヘッダ付き HTML に整形する。
 *   抽出前と同一: rows が空なら ''（popup 側はそのとき innerHTML='' で早期 return する）。
 *
 * @param {Array<[unknown, unknown]>} rows  summarizeDevMonitorGiftRanking の戻り（[dt, dd] の配列）
 * @returns {string} ヘッダ + 行 HTML（空 rows なら ''）
 */
export function buildDevMonitorGiftRankingExtrasHtml(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '';
  return (
    HEADER_HTML +
    list
      .map(
        ([dt, dd]) =>
          `<div class="nl-dev-monitor__row"><dt>${escapeHtml(dt)}</dt><dd>${escapeHtml(dd)}</dd></div>`
      )
      .join('')
  );
}
