import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * タイル 3 行目(🎁📣💬・v0.1.1562〜)の「配線忘れ=CI赤」ガード。
 *   純関数を作っても popup に配線しなければ【黙って出ない】。特に「描かない 3 経路」は
 *   paint を通らないので、vitest のレンダラテストでは捕まらない(実機でだけ件数が更新されない)。
 *   ここは実行時 DOM 不要の文字列スキャン(venueLaneParity.wiring.test.js と同型)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// CRLF 正規化(アンカー付き regex は改行を跨ぐ。しないと素通り/常に赤になる)。
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const popupSrc = read('src/extension/popup-entry.js');
const venueBarSrc = read('src/extension/venueBar.js');
const rendererSrc = read('src/extension/story/renderStoryUserLaneDom.js');
const sigSrc = read('src/lib/storyUserLaneRenderSignature.js');
const sceneSrc = read('src/lib/laneSceneEnvelope.js');
const paritySrc = read('src/lib/venueLaneParity.js');
const popupHtml = read('extension/popup.html');
const liveViewHtml = read('app/live-view.html');

const count = (src, needle) => src.split(needle).length - 1;

describe('タイル stats の配線(popup-entry)', () => {
  it('attachLaneTileStats は publishLaneMirror({ より前にある(鏡に stats を載せるため)', () => {
    const iAttach = popupSrc.indexOf('attachLaneTileStats(');
    const iPublish = popupSrc.indexOf('publishLaneMirror({');
    expect(iAttach).toBeGreaterThan(0);
    expect(iPublish).toBeGreaterThan(0);
    expect(iAttach).toBeLessThan(iPublish);
  });

  it('描かない 3 経路(sig 一致 / 縮小ガード / 鏡 skip)に syncStoryUserLaneStatsInPlace が 1 つずつある', () => {
    // 呼び出し件数で固定(import 行の 1 件は除く)。1 つ消えるとここが 2 になって赤になる。
    expect(count(popupSrc, 'syncStoryUserLaneStatsInPlace(els')).toBe(3);
    const sigMatch = popupSrc.indexOf('if (laneSig === storyUserLaneLastRenderSig) {');
    expect(sigMatch).toBeGreaterThan(0);
    expect(popupSrc.slice(sigMatch, sigMatch + 1200)).toContain('syncStoryUserLaneStatsInPlace(els');
    const shrink = popupSrc.indexOf('if (_shrinkGuardHit) {');
    expect(shrink).toBeGreaterThan(0);
    expect(popupSrc.slice(shrink, shrink + 800)).toContain('syncStoryUserLaneStatsInPlace(els');
    const passive = popupSrc.indexOf('if (sig === _laneMirrorPassiveSig) {');
    expect(passive).toBeGreaterThan(0);
    expect(popupSrc.slice(passive, passive + 600)).toContain('syncStoryUserLaneStatsInPlace(els');
  });

  it('paint と鏡 publish には stats 付き buckets を渡す', () => {
    expect(popupSrc).toMatch(/publishLaneMirror\(\{\n\s+liveId,\n\s+buckets: bucketsWithStats,/);
    expect(popupSrc).toMatch(/paintStoryUserLaneDomFilled\(els, faces, bucketsWithStats,/);
  });

  it('laneTileStats.js を import し、liveMotion.js は popup に import しない(bundle 肥大防止)', () => {
    expect(popupSrc).toMatch(/from '\.\.\/lib\/laneTileStats\.js'/);
    expect(popupSrc).not.toMatch(/from '\.\.\/lib\/liveMotion\.js'/);
  });
});

describe('venueBar は第二の計算経路を持たない', () => {
  it('venueBar.js は laneTileStats / laneHeatTracker を import しない(値は鏡を読むだけ)', () => {
    expect(venueBarSrc).not.toMatch(/laneTileStats/);
    expect(venueBarSrc).not.toMatch(/laneHeatTracker/);
  });

  it('LANE_CSS_SYNC 区間内に stats / legend の規則とトークンがある', () => {
    const begin = venueBarSrc.indexOf('/* LANE_CSS_SYNC_BEGIN');
    const end = venueBarSrc.indexOf('/* LANE_CSS_SYNC_END */');
    expect(begin).toBeGreaterThanOrEqual(0);
    const sync = venueBarSrc.slice(begin, end);
    expect(sync).toContain('.nl-story-userlane-meta[data-stats]::after');
    expect(sync).toContain('.nl-story-userlane-guide__legend');
    // 会場は --nl-* を自前で持つ。トークンを足し忘れると var() が無効で文字が消える。
    expect(venueBarSrc).toContain('--nl-lane-stats:');
  });
});

describe('CSS の 3 コピー(popup.html / venueBar.js / app/live-view.html)', () => {
  for (const [name, src] of [['popup.html', popupHtml], ['app/live-view.html', liveViewHtml]]) {
    it(`${name} に stats の規則・脚注・トークン(light/dark)がある`, () => {
      expect(src).toContain('.nl-story-userlane-meta[data-stats]::after');
      expect(src).toContain('.nl-story-userlane-guide__legend');
      expect(count(src, '--nl-lane-stats:')).toBeGreaterThanOrEqual(2);
    });
  }
});

describe('鍵を揺らさない(ちらつき対策 6 版の保護)', () => {
  it('storyLaneTierBodyKey の本体に stats / pulse が入っていない', () => {
    const i = rendererSrc.indexOf('function storyLaneTierBodyKey(');
    expect(i).toBeGreaterThan(0);
    const body = rendererSrc.slice(i, rendererSrc.indexOf('\n}\n', i));
    expect(body).not.toMatch(/stats|pulse/i);
  });

  it('描画署名・scene hash・parity key に stats / pulse が入っていない', () => {
    expect(sigSrc).not.toMatch(/\bstats\b|\bpulse\b/);
    expect(sceneSrc).not.toMatch(/\bstats\b|\bpulse\b/);
    expect(paritySrc).not.toMatch(/\bstats\b|\bpulse\b/);
  });
});
