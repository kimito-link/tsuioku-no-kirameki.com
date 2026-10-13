import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 2026-10-13(「POPと会場が完全一致しない」の真因): 同じ人が複数の段に居る(例: りんく段と広告段)と、
 *   会場の席は1人1つなのに wrapTileEl が段ごとに同じ席の要素を自分の段へ移し、先の段のタイルが消えていた
 *   (実機: 重複7 = DOM欠 7 / 再現環境: 重複5 = DOM欠 5)。席の持ち主を【段の並び順で最初の1か所】に決め、
 *   持ち主以外の段には席に包まない素のタイルを置く。持ち主の段が前回と変わった席は前後の段を作り直させる。
 */
const src = fs.readFileSync(path.resolve('src/extension/venueBar.js'), 'utf8').split('\r\n').join('\n');
const render = fs.readFileSync(path.resolve('src/extension/story/renderStoryUserLaneDom.js'), 'utf8').split('\r\n').join('\n');

describe('会場: 重複する人の席の持ち主', () => {
  const i = src.indexOf('const seatOwnerItem = new Map();');
  const body = src.slice(i - 300, i + 3400);

  it('★席の持ち主を段の並び順(link→gift→ad→konta→tanu)で最初の1か所に決める', () => {
    expect(body).toMatch(/for \(const tierName of \['link', 'gift', 'ad', 'konta', 'tanu'\]\)/);
    expect(body).toMatch(/!seatOwnerItem\.has\(si\)/);
    expect(body).toMatch(/seatOwnerItem\.set\(si, it\);/);
  });

  it('★持ち主ではない段は席に包まない素のタイルを返す(席の要素を奪わない)', () => {
    expect(body).toMatch(/if \(seatOwnerItem\.has\(seatIndexRaw\) && seatOwnerItem\.get\(seatIndexRaw\) !== item\) return tileEl;/);
    // その判定は席への包み込み(replaceChildren)より前にある
    const a = body.indexOf('seatOwnerItem.get(seatIndexRaw) !== item');
    const b = body.indexOf('node.seat.replaceChildren(tileEl);');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });

  it('★持ち主の段が前回と変わった席は、前の段と新しい段を次の描画で作り直させる', () => {
    expect(body).toMatch(/if \(tierPrev && tierPrev !== tierNow\) \{/);
    expect(body).toMatch(/invalidateStoryUserLaneTierKey\(\/\*\* @type \{any\} \*\/ \(_laneElByTier\)\[tierPrev\]\);/);
    expect(body).toMatch(/invalidateStoryUserLaneTierKey\(\/\*\* @type \{any\} \*\/ \(_laneElByTier\)\[tierNow\]\);/);
    expect(body).toMatch(/_seatOwnerTierPrev = seatOwnerTier;/);
  });

  it('★段の貼り替え判定を無効化する口が render 側から export されている', () => {
    expect(render).toMatch(/export function invalidateStoryUserLaneTierKey\(laneEl\) \{\n {2}if \(laneEl\) _laneTierLastKey\.delete\(laneEl\);\n\}/);
    expect(src).toMatch(/invalidateStoryUserLaneTierKey,\n {2}paintStoryUserLaneDomFilled,/);
  });
});
