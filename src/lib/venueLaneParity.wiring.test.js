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
const statusFastDiagLiteSrc = read('src/lib/statusFastDiagLite.js');
const popupSrc = read('src/extension/popup-entry.js');
const laneMirrorSrc = read('src/lib/laneMirror.js');
const laneDomSelfMeasureSrc = read('src/lib/laneDomSelfMeasure.js');
const venueDomCensusSrc = read('src/lib/venueDomCensus.js');
const venueLaneParitySrc = read('src/lib/venueLaneParity.js');
const laneSceneEnvelopeSrc = read('src/lib/laneSceneEnvelope.js');

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

  // --- v0.1.1136 C2(scroll-whiteout-freeze-DESIGN.mdとは別件・venue-pop-parity-loop-root-cause C2) ---
  it('composeVenueBaseRows は reason=stale のときは fallback へ降格せず鏡を使い続ける', () => {
    expect(venueBarSrc).toMatch(/staleButUsable\s*=\s*!usable\.usable\s*&&\s*usable\.reason\s*===\s*'stale'/);
    expect(venueBarSrc).toMatch(/if\s*\(!usable\.usable\s*&&\s*!staleButUsable\)\s*\{/);
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

  // --- 2026-07-14(会場独自受け皿の撤去)の配線 ---
  it('venueBar はロビー(paintVenueLobby等)を描かない=会場は①と同じ5段のみ', () => {
    expect(venueBarSrc).not.toMatch(/paintVenueLobby/);
    expect(venueBarSrc).not.toMatch(/anonymousToLobby/);
    expect(venueBarSrc).not.toMatch(/fallbackLobby/);
  });

  it('emptyMessage は段の可視件数のみで判定する', () => {
    expect(venueBarSrc).toMatch(/emptyMessage\.hidden = visibleLaneItems\.length > 0/);
  });

  it('「消す側」の計器(anonExcluded)が diag に載る(旧lobbyResetCountの後継)', () => {
    expect(venueBarSrc).toMatch(/anonExcluded: _anonExcludedCount/);
    expect(seatsDiagSrc).toMatch(/anonExcluded/);
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

  it('タイルへ照合キーが刻印されている(fillLaneTier)', () => {
    const laneDomSrc = read('src/extension/story/renderStoryUserLaneDom.js');
    expect(laneDomSrc).toMatch(/dataset\.userKey = venueLaneParityKey\(/);
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

  // --- v0.1.1133 会場のガイド/フッターは fallback でも①の共有文言を出す ---
  it('paint は mirror 時だけ①鏡の pickedLength/totalCandidates を渡し、ガイド文言は常に①正本を使う', () => {
    expect(venueBarSrc).toMatch(/const VENUE_LANE_GUIDES_EXACT_COPY = true;/);
    expect(venueBarSrc).toMatch(/const isLaneMirrorPaintMode = Boolean\(lanePaintSnap\);/);
    expect(venueBarSrc).toMatch(
      /recordedCommentRowsTotal: isLaneMirrorPaintMode\s*\?\s*lanePaintSnap\.pickedLength\s*:\s*seating\.participantCount/
    );
    expect(venueBarSrc).toMatch(
      /totalCandidates: isLaneMirrorPaintMode\s*\?\s*lanePaintSnap\.totalCandidates\s*:\s*seating\.participantCount/
    );
    expect(venueBarSrc).toMatch(/guides:\s*VENUE_LANE_GUIDES_EXACT_COPY/);
  });

  it('fallback mode の paint は件数だけ seating.participantCount にし、guides:false には戻さない', () => {
    expect(venueBarSrc).toMatch(
      /recordedCommentRowsTotal: isLaneMirrorPaintMode\s*\?\s*lanePaintSnap\.pickedLength\s*:\s*seating\.participantCount/
    );
    expect(venueBarSrc).toMatch(
      /totalCandidates: isLaneMirrorPaintMode\s*\?\s*lanePaintSnap\.totalCandidates\s*:\s*seating\.participantCount/
    );
    expect(venueBarSrc).not.toMatch(/guides:\s*isLaneMirrorPaintMode\s*\?\s*VENUE_LANE_GUIDES_EXACT_COPY\s*:\s*false/);
  });

  it('guide 要素の CSS は LANE_CSS_SYNC 区間内に置かれている', () => {
    const begin = venueBarSrc.indexOf('/* LANE_CSS_SYNC_BEGIN');
    const end = venueBarSrc.indexOf('/* LANE_CSS_SYNC_END */');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const laneCssSync = venueBarSrc.slice(begin, end);
    expect(laneCssSync).toContain('.nlsb-venue-lane-stack .nl-story-userlane-guide {');
    expect(laneCssSync).toContain('.nlsb-venue-lane-stack .nl-story-userlane-guide__lines {');
    expect(laneCssSync).toContain('.nlsb-venue-lane-stack .nl-story-userlane-guide__line {');
    expect(laneCssSync).toContain('.nlsb-venue-lane-stack .nl-story-userlane-guide__face {');
    expect(laneCssSync).toContain('.nlsb-venue-lane-stack .nl-story-userlane-guide__foot {');
    expect(laneCssSync).toContain('.nlsb-venue-lane-stack .nl-story-userlane-guide__count {');
  });

  // --- v0.1.1126 ①「詳しい状況」診断の会場コピー ---
  it('venueBar が storyDiag 鏡キーを catch-up と onChanged の両方で読む', () => {
    expect(venueBarSrc).toMatch(/KEY_STORY_DIAG_MIRROR/);
    expect(venueBarSrc).toMatch(/chrome\.storage\.local\.get\(\[KEY_LANE_MIRROR, KEY_STORY_DIAG_MIRROR\]\)/);
    expect(venueBarSrc).toMatch(/changes\[KEY_STORY_DIAG_MIRROR\]/);
  });

  it('venueBar が nlsb-story-diag パネルを段stackの下へ配置して描画している', () => {
    expect(venueBarSrc).toMatch(/nlsb-story-diag/);
    expect(venueBarSrc).toMatch(/seatsHost\.appendChild\(storyDiagHost\)/);
    expect(venueBarSrc).toMatch(/renderVenueStoryDiagMirrorPanel\(/);
  });

  it('venueSeatsDiag と statusFastDiagLite が storyDiagMirror を通す(状態速報コピペ落ち防止)', () => {
    expect(venueBarSrc).toMatch(/storyDiagMirror:/);
    expect(seatsDiagSrc).toMatch(/storyDiagMirror/);
    expect(statusFastDiagLiteSrc).toMatch(/storyDiagMirror/);
  });

  it('venueBar に loading/spinner/skeleton の新規出現を増やさない(Patch A ローディング禁止)', () => {
    const counts = {
      loading: (venueBarSrc.match(/loading/g) || []).length,
      spinner: (venueBarSrc.match(/spinner/g) || []).length,
      skeleton: (venueBarSrc.match(/skeleton/g) || []).length
    };
    expect(counts).toEqual({ loading: 9, spinner: 0, skeleton: 0 });
  });

  // --- C1: 両端実DOM指紋(件数+寸法) ---
  it('①POP は paint 直後に実DOMを測り、その同じ指紋を鏡へ渡す', () => {
    expect(popupSrc).toMatch(/measureLaneDomSelf/);
    const paintAt = popupSrc.indexOf('paintStoryUserLaneDomFilled(');
    const measureAt = popupSrc.indexOf('const laneDomSelf = measureLaneDomSelf(els)', paintAt);
    const publishAt = popupSrc.indexOf('publishLaneMirror({', measureAt);
    expect(paintAt).toBeGreaterThanOrEqual(0);
    expect(measureAt).toBeGreaterThan(paintAt);
    expect(publishAt).toBeGreaterThan(measureAt);
    expect(popupSrc.slice(publishAt, publishAt + 500)).toMatch(/domSelf:\s*laneDomSelf/);
  });

  it('鏡は domSelf を容量計算に含め、計測器は5段の表示数と寸法を返す', () => {
    expect(laneMirrorSrc).toMatch(/const domSelf = normalizeDomSelf\(input\?\.domSelf\)/);
    expect(laneMirrorSrc).toMatch(/domSelf,/);
    expect(laneDomSelfMeasureSrc).toMatch(/visible:\s*tiles\.length/);
    expect(laneDomSelfMeasureSrc).toMatch(/tileW/);
    expect(laneDomSelfMeasureSrc).toMatch(/tileH/);
  });

  it('会場 census と parity が寸法・①DOM未計測・10%幾何差を判定する', () => {
    expect(venueDomCensusSrc).toMatch(/tileW/);
    expect(venueDomCensusSrc).toMatch(/tileH/);
    expect(venueLaneParitySrc).toMatch(/snap\?\.domSelf/);
    expect(venueLaneParitySrc).toMatch(/VENUE_TILE_GEOMETRY_TOLERANCE = 0\.1/);
    expect(venueLaneParitySrc).toMatch(/①DOM未計測/);
    expect(venueLaneParitySrc).toMatch(/幾何≠/);
  });

  // --- v0.1.1137 lanescene-structural-review MVP: SceneEnvelope/RenderReceipt の配線忘れ防止 ---
  it('鏡は contentHash を持ち、laneSceneContentHash を使って計算している', () => {
    expect(laneMirrorSrc).toMatch(/import\s*\{\s*laneSceneContentHash\s*\}\s*from\s*'\.\/laneSceneEnvelope\.js'/);
    expect(laneMirrorSrc).toMatch(/contentHash:\s*laneSceneContentHash\(/);
  });

  it('venueBar が鏡世代(SceneEnvelope)と会場paint結果を突合し、sceneReceipt として渡している', () => {
    expect(venueBarSrc).toMatch(
      /import\s*\{\s*buildSceneEnvelope,\s*buildRenderReceipt,\s*compareRenderReceipts\s*\}\s*from\s*'\.\.\/lib\/laneSceneEnvelope\.js'/
    );
    // 会場一致gift/ad根治(2026-07-14 Patch 2a): ①Receiptのhashは復元正準形(restoreLaneMirrorBuckets
    //   適用後)で取る。snapshot生値のまま署名するとスリムセル(displaySrc空+uid有り)が鏡に載る
    //   ようになった(laneMirror.js toMirrorCell Patch1)ことで①=会場のhashが恒常的に不一致になるため。
    expect(venueBarSrc).toMatch(/buildSceneEnvelope\(\{\s*capturedAt:\s*lanePaintSnap\.capturedAt,\s*\.\.\.restoreLaneMirrorBuckets\(lanePaintSnap\)\s*\}\)/);
    expect(venueBarSrc).toMatch(/buildSceneEnvelope\(\/\*\* @type \{any\} \*\/ \(laneBuckets\)\)/);
    expect(venueBarSrc).toMatch(/sceneReceiptDiag = compareRenderReceipts\(/);
    expect(venueBarSrc).toMatch(/sceneReceipt:\s*sceneReceiptDiag/);
  });

  it('venueSeatsDiag が sceneReceipt を検証済みの軽量形(match/line)だけ通す', () => {
    expect(seatsDiagSrc).toMatch(/sceneReceipt:\s*\/\*\* @type \{VenueSeatsDiagState\['sceneReceipt'\]\} \*\//);
    expect(seatsDiagSrc).toMatch(/const sceneReceipt = srIn \?/);
  });

  it('aiShareFullText が sceneReceipt.line を状態速報に出している', () => {
    expect(aiShareSrc).toMatch(/venueSeatsDiag\)\?\.sceneReceipt\?\.line/);
  });

  it('laneSceneEnvelope.js に4つの純関数が実在する', () => {
    expect(laneSceneEnvelopeSrc).toMatch(/export function laneSceneContentHash\(/);
    expect(laneSceneEnvelopeSrc).toMatch(/export function buildSceneEnvelope\(/);
    expect(laneSceneEnvelopeSrc).toMatch(/export function buildRenderReceipt\(/);
    expect(laneSceneEnvelopeSrc).toMatch(/export function compareRenderReceipts\(/);
  });

  // --- 2026-07-14 診断先行(venue-tile-link-parity-diagnose-DESIGN.md): 席リンク一致計器の配線 ---
  it('venueBar が席リンク一致計器(observeVenueSeatLink)を毎paint観測している', () => {
    expect(venueBarSrc).toMatch(
      /import\s*\{\s*beginVenueSeatLinkPaint,\s*createVenueSeatLinkParityState,\s*observeVenueSeatLink,\s*toVenueSeatLinkParityDiag\s*\}\s*from\s*'\.\.\/lib\/venueSeatLinkParity\.js'/
    );
    expect(venueBarSrc).toMatch(/beginVenueSeatLinkPaint\(_seatLinkParity\)/);
    expect(venueBarSrc).toMatch(/observeVenueSeatLink\(_seatLinkParity,/);
    expect(venueBarSrc).toMatch(/seatLinkParity:\s*toVenueSeatLinkParityDiag\(_seatLinkParity,\s*Date\.now\(\)\)/);
  });

  it('venueSeatsDiag が seatLinkParity を通す(whitelist落ち防止)', () => {
    expect(seatsDiagSrc).toMatch(/seatLinkParity/);
  });

  it('aiShareFullText が seatLinkParity.line を状態速報に出している', () => {
    expect(aiShareSrc).toMatch(/venueSeatsDiag\)\?\.seatLinkParity\?\.line/);
  });

  // --- 2026-07-15 診断先行(venue-yukkuri-named-diagnose): 「名前ありゆっくり顔」計器の配線 ---
  it('venueBar が名前ありゆっくり顔計器(observeVenueYukkuriNamedTile)を毎席観測している', () => {
    expect(venueBarSrc).toMatch(
      /import\s*\{\s*createVenueYukkuriNamedCensusState,\s*observeVenueYukkuriNamedTile,\s*toVenueYukkuriNamedCensusDiag\s*\}\s*from\s*'\.\.\/lib\/venueYukkuriNamedCensus\.js'/
    );
    expect(venueBarSrc).toMatch(/observeVenueYukkuriNamedTile\(_yukkuriNamedCensus,/);
    expect(venueBarSrc).toMatch(/yukkuriNamedCensus:\s*toVenueYukkuriNamedCensusDiag\(_yukkuriNamedCensus\)/);
  });

  it('venueSeatsDiag が yukkuriNamedCensus を通す(whitelist落ち防止)', () => {
    expect(seatsDiagSrc).toMatch(/yukkuriNamedCensus/);
  });

  it('aiShareFullText が yukkuriNamedCensus.line を状態速報に出している', () => {
    expect(aiShareSrc).toMatch(/venueSeatsDiag\)\?\.yukkuriNamedCensus\?\.line/);
  });
});
