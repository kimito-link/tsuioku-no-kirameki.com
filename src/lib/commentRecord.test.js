import { describe, it, expect } from 'vitest';
import {
  normalizeCommentText,
  buildDedupeKey,
  createCommentEntry,
  mergeNewComments,
  backfillNumericSyntheticAvatarsOnStoredComments
} from './commentRecord.js';

describe('normalizeCommentText', () => {
  it('前後空白と改行を整える', () => {
    expect(normalizeCommentText('  a\nb  ')).toBe('a\nb');
  });

  it('空は空文字', () => {
    expect(normalizeCommentText('   ')).toBe('');
  });

  it('null / undefined は空文字', () => {
    expect(normalizeCommentText(/** @type {any} */ (null))).toBe('');
    expect(normalizeCommentText(/** @type {any} */ (undefined))).toBe('');
  });
});

describe('buildDedupeKey', () => {
  it('番号ありは liveId|no|text', () => {
    expect(
      buildDedupeKey('lv1', {
        commentNo: '1011',
        text: 'hello',
        capturedAt: 1_700_000_000_000
      })
    ).toBe('lv1|1011|hello');
  });

  it('番号なしは capturedAt を秒単位で含める', () => {
    expect(
      buildDedupeKey('lv1', {
        commentNo: '',
        text: 'hello',
        capturedAt: 1_700_000_000_123
      })
    ).toBe('lv1||hello|1700000000');
  });

  it('同一秒・同一本文・番号なしは同じキー', () => {
    const row = { commentNo: '', text: 'x', capturedAt: 5_000 };
    expect(buildDedupeKey('lv1', row)).toBe(buildDedupeKey('lv1', row));
  });
});

describe('createCommentEntry', () => {
  it('id と capturedAt を付与', () => {
    const e = createCommentEntry({
      liveId: 'lv9',
      commentNo: '1',
      text: 'x',
      userId: null
    });
    expect(e.liveId).toBe('lv9');
    expect(e.commentNo).toBe('1');
    expect(e.text).toBe('x');
    expect(typeof e.id).toBe('string');
    expect(e.id.length).toBeGreaterThan(4);
    expect(typeof e.capturedAt).toBe('number');
  });

  it('liveId は小文字化', () => {
    const e = createCommentEntry({
      liveId: 'LV88',
      commentNo: '1',
      text: 'a',
      userId: null
    });
    expect(e.liveId).toBe('lv88');
  });

  it('vpos/accountStatus/is184 を保存する', () => {
    const e = createCommentEntry({
      liveId: 'lv1',
      commentNo: '5',
      text: 'ext',
      userId: '100',
      vpos: 12345,
      accountStatus: 1,
      is184: true
    });
    expect(e.vpos).toBe(12345);
    expect(e.accountStatus).toBe(1);
    expect(e.is184).toBe(true);
  });

  it('vpos/accountStatus が null なら省略、is184 が false なら省略', () => {
    const e = createCommentEntry({
      liveId: 'lv1',
      commentNo: '6',
      text: 'min',
      userId: null
    });
    expect(e).not.toHaveProperty('vpos');
    expect(e).not.toHaveProperty('accountStatus');
    expect(e).not.toHaveProperty('is184');
  });

  it('匿名IDでニック空は nickname に匿名', () => {
    const e = createCommentEntry({
      liveId: 'lv1',
      commentNo: '7',
      text: 'x',
      userId: 'a:AXaKZ_4ShxQHJVsX'
    });
    expect(e.nickname).toBe('匿名');
  });
});

describe('mergeNewComments', () => {
  it('新規だけ追加し dedupe する', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: null
      })
    ];
    const firstId = existing[0].id;
    const incoming = [
      { commentNo: '1', text: 'a', userId: null },
      { commentNo: '2', text: 'b', userId: 'u1' }
    ];
    const { next, added, storageTouched } = mergeNewComments(
      'lv1',
      existing,
      incoming
    );
    expect(added).toHaveLength(1);
    expect(added[0].commentNo).toBe('2');
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe(firstId);
    expect(storageTouched).toBe(true);
  });

  it('liveId 引数の大文字小文字を正規化', () => {
    const { added, next, storageTouched } = mergeNewComments('LV1', [], [
      { commentNo: '1', text: 'x', userId: null }
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].liveId).toBe('lv1');
    expect(next[0].liveId).toBe('lv1');
    expect(storageTouched).toBe(true);
  });

  it('incoming が空なら added も空', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: null
      })
    ];
    const { next, added, storageTouched } = mergeNewComments(
      'lv1',
      existing,
      []
    );
    expect(added).toHaveLength(0);
    expect(next).toHaveLength(1);
    expect(storageTouched).toBe(false);
  });

  it('本文が空の incoming はスキップ', () => {
    const { added, next, storageTouched } = mergeNewComments('lv1', [], [
      { commentNo: '1', text: '   ', userId: null },
      { commentNo: '2', text: 'ok', userId: null }
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].commentNo).toBe('2');
    expect(next).toHaveLength(1);
    expect(storageTouched).toBe(true);
  });

  it('同じ番号でも本文が違えば別エントリ', () => {
    const { added, next, storageTouched } = mergeNewComments('lv1', [], [
      { commentNo: '5', text: 'first', userId: null },
      { commentNo: '5', text: 'second', userId: null }
    ]);
    expect(added).toHaveLength(2);
    expect(next.map((r) => r.text)).toEqual(['first', 'second']);
    expect(storageTouched).toBe(true);
  });

  it('同一 liveId・commentNo・本文は NDGR 行と DOM 行で二重でも 1 件（2 回目は追加なし）', () => {
    const afterDom = mergeNewComments('lv1', [], [
      { commentNo: '42', text: 'hello', userId: '86255751', nickname: 'Dom' }
    ]);
    expect(afterDom.added).toHaveLength(1);
    expect(afterDom.next).toHaveLength(1);
    const afterNdgr = mergeNewComments('lv1', afterDom.next, [
      { commentNo: '42', text: 'hello', userId: '86255751' }
    ]);
    expect(afterNdgr.next).toHaveLength(1);
    expect(afterNdgr.added).toHaveLength(0);
    expect(afterNdgr.storageTouched).toBe(false);
  });

  it('existing が欠損フィールドでも落ちない', () => {
    const existing = /** @type {any[]} */ ([{ commentNo: '1', text: 'old' }]);
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '2', text: 'new', userId: null }
    ]);
    expect(added).toHaveLength(1);
    expect(next.length).toBeGreaterThanOrEqual(2);
    expect(storageTouched).toBe(true);
  });

  it('重複行に avatarUrl を後付けし storageTouched のみ（added は 0）', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: null
      })
    ];
    const firstId = existing[0].id;
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      {
        commentNo: '1',
        text: 'a',
        userId: null,
        avatarUrl: 'https://cdn.example/u/1.jpg'
      }
    ]);
    expect(added).toHaveLength(0);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(firstId);
    expect(next[0].avatarUrl).toBe('https://cdn.example/u/1.jpg');
    expect(storageTouched).toBe(true);
  });

  it('既に avatarUrl がある重複は上書きしない', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: null,
        avatarUrl: 'https://cdn.example/first.jpg'
      })
    ];
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      {
        commentNo: '1',
        text: 'a',
        userId: null,
        avatarUrl: 'https://cdn.example/second.jpg'
      }
    ]);
    expect(added).toHaveLength(0);
    expect(next[0].avatarUrl).toBe('https://cdn.example/first.jpg');
    expect(storageTouched).toBe(false);
  });

  it('新規行は有効な avatarUrl を保存', () => {
    const { added, next } = mergeNewComments('lv1', [], [
      {
        commentNo: '9',
        text: 'hi',
        userId: 'u1',
        avatarUrl: 'https://x.test/i.png'
      }
    ]);
    expect(added[0].avatarUrl).toBe('https://x.test/i.png');
    expect(next[0].avatarUrl).toBe('https://x.test/i.png');
  });

  it('無効な avatarUrl は無視', () => {
    const { added } = mergeNewComments('lv1', [], [
      { commentNo: '1', text: 'x', userId: null, avatarUrl: '/rel.png' }
    ]);
    expect(added[0].avatarUrl).toBeUndefined();
  });

  it('仮想スクロール等で先に ID なしで入った行に、同一キーで userId を後追い（added は増えない）', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '77',
        text: 'hello',
        userId: null
      })
    ];
    const firstId = existing[0].id;
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '77', text: 'hello', userId: '12345' }
    ]);
    expect(added).toHaveLength(0);
    expect(next[0].id).toBe(firstId);
    expect(next[0].userId).toBe('12345');
    expect(storageTouched).toBe(true);
  });

  it('重複行は再収集の userId で上書き（誤検知修正をストレージへ反映）', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: '999'
      })
    ];
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '1', text: 'a', userId: '87654321' }
    ]);
    expect(added).toHaveLength(0);
    expect(next[0].userId).toBe('87654321');
    expect(storageTouched).toBe(true);
  });

  it('重複行: 既存が数字 ID のとき incoming が a: でも上書きしない', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: '86255751'
      })
    ];
    const { next, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '1', text: 'a', userId: 'a:deadbeef' }
    ]);
    expect(next[0].userId).toBe('86255751');
    expect(storageTouched).toBe(false);
  });

  it('重複行: 既存が a: のとき数字 incoming でアップグレード', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: 'a:xx'
      })
    ];
    const { next, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '1', text: 'a', userId: '86255751' }
    ]);
    expect(next[0].userId).toBe('86255751');
    expect(storageTouched).toBe(true);
  });

  it('重複行: 既存が defaults プレースホルダ av なら個別 usericon で上書き', () => {
    const weak =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';
    const real =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8625/86255751.jpg';
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'hi',
        userId: '86255751',
        avatarUrl: weak
      })
    ];
    const { next, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '1', text: 'hi', userId: '86255751', avatarUrl: real }
    ]);
    expect(next[0].avatarUrl).toBe(real);
    expect(storageTouched).toBe(true);
  });

  it('incoming に userId が無いときは既存 userId を消さない', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: '111'
      })
    ];
    const { next, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '1', text: 'a', userId: null }
    ]);
    expect(next[0].userId).toBe('111');
    expect(storageTouched).toBe(false);
  });

  it('nickname だけ欠けている重複行に後追い', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '2',
        text: 'b',
        userId: 'u1'
      })
    ];
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '2', text: 'b', userId: 'u1', nickname: '表示名' }
    ]);
    expect(added).toHaveLength(0);
    expect(next[0].nickname).toBe('表示名');
    expect(storageTouched).toBe(true);
  });

  it('新規行で userId が無くても nico usericon URL から userId を補完', () => {
    const { added } = mergeNewComments('lv1', [], [
      {
        commentNo: '3',
        text: 'z',
        userId: null,
        avatarUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/12345002.jpg'
      }
    ]);
    expect(added[0].userId).toBe('12345002');
  });

  it('重複行: 既存が CDN 推定 usericon のみなら、別のニコ usericon URL で上書き', () => {
    const uid = '86255751';
    const synthetic =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8625/86255751.jpg';
    const domLike =
      'https://secure-dcdn.cdn.nimg.jp/nicovideo/images/usericon/square_96/86255751.jpg';
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'hi',
        userId: uid,
        avatarUrl: synthetic
      })
    ];
    const firstId = existing[0].id;
    const { next, added, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '1', text: 'hi', userId: uid, avatarUrl: domLike }
    ]);
    expect(added).toHaveLength(0);
    expect(next[0].id).toBe(firstId);
    expect(next[0].avatarUrl).toBe(domLike);
    expect(storageTouched).toBe(true);
  });

  it('重複行: 既存が非ニコの https アイコンなら上書きしない', () => {
    const custom = 'https://cdn.example.com/users/avatar/xx.png';
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '2',
        text: 'yo',
        userId: '12345678',
        avatarUrl: custom
      })
    ];
    const nicoOther =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg';
    const { next, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '2', text: 'yo', userId: '12345678', avatarUrl: nicoOther }
    ]);
    expect(next[0].avatarUrl).toBe(custom);
    expect(storageTouched).toBe(false);
  });

  it('重複マージで既存 avatarUrl だけから userId を補完（旧データ想定・createCommentEntry 経由でない行）', () => {
    const existing = [
      {
        id: 'legacy_row',
        liveId: 'lv1',
        commentNo: '9',
        text: 'yo',
        userId: null,
        avatarUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/12345001.jpg',
        capturedAt: 1
      }
    ];
    const { next, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '9', text: 'yo', userId: null }
    ]);
    expect(storageTouched).toBe(true);
    expect(next[0].userId).toBe('12345001');
  });

  it('新規行に vpos/accountStatus/is184 を保存', () => {
    const { added } = mergeNewComments('lv1', [], [
      {
        commentNo: '10',
        text: 'rich',
        userId: '500',
        vpos: 9999,
        accountStatus: 2,
        is184: true
      }
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].vpos).toBe(9999);
    expect(added[0].accountStatus).toBe(2);
    expect(added[0].is184).toBe(true);
  });

  it('重複行で既存の vpos/accountStatus/is184 は消えない', () => {
    const existing = [
      {
        id: 'ext1',
        liveId: 'lv1',
        commentNo: '20',
        text: 'keep',
        userId: '600',
        vpos: 5000,
        accountStatus: 1,
        is184: true,
        capturedAt: 1
      }
    ];
    const { next, storageTouched } = mergeNewComments('lv1', existing, [
      { commentNo: '20', text: 'keep', userId: '600' }
    ]);
    expect(next[0].vpos).toBe(5000);
    expect(next[0].accountStatus).toBe(1);
    expect(next[0].is184).toBe(true);
    expect(storageTouched).toBe(false);
  });
});

describe('backfillNumericSyntheticAvatarsOnStoredComments', () => {
  it('数字 userId で avatar 無しの行に CDN URL を付与', () => {
    const rows = [
      { userId: '86255751', text: 'a' },
      { userId: 'a:xx', text: 'b' },
      {
        userId: '12345678',
        avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg',
        text: 'c'
      }
    ];
    const { next, patched } = backfillNumericSyntheticAvatarsOnStoredComments(rows);
    expect(patched).toBe(1);
    expect(String(next[0].avatarUrl || '')).toContain('usericon');
    expect(next[1].avatarUrl).toBeUndefined();
    expect(next[2].avatarUrl).toMatch(/12345678/);
  });
});
