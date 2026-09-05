# reference_full_mirror_SYNTHESIS.md — ①POP「画面まるごと」→③WEB 丸写し 実装ハンドオフ設計書

> 段2(Fable設計)成果物。段1素材 = council/full-mirror-SYNTHESIS.md(会議は(c)ハイブリッド採用・
> DOMPurify/iframe/CSP緩和は司令塔が危険警告→本設計で実コード裏取りにより安全化)。
> 前段設計 = memory/reference_web_mirror_parity_SYNTHESIS.md(セクションレジストリ・第1号=応援タイムライン**実装済**)。
> この上に積む。**設計のみ・コードなし**。全行番号は 2026-07-07 時点
> (branch feat/robust-arch-phase0-instrument, commit 0517180a + 第1号実装後の working tree) の実読で裏取り済み。
> 出荷ゲートは `npm run verify:cc` 一本。

---

## 0. 実コード裏取りの結論(最重要・A後半の切り分け)

### ★会議(c)案の「重量パネル=①HTML同梱→③貼るだけ」枝は、実コード裏取りの結果【ほぼ全滅】。
### 来ていない5パネル全部が「純lib既存+コンパクトなデータ」で、第1号と同じ「鏡データ+③本物lib paint」に帰着する。

来ていない全パネルの①描画実体を実読した結果:

| パネル | ①paint 実体(popup-entry.js) | HTML/DOM を組む純lib(src/lib) | ①のデータ源 | ③host(live-view.html) |
|---|---|---|---|---|
| 投げ一覧 giftHistory | `refreshNorthStarGiftHistoryLaneAsync`:12061-12138 → `paintTopSupportRankStyleIntoElement`(:12114) + throwsTable innerHTML(:12125→`paintNorthStarGiftThrowsPanel`:12023-12038) | giftHistoryViewModel.js:16 / giftThrowLedgerTableHtml.js:148,181 / paintTopSupportRankStyleIntoElement.js | ctx = `computeGiftHistoryNorthStarRoomsContext`:11172-11396(storage 複数源→rooms≤10+メタ+throwsTableHtml) | **有** :10650(#northStarLaneBody-giftHistory)・:10686(#northStarLaneThrows-giftHistory) |
| 配信採点 broadcastScore | `renderBroadcastScorePanel`:4033-4085 → innerHTML | broadcastScorePanelViewModel.js:47(`buildBroadcastScorePanelViewModel`) + broadcastScoreHtml.js(`buildBroadcastScorePanelHtml`・依存はescapeHtmlのみ) | KEY_REPORT_PREVIEW / KEY_GIFT_EFFECT_DIAG / KEY_VOICE_DIAG / KEY_HIGHLIGHT_LEDGER / bgmPhaseカウンタ — **全部 status が extras で既読**(status-entry.js:582-616) | **無**(live-view.html は popup.html:12551-12559 追加前の古いコピー。§C参照) |
| セッション比較 | `renderSessionSummaryComparePanel`:3956-3988 → innerHTML | sessionSummaryCompareTableHtml.js(`buildSessionSummaryCompareTableHtml`) | IndexedDB 24行(popupローカル) | **有** :12213(#sessionSummaryCompareMount) |
| ギフトサイドバー履歴 | `renderGiftSubAppHistoryPanel`:4318-4357 → innerHTML | giftSubAppHistoryBlocksHtml.js(`buildGiftSubAppHistoryBlocksHtml`) | `nls_gift_subapp_history_<lv>`(60+件=重い) | **有** :12235(#giftSubAppHistoryMount) |
| 室温 roomHeat | `renderRoomHeatSummary`:9614-9624(スカラー4個を textContent/style) | 不要(数値4個) | popup-entry:12870-12901 で displayEntries から計算 | **有** :11515-11523(#roomHeatSummary/Meta/Fill/Note) |

つまり:
- **「命令的描画で純libが無いパネル」は今回1つも存在しない**(全部 C-7 pure refactor 済み=「rows→HTML は lib・read と innerHTML 代入だけ popup」構造)。
- 「ホストDOMすら無い」のは broadcastScore だけで、その真因はパネルの重さではなく **app/live-view.html が popup.html の手動コピー(v0.1.942・commit 4d92d443)のまま466行 drift** していること(§C で根治)。

### HTML同梱を採らない決定的理由(sanitize判定の答え)

1. **サーバー区間の信頼性**: jsonBlob は Vercel(/api/status)を往復する。**データ行は③の paint 時に lib 内 escapeHtml で不活性化される**が、HTML文字列はサーバー側の侵害/改ざんでそのまま XSS になる。既存 statusReport が安全なのは「①由来だから」ではなく **③が textContent で貼る**(live-view.js:581)から。innerHTML 行きの HTML 文字列を blob に足した瞬間、この安全モデルが壊れる。
2. **容量**: HTML文字列はデータ行の2〜5倍(タグ/クラス/属性込み)。448KB prune(pruneLiveViewPublishBlob.js:30)に正面から不利。
3. **既存資産**: sanitize は新依存不要。`escapeHtml/escapeAttr` の正本は `src/shared/html/escape.js`(htmlEscape.js は re-export)で、全 buildXxxHtml lib に配線済み。③が lib を呼ぶ限り **sanitize 工程そのものが不要**(escape はlib内で済む)。**DOMPurify・iframe sandbox・CSP緩和はすべて却下**(会議提案は不採用・司令塔警告どおり)。

### 新規約(fail-closed・地雷に追加)

> **R-1: サーバーを渡る jsonBlob に「innerHTML 行きの HTML 文字列」フィールドを新設しない。**
> 文字列を丸ごと運んでよいのは textContent で貼る場合のみ(statusReport 型)。
> パネルを③に出したければ「データ(JSON-safe rows)+③で同じ buildXxxHtml lib を呼ぶ」(第1号パターン)。
> 純libが無い命令的パネルが将来現れたら、HTML同梱に逃げる前に **C-7 型の lib 抽出を先にやる**(それが正道で、実際に全パネルがそうなっていた)。

---

## A. 全体アーキ

### A-1. 振り分け基準(3分岐・単純)

```
①のパネルを③に出したい
 ├─ 既に③に鏡が届いている(laneMirror/statCards/northStar2本/topSupporters/
 │   commentTimeline/lives/statusReport/supportTimeline第1号) → 【触らない】
 ├─ 鏡が来ていない
 │   ├─ ①の描画が「純lib(buildXxxHtml/paint lib)+データ」 → 【鏡データ+③libで描く】(第1号パターン)
 │   │    ※今回の5パネルは全部ここ
 │   └─ 純libが無い命令的描画 → 【まずC-7型でlib抽出】→ 上の枝へ合流
 └─ ③のhost DOMが無い → live-view.html の drift(§C-2)。パネル方式の問題ではない
```

### A-2. 送信路は既存2路線のみ(htmlPanels フィールドは作らない)

- **路線1(鏡バンドル)** — popup が持つデータ用:
  publishXxxMirror(popup-entry:7202/7223/7240/7263/7305 と同型) → `mergeAndScheduleFlush`(:7185-7199)
  → mirrorBundle SECTION_KEYS(mirrorBundle.js:35-41) → scheduler の legacy キー map
  (mirrorBundleFlushScheduler.js:32-36) → status extras read(12秒間引き) → jsonBlob フィールド
  (status-entry.js:1569-1595) → prune はしご(:1697) → ③ paintAllMirrors(live-view.js:524-542)。
- **路線2(status直載せ)** — status が既に extras で読んでいる値用(**read 追加ゼロ**):
  status-entry.js:582-616 の extras キャッシュ(reportPreview/giftEffectDiag/voiceDiag/bgmPhaseDiag/
  highlightLedger/scoreAnnounceDiag…)から jsonBlob へフィールドを足すだけ。broadcastScore はこれ。

### A-3. パネル別の方式決定と優先順

| 順 | パネル | 方式 | 理由 |
|---|---|---|---|
| 第2号 | 投げ一覧 giftHistory | 路線1(新バンドル節) | ユーザーが実配信で名指し。host既存。§B詳細 |
| 第3号 | 配信採点 broadcastScore | **路線2**(blobに既読5値を同梱→③が同じ2つの純libでVM+HTMLを組む) | read追加ゼロ・publish追加ゼロで最安。hostだけ再同期(§C-2) |
| 第4号 | 室温 roomHeat | 路線1(statCardsMirror にスカラー4個相乗り or 極小新節) | 数十バイト。①の計算値(:12888-12900)をそのまま運ぶ |
| 第5号 | セッション比較 | 路線1(新節・24行cap) | IDBはpopupしか読めない→paint直後に同じrowsをpublish(新規read無し=paint用readの流用) |
| 第6号 | ギフトサイドバー履歴 | 保留可(やるなら路線1+強cap) | 60+件で重い上、第2号の投げ一覧(ledger 20件)と情報がほぼ重複。ユーザー要望の実害を第2号で先に消してから判断 |

**broadcastScore の追加設計メモ(第3号)**: ③は `buildBroadcastScorePanelViewModel({liveId, nowMs, previewRec, phaseStats, giftDiag, voiceDiag, ledger})`(broadcastScorePanelViewModel.js:47-80)を import し、blob 同梱値から VM を組んで `buildBroadcastScorePanelHtml(vm)` を innerHTML。liveId 突合・鮮度落ちの縮退は VM lib が既にやる(:54-58)。カウントアップ演出(popup-entry の rAF)は③では省略可(静的表示から始める)。phaseStats は popup 内部カウンタ(`_bgmPhaseDiagCountersPopup`)だが KEY_BGM_PHASE_DIAG として publish 済みで status が既読(:585)→blob へは bgmPhaseDiag snapshot を載せ、VM の phaseStats 入力形状(liveId/phase/r/各カウンタ)と一致するかを実装時にテストで固定する(不一致フィールドはアダプタ純関数1枚)。

### A-4. 容量の全体見積り

追加分の概算: giftHistory 節 ≈7KB(rooms10×150B+ledger20×250B+メタ)・broadcastScore 用5値 ≈ reportPreview(既にtopSupporters相乗りで一部載る)+diag系で ≈10-20KB・roomHeat ≈100B・セッション比較24行 ≈5KB。
実測 blob 131KB(status-entry.js:1589コメント)+全部盛りでも 448KB の 40%未満。**ただし全節に prune 宣言を義務化**(§B-6、前段レジストリ A-2 の prunePolicy 強制と接続)。

---

## B. 第2号 = 投げ一覧(giftHistory) 最小実装

### B-0. 判定(明示)

①描画は**純lib+ctx データ**(命令的ではない)。よって **HTML同梱ではなく「鏡データ+③本物lib paint」**。
ただし ctx の `throwsTableHtml` は①lib製とはいえ HTML 文字列なので **鏡に載せない(規約R-1)**。
代わりに ledger 行データを載せ、③が `buildGiftThrowLedgerTableSectionHtml`(giftThrowLedgerTableHtml.js:148)を自分で呼ぶ。

### B-1. 鏡の置き場所: northStarMirror.lanes ではなく【新バンドル節 'giftHistory'】を採る(段1指示からの変更・理由明記)

段1は「northStarMirror.lanes に giftHistory を足す」と指示したが、実コードは:
- lanes の row 形状は `officialDomRankingRowsToStripRooms` 前提の verbatim 規約(northStarMirror.js:24-29)。giftHistory は strip-room+メタ+ledger の**別形状**。
- `buildNorthStarMirrorSnapshot`(:69-79)と `mergeNorthStarMirrorLanes`(:96-116)は **contributionRanking/adRanking の2レーン固定ハードコード**。giftHistory を混ぜるには merge 不変条件(後着が先着を消さない・v0.1.963)のテスト群まで触る。
- `restoreNorthStarMirrorRows`(:124-131)は配列前提=オブジェクト節を入れると壊れる。

→ 地雷「勝ちパターンを作り直さない」に従い、**mirrorBundle の新節**にする。バンドル節追加は「キーを足すだけ」設計(mirrorBundle.js:11 の設計意図どおり)。

### B-2. 実装ステップ(TDD・この順・各段 verify:cc 緑)

**B2-1 [純lib・テスト先行]** `src/lib/giftHistoryMirror.js` + `giftHistoryMirrorKey.js` 新設。
- `buildGiftHistoryMirrorSnapshot(ctx, {liveId, nowMs})` → `{liveId, capturedAt, rooms(≤10: {userKey,nickname,count,avatarUrl}), noteText, unitSuffix, ariaLabel, pointsSumAll, pointsSumDisplayed, officialProgramGiftPts, ledgerRows(≤20: giftThrowRow形状), ledgerTotalCount, payloadSource}`。
  JSON-safe 間引きは northStarMirror.js:33-49 `toMirrorRow` の流儀(必要フィールドだけ verbatim・関数/非列挙を持ち込まない)。
- `restoreGiftHistoryMirror(snap)` — null-safe 復元。
- テスト: 形状写像・cap・空/不正入力で null/[]・ledgerRows が buildGiftThrowLedgerTableSectionHtml(giftThrowLedgerTableHtml.js:88-110 の typedef)にそのまま食えること。

**B2-2 [①ctx に ledgerRows を透過]** 現状 ctx は throwsTableHtml(HTML)しか持たない。
- `src/lib/giftHistoryViewModel.js`: `buildGiftHistoryNorthStarViewModel`(:16-49)の戻りに `ledgerRows`(:25-28 で既に計算している giftThrowRow 配列)を追加(1フィールド。recentThrows への変換前の現物)。
- `popup-entry.js:11220`(subAppCtx 組み立て)で `ledgerRows: vm.ledgerRows` を透過。源live 分岐(:11389)も subAppCtx?.ledgerRows を流用(throwsTableHtml と同じ流儀)。
- 既存 throwsTableHtml/①の描画は**一切変えない**(挙動不変・テストで担保)。

**B2-3 [①publish]** `popup-entry.js` に `publishGiftHistoryMirror(liveId, ctx)` 新設(publishTopSupportersMirror :7240-7252 と同型・INLINE_PASSIVE ガード必須)。
- 呼び出し点: `refreshNorthStarGiftHistoryLaneAsync` の paint 成功分岐(:12112-12129 の paint 直後)。**paint に使った ctx の現物を渡すだけ=publish 経路に新規 storage read ゼロ**(鉄則遵守)。
- 中身: `buildGiftHistoryMirrorSnapshot` → `mergeAndScheduleFlush('giftHistory', snap, lid, now)`。

**B2-4 [バンドル節]** 3ファイル・機械的:
- `src/lib/mirrorBundle.js`: SECTION_KEYS(:35-41)に 'giftHistory'、createEmptySections(:44-52)、normalizeSections(:84-93)、typedef(:19-26)。
- `src/lib/mirrorBundleFlushScheduler.js`: legacy キー map(:32-36)に `giftHistory: KEY_GIFT_HISTORY_MIRROR`。
- mirrorBundle.test.js / scheduler test にネガティブコントロール追記。

**B2-5 [status相乗り]** `src/extension/status-entry.js`:
- extras バッチ read(:582-616 のキャッシュ機構)に KEY_GIFT_HISTORY_MIRROR を追加(**コア read に足さない** = status-extras-read-not-core-read)。
- jsonBlob にフィールド `giftHistoryMirror`(:1594 commentTimelineMirror の隣)。
- `_snapshotCapturedAt` の Math.max(:1562-1568)に参加(鮮度を now で偽らない規約)。
- renderAll の引数列(:1220)と呼び出し元へ配管。★lint が import/配管漏れを捕捉する(verify-cc-lint-catches-unwired-import の教訓=verify:cc 一本で出荷判定)。

**B2-6 [prune]** `src/lib/pruneLiveViewPublishBlob.js` のはしごに挿入。削り順(価値の低い順)を再定義:
- **(0)新設: giftHistoryMirror.ledgerRows 20→8→0**(投げ明細はランキングより価値低・最初に削る)
- (1)既存: commentTimelineMirror.rows 半減(:70-87)
- **(2)新設: giftHistoryMirror.rooms 10→5**
- (3)既存: topSupporters 10→5(:90-98) → (4)既存: statusReport 切詰め(:100-121)
- 削ったら必ず `pruned[]` に {section:'giftHistoryMirror.ledgerRows', before, after}(嘘をつかない・snapshotMeta.pruned 経由で selfDiag が「正常な削減」と判定=lane-limit-200 地雷の再発防止)。テスト追記。

**B2-7 [③paint]** `app/live-view.js`:
- import 追加(:54-67 の並び): `restoreGiftHistoryMirror`・`buildGiftThrowLedgerTableSectionHtml`(renderTopSupportRankStripInto は import 済み :56)。
- `paintGiftHistoryMirror(snap)` 新設(paintNorthStarAdMirror :363-393 の隣・同流儀):
  - host `#northStarLaneBody-giftHistory`(live-view.html:10650)へ `renderTopSupportRankStripInto(rooms, {noteText, unitSuffix, ariaLabel, isNorthStarBody:true, freshnessNote?, pointsSum系, ..._stripIo(:316-322)})` — ①の :12114-12123 と同じ recipe。
  - host `#northStarLaneThrows-giftHistory`(:10686)へ `innerHTML = buildGiftThrowLedgerTableSectionHtml(ledgerRows, {totalCount, shownCount, payloadSource})` — **HTML は③内で組む**(サーバー往復はデータのみ=R-1 遵守)。
  - rows 空なら何もしない(死に画面回避・:339/:367 と同流儀)。専用署名ガード `_lastGiftHistorySig`(既存 sig と共用しない=diff-skip 地雷)。
- **配線3点セット**(1つ欠けると「開いた瞬間だけ出て消える」):
  (i) paintAllMirrors(:524-542)に `paintGiftHistoryMirror(jsonBlob.giftHistoryMirror||null)` 1行
  (ii) forcePaintAllMirrors(:590-602)に sig リセット
  (iii) observer targets(:692)に `'northStarLaneBody-giftHistory'`。
  ★(iii)は特に必須: passive popup は `collapseNorthStarGiftHistoryLaneForPassive`(popup-entry:12047-12056)で**このレーンを意図的に畳む**=clobber が設計上確定している。observer 自己修復が唯一の防御。
- 画像の onerror: giftThrowLedgerTableHtml.js:12 は inline `onerror=` 属性(①MV3 CSP では死んでいるが③webでは生きる・src は escapeHtml 済み定数=安全)。③は追加で bindOnErrorHandlersWithin 相当は不要。referrer は page meta `no-referrer`(live-view.html head 既設)+lib 内 `referrerpolicy="no-referrer"` の二重で漏れない。

**B2-8 [selfDiag+検証]** liveviewPublishSelfDiag.js の consistency(:261-319)に giftHistory 1行(rooms数/ledger数の①vs③突合・prune 時は :311 の「削減=正常」パターン)。verify:cc 全緑 → reality-checker 実機1配信(③に投げ一覧が顔つき+明細テーブルで出る・prune 発動時に嘘の🔴が出ない・details 開閉後も自己修復)。

### B-3. ロールバック

③側: paintAllMirrors の1行+targets 1要素+sig 1個を戻すだけ。①側: publish 呼び出し1行を消すだけ(節が blob から消えても③は「rows空=何もしない」で死なない=fail-closed)。

---

## C. 自動追従と CI 赤(前段レジストリの発展)

### C-1. データ/描画配線の自動追従 = 前段レジストリをそのまま使う(作り直さない)

前段設計(reference_web_mirror_parity_SYNTHESIS.md A-2/A-3・**未実装**)の descriptor+wiring テストが、本設計の新節にもそのまま効く: giftHistory は `{key:'giftHistory', blobField:'giftHistoryMirror', restore, countOf, hostIds:['northStarLaneBody-giftHistory','northStarLaneThrows-giftHistory'], prunePolicy:{order:0&2, floor}}` の**1 descriptor 登録**で、(a)バンドル整合 (b)blob整合 (c)③paint整合 (d)DOM host整合 (e)prune宣言強制 の5断言が「忘れ=CI赤」になる。broadcastScore(路線2)は blobField のみで hostIds を持つ「鏡なし descriptor」として登録(レジストリが路線2も表現できることを第3号で証明する)。

### C-2. ★今回の新発見: 「ホストDOMすら無い」の真因と根治

`app/live-view.html` は popup.html の**手動丸ごとコピー(v0.1.942・commit 4d92d443)**で、以後 **466 diff 行 drift**。popup.html にしか無い id = broadcastScoreDetails/broadcastScoreMount/broadcastScoreAnnounceBtn/nlPhaseMeter/nlVersionMismatchBanner/bgmEnabledToggle/effectSoundToggle/opSoundEnabledToggle(実測)。build.mjs(:160-172)は JS だけビルドし **HTML の同期機構は存在しない**。これが「①にパネルを足すと③に host が無い」の構造的真因。

- **C2-a(即効・最小規律)**: wiring テストの host 断言(前段 A-3.4)を**両 HTML 化** — レジストリ全 hostIds が popup.html **と** live-view.html の両方に存在すること。popup にパネルを足してレジストリ登録した瞬間、live-view.html 未同期なら CI 赤。同期作業自体は「popup.html から該当 `<details>` ブロックをコピーし、①専用UI(発表ボタン・音トグル等)を落とす」手作業のまま(数分・頻度低)。
- **C2-b(任意・後続)**: `scripts/derive-live-view-html.mjs` — popup.html→live-view.html の機械変換(実測した差分は決定的: `<base href="/app/">` 挿入・`<meta name="referrer" content="no-referrer">` 挿入・title 差替・preload href の /app/ prefix・footer 差替(OtoLogicクレジット→Powered byロゴ)・script タグ差替(dist/popup.js→/app/dist/live-view.js)+**除外リスト**(①専用UIのid列挙))。まずは **check モード**(生成結果と実ファイルの diff を verify:cc で検査・自動上書きしない=fail-closed)から。変換ルール表が安定してから generate へ昇格。
- HTMLパネル用の「1行登録→①が自動同梱→③が自動で貼る」は、**HTML同梱自体を採らないため対象なし**。人間の最小規律は「新パネル追加3手順」: (1)C-7型で純lib化(既に全パネル済みの流儀) (2)レジストリ1 descriptor (3)wiring 赤が指す残り(publish/blob/paint/host)を埋める — 赤の内訳がそのままチェックリストになる(前段 A-3 の dogfood 思想)。

---

## D. スマホ化(Capacitor/TWA)への影響

- **本方式(鏡データ+lib)はスマホ化に最有利**: blob に HTML が無い=WebView 内 XSS 面積が増えない(審査説明も単純)・容量最小・オフラインは「最終 snapshot cache+stale バナー」がデータだけで成立(HTML断片を cache する整合問題が発生しない)。前段 C 章(PWA→TWA→Capacitor・P2-1 配送常時化まで提出しない)を変更なしで踏襲。
- **referrer 露出**: live-view.html head に `<meta name="referrer" content="no-referrer">` 既設+lib の `referrerpolicy="no-referrer"`(giftThrowLedgerTableHtml.js:63,83)の二重。WKWebView/TWA でも同一 HTML が効く=③のコードを分岐させない。
- **匿名リンク**: `wrapThumbWithProfileLink`(giftThrowLedgerTableHtml.js:31-38)は数値 uid のみリンク=匿名にリンクを張らない既存方針をそのまま満たす。リンク自体を③で全部外したい場合は `buildGiftLedgerUserIdentityCells` の **maskShare オプションが既存**(:44-45)—③paint 時に渡すだけ(新規実装不要・ユーザー判断待ち)。
- **画像src(外部CDN secure-dcdn)**: onerror フォールバック既設(:12)。オフラインでは画像だけ欠けて blank に落ちる=死に画面にならない。ストア審査上、外部画像の参照は問題にならない(コンテンツは自前データ)。

---

## 移行表(段階・各段で verify:cc 緑・単独ロールバック可)

| 段 | 内容 | 触る場所 | ロールバック |
|---|---|---|---|
| M1 | 第2号 giftHistory(B2-1〜B2-8) | §B の8ステップ | paint1行+publish1行+節キーを戻す |
| M2 | 第3号 broadcastScore(路線2) | status jsonBlob に既読5値+③に VM/HTML lib import+host 再同期(C2-a とセット) | blob フィールド削除のみ |
| M3 | 第4号 roomHeat(スカラー4個) | statCards 鏡相乗り or 極小新節+③paint | 同上 |
| M4 | レジストリ実装(前段 A-5)+C2-a 両HTML host 断言 | 前段設計どおり+断言1個 | レジストリは読み取り専用一覧=消しても挙動不変 |
| M5 | 第5号 セッション比較 / C2-b derive check | §A-3 / §C-2 | blob フィールド削除 / check スクリプト削除 |
| M6 | 第6号 giftSubApp 履歴(保留可・第2号後に価値再評価) | §A-3 | — |

M1 と M2 は独立(並行可)。M4 は M1-M3 の後が楽(登録する節が出揃う)が、先行しても良い。

## 地雷(壊すな・実装者は着手前に音読)

1. **R-1: innerHTML 行きの HTML 文字列を jsonBlob に足さない**(textContent 行き=statusReport 型のみ例外)。ctx.throwsTableHtml を鏡に載せたくなったら §0 を読み直す。
2. **mergeNorthStarMirrorLanes / buildNorthStarMirrorSnapshot の2レーン固定を触らない**(northStarMirror.js:69-116)。giftHistory は新バンドル節。
3. **collapseNorthStarGiftHistoryLaneForPassive(popup-entry:12047)が③でこのレーンを畳む=clobber 確定**。observer targets への追加(B2-7 (iii))を絶対に忘れない。
4. **publish 経路に新規 storage read を足さない**: publishGiftHistoryMirror は paint 済み ctx の現物流用のみ。status 側は extras(12秒間引き)のみ・コア read 禁止。
5. **prune 宣言必須+pruned[] 記録必須**(嘘の🔴防止・lane-limit-200 の教訓)。cap を変えるときは鏡cap/prune floor/③表示ラベルをセットで。
6. **diff-skip は新設・既存不変**: _lastGiftHistorySig は新規。既存 sig(_lastLaneSig 等)を共用しない。
7. **配線3点セット**(paintAllMirrors/forcePaint sig/observer targets)— 1つ欠けると「開いた瞬間だけ出て消える」。
8. **inline onerror 属性(giftThrowLedgerTableHtml.js:12)に動的値を入れない**(現状は escapeHtml 済み定数で安全。動的化した瞬間③で XSS 面になる)。
9. **live-view.html 再同期時に①専用UI(音トグル/発表ボタン/nlPhaseMeter/version banner)を持ち込まない**(除外リスト C2-b 参照)。
10. voice 触らない・dist build-id churn をコミットに混ぜない・反映3手順(pull→拡張リロード→watch F5)+③は Vercel デプロイ別途・配信中 copy:ext 禁止。
11. 新規 lib(giftHistoryMirror.js 等)を足したら tree-map/feature-map 再生成をコミットに含める(verify:cc の check が赤くなる)。
