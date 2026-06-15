# 引継ぎ 2026-06-12 (v0.1.688〜702・SW移行+取得根治+声+顔+CWS準備)

> ブランチ: `feature/broadcaster-reputation-check`（全push済み・最新 4f95086e）。
> セッション詳細の正本: Claude メモリ `session_2026-06-11_sw_migration_pr1b.md`（追補1〜12）。

## このセッションでやり切ったこと（全部push済み）

| 版 | 内容 |
|---|---|
| 688-690 | SW移行基盤（タブ閉じても取得継続・staging・フラグ既定OFF） |
| 691-697 | **「一気に取れない」完全根治**（テールバッファ2000行クランプが黒幕・36%→100%実証・ユーザー実機で全配信ほぼ100%） |
| 698-699 | **VOICEVOX読み上げ**（人ごとに固定の声・約900通り・名前読みON/OFF既定OFF）実機発声確認済み |
| 700-702 | **匿名ゆっくり顔アバター**（anonymousIdenticonDataUrl 単一正本・髪=頭の外側シルエット・約5,184通り） |
| - | **CWS v0.1.701 申請準備完了**（ZIP生成済み・LP3節を本番反映済み・理由書2-8c=50021） |

## 残タスク（優先順）

### 1. 読み上げ「全部読んでくれない」強化 v0.1.703（会議済み・Codexブリーフ確定）

ユーザー実機で速い配信だとスキップ発生。**設計4本柱確定済み**:
①並行プリフェッチ（再生中に次を合成=スループット2倍・最重要）
②同文バースト集約（"8888"連打→「ほか○件」とまとめ読み・純関数mergeRepeatedVoiceItem+テスト）
③速度段階強化（0-2件:0/3-4:+0.15/5-7:+0.3/8+:+0.5）+キュー上限5→12
④渋滞時は本文60→40字。
→ codex-impl にこの4本柱をそのまま振る（対象: comeview-entry.js の drainVoiceQueue /
voiceReadQueue.js / voicevoxClient.js buildVoiceReadingText に opts.maxChars）。

### 2. 顔アバター完全再現（B案・ユーザーがパーツ生成中）

ユーザーが `memory/reference_avatar_parts_ai_generation_kit.md` のプロンプトで Gemini/ChatGPT から
髪8種+表情12種の透過PNGシートを生成して渡してくる予定。受領したら:
スプライト切り出し→`images/avatar-parts/`同梱→anonymousIdenticonDataUrl を canvas 合成版に
（hash→髪型×着色×目×口・toDataURLキャッシュ・非同期なので現行SVG版を即時フォールバックに残す二段構え）。

### 3. パネル2万件フリーズ（popup heavy・実害は低下したが未根治）

取得が100%入るようになった結果、2万件級でpopupがページごと固まる（「ページが応答しません」）。
再現レシピ&トレース手順は memory 追補9/9b に確立済み（実データcrawl→popup.html?inline=1&lv=…→
同一オリジンlocation.search遷移でトレース）。合成データでは再現しない（heavyDataPromiseの
発動条件に欠けキーあり=先に popup-entry 13600付近の条件を読む）。

### 4. SWモード既定ON昇格（最後の壁=SW並列度）

リトライ/keepalive/ペーシングは完了(694-695)。残=SWがglobal single-flightで巨大配信1本が
最大15分占有→per-lid並列(2本)化してから既定ON→その後PR1-c(visibility系削除)。
正本: memory/reference_backfill_sw_migration_pr1b.md

### 5. CWS提出（ユーザー操作待ち）

ZIP: `build/tsuioku-no-kirameki-0.1.701.zip`（検品済み: 50021維持・comeview/status.html同梱）。
⚠️ v0.1.702以降も出たので、提出直前に `python scripts/stage-submission.py <最新版>` で作り直し推奨。
説明文=docs/releases/cws-store-listing.md・新権限50021の理由=cws-submission-texts.md 2-8c。

## 体制（確立済み・コスパ確定）

- 司令塔=Claude Code（Fable 5・6/22まで定額・1Mコンテキスト）: 会議・検品・実機検証・commit/push
- 実装=codex-impl 経由 Codex CLI（comeview/marketing/放送系は縄張り）。**イラスト生成はコードLLM不向き
  →画像AI（Gemini/ChatGPT）**
- 実機検証=chrome-devtools-mcp（install_extension→storage直読み・status.htmlが診断の正本）
- Codexはcommit/push忘れがち→司令塔がdiff読み戻し→verify:cc→commit/push必須

## 罠メモ（今セッションで踏んだもの）

- content-entry.js は max-lines 17,297 ちょうど→追記時は古い歴史コメント圧縮で吸収
- changelog summary は35字以内（pre-pushで落ちる）
- テストブラウザ(chrome-devtools-mcp)は時々リセット/evaluateタイムアウト→ページ閉じ・reload・
  SWコンテキスト評価で回避。NHK実況は朝4時で番組ローテ（旧lvはサーバーが過去ログを返さなくなる）
- 一部配信はサーバー側がbackward 0バイト=どのツールでも取れない（diag bwd=Y+rows0で識別可）
