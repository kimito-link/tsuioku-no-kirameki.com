import { afterEach, describe, expect, it, vi } from 'vitest';
import { wireVoiceTestHook } from './voiceTestHook.js';

describe('voiceTestHook', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('v0.1.1782: ping には試験を始めずに「準備できた」と返す', () => {
    /** @type {any} */
    let listener = null;
    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: () => ({ key: 'dev' }),
        onMessage: { addListener: (fn) => { listener = fn; } }
      }
    });
    const enqueue = vi.fn();
    wireVoiceTestHook({ target: 'venue', enqueue, getDiag: () => ({}), isIdle: () => true });
    const sendResponse = vi.fn();
    const keepOpen = listener({ type: 'NLS_VOICE_TEST', target: 'venue', ping: true }, {}, sendResponse);
    expect(keepOpen).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, ready: true, running: false, voiceOn: true });
    expect(enqueue).not.toHaveBeenCalled();
    // 別の画面あての ping には返事をしない
    const other = vi.fn();
    expect(listener({ type: 'NLS_VOICE_TEST', target: 'comeview', ping: true }, {}, other)).toBe(false);
    expect(other).not.toHaveBeenCalled();
  });

  it('v0.1.1784: ping は読み上げが ON になり終わっているかも返す', () => {
    /** @type {any} */
    let listener = null;
    vi.stubGlobal('chrome', {
      runtime: { getManifest: () => ({ key: 'dev' }), onMessage: { addListener: (fn) => { listener = fn; } } }
    });
    let on = false;
    wireVoiceTestHook({ target: 'venue', enqueue: () => {}, getDiag: () => ({}), isIdle: () => true, isVoiceOn: () => on });
    const r1 = vi.fn();
    listener({ type: 'NLS_VOICE_TEST', target: 'venue', ping: true }, {}, r1);
    expect(r1.mock.calls[0][0].voiceOn).toBe(false);
    on = true;
    const r2 = vi.fn();
    listener({ type: 'NLS_VOICE_TEST', target: 'venue', ping: true }, {}, r2);
    expect(r2.mock.calls[0][0].voiceOn).toBe(true);
  });

  it('ストア版(key なし)では入口をつながない', () => {
    const addListener = vi.fn();
    vi.stubGlobal('chrome', { runtime: { getManifest: () => ({}), onMessage: { addListener } } });
    wireVoiceTestHook({ target: 'venue', enqueue: () => {}, getDiag: () => ({}), isIdle: () => true });
    expect(addListener).not.toHaveBeenCalled();
  });
});
