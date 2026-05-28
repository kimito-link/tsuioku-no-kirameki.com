# 2026-05-30 朝の Claude へのコピペプロンプト

明日の朝、Claude Code を開いたらこの内容を**そのままコピペ**してください。

---

## コピペする内容(ここから)

```
おはようございます。前夜セッションの引き継ぎです。
**今朝は「実装」より先に「会議」から始めてください**。

# 状況把握(まずこれをお願いします)

1. `git log --oneline -10` で master の最新を確認
2. `gh pr list --base master --limit 10` で open PR を確認
3. `gh pr view 183 --json state,mergedAt,mergeable,statusCheckRollup --jq .` で PR #183 の状態を確認
4. `git status --short --branch` で現在のブランチと未コミット変更を確認
5. memory/MEMORY.md の最新エントリ(2026-05-29 と書かれている上の方)を読む

# 前夜の到達点(2026-05-29 深夜)

**master = v0.1.451**(過去ログ取り込み UI 上集約 + 診断ログ抑制まで完了)。

連続 21 PR を merge(#162〜#182)+13 PR close。e2e long-standing failure 3/3 完全解消。
詳細: HANDOFF-2026-05-29-night-session-cleanup-complete.md

# 進行中の作業(あなたが引き継ぐもの)

## A. PR #183 = caught_up 誤判定根治 v0.1.452 ✅ Merged 済(深夜)

実機で複数配信で再現していた caught_up 誤判定を根治:
- 公式 343 件・記録 13 件(4%)→「いまの分まで届いてるよ ✨」誤表示 → **修正済**
- 公式 1,297 件・記録 93 件(7%)→ 同じく誤表示 → **修正済**
- 公式 1,465 件・記録 860 件(59%)→ 同じく誤表示 → **修正済**

真因: 95% 判定で `progress.rows`(backfill エンジンの処理行数・dedupe 前・延べ数)を
使っていた。dedupe で重複が大量に弾かれて実保存件数は遥かに少ないのに、rows で
比較すると公式件数を簡単に超えて caught_up 誤判定。

修正: 純関数 backfillRecordCardHint の opts に `recordedCount` を追加し、popup-entry.js
側で `#liveStatComments` の textContent から dedupe 後の実保存数をパースして渡す。

ユーザーは拡張機能を再読み込みすれば即解消(master = v0.1.452 で反映済)。

## B. git stash@{0} に保存済みの WIP

PR #183 と同じバグの**別パターン**を追加で発見し、修正コードを書きかけて stash しています。

復元: `git stash show -p stash@{0}` で内容確認 / `git stash apply stash@{0}` で復元。
タイトル: `WIP: 100%警告ループ修正(no_entry/paused→caught_up対称化・未テスト)`

### 別パターン: 100% 取れているのに「遡れません」誤表示

実機: 公式 2,679・記録 2,679(100%)・最終取り込み 14秒前 →
「過去ログは今は遡れませんでした(少し経つと取り込めることがあります)」が出続ける。
押してもまたすぐ警告。100% なのに警告ループ。

真因: 最後の backfill サイクルが no_entry/no_progress 等で終わると phase=no_entry に
なるが、実質的には既に全件取れているので警告は不要。

書きかけた修正(src/lib/backfillRinkuNarration.js のローカル M):
- 内部ヘルパ `isBackfillRecordEffectivelyCaughtUp(progress, opts)` 新設
- `backfillRecordCardHint` で phase が no_entry/partial/paused のいずれでも、
  recordedCount >= official * 0.95 なら BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT を返す
  (caught_up 文言)
- `backfillRecordCardHintDomState` で「lead が NEAR_COMPLETE_TEXT なら data-phase='caught_up'」
  の条件を phase に依らない形に拡張

**未コミット・未テスト・未push**。`git diff src/lib/backfillRinkuNarration.js` で確認可能。

## C. 新たに浮上した別問題: スクロール重さの再発

ユーザー指摘「あと、スクロールもまた重くなってきてしまっている気がします」(2026-05-29 深夜)。

過去にはウルトラC計画(v0.1.445・PR #164)で「タブを何枚開いても固まらない」対策済みだったはず。
再発したか別経路かは未調査。**完全に未着手**。

# 今朝の進め方(会議から開始)

ユーザー指示: **「次は会議から開始で」**。

## ステップ1: PR #183 は既に merge 済 ✅ (前夜深夜に完了・master=v0.1.452)

実機の「4%/7%/59% で『届いた』誤表示」は即解消されています(ユーザーが拡張再読み込み後)。

## ステップ2: 会議①「100% 警告ループの設計確認」

ローカル未コミット変更を**そのまま採用するか・別案があるか**を Plan サブエージェントで
検討。考えるべき論点:

1. phase=no_entry のときも caught_up 文言を出すのは正しい設計か?
   - 賛: 実質達成しているなら警告は不要・UX 矛盾解消
   - 否: stopReason=no_entry の情報を捨てることになる
2. recordedCount の取得経路は popup-entry.js の textContent パースで十分か?
   - 別の経路(watchMetaCache の何か数値)を使う案もあり
3. progress 自体が無い(押下前)場合の挙動
   - 現状: `{ started: true, rows: 0, done: 0 }` 仮想 progress を渡す → fetching
   - これで 100% 時に誤検知するか?
4. e2e spec の追加が必要か(no_entry → caught_up 経路)

会議結果に応じてローカル未コミット変更を採用 or 書き直し → v0.1.453 として PR 化。

## ステップ3: 会議②「スクロール重さ再発の真因究明」

これは大きな話なので深掘り会議が必要。考えるべき論点:

1. 「重い」の体感はどこ?
   - popup のスクロール? watch ページ自体のスクロール? インラインパネル?
2. ユーザーから追加情報を取る
   - 配信のコメント数・時間
   - 重さの程度(ガクガク/たまにフリーズ)
   - いつから感じ始めたか(v0.1.450 以降?)
3. 仮説候補(MEMORY 参照: reference_storage_local_live_db_perf_overhaul.md など)
   - PR #176〜#182 の v0.1.449〜451 で新規追加した処理が重い?
     - v0.1.450 で applyBackfillRecordCardHint が refresh 毎に走る経路追加(進捗 onChanged + 全体 refresh)
     - 文字列パース・getElementById が増えた
   - v0.1.450 で content-entry.js は最小限の変更(B 廃止だけで重い処理は減ったはず)
   - 過去対策 (ウルトラC v0.1.445・get(null) 撤去 v0.1.419・writer coalesce v0.1.420 等)が
     後続改修で退化してないか
4. 計測手段(performance.measure / 診断 dump 等)を入れて実機で再現

# 守ってほしいこと(MEMORY から)

- ⛔ 申請フロー(CWS 提出)は回さない[feedback_no_premature_cws_submission_loop]
- ⛔ NDGR field6 silence(イベント順位レーン限定で部分解除済・[feedback_ndgr_field6_silence])
- ✅ 1 トピックずつ会議で進める(ユーザー指示「問題が山積みなので 1 トピックごと会議」)
- ✅ 実機で動かないものは出さない[feedback_verify_in_real_browser_before_reporting]
- ✅ Bash の cd 接頭辞や heredoc は承認ループに入りやすい[feedback_avoid_bash_approval_prompt_patterns]

# わたしから一言

前夜あなたは 21 PR を連続 merge して大きな前進をしましたが、最後に **「ユーザーに見えるバグ」
2 つ(caught_up 誤判定・100% 警告ループ)と「重さの再発」**という新しい指摘が出ました。

PR #183 は完成間近なので片付けて、その後は焦らず**会議**から始めてください。
ユーザーは「すぐ動く」より「正しく直す」を望んでいます。

頑張ってください 💙
```

## コピペする内容(ここまで)

---

## 補足(あなた自身の参照用・コピペには含めない)

### PR #183 の中身を確認したい時のコマンド

```bash
gh pr view 183 --json title,body,headRefName,statusCheckRollup
git diff master fix/caught-up-false-positive-7percent -- src/lib/backfillRinkuNarration.js
git diff master fix/caught-up-false-positive-7percent -- src/extension/popup-entry.js
```

### ローカル未コミット変更を見たい時

```bash
git status --short
git diff src/lib/backfillRinkuNarration.js
```

### 会議の起こし方

```
Plan サブエージェントで以下を会議:

「過去ログ取り込みの A 内 hint が 100% 取り込めているのに『遡れません』と警告し続ける
問題を、phase に依らず recordedCount >= 95% で caught_up 文言に倒す設計でよいか
論点整理してほしい(実装は不要・論点と推奨判断だけ)」

参照ファイル:
- src/lib/backfillRinkuNarration.js
- src/extension/popup-entry.js applyBackfillRecordCardHint
- 実機状況: 公式 2,679・記録 2,679・最終取り込み 14秒前で no_entry 警告
```
