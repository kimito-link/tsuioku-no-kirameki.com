import { describe, it, expect } from 'vitest';
import {
  CALIBRATION_LOG_VERSION,
  CALIBRATION_LOG_MAX_ITEMS,
  CALIBRATION_SOURCE,
  CALIBRATION_FIELDS,
  buildCalibrationSample,
  parseCalibrationLog,
  appendCalibrationSample,
  serializeCalibrationJson,
  serializeCalibrationCsv
} from './concurrentCalibrationLog.js';

/** 代表的な resolveConcurrentViewers 戻り値の形（必要分だけ） */
function fakeResolved(overrides = {}) {
  return {
    estimated: 804,
    method: 'combined',
    confidence: 0.62,
    captureRatio: 1,
    base: {
      signalA: 341,
      signalB: 1898,
      signalC: 826,
      signalD: 0,
      blended: 812,
      blendedSignalCount: 3,
      activeCommenters: 22,
      multiplier: 15.5,
      retentionPct: 22,
      ...(overrides.base || {})
    },
    ...overrides
  };
}

describe('buildCalibrationSample', () => {
  it('resolved と文脈から数値サンプルを作る（PII を含まない）', () => {
    const s = buildCalibrationSample({
      nowMs: 1000,
      platform: 'niconico',
      liveId: 'lv123',
      source: CALIBRATION_SOURCE.AUTOPATROL,
      resolved: fakeResolved(),
      totalVisitors: 8757,
      recentActiveUsers: 22,
      streamAgeMin: 159.4,
      commentsPerMin: 18.3
    });
    expect(s.ts).toBe(1000);
    expect(s.platform).toBe('niconico');
    expect(s.liveId).toBe('lv123');
    expect(s.source).toBe('autopatrol');
    expect(s.estimated).toBe(804);
    expect(s.blended).toBe(812);
    expect(s.blendedSignalCount).toBe(3);
    expect(s.signalA).toBe(341);
    expect(s.signalC).toBe(826);
    expect(s.multiplier).toBe(15.5);
    expect(s.streamAgeMin).toBe(159.4);
    expect(s.commentsPerMin).toBe(18.3);
    expect(s.officialConcurrent).toBeNull();
    expect(s.errorPct).toBeNull();
    // PII になりうるキーが無いこと
    const keys = Object.keys(s);
    for (const bad of ['nickname', 'text', 'avatarUrl', 'userId']) {
      expect(keys).not.toContain(bad);
    }
  });

  it('公式同接があると errorPct（blend基準）を計算する', () => {
    const s = buildCalibrationSample({
      nowMs: 2000,
      liveId: 'abc',
      platform: 'youtube',
      resolved: fakeResolved({ base: { blended: 900 } }),
      officialConcurrent: 1000
    });
    expect(s.officialConcurrent).toBe(1000);
    // (900-1000)/1000*100 = -10.0
    expect(s.errorPct).toBe(-10);
  });

  it('未知 source は unknown に、platform 既定は niconico に正規化', () => {
    const s = buildCalibrationSample({
      nowMs: 1,
      liveId: 'lv1',
      source: 'weird',
      resolved: fakeResolved()
    });
    expect(s.source).toBe('unknown');
    expect(s.platform).toBe('niconico');
  });

  it('nowMs 無指定なら現在時刻を入れる / 不正数値は null 化', () => {
    const before = Date.now();
    const s = buildCalibrationSample({
      liveId: 'lv1',
      resolved: { estimated: 'x', method: 1, base: { signalA: NaN } }
    });
    expect(s.ts).toBeGreaterThanOrEqual(before);
    expect(s.estimated).toBeNull();
    expect(s.signalA).toBeNull();
  });
});

describe('appendCalibrationSample', () => {
  it('空から1件追記でき version/items が整う', () => {
    const sample = buildCalibrationSample({
      nowMs: 1000,
      liveId: 'lv1',
      resolved: fakeResolved()
    });
    const next = appendCalibrationSample(undefined, sample);
    expect(next).not.toBeNull();
    expect(next?.v).toBe(CALIBRATION_LOG_VERSION);
    expect(next?.items).toHaveLength(1);
  });

  it('同一 (platform+liveId) で minIntervalMs 未満は throttle して null', () => {
    const first = appendCalibrationSample(
      undefined,
      buildCalibrationSample({ nowMs: 1000, liveId: 'lv1', resolved: fakeResolved() })
    );
    const second = appendCalibrationSample(
      first,
      buildCalibrationSample({ nowMs: 1000 + 5000, liveId: 'lv1', resolved: fakeResolved() }),
      { minIntervalMs: 30000 }
    );
    expect(second).toBeNull();
  });

  it('間隔が空けば追記される', () => {
    const first = appendCalibrationSample(
      undefined,
      buildCalibrationSample({ nowMs: 1000, liveId: 'lv1', resolved: fakeResolved() })
    );
    const second = appendCalibrationSample(
      first,
      buildCalibrationSample({ nowMs: 1000 + 31000, liveId: 'lv1', resolved: fakeResolved() }),
      { minIntervalMs: 30000 }
    );
    expect(second).not.toBeNull();
    expect(second?.items).toHaveLength(2);
  });

  it('別 liveId は throttle されず同時刻でも追記される', () => {
    const first = appendCalibrationSample(
      undefined,
      buildCalibrationSample({ nowMs: 1000, liveId: 'lv1', resolved: fakeResolved() })
    );
    const second = appendCalibrationSample(
      first,
      buildCalibrationSample({ nowMs: 1000, liveId: 'lv2', resolved: fakeResolved() }),
      { minIntervalMs: 30000 }
    );
    expect(second?.items).toHaveLength(2);
  });

  it('cap 超過は古いものから捨てる（下限16・末尾cap件を保持）', () => {
    let acc = { v: CALIBRATION_LOG_VERSION, items: [] };
    const total = 20;
    const cap = 16;
    for (let i = 0; i < total; i++) {
      const r = appendCalibrationSample(
        acc,
        buildCalibrationSample({ nowMs: i, liveId: `lv${i}`, resolved: fakeResolved() }),
        { cap, minIntervalMs: 0 }
      );
      if (r) acc = r;
    }
    expect(acc.items).toHaveLength(cap);
    // 末尾 cap 件（lv4..lv19）
    expect(acc.items[0].liveId).toBe(`lv${total - cap}`);
    expect(acc.items[acc.items.length - 1].liveId).toBe(`lv${total - 1}`);
  });

  it('ts/liveId 無効なサンプルは追記されず null', () => {
    expect(appendCalibrationSample(undefined, { liveId: 'lv1' })).toBeNull();
    expect(appendCalibrationSample(undefined, { ts: 1 })).toBeNull();
  });
});

describe('parse / serialize', () => {
  it('parseCalibrationLog は壊れた要素を捨てて正規化する', () => {
    const parsed = parseCalibrationLog({
      v: 1,
      items: [
        { ts: 1, liveId: 'lv1' },
        { ts: 'x', liveId: 'lv2' },
        null,
        { liveId: 'lv3' },
        42
      ]
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].liveId).toBe('lv1');
  });

  it('serializeCalibrationJson は items を含む JSON 文字列', () => {
    const next = appendCalibrationSample(
      undefined,
      buildCalibrationSample({ nowMs: 1000, liveId: 'lv1', resolved: fakeResolved() })
    );
    const json = serializeCalibrationJson(next);
    const back = JSON.parse(json);
    expect(back.v).toBe(CALIBRATION_LOG_VERSION);
    expect(back.items).toHaveLength(1);
    expect(back.items[0].liveId).toBe('lv1');
  });

  it('serializeCalibrationCsv はヘッダ + 行（isoTime 列つき）', () => {
    const next = appendCalibrationSample(
      undefined,
      buildCalibrationSample({
        nowMs: 1000,
        liveId: 'lv1',
        resolved: fakeResolved(),
        totalVisitors: 8757
      })
    );
    const csv = serializeCalibrationCsv(next);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(['isoTime', ...CALIBRATION_FIELDS].join(','));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('lv1');
    expect(lines[1]).toContain('8757');
  });

  it('CALIBRATION_LOG_MAX_ITEMS は妥当な既定', () => {
    expect(CALIBRATION_LOG_MAX_ITEMS).toBe(2000);
  });
});
