import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  createShadeBlindState,
  observeShade,
  shadeBlindMs,
  formatShadeReloadNote
} from './shadeBlindTracker.js';

const run = (observations) => observations.reduce(observeShade, createShadeBlindState());
const obs = (t, shade, docStartMs) => ({ t, shade, docStartMs });

describe('shadeBlindTracker', () => {
  it('★実機2026-11-26: 読み直しの一瞬の覆いを「開いてから283秒」と数えない', () => {
    const s = run([
      obs(120, 'covering', 40),
      obs(600, 'covering', 40),
      obs(1100, 'done', 40),
      obs(270000, 'done', 40),
      // 読み直し: 中の文書は 283,300ms に読み込み開始、283,852ms の観測でまだ覆っていた
      obs(283852, 'covering', 283300),
      obs(300000, 'done', 283300)
    ]);
    expect(shadeBlindMs(s)).toBe(600);
    expect(s.firstLastCoveringT).toBe(600);
    expect(s.firstCoveringSamples).toBe(2);
    expect(s.reloadCount).toBe(1);
    expect(s.reloadLongestMs).toBe(552);
    expect(formatShadeReloadNote(s)).toBe(
      ' / 中の画面の読み直し1回(覆いは読み直しの開始から最長552ms)'
    );
  });

  it('最初の文書は親の起点から数える(中の読み込みが遅いぶんも見えていない時間)', () => {
    const s = run([obs(12773, 'covering', 9000)]);
    expect(shadeBlindMs(s)).toBe(12773);
    expect(s.reloadCount).toBe(0);
    expect(formatShadeReloadNote(s)).toBe('');
  });

  it('読み直しの後に本当に居座る覆いは長く数える', () => {
    const s = run([obs(500, 'done', 40), obs(100200, 'covering', 100000), obs(130000, 'covering', 100000)]);
    expect(shadeBlindMs(s)).toBe(30000);
    expect(s.reloadCount).toBe(1);
  });

  it('読み直しが複数回なら回数と最長を残す', () => {
    const s = run([
      obs(500, 'done', 40),
      obs(60900, 'covering', 60000),
      obs(90000, 'done', 60000),
      obs(120300, 'covering', 120000)
    ]);
    expect(s.reloadCount).toBe(2);
    expect(s.reloadLongestMs).toBe(900);
  });

  it('覆いを見ていない読み直しは回数だけ残す', () => {
    const s = run([obs(500, 'done', 40), obs(60000, 'done', 59000)]);
    expect(shadeBlindMs(s)).toBe(-1);
    expect(formatShadeReloadNote(s)).toBe(' / 中の画面の読み直し1回(覆いは観測なし)');
  });

  it('シェード要素の無い文書(about:blank)は最初の文書にしない', () => {
    const s = run([obs(0, 'none', -5), obs(900, 'covering', 80)]);
    expect(s.reloadCount).toBe(0);
    expect(shadeBlindMs(s)).toBe(900);
  });

  it('文書の開始が読めないときは短く言わない(親の起点から数える)', () => {
    const s = run([obs(500, 'done', 40), obs(8000, 'covering', null)]);
    expect(shadeBlindMs(s)).toBe(8000);
  });

  it('一度も覆っていなければ -1', () => {
    expect(shadeBlindMs(run([]))).toBe(-1);
  });
});

describe('配線: sidepanel-entry がこの数え方を使う', () => {
  const src = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extension/sidepanel-entry.js'),
    'utf8'
  );

  it('中の文書の開始時刻を親の起点に直して観測に渡す', () => {
    expect(src).toMatch(/performance\.timeOrigin\s*-\s*_bootAt/);
    expect(src).toMatch(
      /_shadeBlind = observeShade\(_shadeBlind, \{[\s\S]{0,200}?docStartMs: sample\.inner\.docStartMs/
    );
  });

  it('★判定に使う合計は文書ごとの長さ(最後に見た時刻そのものではない)', () => {
    expect(src).toMatch(
      /summarizeContentBlindTime\(cloakDuration\.visibleBlackMs, shadeBlindMs\(_shadeBlind\)\)/
    );
  });

  it('読み直しの注記を行と保存値に出す', () => {
    expect(src).toContain('formatShadeReloadNote(_shadeBlind)');
    expect(src).toContain('shadeReloadCount: _shadeBlind.reloadCount');
    expect(src).toContain('shadeReloadLongestMs: _shadeBlind.reloadLongestMs');
  });
});
