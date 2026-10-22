import { describe, it, expect, vi } from 'vitest';
import { createPhoneVoiceSender, bytesToBase64 } from './phoneVoiceSender.js';

const deps = (over = {}) => ({
  listStyleIds: vi.fn(async () => [3, 8]),
  loadSettings: vi.fn(async () => ({ assignments: {}, readName: false })),
  synth: vi.fn(async () => new ArrayBuffer(8)),
  encode: vi.fn(async () => new Uint8Array([79, 103, 103, 83])),
  post: vi.fn(async () => true),
  now: () => 1_000_000,
  ...over
});
const rows = (...nos) => nos.map((no) => ({ no: String(no), text: `c${no}`, userId: `u${no}`, name: `N${no}` }));

describe('createPhoneVoiceSender', () => {
  it('最初は覚えるだけ・2回目から新しいコメントを声にして送る', async () => {
    const d = deps();
    const s = createPhoneVoiceSender(d);
    expect(await s.tick({ wanted: true, liveId: 'lv1', rows: rows(1, 2) })).toBe(0);
    expect(await s.tick({ wanted: true, liveId: 'lv1', rows: rows(1, 2, 3) })).toBe(1);
    expect(d.post).toHaveBeenCalledWith({ no: '3', ogg: 'T2dnUw==' });
    expect(d.synth.mock.calls[0][0]).toBe('c3');
    expect(s.state()).toBe('ok');
  });
  it('名前読みが ON なら名前も読む', async () => {
    const d = deps({ loadSettings: async () => ({ readName: true }) });
    const s = createPhoneVoiceSender(d);
    await s.tick({ wanted: true, rows: rows(1) });
    await s.tick({ wanted: true, rows: rows(1, 2) });
    expect(d.synth.mock.calls[0][0]).toBe('N2、c2');
  });
  it('欲しがられなくなったら忘れる(次の ON で過去を読まない)・配信が変わっても忘れる', async () => {
    const d = deps();
    const s = createPhoneVoiceSender(d);
    await s.tick({ wanted: true, liveId: 'a', rows: rows(1) });
    await s.tick({ wanted: false });
    expect(await s.tick({ wanted: true, liveId: 'a', rows: rows(1, 2) })).toBe(0);
    expect(await s.tick({ wanted: true, liveId: 'b', rows: rows(5) })).toBe(0);
    expect(d.post).not.toHaveBeenCalled();
  });
  it('VOICEVOX が動いていなければ voicevox_down・縮められなければ no_encoder', async () => {
    const down = createPhoneVoiceSender(deps({ listStyleIds: async () => [] }));
    await down.tick({ wanted: true, rows: rows(1) });
    await down.tick({ wanted: true, rows: rows(1, 2) });
    expect(down.state()).toBe('voicevox_down');
    const noEnc = createPhoneVoiceSender(deps({ encode: async () => null }));
    await noEnc.tick({ wanted: true, rows: rows(1) });
    await noEnc.tick({ wanted: true, rows: rows(1, 2) });
    expect(noEnc.state()).toBe('no_encoder');
  });
  it('bytesToBase64', () => {
    expect(bytesToBase64(new Uint8Array([1, 2, 3]))).toBe('AQID');
  });
});
