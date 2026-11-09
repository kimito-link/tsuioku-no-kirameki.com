import { describe, it, expect } from 'vitest';
import { readYtRowsInChunks } from './ytChunkedRead.js';

/** @param {{pk: string, recordedAt: number}[]} all */
function source(all) {
  const sorted = [...all].sort((a, b) => a.recordedAt - b.recordedAt);
  let calls = 0;
  return {
    get calls() { return calls; },
    readChunk: async (lower, count) => {
      calls += 1;
      const rows = sorted.filter((r) => r.recordedAt >= lower);
      return count === undefined ? rows : rows.slice(0, count);
    }
  };
}
const noPause = () => Promise.resolve();
const pks = (rows) => rows.map((r) => r.pk);

describe('readYtRowsInChunks', () => {
  it('少ない記録は1回で読み終わる', async () => {
    const all = [1, 2, 3].map((n) => ({ pk: `p${n}`, recordedAt: n }));
    const s = source(all);
    const out = await readYtRowsInChunks({ readChunk: s.readChunk, chunk: 10, pause: noPause });
    expect(pks(out)).toEqual(['p1', 'p2', 'p3']);
    expect(s.calls).toBe(1);
  });

  it('区切って読んでも、行も順番も全件読みと同じ', async () => {
    const all = Array.from({ length: 1037 }, (_, i) => ({ pk: `p${i}`, recordedAt: 1000 + i }));
    const s = source(all);
    let pauses = 0;
    const out = await readYtRowsInChunks({ readChunk: s.readChunk, chunk: 100, pause: async () => { pauses += 1; } });
    expect(pks(out)).toEqual(pks(all));
    expect(pauses).toBeGreaterThanOrEqual(10);
  });

  it('同じ記録時刻の行が区切りをまたいでも、重ねず落とさない', async () => {
    const all = [];
    for (let i = 0; i < 250; i += 1) all.push({ pk: `p${i}`, recordedAt: 100 + Math.floor(i / 7) });
    const s = source(all);
    const out = await readYtRowsInChunks({ readChunk: s.readChunk, chunk: 20, pause: noPause });
    expect(out.length).toBe(250);
    expect(new Set(pks(out)).size).toBe(250);
    expect(out.map((r) => r.recordedAt)).toEqual([...out.map((r) => r.recordedAt)].sort((a, b) => a - b));
  });

  it('1回分より多い行が同じ時刻でも、全部読む', async () => {
    const all = [
      { pk: 'a', recordedAt: 1 },
      ...Array.from({ length: 55 }, (_, i) => ({ pk: `s${i}`, recordedAt: 5 })),
      { pk: 'z', recordedAt: 9 }
    ];
    const s = source(all);
    const out = await readYtRowsInChunks({ readChunk: s.readChunk, chunk: 10, pause: noPause });
    expect(out.length).toBe(57);
    expect(new Set(pks(out)).size).toBe(57);
    expect(out[0].pk).toBe('a');
    expect(out[56].pk).toBe('z');
  });

  it('ちょうど区切りの行数でも止まる', async () => {
    const all = Array.from({ length: 40 }, (_, i) => ({ pk: `p${i}`, recordedAt: i + 1 }));
    const s = source(all);
    const out = await readYtRowsInChunks({ readChunk: s.readChunk, chunk: 20, pause: noPause });
    expect(pks(out)).toEqual(pks(all));
  });
});
