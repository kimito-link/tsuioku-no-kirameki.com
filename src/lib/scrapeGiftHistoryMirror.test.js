/** @vitest-environment happy-dom */
/**
 * v0.1.251: scrapeGiftHistoryMirrorHtml / countGiftHistoryItems の単体テスト。
 *
 * 「履歴」タブ active 時の `ul.gift-history-list` を outerHTML で取り出す。
 * 構造化済 `scrapeGiftHistoryFromDom` (officialEventBannerDom.js) とは取得形式が違い、
 * 鏡レンダリング用に丸ごと outerHTML を保持する。
 */
import { describe, it, expect } from 'vitest';
import {
  scrapeGiftHistoryMirrorHtml,
  countGiftHistoryItems
} from './scrapeGiftHistoryMirror.js';

describe('scrapeGiftHistoryMirrorHtml', () => {
  it('null / undefined / 空 DOM は null', () => {
    expect(scrapeGiftHistoryMirrorHtml(null)).toBeNull();
    expect(scrapeGiftHistoryMirrorHtml(undefined)).toBeNull();
    document.body.innerHTML = '';
    expect(scrapeGiftHistoryMirrorHtml(document)).toBeNull();
  });

  it('ul.gift-history-list を outerHTML で返す', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="https://example.com/decocome_kawaii_100.png" alt="かわいい×100">
          <p class="time">3:36:23</p>
          <p class="text">
            <span class="advertiser-name">名無し <small class="honorific">さん</small></span>
          </p>
          <p class="point">5 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const html = scrapeGiftHistoryMirrorHtml(document);
    expect(html).toBeTruthy();
    expect(html).toContain('gift-history-list');
    expect(html).toContain('かわいい×100');
    expect(html).toContain('3:36:23');
    expect(html).toContain('名無し');
    expect(html).toContain('5 ');
    expect(html).toContain('pt');
  });

  it('CSS Modules ハッシュ化 class（部分一致）でも取れる', () => {
    document.body.innerHTML = `
      <ul class="___gift-history-list___ABC123">
        <li class="___item___XYZ">a</li>
      </ul>`;
    const html = scrapeGiftHistoryMirrorHtml(document);
    expect(html).toBeTruthy();
    expect(html).toContain('gift-history-list');
  });

  it('該当 ul が居ない（貢献度ランキングのみ）ときは null', () => {
    // 貢献度ランキングは `ul.contribution-ranking-list` で別 DOM
    document.body.innerHTML = `
      <ul class="contribution-ranking-list">
        <li class="ranker">a</li>
      </ul>`;
    expect(scrapeGiftHistoryMirrorHtml(document)).toBeNull();
  });

  it('複数 li が居る場合も outerHTML に全件含まれる', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      `<li class="item"><p class="time">${i}:00:00</p></li>`
    ).join('');
    document.body.innerHTML = `<ul class="gift-history-list">${items}</ul>`;
    const html = scrapeGiftHistoryMirrorHtml(document);
    expect(html).toBeTruthy();
    for (let i = 0; i < 8; i++) {
      expect(html).toContain(`>${i}:00:00<`);
    }
  });

  it('Element 引数（sidebar 親 div）からも取れる', () => {
    document.body.innerHTML = `
      <div id="sidebar-root">
        <section class="content-history">
          <ul class="gift-history-list">
            <li class="item">a</li>
          </ul>
        </section>
      </div>`;
    const root = document.getElementById('sidebar-root');
    expect(root).toBeTruthy();
    const html = scrapeGiftHistoryMirrorHtml(root);
    expect(html).toBeTruthy();
    expect(html).toContain('gift-history-list');
  });
});

describe('countGiftHistoryItems', () => {
  it('null / undefined / 空 DOM は 0', () => {
    expect(countGiftHistoryItems(null)).toBe(0);
    expect(countGiftHistoryItems(undefined)).toBe(0);
    document.body.innerHTML = '';
    expect(countGiftHistoryItems(document)).toBe(0);
  });

  it('ul の中の li.item を数える', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">a</li>
        <li class="item">b</li>
        <li class="item">c</li>
      </ul>`;
    expect(countGiftHistoryItems(document)).toBe(3);
  });

  it('CSS Modules ハッシュ化 class（部分一致）でも数える', () => {
    document.body.innerHTML = `
      <ul class="___gift-history-list___ABC">
        <li class="___item___XYZ">a</li>
        <li class="___item___XYZ">b</li>
      </ul>`;
    expect(countGiftHistoryItems(document)).toBe(2);
  });

  it('該当 ul が居ない場合は 0', () => {
    document.body.innerHTML = `<ul class="other-list"><li>a</li></ul>`;
    expect(countGiftHistoryItems(document)).toBe(0);
  });
});
