# 引き継ぎ: 2026-06-22 取得率100%前提の診断 + 応援ライブビュー丸ごとクローン(継続中)

> 新チャットへ。会話全文不要。CLAUDE.md / AGENTS.md / memory/MEMORY.md + 本ファイルで再開可能。
> 司令塔 Claude Code 本体が読む前提。コンテキスト満杯で引き継ぎ。

## ⚠️ 最初に確認(git 状態)
- **HEAD = origin/master = 6ce12770 = v0.1.885(push済・安全)**。
- 未コミットの自分の変更は無い(`scripts/meeting.mjs` は触らない untracked-WIP・`docs/code-tree.html` は tree-map の軽微 drift=`npm run tree-map` して commit するか checkout で戻してよい)。
- **別ブランチ `live-view-full-clone`(commit df5ae68b 相当を master に rebase 済)= popup.html を丸ごとクローンした live-view.html(継続タスク②)。master には出していない。**
- 検証は `npm run verify:cc`(全緑を確認してから commit)。push 後 `git checkout -- extension/dist/ app/dist/` で dist 掃除。

## 🖥️ 環境(最重要・これが分かるまで実機が無意味だった)
- **リポは OneDrive+Resilio の二重同期フォルダ配下** = Chrome の「パッケージ化されていない拡張」を `extension/` から直接ロードすると、ビルド/同期がファイルを触るたびに Chrome が無効化・再読み込みループ(=何度リロードしても OFF に戻る)。
- **解決済み(v0.1.884・9d68d61a)= `npm run copy:ext` で同期外 `C:\nicolive-ext` へ robocopy ミラー。ユーザーは `C:\nicolive-ext` をロード済み(新ID=`abiaabloagapipnjjaihkabinjfnlibk`・記録はリセット済=承知の上)。**
- **反映手順(司令塔がやる)= `npm run build:copy`(ビルド+同期外コピー)→ ユーザーは chrome://extensions の更新ボタン🔄を押すだけ。** これで固着しない。
- `fs.cpSync` は Windows で native crash(0xC0000409)するので copy-ext.mjs は robocopy 使用。sandbox はリポ外書込を止めるので PowerShell か dangerouslyDisableSandbox で実行。

## 🎯 ユーザーの現在の最優先課題(会議中=結論待ち)
**「配信を開いたら一気に全部取れる(取得率は常に100%)前提。100%でないなら異常を出せ。低率を青(正常)で隠すのはおかしい」**

### 食い違いの核心(私が実コードで裏取り済み)
- ユーザーの期待: **一気に取れる=常に100%**。100%未満=取りこぼし=異常。
- 実際: **backfill(過去ログ遡り)は漸進的**(backfill-sw-entry.js: STAGING_WRITE_INTERVAL_MS=2500・バッチ・SW keepalive 20秒)。大きい配信(86分・公式16,000)を途中参加で開くと100%到達まで数分かかる。NDGR は接続後の新規分だけ=過去分は backfill 頼み。
- だから「100%未満=全部赤」にすると大きい配信が数分ずっと赤=以前の要望「見た瞬間ほぼ全部緑にしたい(v0.1.845/846)」と真逆。**A(表示で異常を出す)と B(backfill 高速化=本体改修)のどちらか/両方かを会議中。**
- ⚠️ **backfill は既に並列化されている**(`BACKFILL_PARALLEL_SLOTS`・backfillSlotPool.js・swCrawlSlots.js)=B の高速化余地は「既に並列なら何を速くするか」を裏取りしてから(雑にスロット増やすとニコ生サーバ負荷/BAN リスク)。

### 会議(完了・結論+ユーザー確定済)
- `council/backfill-instant-vs-diagnose-answers.json` に結果あり。批判役 deepseek=「B(速度)が本筋・A(表示)は表面」+穴=並列増強は**ニコ生サーバ負荷/BAN リスク**。groq=「A+B 段階併用」。nvidia 発散はタイムアウト脱落(0秒)。
- 司令塔の裏取り: **backfill は既に並列化済(BACKFILL_PARALLEL_SLOTS)=会議の『並列フェッチ増強』は雑にやると BAN 直結**。
- **ユーザー確定=「Aを先に(取り込み中を明示)」。** BAN リスクゼロで今すぐ出せる方を先に。B(高速化)はその後「安全に何を速くできるか」を実コード裏取りしてから。

### ✅ 次チャットが実装する内容(A=取り込み中の明示・1回で書く)
**方針: 低率を『緑(隠す)でも赤(不安)でもなく、青の進捗(取り込み中 N%・あと約M件)』で見せる。本当に止まった時だけ黄。** 嘘で緑にしない原則は堅持。

**⚠️ 着手前に実コードを確認済(2026-06-22・次チャットは grep 不要・以下が現物):**
- **`src/lib/statusFormat.js:120` `buildCaptureRateLine`** — 現状の放送中×低%(<40%)の戻り値は **`⏳ 追いつき中 ${p}% (${counts})・過去のコメントを取得中`**(140行)。`counts` は既に `記録X/公式Y` 相当を含む(122-131行で組立)。**やること=この行に「あと約M件」を足す**だけ。M=`off - rec`(off=`live.officialCommentCount`・rec=`Number(live.recordedCount)||0`・両方この関数内に既にある)。off が null の時は「あと約」を出さない(過大表示しない)。文言例: `⏳ 取り込み中 ${p}% (${counts}・あと約${(off-rec).toLocaleString('ja-JP')}件)`。**ラベルを「追いつき中」→「取り込み中」に変えるかは任意**(ユーザーは「取り込み中」表現を確定済なので変えてよい)。終了済み低%(143行 `🔴 取得中`)は触らない。テストは `src/lib/statusFormat.test.js`(同じ文字列を assert している箇所がある=文言を変えたら一緒に直す)。
- **`src/lib/healthCells.js:271` `summarizeHealthVerdict`** — ユーザーの不満の正体は**この1行**: `processingCount > 0` の時 `異常なし ✓(順調に取得中)` を返す(270-271行)。**やること=この文字列を中立な「取り込み中」表現に変える**(例: `取り込み中（あと ${processingCount} 項目）` か単に `取り込み中 ✓`)。**bad/warn 分岐(265/268行)は触らない**。これは1文字列の変更で、ロジック改修ではない。
- **processing マスク(`ratesInProgress`/`anyCatchingUp`)は触らない**=取得率セル(134行)・記録↔公式一致セル(243行)は青(processing)維持で良い。色を変えると v0.1.845/846/848/850 群の既存テストが全壊し、ユーザーも数分赤を嫌がる。**ここで前回3回往復した。触るのは上記の2文字列だけ。**
- **本当に止まった判定(黄)**: 放送中×低率×`lastIngestAgoMs` が大きい(例 >2分)×backfill running:false = 進捗が伸びていない=黄。これは「進行中(青)」と「失速(黄)」を分ける唯一の正直な基準。`elapsedSec` は配信経過で記録経過でない点に注意。**裏取り済(2026-06-22): `lastIngestAgoMs` は各 live オブジェクトに既にある**(`buildCaptureRateLine(live)` の `live` にも `summarizeOneLive` 戻りにも入っている=statusFormat.js:12/96 で参照済)。`healthCells.js:168` は既に `livesData.map(lv=>lv.lastIngestAgoMs)` で `minAgo` を計算している=**黄判定に必要な値は全部 in-scope。新規プラミング不要。** ただし A の MVP は「進捗(青)を出す」だけで十分=黄は欲張らず後で足してよい(青が出れば「順調」の誤表示は消える)。
- ⚠️ 既存テスト(healthCells.test.js の v0.1.845/846/848/850 群=「進行中は青/見た瞬間ほぼ全部緑」)と**衝突する**。これらは『追いつき中は正常』前提=今回の『取り込み中を明示』と方向が違う。テストを壊す前に、processing(青)は維持しつつ「総合判定の文言」と「per-stream の進捗表示」だけ変える設計なら衝突を最小化できる。色そのものを赤にすると全部壊れる(=ユーザーも数分赤を嫌がる)。

### 案B(後回し・高速化)を将来やる時の裏取り済み事実
- backfill-sw-entry.js: ROW_BATCH_SIZE=500・STAGING_WRITE_ROWS=2000・STAGING_WRITE_INTERVAL_MS=2500・REQUEST_TIMEOUT_MS=10000・SW keepalive 20秒。並列は BACKFILL_PARALLEL_SLOTS(backfillSlotPool.js)。
- 安全な加速候補(BAN リスク低)= STAGING_WRITE_INTERVAL_MS 短縮(書込頻度=サーバ非依存)・バッチ書込サイズ。**危険(やらない)= 並列スロット増・throttle 撤廃・レート制限無視**(ニコ生サーバへの fetch 増 = BAN)。B をやるなら必ずレート制限の実値を裏取りしてから。

### ⚠️ 私がやった失敗(繰り返さない)
- 前提を誤解して**コードを3回 行ったり来たり**させた(「追いつき中は青で正常」↔「100%未満は異常」↔閾値600件…)。毎回テストを壊した。**会議で前提を確定してから1回で実装する**。今は v0.1.885 の状態に**全部 revert 済**(healthCells.js/statusActionAdvisor.js とその test は committed v0.1.885)。
- ユーザーが「何度も言ってる/逆じゃないの」と苛立った=**同じ案内を繰り返さず、ユーザーの言葉(一気に取れる前提)を正として実装方針を変える**。

## 📌 このセッションで完了して push 済(参考・全て master)
- v0.1.879 公式値レーン(貢献度/広告)を live-view に完全コピー / 880 ギフト履歴レーン
- **v0.1.881 「完全コピーじゃない」根治=自作の再現を撤回し popup の本物 paintTopSupportRankStyleIntoElement を共有 lib 化(src/lib/paintTopSupportRankStyleIntoElement.js=renderTopSupportRankStripInto)。popup は薄いラッパで本物の依存を opts 注入(挙動不変)。live-view も同じ本物を import。会議ハーネスで設計。**(MEMORY.md 参照)
- 882 公式値レーンを開いた瞬間に出す(描画トリガを bundle 待ち await の前に早回し)
- 883 会場読み上げ固着を再生 watchdog で根治(voiceDiag に playbackTimeoutTotal「再生TO」追加)
- **884 live-view 応援者ランキングを自作撤回し本物の描画に統一(buildRankLineEl/buildCasterTileEl 削除)** + copy:ext(環境根治)
- **885 取得率🟡の自己矛盾を一旦修正(放送中の追いつき中は出さない・userId 50-90%帯の🟡を消す)= だがこれがユーザーの「100%前提」と食い違い、今 会議で見直し中。** healthCells.js の `anyCatchingUp`/`ratesInProgress`(進行中=青マスク)と statusActionAdvisor.js の capture-low が論点。

## 🔲 継続タスク(会議結論後)
1. **【最優先】backfill 100%前提の解決**(A/B/C を会議結論+実コード裏取りで1案に)。実装は healthCells.js(取得率/記録↔公式一致セルの processing マスク)+ statusActionAdvisor.js(capture-low)+ 必要なら backfill-sw-entry.js(B)。`嘘で緑にしない`原則は堅持。
2. **【継続】応援ライブビュー丸ごとクローン(X方式)** = ブランチ `live-view-full-clone`。popup.html を丸ごと複製した live-view.html(11,255行・nl-inline で配信者操作系を CSS 非表示)は出来ている。**残り=描画配線**(popup-entry.js の描画を live-view で動かす。popup-entry.js は chrome.tabs/scripting/windows を多用=watch タブ前提で、live-view 単独だと落ちる箇所がある。`DOMContentLoaded→initPopup` の自動実行を import 時は走らせないガード+描画エントリを export、または共有 lib 経由が要る)。ユーザーは「全部コピーして、いらない部分があったら考える」方針=A方式(複製して削る)を選択済。

## 版運用(毎回)
1変更=patch 1つ。manifest/package を同じ版に・src/lib/changelog.js に1エントリ(summary 35字以内・items は平易文)。`npm run tree-map`→`npm run verify:cc` 全緑→明示パス stage→commit→stash meeting→push→stash pop→dist 掃除→**`npm run build:copy` で C:\nicolive-ext に反映**。MEMORY.md に1行。

## 反映手順(push 報告のたびに併記)
`npm run build:copy` 実行 → ユーザーは chrome://extensions で更新ボタン🔄。**同期フォルダから直接ロードしない**(固着するので必ず C:\nicolive-ext)。
