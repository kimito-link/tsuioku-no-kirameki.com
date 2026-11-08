// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { numericUidForYtKey, ytChannelUrlForNumericUid } from '../../../extension-youtube/src/ytNicoShim.js';

describe('@ハンドルからチャンネルのページへ(2026-11-08 りんく「クリックしても何も出ない」)', () => {
  it('英数字のハンドルは今までどおり', () => {
    expect(ytChannelUrlForNumericUid(numericUidForYtKey('handle:@abc_123'))).toBe('https://www.youtube.com/@abc_123');
  });

  it('日本語のハンドルもリンクにする(以前は空=リンクが外れていた)', () => {
    const url = ytChannelUrlForNumericUid(numericUidForYtKey('handle:@ぶらっくしろっぷ'));
    expect(url).toBe(`https://www.youtube.com/@${encodeURIComponent('ぶらっくしろっぷ')}`);
  });

  it('記号や空白の混ざったものはリンクにしない', () => {
    expect(ytChannelUrlForNumericUid(numericUidForYtKey('handle:@a b c'))).toBe('');
    expect(ytChannelUrlForNumericUid(numericUidForYtKey('handle:@<x>"y'))).toBe('');
  });
});
