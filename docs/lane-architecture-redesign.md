# 応援レーン + popup 全体のアーキテクチャ再設計

_Status: DRAFT — 2026-04-18 初版_
_Goal: ずっと使える将来を見越した設計。星野ロミ「surechigai-lite-handoff」の構造に合わせて薄くする。_

---

## 0. この文書の位置づけ

現在の extension は 1 回リリースごとに「どこかが壊れる」フェーズに入っている。具体的には:

- **列の問題** — りんく段が空になる / こん太段に上げたい人が落ちる
- **視認性の問題** — 診断パネルが重なって表示される / 空ノートの文言が要素ごとに食い違う
- **パネルの位置を変えるとおかしくなる** — popup-entry.js が DOM `id` を直接触っているため、親子関係やクラス名が動くと壊れる
- **コメント数がスムーズに取れない** — カウンタが content / popup / storage / aggregate の 4 箇所で独立に動いていて同期ズレ

これらは個別の bug ではなく **設計の限界**。
本文書は「今日のパッチ」ではなく「3 ヶ月後に同じ症状で再発しない形」を定義する。

**この文書が定義するもの:**
- 目標アーキテクチャ（ディレクトリ・レイヤ・責務）
- 現行モジュールとの mapping
- 段階的移行計画（Phase 1〜5）
- 各 Phase の着地条件（acceptance）
- 実装を Cursor / Codex / Antigravity に渡すための切り出し単位

---

## 1. 現状棚卸し（棘抜きポイント）

### 1.1 規模

| 項目 | 値 |
|---|---|
| `src/lib/` モジュール数 | **247 個** |
| `src/extension/popup-entry.js` | **9033 行** |
| `src/extension/content-entry.js` | **5613 行** |
| レーン関連の名前空間衝突 | `storyUserLane*`, `supportGrid*`, `userLane*`, `userEntry*` が混在 |

### 1.2 hosino-romi（surechigai-lite）との比較

| カテゴリ | surechigai-lite | 現 tsuioku | 倍率 |
|---|---|---|---|
| `src/lib/` モジュール | **4 個** (api, backgroundLocation, geocodeHelper, storage) | 247 個 | **約 62 倍** |
| UI components | **4 個** (Avatar, ErrorBoundary, JapanMap, LocationPermissionBanner) | popup-entry.js 1 ファイルに全部詰め込み | — |
| 状態管理 | **Zustand 1 store** | グローバル変数 (`STORY_SOURCE_STATE`, `STORY_AVATAR_DIAG_STATE`, `watchMetaCache`, ...) 散在 | — |
| hooks | **3 個** (useAuth, useEncounters, useLocation) | カスタム hook 無し（index.html の id 直参照） | — |
| ルーティング | Expo Router（ファイルベース） | HTML 静的要素 id ベース | — |

### 1.3 具体的な詰まり

1. **`popup-entry.js` 内の `renderStoryUserLane()` (L2807-) が 約 300 行** で 7 種類の責務を抱える:
   - DOM 要素取得（14 個の `$('sceneStoryUserLane*')`）
   - aggregation 再構築
   - 重複除去
   - 汚染ユーザー除外
   - tier 決定
   - ソート
   - DOM 書き込み

2. **`resolveUserEntryAvatarSignals` が 1 箇所でしか呼ばれていない** (content-entry.js L4274)。しかも `avatarObserved` を `rowAv || interceptEntryAv || interceptMapAv` の OR ブール値に圧縮しているため、どのソースで観測できたかの情報が失われる。

3. **`extension/popup.html` に静的テキストが直書き** — 例: L6220 `この段は「表示名と個人サムネがそろった人」だけ…`。0816cbd で builder 関数を追加したが、この静的要素を削除せず builder 出力と二重配信されている。

4. **テストのカバレッジ** — 単体は vitest で豊富 (207 test files)、E2E は Playwright で 30+ specs あるが、**アーキテクチャレベルの contract test が無い** ため「再構造化しても壊れていないこと」を機械的に保証できない。

---

## 2. 設計原則（hosino-romi に合わせる）

### 2.1 レイヤ分離

| レイヤ | 責務 | 依存方向 | 純粋度 |
|---|---|---|---|
| `shared/` | 型・共通 util（htmlEscape, urlMatch など） | どこからでも import 可 | pure |
| `domain/` | ビジネスルール（tier 決定、匿名判定、集約ルール） | `shared/` のみ | pure |
| `data/` | 取得・永続化・ストア | `domain/` + `shared/` | side-effectful |
| `ui/` | DOM 描画・入力受付 | `data/` + `domain/` + `shared/` | side-effectful |
| `extension/` | Chrome 拡張の薄い配線（entry points） | 上記全部 | side-effectful |

**鉄則: 下層は上層を知らない。** `domain/` が `ui/` を import することは無い。

### 2.2 各レーン列は自分の取得戦略を持つ

hosino-romi で `useEncounters` が API 呼び出しと state 同期を 1 ファイルにまとめているのと同じ原理で、**各列（link / konta / tanu）が専用 acquirer を持つ**:

```
linkColumnAcquirer  = dom ∪ ndgr-entry ∪ ndgr-map ∪ stored ∪ liveApi
kontaColumnAcquirer = dom ∪ ndgr-entry ∪ stored
tanuColumnAcquirer  = userId のみ（匿名は avatar/nick 取得を諦める）
```

**`avatarObserved` を単一 boolean にしない:** `avatarObservationKinds: Set<'dom'|'ndgr-entry'|'ndgr-map'|'stored'|'live-api'>` に拡張。列 acquirer はこの集合を見て tier を決める。

### 2.3 単一 store

`STORY_SOURCE_STATE` / `STORY_AVATAR_DIAG_STATE` / `watchMetaCache` を **`laneStore`** / **`diagStore`** / **`watchStore`** の 3 store に整理。各 store は publisher で、UI は subscribe するだけ。DOM 直書きは禁止。

### 2.4 静的テキストは HTML から排除

`popup.html` の「案内文・空ノート・診断文」は全て builder 関数の出力に置き換え。`popup.html` は **骨格のみ** を持つ（各列のコンテナ `<div>` と空 mount point）。

---

## 3. 目標ディレクトリ構成

```
src/
  shared/                            # Cross-cutting pure utilities
    html/
      escape.js                      # (from lib/htmlEscape.js)
      dom.js                         # bind/find helpers
    url/
      match.js                       # (from lib/broadcastUrl.js, etc.)
      avatar.js                      # canonical URL helpers
    types/
      avatarObservationKind.js       # (from lib/avatarObservationKind.js)

  domain/                            # Business rules, PURE
    user/
      identity.js                    # isAnonymousStyleNicoUserId, displayUserLabel
      nickname.js                    # supportGridStrongNickname
      avatar.js                      # avatar score / canonical detection
    lane/
      tier.js                        # userLaneProfileCompletenessTier の新版
      aggregate.js                   # userLaneCandidatesFromStorage の新版
      dedupe.js                      # userLaneDedupeKey
      columns/
        linkPolicy.js                # link 列の tier 判定 (pure)
        kontaPolicy.js
        tanuPolicy.js
    comment/
      parse.js
      enrichment.js

  data/                              # Acquisition, storage, state
    sources/                         # Atomic data sources
      domSource.js                   # MutationObserver wrapper
      ndgrSource.js                  # intercept stream
      storageSource.js               # chrome.storage.local
      liveApiSource.js               # https://live.nicovideo.jp/api/... (future)
    acquirers/                       # Per-column acquisition chains
      linkColumnAcquirer.js          # 5 sources union
      kontaColumnAcquirer.js         # 3 sources union
      tanuColumnAcquirer.js          # 1 source
    store/
      laneStore.js                   # {byColumn: {link, konta, tanu}, liveId}
      diagStore.js                   # {total, observedUsers, per-column counts}
      watchStore.js                  # {liveId, viewerUserId, broadcasterUserId, recording}

  ui/                                # Rendering + input
    components/                      # Reusable primitives (少なくする、hosino-romi の 4 個思想)
      Avatar/                        # <img> with fallback chain
      UserTile/                      # a user square
      EmptyNote/                     # "該当者なし" messages
      GuideLine/                     # "りんく/こん太/たぬ姉" banner lines
    views/                           # Screen-level compositions
      StoryUserLane/
        LinkColumn.js                # subscribes laneStore.byColumn.link
        KontaColumn.js
        TanuColumn.js
        index.js                     # mount into DOM + layout glue
      Popup/
        Header.js                    # 録画トグル + 統計
        StoryLane/                   # wraps StoryUserLane
        AvatarDiag/
        SettingsDrawer/
      Inline/                        # nl-inline=1 mode specific compositions

  extension/                         # Chrome extension wiring (THIN)
    content.js                       # uses data/sources/domSource + ndgrSource
    popup.js                         # mounts ui/views/Popup
    background.js                    # service worker
    manifest.json

  tests/
    contract/                        # architecture-level guards
      no-dom-id-in-domain.test.js    # domain/ が document.* を touch してないことを guard
      no-ui-import-from-domain.test.js
      layer-dependency.test.js       # レイヤ依存方向の静的検証
```

**現 247 個の `src/lib/` → 新構造で約 50 個に収斂する見積もり**（機能は減らさず、責務で統合）。

---

## 4. 現行 → 新構造マッピング（抜粋）

| 現行ファイル | → 新配置 | 備考 |
|---|---|---|
| `src/lib/htmlEscape.js` | `src/shared/html/escape.js` | 移動のみ |
| `src/lib/storyUserLaneRowModel.js` | `src/domain/lane/tier.js` | tier 関数を列別 policy に分割 |
| `src/lib/userLaneCandidatesFromStorage.js` | `src/domain/lane/aggregate.js` + `src/data/acquirers/*` | 集約 pure と取得 side-effect を分離 |
| `src/lib/userEntryAvatarResolve.js` | `src/domain/user/avatar.js` | `avatarObserved` → `avatarObservationKinds` 拡張 |
| `src/lib/supportGridDisplayTier.js` | `src/domain/lane/columns/{link,konta,tanu}Policy.js` | 列別 policy に分割 |
| `src/lib/anonymousIdenticon.js` | `src/ui/components/Avatar/identicon.js` | 表示ロジックは ui/ |
| `src/lib/storyUserLaneGuideHtml.js` | `src/ui/components/GuideLine/` + `src/ui/components/EmptyNote/` | HTML builder を components 化 |
| `src/lib/userLaneDiagSnapshot.js` | `src/data/store/diagStore.js` の selector | スナップショットはストア selector |
| `src/extension/popup-entry.js` L2807-L3100 | `src/ui/views/StoryUserLane/index.js` + `LinkColumn.js` + `KontaColumn.js` + `TanuColumn.js` | 9033 行 → 数百行に削減 |
| `src/extension/popup-entry.js` L1-L2800 | `src/ui/views/Popup/*` に分散 | header / settings / story-lane / inline モード別 |
| `extension/popup.html` L6215-L6230 | 削除（空 mount point `<div id="storyUserLane"></div>` のみ残す） | 静的テキストは ui/ で builder 出力 |

---

## 5. 移行 Phase

### Phase 0: 契約テスト整備（半日）

**目的:** リファクタリング中に壊れたら気づける骨組みを先に作る。

- `tests/contract/e2e-visibility.spec.js` に **「りんく段 / こん太段 / たぬ姉段のうち少なくとも 1 つには非匿名ユーザが表示される」** という不変条件を Playwright で書く
- `tests/contract/layer-dependency.test.js` に **「domain/ から ui/ を import できない」** 静的テスト（AST で走査）
- 現状で全部パスすることを確認してコミット

**着地:** `npm run verify && npm run test:e2e` が green。

### Phase 1: `shared/` + `domain/` の純粋モジュール移動（1 日）

- 現 `src/lib/` の純粋モジュールを `src/shared/` / `src/domain/` に移動
- 既存の import パスは transitional re-export で互換維持（`src/lib/htmlEscape.js` が `src/shared/html/escape.js` を re-export する）
- vitest の 200+ 単体テストは全て通る状態を保つ

**着地:** `domain/lane/tier.js` / `domain/user/avatar.js` / `shared/html/escape.js` が存在し、全テスト green。

### Phase 2: `data/` レイヤ導入（1 日）

- `data/sources/domSource.js` を新規作成。content-entry.js の DOM 監視コードを切り出し
- `data/sources/ndgrSource.js` に intercept 取り込みを切り出し
- `data/acquirers/linkColumnAcquirer.js` 他 3 つを新規。それぞれが自分の source 集合を束ねて「このユーザーは link か konta か tanu か」を決める
- `data/store/laneStore.js` を新規（素朴な publisher/subscriber で Zustand の最小代替）
- **`avatarObserved: boolean` → `avatarObservationKinds: Set<ObservationKind>` の拡張** をここで実施

**着地:**
- `laneStore.getState()` の snapshot が `__NLS_LANE_DIAG__()` と等価
- content-entry.js の observation コードが `data/sources/*` を呼ぶだけの薄い wrapper になる

### Phase 3: `ui/views/StoryUserLane/` 列コンポーネント化（1 日）

- `LinkColumn.js` / `KontaColumn.js` / `TanuColumn.js` を新規
- 各列は `laneStore.subscribe(state => state.byColumn.link)` して自分の DOM を書く
- `popup.html` の `<section id="storyUserLaneStack">` 内を空の mount point に変更
- 静的テキスト（案内文・空ノート）を全て ui/components の builder に移す

**着地:**
- `popup.html` の story lane 部分が `<div id="storyUserLane"></div>` のみ
- 列ごとに独立に再描画される（link だけ更新 / konta だけ更新 etc.）
- Playwright の「りんく段に人が見える」test が pass

### Phase 4: `ui/views/Popup/` 全体の分解（1 日）

- popup-entry.js の残り部分（Header / SettingsDrawer / AvatarDiag / Compose / Export）を view ごとに分離
- カウンタ類を `diagStore` に集約、各 view は subscribe
- nl-inline=1 / 通常 popup / sidepanel の 3 モードを `ui/views/{Popup,Inline}/` で切り分け
- **「パネル位置を変えると壊れる」** 対策: DOM id 検索を廃止し、各 view は自分の root element を mount 時に受け取る

**着地:** popup-entry.js が ~500 行以下に。id ベース DOM 操作の grep 件数 0。

### Phase 5: 掃除（半日）

- Phase 1 の transitional re-export を削除
- 参照されなくなった `src/lib/*` を削除
- CHANGELOG 更新
- Chrome Web Store 用リリースノート作成

**着地:** `src/lib/` が 50 個以下、lint / typecheck / vitest / Playwright 全部 green。

---

## 6. リリース戦略

| リリース | タイミング | 含む Phase | 目的 |
|---|---|---|---|
| **v0.x.y** (今日) | 今日中 | Phase 0 のみ | contract test を入れて **現状を凍結**。ユーザーに出す変更は無し |
| **v0.x.z** (+1 日) | 明日 | Phase 1 完了 | 裏で純粋モジュール整理。UI 変化無し |
| **v0.y.0** (+3 日) | 3 日後 | Phase 2-3 完了 | **列コンポーネント化** 初見。りんく段が populate される |
| **v1.0.0** (+5 日) | 5 日後 | Phase 4-5 完了 | popup 全体の再構造化。Chrome Web Store 申請版 |

**今日のグーグル申請は v0.x.y** として、**contract test で現状を守っただけのリリース** を出す。
ユーザーから見える挙動は現行と同じだが、「次回以降壊れない保証」が初めて入る。

---

## 7. リスクと緩和

| リスク | 緩和 |
|---|---|
| 移行中に import パス崩壊 | Phase 1 で transitional re-export を維持、Phase 5 でまとめて削除 |
| Playwright E2E が遅くて iteration できない | Phase 0 で smoke suite（5 min 以内）を別立てし refactor 中はこれだけ回す |
| 責務分離で overhead が増えてバンドルサイズ肥大 | Phase 5 で esbuild `--minify` + `--bundle` の結果サイズを計測、しきい値超えたら alerts |
| 設計書と実装が乖離 | 各 Phase 末に「設計書 diff 反映 + commit」を必須化 |

---

## 8. この文書の使い方（Cursor / Codex / Antigravity 向け）

各 Phase を独立に以下のフォーマットで渡せる:

```
ROLE: Expert refactoring engineer.

CONTEXT:
  docs/lane-architecture-redesign.md の Phase N を実装してください。
  先に read して全体像を把握してから着手。

INVARIANTS (壊してはいけないもの):
  - npm run verify が green
  - docs/lane-architecture-redesign.md §5 Phase 0 で追加した contract test が green
  - 既存 Playwright の smoke suite が green

ACCEPTANCE:
  - 設計書 §5 Phase N の「着地」節に書かれた条件を全て満たす
  - Phase 末コミットの message: "refactor(lane): Phase N complete — ..."

DONE WHEN:
  - 上記 acceptance all green
  - 設計書の Phase N 節の末尾に `✅ completed YYYY-MM-DD` を追記
```

---

## 9. 変更履歴

| 日付 | 変更 |
|---|---|
| 2026-04-18 | 初版（Phase 定義・mapping・リリース戦略） |
