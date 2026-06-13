import { describe, expect, it } from 'vitest';
import {
  venueSpeechKey,
  venueSpeakerKey,
  pickNewVenueSpeech,
  mergeSpeakersIntoVenueRows
} from './venueSpeech.js';

describe('venueSpeechKey', () => {
  it('commentNo を最優先キーにする', () => {
    expect(venueSpeechKey({ commentNo: 42, text: 'a' })).toBe('no:42');
  });
  it('commentNo 無しは id', () => {
    expect(venueSpeechKey({ id: 'x9', text: 'a' })).toBe('id:x9');
  });
  it('どちらも無ければ合成キー', () => {
    expect(venueSpeechKey({ userId: 'u1', text: 'やあ', capturedAt: 100 })).toBe('c:u1:やあ:100');
  });
});

describe('venueSpeakerKey', () => {
  it('userId 優先', () => {
    expect(venueSpeakerKey({ userId: '5', name: 'A' })).toBe('u:5');
  });
  it('userId 無しは name', () => {
    expect(venueSpeakerKey({ name: 'A' })).toBe('n:A');
  });
  it('どちらも無ければ空', () => {
    expect(venueSpeakerKey({ text: 'x' })).toBe('');
  });
});

describe('pickNewVenueSpeech', () => {
  it('初回は一切吹き出さず全キーをシードする(初回フラッシュ防止)', () => {
    const rows = [
      { commentNo: 1, userId: 'a', name: 'A', text: '過去1' },
      { commentNo: 2, userId: 'b', name: 'B', text: '過去2' }
    ];
    const r = pickNewVenueSpeech(rows, { primed: false });
    expect(r.speeches).toEqual([]); // 過去ログは飛ばさない
    expect(r.primed).toBe(true);
    expect(r.seenKeys.has('no:1')).toBe(true);
    expect(r.seenKeys.has('no:2')).toBe(true);
  });

  it('2回目以降は新着だけ吹き出す', () => {
    const rows1 = [{ commentNo: 1, userId: 'a', name: 'A', text: '過去' }];
    const s1 = pickNewVenueSpeech(rows1, { primed: false });
    // 新着が1件届いた
    const rows2 = [
      { commentNo: 1, userId: 'a', name: 'A', text: '過去' },
      { commentNo: 2, userId: 'b', name: 'B', text: '新着!' }
    ];
    const s2 = pickNewVenueSpeech(rows2, s1);
    expect(s2.speeches).toHaveLength(1);
    expect(s2.speeches[0]).toMatchObject({
      key: 'no:2',
      speakerKey: 'u:b',
      name: 'B',
      text: '新着!'
    });
  });

  it('同じ新着を二度吹き出さない', () => {
    const rows1 = [{ commentNo: 1, userId: 'a', name: 'A', text: 'x' }];
    const s1 = pickNewVenueSpeech(rows1, { primed: false });
    const rows2 = [...rows1, { commentNo: 2, userId: 'b', name: 'B', text: 'new' }];
    const s2 = pickNewVenueSpeech(rows2, s1);
    expect(s2.speeches).toHaveLength(1);
    // 同じ配列で再度呼んでも新着なし
    const s3 = pickNewVenueSpeech(rows2, s2);
    expect(s3.speeches).toHaveLength(0);
  });

  it('テキストの無い行は吹き出さない', () => {
    const s1 = pickNewVenueSpeech([{ commentNo: 1, userId: 'a', name: 'A', text: 'x' }], { primed: false });
    const s2 = pickNewVenueSpeech(
      [
        { commentNo: 1, userId: 'a', name: 'A', text: 'x' },
        { commentNo: 2, userId: 'b', name: 'B', text: '   ' } // 空白のみ
      ],
      s1
    );
    expect(s2.speeches).toHaveLength(0);
  });

  it('席に紐付けられない発言者(無名)は吹き出さない', () => {
    const s1 = pickNewVenueSpeech([{ commentNo: 1, userId: 'a', name: 'A', text: 'x' }], { primed: false });
    const s2 = pickNewVenueSpeech(
      [
        { commentNo: 1, userId: 'a', name: 'A', text: 'x' },
        { commentNo: 2, text: '名無しの発言' } // userId も name も無い
      ],
      s1
    );
    expect(s2.speeches).toHaveLength(0);
  });

  it('同時多発は maxEmit 件に制限する', () => {
    const s1 = pickNewVenueSpeech([], { primed: false });
    const burst = [];
    for (let i = 0; i < 20; i++) {
      burst.push({ commentNo: i + 1, userId: `u${i}`, name: `U${i}`, text: `c${i}` });
    }
    const s2 = pickNewVenueSpeech(burst, s1, { maxEmit: 8 });
    expect(s2.speeches).toHaveLength(8);
    // 最新側(末尾)が残る
    expect(s2.speeches[s2.speeches.length - 1].key).toBe('no:20');
  });

  it('非配列・空でも安全', () => {
    const r = pickNewVenueSpeech(null, { primed: false });
    expect(r.speeches).toEqual([]);
    expect(r.primed).toBe(true);
  });
});

describe('mergeSpeakersIntoVenueRows', () => {
  it('会場に居ない発言者を新規に席へ追加(now で最優先)', () => {
    const base = [{ userId: 'a', name: 'A', capturedAt: 100 }];
    const speeches = [{ userId: 'b', name: 'B', text: 'やあ' }];
    const merged = mergeSpeakersIntoVenueRows(base, speeches, 9999);
    expect(merged).toHaveLength(2);
    const b = merged.find((r) => r.userId === 'b');
    expect(b.capturedAt).toBe(9999);
    expect(b.name).toBe('B');
  });

  it('既に居る人がしゃべったら capturedAt を now に更新(重複行を作らない)', () => {
    const base = [{ userId: 'a', name: 'A', capturedAt: 100 }];
    const speeches = [{ userId: 'a', name: 'A', text: 'また発言' }];
    const merged = mergeSpeakersIntoVenueRows(base, speeches, 5000);
    expect(merged).toHaveLength(1);
    expect(merged[0].capturedAt).toBe(5000);
  });

  it('匿名(userIdあり・名前なし)もマージする', () => {
    const merged = mergeSpeakersIntoVenueRows([], [{ userId: 'x', name: '', text: 'y' }], 7);
    expect(merged).toHaveLength(1);
    expect(merged[0].userId).toBe('x');
  });

  it('userId も name も無い発言者は無視', () => {
    const merged = mergeSpeakersIntoVenueRows([], [{ text: '名無し' }], 7);
    expect(merged).toHaveLength(0);
  });

  it('非配列でも安全', () => {
    expect(mergeSpeakersIntoVenueRows(null, null, 0)).toEqual([]);
  });
});
