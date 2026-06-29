import { describe, it, expect } from 'vitest';
import {
  tailStorageKey,
  commentNoDedupeKey,
  collectCommentNoKeys,
  selectNewTailRows,
  appendToTail,
  shouldCompactTail,
  countCommentNoLessRows,
  TAIL_COMPACT_COUNT,
  TAIL_COMPACT_INTERVAL_MS,
  TAIL_MAX_ROWS,
  BIG_MAIN_THRESHOLD,
  TAIL_COMPACT_COUNT_BIG,
  COMMENT_NO_LESS_COMPACT_MIN
} from './commentTailBuffer.js';
import { buildDedupeKey } from './commentRecord.js';

describe('tailStorageKey', () => {
  it('別接頭辞 nls_ctail_ を使い、trim + 小文字化する', () => {
    expect(tailStorageKey('LV123')).toBe('nls_ctail_lv123');
    expect(tailStorageKey('  LV99 ')).toBe('nls_ctail_lv99');
  });

  it('nls_comments_lv* 列挙とは衝突しない接頭辞である', () => {
    expect(tailStorageKey('lv1').startsWith('nls_comments_')).toBe(false);
    expect(tailStorageKey('lv1').startsWith('nls_comments_lv')).toBe(false);
  });
});

describe('commentNoDedupeKey', () => {
  it('commentNo 行は buildDedupeKey(liveId, {no, text}) と一致（capturedAt/uid 非依存）', () => {
    const row = { commentNo: '42', text: '草', userId: '100', capturedAt: 5000 };
    expect(commentNoDedupeKey('lv1', row)).toBe(
      buildDedupeKey('lv1', { commentNo: '42', text: '草' })
    );
    // capturedAt や userId が変わっても同じキー（番号が一意キーのため）
    expect(commentNoDedupeKey('lv1', { commentNo: '42', text: '草' })).toBe(
      commentNoDedupeKey('lv1', row)
    );
  });

  it('commentNo 欠落行は null（cheap dedupe 対象外）', () => {
    expect(commentNoDedupeKey('lv1', { text: '8888', userId: 'u' })).toBeNull();
    expect(commentNoDedupeKey('lv1', { commentNo: '  ', text: 'x' })).toBeNull();
  });
});

describe('collectCommentNoKeys', () => {
  it('commentNo を持つ行のキーだけ集める', () => {
    const entries = [
      { commentNo: '1', text: 'a' },
      { text: 'b', userId: 'u' }, // 欠落 → 含めない
      { commentNo: '2', text: 'c' }
    ];
    const keys = collectCommentNoKeys('lv1', entries);
    expect(keys.size).toBe(2);
    expect(keys.has(buildDedupeKey('lv1', { commentNo: '1', text: 'a' }))).toBe(true);
  });

  it('非配列は空 Set', () => {
    expect(collectCommentNoKeys('lv1', null).size).toBe(0);
  });
});

describe('selectNewTailRows', () => {
  it('commentNo 行: knownKeys に無いものだけ残し、capturedAt をスタンプ', () => {
    const cands = [
      { commentNo: '1', text: 'a', userId: 'u1' },
      { commentNo: '2', text: 'b', userId: 'u2' }
    ];
    const known = new Set([buildDedupeKey('lv1', { commentNo: '1', text: 'a' })]);
    const { fresh, keys } = selectNewTailRows('lv1', cands, known, 12_345);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].commentNo).toBe('2');
    expect(fresh[0].capturedAt).toBe(12_345);
    expect(keys).toHaveLength(1);
  });

  it('commentNo 行: 同一バッチ内の重複を弾く', () => {
    const cands = [
      { commentNo: '5', text: 'x', userId: 'u' },
      { commentNo: '5', text: 'x', userId: 'u' }
    ];
    const { fresh } = selectNewTailRows('lv1', cands, new Set(), 1000);
    expect(fresh).toHaveLength(1);
  });

  it('commentNo 欠落行: cheap dedupe せず全て残し、capturedAt も触らない', () => {
    const cands = [
      { text: '草', userId: 'u' },
      { text: '草', userId: 'u' } // 同一でも残す（畳み込み側 loneDedupe が最終判定）
    ];
    const { fresh, keys } = selectNewTailRows('lv1', cands, new Set(), 9999);
    expect(fresh).toHaveLength(2);
    expect(fresh[0].capturedAt).toBeUndefined();
    expect(keys).toHaveLength(0); // knownKeys には足さない
  });

  it('text が空の行は無視する', () => {
    const { fresh } = selectNewTailRows(
      'lv1',
      [{ commentNo: '9', text: '   ', userId: 'u' }],
      new Set()
    );
    expect(fresh).toHaveLength(0);
  });

  it('commentNo 行: 既存 capturedAt は保持する（上書きしない）', () => {
    const { fresh } = selectNewTailRows(
      'lv1',
      [{ commentNo: '7', text: 't', userId: 'u', capturedAt: 999 }],
      new Set(),
      55_555
    );
    expect(fresh[0].capturedAt).toBe(999);
  });

  it('空入力は空を返す', () => {
    expect(selectNewTailRows('lv1', [], new Set()).fresh).toHaveLength(0);
    expect(selectNewTailRows('lv1', null, new Set()).fresh).toHaveLength(0);
  });
});

describe('appendToTail', () => {
  it('既存テールに追記する', () => {
    expect(appendToTail([{ a: 1 }], [{ b: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('非配列の現テールは空配列として扱う', () => {
    expect(appendToTail(undefined, [{ b: 2 }])).toEqual([{ b: 2 }]);
  });

  it('空追記は元配列をそのまま返す', () => {
    const cur = [{ a: 1 }];
    expect(appendToTail(cur, [])).toBe(cur);
  });

  it('TAIL_MAX_ROWS を超えたら古い側を落とす', () => {
    const cur = Array.from({ length: TAIL_MAX_ROWS }, (_, i) => ({ i }));
    const out = appendToTail(cur, [{ i: 'new' }]);
    expect(out).toHaveLength(TAIL_MAX_ROWS);
    expect(out[out.length - 1]).toEqual({ i: 'new' });
    expect(out[0]).toEqual({ i: 1 });
  });
});

describe('shouldCompactTail', () => {
  it('テールが空なら畳み込まない', () => {
    expect(shouldCompactTail({ tailLength: 0, force: true })).toBe(false);
  });

  it('force は最優先', () => {
    expect(shouldCompactTail({ tailLength: 1, force: true })).toBe(true);
  });

  it('hidden（タブ非表示）はテールがあれば畳み込む', () => {
    expect(shouldCompactTail({ tailLength: 1, hidden: true })).toBe(true);
  });

  it('件数しきい値で畳み込む', () => {
    expect(shouldCompactTail({ tailLength: TAIL_COMPACT_COUNT })).toBe(true);
    expect(shouldCompactTail({ tailLength: TAIL_COMPACT_COUNT - 1 })).toBe(false);
  });

  it('時間しきい値で畳み込む', () => {
    expect(
      shouldCompactTail({
        tailLength: 5,
        sinceLastCompactMs: TAIL_COMPACT_INTERVAL_MS
      })
    ).toBe(true);
    expect(
      shouldCompactTail({
        tailLength: 5,
        sinceLastCompactMs: TAIL_COMPACT_INTERVAL_MS - 1
      })
    ).toBe(false);
  });

  describe('巨大メイン（v0.1.507: フリーズ回避）', () => {
    it('巨大メインでは hidden 強制でも畳み込まない（タブ切替時の一斉畳み込みフリーズ回避）', () => {
      expect(
        shouldCompactTail({
          tailLength: 10,
          hidden: true,
          mainCount: BIG_MAIN_THRESHOLD
        })
      ).toBe(false);
    });

    it('巨大メインでは短い件数しきい値（小規模用）では畳み込まない', () => {
      expect(
        shouldCompactTail({
          tailLength: TAIL_COMPACT_COUNT,
          mainCount: BIG_MAIN_THRESHOLD
        })
      ).toBe(false);
    });

    it('巨大メインでは時間しきい値でも畳み込まない（重いクローンの頻度を最小化）', () => {
      expect(
        shouldCompactTail({
          tailLength: 10,
          sinceLastCompactMs: TAIL_COMPACT_INTERVAL_MS * 100,
          mainCount: BIG_MAIN_THRESHOLD
        })
      ).toBe(false);
    });

    it('巨大メインでもテールが満杯近く（BIG しきい値）に達したら畳み込む', () => {
      expect(
        shouldCompactTail({
          tailLength: TAIL_COMPACT_COUNT_BIG,
          mainCount: BIG_MAIN_THRESHOLD
        })
      ).toBe(true);
      expect(
        shouldCompactTail({
          tailLength: TAIL_COMPACT_COUNT_BIG - 1,
          mainCount: BIG_MAIN_THRESHOLD
        })
      ).toBe(false);
    });

    it('巨大メインでも force は最優先', () => {
      expect(
        shouldCompactTail({ tailLength: 1, force: true, mainCount: BIG_MAIN_THRESHOLD })
      ).toBe(true);
    });

    it('BIG しきい値は TAIL_MAX_ROWS 未満（満杯前に必ず畳み込める）', () => {
      expect(TAIL_COMPACT_COUNT_BIG).toBeLessThan(TAIL_MAX_ROWS);
    });
  });

  describe('commentNo 欠落行（v0.1.998: 記録>本家 101% 二次バグ）', () => {
    it('欠落行が COMMENT_NO_LESS_COMPACT_MIN 件以上なら早めに畳み込む', () => {
      expect(
        shouldCompactTail({
          tailLength: COMMENT_NO_LESS_COMPACT_MIN, // 件数しきい値(200)未満
          sinceLastCompactMs: 0,
          commentNoLessInTail: COMMENT_NO_LESS_COMPACT_MIN
        })
      ).toBe(true);
    });

    it('欠落行が COMMENT_NO_LESS_COMPACT_MIN 未満なら従来判定のまま（早期畳み込みしない）', () => {
      expect(
        shouldCompactTail({
          tailLength: COMMENT_NO_LESS_COMPACT_MIN - 1,
          sinceLastCompactMs: 0,
          commentNoLessInTail: COMMENT_NO_LESS_COMPACT_MIN - 1
        })
      ).toBe(false);
    });

    it('巨大メインでは欠落行があっても BIG しきい値を維持（フリーズ回避優先）', () => {
      expect(
        shouldCompactTail({
          tailLength: COMMENT_NO_LESS_COMPACT_MIN,
          mainCount: BIG_MAIN_THRESHOLD,
          commentNoLessInTail: COMMENT_NO_LESS_COMPACT_MIN
        })
      ).toBe(false);
    });
  });
});

describe('countCommentNoLessRows', () => {
  it('commentNo を持たない行だけ数える', () => {
    const rows = [
      { commentNo: '1', text: 'a' },
      { text: 'b', userId: 'u' }, // 欠落
      { commentNo: '  ', text: 'c' }, // 空白のみ=欠落扱い
      { commentNo: '2', text: 'd' }
    ];
    expect(countCommentNoLessRows(rows)).toBe(2);
  });

  it('全部 commentNo 付きなら 0', () => {
    expect(countCommentNoLessRows([{ commentNo: '1' }, { commentNo: '2' }])).toBe(0);
  });

  it('非配列は 0', () => {
    expect(countCommentNoLessRows(null)).toBe(0);
    expect(countCommentNoLessRows(undefined)).toBe(0);
  });
});
