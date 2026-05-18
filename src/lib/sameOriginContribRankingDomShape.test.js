import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { captureSameOriginContributionRankingDomShape } from './sameOriginContribRankingDomShape.js';

/** @param {string} html */
function docOf(html) {
  const w = new Window();
  w.document.write(`<!DOCTYPE html><html><body>${html}</body></html>`);
  w.document.close();
  return w.document;
}

describe('captureSameOriginContributionRankingDomShape', () => {
  it('null / 非 document は no-doc', () => {
    expect(captureSameOriginContributionRankingDomShape(null).probe).toBe('no-doc');
    expect(captureSameOriginContributionRankingDomShape(undefined).probe).toBe('no-doc');
    expect(captureSameOriginContributionRankingDomShape(/** @type {any} */ ({})).probe).toBe(
      'no-doc'
    );
  });

  it('貢献度コンテナが無い document は no-container（definitive 信号）', () => {
    const doc = docOf('<div class="comment-table"><span>普通のコメント</span></div>');
    const r = captureSameOriginContributionRankingDomShape(doc);
    expect(r.probe).toBe('no-container');
  });

  it('既知構造（.content-supporter-section）の row 構造を観測する', () => {
    const doc = docOf(`
      <section class="content-supporter-section">
        <ul class="wrapper">
          <li class="item"><i class="rank">1</i>
            <div class="info"><button class="ranker"><span class="name">フロア熱狂</span>
            <span class="thumbnail"></span></button><p class="contribution">5,105</p></div></li>
          <li class="item"><i class="rank">2</i>
            <div class="info"><button class="ranker"><span class="name">こん太</span></button>
            <p class="contribution">2,575</p></div></li>
        </ul>
      </section>`);
    const r = captureSameOriginContributionRankingDomShape(doc);
    expect(r.probe).toBe('ok');
    expect(r.matchedBy).toBe('.content-supporter-section');
    expect(Array.isArray(r.rowSamples)).toBe(true);
    const rows = /** @type {any[]} */ (r.rowSamples);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const named = rows.find((x) => x.hasNameish && x.hasDigits);
    expect(named).toBeTruthy();
    expect(/** @type {any} */ (r.sel).rankerish).toBeGreaterThan(0);
  });

  it('CSS-module ハッシュ化構造でも part-match コンテナで観測できる（実不具合の再現ケース）', () => {
    const doc = docOf(`
      <div class="___content-supporter-section___aB3xY">
        <ul class="___wrapper___kk9">
          <li class="___item___zZ1"><span class="___name___n7">３１０</span>
            <p class="___contribution___c2">600</p></li>
          <li class="___item___zZ1"><span class="___name___n7">きょん</span>
            <p class="___contribution___c2">80</p></li>
        </ul>
      </div>`);
    const r = captureSameOriginContributionRankingDomShape(doc);
    expect(r.probe).toBe('ok');
    expect(r.matchedBy).toBe('[class*="content-supporter"]');
    expect(/** @type {any[]} */ (r.rowSamples).length).toBeGreaterThanOrEqual(2);
    expect(String(/** @type {any} */ (r.rowSamples)[0].cls)).toContain('item');
  });

  it('bounded: rowSamples は最大 8 件・class 文字列は cap される', () => {
    const items = Array.from(
      { length: 30 },
      (_, i) =>
        `<li class="item ${'x'.repeat(300)}"><span class="name">u${i}</span><p class="contribution">${i}</p></li>`
    ).join('');
    const doc = docOf(`<section class="content-supporter-section"><ul class="wrapper">${items}</ul></section>`);
    const r = captureSameOriginContributionRankingDomShape(doc);
    expect(r.probe).toBe('ok');
    const rows = /** @type {any[]} */ (r.rowSamples);
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(String(rows[0].cls).length).toBeLessThanOrEqual(100);
  });

  it('広告ランキングが近傍に居る場合 adIshNearby で観測（後続の汚染回帰テスト用）', () => {
    const doc = docOf(`
      <section class="content-supporter-section"><ul class="wrapper">
        <li class="item"><span class="name">A</span><p class="contribution">10</p></li>
      </ul></section>
      <div class="advertiser-name">広告主</div>`);
    const r = captureSameOriginContributionRankingDomShape(doc);
    expect(r.probe).toBe('ok');
    expect(/** @type {any} */ (r.sel).adIshNearby).toBe(true);
  });

  it('純粋・読み取りのみ（入力 DOM を変更しない）', () => {
    const doc = docOf(
      '<section class="content-supporter-section"><ul class="wrapper"><li class="item"><span class="name">A</span><p class="contribution">1</p></li></ul></section>'
    );
    const before = doc.body.innerHTML;
    captureSameOriginContributionRankingDomShape(doc);
    expect(doc.body.innerHTML).toBe(before);
  });
});
