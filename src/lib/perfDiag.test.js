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
      deferActive: true,
      paintCount: 42,
      tabVisible: false,
      recordRate: 8.5
    });
    expect(d).toEqual({
      liveId: 'lv9',
      tabCount: 2,
      lastPaintAt: 1000,
      lastPaintMs: 85,
      commentCount: 12254,
      deferActive: true,
      paintCount: 42,
      tabVisible: false,
      recordRate: 8.5,
      panelPainted: null, // 未指定=不明(null)。
      shadeActive: null
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
      deferActive: true,
      paintCount: 42,
      tabVisible: false
    });
    expect(buildPerfDiagLine(diag, 15_000)).toBe(
      '  ⚙ paint 85ms / 描画42回 / 裏タブ / タブ 2 / コメント 12,254 / 描画見送り中 / 5秒前'
    );
  });
  it('perfDiag が無ければ空文字', () => {
    expect(buildPerfDiagLine(null)).toBe('');
    expect(buildPerfDiagLine(undefined)).toBe('');
  });

  it('v0.1.854 パネル未描画(白)= コメントがあるのに panelPainted:false で ⚠ を出す', () => {
    const diag = buildPerfDiag({ liveId: 'lv1', lastPaintMs: 5, commentCount: 8000, panelPainted: false });
    expect(buildPerfDiagLine(diag, 0)).toContain('⚠パネル未描画(白)');
  });

  it('v0.1.854 描画済(panelPainted:true)なら白警告を出さない', () => {
    const diag = buildPerfDiag({ liveId: 'lv1', lastPaintMs: 5, commentCount: 8000, panelPainted: true });
    expect(buildPerfDiagLine(diag, 0)).not.toContain('パネル未描画');
  });

  it('v0.1.854 ローディング幕継続(shadeActive:true)で ⚠ローディング継続', () => {
    const diag = buildPerfDiag({ liveId: 'lv1', lastPaintMs: 5, commentCount: 100, shadeActive: true });
    expect(buildPerfDiagLine(diag, 0)).toContain('⚠ローディング継続');
  });

  it('v0.1.854 panelPainted:false でもコメント0なら白警告は出さない(配信開始直後=正常)', () => {
    const diag = buildPerfDiag({ liveId: 'lv1', lastPaintMs: 5, commentCount: 0, panelPainted: false });
    expect(buildPerfDiagLine(diag, 0)).not.toContain('パネル未描画');
  });

  it('v0.1.982 スクロール見送り中の白化は「スクロール中に白くなっています」と出す', () => {
    const diag = buildPerfDiag({
      liveId: 'lv1', lastPaintMs: 5, commentCount: 8000, panelPainted: false, deferActive: true
    });
    const line = buildPerfDiagLine(diag, 0);
    expect(line).toContain('⚠スクロール中に白くなっています(描画見送り)');
    expect(line).not.toContain('⚠パネル未描画(白)'); // 通常版とは出し分ける
  });

  it('v0.1.982 スクロールでなく(deferActive:false)白化なら従来の パネル未描画(白)', () => {
    const diag = buildPerfDiag({
      liveId: 'lv1', lastPaintMs: 5, commentCount: 8000, panelPainted: false, deferActive: false
    });
    expect(buildPerfDiagLine(diag, 0)).toContain('⚠パネル未描画(白)');
  });
});
