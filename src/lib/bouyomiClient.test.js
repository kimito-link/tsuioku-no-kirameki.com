import { describe, expect, it, vi } from 'vitest';
import {
  bouyomiSpeed,
  bouyomiTone,
  buildBouyomiUrl,
  listBouyomiStyleIds,
  probeBouyomi,
  synthesizeBouyomi
} from './bouyomiClient.js';

describe('bouyomiClient', () => {
  it('話者は 1 から 8。速さは 100 が普通', () => {
    expect(listBouyomiStyleIds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(bouyomiSpeed(0)).toBe(100);
    expect(bouyomiSpeed(0.1)).toBe(110);
    expect(bouyomiTone(0.06)).toBe(130);
    expect(bouyomiTone(-0.06)).toBe(70);
  });

  it('HTTP が返れば起動している。接続拒否は落ちている', async () => {
    await expect(probeBouyomi({
      fetchFn: async () => ({ ok: false, status: 404 })
    })).resolves.toEqual({ ok: true, reason: '' });
    await expect(probeBouyomi({
      fetchFn: async () => { throw new Error('Failed to fetch'); }
    })).resolves.toEqual({ ok: false, reason: 'refused' });
  });

  it('話すのは再生のとき。止めると /Clear を送る', async () => {
    vi.useFakeTimers();
    const urls = [];
    const fetchFn = vi.fn(async (url) => {
      urls.push(String(url));
      return { ok: true, status: 200 };
    });
    const handle = await synthesizeBouyomi('こんにちは', {
      styleId: 2,
      pitchOffset: 0,
      speedOffset: 0
    }, { fetchFn, volumePercent: 80 });
    expect(fetchFn).not.toHaveBeenCalled();
    const done = handle.speak({});
    await vi.advanceTimersByTimeAsync(0);
    expect(urls[0]).toContain('/Talk');
    expect(urls[0]).toContain('voice=2');
    expect(urls[0]).toContain(encodeURIComponent('こんにちは'));
    handle.cancel();
    await vi.advanceTimersByTimeAsync(20000);
    await done;
    expect(urls.some((url) => url.endsWith('/Clear'))).toBe(true);
    vi.useRealTimers();
  });

  it('クエリはスラッシュを %2F にする', () => {
    expect(buildBouyomiUrl('http://127.0.0.1:50080', '/Talk', { text: 'a/b' })).toContain('a%2Fb');
  });
});
