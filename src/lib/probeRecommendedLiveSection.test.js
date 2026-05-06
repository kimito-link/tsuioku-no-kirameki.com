/**
 * v0.1.200: 「おすすめ生放送」セクションの観測純関数のテスト。
 *
 * 診断 JSON `recommendedLiveSectionDiag` ブロックに格納する観測値:
 *   - watch ページにおすすめ列が見えているか
 *   - カード件数 / コメント数表示要素件数（汚染源候補）
 *   - 観測した class 名 sample（CSS Modules ハッシュの実体確認）
 */
/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { probeRecommendedLiveSection } from './probeRecommendedLiveSection.js';

describe('probeRecommendedLiveSection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('document を渡さない場合は detectedInWatchPage=false で空観測', () => {
    const r = probeRecommendedLiveSection(null);
    expect(r.detectedInWatchPage).toBe(false);
    expect(r.cardCount).toBe(0);
    expect(r.commentCountElementCount).toBe(0);
    expect(Array.isArray(r.classSamples)).toBe(true);
    expect(r.classSamples).toEqual([]);
  });

  it('おすすめ列がないページは detectedInWatchPage=false', () => {
    document.body.innerHTML = `
      <div class="comment-panel">
        <div class="table-row"><span class="comment-text">普通</span></div>
      </div>`;
    const r = probeRecommendedLiveSection(document);
    expect(r.detectedInWatchPage).toBe(false);
    expect(r.cardCount).toBe(0);
    expect(r.commentCountElementCount).toBe(0);
  });

  it('おすすめ列があるページ：detectedInWatchPage=true、cardCount/commentCountElementCount を返す', () => {
    // カード 3 件、各カード comment-count あり
    document.body.innerHTML = `
      <ul class="___program-card-list___X program-card-list">
        <li><article class="___program-card___A program-card">
          <span class="___comment-count___A1 comment-count">100</span>
        </article></li>
        <li><article class="___program-card___B program-card">
          <span class="___comment-count___B1 comment-count">200</span>
        </article></li>
        <li><article class="___program-card___C program-card">
          <span class="___comment-count___C1 comment-count">300</span>
        </article></li>
      </ul>`;
    const r = probeRecommendedLiveSection(document);
    expect(r.detectedInWatchPage).toBe(true);
    expect(r.cardCount).toBe(3);
    expect(r.commentCountElementCount).toBe(3);
  });

  it('classSamples に観測した CSS Modules class 名が最大 5 件入る', () => {
    document.body.innerHTML = `
      <ul class="___program-card-list___X program-card-list">
        ${Array.from({ length: 8 })
          .map(
            (_, i) => `
          <li><article class="___program-card___C${i} program-card">
            <span class="___comment-count___D${i} comment-count">10</span>
          </article></li>`
          )
          .join('')}
      </ul>`;
    const r = probeRecommendedLiveSection(document);
    expect(r.cardCount).toBe(8);
    expect(r.classSamples.length).toBeGreaterThan(0);
    expect(r.classSamples.length).toBeLessThanOrEqual(5);
    // CSS Modules ハッシュ命名（___xxx___HASH）が含まれる
    expect(r.classSamples.some((s) => /___program-card___/.test(s))).toBe(true);
  });

  it('document でもなく nullable でもない値（プレーン object）でも安全', () => {
    expect(() => probeRecommendedLiveSection(/** @type {any} */ ({}))).not.toThrow();
    const r = probeRecommendedLiveSection(/** @type {any} */ ({}));
    expect(r.detectedInWatchPage).toBe(false);
  });

  it('querySelector が例外を投げる document でもクラッシュしない', () => {
    const fakeDoc = /** @type {any} */ ({
      querySelector: () => {
        throw new Error('parse');
      },
      querySelectorAll: () => {
        throw new Error('parse');
      }
    });
    expect(() => probeRecommendedLiveSection(fakeDoc)).not.toThrow();
    const r = probeRecommendedLiveSection(fakeDoc);
    expect(r.detectedInWatchPage).toBe(false);
    expect(r.cardCount).toBe(0);
  });

  it('カードはあるが comment-count が無いケース：cardCount > 0 かつ commentCountElementCount=0', () => {
    document.body.innerHTML = `
      <ul class="program-card-list">
        <li><article class="program-card">no comment-count here</article></li>
      </ul>`;
    const r = probeRecommendedLiveSection(document);
    expect(r.detectedInWatchPage).toBe(true);
    expect(r.cardCount).toBe(1);
    expect(r.commentCountElementCount).toBe(0);
  });
});
