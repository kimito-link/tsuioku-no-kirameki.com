import { describe, it, expect } from 'vitest';
import { isDevAutoReloadAllowed, decideDevAutoReload } from './devAutoReloadDecision.js';

/**
 * ★この機能は「便利さ」より【誤爆しないこと】が重要。
 *   ストア版で自動リロードが走ると、ユーザーの視聴中に予告なく拡張が落ちる。
 */
describe('isDevAutoReloadAllowed', () => {
  it('★update_url があれば(=ストア配布)絶対に無効', () => {
    expect(isDevAutoReloadAllowed({ updateUrl: 'https://clients2.google.com/service/update2/crx' })).toBe(false);
    // installType が development でも update_url が勝つ(安全側)
    expect(
      isDevAutoReloadAllowed({
        updateUrl: 'https://clients2.google.com/service/update2/crx',
        installType: 'development'
      })
    ).toBe(false);
  });

  it('★installType=development のときだけ有効', () => {
    expect(isDevAutoReloadAllowed({ installType: 'development' })).toBe(true);
    expect(isDevAutoReloadAllowed({ installType: 'normal' })).toBe(false);
    expect(isDevAutoReloadAllowed({ installType: 'sideload' })).toBe(false);
  });

  it('★判定材料が無いときは【無効】に倒す(安全側)', () => {
    expect(isDevAutoReloadAllowed({})).toBe(false);
    expect(isDevAutoReloadAllowed(null)).toBe(false);
    expect(isDevAutoReloadAllowed(undefined)).toBe(false);
  });
});

describe('decideDevAutoReload', () => {
  it('★初回はリロードしない(基準値を記録するだけ=無限ループ防止)', () => {
    const r = decideDevAutoReload({ allowed: true, previousBuildId: '', currentBuildId: '0810-1200' });
    expect(r.reload).toBe(false);
    expect(r.nextBuildId).toBe('0810-1200');
    expect(r.reason).toContain('初回');
  });

  it('★buildId が変わったらリロードする(copy:ext した瞬間)', () => {
    const r = decideDevAutoReload({
      allowed: true,
      previousBuildId: '0810-1200',
      currentBuildId: '0810-1300'
    });
    expect(r.reload).toBe(true);
    expect(r.nextBuildId).toBe('0810-1300');
    expect(r.reason).toContain('0810-1200→0810-1300');
  });

  it('変化が無ければリロードしない', () => {
    const r = decideDevAutoReload({
      allowed: true,
      previousBuildId: '0810-1200',
      currentBuildId: '0810-1200'
    });
    expect(r.reload).toBe(false);
  });

  it('★許可されていなければ何があってもリロードしない', () => {
    const r = decideDevAutoReload({
      allowed: false,
      previousBuildId: '0810-1200',
      currentBuildId: '0810-9999'
    });
    expect(r.reload).toBe(false);
    expect(r.reason).toContain('disabled');
  });

  it('★buildId が読めないときは何もしない(推測でリロードしない)', () => {
    const r = decideDevAutoReload({ allowed: true, previousBuildId: '0810-1200', currentBuildId: '' });
    expect(r.reload).toBe(false);
    expect(r.nextBuildId).toBe('0810-1200'); // 基準値を壊さない
  });

  it('壊れた入力でも throw しない', () => {
    for (const bad of [null, undefined, 1, 'x', []]) {
      expect(() => decideDevAutoReload(bad)).not.toThrow();
      expect(decideDevAutoReload(bad).reload).toBe(false);
    }
  });
});
