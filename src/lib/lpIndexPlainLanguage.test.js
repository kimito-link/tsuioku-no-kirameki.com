/**
 * LP（tsuioku-no-kirameki/index.html）の平易な注意書きと「LP 用」連呼の削減を契約する。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

/** <style>…</style> を除いた文字列（ユーザー向け文言のざっくり近似） */
function htmlWithoutStyleBlocks(html) {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

describe('lpIndexPlainLanguage', () => {
  const raw = readFileSync(lpIndexPath, 'utf8');
  const html = htmlWithoutStyleBlocks(raw);

  it('共通の平易な見本注意（data-lp-plain）が extension-visual 内にある', () => {
    const start = html.indexOf('id="extension-visual"');
    expect(start).toBeGreaterThan(-1);
    const end = html.indexOf('id="lp-top-commenters"', start);
    expect(end).toBeGreaterThan(start);
    const block = html.slice(start, end);
    expect(block).toContain('data-lp-plain="page-demo-note"');
    expect(block).toMatch(/このページに載っている[\s\S]*動きません/);
  });

  it('extension-visual 内に三人の短い補足（data-lp-plain trio）がある', () => {
    const start = html.indexOf('id="extension-visual"');
    const end = html.indexOf('id="lp-top-commenters"', start);
    const block = html.slice(start, end);
    expect(block).toContain('data-lp-plain="trio-extension-visual"');
    expect(block).toMatch(/たぬ姉[\s\S]*こん太[\s\S]*りんく/);
  });

  it('ユーザー向け HTML 相当では「LP 用」の連呼を抑える（スタイルブロック除く）', () => {
    const n = (html.match(/LP 用/g) || []).length;
    expect(n).toBeLessThanOrEqual(1);
  });

  it('ユーザー向け HTML 相当では「LP用」（スペースなし）も抑える', () => {
    const n = (html.match(/LP用/g) || []).length;
    expect(n).toBeLessThanOrEqual(1);
  });

  it('「LP 用ダミー」フレーズは使わない', () => {
    expect(html).not.toContain('LP 用ダミー');
  });

  it('「LP 用モック」見出しは使わない', () => {
    expect(html).not.toContain('LP 用モック');
  });
});
