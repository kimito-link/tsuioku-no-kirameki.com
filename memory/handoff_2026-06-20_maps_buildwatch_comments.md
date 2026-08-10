# 引き継ぎ: 地図群整備 + build:watch 起動中 + 「コメント取れない」調査の途中 (2026-06-20)

> 新チャットへの引き継ぎ。会話全文は不要。下記だけで再開できる。
> 司令塔 Claude Code 本体が読む前提。CLAUDE.md / AGENTS.md / memory/MEMORY.md を先に。

## ⚠️ 最重要(これを最初に確認)= build:watch が動いている

- ユーザー要望「リロードしなくていいように(ホットリロード)」で、前セッション最後に
  **`npm run build:watch` をバックグラウンド起動した(hot-reload ON)。**
- これにより **extension/dist/*.js は watch版(hot-reload 入り)に置き換わっている**
  (`git status` で dist/content.js, popup.js, status.js が M。これは watch 由来であって
  コミット対象ではない)。
- **🔴 競合に注意**: 司令塔が `npm run verify:cc` や `npm run build` を走らせると
  **本番版 dist で上書きして watch と競合する**。コードを実装するセッションでは、
  まず build:watch を止める(TaskStop または「watch止めて」)→ verify:cc → 必要なら再起動、の順。
- 逆に **読むだけの調査(status速報を読む等)は競合しない**ので OK。
- 反映の仕組み正本: content-entry.js の startDevHotReload / NL_DEV_HOTRELOAD(esbuild --define)・
  scripts/build-watch.mjs(NL_DEV_HOTRELOAD=true)・src/lib/devReloadSignal.js。
  本番 scripts/build.mjs は NL_DEV_HOTRELOAD=false で dead-code 除去。

## いまユーザーが困っていること(調査の途中)=「コメントがうまく取れてない」

- ユーザーが「コメントがうまく取れてないです。こんなときどうすればいい?」と質問。
- **まだ実データ(status速報)を受け取っていない**=原因未特定。次セッションの最初の仕事。
- 司令塔の方針(ユーザーに伝え済み): **status速報を貼ってもらう→実データで切り分け**。
  憶測禁止(memory に「backfill 真因は毎回ハルシネ→実コード/実データ裏取り必須」と複数記録)。
- ユーザーへの依頼文(再掲): 「取れていない配信タブを前面に → status の『🤖 AI に貼る用テキスト』の
  📋まるごとコピー → 貼る」。一言「どの配信か・リアルタイムも過去ログも両方ダメか片方か」も。
- 既知パターン(今日判明含む・実データで判別すること):
  - 過去ログ(backfill)が進まない/%低い = **3配信以上同時でスロット待ち**(BACKFILL_PARALLEL_SLOTS=2)。
    対処=見てないタブを閉じ2配信以下に。真因正本=
    council/popup-less-diag-SYNTHESIS.md ではなく前セッションの実機切り分け(3→2配信で即解決を実証)。
  - リアルタイム0 = watch 未オープン/NDGR 未接続 → watch F5。
  - 全部0 = 拡張停止/反映漏れ → 拡張リロード→開き直し。
- **🔴 backfill スロットの根本改善は未着手(ユーザーが選択肢提示中に dismiss)**。やるなら:
  A. 前面タブ優先(shouldYieldBackfillToWatchedTab を正しく効かせる・429リスク無し・推奨)/
  B. BACKFILL_PARALLEL_SLOTS 2→3(429・重さリスク・要実機観察)。実コード裏取り→会議→実装の順。

## git の状態(きれい・同期済み)

- master = origin/master = **6f32f6e7 / v0.1.832**(`git rev-parse` 一致)。
- 未 push の変更は無し(dist の M は watch 由来=コミットしない)。
- 作業ツリーは前セッション残りの untracked(council/*, memory/handoff_*, docs/article-assets/* 等)で
  汚れているが**今回タスクと無関係**。コミット時は自分の変更だけ stage(parallel-git-staging-hygiene)。

## このセッション(6/20)で完了したこと=「見れば全部わかる地図」シリーズ(全 push 済み)

すべてユーザー要望「md でなくブラウザで視覚的に・知識ない人でも・創る人を応援」から:
- **docs/code-tree.html / .md**(全ファイル網羅ツリー+各役割を先頭コメントから自動抽出+冒頭に
  🦴データの流れ=背骨)。spine-map は code-tree に統合済み(独立 spine-map.html は廃止)。
- **docs/feature-sitemap.html / .md**(機能マップ)= **MindMeister 風マインドマップに刷新**
  (中心→色分け分類枝→機能・全部ひらく/とじる)+ **りんく/こん太/たぬ姉の解説**
  (FEATURE_CATEGORY / CATEGORY_CHARA_NOTE / CATEGORY_COLOR = scripts/repo-tree-map.mjs)。
- **全499ソースに役割コメント(赤ゼロ)**=「このファイル何?」が例外なく分かる。役割抽出ロジック
  改善(shebang/eslint/@ts/import後ブロック/global誤除外を救済)+ 本当に無い分だけ実コード読んで追記。
- **docs/MAP.md** に「まず開く」HTML 入口を追加(code-tree/feature-sitemap/repo-tree-map)。
- **status.html v0.1.827〜832**:
  - 「🗺️ コードの地図を開く」ボタン(v0.1.827)
  - popup を開くだけで popup診断を status へ自動集約(v0.1.828・popupDiagAutoPublish.js+test7本)
  - AI共有テキストに「📋 まるごとコピー」ボタン(v0.1.829・Ctrl+C 不要・失敗時は選択fallback)
  - 「🧭 はじめての方へ」みちしるべ(v0.1.830)→ 3キャラ笑顔追加(v0.1.831)→
    **公式LP(tsuioku-no-kirameki.com)と同じゆっくり吹き出し会話**に刷新(v0.1.832・y-row/speaker/bubble)。
- 生成は `npm run tree-map`(repo-tree-map.mjs)/ `npm run feature-map` / `npm run site-health`。
  **--check が verify:cc で腐り検知**(地図がコードとズレたら落ちる)。
- ⚠️ 学び(繰り返し踏んだ)= **新ファイル追加時は tree-map/site-health の件数 drift を必ず再生成して
  まとめて stage**(でないと push 後に tree-map:check / site-health:check が落ちて追いコミットになる。
  v0.1.829・feature-sitemap 追加で各1回踏んだ)。

## 設計の正本(参照先)

- 「popup を開く手間すら無くす」会議+裏取り = council/popup-less-diag-SYNTHESIS.md
  (結論=popup固有診断は popup 描画でしか生成されず offscreen/裏自動は誤診→不採用。開く操作は物理的に
  必要だが押下の手間は消した=v0.1.828)。
- 機能カテゴリ/キャラ解説/色 = scripts/repo-tree-map.mjs の FEATURE_CATEGORY/CATEGORY_CHARA_NOTE/CATEGORY_COLOR。

## 次セッションの最初の一手

1. **build:watch が動いている前提**で動く(読むだけの調査は競合しない。実装するなら先に止める)。
2. ユーザーの「コメント取れない」に対し、**status速報を受け取って実データで切り分け**
   (まだ未受領)。3配信以上ならスロット待ちをまず疑い「2配信以下に絞る」を案内→それでも駄目なら
   fastDiag(romiDebug.backfill / commentIngestBySource / ndgrConnectStatus 等)を読む。
3. 根本改善が要るなら backfill スロット(A 前面優先 / B 2→3)を実コード裏取り→会議→実装。
   そのとき build:watch を止めてから verify:cc。
