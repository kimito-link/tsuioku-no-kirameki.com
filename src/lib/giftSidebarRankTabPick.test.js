/** @vitest-environment happy-dom */

import { describe, expect, it } from 'vitest';
import { findGiftSidebarRankTabElement } from './giftSidebarRankTabPick.js';

describe('findGiftSidebarRankTabElement', () => {
  it('finds tab by Japanese ランキング label', () => {
    const root = document.createElement('div');
    root.className = '___gift-sidebar___x';
    const tab = document.createElement('button');
    tab.setAttribute('role', 'tab');
    tab.textContent = 'ランキング';
    root.appendChild(tab);
    const { element, finder } = findGiftSidebarRankTabElement(root);
    expect(element).toBe(tab);
    expect(finder).toMatch(/^text:/);
  });

  it('finds tab by aria-label when visible text is empty', () => {
    const root = document.createElement('div');
    root.className = '___gift-modal___y';
    const tab = document.createElement('button');
    tab.setAttribute('aria-label', '貢献度ランキング');
    root.appendChild(tab);
    const { element, finder } = findGiftSidebarRankTabElement(root);
    expect(element).toBe(tab);
    expect(finder).toMatch(/^aria:/);
  });

  it('returns null when no match', () => {
    const root = document.createElement('div');
    root.appendChild(document.createElement('span'));
    expect(findGiftSidebarRankTabElement(root).element).toBeNull();
  });
});
