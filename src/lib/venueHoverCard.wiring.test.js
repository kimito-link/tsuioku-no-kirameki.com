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

  // --- 2026-07-30(council-fable設計・venue-hover-card-content-DESIGN.md MVP-1/MVP-2) ---
  it('openHoverCardFor が diagMode を🩺状態パネルの開閉状態から都度読んでいる(固定していない)', () => {
    expect(venueBarSrc).toMatch(/diagMode:\s*!diagPanel\.hidden/);
  });

  it('openHoverCardFor が nowMs を Date.now() から注入している(純関数側にDate.now()を持ち込まない)', () => {
    expect(venueBarSrc).toMatch(/nowMs:\s*Date\.now\(\)/);
  });

  it('席装飾ループ・renderTopBarの両方の_hoverCardDataByEl.setにlastAtが乗っている(配線忘れ=CI赤)', () => {
    const seatSetAt = venueBarSrc.indexOf('_hoverCardDataByEl.set(node.seat,');
    const topbarSetAt = venueBarSrc.indexOf('_hoverCardDataByEl.set(cell,');
    expect(seatSetAt).toBeGreaterThanOrEqual(0);
    expect(topbarSetAt).toBeGreaterThanOrEqual(0);
    const seatBlock = venueBarSrc.slice(seatSetAt, venueBarSrc.indexOf('});', seatSetAt));
    const topbarBlock = venueBarSrc.slice(topbarSetAt, venueBarSrc.indexOf('});', topbarSetAt));
    expect(seatBlock).toMatch(/lastAt:/);
    expect(topbarBlock).toMatch(/lastAt:/);
  });

  // 2026-07-31(ユーザー指摘): 広告段の #1/#5 等にホバーしても無反応だった件の退化ガード。
  //   原因はホバー登録が席装飾ループに相乗りしており、そのループが v0.1.1111 の契約で
  //   席なしアイテム(_venueSeatIndex:-1)を continue で飛ばすこと。席なし補完を別途持たないと
  //   「uid を持たない広告主は永久にカードが出ない」に戻る。
  it('席なしアイテム(広告主等)にもホバーデータを登録している(席装飾ループの外)', () => {
    // 段DOMを走査して席なしぶんを補う処理が存在すること。
    expect(venueBarSrc).toMatch(/_hoverCardDataByEl\.set\(tileEl,/);
    const setAt = venueBarSrc.indexOf('_hoverCardDataByEl.set(tileEl,');
    const block = venueBarSrc.slice(setAt, venueBarSrc.indexOf('});', setAt));
    // 段が乗っていること(広告/ギフト段のラベル出し分けに必要)。
    expect(block).toMatch(/tier:/);
    // ★文字列の存在だけを見ると `if (false)` を前置する無効化を検知できない(文字列スキャン方式の
    //   構造的な穴・2026-07-31 に自分で踏んだ)。呼び出しが「無条件に実行される文」であることまで
    //   断言する: 直前の行が制御構文で潰されていないこと。
    const lineStart = venueBarSrc.lastIndexOf('\n', setAt) + 1;
    const callLine = venueBarSrc.slice(lineStart, setAt);
    expect(callLine.trim()).toBe('');
  });

  it('席なし補完は席あり(seat側)を上書きしない(二重登録の防止)', () => {
    const setAt = venueBarSrc.indexOf('_hoverCardDataByEl.set(tileEl,');
    expect(setAt).toBeGreaterThanOrEqual(0);
    const before = venueBarSrc.slice(Math.max(0, setAt - 900), setAt);
    // 席あり(seatIdx>=0)は skip し、既に登録済みの要素も skip していること。
    expect(before).toMatch(/_venueSeatIndex/);
    expect(before).toMatch(/_hoverCardDataByEl\.has\(tileEl\)/);
  });

  it('席装飾ループの v0.1.1111 契約(席なしを飛ばす)は維持されている', () => {
    // 席なし補完を足したからといって、席装飾側で席なしを装飾してはいけない。
    const loopAt = venueBarSrc.indexOf('for (const item of visibleLaneItems)');
    expect(loopAt).toBeGreaterThanOrEqual(0);
    const loopHead = venueBarSrc.slice(loopAt, loopAt + 400);
    expect(loopHead).toMatch(/seatIndexRaw\s*<\s*0\)\s*continue/);
  });

  it('.nlsb-hover-card__id に格下げのfont-sizeが設定されている', () => {
    const begin = venueBarSrc.indexOf('.nlsb-hover-card__id {');
    const end = venueBarSrc.indexOf('}', begin);
    const block = venueBarSrc.slice(begin, end);
    expect(block).toMatch(/font-size:\s*11px/);
  });
});
