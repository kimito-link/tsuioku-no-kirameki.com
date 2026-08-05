import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const contentSrc = read('extension/content-entry.js');

function fnBody(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return '';
  const end = src.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), i);
  return end < 0 ? src.slice(i) : src.slice(i, end + 2);
}

describe('hostStyleMutationTrace の配線', () => {
  it('計器を import して state を作っている', () => {
    expect(contentSrc).toContain("from '../lib/hostStyleMutationTrace.js'");
    expect(contentSrc).toMatch(/const _hostStyleTrace = createHostStyleMutationTrace\(\);/);
  });

  it('★MutationObserver で見張っている(関数を通らない書き換えも捕らえる)', () => {
    const body = fnBody(contentSrc, 'function startHostStyleMutationTrace(');
    expect(body).toContain('new MutationObserver(');
    expect(body).toMatch(/attributeFilter:\s*\['style', 'class', 'hidden', 'aria-hidden'\]/);
  });

  it('★消えた瞬間だけ stack を採る(毎回だと重い)', () => {
    const body = fnBody(contentSrc, 'function startHostStyleMutationTrace(');
    expect(body).toMatch(/stack: becameHidden \? new Error\('host-hidden'\)\.stack : ''/);
  });

  it('★host 作成時に無条件で観測を開始する', () => {
    expect(contentSrc).toMatch(/\n\s*startHostStyleMutationTrace\(host\);/);
    // if で無効化されていないこと。
    expect(contentSrc).not.toMatch(/if\s*\([^)]*\)\s*startHostStyleMutationTrace\(/);
  });

  it('二重起動を防いでいる', () => {
    const body = fnBody(contentSrc, 'function startHostStyleMutationTrace(');
    expect(body).toMatch(/if \(_hostStyleObserver \|\| !host/);
  });

  it('診断に載せている(2箇所とも)', () => {
    const hits = contentSrc.match(/hostStyleTrace: \(\(\) => \{/g) || [];
    expect(hits.length).toBe(2);
  });

  it('★lite に通している(通さないとコピペに永久に出ない)', () => {
    const lite = read('lib/statusFastDiagLite.js');
    expect(lite).toContain('content.hostStyleTrace');
    expect(lite).toMatch(/\n\s+hostStyleTrace,/);
  });

  it('★状態速報の本文に1行出している', () => {
    const report = read('lib/aiShareFullText.js');
    expect(report).toContain('hostStyleTrace?.line');
    expect(report).toMatch(/if \(traceLine\) \{ lines\.push\(traceLine\)/);
  });
});
