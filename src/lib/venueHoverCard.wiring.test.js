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
    // import ブロックを切り出して、必要な関数が全て入っていることを個別に断言する。
    //   (1本の正規表現で並び順まで固定すると、関数を1つ足すたびに壊れて本質を見失う)
    const m = venueBarSrc.match(/import\s*\{([\s\S]*?)\}\s*from\s*'\.\.\/lib\/venueHoverCard\.js'/);
    expect(m).toBeTruthy();
    const names = String(m?.[1] || '');
    for (const fn of [
      'readVenueTileThumbState',
      'buildVenueHoverCardModel',
      'createVenueHoverCardEl',
      'renderVenueHoverCard',
      'resolveVenueHoverCardPlacement'
    ]) {
      expect(names).toContain(fn);
    }
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
  it('席なしアイテム(広告主等)にもホバーデータを解決する経路がある', () => {
    // v0.1.1204: paint 時の全タイル走査(hot path 汚染で実機が重くなった)を撤去し、
    //   ホバーされた瞬間に段の item 列から索引で引く方式に変更した。
    expect(venueBarSrc).toMatch(/const resolveSeatlessHoverData\s*=/);
    expect(venueBarSrc).toMatch(/_laneItemsByTier/);
    const fnAt = venueBarSrc.indexOf('const resolveSeatlessHoverData');
    const fnBlock = venueBarSrc.slice(fnAt, fnAt + 1600);
    // 段が乗ること(広告/ギフト段のラベル出し分けに必要)。
    expect(fnBlock).toMatch(/tier,?\s*$|tier[,:]/m);
    // 席あり(seatIdx>=0)は対象外にして seat 側の実数を上書きしないこと。
    expect(fnBlock).toMatch(/_venueSeatIndex/);
  });

  it('ホバー解決は paint 時ではなくホバー時に呼ばれる(hot path を汚さない)', () => {
    // ★paint 経路(renderSeats)の中で全タイルを querySelectorAll してはいけない。
    //   2026-07-31 にこれをやって拡張全体が重くなった(実機報告)ので退化ガードにする。
    // renderSeats(paint本体)の中に全タイル走査が無いこと。
    const renderAt = venueBarSrc.indexOf('const renderSeats = (rows) =>');
    expect(renderAt).toBeGreaterThan(0);
    const openAtForBound = venueBarSrc.indexOf('const openHoverCardFor');
    const paintBlock = venueBarSrc.slice(renderAt, renderAt + 40000);
    expect(paintBlock).not.toContain("querySelectorAll('.nl-story-userlane-cell')");
    expect(openAtForBound).toBeGreaterThan(0);
    // 解決関数は openHoverCardFor から呼ばれること(=ホバー時のみ)。
    const openAt = venueBarSrc.indexOf('const openHoverCardFor');
    expect(openAt).toBeGreaterThan(0);
    const openBlock = venueBarSrc.slice(openAt, openAt + 900);
    expect(openBlock).toMatch(/resolveSeatlessHoverData\(anchorEl\)/);
  });

  it('席装飾ループの v0.1.1111 契約(席なしを飛ばす)は維持されている', () => {
    // 席なし補完を足したからといって、席装飾側で席なしを装飾してはいけない。
    const loopAt = venueBarSrc.indexOf('for (const item of visibleLaneItems)');
    expect(loopAt).toBeGreaterThanOrEqual(0);
    const loopHead = venueBarSrc.slice(loopAt, loopAt + 400);
    expect(loopHead).toMatch(/seatIndexRaw\s*<\s*0\)\s*continue/);
  });

  // 2026-07-31(ユーザー要望): アイコンをクリックすると全発言を読めるパネル。
  //   ホバーカードは直前1件しか出せないため、「何を言ってきたか」を追う導線が別途要る。
  describe('発言パネル(クリックで開く)の配線', () => {
    it('クリック委譲が席・トップバーの両方に張られている', () => {
      expect(venueBarSrc).toMatch(/wireSpeechPanelDelegation\(seatsHost\)/);
      expect(venueBarSrc).toMatch(/wireSpeechPanelDelegation\(topBarList\)/);
    });

    it('storage read はクリック時だけ(paint経路に持ち込まない)', () => {
      // ★常時 read を増やすと大配信で browser process が詰まる(既知の地雷)。
      //   読み込み関数は発言パネルを開く関数の中からのみ呼ばれること。
      expect(venueBarSrc).toMatch(/const readVenueCommentRowsForSpeech\s*=/);
      const callAt = venueBarSrc.indexOf('await readVenueCommentRowsForSpeech(');
      expect(callAt).toBeGreaterThan(0);
      const openAt = venueBarSrc.indexOf('const openSpeechPanelFor');
      expect(openAt).toBeGreaterThan(0);
      expect(callAt).toBeGreaterThan(openAt); // 呼び出しは openSpeechPanelFor の内側
      // renderSeats(paint本体)からは呼ばれないこと。
      const renderAt = venueBarSrc.indexOf('const renderSeats = (rows) =>');
      const paintBlock = venueBarSrc.slice(renderAt, renderAt + 40000);
      expect(paintBlock).not.toContain('readVenueCommentRowsForSpeech(');
    });

    it('uid が無い人(広告主等)ではパネルを開かない(発言記録に紐づかない)', () => {
      const wireAt = venueBarSrc.indexOf('const wireSpeechPanelDelegation');
      const block = venueBarSrc.slice(wireAt, wireAt + 900);
      expect(block).toMatch(/if \(!uid\) return/);
    });

    it('表示上限があり、全件数を併記する(黙って切らない)', () => {
      expect(venueBarSrc).toMatch(/VENUE_SPEECH_PANEL_MAX\s*=\s*\d+/);
      const openAt = venueBarSrc.indexOf('const openSpeechPanelFor');
      const block = venueBarSrc.slice(openAt, openAt + 3000);
      expect(block).toMatch(/全 \$\{total\} 件/);
    });
  });

  it('.nlsb-hover-card__id に格下げのfont-sizeが設定されている', () => {
    const begin = venueBarSrc.indexOf('.nlsb-hover-card__id {');
    const end = venueBarSrc.indexOf('}', begin);
    const block = venueBarSrc.slice(begin, end);
    expect(block).toMatch(/font-size:\s*11px/);
  });
});
