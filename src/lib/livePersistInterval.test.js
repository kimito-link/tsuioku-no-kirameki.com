import { describe, it, expect } from 'vitest';
import {
  computeLivePersistIntervalMs,
  LIVE_PERSIST_BASE_MS,
  LIVE_PERSIST_VISIBLE_MAX_MS,
  LIVE_PERSIST_HIDDEN_MAX_MS,
  LIVE_PERSIST_GROWTH_FLOOR,
  LIVE_PERSIST_HIDDEN_GROWTH_FLOOR,
  LIVE_PERSIST_GROWTH_CEIL
} from './livePersistInterval.js';

describe('computeLivePersistIntervalMs', () => {
  it('前面: FLOOR 以下は常に基本間隔（全タブ常時リアルタイム）', () => {
    for (const count of [0, 800, 7_000, LIVE_PERSIST_GROWTH_FLOOR]) {
      expect(computeLivePersistIntervalMs({ hidden: false, storedCount: count })).toBe(
        LIVE_PERSIST_BASE_MS
      );
    }
  });

  it('裏タブ: HIDDEN_FLOOR 以下は基本間隔（小規模は裏でもリアルタイム）', () => {
    for (const count of [0, 800, LIVE_PERSIST_HIDDEN_GROWTH_FLOOR]) {
      expect(computeLivePersistIntervalMs({ hidden: true, storedCount: count })).toBe(
        LIVE_PERSIST_BASE_MS
      );
    }
  });

  it('回帰防止: 7,000 件級は前面では基本間隔（切替直後に増えないを解消）', () => {
    expect(computeLivePersistIntervalMs({ storedCount: 7_578 })).toBe(
      LIVE_PERSIST_BASE_MS
    );
  });

  it('v0.1.504: 1 万件級の裏タブは throttle される（多タブで前面を固めない）', () => {
    // 前面は不変（基本間隔）だが、裏に回った 1 万件タブは間隔が大きく伸びる。
    expect(computeLivePersistIntervalMs({ storedCount: 10_116 })).toBe(
      LIVE_PERSIST_BASE_MS
    );
    const hidden = computeLivePersistIntervalMs({
      hidden: true,
      storedCount: 10_116
    });
    expect(hidden).toBeGreaterThan(LIVE_PERSIST_BASE_MS * 5);
  });

  it('前面・CEIL 以上は前面上限間隔', () => {
    expect(
      computeLivePersistIntervalMs({ storedCount: LIVE_PERSIST_GROWTH_CEIL })
    ).toBe(LIVE_PERSIST_VISIBLE_MAX_MS);
    expect(computeLivePersistIntervalMs({ storedCount: 100_000 })).toBe(
      LIVE_PERSIST_VISIBLE_MAX_MS
    );
  });

  it('裏タブ・CEIL 以上のみ hidden 上限間隔（巨大放送のフリーズ源を強く抑える）', () => {
    expect(
      computeLivePersistIntervalMs({ hidden: true, storedCount: LIVE_PERSIST_GROWTH_CEIL })
    ).toBe(LIVE_PERSIST_HIDDEN_MAX_MS);
    expect(
      computeLivePersistIntervalMs({ hidden: true, storedCount: 100_000 })
    ).toBe(LIVE_PERSIST_HIDDEN_MAX_MS);
  });

  it('巨大放送帯では件数増加に対して前面・裏とも単調増加', () => {
    const vLow = computeLivePersistIntervalMs({ storedCount: 18_000 });
    const vHigh = computeLivePersistIntervalMs({ storedCount: 26_000 });
    expect(vHigh).toBeGreaterThan(vLow);
    expect(vLow).toBeGreaterThan(LIVE_PERSIST_BASE_MS);

    const hLow = computeLivePersistIntervalMs({ hidden: true, storedCount: 18_000 });
    const hHigh = computeLivePersistIntervalMs({ hidden: true, storedCount: 26_000 });
    expect(hHigh).toBeGreaterThan(hLow);
  });

  it('巨大放送帯では裏タブの間隔は前面以上', () => {
    for (const c of [15_000, 20_000, 30_000, 80_000]) {
      const visible = computeLivePersistIntervalMs({ storedCount: c });
      const hidden = computeLivePersistIntervalMs({ hidden: true, storedCount: c });
      expect(hidden).toBeGreaterThanOrEqual(visible);
    }
  });

  it('v0.1.510: boundedWrite(チャンク化済み) は件数・可視に関係なく基本間隔', () => {
    // チャンク化済みは毎フラッシュ O(追加分)＋有界テールなので件数比例の間引きは不要。
    for (const c of [15_000, 30_000, 100_000]) {
      expect(
        computeLivePersistIntervalMs({ boundedWrite: true, storedCount: c })
      ).toBe(LIVE_PERSIST_BASE_MS);
      expect(
        computeLivePersistIntervalMs({
          boundedWrite: true,
          hidden: true,
          storedCount: c
        })
      ).toBe(LIVE_PERSIST_BASE_MS);
    }
  });

  it('v0.1.510: boundedWrite は baseMs 上書きを尊重する', () => {
    expect(
      computeLivePersistIntervalMs({
        boundedWrite: true,
        hidden: true,
        storedCount: 100_000,
        baseMs: 2_000
      })
    ).toBe(2_000);
  });

  it('v0.1.510: boundedWrite が false/未指定なら従来どおり件数比例で間引く', () => {
    const hidden = computeLivePersistIntervalMs({
      boundedWrite: false,
      hidden: true,
      storedCount: 15_000
    });
    expect(hidden).toBeGreaterThan(LIVE_PERSIST_BASE_MS * 5);
  });

  it('不正な storedCount は基本間隔に丸める', () => {
    expect(computeLivePersistIntervalMs({ storedCount: NaN })).toBe(
      LIVE_PERSIST_BASE_MS
    );
    expect(computeLivePersistIntervalMs({ storedCount: -100 })).toBe(
      LIVE_PERSIST_BASE_MS
    );
    expect(computeLivePersistIntervalMs({})).toBe(LIVE_PERSIST_BASE_MS);
  });

  it('境界（baseMs / maxVisibleMs / hiddenMaxMs）を上書きできる', () => {
    expect(
      computeLivePersistIntervalMs({ storedCount: 0, baseMs: 2_000 })
    ).toBe(2_000);
    expect(
      computeLivePersistIntervalMs({
        storedCount: 100_000,
        baseMs: 2_000,
        maxVisibleMs: 9_000
      })
    ).toBe(9_000);
    expect(
      computeLivePersistIntervalMs({
        hidden: true,
        storedCount: 100_000,
        hiddenMaxMs: 90_000
      })
    ).toBe(90_000);
  });

  it('不正な上書き値は既定にフォールバックする', () => {
    expect(computeLivePersistIntervalMs({ storedCount: 0, baseMs: 0 })).toBe(
      LIVE_PERSIST_BASE_MS
    );
    expect(
      computeLivePersistIntervalMs({ storedCount: 100_000, maxVisibleMs: -1 })
    ).toBe(LIVE_PERSIST_VISIBLE_MAX_MS);
  });
});
