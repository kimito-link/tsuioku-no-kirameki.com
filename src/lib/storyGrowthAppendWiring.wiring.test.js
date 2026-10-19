import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 応援マスが増えたとき、syncStoryGrowth は条件が揃えば appendStoryGrowthCells(増えた分だけ足す)を通る(v0.1.1689)。
 *   rebuildStoryGrowth を無条件に呼ぶと、新コメ1件ごとに全マスの <img> が新品になり、合成済みの顔が仮の顔に戻る。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const src = strip(read('src/extension/popup-entry.js'));

describe('syncStoryGrowth は増えた分だけ足す経路を通る', () => {
  const a = src.indexOf('function syncStoryGrowth(');
  const body = src.slice(a, src.indexOf('\n}\n', a));
  it('★判定部品を import している', () => {
    expect(src).toContain("from '../lib/storyGrowthAppendPlan.js'");
  });
  it('★「足りないとき」の分岐は canAppendStoryGrowthCells で分かれ、足す側は appendStoryGrowthCells を呼ぶ', () => {
    expect(body).toMatch(/if \(canAppendStoryGrowthCells\(/);
    expect(body).toContain('appendStoryGrowthCells(root, rnd, tgt)');
    expect(body).toMatch(/else rebuildStoryGrowth\(root, tgt\);/);
  });
  it('★足りないときに無条件で rebuildStoryGrowth(root, tgt) を呼ぶ形が残っていない', () => {
    // rebuildStoryGrowth(root, tgt) は else の1か所だけ(縮小・切替の rebuild は別の引数)
    const calls = body.match(/rebuildStoryGrowth\(root, tgt\)/g) || [];
    expect(calls.length).toBe(1);
  });
  it('★足す関数は既存のマスを消さない(innerHTML を触らない)', () => {
    const f = src.indexOf('function appendStoryGrowthCells(');
    const fb = src.slice(f, src.indexOf('\n}\n', f));
    expect(fb).not.toMatch(/innerHTML|replaceChildren|\.remove\(/);
    expect(fb).toContain('root.appendChild(frag)');
  });
});
