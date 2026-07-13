# 設計書 — 調査は司令塔で最大化・実装は外部AIへ委譲する体制の強化

- 設計: Fable(claude-fable-5サブエージェント) / 裏取り: 司令塔(Claude Code)
- 日付: 2026-07-13
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物
- 会議素材・地雷マップの生ログ: このセッションのscratchpad(council-answers.json / fable-brief.md)。要点はこの設計書に統合済みのため別途保存はしない。

## 前提の訂正(重要)

当初の地雷マップ調査で「reality-checkerは正式agent定義が実在しない」という前提を立てたが、**誤りだった**。正本は [`ai-hub/agents/reality-checker.md`](../ai-hub/agents/reality-checker.md) に実在し、`C:\Users\info\.claude\agents\reality-checker.md` に配備済み。pass/fail/inconclusive 3値判定・evidence必須・package.jsonの`verify:*`/`check:*`を自動発見して実行、という良質な定義が既にある。

したがって本設計は「reality-checkerを新設する」のではなく、**既存reality-checkerと委譲エージェント(codex-impl/cursor-impl)の間に欠けている配線(相互排他・完了ゲート・引き渡し書式)を足す**設計である。

## 裏取り済みの前提事実

- `npm run verify:cc`(scripts/run-verify-cc.mjs)は9ステップ逐次・fail-fast: test:cc→lint→typecheck→build→check:tracked-imports→tree-map:check→site-health:check→feature-map:check→verify:bump。bump 3点一致・drift検知は**全部この中に既にある**。
- `.claude/agents/codex-impl.md` / `cursor-impl.md` には verify:cc 実行・bump同期・生成物再生成の記載が**一切ない**(確認済み)。git相互排他の記載もない。
- husky導入済み: `.husky/pre-commit`(impact-check・非ブロック・`|| true`で必ず通す設計)、`.husky/pre-push`(`npm run verify`・ブロック)。→ 新規フック基盤は不要、既存pre-commitに数行足すだけで済む。
- 成功実例 [`council/codex-prompt-venue-guide-diag-exact-copy.md`](../council/codex-prompt-venue-guide-diag-exact-copy.md) は既に「正本ファイル+行番号+フラグ名+ネガティブ制約+実測要求+verify:cc要求+報告書式」を備えていた。テンプレはこの実物の一般化にすぎない。

## A. 理想の調査→実装→検証フロー

```
[調査] 司令塔(プランmode)
  真因究明・設計。Explore/Plan サブエージェント並列可。
  産出物 = council/codex-prompt-<課題>.md(テンプレK1で起草。影響範囲は司令塔がGrep/impact-checkで裏取りして書く)
      ↓ プロンプトファイルをコミット(引き渡しの正本化)
[委譲] codex-impl / cursor-impl サブエージェント(同期実行・BG禁止)
  1. .artifacts/agent-git.lock を作成(K3)      ← ここから司令塔のcommitは物理的に失敗する
  2. 外部CLIを起動(プロンプトはファイルを読ませる。口頭要約しない)
  3. 外部CLIがcommitしたら、サブエージェント自身が verify:cc を実行(K2・外部AIの従順さに依存しない)
  4. 赤なら❌報告(diffは残す)。緑なら完了報告フォーマット(K2)で報告
  5. lock削除
      ↓
[判定] reality-checker(既存グローバルagent・変更不要)
  verify:cc緑の再判定ではなく証拠の検品: git showで中身実在確認・件数0の緑却下・bump 3点一致
      ↓ pass
[レビュー] /code-review(code-reviewer) → 司令塔がmerge判断・push
      ↓
[実機待ち] ユーザーの反映3手順(pull→拡張リロード→F5)は自動化不可(既知)。
  HANDOFFに「⏳実機待ち: <確認項目1行>」を記録し、司令塔は別領域の次調査に着手してよい。
  同一ファイル群を触る次実装の委譲だけは禁止(版混在防止)。
```

## B. 統合アーキ(4コンポーネント)

| # | コンポーネント | 実体(新規/追記) | 対応する既存資産 | 塞ぐ穴 |
|---|---|---|---|---|
| K1 | 引き渡しテンプレ | 新規 `council/_TEMPLATE-impl-prompt.md`(1ファイル) | 成功実例codex-prompt-venue-guide-diag-exact-copy.mdの一般化 | 口頭指示の無視・無関係修正 |
| K2 | 完了ゲート | 追記 codex-impl.md / cursor-impl.md に「完了ゲート」節+報告フォーマット | verify:cc(既存9ステップ)を呼ぶだけ | bump素通し・drift素通し・lint未実行のサイレント欠落 |
| K3 | git相互排他ロック | 追記 .husky/pre-commit に約8行 | husky(導入済) | detached HEAD不完全コミット・「commit禁止」人力メモ依存 |
| K4 | 運用ルール明文化 | 追記 AGENTS.md に約15行(§12.9) | CLAUDE.md §Tの表・既存reality-checker | 実機待ち運用未定義・「reality-checker実行中commit禁止」の10箇所手書き |

新ツール導入ゼロ・新常駐プロセスゼロ・新agentファイルゼロ。全部が既存正本への追記+テンプレ1ファイル。

## C. 具体機構

### K1: `council/_TEMPLATE-impl-prompt.md`

```markdown
# <外部AI>向け指示: <1行タイトル>
## 背景(なぜこの形式か)
口頭要約は無視・誤修正の実績あり。**この指示にない箇所は変更しない**。
「直した」の報告は禁止。証拠(diff+実測)で示すこと。
## 対象(正本の名指し)
- 正本ファイル: `src/...`(関数名・行番号は「NNN行付近」表記 — ドリフト前提で関数名を主キーに)
- 既存フラグ/定数: `FLAG_NAME`(場所と現在値)
- 影響範囲: <司令塔がGrep/`npm run impact-check`で裏取りした波及先を列挙>
## やること(番号付き・各項目に完了条件)
## 触ってはいけない箇所(ネガティブ制約)
- <個別列挙> + 定型: MEMORY/reference_*.md編集禁止 / push禁止 /
  ローディング演出禁止 / host・iframe不可侵 / 鏡はデータのみ(R-1) /
  新計器はstatusFastDiagLite passthrough必須
## 設計判断が必要になったら
実装を止めて質問を報告に書く。決め打ち禁止。
## 完了条件(全部必須)
1. `npm run verify:cc` 緑(ログは .artifacts/verify-cc.log)
2. bump 3点セット同期(manifest/package/changelog・AGENTS.md §12.5)
3. 新規libを足したらtree-map/feature-map再生成をコミットに含める
4. `git add` は新規ファイルを明示列挙(status grepフィルタ禁止)
5. commitして停止(pushしない)
## 完了報告の書式
変更ファイル:行番号一覧 / verify:ccのSTEP行全部 / 実測した事実 / 未解決の質問
```

運用: 司令塔がプランmodeの成果をこのテンプレで`council/codex-prompt-<課題>.md`に書き、**コミットしてから**委譲する(引き渡し内容自体が正本・後から検品可能)。

### K2: codex-impl.md / cursor-impl.md への追記(両方に同文・約25行)

```markdown
## 完了ゲート(外部CLIの自己申告を信用しない)
外部CLIがcommitして停止したら、あなた自身が以下を実行して裏取りする:
1. `git branch --show-current` — detached HEADでないこと(HEADなら即❌報告)
2. `git show HEAD --stat` — 変更ファイルが指示対象と一致すること(空/無関係なら❌)
3. `npm run verify:cc` — 赤なら「STEP <名> FAILED」行と.artifacts/verify-cc.log該当部を添えて❌報告。
   自分で直さない(修正方針は司令塔が決める)。
4. bump 3点(extension/manifest.json / package.json / src/lib/changelog.js先頭)が
   verify:bumpステップで機械確認されたことをログで確認。
※ verify:ccを実行していない完了報告は無効。司令塔はSTEP行の貼付が無い報告を差し戻す。

## git相互排他(detached HEAD事故防止・2026-07-07実事故)
- 外部CLI起動の直前に `date > .artifacts/agent-git.lock` を作成し、
  終了・失敗・タイムアウトのいかんに関わらず最後に必ず削除する。
- 外部CLIは `AGENT_GIT_LOCK=1` を環境に付けて起動する(lockホルダー本人のcommitは通る)。
```

起動コマンド例(codex-impl側): `AGENT_GIT_LOCK=1 codex exec "council/codex-prompt-<課題>.md を読んで、その指示のみを実行。..."` — プロンプト本文をシェル引数に流し込まない(日本語×PowerShell/長文の既知地雷回避。ファイル参照方式)。

報告フォーマット(既存の「最終出力」節を置換):
```
✅/❌/⚠️ | 変更ファイル一覧(git diff HEAD~1 --stat) | verify:cc STEP行(全ステップ) |
branch確認結果 | 主な変更点3-5行 | 外部AIが挙げた未解決の質問
```

### K3: `.husky/pre-commit` への追記(既存impact-check行の**前**に)

```sh
# agent-git-lock: 外部AI/検証エージェント作業中の司令塔commitをブロック(detached HEAD事故 2026-07-07)
# 解除: サブエージェント完了を待つ。クラッシュ残骸なら rm .artifacts/agent-git.lock
if [ -f .artifacts/agent-git.lock ] && [ -z "$AGENT_GIT_LOCK" ]; then
  echo "BLOCKED: agent git lock exists (.artifacts/agent-git.lock). An impl/verify agent is running."
  echo "If it crashed, remove the lock file manually and retry."
  exit 1
fi
```

- fail-closed(プロジェクト原則)。解除コマンドをメッセージに明記。
- 英語メッセージ限定(Shift-JIS地雷)。
- 既存pre-commitの「摩擦ゼロ・ブロックしない」思想と一部衝突するが、これは警告ではなく事故中のcommitそのものを止めるためなので例外が正当。
- `.artifacts/`は既存のログ置き場(gitignore済み)なのでリポを汚さない。

### K4: AGENTS.md への追記(§12.5の隣に§12.9として約15行)

- 委譲・検証サブエージェント(codex-impl/cursor-impl/reality-checker)は**同期実行のみ・バックグラウンド禁止**。時間的重なりの根絶が第一防衛線、K3ロックが第二防衛線。以後のHANDOFFはこの§を1行参照すればよく、個別手書きは廃止。
- **実機待ちの運用**: 実機確認待ちは待機しない。HANDOFFに「⏳実機待ち: <確認項目>」を1行記録→司令塔は別領域の調査・設計・プロンプト起草に着手可。禁止は2つ: (1)同一ファイル群を触る次実装の委譲(版混在) (2)配信視聴中のcopy:ext(既存ルール)。実機NG報告が来たら進行中調査より優先で割り込み。
- 委譲は必ずcouncil/codex-prompt-*.mdファイル経由(テンプレK1)。口頭要約での委譲禁止。

## D. 検証を確実に効かせる構造ロジック

三重化。どの一枚も「司令塔が思い出す」ことを要求しない:

1. **検証の実行者を移す**: verify:ccを回すのは外部AIでも司令塔でもなく**委譲サブエージェント(Claude)自身**(K2)。外部AIが指示を無視しても、サブエージェントの定義に焼き込まれているので必ず走る。
2. **報告書式を検品キーにする**: STEP行の貼付が無い完了報告=無効、と両agent定義とAGENTS.mdに明文化。司令塔は「verify:ccやった?」と思い出す必要がなく、報告にSTEP行が有るか無いかを見るだけ。
3. **物理ガード**: K3ロックはhookなので、司令塔が全部忘れていてもcommitが機械的に失敗する。最後の網。

さらに独立判定として既存reality-checkerが「git showで中身実在」「件数0の緑却下」「stale緑却下」を検品する(定義済み・変更不要)。実装者(外部AI)→検証実行者(委譲サブエージェント)→判定者(reality-checker)→レビュー(code-reviewer)の四者が全員別人格。

## E. MVP

**K2(委譲エージェント定義への完了ゲート追記)**。理由: 直近の実害で最も繰り返し発生しているのは「bump/drift素通し→司令塔の事後手直し」であり、K2は追記だけで即日それを止める。K1のテンプレは成功実例が既にあるので手動コピーでも回る(K2の次に安いのでほぼ同時にやってよい)。K3はK4の同期実行ルールが守られていれば発火機会が少ない保険なので3番目。着手順: **K2 → K1 → K3+K4(まとめて1コミット)**。全部合わせても追記約60行+テンプレ1ファイルで、1セッションで完了する規模。

## F. 捨てた案と理由

| 案(出所) | 判定 | 理由 |
|---|---|---|
| madge等で依存グラフJSON自動生成・指示に添付(会議lead最優先案) | 却下 | Codex失敗の真因は依存情報の欠如でなく対象の名指しの欠如。成功実例は依存グラフゼロで成功。既存のimpact-check/feature-map/check-tracked-importsが自前静的解析として実在し、新規依存導入は「作り直さない」原則違反。影響範囲はK1テンプレで司令塔が裏取りして書く方式で吸収 |
| 「プロセス監視オーケストレーター」への役割昇華(会議統括) | 却下 | §Tの役割分担を実質書き換える大改造。個人開発で監視レイヤーは運用しきれない。K2〜K4の焼き込みで同じ効果 |
| CI(GitHub Actions等)でverify自動トリガー | 却下 | ローカル個人開発が前提。pre-pushが既に`npm run verify`をブロッキング実行しており二重化 |
| コンテキストハッシュ添付で行番号ドリフト検出 | 却下 | 外部AIは自分でファイルを読める。テンプレで「NNN行付近+関数名を主キー」とすれば十分。ハッシュ管理は過剰設計 |
| reality-checkerをプロジェクト`.claude/agents/`に新設 | 却下 | 正本がai-hub/agents/に実在・配備済み(当初の地雷マップ前提が誤り)。複製は正本1つ違反。既存定義がverify:*を自動発見するのでverify:ccは既に配線済み。足りないのはロック(K3)と§T明文化(K4)のみ |
| post-apply的git hookで実装直後に自動verify | 却下 | gitにそのフックは無い。実装直後の検証はK2(サブエージェントの定義)が同じ位置を担う |
| ロックにPID/タイムスタンプ検証・自動失効を実装 | 却下 | 個人開発で同時セッションは原則1つ(グローバルルール)。残骸は手動rm(hookメッセージに明記)で十分。凝ると壊れる |

## G. 地雷と回避策

1. **detached HEAD不完全コミット** → K4(同期実行のみ)が第一、K3ロックが第二。commit直後の`git branch --show-current`+`git show HEAD --stat`裏取りはK2に焼き込み済み。
2. **importミスのサイレント欠落(lintだけが捕捉)** → K2でverify:cc必須化(lint内包)。STEP行貼付なし報告=無効。
3. **git addフィルタ事故・copy:ext版混在** → K1テンプレの完了条件4に「新規ファイル明示列挙」を定型化。check:tracked-importsが第二網(verify:cc内)。copy:extは委譲対象外(司令塔工程のまま)。
4. **実機確認の自動化不可** → 自動化を諦める設計(K4の⏳実機待ち運用)。「同一ファイル群の次実装委譲禁止」だけで版混在を防ぐ。
5. **ロック残骸(サブエージェントのクラッシュ)** → hookエラーメッセージに解除コマンド明記。lockファイル内に作成時刻を書く(dateコマンド出力)ので古さは目視判定可。
6. **PowerShell×日本語**(hookとCLI起動) → hookメッセージは英語限定。外部CLIへのプロンプトはファイル参照方式(K2)でシェルに日本語長文を流さない。
7. **pre-pushの`npm run verify`はClaudeターミナルでハングしやすい問題** → hookはターミナル統合外のプロセスで走るため対象外。外部AIには従来どおりpushさせない(既存禁則維持)ので衝突しない。
8. **テンプレの形骸化**(埋めずにコピーだけされる) → 「影響範囲」「ネガティブ制約」は司令塔が裏取りして書く欄と明記し、空欄のまま委譲されたら委譲サブエージェントが差し戻す旨をK2に1行追加。
