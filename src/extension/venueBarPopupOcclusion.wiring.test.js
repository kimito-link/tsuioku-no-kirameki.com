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

describe('見た目①化(v0.1.1119)のCSS', () => {
  it('段配下のVIP金縁と連鎖発光が無効化されている(①のレーンと同じ見た目)', () => {
    expect(venueBarSrc).toMatch(
      /\.nlsb-venue-lane-stack \.nlsb-seat\.nlsb-seat-vip \.nl-story-userlane-avatar \{[^}]*box-shadow: none/
    );
    expect(venueBarSrc).toMatch(
      /\.nlsb-venue-lane-stack \.nlsb-seat\[data-streak\] \.nl-story-userlane-avatar \{[^}]*animation: none/
    );
  });

  it('順位バッジ(🥇🥈🥉)と発話の一拍(speaking)は残す(既存ユーザー指示)', () => {
    expect(venueBarSrc).toContain("[data-venue-rank='1']::after { content: '🥇'; }");
    expect(venueBarSrc).toMatch(/nlsb-seat-speaking \.nl-story-userlane-avatar \{\s*animation: nlsb-seat-speak/);
  });

  it('surfaceは段行単位のみ(v0.1.1121: stack全面surface=白い大パネルの再発防止)', () => {
    // stack 全面に background を敷くルールが復活したらCI赤(下端55vhバンド白面化の再発)。
    expect(venueBarSrc).not.toMatch(
      /\.nlsb-venue-lane-stack\.nl-story-userlane-stack \{[^}]*background/
    );
    expect(venueBarSrc).toMatch(
      /\.nlsb-venue-lane-stack \.nl-story-userlane \{\s*background: var\(--nl-surface\)/
    );
    // gift/ad wrap(金色surface持ち)配下は入れ子カード防止で除外。
    expect(venueBarSrc).toMatch(
      /\.nlsb-venue-lane-stack \.nl-story-userlane-tier-wrap--gift \.nl-story-userlane \{\s*background: none/
    );
    expect(venueBarSrc).toMatch(/\.nlsb-lobby \{\s*background: var\(--nl-surface\)/);
  });

  it('★地雷: P5の上書きは LANE_CSS_SYNC マーカー区間の外(END より後)にある', () => {
    const endAt = venueBarSrc.indexOf('LANE_CSS_SYNC_END');
    const p5At = venueBarSrc.indexOf('.nlsb-venue-lane-stack .nlsb-seat.nlsb-seat-vip .nl-story-userlane-avatar');
    expect(endAt).toBeGreaterThan(-1);
    expect(p5At).toBeGreaterThan(endAt);
  });
});

describe('会場レーン案内文言の①正本コピー', () => {
  it('fallback 時も guides:false に戻さず、①POPと同じ案内文言セットを共有rendererから出す', () => {
    expect(venueBarSrc).toContain('const VENUE_LANE_GUIDES_EXACT_COPY = true;');
    expect(venueBarSrc).toMatch(/guides:\s*VENUE_LANE_GUIDES_EXACT_COPY/);
    expect(venueBarSrc).not.toMatch(/guides:\s*isLaneMirrorPaintMode\s*\?\s*VENUE_LANE_GUIDES_EXACT_COPY\s*:\s*false/);
  });
});
