# マーケレポート作り直し — 実装ハンドオフ(v1 のみ・この1枚で着手できる)

> 仕様: [marketing-report-redesign-SPEC-2026-10-18.md](marketing-report-redesign-SPEC-2026-10-18.md)(設計=Fable・裏取り=司令塔)。**実装はユーザーの明示の指示があるまで着手しない。**
> 先に確認: ユーザーへの質問4つ(仕様の「決めてほしいこと」)。v1 はどの回答でも作れる(折りたたみ・広告は v2/v3)。

## スコープ(v1 だけ・追加だけで消さない)
新規 `src/lib/giftMomentAnalytics.js`(+`.test.js`)・`marketingChartsHtml.js` に `sectionGiftMoments` 1関数+body 1行+目次1行+CSS少量・`marketingChartsHtml.test.js` に it を3つ・bump 3点。**`marketing-export-entry.js` は触らない**(入力は既に渡っている)。
入れない: 広告・折りたたみ・連鎖の統計(ラベルだけは出す)・信頼区間。

## 着手手順
1. master から `feat/report-gift-moments` を切る(master は別のワークツリーが使っていることがある=`git checkout master` が失敗したら `git fetch && git checkout -b <ブランチ> origin/master`)。
2. **先に赤**: `giftMomentAnalytics.test.js`(仕様「偽陽性・誤解の防止 1」の7項目)。
3. 純関数を実装(緑)。入力は `giftSubAppHistory.history[]`・`comments[]`・`sessionSummaryRows[]`・`officialTotalPoint`/`officialRemaining`。出力 `{ moments, summary, notes, axisOk, excluded }`。
4. `sectionGiftMoments` を `marketingChartsHtml.js` に追加し、`buildMarketingDashboardHtml` の `sectionAudienceParticipationLead` の直後に `idWrap('mkt-gift-moments', …)`、`allTocItems` の2番目に目次1行。既存の部品(`escapeHtml`・`displayUserLabel`・`buildUserProfileLinkedLabelHtml`・`resolveReportUserThumbSrc`・`wrapThumbWithProfileLink`・`maskLabelForShare`・`DEFAULT_USERICON_ONERROR_ATTR`)は `sectionGiftMomentum` の使い方を真似る。
5. HTML統合テスト3つ(渡すと出る+順序・渡さないと出ない・目次にも出ない / 伏せ字で実名リンク・サムネURL・話題語が出ない)。
6. 変異テスト: 軸の検疫・窓不足の除外・`n<5` の中央値抑止・禁止語照合を壊すと赤になること。
7. `npm run tree-map && npm run feature-map` を `git add` の後に。新規ファイルは**明示 git add**。`FEATURES` 辞書に1行(grep で担当ファイルを確かめてから)。
8. 実配信の確認(仕様の検証 3・4)。完了判定=`npm run verify:cc` 緑+検証3の4点一致。

## 地雷
- 改行コード: 対象の .js は LF(`git ls-files --eol` で確認済み)。`background.js`・`reportCommentsTableSection.js` は混在、`kokenGiftHistoryFetchClient.js` は Shift-JIS で、このスコープでは触らない。
- Windows の `python -` に日本語を渡すと化ける=スクリプトは UTF-8 のファイルにして実行する。
- マーケレポートは JS を足さない(既存の inline script は触らない)。
- 数字の正本: 「件」と「人」を混ぜない・ギフトの合計は公式 `officialTotalPoint` と照合・pt と contribution(=ptの10倍)を混ぜない。
- 時刻軸は絶対時刻のみ。`sortKey` と `r.timeline` の minute は使わない。
- 因果に読める文言禁止(`classifyFlow` の文言を流用しない)。
- 視聴中の `copy:ext` 禁止・実機未確認は断言しない・1版1変更(広告や折りたたみを混ぜない)。
- 重い配信(間引き)では「コメントは一部サンプル」を固定表示。
