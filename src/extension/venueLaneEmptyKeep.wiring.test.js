/**
 * venueLaneEmptyKeep.wiring — 会場の応援レーンが「同一配信の一瞬空」で席を畳まない配線を固定する。
 *
 * 背景(v0.1.1534): ①popup には空keepガード shouldKeepStoryUserLaneTilesOnEmpty があるが、
 *   会場(venueBar.js)には未移植で、visibleLaneItems.length===0 で無条件に
 *   resetStoryUserLaneDom していた=「席が出たり消えたり」の根治漏れ。
 *   ガード本体の真偽ロジックは renderStoryUserLaneDom.test.js が全数固定済みなので、
 *   ここでは【venueBar が本当にガードを配線しているか】(呼び出し・記録・切替クリア)を
 *   ソース走査で固定する。関数を移動しても壊れないよう、緩すぎない anchor で断言する。
 *
 * ★恒真回避: 本文が取れなければ throw(空文字で素通しにしない)。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const venueSrc = fs.readFileSync(path.join(here, 'venueBar.js'), 'utf8');

describe('venueLaneEmptyKeep.wiring（会場の空keepガード配線）', () => {
  it('venueBar が shouldKeepStoryUserLaneTilesOnEmpty を import している', () => {
    expect(venueSrc).toMatch(/import\s*\{[^}]*shouldKeepStoryUserLaneTilesOnEmpty[^}]*\}\s*from\s*['"]\.\/story\/renderStoryUserLaneDom\.js['"]/s);
  });

  it('空(visibleLaneItems.length===0)の分岐でガードを呼び、keep 時は reset しない', () => {
    // 空分岐の入口から reset までの範囲を切り出す
    const idx = venueSrc.indexOf('if (visibleLaneItems.length === 0) {');
    expect(idx).toBeGreaterThan(-1);
    const block = venueSrc.slice(idx, idx + 900);
    // ガードを呼んでいる
    expect(block).toMatch(/shouldKeepStoryUserLaneTilesOnEmpty\(/);
    // 判定入力に会場の lastTiled 状態変数と activeLiveId を渡している
    expect(block).toMatch(/_venueStoryUserLaneLastTiledLid/);
    expect(block).toMatch(/activeLiveId/);
    // keep のときは reset を回避する分岐がある(else 側にだけ resetStoryUserLaneDom)
    expect(block).toMatch(/if\s*\(\s*keepOnEmpty\s*\)\s*\{/);
    expect(block).toMatch(/\}\s*else\s*\{[\s\S]*?resetStoryUserLaneDom\(venueLaneEls\)/);
  });

  it('実タイルを描いたら lastTiled に activeLiveId を記録する(①popup と対称)', () => {
    expect(venueSrc).toMatch(/_venueStoryUserLaneLastTiledLid\s*=\s*String\(activeLiveId\b[^;]*\)\.trim\(\)\.toLowerCase\(\);/);
  });

  it('配信切替(activeLiveId !== liveId)のリセットで lastTiled をクリアする', () => {
    const idx = venueSrc.indexOf('if (activeLiveId !== liveId) {');
    expect(idx).toBeGreaterThan(-1);
    const block = venueSrc.slice(idx, idx + 1200);
    expect(block).toMatch(/_venueStoryUserLaneLastTiledLid\s*=\s*''\s*;/);
  });

  it('lastTiled 状態変数が宣言されている(初期値は空文字)', () => {
    expect(venueSrc).toMatch(/let\s+_venueStoryUserLaneLastTiledLid\s*=\s*''\s*;/);
  });
});
