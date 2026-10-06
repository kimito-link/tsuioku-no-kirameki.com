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

describe('識別絵(匿名の identicon)は点線枠(v0.1.1564・/live/ の視覚言語)', () => {
  const ruleBody = (src, selectorRe) => {
    const m = selectorRe.exec(src);
    expect(m, `規則が見つからない: ${selectorRe}`).not.toBeNull();
    return src.slice(m.index, src.indexOf('}', m.index));
  };
  it('popup.html の [data-thumb="0"] アバター規則に border-style: dashed がある(寸法は書かない)', () => {
    const body = ruleBody(popupHtml, /\.nl-story-userlane-cell\[data-thumb="0"\] \.nl-story-userlane-avatar \{/);
    expect(body).toContain('border-style: dashed;');
  });
  it('venueBar.js の LANE_CSS_SYNC 区間の同規則にも border-style: dashed がある', () => {
    const begin = venueBarSrc.indexOf('/* LANE_CSS_SYNC_BEGIN');
    const end = venueBarSrc.indexOf('/* LANE_CSS_SYNC_END */');
    const sync = venueBarSrc.slice(begin, end);
    const body = ruleBody(sync, /\.nlsb-venue-lane-stack \.nl-story-userlane-cell\[data-thumb="0"\] \.nl-story-userlane-avatar \{/);
    expect(body).toContain('border-style: dashed;');
  });
});

describe('ギフト増分バッジの配線(v0.1.1565)', () => {
  it('popup が createGiftPulseRegistry(既存 liveGiftPulse.js)で標本間差分を取り、鏡 publish の前に attach する', () => {
    expect(popupSrc).toMatch(/from '\.\.\/lib\/liveGiftPulse\.js'/);
    expect(popupSrc).toContain('createGiftPulseRegistry(');
    const iAttach = popupSrc.indexOf('attachLaneTilePulse(');
    const iPublish = popupSrc.indexOf('publishLaneMirror({');
    expect(iAttach).toBeGreaterThan(0);
    expect(iAttach).toBeLessThan(iPublish);
  });

  it('標本時刻は koken storage の capturedAt を控える(新しい storage read を足さない)', () => {
    const iRead = popupSrc.indexOf('await readCardCapturedAtMs(kokenContribStorageKey(');
    expect(iRead).toBeGreaterThan(0);
    expect(popupSrc.slice(iRead - 200, iRead + 600)).toContain('_kokenRowsCapturedAtMs =');
  });

  for (const [name, getSrc] of [
    ['popup.html', () => popupHtml],
    ['app/live-view.html', () => liveViewHtml],
    ['venueBar.js(LANE_CSS_SYNC 区間)', () => venueBarSrc.slice(venueBarSrc.indexOf('/* LANE_CSS_SYNC_BEGIN'), venueBarSrc.indexOf('/* LANE_CSS_SYNC_END */'))]
  ]) {
    it(`${name} に pulse の規則・アニメ・reduced-motion 無効化がある`, () => {
      const src = getSrc();
      expect(src).toContain('.nl-story-userlane-cell[data-pulse]::after');
      expect(src).toContain('.nl-story-userlane-cell.is-gifted');
      expect(src).toContain('@keyframes nl-lane-pulse-pop');
      expect(src).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*is-gifted[^}]*animation: none/);
    });
  }

  it('トークン --nl-lane-pulse-gift が popup.html / live-view に 2 つ(light/dark)・venueBar に 1 つ', () => {
    expect(count(popupHtml, '--nl-lane-pulse-gift:')).toBeGreaterThanOrEqual(2);
    expect(count(liveViewHtml, '--nl-lane-pulse-gift:')).toBeGreaterThanOrEqual(2);
    expect(venueBarSrc).toContain('--nl-lane-pulse-gift:');
  });
});

describe('熱い人バッジの配線(v0.1.1566)', () => {
  it('popup は createLaneHeatTracker を使い、鏡 publish の前(withLaneTileStats 内)で observe する', () => {
    expect(popupSrc).toMatch(/from '\.\.\/lib\/laneHeatTracker\.js'/);
    const iObs = popupSrc.indexOf('_laneHeat.observe(');
    expect(iObs).toBeGreaterThan(0);
    expect(iObs).toBeLessThan(popupSrc.indexOf('publishLaneMirror({'));
  });

  it('laneHeatTracker は葉の commentDeltaTier だけを読み、liveMotion.js(liveRankingView.js を連れてくる)を読まない', () => {
    const heatSrc = read('src/lib/laneHeatTracker.js');
    expect(heatSrc).toMatch(/from '\.\/commentDeltaTier\.js'/);
    expect(heatSrc).not.toMatch(/liveMotion/);
    expect(read('src/lib/commentDeltaTier.js')).not.toMatch(/^import /m);
  });

  it('venueBar は heat を計算しない(laneHeatTracker を import しない)', () => {
    expect(venueBarSrc).not.toMatch(/laneHeatTracker|_laneHeat/);
  });

  for (const [name, getSrc] of [
    ['popup.html', () => popupHtml],
    ['app/live-view.html', () => liveViewHtml],
    ['venueBar.js(LANE_CSS_SYNC 区間)', () => venueBarSrc.slice(venueBarSrc.indexOf('/* LANE_CSS_SYNC_BEGIN'), venueBarSrc.indexOf('/* LANE_CSS_SYNC_END */'))]
  ]) {
    it(`${name} に is-hot の規則と reduced-motion 無効化がある`, () => {
      const src = getSrc();
      expect(src).toContain('.nl-story-userlane-cell.is-hot');
      expect(src).toContain('.is-hot[data-pulse]::after');
      expect(src).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*is-hot[^}]*animation: none/);
    });
  }

  it('トークン --nl-lane-pulse-hot が popup.html / live-view に 2 つ(light/dark)・venueBar に 1 つ', () => {
    expect(count(popupHtml, '--nl-lane-pulse-hot:')).toBeGreaterThanOrEqual(2);
    expect(count(liveViewHtml, '--nl-lane-pulse-hot:')).toBeGreaterThanOrEqual(2);
    expect(venueBarSrc).toContain('--nl-lane-pulse-hot:');
  });
});

describe('公式コメント速度 +N/分 の配線(v0.1.1567)', () => {
  it('popup が officialCommentRate を使い、paintOfficialNicoStatsStrip で標本を積んでチップに出す', () => {
    expect(popupSrc).toMatch(/from '\.\.\/lib\/officialCommentRate\.js'/);
    const i = popupSrc.indexOf('function paintOfficialNicoStatsStrip(');
    expect(i).toBeGreaterThan(0);
    const body = popupSrc.slice(i, popupSrc.indexOf('\n}\n', i));
    expect(body).toContain('_officialCommentRate.push(');
    expect(body).toContain("'officialStatNicoCommentsRate'");
    expect(body).toContain('formatCommentRate(');
    // 配信が変わったら標本を捨てる(別配信の件数との差を速度にしない)
    expect(body).toContain('rateLid !== _officialCommentRateLid');
    expect(body).toContain('_officialCommentRate.reset(); // 別配信の件数との差を速度にしない');
  });

  for (const [name, src] of [['popup.html', popupHtml], ['app/live-view.html', liveViewHtml]]) {
    it(`${name}: 本家コメの値の直後にレート用 span があり、CSS がある`, () => {
      expect(src).toMatch(/id="officialStatNicoComments">[^<]*<\/span>\s*<span class="nl-official-nico-stats__rate is-placeholder" id="officialStatNicoCommentsRate" aria-live="off"><\/span>/);
      expect(src).toContain('.nl-official-nico-stats__rate {');
      expect(src).toContain('.nl-official-nico-stats__rate.is-placeholder {');
    });
  }

  it('officialNicoStatsStripDigest.js は触っていない(stableKey/summaryText を固定するテストが無傷)', () => {
    expect(read('src/lib/officialNicoStatsStripDigest.js')).not.toMatch(/Rate|rate/);
  });
});
