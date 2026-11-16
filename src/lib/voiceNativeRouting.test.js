import { describe, it, expect, vi } from 'vitest';
import { synthesizeVoice } from './voicevoxClient.js';

describe('Native v1 と既存HTTP経路の契約', () => {
  it.each([{ stream: true }, { baseUrl: 'http://127.0.0.1:50161' }])('明示した経路をNativeで置き換えない: %j', async options => {
    const nativeSendMessage = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await synthesizeVoice('経路確認', { styleId: 3 }, { ...options, fetchFn, nativeSendMessage });
    expect(nativeSendMessage).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    if (options.baseUrl) expect(fetchFn.mock.calls[0][0]).toContain(options.baseUrl);
  });
  it('空の読み上げは補助アプリもHTTPも呼ばない', async () => {
    const nativeSendMessage = vi.fn(), fetchFn = vi.fn();
    expect(await synthesizeVoice('  ', { styleId: 3 }, { nativeSendMessage, fetchFn })).toBeNull();
    expect(nativeSendMessage).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
