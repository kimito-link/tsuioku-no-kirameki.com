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
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, ready: true, running: false });
    expect(enqueue).not.toHaveBeenCalled();
    // 別の画面あての ping には返事をしない
    const other = vi.fn();
    expect(listener({ type: 'NLS_VOICE_TEST', target: 'comeview', ping: true }, {}, other)).toBe(false);
    expect(other).not.toHaveBeenCalled();
  });

  it('ストア版(key なし)では入口をつながない', () => {
    const addListener = vi.fn();
    vi.stubGlobal('chrome', { runtime: { getManifest: () => ({}), onMessage: { addListener } } });
    wireVoiceTestHook({ target: 'venue', enqueue: () => {}, getDiag: () => ({}), isIdle: () => true });
    expect(addListener).not.toHaveBeenCalled();
  });
});
