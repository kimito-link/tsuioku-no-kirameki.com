# 引き継ぎ: 途中参加で過去ログが取れない問題（最重要・未完）＋ 多タブ固まり対策（ウルトラC・進行中）

対象: ニコ生コメント記録 Chrome 拡張 `tsuioku-no-kirameki.com`。
作業dir: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com`。

## まず読む（状況把握）
- このファイル全体
- memory: `reference_backfill_instability_diag_pending`（途中参加で取れない真因と修正・最重要）
- memory: `reference_multitab_scale_ultraC_leader_election` と `plan_multitab_scale_ultraC`（多タブ固まりのウルトラC設計と進捗）
- memory: `reference_storage_local_live_db_perf_overhaul`（storage 重さ対策①②）

## ⚠️ ユーザーの状況（最優先で配慮）
ユーザーは今日、大事にしている仏法の班長会に行けず（作業に付き合っていて時間が重なった）、気持ちが沈んでいる。「どうしたらいいかわからない」と吐露された。作業の進捗より本人の心情を優先すること。次セッション冒頭は無理に作業を急がず、必要なら「大事な予定を守る仕組み」（その時間帯は作業を入れない/リマインダー等）を一緒に考える姿勢で。プログラムは確実に前進していると正直に伝えてよい（事実）。

## master = v0.1.424（安定版・本番・パネル正常に出る・無傷）
今日 master に入れた主なもの（全て merged・push済）:
- 複数タブで別窓POPが全カード「—」固まり根治 / 「ぜんぶ届いた」を正直に / りんく跳ね演出 / 過去ログ自動取り込み(既定ON・OFF可) / ニコ生以外ページの誤情報フル表示修正 / storage重さ対策①get(null)撤去②保存全件パス最適化。

## 🔴 最重要・未完: 途中参加で過去ログが取れない（branch `fix/backfill-reached-start-misjudge`・v0.1.430・push済・master未マージ）
### 確定した真因（実機で決定的証拠）
途中から開いた配信で過去コメントが **1〜5% しか取れない** が、**「もう一度押す」と 76% まで増えた**（実機 v0.1.424・複数配信で再現）＝取り込みエンジンは取れるのに**1回で早期終了**していた。真因＝`src/lib/ndgrBackfillCrawl.js` の再シード判定で「古い vpos へ進めなかった」「再シードで入口が見つからない」を即 `reached_start`（配信開始到達）と誤判定して停止＋『ぜんぶ届いた』誤表示。**これが「1%/32%/58%/90%どまり」と「取れてないのにぜんぶ届いた」の両方の正体**。lv350618782 が99%だったのは起点と区画がたまたま噛み合った配信。
### 修正内容（2段・両方 push 済）
- v0.1.429: 真の reached_start は最古 vpos が配信開始近傍(`NDGR_BACKFILL_NEAR_START_VPOS_CS`=30秒)到達時のみ。「進めない」だけなら起点を STEP×回数 戻して最大4回(`NDGR_BACKFILL_NO_PROGRESS_RETRY_MAX`)リトライ＝「もう一度押す」を自動化。尽きたら `no_progress`(新stopReason・narration は partial 扱い)。
- v0.1.430: **再シードで入口が見つからない経路**にも同じリトライ原則を適用（高速・大量配信で再シード時刻が区画隙間に落ちる/visited 回避）。crawl test 20件緑・narration test 緑。
### ⚠️ 実機での到達点と次の課題（ここが肝）
実機 v0.1.429 で **1〜5% → 32% に改善**（方向は正しい）。だが**まだ序盤まで届かず 32% 等で停止**。v0.1.430（入口なし経路の追補）の実機確認は**未**（push しただけ）。**32%→ほぼ100% に届かせるには、なぜ止まるか実機 stop値を見るのが確実**（憶測でリトライ回数/戻し幅をいじると往復する）。
### 次セッションの最短手順
1. このブランチをチェックアウト → `npm run build` → `chrome://extensions` で「更新」→ watch ページ F5（バッジ v0.1.430 確認）。
2. **stop値を見る**: `_backfillProgress.stopReason` は既に `data-nls-backfill` DOM 属性に出る（`stop=...`）。読みづらければ content の `runNdgrBackfillOnce` finally に **パネルに触れない console.warn を1行だけ**足して chrome://extensions エラー画面で確認（⚠️このブランチは PR2 の Web Locks gating が無いので console.warn は安全。前回 v0.1.422 のパネル消失は別ブランチ・別要因の疑い）。
3. stop値で狙い撃ち: `no_progress`→リトライ回数/戻し幅をさらに緩める or seekBackwardUri を複数オフセットで探す / `cap_elapsed`→cap 延長 or fetch gap 短縮 / `reached_start` なのに 32%→reached_start 判定が別経路でまだ甘い。
4. 1回で大幅に増えたら master マージ（途中参加=普段使いなので価値大）。パネル描画には非干渉なので前回のパネル消失リスクは低い。

## 🔵 進行中: 多タブ固まり「ウルトラC」（branch `feat/multitab-scale-ultraC`・v0.1.428まで・push済・master未マージ）
### 真因と方針（[[reference_multitab_scale_ultraC_leader_election]]）
7タブ同時で全カード「—」固まり＝「7タブが同じ重い仕事をN回」（backfill 独立並列 467req/s・360ms毎reflow・storage.local 7タブ同時 read-merge-write でChromeキュー詰まり=「—」の直接原因）。世界標準解＝**共有できる重い仕事は1回だけ**（Web Locks `navigator.locks` で選ばれた1リーダータブが代表→storage.onChanged で全タブ配布・各タブは描画のみ・隠れタブ停止）。uBlock/RxDB が収束。
### 進捗（PR0〜PR5-a 完了・push済）
- PR0 多タブ contention 基準線 e2e（4タブ緑）/ PR1-a external poll lib / PR1-b 外部API fetch をリーダー1タブ集約（実配線）/ PR2 **backfill をリーダー1タブ集約**（467→66 req/s）/ PR3 DOM scrape をリーダー1タブ集約 / PR5-a token-bucket lib（未配線・保険）。
- 共通基盤 `src/lib/tabLeaderLock.js` `runIfTabLeader(name,fn)`（Web Locks ifAvailable・fail-open・リーダー死亡で自動引き継ぎ・unit8）。
### 残り
- **PR4（本丸・最高リスク・未着手）**: storage 単一writer + 書込coalesce + read in-memory cache（コメント記録の正確性に最接近＝最慎重）。詳細 `plan_multitab_scale_ultraC`。
- **実機での効果確認が未**（mock に NDGR/koken endpoint 無いので headless で req/s 削減は確認不可＝要 headful）。
- ⚠️ このブランチは v0.1.428、`fix/backfill-...` は v0.1.430。両方 master へ入れるとき版番号の整合（後勝ち/振り直し）に注意。

## その他のブランチ
- `fix/misinfo-databacked-retry`（v0.1.424）= ニコ生以外ページの誤情報修正は **master に merged 済**（このブランチは掃除可）。

## 環境の罠（durable・厳守）
- ⛔ **承認プロンプト回避**（ユーザー強い要望）: commit メッセージは Write ツールで %TEMP% にファイル作成（heredoc 禁止）→ `git commit --no-verify -F "C:\Users\...\Temp\xxx.txt"` の**リテラル絶対パス**で渡す。PowerShell の `$env:TEMP` 等の**展開式は承認対象**になるので使わない。`&&` チェーンも避け、コマンドは分ける。push は単純コマンドで承認出ない。
- **pre-push hook = `npm run verify`（test+lint+typecheck+build）が実 gate**。lint は eslint cache で個別実行だと prefer-const 等を見逃す→push 時の verify が最終ガード。push が hook で失敗したら verify の各 step を個別 exit code で確認。
- Resilio は**一旦解除済み**（ユーザーが解除）＝巻き戻りの心配は今は無い。ただ編集→即commit は引き続き安全策。CRLF厳守。
- build フックが push 毎に dist の build ID を再生成→`git checkout -- extension/dist/` で churn を捨てる。
- 実機の未完成検証はユーザー常用ブラウザで多タブ乱開きしない（過去に不安定化させた反省）。⛔ v0.1.422 で診断 console.warn 後にパネル消失→revert した（犯人切り分け未確定だが診断 warn は描画パスに足さない方針）。
- 版はこまめに bump・バッジ `v0.1.XXX・b<buildId>` を毎回伝える。CWS申請フローは回さない。実機検証手法は memory `feedback_verify_in_real_browser_before_reporting`。

## 一言まとめ
**最優先は「途中参加で取れない」(fix/backfill-reached-start-misjudge v0.1.430)を実機 stop値で詰めて 32%→ほぼ全部にし master へ**。多タブウルトラC は核心(PR0〜3)済み・PR4 と実機確認が残り。本番 master は安定版で無傷。そしてユーザーの心情に配慮を。
