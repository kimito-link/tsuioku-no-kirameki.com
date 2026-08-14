/**
 * ★v0.1.1394: メインスレッド計器が【実際に観測している】ことを固定する。
 *   v0.1.1390 では集計関数を作っただけで誰も呼んでおらず、永久に0件だった
 *   ([[counting-is-not-fixing-2026-08-13]])。観測→速報→セルの3点を検査する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildHealthCells } from './healthCells.js';

const here = dirname(fileURLToPath(import.meta.url));
const boot = readFileSync(join(here, 'mainThreadBlockerBoot.js'), 'utf8');
const entry = readFileSync(join(here, '../extension/popup-entry.js'), 'utf8');

describe('メインスレッド計器の配線', () => {
  it('★実際に観測している(PerformanceObserver で longtask を拾う)', () => {
    expect(boot).toContain('PerformanceObserver');
    expect(boot).toContain("'longtask'");
    expect(boot).toContain('noteBlocker');
  });

  it('★起動前の長時間タスクも拾う(黒は起動直後に起きるため)', () => {
    expect(boot).toContain('buffered: true');
  });

  it('★可視復帰からの経過を付ける(スリープ→戻ると黒 の検証用)', () => {
    expect(boot).toContain('visibilitychange');
    expect(boot).toContain('sinceVisibleMs');
  });

  it('速報(popup診断)に載る', () => {
    expect(entry).toContain('mainThreadBlocker');
  });

  it('★観測値があればセルが出る(通し確認)', () => {
    const cells = buildHealthCells({
      livesData: [{ recording: true }],
      nowMs: Date.now(),
      mainThreadBlocker: { count: 2, worstMs: 1806, worstName: 'grid-rebuild' }
    });
    const c = cells.find((x) => x.id === 'main-thread');
    expect(c).toBeTruthy();
    expect(c.text).toContain('grid-rebuild');
    expect(c.level).toBe('bad');
  });

  it('観測ゼロならセルを出さない(使っていない機能を赤くしない)', () => {
    const cells = buildHealthCells({ livesData: [], nowMs: Date.now() });
    expect(cells.find((x) => x.id === 'main-thread')).toBeUndefined();
  });
});
