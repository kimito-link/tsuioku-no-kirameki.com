/** @vitest-environment happy-dom */

import { describe, it, expect } from 'vitest';
import {
  isInsideRecommendedUserSection,
  recommendedUserSectionHitKind
} from './isInsideRecommendedUserSection.js';

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

describe('recommendedUserSectionHitKind（2026-07-14 診断強化Patch4: 除外機構の生存canary）', () => {
  it('通常の div は空文字', () => {
    const el = document.createElement('div');
    expect(recommendedUserSectionHitKind(el)).toBe('');
  });

  it('class 検出で当たれば "class"', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="___user-recommend___X"><span id="inner">x</span></div>';
    const inner = wrap.querySelector('#inner');
    expect(recommendedUserSectionHitKind(/** @type {Element} */ (inner))).toBe(
      'class'
    );
  });

  it('href の ref=recommend 検出で当たれば "href"（class検出は当たらない）', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<a href="https://www.nicovideo.jp/user/137814833?ref=recommend_top"><span id="t">x</span></a>';
    const t = wrap.querySelector('#t');
    expect(recommendedUserSectionHitKind(/** @type {Element} */ (t))).toBe(
      'href'
    );
  });

  it('class と href の両方が当たれば "class"（class を優先返却・既存判定順を維持）', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="___user-recommend___X"><a href="https://www.nicovideo.jp/user/1?ref=recommend_top"><span id="t">x</span></a></div>';
    const t = wrap.querySelector('#t');
    expect(recommendedUserSectionHitKind(/** @type {Element} */ (t))).toBe(
      'class'
    );
  });

  it('要素が null/closest 無しなら空文字（例外を投げない）', () => {
    expect(recommendedUserSectionHitKind(null)).toBe('');
    expect(recommendedUserSectionHitKind(/** @type {any} */ ({}))).toBe('');
  });
});
