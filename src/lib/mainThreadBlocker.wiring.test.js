/**
 * ★v0.1.1398: メインスレッド計器が【実際に観測できる方式か】を固定する。
 *
 * ■ 実機で起きた失敗(2026-08-14)
 *   同じ速報に `最大タイマー遅延=1354ms 🔴イベントループ停止` と
 *   `mainThreadBlocker: count 0` が並んだ。
 *   longtask はトップレベル文書にしか配送されず、①POPは iframe なので
 *   **原理的に何も受け取れなかった**。observe を書いた=測れている、ではない。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildHealthCells } from './healthCells.js';

const here = dirname(fileURLToPath(import.meta.url));
const boot = readFileSync(join(here, 'mainThreadBlockerBoot.js'), 'utf8');
const entry = readFileSync(join(here, '../extension/popup-entry.js'), 'utf8');

/** コメント行を落として「実際のコード」だけにする。 */
function codeOnly(src) {
  return src.split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
}

describe('メインスレッド計器の配線', () => {
  it('★同じフレーム内で測る(iframe でも効く方式)', () => {
    expect(boot).toContain('setTimeout');
    expect(boot).toContain('noteBlocker');
  });

  it('★longtask/PerformanceObserver には依存しない(iframe に届かない)', () => {
    const code = codeOnly(boot);
    expect(code).not.toContain('longtask');
    expect(code).not.toContain('PerformanceObserver');
  });

  it('★hidden 中の間引きは「止まった」と数えない(正常動作を異常にしない)', () => {
    expect(boot).toContain('document.hidden');
  });

  it('★区間名で犯人を出せる(囲っていなければ「拡張の外」)', () => {
    expect(boot).toContain('markBlockerSection');
    expect(boot).toContain('(拡張の外)');
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
      mainThreadBlocker: { count: 2, worstMs: 1354, worstName: 'grid-rebuild' }
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
