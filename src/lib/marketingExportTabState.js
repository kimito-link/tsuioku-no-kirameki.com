/**
 * マーケ分析タブ(marketing-export.html?lv=<lid>)の「状態」を URL に残し、
 * popup が「処理中なら前に出すだけ・終わっていれば作り直す」を判断するための小さな部品。
 *
 * v0.1.1858: 以前は同じ lv のタブがあれば状態を見ずに前に出すだけだったので、
 *   前回の完了画面(「ダウンロードを開始しました」)が残っていると、もう一度押しても
 *   分析が始まらず・ダウンロードもされなかった(タイムシフトで同じ配信を撮り直したときに発生)。
 */

export const MARKETING_EXPORT_STATE_PARAM = 'state';

/** @typedef {'done'|'error'} MarketingExportFinishedState */

/**
 * 完了/エラー時に今の URL へ state を付けた URL を返す(history.replaceState 用)。
 * @param {string} href
 * @param {MarketingExportFinishedState} state
 * @returns {string}
 */
export function withMarketingExportState(href, state) {
  try {
    const u = new URL(String(href || ''));
    u.searchParams.set(MARKETING_EXPORT_STATE_PARAM, state);
    return u.toString();
  } catch {
    return String(href || '');
  }
}

/**
 * 既存タブの URL から、作り直すべき(=処理が終わっている)かを返す。
 * 読めない URL は「処理中かもしれない」側に倒さず作り直す(押しても何も起きないのが一番悪い)。
 * @param {string} tabUrl
 * @returns {boolean}
 */
export function isMarketingExportTabFinished(tabUrl) {
  try {
    const s = new URL(String(tabUrl || '')).searchParams.get(MARKETING_EXPORT_STATE_PARAM);
    return s === 'done' || s === 'error';
  } catch {
    return true;
  }
}
