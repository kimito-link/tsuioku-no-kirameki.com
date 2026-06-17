import { describe, it, expect } from 'vitest';
import {
  extractInternalLinks,
  resolveRelativeLink,
  resolveLinkCandidates,
  findBrokenInternalLinks
} from './siteLinkHealth.js';

describe('extractInternalLinks', () => {
  it('HTML: href/src の相対 .html/.md だけ拾い、外部/アンカー/mailto は除外', () => {
    const html = `
      <a href="ndgr.html">x</a>
      <a href="../privacy.html">p</a>
      <a href="https://example.com/a.html">ext</a>
      <a href="#top">anchor</a>
      <a href="mailto:a@b.com">mail</a>
      <a href="repo-tree-map.md">md</a>
      <img src="../images/logo.png">
      <a href="foo.html?x=1#sec">query</a>`;
    expect(extractInternalLinks(html, { html: true })).toEqual([
      'ndgr.html', '../privacy.html', 'repo-tree-map.md', 'foo.html'
    ]);
  });

  it('Markdown: [text](path) と <path> の相対 .md/.html を拾う', () => {
    const md = `
      see [synthesis](./person-tile-unify-SYNTHESIS.md) and [flow](../docs/x.html)
      external [g](https://g.co) and image ![a](pic.png)
      <repo-tree-map.md>`;
    expect(extractInternalLinks(md, { html: false })).toEqual([
      './person-tile-unify-SYNTHESIS.md', '../docs/x.html', 'repo-tree-map.md'
    ]);
  });
});

describe('resolveRelativeLink', () => {
  it('同ディレクトリ', () => {
    expect(resolveRelativeLink('tsuioku-no-kirameki/articles/index.html', 'ndgr.html'))
      .toBe('tsuioku-no-kirameki/articles/ndgr.html');
  });
  it('親へ ../', () => {
    expect(resolveRelativeLink('tsuioku-no-kirameki/articles/index.html', '../privacy.html'))
      .toBe('tsuioku-no-kirameki/privacy.html');
  });
  it('./ は無視', () => {
    expect(resolveRelativeLink('docs/a.md', './b.md')).toBe('docs/b.md');
  });
  it('複数 ../', () => {
    expect(resolveRelativeLink('a/b/c/x.html', '../../y.html')).toBe('a/y.html');
  });
});

describe('resolveLinkCandidates', () => {
  it('ファイル相対とルート相対の両候補を返す(重複排除)', () => {
    const cands = resolveLinkCandidates('docs/a.md', 'docs/releases/cws.md');
    // ①ファイル相対: docs/ + docs/releases/cws.md  ②ルート相対: docs/releases/cws.md
    expect(cands).toContain('docs/docs/releases/cws.md');
    expect(cands).toContain('docs/releases/cws.md');
  });
  it('同ディレクトリ単純リンクは候補が1つに収れん', () => {
    expect(resolveLinkCandidates('a/index.html', 'x.html')).toEqual(['a/x.html', 'x.html']);
  });
});

describe('findBrokenInternalLinks', () => {
  const present = new Set([
    'tsuioku-no-kirameki/articles/ndgr.html',
    'tsuioku-no-kirameki/privacy.html'
  ]);
  const exists = (p) => present.has(p);

  it('実在リンクは broken に出ない', () => {
    const files = [
      { path: 'tsuioku-no-kirameki/articles/index.html', text: '<a href="ndgr.html">x</a><a href="../privacy.html">p</a>' }
    ];
    expect(findBrokenInternalLinks(files, exists)).toEqual([]);
  });

  it('存在しない参照先は broken に出る(from/link/resolved 付き)', () => {
    const files = [
      { path: 'tsuioku-no-kirameki/articles/index.html', text: '<a href="missing.html">m</a>' }
    ];
    expect(findBrokenInternalLinks(files, exists)).toEqual([
      {
        from: 'tsuioku-no-kirameki/articles/index.html',
        link: 'missing.html',
        resolved: 'tsuioku-no-kirameki/articles/missing.html'
      }
    ]);
  });

  it('同一(from, link)は重複排除する', () => {
    const files = [
      { path: 'a/index.html', text: '<a href="x.html">1</a> <a href="x.html">2</a>' }
    ];
    const broken = findBrokenInternalLinks(files, () => false);
    expect(broken).toHaveLength(1);
    expect(broken[0].resolved).toBe('a/x.html');
  });

  it('ルート起点で書いたリンク(docs/x.md を docs/y.md 内で)も実在すれば健全', () => {
    // docs/agents-...md 内に [..](docs/releases/cws.md) のような root 起点リンクがある実例
    const rootPresent = new Set(['docs/releases/cws.md']);
    const files = [
      { path: 'docs/agents-session-history-archive.md', text: 'see [x](docs/releases/cws.md)' }
    ];
    expect(findBrokenInternalLinks(files, (p) => rootPresent.has(p))).toEqual([]);
  });

  it('Markdown も検証できる', () => {
    const files = [
      { path: 'docs/index.md', text: 'see [s](./gone.md)' }
    ];
    expect(findBrokenInternalLinks(files, () => false)).toEqual([
      { from: 'docs/index.md', link: './gone.md', resolved: 'docs/gone.md' }
    ]);
  });
});
