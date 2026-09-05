# 引き継ぎ: 全体を見渡せて「根幹」が分かるマップ (最優先1・**ほぼ完了**)

> このセッションは本文に内部ツール呼び出し断片が出る恐れがあり中断。CLAUDE.md §2 に従い新チャットへ。
> 会話全文は不要。下記だけで再開できる。
>
> ⚠️ **2026-06-20 更新**: この handoff の旧版は「着手前・コード未着手」と書いていたが**間違い**。
> 実際にはタスクは**2コミットで実装済み**。新版は実態に合わせて書き直した。

## 🔴 まず最初にやること: 未 push コミットを push する

`git log` 実測(2026-06-20):

- `HEAD = 6d849ded`(**origin より 1 コミット先・未 push**)
  = `refactor(map): 視覚マップを code-tree.html の1枚に統合(spine-map を廃止)`
- `origin/master = 43a94b0e`(push 済み)
  = `feat(map): コードを「ブラウザで開けば全部わかる」視覚ツリー2枚を自動生成`

つまり `master...origin/master [ahead 1]`。**`6d849ded` がまだ origin に出ていない。**
新チャットの最初の仕事は、この1コミットを安全に push すること:

1. read-only で `git log --oneline origin/master..HEAD` を確認(`6d849ded` 1本だけのはず)。
2. `git status` で作業ツリーの汚れ(council/*, memory/handoff_*, docs/article-assets/*,
   scripts/meeting.mjs M など前セッション残り)は**このコミットと無関係**=巻き込まない。
   既に commit 済みなので追加 stage は不要。push するだけ。
3. `git pull --rebase`(司令塔が pull 代行・feedback_commander_pulls_before_push)→ `git push`。
4. 反映案内: これは **docs + scripts のみ**(`docs/*.html` `docs/*.md` `scripts/*.mjs`)。
   拡張本体(extension/dist)は触っていない=**拡張リロード/F5 は不要**。
   「ブラウザで `docs/code-tree.html` を開けば反映済み」とだけ伝える。

## ✅ タスクの結論: 「根幹マップ」は実装済み(再発明しないこと)

ユーザー指示「最優先1を COUNCIL-HOWTO でカラ会議 → 司令塔が裏取り統合して1案」は**完了している**。
新チャットが「マップを作れ」と読んでゼロから作り直すのを**絶対に避ける**。成果物:

| 成果物 | 何 | コミット |
|---|---|---|
| カラ会議お題 | `council/root-spine-map.md` | 43a94b0e |
| 会議の生回答/ログ | `council/root-spine-map-answers.json` / `-log.txt` | 43a94b0e |
| **司令塔の統合1案** | `council/root-spine-map-SYNTHESIS.md` | 43a94b0e(+6d849ded で追記) |
| **視覚ツリー(正本)** | `docs/code-tree.html` / `docs/code-tree.md`(自動生成) | 43a94b0e→6d849ded で統合 |
| 生成スクリプト | `scripts/repo-tree-map.mjs` / `scripts/feature-map.mjs` | 両コミット |
| 入口ハブ更新 | `docs/MAP.md` が code-tree.html を指す | 両コミット |

### 設計判断(6d849ded でやったこと=要点)

- 最初(43a94b0e)は `spine-map.html`/`.md` と `code-tree.html`/`.md` の **2枚** を作った。
- だが「マップを増やすと腐る・重複する」(=このシリーズの思想)に反するので、
  **6d849ded で `spine-map.*` を廃止し `code-tree.html` 1枚に統合**した。
  `scripts/feature-map.mjs` を大幅整理(1027 行削減)。
- **正本は `docs/code-tree.html`(ブラウザで開けば全部わかる1枚)**。新チャットはこれを起点に。

## 次の一手(新チャットの順番)

1. **上の「🔴 まず push」を実行**(`6d849ded` を origin へ)。これが最優先。
2. push 後、`docs/code-tree.html` を実際に開いて(または Read で `docs/code-tree.md`)、
   「初見の人/AI がデータの入口→記録→表示の背骨を追えるか」を**ユーザーに目視確認**してもらう。
   検証観点: 枝葉に埋もれない・既存マップ(下表)と重複しない・腐ったら verify で落ちる。
3. ユーザーに「根幹マップは code-tree.html に1枚化して push 済み。これで見えますか?」を
   **短い文章で**確認(選択ボタン式は使わない=~/.claude/CLAUDE.md §1)。
4. OK なら次タスクへ(下記「残タスク候補」)。修正要望が出たら `scripts/repo-tree-map.mjs` /
   `scripts/feature-map.mjs` を直して `npm run tree-map` 等で再生成(手書きしない=自動生成物)。

## 既存マップ一覧(重複生成しないための地図・docs/MAP.md が入口)

| 既存マップ | 何 | 場所 |
|---|---|---|
| **入口ハブ** | 地図/診断/検証への唯一の入口 | `docs/MAP.md` |
| **根幹/視覚ツリー(今回の正本)** | ブラウザで開けば全部わかる1枚 | `docs/code-tree.html` / `.md` |
| ディレクトリ役割＋機能逆引き＋Mermaid | 「○○を司るのはどこ?」「どこに置く?」 | `docs/repo-tree-map.md` / `.html`(`npm run tree-map`) |
| 影響範囲マップ | 「このファイルを変えたら何が壊れる?」 | `docs/feature-map/impact-map.md` |
| storage データバス図＋断線検知 | 誰が書き/誰が読む・片側断線 | `docs/feature-map/storage-bus.md` |
| 実行時マインドマップ | 拡張の今の状態を1枚 | `status.html` の「🧠 全体マインドマップ」 |

## 会議の回し方(参考・このリポの既存ランナー)

- ランナー: `scripts/meeting.mjs`(本体)/ `scripts/meeting-roles.mjs` / `scripts/council-roles.mjs`。
  romi 系起動例: `council/run-romi-council.ps1` / `council/run-romi-doin.ps1`(PowerShell)。
- ⚠️ `scripts/meeting.mjs` はセッション前から M(未コミット)。今後のコミットに混ぜない。
- 構成: groq×2 / gemini / openrouter / local(qwen2.5/qwen3)の 4〜5 応答。
- ⚠️ 会議は**実コードを知らずファイル/関数/storage キーをハルシネする常習**。
  採用前に必ず grep / Read で実在確認 →`-SYNTHESIS.md` に1案統合(今回もそうした)。

## 直近の文脈(v0.1.82x = git の主・この系列)

ユーザーの「git の主はこの系列」= **status の対処カード/マップ整備の星野ロミ式シリーズ**:
- (未 push)`6d849ded` 視覚マップを code-tree.html 1枚に統合(spine-map 廃止)
- v0.1.826 多タブ負荷を可視化「タブを絞ると軽い」対処カード(16d37f54)
- impact-check を pre-commit 組込(e9d98eb0)/ scan-dead-lib 自動 entry 収集(af903501)
- v0.1.825 記録された内部エラーを対処カードに集約(2b9a80d2)
- v0.1.824 「症状→原因→次の一手」対処カードを status 最上部に(d22414e4・a0b9b952)
- docs/MAP.md ハブ(5f61374d)/ feature-map 影響範囲＋腐り検知(1c0cee6c・46a3dfa0)
- site-health を verify:cc 組込(23a10d9b・17ec569b)

→ 「見れば分かる・腐らない・自動検証」路線。次もこの思想で。

## 残タスク候補(根幹マップが片付いた後)

MEMORY.md 由来の未完(優先度はユーザーに確認):
- **`.comment-number` 消失救済 第2コミットは凍結中**(実機 DOM で前提が覆った=匿名 userId は
  NDGR のみ)。再開条件はユーザー自身の配信で `noNumberRowCount>0` が実観測された時だけ。
- 背面 backfill の安全な再有効化 / popup の多タブ loading 表示。
- ファクタリング続き(巨大ビルダーの純粋サブ片を段階抽出)。

## 検証観点(根幹マップ・完成判定)

「初見の人(AIも)が `docs/code-tree.html` 1枚を見て、データが入口→記録→表示まで通る背骨を
10秒で追える・枝葉に埋もれない・既存マップと重複しない・腐ったら verify で落ちる」。
