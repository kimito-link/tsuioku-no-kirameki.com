# 実装ハンドオフ: コメントピックアップ枠（Patch 1 / MVP）

> **この1枚だけで着手できる粒度で書いてある。** 設計の理由は
> [comment-pickup-ticker-DESIGN.md](comment-pickup-ticker-DESIGN.md)。
> 作成: 2026-08-02（設計=Fable / 裏取り=司令塔）。**実装未着手。**

## 読む順（これだけ読めば足りる）

1. この文書
2. `comment-pickup-ticker-DESIGN.md` の **E章（MVP）と G章（地雷）**
3. 実コード3つ:
   - `src/lib/pickLatestComment.js`（今の選定＝置き換え対象の隣に置く）
   - `src/lib/commentTickerLatestHtml.js`（**触らない**。3画面の絞り所）
   - `src/lib/commentTimelineMirror.js`（②③の入力row形）

## スコープ（MVPだけ・厳守）

**やること**: `pickTickerHighlight.js` を新設し、3つの書き手の選定を差し替える。
diff-skip と計器を入れる。

**やらないこと（Patch 1 に混ぜない）**:
- `buildCommentTickerLatestHtml` の変更（色・バッジ・variant）→ Patch 2
- 鏡スナップショットへのフィールド追加 → Patch 3
- CSS / popup.html の変更
- VIP・venueSeats・drop本文の利用（**設計で捨てた**。理由はDESIGN F章）

## 着手手順

```bash
git switch -c feat/ticker-pickup
```

### 1. `src/lib/pickTickerHighlight.js` を新設（純関数・状態なし）

```
export function pickTickerHighlightEntry(list, nowMs)
  → { entry, why: 'gift'|'scored'|'fallback'|'none', stats: {...} }
```

- 定数: `BUCKET_MS=7000` / `LOOKBACK_MS=8000` / `MIN_TEXT_LEN=4` /
  `SWEET_LEN_MAX=60` / `DUP_EXCLUDE=3`
- `bucketAt = nowMs - (nowMs % BUCKET_MS)` ← **決定性の核**（3画面が同じ答えを出す根拠）
- 入力の両対応: ①`displayEntries` の entry 形 / ②③`restoreCommentTimelineRows` の row 形
  → 内部で `{ts, kind, text, userId, commentNo}` に正規化
- スコア・フィルタは DESIGN C/D 章のとおり
- 候補なし → `pickLatestCommentEntry(list)` に**フォールバック**（既存関数を実import・再実装しない）

### 2. 3つの書き手を差し替え（各1〜3行）

| 画面 | file:line | 関数 |
|---|---|---|
| ①POP | `src/extension/popup-entry.js:3466` | `renderCommentTicker` |
| ②passive | `src/extension/popup-entry.js:7214` | `applyCommentTimelineMirrorForPassive` |
| ③純Web | `app/live-view.js:491` | `paintCommentTimelineMirror` |

各所で diff-skip を必ず入れる:
```js
const picked = pickTickerHighlightEntry(rows, Date.now());
const key = `${picked.why}:${picked.entry?.commentNo||''}:${picked.entry?.at||picked.entry?.capturedAt||''}:${picked.entry?.userId||''}`;
if (segA.dataset.nlTickerKey !== key) {
  segA.dataset.nlTickerKey = key;
  segA.innerHTML = buildCommentTickerLatestHtml(...);
}
```

### 3. 計器 `tickerPick` を既存 fastDiag に相乗り（新storageキーは作らない）

```
tickerPick: { gift, scored, fallback, none,
              filteredTooShort, filteredDup, filteredSameUser,
              domWriteTotal, lastWhy, lastBucketAt }
```

★**`statusFastDiagLite` の passthrough を必ず通すこと。**
full に足しても lite に通さないと**状態速報のコピペに永久に出ない**（過去に実際に踏んだ）。

### 4. テスト（TDD・ここが一番大事）

- **②③向けは `buildCommentTimelineMirrorSnapshot` の実出力を実import**して選定に食わせる。
  手書きfixtureは「余分なキーが無い」ので中継落ちを永久に検出できない
- 同一 `nowMs`・同一入力で**必ず同じ結果**（決定性）を断言
- 同一バケット内で複数回呼んでも答えが変わらないことを断言
- 全部フィルタされたら `fallback` に落ち、**entry が null にならない**ことを断言
- **書いた直後に変異で赤を確認**:
  - 選定呼び出しに `if (false)` を前置 → 赤になるか
  - diff-skip を外す → `domWriteTotal` の断言が赤になるか
  緑しか見ていないテストは実効性ゼロ（v0.1.1201 で実際に踏んだ）

## 機械的な完了判定

1. `npm run verify:cc` 全9ステップ緑（新規fileは `git add` してから。でないと tracked-imports が赤）
2. 新規lib追加なので `npm run tree-map` と `npm run feature-map` を**両方**再生成してコミットに含める
3. 実機（20件/分超の配信）で状態速報に `tickerPick` が出て **`gift+scored ≥ 1`**
4. **`domWriteTotal ≤ 経過秒/7 + α`**（＝現状より軽くなった数値証拠）
5. 0件配信では `none` のみ増加

## 地雷（過去に実際に壊した箇所）

- **paint毎のDOM全走査は禁止**。選定はデータ配列のみを歩く（v0.1.1201で拡張全体を重くした前科）
- **storage書き込みを増やさない**（大配信でChrome全体が固まった前科）
- **中継でフィールドが消える**。同日5回踏んだ。Patch 1 は新フィールドゼロで回避しているが、
  将来足すときは**必ず spread で運ぶ**
- **鏡は `commentTimelineMirror`**（`nls_comment_timeline_mirror_v1`）。**laneMirror ではない**
- **ちらつき前科**。diff-skip の「消す側」（フォールバック遷移）も同じキー機構を通すこと
- **計器は症状でなく原因を出す**。「判定不能」枠を必ず用意する

## version bump（§12.5・1変更=patch 1つ）

`package.json` / `extension/manifest.json` / `src/lib/changelog.js` を同期し、
紹介LP `tsuioku-no-kirameki/index.html` の版数4箇所も更新（`verify:bump [6]` が機械照合）。

## ユーザーへの反映3手順（push しただけでは Chrome に届かない）

1. `git pull`（こちらで実行）
2. 拡張をリロード（🔄）← **ユーザー操作が必須**
3. watch タブを F5 ← **ユーザー操作が必須**

`npm run copy:ext` まで済ませておけば 2 と 3 だけで反映される（**配信視聴中は実行しない**）。
