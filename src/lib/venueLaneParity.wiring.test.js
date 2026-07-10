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

  // --- v0.1.1112 厳密完全一致(ロビー隔離)の配線 ---
  it('venueBar がロビー(paintVenueLobby)を描き、lobby を parity へ渡している', () => {
    expect(venueBarSrc).toMatch(/paintVenueLobby\(lobbyItems\)/);
    expect(venueBarSrc).toMatch(/lobby: lobbyItems\.map\(/);
  });

  it('席装飾ループが段+ロビーの合成列を回す(L17=ロビー席の装飾取り残し防止)', () => {
    expect(venueBarSrc).toMatch(/\[\.\.\.visibleLaneItems, \.\.\.lobbyItems\]/);
  });

  it('emptyMessage は段+ロビーの合算で判定(L19)', () => {
    expect(venueBarSrc).toMatch(/visibleLaneItems\.length \+ lobbyItems\.length > 0/);
  });

  it('「消す側」の計器(lobbyResetCount)が diag に載る(L18)', () => {
    expect(venueBarSrc).toMatch(/lobbyResetCount: _venueLobbyResetCount/);
    expect(seatsDiagSrc).toMatch(/lobbyResetCount/);
  });

  // --- v0.1.1113 実DOM census(Tri-Parity)の配線 ---
  it('venueBar が実DOM census を収集し dom として parity へ渡している', () => {
    expect(venueBarSrc).toMatch(/collectVenueLaneDomCensus\(/);
    expect(venueBarSrc).toMatch(/venueDomCensusToParityDom\(/);
    expect(venueBarSrc).toMatch(/dom: domSummary/);
  });

  it('census は publish と同じ3秒期日ゲートの中でだけ走る(毎paint禁止)', () => {
    expect(venueBarSrc).toMatch(/_venueSeatsDiagLastWriteAt >= 3000/);
    expect(venueBarSrc).toMatch(/if \(diagDue\)/);
  });

  it('タイルへ照合キーが刻印されている(fillLaneTier とロビーの両方)', () => {
    const laneDomSrc = read('src/extension/story/renderStoryUserLaneDom.js');
    expect(laneDomSrc).toMatch(/dataset\.userKey = venueLaneParityKey\(/);
    expect(venueBarSrc).toMatch(/dataset\.userKey = venueLaneParityKey\(/);
  });

  it('venueSeatsDiag スナップショットが laneParity.dom を通す(whitelist 落ち防止)', () => {
    expect(seatsDiagSrc).toMatch(/dom: lpDom/);
  });

  it('venue-parity が healthCells セル+診断レジストリに登録されている(穴f=盲点の閉鎖)', () => {
    const healthSrc = read('src/lib/healthCells.js');
    const registrySrc = read('src/lib/diagnosisRegistry.js');
    expect(healthSrc).toMatch(/stateCell\('venue-parity'/);
    expect(registrySrc).toMatch(/reg\('venue-parity'/);
  });

  // --- v0.1.1116 白円計器の配線 ---
  it('venueBar が顔プローブ実績(getDiagnostics)を census extras へ渡している', () => {
    expect(venueBarSrc).toMatch(/avatarProbe: venueAvatarLoadGuard\.getDiagnostics\(\)/);
  });

  it('venueSeatsDiag スナップショットが blank/blankAnon/probeFail を通す(whitelist落ち防止)', () => {
    expect(seatsDiagSrc).toMatch(/blankAnon/);
    expect(seatsDiagSrc).toMatch(/probeFail/);
  });

  // --- v0.1.1117/1118 白円根治(導出委譲+鏡enrich)の配線 ---
  it('会場の displaySrc 導出は①正本(buildStoryUserLaneCandidateRow)へ委譲されている(P3)', () => {
    const bucketsSrc = read('src/lib/venueLaneBuckets.js');
    expect(bucketsSrc).toMatch(/buildStoryUserLaneCandidateRow\(/);
    expect(bucketsSrc).toMatch(/resolveStoryLaneAvatarSrc\(/);
    // トップバーも第2導出でなく venueSeatEntryToLaneItem 一本(正本1つ)。
    expect(venueBarSrc).toMatch(/venueSeatEntryToLaneItem\(\s*\{ seatIndex: 0, participant/);
    expect(venueBarSrc).toMatch(/pickCtx: venueLanePickCtx/);
  });

  it('commitDisplay 関所が鏡enrich(P4)を profile 補強の後段に通している', () => {
    expect(venueBarSrc).toMatch(/enrichVenueRowsWithMirrorAvatars\(\s*enrichVenueRowsWithProfileAvatars\(/);
    expect(venueBarSrc).toMatch(/buildVenueMirrorAvatarMap\(/);
  });
});
