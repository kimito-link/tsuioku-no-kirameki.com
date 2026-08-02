# 応援レーン「一度出た人は消えない」— 実装ハンドオフ

**この1枚で着手できる。** 地図・仕様・実測は完了済み。次のセッションはここから読む。

- **地図**: [lane-never-drop-MAP.md](lane-never-drop-MAP.md)(司令塔の実コード裏取り)
- **仕様**: [lane-never-drop-SPEC.md](lane-never-drop-SPEC.md)(Fable 設計 + 司令塔の実測裏取り)
- **前提**: v0.1.1231 (master `e40a759c`) / 作成 2026-08-02

---

## 0. ユーザー確定の不変条件(最上位・議論の対象外)

> **「とにかく1度出た人は制限がなくずっと出るように」**
> = その配信に来た人は、増えることはあっても、減って消えることは絶対にない。

**上限撤廃は決定事項。** 「上限を残した方が安全では」という提案は却下済み。
論点は「どう安全に撤廃するか」だけ。

---

## 1. スコープ(MVP = Patch 1 のみ)

**Patch 1 だけ実装する。Patch 2 は今回やらない。**

司令塔の実測により、鏡(会場)の 512KB は実名 約2,200人・匿名 約3,300人まで収まることが判明した。
Fable が「最難関」とした ①=③ の非対称は、**現実の配信規模(数百人)では発生しない**。
したがって Patch 2(座席制)は数千人超への保険であり、MVP から外す。

| | 内容 | 今回 |
|---|---|---|
| **Patch 1** | ①レーンの上限撤廃 + 名簿キーパー(keeper) | **やる** |
| Patch 2 | ③鏡の座席制 + 匿名スリム化 B-2 | やらない(後続) |

---

## 2. 着手手順

```bash
git switch -c feat/lane-never-drop
```

**先に `git restore app/dist/live-view.js extension/dist/popup.js extension/dist/status.js` で
ビルドID だけの差分を捨てておく**(司令塔が中身を確認済み・ロジック変化ゼロ)。

**AGENTS.md §12.1 の着手前ゲート必須**(複数ファイル+状態変更のため)。
本ハンドオフと SPEC を Plan 本文として使ってよいが、EnterPlanMode → 承認の手順は省略しない。

TDD で進める(テストを先に赤くしてから実装)。

---

## 3. 実装ステップ

### Step 1: `src/lib/laneRosterKeeper.js` を新規作成(純関数)

シグネチャは **SPEC §4 の 1-1** をそのまま使う。要点:

- `makeLaneRosterKeeperState()` → `{ lid: string, rows: Map<string, LaneCandidateRow> }`
- `applyLaneRosterKeeper(state, { liveId, candidates })` → `{ merged, revivedCount }`
- lid 変化でリセット / 同一 lid では候補から落ちた人を末尾に復活合流
- uid は `String(row?.entry?.userId ?? '').trim()`、uid 空は名簿対象外
- **DOM を読まない**(§5.6 の前科)。O(candidates + rows)

テストは **SPEC §5 の `laneRosterKeeper.test.js`** の 8 ケース名をそのまま使う。

### Step 2: `src/lib/storyUserLaneBuckets.js` に JSDoc 1行 + テスト追加

**コード変更なし。** `slice(0, Infinity)` が全件通ることは司令塔が実測確認済み。
「Infinity サポートは契約」を JSDoc に明記し、テスト2件で固定する(SPEC §5)。

### Step 3: `src/extension/popup-entry.js` を配線

**SPEC §4 の 1-2 の通り。** 変更は4箇所:

1. `:975` 付近 — `STORY_USER_LANE_LIMIT_UNLIMITED = Number.POSITIVE_INFINITY` を追加
   (`STORY_USER_LANE_INLINE_LIMIT` は鏡 cap 用に**残す**)
2. `:6716` — `const limit = STORY_USER_LANE_LIMIT_UNLIMITED;`
3. `:6399` 付近 — `const _laneRosterKeeperState = makeLaneRosterKeeperState();`
4. `:6857` の sort の**直前** — keeper を差し込み、以降 `candidates.length` を
   `rosteredCandidates.length` に揃える(**4箇所・漏らさない**)

さらに `publishLaneDiag` の `limit` は **`0`(=無制限の意味)** で報告する。
`laneDiag.js` の JSDoc に「0=無制限(v0.1.1232〜)」を追記。

### Step 4: 統合テスト `src/lib/laneNeverDrop.integration.test.js` を新規作成

**これが本件の審判。** SPEC §5 の 5 ケース名をそのまま使う。特に:

- `it('522人規模の候補で picked に全員が含まれる(laneDiag.js:7 の実害の再現→緑)')`
- `it('【退行検知の自己証明】limitを48に戻すと droppedTotal>0 で赤くなることを内部確認する')`

後者は**テスト自体が眠っていないことの証明**なので必ず入れる。

---

## 4. 機械的な完了判定

```bash
npm run verify:cc
```

- [ ] `verify:cc` 全ステップ緑(失敗時は `.artifacts/verify-cc.log` を Read)
- [ ] 新規テスト `laneRosterKeeper.test.js`(8件)・`laneNeverDrop.integration.test.js`(5件)が緑
- [ ] **既存テストを1件も修正せずに緑**: `laneRosterDelta.test.js` / `healthCells.test.js`
      (`limit: 48` ケース含む)/ `venueLaneParity.wiring.test.js` /
      `venueHoverRecentTexts.integration.test.js`
      → **1件でも赤くなったら互換を壊しており設計違反**
- [ ] 変異テスト: keeper の復活ロジックを一時的に壊す → 統合テストが赤くなる → 復元
- [ ] `npm run verify:bump`(manifest/package/changelog 同期・1変更=patch1つ)

**自己採点しない。** 実装後は `reality-checker` エージェントに検証を委任する
(SPEC §5「Testing Decisions」が検証依頼の土台)。

---

## 5. 地雷(踏むと戻される)

SPEC §7 の全12件を読むこと。特に致命的なもの:

1. **keeper は sort の前に差し込む。** 後に足すと表示順契約(popup=venue 同一 comparator)が壊れる。
2. **`candidates.length` の置き換えは4箇所全部。** 1箇所でも漏れると帳簿が割れて healthCells が偽 na を出す。
3. **`buckets.gift` / `buckets.ad` には触らない。** bucket 後に別供給源から代入される([popup-entry.js:6861-6869](src/extension/popup-entry.js))。
4. **`shouldKeepStoryUserLaneTilesOnShrink` は残す。** 実質発動しなくなるが撤去は別判断。
5. **INLINE_PASSIVE には keeper を持たせない。** 鏡を書かない原則を破る入口になる。
6. **`buildLaneMirrorSnapshot` に Infinity を渡さない。** 512KB フェイルセーフの半減は
   有限 cap でしか働かず、無力化すると超過 snapshot がそのまま書かれる。
   → Patch 1 では鏡 cap は `STORY_USER_LANE_INLINE_LIMIT`(48)のまま**触らない**。

---

## 6. Patch 1 完了後に残る「未解決」

| # | 内容 | 解き方 |
|---|---|---|
| Q3 | 非INLINE(狭いpopup)で数百人表示した見た目 | ユーザーの実機確認待ち |
| Q4 | paintMs 33ms 超が常態化した場合の着手ライン | ユーザーと閾値を合意 |
| A1 | 候補から消える経路(storage prune 等)の実在 | 実配信の `droppedTotal` で判明 |
| A2 | 522人で paint が 33ms 内に収まるか | **計器は配備済み**([healthCells.js:349](src/lib/healthCells.js))。実機1枚で確定 |

**実機で取るべき1行**(状態速報):

```
→ レーンの人物: 消えた人 0人 ✅ / 来た人 累計N人
```

加えて健全度パネルの「**レーン描画速度**」セル(`paintMs`)を読む。33ms 超なら
SPEC §2-C の「次の一手」(`fillLaneTier` の append 高速路)へ。**上限復活は選択肢に含めない。**

---

## 7. 押さえておくべき背景(なぜこの設計か)

- **48 に戻した理由は性能ではない。** commit `df13033b` の本文は「ロビー撤去に伴う設計整理+
  二重スクロール解消」。**性能で否決された履歴は存在しない**(司令塔が commit 本文で確認)。
- **前任は上限撤廃を見越して計器を仕込んでいた。** [healthCells.js:349](src/lib/healthCells.js) に
  「全員表示(limit撤廃)で重くなるかを実機1枚で確定するベースライン」と明記。
- **`everSeen` は計器のまま残す。** 制御に流用すると「計器が壊れたら描画も壊れる」結合になる。
  描画用は別モジュール(keeper)を新設する。
- **段の移動(tanu→link)は許容する。** `avatarObserved` の後着観測による改善方向の変化であり、
  消失ではない。守るのは uid 単位の「存在」。
