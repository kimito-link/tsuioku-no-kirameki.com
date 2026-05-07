import { describe, it, expect } from 'vitest';
import { mergeGiftUserThrowEvents, mergeGiftUsers } from './giftRecord.js';

describe('mergeGiftUserThrowEvents', () => {
  it('空 existing に同一 userId が複数でも throwCount が加算される', () => {
    const { next, added, storageTouched } = mergeGiftUserThrowEvents(
      [],
      [{ userId: '111', nickname: 'A' }, { userId: '111', nickname: 'A' }, { userId: '222', nickname: 'B' }]
    );
    expect(storageTouched).toBe(true);
    expect(added).toHaveLength(2);
    const byId = new Map(next.map((u) => [u.userId, u]));
    expect(byId.get('111')?.throwCount).toBe(2);
    expect(byId.get('222')?.throwCount).toBe(1);
  });

  it('既存 throwCount に incoming 件数分を加算', () => {
    const existing = [
      { userId: '111', nickname: 'X', capturedAt: 1000, throwCount: 3 }
    ];
    const { next, storageTouched } = mergeGiftUserThrowEvents(existing, [
      { userId: '111', nickname: 'Y' },
      { userId: '111', nickname: 'Y' }
    ]);
    expect(storageTouched).toBe(true);
    expect(next).toHaveLength(1);
    expect(next[0].throwCount).toBe(5);
    expect(next[0].nickname).toBe('X');
  });

  it('既存ニックネームが空なら incoming で補完', () => {
    const { next, storageTouched } = mergeGiftUserThrowEvents(
      [{ userId: '111', nickname: '', capturedAt: 1, throwCount: 1 }],
      [{ userId: '111', nickname: '新名' }]
    );
    expect(storageTouched).toBe(true);
    expect(next[0].nickname).toBe('新名');
    expect(next[0].throwCount).toBe(2);
  });

  it('既存ニックネームがあれば上書きしない', () => {
    const { next, storageTouched } = mergeGiftUserThrowEvents(
      [{ userId: '111', nickname: '既存', capturedAt: 1, throwCount: 2 }],
      [{ userId: '111', nickname: '別' }]
    );
    expect(next[0].nickname).toBe('既存');
    expect(storageTouched).toBe(true);
    expect(next[0].throwCount).toBe(3);
  });

  it('既存が内部ラベルのときは実ニックへ差し替え', () => {
    const { next } = mergeGiftUserThrowEvents(
      [
        {
          userId: '10170134',
          nickname: 'nicolive_audition_lightgreen',
          capturedAt: 1,
          throwCount: 1
        }
      ],
      [{ userId: '10170134', nickname: 'AIコメントジェネレータテトス' }]
    );
    expect(next[0].nickname).toBe('AIコメントジェネレータテトス');
    expect(next[0].throwCount).toBe(2);
  });

  it('新規が内部ラベルのみのときはニックを空で保存', () => {
    const { next } = mergeGiftUserThrowEvents([], [
      { userId: '10170134', nickname: 'nicolive_audition_lightgreen' }
    ]);
    expect(next[0].nickname).toBe('');
  });

  it('userId 空の incoming はスキップ', () => {
    const { next } = mergeGiftUserThrowEvents(
      [],
      [{ userId: '', nickname: 'a' }, { userId: '  ', nickname: 'b' }]
    );
    expect(next).toHaveLength(0);
  });

  it('incoming が空なら不変で storageTouched false', () => {
    const existing = [{ userId: '1', nickname: 'x', capturedAt: 1, throwCount: 4 }];
    const { next, added, storageTouched } = mergeGiftUserThrowEvents(existing, []);
    expect(next).toEqual(existing);
    expect(added).toHaveLength(0);
    expect(storageTouched).toBe(false);
  });

  it('throwCount 省略の既存行は 1 回相当として加算', () => {
    const { next } = mergeGiftUserThrowEvents(
      [{ userId: '111', nickname: 'n', capturedAt: 1 }],
      [{ userId: '111', nickname: 'n' }]
    );
    expect(next[0].throwCount).toBe(2);
  });
});

describe('mergeGiftUsers', () => {
  it('空の existing に incoming を追加', () => {
    const { next, added, storageTouched } = mergeGiftUsers([], [
      { userId: '12345', nickname: 'ギフター' }
    ]);
    expect(next).toHaveLength(1);
    expect(added).toHaveLength(1);
    expect(next[0].userId).toBe('12345');
    expect(next[0].nickname).toBe('ギフター');
    expect(typeof next[0].capturedAt).toBe('number');
    expect(storageTouched).toBe(true);
  });

  it('同じ userId は重複追加しない', () => {
    const existing = [
      { userId: '12345', nickname: 'A', capturedAt: 1000 }
    ];
    const { next, added, storageTouched } = mergeGiftUsers(existing, [
      { userId: '12345', nickname: 'A' }
    ]);
    expect(next).toHaveLength(1);
    expect(added).toHaveLength(0);
    expect(storageTouched).toBe(false);
  });

  it('既存にニックネームが無ければ incoming で補完', () => {
    const existing = [
      { userId: '12345', nickname: '', capturedAt: 1000 }
    ];
    const { next, storageTouched } = mergeGiftUsers(existing, [
      { userId: '12345', nickname: '新名前' }
    ]);
    expect(next[0].nickname).toBe('新名前');
    expect(storageTouched).toBe(true);
  });

  it('既存にニックネームがあれば上書きしない', () => {
    const existing = [
      { userId: '12345', nickname: '既存名', capturedAt: 1000 }
    ];
    const { next, storageTouched } = mergeGiftUsers(existing, [
      { userId: '12345', nickname: '別名前' }
    ]);
    expect(next[0].nickname).toBe('既存名');
    expect(storageTouched).toBe(false);
  });

  it('既存が内部ラベルのときは実ニックへ差し替え', () => {
    const { next, storageTouched } = mergeGiftUsers(
      [
        {
          userId: '10170134',
          nickname: 'nicolive_audition_lightgreen',
          capturedAt: 1000
        }
      ],
      [{ userId: '10170134', nickname: 'AIコメントジェネレータテトス' }]
    );
    expect(next[0].nickname).toBe('AIコメントジェネレータテトス');
    expect(storageTouched).toBe(true);
  });

  it('新規が内部ラベルのみのときはニックを空で保存', () => {
    const { next } = mergeGiftUsers([], [
      { userId: '10170134', nickname: 'nicolive_audition_lightgreen' }
    ]);
    expect(next[0].nickname).toBe('');
  });

  // v0.1.215: anonymous gift（uid 空 + nickname あり）も __anon_<nickname>
  //   を userId field に格納して保存対象に。popup「ユーザー別の応援件数」
  //   fallback で anonymous gift が表示されるようになる。
  it('userId が空でも nickname があれば __anon_<nickname> で保存', () => {
    const { next, added, storageTouched } = mergeGiftUsers([], [
      { userId: '', nickname: 'ペチパー' },
      { userId: '  ', nickname: 'ライス' }
    ]);
    expect(next).toHaveLength(2);
    expect(added).toHaveLength(2);
    expect(storageTouched).toBe(true);
    const byKey = new Map(next.map((u) => [u.userId, u]));
    expect(byKey.get('__anon_ペチパー')?.nickname).toBe('ペチパー');
    expect(byKey.get('__anon_ライス')?.nickname).toBe('ライス');
  });

  it('同じ nickname の anonymous gift は 1 bucket に集約', () => {
    const { next, added } = mergeGiftUsers([], [
      { userId: '', nickname: '同名' },
      { userId: '', nickname: '同名' },
      { userId: '', nickname: '別名' }
    ]);
    expect(next).toHaveLength(2);
    expect(added).toHaveLength(2);
    expect(next.map((u) => u.userId).sort()).toEqual([
      '__anon_別名',
      '__anon_同名'
    ]);
  });

  it('userId と nickname が両方空の incoming はスキップ', () => {
    const { next, added } = mergeGiftUsers([], [
      { userId: '', nickname: '' },
      { userId: '  ', nickname: '   ' }
    ]);
    expect(next).toHaveLength(0);
    expect(added).toHaveLength(0);
  });

  it('uid 空 + nickname が内部ラベルのみは skip（表示価値なし）', () => {
    const { next, added } = mergeGiftUsers([], [
      { userId: '', nickname: 'nicolive_audition_lightgreen' }
    ]);
    expect(next).toHaveLength(0);
    expect(added).toHaveLength(0);
  });

  it('複数ユーザーをまとめて追加', () => {
    const { next, added, storageTouched } = mergeGiftUsers([], [
      { userId: '100', nickname: 'A' },
      { userId: '200', nickname: 'B' },
      { userId: '100', nickname: 'A2' }
    ]);
    expect(next).toHaveLength(2);
    expect(added).toHaveLength(2);
    expect(next.map((u) => u.userId)).toEqual(['100', '200']);
    expect(storageTouched).toBe(true);
  });

  it('incoming が空なら何もしない', () => {
    const existing = [
      { userId: '1', nickname: 'x', capturedAt: 1 }
    ];
    const { next, added, storageTouched } = mergeGiftUsers(existing, []);
    expect(next).toHaveLength(1);
    expect(added).toHaveLength(0);
    expect(storageTouched).toBe(false);
  });
});
