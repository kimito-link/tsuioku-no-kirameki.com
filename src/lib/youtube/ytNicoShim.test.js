import { describe, it, expect } from 'vitest';
import { buildYtPersonResolver, ytRecordToNicoEntry, ytSummaryToNicoSnapshot } from '../../../extension-youtube/src/ytNicoShim.js';

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

describe('ytNameIndexOf(名前から人を引く表を、同じ記録では作り直さない・0.1.2011)', () => {
  it('同じ配列なら同じ表を返し、別の配列なら作り直す', async () => {
    const { ytNameIndexOf } = await import('../../../extension-youtube/src/ytNicoShim.js');
    const entries = [
      { userId: '9001', nickname: '@aaa', avatarUrl: 'https://yt3.ggpht.com/a' },
      { userId: '9002', nickname: '@bbb', avatarUrl: '' },
    ];
    const a = ytNameIndexOf(entries);
    expect(ytNameIndexOf(entries)).toBe(a);
    expect(a.size).toBe(2);
    const other = entries.slice();
    const b = ytNameIndexOf(other);
    expect(b).not.toBe(a);
    expect([...b.keys()]).toEqual([...a.keys()]);
  });

  it('配列でない入力は空の表(控えない)', async () => {
    const { ytNameIndexOf } = await import('../../../extension-youtube/src/ytNicoShim.js');
    expect(ytNameIndexOf(/** @type {any} */ (null)).size).toBe(0);
  });

  it('ytLeaderboardToKoken は表を使い回しても同じ答え', async () => {
    const { ytLeaderboardToKoken } = await import('../../../extension-youtube/src/ytNicoShim.js');
    const entries = [{ userId: '9001', nickname: '@aaa', avatarUrl: 'https://yt3.ggpht.com/a' }];
    const board = { capturedAt: 5, rows: [{ rank: 1, name: '@aaa', xp: 10, iconUrl: '' }] };
    const k1 = ytLeaderboardToKoken(board, entries, 'lv900000000001');
    const k2 = ytLeaderboardToKoken(board, entries, 'lv900000000001');
    expect(k2).toEqual(k1);
    expect(k1.rows[0].thumbnailUrl).toBe('https://yt3.ggpht.com/a');
  });
});

describe('さかのぼって読み足した過去分(skipVoice)', () => {
  it('記録時刻を書かれた時刻にし、skipVoice を会場へ渡す(いま来たコメント扱いにしない)', () => {
    const now = Date.now();
    const posted = now - 3 * 3600_000;
    const e = ytRecordToNicoEntry({ id: 'a', channelId: 'tw:1', name: 'A', text: 'x', recordedAt: now, postedAtMs: posted, skipVoice: true }, 0, 'lv900000000001', 'tw:1');
    expect(e.capturedAt).toBe(posted);
    expect(e.skipVoice).toBe(true);
  });
  it('絵文字の名前と画像は会場の行に残す', () => {
    const url = 'https://files.kick.com/emotes/6/fullsize';
    const e = ytRecordToNicoEntry({
      id: 'm', channelId: 'kk:1', name: 'A', text: 'collectiblesLMAO', recordedAt: 1,
      emotes: [{ name: 'collectiblesLMAO', url }, { name: 'nope', url: 'javascript:alert(1)' }],
    }, 0, 'lv900000000001', 'kk:1');
    expect(e.emotes).toEqual([{ name: 'collectiblesLMAO', url }]);
    expect(e.text).toBe('collectiblesLMAO');
  });
  it('フォローはシステム行のまま会場へ渡す', () => {
    const e = ytRecordToNicoEntry({
      id: 'f', channelId: 'tt:9', name: 'ファン', text: 'フォローしました', kind: 'follow',
      isSystem: true, commentType: 'followNotice', skipVoice: true, recordedAt: 50, postedAtMs: 40,
    }, 0, 'lv900000000001', 'tt:9');
    expect(e).toMatchObject({ ytKind: 'follow', isSystem: true, commentType: 'followNotice', skipVoice: true, text: 'フォローしました' });
  });
  it('開始時刻が目安のときはレポートの起点にしない', () => {
    const start = 1_700_000_000_000;
    expect(ytSummaryToNicoSnapshot({ startedAt: start, createdAt: start }, 'abcdefghijk', '', {}).programStartAtMs).toBe(start);
    expect(ytSummaryToNicoSnapshot({ startedAt: start, startedAtApprox: true, createdAt: start }, 'abcdefghijk', '', {}).programStartAtMs).toBeUndefined();
  });
  it('ふつうの新着は今まで通り受け取った時刻で、skipVoice は付かない', () => {
    const now = Date.now();
    const e = ytRecordToNicoEntry({ id: 'b', channelId: 'tw:1', name: 'A', text: 'x', recordedAt: now, postedAtMs: now - 2000 }, 0, 'lv900000000001', 'tw:1');
    expect(e.capturedAt).toBe(now);
    expect(e.skipVoice).toBeUndefined();
  });
});
