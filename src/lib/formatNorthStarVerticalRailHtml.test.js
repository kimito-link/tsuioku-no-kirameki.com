import { describe, it, expect } from 'vitest';
import { buildNorthStarVerticalRailHtml } from './formatNorthStarVerticalRailHtml.js';

describe('buildNorthStarVerticalRailHtml', () => {
  it('1行以上の縦リストを返す', () => {
    const html = buildNorthStarVerticalRailHtml(
      [
        {
          placeNumber: 1,
          nameLine: 'テスト',
          count: 10,
          isUnknown: false,
          userKey: 'u1',
          fullLabelForTitle: 'full'
        }
      ],
      '貢',
      10
    );
    expect(html).toContain('nl-north-star-rail__list');
    expect(html).toContain('テスト');
    expect(html).toContain('10貢');
    expect(html).toContain('nl-north-star-rail__place--top');
  });

  it('空配列は空文字', () => {
    expect(buildNorthStarVerticalRailHtml([], 'pt')).toBe('');
  });
});
