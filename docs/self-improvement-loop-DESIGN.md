# 自己改善ループ — 全体設計(ローカル専用・100年読める形)

> 状態: **設計の下書き(2026-10-18)**。コードは未着手。地図(MAP)→Fable仕様→実装ハンドオフは
> wayfinder→to-spec で続ける(入口: `/wayfinder-to-spec`)。
> 起点: ユーザー発言「この拡張に無料で使えるAIを入れて自動で機能改善とかできたらうれしい」
> →「100年後安心できる設計に」「ストアには出さずローカルのみ」「Claude など有料無料問わず改善できそう」。
> ★「未確認」と書いた項目は、実コードで確かめるまで事実として扱わない。

---

## 1. 一言で

**症状を集め、原因の仮説と「版の提案」をAIに書かせ、人間が承認して、いつもの版(1版1変更・TDD・verify:cc)で出す。**
AIは「提案する」までで、拡張自身は一行も書き換えない。ストア版には入れない。

```
[実機] 状態速報(自動publish)
   │  ①集める(読むだけ)
   ▼
[ローカルPC] 症状カード(匿名化・集計のみ・プレーンJSON)
   │  ②AIに渡す(どのAIでも同じ形)
   ▼
[AI] 原因仮説 + 版の提案(Markdown)          ← Claude有料/無料AI/ローカルLLM を差し替え可能
   │  ③人間が読んで承認 or 却下(台帳に記録)
   ▼
[実装] council/_TEMPLATE-impl-prompt.md 型の実装ハンドオフ → 別モデルが実装
   │  ④通常の出荷ゲート(TDD・verify:cc・reality-checker・実機確認)
   ▼
[版] 1版1変更で出す → 次の状態速報で効いたかを測る(①へ戻る)
```

## 2. 絶対に守ること(破るとこの設計は失敗)

| # | 守ること | なぜ(根拠) |
|---|---|---|
| 1 | **ストア版に入れない**。ローカルPC上のスクリプトだけで完結。拡張の出荷物(extension/dist)に外部AIへ送るコードを足さない | CWS文面と privacy.html §6 は「AI連携は未実装」と開示(cws-submission-texts.md:22,161)。実装版を出すなら両方を同時に直す必要があり、書面齟齬は審査却下の要因 |
| 2 | **拡張が自分のコードを書き換えない・外から取ったコードを実行しない** | Chrome ウェブストアの外部コード実行禁止。AIが作るのは「提案」まで。実装は人間承認後に通常の版として出す |
| 3 | **コメント本文・ユーザーID・ハンドル名を外部AIへ送らない** | 公衆送信権(/live/ 脈拍レーン・コメント本文自動表示を却下した判断と同じ)。privacy.html §4 の開示範囲(共有機能のみ)を外れない。送るのは匿名化・集計済みの症状だけ |
| 4 | **秘密値(APIキー・トークン)をAIへ送る資料・ログ・チャットに残さない** | グローバルCLAUDE.md の鍵運用(クリップボード→環境変数)。症状カードは「鍵の変数名」すら含めない |
| 5 | **特定ベンダー非依存**。入力=プレーンJSON、出力=Markdown。どのAIに替えても動く | 100年のうちにモデルも会社も入れ替わる。形式が残れば中身のAIは替えられる |
| 6 | **AIの出力は「仮説」。証拠(実測・差分・テスト)が付くまで事実にしない** | 会議が診断を3回訂正した実績(MEMORY)。AIの確信した口調は証拠ではない |
| 7 | **承認は人間が文字で出す**。AIの提案・AI同士の合意・サブエージェントの報告は承認ではない | 承認の偽装・自走を構造的に防ぐ |
| 8 | **既存の部品を使う。新しい巨大機構は作らない** | 下の「3. 再利用する既存資産」 |

## 3. 再利用する既存資産(車輪を再発明しない)

実コードで確認済み(調査: 2026-10-18)。

| 役割 | 既存部品 | 備考 |
|---|---|---|
| 症状の入口 | `npm run status:live`(`scripts/status-live.mjs`)=状態速報をGETで取得。`--json`/`--watch` | 鍵は `.env`(`NL_STATUS_VIEW_TOKEN`)。取得は読み取りのみ。★拡張側の送信先は app.tsuioku-no-kirameki.com/api/status(ユーザー自身のクラウド) |
| 症状の判定 | `src/lib/symptomVerdicts.js`(症状ID: thumb-white, avatar-all-failed, lane-never-rendered, lane-painted-zero, lane-heavy-race, panel-black, status-slow)・`diagnosisRegistry.js`・`/nicolive-selfcheck` | 症状ID→判定の機械化がどこまで進んでいるかは**未確認**(MAPで確認) |
| 既知の原因の索引 | ai-hub `hub.mjs find --sig "<エラー実文言>"`(index.json の triggers) | 症状IDを足したら ai-hub にも足す規約が既にある。ai-hub は資産索引であり症状辞書ではない |
| 数値の推移 | 改善台帳 `improvementHistory.js`/`improvementLedger.js`・`npm run improvement:record`・`check-improvement.mjs` | 台帳は**数値指標のみ**(症状・仮説・承認の欄は無い)。ここへ提案を混ぜない(過去最良比較に条件違いの数字が混ざる) |
| AIの差し替え | `web-ios-android/docs/ai-workflows/tools/dispatch.py`(`--brain` grok/gemini/groq/qwen/oc/cf/nvidia/mistral/zen/glm/local、auto連鎖、FAIL_MARKS、ログ) | ★コードが正本(HOWTOの表は古い)。**外部送信を避けるなら `--brain local`(Ollama 127.0.0.1)固定。`--brain auto` は外部ベンダーへ落ちる** |
| 実装の型 | `council/_TEMPLATE-impl-prompt.md`・`docs/handoff/*-IMPLEMENTATION-HANDOFF*.md` | 完了条件が機械的(verify:cc・bump3点・tree-map・git add 明示) |
| 検証 | reality-checker・変異テスト・`verify:cc`・実機確認(「⏳実機待ち」運用) | 実機確認は自動化できない |
| 設計の入口 | `/wayfinder-to-spec`・`/council-fable` | 提案が大きいときの設計 |

## 4. 追加する部品(最小)

「足りない部品」だけを足す。すべて**ローカルPCのスクリプトとプレーンファイル**で、拡張の出荷物には入れない。

1. **症状カード(symptom card)** — `_loop/symptoms/<日時>-<症状ID>.json`(git管理外)
   - 状態速報から**機械的に**作る(AIには作らせない=嘘が混ざらない)。
   - 含める: 症状ID・判定(symptomVerdicts の結果)・版・buildId・数値(件数・ms・段別の人数などの**集計**)・時刻。
   - 含めない: コメント本文・ユーザーID・ハンドル名・サムネURL・配信ID(必要なら不可逆ハッシュ)・鍵。
   - マスクは**許可リスト方式**(出してよいフィールド名を列挙。それ以外は落とす)。禁止リスト方式にしない=新フィールドが増えても漏れない。
2. **提案書(proposal)** — `_loop/proposals/<連番>-<要約>.md`
   - AIが書く。形式は固定: 症状 / 観測(症状カードの数値だけを根拠に) / 原因仮説(複数・確度つき・反証方法つき) / 版の提案(1版1変更・触るファイル候補・やらないこと) / 検証手順(実機で何を見るか)。
   - 「確証」と「推測」を分けて書かせる。根拠のない断定は無効。
3. **承認台帳(decision ledger)** — `_loop/decisions.jsonl`(1行1件・追記専用)
   - `{id, proposal, decision: approved|rejected|deferred, by:"human", at, reason}`。
   - 却下の理由も残す(同じ提案を繰り返さない)。AIが書き込めるのは `proposed` まで。`approved` は人間の文字のあとに司令塔が書く。
4. **ループ実行スクリプト** — `scripts/loop/` に薄く置く(症状カード生成・AI呼び出し・提案書の形式検査)。AI呼び出しは dispatch.py を呼ぶだけ。

★`_loop/` は git 管理外(秘密・実機データが混ざりうるため)。**形式の仕様書だけを docs/ に置く**=100年後に読めるのは仕様。

## 5. データの流れと「送る/送らない」の線

| 段階 | 場所 | 外部へ出るか |
|---|---|---|
| 状態速報(既存) | 拡張 → ユーザー自身のクラウド(app.tsuioku-no-kirameki.com) | 既存の開示済みの経路。この設計では**変えない** |
| 症状カード作成 | ローカルPC | 出ない |
| AI呼び出し | **local(Ollama)固定が既定**。外部AI(Claude等)は、症状カード(匿名・集計のみ)に限り、人間が実行を指示したときだけ | 外部へ出るのは匿名集計のみ |
| 提案書・承認台帳 | ローカルPC | 出ない |

- 外部AIに渡すものは、渡す直前に**許可リスト検査**(症状カードのスキーマに合うか)を機械で通す。通らなければ送らない(fail-closed)。
- dispatch.py の agent 系 brain は `--cwd` 以下を自由に読める(`--allowed` に Bash を含む)。**症状カード・提案書専用の空ディレクトリを cwd にして呼ぶ**(リポ全体を cwd にしない=本文入りの storage ダンプ等を読ませない)。

### 5.1 実コードで確認した重要な事実(2026-10-18・状態速報の調査)

- **既存の状態速報には第三者のコメント本文が入っている**。`jsonBlob` の `commentTimelineMirror` の各行は `{at, name, text, avatarUrl, userId, kind}`(`src/lib/commentTimelineMirror.js:15`)。ほか `laneMirror`・`northStarMirror`・`topSupporters`・`giftHistoryMirror`・`lives[]`(自分の viewerUserId・配信URL)も名前・ID・アイコンを含む可能性が高い(フィールド名の精査は未了)。
  → **`status:live` の出力(`statusReport` 全文・`--json`)を、そのまま外部AIに渡してはいけない**。症状カードは、速報から**許可リスト方式で数値と症状IDだけ**を抜いて作る。
- 速報の保存先は、ユーザー自身のクラウド(app.tsuioku-no-kirameki.com の KV)。既存の送信は「既定OFFの同意+鍵が揃ったときだけ」で、ストア利用者は鍵を持たず実質動かない(`src/lib/autoPublishDecision.js`)。この設計はそれを**変えない**。
- 症状IDは `symptomVerdicts.js` の7件(thumb-white / avatar-all-failed / lane-never-rendered / lane-painted-zero / lane-heavy-race / panel-black / status-slow)。**症状→根本原因の機械テーブルは無い**(「次の一手」の文字列止まり)。→ 症状カードに「原因候補ID」は持たせず、仮説はAIの提案書側に置く。
- **ドキュメントと実装のずれ**: AGENTS.md は `NL_STORE_BUILD=1` を必須と書くが、`scripts/build.mjs` に実行コードの参照は無い(コメントのみ)。実際の防壁は `stage-submission.py` の `verify_no_secrets`(ZIP内の鍵と manifest `key` の検査)。**「ストア版に計器コードが入らない」ことを守る仕組みは現状無い**(`verify_no_secrets` は鍵しか見ない)。
  → この設計は拡張の出荷物にコードを足さないので影響しない。ただし将来、開発版にだけ送信コードを足す案は、除外の仕組みを先に作る必要がある(Out of Scope・別設計)。

## 6. 100年持たせるための決め事

- **形式が主、AIは従**: 症状カード=JSON、提案書=Markdown、台帳=JSON Lines。人間もAIも未来の道具も読める。
- **バージョンを持つ**: 各ファイルに `schema` 番号。変えるときは追記で足し、古い版を読める。
- **AIの名前を形式に埋めない**: 提案書に「どのAIが書いたか」はメタ欄(`by`)として残すが、処理はそれに依存しない。
- **判定はコードに置く、文書に置かない**(MEMORY: 文書に書いても84版積まれた)。許可リスト・形式検査・承認の必須化は**テストで固定**(元に戻すと赤)。
- **計器の罠を持ち込まない**: 「計器を足して満足し直さない」。ループの価値は**直った版が増えたか**だけで測る(提案数・件数は成果ではない)。

## 7. 失敗したとき(fail-closed)

| 起きること | 振る舞い |
|---|---|
| AIが形式外の提案書を返す | 形式検査で却下。台帳に `rejected(format)`。人間に渡さない |
| 無料枠が尽きた・AIが落ちた | 次のAIへ自動で落とさない(外部へ漏れうる)。止まって人間に知らせる。local へ落とすのは可 |
| 症状カードに許可外のフィールドが混ざった | 作成を失敗させる。AIへ送らない |
| 同じ症状の提案が繰り返される | 却下理由と照合。却下済みと同趣旨なら提案書に「却下済み: <id>」と明記させる |
| 提案を実装したが効かなかった | 次の状態速報で測り、台帳に `no_effect` を追記。**効かなかった提案は消さず残す**(同じ案の再提案を防ぐ) |

## 8. やらないこと(Out of Scope)

- 拡張の自己書き換え・自動マージ・自動配置・自動ストア提出。
- AIによる承認、AI同士の相互承認。
- コメント本文・視聴者の識別情報を使った分析。
- 利用者(配信者以外)へ配る機能化。**ストア版に載せる場合は別設計**(privacy.html §6 と CWS 文面を同時に更新し、既定OFF・3点の手動オプトインが必要)。
- 新しいクラウド基盤・常駐サーバーの追加。
- 数値台帳(improvementHistory)への提案・仮説の混入。

## 9. 最小の最初の一歩(MVP)

1. 症状カードのスキーマと許可リストを決める(仕様書+テスト)。
2. `status:live --json` から症状カードを1枚作るスクリプト(AI不使用・機械のみ)。
3. 提案書の形式検査(AIなしで、手書きの提案書でも通る/落ちるのテスト)。
4. 承認台帳の追記スクリプト(`approved` は人間の文字が要る)。
5. そのあとで初めて、dispatch.py(local固定)で提案書を書かせる。

## 10. 未確認・決めること

- 状態速報の各ミラー(`laneMirror`・`northStarMirror`・`topSupporters`・`giftHistoryMirror`・`lives[]`・`overview`・`fastDiag`)の**実フィールド名**と、許可リストに入れる線引き(上位の `commentTimelineMirror` は本文・ID・名前・アイコンURLを持つと確認済み。他は推測)。
- symptomVerdicts / diagnosisRegistry の機械判定がカバーする症状の範囲。
- `council/error-pattern-catalog.md` の実装状況(お題文のみか、実装済みか)。
- 外部AI(Claude等)に症状カードを渡すことを許すか(ユーザー判断)。既定は local のみを推奨。
- ローカルLLMの性能が提案書の質に足りるか(実測が要る)。足りなければ「症状カードを人間が選び、Claude に貼る」半自動運用でも本設計は成立する。
- Windows の注意: `.cmd` のコメントは ASCII のみ・PowerShell に日本語を渡さない・日本語パスは引用符。
