import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * テール(未畳み込みの新着)を表示用の行へ足す箇所は、すべて mergeTailRowsIntoDisplay を通す(v0.1.1678)。
 *   生の `.concat(tail…)` が残ると、csummary.recent と ctail の重なりで表示行が二重(25→50)になり、
 *   単調増加ゲートで過大な記録件数が居座る(e2e snapshot-fetch-hang-resilient で再現)。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const SITES = [
  { file: 'src/extension/popup-entry.js', min: 4 },
  { file: 'src/lib/readAllCommentsForLive.js', min: 1 },
  { file: 'src/extension/marketing-export-entry.js', min: 1 }
];

describe('テールの連結は mergeTailRowsIntoDisplay を通す', () => {
  for (const { file, min } of SITES) {
    it(`★${file}: 生の concat(tail…) が残っておらず、helper を ${min} 回以上使う`, () => {
      const src = strip(read(file));
      expect(src).not.toMatch(/\.concat\(\s*(tailDisplayRows|tail)\s*\)/);
      expect(src).toContain("from '../lib/mergeTailRowsIntoDisplay.js'".replace('../lib/', file.startsWith('src/lib/') ? './' : '../lib/'));
      const uses = src.match(/mergeTailRowsIntoDisplay\(/g) || [];
      expect(uses.length).toBeGreaterThanOrEqual(min);
    });
  }
});
