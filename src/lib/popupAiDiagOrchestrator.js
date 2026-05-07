/**
 * v0.1.211: popup「AI 診断」ボタンのオーケストレータ純関数。
 *
 * Built-in AI (Gemini Nano) の availability 判定 → prompt 構築 → 実行 →
 * 結果整形までを 1 関数にまとめる。popup-entry.js からは本関数を呼ぶだけ。
 *
 * 副作用:
 *   - globalThis.LanguageModel / Summarizer の参照
 *   - geminiNanoBridge 経由で Built-in AI セッション create + destroy
 *   - errorAutoDiagnosis で prompt 構築（純関数）
 */

import {
  probeBuiltinAiAvailability,
  runBuiltinAiPrompt
} from './geminiNanoBridge.js';
import { buildErrorDiagnosisPrompt } from './errorAutoDiagnosis.js';

/**
 * @typedef {{
 *   ok: boolean,
 *   text: string,
 *   reason: string,
 *   availability: import('./geminiNanoBridge.js').BuiltinAiAvailabilityState
 * }} PopupAiDiagResult
 */

/**
 * popup「AI 診断」ボタンの click handler 内で呼ぶ関数。
 *
 * @param {import('./errorAutoDiagnosis.js').ErrorDiagnosisInput} input
 * @returns {Promise<PopupAiDiagResult>}
 */
export async function runPopupAiDiagnosis(input) {
  const av = await probeBuiltinAiAvailability();
  if (av.state !== 'available') {
    return {
      ok: false,
      text: '',
      reason:
        av.state === 'unavailable'
          ? 'Built-in AI（Gemini Nano）が利用できません。Chrome 138+ + WebGPU 対応 + Built-in AI 機能の有効化が必要です'
          : av.state === 'downloadable'
            ? 'Built-in AI のモデルがダウンロードされていません。Chrome 設定で AI 機能を有効化してください'
            : av.state === 'downloading'
              ? 'Built-in AI のモデルをダウンロード中です。少し待ってから再度お試しください'
              : `Built-in AI 状態: ${av.state}（${av.reason || 'unknown'}）`,
      availability: av.state
    };
  }
  const prompt = buildErrorDiagnosisPrompt(input);
  try {
    const text = await runBuiltinAiPrompt(prompt);
    return {
      ok: true,
      text,
      reason: '',
      availability: av.state
    };
  } catch (e) {
    return {
      ok: false,
      text: '',
      reason: `AI 呼び出しエラー: ${String(
        /** @type {any} */ (e)?.message || e
      )}`,
      availability: av.state
    };
  }
}
