import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  createVoiceEngineActivityLink,
  VOICE_ENGINE_PING_MIN_INTERVAL_MS,
  VOICE_ENGINE_QUIET_QUERY_TIMEOUT_MS
} from './voiceEngineActivity.js';

afterEach(() => { vi.useRealTimers(); });

describe('createVoiceEngineActivityLink', () => {
  it('合図は間引いて送る(続けて呼んでも 500ms に1回)', () => {
    let t = 0;
    const send = vi.fn(async () => ({}));
    const link = createVoiceEngineActivityLink(send, { now: () => t });
    link.ping();
    link.ping();
    t += VOICE_ENGINE_PING_MIN_INTERVAL_MS;
    link.ping();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toEqual({ type: 'NLS_VOICE_ENGINE_ACTIVITY' });
  });

  it('送れなくても(拡張の更新直後など)例外を外に出さない', () => {
    const link = createVoiceEngineActivityLink(() => { throw new Error('context invalidated'); });
    expect(() => link.ping()).not.toThrow();
  });

  it('静かな時間を返す。返事が壊れている・失敗・返事が来ない時は Infinity(読み込みを止めっぱなしにしない)', async () => {
    expect(await createVoiceEngineActivityLink(async () => ({ quietMs: 300 })).quietMs()).toBe(300);
    expect(await createVoiceEngineActivityLink(async () => ({})).quietMs()).toBe(Infinity);
    expect(await createVoiceEngineActivityLink(async () => { throw new Error('x'); }).quietMs()).toBe(Infinity);
    vi.useFakeTimers();
    const p = createVoiceEngineActivityLink(() => new Promise(() => {})).quietMs();
    await vi.advanceTimersByTimeAsync(VOICE_ENGINE_QUIET_QUERY_TIMEOUT_MS);
    expect(await p).toBe(Infinity);
  });

  it('Background が同じ2つの合図に答え、自拡張以外は無視する', () => {
    const bg = fs.readFileSync(new URL('../../extension/background.js', import.meta.url), 'utf8');
    expect(bg).toMatch(/msg\.type !== 'NLS_VOICE_ENGINE_ACTIVITY' && msg\.type !== 'NLS_VOICE_ENGINE_QUIET'[\s\S]{0,120}sender\.id !== chrome\.runtime\.id/);
  });
});
