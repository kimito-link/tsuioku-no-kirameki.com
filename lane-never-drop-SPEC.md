# 応援レーン「一度出た人は絶対に消えない」実装仕様(SPEC)

- **設計**: Fable (claude-fable-5) / **地図・裏取り・実測**: 司令塔 (Claude Opus 5) / **日付**: 2026-08-02
- **地図(正本の事実)**: [lane-never-drop-MAP.md](lane-never-drop-MAP.md)
- **前提バージョン**: v0.1.1231 (master `e40a759c`)

---

## ★司令塔による裏取り結果(Fable設計後に実測・仕様の前提を更新)

HOWTO の定めにより、Fable の主張を実コード・実測で検証した。**結果、仕様の骨格は妥当だが、
最難関とされた論点Bの前提が実測でほぼ解消した。**

### 実測1: 鏡の 512KB は実質ボトルネックではない(★仕様の前提を更新)

`buildLaneMirrorSnapshot` に実データ相当のセルを流して実測(2026-08-02):

| 種別 | 1人あたり | 512KB で入る人数 | 522人での実サイズ |
|---|---|---|---|
| 実名(実URL・ニックネーム有) | **約 235 B** | **約 2,200 人** | **120 KB** |
| 匿名(B-1スリムセル) | **約 158 B** | **約 3,300 人** | **80 KB** |

- **2,000 人でも 461KB に収まり、cap 半減は一度も発動しなかった**(全件が鏡に残存)。
- → 地図 §7-2「512KB を何人で使い切るか未実測」は**解決**。答えは**数千人**。
- → **Fable の未解決質問 Q1「席数は数百規模か」への答え: 数千席。**
- → **論点B の「①=③ 非対称」は、現実の配信規模(数百人)ではほぼ発生しない。**
  非対称の設計(座席制)は「数千人超の極端な配信」への保険として意味を持つが、
  **Patch 2 の優先度は Fable の想定より低い**。Patch 1 単独で①③とも実用上 never-drop になる。

### 実測2: `slice(0, Infinity)` は全件通る(Fableの主張どおり)

`Math.max(0, Math.floor(Number(Infinity)||0))` → `Infinity`、`[1,2,3].slice(0, Infinity).length` → `3`。
→ [storyUserLaneBuckets.js](src/lib/storyUserLaneBuckets.js) は**無改修**で上限撤廃に対応できる(Fable の主張を確認)。

### 裏取り3: `healthCells` は `limit` を分岐に使っていない(Fableの主張どおり)

[healthCells.js:336-346](src/lib/healthCells.js) は `identified` / `laneShown` のみ参照。
→ `limit: 0`(無制限)報告で表示は壊れない。

### 裏取り4: ★前任が上限撤廃を見越して計器を仕込んでいた(新発見)

[healthCells.js:349-350](src/lib/healthCells.js) のコメント:

> 「**全員表示(limit撤廃)で重くなるかを実機1枚で確定するベースライン**。33ms(30fps相当)超で warn。」

→ **論点C「性能対策は実測後」というFableの判断は、この計器の存在によって強く支持される。**
   測る道具は既に配備済みで、あとは実配信1枚を取るだけ。

### 裏取り5: `venueBar.js` に「48前提」の固定仮定は無い(Fable assumption 5 を解消)

`grep '\b48\b' src/extension/venueBar.js` → CSS の色指定2箇所のみ([:1061](src/extension/venueBar.js), [:1183](src/extension/venueBar.js))。
席数・tier長の固定仮定はゼロ。→ **Patch 2 着手時の懸念材料が1つ消えた。**

### 裏取り6: `picked.length` の下流に上限前提は無い(Fable assumption 4 を解消)

[popup-entry.js](src/extension/popup-entry.js) の全参照(:6890, :6909, :6920, :6951, :6968, :7018, :7022, :7075, :7145)を確認。
すべて「実際の件数」として使用。48 を暗黙に仮定した箇所は**無し**。

### 裏取り7: `shouldKeepStoryUserLaneTilesOnShrink` は実在

[popup-entry.js:6893](src/extension/popup-entry.js) で呼ばれ、[renderStoryUserLaneDom.js:167](src/extension/story/renderStoryUserLaneDom.js) に実装。
→ Fable の「残す」判断(Further Notes 8)は妥当。

### 司令塔の結論(実測を踏まえた優先度の修正)

**Patch 1 だけで、現実の配信規模では①③とも「一度出た人が消えない」が成立する。**
Patch 2(座席制+B-2)は数千人超への保険であり、**MVP から外して後続 patch とする**ことを推奨する。
Fable の設計自体は正しいが、実測前だったため 512KB を過大に見積もっていた。

---

以下、Fable による設計本文(原文のまま。上記の実測を反映して読むこと)。

---

# lane-never-drop-SPEC.md — 応援レーン「一度出た人は絶対に消えない」実装仕様

- **最上位の不変条件(ユーザー確定・譲れない)**: その配信に来た人は、増えることはあっても、減って消えることは絶対にない。上限撤廃は決定事項。本仕様の論点は「どう安全に撤廃するか」のみ。

---

## 1. Problem Statement

### 何が起きているか

popup の応援レーン(①)は毎 paint 候補をゼロから作り直し、`bucketStoryUserLanePicks(candidates, limit)` が `limit`(INLINE=48 / 非INLINE=24)で 49 人目以降を黙って捨てる([popup-entry.js:6716](src/extension/popup-entry.js) / [storyUserLaneBuckets.js:10-22](src/lib/storyUserLaneBuckets.js))。順序は決定的([storyUserLaneSort.js:22-41](src/lib/storyUserLaneSort.js))なので「揺れて消える」のではなく、**新しい上位者が入るたびに下位の既存者が枠から押し出されて消える**。実害の記録: 522 人中 48 人表示・474 人が黙って隠れた([laneDiag.js:7](src/lib/laneDiag.js))。

### なぜ問題か(ユーザー体験)

配信者・視聴者にとってこのレーンは「この配信に来てくれた人の記録」。**さっきまで顔が出ていた人が消える**のは、応援した事実が無かったことにされる体験であり、プロダクトの理念(来た人をずっと記録する)への直接の裏切りになる。laneRosterDelta.js 冒頭([laneRosterDelta.js:4-14](src/lib/laneRosterDelta.js))に記録済みのユーザー要求そのもの。

### 制約(地図で確定済みの事実)

- 消失の実行者は `limit` であり sort ではない(§4.2)。
- 過去の 200→48 差し戻し(commit `df13033b`)は**性能理由ではない**(ロビー撤去に伴う設計整理+二重スクロール解消)。性能で否決された履歴は存在しない(§5.3)。
- 鏡(③会場)には 512KB の物理上限があり、超えると cap 半減(最小16)で**かえって人が減る**([laneMirror.js:45,167-171](src/lib/laneMirror.js))。 ※★司令塔実測により、数千人までは発動しないことを確認(冒頭参照)
- limit と鏡 cap の分離は v0.1.1052 で ①211≠③99 のパリティ不一致を実際に起こした地雷(§5.1)。
- paint ごとの DOM 全走査は禁止(§5.6 前科あり)。

---

## 2. Solution

### 方針の骨格

**2つの patch に分割する**(AGENTS.md 1変更=patch1つ)。

- **Patch 1(MVP・①レーンの上限撤廃+名簿キーパー)**: ① の `limit` を撤廃し、同一配信内で候補から落ちた人もメモリ上の名簿(keeper)から復活合流させる。これだけで「本物」である ① の不変条件が成立する。
- **Patch 2(③鏡の座席制+匿名スリム化 B-2)**: 鏡を「cap で毎回切り直す」方式から「先着で着席・一度座ったら絶対降ろさない」座席台帳方式へ変え、512KB の物理制約下で ③ 側の never-drop を成立させる。あわせて匿名 identicon data URL を書き手側で落とし(B-2)、1人あたりバイト数を激減させて座席数を最大化する。

### 地図 §8 A〜E への回答(各1つの推奨・理由つき)

#### A. `everSeen` を描画に使う設計 → **観測計器はそのまま・描画用に別の「名簿キーパー」を新設。メモリ上の Map で足りる(storage 永続化は今回しない)**

- laneRosterDelta の `everSeen` は「★挙動は一切変えない(観測のみ)」と宣言された計器([laneRosterDelta.js:20](src/lib/laneRosterDelta.js))。計器を制御に流用すると「計器が壊れたら描画も壊れる」結合を作るので、**計器は審判のまま残し**、描画用には `laneRosterKeeper.js`(新規・純関数)を作る。keeper は uid → 最後に描いた候補行(displaySrc/title/meta/entry/profileTier/thumbScore/recentTexts)を丸ごと持つ。「候補から消えた人のタイル情報は誰が持つか」の答えは keeper。
- **storage 永続化が不要な理由**: 候補は storage 由来の集約(`aggList` ← `STORY_SOURCE_STATE.laneAggregates` / `storageRowsForCurrentLive`)から毎 paint 再構築される([popup-entry.js:6691-6696](src/extension/popup-entry.js))。popup 再起動・iframe リロード後もレーンは storage から同じ候補を復元できる。keeper が守る必要があるのは「**同一セッション中に候補集合から落ちた人**」だけで、この経路(storage prune 等)は地図 §7-5 で実在未確認。メモリ Map は最小コストの保険であり、永続化は計器(`droppedTotal`)が実配信で証拠を出してから Phase 3 として判断する。

#### B. 上限撤廃の範囲と ①=③ 一致 → **非対称を許容する。①=無制限、③=バイト予算内の「座席制」。一致の定義を「集合同一」から「③は①の接頭部分集合+差分を数字で宣言」へ再定義する**

- 512KB は外せない物理制約(純Web公開ペイロード上限・[laneMirror.js:8](src/lib/laneMirror.js))なので、①=③の集合同一を保ったままの上限撤廃は**物理的に不可能**。非対称は選択ではなく帰結。
  ※★司令塔注: 実測では数千人まで収まるため、現実の配信規模では非対称は発生しない(冒頭参照)。
- **contentHash / scene 行の 🔴 は壊れない**(実コードで確認済み): pop 側 Receipt も venue 側 Receipt も、どちらも publish された鏡スナップショットを `restoreLaneMirrorBuckets()` した復元正準形から計算している([popup-entry.js:7009,7132](src/extension/popup-entry.js) / [venueBar.js:4914,5163](src/extension/venueBar.js) / [laneMirror.js:159-161](src/lib/laneMirror.js))。つまり scene 一致検証は「①と会場が**同じ鏡世代**を見ているか」の検証であり、「①のDOMと③のDOMの人数が同じか」の検証ではない。鏡の中身を座席制にしても両 Receipt は同じ snapshot から出るので一致は保たれる。
- **v0.1.1052 の 211≠99 地雷の本質**は「黙って食い違った」こと。今回は `pickedLength`(③が実際に載せた席数)と `totalCandidates`(cap 前総数)を正直に載せ、③のフッターが「いま N 件を表示中(ほか M 人)」と**宣言的に**差分を出す(この誠実表示の器は 2026-07-14 Patch 1 で既に存在・[popup-entry.js:6921-6923](src/extension/popup-entry.js))。「必ずセットで変更」コメント([popup-entry.js:6714-6715,7420-7422](src/extension/popup-entry.js) / :973-975)は、新しい契約「③の席は①の名簿の部分集合・席は先着・降ろさない・差分はフッターで宣言」に書き換える。
- 席の与え方は **seniority(先着)方式**: 一度着席した uid は以後の sort 順位に関係なく席を維持し、空き予算がある限り新規を sort 順に着席させる。これで③も「増えることはあっても減らない」を満たす(満席後の新規は「ほか M 人」に計上され、席が空くことはない=単調)。

#### C. 性能対策の投入時期 → **今は入れない。実測後(計器ゲート方式)**

- 根拠1: §5.3 で性能否決の履歴が存在しないことが commit 本文で確定している。
- 根拠2: 計器が既に配備済み。`laneDiag.paintMs`(v0.1.1048 Phase0)が1 paint の所要 ms を測り、healthCells が 33ms(30fps 相当)超で warn セル「レーン描画速度」を出す([healthCells.js:348-361](src/lib/healthCells.js))。過剰実装(§5.6 の前科の再来リスク)より、**この計器で 522 人規模の実測を取ってから**必要最小の対策を入れる方が、このプロジェクトの「計器で確定させてから直す」流儀に一致する。
- 根拠3: §5.6 の前科の実体は「paint 毎の O(集約×N) storage 全件走査」([popup-entry.js:6726-6728](src/extension/popup-entry.js))であり、現行描画は tier 単位 diff-skip(`storyLaneTierBodyKey` 一致なら DOM 不触・[renderStoryUserLaneDom.js:307-312](src/extension/story/renderStoryUserLaneDom.js))+変化時のみ fragment 一括差替。構造が違う。
- ただし**次の一手を予約しておく**: paintMs>33ms が実配信で常態化したら、次 patch で `fillLaneTier` に「旧 body key が新 key の接頭辞なら末尾 append のみ」の高速路を足す(タイル再生成を新規分だけにする)。仮想スクロールはその次。ハード上限の復活は選択肢に**含めない**(決定事項)。

#### D. 「消えない」と「段の移動」の両立 → **段の移動は許容する(固定しない)。守るのは uid 単位の「存在」**

- 段の移動(tanu→link 等)は `avatarObserved` の後着観測による**改善方向**の変化で、既存設計(F3 v0.1.282・[popup-entry.js:6778-6787](src/extension/popup-entry.js))が意図した挙動。凍結すると「アイコンが取れたのに匿名段のまま」という別の不誠実を作る。
- 上限撤廃後は、段が上がった人が増えても**誰も押し出されない**ので、§4.3 の「間接的消失」は構造的に消滅する(地図の推測が構造的保証に変わる)。
- keeper・座席台帳とも **uid 単位**で管理する。段をまたいで移動しても keeper の記録は最新行で更新され、③の座席も失わない。

#### E. 退行検知 → **laneRosterDelta を「テストの審判」に昇格させ、実配信を待たずに vitest で赤くする**

- 新設の統合テスト(§5 参照)が、実物の `bucketStoryUserLanePicks` → keeper → `flattenStoryUserLaneBuckets` → `noteLaneRoster` パイプラインを複数 paint 連続で回し、**`snapshotLaneRosterDelta(state).droppedTotal === 0` を assert** する。候補の入れ替え(上位新規参入・候補喪失・段昇格)を固定シードで多数シナリオ生成するため、`limit` 復活・keeper 破損・座席剥奪のどの退行でも CI が赤くなる。
- 実配信では既存の状態速報1行(`formatLaneRosterDeltaLine`)がそのまま最終防衛線(「消えた人 0人 ✅」)。計器自体は今回一切変更しない。

---

## 3. User Stories

### 正常系
1. **視聴者としてコメントすると**、自分のタイルがレーンに現れ、その配信が終わるまで(何人来ても)消えない。
2. **配信終盤に 522 人来た配信でも**、①レーンには 522 人全員が並ぶ。フッターは「全員表示」系の表示になる(`totalCandidates == 表示数`)。
3. **会場(③)では**、席数(バイト予算内・想定数百席)まで先着で顔が並び、超えた分は「いま N 件を表示中(ほか M 人)」と正直に出る。一度出た顔は配信中ずっと出続ける。
   ※★司令塔実測: 席数は数千席のため、現実規模では「全員着席」になる。

### 空の状態
4. コメントゼロの配信では従来どおり空ガイド(`paintStoryUserLaneDomEmptyGuides`)。keeper も座席台帳も空のまま(初期状態の静けさ・死にデータを書かない)。

### 読み込み中(backfill 谷間)
5. 同一配信で heavy 経路の谷間に `entries` が一瞬空になっても、既存ガード `shouldKeepStoryUserLaneTilesOnEmpty` が先に効いて DOM を畳まない(この経路は不変)。谷間で候補集合だけ痩せた場合は keeper が全員を復活合流させるので、picked も痩せない。

### 失敗と再試行
6. 鏡の storage 書き込みが失敗しても best-effort(既存 `.catch(() => {})`)。次回 publish で座席台帳から同じ席が再現される(台帳はメモリ・書き込み失敗で座席を失わない)。
7. 万一バイト見積りの想定を超えて snapshot が 512KB を突破した場合のみ、既存の cap 半減フェイルセーフが最終防衛として発動する(発動=バグのシグナル。§7 地雷参照)。

### 古いデータとの互換性
8. 旧バージョンが書いた鏡(cap48・data URL 入り)を新コードが読む: `restoreLaneMirrorBuckets` は形を変えないので従来どおり描ける。
9. 新コードが書いた鏡(座席制・匿名スリム)を読む側: B-1 復元(v0.1.1112 出荷済み)が identicon を再生成するので、①と同じ顔がバイト同一で出る(既存テストが保証)。

### 別画面との競合
10. INLINE_PASSIVE(受動ビュー)は今までどおり鏡を**読むだけ**(書かない・[popup-entry.js:7417](src/extension/popup-entry.js) 不変)。座席台帳は書き手(本物 popup)だけが持つ。
11. status の健全度パネル: 上限撤廃後は `identified == laneShown` になるので「lane-count」セルは常時「N人 全員表示」(ok)側に落ちる。「表示M/素性N(他K)」の na 分岐はコード上残す(③の座席制側の宣言と役割が違うため削除しない)。

### 配信切替
12. `lid` が変わったら keeper・座席台帳・計器のすべてが独立にリセットされる(計器は既存 [laneRosterDelta.js:133-145](src/lib/laneRosterDelta.js) の流儀を踏襲)。前配信の人を持ち込まない。「ずっと残る」は同一配信内の約束。

---

## 4. Implementation Decisions

### Patch 1: ①レーン上限撤廃+名簿キーパー(MVP)

#### 1-1. 新規 `src/lib/laneRosterKeeper.js`(純関数・DOM/chrome 非依存)

```js
/** @typedef {{ entryIndex:number, profileTier:number, thumbScore:number, displaySrc:string,
 *   title:string, entry:{userId:string}, recentTexts:string[], meta:{idLine:string,nameLine:string} }} LaneCandidateRow */

/** 初期状態。 @returns {{ lid: string, rows: Map<string, LaneCandidateRow> }} */
export function makeLaneRosterKeeperState()

/**
 * 今回の候補に「過去に描いたが今回候補から落ちた人」を復活合流させ、名簿を更新する。
 * - lid 変化 → rows を作り直し(前配信を持ち込まない)、candidates をそのまま返す。
 * - 同一 lid → candidates に居ない rows の行を末尾に足して返す(復活行は最後に見た姿)。
 *   その後 rows を candidates の最新行で上書き更新(段移動・アイコン観測を反映)。
 * - ★呼び出しは sort の前。復活行も現行 comparator で正しい位置に並ぶ。
 * - ★DOM は一切読まない(§5.6)。O(candidates + rows) / paint。
 * @param {ReturnType<typeof makeLaneRosterKeeperState>} state
 * @param {{ liveId: unknown, candidates: LaneCandidateRow[] }} args
 * @returns {{ merged: LaneCandidateRow[], revivedCount: number }}
 */
export function applyLaneRosterKeeper(state, args)
```

uid は `String(row?.entry?.userId ?? '').trim()`(laneUserIdSet と同じ正規化)。uid 空の行は名簿対象外(現行 tier.js が tier0=除外にする流儀と一致)。

#### 1-2. `src/extension/popup-entry.js` の変更

- `:975` 付近: 定数を置き換える。
  ```js
  // 2026-08-02 lane-never-drop: 表示上限は撤廃(ユーザー確定の不変条件)。
  //   Infinity は bucketStoryUserLanePicks の slice(0, Infinity) で全件通過(テストで固定)。
  const STORY_USER_LANE_LIMIT_UNLIMITED = Number.POSITIVE_INFINITY;
  ```
  `STORY_USER_LANE_INLINE_LIMIT` は Patch 1 の時点では鏡 cap 用に**残す**(鏡は Patch 2 で座席制へ)。①と③がこの patch の間だけ非対称になるが、フッターの「ほか M 人」宣言が既にあるため v0.1.1052 型の「黙った不一致」にはならない(コメントに明記)。
- `:6716`: `const limit = STORY_USER_LANE_LIMIT_UNLIMITED;`(INLINE/非 INLINE とも撤廃。非 INLINE の 24 も同じ不変条件の対象。狭い表示は `.nl-main` スクロールが受ける)。
- `:6399` 付近: `const _laneRosterKeeperState = makeLaneRosterKeeperState();` を追加。
- `:6855` 直前(sort の前)に keeper を差し込む:
  ```js
  const { merged: rosteredCandidates } = applyLaneRosterKeeper(_laneRosterKeeperState, { liveId, candidates });
  rosteredCandidates.sort(compareStoryUserLaneCandidates);
  const buckets = bucketStoryUserLanePicks(rosteredCandidates, limit);
  ```
  以降 `candidates.length` を参照している 3 箇所(`noteLaneRoster` の candidateTotal / `paintStoryUserLaneDomFilled` の totalCandidates / `publishLaneDiag` の identified / `publishLaneMirror` の totalCandidates)はすべて `rosteredCandidates.length` に揃える(復活者も「素性が取れた人」として数える。数の二重帳簿を作らない)。
- `publishLaneDiag` の `limit`: **`0` を「無制限」の意味で報告する**。healthCells は limit を分岐に使っていない([healthCells.js:328-364](src/lib/healthCells.js) で確認済み)ため表示は壊れない。laneDiag.js の JSDoc に「0=無制限(v0.1.1232〜)」を追記。

#### 1-3. `src/lib/storyUserLaneBuckets.js`

コード変更**なし**(`Math.max(0, Math.floor(Number(Infinity)||0))` → Infinity、`slice(0, Infinity)` は全件。実装読解で確認済み)。ただし「Infinity サポートは契約」であることを JSDoc に1行追記し、テストで固定する(§5)。

### Patch 2: ③鏡の座席制+匿名スリム化(B-2)

#### 2-1. 新規 `src/lib/laneMirrorSeats.js`(純関数)

```js
/** 鏡のバイト予算(512KBハード上限に対する余裕枠。超過フェイルセーフを絶対に踏まない距離)。 */
export const LANE_MIRROR_SEAT_BYTE_BUDGET = 384 * 1024;

/** 初期状態。 @returns {{ lid: string, seated: Set<string> }} */
export function makeLaneMirrorSeatState()

/**
 * 座席プラン: 「着席済みは絶対降ろさない・新規は予算が許す限り先着(sort順)で着席」。
 * - lid 変化 → seated リセット。
 * - 1st pass: 各段のセルのうち uid ∈ seated を無条件採用(予算超過でも降ろさない)。
 * - 2nd pass: 未着席セルを段順(link→gift→ad→konta→tanu)・段内順で走査し、
 *   累計バイト(projectCell 適用後の JSON.stringify(cell).length 合算)が予算内なら着席+seated へ追加。
 * - uid 空のセル(照合キーなし)は毎回そのまま通す(座席管理外・従来挙動)。
 * @param {ReturnType<typeof makeLaneMirrorSeatState>} state
 * @param {{ liveId: unknown, buckets: Record<string, unknown[]>,
 *   byteBudget?: number, projectCell: (item: unknown) => object|null }} args
 * @returns {{ buckets: Record<string, unknown[]>, seatedTotal: number,
 *   waitlistedTotal: number, maxTierLen: number }}
 */
export function planLaneMirrorSeats(state, args)
```

#### 2-2. `src/lib/laneMirror.js` の変更(2点・最小)

- `toMirrorCell` を named export に昇格(`export { toMirrorCell as projectLaneMirrorCell }` 相当。座席プランのバイト見積りが鏡セル実形で行われることを保証する。buckets 生行で見積もると entry 等の余剰で過大見積り=席の取りこぼし)。
- **B-2(書き手スリム化)**: `toMirrorCell` 内で、`displaySrc === anonymousIdenticonDataUrl(userId, 64)` のとき `displaySrc: ''` に落とす。読み手 B-1(v0.1.1112 出荷済み)が同じ顔を再生成するので表示はバイト同一。**contentHash も不変**(hash は `restoreLaneMirrorBuckets` 適用後=復元正準形で署名するため・[laneMirror.js:159-161](src/lib/laneMirror.js)。scene 偽🔴を作らないことが構造的に保証されている)。前提条件「①の既定生成は size=64 とバイト一致」は既存テスト([laneMirror.test.js:214](src/lib/laneMirror.test.js))が既に固定している。

#### 2-3. `src/extension/popup-entry.js` `publishLaneMirror()` の変更

```js
const _laneMirrorSeatState = makeLaneMirrorSeatState(); // モジュールレベル

function publishLaneMirror(input) {
  if (INLINE_PASSIVE) return;
  try {
    const now = Date.now();
    const plan = planLaneMirrorSeats(_laneMirrorSeatState, {
      liveId: input.liveId, buckets: input.buckets, projectCell: projectLaneMirrorCell
    });
    // ★cap は plan.maxTierLen(有限)を渡す: slice は無発動、かつ 512KB 超の
    //   フェイルセーフ半減(有限値でしか機能しない)を最終防衛として生かす。
    const snap = buildLaneMirrorSnapshot(
      { ...input, buckets: plan.buckets,
        pickedLength: plan.seatedTotal,          // ③のフッターは③の実態を語る
        totalCandidates: input.totalCandidates },
      { cap: Math.max(1, plan.maxTierLen), nowMs: now }
    );
    mergeAndScheduleFlush('lane', snap, snap && snap.liveId, now);
  } catch { /* no-op */ }
}
```

- `STORY_USER_LANE_INLINE_LIMIT` 定数と cap 追随コメント(:973-975, :6714-6715, :7420-7422)を削除し、新契約コメントに差し替え:「③の席は①の名簿の部分集合。席は先着・一度座ったら降ろさない。①との差分は pickedLength/totalCandidates でフッターに宣言する。scene 一致検証は鏡世代同士の突合なので座席制の影響を受けない」。
- 512KB ハードガード([laneMirror.js:165-171](src/lib/laneMirror.js))は**削除しない**(fail-closed 最終防衛)。予算 384KB との差 128KB が「着席済みセルの recentTexts 成長」の吸収余地(recentTexts は3件固定・成長は有界)。

### 状態遷移(§12.1 要求)

| 状態 | 保持場所 | ライフサイクル |
|---|---|---|
| keeper 名簿 | popup メモリ(Map) | lid 変化でリセット / popup 終了で消滅(候補は storage から再建) |
| 座席台帳 | popup メモリ(Set) | lid 変化でリセット / popup 終了で消滅(次回は現候補 sort 順で再着席) |
| 鏡 snapshot | chrome.storage.local(既存キー) | 既存フローのまま(形は互換) |
| 計器 laneRosterDelta | popup メモリ | **不変更** |

### 失敗時 rollback

- Patch 1 rollback: `limit` を旧値に戻す1行+keeper 呼び出し2行の revert で v0.1.1231 と同一挙動。keeper は純関数追加なので残っても無害。
- Patch 2 rollback: `publishLaneMirror` を旧実装(cap:48)へ revert。鏡の形は互換なので読み手の変更不要。
- 検証: `npm run verify:cc`(`npm run verify` はハングするため使わない)。失敗時 `.artifacts/verify-cc.log` を読む。各 patch で manifest/package/changelog 同期+`npm run verify:bump`。

---

## 5. Testing Decisions

vitest・`src/lib/*.test.js` colocation・describe/it 日本語の既存流儀に従う。

### `src/lib/laneRosterKeeper.test.js`(新規)
- `describe('makeLaneRosterKeeperState')`
  - `it('初期状態は空名簿・lid空')`
- `describe('applyLaneRosterKeeper')`
  - `it('lid切替で名簿をリセットする(前配信の人を持ち込まない)')`
  - `it('同一lidで候補から落ちた人を merged に復活させる(revivedCount 一致)')`
  - `it('復活行は最後に見た displaySrc/title/meta/tier を保持する')`
  - `it('同一uidは現行候補が優先(最新行で名簿を上書き・mergedに重複を作らない)')`
  - `it('候補が空でも名簿全員を返す(谷間で誰も消えない)')`
  - `it('uid空の行は名簿に入れない(tier0除外の流儀と一致)')`
  - `it('段昇格(tanu→link)しても名簿はuid単位で1件のまま')`

### `src/lib/storyUserLaneBuckets.test.js`(追記)
- `it('maxTotal=Infinity で全候補を返す(切り捨てゼロ・段の順序は不変)')`
- `it('有限maxTotalの既存挙動は不変(回帰)')`

### `src/lib/laneNeverDrop.integration.test.js`(新規・E の審判)
実物の `bucketStoryUserLanePicks` + `applyLaneRosterKeeper` + `flattenStoryUserLaneBuckets` + `noteLaneRoster` を直結する。
- `it('連続paint(固定シードで候補を増減・入れ替え)しても droppedTotal===0(laneRosterDelta審判)')`
- `it('上位tierの新規参入で下位の既存者が押し出されない(旧limit=48の消失シナリオ再現→緑)')`
- `it('522人規模の候補で picked に全員が含まれる(laneDiag.js:7 の実害の再現→緑)')`
- `it('lid切替では dropped と数えない(正当なリセット)')`
- `it('【退行検知の自己証明】limitを48に戻すと droppedTotal>0 で赤くなることを内部確認する(審判が眠っていないことの証明)')`

### `src/lib/laneMirrorSeats.test.js`(新規・Patch 2)
- `it('初回は予算内で段順→段内順の先着で着席させる')`
- `it('一度着席したuidは次回sortで下位に落ちても座席を維持する')`
- `it('予算超過後の新規は着席させない(waitlistedTotal計上・seatedは不変)')`
- `it('着席済みは予算超過状態でも絶対に降ろさない')`
- `it('lid切替で座席をリセットする')`
- `it('段移動しても座席を失わない(uid単位)')`
- `it('uid空セルは座席管理外で毎回通す(gift/ad匿名セルの従来挙動)')`

### `src/lib/laneMirror.test.js`(追記・Patch 2)
- `it('B-2: 既定identicon一致のdisplaySrcは書き手で空に落ち、B-1復元でbyte同一に戻る(往復)')`
- `it('B-2適用前後で contentHash が不変(復元正準形署名の構造保証・scene偽🔴なし)')`
- `it('cap=最大段長のとき slice 無発動で全席が鏡に載る')`

### 触らないことを確認するテスト(既存・回帰)
- `laneRosterDelta.test.js` / `healthCells.test.js`(:596 の `limit: 48` ケース含む)/ `venueLaneParity.wiring.test.js` / `venueHoverRecentTexts.integration.test.js` は**修正なしで緑のまま**が合格条件(laneDiag・healthCells の純関数は不変更、鏡の形は互換のため)。1件でも赤くなったら互換を壊しており設計違反。
- 実行: `npm run test:cc` / 全体 `npm run verify:cc`。

### 実機(reality-checker 委任)
- 実配信1本で状態速報の「消えた人 0人 ✅ / 来た人 累計N人」行と「レーン描画速度」セル(paintMs)を採取。scene 行が ✅ のままであることを確認。

---

## 6. Out of Scope(今回やらないこと)

1. **keeper の storage 永続化**(popup 再起動を跨ぐ名簿)— 候補は storage 集約から再建されるため必要性未証明。計器の実配信証拠が出てから Phase 3。
2. **仮想スクロール・タイル軽量化・fillLaneTier append 高速路** — C の判断どおり実測後。
3. **③会場の完全無制限化** — 512KB は物理制約。座席制+B-2 で実効席数を最大化するまで。
4. **storage prune 経路そのものの修理** — 実在未確認(§7-5)。keeper が症状を吸収し、計器が実在を証明したら別件。
5. **座席台帳の再起動復元**(前回 snapshot からのシード)— 席数が典型配信の人数を大きく上回る見込みのため。未解決の質問 Q2 参照。
6. **状態速報・scene 受領証の再設計 / laneDiag・healthCells の表示文言変更** — 純関数は不変更。
7. **非 INLINE(24枠だった狭い popup)のレイアウト追い込み** — スクロールに委ねる。崩れたら別 patch。

---

## 7. Further Notes(実装時の地雷)

1. **keeper は sort の前に差し込む**。sort 後に足すと復活行が段の末尾に固まらず表示順契約(popup=venue 同一 comparator)を壊す。
2. **`candidates.length` 参照の置き換え漏れ**に注意(§4 1-2 の4箇所)。1箇所でも漏れると「素性N」と「表示M」の帳簿が割れ、healthCells が偽 na を出す。
3. **`buckets.gift` / `buckets.ad` は bucket 後に代入される**([popup-entry.js:6861-6869](src/extension/popup-entry.js))。keeper はりんく/こん太/たぬ姉の candidates だけを扱い、gift/ad には触らない(別供給源・座席制では uid 有りセルのみ管理)。
4. **512KB フェイルセーフの半減は有限 cap でしか働かない**。`buildLaneMirrorSnapshot` に Infinity や MAX_SAFE_INTEGER を渡すと半減が無力化し、超過 snapshot がそのまま書かれ得る(現行実装はループ2回後に検査せず返す)。必ず `plan.maxTierLen`(有限)を渡す。
5. **フェイルセーフ半減が発動したら座席剥奪=不変条件違反**。発動は「予算見積りのバグ」のシグナル。実装時、発動を既存 lane diag 系のどこか(観測のみ)に数えられるなら1カウンタ足してよいが、新規 storage キーは作らない。
6. **B-2 の一致判定は「既定生成(size=64)とのバイト一致」のみ**で行う。部分一致や `data:image` 接頭辞判定で落とすと、実サムネの data URL(もし存在すれば)まで消して別人化する。
7. **`storyUserLaneRenderSignature` は picked 全体から作られる**。522 人規模で署名文字列が長くなるが文字列比較1回/paint であり許容。署名の間引き(hash 化)は今回しない(diff-skip キー揺れ=churn 再発の既知地雷・[laneSceneEnvelope.js:10-11](src/lib/laneSceneEnvelope.js) と同種)。
8. **`shouldKeepStoryUserLaneTilesOnShrink`(縮み防止ガード)は残す**。keeper 導入後 picked は単調成長するため実質発動しなくなるが、撤去は別判断(暫定 supply レースの防衛が本務)。
9. **INLINE_PASSIVE は keeper も座席台帳も持たない**(書き手専用状態)。passive 側に足すと②の不可侵原則(鏡を書かない)を破る入口になる。
10. **コメント書き換え忘れ**: :973-975 / :6714-6715 / :7420-7422 の「必ずセットで変更」注記は Patch 2 で必ず新契約文に置換する。古い注記が残ると次の改修者が座席制を「地雷違反」と誤読して差し戻す(このリポはコメントが運用の正本になる文化)。
11. **AGENTS.md §12.1**: 本件は複数ファイル+状態+storage 形式に関わるため Plan 先行必須。本 SPEC を Plan の本文として流用してよいが、EnterPlanMode → 承認の手順は省略しない。
12. Windows 環境: 検証は `npm run verify:cc` / `npm run test:cc` のみ。パイプ付き vitest・`npm run verify` は使わない(ハング既知)。

---

## 未解決の質問

1. **Q1: 実効席数の実測値** — ★**司令塔が実測して解決済み**。実名 約235B/人・匿名 約158B/人。512KB で実名約2,200人・匿名約3,300人。384KB 予算なら実名約1,600席。**recentTexts 削減は不要**。
2. **Q2: popup 再起動後の③座席の連続性** — 台帳はメモリのため、再起動直後の再着席は「その時点の sort 順」で行われ、満席規模の配信では再起動前と席の顔ぶれが変わり得る(①は storage 再建で不変)。席数 ≫ 実人数なら実害なし。★実測で席数≫実人数が確定したため**実害なし**の見込み。
3. **Q3: 非 INLINE(狭い popup)で数百人表示したときの見た目** — スクロールで機能はするが、UX として区切り・折りたたみが要るかはユーザーの実機確認待ち。**未解決**。
4. **Q4: paintMs 33ms 超が常態化した場合の対策着手ライン** — 「何配信・何割の paint で超えたら次 patch に入るか」の閾値はユーザーと合意して決める(計器値は状態速報で採れる)。**未解決**。

## 仕様に根拠がない断定(assumption list)

1. **「候補から消える経路(storage prune 等)は稀」** — 地図 §7-5 のとおり実在未確認。keeper はこの未確認経路への保険であり、必要十分性は実配信の `droppedTotal` でしか証明できない。**未解決**。
2. **「522 人規模でも現行描画方式(tier 単位一括差替)が 33ms 内に収まる」** — 未実測(§7-1)。本仕様は「計器で測ってから直す」を選んだが、初回実測で warn が出る可能性はある。**未解決(ただし計器は配備済み)**。
3. **「B-2 で匿名セルの大半がスリム化され、席数が数百規模になる」** — ★**司令塔実測により解決**。席数は数千規模。
4. **「① unlimited 化で `storyUserLaneRenderSignature` / shrink ガード / probe 系に副作用が出ない」** — ★**司令塔が `picked.length` の全下流参照(9箇所)を確認し、48を暗黙前提とする箇所が無いことを検証済み**。
5. **「venue 側に『鏡セル数 ≤ 48』を仮定したレイアウト・ループがない」** — ★**司令塔が `venueBar.js` の `48` を全数確認。CSS 色指定2箇所のみで席数仮定は無し**。
