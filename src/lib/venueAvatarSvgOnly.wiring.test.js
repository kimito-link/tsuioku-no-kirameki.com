import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場の匿名アバターを SVG のまま使う配線ガード(v0.1.1238)。
 *
 * 【なぜ必要か】
 * 司令塔がブラウザで実測:
 *   会場内img 228枚 / ユニーク177種 / **1件 29,262バイトの PNG(128x128)**
 *   文字列だけで 5.05MB・デコード後ビットマップ推定 11MB
 *   一方、席の実表示は **22px**(venueBar.js の [data-thumb="0"])= 過剰
 *
 * 匿名の顔は `anonymousIdenticonDataUrl`(SVG・約2.5KB)で即時表示された後、
 * `upgradeAnonymousAvatarImage` が canvas で実素材PNGを合成して差し替えていた。
 * PNG は 128px 固定(`avatarPartsComposer.js` の canvasSize)で、
 * `composeAvatarPartsDataUrl(userKey)` は **size 引数を受け取らない**。
 *
 * ★ユーザー確定: 「席は SVG で十分」(22px 表示では実素材との差が見えない)
 * ★ホバーカード(72px)も席の img.src を流用するが、`readVenueTileThumbState`
 *   (venueHoverCard.js:48)が `data:image/svg+xml` を identicon として扱う分岐を既に持つ。
 *   SVG はベクタなので拡大しても劣化しない=むしろ従来の PNG(128px)より鮮明。
 *
 * ★popup / comeview / status の注入は**変更しない**(会場だけの最適化)。
 *
 * 正本: ~/.claude/plans/groovy-doodling-russell.md (Patch 2)
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const venueSrc = read('src/extension/venueBar.js');
const tileSrc = read('src/lib/personTileDom.js');
const hoverSrc = read('src/lib/venueHoverCard.js');

/** venuePersonTileIo の定義ブロックを切り出す。 */
function venueIoBlock() {
  const at = venueSrc.indexOf('const venuePersonTileIo = {');
  if (at < 0) return '';
  return venueSrc.slice(at, venueSrc.indexOf('};', at) + 2);
}

describe('会場の匿名アバターSVG化の配線(メモリ約16MB削減=CI赤)', () => {
  it('★会場の io は upgradeAnonymousAvatarImage を注入しない(PNG合成を席で走らせない)', () => {
    const block = venueIoBlock();
    expect(block).toBeTruthy();
    expect(
      /upgradeAnonymousAvatarImage/.test(block),
      '会場の venuePersonTileIo に upgradeAnonymousAvatarImage が残っている(1件29KBのPNGが復活する)'
    ).toBe(false);
  });

  it('凍結ファイル personTileDom は io の有無で分岐する(触らずに制御できる根拠)', () => {
    // io.upgradeAnonymousAvatarImage が関数でなければアップグレードしない設計。
    expect(tileSrc).toMatch(/typeof io\.upgradeAnonymousAvatarImage === 'function'/);
  });

  it('ホバーカードは SVG を identicon として扱える(拡大表示が壊れない根拠)', () => {
    expect(hoverSrc).toMatch(/src\.startsWith\('data:image\/svg\+xml'\)/);
    expect(hoverSrc).toMatch(/kind = 'identicon'/);
  });

  it('popup の注入は変更しない(会場だけの最適化=他画面の見た目を変えない)', () => {
    const popupSrc = read('src/extension/popup-entry.js');
    expect(popupSrc).toMatch(/upgradeAnonymousAvatarImage/);
  });
});
