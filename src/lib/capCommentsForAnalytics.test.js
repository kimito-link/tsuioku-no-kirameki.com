import { describe, expect, it } from 'vitest';
import { capCommentsForAnalytics, COMMENT_ANALYTICS_CAP } from './capCommentsForAnalytics.js';

describe('capCommentsForAnalytics', () => {
  it('件数が cap 以下ならそのまま', () => {
    const a = [{ id: 1 }, { id: 2 }];
    expect(capCommentsForAnalytics(a, 10)).toEqual(a);
  });

  it('超過時は cap 件に均等サンプル', () => {
    const list = Array.from({ length: 100 }, (_, i) => ({ i }));
    const out = capCommentsForAnalytics(list, 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({ i: 0 });
    expect(out[9]).toEqual({ i: 90 });
  });

  it('デフォルト cap', () => {
    const list = Array.from({ length: COMMENT_ANALYTICS_CAP + 500 }, (_, i) => i);
    expect(capCommentsForAnalytics(list)).toHaveLength(COMMENT_ANALYTICS_CAP);
  });
});
