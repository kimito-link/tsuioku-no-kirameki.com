---
name: reference_comment_html_report_timeout_v0612
description: コメント記録HTML(buildHtmlReportDocument)が重い配信でhtml_report_build_timeout(90s超)になる真因。課題BのマーケHTMLとは別ビルダー
metadata:
  type: project
---

# コメント記録HTML タイムアウト(html_report_build_timeout)真因(2026-06-03)

## 症状
- 重い配信(lv350671499・コメント >2500件)で**コメント記録HTML**のDLが `html_report_build_timeout`(90秒超)
- スタックトレース: `dist/popup.js` の `downloadCommentsHtml` 経由

## ⚠️ 課題B(マーケDL遅延・PR #216)とは別物
- **これ** = `buildHtmlReportDocument`(コメント記録HTML・popup-entry.js:15031)
- 課題B = `buildMarketingDashboardHtml`(マーケ分析HTML・marketingChartsHtml.js)
- **別ビルダー**。PR #216 はこのエラーを起こしてもいないし直してもいない。

## 真因(調査確定・Explore + 自力 grep)
heavy mode(comments >2500・`HTML_REPORT_HEAVY_COMMENT_THRESHOLD`)で既に cap 済みのもの:
- room集計 cap 500(HTML_REPORT_AGGREGATE_ROOM_CAP)、CSV skip、overflow JSON skip、
  コメントテーブルは先頭80行のみ(`buildReportCommentsTableSectionHtml` は SAFE 確認済み)、
  きらめき過去スキャンは threshold で skip + 15s timeout、2回目 aggregateMarketingReport は再利用(15528)

**しかし heavy mode でも cap されず全コメント走査する処理が3つ残っている**(popup-entry.js):
1. `aggregateMarketingReport(commentsForReport)` (15285) — 内部で ~7 回 full pass
2. `analyzeAudienceEngagementGap({comments: commentsForReport})` (15288) — 1 pass
3. `computeKiramekiAwards({comments: commentsForReport})` (15403) — **threshold guard 無し**。
   内部 `buildSottoUserSet` が `SOTTO_WARM_WORDS.some(w => text.includes(w))` を
   **コメント毎 × 25語+** で実行(kiramekiAwards.js:144)+ 他3 builder も各 O(N)(227-229)

→ N=数万コメントだと「~10+ 回の full pass × 中間配列/文字列生成 + GC」で累積 90秒超え。
**単一の O(N^2) スモーキングガンは無い**。累積コストが真因。

## 修正方針(未実装・要設計)
課題Bのような単純 dedup は不可(3つは別物を計算)。選択肢:
- (案X) heavy mode で `computeKiramekiAwards` を skip or サンプリング(賞の精度だけ落とす・本体は出す。
  既存の「きらめき過去スキャンを threshold で skip」と同じ思想)
- (案Y) heavy mode で comments をサンプリング(例 先頭+均等 N件)してから3集計に渡す
- (案Z) buildTimeoutMs を上げる(対症療法・非推奨)
- 放送系perf なので **Codex 案件**が定石(CLAUDE.md §T)。過去 v0.1.492/495/519/521/606 と同系列の戦場。

## 関連
- [[handoff_2026-06-03_evening_session]] / [[reference_baseline_v0192_zip]]
- 過去の重い配信対策: v0.1.606(runInterceptReconcile撤去)等
