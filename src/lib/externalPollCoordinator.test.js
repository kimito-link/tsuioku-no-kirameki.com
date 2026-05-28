import { describe, it, expect } from 'vitest';
import {
  normalizeActiveLiveIds,
  liveActiveLiveIds,
  upsertActiveLiveId,
  shouldSelfFetchAsFallback,
  KEY_ACTIVE_LIVE_IDS,
  ACTIVE_LIVE_ID_TTL_MS
} from './externalPollCoordinator.js';

describe('normalizeActiveLiveIds', () => {
  it('配列形 / {items:[]} 形どちらも受ける', () => {
    expect(normalizeActiveLiveIds([{ lv: 'lv1', ts: 100 }])).toEqual([{ lv: 'lv1', ts: 100 }]);
    expect(normalizeActiveLiveIds({ items: [{ lv: 'lv1', ts: 100 }] })).toEqual([
      { lv: 'lv1', ts: 100 }
    ]);
  });

  it('lv 形式でない / ts 不正は捨てる', () => {
    const got = normalizeActiveLiveIds([
      { lv: 'lv123', ts: 100 },
      { lv: 'not-lv', ts: 100 }, // 形式NG
      { lv: 'lv9', ts: 0 }, // ts<=0
      { lv: 'lv9', ts: NaN }, // ts NaN
      { lv: 'LV456', ts: 200 } // 大文字→小文字化
    ]);
    expect(got).toContainEqual({ lv: 'lv123', ts: 100 });
    expect(got).toContainEqual({ lv: 'lv456', ts: 200 });
    expect(got.find((e) => e.lv === 'not-lv')).toBeUndefined();
    expect(got.find((e) => e.lv === 'lv9')).toBeUndefined();
  });

  it('同一 lv は最新 ts を残す', () => {
    const got = normalizeActiveLiveIds([
      { lv: 'lv1', ts: 100 },
      { lv: 'lv1', ts: 300 },
      { lv: 'lv1', ts: 200 }
    ]);
    expect(got).toEqual([{ lv: 'lv1', ts: 300 }]);
  });

  it('null / 不正入力は空', () => {
    expect(normalizeActiveLiveIds(null)).toEqual([]);
    expect(normalizeActiveLiveIds(undefined)).toEqual([]);
    expect(normalizeActiveLiveIds('x')).toEqual([]);
  });
});

describe('liveActiveLiveIds', () => {
  it('TTL 内の lv だけ返す', () => {
    const now = 1_000_000;
    const raw = {
      items: [
        { lv: 'lv111', ts: now - 1000 },
        { lv: 'lv222', ts: now - (ACTIVE_LIVE_ID_TTL_MS + 1000) }
      ]
    };
    const got = liveActiveLiveIds(raw, now);
    expect(got).toContain('lv111');
    expect(got).not.toContain('lv222');
  });

  it('ttlMs を指定できる', () => {
    const now = 1_000_000;
    const raw = { items: [{ lv: 'lv1', ts: now - 5000 }] };
    expect(liveActiveLiveIds(raw, now, 10_000)).toEqual(['lv1']);
    expect(liveActiveLiveIds(raw, now, 1000)).toEqual([]);
  });
});

describe('upsertActiveLiveId', () => {
  it('自 lv を最新 ts で登録し、期限切れは落とす', () => {
    const now = 1_000_000;
    const raw = {
      items: [
        { lv: 'lv200', ts: now - 1000 },
        { lv: 'lv300', ts: now - (ACTIVE_LIVE_ID_TTL_MS + 1) }
      ]
    };
    const next = upsertActiveLiveId(raw, 'lv100', now);
    const lvs = next.items.map((e) => e.lv);
    expect(lvs).toContain('lv100'); // 自分
    expect(lvs).toContain('lv200'); // 生存
    expect(lvs).not.toContain('lv300'); // 期限切れ掃除
    expect(next.items.find((e) => e.lv === 'lv100')?.ts).toBe(now);
  });

  it('既存 lv の ts を更新する', () => {
    const now = 2_000_000;
    const raw = { items: [{ lv: 'lv1', ts: now - 5000 }] };
    const next = upsertActiveLiveId(raw, 'lv1', now);
    expect(next.items).toEqual([{ lv: 'lv1', ts: now }]);
  });

  it('lv 形式でない自 liveId は登録しない（既存だけ保つ）', () => {
    const now = 3_000_000;
    const raw = { items: [{ lv: 'lv1', ts: now - 1000 }] };
    const next = upsertActiveLiveId(raw, 'garbage', now);
    expect(next.items.map((e) => e.lv)).toEqual(['lv1']);
  });
});

describe('shouldSelfFetchAsFallback', () => {
  it('一度も書かれていない（null/0）なら self-fetch する', () => {
    expect(shouldSelfFetchAsFallback(null, 1000, 60_000)).toBe(true);
    expect(shouldSelfFetchAsFallback(0, 1000, 60_000)).toBe(true);
    expect(shouldSelfFetchAsFallback(undefined, 1000, 60_000)).toBe(true);
  });

  it('SW が最近書いていれば self-fetch しない', () => {
    const now = 1_000_000;
    expect(shouldSelfFetchAsFallback(now - 5000, now, 60_000)).toBe(false);
  });

  it('SW が staleMs 以上書いていなければ self-fetch する', () => {
    const now = 1_000_000;
    expect(shouldSelfFetchAsFallback(now - 70_000, now, 60_000)).toBe(true);
  });
});

describe('定数', () => {
  it('KEY/TTL が想定値', () => {
    expect(KEY_ACTIVE_LIVE_IDS).toBe('nls_active_live_ids_v1');
    expect(ACTIVE_LIVE_ID_TTL_MS).toBe(90_000);
  });
});
