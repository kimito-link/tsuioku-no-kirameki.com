import { describe, it, expect } from 'vitest';
import {
  shouldSkipLightSupplyOverwrite,
  formatLightSupplyGuardLine
} from './lightSupplyOverwriteGuard.js';

const base = {
  provisional: true,
  nextSupplyCount: 3,
  rosterEverSeen: 64,
  currentLiveId: 'lv351105288',
  rosterLiveId: 'lv351105288'
};

describe('shouldSkipLightSupplyOverwrite — 2026-08-04 実配信の再現', () => {
  it('★実測の 72枚→3枚 を止める(名簿64人に対し供給3件)', () => {
    const r = shouldSkipLightSupplyOverwrite(base);
    expect(r.skip).toBe(true);
    expect(r.reason).toBe('incomplete-light-supply');
  });

  it('DOM が 0枚でも名簿が守るので止まる(既存2ガードが素通りした窓)', () => {
    // この関数は DOM を一切参照しない=「DOM 0枚」を渡す手段が無いこと自体が仕様。
    // 引数に DOM 由来の値が無いことを構造で担保する。
    const r = shouldSkipLightSupplyOverwrite({ ...base, nextSupplyCount: 0 });
    expect(r.skip).toBe(true);
  });
});

describe('永久 stale にしない fail-safe(通す側)', () => {
  it('確定供給(provisional=false)は常に通す', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, provisional: false });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('settled');
  });

  it('配信が切り替わったら通す(前の配信の名簿で縛らない)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, currentLiveId: 'lv999' });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('live-switch');
  });

  it('配信IDが不明なら通す(URL不明を配信切替と同じ扱いにする)', () => {
    expect(shouldSkipLightSupplyOverwrite({ ...base, currentLiveId: '' }).skip).toBe(false);
    expect(shouldSkipLightSupplyOverwrite({ ...base, rosterLiveId: '' }).skip).toBe(false);
  });

  it('名簿が空(初回描画)は通す', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, rosterEverSeen: 0 });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('roster-empty');
  });

  it('供給が名簿に追いついていれば通す(同数)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, nextSupplyCount: 64 });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('supply-complete');
  });

  it('供給が名簿を超えていれば通す(増加=正常な更新を止めない)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, nextSupplyCount: 100 });
    expect(r.skip).toBe(false);
  });

  it('境界: 名簿より1件少ないだけでも見送る(v0.1.1233の「1枚でも減ったら」契約に揃える)', () => {
    expect(shouldSkipLightSupplyOverwrite({ ...base, nextSupplyCount: 63 }).skip).toBe(true);
  });

  it('大文字/前後空白の配信IDを同一視する(正規化)', () => {
    const r = shouldSkipLightSupplyOverwrite({
      ...base,
      currentLiveId: ' LV351105288 ',
      nextSupplyCount: 64
    });
    expect(r.reason).toBe('supply-complete');
  });
});

describe('formatLightSupplyGuardLine — 0の意味を区別する', () => {
  it('観測0回は「未計測」と明示する(異常なしと誤読させない)', () => {
    const line = formatLightSupplyGuardLine({ skipCount: 0, observedCount: 0 });
    expect(line).toContain('未計測');
    expect(line).not.toContain('✅');
  });

  it('観測ありで見送り0回は ✅ かつサンプル数を併記する', () => {
    const line = formatLightSupplyGuardLine({ skipCount: 0, observedCount: 12 });
    expect(line).toContain('✅');
    expect(line).toContain('12回観測');
  });

  it('見送りが起きたら回数と最大の食い違いを名指しする', () => {
    const line = formatLightSupplyGuardLine({
      skipCount: 2,
      observedCount: 9,
      worst: { next: 3, roster: 64 }
    });
    expect(line).toContain('2回見送り');
    expect(line).toContain('名簿64人');
    expect(line).toContain('供給3件');
  });

  it('材料が無ければ空文字(速報を壊さない)', () => {
    expect(formatLightSupplyGuardLine(null)).toBe('');
  });
});
