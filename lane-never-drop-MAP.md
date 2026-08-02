# 応援レーン「一度出た人は消えない」— 地図(wayfinder)

- **作成**: 2026-08-02 / 司令塔(Claude Opus 5)が実コードを読んで作成
- **お題**: 「とにかく1度出た人は制限がなくずっと出るように」(ユーザー確定の不変条件)
- **前提バージョン**: v0.1.1231 (master `e40a759c`)
- 関連: [HANDOFF-resume-0802.md](docs/handoff/HANDOFF-resume-0802.md) / Phase 1 計器 = [laneRosterDelta.js](src/lib/laneRosterDelta.js)

---

## 0. ユーザー確定の不変条件（設計の最上位）

> **その配信に来た人は、増えることはあっても、減って消えることは絶対にない。**

Phase 1 計器の冒頭([laneRosterDelta.js:8-11](src/lib/laneRosterDelta.js))にも同じ文言が記録済み:

> 「レーンは途中で増えることがあっても、減って消えたりの挙動があってはいけない。その配信に来た人はずっと記録しないと」

**この不変条件は同一配信の中での約束**。配信が変われば正当にリセットされる([laneRosterDelta.js:129-145](src/lib/laneRosterDelta.js) `lid !== state.lastLid` で `everSeen` を作り直す)。

---

## 1. 入口になる画面

| 入口 | 実体 | 上限 |
|---|---|---|
| ① popup の応援レーン(INLINE) | `popup.html` 内 `.nl-main`。拡張のポップアップ | **48** |
| ① popup(非 INLINE) | 同上・狭い表示 | **24** |
| ③ 会場(venue)/純Web公開 | 鏡(mirror)スナップショット経由で再描画 | 鏡 cap **48** + **512KB** |

①が「本物」、③は①が publish した鏡を復元して描く**従属関係**。②は status(状態速報)。

---

## 2. 関係する主要ファイルと責務

| ファイル | 責務 |
|---|---|
| [popup-entry.js:6714-6716](src/extension/popup-entry.js) | `limit` を決める唯一の場所。`INLINE_MODE ? 48 : 24` |
| [popup-entry.js:6730-6846](src/extension/popup-entry.js) | `aggList` から `candidates[]` を毎 paint ゼロから構築 |
| [popup-entry.js:6857-6860](src/extension/popup-entry.js) | sort → bucket → flatten → 計器へ |
| [storyUserLaneSort.js:22-41](src/lib/storyUserLaneSort.js) | 候補の順序。**決定的**(時刻非依存) |
| [storyUserLaneBuckets.js:10-22](src/lib/storyUserLaneBuckets.js) | `limit` を3段に配分。**ここが打ち切りの実行者** |
| [domain/lane/tier.js:44-56](src/domain/lane/tier.js) | 段(0/1/2/3)の決定。tanu→link→konta の順で評価 |
| [laneRosterDelta.js](src/lib/laneRosterDelta.js) | **Phase 1 計器**。`everSeen` を持つが観測専用 |
| [laneMirror.js:134-173](src/lib/laneMirror.js) | 鏡スナップショット生成。512KB 超で cap 半減 |
| [popup-entry.js:7416-7428](src/extension/popup-entry.js) | `publishLaneMirror()`。鏡 cap = `STORY_USER_LANE_INLINE_LIMIT` |

---

## 3. データが流れる順番（実測）

```
storageCtx(コメント記録)
  └→ aggList(ユーザー単位の集約)                     popup-entry.js:6730 付近
      └→ candidates[] を毎paintゼロから構築          popup-entry.js:6756-6846
          │  各候補に profileTier / thumbScore を付与
          └→ candidates.sort(compareStoryUserLaneCandidates)   :6857
              └→ bucketStoryUserLanePicks(candidates, limit)   :6858  ★ここで48人に打ち切り
                  └→ flattenStoryUserLaneBuckets(buckets)      :6859
                      ├→ noteLaneRoster(計器・観測のみ)        :6860
                      ├→ paintStoryUserLaneDomFilled(①を描画)
                      └→ publishLaneMirror(③会場用の鏡)        :7416
                          └→ buildLaneMirrorSnapshot(cap:48)   laneMirror.js:134
                              └→ 512KB超なら cap 半減(最小16)   laneMirror.js:167-171
```

**核心**: 候補は毎回ゼロから作り直される。前回誰を描いたかは、描画パスのどこにも残らない。

---

## 4. 「なぜ人が消えるのか」— 真因（実コードで確定）

### 4.1 記憶が個数しかない

横断的に残っているのは3つだけ:

- (a) 直前描画内容の文字列(diff-skip 用) `storyUserLaneLastRenderSig`
- (b) 最後に描いた配信ID
- (c) DOM の `childElementCount`(**個数だけ**)

→ **同じ人数のまま中身が入れ替わると、既存のどのガードも検知できない**([laneRosterDelta.js:13-20](src/lib/laneRosterDelta.js) に同旨の記録)。

### 4.2 消失の実行者は `limit` による打ち切り

順序 `compareStoryUserLaneCandidates` は **決定的**で時刻に依存しない([storyUserLaneSort.js:22-41](src/lib/storyUserLaneSort.js): tier → thumbScore → uid ランク → uid 辞書順 → entryIndex)。

したがって**「順序が揺れるから消える」のではない**。消えるのは:

1. 候補総数が 48 を超え、`bucketStoryUserLanePicks` が 49 人目以降を捨てる
2. 新しい人が上位に入ると、**下位の既存の人が 48 の枠から押し出される**

実害の実例: [laneDiag.js:7](src/lib/laneDiag.js)

> 「limit 48 で打ち切り=**474人が黙って隠れていた**不整合」(522人中48人)

テストにも残存: [laneDiag.test.js:18](src/lib/laneDiag.test.js) `{ identified: 522, laneShown: 48, limit: 48 }`

### 4.3 段(tier)の移動は別現象（消失ではない）

[tier.js:44-56](src/domain/lane/tier.js) は entry の中身だけで段を決める。`matchesLinkPolicy` は `avatarObserved` を見る([linkPolicy.js:33](src/domain/lane/columns/linkPolicy.js))ため、**アイコンが後から観測されると tier 1 → 3 に上がりうる**。

- これは**改善方向の移動**(たぬ姉→りんく)であり、消失ではない
- ただし `bucketStoryUserLanePicks` は上位段から `limit` を食うため、**段が上がった人が増えると下位段の枠が減る**=間接的に消失を誘発する
- **推測**: 上限撤廃すればこの間接的消失も同時に解消する(未実測)

---

## 5. 既存の設計判断と、その根拠（壊してはいけない境界）

### 5.1 ★ limit と鏡 cap は必ずセット（実績のある地雷）

[popup-entry.js:6714-6715](src/extension/popup-entry.js):

> 「`STORY_USER_LANE_INLINE_LIMIT` と `publishLaneMirror()` の鏡 cap は必ずセットで変更(**v0.1.1052で①211≠③99を起こした地雷**)」

[popup-entry.js:7420-7422](src/extension/popup-entry.js) にも同旨。分離すると ①POP≠③WEB のパリティ不一致になる。

### 5.2 鏡には 512KB の物理的な壁

[laneMirror.js:45](src/lib/laneMirror.js) `LANE_MIRROR_MAX_JSON_BYTES = 512 * 1024`。超えると [:167-171](src/lib/laneMirror.js) で **cap を半減(最小16)して作り直す**。

**純Web公開のペイロードサイズ上限に由来**([laneMirror.js:8](src/lib/laneMirror.js))。外せば済む話ではない。

→ **レーンの上限だけ撤廃しても、会場は容量で自動的に切り戻される。**

### 5.3 ★ 200→48 の差し戻しは「性能」が理由ではない（重要）

commit `df13033b`「応援レーン上限を48へ差し戻し+二重スクロール撤去 (v0.1.1139)」本文:

> 「ロビー撤去(v0.1.1138)で『会場=①の完成済み5段のみ描く』に確定したため、v0.1.1051で200へ引き上げていた表示上限を48へ差し戻し(鏡capも追随)。あわせてINLINE応援レーン内の40vh縦スクロールを撤去し popup.html全体のスクロール(.nl-main)に一本化した。」

**「200 だと重かった」とは書かれていない。** 理由は「ロビー撤去に伴う設計の整理」+「二重スクロールの解消」という UI 都合。

→ **200 人表示が性能で否決された事実は履歴に存在しない**(司令臺が `git log -S` と commit 本文で確認)。

### 5.4 鏡は最小5フィールドしか持たない

[laneMirror.js:6-7](src/lib/laneMirror.js): `buildPersonTileEl` が読むのは `displaySrc / title / meta.idLine / meta.nameLine / entry.userId` の**5つだけ**。鏡もこの5つ+`recentTexts`(最大3件)に間引く。

→ **1人あたりのバイト数は小さい**。512KB を何人で使い切るかは要実測(§7)。

### 5.5 匿名セルは顔を保存せず再生成する

[laneMirror.js:34-37,186-188](src/lib/laneMirror.js): `displaySrc` 空 + `userId` 有りのセルは、読み手が `anonymousIdenticonDataUrl(uid, 64)` で**同じ顔を再生成**(冪等)。data URL を鏡に載せないスリム化。

→ **人数を増やすときの容量効率に直結する既存の武器**。

### 5.6 DOM 全走査は禁止（過去に拡張全体を重くした）

[laneRosterDelta.js:38-39](src/lib/laneRosterDelta.js):

> 「DOM は走査しない(paint のたびの DOM 全走査は禁止=過去に拡張全体を重くした)」

[popup-entry.js:6726-6728](src/extension/popup-entry.js) にも同種の記録(v0.1.773 で `O(集約×N)` の全件走査が「送信18s」の一因だった)。

---

## 6. 変更すると壊れうる箇所

| 箇所 | 壊れ方 |
|---|---|
| `STORY_USER_LANE_INLINE_LIMIT` 単独変更 | ①≠③ パリティ不一致(§5.1・実績あり) |
| 鏡 cap を上げる | 512KB 超 → cap 半減が発動し**かえって人数が減る**(§5.2) |
| `contentHash` の対象 | [laneMirror.js:159-161](src/lib/laneMirror.js) は復元正準形で署名。ここを変えると scene 行が偽🔴 |
| `bucketStoryUserLanePicks` の戻り値の形 | `{link,konta,tanu}` を前提にした呼び出し側([popup-entry.js:6861-6870](src/extension/popup-entry.js) が `buckets.gift`/`buckets.ad` を後から代入) |
| `laneDiag` の `limit` 報告 | [healthCells.test.js:596](src/lib/healthCells.test.js) 等が `limit: 48` を期待。上限撤廃時の報告値の意味が変わる |
| paint の重さ | §5.6 の前科。522人規模は未実測 |

---

## 7. 未確認の前提（推測と明記）

1. **522人規模で paint が重くなるか — 未実測。** 過去 200 は動いていた形跡があるが、性能ログは未確認。
2. **512KB を何人で使い切るか — 未実測。** §5.4/5.5 の通り1人あたりは小さいが、実測値がない。
3. **`everSeenMax` の実配信値 — 未取得。** Phase 1 計器は入っているが速報が1枚も取れていない。522 は過去の記録であり、現在値ではない。
4. **消えた人が実際に発生しているか — 未実測。** 計器は「消えた人 0人 ✅」を出す用意があるが、実配信の結果が未確認。
5. **推測**: 上限撤廃だけで「消えない」は概ね満たされる可能性がある(§4.2 で消失の実行者が `limit` と特定できたため)。ただし `everSeen` による蓄積が無いと、**候補自体から消えた人**(storage の prune 等)は依然として消える。この経路の実在は**未確認**。

---

## 8. 実装前に決める必要がある質問（Fable への論点）

### A. `everSeen` を描画に使う設計
毎 paint 再構築なのに「一度出た人」をどう残すか。候補から消えた人のタイル情報(`displaySrc`/`title`/`meta`)は誰がどこに保持するか。メモリ上の Set だけで足りるか、storage 永続化が要るか(popup 再起動 / iframe リロードで消えないか)。

### B. 上限撤廃の範囲と ①=③ 一致
レーン(①)と鏡(③)で上限の意味が違い、鏡は 512KB 制約がある(§5.2)。「レーンは無制限・会場は容量内で最大」と**非対称にしてよいか**。それは §5.1 のパリティ契約・`contentHash`・scene 行の🔴を壊さないか。壊すなら一致の定義をどう変えるか。

### C. 性能対策の投入時期
522人規模の対策(仮想スクロール/差分描画/タイル軽量化)を**今入れるか、実測後か**。§5.6 の前科があり、かつ §7-1 が未実測。**過剰実装と実測不足のどちらのリスクを取るか**。

### D. 「消えない」と「段の移動」の両立
§4.3 の通り `avatarObserved` で段が上がりうる。ユーザーには「移動」に見えるが消失ではない。これを許容するか、段も固定するか。

### E. 退行検知（実配信を待たずに証明する形）
既存 [laneRosterDelta.js](src/lib/laneRosterDelta.js) の計器をどう活かすか。`droppedTotal > 0` を**テストで赤くできる**形にできるか。

---

## 9. セルフチェック

- [x] ファイル名の列挙で終わっていない(§4 で「なぜ消えるか」を実行者レベルで特定)
- [x] 既存仕様を守る理由(§5.1 パリティ地雷 / §5.2 512KB / §5.6 DOM走査禁止)
- [x] ユーザー体験上の制約(§0 不変条件 / §4.3 段の移動)
- [x] データ保存・互換性・失敗時の挙動(§5.2 cap半減 / §5.5 匿名再生成 / §6)
- [x] 事実と推測の分離(§7 で未確認を5件明示)
- [x] 重要判断への根拠(commit `df13033b` / `laneDiag.js:7` / `popup-entry.js:6714`)

**特記**: §5.3 で「200→48 は性能理由ではない」を commit 本文で確定できたことが、本件最大の発見。
上限撤廃の主要な反対根拠が1つ消えた。
