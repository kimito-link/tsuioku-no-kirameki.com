// laneTileHistoryUsesDom.wiring.test.js
// ★「候補数」ではなく「実際に画面に出ている枚数」を積んでいることを固定する。
//
// ■ 実機で起きたこと(2026-08-12・v0.1.1355 で私が入れた計器が嘘をついた)
//   同じ状態速報の中に、両立しない2つの記述が同居した:
//     レーンの人数 ✅ 増え続けている(0→67枚・観測3回)
//     ★タイルが減った直前の供給元: light_summary(暫定) 13枚→8枚
//     shrinkObservedCount: 2 / shrinkDetectedCount: 2
//
// ■ 真因
//   _laneTileHistory に積んでいたのは nextTileCount(=これから描こうとしている候補数)。
//   しかし縮小ガード(_shrinkGuardHit)が立つと【描かずに return】するので画面は前のまま。
//   ＝候補を積むと「実際には減っていないのに減った」/「減ったのに増えたまま」になる。
//   ★主張(画面の増減)と測定対象(候補数)がずれていた
//     ([[measure-the-region-you-claim-2026-08-10]] と同型)。
//   ★報告内の矛盾は判定の穴のサイン([[instrument-can-name-the-wrong-culprit-2026-08-10]])。
//
// ■ 直し(2つ)
//   1. ガードで描かない回は countStoryUserLaneDomTiles(els)(=今の画面)を積む
//   2. 要約は実DOM起点の縮小観測(laneSupplyOriginDiag)を優先する=2つの計器が矛盾しない

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(HERE, '../extension/popup-entry.js'), 'utf8');

describe('★タイル履歴は「実際に描いた枚数」を積む', () => {
  it('ガードで描かない回は実DOMの枚数を積む(候補数で埋めない)', () => {
    const idx = src.indexOf('_laneTileHistory = pushLaneTileSample(');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 400);
    // 三項で「ガード時は実DOM / それ以外は候補」を選んでいること。
    expect(block).toContain('_shrinkGuardHit ? countStoryUserLaneDomTiles(els) : nextTileCount');
  });

  it('★要約に実DOM起点の縮小観測を渡している(2つの計器が矛盾しない)', () => {
    const idx = src.indexOf('summarizeLaneTileOscillation(_laneTileHistory');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 300);
    expect(block).toContain('domShrinkCount');
    expect(block).toContain('shrinkObservedCount');
    expect(block).toContain('domShrinkCulprit');
    expect(block).toContain('shrinkCulprit');
  });

  it('縮小の現行犯記録は実DOMと比較している(こちらは元から正しい=退行させない)', () => {
    const idx = src.indexOf('noteLaneSupplyShrink(_laneSupplyOriginDiag');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 300);
    expect(block).toContain('prevTiles: countStoryUserLaneDomTiles(els)');
  });
});
