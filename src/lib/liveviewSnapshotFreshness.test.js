import { describe, it, expect } from 'vitest';
import {
  SNAPSHOT_FRESH_MS,
  resolveSnapshotCapturedAt,
  evaluateSnapshotFreshness,
  formatSnapshotStalenessBanner
} from './liveviewSnapshotFreshness.js';

const NOW = 1_000_000_000_000;

describe('resolveSnapshotCapturedAt', () => {
  it('snapshotMeta.capturedAt を最優先', () => {
    const blob = {
      snapshotMeta: { capturedAt: NOW - 1000 },
      laneMirror: { capturedAt: NOW - 99999 },
      generatedAt: new Date(NOW - 50000).toISOString()
    };
    expect(resolveSnapshotCapturedAt(blob)).toBe(NOW - 1000);
  });

  it('snapshotMeta が無ければ各鏡 capturedAt の最大', () => {
    const blob = {
      laneMirror: { capturedAt: NOW - 5000 },
      statCardsMirror: { capturedAt: NOW - 2000 },
      northStarMirror: { capturedAt: NOW - 8000 }
    };
    expect(resolveSnapshotCapturedAt(blob)).toBe(NOW - 2000); // 最大=最も新しい
  });

  it('鏡が無ければ generatedAt(ISO)にフォールバック', () => {
    const iso = new Date(NOW - 3000).toISOString();
    expect(resolveSnapshotCapturedAt({ generatedAt: iso })).toBe(Date.parse(iso));
  });

  it('何も無ければ 0', () => {
    expect(resolveSnapshotCapturedAt({})).toBe(0);
    expect(resolveSnapshotCapturedAt(null)).toBe(0);
  });
});

describe('evaluateSnapshotFreshness', () => {
  it('全鏡が新鮮なら fresh=true（揃って出す）', () => {
    const blob = {
      laneMirror: { capturedAt: NOW - 5000 },
      statCardsMirror: { capturedAt: NOW - 10000 },
      northStarMirror: { capturedAt: NOW - 8000 }
    };
    const ev = evaluateSnapshotFreshness(blob, NOW);
    expect(ev.fresh).toBe(true);
    expect(ev.hasTimestamp).toBe(true);
    expect(ev.capturedAt).toBe(NOW - 5000);
  });

  it('★核心: 数字カードだけ古くても、最大(最新)の鏡が新鮮なら全体 fresh=true=全レーン揃う', () => {
    // 旧挙動: statCards が17分前→数字カードだけ消える。新挙動: lane が新鮮なら全部出す。
    const blob = {
      laneMirror: { capturedAt: NOW - 5000 }, // 5秒前=新鮮
      statCardsMirror: { capturedAt: NOW - 17 * 60 * 1000 } // 17分前
    };
    const ev = evaluateSnapshotFreshness(blob, NOW);
    expect(ev.fresh).toBe(true); // 最大(lane 5秒前)で判定=全体新鮮
  });

  it('全鏡が古ければ fresh=false（1枚バナーで「古い」）', () => {
    const blob = {
      laneMirror: { capturedAt: NOW - 5 * 60 * 1000 },
      statCardsMirror: { capturedAt: NOW - 6 * 60 * 1000 }
    };
    const ev = evaluateSnapshotFreshness(blob, NOW);
    expect(ev.fresh).toBe(false);
    expect(ev.ageMs).toBe(5 * 60 * 1000); // 最大(最新=5分前)で経過
  });

  it('時刻が取れなければ fresh=true(出す)・hasTimestamp=false', () => {
    const ev = evaluateSnapshotFreshness({}, NOW);
    expect(ev.fresh).toBe(true);
    expect(ev.hasTimestamp).toBe(false);
    expect(ev.ageMs).toBe(null);
  });

  it('しきい値を変更できる', () => {
    const blob = { laneMirror: { capturedAt: NOW - 90 * 1000 } }; // 90秒前
    expect(evaluateSnapshotFreshness(blob, NOW, 60 * 1000).fresh).toBe(false); // 60秒しきい→古い
    expect(evaluateSnapshotFreshness(blob, NOW, 120 * 1000).fresh).toBe(true); // 120秒しきい→新鮮
  });
});

describe('formatSnapshotStalenessBanner', () => {
  it('新鮮ならバナー無し', () => {
    expect(formatSnapshotStalenessBanner({ fresh: true, hasTimestamp: true, ageMs: 1000 })).toBe('');
  });

  it('時刻不明ならバナー無し', () => {
    expect(formatSnapshotStalenessBanner({ fresh: true, hasTimestamp: false, ageMs: null })).toBe('');
  });

  it('古ければ経過つきバナー(秒)', () => {
    const s = formatSnapshotStalenessBanner({ fresh: false, hasTimestamp: true, ageMs: 75 * 1000 });
    expect(s).toContain('75秒前');
    expect(s).toContain('もう一度押してください');
  });

  it('古ければ経過つきバナー(分)', () => {
    const s = formatSnapshotStalenessBanner({ fresh: false, hasTimestamp: true, ageMs: 5 * 60 * 1000 });
    expect(s).toContain('5分前');
  });
});

describe('SNAPSHOT_FRESH_MS', () => {
  it('3分', () => {
    expect(SNAPSHOT_FRESH_MS).toBe(3 * 60 * 1000);
  });
});
