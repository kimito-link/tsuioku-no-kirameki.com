/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildTopSupportRankLinesHtml } from './topSupportRankLinesHtml.js';

// characterization（黄金値）テスト: 抽出前の renderTopSupportRankStrip の行組み立てを固定。
//   サムネ解決は副作用なので恒等で注入し、構造/属性を DOMParser で検証する。

const parse = (html) => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');

const model = (over = {}) => ({
  count: 12,
  userKey: '12345',
  isUnknown: false,
  placeNumber: 1,
  hasAccent: false,
  accentColorCss: null,
  thumbSrc: 'https://example.com/a.png',
  idTitle: 'ID:12345',
  idShort: 'ID12345',
  nameLine: 'りんく',
  fullLabelForTitle: 'りんく (12件)',
  ...over
});

describe('buildTopSupportRankLinesHtml', () => {
  it('数値IDユーザー: リンク行(<a>)・href・count・name', () => {
    const root = parse(buildTopSupportRankLinesHtml([model()]));
    const a = root.querySelector('a.nl-top-support-rank__line');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://www.nicovideo.jp/user/12345');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.classList.contains('nl-top-support-rank__line--linkable')).toBe(true);
    expect(root.querySelector('.nl-top-support-rank__count').textContent).toBe('12件');
    expect(root.querySelector('.nl-top-support-rank__name').textContent).toBe('りんく');
  });

  it('匿名ユーザー: <div> 行・unknown クラス・href なし・id ブロックなし', () => {
    const root = parse(
      buildTopSupportRankLinesHtml([model({ isUnknown: true, idShort: '', userKey: 'a:zzz' })])
    );
    expect(root.querySelector('a.nl-top-support-rank__line')).toBeNull();
    const div = root.querySelector('div.nl-top-support-rank__line');
    expect(div.classList.contains('nl-top-support-rank__line--unknown')).toBe(true);
    expect(root.querySelector('.nl-top-support-rank__id')).toBeNull();
  });

  it('匿名スタイルの数値風キーはリンク化しない', () => {
    // isAnonymousStyleNicoUserId が true になるキー（合成キー）→ div 行
    const root = parse(buildTopSupportRankLinesHtml([model({ userKey: '__anon_ad_1' })]));
    expect(root.querySelector('a.nl-top-support-rank__line')).toBeNull();
  });

  it('placeNumber=null は empty placeholder span', () => {
    const root = parse(buildTopSupportRankLinesHtml([model({ placeNumber: null })]));
    const place = root.querySelector('.nl-top-support-rank__place');
    expect(place.classList.contains('nl-top-support-rank__place--empty')).toBe(true);
    expect(place.textContent).toBe('');
  });

  it('hasAccent+accentColorCss で has-accent クラスと CSS 変数が付く', () => {
    const html = buildTopSupportRankLinesHtml([
      model({ hasAccent: true, accentColorCss: '#ff8800' })
    ]);
    expect(html).toContain('nl-top-support-rank__line--has-accent');
    expect(html).toContain('--nl-rank-accent:#ff8800');
    // accent 無しなら付かない
    const noAccent = buildTopSupportRankLinesHtml([model({ hasAccent: false })]);
    expect(noAccent).not.toContain('has-accent');
  });

  it('resolveDisplayThumb が img src に反映され、http(s) で referrerpolicy が付く', () => {
    const root = parse(
      buildTopSupportRankLinesHtml([model({ thumbSrc: 'raw' })], {
        resolveDisplayThumb: () => 'https://cdn.example/x.png'
      })
    );
    const img = root.querySelector('img.nl-top-support-rank__thumb');
    expect(img.getAttribute('src')).toBe('https://cdn.example/x.png');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('non-http サムネ（data:）には referrerpolicy を付けない', () => {
    const root = parse(
      buildTopSupportRankLinesHtml([model()], {
        resolveDisplayThumb: () => 'data:image/png;base64,AAAA'
      })
    );
    expect(root.querySelector('img').hasAttribute('referrerpolicy')).toBe(false);
  });

  it('XSS: nameLine / accentColorCss / thumb がエスケープされる', () => {
    const root = parse(
      buildTopSupportRankLinesHtml(
        [
          model({
            nameLine: '<script>x</script>',
            hasAccent: true,
            accentColorCss: '"><img onerror=1>',
            userKey: 'a:anon',
            isUnknown: true
          })
        ],
        { resolveDisplayThumb: () => 'https://e.com/x.png" onerror="y' }
      )
    );
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('.nl-top-support-rank__name').textContent).toBe('<script>x</script>');
    const img = root.querySelector('img.nl-top-support-rank__thumb');
    expect(img.hasAttribute('onerror')).toBe(false);
  });

  it('複数行が models の順序で並ぶ', () => {
    const root = parse(
      buildTopSupportRankLinesHtml([
        model({ placeNumber: 1, nameLine: 'a' }),
        model({ placeNumber: 2, nameLine: 'b' }),
        model({ placeNumber: 3, nameLine: 'c' })
      ])
    );
    const names = [...root.querySelectorAll('.nl-top-support-rank__name')].map((n) => n.textContent);
    expect(names).toEqual(['a', 'b', 'c']);
  });

  it('空配列・非配列は空文字を返す（投げない）', () => {
    expect(buildTopSupportRankLinesHtml([])).toBe('');
    expect(buildTopSupportRankLinesHtml(null)).toBe('');
  });
});
