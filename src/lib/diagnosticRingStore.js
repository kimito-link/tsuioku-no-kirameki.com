/**
 * 診断エラーリングを chrome.storage.local に追記（拡張コンテキスト専用）。
 */

import { mergeDiagnosticRingAppend } from './diagnosticErrorRing.js';
import {
  redactDiagnosticString,
  sanitizeUrlForDiagnostic,
  summarizeError
} from './diagnosticRedact.js';
import { KEY_DIAGNOSTICS_ERROR_RING_V1 } from './storageKeys.js';

/**
 * @param {{
 *   context: string,
 *   phase?: string,
 *   message?: string,
 *   stackHead?: string,
 *   liveId?: string,
 *   sanitizedUrl?: string,
 *   generation?: number,
 *   storageKey?: string,
 *   at?: number
 * }} rawEntry
 */
export async function appendDiagnosticErrorRing(rawEntry) {
  let bag;
  try {
    bag = await chrome.storage.local.get(KEY_DIAGNOSTICS_ERROR_RING_V1);
  } catch {
    return;
  }
  const cur = bag[KEY_DIAGNOSTICS_ERROR_RING_V1];
  const msg = redactDiagnosticString(String(rawEntry.message || ''));
  const stackHead = rawEntry.stackHead
    ? redactDiagnosticString(
        String(rawEntry.stackHead).split('\n').slice(0, 4).join(' | ')
      )
    : undefined;
  const entry = {
    at: typeof rawEntry.at === 'number' ? rawEntry.at : Date.now(),
    context: String(rawEntry.context || 'unknown').slice(0, 32),
    ...(rawEntry.phase ? { phase: String(rawEntry.phase).slice(0, 64) } : {}),
    ...(msg ? { message: msg } : {}),
    ...(stackHead ? { stackHead } : {}),
    ...(rawEntry.liveId ? { liveId: String(rawEntry.liveId).slice(0, 32) } : {}),
    ...(rawEntry.sanitizedUrl
      ? { sanitizedUrl: sanitizeUrlForDiagnostic(String(rawEntry.sanitizedUrl)) }
      : {}),
    ...(rawEntry.generation != null && Number.isFinite(rawEntry.generation)
      ? { generation: Math.floor(Number(rawEntry.generation)) }
      : {}),
    ...(rawEntry.storageKey
      ? { storageKey: String(rawEntry.storageKey).slice(0, 120) }
      : {})
  };
  const next = mergeDiagnosticRingAppend(Array.isArray(cur) ? cur : [], entry);
  try {
    await chrome.storage.local.set({ [KEY_DIAGNOSTICS_ERROR_RING_V1]: next });
  } catch {
    // best-effort
  }
}

/**
 * @param {string} context
 * @param {unknown} err
 * @param {{ liveId?: string, sanitizedUrl?: string, phase?: string, generation?: number }} [opts]
 */
export async function recordDiagnosticException(context, err, opts = {}) {
  const s = summarizeError(err);
  await appendDiagnosticErrorRing({
    at: Date.now(),
    context,
    phase: opts.phase,
    message: `${s.name}: ${s.message}`,
    liveId: opts.liveId,
    sanitizedUrl: opts.sanitizedUrl,
    generation: opts.generation
  });
}
