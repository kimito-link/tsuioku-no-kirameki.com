# 実装計画: 鏡の書き手を①POPから切り離す（3画面フルコピーの根治）

> 2026-08-08 / 起草=Claude（実コードで全項目を裏取り済み）
> GPTとの3往復で方向性は固まったが、GPTの実装案は既存設計を2箇所で壊すため採用しない。
> ★この計画は**着手前にユーザー承認が必要**。

---

## 0. 何を解決するのか（1行）

**①POPが閉じている間、会場と③WEBが古い鏡を見続ける**（実測656秒・過去6時間）。

---

## 1. 真因（実コードで確定）

`src/lib/laneMirrorContract.js:77`:
> 書くのは renderStoryUserLane 内の publishLaneMirror **1箇所のみ**

= 鏡が更新されるのは**①が描画した瞬間だけ**。①が閉じる/裏に回ると鏡が止まる。

ただし①がやっているのは **DOM走査ではない**:
```js
userLaneCandidatesFromStorage(storedComments, liveId, opts)  // 純関数
```
**保存済みコメント → 純関数 → レーン**。描画は最後の一歩にすぎない。
そして会場も記録エンジンも、この純関数と材料を**既に持っている**。

→ **新しい概念は要らない。書き手の置き場所を変えるだけ。**

---

## 2. 設計: 鏡を2層に分ける

| 層 | 中身 | 誰が書くか | なぜ |
|---|---|---|---|
| **顔ぶれ層** | 5段の配列(link/gift/ad/konta/tanu) | **content script**（常駐） | ①非依存にする=今回の目的 |
| **DOM指紋層** | `domSelf` | ①POP（描画時のみ） | content script は①のiframe DOMを読めない（構造的に不可能） |

★`domSelf` は v0.1.1284 で入れた**実DOM起点の指紋**。会場一致の判定が恒真
（何を入れても✅）になるのを防ぐためのもの。**捨てるとその修正が巻き戻る**。

---

## 3. ★GPT案を採用しない理由（2点）

### (1) `get → set` は既存設計への違反かつ競合する

GPT案:
```js
chrome.storage.local.get([KEY_LANE_MIRROR], (r) => {
  chrome.storage.local.set({ [KEY_LANE_MIRROR]: { ...r[KEY_LANE_MIRROR], domSelf } });
});
```

**却下理由A: 鏡は単独キーではない。** `mirrorBundleFlushScheduler.js` が
**9セクションを1回の `set` でまとめて書く**設計（lane / statCards / topSupporters /
northStar / commentTimeline / giftHistory / roomHeat / sessionSummary / storyDiag）。

冒頭コメント:
> popup がバラバラの tick で書くのをやめ、
> **1つの合流バッファに反映 → まとめて 1 回だけ storage へ書く**ための土台

**却下理由B: それは「3画面の数字ズレ」の構造的真因そのもの。**
記録（[[mirrors-written-per-key-per-tick-root-of-parity-lie]]）:
> 各鏡が**独立キー・独立min-gap・別々の瞬間**に書かれ、
> **同一tickの一貫スナップショットが構造的に存在しない**

= GPT案はこの修正を巻き戻す。

**却下理由C: 排他制御が無く互いを巻き戻す。**
```
content: get(顔ぶれ=新) ───────── set({顔ぶれ:新, domSelf:古})  ← domSelfを巻き戻す
POP:         get(domSelf=新) ── set({顔ぶれ:古, domSelf:新})    ← 顔ぶれを巻き戻す
```

### (2) `fingerprint` の名前衝突

GPTは顔ぶれ層にも `fingerprint` を入れているが、v0.1.1284 の指紋は
`domSelf.fingerprintFor`＝**実DOM起点**。同名にすると混同して恒真判定に逆戻りする。
→ 顔ぶれ層は **`faceHash`** という別名にする。

---

## 4. 採用する設計: `laneDomSelf` を独立セクションにする

```
mirrorBundle の section（現在9個 → 10個に）:
  lane          ← ★content script が書く（顔ぶれ層）
  laneDomSelf   ← ★POP が書く（DOM指紋層・新設）
  statCards, topSupporters, northStar, … ← 従来どおり①POP
```

**利点**:
- `get→set` を**一切しない**＝競合しない
- 9種同梱の1回書き込みに乗る＝**同一tick一貫が保たれる**
- 読み手は `sanitizeLaneMirrorForRead` の中で `{...lane, domSelf: laneDomSelf}` に合成
  ＝**会場/③WEB は1行も変更しない**

---

## 5. 変更するファイル（実在パスのみ）

| ファイル | 変更 |
|---|---|
| `src/lib/mirrorBundle.js` | `SECTION_KEYS`(47) / `createEmptySections`(60) / `normalizeSections`(104) の**3箇所**に `laneDomSelf` を追加 |
| `src/lib/mirrorBundleFlushScheduler.js` | `SECTION_TO_LEGACY_KEY`(35) に `laneDomSelf` の**書き出し先を持たせない**（合成は読み手側でやるので旧キーは増やさない）★要検討 |
| `src/lib/laneFaceRecorder.js` **(新規)** | 顔ぶれ層を作る純関数。`commentChunkStore.js` + `userLaneCandidatesFromStorage.js` を使う |
| `src/extension/content-entry.js` | recorder を import し、合流スケジューラを持って定期flush |
| `src/extension/popup-entry.js` | `publishLaneMirror` の domSelf を `laneDomSelf` セクションへ。顔ぶれ層はフラグON時に書かない |
| `src/lib/laneMirrorContract.js` | `LANE_MIRROR_CONSUMERS` に content-entry.js を writer 追加（registry testが同期を強制） |
| `src/lib/laneMirrorFeatureFlag.js` **(新規)** | `USE_RECORDER_MIRROR = false` 既定OFF |

★**存在しないもの**: `laneMirrorUtil.js` / `constants.js` / `idleFlushUtil.js` /
`computeContentHash` / `computeFingerprint` / `scheduleIdleFlush` はGPTの創作。使わない。
`KEY_LANE_MIRROR` の正しい所在は `src/lib/laneMirrorKey.js`。

---

## 6. ★着手前に必ず確かめること（前提の裏取り）

今日、**承認済み計画がkillswitch 1行でまるごと不要になった**事故がある
（[[verify-premise-before-implementing-2026-08-07]]）。着手時に以下を確認する。

1. **既存 killswitch の有無**: `FORCE_DISABLE_*` 系が鏡経路に無いか grep
2. **content script が本当に常駐しているか**: watchタブを離れた時の挙動
3. **`userLaneCandidatesFromStorage` の引数 `opts`**: ①が渡している値
   （`broadcasterUid` 等）を content script も同じく用意できるか
   ★ここが揃わないと顔ぶれが一致しない
4. **比較テストが通るか**: ①の出力と recorder の出力が顔ぶれ層で一致するか

---

## 7. 段階（各段で verify:cc 緑・別コミット）

| 段 | 内容 | 完了条件 |
|---|---|---|
| **0** | 前提の裏取り（§6の4項目） | 4項目すべて確認済み |
| **1** | `laneDomSelf` セクション新設（誰も使わない状態） | 既存テスト全緑（退行ゼロ） |
| **2** | `laneFaceRecorder.js` + unit test | 顔ぶれ層のshapeが①と一致 |
| **3** | ★比較テスト（①出力 vs recorder出力を顔ぶれ層で `deepStrictEqual`） | **これが緑になるまで先へ進まない** |
| **4** | content script で定期flush（フラグOFFなので実害なし） | 鏡が2重に書かれないこと |
| **5** | フラグON→実機確認 | **①を閉じて会場が更新される**ことを目視 |
| **6** | ①の顔ぶれ層書き込みを停止 | 3画面一致・parity緑 |

★段3が関所。ここが緑にならなければ設計を見直す（実装を進めない）。

---

## 8. 判断が要る点（ユーザー確認）

1. **バッチ間隔**: 5秒を提案。実測で `storage_changed` が再描画の81%
   （1コメント8.2回）なので即時は輻輳する。会場のSOFT窓が180秒なので10秒でも実害なし。
2. **段6をやるか**: ①の書き込みを止めず「両方書く（後勝ち）」で留める選択もある。
   止めない方が安全だが、二重書き込みが残る。
3. **この規模をこのブランチでやるか**: 現ブランチは既にPR #245で
   会場パリティ+入場演出が乗っている。**別ブランチを切る**のが妥当か。

---

## 9. やらないこと（スコープ外）

- ちらつき対策（SOFT/HARD窓）の変更 … 鏡が新鮮になれば降格しにくくなるだけ。撤去しない
- スロットリング/デバウンスの新規導入 … 既に diff-skip 機構が7版かけて作られている
- 512KB対策 … 実測28〜40KB(8%)で余裕十分
- `popup-entry.js` のタイル描画・幕・フッター … 触らない（L12）
