# 引き継ぎ: 2026-07-03 セッション（会場統一・全員表示・backfill・その他）

_司令塔Claude(Opus 4.8) → 次チャットへ。このセッションは長くなったので新チャットで継続。まずこの1枚を読む。_

## ⚠️ 最初に判断が要る：未コミットの変更がある
- ブランチ: `feat/mirror-bundle-phase1`（直前コミット d57302f8 = v0.1.1046）
- **未コミット**: 会場3段統一（Codex実装 + Claudeのchangelog修正）。version は既に 0.1.1047 に bump 済み。
  - 変更: src/extension/{popup-entry,status-entry,venueBar,story/renderStoryUserLaneDom}.js + そのtest + changelog/manifest/package
  - 新規(未追跡): src/lib/{venueLaneBuckets,storyUserLaneSort}.js + それぞれの .test.js
- この変更の状態: **churn無し・重さ無し・テスト119件green・typecheck/lintクリーン**（今日の実機状態速報で確認: 更新所要7ms・heavyRaceReturns:0・段別再描画りんく0/たぬ姉2）。
- **ただし会場だけ全員(数百)出て「多すぎる」**とユーザーが感じた（応援レーンは48で絞っていたため。下記の全員表示タスクで解消予定）。
- **「0件バグ」は今は再現していない**（ユーザーが見た時は popup診断が22分前の古い状態だった疑い。要再確認だが緊急でない）。

### 未コミット変更の扱い（新チャットの最初の判断）
推奨: この会場3段統一を先にコミット→push して固定（動く状態を確定）。その上で下記の「全員表示」を Phase0 から実装。混ぜてコミットすると切り分け不能になる。
- コミット前チェック: `npm run verify:cc`（最後の feature-map だけ利用枠制限で落ちる既知事象・それ以外は通る）/ typecheck / verify:bump 三者一致(0.1.1047)。
- Codex の changelog は元々「ギフト/広告段もある」と嘘だったので Claude が「3段のみ・ギフト/広告は次版」に修正済み。

## このセッションで完了・反映済み（コミット済み・触らなくてよい）
1. **会場座席「56年前」表示バグ** = v0.1.1044（commit 9e9d50ee）: performance.now(相対)を storage経由でDate.now(epoch)と引き算したクロック取り違え。修正済み・反映済み。→ [[venue-seats-lastupdate-clock-mismatch-v1044]]
2. **backfill走行中スループット計器(段1)** = v0.1.1045（commit 3c447c51）: KEY_BACKFILL_LIVE_METRIC 別キーで「⏱ 取得速度(走行中)」を出す。→ [HANDOFF-backfill-instant-restore.md]・[[backfill-instant-fetch-regression-v946]]
3. **大配信で状態速報が固まる修正** = v0.1.1046（commit d57302f8）: 計器readを毎回直列からextras(12秒間引き)へ。Claudeのミスを修正。→ [[status-extras-read-not-core-read]]

## 残タスク（設計完了・実装待ち）優先度順

### タスクA: 会場3段統一の確定（未コミット→コミット）
上記「未コミット変更の扱い」の通り。まずこれを固定。設計正本=[HANDOFF-venue-equals-lane.md]。

### タスクB: 応援レーン/会場を「全参加者表示」に ★ユーザーの現在の主目的
- 設計正本=[HANDOFF-show-all-participants.md]（Fable設計完了）。
- 核心: 全員表示は思ったより軽い（Fableが実コード裏取り）。候補組み立ては既に全件走査・diff-skipは全員で効く・48の根拠は不文律。
- Phase0(計器paint ms) → Phase1(48→200+INLINEスクロール枠・実機でlaneRepaintCounts収束を機械判定) → Phase2(500=VENUE_FULLSCREEN_MAX_SEATS共有・churn出たらキー付き再利用) → Phase3(鏡cap任意)。
- ロールバック=limit数値1つ戻すだけ。地雷=ちらつき7版の diff-skip機構は触らない。
- ★タスクA(会場3段)の上に乗る。両方の完成形=3表示とも全参加者を同じ段組みで表示。

### タスクC: backfill退行の本修正(段2)
- 設計正本=[HANDOFF-backfill-instant-restore.md]。段1計器は反映済み。
- 次=実機で「⏱ 取得速度(走行中)」を大きめ配信の途中参加で見て、fg=1 かつ bridgingSteps≥dataSegs×0.7 等でyield bridgingが律速と確定→段2(segmentsSinceYield実データのみ加算+FORCE_YIELD_MS=2000)。fg=0なら裏タブペースへ分岐。

### タスクD: 公式ランキング取り込み構想（調査済・未着手）
- ユーザー「公式値をそのまま取り込めばズレない・将来ちくらん型を作りたい」。
- 調査結論: 貢献度(koken API)/広告(nicoad API)/番組pt(NDGR) は既に公式値を直取りしていてズレない(半分実現済)。複数配信横断ランキング(ちくらん型)は拡張単体では不可=独自集計サーバー要。
- 未着手。ユーザーは「両方(短期=数字を公式に寄せる/長期=ちくらん型)」希望。

## 進め方のルール（このセッションで確立した型）
- 会場/応援レーンは超神経質。推測で叩かず「調査→会議(COUNCIL-HOWTO.md)→Fable設計→実装(別モデル)」の流れ。Fableは実コード裏取りで推測を潰すので設計に必須。
- 実装は Codex等に投げる時、設計全文を貼らず HANDOFF を読ませる。INVARIANTS(venueSeats.js不触・buildPersonTileEl凍結・後方互換)を明示。verify:cc/typecheck 指定。
- 反映3手順: push だけでは Chrome に届かない。`npm run copy:ext` で C:\nicolive-ext へ→拡張リロード→watch F5。[[extension-reflected-only-after-copy-ext]]
- 見た目の確認はユーザー実機が要る(状態速報コピペで数値は取れるが並び/レイアウトは目視)。

## メモリ索引（このセッションで追加/更新）
- backfill-instant-fetch-regression-v946 / status-extras-read-not-core-read / venue-seats-lastupdate-clock-mismatch-v1044 / venue-equals-lane-same-layout
- 既存の重要: story-userlane-churn-filllanetier-v1039 / mirrors-written-per-key-per-tick-root-of-parity-lie / feedback-trust-status-report-over-browser-check
