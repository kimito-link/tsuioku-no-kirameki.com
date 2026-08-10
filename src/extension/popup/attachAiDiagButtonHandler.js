// @ts-nocheck — popup-entry.js から切り出し。DOM/Chrome API が広く any 相当(移設元と同方針)。
/**
 * attachAiDiagButtonHandler — 「AIで診断」ボタンの delegated listener を張る。
 *
 * ★Phase 2(巨大entryの分割)の2件目の抽出。挙動は変えていない。
 *   選定理由(棚卸し): popup-entry 内の他関数への依存が【ゼロ】/ 呼び出し元1箇所 /
 *   依存はすべて lib からの import。
 *   棚卸し: docs/handoff/giant-entry-split-PHASE2-INVENTORY-2026-08-10.md
 *
 * ★DOM を触るので純関数ではない。要素取得は呼び手から注入する
 *   (popup-entry のローカル関数に直接依存させない=単体で動かせる)。
 *
 * @module popup/attachAiDiagButtonHandler
 */

import { buildErrorDiagnosisPrompt } from '../../lib/errorAutoDiagnosis.js';
import { probeBuiltinAiAvailability, runBuiltinAiPrompt } from '../../lib/geminiNanoBridge.js';
import { runPopupAiDiagnosis } from '../../lib/popupAiDiagOrchestrator.js';

/** @type {any} 直近の fastCache を click 時に参照するため保持。
 *  ★この2つは attachAiDiagButtonHandler だけが使う(popup-entry での利用はゼロを確認済み)ので
 *    関数と一緒に移した。呼び手に持たせると ctx が太るだけで誰の得にもならない。 */
let _latestAiDiagFastCache = null;
/** @type {boolean} extrasEl への delegated click listener が attach 済みか */
let _aiDiagDelegatedAttached = false;

/**
 * @param {any} fastCache 診断の材料(popup-entry が持つ直近の fastDiag)
 * @param {{ getEl: (id: string) => any }} deps 要素取得器を注入する
 */
export function attachAiDiagButtonHandler(fastCache, deps) {
  const getEl = deps.getEl;
  _latestAiDiagFastCache = fastCache;
  if (_aiDiagDelegatedAttached) return;
  const extrasEl = getEl('devMonitorGiftRankingExtras');
  if (!extrasEl) return;
  _aiDiagDelegatedAttached = true;
  try {
    console.log(
      '[nls AI診断] delegated listener attached to #devMonitorGiftRankingExtras'
    );
  } catch { /* no-op */ }
  extrasEl.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement|null} */ (e.target);
    const btn = /** @type {HTMLButtonElement|null} */ (
      target?.closest?.('#aiDiagBtn') || null
    );
    if (!btn) return;
    const result = /** @type {HTMLElement|null} */ (
      extrasEl.querySelector('#aiDiagResult')
    );
    if (!result) return;
    if (btn.hasAttribute('disabled')) return;
    try {
      console.log('[nls AI診断] click 検知（delegated）');
    } catch { /* no-op */ }
    result.textContent = '⏳ ステップ 1/4: クリック検知、Built-in AI 検出中…';
    btn.setAttribute('disabled', 'disabled');
    const fastCache = _latestAiDiagFastCache;
    try {
      const av = await probeBuiltinAiAvailability();
      result.textContent = `⏳ ステップ 2/4: 検出結果 state=${av.state}${av.reason ? ` (${av.reason})` : ''}`;
      try {
        console.log('[nls AI診断] availability', av);
      } catch { /* no-op */ }
      if (av.state === 'unavailable') {
        result.textContent =
          `❌ Built-in AI 利用不可\n` +
          `state: ${av.state}\n` +
          `reason: ${av.reason || '(なし)'}\n\n` +
          `Chrome 138+ + WebGPU 対応 + Built-in AI 機能の有効化が必要です。\n` +
          `chrome://flags/#optimization-guide-on-device-model を有効化、\n` +
          `chrome://components で「Optimization Guide On Device Model」を最新化してください。`;
        btn.removeAttribute('disabled');
        return;
      }

      // step 3: prompt 構築
      const cache = fastCache && typeof fastCache === 'object' ? fastCache : {};
      const content = cache?.content || {};
      const consoleErrors = Array.isArray(
        content?.consoleErrorProbe?.recentErrors
      )
        ? content.consoleErrorProbe.recentErrors
        : [];
      const networkErrorMessages = Array.isArray(
        content?.networkErrorProbe?.nicoadFetchErrorMessages
      )
        ? content.networkErrorProbe.nicoadFetchErrorMessages
        : [];
      const networkErrors = networkErrorMessages.map((msg, i) => ({
        url: '(nicoad fetch)',
        ts: i,
        reason: String(msg || '')
      }));
      const giftDiag = content?.giftDiagnostics || {};
      const diagWarnings = [];
      if (giftDiag?.multiTabDiag?.staleDomBundleSuspected) {
        diagWarnings.push({
          severity: 'medium',
          code: 'STALE_DOM_BUNDLE',
          message:
            'multi-tab race の疑い（過去配信の DOM 残骸が混入している可能性）'
        });
      }
      if (giftDiag?.rankingDiag?.autoOpen?.lastFailureReason) {
        diagWarnings.push({
          severity: 'medium',
          code: 'AUTO_OPEN_FAILED',
          message: `応援ランキング自動オープン失敗: ${giftDiag.rankingDiag.autoOpen.lastFailureReason}`
        });
      }
      const giftSummary = giftDiag?.['ギフトサマリ'] || {};
      const ndgrGifts = giftSummary?.['NDGRギフトevent数'] ?? 0;
      const giftPoints = giftSummary?.['ギフトポイント観測'] ?? 0;
      const contextNote = `現在の配信状況: ギフト event 観測 ${ndgrGifts} 件, ギフトポイント ${giftPoints}, 視聴者 ${content?.romiDebug?.interceptMapSize ?? 0} 名`;

      result.textContent = '⏳ ステップ 3/4: prompt 構築中…';
      const prompt = buildErrorDiagnosisPrompt({
        consoleErrors,
        networkErrors,
        diagWarnings,
        contextNote
      });

      const needsDownload =
        av.state === 'downloadable' || av.state === 'downloading';
      result.textContent = needsDownload
        ? '⏳ ステップ 4/4: Built-in AI モデル DL 中…\n' +
          '（初回のみ、約 2GB の DL が走ります。Wi-Fi 推奨、数分〜数十分）'
        : '⏳ ステップ 4/4: Built-in AI に問い合わせ中… (5〜10 秒かかります)';
      try {
        console.log('[nls AI診断] runBuiltinAiPrompt 開始', { needsDownload });
      } catch { /* no-op */ }
      const text = await runBuiltinAiPrompt(prompt, {
        onDownloadProgress: (loaded) => {
          const pct = Math.max(0, Math.min(100, Number(loaded) * 100));
          result.textContent =
            `⬇️ Built-in AI モデル DL 中: ${pct.toFixed(1)}%\n` +
            `（初回のみ、約 2GB。完了後そのまま AI 診断を実行します）`;
        }
      });
      try {
        console.log('[nls AI診断] runBuiltinAiPrompt 応答', text?.length, '文字');
      } catch { /* no-op */ }
      result.textContent = text || '(AI 応答が空でした)';
    } catch (e) {
      try {
        console.error('[nls AI診断] エラー', e);
      } catch { /* no-op */ }
      result.textContent =
        '❌ エラー: ' + String(/** @type {any} */ (e)?.message || e);
    } finally {
      btn.removeAttribute('disabled');
    }
  });
  // 参照されない警告抑制（runPopupAiDiagnosis は v0.1.212 互換のため残置）
  void runPopupAiDiagnosis;
}