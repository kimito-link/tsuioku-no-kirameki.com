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
// ★CRLF 正規化(Windows チェックアウト)。アンカー付き regex は改行を跨ぐので、
//   正規化しないと「アンカーを固めたのに素通り/常に赤」になる
//   ([[wiring-test-mutation-check-2026-08-01]] の罠)。
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

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
    expect(venueBarSrc).toMatch(/\[KEY_LANE_MIRROR, KEY_STORY_DIAG_MIRROR, _panelKey\]/);
    expect(venueBarSrc).toMatch(/changes\[KEY_STORY_DIAG_MIRROR\]/);
  });

  it('venueBar が記録件数の正本(panel summary)を catch-up・onChanged・保険read の3経路で読む(story-diag-realtime-sync §C-2/D-2)', () => {
    expect(venueBarSrc).toMatch(/panelSummaryStorageKey/);
    expect(venueBarSrc).toMatch(/changes\[panelSummaryStorageKey\(liveId\)\]/);
    expect(venueBarSrc).toMatch(/STORY_DIAG_PANEL_STALE_MS/);
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
  it('①POP は paint 直後に実DOMを測り、その指紋を鏡へ渡す', () => {
    /*
     * ★v0.1.1281 で順序を変えた。
     *   旧: paint → 実測 → publish を同一tickで（TOCTOU防止）
     *   新: publish（描画より前・無条件） / paint 側は実測して控えるだけ
     *
     * ■ なぜ変えたか
     *   publish が描画の後ろにあったため、「描かない」で早期returnする3経路
     *   （sig一致 / 縮小ガード / 空ガード）が鏡の更新まで巻き添えで止めていた。
     *   実機で鏡が656秒凍結し、会場が①と別の顔ぶれを表示していた（2026-08-06）。
     *
     * ■ なぜ同一tickでなくても安全か
     *   measureLaneDomSelf は「そのとき存在するDOMの寸法」を読むだけ。
     *   描画をスキップした = DOM が変わっていない = 寸法も変わっていない。
     *   よって持ち回した値は【古い値ではなく正しい値】。
     *   会議（3モデル全会一致）でこの方針を採用。顔ぶれの鮮度 > 幾何の同一tick厳密性。
     */
    expect(popupSrc).toMatch(/measureLaneDomSelf/);
    const paintAt = popupSrc.indexOf('paintStoryUserLaneDomFilled(');
    const measureAt = popupSrc.indexOf('const laneDomSelf = measureLaneDomSelf(els)', paintAt);
    // 実測は paint の直後であること（ここは不変＝寸法は描いた直後にしか取れない）。
    expect(paintAt).toBeGreaterThanOrEqual(0);
    expect(measureAt).toBeGreaterThan(paintAt);
    // ★実測値は必ず控える（次回の publish がこれを同梱する）。
    //   v0.1.1284: 寸法(...laneDomSelf の spread)に加えて指紋3フィールドを足す形になった。
    //   ★spread であること自体を断言する=個別列挙で作り直して寸法を落とす退行を止める
    //   ([[venue-mirror-is-the-primary-path-2026-08-01]] の再発類型)。
    expect(popupSrc).toMatch(/_laneDomSelfLast = \{\n\s*\.\.\.laneDomSelf,/);
    // ★publish は控えた実測値を渡す（幾何の突合が壊れないことの担保）。
    const publishAt = popupSrc.indexOf('publishLaneMirror({');
    expect(publishAt).toBeGreaterThan(-1);
    expect(popupSrc.slice(publishAt, publishAt + 300)).toMatch(/domSelf:\s*_laneDomSelfLast/);
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

  /*
   * ★v0.1.1284(venue-exact-parity-SPEC-2026-08-07 §14-2): 受領証の組み立てを純関数
   *   buildVenueSceneReceipts へ移したので、旧テスト(buildSceneEnvelope の呼び出しの形を
   *   丸ごと正規表現で固定していた)は【正しいリファクタなのに赤】になった。
   *   これは [[wiring-test-must-assert-counts-2026-08-04]] が警告する
   *   「テストが正しいリファクタで赤になったら書き方を固定していないか疑う」の実例なので、
   *   実装を戻すのではなくテストを新しい配線へ書き換える。
   *   ★書き換え後、変異(`if (false)` 前置・自己代入への差し戻し)で赤を確認済み。
   */
  it('venueBar が受領証を純関数(buildVenueSceneReceipts)で組み、sceneReceipt として渡している', () => {
    expect(venueBarSrc).toMatch(
      /import\s*\{\s*laneDomFingerprint,\s*buildVenueSceneReceipts,\s*compareRenderReceipts\s*\}\s*from\s*'\.\.\/lib\/laneSceneEnvelope\.js'/
    );
    // ★数で断言する(存在の断言だと片方だけ壊す変異を通す)。定義は lib 側なので venueBar では
    //   呼び出し1箇所のみが正しい。
    const calls = venueBarSrc.match(/buildVenueSceneReceipts\(/g) || [];
    expect(calls.length).toBe(1);
    // ★4つの入力が【別々の起点】から渡っていることを、アンカー付きで1つの塊として固定する。
    //   acceptedSnap(最新受理) と paintedSnap(実際に描いた鏡)が同じ変数に化けたら赤。
    expect(venueBarSrc).toMatch(
      /const sceneReceipts = buildVenueSceneReceipts\(\{\n\s*acceptedSnap: laneMirrorSnap,\n\s*paintedSnap: lanePaintSnap,\n\s*paintedBuckets: laneBuckets,\n\s*venueDomFingerprint: _venueDomFingerprintLast\n\s*\}\);/
    );
    // ★無条件文であること(`if (false)` 等の前置で死んでいないこと)を前後アンカーで固定する。
    expect(venueBarSrc).toMatch(
      /\}\);\n\s*sceneReceiptDiag = sceneReceipts\n\s*\? compareRenderReceipts\(sceneReceipts\.popReceipt, sceneReceipts\.venueReceipt\)\n\s*: null;/
    );
    expect(venueBarSrc).toMatch(/sceneReceipt:\s*sceneReceiptDiag/);
  });

  it('★旧インライン組み立て(C1自己代入)の残骸が存在しない', () => {
    // venueReceipt の revision に pop 側の値を渡す形=比較が恒真になる書き方。
    expect(venueBarSrc).not.toMatch(/surface:\s*'venue',\s*\n\s*revision:\s*popEnvelope\.revision/);
    // 受領証の直接組み立て自体が venueBar から消えていること(純関数に一本化)。
    expect(venueBarSrc).not.toMatch(/buildRenderReceipt\(/);
    expect(venueBarSrc).not.toMatch(/buildSceneEnvelope\(/);
  });

  it('★会場実DOMの指紋を census の生値(summarize前)から採っている', () => {
    // summarize(venueDomCensusToParityDom)は keys 列を落とすので、生値を1変数受けしてから渡す。
    expect(venueBarSrc).toMatch(/const rawCensus = collectVenueLaneDomCensus\(\{/);
    expect(venueBarSrc).toMatch(
      /_venueDomFingerprintLast = laneDomFingerprint\(\{\n\s*link: rawCensus\.perSection\?\.link\?\.keys,/
    );
    expect(venueBarSrc).toMatch(/domSummary = venueDomCensusToParityDom\(rawCensus\);/);
    // census 失敗時は指紋も捨てる(古い指紋で✅を名乗らない=fail-closed)。
    expect(venueBarSrc).toMatch(/domSummary = null;\n\s*\/\/[^\n]*\n\s*_venueDomFingerprintLast = '';/);
  });

  it('★①側が実DOMのキー列指紋を鏡へ同梱している(popup-entry)', () => {
    expect(popupSrc).toMatch(
      /import\s*\{\s*measureLaneDomSelf,\s*perTierKeysOf\s*\}\s*from\s*'\.\.\/lib\/laneDomSelfMeasure\.js'/
    );
    // paint 直後の控えに指紋と内容アドレスが載ること(アンカーは代入の塊ごと固定)。
    expect(popupSrc).toMatch(
      /_laneDomSelfLast = \{\n\s*\.\.\.laneDomSelf,\n[\s\S]{0,400}?fingerprint: laneDomFingerprint\(perTierKeysOf\(laneDomSelf\)\),\n\s*fingerprintFor: _lastPublishedLaneMirrorHash\n\s*\};/
    );
    // publish が「この publish の内容アドレス」を控えること(無条件文であることまで固定)。
    expect(popupSrc).toMatch(
      /_lastPublishedLaneMirrorHash = String\(snap\?\.contentHash \|\| ''\);\n\s*mergeAndScheduleFlush\('lane',/
    );
    // ★リサイズ時は控えを捨てる(内容アドレスで検出できない唯一の経路=§6-3)。
    expect(popupSrc).toMatch(/window\.addEventListener\('resize', \(\) => \{\n\s*_laneDomSelfLast = null;\n\s*\}\);/);
  });

  it('★鏡の normalizeDomSelf が指紋3フィールドを保存する(個別列挙で落とさない)', () => {
    expect(laneMirrorSrc).toMatch(/measuredAt: nonNegativeMetric\(source\.measuredAt, true\)/);
    expect(laneMirrorSrc).toMatch(/fingerprint: String\(source\.fingerprint \|\| ''\)/);
    expect(laneMirrorSrc).toMatch(/fingerprintFor: String\(source\.fingerprintFor \|\| ''\)/);
  });

  it('★席なし件数(unseated)が既存の1行に併記され diag にも載る', () => {
    // 既存ループの分岐で数える(新規ループを作らない)。
    expect(venueBarSrc).toMatch(/if \(!Number\.isInteger\(seatIndexRaw\) \|\| seatIndexRaw < 0\) \{ unseatedThisPaint \+= 1; continue; \}/);
    expect(venueBarSrc).toMatch(/_venueUnseatedCount = unseatedThisPaint;/);
    // ★状態速報へ届く経路=laneParity.line への併記(aiShareFullText が出すのは line だけ)。
    expect(venueBarSrc).toMatch(/line: `\$\{laneParityDiag\.line\} \/ 席なし\$\{_venueUnseatedCount\}`/);
    expect(venueBarSrc).toMatch(/unseated: _venueUnseatedCount/);
    expect(seatsDiagSrc).toMatch(/unseated: Math\.max\(0, Math\.floor\(num\(d\.unseated, 0\)\)\)/);
  });

  it('venueSeatsDiag が sceneReceipt を検証済みの軽量形(match/line)だけ通す', () => {
    expect(seatsDiagSrc).toMatch(/sceneReceipt:\s*\/\*\* @type \{VenueSeatsDiagState\['sceneReceipt'\]\} \*\//);
    expect(seatsDiagSrc).toMatch(/const sceneReceipt = srIn \?/);
  });

  it('aiShareFullText が sceneReceipt.line を状態速報に出している', () => {
    expect(aiShareSrc).toMatch(/venueSeatsDiag\)\?\.sceneReceipt\?\.line/);
  });

  it('laneSceneEnvelope.js に純関数が実在する(v0.1.1284で指紋2関数を追加)', () => {
    expect(laneSceneEnvelopeSrc).toMatch(/export function laneSceneContentHash\(/);
    expect(laneSceneEnvelopeSrc).toMatch(/export function buildSceneEnvelope\(/);
    expect(laneSceneEnvelopeSrc).toMatch(/export function buildRenderReceipt\(/);
    expect(laneSceneEnvelopeSrc).toMatch(/export function compareRenderReceipts\(/);
    expect(laneSceneEnvelopeSrc).toMatch(/export function laneDomFingerprint\(/);
    expect(laneSceneEnvelopeSrc).toMatch(/export function buildVenueSceneReceipts\(/);
  });

  it('★compareRenderReceipts が指紋分岐を持つ(指紋差=🔴 / 片方空=⚪ match:false)', () => {
    // 「DOMを写さない✅」を構造的に出せなくする分岐。無条件文であることを前後アンカーで固定する。
    expect(laneSceneEnvelopeSrc).toMatch(
      /const popFp = String\(popReceipt\.domFingerprint \|\| ''\);\n\s*const venueFp = String\(venueReceipt\.domFingerprint \|\| ''\);\n\s*if \(!popFp \|\| !venueFp\) \{/
    );
    expect(laneSceneEnvelopeSrc).toMatch(/指紋未計測/);
    expect(laneSceneEnvelopeSrc).toMatch(/if \(popFp !== venueFp\) \{/);
  });

  it('★buildVenueSceneReceipts の両辺が別の入力から出る(C1自己代入を型で殺す)', () => {
    // pop = acceptedSnap 起点 / venue = paintedSnap 起点。同じ変数に化けたら赤。
    expect(laneSceneEnvelopeSrc).toMatch(/revision: Number\(acceptedSnap\.capturedAt\) \|\| 0,/);
    expect(laneSceneEnvelopeSrc).toMatch(/revision: Number\(paintedSnap\.capturedAt\) \|\| 0,/);
    // ①が焼いた contentHash を読む(C3) / 会場側は paintedBuckets から再計算する(C2)。
    expect(laneSceneEnvelopeSrc).toMatch(/const popContentHash = String\(acceptedSnap\.contentHash \|\| ''\);/);
    expect(laneSceneEnvelopeSrc).toMatch(
      /const venueContentHash = laneSceneContentHash\(\/\*\* @type \{any\} \*\/ \(inp\.paintedBuckets\)\);/
    );
    // fingerprintFor(内容アドレス)ゲート。時計比較へ化けたら赤。
    expect(laneSceneEnvelopeSrc).toMatch(/fingerprintFor && fingerprintFor === popContentHash/);
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
