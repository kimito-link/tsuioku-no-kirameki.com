# 会議 統合結論 — UIUX の体験価値を上げる

> お題: 「UIUXの体験価値があがるように」/ 会議: `node scripts/meeting.mjs`(COUNCIL_QUALITY=1・design ルーティング)
> メンバー: groq/qwen3-32b(批判) / local/gemma4(統括lead) / groq/llama-3.3-70b(速い視点) / groq/gpt-oss-120b(批判2)
> 司令塔(Claude/Opus)が統合・**実コードで裏取り**して1案に収束。生データ: `council/uiux-answers.json`

## 会議が収束した方向(結論)

4体の議論は最終的に **「応援者を讃える=表彰体験の強化」** に収束した。統括leadの統合は
「スポットライト演出(ハイライト)」、批判役は「貢献度サマリー/応援者視点の可視化」を推した。
共通の評価軸は **「派手な演出より、迷い・不安・取り違えを減らす誠実さと行動誘発」**(お題の制約どおり)。

## 司令塔の裏取り(ローカルモデルの誤りを除去)

会議の有力2案は **既に実装済みの機能と重複** していた:
- 「貢献度サマリー/応援者ランキング」→ 既に `buildSupporterExpander`(status の「🏆 応援者ランキングを見る」)
  と `reportPreview.topSupporters` / `supporterRanking.js` が在る。
- 「スポットライト/ハイライト演出」→ 既に `celebrationFlyText` / `celebrationPika` /
  `celebrationCommentIncrementalScan` 等の celebration 群が在る。
- gpt-oss の「tippy.js を 5KB 導入」→ **依存ゼロ方針に違反**(package.json に外部UIライブラリ無し)。不採用。
- 「storage read を増やす」系(ツールチップで都度 read 等)→ 軽さ最優先に反する。不採用。

→ 会議の「表彰を強化」という**方向は正しい**が、具体案は既存機能と被る。
**真に欠けているのは「既存の応援者ランキングが製品自身のルールを破っている」点**だった。

## 確定した1案(小さく・安全・既存ルール違反の是正)

### 結論
status の「🏆 応援者ランキングを見る」展開を、**名前+件数だけの行**から
**本物の人物タイル(サムネ・ID・ハンドル名・リンクのセット)** に差し替える。

### 根拠(製品文脈に即す)
- AGENTS.md §3.5 の絶対ルール=「人が画面に出る場所ではサムネ・ID・ハンドル・リンクをセットで出す。
  ID だけ・名前だけ・頭文字アイコンだけは原則違反」。**現状の応援者ランキングはこれを破っている**
  (名前+件数のみ)。会議が推す「応援者を主役として讃える」は、まさにこのセット表示で実現される。
- 匿名(`a:`)も「匿名NNN+identicon」で識別できる形にする(§3.5・一律グレー化禁止)。
- データは既に揃っている: `SupporterRow` が `{rank,userId,name,avatarUrl,count,isAnonymous}` を持つ
  (`supporterRanking.js`)。**新たな storage read は不要**(reportPreview に同梱済み)。

### 反論・リスク(自己申告)
- storage read 増: **無し**(topSupporters は既に reportPreview に入っている既存データを使うだけ)。
- 速度低下: 上位 10 行だけ。本物の人物タイル描画関数(`buildPersonTileEl`/`personTileDom.js`)は
  popup/会場/応援ライブビューで実証済み=似せて自作しない。画像は `loading=lazy` 既存。影響軽微。
- 世界観崩れ: 既存の暖色パステル token を使う=崩れない。
- ブラスト半径: status-entry.js の `buildSupporterExpander` 1関数 + 既存 lib の再利用のみ。会場/popup/
  純Web には触れない(§Danger Map 外)。
- 「似せて自作」化: **回避**。本物の `buildPersonTileEl` を import して使う(独自タイルを作らない)。

### 具体案(触る画面・最小ステップ・検証)
- **触る画面**: status.html の「🏆 応援者ランキングを見る」展開(`buildSupporterExpander`)。
- **最小ステップ**:
  1. `SupporterRow` → 人物タイルの入力形(displaySrc/title/idLine/nameLine/userId)へ変換する純関数を
     `src/lib/` に作る(テスト付き)。avatar は数値uid→公式サムネ導出(`deriveNicoUserIconUrl` 系)・
     匿名は identicon にフォールバック(既存 util 再利用)。
  2. `buildSupporterExpander` の行描画を、本物 `buildPersonTileEl`(`personTileDom.js`)+ 順位バッジ
     (🥇🥈🥉/4.)で組み直す。数値uid には `https://www.nicovideo.jp/user/<uid>` リンクを付ける(§3.5)。
  3. CSS は status の既存 token(--nl-*)のみ。新規 read 無し。
- **検証**: vitest(変換純関数の特性テスト+ネガコン)→ verify:cc 全8緑 → Claude-in-Chrome で status を開き
  「ランキングにサムネ+ID+名前+リンクが出る/匿名は匿名NNN+identicon」を実機目視。

## 不採用にしたが将来候補(提案に留める)
- 「最新ステータスサマリー(過去N分の3キャラ別カウント)」(lead 次点): 既存の健全度パネル/数字カードと
  役割が近く、storage read/集計の置き場を誤ると重くなる。今は見送り(別途会議)。
- 「ベストシーン・タイムスタンプのハイライトカード」(lead 第三案): 価値はあるが新規生成で実装大。別タスク。

---
*会議: 2026-06-25 / 統合: Claude Opus(実コード裏取り済み)*
