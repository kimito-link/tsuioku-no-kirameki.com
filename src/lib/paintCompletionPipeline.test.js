import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildAiShareFullText } from './aiShareFullText.js';
import {
  createPaintProbeState,
  observePaintCompletion,
  formatPaintCompletionLine
} from './paintCompletionProbe.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const statusEntry = readFileSync(join(root, 'src/extension/status-entry.js'), 'utf8');

/**
 * ★通し検査(測る→積む→出る)。部品が緑でも受け渡しが切れれば無言で消える
 *   ([[verify-output-appears-before-shipping-2026-08-09]])。
 */
describe('描画完了計器の通し', () => {
  describe('(1) 測る: status-entry が rAF+setTimeout で挟み込む', () => {
    it('★import している', () => {
      expect(statusEntry).toMatch(
        /import\s*\{[\s\S]{0,200}?formatPaintCompletionLine[\s\S]{0,200}?\}\s*from\s*'\.\.\/lib\/paintCompletionProbe\.js'/
      );
    });

    it('★rAF の中で setTimeout(0) を張っている(描画の直後に戻る形)', () => {
      // この2段でないと style/layout/paint を挟み込めない。
      expect(statusEntry).toMatch(/requestAnimationFrame\(\(\) => \{[\s\S]{0,400}?setTimeout\(/);
    });

    it('★observePaintCompletion を呼んでいる', () => {
      expect(statusEntry).toMatch(/observePaintCompletion\(_paintProbe,/);
    });

    it('★renderAll の後に測っている(前だと意味が無い)', () => {
      const idxRender = statusEntry.indexOf("_mark('render')");
      const idxProbe = statusEntry.indexOf('observePaintCompletion(_paintProbe,');
      expect(idxRender).toBeGreaterThan(0);
      expect(idxProbe).toBeGreaterThan(idxRender);
    });
  });

  describe('(2) 積む: refreshPerf に同梱', () => {
    it('★_lastRefreshPerf に paintCompletionLine を載せている', () => {
      expect(statusEntry).toMatch(
        /_lastRefreshPerf = \{[\s\S]{0,400}?paintCompletionLine: formatPaintCompletionLine\(_paintProbe/
      );
    });

    it('★JS側の所要(totalMs)も渡している(「JSは速いが画面が遅い」を言うため)', () => {
      expect(statusEntry).toMatch(/formatPaintCompletionLine\(_paintProbe,\s*\{\s*jsMs:\s*_totalMs\s*\}\)/);
    });
  });

  describe('(3) 出る: 本文に現れる', () => {
    it('★観測があれば本文に出る', () => {
      const text = buildAiShareFullText({
        overviewText: '',
        livesData: [],
        refreshPerf: { totalMs: 6, stepMs: [], paintCompletionLine: '描画完了まで: 直近820ms' }
      });
      expect(text).toContain('描画完了まで');
      expect(text).toContain('820ms');
    });

    it('★空なら1行も出ない', () => {
      const text = buildAiShareFullText({
        overviewText: '',
        livesData: [],
        refreshPerf: { totalMs: 6, stepMs: [], paintCompletionLine: '' }
      });
      expect(text).not.toContain('描画完了まで');
    });

    it('★概要ブロックの外で出す(配信が無くても出る)', () => {
      // 会場診断が if(overviewText) の中に閉じ込められていた失敗を繰り返さない。
      const share = readFileSync(join(root, 'src/lib/aiShareFullText.js'), 'utf8');
      const idxPaint = share.indexOf('paintCompletionLine');
      const idxOverview = share.indexOf('if (overviewText) {');
      expect(idxPaint).toBeGreaterThan(0);
      expect(idxPaint).toBeLessThan(idxOverview);
    });
  });

  describe('(4) 実データで通す: 「JSは6msだが画面は遅い」が本文で読める', () => {
    it('★今回の症状そのものが1行で伝わる', () => {
      const s = createPaintProbeState();
      observePaintCompletion(s, 820);
      const line = formatPaintCompletionLine(s, { jsMs: 6 });
      const text = buildAiShareFullText({
        overviewText: '',
        livesData: [],
        refreshPerf: { totalMs: 6, stepMs: [['render', 3]], paintCompletionLine: line }
      });
      expect(text).toContain('★重いのは【画面に出すまで】です');
      expect(text).toContain('(JSは6ms)');
      expect(text).toContain('DOMを作り直しすぎている');
    });
  });
});
