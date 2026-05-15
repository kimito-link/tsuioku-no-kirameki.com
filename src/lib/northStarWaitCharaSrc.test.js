import { describe, expect, it } from 'vitest';
import { northStarWaitBadgeToImageRelativePath } from './northStarWaitCharaSrc.js';

describe('northStarWaitBadgeToImageRelativePath', () => {
  it('3 キャラのバッジラベルにパスを返す', () => {
    expect(northStarWaitBadgeToImageRelativePath('りんく')).toContain('/link/');
    expect(northStarWaitBadgeToImageRelativePath('こん太')).toContain('/konta/');
    expect(northStarWaitBadgeToImageRelativePath('たぬ姉')).toContain('/tanunee/');
  });

  it('未知ラベルは null', () => {
    expect(northStarWaitBadgeToImageRelativePath('')).toBeNull();
    expect(northStarWaitBadgeToImageRelativePath('unknown')).toBeNull();
  });
});
