import { describe, it, expect } from 'vitest';
import {
  NLS_LIVE_COMMENT_PUSH_TYPE,
  generateInstantPushNonce,
  isInstantCommentPushValid,
  sanitizeInstantPushRows,
  toInstantPushDisplayEntry,
  mergeInstantPushBuffer,
  composeDisplayEntriesWithInstantPush,
  computeInstantPushGapAverage
} from './instantCommentPush.js';

describe('generateInstantPushNonce', () => {
  it('32桁 hex 文字列を返す', () => {
    const n = generateInstantPushNonce();
    expect(typeof n).toBe('string');
    expect(n.length).toBe(32);
    expect(/^[0-9a-f]{32}$/.test(n)).toBe(true);
  });

  it('複数回呼ぶと別の値', () => {
    const a = generateInstantPushNonce();
    const b = generateInstantPushNonce();
    expect(a).not.toBe(b);
  });
});

describe('isInstantCommentPushValid', () => {
  it('type と nonce が一致 → true', () => {
    expect(
      isInstantCommentPushValid(
        { data: { type: NLS_LIVE_COMMENT_PUSH_TYPE, nonce: 'abc' } },
        'abc'
      )
    ).toBe(true);
  });
  it('nonce 不一致 → false', () => {
    expect(
      isInstantCommentPushValid(
        { data: { type: NLS_LIVE_COMMENT_PUSH_TYPE, nonce: 'abc' } },
        'xyz'
      )
    ).toBe(false);
  });
  it('type 不一致 → false', () => {
    expect(
      isInstantCommentPushValid({ data: { type: 'OTHER', nonce: 'abc' } }, 'abc')
    ).toBe(false);
  });
  it('expectedNonce 空 → false(未初期化の iframe から呼ばれても弾く)', () => {
    expect(
      isInstantCommentPushValid(
        { data: { type: NLS_LIVE_COMMENT_PUSH_TYPE, nonce: 'abc' } },
        ''
      )
    ).toBe(false);
  });
  it('data 欠落 → false', () => {
    expect(isInstantCommentPushValid({}, 'abc')).toBe(false);
    expect(isInstantCommentPushValid(null, 'abc')).toBe(false);
  });
  it('nonce が文字列でない → false', () => {
    expect(
      isInstantCommentPushValid(
        { data: { type: NLS_LIVE_COMMENT_PUSH_TYPE, nonce: 12345 } },
        '12345'
      )
    ).toBe(false);
  });
});

describe('sanitizeInstantPushRows', () => {
  it('妥当な行だけ通す', () => {
    const out = sanitizeInstantPushRows([
      { commentNo: '123', text: 'こんにちは', userId: '456' },
      { commentNo: 'bad-no', text: 'x' }, // commentNo 形式不正 → drop
      { text: 'no number ok' }
    ]);
    expect(out).toEqual([
      { commentNo: '123', text: 'こんにちは', userId: '456' },
      { text: 'no number ok' }
    ]);
  });

  it('配列でない/空配列は null', () => {
    expect(sanitizeInstantPushRows(null)).toBeNull();
    expect(sanitizeInstantPushRows([])).toBeNull();
    expect(sanitizeInstantPushRows('not array')).toBeNull();
  });

  it('上限超過は null(DoS 緩和・nlsInterceptAuth と同じ規約)', () => {
    const huge = Array.from({ length: 1001 }, (_, i) => ({ text: `t${i}` }));
    expect(sanitizeInstantPushRows(huge)).toBeNull();
  });
});

describe('toInstantPushDisplayEntry', () => {
  it('commentNo があれば安定 id を作る', () => {
    const e = toInstantPushDisplayEntry(
      { commentNo: '999', text: 'yo', userId: 'u1' },
      'LV123',
      1000
    );
    expect(e).toEqual({
      id: 'instant-push:lv123:999',
      liveId: 'lv123',
      commentNo: '999',
      text: 'yo',
      userId: 'u1',
      capturedAt: 1000,
      instantPush: true
    });
  });

  it('commentNo 無しでも壊れない(ランダム id)', () => {
    const e = toInstantPushDisplayEntry({ text: 'no number' }, 'lv1', 500);
    expect(e.commentNo).toBe('');
    expect(e.id).toMatch(/^instant-push:lv1:500:/);
    expect(e.userId).toBeNull();
  });

  it('capturedAt が非数値なら Date.now() 相当にフォールバック', () => {
    const e = toInstantPushDisplayEntry({ text: 'x' }, 'lv1', NaN);
    expect(Number.isFinite(e.capturedAt)).toBe(true);
  });
});

describe('mergeInstantPushBuffer', () => {
  it('新規行を追加する', () => {
    const out = mergeInstantPushBuffer([], [], [
      { commentNo: '1', text: 'a' },
      { commentNo: '2', text: 'b' }
    ]);
    expect(out).toHaveLength(2);
  });

  it('confirmedEntries に同じ commentNo があれば追加しない', () => {
    const out = mergeInstantPushBuffer(
      [],
      [{ commentNo: '1', text: 'confirmed' }],
      [{ commentNo: '1', text: 'push-dup' }]
    );
    expect(out).toHaveLength(0);
  });

  it('confirmedEntries に到着した既存プッシュ行は間引かれる(正規到着で置換)', () => {
    const existing = [
      { commentNo: '1', text: 'push-1' },
      { commentNo: '2', text: 'push-2' }
    ];
    const out = mergeInstantPushBuffer(
      existing,
      [{ commentNo: '1', text: 'confirmed-1' }],
      []
    );
    expect(out).toEqual([{ commentNo: '2', text: 'push-2' }]);
  });

  it('同一 commentNo の多重プッシュは先着優先で重複しない', () => {
    const out = mergeInstantPushBuffer(
      [{ commentNo: '1', text: 'first' }],
      [],
      [{ commentNo: '1', text: 'second' }]
    );
    expect(out).toEqual([{ commentNo: '1', text: 'first' }]);
  });

  it('commentNo 無し行は dedupe 対象外(複数許容)', () => {
    const out = mergeInstantPushBuffer([], [], [
      { text: 'anon-1' },
      { text: 'anon-2' }
    ]);
    expect(out).toHaveLength(2);
  });

  it('maxBuffered を超えたら古い順に間引く', () => {
    const incoming = Array.from({ length: 5 }, (_, i) => ({ commentNo: String(i), text: `t${i}` }));
    const out = mergeInstantPushBuffer([], [], incoming, { maxBuffered: 3 });
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.commentNo)).toEqual(['2', '3', '4']);
  });
});

describe('composeDisplayEntriesWithInstantPush', () => {
  it('プッシュバッファが空なら confirmed をそのまま返す(参照等価で無駄な再生成をしない)', () => {
    const confirmed = [{ commentNo: '1', text: 'a' }];
    expect(composeDisplayEntriesWithInstantPush(confirmed, [])).toBe(confirmed);
  });

  it('プッシュ行を末尾に連結する', () => {
    const confirmed = [{ commentNo: '1', text: 'a' }];
    const buffer = [{ commentNo: '2', text: 'b' }];
    expect(composeDisplayEntriesWithInstantPush(confirmed, buffer)).toEqual([
      { commentNo: '1', text: 'a' },
      { commentNo: '2', text: 'b' }
    ]);
  });

  it('confirmed に既にある commentNo のプッシュ行は二重に載せない(冪等)', () => {
    const confirmed = [{ commentNo: '1', text: 'confirmed' }];
    const buffer = [{ commentNo: '1', text: 'stale-push' }];
    expect(composeDisplayEntriesWithInstantPush(confirmed, buffer)).toEqual(confirmed);
  });
});

describe('computeInstantPushGapAverage', () => {
  it('初回サンプルはそのまま丸めて採用', () => {
    expect(computeInstantPushGapAverage(-1, 120)).toBe(120);
  });

  it('EMA で平均へ寄せる', () => {
    const avg1 = computeInstantPushGapAverage(-1, 100);
    const avg2 = computeInstantPushGapAverage(avg1, 200);
    expect(avg2).toBe(Math.round(100 + 0.3 * (200 - 100)));
  });

  it('負値/非数のサンプルは直前値を素通しする(未計測を実測と偽らない)', () => {
    expect(computeInstantPushGapAverage(50, -5)).toBe(50);
    expect(computeInstantPushGapAverage(50, NaN)).toBe(50);
    expect(computeInstantPushGapAverage(-1, NaN)).toBe(-1);
  });
});

describe('v0.1.1815: 確定済み一覧のキー集合の使い回しは結果を変えない', () => {
  // 変更前の実装(毎回作り直す)をそのまま写した基準。
  const key = (e) => {
    const no = String(e?.commentNo || '').trim();
    return /^\d+$/.test(no) ? `no:${no}` : '';
  };
  function refMerge(existing, confirmed, incoming, max = 300) {
    const ck = new Set((Array.isArray(confirmed) ? confirmed : []).map(key).filter(Boolean));
    const out = (Array.isArray(existing) ? existing : []).filter((e) => !(key(e) && ck.has(key(e))));
    const seen = new Set(out.map(key).filter(Boolean));
    for (const inc of Array.isArray(incoming) ? incoming : []) {
      const k = key(inc);
      if (k) {
        if (seen.has(k) || ck.has(k)) continue;
        seen.add(k);
      }
      out.push(inc);
    }
    return out.length > max ? out.slice(out.length - max) : out;
  }
  function refCompose(confirmed, buffer) {
    const c = Array.isArray(confirmed) ? confirmed : [];
    const b = Array.isArray(buffer) ? buffer : [];
    if (!b.length) return c;
    const ck = new Set(c.map(key).filter(Boolean));
    const extra = b.filter((e) => !(key(e) && ck.has(key(e))));
    return extra.length ? [...c, ...extra] : c;
  }

  it('新着ごとの流れ(合成結果が次の確定済み一覧になる)を何周回しても基準と同じ', () => {
    let confirmed = [{ commentNo: '1' }, { commentNo: 'x' }, { commentNo: '2' }];
    let buf = [];
    let refConfirmed = confirmed;
    let refBuf = [];
    for (let i = 3; i < 60; i++) {
      const incoming = [{ commentNo: String(i) }, { commentNo: String(i - 2) }, { commentNo: '' }];
      buf = mergeInstantPushBuffer(buf, confirmed, incoming, { maxBuffered: 5 });
      refBuf = refMerge(refBuf, refConfirmed, incoming, 5);
      expect(buf).toEqual(refBuf);
      buf = mergeInstantPushBuffer(buf, confirmed, []);
      refBuf = refMerge(refBuf, refConfirmed, []);
      expect(buf).toEqual(refBuf);
      const next = composeDisplayEntriesWithInstantPush(confirmed, buf);
      const refNext = refCompose(refConfirmed, refBuf);
      expect(next).toEqual(refNext);
      confirmed = next;
      refConfirmed = refNext;
      if (i % 7 === 0) {
        // storage 経由の正規到着=新しい配列で差し替え
        confirmed = [...confirmed.filter((e) => !e.instantPush), { commentNo: String(i + 1) }];
        refConfirmed = [...refConfirmed.filter((e) => !e.instantPush), { commentNo: String(i + 1) }];
      }
    }
  });

  it('同じ配列が後から伸ばされても古いキー集合を使わない', () => {
    const confirmed = [{ commentNo: '1' }];
    expect(mergeInstantPushBuffer([], confirmed, [{ commentNo: '2' }])).toEqual([{ commentNo: '2' }]);
    confirmed.push({ commentNo: '2' });
    expect(mergeInstantPushBuffer([], confirmed, [{ commentNo: '2' }])).toEqual([]);
    expect(composeDisplayEntriesWithInstantPush(confirmed, [{ commentNo: '2' }])).toBe(confirmed);
  });

  it('先出しも新着も無ければ新しい空配列を返す', () => {
    const empty = [];
    const out = mergeInstantPushBuffer(empty, [{ commentNo: '1' }], []);
    expect(out).toEqual([]);
    expect(out).not.toBe(empty);
  });
});
