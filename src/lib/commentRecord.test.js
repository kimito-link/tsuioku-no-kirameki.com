import { describe, it, expect, vi } from 'vitest';
import {
  COMMENT_TEXT_MAX_CHARS,
  normalizeCommentText,
  buildDedupeKey,
  createCommentEntry,
  mergeNewComments,
  mergeNewCommentsIncremental,
  buildCommentDedupeState,
  patchExistingComment,
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

  it('最大長を超える本文は切り詰める', () => {
    const long = `  ${'a'.repeat(COMMENT_TEXT_MAX_CHARS + 50)}  `;
    const out = normalizeCommentText(long);
    expect(out).toHaveLength(COMMENT_TEXT_MAX_CHARS);
    expect(out).toBe('a'.repeat(COMMENT_TEXT_MAX_CHARS));
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

  it('番号なしは capturedAt を秒単位 + userId を含める', () => {
    expect(
      buildDedupeKey('lv1', {
        commentNo: '',
        text: 'hello',
        capturedAt: 1_700_000_000_123,
        userId: 'u123'
      })
    ).toBe('lv1||hello|1700000000|u123');
  });

  it('番号なし・userId 無しの場合も末尾に空文字 segment が入る（後方互換）', () => {
    expect(
      buildDedupeKey('lv1', {
        commentNo: '',
        text: 'hello',
        capturedAt: 1_700_000_000_123
      })
    ).toBe('lv1||hello|1700000000|');
  });

  it('同一秒・同一本文・番号なし・同一 userId は同じキー', () => {
    const row = { commentNo: '', text: 'x', capturedAt: 5_000, userId: 'u1' };
    expect(buildDedupeKey('lv1', row)).toBe(buildDedupeKey('lv1', row));
  });

  /*
   * 0.1.46 (AB): 同秒・同本文・別 userId のとき key が違うことを確認。
   *   これがないとコメ被り検出 (L1/L5) が機能せず、複数人の同時バーストが
   *   1 件にマージされてしまう。
   */
  it('同一秒・同一本文・別 userId は別キー（コメ被り検出に必要）', () => {
    const a = buildDedupeKey('lv1', { commentNo: '', text: '8888', capturedAt: 5_000, userId: 'u1' });
    const b = buildDedupeKey('lv1', { commentNo: '', text: '8888', capturedAt: 5_000, userId: 'u2' });
    expect(a).not.toBe(b);
  });

  it('番号ありの場合は userId は key に含めない（commentNo 自体が一意）', () => {
    expect(
      buildDedupeKey('lv1', {
        commentNo: '1011',
        text: 'hello',
        capturedAt: 1_700_000_000_000,
        userId: 'u999'
      })
    ).toBe('lv1|1011|hello');
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

  it('commentNo が空でも、秒境界を跨いだ再取り込みで二重追加されない', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 3, 1, 15, 0, 1, 990));

    const existingRow = createCommentEntry({
      liveId: 'lv1',
      commentNo: '',
      text: 'same anon line',
      userId: 'a:beef',
      nickname: '匿名'
    });
    vi.advanceTimersByTime(2500);

    const { next, added } = mergeNewComments('lv1', [existingRow], [
      { commentNo: '', text: 'same anon line', userId: 'a:beef' }
    ]);

    vi.useRealTimers();

    expect(next).toHaveLength(1);
    expect(added).toHaveLength(0);
  });

  /*
   * 0.1.360: commentNo 欠落の「同秒・同本文・別ユーザー」が 1 件に潰れる退行を防ぐ。
   *   buildDedupeKey は uid を key に含めるのに（0.1.46 AB / 上の unit test）、
   *   mergeNewComments が uid を渡し忘れていたため統合上は無効化されていた。
   *   intercept-post 経路（content-entry.js: no = b.no ?? b.commentNo ?? ''）は
   *   commentNo 空 + 実 userId を載せて届くので実際に到達する。
   */
  it('commentNo 空・同秒・同本文でも別 userId なら別エントリ（コメ被り検出に必要）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 3, 1, 15, 0, 0, 500));

    const { next, added, storageTouched } = mergeNewComments('lv1', [], [
      { commentNo: '', text: '8888', userId: 'u1', nickname: 'Alice' },
      { commentNo: '', text: '8888', userId: 'u2', nickname: 'Bob' }
    ]);

    vi.useRealTimers();

    expect(added).toHaveLength(2);
    expect(next).toHaveLength(2);
    expect(storageTouched).toBe(true);
    // 別ユーザーの属性が混ざった hybrid 行になっていないこと。
    const byUid = new Map(next.map((r) => [r.userId, r]));
    expect(byUid.get('u1')?.nickname).toBe('Alice');
    expect(byUid.get('u2')?.nickname).toBe('Bob');
  });

  it('commentNo 空・同秒・同本文・同 userId は 1 件（同一ユーザーの再取り込みは dedupe）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 3, 1, 15, 0, 0, 500));

    const { next, added } = mergeNewComments('lv1', [], [
      { commentNo: '', text: '草', userId: 'u1' },
      { commentNo: '', text: '草', userId: 'u1' }
    ]);

    vi.useRealTimers();

    expect(added).toHaveLength(1);
    expect(next).toHaveLength(1);
  });

  it('commentNo 空: 同一 {text,uid} が既に 2 件あると lone cap を流用せず別秒では別エントリ', () => {
    // v0.1.503: deriveIncomingDedupeCapturedAt の index 化後も「ちょうど1件のときだけ
    //   その cap を流用、2 件以上は fallback(now)」という旧挙動が保たれることの回帰確認。
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 3, 1, 15, 0, 0, 100));
    const a = createCommentEntry({
      liveId: 'lv1',
      commentNo: '',
      text: 'dup line',
      userId: 'a:dup'
    });
    const b = createCommentEntry({
      liveId: 'lv1',
      commentNo: '',
      text: 'dup line',
      userId: 'a:dup'
    });
    // 次の秒へ進めてから、cap/commentNo の無い同一行を再取り込み
    vi.setSystemTime(Date.UTC(2026, 3, 1, 15, 0, 3, 0));
    const { next, added } = mergeNewComments('lv1', [a, b], [
      { commentNo: '', text: 'dup line', userId: 'a:dup' }
    ]);
    vi.useRealTimers();
    // 既存 2 件は同秒同 key なので storage 上は 2 行のまま、incoming は別秒キーで 1 件追加
    expect(added).toHaveLength(1);
    expect(next).toHaveLength(3);
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

describe('avatarObserved フラグ', () => {
  it('createCommentEntry で avatarObserved=true が保存される', () => {
    const e = createCommentEntry({
      liveId: 'lv1',
      commentNo: '1',
      text: 'x',
      userId: '88210441',
      avatarUrl: 'https://example.com/u.jpg',
      avatarObserved: true
    });
    expect(e.avatarObserved).toBe(true);
  });

  it('createCommentEntry で avatarObserved 未指定は省略される', () => {
    const e = createCommentEntry({
      liveId: 'lv1',
      commentNo: '1',
      text: 'x',
      userId: '88210441'
    });
    expect(e).not.toHaveProperty('avatarObserved');
  });

  it('createCommentEntry で avatarObserved=false は省略される', () => {
    const e = createCommentEntry({
      liveId: 'lv1',
      commentNo: '1',
      text: 'x',
      userId: '88210441',
      avatarObserved: false
    });
    expect(e).not.toHaveProperty('avatarObserved');
  });

  it('mergeNewComments 新規行の avatarObserved=true が保存される', () => {
    const { added } = mergeNewComments('lv1', [], [
      {
        commentNo: '1',
        text: 'hello',
        userId: '88210441',
        avatarUrl: 'https://example.com/u.jpg',
        avatarObserved: true
      }
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].avatarObserved).toBe(true);
  });

  it('mergeNewComments で重複行に avatarObserved=true を後付けする', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: '88210441',
        avatarUrl: 'https://example.com/u.jpg'
      })
    ];
    expect(existing[0]).not.toHaveProperty('avatarObserved');
    const { next, storageTouched } = mergeNewComments('lv1', existing, [
      {
        commentNo: '1',
        text: 'a',
        userId: '88210441',
        avatarUrl: 'https://example.com/u.jpg',
        avatarObserved: true
      }
    ]);
    expect(next[0].avatarObserved).toBe(true);
    expect(storageTouched).toBe(true);
  });

  it('重複行の既存 avatarObserved=true は incoming で消えない', () => {
    const existing = [
      createCommentEntry({
        liveId: 'lv1',
        commentNo: '1',
        text: 'a',
        userId: '88210441',
        avatarUrl: 'https://example.com/u.jpg',
        avatarObserved: true
      })
    ];
    const { next, storageTouched } = mergeNewComments('lv1', existing, [
      {
        commentNo: '1',
        text: 'a',
        userId: '88210441'
      }
    ]);
    expect(next[0].avatarObserved).toBe(true);
    expect(storageTouched).toBe(false);
  });
});

describe('patchExistingComment', () => {
  it('avatarUrl なしの既存行に incoming の avatarUrl を補完', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '1', text: 'a', userId: null
    });
    const { entry, touched } = patchExistingComment(existing, {
      avatarUrl: 'https://cdn.example/u/1.jpg'
    });
    expect(entry.avatarUrl).toBe('https://cdn.example/u/1.jpg');
    expect(touched).toBe(true);
  });

  it('合成デフォルトアイコンを個別 usericon で上書き', () => {
    const uid = '86255751';
    const synthetic =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8625/86255751.jpg';
    const domLike =
      'https://secure-dcdn.cdn.nimg.jp/nicovideo/images/usericon/square_96/86255751.jpg';
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '1', text: 'hi', userId: uid, avatarUrl: synthetic
    });
    const { entry, touched } = patchExistingComment(existing, {
      userId: uid, avatarUrl: domLike
    });
    expect(entry.avatarUrl).toBe(domLike);
    expect(touched).toBe(true);
  });

  it('defaults プレースホルダを個別 usericon で上書き', () => {
    const weak =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';
    const real =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8625/86255751.jpg';
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '1', text: 'hi', userId: '86255751', avatarUrl: weak
    });
    const { entry, touched } = patchExistingComment(existing, {
      userId: '86255751', avatarUrl: real
    });
    expect(entry.avatarUrl).toBe(real);
    expect(touched).toBe(true);
  });

  it('既に有効な非ニコ avatarUrl がある場合は上書きしない', () => {
    const custom = 'https://cdn.example.com/users/avatar/xx.png';
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '2', text: 'yo', userId: '12345678', avatarUrl: custom
    });
    const nicoOther =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg';
    const { entry, touched } = patchExistingComment(existing, {
      userId: '12345678', avatarUrl: nicoOther
    });
    expect(entry.avatarUrl).toBe(custom);
    expect(touched).toBe(false);
  });

  it('無効な avatarUrl は無視（touched=false）', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '1', text: 'a', userId: '100'
    });
    const { entry, touched } = patchExistingComment(existing, {
      avatarUrl: '/relative.png'
    });
    expect(entry.avatarUrl).toBeUndefined();
    expect(touched).toBe(false);
  });

  it('userId null → 数字 ID で補完', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '77', text: 'hello', userId: null
    });
    const { entry, touched } = patchExistingComment(existing, {
      userId: '12345'
    });
    expect(entry.userId).toBe('12345');
    expect(touched).toBe(true);
  });

  it('a: ハッシュを数字 ID でアップグレード', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '1', text: 'a', userId: 'a:xx'
    });
    const { entry, touched } = patchExistingComment(existing, {
      userId: '86255751'
    });
    expect(entry.userId).toBe('86255751');
    expect(touched).toBe(true);
  });

  it('数字 ID を a: ハッシュで上書きしない', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '1', text: 'a', userId: '86255751'
    });
    const { entry, touched } = patchExistingComment(existing, {
      userId: 'a:deadbeef'
    });
    expect(entry.userId).toBe('86255751');
    expect(touched).toBe(false);
  });

  it('incoming userId が null なら既存 userId を維持', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '1', text: 'a', userId: '111'
    });
    const { entry, touched } = patchExistingComment(existing, {
      userId: null
    });
    expect(entry.userId).toBe('111');
    expect(touched).toBe(false);
  });

  it('nickname を後追い補完', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '2', text: 'b', userId: 'u1'
    });
    const { entry, touched } = patchExistingComment(existing, {
      userId: 'u1', nickname: '表示名'
    });
    expect(entry.nickname).toBe('表示名');
    expect(touched).toBe(true);
  });

  it('より長い nickname で上書き', () => {
    const existing = {
      id: 'test1', liveId: 'lv1', commentNo: '1', text: 'a',
      userId: '100', nickname: 'AB', capturedAt: 1000
    };
    const { entry, touched } = patchExistingComment(existing, {
      userId: '100', nickname: 'ABCD'
    });
    expect(entry.nickname).toBe('ABCD');
    expect(touched).toBe(true);
  });

  it('より短い nickname では上書きしない', () => {
    const existing = {
      id: 'test2', liveId: 'lv1', commentNo: '1', text: 'a',
      userId: '100', nickname: 'ABCDE', capturedAt: 1000
    };
    const { entry, touched } = patchExistingComment(existing, {
      userId: '100', nickname: 'AB'
    });
    expect(entry.nickname).toBe('ABCDE');
    expect(touched).toBe(false);
  });

  it('userId 欠損時に avatarUrl から userId を自己修復', () => {
    const existing = {
      id: 'legacy_row', liveId: 'lv1', commentNo: '9', text: 'yo',
      userId: null,
      avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/12345001.jpg',
      capturedAt: 1
    };
    const { entry, touched } = patchExistingComment(existing, {
      userId: null
    });
    expect(entry.userId).toBe('12345001');
    expect(touched).toBe(true);
  });

  it('avatarObserved を後追いで true に設定', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '1', text: 'a', userId: '88210441',
      avatarUrl: 'https://example.com/u.jpg'
    });
    expect(existing).not.toHaveProperty('avatarObserved');
    const { entry, touched } = patchExistingComment(existing, {
      userId: '88210441', avatarObserved: true
    });
    expect(entry.avatarObserved).toBe(true);
    expect(touched).toBe(true);
  });

  it('既存の avatarObserved=true は incoming で消えない', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '1', text: 'a', userId: '88210441',
      avatarUrl: 'https://example.com/u.jpg', avatarObserved: true
    });
    const { entry, touched } = patchExistingComment(existing, {
      userId: '88210441', avatarObserved: false
    });
    expect(entry.avatarObserved).toBe(true);
    expect(touched).toBe(false);
  });

  it('何も変更がなければ touched=false', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '1', text: 'a', userId: '100',
      avatarUrl: 'https://cdn.example/u.jpg', nickname: 'テスト'
    });
    const { entry, touched } = patchExistingComment(existing, {
      userId: '100', avatarUrl: 'https://cdn.example/u.jpg', nickname: 'テ'
    });
    expect(touched).toBe(false);
    expect(entry.userId).toBe('100');
    expect(entry.avatarUrl).toBe('https://cdn.example/u.jpg');
    expect(entry.nickname).toBe('テスト');
  });

  it('incoming に avatarUrl のみでも userId を推定して補完', () => {
    const existing = createCommentEntry({
      liveId: 'lv1', commentNo: '3', text: 'z', userId: null
    });
    const { entry, touched } = patchExistingComment(existing, {
      userId: null,
      avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/12345002.jpg'
    });
    expect(entry.userId).toBe('12345002');
    expect(entry.avatarUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/12345002.jpg'
    );
    expect(touched).toBe(true);
  });
});

describe('backfillNumericSyntheticAvatarsOnStoredComments', () => {
  it('合成 canonical URL を avatarUrl から除去（ティア判定の誤昇格を防ぐ）', () => {
    const rows = [
      {
        userId: '86255751',
        avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8625/86255751.jpg',
        text: 'a'
      },
      { userId: 'a:xx', text: 'b' },
      {
        userId: '12345678',
        avatarUrl: 'https://example.com/real-avatar.jpg',
        text: 'c'
      }
    ];
    const { next, patched } = backfillNumericSyntheticAvatarsOnStoredComments(rows);
    expect(patched).toBe(1);
    expect(next[0].avatarUrl).toBeUndefined();
    expect(next[1].avatarUrl).toBeUndefined();
    expect(next[2].avatarUrl).toBe('https://example.com/real-avatar.jpg');
  });
});

describe('mergeNewCommentsIncremental（チャンクモード用 O(追加分) dedupe）', () => {
  // added の「採否」が既存 mergeNewComments と一致するかを安定フィールドで比較するヘルパ。
  //   id / capturedAt は createCommentEntry が都度生成するので比較対象から外す。
  const sig = (r) => `${r.commentNo ?? ''}|${r.text ?? ''}|${r.userId ?? ''}`;
  const sigs = (arr) => arr.map(sig);

  /** 既存 mergeNewComments と incremental で「added の signature 列」が一致することを検証。 */
  const expectSameAdded = (lid, existing, incoming) => {
    const full = mergeNewComments(lid, existing, incoming);
    const inc = mergeNewCommentsIncremental(
      lid,
      buildCommentDedupeState(lid, existing),
      incoming
    );
    expect(sigs(inc.added)).toEqual(sigs(full.added));
    return { full, inc };
  };

  it('commentNo 付き: 既存と重複する番号は added されず、新規番号だけ added（既存 merge と一致）', () => {
    const existing = [
      createCommentEntry({ liveId: 'lv1', commentNo: '1', text: 'a', userId: 'u1' }),
      createCommentEntry({ liveId: 'lv1', commentNo: '2', text: 'b', userId: 'u2' })
    ];
    const incoming = [
      { commentNo: '2', text: 'b', userId: 'u2' }, // 重複
      { commentNo: '3', text: 'c', userId: 'u3' }, // 新規
      { commentNo: '4', text: 'd', userId: 'u4' } // 新規
    ];
    const { inc } = expectSameAdded('lv1', existing, incoming);
    expect(sigs(inc.added)).toEqual(['3|c|u3', '4|d|u4']);
  });

  it('184 匿名・同秒・同本文・別ユーザーは別行として added（uid で分かれる・既存 merge と一致）', () => {
    const cap = 1_700_000_000_000; // 同一秒に収める固定 capturedAt
    const existing = [];
    const incoming = [
      { text: '8888', userId: 'a1', capturedAt: cap },
      { text: '8888', userId: 'a2', capturedAt: cap },
      { text: '8888', userId: 'a1', capturedAt: cap } // a1 は重複
    ];
    const { inc } = expectSameAdded('lv1', existing, incoming);
    // a1 / a2 の 2 件だけ added（3 件目 a1 は dedupe）。
    expect(inc.added.map((r) => r.userId)).toEqual(['a1', 'a2']);
  });

  it('バッチ内重複（同一 commentNo が複数回）は 1 件だけ added（既存 merge と一致）', () => {
    const incoming = [
      { commentNo: '10', text: 'x', userId: 'u' },
      { commentNo: '10', text: 'x', userId: 'u' },
      { commentNo: '11', text: 'y', userId: 'u' }
    ];
    const { inc } = expectSameAdded('lv1', [], incoming);
    expect(sigs(inc.added)).toEqual(['10|x|u', '11|y|u']);
  });

  it('既存一致行は added されない（patch 相当・チャンクモードでは永続化しないので追加ゼロ）', () => {
    const existing = [
      createCommentEntry({ liveId: 'lv1', commentNo: '5', text: 'hello', userId: null })
    ];
    // avatar / uid を後追いで持つ同一 commentNo 行 → 既存 merge では patch、incremental では skip。
    const incoming = [
      {
        commentNo: '5',
        text: 'hello',
        userId: '12345',
        avatarUrl: 'https://example.com/a.jpg'
      }
    ];
    const { inc } = expectSameAdded('lv1', existing, incoming);
    expect(inc.added).toHaveLength(0);
  });

  it('state を跨ぐ連続フラッシュでも重複が累積排除される（同一 state を使い回す）', () => {
    const state = buildCommentDedupeState('lv1', []);
    const flush1 = mergeNewCommentsIncremental('lv1', state, [
      { commentNo: '1', text: 'a', userId: 'u1' },
      { commentNo: '2', text: 'b', userId: 'u2' }
    ]);
    expect(sigs(flush1.added)).toEqual(['1|a|u1', '2|b|u2']);
    // 2 回目: 1 は既出、3 は新規。
    const flush2 = mergeNewCommentsIncremental('lv1', state, [
      { commentNo: '1', text: 'a', userId: 'u1' },
      { commentNo: '3', text: 'c', userId: 'u3' }
    ]);
    expect(sigs(flush2.added)).toEqual(['3|c|u3']);
  });

  it('空テキストは added されない（既存 merge と一致）', () => {
    const incoming = [
      { commentNo: '1', text: '   ', userId: 'u' },
      { commentNo: '2', text: 'ok', userId: 'u' }
    ];
    const { inc } = expectSameAdded('lv1', [], incoming);
    expect(sigs(inc.added)).toEqual(['2|ok|u']);
  });

  it('undo() で state が巻き戻り、同一 rows を再投入すると再び added される（write 失敗→requeue 相当）', () => {
    const state = buildCommentDedupeState('lv1', []);
    const incoming = [
      { commentNo: '1', text: 'a', userId: 'u1' },
      { text: '草', userId: 'u2', capturedAt: 1_700_000_000_000 } // commentNo 欠落（loneDedupe 経路）
    ];
    const first = mergeNewCommentsIncremental('lv1', state, incoming);
    expect(first.added).toHaveLength(2);
    // 巻き戻す（永続化失敗を想定）。
    first.undo();
    // 同一 rows を再投入 → state は空に戻っているので再び 2 件 added（欠落しない）。
    const second = mergeNewCommentsIncremental('lv1', state, incoming);
    expect(second.added).toHaveLength(2);
    // 巻き戻さず 3 回目を投入したら、今度は dedupe で 0 件（state が反映済み）。
    const third = mergeNewCommentsIncremental('lv1', state, incoming);
    expect(third.added).toHaveLength(0);
  });
});
