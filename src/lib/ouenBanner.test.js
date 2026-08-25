import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideOuenBanner } from './ouenBanner.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

describe('decideOuenBanner', () => {
  it('正常な JSON なら出す', () => {
    const r = decideOuenBanner({
      show: true, title: '液晶保護アプリ', note: 'メモ', when: '8/30(日) 22:00',
      url: 'https://example.com/a'
    });
    expect(r.show).toBe(true);
    expect(r.title).toBe('液晶保護アプリ');
  });

  // ★fail-closed: 迷ったら出さない
  it.each([
    ['null', null],
    ['文字列', 'x'],
    ['show=false', { show: false, title: 'a', url: 'https://a.example' }],
    ['show無し', { title: 'a', url: 'https://a.example' }],
    ['title空', { show: true, title: '  ', url: 'https://a.example' }],
    ['url無し', { show: true, title: 'a' }],
  ])('%s なら出さない', (_label, input) => {
    expect(decideOuenBanner(input).show).toBe(false);
  });

  // ★ここが本命の赤: 危険なURLを踏ませない
  it.each([
    'javascript:alert(1)',
    'http://insecure.example',
    'data:text/html,<script>x</script>',
    'chrome-extension://abc/popup.html',
  ])('危険/非httpsなURL(%s)は出さない', (url) => {
    expect(decideOuenBanner({ show: true, title: 'a', url }).show).toBe(false);
  });
});

describe('同梱JSONと画面の整合', () => {
  it('extension/data/ouen-banner.json は decideOuenBanner を通る形である', () => {
    const raw = JSON.parse(read('extension/data/ouen-banner.json'));
    const r = decideOuenBanner(raw);
    // ★出す設定にしているなら、必ず妥当な中身であること
    if (raw.show === true) {
      expect(r.show).toBe(true);
      expect(r.url.startsWith('https://')).toBe(true);
    }
  });

  it('popup.html に受け皿の要素IDが実在する（配線が切れたら落ちる）', () => {
    // ★HTMLのコメントを除去してから探す。コメント内の記述で緑にならないように。
    const html = read('extension/popup.html').replace(/<!--[\s\S]*?-->/g, '');
    for (const id of ['ouenBanner', 'ouenBannerTitle', 'ouenBannerNote', 'ouenBannerWhen']) {
      expect(html).toContain(`id="${id}"`);
    }
    // 既定は hidden（JSONが読めないとき空枠を出さない）
    expect(html).toMatch(/id="ouenBanner"[\s\S]{0,200}?hidden/);
  });
});
