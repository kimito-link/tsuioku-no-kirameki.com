/**
 * v0.1.200: 「おすすめ生放送」セクションの DOM 識別純関数のテスト。
 *
 * 真因: 拡張の comment scraper（[class*="comment" i] selector）が
 *   おすすめ生放送カード内の `comment-count` クラスにマッチし、
 *   配信タイトルや配信ID（lvXXXXXX）が誤ってコメント記録に混入していた。
 *
 * 本関数で「おすすめ生放送 DOM の子孫」を識別し、scraper 側で除外する。
 *
 * テストデータはユーザー提供の実 HTML（2026-05-06）から抜粋。
 */
/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { isInsideRecommendedLiveSection } from './isInsideRecommendedLiveSection.js';

describe('isInsideRecommendedLiveSection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('null は false', () => {
    expect(isInsideRecommendedLiveSection(null)).toBe(false);
  });

  it('undefined は false', () => {
    expect(isInsideRecommendedLiveSection(undefined)).toBe(false);
  });

  it('closest が無いオブジェクトは false（防御）', () => {
    // テキストノードや document fragment などは closest を持たない
    const fakeElement = /** @type {any} */ ({ tagName: 'DIV' });
    expect(isInsideRecommendedLiveSection(fakeElement)).toBe(false);
  });

  it('テキストノード（nodeType !== 1）相当は false', () => {
    // closest を持たないテキストノードは false
    const textNode = document.createTextNode('hello');
    expect(isInsideRecommendedLiveSection(/** @type {any} */ (textNode))).toBe(false);
  });

  it('watch ページ本体のコメントエリアは false（普通のコメント行）', () => {
    document.body.innerHTML = `
      <div class="comment-panel">
        <div class="table-row">
          <span class="comment-number">123</span>
          <span class="comment-text">こんにちは</span>
        </div>
      </div>
    `;
    const row = document.querySelector('.comment-text');
    expect(row).not.toBeNull();
    expect(isInsideRecommendedLiveSection(/** @type {Element} */ (row))).toBe(false);
  });

  it('真因 HTML：おすすめ列の comment-count 要素は true（CSS Modules の static 部分）', () => {
    // ユーザー提供 HTML から抜粋（lv350469899 のカード）
    document.body.innerHTML = `
      <form class="___loading-form___BCU8r loading-form">
        <div class="___loading-target___ez0Kl loading-target">
          <ul class="___program-card-list___LlRTy program-card-list">
            <li class="___item___fDZA1 item">
              <article id="lv350469899" class="___program-card___BaFpe program-card ga-ns-program-card">
                <ul class="___program-statistics-list___QyIpS program-statistics-list">
                  <li class="___comment-count___ylyGl comment-count" title="コメント数">
                    <span data-value="4847">4,847</span>
                  </li>
                </ul>
              </article>
            </li>
          </ul>
        </div>
      </form>
    `;
    const commentCount = document.querySelector('.comment-count');
    expect(commentCount).not.toBeNull();
    expect(isInsideRecommendedLiveSection(/** @type {Element} */ (commentCount))).toBe(true);
  });

  it('真因 HTML：CSS Modules ハッシュ命名（___program-card___HASH）でも true', () => {
    // 実 watch ページではハッシュ部分が変わるため、部分一致 selector が必要
    document.body.innerHTML = `
      <ul class="___program-card-list___ABCDE program-card-list">
        <li>
          <article class="___program-card___FGHIJ">
            <span data-value="100" class="___comment-count___QwerT comment-count">100</span>
          </article>
        </li>
      </ul>
    `;
    const span = document.querySelector('span.comment-count');
    expect(span).not.toBeNull();
    expect(isInsideRecommendedLiveSection(/** @type {Element} */ (span))).toBe(true);
  });

  it('program-statistics 内も true（来場者数の li 要素も）', () => {
    document.body.innerHTML = `
      <ul class="___program-card-list___X program-card-list">
        <li>
          <ul class="program-statistics-list">
            <li class="watch-count">5000</li>
          </ul>
        </li>
      </ul>
    `;
    const watchCount = document.querySelector('.watch-count');
    expect(watchCount).not.toBeNull();
    expect(isInsideRecommendedLiveSection(/** @type {Element} */ (watchCount))).toBe(true);
  });

  it('program-recommend 系コンテナ内も true', () => {
    document.body.innerHTML = `
      <section class="program-recommend-panel">
        <div class="some-inner">child</div>
      </section>
    `;
    const inner = document.querySelector('.some-inner');
    expect(inner).not.toBeNull();
    expect(isInsideRecommendedLiveSection(/** @type {Element} */ (inner))).toBe(true);
  });

  it('loading-target 内も true', () => {
    document.body.innerHTML = `
      <div class="loading-target">
        <span>foo</span>
      </div>
    `;
    const inner = document.querySelector('span');
    expect(inner).not.toBeNull();
    expect(isInsideRecommendedLiveSection(/** @type {Element} */ (inner))).toBe(true);
  });

  it('要素自身が match selector を持つ場合も true（closest は self を含む）', () => {
    document.body.innerHTML = `<div class="program-card">card</div>`;
    const el = document.querySelector('.program-card');
    expect(el).not.toBeNull();
    expect(isInsideRecommendedLiveSection(/** @type {Element} */ (el))).toBe(true);
  });

  it('普通の div + 普通の class はまったく false', () => {
    document.body.innerHTML = `
      <div class="player-area">
        <div class="comment-input">テキスト入力欄</div>
      </div>
    `;
    const target = document.querySelector('.comment-input');
    expect(target).not.toBeNull();
    expect(isInsideRecommendedLiveSection(/** @type {Element} */ (target))).toBe(false);
  });

  it('ProgramRecommendPanel の a[href] 配下は true（ref 安定シグナル）', () => {
    document.body.innerHTML = `
      <a id="rec" href="https://live.nicovideo.jp/watch/lv350000001?ref=WatchPage-ContentsTabPanel-ProgramRecommendPanel-ProgramCard">title</a>`;
    const a = document.getElementById('rec');
    expect(a).not.toBeNull();
    expect(isInsideRecommendedLiveSection(/** @type {Element} */ (a))).toBe(true);
  });

  it('2026-05 実 DOM：comment-count は article 内で a と兄弟でも ProgramRecommendPanel で true', () => {
    document.body.innerHTML = `
      <form class="___loading-form___X loading-form">
        <div class="___loading-target___Y loading-target">
          <ul class="___program-card-list___Z program-card-list">
            <li class="item">
              <article class="___program-card___P program-card ga-ns-program-card" id="lv350000001">
                <a class="preview" href="https://live.nicovideo.jp/watch/lv350000001?ref=WatchPage-ContentsTabPanel-ProgramRecommendPanel-ProgramCard">x</a>
                <div class="content-area">
                  <div class="status-bar">
                    <div class="___program-statistics___S program-statistics">
                      <ul>
                        <li class="___comment-count___C comment-count" title="コメント数">
                          <span data-value="0">0</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </article>
            </li>
          </ul>
        </div>
      </form>`;
    const li = document.querySelector('.comment-count');
    expect(li).not.toBeNull();
    expect(isInsideRecommendedLiveSection(/** @type {Element} */ (li))).toBe(true);
  });

  it('閉じる selector のいずれかが SyntaxError を投げてもクラッシュしない', () => {
    // closest が例外を投げるケースを模擬
    const fakeElement = /** @type {any} */ ({
      closest: () => {
        throw new Error('selector parse error');
      }
    });
    // 例外は飲み込んで false を返す
    expect(isInsideRecommendedLiveSection(fakeElement)).toBe(false);
  });
});
