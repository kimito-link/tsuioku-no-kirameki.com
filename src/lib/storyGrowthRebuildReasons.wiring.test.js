import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * v0.1.1875: 応援マスを全部作り直す入口は、どれも入口名を計器に渡す(数え漏れ=原因を見落とす)。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const src = strip(read('src/extension/popup-entry.js'));
const bodyOf = (name) => {
  const a = src.indexOf(`function ${name}(`);
  return src.slice(a, src.indexOf('\n}\n', a));
};

describe('応援マスの作り直しの入口別計器の配線', () => {
  it('rebuildStoryGrowth の呼び出しはすべて入口名を渡す', () => {
    const calls = [...bodyOf('syncStoryGrowth').matchAll(/rebuildStoryGrowth\(([^)]*)\)/g), ...bodyOf('patchStoryGrowthIconsFromSource').matchAll(/rebuildStoryGrowth\(([^)]*)\)/g)];
    expect(calls.length).toBe(3);
    for (const c of calls) expect(c[1]).toMatch(/STORY_GROWTH_REBUILD_REASON\.(SHRINK|GROW_FULL|DOM_MISMATCH)/);
  });
  it('配信切替・空にする経路も記録し、目標件数を毎回控える', () => {
    const b = bodyOf('syncStoryGrowth');
    expect(b).toContain('STORY_GROWTH_REBUILD_REASON.LIVE');
    expect(b).toContain('STORY_GROWTH_REBUILD_REASON.EMPTY');
    expect(b).toContain('noteStoryGrowthTarget(');
  });
  it('rebuildStoryGrowth は入口名があれば記録し、補足欄はちらつき計へ書く', () => {
    expect(bodyOf('rebuildStoryGrowth')).toMatch(/if \(reason\) noteStoryGrowthRebuildAndPublish\(reason/);
    expect(bodyOf('noteStoryGrowthRebuildAndPublish')).toContain('__nlsFlickerMeter?.meter');
  });
});
