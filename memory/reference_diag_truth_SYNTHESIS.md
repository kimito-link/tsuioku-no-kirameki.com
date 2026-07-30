# 設計正本: 診断の正確性=実画面の真実を写す計器(すべての不具合が写る)

- 設計=Fable(claude-fable-5) / 裏取り=司令塔(Opus) / 2026-07-10
- 3段構えワークフロー(会議5体→Fable設計→実装引き継ぎ)の手順2産物
- 実装ハンドオフ: [HANDOFF-diag-truth-IMPL.md](../HANDOFF-diag-truth-IMPL.md)
- 契機の実事例: 会場一致計器が✅なのに実画面の会場たぬ姉が明らかに多く見える(2026-07-10実機・v0.1.1112)。確定原因=計器はデータ同士の突合で実DOMを数えていない+「会場一致」が診断レジストリ未登録(完全性スコアの盲点)。
- 前提設計: [reference_pop_venue_exact_SYNTHESIS.md](reference_pop_venue_exact_SYNTHESIS.md)(会場=①厳密一致v2・v0.1.1112実装済み)
- 司令塔注: venueLaneParity.js はランタイムimportゼロの葉lib=renderStoryUserLaneDom からの import は循環なし(裏取り済み)。

---

(以下、Fable設計書全文)

# 設計書: 診断の正確性=実画面の真実を写す計器(すべての不具合が写る)

作成: claude-fable-5 / 2026-07-10 / 対象: feat/venue-lane-mirror-parity(v0.1.1112 実装済みの上)
位置づけ: reference_pop_venue_exact_SYNTHESIS.md(会場=①厳密一致v2)の続編。v2 が「鏡データ=段割当データ」の2点突合を確立した。本設計はその上に**実DOM census を重ね、3点(鏡データ=段割当データ=段実DOM)一致で初めて✅**にする。核心思想=「✅の根拠をデータからDOMへ」。

実在確認済みの改修点(本文引用は実読): venueBar.js リセットループ:4076-4094(visibleSeatIndexSet 内の席は detach されない=幽霊の温床)・parity組み立て:4116-4141(painted=laneBuckets のデータ列=実DOMを一度も数えていない)・paintVenueLobby:3910-3949・席装飾ループ:4176-4218・seatsDiagObs:4245-4270・publishVenueSeatsDiag:4285(3秒min-gap判定 `_venueSeatsDiagLastWriteAt`:4289)・wrapTileEl 素通し(-1→裸タイル):4157-4168・`.nlsb-seat.nlsb-is-empty{display:none}`:1344。renderStoryUserLaneDom.js fillLaneTier:260-297(diff-skip:271・`dataset.thumb`:287・**storyLaneTierBodyKey:157 に _venueSeatIndex が入っていない**=席が動いてもdiff-skipする幽霊機構の裏取り)。personTileDom.js:12-16(凍結ガード=1バイトも変えない)。storyUserLaneRenderProbe.js:53(domTilesPainted=①の実DOM計数先例・:16「観測であって描画を変えない」)。venueLaneParity.js buildVenueLaneParity:92/toVenueLaneParityDiag:271。venueSeatsDiag.js buildVenueSeatsDiagSnapshot:84(laneParity検証:110-120)。healthCells.js 会場セル:245-282。diagnosisRegistry.js:79-83(**「会場一致」未登録の穴を確認**)・completenessScore.js:76(`if (!meta) continue`=登録漏れは黙って消える)。aiShareFullText.js:231(vpLine=テキスト1行のみの現状)。配線テスト先例=src/lib/venueLaneParity.wiring.test.js。

---

## A. 理想の体験フロー(受け入れ基準)

1. **画面がおかしければ、状態速報の1行が必ず🔴で、真犯人の名前まで言う。** 実事例(たぬ姉が154より明らかに多い)なら:
   `会場一致 🔴鏡(4s前) link15 gift0 ad10 konta0 tanu154 / ロビー4(暫定0) / DOM≠ tanu:可視204(データ154 裸50) / 重複0 迷子0 / 未説明50(tanu:DOM余50)`
   → 「裸50」=素通し裸タイルのdiff-skip残留、と1枚で確定(往復ゼロ)。
2. **✅なら画面も必ず正しい。** ✅の新定義=「鏡データ=段割当データ=段実DOM」の3点一致(件数・集合)+ロビーもDOM一致+重複0+迷子0+空可視0。DOMを測れなかったとき(census例外等)は✅を名乗れない(⚪「DOM未計測」・fail-closed)。
3. **見えない異常も隠さない。** 幽霊席(display:noneで中身持ち)は✅を壊さないが `幽N` として必ず併記(消し残り予備軍)。群衆Canvasの人数・額縁(charFrame)の枚数も同じ行系に出る=「顔が多く見える」4容疑者(幽霊/裸タイル/Canvas/額縁)が全員写る。
4. **完全性スコアが嘘をつかない。** 「会場一致」がレジストリに載り、🔴ならスコア100%が構造的に不可能になる(現状の盲点 f を閉じる)。
5. **重さゼロ体感。** DOM計数は既存の3秒min-gap(publishVenueSeatsDiag)に同期して走る=3秒に1回・数百ノードのquerySelectorAll(サブms)。hot path(paint)・storage read/write のキー数は不変。

---

## B. 統合アーキテクチャ(コンポーネント4個)

```
[K1 鍵の刻印]  fillLaneTier(共有lib・dataset.thumbの隣)+paintVenueLobby(venue側)
               tileEl.dataset.userKey = venueLaneParityKey(item)   ※personTileDomは不触(凍結)
                        │ (①と会場の両タイルに恒久刻印=Phase2の①censusにもそのまま効く)
                        ▼
[K2 census収集] 新規 src/lib/venueDomCensus.js: collectVenueLaneDomCensus(venueLaneEls, lobbyList, extras)
               renderSeats 内・席装飾ループ直後・publish期日(3秒min-gap)のときだけ同期実行
               → 生の実DOM計数(段別 可視/幽/裸/空可視/無鍵+key列, ロビー, 迷子, 額縁/Canvas)
                        │ (同一同期フレーム=paintに使った laneBuckets/lobbyItems と突合可能・TOCTOU無し)
                        ▼
[K3 三面判定]  buildVenueLaneParity v3(venueLaneParity.js・純関数)に dom 入力を追加
               鏡データ(snap) ⇄ 段割当データ(painted) ⇄ 段実DOM(census) の3点一致で✅
                        │
                        ▼
[K4 出力配線]  venueSeatsDiag.laneParity(既存キー・+dom要約 数十B〜1KB)
               ├→ aiShareFullText:231(1行トークン・既存流路)
               ├→ healthCells 新セル venue-parity → diagnosisRegistry 登録 → completenessScore
               └→ 会場「🩺状態」パネル(既存 _lastVenueSeatsDiagObs 経由・変更ゼロで追随)
```

タイミングは会議決着どおり **rAF/MutationObserver不要**: renderSeats は完全同期で、席装飾ループ後が「この paint の最終形」。diff-skip した段も前回DOMが有効なまま残っているので、そこを数えた値こそが「いま画面に見えているもの」の真実。

---

## C. 具体機構

### C-1. K1 鍵の刻印(必答論点3の裁定)

**置き場所は fillLaneTier(共有lib)+paintVenueLobby(venue側)の2箇所。venue側のみ案は却下。**

- fillLaneTier(renderStoryUserLaneDom.js:287 の `dataset.thumb` の直後・同じ try 内):
  ```js
  tileEl.dataset.userKey = venueLaneParityKey(p); // '' なら無鍵(uid無し広告主等)
  ```
  venueLaneParityKey は venueLaneParity.js:30 の純関数(uid→`u:xxx`、無ければ`c:idLine|title`)。renderStoryUserLaneDom → venueLaneParity の import は葉lib同士で循環なし。
- paintVenueLobby(venueBar.js:3933 の buildPersonTileEl 直後)に同じ1行。
- 根拠: (i) personTileDom は凍結(1バイトも変えない・:12-16)=呼び出し側で付けるしかない。(ii) fillLaneTier は既に dataset.thumb を付けている確立済みの場所=同型追加。(iii) ①の段も同じ関数を通る=Phase2(①census)で追加作業ゼロ。(iv) storyLaneTierBodyKey(:157)に dataset は入らない=diff-skip のkey揺れを作らない。(v) PII非増加: タイルの title は既に `${p.title} | ${fullUid}` を持つ(personTileDom.js:83)=uid はDOM上に既出。

### C-2. K2 census 収集(新規 src/lib/venueDomCensus.js・必答論点1)

DOMを読むが chrome 非依存(要素を引数で受ける)=jsdomで単体テスト可能。**数えるだけ・1ノードも触らない**(storyUserLaneRenderProbe.js:16 の掟)。

```js
collectVenueLaneDomCensus({ laneEls: {link,gift,ad,konta,tanu}, lobbyList, stackEl, extras })
→ {
    perSection: { link|gift|ad|konta|tanu|lobby: {
      visible: number,       // 見えているタイル数 = .nlsb-seat:not(.nlsb-is-empty) 内のタイル + 裸タイル
      ghost: number,         // .nlsb-seat.nlsb-is-empty かつ childElementCount>0(display:none の消し残り)
      bare: number,          // 親が段el直下の裸 .nl-story-userlane-cell(.nlsb-seat管理外=リセットループ対象外)
      visibleEmpty: number,  // 席は可視なのにタイルが無い(白円空白の再演検出=venue-thumb同型)
      unkeyed: number,       // dataset.userKey が無い/空の可視タイル(重複判定の対象外・期待値0)
      keys: string[]         // 可視タイルの userKey 列(DOM文書順・重複判定の材料。storageへは出さない)
    }},
    strays: number,          // stackEl 配下だが5段のどれにも属さない .nl-story-userlane-cell(迷子)
    charFrameTiles: number,  // 額縁レイヤーの img 枚数(childElementCount 1読み・容疑者④)
    crowdOn: boolean, crowdCount: number  // 群衆Canvas 表示中か+描画人数(容疑者③・既存変数を渡すだけ)
  }
```

判定方法の要点: 可視性は **class の有無のみ**で判定(`.nlsb-is-empty` は :1344 で display:none の正本)。getComputedStyle は1回も呼ばない(500席×3秒でも重くしない)。topBar・roster・吹き出しは走査スコープ外(stackEl+lobbyList のみ)=誤カウントしない。

重複の集計(census の keys から純関数 `countVenueKeyDuplicates(perSection)` で算出):
- `dupIntra`: 同一段内で同じ key が2回以上(席index churn の二重占有)
- `dupCross`: 段×段の横断重複
- `dupLaneLobby`: 段×ロビーの二重在籍(**実DOM版**。v2 の lobbyInMirror はデータ版=両方残す)

**「たぬ姉過剰」実事例の犯人特定表**(この内訳で4容疑者が一意に割れる):

| 状態速報の症状 | 真犯人 |
|---|---|
| `tanu:可視204(データ154 裸50)` | 【高】素通し裸タイルのdiff-skip残留(wrapTileEl:4162 の -1 素通し) |
| `tanu:可視204(データ154)` で裸0・重複50 | 【高】段のdiff-skip時の前回席タイル残留(bodyKey:157 に席indexが無い) |
| 可視=データ一致だが `幽30` | 幽霊(今は不可視・mirror→fallback切替で顕在化する予備軍) |
| 可視=データ一致+`群衆Canvas on(154)` | 【中低】Canvas シルエットを「顔」と目視誤認(または過小/過大描画) |
| 可視=データ一致+`額縁12` | 【低】charFrame の顔散らばり(廃止要望の対象) |
| `tanu:空可視3` | 白円空白の再演(venue-thumb-missing 同型) |

### C-3. K3 三面判定(venueLaneParity.js の v3 差分・必答論点2)

buildVenueLaneParity の入力に `dom`(C-2の出力から keys を落とした要約+重複集計)を追加。**✅の判定式 v3**:

```
v2の全条件(mirror ∧ 鏡fresh ∧ 全段 drawn.length===pop.length ∧ prefixOk ∧ unexplained===0
           ∧ !mirrorPruned ∧ lobbyInMirror===0)
∧ dom.measured===true                                  … DOM未計測なら✅を名乗れない(fail-closed)
∧ 全段 dom.visible === painted.length                   … 段割当データ=段実DOM(件数)
∧ dom(lobby).visible === lobbyKeys.length               … ロビーも実DOM一致
∧ dupIntra+dupCross+dupLaneLobby === 0                  … 二重在籍なし(実DOM)
∧ strays === 0 ∧ 全セクション visibleEmpty === 0 ∧ unkeyed === 0
```

- DOM過剰(`visible > painted.length`)は差分を unexplained に計上(サンプル `${tier}:DOM余${n}`)、DOM欠落は `${tier}:DOM欠${n}`。**ghost は verdict に影響させない**(不可視だから。必答論点5)。
- 集合突合は「件数+重複+無鍵0」で実質担保する。**順序のDOM突合はしない**: 段DOMは fillLaneTier:291 の replaceChildren 一括差替のみで構築され、データ順とDOM順が乖離する経路が存在しない=過剰設計回避。
- **①と③への波及(Phase分割)**: MVP は会場のみ。①は Phase2 で storyUserLaneRenderProbe に `laneDomCounts`(段別 childElementCount)を足し buckets と突合。③は Phase3 で paintLaneMirror(app/live-view.js)paint後に同型計数。**判定純関数(K3)は3画面共通で再利用**できる形(入力=painted keys+dom census)にしておく。

**line v3**(状態速報1行・aiShareFullText:231 の既存流路のまま):
```
✅時: 会場一致 ✅鏡(4s前) link15 gift0 ad10 konta0 tanu154 / ロビー4(暫定0) / DOM=データ(幽3) / 未説明0
🔴時: 会場一致 🔴鏡(4s前) link15 gift0 ad10 konta0 tanu154 / ロビー4(暫定0) / DOM≠ tanu:可視204(データ154 裸50) / 重複0 迷子0 / 未説明50(tanu:DOM余50)
付帯(>0のときだけ末尾): / 群衆on(154) / 額縁12 / 無鍵2 / 空可視1
```

### C-4. K4 出力配線(スキーマ+レジストリ・必答論点4)

**venueSeatsDiag.laneParity の拡張**(storage 新キー禁止を遵守・既存キー内・+数十B〜1KB):
```js
laneParity: { mode, verdict, line, unexplained, mirrorAgeSec, lobby,   // 既存
  dom: { measured: boolean, ghost: number, bare: number, visibleEmpty: number,
         unkeyed: number, dupIntra: number, dupCross: number, dupLaneLobby: number,
         strays: number, charFrame: number, crowdOn: boolean, crowdCount: number } | null }
```
段別の詳細数値は storage に常設しない(不一致段は line のサンプルに必ず出る)。keys 列は storage に出さない(PII/容量)。

**publish 期日ゲート**(3秒に1回制約の担保): renderSeats の parity ブロックを「publish 期日のときだけ census+parity を組む」に変える:
```js
const diagDue = nowMs() - _venueSeatsDiagLastWriteAt >= 3000;
// …席装飾ループの後:
if (diagDue) { census = collectVenueLaneDomCensus(...); laneParityDiag = toVenueLaneParityDiag(buildVenueLaneParity({ ...v2入力, dom: census要約 })); }
else laneParityDiag = _lastVenueSeatsDiagObs?.laneParity ?? null;  // 期日外は前回値を保持(明滅させない)
```
census が席装飾ループの**後**に移ることで「装飾済みの最終DOM」を数える(TOCTOU は同一同期フレームで不変)。

**レジストリ統合(穴 f を閉じる)**:
1. healthCells.js に新セル `venue-parity`(会場一致): ✅→ok / 🔴→bad(detail=unexplainedと主犯サンプル) / ⚪→na(reason・嘘の赤にしない)。laneParity===null(会場未使用)はセルを出さない。
2. diagnosisRegistry.js に `reg('venue-parity', '会場一致', 'venue', 2, false)`。
3. completenessScore.test.js の網羅テストに venue-parity セルを発生させる入力を追加(v0.1.1054の轍)。
4. **「計器の盲点欄」は最小実装**: venueDomCensus.js ヘッダに「測るもの/測らないもの」を宣言(測らない=透明オーバーレイ越しの背景・topBar・吹き出し・Canvasのピクセル内容)+スコープ固定テスト(スコープ外要素を混ぜた fixture で数に入らないことを assert)。実行時UIには足さない。

**wiring test**(教訓e): venueLaneParity.wiring.test.js に同型追加 — venueBar.js ソースに `collectVenueLaneDomCensus(`・`dom:` 受け渡し・`dataset.userKey`(renderStoryUserLaneDom.js/venueBar.js 両方)の存在 assert。

---

## D. 偽陽性潰し(全条件)

**嘘の緑を出さない**:
1. ✅は3点一致+DOM計測成功が前提。census が throw したら `dom.measured=false` → ⚪「DOM未計測」(fail-closed)。
2. 可視の定義は「リセットループが付け、装飾ループが外す `.nlsb-is-empty`」と同一の正本=描画側と診断側で「見えている」の定義が割れない。
3. 裸タイル(bare)は nlsb-is-empty 管理外=常に可視カウント→過剰は必ず未説明に出る。
4. 無鍵(unkeyed)>0 は✅ブロッカー(検証できないものに緑を出さない)。
5. visibleEmpty>0 は✅ブロッカー(白円の再演を✅のまま通さない)。
6. データ側の v2 全条件は不変で残す=DOM census は**上乗せ**であり置換ではない。

**嘘の赤を出さない**:
1. 幽霊(display:none)は verdict に不算入・`幽N` 併記のみ。
2. 群衆Canvas・額縁は判定外の**参考値**。透明オーバーレイ越しに透ける背景ページは拡張のDOM外=計器の対象外(ヘッダに明記)。
3. 期日外 paint では前回 laneParityDiag を保持(明滅防止)。
4. fallback モードは従来どおり常に⚪。census 数値は fallback でも参考収集して line に出す(会場単独の白円/迷子はモード無関係に写る)。
5. 拡張リロード直後は content script 再注入でDOMが作り直される=旧タイル(dataset無し)の無鍵🔴経路は存在しない。
6. 別配信の残骸ガード(liveId 突合)は不変。

---

## E. MVP と Phase 分割(機械的完了判定つき)

| Phase | 内容 | 機械的完了判定 |
|---|---|---|
| **MVP(1 patch)** | K1 dataset.userKey(fillLaneTier+paintVenueLobby)+K2 venueDomCensus.js+K3 parity v3(dom入力+line v3)+K4(venueSeatsDiag拡張・期日ゲート・healthCells venue-parityセル・registry登録・wiring test) | `npm run verify:cc` 全緑。単体テスト: (i)census fixture=幽/裸/空可視/無鍵/重複/迷子/スコープ外除外 各1本 (ii)parity v3=「データ一致+DOM過剰→🔴 DOM余サンプル」「3点一致→✅」「census欠落→⚪DOM未計測」「幽のみ→✅+幽N」 (iii)registry網羅テストが venue-parity を通す。**実配信の受け入れ**: 状態速報1枚で実事例(たぬ姉過剰)の行が🔴+主犯内訳を明示=真犯人特定が往復ゼロで完了。reality-checker: ✅時に①と会場の並べ見比べで実画面も一致 |
| **Phase 2 ①census** | storyUserLaneRenderProbe に段別 laneDomCounts+K3 判定関数の再利用で①の buckets⇄実DOM 突合 | ①のトークンに段別 DOM=データ 判定・既存 domTilesPainted と総和一致のテスト |
| **Phase 3 ③WEB census** | app/live-view.js paintLaneMirror 後に同型計数→jsonBlob 既存フィールドに同梱(R-1遵守) | ③トークンに鏡=③実DOM 判定・3画面すべてが「実DOMで✅」 |
| **Phase 4 群衆過小の裏取り** | totalAnonymous 過小疑い(excludeKeys=visibleSeatKeys)を crowdCount 計器実測を根拠に別途修正 | 実配信で crowdCount と「ほかN人」の期待値一致 |

**charFrame(額縁)廃止 = MVP直後の独立1 patch と裁定**(必答論点6)。理由: 計器(観測)と機能削除(挙動変更)を混ぜると実事例の切り分けが交絡。MVPの `額縁N` 計器が先に入れば、廃止patchの効果(N→0)を同じトークンで検証できる=**正しい順序は計器→廃止**。

storage 増分: 全Phase通してキー増ゼロ。MVP は venueSeatsDiag.laneParity.dom の+数十B〜1KB のみ。

---

## F. 捨てた案と理由

1. MutationObserver 常駐/rAF後計測 — renderSeats は完全同期・装飾ループ後が最終形(Explore決着)。常駐オブザーバは hot path 汚染リスク。
2. Canvas getImageData/bounding-box 重なり検出 — 「見え方」の完全証明は際限がない。タイルDOMの3点一致+件数併記で実用上足りる。
3. personTileDom.js に data-user-id — 凍結ガード違反。呼び出し側刻印で同じ効果。
4. title/idLine テキスト parse で key 復元 — 表示文言変更で計器が黙って壊れる。刻印が正。
5. 毎paint census — 3秒期日ゲートで診断価値は不変(状態速報自体が3秒粒度)。
6. DOM順序の突合 — replaceChildren 一括構築のみで順序乖離の経路が無い。件数+重複+無鍵0で十分。
7. 幽霊の自動掃除の同梱 — 計器が主題。掃除は census 実測で必要性確認後の別patch(消した回数計器とセット・教訓c)。
8. census 専用の別レジストリセル — 真実の源泉が二重化し矛盾表示が可能になる。venue-parity 1セルに統合。
9. storage 新キー/keys列の保存 — 制約違反+PII。
10. 実行時の「盲点欄」UI常設 — 恒常ノイズ。正本はコードヘッダ+スコープ固定テスト。

---

## G. 地雷と回避策(教訓a〜f への対応)

- (a) ✅は実値突合で初めて本物: ✅の根拠に「段実DOM」を必須化。DOM未計測は✅を名乗れない。
- (b) TOCTOU: census は renderSeats の同一同期フレーム内・paintに使った laneBuckets/lobbyItems と突合・新規readゼロ。
- (c) 消す側に計器: MVPは消さない(観測のみ)。掃除を足す日は sweptCount を必ず同梱。lobbyResetCount 不変。
- (d) 新規read禁止: 書き込みは venueSeatsDiag 既存キーの3秒min-gap同梱のみ。status側は既存12秒extras経路。
- (e) 配線忘れ=CI赤: wiring test に census/dom/dataset.userKey の存在assert。registry網羅テスト+completenessScoreテスト入力をセットでコミット。
- (f) レジストリ登録漏れ: venue-parity 登録がMVP必須成果物。
- 追加1(diff-skipとdatasetの整合): dataset.userKey は storyLaneTierBodyKey に入れない(key揺れを作らない)。
- 追加2(会場パネルの相対時計): census は時刻を持たない。lastUpdateAt の壁時計規約に触らない。
- 追加3: reality-checker 実行中は commit しない。commit後は中身確認(`git show HEAD:src/lib/venueDomCensus.js | grep collectVenueLaneDomCensus`)。

**実装役への申し送り**: 着手は K2+K3 の純関数からTDD(fixture=実事例: データ tanu154+裸50 のDOM→🔴`tanu:可視204(データ154 裸50)`)。venueBar.js の差し替えは「diagDue化・census呼び出し・seatsDiagObs の laneParity 差し替え」の3点+K1の2行に閉じる。1変更=1 patch bump・verify:cc・reality-checker を出荷ゲートに。反映3手順を push 報告のたびに併記。
