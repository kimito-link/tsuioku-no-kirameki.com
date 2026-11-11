import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildYukariCommandUrl,
  listYukariStyleIds,
  parseYukariVoices,
  probeYukari,
  resetYukariStyleCache,
  synthesizeYukari
} from './yukariClient.js';

describe('yukariClient', () => {
  beforeEach(() => resetYukariStyleCache());

  it('声の一覧は文字列の配列。壊れた形は空。ささやきは除く', () => {
    const rows = parseYukariVoices(['東北ずん子/VOICEVOX', 'ささやき', '']);
    expect(rows.map((row) => row.name)).toEqual(['東北ずん子/VOICEVOX']);
    expect(parseYukariVoices({ error: true })).toEqual([]);
  });

  it('プラグインが拒否したら http-error。接続拒否は refused', async () => {
    await expect(probeYukari({
      fetchFn: async () => ({ ok: false, status: 403 })
    })).resolves.toEqual({ ok: false, reason: 'http-error' });
    await expect(probeYukari({
      fetchFn: async () => { throw new Error('ECONNREFUSED'); }
    })).resolves.toEqual({ ok: false, reason: 'refused' });
  });

  it('Engine のスラッシュは %2F。話すのは再生のとき', async () => {
    expect(buildYukariCommandUrl('http://127.0.0.1:11900', 'speech', { Engine: 'キャラ/エンジン' }))
      .toContain('Engine=%E3%82%AD%E3%83%A3%E3%83%A9%2F%E3%82%A8%E3%83%B3%E3%82%B8%E3%83%B3');
    vi.useFakeTimers();
    const urls = [];
    const fetchFn = async (url) => {
      urls.push(String(url));
      if (String(url).includes('command=device')) {
        return { ok: true, status: 200, json: async () => ['キャラ/エンジン'] };
      }
      return { ok: true, status: 200, json: async () => ({ status: 'sended' }) };
    };
    const ids = await listYukariStyleIds({ fetchFn });
    const handle = await synthesizeYukari('やあ', { styleId: ids[0], speedOffset: 0 }, { fetchFn });
    const done = handle.speak({});
    await vi.advanceTimersByTimeAsync(0);
    const talk = urls.find((url) => url.includes('command=speech'));
    expect(talk).toContain('Text=');
    expect(talk).toContain('%2F');
    handle.cancel();
    await vi.advanceTimersByTimeAsync(20000);
    await done;
    expect(urls.some((url) => url.includes('command=stop'))).toBe(true);
    vi.useRealTimers();
  });
});
