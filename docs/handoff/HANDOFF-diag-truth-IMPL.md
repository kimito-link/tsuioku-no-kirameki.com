# 実装ハンドオフ: 実DOM census=診断の正確性(v0.1.1113〜)

> ✅ **実装完了(2026-07-10)**: MVP=v0.1.1113(caa58e92)+額縁廃止=v0.1.1114(ef5e13be)。
>   feat/venue-lane-mirror-parity に push済・reality-checker pass・copy:ext済。
>   残=実機確認(拡張リロード→状態速報の「会場一致」行)→masterマージ→Phase2以降(設計正本§E)。
> この1枚だけで着手できる。設計正本=[memory/reference_diag_truth_SYNTHESIS.md](memory/reference_diag_truth_SYNTHESIS.md)(Fable設計・司令塔裏取り済み・2026-07-10)。
> 前提=v0.1.1112(厳密一致v2=ロビー隔離)実装済み・ブランチ feat/venue-lane-mirror-parity の続き。

## 背景(1分)
- 実機で「会場一致✅なのに会場たぬ姉が明らかに多く見える」が発生。確定原因=計器は**データ同士の突合**で実DOMを数えていない+「会場一致」が診断レジストリ未登録(完全性スコアの盲点)。
- 解=**実DOM census**(段別の実タイル数・幽霊/裸タイル/空可視/無鍵/重複/迷子)を renderSeats 同期末尾で数え、**「鏡データ=段割当データ=段実DOM」の3点一致で初めて✅**(Tri-Parity)。「たぬ姉過剰」の真犯人(裸タイルdiff-skip残留/席タイル残留/Canvas/額縁)が状態速報1枚で名指しされる。

## スコープ(MVPのみ・1 patch)

1. **K1 鍵の刻印(2行)**: `renderStoryUserLaneDom.js` fillLaneTier の `dataset.thumb`(:287)直後に `tileEl.dataset.userKey = venueLaneParityKey(p);`(venueLaneParity.js:30 の純関数を import・ランタイムimportゼロの葉lib=循環なし)。`venueBar.js` paintVenueLobby の buildPersonTileEl 直後にも同じ1行。**storyLaneTierBodyKey(:157)には入れない**(diff-skipのkey揺れ禁止)。
2. **K2 census(新規 src/lib/venueDomCensus.js・純関数・jsdomテスト)**: `collectVenueLaneDomCensus({laneEls, lobbyList, stackEl, extras})` → 段別 {visible, ghost(.nlsb-is-empty かつ中身あり), bare(裸.nl-story-userlane-cell), visibleEmpty, unkeyed, keys} + strays + charFrameTiles + crowd。可視判定は class のみ(getComputedStyle禁止)。**数えるだけ・1ノードも触らない**。`countVenueKeyDuplicates(perSection)` → {dupIntra, dupCross, dupLaneLobby}。ヘッダに「測るもの/測らないもの」を宣言+スコープ固定テスト。
3. **K3 parity v3(venueLaneParity.js差分)**: 入力に `dom` 追加。✅=v2全条件 ∧ dom.measured ∧ 全段 dom.visible===painted.length ∧ ロビーDOM一致 ∧ 重複0 ∧ strays0 ∧ visibleEmpty0 ∧ unkeyed0。DOM過剰/欠落は unexplained(`${tier}:DOM余${n}`/`DOM欠${n}`)。**ghost は verdict 不算入・`幽N`併記**。census欠落→⚪「DOM未計測」(fail-closed)。line v3 は設計正本 §C-3。
4. **K4 配線**: (a) venueBar.js renderSeats: parity組み立てを席装飾ループの**後**へ移動+`diagDue`(publishVenueSeatsDiag と同じ3秒min-gap式)のときだけ census+parity 実行・期日外は前回値保持(明滅防止) (b) venueSeatsDiag.laneParity に `dom` 要約(検証つき・keys列は保存しない) (c) healthCells 新セル `venue-parity`(✅→ok/🔴→bad/⚪→na・laneParity===nullはセル無し)+ diagnosisRegistry に `reg('venue-parity','会場一致','venue',2,false)` + completenessScore.test の入力追加 (d) wiring test 追記(census/dom/dataset.userKey の存在assert)。

## MVP完了判定(機械的)
- verify:cc 全緑。単体テスト: census fixture(幽/裸/空可視/無鍵/重複/迷子/スコープ外除外)・parity v3(データ一致+DOM過剰→🔴DOM余/3点一致→✅/census欠落→⚪/幽のみ→✅+幽N)・registry網羅テスト通過。
- 実配信: 状態速報1枚で「たぬ姉過剰」の行が🔴+主犯内訳(裸/重複/幽/Canvas/額縁)を明示=真犯人特定が往復ゼロ。
- reality-checker: ✅時に①と会場の並べ見比べで実画面も一致。

## MVP直後の独立patch(順序厳守)
- **charFrame(額縁)廃止**(ユーザー要望済み・保留中): venueBar.js の renderCharFrame 呼び出し(:4981相当「v0.1.777 額縁フレーム」)をフラグOFF化。**計器→廃止の順**(MVPの`額縁N`計器で廃止効果 N→0 を検証できる)。
- Phase 2(①census)/Phase 3(③census)/Phase 4(群衆totalAnonymous過小の裏取り→修正)は設計正本 §E。

## 地雷(必読)
- census は新規 storage read/write キーゼロ(venueSeatsDiag 同梱のみ・+~1KB)。3秒期日ゲート必須(毎paint禁止)。
- personTileDom.js は凍結(1バイトも変えない)。dataset は呼び出し側で。
- 幽霊の自動掃除はやらない(観測のみ)。掃除する日は sweptCount 計器とセット。
- TOCTOU: 診断時に storage を読み直さない(paintに使った laneBuckets/lobbyItems と同一同期フレームで突合)。
- reality-checker 実行中は commit しない。commit後は `git show HEAD:src/lib/venueDomCensus.js | grep collectVenueLaneDomCensus` で中身確認。
- 検証コマンドは `npm run verify:cc`(素の verify はハングしやすい)。push は pre-push フックが verify を回す=timeout 600秒。

## 転記元(実在確認済みパス)
- venueBar.js: リセットループ:4076-4094 / parity組み立て:4116-4141 / paintVenueLobby:3910-3949 / 席装飾ループ:4176-4218 / seatsDiagObs:4245-4270 / publishVenueSeatsDiag min-gap:4285-4289 / `.nlsb-is-empty{display:none}`:1344 / wrapTileEl素通し:4157-4168
- renderStoryUserLaneDom.js: fillLaneTier:260-297(diff-skip:271・dataset.thumb:287)・storyLaneTierBodyKey:157
- storyUserLaneRenderProbe.js:53(①の実DOM計数の先例=同型移植)
- venueLaneParity.js(buildVenueLaneParity/toVenueLaneParityDiag/venueLaneParityKey:30)・venueSeatsDiag.js(:84 builder)
- diagnosisRegistry.js(:79-83)・healthCells.js(:245-282 会場セル)・completenessScore.js(:76 登録漏れ防壁)・aiShareFullText.js(:231 line出力)
- wiring test の型: src/lib/venueLaneParity.wiring.test.js
