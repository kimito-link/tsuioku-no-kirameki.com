/**
 * ダーク系 LP ブロックがグローバル `.board p { color: var(--text-secondary) }` に
 * 飲まれないよう、`board` と混在させない契約。
 * @see #lp-extension-pseudo-flow（extension-visual）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

/**
 * @param {string} html
 * @returns {string}
 */
function openingTagOfPseudoFlowRoot(html) {
  const idPos = html.indexOf('id="lp-extension-pseudo-flow"');
  expect(idPos).toBeGreaterThan(-1);
  const openDiv = html.lastIndexOf('<div', idPos);
  const closeTag = html.indexOf('>', idPos);
  expect(openDiv).toBeGreaterThan(-1);
  expect(closeTag).toBeGreaterThan(idPos);
  return html.slice(openDiv, closeTag + 1);
}

describe('lpIndexBoardDarkContrast', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('#lp-extension-pseudo-flow ルートに board を付けない（.board p との詳細度競合を避ける）', () => {
    const tag = openingTagOfPseudoFlowRoot(html);
    expect(tag).not.toMatch(/\bboard\b/);
  });

  it('スタイルに board と疑似フローのペア上書き（.board.lp-extension-pseudo-flow）に依存しない', () => {
    expect(html.includes('.board.lp-extension-pseudo-flow')).toBe(false);
  });
});
