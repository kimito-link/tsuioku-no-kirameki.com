# reference: コメント記録HTML タイムアウト 修正依頼書(v0.1.613時点)

> ⚠️ Codex への実装依頼の正本。AGENTS.md + 本ドキュメント + 関連 reference を読んで自走し、
> **実装まで行う**(調査は司令塔が完了済み)。ブランチ `fix/comment-html-report-timeout` に commit/push。
>
> 司令塔(Claude Code)が真因を特定済み。Codex は放送系perf の縄張り
> (memory/codex_collaboration_rules.md)として、heavy mode の修正を設計+実装する。

## 1. 症状(2026-06-03 ユーザー実機)

- コメント記録HTML(「コメント・配信情報を読み込み中…」→保存)のDLが失敗
- エラー: `[nls] HTML レポート保存に失敗 Error: html_report_build_timeout`
- 配信: `lv350671499`(コメント大量・推定 >2500件の heavy 配信)
- スタックトレース: `dist/popup.js` の `downloadCommentsHtml` 経由

## 2. 真因(司令塔が特定済み・再調査不要)

`src/extension/popup-entry.js` の `async function buildHtmlReportDocument(...)`(15031〜)で、
heavy mode(`comments.length > HTML_REPORT_HEAVY_COMMENT_THRESHOLD = 2500`)でも
**cap/skip されず全コメント走査する集計が3つ残っている**:

1. `aggregateMarketingReport(commentsForReport, ...)`(popup-entry.js:15285)
   - marketingAggregate.js 内部で約7回 full pass(filteredコメント全走査)
2. `analyzeAudienceEngagementGap({ comments: commentsForReport, ... })`(popup-entry.js:15288)
   - audienceEngagementGap.js で全コメント走査(1 pass)
3. `computeKiramekiAwards({ comments: commentsForReport, ... })`(popup-entry.js:15403)
   - **threshold guard が無い**。kiramekiAwards.js 内部で:
     - `buildUserTotalCharsMap` / `buildUserShortCommentCountMap` / `buildSottoUserSet`(227-229)が各 O(N)
     - `buildSottoUserSet` は `SOTTO_WARM_WORDS.some(w => text.includes(w))` を
       **コメント毎 × 25語+** で実行(kiramekiAwards.js:144)

→ N=数万コメントだと「10回以上の full pass + 中間配列/文字列生成 + GC」が累積し 90秒(最大180s)超え。
**単一の O(N^2) スモーキングガンは無い**。累積コストが真因。

## 3. 既に cap 済み(触らなくてよい・確認済み)

- room集計: `HTML_REPORT_AGGREGATE_ROOM_CAP = 500` + サンプル `HTML_REPORT_AGGREGATE_SAMPLE_MAX = 4000`
- CSV埋め込み: heavy で skip(popup-entry.js:15491)
- コメントテーブル: 先頭80行のみ(`buildReportCommentsTableSectionHtml` は SAFE)
- overflow JSON: heavy で skip
- きらめき**過去スキャン**(returningUserKeys 判定): threshold で skip + 15s timeout(15356-15398)
- 2回目の aggregateMarketingReport: heavy で participationSummaryReport を再利用(15528)

## 4. 修正タスク(Codex 実装)

### 4.1 第一目標
**heavy 配信(>2500件)でも `buildHtmlReportDocument` が時間内に完了する**こと。
レポート本体(コメント表・KPI・スナップショット)は必ず出す。装飾系(きらめきの賞等)は
精度を落としてでも本体を人質に取らない(既存の「過去スキャン skip」と同じ思想)。

### 4.2 推奨アプローチ(Codex が最善を判断・複数案検討可)

- **案A(最有力): heavy mode で `computeKiramekiAwards` を skip またはサンプリング**
  - skip なら賞セクションを「コメントが多いため簡易表示」にフォールバック(空でも本体は出る)
  - サンプリングなら先頭+均等 N件(例 2000件)で賞を計算(精度だけ落とす)
  - 既存パターン: きらめき過去スキャンの `commentsForReport.length <= HTML_REPORT_HEAVY_COMMENT_THRESHOLD`
    guard(15359)と同型で揃える
- **案B: heavy mode で集計入力をサンプリング**
  - aggregateMarketingReport / analyzeAudienceEngagementGap / computeKiramekiAwards に渡す前に
    comments を均等サンプリング(KPIの近似で十分・件数表示は実数を維持)
  - ただし「正確な集計」を期待する箇所への影響を慎重に評価(誤差の許容範囲を明記)
- **案C: 個別集計を withTimeout で枠取り**(きらめき過去スキャンと同様)
  - 各集計を try/withTimeout で囲み、超過したらその集計だけ落として本体は出す
- **対症療法(非推奨): buildTimeoutMs を上げるだけ** — 根治にならないので避ける

司令塔の推奨は **案A + (必要なら)案C のハイブリッド**。賞は heavy で精度を落としてよい装飾系。

### 4.3 絶対遵守

- **v0.1.592 baseline zip の挙動を壊さない**(`reference_baseline_v0192_zip`)
- 軽い配信(<2500件)の出力は**一切変えない**(従来通り全件・賞も完全精度)
- 「症状を隠す」修正(早期 return で本体ごと消す等)は禁止。本体は必ず出す
- 件数表示(「全 N 件中…」)は**実数を維持**(サンプリングしても表示数字は偽らない)
- マーケHTML(`buildMarketingDashboardHtml`)は触らない(別ビルダー・PR #216 で対応済み)
- バージョン bump(manifest/package/changelog 同期)を忘れずに → v0.1.614

### 4.4 テスト方針(必須)

- 純関数レベル: サンプリング/skip ヘルパーのユニットテスト
- 回帰: heavy mode(>2500件のモック)で `buildHtmlReportDocument` 相当が
  時間内に本体HTMLを返すこと。軽い配信では出力が従来と一致すること
- 既存テスト全緑(`npm run verify`): 特に reportCommentsTableSection / marketingAggregate /
  kiramekiAwards / exportWaitNarration 系

## 5. 出力

- 実装を `fix/comment-html-report-timeout` ブランチに commit/push(起点は origin/master = v0.1.613)
- 設計判断のメモを `docs/codex-comment-html-timeout-fix-v0613.md` に残す
  (採用した案・サンプリング閾値・誤差許容・テスト結果)
- `npm run verify` を通すこと

## 6. 環境情報

- 起点ブランチ: `fix/comment-html-report-timeout`(origin/master = v0.1.613 = 295001b ベース)
- 主要ソース:
  - `src/extension/popup-entry.js`(`buildHtmlReportDocument` 15031〜・heavy 判定 15169)
  - `src/lib/kiramekiAwards.js`(`computeKiramekiAwards` / `buildSottoUserSet` 144)
  - `src/lib/marketingAggregate.js`(`aggregateMarketingReport`)
  - `src/lib/audienceEngagementGap.js`(`analyzeAudienceEngagementGap`)
  - `src/lib/reportCommentsTableSection.js`(各種 cap 定数・既に SAFE)
  - `src/lib/exportWaitNarration.js`(`resolveHtmlReportBuildTimeoutMs` 90s〜180s)
- 関連 reference:
  - `reference_comment_html_report_timeout_v0612`(真因の詳細・本依頼の元データ)
  - `reference_baseline_v0192_zip`(尊重対象)
  - `handoff_2026-06-03_evening_session`
  - `codex_collaboration_rules`(縄張り)

## 7. 完了条件

1. heavy 配信(>2500件)で `buildHtmlReportDocument` がタイムアウトしない
2. 軽い配信の出力は従来と完全一致(賞も全精度)
3. 件数表示は実数を維持(サンプリングでも偽らない)
4. `npm run verify` 全緑 + 回帰テスト追加
5. v0.1.614 に bump
6. `docs/codex-comment-html-timeout-fix-v0613.md` に設計メモ
