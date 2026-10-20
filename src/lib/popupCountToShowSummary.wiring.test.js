import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1704: 見出しの記録件数は pickCountToShow(サマリが正本・配列の長さは混ぜない)で決める。
 * council/count-simplify-SYNTHESIS.md 第2。旧 `Math.max(summaryRecordedCount, displayEntriesBase.length)` に戻さない。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('★popup の見出し件数: サマリが正本', () => {
  it('countToShow は pickCountToShow(summaryRecordedCount, displayEntriesBase.length) で決める', () => {
    expect(src).toMatch(/import \{ pickCountToShow \} from '\.\.\/lib\/pickCountToShow\.js';/);
    expect(src).toContain('const countToShow = pickCountToShow(summaryRecordedCount, displayEntriesBase.length);');
  });

  it('旧い max(サマリ, 配列の長さ) の書き方が残っていない', () => {
    expect(src).not.toMatch(/Math\.max\(summaryRecordedCount, displayEntriesBase\.length\)/);
  });
});
