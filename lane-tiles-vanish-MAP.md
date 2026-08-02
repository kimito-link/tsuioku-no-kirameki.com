# 応援レーンで「サムネが減る」— 地図(wayfinder)

- **作成**: 2026-08-02 / 司令塔(Claude Opus 5)が実コード+実配信の状態速報で作成
- **お題**: ユーザー報告「はじめ見たときよりレーン表示のサムネが減っているような」
- **前提**: v0.1.1232(上限撤廃+名簿キーパー)は出荷済み。**これはその先に露出した別系統のバグ**
- 関連: [lane-never-drop-MAP.md](lane-never-drop-MAP.md) / [lane-never-drop-SPEC.md](lane-never-drop-SPEC.md)

---

## 0. ユーザー確定の不変条件(最上位)

> その配信に来た人は、増えることはあっても、減って消えることは絶対にない。

---

## 1. 実配信で観測された事実(2026-08-02 lv351091198 / v0.1.1232)

```
laneRosterDelta:  droppedTotal=0 / cappedOutTotal=0 / everSeenMax=25 / everSeenNow=25
renderProbe:      domTilesPainted=26 / entriesLen=135 / mirrorCells=18
                  heavySettleState="settled" / lastProvisional=0
                  shrinkDetectedCount=1 / provisionalFalseCount=1
鏡(会場):         りんく2 / こん太0 / たぬ姉32 / ギフト0 / 広告2 = 計36
整合チェック:      ①POP 36 / ③WEB鏡 36 ✅一致
配信の状態:        ⏳取り込み中 20% (記録163/公式803)・あと約640件
```

計器自身の警告:

> ⚠ 縮小しているのにガードが素通り(provisional=false)=**タイルが消える直接原因**。フラグ設定側を疑う

### 1.1 ★上限撤廃・名簿は無罪(確定)

`droppedTotal=0` / `cappedOutTotal=0` = **v0.1.1232 で直した層では誰も消えていない**。
減っているのは**その先の DOM を描く層**。別系統のバグである。

---

## 2. ★数字の食い違い(26/36/18/25)の正体 — 症状ではない(司令塔が確定)

当初「26(DOM)・36(鏡)・18(mirrorCells)・25(名簿)が食い違う」ことを症状と疑ったが、
**計測時点が違うだけ**だった。

| 値 | 取得時点 | 出どころ |
|---|---|---|
| 名簿25 / DOM26 / mirrorCells18 | **77秒前**(popup 起動 **0.4秒後**) | `popupDiag`(AI診断コピー由来) |
| 鏡36 | **37秒前** | `KEY_LANE_MIRROR` |

速報自身が警告している:

> ↑ popup 起動から 0.4 秒後の値 ⚠ 起動直後のため、鏡・グリッド等がゼロや「未観測」でも正常です

→ **名簿25は「起動0.4秒時点でまだ25人しか積んでいなかった」だけ**。鏡36との差は時点差。
→ **この食い違いを症状として扱ってはいけない**(誤った仕様を生む)。

**「消えた」ことの実証は `shrinkDetectedCount=1` とユーザーの目視のみ。**

---

## 3. ★「①=③一致 ✅」は画面を保証していない(本件最大の発見)

[liveviewPublishSelfDiag.js:294](src/lib/liveviewPublishSelfDiag.js):

```js
const lanePicked = lane ? Math.max(0, Math.floor(Number(lane.pickedLength) || 0)) : null;
```

「①POP 36」の実体は **`lane.pickedLength`＝鏡に書き込まれた値**。
コメント([:290-291](src/lib/liveviewPublishSelfDiag.js))も認めている:

> 「同じ buckets 由来なので一致が正常」

→ **鏡の数字と鏡の数字を比べているだけで、DOM を一切見ていない。**
→ DOM が26でも「①POP 36 / ③WEB鏡 36 ✅一致」と出る。
→ **「✅一致」なのにサムネが減って見えるのは、この検証が画面を見ていないから。**

**推測**: 同種の一致検証は他にもある(`会場一致 ①DOM=鏡`)。そちらは DOM を見ている可能性が
あるが未確認(§7-1)。

---

## 4. データが流れる順番と、消える地点

```
供給(3経路のいずれか)
  └→ syncStorySourceEntries(liveId, displayList, storageRows, opts)   popup-entry.js:7918
      │  ★STORY_SOURCE_STATE.entriesProvisional = opts?.provisional === true
      │    (JSDoc:「無指定は false=既存呼び出しは挙動不変」)
      └→ renderStoryUserLane()                                        :6665
          ├→ candidates 構築 → 名簿キーパー → sort → bucket → picked
          ├→ noteLaneRoster(計器・droppedTotal=0 を報告)              :6878
          ├→ nextTileCount = picked + gift + ad                       :6908
          ├→ ★shouldKeepStoryUserLaneTilesOnShrink(...)               :6911  ←ここが門番
          │    素通りすると↓で少ないタイルに上書きされる = サムネが減る
          ├→ paintStoryUserLaneDomFilled(DOM を実際に書き換える)
          └→ publishLaneMirror(③会場用)                               :7437
```

---

## 5. 縮小ガードの構造と、素通りする2つの穴

[renderStoryUserLaneDom.js:167-187](src/extension/story/renderStoryUserLaneDom.js):

```js
export function shouldKeepStoryUserLaneTilesOnShrink(els, currentLiveId, lastTiledLid,
                                                     nextTileCount, entriesProvisional) {
  if (entriesProvisional !== true) return false;   // ★穴1: 確定なら無条件で描く
  ...
  return next < Math.floor(prev * STORY_USER_LANE_SHRINK_KEEP_RATIO);  // ★穴2: 0.6
}
```

`prev` は **DOM の `childElementCount` 合計(5段)**、`next` は今回描こうとしている総タイル数。

### 穴1: 申告漏れ(司令塔が発見・修正済み・未コミット)

`syncStorySourceEntries` の呼び出し7箇所のうち、供給を渡すのは3箇所:

| 行 | 経路 | provisional |
|---|---|---|
| [:7226](src/extension/popup-entry.js) | 軽量 | `{ provisional: true }` ✅ |
| [:16523](src/extension/popup-entry.js) | heavy | 申告あり ✅ |
| [:14936](src/extension/popup-entry.js) | **storage fallback** | **無し** ❌ |

[:14936](src/extension/popup-entry.js) = `populateStorySourceEntriesFromStorageFallback`。
`nls_comments` を読み直す fallback で、**取り込み途中(実測20%)でも走る=本質的に暫定**。
なのに無指定＝`false`(確定)を名乗り、穴1で素通りしていた。

→ 司令塔が `{ provisional: true }` を追加済み + [laneShrinkGuardWiring.test.js](src/lib/laneShrinkGuardWiring.test.js)(3件緑)。**未コミット**。

### 穴2: 0.6 という閾値では今回の縮小を守れない(司令塔が計算で確認)

観測された縮小は **36→26 = 72%**。
`26 < floor(36 × 0.6) = 21` は **不成立**。

→ **穴1を塞いでも、この縮小は依然として素通りする。** 穴2の対処が別途必要。

---

## 6. 既存の設計判断と、その根拠(壊してはいけない境界)

### 6.1 縮小ガードは「アバター暫定固着」を防ぐために入った

commit `27cf7b30`「大配信backfillのアバター暫定固着を根治 v0.1.1109」段A:

> 「同一配信+暫定(heavy未settle)+今回タイル<前回×0.6 で paint見送り→前回の完全描画を守る」

**真因は「暫定の短い候補で完全描画を上書き退化」**。同 commit の段B(`heavyChunkReadReuse.js`)が
根治し、段Aは即効の保険という位置づけ。

★**なぜ 0.6 なのかの根拠は commit にもコードにも書かれていない**(司令塔が commit 本文と
[:145-146](src/extension/story/renderStoryUserLaneDom.js) のコメントで確認)。

### 6.2 既存テストが 0.6 を明文化している

[renderStoryUserLaneDom.test.js:225-227](src/extension/story/renderStoryUserLaneDom.test.js):

```js
it('微減(200→190=95%)は keep=false(60%以上は描く)', () => { ... });
```

→ **今回の症状(72%で減る)を「許容するケース」として明文化している。**
閾値を変えるならこのテストの書き換えが要る=既存契約の変更。

### 6.3 名簿キーパー導入で前提が変わった(v0.1.1232)

[laneRosterKeeper.js](src/lib/laneRosterKeeper.js) により `picked` は同一配信内で**単調増加**する。

→ **「確定した供給で人数が減る」ことは原理的に起きない。**
→ **推測**: 割合(0.6)で妥協する根拠は失われている。ただし §6.1 の固着地雷との両立は要検証(§7-2)。

### 6.4 provisional の既定は fail-open

[popup-entry.js:7914-7920](src/extension/popup-entry.js) の JSDoc:

> 「無指定は false=既存呼び出しは挙動不変。」

→ **申告漏れが静かに事故る設計**(実際に §5 穴1 が起きた)。
fail-closed(既定 true)にすべきかは論点D。

---

## 7. 未確認の前提(推測と明記)

1. **他の一致検証が DOM を見ているか — 未確認。** `会場一致 ①DOM=鏡` は名前上 DOM を見て
   いそうだが実装未読。§3 と同じ穴があるかは不明。
2. **ガードを厳格化したとき §6.1 の固着が再発するか — 未検証。** 段B(`heavyChunkReadReuse`)が
   根治済みなら段Aを厳格化しても安全なはずだが、実測していない。
3. **「古い表示が長く残る」副作用の実害 — 未測定。** 厳格化すると暫定供給が続く間ずっと
   前回描画を守るため、いつ更新されるかは heavy の settle 次第。settle しない経路があるか未確認。
4. **26 と名簿25 の差1の正体 — 未確認。** gift/ad 段(別供給源)由来と推測されるが、
   時点差(§2)があるため厳密な突合はできていない。
5. **`mirrorCells=18` が何を数えているか — 未確認。** 鏡36・DOM26 のどちらとも合わない。

---

## 8. 実装前に決める必要がある質問(Fable への論点)

### A. 「①=③一致 ✅」が画面を保証していない問題(§3)
鏡同士を比べる検証は、何のために存在し、何を保証しているのか。
DOM を見る検証を足すべきか。足すなら「①DOM=①鏡」をどう定義するか
(paint と publish は同期フレームではない=TOCTOU をどう扱うか)。
それとも一致検証の**表示文言**を「画面は保証しない」と正直に変えるだけにするか。

### B. 縮小ガードの閾値(§5 穴2)
(a)厳格化=暫定なら1人でも減ったら守る (b)申告漏れ修正のみ (c)閾値を上げる(0.95等)。
§6.3(名簿導入で単調増加)を踏まえ、割合で妥協する根拠が残るか。
§6.2 の既存テストを書き換える正当性はあるか。§7-3 の副作用をどう抑えるか。

### C. ガード1行目「確定なら無条件で描く」は正しいか(§5 穴1)
名簿導入後、確定供給の縮小は「供給が不完全」を意味するのでは。
だが確定を信じないなら、**いつ古い表示を捨てるのか**(配信切替以外の出口が要る)。
出口が無いと「増える一方で永久に減らない」＝別の不具合になる。

### D. provisional の既定値(§6.4)
「無指定=false(確定)」は fail-open。既定を true(暫定)にする=fail-closed にすべきか。
既存3経路(:7226/:14936/:16523)と、供給を渡さない4箇所(空リセット)への影響は。

### E. 数字の食い違いの扱い(§2)
26/36/18/25 は計測時点差であり症状ではない、という司令塔の判定は妥当か。
時点差を含んだまま並べる状態速報の見せ方は、誤診を誘発しないか。改善すべきか。

### F. 退行検知(§7-2 とセット)
実配信を待たずに「サムネが減らない」を証明するテストの形。
DOM を伴う挙動だが、純関数テスト+配線テストで足りるか。
§6.1 の固着(暫定の短い候補で上書き)が**再発しないこと**も同時に守るテストが要る。

---

## 9. セルフチェック

- [x] ファイル名の列挙で終わっていない(§4-5 で消える地点を特定)
- [x] 既存仕様を守る理由(§6.1 固着地雷 / §6.2 既存テスト)
- [x] ユーザー体験上の制約(§0 不変条件 / §3 ✅なのに減る)
- [x] データ保存・互換性・失敗時の挙動(§5 穴1/穴2 / §6.4 fail-open)
- [x] 事実と推測の分離(§7 で未確認5件を明示・§2 で「症状ではない」と訂正)
- [x] 重要判断への根拠(commit 27cf7b30 / liveviewPublishSelfDiag.js:294 / 実配信速報)

**特記1**: §3「①=③一致は DOM を見ていない」が本件最大の発見。✅表示の信頼性に関わる。
**特記2**: §2 で当初の疑い(数字の食い違い=症状)を実測で否定した。これを症状として
Fable に渡すと誤った仕様になるため、地図の段階で潰した。
