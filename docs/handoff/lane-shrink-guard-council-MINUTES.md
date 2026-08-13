# 議事録 — 応援レーン「94→89(5枚減)」の判定 2026-08-13

> 会議 = Fable(主査) + 反証専門(2本並行) / 材料 = [lane-shrink-guard-council-MATERIAL.md](lane-shrink-guard-council-MATERIAL.md)
> ★結論: **レーンのバグではない。触らない。** 直すとしたら計器の表示だけ(単独版は出さない)。

---

## 0. 結論

**94→89 は「鏡フォールバックが描いた古い94枚」を「heavy が算出した正しい89枚」で置き換えた瞬間。**
＝**5人は消えていない。ガードは設計どおり正しく動いた。fail-open 7件目ではない。**

| | 主張 | 判定 |
|---|---|---|
| 司令塔(私) | 計器のバグ(94はmirrorCells) | ❌ **誤り**。94は実DOM実測(popup-entry.js:7063) |
| 反証役 | 5枚は実際に消えた・課金者かも | ❌ **誤り**。消えたのは鏡の古い値 |
| 主査(Fable) | 鏡→heavy の引き継ぎ差 | ✅ **正解** |

## 1. 証明(実コードのみ・実機データ不要)

1. **系列に積むのは heavy paint だけ**
   `pushLaneTileSample` の呼び出しは**リポ全体で1箇所**(`popup-entry.js:7059`)。
   鏡経路(`applyLaneMirrorForPassive` / `applyLaneMirrorForMainPopupFallback`)は積まない。
2. **`samples:1` ＝ heavy が実 paint したのは1回だけ**
   もし heavy が過去に94枚を描いていたら系列に94が残るはず。残っていない。
   ＝**94枚を描いたのは heavy ではない**。
3. **light も描いていない**
   速報自身が証言: `軽い供給の上書き 🛡 18回見送り`(一度も描いていない)。
4. **残るのは鏡フォールバックだけ**
   `applyLaneMirrorForMainPopupFallback`(7287)は
   **「DOMが空のときだけ」**描く(7296行 `if (countStoryUserLaneDomTiles(els) > 0) return;`)。
   そして `mirrorCells: totalCells` を記録(7325付近)＝実機の `mirrorCells:94` はこれ。
5. **`worstDropFrom:94` が系列に無いのに出る理由**
   `laneTileOscillation.js:168-180`(v0.1.1357)が
   **「実DOM起点の観測を系列より優先して合流させる」**意図的設計。
   ＝見かけの矛盾は**表示上の副作用**であってデータ破損ではない。

### 起きていたことの時系列

```
① パネル起動 → DOM 空 → 鏡が94枚描く(前回の蓄積スナップショット)
② heavy が読み終わる → 本物の89枚を算出
③ ガードが「確定供給(provisional=false)だから通す」→ 94→89 に置換 ← ★正しい動作
```

★`shouldKeepStoryUserLaneTilesOnShrink` の1行目 return は
**「永久 stale を作らない」保険が正しく効いた姿**。ここを塞ぐと
**鏡の古い5枚が残り続ける＝退化**する。

## 2. 「消えた人0人」が矛盾しない理由(反証役の指摘・実コードで確認)

名簿には**見る器官が3つ欠けている**:

| # | 盲点 | 実コード |
|---|---|---|
| 1 | gift/ad 段を数えない | `noteLaneRoster` は 6975行。`buckets.gift`/`ad` 代入は 6981/6986＝**後** |
| 2 | 匿名(userId無し)を数えない | `laneUserIdSet`(laneRosterDelta.js:50) `if (uid) out.add(uid);` |
| 3 | paint前に計測 | 6975行は描画判断(7046-7064)の**87行手前** |

★さらに決定的: **名簿は鏡が描いた94枚を一度も見ていない**(鏡経路では呼ばれない)。
＝`droppedTotal=0` は「5枚差に人が含まれない」ことを証明も否定もしていない(**観測範囲外**)。

## 3. 決定事項

1. **レーン本体・ガード・diff-skip: 一切触らない**(fail-open 7件目ではない)
2. **単独の新版は出さない**。9版直後で実害ゼロ
3. 直すなら**計器の表示1点だけ**(下記)。次に出る版に**相乗り**させる

### 計器を直すなら(骨子・今は実装しない)

「前の DOM を**誰が描いたか**」を縮小記録に載せ、判定をコードに焼く:

```js
_lanePainterLast = 'mirror';  // 鏡2経路の paint 直後
_lanePainterLast = 'heavy';   // heavy paint 直後
// 7063: noteLaneSupplyShrink(..., { prevPainter: _lanePainterLast })
//   prevPainter==='mirror' → ⚪「鏡→本読みの引き継ぎ差」(🔴にしない)
//   prevPainter==='heavy' && provisional=0 の縮小 → 従来どおり🔴(58→17級の本物を残す)
```

★`laneSupplyOriginDiag.js:170` の「← 確定を名乗ったため縮小ガードが素通り」は
heavy が本当に settled のとき**冤罪の名指し**になるので、mirror 由来では出さない。

**合否判定(実装する日に使う)**:
- `prevPainter:'mirror'`+縮小 → 🔴が**出ない** / `prevPainter:'heavy'`+provisional=0+縮小 → 🔴が**出る**
- 両方向を変異で赤くなるまで確認([[wiring-test-mutation-check-2026-08-01]])

## 4. ★この会議で私(司令塔)が学んだこと

- **数字の一致を出所の同一性と読んだ**(94 = mirrorCells だから同じ計器、と推論した)。
  実際は「鏡は同じ候補集合から作られるので一致するのが正常」。**呼び出し行1行で否定できた**。
- 材料 §1 で他4項目は裏取りしたのに、**結論を左右する `prevTiles` の出所だけ推測のまま**
  §0 の分岐点に据えていた。★**裏取りの網から最も重い一点が漏れた**。
- ＝[[code-can-confirm-without-field-data-2026-08-12]] を**また踏んだ**。

## 5. 未確認(推測で埋めない)

- 5枚差の具体的な構成(名簿キーパー蓄積差 / gift・ad の行数差 / フィルタ差) — この速報からは特定不能
- 鏡の94セルが「同一セッションの過去 paint」由来か「前回 popup インスタンス」由来か(どちらでも結論不変)
- スクショの「いま 97 件を表示中」と レーン89枚の関係(別の計数の可能性が高いが未照合)
- 名簿が鏡 paint を観測しない盲点は**既知の穴として残す**(今回は配線しない)
