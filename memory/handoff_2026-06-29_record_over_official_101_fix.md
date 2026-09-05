# 記録>本家コメ(101%)二次バグ 根治 — v0.1.998 (2026-06-29)

## 結論
master HEAD = **v0.1.998 (91cadacd)**・origin 同期 0/0・C:\nicolive-ext も v0.1.998。
「記録 > 本家コメ(101%超)が居座り状態速報が毎回『要確認』」の **二次的な実バグ**を根治。

## 真因(二層で確定・Explore + 司令塔の照合)
- 表示「記録」= 単調ゲート(per-lv・lv切替reset)を通した `observedRecordedCommentCount`
  = `tailMainCount + tailRowsBuffer.length`(main永続 ⊎ tailメモリ が素集合である前提)。
- **別配信混入=否定**(ゲートper-lv / 全storage key liveIdスコープ / backfill lid mismatch破棄 @content-entry.js:9276)。
- **永続二重計上=否定**(mergeNewComments + loneDedupe が BACKFILL/NDGR問わず1件統合 @commentRecord.js:336)。
- **唯一の穴=表示の一時二重**: commentNo を持つ行は cheap dedupe(liveId|no|text)で再追記を弾けるが、
  **commentNo 欠落行**はキーが capturedAt秒依存で incoming未スタンプ=弾けず(selectNewTailRows 素通し)。
  main既存の同一コメント再到来 → tail再追記 → 表示が畳み込みまで二重 → 単調ゲートが膨れピークを焼付け → 居座る。
  NDGR は `chat.no` 無し行を commentNo:'' で実際に通す(ndgrChatRows.js:50)=欠落行は現実に存在。

## 修正(記録を減らさない・persist不変条件に触れない)
方針=「畳み込みを早める」(capturedAtスタンプは loneDedupe を壊すので**不可**=commentTailBuffer.js不変条件)。
- `src/lib/commentTailBuffer.js`: `countCommentNoLessRows()` 追加 / `shouldCompactTail` に
  `commentNoLessInTail` オプト / `COMMENT_NO_LESS_COMPACT_MIN=20` 新設。
  欠落行が20件たまったら早期 compact → loneDedupe(text|uid|sec)で件数を正しい値へ収束。
  **巨大main(≥5000)では従来BIGしきい値維持**=フリーズ回避優先(表示は元々近似)。
- `src/extension/content-entry.js` flushBatchViaTail: 欠落行数を数えてゲートへ渡す。reason=compact_noless。

## verify(全部緑)
- npm run verify:cc 緑(新規ユニット: countCommentNoLessRows / 欠落行ゲート3ケース)。
  feature-map/tree-map/site-health drift は再生成してコミット同梱(handoff §5どおり)。
- 実拡張 v0.1.998 install → 純関数 probe で挙動確認: 20件→早期true / 19件→従来false / 巨大main→false / commentNo付き→0。
  ※content bundle は watchページ常駐のため、生コメ流入の実機テストは実配信が要る=今回は純関数挙動+ユニットで担保。

## 残課題(別系統・未着手)
- backfill 取得率(取り込みの遅さ)。描画/記録カウントとは別。

## 反映3手順リマインド(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード → watch F5**。③純Webは Vercel デプロイ別途。
