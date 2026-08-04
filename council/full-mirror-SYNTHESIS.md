# 素材まとめ(段1・会議統合) — ①を丸ごと③に映す仕組み

> 3段構え段1。会議4体(design routed)+司令塔の実測裏取りを統合。段2でFableに渡す。2026-07-07。
> 会議ログ=council/full-mirror-answers.json。前段設計=memory/reference_web_mirror_parity_SYNTHESIS.md(第1号=応援タイムラインは実装済)。

## ユーザー要望(最優先)
「①に出てるものは全部③に丸うつしでいい」。中身を理解して③用に作り直すのでなく、①が描いたものをそのまま映したい。1パネルずつ手作業だと『次々これも無い』が無限に続く(実配信で応援タイムライン→投げ一覧→…と連続報告)。

## ★実測で裏取りした正確な現状(本番③の生jsonBlobを実fetch・2026-07-07)
jsonBlob実在キー: generatedAt/snapshotMeta/overview/lives/fastDiag/laneMirror/statCardsMirror/northStarMirror/topSupporters/commentTimelineMirror/parityVerdict/statusReport

- ③に届いて描けている: laneMirror/statCardsMirror/northStarMirror(但しlanesはadRanking+contributionRankingの2本のみ)/topSupporters/commentTimelineMirror/lives[0]/statusReport(①本文バイト一致)
- ③に鏡が来ていない=出しようがない(実測確認): **投げ一覧giftHistory(northStarMirror.lanesに無い・ホストDOMはあるがinnerLen:0)**・**配信採点broadcastScore(ホストDOMすら無い)**・セッション比較・ギフトサイドバー履歴giftSubApp・室温roomHeat(疑い)。
- ★Explore第1報の「投げ一覧は完全に届く/65%同期済み」は【誤り】。司令塔が実データfetchで反証(ホストDOM存在=描画される という推論の罠。第1号タイムラインと同型)。

## 会議の結論(4体中3体が(c)/(b)寄り)
- **(a)純セクションレジストリだけ**: 各パネルの鏡データ生成という手作業が残る=次々抜ける根本が消えない。却下(単独では不十分)。
- **(b)全HTML同梱**: 容量448KB破綻・ライブ性喪失。却下(全面採用は×)。
- **★(c)ハイブリッド採用**: 軽量パネル(laneMirror/statCards/northStar/comment)は既存の鏡そのまま流用、**重いパネル(投げ一覧/採点/セッション比較/ギフト履歴)は①の描画済みHTMLをサニタイズして同梱→③は貼るだけ**。パネル追加で③の作業が激減。statusReport(①本文をバイト一致で丸ごと送り③は貼るだけ)が既に成立している前例=このパターンをHTMLパネルに一般化する。

## 司令塔の警告(会議提案の危険な部分・Fableが実コードで安全化せよ)
会議は DOMPurify追加(新依存)・iframe sandbox・CSP `unsafe-eval`緩和 を提案したが、これらは:
- ③のchrome非依存・審査(WebViewラップ)・既存資産と衝突しうる。新依存(DOMPurify)は③のバンドルに載せる是非を要検討。
- 既存に sanitize 資産があるか(escapeHtml等)を実コードで確認し、新依存を足さず既存で賄えるか判定せよ。
- iframe注入でなく、既存の paintStatusReport が statusReport文字列をどう安全に貼っているか(textContent? innerHTML? sanitize?)を手本に、同じ安全度で。
- 容量: HTMLパネルは重いので prune はしご(448KB)に「HTMLパネルから先に落とす」優先順位を組み込む。全部盛りで超えないか実測見積り。

## Fableに設計させたい核心(段2)
Q1. (c)ハイブリッドの具体アーキ: どのパネルを「軽量鏡(既存流用)」に残し、どのパネルを「①HTML同梱→③貼るだけ」にするか の振り分け基準。statusReport方式(バイト一致同梱)を手本に、HTMLパネル用の最小の送信路(jsonBlob.htmlPanels?)を設計。既存 mirrorBundle/prune/セクションレジストリとどう束ねるか(作り直さない)。
Q2. 投げ一覧(giftHistory)を第2号として①HTML同梱で③に出す最小実装(触るファイル:行)。①側でどのDOMを・どう安全に文字列化し(既存sanitize資産で)・publish経路に新規read足さず・③でどう貼るか(paintStatusReportの手本)。容量はprune優先順位でどう守るか。
Q3. 「①にパネル足したら③に自動追従/忘れたらCI赤」を(c)方式でどこまで自動化できるか。HTMLパネルは「①のホストDOM id をレジストリに1行登録→①が自動でouterHTML同梱→③が自動で貼る」まで持っていけるか。人間の最小規律。
Q4. スマホ化(Capacitor/TWA)で(c)方式が審査/容量/オフラインに不利にならないか。①HTML内の匿名リンク(referrer露出)・画像src(外部CDN)の扱い。

## 制約・地雷
容量448KB(pruneはしご)・diff-skip触らない・voice触らない・referrer露出回避・publish経路に新規read足さない・既存の勝ちパターン(laneMirror/第1号タイムライン)作り直さない・③はchrome非依存維持・fail-closed・新依存追加は慎重に(既存資産優先)。第1号(応援タイムライン・feat/web-mirror-timeline-parity)は実装済でこの上に積む。
