/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  isAuditionRichviewLivePath,
  captureAuditionRichviewEventScoreDiagProbe
} from './captureAuditionRichviewEventScoreDiagProbe.js';

describe('isAuditionRichviewLivePath', () => {
  it('audition の richview/live のみ true', () => {
    expect(
      isAuditionRichviewLivePath(
        'https://audition.nicovideo.jp/embedded/richview/live?content_id=lv350606186'
      )
    ).toBe(true);
  });
  it('別ホスト audition 風 は false（ホスト厳密）', () => {
    expect(isAuditionRichviewLivePath('https://www.nicovideo.jp/watch/lv1')).toBe(false);
    expect(isAuditionRichviewLivePath('https://gift.nicovideo.jp/live/lv1')).toBe(false);
  });
  it('audition でもパス不一致は false', () => {
    expect(
      isAuditionRichviewLivePath('https://audition.nicovideo.jp/other/richview/live')
    ).toBe(false);
  });
  it('不正 URL は false', () => {
    expect(isAuditionRichviewLivePath('')).toBe(false);
    expect(isAuditionRichviewLivePath(null)).toBe(false);
  });
});

describe('captureAuditionRichviewEventScoreDiagProbe', () => {
  it('doc 無しは no-doc', () => {
    const r = captureAuditionRichviewEventScoreDiagProbe(null);
    expect(r.probe).toBe('no-doc');
  });

  it('body 無しは no-body（stub document）', () => {
    const doc = /** @type {any} */ ({
      querySelector: () => null,
      querySelectorAll: () => /** @type {any} */ ([]),
      readyState: 'complete',
      body: null
    });
    const r = captureAuditionRichviewEventScoreDiagProbe(doc);
    expect(r.probe).toBe('no-body');
  });

  it('opts.contribRowCount を優先して掲載し、selector 件数を返す', () => {
    document.body.className = '___content___Qwbpe';
    document.body.innerHTML = `
      <ul class="contribution-ranking-list">
        <li class="ranker"><span>x</span></li>
        <li class="ranker"><span>y</span></li>
      </ul>
      <p class="owner-name">test</p>`;
    const r = captureAuditionRichviewEventScoreDiagProbe(document, {
      contribRowCount: 9
    });
    expect(r.probe).toBe('richview-event-score-diag-v1');
    expect(r.readyState).toBeTruthy();
    expect(r.contribRowCountFromScrape).toBe(9);
    expect(/** @type {any} */ (r.counts).ranker_li).toBeGreaterThanOrEqual(2);
    expect(/** @type {any} */ (r.counts).owner_name).toBeGreaterThanOrEqual(1);
    expect(/** @type {any} */ (r.counts).content_module).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(r.classSamples)).toBe(true);
  });

  it('contribRowCount 未指定でも scrape が効けば行数が取れる（content-supporter と同型）', () => {
    document.body.innerHTML = `
      <div class="content-supporter-section">
        <div class="wrapper">
          <ul class="wrapper">
            <li class="item">
              <i class="rank"><span>1</span></i>
              <div class="info">
                <button class="ranker"><span class="name">a</span></button>
                <p class="contribution">100 <svg></svg></p>
              </div>
            </li>
          </ul>
        </div>
      </div>`;
    const r = captureAuditionRichviewEventScoreDiagProbe(document);
    expect(r.contribRowCountFromScrape).toBe(1);
    expect(/** @type {any} */ (r.counts).supporter_li).toBeGreaterThanOrEqual(1);
  });
});
