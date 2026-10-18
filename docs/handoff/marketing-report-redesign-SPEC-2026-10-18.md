# マーケレポート作り直し — 仕様(設計=Fable / 会議素材=無料LLM5体 / 裏取り=司令塔 / 2026-10-18)

> 依頼書: [marketing-report-redesign-FABLE-BRIEF-2026-10-18.md](marketing-report-redesign-FABLE-BRIEF-2026-10-18.md)
> 実装の手順書: [marketing-report-redesign-IMPLEMENTATION-HANDOFF-2026-10-18.md](marketing-report-redesign-IMPLEMENTATION-HANDOFF-2026-10-18.md)
> 状態: **設計のみ・未実装**。実機の効果は未確認。

## 司令塔の裏取り(Fable の主張を実コードで確認)
- ✔ `sectionAudienceParticipationLead` は `marketingChartsHtml.js:2318`(実在)。
- ✔ `formatKokenGiftStreamTimeLabel`: `sortKey = max(0, publishedAt - showTimeBeginAt)`(`kokenGiftHistoryApi.js:175-191`)。`showTimeBeginAt` は保存されない(0 にクランプされた行は復元できない=要確認)。
- ✘ **Fable の「対象ファイルは全行 CRLF」は誤り**: `git ls-files --eol` で `marketingChartsHtml.js` / `giftMomentumAnalytics.js` / `marketingAggregate.js` / `kokenGiftHistoryApi.js` / `adObservationLog.js` はすべて `i/lf w/lf`(LF)。改行コードの罠は、ファイルごとに `git ls-files --eol` で確かめること(`background.js` と `reportCommentsTableSection.js` は混在・Shift-JIS のファイルもある=`kokenGiftHistoryFetchClient.js`)。
- 会議の案が挙げたファイル名(`normalize.ts`・`DeltaBar.tsx`)は**存在しない**(このリポは JS・React ではない)。使わない。

## 結論(必答論点)
1. **見せる順**: ①ギフトが飛んだ瞬間に場が動いたか(前後5分のコメント・同接) ②誰が・いつ・何を ③次回に試すこと。①②は既存データだけで作れる。広告の「増えた瞬間の一覧」は新しい取得が要る(今の `nls_ad_obs_` は人ごとの初/最後の2点だけ)。
2. **最初の画面**: 来場と応援参加(既存・目次直下)+「ギフトの瞬間」(新規1章)+「次回に試すこと」(1〜3行)。既存約60章は**消さない・並べ替えない**。PRO章と「ボード/設計」系5章(`mkt-analysis-skills` `mkt-harness-scaling` `mkt-marketing-funnel` `mkt-segment-action` `mkt-data-summary`)は `<details>`(JS不要)で既定閉じる(v2)。廃止は本シリーズでしない(閲覧実態を測れない)。
3. **時刻軸**: 絶対時刻(epoch ms)に統一=ギフト `publishedAt*1000`・コメント `capturedAt`・同接 `capturedAt`。`sortKey`(配信内経過)と `r.timeline` の minute(原点=最初のコメント)は軸に使わない。窓=前5分/後5分・ギフト同士60秒以内は1つの「瞬間」に束ねる・瞬間が5件未満なら中央値を出さず個別行のみ。広告は v3 で人別2点だけ(曲線には重ねない)。
4. **次回の一言**: 数字→固定テンプレの純関数(1〜3行・「〜かもしれません/価値があります」で統一・断定語禁止・テストで機械照合)。
5. **版**: v1=新規純関数+新章+目次1行+テスト(追加だけ) / v2=折りたたみ / v3=広告の気づいた時刻を書き出しに通す / v4=連鎖・沈黙明け・初ギフトまで / v5=`giftMomentumAnalytics.js` の時刻を `publishedAt` へ。
6. **少数意見**: 情報削減の撤回=採用(消さず折りたたむ) / 信頼区間=不採用(n≤100で誤読を増やす・代わりに「k/n」と中央値) / 前後10分・30分=部分採用(窓を引数に・v4) / 企業配信者の長期KPI=不採用(既存KPI章は残る)。

## 構成(コンポーネント)
| 部品 | 置き場所 | 内容 |
|---|---|---|
| `analyzeGiftMoments(input, opts)` 純関数 | 新規 `src/lib/giftMomentAnalytics.js` | in: `giftSubAppHistory.history[]`・`comments[]`・`sessionSummaryRows[]`・`officialTotalPoint`/`officialRemaining` / out: `{ moments[], summary, notes[], axisOk, excluded }` |
| `sectionGiftMoments(result, maskShare, identiconResolver)` | `marketingChartsHtml.js` に追加 | `sectionAudienceParticipationLead` の直後・目次の2番目に `{ id:'mkt-gift-moments', label:'ギフトの瞬間' }`。既存の `escapeHtml`・`displayUserLabel`・`buildUserProfileLinkedLabelHtml`・`resolveReportUserThumbSrc`・`wrapThumbWithProfileLink`・`maskLabelForShare` を再利用 |
| 配線 | `buildMarketingDashboardHtml` 内 | 入力は既に揃っている(`opts.giftSubAppHistory`・`currentCommentsForAnalytics`・`sessionSummaryRows`)。`marketing-export-entry.js` は v1 では無変更 |
| `buildGiftMomentNextActions(summary)` | 同新規ファイル | 0〜3行 |

## 具体機構(数値・文言)
- **軸の検疫 `axisOk`**: ギフト時刻の [min,max] がコメント `capturedAt` の [min−10分, max+10分] に収まるとき true。false(タイムシフト・時計ずれ・別配信)なら瞬間カードを出さず「ギフトの公式時刻と、このPCがコメントを受け取った時刻が重なりません(タイムシフト視聴や時計のずれの可能性)。瞬間ごとの前後比較は出せません。」。合計件数・ptは出す。
- **瞬間**: 時刻昇順で、前のギフトとの間隔 ≤ 60秒なら同じ瞬間。窓 `before=[startAt−300s,startAt)`・`after=(endAt,endAt+300s]` のコメント件数。窓が足りない瞬間は `fullWindow=false`(個別カードには出すが集計から外し「窓が足りない」バッジ)。同接は窓の端に最も近い行(±90秒以内)・無ければ「—」・official/estimated を小さく。
- **集計**: `n`=fullWindow の瞬間数。`n≥5`: 「後で増えた瞬間 k/n」「後−前の中央値」「同接差の中央値(件数併記)」。`n<5`: 「ギフトの瞬間が N 件(5件未満)なので、傾向はまだ言えません。瞬間ごとの数字だけ載せています。」(中央値を出さない)。`n=0`: 章ごと省略。
- **100件上限**: `officialRemaining>0` で「公式が返す履歴は新しい順に100件までです。古い方の N 件は載っていません(公式の値)。」。`officialTotalPoint` と明細合計が不一致なら両方併記して「一致しません」。
- **相関の注記(固定)**: 「ギフトの時刻は公式(koken)の公開時刻、コメント・同接は拡張がこのPCで受け取った時刻です。前後の増減は『同じ時間に起きたこと』であり、ギフトが原因とは限りません。」
- **単位**: pt と contribution を混ぜない。カードは pt。公式ランキングとの照合行だけ contribution(=ptの10倍)を括弧で添える。
- **重い配信**: `capCommentsForAnalytics`(間引き)を通るとき、カード頭に「コメントは一部サンプル(重い配信)」を固定表示。
- **話題語**: 窓内コメントの簡易分割で上位3語(TF-IDFは入れない)。`maskShareLabels=true` のとき本文由来の語は出さない(既定案)。
- **次回の一言(最大3行)**: `k/n≥0.6 かつ n≥5` 「ギフトの後にコメントが増えやすい回でした。次回はギフトが来たら名前を呼んで一言返す時間を取ると、同じ流れを作れるかもしれません。」/ 連鎖 ≥2 「ギフトが続けて飛んだ瞬間が N 回ありました。最初の1件のお礼を丁寧にすると、続きやすいのかもしれません。」/ 静かな時間のギフトが半分以上 「静かな時間にも支えてくれる人がいます。コメントが少ない時間帯のお礼を意識する価値があります。」/ `n<5` 「次の配信でも同じ章を見比べると、傾向が見えてきます。」。禁止語: 「〜が原因」「〜すれば増える」「必ず」。
- **広告(v3)**: 「初めて検知 HH:MM・そのとき P pt / 最後に増えたのを検知 HH:MM・+D pt」+注記「拡張が気づいた時刻(最大約30秒の誤差・拡張を開く前の分は分かりません)」。`marketing-export-entry.js` の `chrome.storage.local.get` に `adObservationStorageKey(lid)` を1キー足して `opts.adObservations` で渡す。

## 偽陽性・誤解の防止(検証)
1. 単体(固定時刻の合成データ): 前後件数が手計算と一致 / 60秒以内の連鎖が1瞬間 / 窓不足が集計外 / `n<5` で中央値キーが null / 軸不一致で moments 空 / `publishedAt=0` 行の除外数 / 次回文に禁止語なし。
2. HTML統合: koken形式の履歴を渡すと `id="mkt-gift-moments"` が `mkt-participation-lead` の後・`mkt-analysis-skills` の前、渡さないと出ない・目次にも出ない、`maskShareLabels=true` で実名リンク・サムネURL・話題語が出ない。
3. 実配信: 瞬間カード1件を選び、同じ時刻を koken のギフトタブ(時計表示)と目視一致 / 前5分の件数を `reportCommentsCsv` の出力で手数えして一致 / 章のギフト件数 = 投げ履歴章の `totalThrows` / pt 合計 = `officialTotalPoint`。
4. タイムシフト配信: `axisOk=false` の文言が出て瞬間カードが出ないこと(出たら誤り)。
5. 退行: 元に戻すと赤くなるテスト=(2)の「渡すと出る」「順序」。既存 `marketingChartsHtml.test.js` は無変更で通る(`npm run test:cc`)。
6. 因果の文言: 「後で増えた」は件数の比較だけを言う。`classifyFlow`(`giftMomentumAnalytics.js`)の「ギフト後に反応が伸びた」のような因果に読める文言は新章で使わない(AGENTS §12.7)。

## 範囲外(今回やらない)
既存章の削除・並べ替え / ヒーローカードの移動(inline script を含む) / 広告を同接曲線に重ねる / 信頼区間・p値 / TF-IDF・形態素解析 / `giftMomentumAnalytics.js` の書き換え(v5で判断) / `showTimeBeginAt` の新規保存。

## 決めてほしいこと(既定案つき)
1. 折りたたみ(v2)の既定: (a) PRO章とボード章を閉じる [既定] / (b) 全部開いたまま(印刷派)。印刷時は `<details>` を強制展開できず、畳んだ章は見出しだけになる。
2. 広告の「気づいた時刻」(v3): (a) 人別の初めて/最後の2点を載せる [既定・注記固定] / (b) 載せない。
3. 共有伏せ字のとき瞬間カードの話題語: (a) 出す / (b) 出さない [既定]。
4. 窓の幅: (a) 前後5分固定 [既定] / (b) 5分+2分の2段。

## 未確認
重い配信の間引き方式(`capCommentsForAnalytics`)・`sessionSummaryRows` の上限200行(長時間配信で同接が欠ける向き)・`sortKey` が0にクランプされた行の復元・`<details>` 内アンカーへの目次ジャンプで自動で開くか(実機)・簡易分割 `roughTokens` が export されているか。
