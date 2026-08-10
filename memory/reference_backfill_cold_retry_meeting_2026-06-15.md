# backfill 根底「一挙取得が止まる」根治 会議+TDD (2026-06-15)

ユーザー(配信者)が状態速報JSONで「根底が崩れている=ローディングなし・一挙取得が崩れている」と指摘。
実機: 3配信並列・視聴中(あやりん 17%=124/727)が「取得0.0件/秒・描画見送り・過去ログは今は遡れませんでした(backward_exhausted・残り約598件)」。会議=無料LLM(groq gpt-oss-120b/llama-3.3-70b・openrouter gpt-oss・local gpt-oss:20b)。素材=.artifacts-bf-answers.json。

## 根本原因(コード調査+過去履歴で3つ特定)
1. **COLD_RETRY_MAX=12 で早期諦め(最大の真因)** — ndgrBackfillCrawl.js:171,795-804。everMadeProgress=false の crawl は noProgressStreak>12 で即 backward_exhausted。若い配信の序盤は空区画(コメント無い隙間)が12連続を超えがちで、その先に本物のコメントがあっても届く前に諦める。⚠️v0.1.697 で**意図的に12に下げた**経緯あり(240=分単位で「一気に取れる」体感を殺すから・cold は fresh re-seed retry に任せる設計)。
2. N=2スロット飽和で視聴中3本目が no_slot で待機に入れない(swCrawlSlots.js:58-72)。
3. 巨大配信(paint186ms)のpaintが視聴中の取得を飢餓させる。

## ✅実装(v0.1.749・TDD・心臓部=最小の一手)
- **COLD_RETRY_MAX 12→40** のみ。撤廃して240統一は**しない**(会議でも「本当に存在しない配信で無限リトライ」懸念・v0.1.697の体感維持理由も生きてる)。40=序盤の空区画を跨ぐ+本当に空な配信は ~6秒(40×150ms)で見切り fresh re-seed retry に任せる。回数でバウンドしつつギャップを跨ぐ最小の一手。
- **TDD**: ndgrBackfillCrawl.test.js に「序盤20連続空区画でも cold 予算内なら跨いで no=7 に届く・backward_exhausted で諦めない」テスト追加。**先に書いて COLD=12 で fail(red)→40 で pass(green)・既存70テストも全緑**(truly empty は≥245空区画で従来通り backward_exhausted=壊さない)。verify:cc 全緑。
- **司令塔の裏取りが効いた点**: 会議は「12→240撤廃」も出したが、v0.1.697 コメント(240=分単位で体感殺す・cold は fresh seed に任せる設計)を読んで却下。40 が両立点。

## 残(会議が出したが今回見送り=効果大だが大きい変更・次段階)
- **視聴中タブ優先スロット確保**(chooseSlot 純関数・N=2で視聴中に必ず1枠・content/SW/storage.session またぎ)。全員一致だが大きい→①が効いたか実機確認後に。
- pending registry にスロット解放時の即再開。取得(fetch)と描画(paint)の分離(renderUserRooms 差分化は既知ボトルネック・未着手)。
- 並列N=2→3 は負荷増のため保留。

## 心臓部ルール(踏襲)
- persist/NDGR/background.js(素SW)は危険境界・hot path に I/O 禁止。cap/リトライ上限は実測で fixture test 必須。stopReason を捨てない(嘘の完了宣言禁止)。グローバルロック1本は多タブで破綻。
- 関連: [[reference_backfill_sw_migration_pr1b]] 等(過去の一気に取れない根治 v0.1.642/665/691/696/706)。
- ⚠️実機検証は dev Chrome の SW増殖でナビ詰まる→Chrome再起動でリセット。次は実機(複数配信並列)で「598件残し」が消え一挙取得されるのを確認。
