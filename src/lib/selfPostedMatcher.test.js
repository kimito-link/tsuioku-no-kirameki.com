import { describe, it, expect } from 'vitest';
import {
  SELF_POST_MATCH_EARLY_MS,
  SELF_POST_MATCH_LATE_MS,
  SELF_POST_RECENT_TTL_MS,
  filterValidSelfPostedRecents,
  matchSelfPostedRecents,
  matchesAnySelfPostedRecent,
  prepareSelfPostedMatchRecents
} from './selfPostedMatcher.js';

describe('定数', () => {
  it('EARLY_MS は 30 秒', () => {
    expect(SELF_POST_MATCH_EARLY_MS).toBe(30 * 1000);
  });
  it('LATE_MS は 10 分', () => {
    expect(SELF_POST_MATCH_LATE_MS).toBe(10 * 60 * 1000);
  });
  it('TTL_MS は 24 時間', () => {
    expect(SELF_POST_RECENT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('filterValidSelfPostedRecents', () => {
  const NOW = 1_700_000_000_000;
  it('raw が null / 非オブジェクト / items 欠損で [] を返す', () => {
    expect(filterValidSelfPostedRecents(null, NOW)).toEqual([]);
    expect(filterValidSelfPostedRecents(undefined, NOW)).toEqual([]);
    expect(filterValidSelfPostedRecents({}, NOW)).toEqual([]);
    expect(filterValidSelfPostedRecents({ items: 'nope' }, NOW)).toEqual([]);
    expect(filterValidSelfPostedRecents(42, NOW)).toEqual([]);
  });

  it('型が合わない items は弾く', () => {
    const raw = {
      items: [
        null,
        {},
        { liveId: 1, textNorm: 'x', at: NOW },
        { liveId: 'lv', textNorm: 2, at: NOW },
        { liveId: 'lv', textNorm: 'x', at: 'nope' }
      ]
    };
    expect(filterValidSelfPostedRecents(raw, NOW)).toEqual([]);
  });

  it('TTL（24h）を超えた古い item は除外される', () => {
    const raw = {
      items: [
        { liveId: 'lv1', textNorm: 'ok', at: NOW },
        { liveId: 'lv1', textNorm: 'old', at: NOW - SELF_POST_RECENT_TTL_MS - 1 },
        { liveId: 'lv1', textNorm: 'edge', at: NOW - SELF_POST_RECENT_TTL_MS + 1 }
      ]
    };
    const out = filterValidSelfPostedRecents(raw, NOW);
    expect(out.map((r) => r.textNorm)).toEqual(['ok', 'edge']);
  });

  it('now の既定は Date.now() だが明示指定が優先される', () => {
    const raw = {
      items: [{ liveId: 'lv', textNorm: 'x', at: 1_000 }]
    };
    // 指定 now を十分未来にすると TTL 超で除外
    expect(filterValidSelfPostedRecents(raw, 1_000 + SELF_POST_RECENT_TTL_MS + 1)).toEqual(
      []
    );
    // 近い now なら残る
    expect(filterValidSelfPostedRecents(raw, 1_000)).toEqual([
      { liveId: 'lv', textNorm: 'x', at: 1_000 }
    ]);
  });

  it('textRaw が string なら pass-through で保持する', () => {
    const raw = {
      items: [
        { liveId: 'lv', textNorm: 'あいう', at: NOW, textRaw: 'あい\nう' }
      ]
    };
    const out = filterValidSelfPostedRecents(raw, NOW);
    expect(out).toEqual([
      { liveId: 'lv', textNorm: 'あいう', at: NOW, textRaw: 'あい\nう' }
    ]);
  });

  it('textRaw が string でない場合は出力に含めない', () => {
    const raw = {
      items: [
        { liveId: 'lv', textNorm: 'x', at: NOW, textRaw: 123 },
        { liveId: 'lv', textNorm: 'y', at: NOW, textRaw: null },
        { liveId: 'lv', textNorm: 'z', at: NOW }
      ]
    };
    const out = filterValidSelfPostedRecents(raw, NOW);
    for (const item of out) {
      expect(item).not.toHaveProperty('textRaw');
    }
    expect(out.map((it) => it.textNorm)).toEqual(['x', 'y', 'z']);
  });
});

describe('prepareSelfPostedMatchRecents', () => {
  it('liveId が空なら [] を返す', () => {
    expect(
      prepareSelfPostedMatchRecents(
        [{ liveId: 'lv1', textNorm: 'a', at: 1 }],
        ''
      )
    ).toEqual([]);
  });

  it('指定 liveId（lowercase 一致）の recent だけ残る', () => {
    const recents = [
      { liveId: 'LV123', textNorm: 'a', at: 3 },
      { liveId: 'lv123', textNorm: 'b', at: 1 },
      { liveId: 'lv999', textNorm: 'c', at: 2 }
    ];
    const out = prepareSelfPostedMatchRecents(recents, 'lv123');
    expect(out.map((r) => r.textNorm)).toEqual(['b', 'a']); // at 昇順
  });

  it('at が 0 以下 / textNorm が空のものは除外', () => {
    const recents = [
      { liveId: 'lv', textNorm: '', at: 10 },
      { liveId: 'lv', textNorm: 'x', at: 0 },
      { liveId: 'lv', textNorm: 'x', at: -5 },
      { liveId: 'lv', textNorm: 'x', at: 10 }
    ];
    const out = prepareSelfPostedMatchRecents(recents, 'lv');
    expect(out).toHaveLength(1);
    expect(out[0].at).toBe(10);
  });

  it('同 at では元 index の小さい方が先になる', () => {
    const recents = [
      { liveId: 'lv', textNorm: 'a', at: 100 }, // itemIndex 0
      { liveId: 'lv', textNorm: 'b', at: 100 } // itemIndex 1
    ];
    const out = prepareSelfPostedMatchRecents(recents, 'lv');
    expect(out.map((r) => r.itemIndex)).toEqual([0, 1]);
  });

  it('元 array が配列でなくても落ちない', () => {
    // @ts-expect-error 意図的に不正
    expect(prepareSelfPostedMatchRecents(null, 'lv')).toEqual([]);
    // @ts-expect-error
    expect(prepareSelfPostedMatchRecents(undefined, 'lv')).toEqual([]);
  });

  it('返す要素は {itemIndex, at, textNorm} の 3 キーに整形される', () => {
    const recents = [{ liveId: 'lv', textNorm: 'a', at: 1 }];
    const out = prepareSelfPostedMatchRecents(recents, 'lv');
    expect(Object.keys(out[0]).sort()).toEqual(['at', 'itemIndex', 'textNorm']);
  });
});

describe('matchSelfPostedRecents', () => {
  it('entries / recents 空なら空の Set を返す', () => {
    expect(matchSelfPostedRecents([], [])).toEqual({
      matchedIds: new Set(),
      consumedIndexes: new Set()
    });
    // @ts-expect-error
    expect(matchSelfPostedRecents(null, null)).toEqual({
      matchedIds: new Set(),
      consumedIndexes: new Set()
    });
  });

  it('単純: 1 entry と 1 recent、同文・時間窓内でマッチ', () => {
    const res = matchSelfPostedRecents(
      [{ id: 'e1', textNorm: 'こんにちは', capturedAt: 1005, index: 0 }],
      [{ itemIndex: 0, textNorm: 'こんにちは', at: 1000 }]
    );
    expect([...res.matchedIds]).toEqual(['e1']);
    expect([...res.consumedIndexes]).toEqual([0]);
  });

  it('textNorm が違えばマッチしない', () => {
    const res = matchSelfPostedRecents(
      [{ id: 'e1', textNorm: 'A', capturedAt: 1000, index: 0 }],
      [{ itemIndex: 0, textNorm: 'B', at: 1000 }]
    );
    expect(res.matchedIds.size).toBe(0);
    expect(res.consumedIndexes.size).toBe(0);
  });

  it('時間窓の境界: late 側ちょうど内はマッチ、1ms 超えでマッチしない', () => {
    const at = 1000;
    const entries = [
      { id: 'in', textNorm: 'x', capturedAt: at + SELF_POST_MATCH_LATE_MS, index: 0 },
      { id: 'out', textNorm: 'x', capturedAt: at + SELF_POST_MATCH_LATE_MS + 1, index: 1 }
    ];
    const recents = [{ itemIndex: 0, textNorm: 'x', at }];
    const res = matchSelfPostedRecents(entries, recents);
    expect([...res.matchedIds]).toEqual(['in']);
  });

  it('時間窓の境界: early 側ちょうど内はマッチ、1ms 超えでマッチしない', () => {
    const at = 100_000;
    const entries = [
      { id: 'in', textNorm: 'x', capturedAt: at - SELF_POST_MATCH_EARLY_MS, index: 0 },
      { id: 'out', textNorm: 'x', capturedAt: at - SELF_POST_MATCH_EARLY_MS - 1, index: 1 }
    ];
    const recents = [{ itemIndex: 0, textNorm: 'x', at }];
    const res = matchSelfPostedRecents(entries, recents);
    expect([...res.matchedIds]).toEqual(['in']);
  });

  it('late 側が early 側より優先される（スコアペナルティ）', () => {
    // 同距離 5ms、一方が late（+5ms）、一方が early（-5ms）
    // → late 側（delta >= 0）が選ばれる
    const at = 10_000;
    const entries = [
      { id: 'early', textNorm: 'x', capturedAt: at - 5, index: 0 },
      { id: 'late', textNorm: 'x', capturedAt: at + 5, index: 1 }
    ];
    const recents = [{ itemIndex: 0, textNorm: 'x', at }];
    const res = matchSelfPostedRecents(entries, recents);
    expect([...res.matchedIds]).toEqual(['late']);
  });

  it('1対1: 2 件の同文 recent と 3 件の同文 entry なら 2 件しか matched にならない', () => {
    const entries = [
      { id: 'e1', textNorm: 'hi', capturedAt: 1000, index: 0 },
      { id: 'e2', textNorm: 'hi', capturedAt: 1100, index: 1 },
      { id: 'e3', textNorm: 'hi', capturedAt: 1200, index: 2 }
    ];
    const recents = [
      { itemIndex: 0, textNorm: 'hi', at: 1050 },
      { itemIndex: 1, textNorm: 'hi', at: 1150 }
    ];
    const res = matchSelfPostedRecents(entries, recents);
    expect(res.matchedIds.size).toBe(2);
    expect(res.consumedIndexes.size).toBe(2);
  });

  it('同点スコアのとき元 index が小さい方が優先される', () => {
    // どちらも late 側で同距離
    const at = 1000;
    const entries = [
      { id: 'early-idx', textNorm: 'x', capturedAt: at + 10, index: 3 },
      { id: 'small-idx', textNorm: 'x', capturedAt: at + 10, index: 0 }
    ];
    const recents = [{ itemIndex: 0, textNorm: 'x', at }];
    const res = matchSelfPostedRecents(entries, recents);
    expect([...res.matchedIds]).toEqual(['small-idx']);
  });

  it('recents は時刻昇順で処理される前提で、前の recent が近い entry を取ると後の recent は別 entry に回る', () => {
    const entries = [
      { id: 'close', textNorm: 'x', capturedAt: 1001, index: 0 },
      { id: 'far', textNorm: 'x', capturedAt: 1500, index: 1 }
    ];
    const recents = [
      { itemIndex: 0, textNorm: 'x', at: 1000 },
      { itemIndex: 1, textNorm: 'x', at: 1100 }
    ];
    const res = matchSelfPostedRecents(entries, recents);
    // recent[0] は close を取る（delta=1）
    // recent[1] は close 既取 → far を取る（delta=400）
    expect(res.matchedIds.has('close')).toBe(true);
    expect(res.matchedIds.has('far')).toBe(true);
    expect([...res.consumedIndexes].sort()).toEqual([0, 1]);
  });

  it('id や textNorm が欠けた entry はスキップ', () => {
    const entries = [
      { id: '', textNorm: 'x', capturedAt: 1000, index: 0 },
      { id: 'e1', textNorm: '', capturedAt: 1000, index: 1 },
      { id: 'ok', textNorm: 'x', capturedAt: 1000, index: 2 }
    ];
    const res = matchSelfPostedRecents(entries, [
      { itemIndex: 0, textNorm: 'x', at: 1000 }
    ]);
    expect([...res.matchedIds]).toEqual(['ok']);
  });

  it('opts.earlyMs / opts.lateMs で窓を上書きできる', () => {
    // デフォルトなら match、窓を狭めれば miss
    const at = 1000;
    const entries = [{ id: 'e', textNorm: 'x', capturedAt: at + 1000, index: 0 }];
    const recents = [{ itemIndex: 0, textNorm: 'x', at }];
    // デフォルト（late 10 分）なら match
    expect(matchSelfPostedRecents(entries, recents).matchedIds.has('e')).toBe(true);
    // late を 500ms に絞れば miss
    expect(
      matchSelfPostedRecents(entries, recents, { lateMs: 500 }).matchedIds.size
    ).toBe(0);
  });
});

describe('matchesAnySelfPostedRecent', () => {
  it('textNorm 一致 + 時間窓内 → true', () => {
    const hit = matchesAnySelfPostedRecent(
      { textNorm: 'こん', capturedAt: 1010 },
      [{ liveId: 'lv1', textNorm: 'こん', at: 1000 }],
      'lv1'
    );
    expect(hit).toBe(true);
  });

  it('textNorm が空 or liveId が空 → false', () => {
    expect(
      matchesAnySelfPostedRecent(
        { textNorm: '', capturedAt: 1000 },
        [{ liveId: 'lv', textNorm: 'x', at: 1000 }],
        'lv'
      )
    ).toBe(false);
    expect(
      matchesAnySelfPostedRecent(
        { textNorm: 'x', capturedAt: 1000 },
        [{ liveId: 'lv', textNorm: 'x', at: 1000 }],
        ''
      )
    ).toBe(false);
  });

  it('recent の liveId は大文字小文字無視で比較', () => {
    expect(
      matchesAnySelfPostedRecent(
        { textNorm: 'x', capturedAt: 1000 },
        [{ liveId: 'LV1', textNorm: 'x', at: 1000 }],
        'lv1'
      )
    ).toBe(true);
  });

  it('窓外（late 側超過） → false', () => {
    expect(
      matchesAnySelfPostedRecent(
        { textNorm: 'x', capturedAt: 1000 + SELF_POST_MATCH_LATE_MS + 1 },
        [{ liveId: 'lv', textNorm: 'x', at: 1000 }],
        'lv'
      )
    ).toBe(false);
  });

  it('recents が配列でなくても落ちず false', () => {
    // @ts-expect-error 意図的に不正
    expect(matchesAnySelfPostedRecent({ textNorm: 'x', capturedAt: 1 }, null, 'lv')).toBe(
      false
    );
  });
});
