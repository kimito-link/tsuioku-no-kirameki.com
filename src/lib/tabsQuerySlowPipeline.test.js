import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildAiShareFullText } from './aiShareFullText.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const statusEntry = readFileSync(join(root, 'src/extension/status-entry.js'), 'utf8');

/**
 * ★計器は「部品が緑」では足りない。受け渡しが1箇所でも切れると無言で消える
 *   ([[verify-output-appears-before-shipping-2026-08-09]]・v0.1.1295 で実際にやらかした)。
 *   ここでは【測る→積む→本文に出る】の通しを断言する。
 */
describe('tabs.query 遅延計器の通し(測る→積む→本文に出る)', () => {
  describe('(1) 測る: status-entry が実際に計測している', () => {
    it('★tabs.query の前後で時刻を取っている', () => {
      expect(statusEntry).toMatch(/const _tq0 = /);
      expect(statusEntry).toMatch(/const _tqMs = /);
    });

    it('★閾値を超えたら記録する分岐がある', () => {
      expect(statusEntry).toMatch(/if \(_tqMs >= 1000\)/);
      expect(statusEntry).toMatch(/_tabsQuerySlowDiag\.count \+= 1/);
    });

    it('★最悪値を更新している(1回だけの記録で上書きしない)', () => {
      expect(statusEntry).toMatch(/_tabsQuerySlowDiag\.worstMs/);
    });
  });

  describe('(2) 積む: refreshPerf に同梱している', () => {
    it('★_lastRefreshPerf に tabsQuerySlow を載せている', () => {
      // ここが切れると本文まで届かない(計器が無言で消える典型)。
      expect(statusEntry).toMatch(
        /_lastRefreshPerf = \{[\s\S]{0,200}?tabsQuerySlow:\s*\{\s*\.\.\._tabsQuerySlowDiag\s*\}/
      );
    });
  });

  describe('(3) 出る: 本文に実際に現れる', () => {
    it('★遅延ありの refreshPerf を渡すと本文に行が出る', () => {
      const text = buildAiShareFullText({
        overviewText: '',
        livesData: [],
        refreshPerf: {
          totalMs: 9812,
          stepMs: [['lives', 5493]],
          tabsQuerySlow: { count: 2, worstMs: 5493, lastMs: 5493, lastTabCount: 1 }
        }
      });
      expect(text).toContain('タブ一覧の取得が遅い');
      expect(text).toContain('最悪 5493ms');
      expect(text).toContain('ブラウザ側の応答待ち');
    });

    it('★遅延なしなら本文に1行も出ない(普段を汚さない)', () => {
      const text = buildAiShareFullText({
        overviewText: '',
        livesData: [],
        refreshPerf: {
          totalMs: 374,
          stepMs: [['backfill', 214]],
          tabsQuerySlow: { count: 0, worstMs: 0, lastMs: 0, lastTabCount: -1 }
        }
      });
      expect(text).not.toContain('タブ一覧の取得が遅い');
    });

    it('★計器そのものが無い古い形でも本文が壊れない', () => {
      const text = buildAiShareFullText({
        overviewText: '',
        livesData: [],
        refreshPerf: { totalMs: 100, stepMs: [] }
      });
      expect(typeof text).toBe('string');
      expect(text).not.toContain('タブ一覧の取得が遅い');
    });
  });
});
