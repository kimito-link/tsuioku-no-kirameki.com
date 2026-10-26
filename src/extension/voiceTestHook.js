// voiceTestHook.js — 読み上げ試験(voiceTestRun.js)の入口をコメビュ・会場につなぐ(開発版だけ・2026-10-26)。
//   起動のしかた(どちらも開発版=manifest に key があるときだけ):
//   - runtime メッセージ { type: 'NLS_VOICE_TEST', target: 'comeview'|'venue', kind, count, label }
//   - コメビュの URL に ?voice=1&voicetest=short|long|burst(&voicetestn=10)
//   結果は chrome.storage.local の nls_voice_test_report_v1(配列)に残る。

import {
  appendVoiceTestReport,
  isVoiceTestAllowed,
  runVoiceTest,
  VOICE_TEST_MESSAGE
} from '../lib/voiceTestRun.js';

/**
 * @param {{
 *   target: 'comeview'|'venue',
 *   enqueue: (items: Record<string, any>[]) => void,
 *   getDiag: () => Record<string, any>,
 *   isIdle: () => boolean,
 *   prepare?: () => void,
 *   ensureEnabled?: () => Promise<boolean>,
 *   readUrl?: boolean
 * }} o
 */
export function wireVoiceTestHook(o) {
  let manifest = null;
  try { manifest = chrome.runtime.getManifest(); } catch { manifest = null; }
  if (!isVoiceTestAllowed(manifest)) return;
  let running = false;
  /** @param {{ kind?: unknown, count?: unknown, label?: unknown }} req */
  const start = async (req) => {
    if (running) return { ok: false, reason: 'busy' };
    running = true;
    try {
      if (typeof o.ensureEnabled === 'function' && !(await o.ensureEnabled())) return { ok: false, reason: 'voice-off' };
      const report = await runVoiceTest({
        kind: req.kind,
        count: req.count,
        label: typeof req.label === 'string' ? req.label : '',
        mode: o.target,
        enqueue: o.enqueue,
        getDiag: o.getDiag,
        isIdle: o.isIdle,
        prepare: o.prepare,
        write: (r) => appendVoiceTestReport(chrome.storage.local, r)
      });
      return { ok: true, report };
    } finally {
      running = false;
    }
  };
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== VOICE_TEST_MESSAGE || msg.target !== o.target) return false;
      void start(msg).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
      return true;
    });
  } catch { /* メッセージが使えない画面では URL だけ */ }
  if (o.readUrl) {
    try {
      const sp = new URLSearchParams(window.location.search);
      const kind = sp.get('voicetest');
      if (kind) setTimeout(() => { void start({ kind, count: sp.get('voicetestn') || 10, label: sp.get('voicetestlabel') || '' }); }, 3000);
    } catch { /* no-op */ }
  }
}

/**
 * 会場(venueBar.js)用。読み上げが鳴らない理由の初期値を入れ、試験の入口をつなぐ。
 * @param {any} voicePlayer VoicePlayer
 */
export function wireVenueVoiceTestHook(voicePlayer) {
  voicePlayer.diag.venueGate = 'panel-closed'; // 会場の画面を開くまでは読まない作り
  wireVoiceTestHook({
    target: 'venue',
    enqueue: (items) => voicePlayer.enqueue(items),
    getDiag: () => voicePlayer.diag,
    isIdle: () => !voicePlayer.playing && voicePlayer.queue.length === 0,
    prepare: () => { voicePlayer.queue = []; voicePlayer.prefetches.clear(); }, // 試験の前の待ち行列を捨てる
    ensureEnabled: async () => {
      if (!voicePlayer.enabled) await voicePlayer.enable({ persist: false });
      return voicePlayer.enabled === true;
    }
  });
}
