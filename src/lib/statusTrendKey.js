/**
 * 状態トレンド(時系列KPI)の storage キー正本。status が自分で読み書きする(producer=consumer=status)。
 *   リテラル散在を避けここに集約(voiceDiagKey.js / reportPreviewKey.js と同思想)。v0.1.862。
 */
export const KEY_STATUS_TREND = 'nls_status_trend_v1';
