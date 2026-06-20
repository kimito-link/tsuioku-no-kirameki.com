/**
 * レポート中身プレビュー(保存前の主要KPI)の storage キー正本。
 *   producer=popup(コメント本文配列を持つ) / consumer=status(panel_summary しか持たない)で共有。
 *   別ページ/別コンテキスト間で同じキーを使うため、リテラル散在を避けてここに集約
 *   (voiceDiagKey.js / aiSharePopupDiagKey.js と同思想)。v0.1.858。
 *
 * 背景: HTML/マーケ/メディアキットのレポートは「DLして初めて中身が分かる」ため、先日の
 *   「保存コメント数27の過小集計」のようなバグが保存後でないと気づけなかった。レポートが使う
 *   既存純関数(aggregateMarketingReport / analyzeAudienceEngagementGap)の主要KPIだけを
 *   保存せずに status の状態速報へ出す=解像度を上げる(ユーザー要望 2026-06-21)。
 */
export const KEY_REPORT_PREVIEW = 'nls_report_preview_v1';

/**
 * status が読む際の最大鮮度(これより古い snapshot は「古い=表示しない」扱いにできる)。
 *   producer の publish 間引き(15秒)+ status の更新間隔を踏まえ、2分を上限に。
 */
export const REPORT_PREVIEW_MAX_AGE_MS = 120_000;

/**
 * buildReportPreview の戻り(ReportPreview)に liveId/at を付けて storage 用レコードにする純関数。
 * @param {import('./reportPreview.js').ReportPreview|null|undefined} preview buildReportPreview の戻り
 * @param {number} nowMs Date.now()(producer 側で渡す=テスト容易)
 * @returns {(import('./reportPreview.js').ReportPreview & {at:number})|null}
 */
export function buildReportPreviewRecord(preview, nowMs) {
  if (!preview || typeof preview !== 'object') return null;
  const at = Number(nowMs);
  return { ...preview, at: Number.isFinite(at) ? at : 0 };
}

/**
 * status 側で「新鮮なレコードか」を判定する純関数(古ければ null 扱いにして表示しない)。
 * @param {{at?: number}|null|undefined} rec
 * @param {number} nowMs
 * @param {number} [maxAgeMs]
 * @returns {boolean}
 */
export function isReportPreviewFresh(rec, nowMs, maxAgeMs = REPORT_PREVIEW_MAX_AGE_MS) {
  if (!rec || typeof rec !== 'object') return false;
  const at = Number(rec.at);
  const now = Number(nowMs);
  if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(now)) return false;
  return now - at <= maxAgeMs;
}
