import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v0.1.1115 ①POP遮蔽(会場open中だけ①POPホストを畳む)の「配線忘れ=CI赤」ガード。
 *   設計正本 reference_venue_pop_copy_SYNTHESIS.md §C-1。venueBar.js は content script で
 *   vitest から import できないため、ソース文字列スキャンで配線の実在と地雷回避を断言する
 *   (venueLaneParity.wiring.test.js と同型)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const venueBarSrc = read('src/extension/venueBar.js');
const contentEntrySrc = read('src/extension/content-entry.js');

describe('①POP遮蔽(v0.1.1115)の配線', () => {
  it('VENUE_CSS に会場open中の①POPホスト遮蔽ルールがある(visibility方式)', () => {
    expect(venueBarSrc).toMatch(/html\.nlsb-venue-open #nls-inline-popup-host/);
    expect(venueBarSrc).toMatch(/visibility: hidden !important/);
  });

  it('★地雷: 遮蔽は display:none を使わない(iframe描画停止→鏡publish死=会場fallback降格)', () => {
    const ruleStart = venueBarSrc.indexOf('html.nlsb-venue-open #nls-inline-popup-host');
    expect(ruleStart).toBeGreaterThan(-1);
    const ruleBody = venueBarSrc.slice(ruleStart, venueBarSrc.indexOf('}', ruleStart));
    expect(ruleBody).not.toMatch(/display\s*:\s*none/);
  });

  it('setOpen が documentElement へ nlsb-venue-open を toggle する(open→close 往復で残骸ゼロ)', () => {
    expect(venueBarSrc).toMatch(/documentElement\.classList\.toggle\('nlsb-venue-open', open\)/);
  });

  it('ホストIDの契約: content-entry の INLINE_POPUP_HOST_ID と CSS セレクタが同一文字列', () => {
    // venueBar は content-entry から import できない(別バンドル)ため文字列参照。
    //   content-entry 側で ID を変えたらこのテストが赤=黙った drift を防ぐ。
    const m = contentEntrySrc.match(/INLINE_POPUP_HOST_ID = '([^']+)'/);
    expect(m).not.toBeNull();
    expect(venueBarSrc).toContain(`#${m[1]} {`);
  });
});
