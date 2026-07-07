import { describe, it, expect } from 'vitest';
import {
  createEmptyMirrorBundle,
  mergeMirrorBundleSection,
  bumpMirrorBundleGeneration,
  isMirrorBundleGenerationStale,
  restoreMirrorBundleSection
} from './mirrorBundle.js';

/**
 * ★このテストは council/pop-foundation-then-parity-SYNTHESIS.md §3.5 の単調性ガード設計を固定する。
 *   特に「配信切替で gen を巻き戻さない」不変条件(下記 gen 温存テスト)は、旧実装
 *   (liveId リセット時 gen=0)なら FAIL する形にして退化を検知する。
 */

const LANE = { liveId: 'lv1', capturedAt: 10, link: [{ title: 'りんく' }], pickedLength: 1 };
const STAT_CARDS = { liveId: 'lv1', capturedAt: 11, recordsText: '3件' };
const TOP_SUPPORTERS = { liveId: 'lv1', capturedAt: 12, rooms: [{ nickname: '応援者A', count: 3 }] };
const NORTH_STAR = {
  liveId: 'lv1',
  capturedAt: 13,
  lanes: { contributionRanking: [{ name: '貢献A' }], adRanking: [] }
};
const TIMELINE = { liveId: 'lv1', capturedAt: 14, rows: [{ name: 'コメントA', text: '888' }], totalSeen: 1 };
// ③WEB投げ一覧丸写し(第2号): giftHistory バンドル節。rooms(貢献者)+ledgerRows(投げ明細)。
const GIFT_HISTORY = {
  liveId: 'lv1',
  capturedAt: 15,
  rooms: [{ userKey: 'u1', nickname: '投げ主A', count: 500, avatarUrl: '' }],
  ledgerRows: [{ timeLabel: '12:00', itemName: '花束', points: 300, userId: '1', senderLabel: '投げ主A', source: 'koken-api' }],
  ledgerTotalCount: 1
};

describe('createEmptyMirrorBundle', () => {
  it('6セクションが null の初期形を返す(giftHistory=③WEB投げ一覧丸写し・第2号を含む)', () => {
    expect(createEmptyMirrorBundle()).toEqual({
      liveId: '',
      gen: 0,
      capturedAt: 0,
      sections: {
        lane: null,
        statCards: null,
        topSupporters: null,
        northStar: null,
        commentTimeline: null,
        giftHistory: null
      }
    });
  });
});

/**
 * P0 不変条件: 5鏡は別タイミングで resolve しても、最終バッファでは同じ liveId の全セクションが
 * 揃わなければならない。後着セクションが先着セクションを消さないことをここで固定する。
 */
describe('mergeMirrorBundleSection', () => {
  it('lane→statCards→northStar の順に部分更新しても全部揃う', () => {
    let buf = createEmptyMirrorBundle();
    buf = mergeMirrorBundleSection(buf, 'lane', LANE, { liveId: 'lv1', nowMs: 100 });
    buf = mergeMirrorBundleSection(buf, 'statCards', STAT_CARDS, { liveId: 'lv1', nowMs: 101 });
    buf = mergeMirrorBundleSection(buf, 'northStar', NORTH_STAR, { liveId: 'lv1', nowMs: 102 });

    expect(buf.liveId).toBe('lv1');
    expect(buf.capturedAt).toBe(102);
    expect(buf.gen).toBe(0);
    expect(buf.sections.lane).toBe(LANE);
    expect(buf.sections.statCards).toBe(STAT_CARDS);
    expect(buf.sections.northStar).toBe(NORTH_STAR);
  });

  it('northStar→statCards→lane の逆順でも全部揃う(解決順は非決定的)', () => {
    let buf = createEmptyMirrorBundle();
    buf = mergeMirrorBundleSection(buf, 'northStar', NORTH_STAR, { liveId: 'lv1', nowMs: 200 });
    buf = mergeMirrorBundleSection(buf, 'statCards', STAT_CARDS, { liveId: 'lv1', nowMs: 201 });
    buf = mergeMirrorBundleSection(buf, 'lane', LANE, { liveId: 'lv1', nowMs: 202 });

    expect(buf.sections.lane).toBe(LANE);
    expect(buf.sections.statCards).toBe(STAT_CARDS);
    expect(buf.sections.northStar).toBe(NORTH_STAR);
  });

  it('1セクションだけ更新しても他セクションを温存する', () => {
    let buf = createEmptyMirrorBundle();
    buf = mergeMirrorBundleSection(buf, 'lane', LANE, { liveId: 'lv1', nowMs: 100 });
    buf = mergeMirrorBundleSection(buf, 'statCards', STAT_CARDS, { liveId: 'lv1', nowMs: 101 });
    buf = mergeMirrorBundleSection(buf, 'topSupporters', TOP_SUPPORTERS, { liveId: 'lv1', nowMs: 102 });
    buf = mergeMirrorBundleSection(buf, 'northStar', NORTH_STAR, { liveId: 'lv1', nowMs: 103 });
    buf = mergeMirrorBundleSection(buf, 'commentTimeline', TIMELINE, { liveId: 'lv1', nowMs: 104 });

    const nextLane = { ...LANE, pickedLength: 2 };
    const next = mergeMirrorBundleSection(buf, 'lane', nextLane, { liveId: 'lv1', nowMs: 105 });

    expect(next.sections.lane).toBe(nextLane);
    expect(next.sections.statCards).toBe(STAT_CARDS);
    expect(next.sections.topSupporters).toBe(TOP_SUPPORTERS);
    expect(next.sections.northStar).toBe(NORTH_STAR);
    expect(next.sections.commentTimeline).toBe(TIMELINE);
    expect(buf.sections.lane).toBe(LANE); // 元 buffer は変更しない
  });

  it('liveId が変わったら全セクションをリセットして古い配信を持ち越さない', () => {
    let buf = createEmptyMirrorBundle();
    buf = mergeMirrorBundleSection(buf, 'lane', LANE, { liveId: 'lv1', nowMs: 100 });
    buf = mergeMirrorBundleSection(buf, 'statCards', STAT_CARDS, { liveId: 'lv1', nowMs: 101 });

    const lv2NorthStar = { ...NORTH_STAR, liveId: 'lv2' };
    const next = mergeMirrorBundleSection(buf, 'northStar', lv2NorthStar, { liveId: 'lv2', nowMs: 200 });

    expect(next.liveId).toBe('lv2');
    expect(next.sections.lane).toBeNull();
    expect(next.sections.statCards).toBeNull();
    expect(next.sections.northStar).toBe(lv2NorthStar);
  });

  it('★配信切替で gen を巻き戻さない(バンドル生涯で単調・旧実装 gen=0 なら FAIL)', () => {
    // lv1 で gen を 3 まで進める(merge 据え置き→bump が上げる)。
    let buf = createEmptyMirrorBundle();
    buf = mergeMirrorBundleSection(buf, 'lane', LANE, { liveId: 'lv1', nowMs: 100 });
    buf = bumpMirrorBundleGeneration(buf, 100);
    buf = bumpMirrorBundleGeneration(buf, 101);
    buf = bumpMirrorBundleGeneration(buf, 102); // gen=3
    expect(buf.gen).toBe(3);

    // 配信切替(lv2)。セクションはリセットされるが gen は温存(3 のまま)。
    const lv2Lane = { ...LANE, liveId: 'lv2' };
    const next = mergeMirrorBundleSection(buf, 'lane', lv2Lane, { liveId: 'lv2', nowMs: 200 });
    expect(next.liveId).toBe('lv2');
    expect(next.sections.statCards).toBeNull(); // 古い配信は持ち越さない
    expect(next.gen).toBe(3); // ★巻き戻さない(旧実装なら 0 で FAIL)
  });

  it('★配信切替後の gen 前進を読み手が stale 誤判定しない(結合不変条件)', () => {
    // lv1 を gen5 まで描いた読み手(lastPaintedGen=5)。
    let buf = createEmptyMirrorBundle();
    buf = mergeMirrorBundleSection(buf, 'lane', LANE, { liveId: 'lv1', nowMs: 100 });
    for (let i = 0; i < 5; i += 1) buf = bumpMirrorBundleGeneration(buf, 100 + i);
    expect(buf.gen).toBe(5);
    const lastPaintedGen = buf.gen;

    // 配信切替(lv2)→ flush で gen=6(温存 5 の続き)。
    const lv2Lane = { ...LANE, liveId: 'lv2' };
    let lv2 = mergeMirrorBundleSection(buf, 'lane', lv2Lane, { liveId: 'lv2', nowMs: 200 });
    lv2 = bumpMirrorBundleGeneration(lv2, 201); // gen=6
    // gen が単調前進(6>5)なので読み手は新配信を描ける(stale=false)。
    expect(isMirrorBundleGenerationStale(lastPaintedGen, lv2.gen)).toBe(false);
  });

  it('capturedAt は単調前進する(古い nowMs を渡しても巻き戻らない・0 に落ちない)', () => {
    let buf = mergeMirrorBundleSection(createEmptyMirrorBundle(), 'lane', LANE, { liveId: 'lv1', nowMs: 500 });
    expect(buf.capturedAt).toBe(500);
    // 古い nowMs で merge しても巻き戻らない。
    buf = mergeMirrorBundleSection(buf, 'statCards', STAT_CARDS, { liveId: 'lv1', nowMs: 400 });
    expect(buf.capturedAt).toBe(500);
    // nowMs 未指定 merge でも 0 に落ちない。
    buf = mergeMirrorBundleSection(buf, 'topSupporters', TOP_SUPPORTERS, { liveId: 'lv1' });
    expect(buf.capturedAt).toBe(500);
    // 新しい nowMs なら前進する。
    buf = mergeMirrorBundleSection(buf, 'northStar', NORTH_STAR, { liveId: 'lv1', nowMs: 600 });
    expect(buf.capturedAt).toBe(600);
  });

  it('liveId 未指定の patch は既存 liveId を変えない', () => {
    let buf = mergeMirrorBundleSection(createEmptyMirrorBundle(), 'lane', LANE, { liveId: 'lv1', nowMs: 100 });
    buf = mergeMirrorBundleSection(buf, 'statCards', STAT_CARDS, { nowMs: 101 });

    expect(buf.liveId).toBe('lv1');
    expect(buf.sections.lane).toBe(LANE);
    expect(buf.sections.statCards).toBe(STAT_CARDS);
  });
});

describe('bumpMirrorBundleGeneration', () => {
  it('gen を単調増加し capturedAt を更新し、元 buffer は変更しない', () => {
    const buf = mergeMirrorBundleSection(createEmptyMirrorBundle(), 'lane', LANE, { liveId: 'lv1', nowMs: 100 });
    const bumped = bumpMirrorBundleGeneration(buf, 999);

    expect(bumped.gen).toBe(1);
    expect(bumped.capturedAt).toBe(999);
    expect(bumped.sections.lane).toBe(LANE);
    expect(buf.gen).toBe(0);
    expect(buf.capturedAt).toBe(100);

    const bumpedAgain = bumpMirrorBundleGeneration(bumped, 1000);
    expect(bumpedAgain.gen).toBe(2);
    expect(bumpedAgain.capturedAt).toBe(1000);
  });
});

describe('isMirrorBundleGenerationStale', () => {
  it('初回(lastPaintedGen 未定義)は描画できる', () => {
    expect(isMirrorBundleGenerationStale(undefined, 0)).toBe(false);
  });

  it('lastPaintedGen が 0 で incoming が進んでいれば描画できる', () => {
    expect(isMirrorBundleGenerationStale(0, 1)).toBe(false);
  });

  it('同じ gen は stale=true', () => {
    expect(isMirrorBundleGenerationStale(2, 2)).toBe(true);
  });

  it('incoming が大きければ stale=false、小さければ stale=true', () => {
    expect(isMirrorBundleGenerationStale(2, 3)).toBe(false);
    expect(isMirrorBundleGenerationStale(2, 1)).toBe(true);
  });
});

describe('restoreMirrorBundleSection', () => {
  it('指定セクションの snapshot を取り出す', () => {
    const buf = mergeMirrorBundleSection(createEmptyMirrorBundle(), 'commentTimeline', TIMELINE, {
      liveId: 'lv1',
      nowMs: 100
    });

    expect(restoreMirrorBundleSection(buf, 'commentTimeline')).toBe(TIMELINE);
  });

  it('null-safe: bundle が null/セクションが無い/未知キーでも null', () => {
    expect(restoreMirrorBundleSection(null, 'lane')).toBeNull();
    expect(restoreMirrorBundleSection(createEmptyMirrorBundle(), 'lane')).toBeNull();
    expect(restoreMirrorBundleSection(createEmptyMirrorBundle(), 'unknown')).toBeNull();
  });
});

describe('mirrorBundle ネガティブコントロール', () => {
  it('null/undefined 入力で例外を投げない', () => {
    expect(() => mergeMirrorBundleSection(null, undefined, undefined, undefined)).not.toThrow();
    expect(() => bumpMirrorBundleGeneration(undefined, undefined)).not.toThrow();
    expect(() => isMirrorBundleGenerationStale(undefined, undefined)).not.toThrow();
    expect(() => restoreMirrorBundleSection(undefined, undefined)).not.toThrow();
  });
});

describe('giftHistory バンドル節(③WEB投げ一覧丸写し・第2号)', () => {
  it("'giftHistory' は正規セクションキー=merge/restore できる(他5鏡と同一 tick に載る)", () => {
    let buf = createEmptyMirrorBundle();
    buf = mergeMirrorBundleSection(buf, 'commentTimeline', TIMELINE, { liveId: 'lv1', nowMs: 100 });
    buf = mergeMirrorBundleSection(buf, 'giftHistory', GIFT_HISTORY, { liveId: 'lv1', nowMs: 101 });
    // giftHistory を足しても既存の commentTimeline を消さない(後着が先着を消さない)。
    expect(buf.sections.commentTimeline).toBe(TIMELINE);
    expect(buf.sections.giftHistory).toBe(GIFT_HISTORY);
    expect(restoreMirrorBundleSection(buf, 'giftHistory')).toBe(GIFT_HISTORY);
  });

  it('ネガコン: 未反映の giftHistory は初期形で null(既存を消さない)', () => {
    const buf = mergeMirrorBundleSection(createEmptyMirrorBundle(), 'lane', LANE, { liveId: 'lv1', nowMs: 100 });
    expect(buf.sections.giftHistory).toBeNull();
    expect(restoreMirrorBundleSection(buf, 'giftHistory')).toBeNull();
  });
});
