# 応援レーン「サムネが減る」— 実装ハンドオフ

**この1枚で着手できる。** 地図・仕様・裏取りは完了済み。

- **地図**: [lane-tiles-vanish-MAP.md](lane-tiles-vanish-MAP.md)
- **仕様**: [lane-tiles-vanish-SPEC.md](lane-tiles-vanish-SPEC.md)(冒頭に司令塔の裏取り4件)
- **前提**: v0.1.1232 出荷済み / ブランチ `feat/lane-never-drop` / 作成 2026-08-02

---

## 0. ユーザー確定の不変条件(議論の対象外)

> その配信に来た人は、増えることはあっても、減って消えることは絶対にない。

ユーザー報告: 「はじめ見たときよりレーン表示のサムネが減っているような」

---

## 1. いちばん大事なこと(先に読む)

**穴3 は司令塔が v0.1.1232 で作り込んだバグ。** これが最優先。

[laneRosterKeeper.js](src/lib/laneRosterKeeper.js):

```js
if (lid !== state.lid) {     // ★lid='' (URL不明) でもここに来て名簿が全消去される
  state.rows = new Map();
```

`liveId` が空になる窓は実在する([popup-entry.js:8989](src/extension/popup-entry.js) `if (!hasWatch)` → `syncStorySourceEntries('', [])`)。
**空文字は「配信が変わった」ではなく「不明」。** 区別していなかった。

司令塔のテストにも `lid=''` のケースが無い(テストの穴)。

---

## 2. スコープ

| Patch | 内容 | MVP |
|---|---|---|
| **0** | 司令塔の未コミット修正(`:14940` の `{provisional:true}` + 配線テスト3件) | **やる** |
| **3** | `lid=''` を配信切替扱いしない(**穴3・最優先**) | **やる** |
| **2** | 縮小ガード厳格化(`next < prev`)+ 10分の非常口 | **やる** |
| 4 | `provisional` 既定を fail-closed に | 同スプリント推奨 |
| 5 | 一致検証の正直化(①DOM=①鏡を足す・ラベル修正) | 同スプリント推奨 |
| 6 | 状態速報の時点注記 | 任意 |

**MVP = Patch 0 + 3 + 2。優先度は 3 > 2**(3 は実在確認済みのバグ、2 は不変条件からの正当な強化)。

---

## 3. 着手手順

```bash
git switch feat/lane-never-drop
```

未コミット変更（Patch 0 相当）が既に載っている。`AGENTS.md §12.1` の**着手前ゲート必須**
(複数ファイル+状態管理)。本ハンドオフと SPEC を Plan 本文に使ってよいが手順は省略しない。

TDD。**先にテストを赤くしてから実装する。**

---

## 4. 実装ステップ

### Step 0: Patch 0 をコミット

既に緑。`npm run verify:cc` を通してコミットするだけ。

### Step 1: Patch 3(穴3・最優先)

**SPEC §4 Patch 3 の通り。** 変更3ファイル:

1. [laneRosterKeeper.js](src/lib/laneRosterKeeper.js) — `if (lid && lid !== state.lid)` に変更
   （空は切替扱いしない。空のときは復活合流パスへ落ちる）
2. [renderStoryUserLaneDom.js](src/extension/story/renderStoryUserLaneDom.js) — `OnEmpty`/`OnShrink` 共通で
   `if (!last) return false; if (cur && cur !== last) return false;` に変更
3. `storyUserLaneRenderProbe.js` — `emptyLidRenderCount` を追加（仮説の本番検証計器）

テストは **SPEC §5 の T-2 / T-4** をそのまま使う。

### Step 2: Patch 2(厳格化+非常口)

**SPEC §4 Patch 2 の通り。** 要点:

- `shouldKeepStoryUserLaneTilesOnShrink` の判定式を `next < prev` に（シグネチャ不変）
- `STORY_USER_LANE_SHRINK_KEEP_RATIO` を削除（参照はテスト2ファイルのみ・同 patch で更新）
- `laneShrinkKeepExpired` + `STORY_USER_LANE_SHRINK_KEEP_MAX_MS = 10分` を新設（**出口4**）
- `detectStoryUserLaneShrink` の既定 ratio を 1 に（計器とガードの定義を揃える）

テストは **SPEC §5 の T-1 / T-3 / T-5 / T-7**。

**★T-3（台本テスト）が本件の要。** 「減らない」と「固着しない」を同時に守る:

- 台本A: 今回の症状（36→26 で keep → 回復37で描く）
- 台本B: `27cf7b30` の固着（200→74連発は keep → settle後は必ず描ける）
- 台本C: 出口4（10分で非常口が開く）
- 台本D: 穴3（`lid=''` を挟んでも消えない）

---

## 5. 機械的な完了判定

```bash
npm run verify:cc
```

- [ ] `verify:cc` 全9ステップ緑（失敗時は `.artifacts/verify-cc.log` を Read）
- [ ] 新規・更新テストが緑（T-1〜T-5, T-7）
- [ ] **既存テストで意図的に書き換えるのは1件だけ**:
      `renderStoryUserLaneDom.test.js:225` 「微減(200→190=95%)は keep=false」→ 反転
      （**契約変更**。それ以外の既存テストを修正したら設計違反）
- [ ] 変異テスト: `lid &&` を外す → T-4 が赤くなる → 復元
- [ ] 変異テスト: `next < prev` を `next < prev*0.6` に戻す → T-1/T-3 が赤くなる → 復元
- [ ] `npm run verify:bump`（1変更=patch1つ）

**自己採点しない。** 実装後は `reality-checker` に検証を委任（SPEC §5 が土台）。

---

## 6. 地雷（踏むと戻される）

SPEC §7 の全10件を読むこと。特に致命的:

1. **keep 時に sig を更新しない構造を絶対に崩さない**([popup-entry.js:6906-6925](src/extension/popup-entry.js))。
   これが「settle 後の本描画が必ず通る」＝固着回避の生命線（v1032 退行の教訓）
2. **`OnEmpty` の変更は「`!cur` かつ `last` あり」の分岐だけに限定**。
   真の空・切替で畳む正当経路は生かす
3. **`STORY_USER_LANE_SHRINK_KEEP_RATIO` を消したら参照2箇所も同 patch で**
4. **配線テストはソース文字列検査型**。判定式を書き換えたら正規表現も同時に更新
5. `laneShrinkKeepExpired` の `nowMs` は `Date.now()`。`performance.now` を混ぜない

---

## 7. 押さえておくべき背景

- **上限撤廃・名簿は無罪**（`droppedTotal=0` / `cappedOutTotal=0` で実証）。これは DOM 描画層の別バグ
- **「①=③一致 ✅」は画面を見ていない**。[liveviewPublishSelfDiag.js:294](src/lib/liveviewPublishSelfDiag.js) は
  鏡の値同士を比べている。だから「✅なのにサムネが減る」が起きた（Patch 5 で正直化）
- **会場側の `①DOM=鏡` は健全**。[venueLaneParity.js:396](src/lib/venueLaneParity.js) は実DOMを見ている（裏取り済み）
- **司令塔の「72%」は誤算だった**。時点の違う数字（鏡37秒前/DOM77秒前）を割ったもの。
  実際の検知器は既定 ratio=0.6 なので、**起きた縮小は60%未満**。観測事象は穴1+穴3で説明がつく
- **0.6 の根拠は元々どこにも無い**（commit `27cf7b30` にもコードにも）。段Bで根治した際の保険として残った値

---

## 8. 実機で取るべき数字（実装後）

```
→ レーンの人物: 消えた人 0人 ✅ / 来た人 累計N人
⚠ lid不明のまま render N 回          ← 新設・穴3が実際に起きていたかの答え
⚠ keep 期限切れで縮小描画 N 回        ← 新設・0 であるべき
```

`emptyLidRenderCount > 0` なら**穴3は実配信で起きていた**と確定する。
