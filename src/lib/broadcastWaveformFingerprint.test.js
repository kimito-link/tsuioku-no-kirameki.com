import { describe, it, expect } from 'vitest';
import {
  buildBroadcastWaveformFingerprint,
  cosineSimilarity,
  findSimilarBroadcasts
} from './broadcastWaveformFingerprint.js';

const D = (m) => Date.UTC(2026, 3, 30, 10, m, 0);

describe('buildBroadcastWaveformFingerprint', () => {
  it('入力なし → null', () => {
    const r = buildBroadcastWaveformFingerprint([]);
    expect(r).toBeNull();
  });

  it('CPM カーブを 16 次元に均等リサンプリング', () => {
    // 16 分配信、毎分 1 コメ → 各 bin が 1 件
    const cs = [];
    for (let i = 0; i < 16; i++) cs.push({ capturedAt: D(i) });
    const r = buildBroadcastWaveformFingerprint(cs, { dimensions: 16 });
    expect(r.vector.length).toBe(16);
    // 全部 1 件 → 全 1.0 (ピークで正規化)
    expect(r.vector.every((v) => v === 1)).toBe(true);
  });

  it('1 分目だけ盛り上がる → 0 番目の bin だけ 1', () => {
    // 16 分配信、最初の分に 10 件
    const cs = [];
    for (let i = 0; i < 10; i++) cs.push({ capturedAt: D(0) });
    cs.push({ capturedAt: D(15) });
    const r = buildBroadcastWaveformFingerprint(cs, { dimensions: 16 });
    expect(r.vector[0]).toBe(1);
    // 最後 bin は 1/10 = 0.1
    expect(r.vector[15]).toBeCloseTo(0.1, 1);
  });

  it('破損 capturedAt 除外', () => {
    const r = buildBroadcastWaveformFingerprint([
      { capturedAt: D(0) },
      { capturedAt: NaN },
      { capturedAt: D(10) }
    ]);
    expect(r).not.toBeNull();
    expect(r.totalCount).toBe(2);
  });

  it('1 件 → vector 全部 0 or null（区間ゼロ）', () => {
    const r = buildBroadcastWaveformFingerprint([{ capturedAt: D(0) }]);
    expect(r).not.toBeNull();
  });

  it('カスタム dimensions', () => {
    const cs = Array.from({ length: 8 }, (_, i) => ({ capturedAt: D(i) }));
    const r = buildBroadcastWaveformFingerprint(cs, { dimensions: 8 });
    expect(r.vector.length).toBe(8);
  });
});

describe('cosineSimilarity', () => {
  it('同一ベクトル → 1', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it('直交ベクトル → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('長さの違う ベクトル → null', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBeNull();
  });

  it('zero vector → null', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBeNull();
  });
});

describe('findSimilarBroadcasts', () => {
  it('指紋が無い → 空配列', () => {
    const r = findSimilarBroadcasts(null, [{ liveId: 'a', vector: [1, 0] }]);
    expect(r).toEqual([]);
  });

  it('過去配信が無い → 空配列', () => {
    const r = findSimilarBroadcasts({ liveId: 'cur', vector: [1, 0] }, []);
    expect(r).toEqual([]);
  });

  it('似た指紋順に並ぶ', () => {
    const cur = { liveId: 'cur', vector: [1, 0, 0] };
    const past = [
      { liveId: 'far', vector: [0, 1, 0] },
      { liveId: 'close', vector: [0.9, 0.1, 0] },
      { liveId: 'mid', vector: [0.5, 0.5, 0] }
    ];
    const r = findSimilarBroadcasts(cur, past);
    expect(r[0].liveId).toBe('close');
    expect(r[r.length - 1].liveId).toBe('far');
  });

  it('topN で件数制限', () => {
    const cur = { liveId: 'cur', vector: [1, 0] };
    const past = [
      { liveId: 'a', vector: [0.9, 0.1] },
      { liveId: 'b', vector: [0.8, 0.2] },
      { liveId: 'c', vector: [0.7, 0.3] }
    ];
    const r = findSimilarBroadcasts(cur, past, { topN: 2 });
    expect(r.length).toBe(2);
  });
});
