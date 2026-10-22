import { describe, it, expect } from 'vitest';
import { buildLiveViewContentSignature, buildLiveViewPublishSignature } from './liveViewPublishSignature.js';

function baseBlob(overrides = {}) {
  return {
    snapshotMeta: { capturedAt: 1000 },
    overview: 'abc',
    lives: [{ recordedCount: 10 }, { recordedCount: 5 }],
    laneMirror: { capturedAt: 2000 },
    statCardsMirror: { capturedAt: 3000 },
    northStarMirror: { capturedAt: 4000 },
    commentTimelineMirror: { capturedAt: 5000 },
    ...overrides
  };
}

describe('buildLiveViewPublishSignature', () => {
  it('null/undefined は空文字', () => {
    expect(buildLiveViewPublishSignature(null)).toBe('');
    expect(buildLiveViewPublishSignature(undefined)).toBe('');
  });

  it('非オブジェクトは空文字', () => {
    // @ts-expect-error 意図的に不正型を渡す
    expect(buildLiveViewPublishSignature('x')).toBe('');
    // @ts-expect-error 意図的に不正型を渡す
    expect(buildLiveViewPublishSignature(42)).toBe('');
  });

  it('同内容なら同じシグネチャ', () => {
    const a = buildLiveViewPublishSignature(baseBlob());
    const b = buildLiveViewPublishSignature(baseBlob());
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('capturedAt が変化するとシグネチャも変化する(各鏡ごと)', () => {
    const base = buildLiveViewPublishSignature(baseBlob());
    expect(buildLiveViewPublishSignature(baseBlob({ snapshotMeta: { capturedAt: 1001 } }))).not.toBe(base);
    expect(buildLiveViewPublishSignature(baseBlob({ laneMirror: { capturedAt: 2001 } }))).not.toBe(base);
    expect(buildLiveViewPublishSignature(baseBlob({ statCardsMirror: { capturedAt: 3001 } }))).not.toBe(base);
    expect(buildLiveViewPublishSignature(baseBlob({ northStarMirror: { capturedAt: 4001 } }))).not.toBe(base);
    expect(
      buildLiveViewPublishSignature(baseBlob({ commentTimelineMirror: { capturedAt: 5001 } }))
    ).not.toBe(base);
  });

  it('lives件数が変化するとシグネチャが変化する', () => {
    const base = buildLiveViewPublishSignature(baseBlob());
    const changed = buildLiveViewPublishSignature(
      baseBlob({ lives: [{ recordedCount: 10 }, { recordedCount: 5 }, { recordedCount: 0 }] })
    );
    expect(changed).not.toBe(base);
  });

  it('記録数合計が変化するとシグネチャが変化する(件数は同じ)', () => {
    const base = buildLiveViewPublishSignature(baseBlob());
    const changed = buildLiveViewPublishSignature(
      baseBlob({ lives: [{ recordedCount: 11 }, { recordedCount: 5 }] })
    );
    expect(changed).not.toBe(base);
  });

  it('overview 文字列長が変化するとシグネチャが変化する', () => {
    const base = buildLiveViewPublishSignature(baseBlob());
    const changed = buildLiveViewPublishSignature(baseBlob({ overview: 'abcd' }));
    expect(changed).not.toBe(base);
  });

  it('各鏡が null/undefined でも例外を投げず安定した値を返す', () => {
    const blob = {
      snapshotMeta: null,
      overview: null,
      lives: null,
      laneMirror: null,
      statCardsMirror: undefined,
      northStarMirror: null,
      commentTimelineMirror: undefined
    };
    expect(() => buildLiveViewPublishSignature(blob)).not.toThrow();
    const sig = buildLiveViewPublishSignature(blob);
    expect(sig).toBe('0|0|0|0|0|0|0|0');
  });

  it('lives が非配列(欠損)でも安全', () => {
    const blob = baseBlob({ lives: undefined });
    expect(() => buildLiveViewPublishSignature(blob)).not.toThrow();
  });

  it('lives の要素が null を含んでいても安全', () => {
    const blob = baseBlob({ lives: [null, { recordedCount: 3 }, undefined] });
    const sig = buildLiveViewPublishSignature(blob);
    expect(sig).toContain('|3|3|'); // livesCount=3, recordedSum=3
  });

  it('空オブジェクトは全フィールド0のシグネチャ', () => {
    expect(buildLiveViewPublishSignature({})).toBe('0|0|0|0|0|0|0|0');
  });
});

describe('buildLiveViewContentSignature(v0.1.1735: 中身が変わったときだけ短い間隔で送る)', () => {
  const blob = (over = {}) => ({
    generatedAt: '2026-10-22T00:00:00Z',
    snapshotMeta: { capturedAt: 1 },
    overview: '経過 1分',
    lives: [{ liveId: 'lv1', recordedCount: 5, elapsedMs: 60_000 }],
    laneMirror: { liveId: 'lv1', capturedAt: 100, link: [{ userId: 'u1' }] },
    commentTimelineMirror: { capturedAt: 100, rows: [{ at: 50, text: 'わこつ' }] },
    ...over
  });

  it('★鏡を書き直しただけ(capturedAt・経過・送信時刻・診断の欄が変わっただけ)なら同じ', () => {
    const a = buildLiveViewContentSignature(blob());
    const b = buildLiveViewContentSignature(blob({
      generatedAt: '2026-10-22T00:01:00Z',
      snapshotMeta: { capturedAt: 999 },
      overview: '経過 2分',
      statusReport: '全文',
      lives: [{ liveId: 'lv1', recordedCount: 5, elapsedMs: 120_000 }],
      laneMirror: { liveId: 'lv1', capturedAt: 160, link: [{ userId: 'u1' }] }
    }));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(b).toBe(a);
  });

  it('★コメントが1件増えた・記録件数が変わった・応援者が増えたら違う', () => {
    const a = buildLiveViewContentSignature(blob());
    expect(buildLiveViewContentSignature(blob({ commentTimelineMirror: { capturedAt: 100, rows: [{ at: 50, text: 'わこつ' }, { at: 51, text: '888' }] } }))).not.toBe(a);
    expect(buildLiveViewContentSignature(blob({ lives: [{ liveId: 'lv1', recordedCount: 6 }] }))).not.toBe(a);
    expect(buildLiveViewContentSignature(blob({ laneMirror: { liveId: 'lv1', capturedAt: 100, link: [{ userId: 'u1' }, { userId: 'u2' }] } }))).not.toBe(a);
    // 行の時刻 at は中身(同じ本文でも別の時刻のコメントは別物)
    expect(buildLiveViewContentSignature(blob({ commentTimelineMirror: { capturedAt: 100, rows: [{ at: 52, text: 'わこつ' }] } }))).not.toBe(a);
  });

  it('無い・壊れた(循環)ときは空文字', () => {
    expect(buildLiveViewContentSignature(null)).toBe('');
    const loop = /** @type {any} */ ({});
    loop.self = loop;
    expect(buildLiveViewContentSignature(loop)).toBe('');
  });
});
