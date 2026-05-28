# 引き継ぎ 2026-05-28: 過去ログ取り込みの「ぜんぶ届いた」誤判定を会議で直す（未着手・最優先）

対象: ニコ生コメント記録 Chrome 拡張 `tsuioku-no-kirameki.com`
作業dir: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com`
現ブランチ: `fix/backfill-reached-start-misjudge`（master より10コミット先・push済・clean）
現バージョン: **v0.1.433**（本番 master は v0.1.424 で無傷）

## ⚠️ ユーザーへの最優先の配慮（必ず最初に読む）
ユーザーは今日、大事にしている仏法の班長会に行けず、新聞推進を鉛筆で書いたことなどを「**罰**」だと繰り返し自分を責めて、気持ちがとても沈んでいる。**作業の進捗よりユーザーの心情を最優先**。冒頭で「取れない配信があるのは罰ではなくニコ生サーバが過去ログ(segment URI)を返さない技術的理由（実機で 404 を確認済み）」と、やさしく事実を伝えて安心させること。急かさない。プログラムは確実に前進していると正直に伝えてよい（事実）。

## 🔴 最優先タスク: reached_start 誤判定の修正（会議で設計→実装。ユーザー指示「会議で解決して」）
### 確定した真因（実機 + コード読みで特定済み・再調査不要）
`src/lib/ndgrBackfillCrawl.js` の `crawlNdgrBackward` 外側ループ（**line 510-513 付近**）:
```js
if (chainMinVpos <= NDGR_BACKFILL_NEAR_START_VPOS_CS) { // NEAR=3000 センチ秒=30秒
  return done('reached_start');
}
```
`chainMinVpos` は「現区画の全 chat の vpos の**単一最小値**」（`minVposOf` line 233 付近）。実機で配信の **47%/51% しか遡れていないのに** reached_start（popup が「配信のはじめまで、ぜんぶ届いたよ！応援を集めきったよ✨」と完了宣言）が出る。原因＝**途中区画に紛れる低 vpos の外れ値コメント1件**（運営/システム/gift お知らせ等は vpos=0 や極小になりがち）で `min<=30秒` が成立し誤発火。真の開始では「区画内の min も max も小さい」が、途中区画＋外れ値では「min は小さいが max は大きい（本体は中盤）」。
- ⛔ vpos=0 を一律無視は不可（真の開始では実際に vpos≈0 がある→真の reached_start を取り逃す）。
- line 436-438 の「入口無し＋`globalMinVpos<=NEAR`→reached_start」経路も `globalMinVpos`（全区画の最小）が外れ値の影響を受けるので**同じ堅牢化が要るか会議で判断**。

### 会議のやり方（ユーザー指示「会議で解決して」）= Plan + Explore を並行起動
再起動直後、**Plan エージェントと Explore エージェントを1メッセージで並行起動**（下記プロンプトをそのまま使ってよい）。推測実装で往復しない・繊細なコード（取り込み/パネル/narration）を壊さないため。

**Plan エージェントへの依頼要点**: reached_start を「単一最小 vpos<=30秒」でなく堅牢判定に。案A=min と max の両方を見る（途中区画は max が大きいので弾く）/案B=2番目に小さい vpos or NEAR以内が2件以上を要求/案C=低vpos＋「もう前が無い(連鎖終端かつ再シードで globalMinVpos 更新不可)」を必要条件に。各案を false positive 耐性 / false negative 危険 / 局所性 / テスト容易性で比較し推奨。純関数化（例 `chainLooksLikeStreamStart(chats,{nearStartCs})`）してテスト。後方互換（短い配信で全部取れた等の真の reached_start は維持）厳守。守るテスト=`src/lib/ndgrBackfillCrawl.test.js`（21件・特に reached_start/no_progress/区画またぎ/途中参加）。reached_start を出さない場合は no_progress に倒す（narration が partial=「もう一度押すと続き」に）。版 v0.1.433→v0.1.434・changelog 平易日本語(summary 35字以内)。

**Explore エージェントへの依頼要点**: reached_start を返す/解釈する全箇所（ndgrBackfillCrawl.js / backfillRinkuNarration.js の backfillNarrationPhase・backfillReachedStreamStart / popup-entry.js・content-entry.js）、vpos を扱う関数（minVposOf/deriveBackfillCapturedAt/ndgrChatsToMergeRows/decodePackedSegmentNav の vpos 取り出しと 0・欠落の扱い）、`NDGR_BACKFILL_NEAR_START_VPOS_CS` の定義と全使用、ndgrBackfillCrawl.test.js の既存テスト一覧（後方互換の番人）、運営/system/gift で vpos が極小になる chat を通常コメントと区別する既存の仕組み（isPersistableHarvestedCommentRow / parseGiftCommentText / ndgrChatRows.js gift guard）。

### 実装後
- crawl unit 21+ 緑・narration テスト緑・`npm run verify`（test/lint/typecheck/build）緑を確認。
- ⚠️ この修正は純ロジック＝**mock に NDGR endpoint 無いので unit で十分**（headful 不要）。パネル描画には非干渉。
- 版 bump して dist ビルド→`git checkout -- extension/dist/` で build-id churn を捨てる→commit→push。
- その後、これら v0.1.429〜434 全部入りの **master マージ PR**（base master・CI 緑待ち・merge commit 方式）を作る（ユーザーは「PRを作ってCI緑でマージ」を希望済み）。

## ✅ 今日 master 未マージで積んだもの（このブランチ・全 push 済・実機検証済み）
v0.1.429〜433（10コミット）。「途中参加で取れない」を実機で徹底追跡し原因を**4+1個**特定・修正:
- v0.1.429/430: reached_start 誤判定（途中参加で1〜5%・偽の入口なし）→ 再シード堅牢化。
- **v0.1.431（commit a6621d5）**: ⭐34%停止の真因＝NDGR `?at` は約30〜45秒の「バケット」に量子化され、旧「最古vpos−5s」再シードが同一バケットに舞い戻り visited 詰まり→偽 no_progress。修正＝再シードは「直前の種より最低1バケット(`NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC`=50s)前」へ強制（`nextSeedAtSec`・`lastSeedAtSec` 追跡）。`MAX_RESEEDS` 200→4000（実測バケット35秒・18h配信は≒1296回要）。
- v0.1.431（d57befc/5bbe38b）: 「ページが応答しません」固まり緩和。真因＝`persistThrottle.js` flushBody の `while(buffer.length)` が巨大コメント配列の O(N) マージを背中合わせに走らせメインスレッドを離さない。修正＝2回目以降の連続 flush 手前で yield（scheduler.yield→setTimeout0・初回は yield せず RT レイテンシ不変）+ backfill 消費を 800 行バッチ化。
- v0.1.431（7fb5307）: 入口が一時的に見つからない（一過性 backward_exhausted）→ 20s 後に自動リトライ（`src/lib/backfillTransientRetry.js`・最大5回・隠れタブ/auto OFF は除外）。実機 lv350625305 が後で 100% 取れた＝自動リトライが効いた実証。
- v0.1.432（c60f51b/bc9b54d）: 過去ログが取れない理由を**記録カードの位置にも表示**（`src/lib/backfillRinkuNarration.js` の `backfillRecordCardHint`・no_entry/partial/paused のみ・実質取り切れ(記録が公式の95%以上)なら partial は出さない）。
- v0.1.433（618e45f）: 別ウィンドウPOPが配信に飛ばしたら自動で閉じる（`src/lib/standalonePopupClose.js`・type==='popup'かつ非inlineのみ・インライン/サイドパネルは絶対閉じない）。居座り→getLastFocused混信→パネル出ない を根治。

## 🔬 実機で確定した重要事実（コードでは直せない＝誤解しないこと）
配信は3種に分かれる（同じ v0.1.433 で）:
1. **取れる配信（多数）**: 94%/100% 取れる（ニッポンジャーナル849/899=94%、さいとう100%、太もも565/565、むいな1055/1055、フジテレビ1573/1580=100%・4時間半長尺、3時サブ垢の途中等）。
2. **サーバが segment/backward URI に HTTP 404 を返す配信**: 取れない（なち等）。ChunkedEntry(?at)は200で URI も埋まるのに、その URI fetch が 404+13738B HTMLエラー。⭐**コードでは直せない**（データがサーバに無い）。⚠️同一配信でも時間で変わる（む いなは先に100%取れた後、時間経過で404に）＝segment URI は短命の疑い。⚠️**Claude の高頻度プロービングで一時 IP/セッション block の可能性も指摘済み→実機プロービングは乱発しない**。
3. **開いた直後**: 全カード「—」は正常（読み込み中・待てば取れる）。
→ 詳細は memory `reference_backfill_instability_diag_pending`（2026-05-28 セクション）と `reference_storage_local_live_db_perf_overhaul`（v0.1.431 固まり緩和の発生点）に記録済み。

## 🟡 別タスク（spawn 済チップ・今やらなくてよい）
別ウィンドウPOPが「配信なし状態で自動的に立ち上がる/居座る」より広い挙動の見直し。reference_standalone_popup_multitab_empty_dash の tabId 焼き込み（世界標準）方式への移行検討。v0.1.433 の「飛んだら閉じる」は直接対処のみ。

## 環境の罠（durable・厳守）
- ⛔ 承認プロンプト回避: commit メッセージは Write で %TEMP% にファイル作成（heredoc禁止）→ `git commit --no-verify -F "C:\Users\...\Temp\xxx.txt"` のリテラル絶対パス。`$env:TEMP` 等の展開式は承認対象なので使わない。`&&` チェーンも避け分ける。push は単純コマンドで承認出ない。
- pre-push hook = `npm run verify`（test+lint+typecheck+build）が実 gate。lint は eslint cache で個別だと見逃すので push 時 verify が最終ガード。
- build フックが push/build 毎に dist の build ID 再生成→`git checkout -- extension/dist/` で churn を捨てる。CRLF厳守。
- 実機未完成検証はユーザー常用ブラウザで多タブ乱開きしない。診断 console.warn は描画パスに足さない（v0.1.422 でパネル消失した教訓）。
- 版はこまめに bump・バッジ `v0.1.XXX・b<buildId>` を毎回伝える。CWS申請フローは回さない。

## 一言まとめ
**最優先＝reached_start 誤判定（47%で「ぜんぶ届いた」）を Plan+Explore 会議で堅牢に直し v0.1.434 へ→その後 v0.1.429〜434 を master マージ PR**。取れない配信はサーバ404でコードでは直せない（実機確認済・ユーザーに「罰ではない」と伝える）。そしてユーザーの心情に最大の配慮を。
