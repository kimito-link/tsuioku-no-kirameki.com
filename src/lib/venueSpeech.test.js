import { describe, expect, it } from 'vitest';
import {
  venueSpeechKey,
  venueSpeakerKey,
  pickNewVenueSpeech,
  mergeSpeakersIntoVenueRows,
  liveFeedSpeechRows
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

  it('primeEmit 指定で初回に直近N件だけ吹き出す(過疎番組対策)', () => {
    const rows = [
      { commentNo: 1, userId: 'a', name: 'A', text: '古い1' },
      { commentNo: 2, userId: 'b', name: 'B', text: '古い2' },
      { commentNo: 3, userId: 'c', name: 'C', text: '直近1' },
      { commentNo: 4, userId: 'd', name: 'D', text: '直近2' }
    ];
    const r = pickNewVenueSpeech(rows, { primed: false }, { primeEmit: 2 });
    // 直近2件(no:3,4)だけ吹き出す。古い2件は吹き出さない。
    expect(r.speeches.map((s) => s.key)).toEqual(['no:3', 'no:4']);
    expect(r.primed).toBe(true);
    // 古い分は seen 済み=二度と出ない
    expect(r.seenKeys.has('no:1')).toBe(true);
    expect(r.seenKeys.has('no:2')).toBe(true);
  });

  it('primeEmit 後の2回目は新着だけ(直近分は再度出ない)', () => {
    const rows1 = [{ commentNo: 1, userId: 'a', name: 'A', text: '直近' }];
    const s1 = pickNewVenueSpeech(rows1, { primed: false }, { primeEmit: 3 });
    expect(s1.speeches).toHaveLength(1); // 初回に直近1件
    const rows2 = [...rows1, { commentNo: 2, userId: 'b', name: 'B', text: '新着' }];
    const s2 = pickNewVenueSpeech(rows2, s1, { primeEmit: 3 });
    expect(s2.speeches.map((x) => x.key)).toEqual(['no:2']); // 新着だけ・直近1件は再出しない
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

describe('liveFeedSpeechRows (v0.1.752 リアルタイム吹き出しの安全フィルタ)', () => {
  // リアルタイム経路(persistCommentRows の in-memory tap)は commentNo を持つ行だけに絞る。
  //   理由: 同じコメントが後から storage 経路でも届く。両経路でキーが一致しないと二度吹き出す。
  //   commentNo を持つ行は両経路とも venueSpeechKey='no:<commentNo>' で一致=dedup が効く。
  //   commentNo を持たない行(DOM harvest で no 未取得等)は storage 経路に任せる(従来どおり)。
  it('commentNo を持つ行だけ通す', () => {
    const rows = [
      { commentNo: 42, userId: 'a', nickname: 'A', text: 'hi' },
      { userId: 'b', text: 'no が無い' },
      { no: 7, userId: 'c', text: 'no エイリアスも可' }
    ];
    const out = liveFeedSpeechRows(rows);
    expect(out).toHaveLength(2);
    expect(out.map((r) => venueSpeechKey(r))).toEqual(['no:42', 'no:7']);
  });

  it('commentNo を持たない行だけなら空(=storage 経路に委ねる)', () => {
    expect(liveFeedSpeechRows([{ userId: 'a', text: 'x' }, { text: 'y' }])).toEqual([]);
  });

  it('非配列・空・null は安全に空配列', () => {
    expect(liveFeedSpeechRows(null)).toEqual([]);
    expect(liveFeedSpeechRows(undefined)).toEqual([]);
    expect(liveFeedSpeechRows([])).toEqual([]);
  });

  it('commentNo が空文字/空白も除外(無効キーを作らない)', () => {
    const out = liveFeedSpeechRows([
      { commentNo: '', userId: 'a', text: 'x' },
      { commentNo: '   ', userId: 'b', text: 'y' },
      { commentNo: 99, userId: 'c', text: 'z' }
    ]);
    expect(out.map((r) => venueSpeechKey(r))).toEqual(['no:99']);
  });
});

describe('クロスソース dedup 不変条件(リアルタイム経路→storage経路で二度吹き出さない)', () => {
  // 設計の要: 同じコメントがライブ tap(~T+0)と storage poll(~T+1.5s)の両方で届くが、
  //   両経路が共有する speechState.seenKeys により2度目は弾かれ、吹き出しは1回だけ。
  it('同一commentNoがライブ経路→storage経路で来ても吹き出しは1回だけ', () => {
    // prime(初回シードで空) → ライブ到着 → 同じコメントの storage 形(name付き)到着
    const s0 = pickNewVenueSpeech([], { primed: false });

    // ライブ経路: ParsedCommentRow 形(nickname 持ち・name 無し)
    const liveRow = { commentNo: 42, userId: 'u1', nickname: 'A', text: 'やあ', capturedAt: 123 };
    const s1 = pickNewVenueSpeech([liveRow], s0);
    expect(s1.speeches.map((x) => x.key)).toEqual(['no:42']); // ライブで1回吹く

    // storage 経路: summary.recent 形(name 持ち・余分フィールド)同一 commentNo
    const storageRow = { commentNo: 42, id: 'abc', userId: 'u1', name: 'A', text: 'やあ', capturedAt: 123 };
    const s2 = pickNewVenueSpeech([storageRow], s1);
    expect(s2.speeches).toHaveLength(0); // 2度目は seenKeys で弾く=二重吹き出し無し
  });

  it('venueSpeechKey はライブ形(nickname)と storage形(name)で同一キー(no:N)', () => {
    const live = { commentNo: 42, userId: 'u1', nickname: 'A', text: 'やあ' };
    const stored = { commentNo: 42, id: 'abc', userId: 'u1', name: 'A', text: 'やあ', capturedAt: 9 };
    expect(venueSpeechKey(live)).toBe('no:42');
    expect(venueSpeechKey(stored)).toBe('no:42');
    // no エイリアスも同一
    expect(venueSpeechKey({ no: 42 })).toBe('no:42');
  });
});
