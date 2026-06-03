# Codex 実装メモ: コメント記録HTML タイムアウト修正(v0.1.614)

> 司令塔(Claude Code)が真因特定 → Codex が実装 → 司令塔が読み戻し+verify+設計メモ整理。
> 依頼書正本: `memory/reference_comment_html_timeout_fix_request_v0613.md`

## 採用した案

**案A(heavy mode で `computeKiramekiAwards` をサンプリング)** を採用。

理由:
- 真因の主因が `computeKiramekiAwards` → `buildSottoUserSet`(SOTTO_WARM_WORDS 25語 × コメント毎の
  substring 検索)であり、ここの入力を絞れば最大の累積コストを削減できる
- 賞は「装飾系」であり、本体(コメント表・KPI・スナップショット)を人質に取らない設計思想に合致
- 軽い配信(<2500件)は `mode: 'full'` で**完全に従来通り**(後方互換を厳守)

`aggregateMarketingReport` / `analyzeAudienceEngagementGap` には今回は手を入れていない
(これらは内部 pass はあるが O(N) 線形で、賞の word-matching ほど重くない。まず最大の主因を断つ)。

## 実装

新モジュール `src/lib/htmlReportKiramekiAwards.js`:

- `HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_MAX = 2000`(賞の本文判定に使うコメント上限)
- `HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_HEAD = 200`(序盤の空気を残すため先頭は固定保持)
- `sampleKiramekiAwardCommentsForHtmlReport(comments, opts)`:
  先頭 head 件 + 残りを均等インデックスサンプリングして合計 sampleMax 件に。
  末尾(最新コメント)も必ず含める。エッジケース(sampleMax 0/1、list <= cap)を全網羅。
- `selectKiramekiAwardCommentsForHtmlReport(comments, opts)`:
  `list.length <= heavyThreshold(2500)` なら `mode:'full'`(原配列そのまま)、
  超えたら `mode:'sampled'`。`originalCommentCount` / `awardCommentCount` を返す。
- `computeKiramekiAwardsForHtmlReport(input, opts)`:
  上記で入力を選択 → `computeKiramekiAwards` に渡す。`selection` を結果に同梱。
  `computeAwards` を opts で差し替え可能(テスト用 DI)。

`src/extension/popup-entry.js`(`buildHtmlReportDocument`):
- `computeKiramekiAwards` → `computeKiramekiAwardsForHtmlReport`(heavyThreshold 指定)に差し替え
- `selection.mode === 'sampled'` のとき、賞セクションの前に**透明性ノート**を表示:
  「コメントが N 件あるため、賞の本文判定は代表 M 件で簡易集計しました。
   保存コメント一覧などの件数表示は実数のままです。」
  → 「件数表示は実数を維持・数字を偽らない」要件を満たす

## サンプリング閾値・誤差許容

- heavy 判定: 2500件(既存 `HTML_REPORT_HEAVY_COMMENT_THRESHOLD` を流用)
- 賞の本文判定サンプル: 先頭200 + 均等1800 = 計2000件
- 誤差: 賞(かよい/はじまり/ことば/ひかり/えがお/そっと)の判定精度が heavy 時に近似になる。
  ただし「誰も負けない設計」の賞なので、サンプリングで漏れても致命的でない。
  ユーザーにはノートで明示。**本体は必ず全件ベースで出る**(コメント表・件数・KPI)。

## テスト

- 新規 `src/lib/htmlReportKiramekiAwards.test.js`(4 ケース):
  1. 軽い配信は原配列を渡す(`mode:'full'`・参照一致)
  2. 軽い配信は `computeKiramekiAwards` と結果完全一致(後方互換証明)
  3. heavy は先頭保持+均等サンプル+cap(末尾含む・重複なし)
  4. heavy は `computeAwards` に全件を渡さない(DI spy で sampled 件数のみ確認=perf 修正の証明)
- 既存 `src/lib/reportCommentsTableSection.test.js`:
  heavy ノートの件数文言(実数)アサーションを強化

## 検証結果

- `npm run verify` 全緑: **4887 tests passed**(+4 新規)/ lint / typecheck / build
- バージョン: 0.1.613 → **0.1.614**(manifest / package / changelog 同期)

## 残課題(将来・任意)

- さらに重い配信で `aggregateMarketingReport`(~7 pass)も詰まるなら、同様のサンプリング適用を検討。
  ただし aggregate は「正確な集計」を期待される箇所が多いので、サンプリングより
  「一度の走査で複数集計を同時計算する統合パス」のほうが望ましい(誤差ゼロで高速化)。
- 今回は最大の主因(賞の word-matching)を断ったので、まず実機で効果確認。
