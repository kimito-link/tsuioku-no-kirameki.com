# 統合(司令塔・実コード裏取り済み): status 健全度20セルパネル

> COUNCIL health-panel(2026-06-20)。design分類・FAST・2/3成功(qwen API脱落・groq速い・gpt-oss批判が秀逸)。
> 元ログ=council/health-panel-log.txt / 生回答=council/health-panel-answers.json / お題=council/health-panel-question.txt
> 批判役 gpt-oss が設計を主導。司令塔が statusMindmapModel の既存 badge 計算を裏取り。

## 結論(1案)

status のファーストビュー(guidepost の上)に **健全度セル ~18個のグリッド**を置く。
**既存 statusMindmapModel.js / statusActionAdvisor.js が既に計算している値を「%+色」に再表示するだけ**=
新規診断・新規集計ゼロ。正常=100%(緑・目立たせない)・劣化=黄/赤+数値・**対象外/不明は「—」(色なし・スコア付けない)**。
各セルの%算出は純関数 src/lib/healthCells.js(+test)に正本化。クリックで対処カード/マインドマップの該当へ。

🔴 **批判役の鋭い設計を採用(司令塔も同意)**:
- **不明(unknown)/該当データ無しは 0%=赤にしない→「—」**。情報不足を障害と誤認させない(星野ロミ式・失敗体験の除去)。
- **取得率は「記録/公式」1セルに統合**(記録と公式を別セルにしない=二重計上の冗長を排除)。
- **対象外は「—」でスコアを付けない**(正常配信で赤だらけを防ぐ)。

## 根拠

- 司令塔の裏取り: statusMindmapModel.js は既に badge(ok/warn/bad)を **80/40 閾値**で計算済
  (取得率:76,104 / withUidPercent:140 / NDGR接続 / 北極星 state / paint / stale)。∴ 20セルは
  **badge→% の再表示**=新規診断でない・hot path を重くしない(同じ値を別 view)。
- 会議2/2一致: 既存値の%化のみ・新規集計禁止・対象外は「—」・純関数+test。
- 状態速報の実データで埋まる(実機 lv350761522 で確認): 取得率99 / withUid100 / NDGR connected /
  backfill reached_start / 北極星 ok×3+空×2+iframe×1 / avatar 14/28 / paint 62ms / stale true。

## 反論・リスク(司令塔の選別)

- ❌ Llama案の「取得率(記録)と(公式)を別セル」= 二重計上(批判役指摘)。→ 1セルに統合。
- ❌ 「unknown を 0%赤」= 誤認(批判役)。→ NDGR unknown は「—」(まだ受信前=障害でない)。
- ⚠️ paint ms の%化(100 - paintMs/10 等)は恣意的になりやすい。→ 段階(良60ms未満=緑/中=黄/重=赤)で
  "%は出さず色だけ"でも良い。数値が意味を持つセル(取得率/withUid/avatar率)だけ%、状態セル(NDGR/stale/
  北極星)は色+短文。**全部を無理に%化しない**(恣意的%を作らない=お題の過剰回避)。
- やってはいけない過剰実装(会議+司令塔): ①新規の重い集計を20個毎更新で走らせ status を重く
  ②該当データ無しを0%にして正常配信で赤だらけ ③対処カードと矛盾する値 ④恣意的重み付けで無意味な%
  ⑤20セルが多すぎて逆に見えない(18前後に抑える)。

## 具体案(セル一覧・各セルの%/色・対象外)

純関数 src/lib/healthCells.js: `buildHealthCells(livesData, fastDiag)` が下記セル配列
`{ id, label, kind:'pct'|'state', value:number|null, level:'ok'|'warn'|'bad'|'na', text? }` を返す。
%セルは value(数値)・state セルは level+text。na=「—」(色なし)。

| # | セル | kind | 100%/緑 | 黄 | 赤 | 対象外(—) |
|---|---|---|---|---|---|---|
| 1 | 取得率(記録/公式) | pct | ≥80 | 40-79 | <40 | 公式0件 |
| 2 | userId付き保存率 | pct | ≥90 | 50-89 | <50 | 保存0件 |
| 3 | NDGR接続 | state | connected | reconnect中 | disconnected | unknown(未受信) |
| 4 | リアルタイム取り込み | state | 直近<2分 | 2-5分 | >5分 | 取り込み無し配信 |
| 5 | 過去ログ(backfill) | state | 完了/reached_start | 進行中 | stalled | 対象外 |
| 6 | アバター解決率 | pct | =観測数 | 部分 | 低 | 観測0(intercept0) |
| 7 | 描画(paint) | state | <60ms | 60-150 | >150 | 裏タブ |
| 8 | 多タブ名残 | state | 無 | — | — | (staleは警告だが赤にしない=黄まで) |
| 9-14 | 北極星6レーン(貢献度/広告/ギフト履歴/Eスコア/番組pt/E順位) | state | ok | 取得中/iframe | 不可 | no_event/該当無し=— |
| 15 | コンソールエラー | state | 0件 | — | あり | — |
| 16 | storage安定 | state | stallなし | — | stall/timeout | — |
| 17 | 記録↔公式一致(B後) | pct | 差<2% | 2-10% | >10% | 公式0 |
| 18 | NDGR接続維持 | state | reconnect 0 | 数回 | 多発 | — |

- 北極星6レーンの no_event/該当データ無しは **「—」**(その配信にイベント/ギフトが無いだけ=赤にしない・批判役)。
- paint/NDGR/stale 等の状態セルは%でなく色+短文(恣意的%を作らない)。
- 値は status が既に持つ livesData + fastDiag から取る(statusMindmapModel と同じ入力)。新規集計ゼロ。

## status への描画

- src/extension/status-entry.js: guidepost(はじめての方へ)の【上】に `<section class="health-cells">` を描く。
- グリッド(auto-fill・狭幅で折返し)。緑は淡く・黄/赤だけ目を引く配色(低いものに視線)。各セル %or短文 + label。
- クリック=対処カード(statusActionAdvisor)の該当 or マインドマップ該当ノードへスクロール。
- 2秒更新の paint で buildHealthCells を呼ぶ(純関数・軽い)。

## 段階導入
- 第1: healthCells.js 純関数+test(各セルの%/level/na 算出・「—」を赤にしない回帰を固定)。
- 第2: status-entry に描画+CSS。実機で「正常配信は全部緑/—・異常だけ色」を確認。
- substantial=フェーズ・フロー図は任意(セル定義表が正本)。

## 制約(星野ロミ式)
記録本体不可侵・新storage不要・hot path(2秒更新)重くしない・既存データ活かす(statusMindmapModel/Advisor)・
過剰実装回避(全部%化しない・恣意的重み禁止)・該当無しは「—」で赤にしない(失敗体験の除去)・純関数+test先行。
