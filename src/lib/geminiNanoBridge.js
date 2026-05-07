/**
 * v0.1.205 Phase C: Built-in AI (Gemini Nano, Chrome 138+) の薄いラッパー。
 *
 * - 拡張本体側（Claude 領域）が提供する基盤
 * - codex 側 geminiBroadcastSummary.js から呼び出される（領域分離は Brief §3.1）
 * - LanguageModel / Summarizer の availability + 1 ターン実行に絞った API
 * - API 不在 / 利用不可 / セッション失敗 は throw（呼び出し側で catch して fallback）
 *
 * 副作用は globalThis.LanguageModel / Summarizer の参照のみ。
 * テストは globalThis に mock を差し込んで検証する。
 */

/**
 * @typedef {'available'|'downloadable'|'downloading'|'unavailable'} BuiltinAiAvailabilityState
 *
 * @typedef {{ state: BuiltinAiAvailabilityState, reason?: string }} BuiltinAiAvailability
 */

/**
 * Built-in AI（LanguageModel）の利用可否を判定する。
 *
 * @returns {Promise<BuiltinAiAvailability>}
 */
export async function probeBuiltinAiAvailability() {
  const lm = /** @type {any} */ (globalThis).LanguageModel;
  if (!lm || typeof lm.availability !== 'function') {
    return { state: 'unavailable', reason: 'no_language_model_api' };
  }
  try {
    const a = await lm.availability();
    if (
      a === 'available' ||
      a === 'downloadable' ||
      a === 'downloading' ||
      a === 'unavailable'
    ) {
      return { state: a };
    }
    return { state: 'unavailable', reason: 'unknown_response' };
  } catch {
    return { state: 'unavailable', reason: 'availability_threw' };
  }
}

/**
 * Built-in AI で 1 ターンの prompt → completion を取る。
 *
 * @param {{ system?: string, user: string, temperature?: number }} input
 * @returns {Promise<string>}
 */
export async function runBuiltinAiPrompt(input) {
  const sys = String(input?.system ?? '').trim();
  const usr = String(input?.user ?? '').trim();
  if (!usr) throw new Error('runBuiltinAiPrompt: user prompt is required');
  const lm = /** @type {any} */ (globalThis).LanguageModel;
  if (!lm || typeof lm.create !== 'function') {
    throw new Error('runBuiltinAiPrompt: LanguageModel API is not available');
  }
  /** @type {Record<string, unknown>} */
  const opts = {};
  if (sys) opts.initialPrompts = [{ role: 'system', content: sys }];
  if (typeof input?.temperature === 'number') opts.temperature = input.temperature;
  const session = await lm.create(opts);
  try {
    const out = await session.prompt(usr);
    return String(out ?? '').trim();
  } finally {
    try { session.destroy?.(); } catch { /* no-op */ }
  }
}

/**
 * Built-in AI の Summarizer API で text を要約。
 *
 * @param {{ text: string, type?: 'tldr'|'key-points'|'teaser'|'headline', length?: 'short'|'medium'|'long' }} input
 * @returns {Promise<string>}
 */
export async function runBuiltinAiSummarize(input) {
  const text = String(input?.text ?? '').trim();
  if (!text) throw new Error('runBuiltinAiSummarize: text is required');
  const sm = /** @type {any} */ (globalThis).Summarizer;
  if (!sm || typeof sm.create !== 'function') {
    throw new Error('runBuiltinAiSummarize: Summarizer API is not available');
  }
  const session = await sm.create({
    type: input?.type ?? 'tldr',
    length: input?.length ?? 'short'
  });
  try {
    const out = await session.summarize(text);
    return String(out ?? '').trim();
  } finally {
    try { session.destroy?.(); } catch { /* no-op */ }
  }
}
