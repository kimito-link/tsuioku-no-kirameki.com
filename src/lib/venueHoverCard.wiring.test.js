import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場アイコンのホバープレビューカード(venue-avatar-hover-preview-SPEC.md)の
 * 「配線忘れ=CI赤」ガード。
 *
 * ★実行時 DOM 不要・純 Node(fs 読み)。venueBar.js は content script で vitest から
 *   import できないため、ソース文字列スキャンで配線の実在を断言する
 *   (venueLaneParity.wiring.test.js と同型)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const venueBarSrc = read('src/extension/venueBar.js');
const personTileDomSrc = read('src/lib/personTileDom.js');
const venueLaneBucketsSrc = read('src/lib/venueLaneBuckets.js');
const laneMirrorSrc = read('src/lib/laneMirror.js');

describe('会場ホバープレビューカードの配線(配線忘れ=CI赤)', () => {
  it('venueBar が venueHoverCard の全関数を import している', () => {
    expect(venueBarSrc).toMatch(
      /import\s*\{\s*readVenueTileThumbState,\s*buildVenueHoverCardModel,\s*createVenueHoverCardEl,\s*renderVenueHoverCard,\s*resolveVenueHoverCardPlacement\s*\}\s*from\s*'\.\.\/lib\/venueHoverCard\.js'/
    );
  });

  it('venueBar が stage にカードを append している', () => {
    expect(venueBarSrc).toMatch(/createVenueHoverCardEl\(document\)/);
    expect(venueBarSrc).toMatch(/stage\.append\([^)]*hoverCardEl[^)]*\)/);
  });

  it('席装飾ループが _hoverCardDataByEl.set を呼んでいる', () => {
    expect(venueBarSrc).toMatch(/_hoverCardDataByEl\.set\(node\.seat,/);
  });

  it('renderTopBar が _hoverCardDataByEl.set を呼んでいる', () => {
    expect(venueBarSrc).toMatch(/_hoverCardDataByEl\.set\(cell,/);
  });

  it('pointerover 委譲に pointerType===touch のガードがある', () => {
    expect(venueBarSrc).toMatch(/e\.pointerType === 'touch'/);
  });

  it('pointerover/pointerout の委譲リスナーが seatsHost と topBarList の両方に配線されている', () => {
    expect(venueBarSrc).toMatch(/wireHoverCardDelegation\(seatsHost\)/);
    expect(venueBarSrc).toMatch(/wireHoverCardDelegation\(topBarList\)/);
  });

  it('pointerdown/scroll でカードを閉じる配線がある', () => {
    expect(venueBarSrc).toMatch(/seatsHost\.addEventListener\('pointerdown',\s*closeHoverCard\)/);
    expect(venueBarSrc).toMatch(/seatsHost\.addEventListener\('scroll',\s*closeHoverCard\)/);
  });

  it('閉じる処理は単一関数closeHoverCardに集約されている(経路漏れ防止)', () => {
    expect(venueBarSrc).toMatch(/const closeHoverCard = \(\) => \{/);
  });

  it('title退避の復元は「現在値が空のときだけ」にしている(paint競合対策・SPEC.md §7-2)', () => {
    expect(venueBarSrc).toMatch(/if \(!anchorEl\.title\) anchorEl\.title = backup\.seatTitle;/);
  });

  it('buildPersonTileEl(personTileDom.js)はホバーカードのために変更されていない', () => {
    // 退化ガード: venueHoverCard関連の識別子がpersonTileDom.jsに漏れ出していないこと。
    expect(personTileDomSrc).not.toMatch(/venueHoverCard/);
    expect(personTileDomSrc).not.toMatch(/HoverCard/);
  });

  it('venueSeatEntryToLaneItem(venueLaneBuckets.js)はホバーカードのために変更されていない', () => {
    expect(venueLaneBucketsSrc).not.toMatch(/venueHoverCard/);
    expect(venueLaneBucketsSrc).not.toMatch(/HoverCard/);
  });

  it('laneMirror.js(鏡ペイロード)にホバーカード用フィールドを足していない(モード間drift防止)', () => {
    expect(laneMirrorSrc).not.toMatch(/venueHoverCard/);
    expect(laneMirrorSrc).not.toMatch(/HoverCard/);
  });

  it('カードは pointer-events: none を維持している(既存ドラッグ判定・クリック経路に影響しない)', () => {
    const begin = venueBarSrc.indexOf('.nlsb-hover-card {');
    const end = venueBarSrc.indexOf('}', begin);
    const block = venueBarSrc.slice(begin, end);
    expect(block).toMatch(/pointer-events:\s*none/);
  });
});
