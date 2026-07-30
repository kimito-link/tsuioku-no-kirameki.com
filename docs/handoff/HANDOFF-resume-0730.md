# 引き継ぎメモ 2026-07-30(コンテキストウィンドウいっぱいのため中断)

## 全体状況(この時点で全てpush済み・作業ロス無し)

このセッションで3つの独立ブランチを並行して進めた。**3つとも対応するリモートブランチにpush済み**(`git log origin/<branch>..<branch>`が全て空)。

| ブランチ | 最新コミット | 内容 | ステータス |
|---|---|---|---|
| `feat/voice-lag-budget-shadow` | v0.1.1189 | 会場読み上げ体感遅延の3分解診断計器 | 完了・push済み(前セッションから継続) |
| `fix/venue-supporter-rank-hysteresis` | v0.1.1190 | 応援者ランキングのバンド量子化ヒステリシス | 完了・push済み |
| `feat/venue-avatar-hover-card` | **v0.1.1192** | 会場アイコンのホバープレビューカード | 完了・push済み(v0.1.1191実装後、v0.1.1192で追加修正) |
| `fix/gift-throw-cap-guard-diag` | v0.1.1191 | ギフト演出取りこぼし誤診断の解消 | 完了・push済み(現在のカレントブランチ) |

いずれも`npm run verify:cc`全通過・reality-checker PASS済み。**次にやることは実配信での目視確認**(反映3手順)のみで、コード作業は一区切りついている。

## 反映3手順(次チャットの最初にユーザーへ再確認)

```bash
git pull
```

その後: 拡張機能ページでリロード → 対象タブでF5(watch)。

**注意**: 上記4ブランチは全て別々のブランチなので、`git pull`だけでは今いるブランチの分しか更新されない。ユーザーが実機確認したいのがどのブランチの変更かによって、事前に`git checkout <branch>`が必要な場合がある。普段の運用がmasterへのマージ待ちなのか、各ブランチ単体でのcherry-pick運用なのかは前回までのセッション記録から要確認(このメモ作成時点では確認していない)。

## 各ブランチの詳細と正本ドキュメント

### 1. `fix/venue-supporter-rank-hysteresis`(v0.1.1190)

会場応援者ランキング(1〜3位バッジ)が序盤の少コメント帯で毎コメント入れ替わる問題。wayfinder→to-spec方式(1件目の実践)。

- 真因: `resolveVenueRegularScore`のlog1p正規化が低カウント域で急峻(count1→2で+58%)。
- 対策: 「バンド量子化ヒステリシス」(`stabilizeVenueSupporterOrder`、`src/lib/venueSeats.js`新規関数)。band降順→prevIndex昇順→score降順→count降順→key昇順の5段辞書式ソートキーで非推移comparator問題を回避。
- 正本: `venue-ranking-churn-MAP.md` / `venue-ranking-churn-SPEC.md` / `venue-ranking-churn-IMPLEMENTATION-HANDOFF.md`(リポ直下)
- メモリ: `venue_supporter_rank_churn_wayfinder_2026-07-30.md`
- 次: 実配信で序盤の少コメ帯を観察し、1位バッジが毎コメント交代しなくなっているか確認。

### 2. `feat/venue-avatar-hover-card`(v0.1.1191→v0.1.1192)

会場アイコンにホバーすると詳細プレビューカード(表示名/ID種別/発言数/ギフト/順位/サムネ状態診断)が出る新機能。wayfinder→to-spec方式(2件目の実践)。

- 発端: ユーザーが`recommend.shinobi.jp`を参考に「ホバーでサムネイルが出るものを実装したい」と要望。目的は(1)UX (2)サムネ有無の診断用途。
- 発見: 会場は既にネイティブ`title`属性でツールチップを出していた(表示名+UID)。今回は「拡張」であり「ゼロから作る」のではない。
- 実装: 新規lib`src/lib/venueHoverCard.js`(純ロジック)。venueBar.jsに委譲リスナー(seatsHost/topBarListの2個のみ)+シングルトンカード+WeakMap相乗り登録。`buildPersonTileEl`/`venueSeatEntryToLaneItem`/`laneMirror.js`は無変更(退化ガード厳守)。
- 設計判断: `profileTier`/`thumbScore`という既存診断スコアはカードに出さず、ホバー時点の実DOM(`img.complete`/`naturalWidth`)からサムネ状態を観測する方式を採用(鏡モードのデータがこれらのフィールドを持たないため=モード間drift回避)。
- **v0.1.1191実装後、ユーザーが実配信で実機確認し「この項目でいいのか」とフィードバック→council-fable 3段構えで表示項目を再設計→v0.1.1192で実装完了**(このやり取り自体は前回セッションで完結しており、今回のセッションの会話ログには残っていないが、コミットメッセージとメモリファイルから経緯を復元できた)。
  - 会議(groq 3体)の収束点=ID種別必須・技術診断情報の分離。対立点(生カウントvs定性表現)にFableが結論。
  - MVP-1: サムネ状態ラベルは既存🩺状態パネルが開いているときだけ表示(`diagMode`入力追加)。ID行はCSSで視覚的に格下げ(font-size 11px+DOM順末尾、文言は不変=UID全文は匿名の同一人物照合に必須)。
  - MVP-2: 新規純関数`formatVenueHoverRelativeTime`でlastAtから相対時刻(たった今/N分前等)を算出、statLineに埋め込み。30日超はfail-closedで空文字(過去の「56年前」誤表示事故の再発防止)。
  - 生カウント(発言数・ギフト件数)は維持、定性表現への変換は不採用(全員主役哲学との矛盾等)。
  - reality-checkerで検証済み(PASS、変異テスト2件)。
- 正本: `venue-avatar-hover-preview-MAP.md` / `venue-avatar-hover-preview-SPEC.md` / `venue-avatar-hover-preview-IMPLEMENTATION-HANDOFF.md` + `venue-hover-card-content-DESIGN.md` / `venue-hover-card-content-IMPLEMENTATION-HANDOFF.md`(いずれもリポ直下)
- メモリ: `venue_avatar_hover_preview_wayfinder_2026-07-30.md` + `venue_hover_card_content_design_2026-07-30.md`
- 次: v0.1.1192まで含めて実配信での目視確認(表示項目が意図通りか、🩺パネル連動が機能しているか)。

### 3. `fix/gift-throw-cap-guard-diag`(v0.1.1191・**現在のカレントブランチ**)

「ギフト演出3件欠落」(spawn_taskでチップ化されていた案件)の調査・修正。origin/masterから分岐(上記2つとは独立した系統)。

- 症状: 実配信状態速報で「検知24→演出21・⚠3件飛んでいない」表示。
- 真因: バグではなく、既存の性能ガード`canLaunchGiftThrow`(同時投擲上限`GIFT_THROW_MAX_CONCURRENT=8`)が正しく機能していただけ。理由を区別する内訳計器が無かった「診断の盲点」。
- 対策: `giftEffectDiag.js`の音側で既にあった設計パターン(`giftSoundGuarded`等を`diffCounts`の`soundExplained`引数で差し引く)を投擲側にも対称適用。新規`giftThrowCapGuarded`/`adThrowCapGuarded`カウンタ+`diffCounts`の`throwExplained`引数。
- `launchGiftThrow`(venueBar.js)の上限超過分岐で`proj.kind`を見てインクリメント。
- reality-checkerで変異テスト2件により実効性確認済み。
- 正本コード: `src/lib/giftEffectDiag.js`(純関数) / `src/extension/venueBar.js`(配線)。設計書は作成していない(小規模な診断計器追加のため直接実装)。
- メモリ: `gift_throw_cap_guard_diag_2026-07-30.md`
- 次: 実配信でギフトが集中する場面を観察し、「検知N→演出N-k」の差分が「上限超過N」として説明され⚠警告が出なくなっているか確認。
- **既知の残課題(スコープ外として先送り済み)**: 来場入賞演出(arrival)も`kind:'gift'`固定のため、上限超過時は`giftThrowCapGuarded`に混ざる。来場演出が多い配信で内訳の食い違いが出たら、この点を最初に疑うこと。専用の`arrivalThrowCapGuarded`は過剰実装と判断し見送った。

## その他の未着手・保留事項(このセッション中に発見・記録のみ)

- 記録二重計上疑い(`lv351067643`・dedupシード`maxIncrementalAddedCount=613`)とスクロール白化(host repaint)の2件が実配信の状態速報から新規発見・**未着手**。MEMORY.mdの該当行に記録済み。
- `voice-lag-decomposition-design-2026-07-28`の`lagVerdict`(coldsynth/synthslow/stall/playback/mixed等)の実配信実測はまだ確認していない。

## 運用上の注意(このセッションで踏んだ・確認した地雷)

1. **distファイル(app/dist/live-view.js, extension/dist/popup.js, extension/dist/status.js)は`npm run verify:cc`のpre-pushフックが走るたびにbuildIdタイムスタンプだけ変わる**。実害なし・追いかけてコミットする必要はない(無視してよい既知の差分)。
2. **`scripts/council-lineup.mjs`はこのセッション全体を通して無関係な既存差分**(Groqモデル`qwen3-32b`/`llama-4-scout`撤去、2026-07-23の別作業)。commit時は必ず明示列挙で除外すること。
3. **wayfinder→to-spec方式を2件実践**し、AGENTS.md §12.10に使い分け方針を追記済み(push済み、master直接コミット)。council-fableとの使い分け: 既存コードの真因調査が要る修正はwayfinder、ゼロから理想像発散はcouncil-fable。
4. reality-checker検証中はcommitしない(detached HEAD事故の教訓、[[reality-checker-stash-detaches-head-2026-07-07]])。今回も遵守。
5. 統合テスト/wiring testは必ず変異テスト(実装を一時的に壊す→テストが赤くなることを確認→復元)で実効性を検証してから出荷した([[integration-test-must-import-real-code]]の教訓の徹底)。

## 次のセッションで最初にやること

1. このファイルを読む。
2. `git log 1a6c9c15 -1`と`git show 1a6c9c15 --stat`で`feat/venue-avatar-hover-card`のv0.1.1192の内容を確認(司令塔が把握しきれていない部分)。
3. ユーザーに「どのブランチの実機確認から進めたいか」を確認(4ブランチとも独立して実機確認が必要)。
4. 反映3手順(pull→拡張リロード→watchタブF5)を案内し、状態速報のコピペを待つ。
