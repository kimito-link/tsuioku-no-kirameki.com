# 地図 — 計器を53→100個にする（2026-08-15 / v0.1.1402時点）

> 会議へ渡す**事実だけ**の地図。推測は「【推測】」と明示する。
> 実装前に会議の判定を通すこと（ユーザー指示「ちゃんと問題解決できる計器になるように」）。

## 0. ユーザーが決めた価値基準（これが合否）

> 計器の価値は「**真因に導いたか**」だけ。読んでも直せないなら測定値が低い・**誤誘導なら負**。
> 出典: memory `instrument-value-is-measured-by-fixes-2026-08-12`

追加の掟（`buriedInstrumentCells.js` の JSDoc が正本）:
1. 防御が効いた回数は異常にしない（多いほど良い数字）
2. 仕様上そうなるものを異常にしない（匿名にサムネは無い等）
3. 一部見送りは正常。全部見送られたときだけ警告
4. 症状の言葉で名付ける
5. ★v1401: 「使っていない0」と「動くはずなのに0」を区別する。後者は ⚪ で必ず出す

## 1. 現在地（実測・2026-08-15 v0.1.1402）

```
registry 登録セル : 53個   ← 引き継ぎの「54」は誤り（実測53）
表示枠            : 14個
目標              : 100個（ユーザー「厳密」と明言）＝ 残り47個
```

## 2. ★在庫の性質（調査で判明・想定と違った）

**「計器が足りない」のではなく「既存計器が2〜3割しか読まれていない」**。
14個のセルが、6〜20フィールド持つ観測から2〜3個しか読んでいない。
＝ 100個化は**新規観測の作成ではなく既存プローブの分解**で大半が届く。

実例（すべてソース確認済み）:

| プローブ | 現セルが読む | 未使用フィールド |
|---|---|---|
| `laneTickProbe` | ticks/runs/lastReason | `noContext, docHidden, deferHeavy, lidMiss, lidFromInline, lidFromSnapshot, lidFromLastPainted, lastLid, lastRunAgoMs` |
| `mainThreadBlocker` | count/worstMs/worstName | `byName{}, totalMs, afterResumeMs, afterResumeCount, samples[]` |
| `laneRosterDelta` | droppedTotal/everSeenMax | `droppedEventCount, maxDroppedAtOnce, cappedOutTotal, addedTotal, droppedSamples[]` |
| `laneTileOscillation` | samples/drops | `reversals, maxTiles, minTiles, amplitude, worstDrop, worstDropOrigin, monotonicGrowth, originsSeen[]` |
| `giftEffectDiag` | detect/thrown/sound | `giftSoundCoalesced, giftSoundGuarded, giftSoundNoPath, giftSoundError, arrival*(4), throwPointFallbackUsed, *CapGuarded(2)` |
| `voiceDiag` | 数個 | `lagVerdict, synthFailReasons{}, audioBlockedTotal, lastEnableFailReason, enableFailTotal, synthNullTotal, dropCountGateTotal...(30+)` |
| `commentPostDiag` | attempts/ok/fail/timeout | `lastEchoMs, avgEchoMs, lastOptimisticPaintMs, avgOptimisticPaintMs, instantPaintRuns, revertCount, totalRetryAttempts` |

## 3. ★配線の事実（v1390の事故を繰り返さないため）

`renderHealthCells` に渡される入力は `status-entry.js:1986-2005` が正本。
**現在渡っていない**が `_extrasCache`（12秒間引き・既読）にあるもの:

```
customSoundDiag / opSoundEffectDiag / voiceEffectDiag /
channelSwitchDiag / scoreAnnounceDiag / bgmPhaseDiag / highlightLedger
```
＝ これらをセル化するには **1986行の payload に足す**必要がある。
　storage 読み取りは増えない（既に読んでいる）。

diff-skip 署名（`status-entry.js:2284`）は
`cells.map(c => label:level:text)` を含む＝**新セルは自動的に署名に入る**。
（v1388 で踏んだ「署名に入れ忘れて画面に出ない」穴は、セル追加については無い）

## 4. ★安全網（v1402 で修理済み）

`instrumentCoverage.test.js` = 「登録＝表示」ゲート。
v1401 の固定テーブル化で**恒真化していた**のを v1402 で修理。
変異3種で赤を確認済み:
- 枠から削除 → 赤
- **実セルを落とす → 赤**（修理前は素通りだった）
- 未登録idを枠に書く → 赤

## 5. 会議に判定してほしいこと

### Q1. 47個のうち「読んでも直せない」ものはどれか（最重要）
候補の中に、開発者にしか意味が無いものが混ざっている:
- `mirrorIntakeDiag.rejectedByGate` / `liveIdAlignedWithUrl` / `sidepanelSelfDiag`
- `laneSupplyOrigin.byOrigin{}`（供給元の内訳）
ユーザーは「厳密に100」と明言。**数合わせで負の計器を入れる危険**をどう避けるか。

### Q2. 分解した計器は「症状」を名指しできるか
`laneTickProbe.docHidden` を「裏タブだから描かなかった」と出したとして、
ユーザーは何をすればいいのか。**次の一手が書けない計器は入れない**べきか。

### Q3. 100個は「1画面に100個」でいいのか
14枠→17枠に100セル。ユーザーの元の不満は
「項目が消えて位置がずれる・探し直しになる」だった（v1401で固定テーブル化）。
100個並べたとき**探せるのか**。枠の畳み方・異常の集約は今のままでいいか。

### Q4. 無音で死ぬ計器を優先すべきか
`customSoundDiag.dbAvailable=false` = カスタム音源が全部死んでいるのに画面は無言。
`voiceDiag.audioBlockedTotal / lastEnableFailReason` = 読み上げが始まらない理由。
これらは「数」ではなく「価値」で先に出すべきか。

## 6. 実装手順（確立済み・4ステップ）

1. `src/lib/buriedInstrumentCells.js` に判定を足す（純関数）
2. `src/lib/diagnosisRegistry.js` に `reg(id, label, category, 1, false)`
3. `src/lib/healthCellGroups.js` の枠の `cellIds` に足す
4. `src/lib/instrumentCoverage.test.js` の fixture に**入力を足す**

★4を忘れるとゲートが赤くなる（それがゲートの役割）。

## 7. 地雷

- `popup-entry.js` は max-lines 上限に張り付き（lib 側に置く）
- 新規ファイルを足したら `tree-map` / `site-health` / `feature-map` 再生成
- JSDoc の `@param` に ★(U+2605) を書くと typecheck が落ちる
- dist は日本語が `\uXXXX`（自作デコーダを信じない）
- `scripts/meeting.mjs` は**ユーザーのファイル**（861行 / md5 848326fe…）。触らない
