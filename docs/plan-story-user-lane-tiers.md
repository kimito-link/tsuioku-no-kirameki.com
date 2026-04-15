# 応援ユーザーレーン（りんく／こん太／たぬ姉）修正計画

対象ブランチ: `research/story-user-lane-tiers`  
目的: サムネなし・匿名混入・「りんくの吹き出しの下しか見えない」体感を、仕様と実装の両面から整理し、抜けなく直す。

## 実装ログ（フェーズ A・C の一部）

- **`isNiconicoAutoUserPlaceholderNickname`**（`user` + 英数字の自動名）を追加し、`supportGridStrongNickname` で弱扱いにした。
- **`a:` 匿名 ID** は **こん太（konta）段に載せない**（[`demoteNiconicoAnonymousFromKontaTier`](../src/lib/supportGridDisplayTier.js) とレーン末尾ガード）。りんく（link）条件を満たす場合のみ最上段、それ以外はたぬ姉側。
- **案内文**（`storyUserLaneGuideHtml.js`）を上記ルールに合わせて更新。
- **スクロール枠**（`.nl-story-userlane-stack`）: `max-height` を緩め、`scroll-padding-bottom`・内側シャドウ、`title` / `aria-label` で「下に三段あること」を明示。`popup-entry` の動的 `aria-label` も同趣旨に更新。
- **残タスク（フェーズ B）**: Identicon 表示と tier 判定の URL 入力の完全一致は未着手（計画セクション 5.B 参照）。

---

## 1. 現状アーキテクチャ（コード根拠）

### 1.1 DOM 順序（`extension/popup.html`）

`#supportVisualDetails` 展開後、ユーザーレーン周りは概ね次の順。

1. `.nl-story-growth-head`（「アイコン列を隠す」ボタン）
2. **`#sceneStoryUserLaneGuideTop`**（りんくの説明吹き出し）— **スタックの外**
3. **`#sceneStoryUserLaneStack`**（`max-height: min(320px, 58vh)` 程度 + `overflow-y: auto`）— **スクロール枠**（実装で調整済みの値は `popup.html` を参照）
   - `#sceneStoryUserLaneRinkWrap` → りんく段のアイコン列
   - **`#sceneStoryUserLaneGuideMidKonta`**（こん太吹き出し）— **スタック内**
   - `#sceneStoryUserLaneKonta`
   - **`#sceneStoryUserLaneGuideMidTanu`**（たぬ姉吹き出し）— **スタック内**
   - `#sceneStoryUserLaneTanu`
4. `#sceneStoryUserLaneGuideBottom`（件数フッタ）

→ **こん太・たぬ姉の吹き出しは「スクロールする枠の中」**にあり、りんく段のアバターが縦に長いと、**最初のビューポートでは「りんくの吹き出し＋りんく列の先頭」しか見えない**ことがある。これはバグというより **レイアウト＋発見可能性（スクロールの気づき）** の問題。

### 1.2 段の割り当て（データ）

- `src/lib/storyUserLaneBuckets.js`  
  - `profileTier === 3` → `rink`  
  - `profileTier === 2` → `konta`  
  - `profileTier === 1` → `tanu`  
  - 全体上限 `maxTotal`（インライン 48 / 通常 24）を **rink → konta → tanu の順で消費**

- `src/extension/popup-entry.js` の `userLaneProfileCompletenessTier`  
  - `supportGridDisplayTier(...)` の結果を `rink=3, konta=2, tanu=1` に写像。

- `src/lib/supportGridDisplayTier.js`（単一ソースのルール）

  | 条件 | tier |
  |------|------|
  | `strongNick && hasThumb` | **rink** |
  | `strongNick \|\| hasThumb`（上記以外） | **konta** |
  | それ以外 | **tanu** |
  | `userId` 空 | **tanu**（レーン候補では `userId` 無しは別途スキップ） |

- `supportGridStrongNickname`  
  - 空・`（未取得）`・`匿名` は弱い。  
  - `isNiconicoAnonymousUserId(uid) && nick.length <= 1` のみ弱扱い。  
  - **`user 0539Z74OJ13` のような長い自動生成名は「強いニック」扱いになり得る**（`匿名` ではないため）。

- `supportGridTierHasPersonalThumb`  
  - 記録 `storedAvatarUrl` または `httpAvatarCandidate` が「弱くない https」かつ「数字 ID の canonical usericon と同一でない」等で判定。  
  - **Identicon 表示**は `pickSupportGrowthTileForStory` 側で付くが、`storyGrowthAvatarSrcCandidate` が空のとき **tier 判定の入力と表示タイルがズレる**余地がある（要確認: `httpCandidate` のみ tier に渡している）。

### 1.3 案内文（`src/lib/storyUserLaneGuideHtml.js`）

- りんく案内: 「個人サムネと『匿名』『（未取得）』**以外**の表示名がそろった人をいちばん手前に」— 実装の `supportGridStrongNickname` と **完全一致ではない**（自動生成 `user …` は文面に無い）。

---

## 2. 課題の整理（症状 → 仮説）

| 症状 | 主な仮説 | 根拠の強さ |
|------|-----------|------------|
| サムネなしが混ざる | 弱い／canonical URL・Identicon と tier の不一致、404 相当 | 高 |
| 匿名が「上の段」に見える | `a:` + 自動生成ニックが `strongNick` になり得る | 高 |
| りんく吹き出しの下しか見えない | 中段吹き出しが **stack 内スクロールの下**にあり、rink 列がビューを占有 | 高 |

---

## 3. 目標仕様（ユーザー合意の方向）

- **りんく列**: 条件が揃ったものだけ（現行 `rink` より厳しくてもよい）。  
- **こん太列**: 次点。  
- **たぬ姉列**: さらに次点。  

実装は既存の 3 バケット（`bucketStoryUserLanePicks`）を維持しつつ、**`supportGridDisplayTier`（および案内文）をこの優先度に揃える**のが筋が良い。

---

## 4. 調査タスク（実装前・抜け漏れ防止）

1. **`httpCandidate` vs 実際の `displaySrc`**  
   - `renderStoryUserLane` 内で、同一 `entry` について  
     `userLaneProfileCompletenessTier(e, httpCandidate)` と  
     `pickSupportGrowthTileForStory(e?.userId, httpCandidate)` のペアをログまたは単体テストで列挙。  
   - Identicon ON/OFF、匿名、数字 ID、canonical のみ、の行列。

2. **匿名・半匿名ニックの列挙**  
   - NDGR/DOM で来うる `nickname` パターン（`user [A-Z0-9]+`、`匿名`、空）を `supportGridStrongNickname` のテーブル化。

3. **レイアウト計測**  
   - rink 段が N 件のとき、`#sceneStoryUserLaneStack` の `scrollHeight` と `clientHeight`、および **GuideMidKonta が最初に見えるまでの scrollTop** の目安をドキュメント化。

---

## 5. 修正案（案）

### A. 段ルール（優先）

- **`a:` 匿名 ID は `SUPPORT_GRID_TIER_RINK` に上げない**（最大 `konta`、または `user …` 系は `tanu` まで落とす）。  
- または **`supportGridStrongNickname` を拡張**:  
  - `isNiconicoAnonymousUserId(uid)` かつ `nickname` が `^user\s+[A-Za-z0-9]+$`（ニコ自動名っぽい）なら弱い扱い。  
- 案内文（`buildStoryUserLaneGuideTopHtml`）を実装と同期。

### B. サムネと tier の一致

- tier 判定に **`displaySrc` が既定タイルか**（または `userLaneResolvedThumbScore`）を取り入れるか、  
- `httpCandidate` に **Identicon 相当の「表示に使う URL」**を一貫して渡すか、  
- のどちらかで **「見えているもの」と「段」**を一致させる。

### C. 「吹き出しが見えない」UX

いずれかまたは併用:

1. **構造変更**: こん太・たぬ姉の吹き出しを **stack の外**（rink と同列）に出し、stack は「3 段のアイコンだけ」にする。  
2. **視覚的ヒント**: stack に `scrollbar-gutter`、下部フェード、`title` で「下に続き」等。  
3. **高さ**: `max-height` をコンパクト時だけ緩める（全体ポップアップ高さとの兼ね合い）。

---

## 6. テスト計画

| 種別 | 内容 |
|------|------|
| 単体 | `supportGridDisplayTier` に匿名・`user …`・canonical のみ・良サムネを追加 |
| 単体 | `userLaneProfileCompletenessTier` と_buckets の境界（tier3 だけ 24 件等は既存） |
| 結合（任意） | Playwright: details 展開後 `GuideMidKonta` が `scrollIntoView` で `getBoundingClientRect` に入るか |

---

## 7. マージ順序の提案

1. **ルール修正**（`supportGridDisplayTier` + 案内文）— 挙動の芯。  
2. **tier と表示 URL の一致**（Identicon / 既定タイル）。  
3. **DOM/CSS**（吹き出し位置・スクロールヒント）。  

各段階で `npm test`、必要なら `npm run build` 後に手動でポップアップ確認。

---

## 8. 参照ファイル一覧

- `src/lib/supportGridDisplayTier.js` / `src/lib/supportGridDisplayTier.test.js`  
- `src/lib/storyUserLaneBuckets.js` / `src/lib/storyUserLaneBuckets.test.js`  
- `src/lib/storyUserLaneGuideHtml.js` / `src/lib/storyUserLaneGuideHtml.test.js`  
- `src/extension/popup-entry.js`（`renderStoryUserLane`, `userLaneProfileCompletenessTier`, `storyUserLaneMetaLines`）  
- `extension/popup.html`（`.nl-story-userlane-stack` 等）  
- `src/lib/supportGrowthTileSrc.js`（`userLaneResolvedThumbScore`, `isWeakNiconicoUserIconHttpUrl`）

---

## 9. 未調査・リスク

- 配信者 ID と視聴者アバターの誤一致除去（`storyGrowthAvatarSrcCandidate`）が tier に与える副作用。  
- インライン iframe 幅極小時の `max-height` と touch スクロールの挙動。  
- 多言語化は現状日本語固定のためスコープ外。

---

*この文書は調査ブランチ上の計画メモであり、マージ前に Issue/PR 説明へ要約して転記してよい。*
