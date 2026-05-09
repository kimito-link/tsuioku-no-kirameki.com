/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeMirrorHtml } from './mirrorSanitize.js';

describe('sanitizeMirrorHtml', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('入力が空 / null / undefined のとき空文字を返す', () => {
    expect(sanitizeMirrorHtml('')).toBe('');
    expect(sanitizeMirrorHtml('   ')).toBe('');
    expect(sanitizeMirrorHtml(null)).toBe('');
    expect(sanitizeMirrorHtml(undefined)).toBe('');
  });

  it('niconico 実 SVG（contribution-unit + rank-icon + linearGradient）を通す', () => {
    const input = `
      <ul class="wrapper">
        <li class="item">
          <i class="rank">
            <svg viewBox="0 0 26 22" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="rank-icon-grad-99" x1="50%" y1="0%" x2="50%" y2="103.632%">
                  <stop stop-color="#FFF1AF" offset="0%"></stop>
                  <stop stop-color="#DEA400" offset="100%"></stop>
                </linearGradient>
              </defs>
              <path d="M35.3 19.978" fill="url(#rank-icon-grad-99)" fill-rule="evenodd"></path>
            </svg>
          </i>
          <p class="contribution">
            1,500
            <svg viewBox="0 0 20 20" class="contribution-unit">
              <title>貢</title>
              <path d="M19.274 4.612z" fill-rule="evenodd"></path>
            </svg>
          </p>
        </li>
      </ul>
    `;

    const html = sanitizeMirrorHtml(input);

    expect(html).toContain('<svg');
    expect(html).toContain('<defs>');
    // createElementNS で SVG namespace を作るので linearGradient は camelCase 保持が正しい挙動
    expect(html).toMatch(/<lineargradient/i);
    expect(html).toContain('<title>貢</title>');
    expect(html).toContain('<path');
    expect(html).toContain('1,500');
    expect(html).toContain('class="contribution"');
    expect(html).toContain('class="contribution-unit"');
    // svg viewBox 属性は保持
    expect(html).toMatch(/viewbox=/i);
  });

  it('SVG defs の id を nonce 付きに rename し、url(#...) 参照も同期更新する', () => {
    const input = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="rank-icon-grad-99"></linearGradient></defs>
        <path fill="url(#rank-icon-grad-99)"></path>
      </svg>
    `;

    const html = sanitizeMirrorHtml(input);

    // id は rename されている（元の id は残らない）
    expect(html).not.toContain('id="rank-icon-grad-99"');
    expect(html).toMatch(/id="nl-mirror-[a-z0-9]+-rank-icon-grad-99"/);

    // url(#) も同じ rename 後の id を指す
    expect(html).not.toContain('fill="url(#rank-icon-grad-99)"');
    expect(html).toMatch(/fill="url\(#nl-mirror-[a-z0-9]+-rank-icon-grad-99\)"/);
  });

  it('複数の独立した sanitize 呼び出しで id 衝突しない（別 nonce）', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.111111111)
      .mockReturnValueOnce(0.222222222);

    const html1 = sanitizeMirrorHtml(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="grad-x"></linearGradient></defs></svg>'
    );
    const html2 = sanitizeMirrorHtml(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="grad-x"></linearGradient></defs></svg>'
    );

    expect(html1).not.toBe(html2);
    expect(html1).toMatch(/id="nl-mirror-[a-z0-9]+-grad-x"/);
    expect(html2).toMatch(/id="nl-mirror-[a-z0-9]+-grad-x"/);
    // 別 nonce なので id 値は異なる
    const id1 = /id="(nl-mirror-[a-z0-9]+-grad-x)"/.exec(html1)?.[1];
    const id2 = /id="(nl-mirror-[a-z0-9]+-grad-x)"/.exec(html2)?.[1];
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('script タグを完全削除する（中身もろとも）', () => {
    const input = `
      <ul class="wrapper">
        <li class="item">
          ok
          <script>alert(1)</script>
        </li>
      </ul>
    `;
    const html = sanitizeMirrorHtml(input);

    expect(html).toContain('ok');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('iframe / object / embed / style / link / meta / base タグを削除する', () => {
    const input = `
      <div>
        <iframe src="https://evil.example/"></iframe>
        <object data="evil"></object>
        <embed src="evil">
        <style>body { display: none }</style>
        <link rel="stylesheet" href="evil.css">
        <meta http-equiv="refresh" content="0">
        <base href="https://evil.example/">
        <p class="ok">残る</p>
      </div>
    `;
    const html = sanitizeMirrorHtml(input);

    expect(html).toContain('class="ok"');
    expect(html).toContain('残る');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<object');
    expect(html).not.toContain('<embed');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<meta');
    expect(html).not.toContain('<base');
  });

  it('on* イベント属性を削除する（onclick / onmouseover / onerror 等）', () => {
    const input = `
      <button class="ranker" onclick="alert(1)" onmouseover="hack()">click</button>
      <img src="https://example.com/x.png" onerror="alert(1)">
    `;
    const html = sanitizeMirrorHtml(input);

    expect(html).toContain('<button');
    expect(html).toContain('class="ranker"');
    expect(html).toContain('<img');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onmouseover');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('hack()');
  });

  it('style 属性を削除する（CSP 衝突の予防）', () => {
    const input = `
      <span class="thumbnail" style="background-image: url('https://evil.example/x.png');">x</span>
    `;
    const html = sanitizeMirrorHtml(input);

    expect(html).toContain('class="thumbnail"');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('background-image');
  });

  it('href 属性を完全削除する（popup 内クリックでの遷移を防ぐ）', () => {
    const input = `
      <a href="https://example.com/" class="anchor">link</a>
      <button href="https://example.com/" class="btn">btn</button>
    `;
    const html = sanitizeMirrorHtml(input);

    // a 自体は ALLOWED_TAGS に無いので消える（子テキストは拾われる）
    expect(html).not.toContain('href=');
    expect(html).toContain('link');
  });

  it('data-v-* attribute を削除する（Vue scope id、popup では無効）', () => {
    const input = `
      <ul class="wrapper" data-v-abc123="" data-v-deadbeef="">
        <li class="item" data-v-abc123="">x</li>
      </ul>
    `;
    const html = sanitizeMirrorHtml(input);

    expect(html).toContain('class="wrapper"');
    expect(html).toContain('class="item"');
    expect(html).not.toContain('data-v-abc123');
    expect(html).not.toContain('data-v-deadbeef');
  });

  it('javascript: / data: / vbscript: protocol の URL を src/xlink:href から弾く', () => {
    const input = `
      <img src="javascript:alert(1)">
      <use xlink:href="data:text/html,<script>alert(1)</script>"></use>
      <img src="vbscript:msgbox(1)">
    `;
    const html = sanitizeMirrorHtml(input);

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('vbscript:');
    expect(html).not.toMatch(/src="data:/);
    expect(html).not.toMatch(/xlink:href="data:/);
  });

  it('[hidden] 属性付き要素は完全削除（niconico で非表示なものを popup で出さない）', () => {
    const input = `
      <ul class="wrapper">
        <li class="item">visible</li>
        <li class="item" hidden>secret-hidden</li>
        <li class="item" hidden="">also-hidden</li>
      </ul>
    `;
    const html = sanitizeMirrorHtml(input);

    expect(html).toContain('visible');
    expect(html).not.toContain('secret-hidden');
    expect(html).not.toContain('also-hidden');
  });

  it('ホワイトリスト外のタグは飛ばすが、子テキストは救出する', () => {
    const input = `
      <article>
        <header>HEADER</header>
        <p class="ok">main</p>
      </article>
    `;
    const html = sanitizeMirrorHtml(input);

    // article / header は ALLOWED_TAGS 外
    expect(html).not.toContain('<article');
    expect(html).not.toContain('<header');
    // 中の <p class="ok"> は通り、HEADER テキストも救出される
    expect(html).toContain('class="ok"');
    expect(html).toContain('main');
    expect(html).toContain('HEADER');
  });

  it('niconico の `p.contribution` 行（実 DOM）の outerHTML をそのまま映せる', () => {
    // kimito さん 2026-05-09 提供の広告ランキング DOM の最小サンプル
    const input = `
      <p class="contribution">45,400 <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" class="contribution-unit"><title>貢</title><path d="M19.274 4.612z" fill-rule="evenodd" class="shape"></path></svg></p>
    `;
    const html = sanitizeMirrorHtml(input);

    expect(html).toContain('class="contribution"');
    expect(html).toContain('45,400');
    expect(html).toContain('class="contribution-unit"');
    expect(html).toContain('<title>貢</title>');
    expect(html).toMatch(/<path[^>]*d="M19.274 4.612z"/);
  });
});
