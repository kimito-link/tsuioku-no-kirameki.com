/** @vitest-environment happy-dom */

import { describe, expect, it } from 'vitest';
import { findGiftSidebarRankTabElement, findGiftSidebarItemsTabElement } from './giftSidebarRankTabPick.js';

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

describe('findGiftSidebarItemsTabElement', () => {
  it('番組ギフトのタブを選び、ギフト履歴やマイギフトは選ばない', () => {
    const root = document.createElement('div');
    root.innerHTML = '<ul><li><button>ギフト履歴</button></li><li><button>マイギフト</button></li><li><button> 番組ギフト </button></li><li><button>ランキング</button></li></ul>';
    expect(findGiftSidebarItemsTabElement(root)?.textContent?.trim()).toBe('番組ギフト');
  });
  it('アイテムのタブが無ければ null(何も押さない)', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button>履歴</button><button>ランキング</button>';
    expect(findGiftSidebarItemsTabElement(root)).toBeNull();
  });
});
