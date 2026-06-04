import { describe, it, expect } from 'vitest';
import {
  perfDiagStorageKey,
  buildPerfDiag,
  isPerfDiag,
  buildPerfDiagLine
} from './perfDiag.js';

describe('perfDiagStorageKey', () => {
  it('lv を小文字化して接頭辞を付ける', () => {
    expect(perfDiagStorageKey('LV123')).toBe('nls_perf_diag_lv123');
  });
});

describe('buildPerfDiag', () => {
  it('数値を正規化し deferActive を bool 化', () => {
    const d = buildPerfDiag({
      liveId: 'LV9',
      tabCount: 2,
      lastPaintAt: 1000,
      lastPaintMs: 85,
      commentCount: 12254,
      deferActive: true
    });
    expect(d).toEqual({
      liveId: 'lv9',
      tabCount: 2,
      lastPaintAt: 1000,
      lastPaintMs: 85,
      commentCount: 12254,
      deferActive: true
    });
  });
  it('不正な数値は null・deferActive 既定 false', () => {
    const d = buildPerfDiag({ liveId: 'lv1', tabCount: NaN, lastPaintMs: undefined });
    expect(d.tabCount).toBeNull();
    expect(d.lastPaintMs).toBeNull();
    expect(d.deferActive).toBe(false);
  });
});

describe('isPerfDiag', () => {
  it('liveId 文字列があれば true', () => {
    expect(isPerfDiag({ liveId: 'lv1' })).toBe(true);
  });
  it('null/非オブジェクトは false', () => {
    expect(isPerfDiag(null)).toBe(false);
    expect(isPerfDiag('x')).toBe(false);
    expect(isPerfDiag({})).toBe(false);
  });
});

describe('buildPerfDiagLine', () => {
  it('全項目そろった診断行', () => {
    const diag = buildPerfDiag({
      liveId: 'lv1',
      tabCount: 2,
      lastPaintAt: 10_000,
      lastPaintMs: 85,
      commentCount: 12254,
      deferActive: true
    });
    expect(buildPerfDiagLine(diag, 15_000)).toBe(
      '  ⚙ paint 85ms / タブ 2 / コメント 12,254 / 描画見送り中 / 5秒前'
    );
  });
  it('perfDiag が無ければ空文字', () => {
    expect(buildPerfDiagLine(null)).toBe('');
    expect(buildPerfDiagLine(undefined)).toBe('');
  });
});
