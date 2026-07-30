# 引き継ぎプロンプト(2026-07-14 会場ロビー撤去 続き)

次のチャットの冒頭にこのファイルの内容をそのまま貼ってください。

---

## 直前までの状況

tsuioku-no-kirameki.com プロジェクトで、会場モード(全画面座席一覧)の「ロビー(立ち見)」機能を完全撤去する作業(Patch 1)が完了し、**push済み(v0.1.1138・commit 7a317129)**。

### 経緯(誤りの訂正を含む)

1. 「会場=①一致問題」の根本原因分析を会議→Fableで実施([[venue-pop-parity-loop-root-cause-2026-07-13]])。C1(両端実DOM指紋)・C2(stale鏡保持)を実装・実機確認済み。
2. ユーザーから「LaneScene構造改革(ロビー撤去含む)」の提案を受け、会議→Fableで検証した際、**「ロビー撤去は不採用」と誤った結論を出した**([[lanescene-structural-review-2026-07-14]])。SceneEnvelope/RenderReceipt(v0.1.1137)という診断強化だけを実装した。
3. ユーザーから「ロビーが出てる。何も変わってない。Claude Codeは要件を逆に解釈している」と明確な指摘。再度会議→Fableで検証した結果、**前回の判定は技術的制約ではなく検討不足による誤りだった**と確定([[venue-lobby-removal-2026-07-14]])。
4. `venue-lobby-removal-DESIGN.md`(4 Patch構成)を設計し、**Patch 1(ロビー完全撤去)を実装・push済み**(v0.1.1138・commit 7a317129)。

### Patch 1で実施したこと(完了・push済み)

- `venueBar.js`からロビーDOM(`lobbyHost`等)・`paintVenueLobby`関数・CSS(`.nlsb-lobby*`)を完全削除
- `venueLaneBuckets.js`の`bucketVenueLaneSeats`は匿名系ID(a:等)を常に除外(段には出さない。`anonymousToLobby`オプション撤去)
- `venueLaneMirrorSupply.js`の`composeVenueLaneBuckets`は鏡の5段のみ返す(`fallbackBuckets`/`fallbackLobby`引数を撤去)
- `venueLaneParity.js`/`venueDomCensus.js`/`venueSeatsDiag.js`からロビー突合・ロビーDOM census・ロビー幾何比較を撤去
- 「消す側」の計器として`anonExcluded`を新設(旧`lobbyResetCount`の後継。fallback時に段から除外された匿名の人数を状態速報に出す)
- ①フッター文言「会場モードで全員見られます」の約束を撤回(直近アクティブ順の案内に変更)
- 新規`src/lib/noLobbyString.test.js`: `src/`配下に「ロビー」文字列が0件であることを機械保証(除外は`changelog.js`=歴史記録と、撤去確認をする`venueLaneParity.wiring.test.js`自身の否定形正規表現のみ)
- `npm run verify:cc`全緑・`copy:ext`済み

### ⏳実機待ち(未確認・最優先でここから)

反映3手順(`git pull`→拡張リロード→watchタブF5)を踏んだ後、会場モードを開いて以下を確認する:
- ロビー(立ち見エリア)が画面に表示されないこと
- 匿名ユーザーがどこにも表示されないこと(段にもロビー相当の場所にも出ない)
- 状態速報の「会場一致」行が引き続き正しく出ること(ロビー関連の表記が消えていること)

## 気になる点(裏取り済み・実害なし)

`git log`を見ると、直後に`8a699c54 feat(council): NIM無料枠の超大型3体を追加(Fable設計)`というコミットが存在する。今回のセッションで作った覚えがなく、**別セッション/別ツールで行われた変更**。`git show 8a699c54 --stat`で確認済み: 変更は`scripts/council-roles.mjs`と`scripts/meeting.mjs`のみ(council会議メンバー設定)で、venue関連コードには一切触れていない。実害なしと確定。再確認は不要。

## 残タスク(`venue-lobby-removal-DESIGN.md`のPatch 2〜4・別途着手)

正本: [venue-lobby-removal-DESIGN.md](venue-lobby-removal-DESIGN.md)

1. **Patch 2**: INLINE版の表示上限を200→48に戻す(`popup-entry.js`のlimit定数)。**鏡capも同じ定数に追随させること**(v1052の実績地雷=limitと鏡capを分離すると①≠③の不一致が起きた実例あり)。
2. **Patch 3**: INLINE二重スクロール撤去。`extension/popup.html`の928-935行付近(`html.nl-inline body .nl-story-userlane-stack .nl-story-userlane { max-height:40vh; overflow-y:auto; }`)を削除し、`.nl-main`のスクロールバーを非表示化する(`scrollbar-width:none`等)。既存コメント(907行)に「縦スクロールは`.nl-main`のみ」という設計原則が明記されているので、そこへの回帰。
3. **Patch 4**: 診断ページ(`status-entry.js`)の軽量化。「概要を軽く初期描画、詳細は開いた時だけ生成」にする。既存の`<details>`パターンを使った`lazySectionPainter`ヘルパーを新設し、マインドマップ等の重いセクションを遅延生成にする。**全面作り直しはしない**(既存のdiff-skip・バックオフ機構は温存)。実装前に`_lastRefreshPerf`の内訳を実機で1回読み、どのセクションが支配的か確認してから包む対象を決めること。
4. **(スコープ外・Patch 3後に着手)**: スクロール白化の実修正(W-2)。前回実装した`scrollWhiteoutProbe.js`は観測計器であって修正ではない(誤解しないこと)。Patch 3でスクロールコンテナが1つ減るため、まず新構造でprobeを実測してから真犯人を特定する。

## 地雷(踏まないこと)

- host/iframeには一切触れない(既存の強い制約・ちかちか事故の教訓)
- 検証エージェント(reality-checker等)実行中はcommitしない(detached HEAD事故の既知地雷)
- 新規lib追加時はtree-map/feature-mapの再生成をコミットに含める(`npm run tree-map`/`npm run feature-map`)
- version bump時は3点セット(manifest.json/package.json/changelog.js)を同期し、直後に`npm run verify:cc`を再実行してtree-mapのdrift再発を確認する
- limitと鏡capは必ずセットで変更する(Patch 2の地雷)
