# SYNTHESIS: 健全度パネルを「配信を見た瞬間ほぼ全部緑」に(嘘をつかず) — 2026-06-20

> お題=council/health-panel-allgreen-question.txt / 会議=COUNCIL_FAST routed(design・3/3成功 diverge/fast/critic)
> 司令塔が実コード(healthCells.js / status-entry.js:495 renderer / status.html .hc-*)で裏取り済み。

## 会議の結論(全員一致・批判役も賛成)
**道A(正直派)を採用。第5の level `processing`(青/水色)を ok と warn の間に追加し、黄/赤は「本当の異常(失速・エラー)」だけに留保する。**
ユーザーは「緑+青系=全部正常」と直感し、データ(率の数字)は一切偽らない。星野ロミ式の「失敗体験の除去」を、嘘をつかずに達成する唯一の道。

- 黄(warn)の現状の欠陥=「取得中」という**正常な途中状態**を「何かおかしい」と誤って伝えている=設計欠陥。
- 「100%完成」でなく「100%健全(Healthy)」へ概念をすり替える=配信中のデータ収集は「未完成」でなく「進行中の健全なプロセス」。

## 司令塔の裏取り(会議の訂正点)
- ❌ 会議が使った `isAnonymousHeavy` フィールドは**実在しない**(ローカルモデルのハルシネ)。代わりに既存の `decoded>0 && chats=0`(healthCells.js:159-163 が既に検出)をそのまま使い、level を warn→processing にするだけ。
- ✅ 会議が前提にしたフィールドは全て実在: `recordedCount`/`officialCommentCount`/`lastIngestAgoMs`/`bf.done`/`bf.stopReason`/`bf.running`/`officialRatePct`(healthCells.js が既に読んでいる)。
- ✅ renderer は status-entry.js:495 `div.className = \`hc hc-${c.level}\`` =level名をそのまま CSS クラスに。新 level は `.hc-processing` を status.html に足すだけ(JS renderer 改変不要)。

## 確定仕様(ユーザー承認: 進行中は青)
新 level `processing`。色=穏やかな青/teal(緑に近いトーン=「緑系で正常」と感じさせる)。

| セル | 現状 | 変更後 | 条件(実フィールド) |
|---|---|---|---|
| 過去ログ取得 | warn「取得中」 | **processing「取得中」** | `bf.running`(done/stalled は据え置き=done緑・stalled赤) |
| 取得率 | warn(率<80) | **processing**(進行中) / 完了後に ok/warn/bad | いずれかの live が `bf.running` → processing。全 backfill done で初めて率評価 |
| 記録↔公式一致 | bad(min率低) | **processing**(進行中) / 完了後に評価 | 同上(backfill 進行中の live は率評価から除外 or processing) |
| 貢献度ランキング | warn(iframe_unrendered) | **processing** | `state==='iframe_unrendered'\|'loading'` |
| ギフト履歴 | warn(iframe_unrendered) | **processing** | 同上 |
| NDGRコメント | warn「0(匿名/取得前)」 | **processing「0(匿名/取得前)」** | `decoded>0 && chats=0`(既存判定) |

**黄/赤に残すのは真の異常だけ:**
- 過去ログ `stopReason==='stalled'` → bad(失速)維持
- リアルタイム取込 `lastIngestAgoMs > 300s` → bad 維持(取り込みが本当に止まっている)
- エラー件数>0 → bad 維持
- storage SW停止 → bad 維持
- backfill **完了後**に率が低い → warn/bad(完了したのに低い=本当に取りこぼし)

## 不変の制約(星野ロミ式)
- 数字は偽らない(率70%は70%のまま・色だけ「進行中=青」)。
- 本当に詰まった時(stalled/エラー/取り込み停止)は緑にしない=self-verifying-loop 厳守。
- 新規集計を hot path に足さない(healthCells は再表示のみ)。既存フィールドで完結。
- 過剰実装しない(進捗バー/アイコンアニメは今回入れない=color+短文のみで最小)。

## テスト(characterization)
- backfill.running → 過去ログ/取得率/一致 が processing
- backfill done && 率高 → ok / done && 率低 → warn|bad
- stalled → bad(processing にしない=詰まりは隠さない)
- decoded>0 && chats=0 → NDGRコメント processing
- iframe_unrendered → 該当レーン processing
