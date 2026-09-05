import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 入場演出(サイドパネル→会場へ運ぶ)の配線テスト。
 * 正本SPEC: docs/handoff/venue-transport-effect-SPEC-2026-08-08.md
 *
 * ★文字列スキャンの配線テストは `if (false)` を前置する変異を検知できず緑のまま通る
 *   ([[wiring-test-mutation-check]])。なので「呼び出しが【無条件に実行される文】である」
 *   ことまでアンカーごと固定する。実際 v1286/v1287 はこの穴で4回「直した」と誤宣言した。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const venueBarSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/venueBar.js'),
  'utf8'
);

describe('入場演出の配線', () => {
  it('正本ロジック(venueEntryQueue)を import している', () => {
    expect(venueBarSrc).toMatch(
      /import\s*\{[^}]*createVenueEntryQueue[^}]*\}\s*from\s*'\.\.\/lib\/venueEntryQueue\.js'/
    );
  });

  it('★runEntryEffects が renderSeats 末尾で【無条件に】呼ばれる', () => {
    // アンカー: writeVenueEffectSoundPresence の直後 → コメント行 → 呼び出し → 関数終端。
    // if(false) 前置や try で囲う変異を通さないよう、前後を固定する。
    expect(venueBarSrc).toMatch(
      /if \(open\) writeVenueEffectSoundPresence\(\);\s*\n\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*runEntryEffects\(String\(activeLiveId[^)]*\)[^;]*\);\s*\n\s*\};/
    );
  });

  it('入場演出は「席が DOM に載った後」に呼ばれる(座標が取れる位置)', () => {
    const publishIdx = venueBarSrc.indexOf('publishVenueSeatsDiag(seatsDiagObs)');
    const runIdx = venueBarSrc.indexOf('runEntryEffects(String(activeLiveId');
    expect(publishIdx).toBeGreaterThan(0);
    expect(runIdx).toBeGreaterThan(publishIdx);
  });

  it('★アイコンは席タイルの実アバターを複製する(自前で解決し直さない=白丸事故の再発防止)', () => {
    // v1286 の教訓: 独自にアバターを組み立てる経路を作ると、そこだけ正本を通らず白丸になる。
    expect(venueBarSrc).toMatch(/const srcEl = seatAnchorEl\(seat\.node\)/);
    expect(venueBarSrc).toMatch(/const srcImg = srcEl \? srcEl\.querySelector\('img'\) : null/);
  });

  it('飛ばせなかったときも枠を返す(キューが詰まらない)', () => {
    expect(venueBarSrc).toMatch(
      /if \(!launchEntryFlight\(key\)\) entryQueue\.onFlightDone\(key\);/
    );
  });

  it('保険タイマーがある(animationend 取りこぼしで詰まらない)', () => {
    expect(venueBarSrc).toMatch(/window\.setTimeout\(recycle, VENUE_ENTRY_FLIGHT_MS \+ 400\)/);
  });

  it('演出の失敗が会場の描画を止めない(try で囲われている)', () => {
    expect(venueBarSrc).toMatch(/catch \{ \/\* 演出の失敗は会場の描画を止めない \*\/ \}/);
  });
});

describe('入場演出の CSS', () => {
  it('飛行アニメと着弾アニメの両方が定義されている', () => {
    expect(venueBarSrc).toMatch(/@keyframes nlsb-entry-fly\b/);
    expect(venueBarSrc).toMatch(/@keyframes nlsb-seat-enter\b/);
  });

  it('★reduced-motion で「飛ばさないが消さない」(演出は計器でもあるため)', () => {
    // 完全に animation:none にすると入場が観測できなくなり検証価値が0になる。
    expect(venueBarSrc).toMatch(/@keyframes nlsb-entry-fade\b/);
    expect(venueBarSrc).toMatch(
      /\.nlsb-entry-proj\.is-flying \{\s*\n\s*animation: nlsb-entry-fade/
    );
  });

  it('飛行時間は正本の定数(VENUE_ENTRY_FLIGHT_MS)から渡る', () => {
    expect(venueBarSrc).toMatch(
      /setProperty\('--nlsb-entry-dur', `\$\{VENUE_ENTRY_FLIGHT_MS\}ms`\)/
    );
  });
});
