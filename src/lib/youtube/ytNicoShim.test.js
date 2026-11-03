import { describe, it, expect } from 'vitest';
import { buildYtPersonResolver, ytRecordToNicoEntry } from '../../../extension-youtube/src/ytNicoShim.js';

const UC = 'UCz6LkxZaaaaaaaaaaximANA';

describe('buildYtPersonResolver', () => {
  it('同じ名前で UC… が分かっている人は、handle: だけの記録も同じ人にまとめる', () => {
    const items = [
      { channelId: UC, name: '@jptk6645', iconUrl: 'https://yt3.ggpht.com/a' },
      { channelId: 'handle:@jptk6645', name: '@jptk6645', iconUrl: '' },
      { channelId: '', name: 'jptk6645', iconUrl: '' },
    ];
    const who = buildYtPersonResolver(items);
    const uids = items.map((r, i) => ytRecordToNicoEntry(r, i, 'lv900000000001', who.keyOf(r)).userId);
    expect(new Set(uids).size).toBe(1);
    expect(who.iconOf(who.keyOf(items[1]))).toBe('https://yt3.ggpht.com/a');
  });

  it('名前が違う人はまとめない', () => {
    const items = [
      { channelId: UC, name: '@a' },
      { channelId: 'handle:@b', name: '@b' },
    ];
    const who = buildYtPersonResolver(items);
    expect(who.keyOf(items[0])).not.toBe(who.keyOf(items[1]));
  });
});
