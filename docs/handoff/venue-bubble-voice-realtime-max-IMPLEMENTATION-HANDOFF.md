# 実装ハンドオフ: 会場「吹き出し×読み上げ」リアルタイム最大化(MVP=段階0 shadow)

> 設計正本: `venue-bubble-voice-realtime-max-DESIGN.md`(同ディレクトリ)。このハンドオフ1枚で着手できる粒度にまとめてある。
> 実装は**別モデル/次チャット**で行う想定。このセッションでは実装しない。

## スコープ(MVP=設計書E章のみ)

**段階0(shadow計測)だけを実装する。適用(段階1)はしない。**

1. `src/lib/voiceLagBudget.js`新設(純関数+同居テスト)
2. `voicePlayer.js`へのshadow配線(計算するが`max`は8固定のまま=実際のキュー動作は変えない)
3. 新diagフィールド4つ(`serviceTimeEmaMs` / `effectiveQueueMax` / `rateClampTotal` / `voicedRatio`)をstatusFastDiagLiteまでpassthrough
4. `venueBubbleChurn.js`に「消滅時のvoiceState分布」(voiced/unvoiced別カウント)フィールドを1つ追加(設計書D-3)

**やらないこと**: 実効上限を実際にキューへ適用すること(段階1)、吹き出し寿命ロジックの変更(設計書C-4により対象外)、時間ゲート(`voiceAgeGate.js`)・信号橋(`onAudioStart/onAudioEnd/onDropped`)の変更。

## 読む順

1. `venue-bubble-voice-realtime-max-DESIGN.md`(このハンドオフの元設計。特にC章の数値・D章の偽陽性対処・G章の地雷)
2. `src/lib/voicePlayer.js`(現状の`diag`オブジェクトと`_drainQueue`/`enqueue`の実装)
3. `src/lib/voiceReadQueue.js`(`pushVoiceQueue`のシグネチャ、`{ max }`オプションの扱い)
4. `src/lib/venueBubbleChurn.js`(既存の計器パターン。`createVenueBubbleChurnState`/`observeXxx`/`toXxxDiag`の型を踏襲する)
5. `src/lib/venueYukkuriNamedCensus.js`または`storyUserLaneClickAffordanceParity.js`(直近セッションで実装した「観測のみ・checked=0は⚪」の計器パターンの手本)

## 着手手順

1. ブランチ作成: `feat/voice-lag-budget-shadow`(現在のブランチ`feat/avatar-stability-mvp`から分岐、または最新masterから)
2. TDD: `src/lib/voiceLagBudget.js`を**先にテストから**書く。設計書C-1のシグネチャ通り3関数(`updateVoiceServiceTimeEma` / `resolveVoiceQueueMax` / `stepVoiceQueueMax`)。
   - `VOICE_LAG_BUDGET_MS(6000) < VOICE_STALE_MS_NORMAL(8000)`(`voiceAgeGate.js`からimportして比較)を**テストで断言**すること(地雷G-1)。
   - ヒステリシス(縮小即時・復帰5件連続)が往復しないことをテストで確認(地雷G-2)。
3. `voicePlayer.js`に3点だけ配線(設計書C-2)。**pushVoiceQueueのmax引数は変更しない**(shadowなので`{ max: 8 }`のまま。`effectiveQueueMax`はdiagに載せるだけ)。
4. `venueBubbleChurn.js`にvoiced/unvoiced分布フィールドを追加(既存の`observeVenueBubbleSpawn`等と同じ関数分割パターンを踏襲)。
5. `aiShareFullText.js`および`statusFastDiagLite.js`双方に新フィールドをpassthrough([[fastdiag-lite-is-the-printer-subset]]の教訓通り、fullだけでは表示されない)。
6. `npm run verify:cc`(test+lint+typecheck+build+tracked-imports+tree-map+site-health+feature-map+verify:bump)を通す。
7. AGENTS.md §12.5に従いpatchバージョンを1つ上げる(package.json/extension/manifest.json/src/lib/changelog.js の3点セット)。
8. reality-checkerエージェントで検証(配線漏れ・passthrough漏れ・全数保存則)。

## 機械的な完了判定チェックリスト

- [ ] `npx vitest run src/lib/voiceLagBudget.test.js` が緑(新規テストファイル)
- [ ] `grep -n "VOICE_LAG_BUDGET_MS" src/lib/voiceLagBudget.test.js` に `VOICE_STALE_MS_NORMAL` との比較アサーションが存在する
- [ ] `grep -n "serviceTimeEmaMs\|effectiveQueueMax\|rateClampTotal\|voicedRatio" src/lib/voicePlayer.js` が4フィールドとも1件以上ヒットする
- [ ] `grep -rn "serviceTimeEmaMs" src/lib/statusFastDiagLite.js` がヒットする(lite側にpassthroughされている証拠)
- [ ] `grep -n "voiced\|unvoiced" src/lib/venueBubbleChurn.js` に新フィールド分の言及がある
- [ ] `npm run verify:cc` が全ステップOKで終了する
- [ ] `git status --short` で新規ファイル(`voiceLagBudget.js`, `voiceLagBudget.test.js`)が`A`(staged)になっている
- [ ] version bump 3点セット(package.json / extension/manifest.json / src/lib/changelog.js)が同一バージョンで一致する

## 地雷(再掲・要確認)

設計書G章を参照。特に重要な2点:
- 縮小で溢れたキュー超過分は**既存のdroppedループ**(`onPlayStart`+`_notifyDropped`)を必ず通すこと。新しい破棄経路を作らない。
- `serviceTime`のサンプルは`Date.now()`同士の差分のみ。`performance.now()`と混用しない(v1044型のクロック取り違え地雷)。

## 次チャットへの引き継ぎメッセージ例

> `venue-bubble-voice-realtime-max-IMPLEMENTATION-HANDOFF.md`を読んで、段階0(shadow計測)のMVPを実装してください。ブランチを切ってTDDで進め、機械的な完了判定チェックリストを全て満たしたらreality-checkerで検証してください。
