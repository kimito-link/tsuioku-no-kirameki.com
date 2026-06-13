/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildCommentTickerLatestHtml } from './commentTickerLatestHtml.js';

/**
 * characterization（黄金値）テスト。会議室の指針に従い、
 * 生文字列一致だけでなく DOMParser で構造/属性/テキストも検証する
 * （空白・属性順・クォート種の差で脆くならないように二段構え）。
 */
function parse(html) {
  return new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html')
    .getElementById('r');
}

describe('buildCommentTickerLatestHtml', () => {
  it('リンクあり（数値uid）: <a> ラッパ + 行 + 名前 + 本文（黄金値）', () => {
    const html = buildCommentTickerLatestHtml({
      label: 'たろう',
      avatarSrc: 'https://example.com/a.png',
      textShown: 'こんにちは',
      userPageHref: 'https://www.nicovideo.jp/user/123'
    });
    expect(html).toBe(
      '<a class="nl-ticker-item nl-ticker-latest nl-ticker-latest--linkable" aria-live="polite" href="https://www.nicovideo.jp/user/123" target="_blank" rel="noopener noreferrer"><span class="nl-ticker-latest__row"><img class="nl-ticker-latest__avatar" alt="" src="https://example.com/a.png" data-on-error-fallback="blank"><span class="nl-ticker-latest__name">たろう</span><span class="nl-ticker-latest__colon">：</span><span class="nl-ticker-latest__text">こんにちは</span></span></a>'
    );
    const root = parse(html);
    const a = root.querySelector('a.nl-ticker-latest--linkable');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://www.nicovideo.jp/user/123');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(root.querySelector('.nl-ticker-latest__name').textContent).toBe('たろう');
    expect(root.querySelector('.nl-ticker-latest__text').textContent).toBe('こんにちは');
    expect(root.querySelector('img.nl-ticker-latest__avatar').getAttribute('src')).toBe(
      'https://example.com/a.png'
    );
  });

  it('リンクなし（匿名・href空）: <span> ラッパで <a> を出さない', () => {
    const html = buildCommentTickerLatestHtml({
      label: '匿名',
      avatarSrc: '',
      textShown: 'やあ',
      userPageHref: ''
    });
    const root = parse(html);
    expect(root.querySelector('a')).toBeNull();
    const span = root.querySelector('span.nl-ticker-latest');
    expect(span).not.toBeNull();
    expect(span.getAttribute('aria-live')).toBe('polite');
    expect(root.querySelector('.nl-ticker-latest__text').textContent).toBe('やあ');
  });

  it('label 空: 名前 span とコロンを出さない（本文のみ）', () => {
    const html = buildCommentTickerLatestHtml({
      label: '',
      avatarSrc: '',
      textShown: '本文だけ',
      userPageHref: ''
    });
    const root = parse(html);
    expect(root.querySelector('.nl-ticker-latest__name')).toBeNull();
    expect(root.querySelector('.nl-ticker-latest__colon')).toBeNull();
    expect(root.querySelector('.nl-ticker-latest__text').textContent).toBe('本文だけ');
  });

  it('絵文字・クォート・タグ文字を含む本文/名前を正しく escape する', () => {
    const html = buildCommentTickerLatestHtml({
      label: '<b>"なまえ"</b>',
      avatarSrc: '',
      textShown: '😀 <script>&"\'',
      userPageHref: ''
    });
    // 生 HTML に未エスケープのタグが混入しない
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<script>');
    // パース後のテキストは元の文字列に戻る（escape→decode 往復）
    const root = parse(html);
    expect(root.querySelector('.nl-ticker-latest__name').textContent).toBe('<b>"なまえ"</b>');
    expect(root.querySelector('.nl-ticker-latest__text').textContent).toBe('😀 <script>&"\'');
  });

  it('href に " を含んでも属性が壊れない（escapeAttr）', () => {
    const html = buildCommentTickerLatestHtml({
      label: 'x',
      avatarSrc: '',
      textShown: 't',
      userPageHref: 'https://www.nicovideo.jp/user/1"onmouseover="alert(1)'
    });
    const root = parse(html);
    const a = root.querySelector('a');
    expect(a).not.toBeNull();
    // onmouseover という属性は生成されない（href の中に閉じ込められる）
    expect(a.hasAttribute('onmouseover')).toBe(false);
  });

  it('入力欠落（undefined）でも例外を投げず span を返す', () => {
    const html = buildCommentTickerLatestHtml({});
    const root = parse(html);
    expect(root.querySelector('span.nl-ticker-latest')).not.toBeNull();
    expect(root.querySelector('a')).toBeNull();
  });
});
