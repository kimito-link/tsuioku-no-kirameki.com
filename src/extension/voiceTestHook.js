// voiceTestHook.js — 読み上げ試験(voiceTestRun.js)の入口をコメビュ・会場につなぐ(開発版だけ・2026-10-26)。
//   起動のしかた(どちらも開発版=manifest に key があるときだけ):
//   - runtime メッセージ { type: 'NLS_VOICE_TEST', target: 'comeview'|'venue', kind, count, label }
//   - コメビュの URL に ?voice=1&voicetest=short|long|burst|mixed(&voicetestn=10)
//   結果は chrome.storage.local の nls_voice_test_report_v1(配列)に残る。
//   v0.1.1782: { ..., ping: true } を送ると、試験を始めずに { ok: true, ready: true, running, voiceOn } を返す。
//   空の返事(=まだ入口がつながっていない)なら少し待って送り直す(開いた直後の最初の1通が消えていた)。
//   v0.1.1784: voiceOn = 読み上げが ON になり終わっているか(ON にしている途中は false)。

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
 *   isVoiceOn?: () => boolean,
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
      if (msg.ping === true) {
        let voiceOn = true;
        try { voiceOn = typeof o.isVoiceOn === 'function' ? o.isVoiceOn() === true : true; } catch { voiceOn = false; }
        sendResponse({ ok: true, ready: true, running, voiceOn });
        return false;
      }
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
    isVoiceOn: () => voicePlayer.enabled === true && !voicePlayer.toggleBusy,
    ensureEnabled: async () => {
      // v0.1.1784: 開いた直後の「ON にしている途中」に始めると enable() が何もせず戻り voice-off になった(PC 試験)。
      for (let i = 0; i < 60 && voicePlayer.toggleBusy; i++) await new Promise((r) => setTimeout(r, 250));
      if (!voicePlayer.enabled) await voicePlayer.enable({ persist: false });
      return voicePlayer.enabled === true;
    }
  });
}
