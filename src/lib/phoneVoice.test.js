import { describe, it, expect } from 'vitest';
import {
  validateVoiceClip,
  pickVoiceClipsAfter,
  pickNewVoiceRows,
  enqueuePhoneVoice,
  phoneVoiceKeys,
  PHONE_VOICE_MAX_B64
} from './phoneVoice.js';

describe('validateVoiceClip', () => {
  it('番号と base64 がそろえば通す', () => {
    expect(validateVoiceClip({ no: 12, ogg: 'T2dnUw==' })).toEqual({ no: '12', b64: 'T2dnUw==' });
  });
  it('番号なし・base64 でない・大きすぎは捨てる', () => {
    expect(validateVoiceClip(null)).toBeNull();
    expect(validateVoiceClip({ no: 'x', ogg: 'AA==' })).toBeNull();
    expect(validateVoiceClip({ no: 1, ogg: '<script>' })).toBeNull();
    expect(validateVoiceClip({ no: 1, ogg: 'A'.repeat(PHONE_VOICE_MAX_B64 + 1) })).toBeNull();
  });
});

describe('pickVoiceClipsAfter', () => {
  const item = (no) => JSON.stringify({ no, ogg: 'AAAA' });
  it('after より後を古い順に・壊れた1件と重複は捨てる', () => {
    const raw = [item(5), '{壊れ', item(4), item(3), item(5)];
    expect(pickVoiceClipsAfter(raw, '3').map((c) => c.no)).toEqual(['4', '5']);
  });
  it('after が空なら全部', () => {
    expect(pickVoiceClipsAfter([item(2), item(1)], '').map((c) => c.no)).toEqual(['1', '2']);
  });
  it('配列でなければ空', () => {
    expect(pickVoiceClipsAfter(null, '')).toEqual([]);
  });
});

describe('pickNewVoiceRows', () => {
  const rows = [
    { no: 1, text: 'a', userId: 'u1', name: 'A' },
    { no: 2, text: 'b' },
    { no: 3, kind: 'gift', text: 'g' },
    { text: '番号なし' },
    { no: 4, text: '  ' }
  ];
  it('最初の1回は覚えるだけ', () => {
    const r = pickNewVoiceRows({ rows, seen: null });
    expect(r.picks).toEqual([]);
    expect([...r.seen]).toEqual(['1', '2']);
  });
  it('2回目からは新しい行だけ・最大 max 件(新しい方)', () => {
    const { seen } = pickNewVoiceRows({ rows, seen: null });
    const more = [...rows, { no: 5, text: 'c' }, { no: 6, text: 'd' }, { no: 7, text: 'e', userId: 'u7', name: 'E' }];
    const r = pickNewVoiceRows({ rows: more, seen, max: 2 });
    expect(r.picks.map((p) => p.no)).toEqual(['6', '7']);
    expect(r.picks[1]).toEqual({ no: '7', userId: 'u7', name: 'E', text: 'e' });
    expect(r.seen.has('5')).toBe(true);
  });
});

describe('enqueuePhoneVoice', () => {
  it('重複は足さず、溜まりすぎたら古い方を捨てる', () => {
    const q = enqueuePhoneVoice([{ no: '1' }], [{ no: '1' }, { no: '2' }, { no: '3' }], 2);
    expect(q.map((c) => c.no)).toEqual(['2', '3']);
  });
});

describe('phoneVoiceKeys', () => {
  it('キー名', () => {
    expect(phoneVoiceKeys.list('t')).toBe('voice:list:t');
    expect(phoneVoiceKeys.want('t')).toBe('voice:want:t');
    expect(phoneVoiceKeys.quota('d', '20261022')).toBe('quota:voice:d:20261022');
  });
});
