# 実装指示: パチンコ演出の完全削除（tsuioku-no-kirameki 拡張）

## ゴール
パチンコ演出（リーチ/フィーバーの点滅・BGM・ボイス・フェーズ計算・診断）を **完全削除** する。
ユーザー要望「ぜんぶ消していい」。共有基盤（celebrationPika・effectSoundPlayer本体・comeview読み上げ）は **残す**。

## 絶対に守る制約
- ★以下は **触るな・残せ**: `src/lib/celebrationPika.js`(ミルストーン演出基盤・名前に反しパチンコ専用でない)、`src/lib/voiceDiagKey.js`(nls_voice_diag_v1=comeview読み上げ診断。voiceEffectDiagKey.js の nls_voice_effect_diag_v1 とは **別物**)、`src/lib/effectSoundPlayer.js` の gift/ad/rank/milestone 系。
- ★ギフト効果音本体は残す。パチンコの食い込みだけ外す。
- ★各ステップ後に `npm run build` が通る中間状態を保つ（lib を先に消すと import エラー→呼び出し側を先に外す）。

## 削除順序（この順で）

### Step A: 呼び出し側（副作用ランタイム）からパチンコを外す
1. `src/extension/venueBar.js`:
   - import: `phaseDirector.js` / `bgmDirector.js` / `bgmPhaseDiag.js` / `bgmPhaseDiagKey.js` / `voiceEffectDiag.js`(あれば) の import 行を削除（`effectDirector.js` と `highlightLedger.js` の import は残す。voiceDirector は下記で判断）。
   - Phase C 本体ブロック（advancePhaseDirector / tickReachBgm / startFeverBgm / endFeverBgm / paintPhaseMeterDom / triggerPhaseMeterPulseDom / bgmPhaseTickTimer 等・概ね 3701-4021）を削除。
   - CSS ブロック `.nlsb-phase-meter*` と `@keyframes nlsb-phase-meter-blink`（概ね 1130-1161）を削除。
   - フェーズメーターの DOM 生成（概ね 2539-2543）を削除。
   - ★食い込み(1): ギフトコンボ処理内（概ね 3625-3628）の `tryPlayVoice('voice_kamitsumi')` と `scheduleJackpotVoiceChain()` の **呼び出しだけ** 削除（ギフト効果音の残りは残す）。
   - ★食い込み(3): highlightLedger への phase_reach/phase_breakthrough/phase_jackpot 書き込み（概ね 3893-3898）を削除。
2. `src/extension/popup-entry.js`:
   - import（概ね 281-318, 416-419）の phaseDirector/bgmDirector/bgmPhaseDiag系/voiceEffectDiag系を削除。
   - Phase C 本体（advancePhaseDirectorPopup / paintPhaseMeterPopup / tickReachBgmPopup / startFeverBgmPopup / 突破チェーン / ジャックポットチェーン・概ね 1482-1808）を削除。
   - ★食い込み(1): 概ね 2712 の scheduleJackpotVoiceChain 等パチンコボイス呼び出しを削除。
   - phase_* の appendHighlight 書き込みを削除。
3. `extension/popup.html`:
   - `@keyframes nl-phase-meter-blink` と `.nl-phase-meter*` CSS（概ね 659-693）削除。
   - `#nlPhaseMeter` の DOM（概ね 10720）削除。

### Step B: 診断セル bgm-phase を4ファイル同時削除（片方だけだと instrumentCoverage.test.js が赤）
- `src/lib/diagnosisRegistry.js:213` の `reg('bgm-phase', ...)` 行を削除。
- `src/lib/healthCellGroups.js:196` の「演出・効果音」枠 cellIds から `'bgm-phase'` を削除。
- `src/lib/finalDetailCells.js:142-153` の `bgm-phase` 判定ブロック削除（:149 の phase==='fever' 到達不能分岐も一緒に消える）。
- `src/lib/finalDetailCells.test.js` の対応アサーション削除。

### Step C: 速報行を外す
- `src/extension/status-entry.js`: import（概ね 141-146）の bgmPhaseDiag/voiceEffectDiag を削除。速報出力（1891 voiceEffectDiag / 1898 bgmPhaseDiag）の呼び出し削除。storage read（1456）の該当キー削除。
- ★食い込み(2): status-entry.js:2334 の `phaseStats: bgmPhaseDiag` を `phaseStats: null` に変更（broadcastScore.js:148 が null で bonus=0 に縮退する設計なので採点は壊れない）。

### Step D: 食い込み(4) reach 音源
- ユーザーは「ぜんぶ消していい」なので reach も消す。`src/lib/effectSoundPlayer.js:67` の reach 音源直書き（sound/tiers/reach-*.mp3）を削除。
- それを検証している `src/lib/customSoundPreset.test.js:82` 付近と `src/lib/effectSoundPlayer.test.js:103` 付近のテストから reach 検証を削除。
- `src/lib/customSoundPreset.js:84-165` のパチンコ音源プリセット（breakthrough/payout/hold_lamp/voice_*×7/bgm_*×4）を削除。

### Step E: highlightLedger の phase_* 種別定義を外す
- `src/lib/highlightLedger.js:31-33` と `:107-113` の phase_reach/phase_breakthrough/phase_jackpot を「ハイライト種別」定義から削除（gift_large/milestone_hard 等は残す）。
- `highlightLedger.js:4-9` の avCue/パチンコ言及コメントを整理（avCue は既に削除済み）。

### Step F: lib 本体削除（呼び出しが全部消えた後）
- `git rm` する: `src/lib/phaseDirector.js` `src/lib/bgmDirector.js` `src/lib/voiceDirector.js` `src/lib/bgmPhaseDiag.js` `src/lib/bgmPhaseDiagKey.js` `src/lib/voiceEffectDiag.js` `src/lib/voiceEffectDiagKey.js` と各 `*.test.js`。
- ★voiceDirector は startFeverBgm から呼ばれる voice_stage 等があったので、Step A で呼び出しが全部消えたことを確認してから削除。

### Step G: storageキー
- `src/lib/storageKeys.js:615,624,626`（nls_bgm_enabled_v1 / nls_bgm_volume_reach_v1 / nls_bgm_volume_fever_v1）と nls_bgm_phase_diag_v1 / nls_voice_effect_diag_v1 の定義を削除。

## 完了条件（各Step後・特に最後）
- `npm run build` が通る。
- `npm run test:cc`（vitest）が緑（削除したテストの残骸で赤くならない・import エラーが無い）。
- `npm run lint` 緑（未使用 import が残らない）。
- パチンコを grep して残骸（phaseDirector/bgmDirector/PHASE.REACH/nlsb-phase-meter/nls_bgm_phase 等）が src/ extension/ に残っていないこと（コメントの歴史的言及は可）。

## 報告してほしいこと
- 各Stepで何を削除したか（ファイル:行）。
- build/test/lint の結果。
- 判断に迷った箇所（食い込みの外し方で不明な点）。
- ★勝手にパチンコ以外を消さない・celebrationPika/voiceDiagKey/effectSoundPlayer基盤を触らない。
