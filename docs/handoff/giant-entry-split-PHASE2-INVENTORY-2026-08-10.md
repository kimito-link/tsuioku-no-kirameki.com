# Phase 2 棚卸し結果: initPopup / refresh の抽出可能性

> 仕様の Phase 2 step 0（抽出ではなく**棚卸し**）の実施結果。作成: 2026-08-10
> 仕様: [giant-entry-split-SPEC-2026-08-10.md](giant-entry-split-SPEC-2026-08-10.md)
> ★コードは一切変更していない。機械集計のみ。

---

## 0. なぜ棚卸しを先にやるか

地図§7 で「90個の addEventListener が独立か」は **未確認** としていた。
抽出順を推測で決めると、結合の強い塊から手を付けて事故る。
仕様 Q4 の回答どおり、**最初の作業は抽出ではなく計測**。

---

## 1. 結論（先に3行）

1. **結合は思ったより弱い。** `initPopup` が参照する module-level 変数は
   **277個中29個**（`refresh` は35個）。ctx は太らない。
2. **本体は「配線」ではなく「ハンドラの中身」。**
   `initPopup` 2,551行のうち **1,268行（50%）が addEventListener のコールバック本体**。
3. **最初の一手は `submitComment`（166行）。** initPopup 内で唯一の名前付き関数で、
   自己完結度が高い。

---

## 2. 実測（すべて機械集計）

### 2-1. 関数のサイズ

| 関数 | 行数 | 場所 |
|---|---:|---|
| `initPopup` | 2,553 | popup-entry.js:19729 |
| `refresh` | 1,764 | popup-entry.js:15478 |

### 2-2. module-level 変数への依存（★抽出可能性の核心）

```
module-level 変数の総数        : 277個
initPopup が参照している数     :  29個 (10%)
refresh   が参照している数     :  35個 (13%)
```

**参照上位（ctx で渡す候補）**

| initPopup | 回数 | | refresh | 回数 |
|---|---:|---|---|---:|
| `popupFrameState` | 22 | | `watchMetaCache` | 54 |
| `_commentPostDiagCounters` | 14 | | `STORY_AVATAR_DIAG_STATE` | 54 |
| `INLINE_MODE` | 13 | | `watchPopupRefreshGeneration` | 11 |
| `watchMetaCache` | 9 | | `popupCelebrationGate` | 9 |
| `watchPopupLastPaintedLiveId` | 9 | | `INLINE_MODE` | 8 |

★`INLINE_MODE` 系（`INLINE_PASSIVE` / `INLINE_SIDE_PANEL` / `INLINE_EMBED_WATCH`）は
**定数**なので ctx ではなく import で渡せる＝実質の可変状態はさらに少ない。

### 2-3. initPopup の中身の内訳

```
総行数                          : 2,551
addEventListener のコールバック本体 : 1,268行 (50%)
トップレベルの try 塊(8個の合計)    :   約180行
```

**大きい塊 上位6**

| 行数 | 内容 |
|---:|---|
| 166 | `async function submitComment()` ← **唯一の名前付き関数** |
| 164 | `if (!INLINE_PASSIVE) { ... }` |
| 141 | `if (cheerToggleBtn && cheerPaletteEl && commentInput) { ... }` |
| 104 | `devMonitorCopyAiBundleBtn` の click ハンドラ |
| 80 | `exportBtn` の click ハンドラ |
| 68 | `const safeRefresh = () => { ... }` |

---

## 3. 仕様の前提の答え合わせ

| 仕様が「未確認」としたこと | 棚卸しの結果 |
|---|---|
| 90リスナーの module-level 依存 | **弱い**（29/277）。ctx は現実的なサイズに収まる |
| 「横断的関心で割るな・機能で割れ」 | **妥当**。ただし実体は「配線の塊」ではなく**ハンドラ本体**なので、抽出するのは登録処理ではなく**中身** |
| 抽出順は棚卸しで決める | **`submitComment` が第一候補**（最大・唯一の名前付き・自己完結） |

---

## 4. `submitComment`（第一候補）の詳細

- 場所: popup-entry.js:21084（initPopup 内 L1356）/ 166行
- **クロージャ依存**: `commentInput` / `exportBtn` など、`initPopup` 内で宣言された
  DOM 参照を掴んでいる（popup-entry.js:21085-21086 で確認）
  → 抽出時は仕様どおり `ctx` で**参照を渡す**（★フィールドを個別列挙で詰め替えない
    ＝[[venue-mirror-is-the-primary-path-2026-08-01]] で5回踏んだ型）
- **推測（未確認）**: この関数は「コメント送信」という単一の機能に閉じており、
  他のハンドラと状態を共有していないように見える。**実際の依存は抽出時に再確認する**。

---

## 5. 次にやること（このドキュメントの範囲外）

1. `src/lib/wiringTestSource.js`（`resolveEntryFnSource`）を先に作る
   ＝**移動しても wiring テストが壊れない形**にしてから動かす（仕様 Q5）
2. `src/extension/popup/` に `PopupInitContext` の typedef を置く
3. `submitComment` を 1PR で抽出（追加行 < 削除行 を同一コミットで満たす＝仕様 Q6）
4. 関数行数ラチェット（`initPopup ≤ 2600` / `refresh ≤ 1800`）を導入し、
   抽出のたびに下げる

★**1PR = 1塊**。まとめて動かさない。

---

## 6. 未確認のまま残ること

- `refresh` の `isFreshRefresh()` 世代ガードの実依存（仕様の防御的規約＝
  「各ステージ関数が自分の先頭でガードする」は、実依存を確認するまで維持する）
- `submitComment` 以外のハンドラ塊の相互依存（164行の `if (!INLINE_PASSIVE)` 塊など）
- `content-entry.js`(19,065行) は今回も未計測（スコープ外）
