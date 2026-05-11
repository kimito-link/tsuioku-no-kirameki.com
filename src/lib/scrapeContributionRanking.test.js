/** @vitest-environment happy-dom */
/**
 * v0.1.250: scrapeContributionRankingMirrorHtml / countContributionRankingItems の単体テスト。
 *
 * niconico ギフトサイドバー内の `ul.contribution-ranking-list` を outerHTML で取り出すのが
 * 本 scraper の責務。広告ランキング (scrapeAdRankingMirrorHtml) と取得対象が別なので、
 * 別 class のときは null が返ること、SVG / button / 部分一致 class でも取れることを検証する。
 */
import { describe, it, expect } from 'vitest';
import {
  scrapeContributionRankingMirrorHtml,
  countContributionRankingItems
} from './scrapeContributionRanking.js';

describe('scrapeContributionRankingMirrorHtml', () => {
  it('null / undefined / 空 DOM は null', () => {
    expect(scrapeContributionRankingMirrorHtml(null)).toBeNull();
    expect(scrapeContributionRankingMirrorHtml(undefined)).toBeNull();
    document.body.innerHTML = '';
    expect(scrapeContributionRankingMirrorHtml(document)).toBeNull();
  });

  it('ul.contribution-ranking-list を outerHTML で返す', () => {
    document.body.innerHTML = `
      <ul class="contribution-ranking-list">
        <li class="ranker">
          <button class="button">
            <p class="rank"><svg class="rank-icon"><title>1位</title></svg></p>
            <p class="text"><span class="ranker-name"><strong class="ranker-name-value">名無し</strong></span></p>
            <p class="contribution">18,005 <svg class="contribution-unit"><title>貢</title></svg></p>
          </button>
        </li>
      </ul>`;
    const html = scrapeContributionRankingMirrorHtml(document);
    expect(html).toBeTruthy();
    expect(html).toContain('contribution-ranking-list');
    expect(html).toContain('ranker-name-value');
    expect(html).toContain('18,005');
    expect(html).toContain('<title>貢</title>');
  });

  it('CSS Modules ハッシュ化 class（部分一致）でも取れる', () => {
    document.body.innerHTML = `
      <ul class="___contribution-ranking-list___ABC123">
        <li class="___ranker___XYZ">a</li>
      </ul>`;
    const html = scrapeContributionRankingMirrorHtml(document);
    expect(html).toBeTruthy();
    expect(html).toContain('contribution-ranking-list');
  });

  it('該当 ul が居ない（広告ランキングのみ）ときは null', () => {
    // 広告ランキングは `.content-supporter-section ul.wrapper` で別 DOM
    document.body.innerHTML = `
      <div class="content-supporter-section">
        <ul class="wrapper"><li class="item">広告</li></ul>
      </div>`;
    expect(scrapeContributionRankingMirrorHtml(document)).toBeNull();
  });

  it('複数 li が居る場合も outerHTML に全件含まれる（top N truncation はしない）', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      `<li class="ranker">${i + 1}</li>`
    ).join('');
    document.body.innerHTML = `<ul class="contribution-ranking-list">${items}</ul>`;
    const html = scrapeContributionRankingMirrorHtml(document);
    expect(html).toBeTruthy();
    // 10 件すべて含まれる（鏡のように貼り付け原則: top N truncation は popup CSS で）
    for (let i = 1; i <= 10; i++) {
      expect(html).toContain(`>${i}</li>`);
    }
  });

  it('Element 引数（ul の親 div）からも取れる', () => {
    document.body.innerHTML = `
      <div id="sidebar-root">
        <ul class="contribution-ranking-list"><li class="ranker">a</li></ul>
      </div>`;
    const root = document.getElementById('sidebar-root');
    expect(root).toBeTruthy();
    const html = scrapeContributionRankingMirrorHtml(root);
    expect(html).toBeTruthy();
    expect(html).toContain('contribution-ranking-list');
  });
});

describe('countContributionRankingItems', () => {
  it('null / undefined / 空 DOM は 0', () => {
    expect(countContributionRankingItems(null)).toBe(0);
    expect(countContributionRankingItems(undefined)).toBe(0);
    document.body.innerHTML = '';
    expect(countContributionRankingItems(document)).toBe(0);
  });

  it('ul の中の li.ranker を数える', () => {
    document.body.innerHTML = `
      <ul class="contribution-ranking-list">
        <li class="ranker">a</li>
        <li class="ranker">b</li>
        <li class="ranker">c</li>
      </ul>`;
    expect(countContributionRankingItems(document)).toBe(3);
  });

  it('CSS Modules ハッシュ化 class（部分一致）でも数える', () => {
    document.body.innerHTML = `
      <ul class="___contribution-ranking-list___ABC">
        <li class="___ranker___XYZ">a</li>
        <li class="___ranker___XYZ">b</li>
      </ul>`;
    expect(countContributionRankingItems(document)).toBe(2);
  });

  it('該当 ul が居ない場合は 0', () => {
    document.body.innerHTML = `<ul class="other-list"><li>a</li></ul>`;
    expect(countContributionRankingItems(document)).toBe(0);
  });
});
