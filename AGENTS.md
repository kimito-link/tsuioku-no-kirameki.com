# AGENTS.md — プロジェクト引き継ぎノート

Cursor / Claude Code / その他エージェントが共通で参照する前提ファイル。
**過去の詳細セッション履歴は [docs/agents-session-history-archive.md](docs/agents-session-history-archive.md) に分離。** ここは現役の設計判断・運用ルールのみ残す。

---

## 1. プロジェクト概要

- **名称**: 君斗りんくの追憶のきらめき（Chrome 拡張機能）
- **ドメイン**: https://tsuioku-no-kirameki.com/ （紹介 LP + プライバシーポリシー）
- **運営**: Kimito-Link Project
- **単一用途**:
  ニコニコ生放送 (`*.nicovideo.jp`) で流れる応援コメントを、利用者本人の
  ローカル PC (`chrome.storage.local`) の中にのみ記録し、放送終了後に
  3 つのレーン（りんく／こん太／たぬ姉）＋活発度の色分けで振り返れるよう
  可視化すること。

---

## 2. Chrome Web Store ステータス

- **拡張 ID**: `cjbabignmmodaickpeckiojjabnlogdb`
- **公開中**: **0.1.7**（2026-04-23 提出 / 2026-04-29 公開）
- **直近提出**: **0.1.102**（2026-05-01 23 時台 / 自動公開 ON / 審査結果は要確認）
- **次回提出準備済**: **0.1.663**（2026-06-08 ZIP 生成済: `build/tsuioku-no-kirameki-0.1.663.zip` / localhost・開発識別子 除去済 / 説明文・権限理由 反映済 / ダッシュボード貼り付け＋提出はユーザー手動）
- **ローカル開発**: `feature/broadcaster-reputation-check` ブランチで **v0.1.663** まで進行中（2026-06-08 時点）
- **CWS Developer Dashboard 入力の正本**: [docs/releases/cws-submission-texts.md](docs/releases/cws-submission-texts.md)
  - 提出時に毎回そこから貼り直す運用（再構築コスト削減）
- **ホスト権限**: `https://*.nicovideo.jp/*` のみ（`localhost`/`127.0.0.1` は提出版から除外）
- **次回提出時のチェック**:
  1. ZIP 生成: `python scripts/stage-submission.py <version>`
  2. `npm run verify:bump` で manifest / package / changelog 整合確認
  3. ダッシュボード本文を `docs/releases/cws-submission-texts.md` から貼り直し
  4. privacy.html とダッシュボード入力の文言整合（特に「AI 連携」「個人特定情報」）

---

## 3. 重要な設計判断（今後も踏襲すること）

### 3.1 「ゆっくり」という言葉の扱い
本拡張のオリジナルキャラクター（りんく・こん太・たぬ姉）は **東方Project の二次創作キャラクター（霊夢・魔理沙）ではない**ため、「ゆっくり〜」「ゆっくり解説」という表現を使ってよい。一方で description / store listing では「3 匹のガイドキャラ」「オリジナルキャラクター」「やわらかい雰囲気のキャラ案内」などの言い回しも併用する。popup UI / LP 内では「ゆっくり始める」「ゆっくり解説」等を従来どおり使用してよい。

### 3.2 3 キャラの役割（ブレさせない）
| キャラ | 役割 | レーン |
|---|---|---|
| りんく | 配信者視点 | りんくレーン |
| こん太 | ファン視点 | こん太レーン |
| たぬ姉 | 匿名ガイド / しっかり者解説 | たぬ姉レーン（184 匿名コメントの振り分け先） |

### 3.3 プライバシーの合言葉
- **将来のクラウド連携・ビッグデータ解析（集合知の可視化やサーバーサイドAI）に向けたデータ収集を前提とする。** 現在はローカル主体だが、順次オプトインでのデータ送信機能を実装していく。
- AI 連携やデータ送信は**利用者の明確な同意（オプトイン）**に基づく設計とする。privacy.html と CWS ダッシュボード「単一用途」「データ使用」フィールドはこれと整合させる
- 当面は `chrome.storage.local` を一次保存先としつつ、段階的にクラウド同期の仕組みを導入する

### 3.4 識別子の扱い
- 内部識別子 `nicolivelog` は `manifest.json` の description に **含めない**
- CWS ストア掲載上の名称は `君斗りんくの追憶のきらめき` で統一

### 3.5 ユーザー情報セットの原則（2026-06-10 ユーザー確立・全UI共通）
- **人が画面に出る場所では「サムネ・ID・ハンドルネーム・リンク」を分かる限りセットで出す。**
  ID だけ・名前だけ・頭文字アイコンだけの中途半端な表示は原則違反。
  - サムネが直接取れないときは userId から公式確定パターンで導出する
    （`deriveAvatarUrlFromUid`: `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/<uid/10000>/<uid>.jpg`）
  - 数値 uid には `https://www.nicovideo.jp/user/<uid>` へのリンクを付ける
  - 匿名（`a:` 始まり uid）は安定番号「匿名NNN」+ identicon で**識別できる形**で出す（一律グレー化は禁止）
- **ニコ生上で公開されている応援情報（コメント/ギフト）は OSINT として堂々と載せる。応援者は主役**
  （隠す対象ではない・表彰として扱う）。境界線は非公開情報・追跡的プロファイリングのみ。
- 本家（ニコニコ公式）で見える表現を独自表現で勝手に置き換えない（独自フォールバックは本家の情報が無い時だけ）。

---

## 4. ファイル配置のルール

```
extension/             ← 拡張本体のソース。ここを編集する。
  manifest.json        ← 公式の配布版ソース。version を更新する場所。
  images/logo/         ← アイコンのマスター（16/32/48/128/256/512）

src/                   ← LP 側 + 純粋関数ライブラリ
  extension/           ← popup-entry.js / content-entry.js / background 系
  lib/                 ← 純粋関数（unit test 対象）
  images/googlechrom/  ← CWS 提出物のマスター（コミット対象）
    konta-yukkuri-icon-128.png   ショップアイコン
    promo-tile-440x280.jpg       プロモタイル(小)
    marquee-1400x560.jpg         マーキー

tsuioku-no-kirameki/   ← 本番 LP の配信ディレクトリ（GitHub Webhook で Cloudflare Pages に deploy）
  index.html           ← LP 本体
  privacy.html         ← プライバシーポリシー
  google7e3e79636d884c2.html   Search Console 所有権確認（残置）
  google7e3e79636d884c2f.html  同上（末尾 f 付きが正で、Search Console 側で選択）

build/                 ← .gitignore 対象。CWS 提出用 ZIP + 生成アセット置き場
  store-listing/
    description-ja.txt                5,377 字（そのまま貼付け用）
    privacy-justifications-ja.txt     7 種の権限理由 + データ開示テンプレ
    screenshot-1〜5-*.jpg              1280×800
    promo-video.mp4                   46s / 1920×1080 / H.264（YouTube アップ済）
    youtube-thumbnail-1280x720.jpg    YT サムネ
    _gen_*.py                         再生成用 Python スクリプト
```

**編集時の注意**:
- `build/` は gitignore されているので、中の成果物は `_gen_*.py` から **再生成可能な状態** を保つこと
- CWS 提出物のマスターは `src/images/googlechrom/` にだけ置く（`build/store-listing/` は中間生成物扱い）

**ディレクトリマップ＋機能逆引き索引（自動生成・どこに置く/どこを直すで迷わないため）**:
- `docs/repo-tree-map.md`（テキスト正本）＋ `docs/repo-tree-map.html`（色付き視覚ビュー）に載る:
  1. **マインドマップ**（md 先頭・Mermaid `graph LR`・GitHub で図として表示）: ディレクトリツリー型＋機能逆引き型。
  2. **ディレクトリマップ**（場所 → 役割）: 各ディレクトリが何の担当か（色・速度・コメント・レポート 等）。
  3. **機能逆引き索引**（機能 → 担当ファイル）: 「送信を司るのはここ」「popup スクロールはここ」式に、
     挙動から担当ファイルへ一発で辿れる。
  マインドマップも `ROLES`/`FEATURES` 辞書から自動生成なので、辞書更新で図も自動更新（手描きしない）。
- 実体は `scripts/repo-tree-map.mjs` が git 追跡ファイルから**自動生成**（`npm run tree-map`）。
  ツリーは手で書かない。役割は `ROLES` 辞書、機能逆引きは `FEATURES` 辞書が正本（どちらも人間が決める）。
- **新しいディレクトリを作ったら**: マップに「⚠️ 未記入」で赤く出る → `ROLES` に1行足して `npm run tree-map`。
- **新しい主要機能を足したら**: 実際に grep で司っているファイルを確かめてから `FEATURES` に1行足す（推測で書かない）。
- `npm run verify:cc` に `tree-map:check` が入っており、(a) 再生成して差分が出たら失敗、
  (b) `FEATURES` の担当ファイルが消失/リネームしたら失敗 → ディレクトリ追加削除・ファイル移動で
  マップや索引が古いままだと検証で気づく（腐らない）。
- この仕組みは `docs/feature-map/`（機能ごと依存図・`npm run feature-map`）と同じ流儀の姉妹。

---

## 5. 直近の変更履歴

過去のセッション別変更詳細は [docs/agents-session-history-archive.md](docs/agents-session-history-archive.md) を参照。**個別 commit は git log で十分追えるので、ここには集約しない方針**（プロンプト税対策・2026-05-05）。

直近のローカルバンプは `feature/live-item-throw-by-user` ブランチで v0.1.165〜v0.1.168（2026-05-05）：
- v0.1.165: ロード演出 CSS auto-fade フェイルセーフ
- v0.1.166: NDGR field 6 単独「ニコ生現在 N 位」誤表示撤去 + 診断 JSON 強化
- v0.1.167: ツールバー押下で何も出ない事故修正（panel 画面外時に popup window fallback）
- v0.1.168: 貢献度ランキング scraper を実 DOM `.content-supporter-section` 構造に対応

---

## 6. 審査通過後にやること（TODO）

1. **LP (`tsuioku-no-kirameki/index.html`) に「Chrome ウェブストアで入手」ボタンを追加**。URL は承認メールが来たら CWS の公開ページから取得。ヒーロー CTA とフッターの 2 箇所
2. **privacy.html の最下部「インストールは Chrome ウェブストアから」リンクも同じ URL に差し替え**
3. **スクリーンショットの段階的差し替え検討**（現状コンセプトモック → 実動画面）
4. **YouTube 動画の説明欄に CWS の公式 URL を追加**
5. **レビュー・評価が付き始めたら、LP の「ユーザーの声」セクションを更新**

---

## 7. コミット・メッセージ規約

- プレフィックス: `feat` / `fix` / `chore` / `docs` / `refactor` / `style` / `test`
- スコープは括弧で括る: `feat(lp): ...` / `fix(privacy): ...`
- 日本語本文で OK。件名は 1 行 50〜72 字目安
- Claude Code が付ける `Co-Authored-By: Claude ...` 行はそのまま残す

---

## 8. デプロイ / CI

- **LP**: `master` ブランチへ push すると、Cloudflare Pages の連携が自動で `tsuioku-no-kirameki/` 配下を本番反映する。ビルド手順は不要
- **拡張 ZIP**: `python scripts/stage-submission.py <version>` で一括生成
  - 生成物: `build/submission-<version>/` と `build/tsuioku-no-kirameki-<version>.zip`
  - スクリプトが自動でやること: (1) dev manifest から localhost / 127.0.0.1 を落とす (2) description の「（開発識別子: nicolivelog）」サフィックスを落とす (3) ホワイトリストで必要な画像だけコピー (4) ZIP 出力前に全エントリがフォワードスラッシュか検証

---

## 9. Claude Code が頻繁に止まるとき（Windows）

1. **初回**: `npm run setup:claude` → `.claude/settings.json` に `defaultMode: bypassPermissions` を入れる。
2. **検証**: `npm run verify` ではなく **`npm run verify:cc`**（ログ: `.artifacts/verify-cc.log`）。
3. **単体テスト**: `npm run test:cc`（`vitest` + dot reporter + forks プール）。
4. **禁止**: 応答本文に XML 風 tool 呼び出しを書く・Unix パイプ（`tail`/`head`/`grep`）を PowerShell で使う。
5. **長い会話**: 新チャットまたは `/compact`。HANDOFF / MEMORY に要約を書いてから続行。

詳細: [CLAUDE.md](CLAUDE.md) の「Claude Code が止まるとき」。

---

## 10. エージェントへのお願い

- **まず [`docs/MAP.md`](docs/MAP.md) を開く＝全部の地図・診断・検証への唯一の入口**。
  「どこを直す／何が壊れる／今の状態／壊れてないか／公開記事」を1枚から辿れる。迷ったらここ起点。
- **担当ファイル・場所に迷ったら、まず [`docs/repo-tree-map.md`](docs/repo-tree-map.md) を引く**。
  「○○を司るのはどこ?」は**機能逆引き索引**（機能 → 担当ファイル）、「これどこに置く?」は
  **ディレクトリマップ**（場所 → 役割）、全体像は冒頭の**マインドマップ**で掴める。推測で探し回らない。
  そこに無ければ grep で実コードを確かめ、確定したら `FEATURES`/`ROLES` 辞書に1行足す（§4）。
- **公開ページ(LP/記事/docs)のリンクや URL を触ったら `npm run site-health` を走らせる**。
  内部リンク切れ・canonical/og:url 取り違えを静的検出する（`verify:cc` の `site-health:check` でも自動で落ちる）。
  記事をコピペで増やすときは canonical/og:url を自ファイル名へ直すのを忘れない。正本=[`docs/site-health.md`](docs/site-health.md)。
- **共有 lib を変えたら `npm run impact-check` で波及先を自動確認する**(星野ロミ式「規律を自動ゲートに」)。
  diff から「影響大(複数機能に波及)の変更ファイル」を検出し、波及先の機能を列挙する。**警告のみでブロックしない**
  (摩擦ゼロ)が、列挙された各 feature の動作確認を必ず行う。CI で明示ゲートにしたいときは `--strict`(exit 1)。
  元データ: [`docs/feature-map/impact-map.md`](docs/feature-map/impact-map.md)(逆引き)。再生成 `npm run feature-map`。
  - **コミット時は自動**: `.husky/pre-commit` が `impact-check` を毎コミット実行(staged 対象・**ブロックしない**)。
    影響大の変更をステージしてコミットすると、波及先の警告が出る(止まらない=確認すべき機能が必ず目に入るだけ)。
  - **`--strict` をゲートにしたいとき**だけ CI/pre-push で `npm run impact-check -- --strict --base origin/master` を足す
    (このリポの既定は非ブロッキング=開発の摩擦を増やさない)。
- **この AGENTS.md を最初に読むこと**。とくに §3.1「ゆっくり OK」と §3.2「3 キャラの役割」はコピー＆新規生成するコンテンツに波及しやすい
- **CWS 申請関連のファイル**（`src/images/googlechrom/`, `build/store-listing/` の `description-ja.txt` / `privacy-justifications-ja.txt`）は、仕様・文言を変える際に必ず「審査通過後の差分提出」を意識する
- **プライバシー周り**の文言を変更したら、`privacy.html` と `description-ja.txt` と `privacy-justifications-ja.txt` の 3 点を同期させる（片方だけ変わると審査で齟齬として指摘される）
- **拡張 bump は build + commit + push + 本体 pull + chrome://extensions リロード + watch タブ F5 まで 1 セット**（途中で止めると Chrome に届かない）

---

## 11. AI ツール役割分担（Claude Code 司令塔アーキテクチャ・2026-05-29 確立）

### 11.1 大原則

**ユーザーは Claude Code とだけ会話する**。Claude Code が司令塔として他の AI コーディングツール（Codex CLI / cursor-agent CLI / OpenCode）を呼び出し、結果を読み戻して統合する。

これにより：
- ユーザーは複数ツール画面を切り替えなくていい（**コピペの手間ゼロ**）
- 各ツールの強みを活かしつつ、Claude Max のクレジット消費を分散できる
- 全ツールが共通の AGENTS.md を読むので、文脈の食い違いが構造的に起きない

### 11.2 役割マトリクス

| 段階 | 担当ツール | 起動方法 | 理由 |
|---|---|---|---|
| 会議・真因究明・設計判断 | **Claude Code 本体** | メイン会話 | サブエージェント並列・MCP・MEMORY統合 |
| 並列探索・OSS 世界調査 | Claude Code サブエージェント | `Agent` ツール | 1Mコンテキスト・並列リサーチ |
| 並列実装（5〜30 ユニット） | Claude Code `/batch` スキル | スラッシュコマンド | 公式機能 v2.1.63+（worktree 隔離） |
| **marketing/HTML レポート/放送系の実装** | **Codex CLI** | `.claude/agents/codex-impl.md` | 過去実績（[memory/codex_collaboration_rules.md](memory/codex_collaboration_rules.md)） |
| **複数ファイル横断リファクタ** | **cursor-agent CLI** | `.claude/agents/cursor-impl.md` | Tab補完・横断編集が速い・クレジット温存 |
| **ローカル雑用（無料・要 ollama）** | **OpenCode** | `.claude/agents/opencode-local.md` | MEMORY で実証済み（DeepSeek V4 Flash） |
| コードレビュー | Claude Code `/code-review` + Codex/Cursor BugBot 経由 | 司令塔から両方走らせて結果統合 | 多視点レビューで品質UP |
| PR運用（commit/push/PR作成） | Claude Code 本体 | `gh` CLI（Bash） | 既に確立した運用 |
| 実機検証（ブラウザ操作） | **Claude Code（Claude-in-Chrome MCP）** | MCP 経由 | **代替不可**（他ツールには無い機能） |
| MEMORY/reference 更新 | **Claude Code 本体専用** | `Edit` | **他ツールに渡さない**（食い違い防止） |

### 11.3 ツール起動の技術詳細

#### Codex CLI（インストール済み: `codex-cli 0.128.0`）
```bash
# 例: Codex に marketing 系の実装を依頼
codex exec "memory/codex_collaboration_rules.md に従って ..."
```
Codex は起動時に AGENTS.md を自動読込する（[公式仕様](https://developers.openai.com/codex/guides/agents-md)）。

#### cursor-agent CLI（実体: `C:\Users\info\AppData\Local\cursor-agent\cursor-agent.cmd`）
```bash
# Bash から呼ぶ場合は cmd 経由
"/c/Users/info/AppData/Local/cursor-agent/cursor-agent.cmd" -p "..." --output-format json
```
cursor-agent は AGENTS.md と CLAUDE.md の両方を自動読込（[公式仕様](https://cursor.com/docs/cli/using)）。

#### OpenCode（インストール済み: `opencode 1.15.10`）
```bash
# MEMORY 実証済み: NVIDIA DeepSeek V4 Flash が安定
opencode --model nvidia/deepseek-ai/deepseek-v4-flash ...
```

### 11.4 ⛔ やってはいけないこと

- **MEMORY.md を他ツールに編集させる** → Claude Code 専用領域。食い違いリスク
- **Grok Build / Antigravity を確実な情報なしに組み込む** → 2026-05時点で CLI/MCP対応の一次ソース裏取り未完了。実機検証してから
- **サブエージェントが別のサブエージェントを呼ぶ**（[公式禁止](https://code.claude.com/docs/en/sub-agents)）→ メイン会話から並列に呼ぶ
- **同じ作業を複数ツールで重複実装** → 役割を上のマトリクスで固定する

### 11.5 ハンドオフのコピペレス手順

1. Claude Code が会議結論を `memory/reference_*.md` に書く + ブランチ作成 + push
2. Claude Code が `.claude/agents/<tool>-impl.md` 呼び出し → サブエージェントが Bash で外部 CLI 起動
3. 外部 CLI は AGENTS.md + 該当 reference を自動読込
4. 外部 CLI が実装 → ブランチに push
5. Claude Code が `git diff` で読み戻して `/code-review` + Claude-in-Chrome 実機検証
6. Claude Code が MEMORY/reference 更新 + PR merge

各ステップで「ファイル経由」のみで情報伝達 → コピペ発生ゼロ。

### 11.6 並列・自動評価（Arena Mode 相当）の実装

Claude Code の `/batch` で 5〜30 並列の worktree 実装は既に可能。さらに「複数案を並列実装→自動評価→最良を選ぶ」(Grok Build の Arena Mode に相当する) を実現するには:

```
Claude Code main → 複数の `.claude/agents/judge-*.md` を並列起動
                  → 各 judge が観点(correctness/perf/security)で採点
                  → 多数決で最良案採択
```

これは今日の作業で既に実践している「ネガティブコントロール + 複数仮説評価」の自動化版。

## 12. 実装前ゲート（plan 先行・暴走再発防止・2026-06-14 確立）

> 背景: 「走りながら考える」で暴走しクラッシュした実例があった。星野ロミ式 / Karpathy 4原則 /
> 会議P0(Codex)が同じ方向を指す。出典 memory/reference_ai_general_rules_learnings.md。

### 12.1 着手前ゲート（複数ファイル・状態・storage・messaging・backfill・権限変更は必須）

- 複数ファイル/状態管理/storage/messaging/backfill/権限変更は**必ず Plan 先行**(EnterPlanMode)。
- 探索中は **Read/Grep/git diff のみ**。Plan が承認されるまで編集・build・version bump を禁止。
- Plan には **目的・非目的・変更ファイル・状態遷移・失敗時 rollback・検証手順**を書く。
- Plan に無いファイル変更が必要になったら**停止して Plan を更新**(勝手に広げない)。
- 例外=「**1ファイル・10行未満・挙動不変**」の文言/typo 修正だけ。

### 12.2 実装中の規律（Karpathy 4原則）

1. **コードの前に考える**: 前提を明示し曖昧なら止まる。**推測実装を避ける**(実機/コードで真因を確認してから直す)。
2. **シンプルに**: 依頼以上を足さない(過剰設計・過剰抽象化をしない)。
3. **外科的に変更**: 無関係な「ついで修正」をしない。既存部品を検索して再利用(重複実装しない)。
4. **検証可能に**: 1単位ごとに対象 test を実行。test/typecheck/build が壊れたら**追加実装を停止**して直す。

### 12.3 星野メソッド(UX判断の軸)

- **摩擦ゼロ**: 待機・無音・「見つかりません」で止めるのは悪。楽観的に始めダメなら静かにフォールバック+次の一手。
- **行動誘発**: 「次にどうすればいいか」を提示。**速度至上主義**(待たせない・開いた瞬間に出す)。

### 12.4 コミット/検証/復帰

- dist 生成・version bump・commit・push・Chrome reload は**明示依頼後**に行う。
- version は changelog 先頭と整合させる(追跡できないバージョンを**でっち上げない**)。
- **クラッシュ後は git diff と承認済み Plan を読み直してから再開**(推測で作業を続けない)。

### 12.5 バージョン bump の粒度と「ユーザー反映」(2026-06-15 明文化)

**粒度=1つの意味ある変更=patch 1つ上げる**(`0.1.749→750→751…`)。バグ根治・機能追加・UX 改善など
「ユーザーに説明できる単位」ごとに分ける。複数の無関係な修正を1バンプに混ぜない(履歴と changelog が
追えなくなる)。逆に、1ファイル・挙動不変の typo 修正だけならバンプ不要。

**bump 3点セット(必ず同期・`npm run verify:bump` が機械チェック):**
- `extension/manifest.json` の `version`
- `package.json` の `version`
- `src/lib/changelog.js` 先頭エントリ(`version` 一致・`summary` は **35字以内**・`items` は配布物の
  ユーザー向け説明)

**⚠️ push しただけではユーザーの Chrome に届かない(最重要・§10 の「1セット」)。**
司令塔(Claude Code)が build+commit+push した後、**ユーザー側で次の3手順を踏んで初めて反映**される:
1. ローカルリポを **git pull**(最新 `extension/dist/` を取得)
2. `chrome://extensions` で拡張を **リロード/更新**
3. **開いているニコ生 watch タブを F5(再読込)** ← これを忘れると古い content script が
   `Extension context invalidated` で会場が固まる(v0.1.753 で「再読込してね」案内を出すようにした)

→ **トーンの両立**: 普段は「拡張更新+watch タブ F5 で反映されます(タイミングは任意)」程度に
**1行だけ**添える(箇条書きで毎回突きつけない=ユーザーは手順攻めを嫌う・memory
`feedback_no_manual_verification.md`/`feedback_extension_bump_flow.md`)。ただし **ユーザーが
「反映されない/固まる/古いまま」と困っている時、または明示的に手順を聞いた時**は、上の3手順を
明確に提示してよい(2026-06-15 にユーザーが手順を質問したのが実例)。コードの bump はこまめに
やっても、3手順を踏むまで体感は変わらない点だけは外さない。

### 12.6 フェーズ・フロー図正本（AIも人間も同じ正本でミスを減らす・2026-06-18 ユーザー確立）

> 背景: ユーザー提案「フェーズと状態色で進捗を示す技術ページがあれば、AI も人間もそれを見れば
> ミスがなくなる」。実証=`.comment-number` タスクで「フェーズ1(仮説)→フェーズ3(実機確証)」の
> ゲートを図にしたことで、前提が間違っていた第2を盲目的に作らずに済んだ。

**規律**: 段階導入(複数コミット)・前提に不確実性がある・真因究明を伴う **substantial なタスク**は、
設計の SYNTHESIS(`council/*.md`)に加えて **フェーズ・フロー図正本(`docs/*-flow.html`)** を1枚用意/更新する。
trivial な1ファイル挙動不変の修正には不要。

**書式(スクショ提案の言語をそのまま採用)**:
- **フェーズ番号**(0→1→2…)で時系列/依存順に並べる。各コミット段階に対応させる。
- **状態色**で一目区別: ✅緑=完了・安全(挙動不変で着地) / 🟥赤=ブロッカー・前提否定(崩れると以降が無駄) /
  ❄️青=凍結(やらない判断・再開条件つき) / ⚙️黄=仮説・伸びしろ(要確証 or 次候補) / 🙋紫=人間の手が要る。
- **依存ゲート**を矢印+一言で明示する(例「この前提が崩れると以降が無駄」「突破して初めて〜が活きる」)。
  = この「ゲートの明示」が肝。盲目的な後続実装を止める。
- 先頭に SYNTHESIS と関連 doc へのリンク・最終更新日。テキスト正本(SYNTHESIS/md)が真実、html は視覚ビュー。

**現存する正本(手本)**:
- `docs/person-tile-architecture.html` ＋ `.md` — データフロー型(誰が正本か・取り違え厳禁の語)。
- `docs/comment-number-rescue-flow.html` — フェーズ・状態色型(第1完了/第2凍結/実機確証ゲート)。

**更新タイミング**: コミットで状態が変わったら(完了/凍結/前提否定)図の色とゲートを同期する。
MEMORY/SYNTHESIS を更新する時に html も併せて直す(`§T` の「MEMORY/reference 更新は司令塔専用」と同じ扱い)。

### 12.7 ユーザー向け診断文言は因果を実コードで裏取りしてから書く（2026-06-20 self-verifying loop の取り込み）

> 背景: stale-DOM 事件(v0.1.834)。`statusActionAdvisor.js` の advice card が cause「公式値レーンが
> 混乱することがある」と書いていたが、実コード上その因果は無かった(各 watch タブは現在 lv の単数 bundle
> のみ使用)。**診断が嘘をついてユーザー(と AI)を誤った原因究明へ誘導**した。X の self-verifying loop
> 「出力をソースに突き合わせる」の縮小実例で捕捉。設計正本=`council/self-verifying-loop-SYNTHESIS.md`。

**規律**: ユーザーに見せる診断の **cause(原因)/action(対処)を書く・変えるときは、その因果が実コードの
経路に本当にあるか grep/Read で裏取りしてから書く**。「〜が混乱/混入/汚染する」のような実害を断定する
文言は特に危険(誤れば原因究明を丸ごと誤誘導する)。確証できない因果は「影響しません」「〜の可能性」と
正直に書く(星野ロミ式・失敗体験=嘘の診断の除去)。

**機械ゲート(検証可能な薄い部分だけ)**: `src/lib/diagWordingGuard.js` が、severity が `info`(実害なし
位置づけ)のカードに実害語(混乱/混入/汚染/破壊…)が混ざっていないか機械照合する(`statusActionAdvisor.test.js`
から回帰防止)。**嘘の自動判定はしない**(散文の因果が正しいかは意味照合で機械決定できない=全自動の嘘検出は
作らない・過剰実装)。あくまで「info なのに不安語=人間が実コードで裏取りせよ」の喚起まで。

### 12.8 記録件数の「表示の正本」は1本(2026-06-20・数字バラバラ根治の第1)

> 背景: ユーザー根底批判「記録の数字がソース/画面ごとにバラバラで正確さが崩れた」。実コード棚卸しで
> 「記録件数」が6カウンタに分裂と判明(council/recorded-count-zero-bug.md / count-simplify-SYNTHESIS.md)。

**規律**: 画面に出す「記録件数」の正本は **`recordedCountForDisplay(lid)`(= panel summary の `recordedCount`・
per-live 単調化済み)の1本だけ**。取り出しは `src/lib/displayRecordedCount.js#selectDisplayRecordedCount`
を通す。**表示に混ぜてはいけない診断専用カウンタ**= `savedCommentsUidStats`(最後の flush batch だけ)・
`commentIngestBySource`(取込源別の累積・重複込み)・`displayEntriesBase.length`(UI生成数・0潰しの一因)。
診断カウンタは AI 診断 JSON 用であって表示用ではない(役割を混同しない)。第2以降で countToShow の max・
配信者除外の引き算・各ゲートを段階的に剥がす(一斉撤去はしない・回帰テストで「増えて減る/0潰れ」を固定してから)。
