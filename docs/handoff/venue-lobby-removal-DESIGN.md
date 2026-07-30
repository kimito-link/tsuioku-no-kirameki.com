# 設計書 — ロビー完全撤去・INLINE二重スクロール撤去・診断ページ軽量化

- 設計: Fable(claude-fable-5サブエージェント) / 裏取り: 司令塔(Claude Code)
- 日付: 2026-07-14
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物
- **重要**: この設計は[lanescene-structural-review-DESIGN.md](lanescene-structural-review-DESIGN.md)(前回の検証)の「ロビー撤去は不採用」という結論を覆す。前回の判定はユーザーの明示的な要求を「全員表示原則」という別の過去要件を理由に却下した誤りであり、実地調査(Explore)で「技術的制約ではなく検討不足だった」ことが確定した。

## 前提の確認(実地裏取り済み)

ロビーは `seatsHost` 直下の独立DOM(`venueBar.js:2160-2183`)+専用関数`paintVenueLobby`(`venueBar.js:4113-4157`)+`bucketVenueLaneSeats`の`anonymousToLobby`オプション(`venueLaneBuckets.js:157-167`)+`composeVenueLaneBuckets`の`lobby`出力の4点で構成された**付加機能**であり、段の描画`paintStoryUserLaneDomFilled`はロビーの存在を知らない。撤去は技術的に可能で、局所的な変更で足りる。

`popup.html:907`の既存コメント「縦スクロールは`.nl-main`のみ」という設計原則がもともと存在しており、v0.1.1051(全員表示Phase1)がこの原則を破って二重スクロール化していたことも司令塔の裏取りで確認済み。

## A. 理想の統合アーキテクチャ(ロビーが存在しない状態)

**「会場=①の完成済み5段の別レンダリング。それ以外の描画対象は存在しない」**

- データの正本は1つ: ①POPが確定した鏡(laneMirrorPaintSnap)の5段(link/gift/ad/konta/tanu)。会場はこれをそのまま描く。
- 鏡外メンバー(cap超過の尾・暫定発言者・匿名)は、①に載っていない=会場にも載らない。①に載った瞬間、次の鏡publishで会場にも現れる。「会場独自の受け皿」という概念自体が消える。
- fallback(鏡なし=タイムシフト/①同期待ち)時も同じ意味論: 段=記名(数値ID)のみ。匿名は描画対象外(ロビーへ隔離ではなく、単に描かない)。「匿名の壁」バグは受け皿なしで根治する — 壁の材料そのものを描かないから。
- パリティ✅の定義が単純化する: 「全段件数完全等値+重複0+迷子0」。「ロビー重複」「lobbyInMirror」という検査項目ごと消える。

## B. 統合アーキ(コンポーネントと既存ファイル対応)

| コンポーネント | 役割 | 既存ファイル | 変更 |
|---|---|---|---|
| ①レーン供給(bucket) | 座席→5段への振り分け | `src/lib/venueLaneBuckets.js` | `anonymousToLobby`/`lobby`を撤去し、匿名は常に除外 |
| ②鏡合成 | 鏡5段+fallbackの合成 | `src/lib/venueLaneMirrorSupply.js` | `lobby`出力・`fallbackLobby`引数を撤去。鏡外は捨てる |
| ③会場描画 | 段DOMのpaint | `src/extension/venueBar.js` | lobbyDOM構築・`paintVenueLobby`・呼び出し・CSSを削除 |
| ④診断/パリティ | 3点一致検査 | `src/lib/venueLaneParity.js`/`venueDomCensus.js`/`venueSeatsDiag.js` | lobby検査項目を撤去。✅条件を「段のみ」に再定義 |

配線は今と同じ一方向(bucket→合成→描画→診断)。host/iframeには一切触れない(ロビーはseatsHost内部のDOMで、venueBarの移設・リロード経路と無関係)。

## C. 具体機構

### C-1. ロビー撤去

**`src/lib/venueLaneBuckets.js`**
- `bucketVenueLaneSeats(seatEntries, opts)`(L148-168): `opts.anonymousToLobby`を削除。`isLobbyBound`を`isAnonymousEntry`に改名し、常に`candidates.filter((it) => !isAnonymousEntry(it))`で段候補を作る(匿名は捨てる)。戻り値型から`lobby: any[]`を削除→`{ link, gift, ad, konta, tanu }`。
- L139-142・L157-165のロビー関連コメントも削除。

**`src/lib/venueLaneMirrorSupply.js`**
- `composeVenueLaneBuckets({ mirrorBuckets, fallbackBuckets, fallbackLobby, seatIndexByUid, transientKeys })`: `fallbackLobby`引数と`lobby`配列を削除。T/X層(鏡外・暫定)は押し先がなくなる=描かない。戻り値`{ buckets }`のみ。

**`src/extension/venueBar.js`**
- L2156-2187: `lobbyHost`/`lobbyBanner`/`lobbyFace`/`lobbyBannerText`/`lobbyLabel`/`lobbyList`/`_lobbyPaintSig`/`_venueLobbyResetCount`の構築を丸ごと削除(`seatsHost.appendChild(lobbyHost)`含む)。
- L4102-4157: `paintVenueLobby`を丸ごと削除。
- L4304-4331: `bucketVenueLaneSeats(visibleSeats, { maxTotal, pickCtx })`(anonymousToLobby行を削除)。`composeVenueLaneBuckets`呼び出しから`fallbackLobby`を削除。`const lobbyItems = ...`(L4331)を削除。
- L4335: `emptyMessage.hidden = visibleLaneItems.length > 0;`に単純化。
- L4372: `paintVenueLobby(lobbyItems, ...)`呼び出しを削除。
- L4376: 席装飾ループを`for (const item of visibleLaneItems)`に単純化。
- CSS L1282-1321・L1776: `.nlsb-lobby*`一式を削除(実在確認済み)。

**診断3ファイル**
- `src/lib/venueLaneParity.js`: `lobby`入力(L93,L127)・ロビー突合ブロック(L223-239)・verdict文字列のロビー表記(L408-410)・`lobbyReference`幾何比較(L303-349)を削除。✅条件=「全段件数完全等値∧重複0∧迷子0∧空可視0∧無鍵0」。
- `src/lib/venueDomCensus.js`: lobbyセクションのcensusを削除。
- `src/lib/venueSeatsDiag.js`: lobbyフィールドを削除。**地雷**: fullから消したら`statusFastDiagLite`側のpassthroughも同時に消す(既知の地雷[[fastdiag-lite-is-the-printer-subset]]の逆方向。残すとliteがundefinedを印字)。

**①フッター文言(同一patch必須)**
- `src/lib/storyUserLaneGuideHtml.js:93` `buildStoryUserLaneGuideFootAndRecordedHtml`: 「ほか M人は会場モードで全員見られます」→「いま N件を表示中(ほか M人・直近アクティブ順)」へ。ロビー撤去後この約束は嘘になるため、撤去と同じコミットで変更する。テスト`storyUserLaneGuideHtml.test.js`も更新。

**「ロビー」文字列ゼロの機械保証**
- 新規テスト`src/lib/noLobbyString.test.js`(20行程度): `src/`配下の.jsをfs走査し`/lobby|ロビー/i`が0件であることを断言。除外は`changelog.js`とこのテスト自身のみ。changelogの過去エントリは「ユーザーに配った変更履歴」=歴史記録であり、書き換えると過去の告知を改竄することになるため残す(実行ロジックではなくデータ文字列)。
- テストファイル群(`venueLaneParity.test.js`/`venueDomCensus.test.js`/`venueLaneBuckets.test.js`/`venueLaneMirrorSupply.test.js`/`completenessScore.test.js`/`venueBarPopupOcclusion.wiring.test.js`/`venueLaneParity.wiring.test.js`)のlobby関連ケースは削除または「lobbyが存在しないこと」の断言に書き換え。

### C-2. INLINE二重スクロール撤去+上限見直し

**`extension/popup.html`(実在確認済み・L928-935)**
- L928-935: `html.nl-inline body .nl-story-userlane-stack .nl-story-userlane { max-height:40vh; overflow-y:auto; ... }`ブロックを丸ごと削除(L908-926の基底`max-height:none; overflow-y:visible`が生きる=レーン内スクロール消滅)。**既存コメント(L907)「縦スクロールは.nl-mainのみ」という設計原則への回帰**。
- L343-354 `.nl-main`の`overflow-y:auto`は維持(完了条件6「POP全体は必要ならスクロール操作だけ維持」)し、バー非表示を追加:
  ```css
  html.nl-inline body .nl-main { scrollbar-width: none; }
  html.nl-inline body .nl-main::-webkit-scrollbar { display: none; }
  ```

**`src/extension/popup-entry.js`**
- INLINE時のlimitを200→48に戻す(v0.1.1051以前の値)。新定数`STORY_USER_LANE_INLINE_LIMIT = 48`を共有libに置く。
- **地雷(v1052の実績)**: 鏡capを同じpatchで同じ定数に追随させる。limitと鏡capの分離が①211≠③99の不一致を過去に起こした。会場は鏡を描くので、これで会場の段人数も自動的に48へ揃う。
- 「もっと見る」導線(増分表示UI)は今回スコープ外として後送。理由: 完了条件は「上限を戻す+レーン内スクロール禁止」であり、増分表示UIは新規機能。48で足りないという実機フィードバックが出てから最小実装で足せる。

### C-3. 診断ページ軽量化

既存の再入防止・比例バックオフ(`status-entry.js:481-497`)・混雑時3秒有界化・部分diff-skip(`_lastLivesSig`等)は既にある(実在確認済み)。**全面作り直しはしない**。足りないのは「畳まれている詳細セクションまで毎tick組み立てている」ことだけ。

- 新ヘルパー(30行級): `lazySectionPainter(detailsEl, painter)` — `<details>`が開いているときだけpainterを実行し、閉じている間はdirtyフラグだけ立てる。開かれた瞬間にdirtyなら1回だけpaintする。
- 適用対象: マインドマップ・AI共有欄の全文生成・詳細テーブル群等の重いセクションを、既存の`<details>`パターンで包み、`lazySectionPainter`経由にする。概要(コア表示・自動更新メタ・視聴中の配信)は現状どおり毎tick+既存diff-skip。
- 実装前に1回だけ`_lastRefreshPerf`の内訳を実機で読み、どのセクションが支配的かを確認してから包む対象を決める(闇雲に全部包まない)。

### C-4. 白化 — 正直な位置づけ

**前回実装`scrollWhiteoutProbe.js`は「白化を観測する計器」であって「白化の修正」ではない。W-2(実修正)は手つかず。これを修正完了扱いにしない。**

今回のスコープに白化の実修正は含めない。理由:
1. C-2(レーン内スクロール撤去)で合成レイヤー昇格されるスクロールコンテナが1つ減り、白化の発生面そのものが構造的に縮む。修正を設計する前に、新構造でのprobe実測を1回取るべき(直したつもりの空振りを避ける)。
2. 白化の真犯人はprobeが確定させる設計。実測前の修正は推測修正になる。

## D. 段階的な撤去手順

各段=1 patch version・`npm run verify:cc`・reality-checker・copy:ext・反映3手順の併記。

1. **Patch 1(MVP): ロビー撤去+フッター文言+文字列ゼロテスト**(C-1全部)。TDD順: `noLobbyString.test.js`を先に書いて赤→lib(buckets/mirrorSupply)→venueBar→診断3ファイル→lite passthrough→既存テスト更新→緑。
2. **Patch 2: limit 200→48+鏡cap追随**(C-2後半)。1ファイル2箇所+共有定数。ロールバック=数値1つ。
3. **Patch 3: INLINE二重スクロール撤去+バー非表示**(C-2前半)。popup.htmlのCSSのみ。
4. **Patch 4: 診断ページlazy details**(C-3)。実測→包む対象決定→実装。
5. **(スコープ外・次サイクル)**: 白化W-2(Patch 3後のprobe実測が前提)・「もっと見る」導線。

2と3を分けるのは、48化だけでレーンが40vhに収まる可能性が高く、3のCSS撤去の回帰(POP全体レイアウト)を単独で切り分けられるようにするため。

## E. MVP

**Patch 1のロビー撤去**。ユーザーの最も明示的な要求であり、前回「やったと言って、やっていなかった」当のもの。かつ`noLobbyString.test.js`がCIで恒久保証になるため、「4回宣言しても再発」型のループの教訓を機械で断てる。

## F. 捨てた案と理由

- **匿名を段に混在させ匿名ラベルを付ける案**: 完了条件2「①と同一の完成済み5段データだけ」に反する(①の段に匿名は居ない)。不採用。
- **「全員一覧」モーダル/別ページ**: 会場独自領域の再発明=完了条件3の精神に反する。不採用。
- **診断ページの描画基盤作り直し**: 既存のdiff-skip・バックオフ・有界化が生きている。lazy detailsの追加だけで要求を満たせる。過剰設計として不採用。
- **changelog過去エントリの「ロビー」書き換え**: 配布済み変更履歴の改竄になる。文字列ゼロ保証の除外対象とし、ユーザーに一言確認(捨てたのは要件ではなく「機械保証の適用範囲を実行コードに限る」という運用判断)。

**全員表示原則との関係**: v0.1.1051の「全員表示」はcouncil合意(popup=要約・会場=全員)の一設計方針であり、ユーザー自身が今回それを覆す明示要求を出した。撤去後、①のcap外・匿名はどの画面にも出ない。将来「なぜ全員見えないのか」と問われたら答えは「2026-07-14に『会場は①と完全に同じ5段だけを描く。匿名・超過を独自領域に送らない』と確定した(本設計書が正本)。全員表示に戻すならlimit定数と匿名フィルタ1箇所ずつの変更で戻せる」。この経緯をmemory/の設計メモとchangelogの新エントリ(「ロビーを廃止しました。会場は応援レーンと完全に同じ顔ぶれだけを表示します」)に残す。

## G. 地雷と回避策

| # | 地雷 | 回避策 |
|---|---|---|
| 1 | 鏡cap置き去り(v1052実績) | limit定数と鏡capを同一patchで共有定数化。Patch 2に両方含める |
| 2 | 「消す側」の無計器(既知の鉄則) | lobby撤去で消える`_venueLobbyResetCount`の代わりに、fallback時の匿名除外件数を既存venueSeatsDiagに1フィールド(`anonExcluded: N`)残す — ロビー文字列なしで「なぜ段が少ないか」を黙らない |
| 3 | 吹き出し(コメントバブル)の席参照: 匿名発言者のバブルがlobby席DOMにアンカーしていた場合、撤去後`seatByKey` missでnull参照 | Patch 1で`seatByKey`経由のバブル配置コードをgrepし、席なし時の既存フォールバック(素通し/非表示)を確認・断言テスト追加 |
| 4 | fastDiagLite passthrough: fullからlobby診断を消してliteに残すとundefined印字/wiring断言が赤 | 診断3ファイルと同一patchでliteとwiringテストを更新 |
| 5 | emptyMessage判定(venueBar.js:4335): lobbyItemsを消し忘れるとReferenceErrorで会場全体が死ぬ | lint(no-undef)が捕捉する構造。verify:cc一本をゲートに |
| 6 | host/iframe誤爆: ロビーはseatsHost内部だが、venueBar.jsの大diffで移設ガード(shouldSkipInlineHostMoveForVenue)周辺に触れると点滅が再発 | Patch 1のdiffをL2156-2187/L4102-4157/L4304-4380/CSSに限定し、移設・occlusionコードに触れない。`venueBarPopupOcclusion.wiring.test.js`の更新はlobby断言の削除のみ |
| 7 | `.nl-main`スクロールバー非表示の副作用: `scrollbar-gutter:stable`削除で列幅が1回ずれる | Patch 3単独リリースで切り分け。実機で列幅振れを目視確認 |
| 8 | detached HEAD事故(reality-checker並走) | 検証エージェント実行中はcommitしない |

## 完了条件との対応

1. ロビー完全撤去+文字列ゼロ = Patch 1+noLobbyString.test.js
2. 同一5段のみ描画 = Patch 1
3. 独自領域へ送らない = Patch 1(匿名は描かない)
4. max-height:40vh撤去 = Patch 3
5. 200→48 = Patch 2
6. レーン内スクロール禁止+バー非表示 = Patch 3
7. 診断lazy化 = Patch 4
8. 白化を完了扱いにしない = 本書C-4に明記(未修正・W-2は実測後)
