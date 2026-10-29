import { describe, it, expect, vi } from 'vitest';
import { createPhoneVoiceSender, bytesToBase64, PHONE_VOICE_BACKLOG_MAX } from './phoneVoiceSender.js';

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
  it('絵文字だけのコメントは飛ばし、VOICEVOX 停止扱いにしない(v0.1.1810)', async () => {
    const d = deps();
    const s = createPhoneVoiceSender(d);
    await s.tick({ wanted: true, liveId: 'lv1', rows: rows(1) });
    const r = [...rows(1), { no: '2', text: '😂😂', userId: 'u2', name: 'N2' }, ...rows(3)];
    expect(await s.tick({ wanted: true, liveId: 'lv1', rows: r })).toBe(1);
    expect(d.synth).toHaveBeenCalledTimes(1);
    expect(d.synth.mock.calls[0][0]).toBe('c3');
    expect(s.state()).toBe('ok');
  });
  it('コメビュで NG にした人は声にしない(v0.1.1812)', async () => {
    const d = deps({ loadSettings: async () => ({ ngKeys: new Set(['u:u2']) }) });
    const s = createPhoneVoiceSender(d);
    await s.tick({ wanted: true, liveId: 'lv1', rows: rows(1) });
    expect(await s.tick({ wanted: true, liveId: 'lv1', rows: rows(1, 2, 3) })).toBe(1);
    expect(d.synth).toHaveBeenCalledTimes(1);
    expect(d.synth.mock.calls[0][0]).toBe('c3');
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
  it('v0.1.1743: 1回に6件以上来ても読み捨てない(上限8まで)・溢れたら古い方を捨てる', async () => {
    const d = deps();
    const s = createPhoneVoiceSender(d);
    await s.tick({ wanted: true, rows: rows(1) });
    expect(await s.tick({ wanted: true, rows: rows(1, 2, 3, 4, 5, 6, 7, 8) })).toBe(7);
    expect(await s.tick({ wanted: true, rows: rows(...Array.from({ length: 20 }, (_, i) => i + 1)) })).toBe(PHONE_VOICE_BACKLOG_MAX);
    expect(d.post.mock.calls.at(-1)[0].no).toBe('20');
    expect(d.post.mock.calls.at(-PHONE_VOICE_BACKLOG_MAX)[0].no).toBe('13');
  });
  it('v0.1.1743: 合成中に来た新着は飛ばさず、その回のうちに続けて読む', async () => {
    /** @type {() => void} */
    let release = () => {};
    let first = true;
    const d = deps({
      synth: vi.fn(async () => {
        if (first) { first = false; await new Promise((r) => { release = () => r(undefined); }); }
        return new ArrayBuffer(8);
      })
    });
    const s = createPhoneVoiceSender(d);
    await s.tick({ wanted: true, rows: rows(1) });
    const running = s.tick({ wanted: true, rows: rows(1, 2) });
    await new Promise((r) => setTimeout(r, 0)); // 1件目の合成の途中まで進める
    expect(await s.tick({ wanted: true, rows: rows(1, 2, 3) })).toBe(0);
    release();
    expect(await running).toBe(2);
    expect(d.post.mock.calls.map((c) => c[0].no)).toEqual(['2', '3']);
  });
  it('v0.1.1746: 声にならなかった内訳を数える(溢れ・番号なし・失敗・送れた数)', async () => {
    const d = deps({ post: vi.fn(async (c) => c.no !== '3') });
    const s = createPhoneVoiceSender(d);
    await s.tick({ wanted: true, rows: rows(1) });
    await s.tick({ wanted: true, rows: [...rows(1, 2, 3), { text: '番号なし' }] });
    expect(s.stats()).toMatchObject({ ticks: 2, picked: 2, overflow: 0, noNumber: 1, failed: 1, sent: 1, pending: 0 });
    await s.tick({ wanted: true, rows: rows(...Array.from({ length: 13 }, (_, i) => i + 1)) });
    expect(s.stats()).toMatchObject({ picked: 12, overflow: 2, noNumber: 0 });
  });
  it('bytesToBase64', () => {
    expect(bytesToBase64(new Uint8Array([1, 2, 3]))).toBe('AQID');
  });
});
