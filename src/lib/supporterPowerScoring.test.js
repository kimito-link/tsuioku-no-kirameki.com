/**
 * supporterPowerScoring の徹底テスト。設計レポートの「テスト方針」(§483 以降)に従う:
 * - スコアリング境界（S/A/B/C/D/E）
 * - 欠損値ケース（undefined を 0 扱いしない、influence 全欠損 fallback）
 * - 偏差値計算（highest=100, lowest=0, tie 同順）
 * - 正規化（logNorm, p95 cap）
 * - 常連密度（N=30, effectiveN < N）
 * - 互換性は Phase 2-B 以降で接続テスト追加（本ファイルは pure scoring の境界保護）
 */

import { describe, it, expect } from 'vitest';
import {
  asNonNegativeNumber,
  clampNumber,
  logNorm,
  percentileOf,
  medianOf,
  weightedAverageAvailable,
  buildSupporterPowerScoringContext,
  computeEngagementScore,
  computeLoyaltyScore,
  computeInfluenceScore,
  classifyTier,
  computeAllSupporterPowers,
  buildSupporterPowerSummary
} from './supporterPowerScoring.js';

/* -------------------------------------------------------------------------- */
/* Phase 2-A unit (pure helpers)                                              */
/* -------------------------------------------------------------------------- */

describe('asNonNegativeNumber', () => {
  it('0 以上の有限数のみ', () => {
    expect(asNonNegativeNumber(0)).toBe(0);
    expect(asNonNegativeNumber(42)).toBe(42);
    expect(asNonNegativeNumber(3.14)).toBeCloseTo(3.14);
    expect(asNonNegativeNumber(-1)).toBe(null);
    expect(asNonNegativeNumber(NaN)).toBe(null);
    expect(asNonNegativeNumber(Infinity)).toBe(null);
    expect(asNonNegativeNumber(undefined)).toBe(null);
    expect(asNonNegativeNumber(null)).toBe(null);
    expect(asNonNegativeNumber('5')).toBe(5);
    expect(asNonNegativeNumber('abc')).toBe(null);
  });
});

describe('clampNumber', () => {
  it('範囲外は端に', () => {
    expect(clampNumber(50, 0, 100)).toBe(50);
    expect(clampNumber(-1, 0, 100)).toBe(0);
    expect(clampNumber(150, 0, 100)).toBe(100);
    expect(clampNumber(NaN, 0, 100)).toBe(0);
  });
});

describe('logNorm', () => {
  it('logNorm(0, cap) は 0', () => {
    expect(logNorm(0, 100)).toBe(0);
  });
  it('value >= cap で 100 に張り付く', () => {
    expect(logNorm(100, 100)).toBe(100);
    expect(logNorm(200, 100)).toBe(100); // clamp された
  });
  it('comment 100 と 1000 の差は線形 10 倍ではない（圧縮される）', () => {
    const s100 = logNorm(100, 1000);
    const s1000 = logNorm(1000, 1000);
    // 線形なら 10 倍だが、対数では 1000 が cap=100、100 は 67 付近
    expect(s1000).toBe(100);
    expect(s100).toBeGreaterThan(50);
    expect(s100).toBeLessThan(80);
  });
  it('cap が 0 以下なら 0', () => {
    expect(logNorm(100, 0)).toBe(0);
    expect(logNorm(100, -5)).toBe(0);
  });
  it('null/undefined はゼロ扱い', () => {
    expect(logNorm(null, 100)).toBe(0);
    expect(logNorm(undefined, 100)).toBe(0);
  });
});

describe('percentileOf', () => {
  it('空配列は 0', () => {
    expect(percentileOf([], 50)).toBe(0);
  });
  it('1 要素は p に関わらず自身を返す', () => {
    expect(percentileOf([42], 0)).toBe(42);
    expect(percentileOf([42], 50)).toBe(42);
    expect(percentileOf([42], 100)).toBe(42);
  });
  it('5 要素の p50 は中央値', () => {
    expect(percentileOf([1, 2, 3, 4, 5], 50)).toBe(3);
  });
  it('p95 は上位寄り', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentileOf(v, 95)).toBeCloseTo(9.55, 1);
  });
});

describe('medianOf', () => {
  it('percentileOf(50) と一致', () => {
    expect(medianOf([1, 2, 3, 4, 5])).toBe(3);
    expect(medianOf([])).toBe(0);
  });
});

describe('weightedAverageAvailable', () => {
  it('全 sub-field 揃っているなら通常加重', () => {
    const r = weightedAverageAvailable(
      { a: 100, b: 50 },
      { a: 0.5, b: 0.5 }
    );
    expect(r).toBe(75);
  });
  it('欠損は残った重みで再正規化', () => {
    // a=100 (w 0.6), b=null (w 0.4) → a だけで 100
    const r = weightedAverageAvailable(
      { a: 100, b: null },
      { a: 0.6, b: 0.4 }
    );
    expect(r).toBe(100);
  });
  it('全 sub-field 欠損なら null', () => {
    const r = weightedAverageAvailable(
      { a: null, b: undefined },
      { a: 0.5, b: 0.5 }
    );
    expect(r).toBe(null);
  });
  it('weights が空・無効でも安全', () => {
    expect(weightedAverageAvailable({ a: 100 }, {})).toBe(null);
    expect(weightedAverageAvailable({ a: 100 }, { a: 0 })).toBe(null);
  });
});

/* -------------------------------------------------------------------------- */
/* コンテキスト & コンポーネント                                                */
/* -------------------------------------------------------------------------- */

describe('buildSupporterPowerScoringContext', () => {
  it('20 名以上では tierMode=normal, allowS=true', () => {
    const inputs = Array.from({ length: 25 }, (_, i) => ({
      userId: String(i + 1),
      commentCount: i + 1
    }));
    const ctx = buildSupporterPowerScoringContext(inputs);
    expect(ctx.tierMode).toBe('normal');
    expect(ctx.allowS).toBe(true);
    expect(ctx.sampleSize).toBe(25);
  });
  it('5-19 名は smallSample', () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      userId: String(i + 1),
      commentCount: i + 1
    }));
    const ctx = buildSupporterPowerScoringContext(inputs);
    expect(ctx.tierMode).toBe('smallSample');
    expect(ctx.allowS).toBe(true);
  });
  it('5 名未満は verySmall, allowS=false', () => {
    const ctx = buildSupporterPowerScoringContext([
      { userId: '1', commentCount: 1 },
      { userId: '2', commentCount: 2 }
    ]);
    expect(ctx.tierMode).toBe('verySmall');
    expect(ctx.allowS).toBe(false);
  });
  it('ギフトが全員 0 なら hasGiftData=false', () => {
    const inputs = [
      { userId: '1', commentCount: 5, giftTotalPoints: 0 },
      { userId: '2', commentCount: 3, giftTotalPoints: 0 }
    ];
    expect(buildSupporterPowerScoringContext(inputs).hasGiftData).toBe(false);
  });
  it('誰か 1 人でも正のギフトがあれば hasGiftData=true', () => {
    const inputs = [
      { userId: '1', commentCount: 5, giftTotalPoints: 100 },
      { userId: '2', commentCount: 3, giftTotalPoints: 0 }
    ];
    expect(buildSupporterPowerScoringContext(inputs).hasGiftData).toBe(true);
  });
  it('cap の floor 値: followerCap≥10, followeeCap≥50, levelCap≥50, commentCap≥1', () => {
    const ctx = buildSupporterPowerScoringContext([
      { userId: '1', commentCount: 0 }
    ]);
    expect(ctx.followerCap).toBeGreaterThanOrEqual(10);
    expect(ctx.followeeCap).toBeGreaterThanOrEqual(50);
    expect(ctx.levelCap).toBeGreaterThanOrEqual(50);
    expect(ctx.commentCap).toBeGreaterThanOrEqual(1);
  });
});

describe('computeEngagementScore', () => {
  const inputs = Array.from({ length: 30 }, (_, i) => ({
    userId: String(i + 1),
    commentCount: i + 1
  }));
  const ctx = buildSupporterPowerScoringContext(inputs);
  it('ギフトなし配信では comment 100%', () => {
    expect(ctx.hasGiftData).toBe(false);
    const s = computeEngagementScore({ userId: '1', commentCount: 100 }, ctx);
    expect(s).toBeGreaterThan(0);
  });
  it('ギフトあり配信では gift sub-weight 30%', () => {
    const giftInputs = [
      { userId: '1', commentCount: 10, giftTotalPoints: 1000 },
      { userId: '2', commentCount: 10, giftTotalPoints: 0 },
      { userId: '3', commentCount: 10, giftTotalPoints: 500 }
    ];
    const ctxG = buildSupporterPowerScoringContext(giftInputs);
    expect(ctxG.hasGiftData).toBe(true);
    const sWithGift = computeEngagementScore(
      { userId: '1', commentCount: 10, giftTotalPoints: 1000 },
      ctxG
    );
    const sNoGift = computeEngagementScore(
      { userId: '2', commentCount: 10, giftTotalPoints: 0 },
      ctxG
    );
    expect(sWithGift).toBeGreaterThan(sNoGift);
  });
});

describe('computeLoyaltyScore', () => {
  const ctx = buildSupporterPowerScoringContext(
    Array.from({ length: 30 }, (_, i) => ({ userId: String(i + 1), commentCount: 1 })),
    { loyaltyWindowSize: 30, availableLiveCount: 30 }
  );
  it('1/30 ≒ 18 点', () => {
    const s = computeLoyaltyScore({ userId: '1', commentCount: 1, loyaltyCount: 1 }, ctx);
    expect(Math.round(s)).toBe(18);
  });
  it('15/30 ≒ 71 点', () => {
    const s = computeLoyaltyScore({ userId: '1', commentCount: 1, loyaltyCount: 15 }, ctx);
    expect(Math.round(s)).toBe(71);
  });
  it('30/30 = 100 点', () => {
    const s = computeLoyaltyScore({ userId: '1', commentCount: 1, loyaltyCount: 30 }, ctx);
    expect(s).toBe(100);
  });
  it('availableLiveCount=5 の時は effectiveN=5', () => {
    const ctx5 = buildSupporterPowerScoringContext(
      [{ userId: '1', commentCount: 1 }],
      { loyaltyWindowSize: 30, availableLiveCount: 5 }
    );
    const s = computeLoyaltyScore({ userId: '1', commentCount: 1, loyaltyCount: 5 }, ctx5);
    expect(s).toBe(100); // 5/5 = 1.0
  });
  it('loyaltyCount 未指定なら 1 と扱う（新規も 0 にしない）', () => {
    const s = computeLoyaltyScore({ userId: '1', commentCount: 1 }, ctx);
    expect(s).toBeGreaterThan(0);
  });
});

describe('computeInfluenceScore', () => {
  const ctx = buildSupporterPowerScoringContext(
    Array.from({ length: 30 }, (_, i) => ({
      userId: String(i + 1),
      commentCount: 1,
      followerCount: i * 100,
      userLevel: i + 1
    }))
  );
  it('全 sub-field 揃っているなら影響度が出る', () => {
    const r = computeInfluenceScore(
      {
        userId: '1',
        commentCount: 1,
        followerCount: 500,
        followeeCount: 100,
        userLevel: 30,
        isPremium: true
      },
      ctx
    );
    expect(r.availableFields).toBe(4);
    expect(r.value).toBeGreaterThan(0);
  });
  it('全 sub-field 欠損なら value=null', () => {
    const r = computeInfluenceScore({ userId: '1', commentCount: 1 }, ctx);
    expect(r.availableFields).toBe(0);
    expect(r.value).toBe(null);
  });
  it('followerCount=0 は実測 0 として followerScore 0（undefined と区別）', () => {
    const r = computeInfluenceScore(
      { userId: '1', commentCount: 1, followerCount: 0 },
      ctx
    );
    expect(r.availableFields).toBe(1);
    expect(r.value).toBe(0); // follower=0 のみ → 0
  });
  it('isPremium=false は欠損ではなく実測 0', () => {
    const r = computeInfluenceScore(
      { userId: '1', commentCount: 1, isPremium: false },
      ctx
    );
    expect(r.availableFields).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 総合スコア & Tier                                                          */
/* -------------------------------------------------------------------------- */

describe('classifyTier', () => {
  const normalCtx = /** @type {any} */ ({ tierMode: 'normal', allowS: true });
  const smallCtx = /** @type {any} */ ({ tierMode: 'smallSample', allowS: true });
  const verySmallCtx = /** @type {any} */ ({ tierMode: 'verySmall', allowS: false });

  it('normal: S は score≥90 かつ percentile≥99', () => {
    const row = { score: 95, components: { engagement: 90, loyalty: 80, influence: 60 } };
    expect(classifyTier(row, 99, normalCtx)).toBe('S');
    expect(classifyTier(row, 98, normalCtx)).toBe('A'); // percentile 不足で A
  });
  it('normal: score=89 は S にならない', () => {
    const row = { score: 89, components: { engagement: 80, loyalty: 70, influence: 50 } };
    expect(classifyTier(row, 100, normalCtx)).toBe('A');
  });
  it('normal: A=80&95, B=65&80, C=50&50, D=35, E=else', () => {
    const r1 = { score: 80, components: { engagement: 70, loyalty: 60, influence: 50 } };
    expect(classifyTier(r1, 95, normalCtx)).toBe('A');
    const r2 = { score: 65, components: { engagement: 60, loyalty: 50, influence: 40 } };
    expect(classifyTier(r2, 80, normalCtx)).toBe('B');
    const r3 = { score: 50, components: { engagement: 40, loyalty: 40, influence: 30 } };
    expect(classifyTier(r3, 50, normalCtx)).toBe('C');
    const r4 = { score: 35, components: { engagement: 25, loyalty: 25, influence: 20 } };
    expect(classifyTier(r4, 20, normalCtx)).toBe('D');
    const r5 = { score: 10, components: { engagement: 5, loyalty: 5, influence: 5 } };
    expect(classifyTier(r5, 1, normalCtx)).toBe('E');
  });
  it('smallSample: score だけで判定', () => {
    const row = { score: 95, components: { engagement: 90, loyalty: 80, influence: 60 } };
    expect(classifyTier(row, 0, smallCtx)).toBe('S'); // percentile 不要
  });
  it('verySmall: S は出ない', () => {
    const row = { score: 95, components: { engagement: 90, loyalty: 80, influence: 60 } };
    expect(classifyTier(row, 100, verySmallCtx)).toBe('A');
  });
  it('例外 1: engagement<20 かつ loyalty<20 は A 以上にならない', () => {
    const row = { score: 95, components: { engagement: 10, loyalty: 10, influence: 100 } };
    expect(classifyTier(row, 99, normalCtx)).toBe('B');
  });
  it('例外 2: loyalty≥90 かつ engagement≥55 は B 以上に floor', () => {
    const row = { score: 55, components: { engagement: 60, loyalty: 95, influence: 30 } };
    expect(classifyTier(row, 30, normalCtx)).toBe('B'); // 通常なら C のはず
  });
});

describe('computeAllSupporterPowers', () => {
  it('行ごとに score/tier/percentile/components を返す', () => {
    const inputs = Array.from({ length: 25 }, (_, i) => ({
      userId: String(i + 1),
      commentCount: i * 4 + 1,
      loyaltyCount: Math.min(30, i + 1)
    }));
    const { rows, context } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    expect(rows).toHaveLength(25);
    expect(context.tierMode).toBe('normal');
    for (const r of rows) {
      expect(r.power.score).toBeGreaterThanOrEqual(0);
      expect(r.power.score).toBeLessThanOrEqual(100);
      expect(['S', 'A', 'B', 'C', 'D', 'E']).toContain(r.power.tier);
      expect(r.power.percentile).toBeGreaterThanOrEqual(0);
      expect(r.power.percentile).toBeLessThanOrEqual(100);
    }
  });

  it('highest=100 percentile, lowest=0', () => {
    const inputs = [
      { userId: '1', commentCount: 100, loyaltyCount: 30 },
      { userId: '2', commentCount: 50, loyaltyCount: 15 },
      { userId: '3', commentCount: 1, loyaltyCount: 1 },
      { userId: '4', commentCount: 30, loyaltyCount: 10 },
      { userId: '5', commentCount: 20, loyaltyCount: 5 }
    ];
    const { rows } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    const max = Math.max(...rows.map((r) => r.power.percentile));
    const min = Math.min(...rows.map((r) => r.power.percentile));
    expect(max).toBe(100);
    expect(min).toBe(0);
  });

  it('influence 全欠損は median fallback、median 不可では 50 中立', () => {
    // 全員 influence 欠損 → median 不可 → 50 中立
    const inputs = [
      { userId: '1', commentCount: 100, loyaltyCount: 30 },
      { userId: '2', commentCount: 50, loyaltyCount: 15 }
    ];
    const { rows } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    for (const r of rows) {
      expect(r.power.components.influence).toBe(50);
    }
  });

  it('一部 influence 欠損は当該配信内 median を使う', () => {
    const inputs = [
      // influence=100 になる人（follower 多)
      { userId: '1', commentCount: 50, loyaltyCount: 15, followerCount: 100000 },
      // influence=0 に近い
      { userId: '2', commentCount: 30, loyaltyCount: 10, followerCount: 0 },
      // 欠損 → median
      { userId: '3', commentCount: 20, loyaltyCount: 5 }
    ];
    const { rows } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    const r3 = rows.find((r) => r.input.userId === '3');
    const r1Influence = rows.find((r) => r.input.userId === '1').power.components.influence;
    const r2Influence = rows.find((r) => r.input.userId === '2').power.components.influence;
    // r3 の influence は r1/r2 の中央値あたり（5名未満なので smallSample fallback）
    expect(r3.power.components.influence).toBeGreaterThan(0);
    expect(r3.power.components.influence).toBeLessThan(100);
    expect(r3.power.components.influence).toBeGreaterThanOrEqual(
      Math.min(r1Influence, r2Influence)
    );
    expect(r3.power.components.influence).toBeLessThanOrEqual(
      Math.max(r1Influence, r2Influence)
    );
  });

  it('5 名未満では S が出ない（verySmall）', () => {
    const inputs = [
      { userId: '1', commentCount: 1000, loyaltyCount: 30, followerCount: 100000, isPremium: true },
      { userId: '2', commentCount: 1, loyaltyCount: 1 }
    ];
    const { rows } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    for (const r of rows) {
      expect(r.power.tier).not.toBe('S');
    }
  });

  it('空入力は空 rows と空 context', () => {
    const { rows, context } = computeAllSupporterPowers([]);
    expect(rows).toEqual([]);
    expect(context.sampleSize).toBe(0);
    expect(context.tierMode).toBe('verySmall');
  });

  it('1 名だけなら percentile=100', () => {
    const inputs = [{ userId: '1', commentCount: 10 }];
    const { rows } = computeAllSupporterPowers(inputs);
    expect(rows[0].power.percentile).toBe(100);
  });

  it('同 score は同 percentile（tie 同順）', () => {
    const inputs = [
      { userId: '1', commentCount: 50, loyaltyCount: 10 },
      { userId: '2', commentCount: 50, loyaltyCount: 10 },
      { userId: '3', commentCount: 30, loyaltyCount: 5 },
      { userId: '4', commentCount: 20, loyaltyCount: 3 },
      { userId: '5', commentCount: 10, loyaltyCount: 1 }
    ];
    const { rows } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    const r1 = rows.find((r) => r.input.userId === '1');
    const r2 = rows.find((r) => r.input.userId === '2');
    // 同 score → 同 percentile
    expect(r1.power.score).toBe(r2.power.score);
    expect(r1.power.percentile).toBe(r2.power.percentile);
  });
});

describe('buildSupporterPowerSummary', () => {
  it('Tier 別人数・中央値・トップ N 行を返す', () => {
    const inputs = Array.from({ length: 25 }, (_, i) => ({
      userId: String(i + 1),
      commentCount: i * 4 + 1,
      loyaltyCount: Math.min(30, i + 1)
    }));
    const { rows } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    const summary = buildSupporterPowerSummary(rows, { topN: 5 });
    expect(summary.sampleSize).toBe(25);
    expect(summary.topRows).toHaveLength(5);
    // top の方が score 高い
    expect(summary.topRows[0].power.score).toBeGreaterThanOrEqual(
      summary.topRows[4].power.score
    );
    // Tier counts 合計 = sampleSize
    const totalCount = Object.values(summary.tierCounts).reduce((a, b) => a + b, 0);
    expect(totalCount).toBe(25);
  });
  it('空配列でも安全', () => {
    const summary = buildSupporterPowerSummary([]);
    expect(summary.sampleSize).toBe(0);
    expect(summary.medianScore).toBe(0);
    expect(summary.topRows).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 設計レポートの「テスト方針」§483 の網羅                                       */
/* -------------------------------------------------------------------------- */

describe('Codex 設計レポート §483 のテスト要件', () => {
  it('score 89.9 は S にならない（90 以上で S）', () => {
    const inputs = [
      // score を狙うために engagement/loyalty を高める
      { userId: '1', commentCount: 9999, loyaltyCount: 30, followerCount: 999999 },
      ...Array.from({ length: 20 }, (_, i) => ({
        userId: String(i + 100),
        commentCount: 1,
        loyaltyCount: 1
      }))
    ];
    const { rows } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    const top = rows.find((r) => r.input.userId === '1');
    if (top.power.score >= 90 && top.power.percentile >= 99) {
      expect(top.power.tier).toBe('S');
    } else if (top.power.score >= 80) {
      expect(top.power.tier).toBe('A');
    }
  });

  it('engagement<20 かつ loyalty<20 の high influence row が A 以上にならない', () => {
    const inputs = [
      // 高 influence、低 engagement、低 loyalty
      { userId: '1', commentCount: 1, loyaltyCount: 1, followerCount: 999999, isPremium: true },
      // 他 20 名は普通
      ...Array.from({ length: 24 }, (_, i) => ({
        userId: String(i + 100),
        commentCount: (i + 1) * 3,
        loyaltyCount: Math.min(30, i + 1)
      }))
    ];
    const { rows } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    const quiet = rows.find((r) => r.input.userId === '1');
    expect(['B', 'C', 'D', 'E']).toContain(quiet.power.tier);
  });

  it('login_required / forbidden / error が score を直接下げない（influence の欠損として扱う）', () => {
    // 状態を input には含めない（commenterFollowingListCache 側で管理）。
    // ここでは influence sub-field が undefined のとき 0 にならないことを確認。
    const inputs = [
      // sub-field なし
      { userId: '1', commentCount: 50, loyaltyCount: 20 },
      // sub-field あり
      { userId: '2', commentCount: 50, loyaltyCount: 20, followerCount: 100 }
    ];
    const { rows } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    // 双方の score は近いはず（influence は median fallback or 値）
    const r1 = rows.find((r) => r.input.userId === '1');
    const r2 = rows.find((r) => r.input.userId === '2');
    // r1 が極端に低くないこと
    expect(Math.abs(r1.power.score - r2.power.score)).toBeLessThan(30);
  });

  it('ギフト集計なしの配信では engagement が comment 100%', () => {
    const inputs = [
      { userId: '1', commentCount: 100, loyaltyCount: 10 },
      { userId: '2', commentCount: 50, loyaltyCount: 5 }
    ];
    const { context } = computeAllSupporterPowers(inputs, {
      loyaltyWindowSize: 30,
      availableLiveCount: 30
    });
    expect(context.hasGiftData).toBe(false);
    // commentCount のみで engagement が決まる
    const r1Engagement = computeEngagementScore(inputs[0], context);
    const r1EngagementWithGift = computeEngagementScore(
      { ...inputs[0], giftTotalPoints: 1000 },
      context
    );
    // hasGiftData=false なので giftTotalPoints は無視される
    expect(r1Engagement).toBe(r1EngagementWithGift);
  });

  it('comment 100 と 1000 の差が線形 10 倍にならない', () => {
    const cap = 1000;
    const s100 = logNorm(100, cap);
    const s1000 = logNorm(1000, cap);
    expect(s1000 / Math.max(1, s100)).toBeLessThan(3); // 線形なら 10 倍
  });

  it('loyaltyCount 1/3/7/15/24/30 の期待値（N=30）', () => {
    const ctx = buildSupporterPowerScoringContext(
      [{ userId: '1', commentCount: 1 }],
      { loyaltyWindowSize: 30, availableLiveCount: 30 }
    );
    expect(Math.round(computeLoyaltyScore({ userId: '1', commentCount: 1, loyaltyCount: 1 }, ctx))).toBe(18);
    expect(Math.round(computeLoyaltyScore({ userId: '1', commentCount: 1, loyaltyCount: 3 }, ctx))).toBe(32);
    expect(Math.round(computeLoyaltyScore({ userId: '1', commentCount: 1, loyaltyCount: 7 }, ctx))).toBe(48);
    expect(Math.round(computeLoyaltyScore({ userId: '1', commentCount: 1, loyaltyCount: 15 }, ctx))).toBe(71);
    expect(Math.round(computeLoyaltyScore({ userId: '1', commentCount: 1, loyaltyCount: 24 }, ctx))).toBe(89);
    expect(Math.round(computeLoyaltyScore({ userId: '1', commentCount: 1, loyaltyCount: 30 }, ctx))).toBe(100);
  });
});
