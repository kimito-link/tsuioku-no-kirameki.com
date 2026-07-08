import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場=①レーン鏡映(v0.1.1111)の「配線忘れ=CI赤」ガード。
 *   設計正本 reference_pop_venue_parity_SYNTHESIS.md §C-4。純関数(venueLaneMirrorSupply /
 *   venueLaneParity)を作っても venueBar.js / venueSeatsDiag / aiShareFullText に配線しなければ
 *   会場は従来のままサイレントに動き続ける(=一致もトークンも永久に出ない)。それを CI 赤で止める。
 *
 * ★実行時 DOM 不要・純 Node(fs 読み)。venueBar.js は content script で vitest から import できない
 *   ため、ソース文字列スキャンで配線の実在を断言する(liveviewMirrorSections.wiring.test.js と同型)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const venueBarSrc = read('src/extension/venueBar.js');
const aiShareSrc = read('src/lib/aiShareFullText.js');
const seatsDiagSrc = read('src/lib/venueSeatsDiag.js');

describe('会場=①レーン鏡映の配線(配線忘れ=CI赤)', () => {
  it('venueBar が鏡キー(KEY_LANE_MIRROR)を購読している(onChanged 直採用+catch-up)', () => {
    expect(venueBarSrc).toMatch(/KEY_LANE_MIRROR/);
    expect(venueBarSrc).toMatch(/changes\[KEY_LANE_MIRROR\]/);
  });

  it('venueBar が供給合成(composeVenueBaseRows→venueRowsFromLaneMirror)を呼んでいる', () => {
    expect(venueBarSrc).toMatch(/venueRowsFromLaneMirror\(/);
    expect(venueBarSrc).toMatch(/isLaneMirrorUsableForVenue\(/);
    expect(venueBarSrc).toMatch(/composeVenueBaseRows\(/);
  });

  it('venueBar が段割当の合成(composeVenueLaneBuckets)を呼んでいる', () => {
    expect(venueBarSrc).toMatch(/composeVenueLaneBuckets\(/);
  });

  it('venueBar が一致計器(buildVenueLaneParity)を呼び venueSeatsDiag に同梱している', () => {
    expect(venueBarSrc).toMatch(/buildVenueLaneParity\(/);
    expect(venueBarSrc).toMatch(/laneParity: laneParityDiag/);
  });

  it('venueSeatsDiag スナップショットが laneParity を通す(whitelist 落ち防止)', () => {
    expect(seatsDiagSrc).toMatch(/laneParity/);
  });

  it('状態速報(aiShareFullText)が laneParity.line を1行出す', () => {
    expect(aiShareSrc).toMatch(/laneParity\?\.line/);
  });

  it('供給はどちらの mode でも commitDisplay(enrich関所)を通る(入口を変えない=L5)', () => {
    // composeVenueBaseRows の結果は必ず commitDisplay に渡ることをスキャンで担保。
    expect(venueBarSrc).toMatch(/baseRows = composeVenueBaseRows\(/);
    expect(venueBarSrc).toMatch(/commitDisplay\(baseRows\)/);
  });
});
