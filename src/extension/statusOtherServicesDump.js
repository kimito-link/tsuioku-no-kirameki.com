// @ts-nocheck — status.html の JSON ダウンロード時にニコ生以外のサービス計器・タブをオンデマンド取得する補助。
import {
  OTHER_SERVICE_DIAG_KEYS,
  OTHER_SERVICE_WATCH_TAB_PATTERNS,
  summarizeOtherServiceTabs,
  pickOtherServiceDiags
} from '../lib/mcpDiagDumpServices.js';

/**
 * ニコ生以外のサービス計器・視聴タブをオンデマンドで軽量取得する（失敗時は空）。
 * @param {{ safeStorageLocalGet: Function, runStorageOpWithTimeout: Function, timeoutMs: number, timedOutToken: unknown }} opts
 * @returns {Promise<{ otherServiceTabs: Array<object>, otherServiceDiags: Record<string, unknown> }>}
 */
export async function collectOtherServicesDump(opts) {
  let otherServiceDiags = {};
  let otherServiceTabs = [];
  try {
    const res = await opts.runStorageOpWithTimeout(
      () => opts.safeStorageLocalGet(OTHER_SERVICE_DIAG_KEYS),
      opts.timeoutMs
    );
    if (res && res !== opts.timedOutToken) {
      otherServiceDiags = pickOtherServiceDiags(res);
    }
  } catch {
    otherServiceDiags = {};
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.query === 'function') {
      const svcTabs = await chrome.tabs.query({ url: OTHER_SERVICE_WATCH_TAB_PATTERNS });
      otherServiceTabs = summarizeOtherServiceTabs(svcTabs);
    }
  } catch {
    otherServiceTabs = [];
  }
  return { otherServiceTabs, otherServiceDiags };
}
