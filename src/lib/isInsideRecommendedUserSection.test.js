/** @vitest-environment happy-dom */

import { describe, it, expect } from 'vitest';
import { isInsideRecommendedUserSection } from './isInsideRecommendedUserSection.js';

describe('isInsideRecommendedUserSection', () => {
  it('通常の div は false', () => {
    const el = document.createElement('div');
    expect(isInsideRecommendedUserSection(el)).toBe(false);
  });

  it('user-recommend を含む祖先があれば true', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="___user-recommend___X"><span id="inner">x</span></div>';
    const inner = wrap.querySelector('#inner');
    expect(inner).not.toBeNull();
    expect(isInsideRecommendedUserSection(/** @type {Element} */ (inner))).toBe(
      true
    );
  });

  it('ref=recommend の /user/ リンク配下なら true', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<a href="https://www.nicovideo.jp/user/137814833?ref=recommend_top"><span id="t">x</span></a>';
    const t = wrap.querySelector('#t');
    expect(isInsideRecommendedUserSection(/** @type {Element} */ (t))).toBe(true);
  });

  it('ref=watch_user_information の user リンクは false（配信者情報リンク）', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<a href="https://www.nicovideo.jp/user/137814833/live_programs?ref=watch_user_information"><span id="t">x</span></a>';
    const t = wrap.querySelector('#t');
    expect(isInsideRecommendedUserSection(/** @type {Element} */ (t))).toBe(false);
  });
});
