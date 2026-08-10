# 記録104%(匿名主体) 切り分け計器 — v0.1.1001 (2026-06-30)

## 結論
master HEAD = **v0.1.1001 (1486d51f)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1001。
実機 lv350848725「記録9757>本家9420=104%・要確認」(匿名184主体・withUidPercent:0)の**内訳計器**を追加。
真因はまだ確定していない=**見える化して次配信で実測**する段階(推測で直さない)。

## 証拠が2つに割れている(だから計器を先に)
- Explore(90%信度): 匿名コメは commentNo 欠落(ndgrDecode.js:290 で no 無しでも採用)。dedup キーが
  `liveId||text|sec|uid`(capturedAt秒依存・commentRecord.js:75-84)。ライブ(capturedAt未スタンプ→Date.now秒)と
  backfill(programStartMs+vpos*10)で sec が割れて二重しうる。loneDedupe は count>1 で cap 無効化(commentRecord.js:197)
  =同一 text を別人が連投する匿名配信で cap 再利用が効かない=二重がすり抜ける。
- 司令塔の構造反証: 9700件で4%超は**系統的二重にしては小さすぎる**。本家 statistics.comments(content-entry.js:2205)が
  記録と母数が違う(数え方差)で 104% になっている線もある。
- ★過去 Explore は2回根拠を外している=鵜呑みにせず実測で確定する方針。

## v0.1.998 との違い(なぜ未解決)
v0.1.998 は「commentNo 欠落行が tail に20件たまったら早期 compact」で**一時**二重を是正。だがこの配信は
**ほぼ全コメントが欠落行**=compact が常時走っても、loneDedupe の count>1 cap 無効化や ライブ⊕backfill の
sec 割れは別問題で残る。単調ゲートが膨れたピークを焼き付ける可能性も。

## この版でやったこと(計器のみ・記録/dedup には触らない)
- commentObservabilityDiag.js `aggregateSavedCommentsUidStats`: 同一 walk で **commentNoLess /
  commentNoLessPercent** を追加(perf 不変)。fastDiag.content.giftDiagnostics.commentObservability.
  savedCommentsUidStats に自動同梱(既存の withUidPercent と同じ経路=プラミング追加不要)。
- commentCountProvenance.js `formatCommentCountProvenanceLines(livesData, fastDiag?)`: 要確認(check)のとき
  「内訳(計器): 記録のうち commentNo 欠落行 N件(P%) — 高いほど匿名主体で二重計上/低いほど本家差」を1行併記。
- aiShareFullText.js: 呼び出しに fastDiag を渡す(②③ も同テキスト)。

## verify
- verify:cc 緑(aggregator 4・provenance 内訳/正常時非表示/後方互換)。maps 再生成同梱。
- 出荷バンドル probe: 9757/9420=104%要確認に「内訳(計器): commentNo 欠落行 9,757件 (100%)」併記を確認。

## 次の一手(実測ドリブン・ユーザー次第)
次配信で状態速報スクショ →「数字の出どころ」の **内訳(計器) の欠落割合**を読む:
- **高い(90%+)** = 匿名主体 = 二重計上の温床大 → loneDedupe 強化(欠落行を text|uid で sec 非依存に突合・
  ただし同一text連投を誤って消さない設計が要・会議級)or ライブ⊕backfill の capturedAt 統一。
- **低い** = 本家統計の数え方差 → provenance の閾値/文言調整(匿名主体配信では 104% 程度を normal 寄りに)。
※backfill 取得率の計器(v0.1.999)と合わせ、次配信スクショで「記録104%」と「backfill律速」を同時に実測できる。

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
