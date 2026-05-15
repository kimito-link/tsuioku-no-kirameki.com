import { describe, it, expect } from 'vitest';
import {
  buildNorthStarWaitHintsRailHtml,
  northStarWaitBadgeToMarketingPngRelative
} from './formatNorthStarWaitHintsRailHtml.js';

describe('northStarWaitBadgeToMarketingPngRelative', () => {
  it('3キャラをマッピングする', () => {
    expect(northStarWaitBadgeToMarketingPngRelative('りんく')).toContain('rink-72');
    expect(northStarWaitBadgeToMarketingPngRelative('こん太')).toContain('konta-72');
    expect(northStarWaitBadgeToMarketingPngRelative('たぬ姉')).toContain('tanu-72');
    expect(northStarWaitBadgeToMarketingPngRelative('その他')).toContain('rink-72');
  });
});

describe('buildNorthStarWaitHintsRailHtml', () => {
  it('3行＋data-nl-rail-wait と画像 src を含む', () => {
    const html = buildNorthStarWaitHintsRailHtml([
      { badge: 'りんく', line: 'テスト1' },
      { badge: 'こん太', line: 'テスト2' },
      { badge: 'たぬ姉', line: 'テスト3' }
    ]);
    expect(html).toContain('data-nl-rail-wait="1"');
    expect(html).toContain('rink-72.png');
    expect(html).toContain('konta-72.png');
    expect(html).toContain('tanu-72.png');
    expect(html).toContain('テスト1');
    expect(html).not.toMatch(/<\/?script/i);
  });

  it('空配列は空文字', () => {
    expect(buildNorthStarWaitHintsRailHtml([])).toBe('');
  });
});
