import { describe, it, expect } from 'vitest';
import { decideHeavyChunkReadReuse, HEAVY_FULL_REREAD_MIN_GAP_MS } from './heavyChunkReadReuse.js';

const NOW = 1_000_000_000_000;

/** cached の縮約。 */
function cached(over = {}) {
  return { lv: 'lv1', arrLength: 300, chunkTotal: 320, readAtMs: NOW - 3000, ...over };
}

describe('decideHeavyChunkReadReuse', () => {
  it('coverage成立: 現total の80%以上を持つ→reuse coverage', () => {
    const r = decideHeavyChunkReadReuse({ lv: 'lv1', cached: cached({ arrLength: 300 }), currentChunkTotal: 320, nowMs: NOW });
    expect(r).toEqual({ reuse: true, reason: 'coverage' });
  });

  it('非チャンク(currentChunkTotal null/0)は常に coverage 成立', () => {
    expect(decideHeavyChunkReadReuse({ lv: 'lv1', cached: cached(), currentChunkTotal: null, nowMs: NOW }).reason).toBe('coverage');
    expect(decideHeavyChunkReadReuse({ lv: 'lv1', cached: cached(), currentChunkTotal: 0, nowMs: NOW }).reason).toBe('coverage');
  });

  it('★fresh-read成立: coverage割れ(total急増)+読了時完全+読了12秒未満→reuse fresh-read', () => {
    // backfillで total が 320→450 に増加。arr=300 は 450×0.8(360) を割る=coverage不成立。
    // だが読了時(chunkTotal=320)は 300>=256 で完全・読了3秒前=fresh。
    const r = decideHeavyChunkReadReuse({ lv: 'lv1', cached: cached({ arrLength: 300, chunkTotal: 320, readAtMs: NOW - 3000 }), currentChunkTotal: 450, nowMs: NOW });
    expect(r).toEqual({ reuse: true, reason: 'fresh-read' });
  });

  it('fresh-read不成立: 読了が古い(minGap超)→reuseしない(全件re-read)', () => {
    const r = decideHeavyChunkReadReuse({ lv: 'lv1', cached: cached({ arrLength: 300, chunkTotal: 320, readAtMs: NOW - 13000 }), currentChunkTotal: 450, nowMs: NOW });
    expect(r).toEqual({ reuse: false, reason: '' });
  });

  it('fresh-read不成立: 読了時点で不完全(arr < own total*0.8)→reuseしない', () => {
    // 読了時 chunkTotal=1000 に対し arr=300=不完全→次に完全読了するまで再利用しない。
    const r = decideHeavyChunkReadReuse({ lv: 'lv1', cached: cached({ arrLength: 300, chunkTotal: 1000, readAtMs: NOW - 3000 }), currentChunkTotal: 1100, nowMs: NOW });
    expect(r).toEqual({ reuse: false, reason: '' });
  });

  it('readAtMs 欠落(旧形式キャッシュ)は fresh-read不成立=後方互換(coverageのみ)', () => {
    const r = decideHeavyChunkReadReuse({ lv: 'lv1', cached: cached({ arrLength: 300, chunkTotal: 320, readAtMs: undefined }), currentChunkTotal: 450, nowMs: NOW });
    expect(r.reuse).toBe(false);
  });

  it('lv不一致は reuse しない', () => {
    expect(decideHeavyChunkReadReuse({ lv: 'lv2', cached: cached(), currentChunkTotal: 320, nowMs: NOW }).reuse).toBe(false);
  });

  it('cached無し/arrLength0は reuse しない', () => {
    expect(decideHeavyChunkReadReuse({ lv: 'lv1', cached: null, currentChunkTotal: 320, nowMs: NOW }).reuse).toBe(false);
    expect(decideHeavyChunkReadReuse({ lv: 'lv1', cached: cached({ arrLength: 0 }), currentChunkTotal: 320, nowMs: NOW }).reuse).toBe(false);
  });

  it('minGap境界: 読了ちょうど12秒前は不成立、11.999秒前は成立', () => {
    const base = { lv: 'lv1', cached: cached({ arrLength: 300, chunkTotal: 320 }), currentChunkTotal: 450 };
    expect(decideHeavyChunkReadReuse({ ...base, cached: cached({ arrLength: 300, chunkTotal: 320, readAtMs: NOW - HEAVY_FULL_REREAD_MIN_GAP_MS }), nowMs: NOW }).reuse).toBe(false);
    expect(decideHeavyChunkReadReuse({ ...base, cached: cached({ arrLength: 300, chunkTotal: 320, readAtMs: NOW - (HEAVY_FULL_REREAD_MIN_GAP_MS - 1) }), nowMs: NOW }).reuse).toBe(true);
  });

  it('lv正規化(大小/空白)して比較', () => {
    expect(decideHeavyChunkReadReuse({ lv: ' LV1 ', cached: cached({ lv: 'lv1' }), currentChunkTotal: 320, nowMs: NOW }).reuse).toBe(true);
  });
});
