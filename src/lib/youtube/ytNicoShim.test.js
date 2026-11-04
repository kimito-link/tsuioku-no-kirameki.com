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

describe('ytLeaderboardToKoken', () => {
  it('トップファンの @handle を記録の同じ名前の人に結びつけ、XP を貢献度にする', async () => {
    const { ytLeaderboardToKoken } = await import('../../../extension-youtube/src/ytNicoShim.js');
    const entries = [{ userId: '8123456789', nickname: '@yk-ve8dk', avatarUrl: 'https://yt3.ggpht.com/x' }];
    const k = ytLeaderboardToKoken(
      { capturedAt: 1, rows: [{ rank: 1, name: '@yk-ve8dk', xp: 84480, iconUrl: '' }, { rank: 2, name: '@ねる茶', xp: 81605, iconUrl: '' }] },
      entries,
      'lv900000000001',
    );
    // 数字IDを付けない(XP がレーンの 🎁 やギフト列に結びつかないように)
    expect(k?.rows[0].userPageUrl).toBeUndefined();
    expect(k?.rows[0].contribution).toBe(84480);
    expect(k?.rows[0].thumbnailUrl).toBe('https://yt3.ggpht.com/x');
    expect(k?.rows[1].name).toBe('@ねる茶');
  });
});

describe('ytStableOrder(一度並べたコメントの順を変えない・ちらつき対策)', () => {
  it('途中に後から入った行は最後に回し、前に並べた行の位置を変えない', async () => {
    const { ytStableOrder } = await import('../../../extension-youtube/src/ytNicoShim.js');
    const lv = 'lv900000000777';
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' }, x = { id: 'x' };
    expect(ytStableOrder(lv, [a, b, c]).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    // x が a と b の間に入ってきても、a,b,c の位置は変わらず x は最後
    expect(ytStableOrder(lv, [a, x, b, c]).map((r) => r.id)).toEqual(['a', 'b', 'c', 'x']);
    const d = { id: 'd' };
    expect(ytStableOrder(lv, [a, x, b, c, d]).map((r) => r.id)).toEqual(['a', 'b', 'c', 'x', 'd']);
  });
});

describe('ytOwnerRowsLast(配信者のコメントを最後に回す)', () => {
  it('owner バッジ・配信者の UC… の行は最後、ほかの順は変えない', async () => {
    const { ytOwnerRowsLast } = await import('../../../extension-youtube/src/ytNicoShim.js');
    const rows = [{ id: 'a' }, { id: 'o', badges: ['owner'] }, { id: 'b' }, { id: 'c', channelId: 'UCown' }, { id: 'd' }];
    expect(ytOwnerRowsLast(rows, { broadcasterChannelId: 'UCown' }).map((r) => r.id)).toEqual(['a', 'b', 'd', 'o', 'c']);
    expect(ytOwnerRowsLast([{ id: 'a' }], {}).map((r) => r.id)).toEqual(['a']);
  });
});

describe('コメントの番号(会場・コメビュの「もう読んだか」)', () => {
  it('配信者の行を最後に回しても、新しいコメントが来ても、同じコメントの番号は変わらない', async () => {
    const { ytStableOrder, ytOwnerRowsLast, ytStableNoOf, ytRecordToNicoEntry } = await import('../../../extension-youtube/src/ytNicoShim.js');
    const lv = 'lv900000000777';
    const sum = { broadcasterChannelId: 'UCowner' };
    const mk = (id, ch) => ({ id, channelId: ch, name: id, text: id });
    const nosOf = (list) => {
      const ordered = ytOwnerRowsLast(ytStableOrder(lv, list), sum);
      return Object.fromEntries(ordered.map((r, i) => [r.id, ytRecordToNicoEntry(r, i, lv, r.channelId, ytStableNoOf(lv, r)).commentNo]));
    };
    const first = nosOf([mk('a', 'UC1'), mk('own', 'UCowner'), mk('b', 'UC2')]);
    const second = nosOf([mk('a', 'UC1'), mk('own', 'UCowner'), mk('b', 'UC2'), mk('c', 'UC3')]);
    expect(second.a).toBe(first.a);
    expect(second.own).toBe(first.own);
    expect(second.b).toBe(first.b);
    expect(new Set(Object.values(second)).size).toBe(4);
  });
});
