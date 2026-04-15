# 応援ユーザーレーンと応援グリッドのサムネ経路（棚卸し）

## ユーザーレーン（`renderStoryUserLane`）

| 段 | 入力・関数 | 備考 |
|----|------------|------|
| HTTP 一次候補 | `storyGrowthAvatarSrcCandidate(entry, liveId)` | `resolveSupportGrowthTileSrc`・視聴者/配信者マスク込み |
| レーン用 HTTP マージ | `userLaneHttpForTilePick(uid, httpFromGrowth, entry.avatarUrl)` | `supportGridPersonalThumbPreferredUrl` と合成 canonical 除外を共有 |
| 段階（3/2/1） | `userLaneProfileCompletenessTier(entry, httpFromGrowth)` | 実体は `supportGridDisplayTier`（`httpAvatarCandidate` + `storedAvatarUrl`） |
| タイル src | `pickStoryUserLaneCellDisplaySrc` | 匿名・こん太/たぬ姉で HTTP を落とす Identicon 経路 |
| メタ行 | `storyUserLaneMetaLines(entry, httpForLane, dedupeKey)` | `hasHttp` はマージ後 URL と一致させる |
| ソート | `userLaneResolvedThumbScore(uid, httpForLane)` | 上と同じ HTTP |
| 表示ラベル | `storyGrowthDisplayLabel(entry, liveId)` | 視聴者自己投稿など（popup 専用） |

集約先: [`src/lib/storyUserLaneRowModel.js`](../src/lib/storyUserLaneRowModel.js) の `buildStoryUserLaneCandidateRow` が上記のうち tier / http マージ / displaySrc / thumbScore を一括生成。

### ニコ匿名 ID（`a:`）と「こん太」段

- **応援グリッド**（[`supportGridDisplayTier`](../src/lib/supportGridDisplayTier.js)）: ルール適用後に `demoteNiconicoAnonymousFromKontaTier` で、**`isNiconicoAnonymousUserId`（`a:` 形式）かつ tier が konta のときだけ tanu に落とす**。数値 ID の konta は据え置き。
- **ユーザーレーン**（[`userLaneProfileCompletenessTier`](../src/lib/storyUserLaneRowModel.js)）: レーン専用分岐のあと、**`a:` かつ profileTier 2（こん太相当）→ 1（たぬ姉）** に揃え、グリッドと同趣旨にする。

## 応援グリッド（`sceneStoryGrowth` / `applyStoryGrowthIconAttributes`）

| 段 | 入力・関数 | 備考 |
|----|------------|------|
| タイル src | `storyGrowthTileSrcForEntry(entry, liveId)`（`popup-entry.js`） | `userLaneHttpForTilePick(uid, candidate, entry.avatarUrl)` でレーンと同じマージ後、無ければ `pickSupportGrowthTileForStory` |

## 重複・共有の印

- **個人サムネの定義**: [`supportGridPersonalThumbPreferredUrl`](../src/lib/supportGridDisplayTier.js) — グリッドもレーンも参照。
- **合成 canonical の除外**: `userLaneHttpForTilePick` — グリッドの HTTP 解決にも使用。
- **レーン 1 行の集約**: [`buildStoryUserLaneCandidateRow`](../src/lib/storyUserLaneRowModel.js) — tier / thumbScore / displaySrc / httpForLane。
