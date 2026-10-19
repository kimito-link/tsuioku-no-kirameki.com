import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 応援レーンのタイルが、合成済みの顔(PNG)を最初から出す配線(v0.1.1685)。
 *   外れると、レーンを描き直すたびに全タイルが「SVG の仮の顔 → 顔(PNG)」へ差し替わる(ちらつき)に戻る。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('レーンのタイルは出せる顔を最初から出す', () => {
  const popup = strip(read('src/extension/popup-entry.js'));
  const tile = strip(read('src/lib/personTileDom.js'));

  it('★popup のレーン描画(3経路)すべてが cachedAnonymousFace を注入している', () => {
    const uses = popup.match(/const laneDomIo = \{[^}]*cachedAnonymousFace[^}]*\};/g) || [];
    expect(uses.length).toBe(3);
    // 注入しない laneDomIo が残っていない(会場は別ファイルで、意図して注入しない)
    const all = popup.match(/const laneDomIo = \{[^}]*\};/g) || [];
    expect(all.length).toBe(3);
  });

  it('★personTileDom: 匿名の仮の顔(SVG)が要求されたときだけ、キャッシュの顔を最初の src にする', () => {
    expect(tile).toMatch(/requestedLane\.startsWith\('data:image\/svg\+xml'\)\s*&&\s*typeof io\.cachedAnonymousFace === 'function'/);
    expect(tile).toMatch(/img\.src = cachedFace \|\| displayLane;/);
  });

  it('★会場は顔を注入しない(SVG のまま=従来どおり)', () => {
    expect(strip(read('src/extension/venueBar.js'))).not.toContain('cachedAnonymousFace');
  });
});
