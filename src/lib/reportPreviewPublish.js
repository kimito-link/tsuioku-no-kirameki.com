import { aggregateMarketingReport } from './marketingAggregate.js';
import { analyzeAudienceEngagementGap } from './audienceEngagementGap.js';
import { buildReportPreview, extractReportPreviewInputs } from './reportPreview.js';
import { KEY_REPORT_PREVIEW, buildReportPreviewRecord } from './reportPreviewKey.js';

let _lastWriteAt = 0; // 最後に publish した時刻(間引き用・モジュール内に閉じる)。
let _busy = false; // 重い全件集計の多重実行を防ぐ再入フラグ。

/**
 * レポート(HTML/マーケ/メディアキット)の「DL前」主要KPIを status 速報へ publish する。
 * popup-entry.js の行数膨張(max-lines ラチェット)を避けるため producer 本体をここへ集約。レポートが
 * 使う純関数(aggregate/gap/preview/record)はこのモジュールが import し、popup 固有の副作用(全件
 * 読み・snapshot・storage 書き込み)だけを呼び出し時に DI で受ける=テスト可能。
 *
 * 設計: status は本文コメント配列を持たない(panel_summary のみ)ので、コメントを持つ popup が
 *   定期 publish→status が読む storage ブリッジ(voiceDiag/perfDiag と同型)。重い全件集計なので
 *   minGapMs(既定15秒)間引き+再入防止+fire-and-forget(paint/記録を妨げない)。v0.1.858。
 *
 *   storage 書き込みは KEY_REPORT_PREVIEW へこのモジュールが行う(拡張コンテキストの chrome.storage)。
 * @param {string} liveId
 * @param {{
 *   resolveComments: (liveId:string) => Promise<any[]>,
 *   getSnapshot: () => any,
 *   now: () => number,
 *   minGapMs?: number,
 *   force?: boolean
 * }} deps popup 固有の副作用(全件読み/snapshot/時刻)。SC3(council/broadcast-scoring-SYNTHESIS.md
 *   §2.1): `force:true` は間引き(minGapMs)を無視して1回だけ即publishする(配信終了検知時に
 *   確定値でカウントアップするため)。再入防止(_busy)はforceでも尊重する(全件集計の多重実行は防ぐ)。
 */
export function publishReportPreviewThrottled(liveId, deps) {
  const lv = String(liveId || '').trim().toLowerCase();
  if (!lv) return;
  const minGapMs = Number.isFinite(deps.minGapMs) ? Number(deps.minGapMs) : 15_000;
  const t = deps.now();
  if (_busy) return;
  if (!deps.force && t - _lastWriteAt < minGapMs) return;
  _lastWriteAt = t;
  _busy = true;
  void (async () => {
    try {
      const comments = await deps.resolveComments(lv);
      const preview = buildReportPreview(
        aggregateMarketingReport,
        analyzeAudienceEngagementGap,
        comments,
        lv,
        extractReportPreviewInputs(deps.getSnapshot())
      );
      const rec = buildReportPreviewRecord(preview, deps.now());
      // feature-map の storage 断線ゲートが producer を検出できるよう、素の chrome.storage.local.set を使う
      //   (optional-chaining だと静的解析が取りこぼす)。chrome 不在(テスト等)はガードで握る。
      if (rec && globalThis.chrome?.storage?.local) {
        await chrome.storage.local.set({ [KEY_REPORT_PREVIEW]: rec });
      }
    } catch {
      /* best-effort: storage 不可・context 消失。次の間引き周期で再試行。 */
    } finally {
      _busy = false;
    }
  })();
}

/** テスト用: 間引き状態をリセット(モジュール内 state を初期化)。 */
export function _resetReportPreviewThrottleForTest() {
  _lastWriteAt = 0;
  _busy = false;
}
