# 設計書 — 会場=①POP 一致保証アーキテクチャ v3(「出力継承+両端実DOM指紋」)

- 設計: Fable(claude-fable-5サブエージェント) / 裏取り: 司令塔(Claude Code)
- 日付: 2026-07-13
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物
- 会議素材・地雷マップの生ログ: このセッションのscratchpad(council-answers-venue.json / fable-brief-venue.md)。要点はこの設計書に統合済みのため別途保存はしない。

## 背景 — なぜこの会議を開いたか

「会場モードを①POPと完全一致させる」というテーマで、少なくとも4回(v0.1.1111/1119/1122/1129)「完全一致を実装完了」と宣言してきたが、そのたびに`verify:cc`緑・reality-checker pass・時には実機確認済みと報告した直後〜数日後に、ユーザーの実機体感で「一致していない」「バグだらけ」という評価が繰り返し発生してきた。今回はこのループそのものを断ち切るための根本原因分析と設計。

## 裏取り済みの決定的事実(Exploreエージェント調査+司令塔の実ファイル確認)

- **v0.1.1111**: 「reality-checker pass・verify:cc全9緑・実機実測で成功」と明記した直後に「しかしユーザー判定は『完全一致じゃない』」と同一ドキュメント内に記録。✅トークンの定義自体に穴があった(尾・暫定行を許容)。
- **v0.1.1119**: 「P1〜P5全実装完了・reality-checker pass」の直後の実機でユーザーが「匿名がとんでもない数」「常時ローディング」と酷評。
- **v0.1.1129**: 「実機で完全一致を確認」と明記した同じcommit範囲内で「ロビー巨大タイル」がMCP実測で新発見。
- MEMORY.mdには本件と同型の構造欠陥が別件(3画面パリティ)でも既に3回記録されている: `mirrors-written-per-key-per-tick-root-of-parity-lie`、`parity-verdict-checks-rowcounts-not-statcard-values`、`parity-check-must-compare-values-not-just-ack`。→ 「✅判定がデータの存在確認止まりで実描画値を見ていない」はこのプロジェクトの検証設計に共通する構造的欠陥。
- 会場は①と同一の描画関数(`paintStoryUserLaneDomFilled`・`buildPersonTileEl`)を実際に呼んでいる(コードの複製ではない)。しかし**その関数に渡す「入力」を①と会場で別々に合成している**ことが真因(`venueLaneBuckets.js`の入力合成差・fallback経路の別コンテキスト)。
- iframe全画面化(物理的DOM共有)は2026-06-22に会議6体全員一致で推されたが却下済み(別オリジンでrect取得不可・会場固有UI挿入不可)。

## 根本原因(§0で新規に確定した2点)

### 論点A: なぜ「同一関数×別々に合成した入力」の設計だと不一致が再発し続けるのか

決定的関数 f があり、①=f(x₁)、会場=f(x₂)。一致の必要十分条件は**x₁≡x₂**だが、会場は x₂ を独自の2本目パイプラインで再合成している(`venueLaneBuckets.js`の fallback 経路・`composeVenueLaneBuckets`のtransientKeys/seatIndex割付・席装飾ループ等)。

**この設計の意味論は「デフォルト=発散、同期=人力」**。開発が進んで①の入力合成に1フィールド・1cap・1タイミングが追加されるたびに、会場側で同期し忘れれば不一致の新次元が自動的に生まれる。過去4回はそれぞれ既知の次元(displaySrc・ガイド・匿名分割・レイアウト)を塞いだが、塞ぐ行為自体が新しい合成コード=新しい次元を足しており、**一致確率は時間とともに減衰する構造**になっている。これは実装の質の問題ではなく設計の意味論の問題。

**非iframe DOM物理共有の技術検討(新規)**: ①POP(embed_watch)は`chrome-extension://`のiframe内document。会場(content script)からは同一オリジンポリシーでiframe内部DOMに触れず、ノード移動は原理的に不可(iframe却下理由と同じ壁)。逆転案(会場UIをpopup document側に描く)も座席anchor rect依存で同じ壁に当たる。host iframeの移設・遮蔽はvenue-cleanup 3-B(v0.1.1128)で根治した「1移設=1リロード」ちかちか地雷そのもので、既存制約(host/iframe不可侵)に正面衝突する。

**∴ 物理共有は全経路で不可。直列化された出力(laneMirror)が唯一の合法な共有チャネルであり、根治の方向は「デフォルト=継承」への意味論の反転** — 会場は①の*出力*だけを食べ、独自合成面をゼロに漸近させる。

### 論点B: 「✅判定が浅い」の構造的欠陥

既存の`venueLaneParity.js`(v3 Tri-Parity)はかなり深い(鏡⇄段データ⇄会場実DOM census・fail-closed)が、v1129「ロビー巨大タイル」を✅のまま通した理由は明確:
1. censusはキーの存在と可視性しか数えず、幾何(タイルサイズ・レイアウト)を測っていない。
2. 突合の左端が「鏡データ」であり、①が実際に画面へ描いた結果(実DOM)ではない。
3. 完了ゲート(`.claude/agents/codex-impl.md`の完了ゲート節)は`verify:cc`=論理層のみで、視覚の不一致を捕まえる層が存在しない。

プロジェクト全体の完了判定は現在**層1(verify:cc=論理)**しかなく、**層2(実機データ=parityトークン)**は任意、**層3(見た目=人間の目)**は非定型。✅偽陽性はこの層の欠落から必然的に出る。

## A. 理想の一致保証フロー

```
[開発時]  変更 → verify:cc緑(層1) → push → ユーザー反映3手順
[実機]    ユーザーが状態速報1枚コピペ
            → 会場一致トークン(層2): ①実DOM⇄鏡⇄会場実DOM の両端実DOM突合+幾何指紋で✅/⚪/🔴
            → 🔴なら line が真犯人を1行で名指し(既存v3の資産)
[完了宣言] 層2✅の line 全文 + ①/会場スクショ2枚並置 + 5項目チェックリスト(層3)が揃って初めて
          「完全一致」を名乗れる。どれか欠け=「実装完了(実機未確認)」としか書けない
[運用中]   verdict履歴リング(直近1h: ✅N ⚪N 🔴N+最悪line)が状態速報に常設
          → 宣言後の退行は次の状態速報コピペで自動的に露見(誰も再テストしなくてよい)
```

## B. 統合アーキ(4コンポーネント)

| # | 名前 | 何をするか | 既存ファイルとの対応 |
|---|------|-----------|---------------------|
| C1 | 両端実DOM指紋(MVP) | ①がpublish時に自分の実DOM要約(段別可視数+タイル幾何)を鏡へ同梱。会場censusに幾何採取を追加。parityの✅条件を「①実DOM⇄会場実DOM」直接突合+幾何一致へ拡張 | `popup-entry.js`の`publishLaneMirror`・`laneMirror.js`(スキーマ+1フィールド)・`venueDomCensus.js`・`venueLaneParity.js` |
| C2 | 供給一元化(fallback降格) | 鏡なし時、会場は独自合成の5段を描かず「①同期待ち」明示+前回鏡保持 or ロビーのみ | `venueBar.js`(fallbackLaneBuckets)・`venueLaneBuckets.js` |
| C3 | 見た目完了ゲート | codex-impl/cursor-impl完了ゲート節に層2/層3を追記。reality-checkerの検品条件に「parity line貼付なし=差し戻し」を追加 | `.claude/agents/codex-impl.md`・`cursor-impl.md`・`AGENTS.md §12.5` |
| C4 | 退行リング | verdictの直近1時間リングバッファ→statusFastDiagLite passthroughで状態速報に常設 | `venueBar.js`・新lib`venueParityHistory.js`・`statusFastDiagLite` |

配線: C1が✅の意味を「両画面の実描画一致」に変える→C3がその✅を完了宣言の必須通貨にする→C4が宣言後の減衰を自動可視化する→C2が不一致の発生源(2本目パイプライン)自体を縮める。

**前回セッションの委譲体制強化(K1〜K4・`bug-investigation-handoff-DESIGN.md`)とは直交・非重複**: K2は`verify:cc`(層1)実行の強制のみ。本設計は層2/層3をその上に積む。

## C. 具体機構

### C1: 両端実DOM指紋

鏡スキーマ拡張(`laneMirror.js`の`LaneMirrorSnapshot`に1フィールド。数値のみ・~200byte・512KB自衛と無衝突):

```js
domSelf: {
  measured: true,
  perTier: { link: {visible: 12, tileW: 64, tileH: 84}, gift: {...}, ad: {...}, konta: {...}, tanu: {...} },
  dpr: 1.25   // devicePixelRatio(幾何許容差の正規化用)
}
```

- 採取場所: `popup-entry.js`の`paintStoryUserLaneDomFilled`直後〜`publishLaneMirror`の間に純関数`measureLaneDomSelf(els)`を新設(新lib`src/lib/laneDomSelfMeasure.js`、会場censusと実装共有可)。
- 会場側: `venueDomCensus.js`のperSectionに`tileW/tileH`(各段先頭タイル)を追加。
- 判定: `venueLaneParity.js`の✅条件に追加:
  - `snap.domSelf.measured && 各段 domSelf.visible === perTier[t].pop`(①実DOM⇄鏡の左端突合。ズレ=🔴)
  - 幾何: `|venueTileW - popTileW| / popTileW <= 0.10`(10%許容・dpr正規化後)。超過=🔴 `tanu:タイル96px(①64px)`。ロビータイルも同判定に含める(v1129のケース)。
  - `domSelf`欠落(旧鏡)=⚪「①DOM未計測」(fail-closed、既存パターン踏襲)。
- 配線忘れ防止: 既存`venueLaneParity.wiring.test.js`に「鏡にdomSelfが居る」断言を追加。

### C2: 供給一元化

- `venueBar.js`の`fallbackLaneBuckets`を「lobby供給+『①同期待ち』バナー」へ縮小。フラグ`VENUE_LANE_MIRROR_ONLY = true`(`VENUE_LANE_GUIDES_EXACT_COPY`と同じ1行revert様式)。
- 鏡なし時の段: 同一配信の前回鏡があれば保持、無ければ段は空+ロビーに全員。「ローディング演出禁止」制約に適合(静的テキスト1行のみ)。
- `venueLaneBuckets.js`の旧式残滓(`deriveNicoUserIconUrl`由来`_venueIsVip`・legacy thumbScore)はこの縮小で死にコード化→削除。

### C3: 見た目完了ゲート(前回設計との統合)

`.claude/agents/codex-impl.md` / `cursor-impl.md`の完了ゲート節に追記:

```
5. 【venue/lane/popup の描画に触れた diff のみ】完了報告に以下を必須添付:
   - 状態速報の「会場一致」line 全文(✅/⚪/🔴 と reason 込み)
   - ⚪/🔴 のまま「完全一致」を名乗る報告は無効(「実装完了(実機未確認)」とだけ書く)
※ 実機は自動化不可(拡張リロードはユーザー手動)のため、この項は
   「司令塔がユーザーに反映3手順+チェックリストを提示し、コピペを受領してから」満たされる。
```

`AGENTS.md §12.5`の反映3手順の直後に実機チェックリスト定型(司令塔がpush報告のたび併記):

```
反映後30秒チェック(会場を開いて):
□ 状態速報コピペ → 「会場一致 ✅」か(⚪/🔴ならその line を貼るだけでよい)
□ ①と会場の先頭5人の顔・順序が同じ
□ タイルの大きさが①と同じ(巨大/極小がいない)
□ ガイド帯・フッター文言が①と同じ
□ ロビーの人数表記と実タイル数が合っている
```

reality-checkerへの追加検品条件: 「venue parity対象diffで会場一致lineの貼付が無い完了報告=証拠なき緑として却下」。

### C4: 退行リング

新lib`src/lib/venueParityHistory.js`(純関数+リングバッファ、~40行):

```js
// push(verdict, line, nowMs) / summarize(nowMs) →
// { window: '60m', ok: 58, gray: 3, red: 1, worstLine: '会場一致 🔴 …', lastVerdict: '✅' }
```

`venueBar.js`のparity計上箇所で push、`venueSeatsDiag`にsummarizeを同梱、**`statusFastDiagLite`に必ずpassthrough**(既知の地雷[[fastdiag-lite-is-the-printer-subset]])。状態速報に「会場一致(直近60分): ✅58 ⚪3 🔴1 / 最悪: …」が常設され、宣言後の退行は次のコピペで自動露見する。

## D. 偽陽性を潰す具体ロジック(まとめ)

| 偽陽性の型 | 過去の実例 | 潰す機構 |
|---|---|---|
| データ一致だが見た目が違う(幾何) | v1129 ロビー巨大タイル | C1 幾何指紋(tileW/H 10%許容・ロビー込み)→🔴 |
| 鏡は正しいが①の実描画と違う | 未検出のまま潜在 | C1 domSelf(①実DOM⇄鏡の左端突合) |
| 測れていないのに緑 | — | 既存fail-closed踏襲: domSelf欠落=⚪(✅を名乗れない) |
| fallback画面の惨状が判定外 | v1119 匿名の壁 | C2: 一致を主張しない画面には独自段を描かない |
| 宣言時は✅・数日後に退行 | 4回全部 | C4リング+C3「line貼付なし報告=無効」 |
| 手順を踏まず旧版を評価 | 可能性残 | parity lineは状態速報(version刻印済み)の一部としてコピペされる=版の証拠が同一ペーストに同居 |

## E. MVP — C1「両端実DOM指紋」を最初に作る

理由: ✅の意味を「データ一致」から「両画面の実描画一致(幾何込み)」へ変える1点が、過去4回の偽陽性のうち最多型(見た目ズレの素通り)を機械検知に変える。変更は3ファイル+新lib1+テストのみ、既存v3 parityへの追加条件のみで、hot path追加コストはpublish時のoffsetWidth読み数回。C2はfallbackの実機惨状がもう一度観測されたら着手(v1117/1122で主犯2件は既に根治済みのため、C1より緊急度が一段低い)。

## F. 捨てた案と理由

| 案 | 理由 |
|---|---|
| iframe全画面化 | 既却下(2026-06-22)。別オリジンでseatAnchor rect不可・会場固有UI挿入不可・popup.html変更面大。再挑戦しない |
| 非iframe DOM物理共有(ノード付け替え) | 今回新規に検討し却下: extension iframe境界でappendChild不可能・逆転案も同じ壁・host移設は3-Bちかちか地雷に正面衝突 |
| Percy/Applitools等ビジュアル回帰SaaS | 有料・実配信データ依存で再現環境が作れない・無料/Vitest(node)方針と不整合 |
| Playwrightスクショ回帰(自前) | 拡張+ライブデータのfixture化が大工事=過剰設計。C1の幾何指紋が同じ欠陥クラスを低コストで捕まえる |
| 全フィールド完全鏡(合成の完全共有化) | 512KB pruneと構造衝突。pruned時に⚪へ落ちる現行fail-closedが既に正しい振る舞い |
| 「機能的等価性」への要求再定義 | ユーザーは明示的に「一致」を要求。却下 |
| DOM+CSS全ハッシュ0/1判定 | dpr/フォント/幅の環境差で恒常的偽陰性→無視される計器になる。段別数値+許容差付き幾何のほうが真犯人を1行で名指しでき、既存line様式とも連続 |

## G. 地雷と回避策

1. **statusFastDiagLite passthrough忘れ**(v1124で実際に踏んだ) — C4のsummarizeはliteに通す+wiring断言をテストに追加。
2. **storyLaneTierBodyKeyに幾何を入れない** — diff-skipのkey揺れ=churn再発(v1022/1038型)。幾何はcensus側でのみ測る。
3. **hot path保護** — domSelf採取はpublishと同期(3秒min-gap内)、会場側幾何は既存diagDue期日のみ。毎paint禁止(既存v1113の規律を踏襲)。
4. **host/iframe 3-B凍結ロジック不触** — C1/C4は読み取り計器のみ、C2も段供給の分岐であり移設6箇所ガード・shouldSkipInlineHostMoveForVenueに触れない。
5. **幾何の環境差** — dpr正規化+10%許容。ズーム変更直後の1回だけ🔴が出得る→C4リングで「一過性か恒常か」を見分ける(単発🔴で騒がない運用をlineに明記)。
6. **グリッド列数は比較しない** — 会場は全画面でperRowが違うのが現仕様(「グリッド丸写し」は既知の後送タスク)。比較対象はタイル寸法のみ。
7. **鏡容量** — domSelfは数値のみ~200byte。512KB自衛ループの前に付与しJSON.stringify計測に含める。

## 論点D: 過去3回と質的に何が違うか

過去3回は「見つかった入力差分を1つ塞ぐ+✅の定義を後追いで広げる」の反復だった(displaySrc→ガイド→匿名分割)。本設計は(1)差分を塞ぐのでなく差分が生まれる意味論(デフォルト=発散)を反転し(C2)、(2)✅を両画面の実描画+幾何にまで届かせ(C1)、(3)人間の目という最終ゲートを定型の証拠物(line全文+スクショ+チェックリスト)を要求する完了通貨に変え(C3)、(4)宣言後の退行を次の状態速報コピペで自動露見させる(C4)。次に不一致が再発したとき、それは「✅のまま静かに再発」ではなく「🔴 lineが真犯人を名指しした状態で再発」する — ループの断ち切りとはこの状態遷移のことである。
