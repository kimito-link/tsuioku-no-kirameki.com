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

  /*
   * ★v0.1.1267: startHostStyleMutationTrace → ensureHostAncestryMutationTrace に改名。
   *   同時に観測範囲を「host だけ」から「host+祖先2階層」へ広げ、
   *   初代固着(host 再生成後に死んだノードを見張る)を根治した。
   *   祖先観測・張り直しの断言は vanishForensics1267.wiring.test.js が担当する。
   */
  it('★MutationObserver で見張っている(関数を通らない書き換えも捕らえる)', () => {
    const body = fnBody(contentSrc, 'function ensureHostAncestryMutationTrace(');
    expect(body).toContain('new MutationObserver(');
    expect(body).toMatch(
      /attrFilter = \['style', 'class', 'hidden', 'aria-hidden', 'data-nls-hidden'\]/
    );
  });

  it('★消えた瞬間だけ stack を採る(毎回だと重い)', () => {
    const body = fnBody(contentSrc, 'function ensureHostAncestryMutationTrace(');
    expect(body).toMatch(/stack: becameHidden \? new Error\('host-hidden'\)\.stack : ''/);
  });

  it('★host 作成時に無条件で観測を開始する', () => {
    expect(contentSrc).toMatch(/\n\s*ensureHostAncestryMutationTrace\(host\);/);
    // if で無効化されていないこと。
    expect(contentSrc).not.toMatch(/if\s*\([^)]*\)\s*ensureHostAncestryMutationTrace\(host\);/);
  });

  it('★現物を見ているときだけ早期returnする(旧実装は初代に固着していた)', () => {
    const body = fnBody(contentSrc, 'function ensureHostAncestryMutationTrace(');
    expect(body).toMatch(
      /if \(_hostStyleObserver && _hostTraceHost === host && _hostTraceParent === parent\) return;/
    );
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
