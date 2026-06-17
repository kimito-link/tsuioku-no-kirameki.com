import { describe, it, expect } from 'vitest';
import { buildPersonProfilesFromRows, isGiftRow } from './personProfiles.js';

describe('isGiftRow (gift 判定の正本・userLaneCandidatesFromStorage と同一基準)', () => {
  it('isGift===true / gift!=null / kind==="gift" のいずれかで true', () => {
    expect(isGiftRow({ isGift: true })).toBe(true);
    expect(isGiftRow({ gift: { item: 'x' } })).toBe(true);
    expect(isGiftRow({ gift: 0 })).toBe(true); // != null なので 0 でも gift 扱い(基準を厳密に踏襲)
    expect(isGiftRow({ kind: 'gift' })).toBe(true);
  });
  it('通常コメントは false', () => {
    expect(isGiftRow({ text: 'こんにちは' })).toBe(false);
    expect(isGiftRow({ isGift: false, gift: null, kind: 'normal' })).toBe(false);
    expect(isGiftRow(null)).toBe(false);
  });
});

describe('buildPersonProfilesFromRows', () => {
  const rows = [
    { userId: '123', nickname: 'たろう', text: 'やあ', capturedAt: 10, liveId: 'lv1' },
    { userId: '123', text: 'またね', capturedAt: 30, liveId: 'lv1' },
    { userId: '123', text: 'プレゼント', capturedAt: 20, liveId: 'lv1', kind: 'gift' },
    { userId: 'a:anon', text: '匿名コメ', capturedAt: 15, liveId: 'lv1' },
    { userId: '', text: 'userId無し', capturedAt: 5, liveId: 'lv1' },
    { userId: '999', text: '別放送', capturedAt: 99, liveId: 'lv2' }
  ];

  it('userId 単位に畳み込み、コメント数とギフト数を分けて数える', () => {
    const m = buildPersonProfilesFromRows(rows, 'lv1');
    const taro = m.get('123');
    expect(taro).toBeTruthy();
    expect(taro.commentCount).toBe(2); // やあ・またね
    expect(taro.giftCount).toBe(1); // プレゼント
    expect(taro.nickname).toBe('たろう');
  });

  it('userId が無い行は除外する(来場者数 PV と同じく人物に固定できない)', () => {
    const m = buildPersonProfilesFromRows(rows, 'lv1');
    // userId 無し行は1件あるが、どの人物にも入らない
    const total = [...m.values()].reduce((n, p) => n + p.commentCount + p.giftCount, 0);
    // lv1 の userId 付き: 123 が comment2+gift1=3, a:anon が comment1=1 → 計4
    expect(total).toBe(4);
  });

  it('liveId 指定で別放送の行を混ぜない', () => {
    const m = buildPersonProfilesFromRows(rows, 'lv1');
    expect(m.has('999')).toBe(false); // lv2 の人は入らない
    const m2 = buildPersonProfilesFromRows(rows, 'lv2');
    expect(m2.has('999')).toBe(true);
    expect(m2.has('123')).toBe(false);
  });

  it('匿名(a:)も数値IDと同じく人物として畳み込む', () => {
    const m = buildPersonProfilesFromRows(rows, 'lv1');
    const anon = m.get('a:anon');
    expect(anon).toBeTruthy();
    expect(anon.commentCount).toBe(1);
  });

  it('recentComments は capturedAt 新しい順に cap される', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      userId: 'u', text: `c${i}`, capturedAt: i, liveId: 'lv1'
    }));
    const m = buildPersonProfilesFromRows(many, 'lv1', { maxRecentComments: 3 });
    const p = m.get('u');
    expect(p.recentComments.length).toBe(3);
    expect(p.recentComments.map((c) => c.text)).toEqual(['c7', 'c6', 'c5']); // 新しい順
    expect(p.commentCount).toBe(8); // 件数は cap されない
  });

  it('lastActionAt は最後のアクション時刻', () => {
    const m = buildPersonProfilesFromRows(rows, 'lv1');
    expect(m.get('123').lastActionAt).toBe(30);
  });

  it('contributionScore は opts から注入できる(保存行には無い=推測で読まない)', () => {
    const m = buildPersonProfilesFromRows(rows, 'lv1', {
      contributionScoreByUserId: { '123': 4200 }
    });
    expect(m.get('123').contributionScore).toBe(4200);
    expect(m.get('a:anon').contributionScore).toBeUndefined();
  });

  it('新規 storage 書き込みゼロ: 引数 rows を変更しない(純関数)', () => {
    const snapshot = JSON.stringify(rows);
    buildPersonProfilesFromRows(rows, 'lv1', { maxRecentComments: 2 });
    expect(JSON.stringify(rows)).toBe(snapshot); // 入力不変
  });

  it('空入力・不正入力でも落ちない(fail-open)', () => {
    expect(buildPersonProfilesFromRows([], 'lv1').size).toBe(0);
    expect(buildPersonProfilesFromRows(null, 'lv1').size).toBe(0);
    expect(buildPersonProfilesFromRows(undefined, undefined).size).toBe(0);
  });

  it('liveId 省略時は放送で絞らず全行を畳み込む', () => {
    const m = buildPersonProfilesFromRows(rows, '');
    expect(m.has('123')).toBe(true);
    expect(m.has('999')).toBe(true); // lv2 も入る
  });
});
