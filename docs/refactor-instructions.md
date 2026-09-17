# リファクタリング指示書 — 拡張本体（popup-entry / content-entry / src/lib）

> 作成: 2026-09-17 / 対象コミット: `9350c410`（master・v0.1.1520）
> 作成者: 分析担当（Fable）。**コードは1行も変更していない。** 行番号は上記コミット時点の実測。
> 実装担当への渡し方: `/goal docs/refactor-instructions.md に書かれたことを完遂しろ`
> **末尾の「実装前に確認すべき質問」6 件は 2026-09-17 にユーザー回答済み（確定）。再質問せず、その決定に従うこと。**
>
> 先行資料（本書はこれらの続き。矛盾したら本書の実測値が新しい）:
> - 地図 `docs/handoff/giant-entry-split-MAP-2026-08-10.md`
> - 仕様 `docs/handoff/giant-entry-split-SPEC-2026-08-10.md`（Phase 2 の設計 = 本書の Phase 4〜6）
> - 棚卸し `docs/handoff/giant-entry-split-PHASE2-INVENTORY-2026-08-10.md`
>
> 過去の指示書とその状態（本書は**置き換え**ではなく続き。Non-Negotiables は累積で有効）:
> | 指示書 | 内容 | 状態（2026-09-17 実コードで確認） |
> |---|---|---|
> | ルート `refactor-instructions.md`（2026-06-25） | I/O を含まない純関数を `src/lib` へ抽出（Phase A）・Danger Map | 一部実施（`5feeb50a` `161117f3` `eaab67ad` `dbc31875`）。§1 の 8 挙動と §3 Danger Map は**今も有効** |
> | `docs/refactor-instructions.md` 旧版（2026-08-06） | 点滅追跡計器の撤去 | **完遂**（v0.1.1278）。本書で上書きした。旧文は `git show 31c0646c:docs/refactor-instructions.md` |
> | `docs/refactor-instructions-2026-08-29.md` | content ラチェット復活（D-1）・popup の I/O 無し関数を lib へ（D-2） | **D-1 未実施**（directive が残っている）。**D-2 の候補 3 件も未抽出**（本書 Phase 4 Track A に引き継ぐ。ただし同書の行数は古い: `mergeInterceptCacheItems` は 187 行ではなく実測 26 行） |

---

## Objective

**目的**: 拡張本体（`src/extension/` + `src/lib/` + `extension/`）を、**既存挙動を1つも変えずに**「今後の変更が入れやすく・エラーが出にくい」状態へ近づける。

**目的ではないこと**: 見た目を綺麗にすること／古いコードを一掃すること／行数を減らすこと自体。

**なぜ今か（実測）**:

| 計器 | 現在値 | 上限 | 余裕 |
|---|---:|---:|---:|
| `src/extension/popup-entry.js` 行数 | 22,655 | 22,660（`eslint.config.js:398`） | **5行** |
| `initPopup()` 行数 | 2,595 | 2,600（`tests/contract/popupEntryFunctionBudget.test.js:32`） | **5行** |
| `refresh()` 行数 | 1,774 | 1,800（同 :33） | 26行 |
| `src/extension/content-entry.js` 行数 | 19,347 | 17,267（`eslint.config.js:406`） | **-2,080行（ゲートが死んでいる。Debt D2）** |

popup-entry は**次の1つの修正で必ずゲートに当たる**。「修正のたびに抽出で行数を作る」状態は、修正のコストを上げ、抽出を雑にする誘因になる。先に安全網を張り、小さく・戻せる単位で責務を外へ出す。

**成功の測り方**（行数ではなく性質で測る・仕様 Q8 踏襲）:
1. 抽出した各塊が **単体テスト（happy-dom/引数注入）で動く**
2. `initPopup`/`refresh` の関数ラチェットが**下がる**（同一ファイル内で移しただけでは下がらない）
3. 既存 wiring テストが**移動後も緑**（`resolveEntryFnSource` 経由）
4. content-entry の max-lines ゲートが**生き返る**

---

## Project Understanding

### 何を作っているか

Chrome 拡張（MV3）「君斗りんくの追憶のきらめき」（`extension/manifest.json`・v0.1.1520）。
ニコニコ生放送（`https://*.nicovideo.jp/*`）の応援コメントを**利用者のPC内**（`chrome.storage.local` + IndexedDB）に記録し、3レーン（りんく／こん太／たぬ姉）等で可視化する。Chrome Web Store 公開中（ID `cjbabignmmodaickpeckiojjabnlogdb`）。

### エントリーポイント（`scripts/build.mjs` の targets が正本）

| ソース | 出力 | 実行文脈 | 行数 |
|---|---|---|---:|
| `src/extension/page-intercept-entry.js` | `extension/dist/page-intercept.js` | watch ページ **MAIN world**・`document_start`・全フレーム。fetch/NDGR を傍受し `window.postMessage` で content へ | 1,556 |
| `src/extension/content-entry.js` | `extension/dist/content.js` | watch ページ content script・`document_idle`・全フレーム。**記録エンジン本体**（NDGR+DOM 取込・storage/IDB 書込・バックフィル・インラインパネル iframe の設置） | 19,347 |
| `src/extension/popup-entry.js` | `extension/dist/popup.js` | `popup.html`。ツールバーpopup／watch ページ内 iframe（`?inline=1`）／サイドパネル（`sidepanel.html` が iframe で載せる）／受動ビュー（`INLINE_PASSIVE`）の**全て** | 22,655 |
| `src/extension/status-entry.js` | `extension/dist/status.js` | `status.html` 状態速報（診断ページ・読み取り専用） | 4,544 |
| `src/extension/venueBar.js` | `extension/dist/venue.js`（`venue-entry.js` 経由）+ content からも import | 会場モード（鏡の reader） | 7,196 |
| `src/extension/offscreen-entry.js` | `extension/dist/offscreen.js` | Offscreen Document = コメント IDB の常駐書き手 | 322 |
| `src/extension/backfill-sw-entry.js` | `extension/dist/backfill-sw.js` | `background.js` が `importScripts` で読む | 464 |
| `extension/background.js` | （esbuild を通さない手書き SW） | MV3 Service Worker。IDB 書込集約・自動バックアップ・タブ注入・popup 窓管理。`src/lib` を **import できないので定数を手でミラー**（`:28-55`, `:100-109`） | 3,718 |
| その他 | comeview / live-view / marketing-export / sidepanel / cloak-failsafe | 独立ページ（popup 非依存） | 86〜2,249 |

★**`app/live-view.js:821` が `popup-entry.js` を dynamic import する**（`:166-171` で `globalThis.chrome` のシムを先に置き、`hasExtensionContext()` が `runtime.id && storage.local` を見る前提）。出力は `app/dist/live-view.js`（esm）。＝ popup-entry が import する新モジュールは**純 Web 版にも同梱される**。モジュール評価時（top-level）に本物の `chrome.*` を要求する副作用を新モジュールに置かないこと（既存 popup-entry と同じ前提に留める）。

`src/lib/`（752 ファイル・非テスト）は**純粋関数の箱**（`src/lib/AGENTS.md`）。`chrome.*`/`fetch`/`document`/`window` を実コードで呼ぶと `npm run check:layer` が赤（ベースライン 42 件は許容）。実測で **lib → entry の逆流 import は 0 件**。

### データの流れ（抽出時に壊してはいけない配線）

```
page-intercept (MAIN world)  --window.postMessage-->  content-entry
content-entry  --chrome.storage.local (nls_* / chunk / tail)-->  popup / status / venue / comeview
content-entry  --NLS_CDB_APPEND (runtime.sendMessage)-->  background.js  --> IndexedDB (or Offscreen 経由)
popup-entry    --鏡 publish (KEY_LANE_MIRROR / KEY_NORTH_STAR_MIRROR / KEY_STAT_CARDS_MIRROR …)-->  受動ビュー・会場・status・Web版
popup-entry    <--tabs.sendMessage (NLS_EXPORT_WATCH_SNAPSHOT / NLS_POST_COMMENT …)-->  content-entry
content-entry  --window.postMessage (即時プッシュ・NLS_LIVE_CHANNEL_SWITCH)-->  popup iframe
```

- storage.onChanged 購読: popup 10 箇所 / content 1 / venue 1 / background 2
- `runtime.onMessage` 受け口: background 17 / content 2 / popup 0（popup は `window` message 3 箇所）
- メッセージ種別は `'NLS_*'` 文字列リテラル **46 種**が entry と background に散在（中央の登録簿なし）

### 外部依存（`AGENTS.md §3.6`「いつか落ちる・形が変わる」前提）

NDGR（ニコ生コメント配信）／nicoad API／koken（貢献度）API／usericon CDN／VOICEVOX（`127.0.0.1:50021`）／`app.tsuioku-no-kirameki.com`（status 共有）／`suggestqueries.google.com`。通信の作法は `src/lib/*Client.js` に閉じ込めるのが方針（`src/lib/AGENTS.md`）。

### 検証の仕組み（既存・全部生きている）

- `npm run verify:cc`（`scripts/run-verify-cc.mjs`）= test:cc → lint → typecheck → build → no-secrets → tracked-imports → agent-bootstrap → tree-map:check → site-health:check → feature-map:check → improvement → layer → layer-map:check → verify:bump → 各 selftest。**末尾の `diagnostics` は「報」（赤でも止めない）**。
- 契約テスト: `tests/contract/popupEntryFunctionBudget.test.js`（関数ラチェット）／`tests/contract/wiringTestSource.test.js`（移設耐性ヘルパ）／`tests/contract/layer-dependency.test.js`（src/shared・domain・data・ui の依存方向）
- `src/lib/storageFullReadCensus.test.js`: `get(null)` 全件読みを **2 箇所・関数名・ファイル名で固定**（`:103-106`, `:134-135`）
- `scripts/verify-bump.mjs:136-141`: `dist/popup.js` に `applyStoryGrowthIconAttributes` / `syncStorySourceEntries` / `renderCharacterScene` / `paintWatchPopupUi` が**含まれる**ことを要求（esbuild は `minifyIdentifiers:false` なので別モジュールへ移しても名前は残る＝**リネームだけ禁止**）
- `src/lib/laneMirrorContract.js:73` `LANE_MIRROR_CONSUMERS`: 鏡の書き手は `popup-entry.js` の `publishLaneMirror` 1 箇所と registry テストが照合
- `.husky/pre-commit`: `impact-check`（警告のみ）＋ tree-map 同梱ゲート（新規/削除ファイルを含むコミットでブロック）＋ `.artifacts/agent-git.lock`
- `.husky/pre-push`: `npm run verify`（★Claude ターミナルでハングする素の verify。**push は本書の範囲外**）

### 型検査の実効範囲（誤解しやすい）

`npm run typecheck` は緑だが、**全 entry と `src/extension/popup/**`・`story/**`・`background.js` は `// @ts-nocheck`**（実測 12 ファイル）。型検査が実際に見ているのは `src/lib` のみ。抽出先モジュールも現状は `@ts-nocheck` を継承している（`popup/report/htmlReportDocument.js:1` 等）。

---

## Behaviors To Preserve

**次は「変えない」。変える必要が出たら止まって質問する（Stop And Ask）。**

| # | 挙動 | 根拠（ファイル:行） |
|---|---|---|
| B1 | 拡張の全画面（popup／inline iframe／サイドパネル／受動ビュー）が **同じ `popup.html` + `popup-entry.js`** で動き、`INLINE_MODE` / `INLINE_EMBED_WATCH` / `INLINE_SIDE_PANEL` / `INLINE_PASSIVE` の分岐で振る舞いを変える | `popup-entry.js:1036-1040`（`readInlineModeFlags`） |
| B2 | `initPopup()` の**先頭順序**: `paintVersionBadge` → `checkVersionMismatchBanner` → `initCustomSoundRuntimeOnce` → シェード最終安全網 → … ワンタイム migration 4 本（`runOneTimeBackfill*`）を起動時に `void` で走らせる | `popup-entry.js:19974-20026` |
| B3 | `refresh()` は `INLINE_PASSIVE` で即 return。世代番号 `watchPopupRefreshGeneration` を先頭で取り、以降の paint は `isFreshRefresh()` で守る（本文内 12 箇所）。`refreshTaskGuarded` 10 箇所 | `popup-entry.js:15494-15517` |
| B4 | `get(null)` 全件読みは **content の `readPrunableStorageBagCheap` と popup の `readCommentBagForMigrationCheap` の 2 箇所だけ**（Chrome<130 fallback）。migration 4 本は `await readCommentBagForMigrationCheap(local)` を **ちょうど 4 回** | `storageFullReadCensus.test.js:90-136`, `popup-entry.js:19685-19853` |
| B5 | 鏡（KEY_LANE_MIRROR 等）の**書き手は popup の非 passive 1 箇所のみ**。passive は読むだけ | `laneMirrorContract.js:73-83`, `popup-entry.js:7829` |
| B6 | ローディング幕／cloak の解除タイミング（400ms / 5000ms / `INLINE_SHADE_DATA_FALLBACK_MS+2000`）と CSS 側の値の一致は wiring テストが機械照合 | `popup-entry.js:22595-22655`, `contentBlindTime.wiring.test.js`（eslint.config.js:344-346 の記述） |
| B7 | storage キー名・保存形式・メッセージ種別文字列（`nls_*` / `NLS_*`）は**1 文字も変えない**。既存ユーザーの保存データと他文脈（background / offscreen / Web版）が読むため | `docs/feature-map/storage-bus.md`, `background.js:28-55` |
| B8 | content の二重起動防止 `__NLS_CONTENT_ENTRY_STARTED__` と `start()` の順序（venue ボタン → 記録フラグ → migration → page frame → native self-post recorder → progress monitor → MutationObserver） | `content-entry.js:19325-19345`, `:14159-14236` |
| B9 | `dist/popup.js` に verify-bump が要求する 4 シンボル名が残る（B7 と同じく**リネーム禁止**） | `scripts/verify-bump.mjs:136-141` |
| B10 | `dist/` に秘密が焼き込まれない（`check:no-secrets`）。新しい `define` を build.mjs に足さない | `scripts/build.mjs:76-92` |
| B11 | 例外の握り潰し方（`try { … } catch { /* no-op */ }`・popup 330 箇所／content 415 箇所）は**この作業では変えない**。挙動同値の物理移動に徹する（改善は Debt D14 で提案のみ） | 実測 |
| B12 | プライバシー方針: 新しい送信先・新しい通信・新しい権限を**足さない**（CWS 審査文書 3 点同期の対象） | `AGENTS.md §3.3, §10` |
| B13 | 純 Web 版 `app/live-view.js` が popup-entry を dynamic import して動く（chrome シム前提）。新モジュールの top-level で本物の `chrome.*` を要求しない | `app/live-view.js:166-171, 821` |
| B14 | **凍結フラグは生きた分岐（削除・有効化禁止）**: `AUTOPATROL_KILL_SWITCH = true`（`background.js:1231`）／`STATUS_POPUP_EMBED_ENABLED`（status-entry）／`KEY_BACKFILL_AUTO_DISABLED` 分岐。wiring テストが文字列で固定 | `src/lib/statusPopupEmbed.wiring.test.js:37, 66`、ルート `refactor-instructions.md §3` |
| B15 | ルート `refactor-instructions.md §1` の 8 挙動（backfill の継続・件数の単調増加・開いた瞬間の全件表示・読み上げの配信追従・会場モード・公式値レーン即表示・来場/同接の区別・本家 DOM 非破壊）も維持 | ルート `refactor-instructions.md:40-54` |

---

## Non-Negotiables

1. **最初に `git status` を確認し記録する。** 現時点で `extension/dist/*.js` と `app/dist/live-view.js` に**既存の未コミット差分**（build による buildId ずれ）、未追跡の `surechigai-user-needs-question.txt` がある。**これらに触らない・自分の変更と混ぜない・消さない。**
2. **編集前に baseline の検証結果を記録する**（Baseline Commands の表を埋める）。
3. **`extension/dist/` と `app/dist/` は生成物。手で編集しない。** ソースを直したら `npm run build`。dist の buildId が毎回ずれるのは既知（追わない）。dist の日本語は `\uXXXX` エスケープ形なので grep は escape 形で。
4. **max-lines ラチェット（`eslint.config.js:398/402/406`）と関数ラチェット（`popupEntryFunctionBudget.test.js:31-34`）は「増やす方向」に触らない。** 抽出したら**同じ変更の中で実測値まで下げる**（関数ラチェットは実測との差が 200 を超えると `:59-68` の slack テストが赤くなる＝下げ忘れは機械が止める）。
5. **抽出は「追加行 < 削除行」を同一の変更単位で満たす**（仕様 Q6）。満たせない抽出は**やらない**（ラチェット緩和を交渉しない）。
6. **1 変更 = 1 塊。** 複数の塊を1つの diff に混ぜない。無関係な整形・「ついで」の修正・命名変更をしない。
7. **新規ファイルは `git add <path>` を明示列挙で**（`git status | grep -v '^??'` 型のフィルタ add で新規ファイルを取りこぼし Vercel 全デプロイ失敗の実事故 = `AGENTS.md §12.5`）。`check:tracked-imports` が機械検出するが頼らない。
8. **生成物の再生成順序**: 新規ファイルを `git add` → `npm run tree-map` → `npm run feature-map` → 生成物も `git add` → `npm run verify:cc`。tree-map は **git 追跡ファイル**から生成するので add 前に走らせても反映されない（memory「`npm run tree-map` は `git add` の【後】」）。新ディレクトリを作ったら `scripts/repo-tree-map.mjs` の `ROLES` に 1 行、移した機能の担当ファイルが変わったら `FEATURES` の `paths` を直す（推測で書かない・grep で確かめてから）。
9. **`src/lib` に `window` / `document` / `fetch` / `chrome.*` を持ち込まない**（`npm run check:layer`）。I/O は `src/extension/**` 側に置き、判定・変換だけ lib へ。
10. **version bump はしない**（Stop And Ask Q2 の回答待ち）。bump する場合は 3 点同期（`extension/manifest.json` / `package.json` / `src/lib/changelog.js` 先頭）・summary 35 字以内・`npm run verify:bump`。**changelog は現在ちょうど 20 版**なので bump 前に `node scripts/split-changelog.mjs` が必要（実行後に版数を検算）。`src/lib/changelog.js` だけ **CRLF**（置換が空振りする既往）。
11. **commit / push / `copy:ext` / Chrome リロードは明示依頼後**（`AGENTS.md §12.4`）。commit する前に `.agent/coord.md` の `write_lock.state`（現在 FREE）と `updated` を読む。配信視聴中の `copy:ext` は禁止（新旧混在ランタイム）。**push は本書の範囲外**（pre-push が素の `verify` を走らせてハングする）。
12. **検証コマンドは `verify:cc` / `test:cc` / `typecheck`。** `npm run verify` と パイプ付き `npx vitest run` は使わない（ハング）。失敗時は `.artifacts/verify-cc.log` を Read。
13. **wiring テストの断言（無条件呼び出し・アンカー付き regex・件数）は弱めない。** 変えてよいのは「本文をどこから取るか」だけ（`resolveEntryFnSource` 経由に寄せる）。
14. **`@ts-nocheck` は物理移動では移設元と同じ方針で維持する**（新規モジュールの先頭に付け、理由コメントを 1 行）。型付けは別作業（Debt D3）。
15. 新しい症状 ID（`src/lib/symptomVerdicts.js`）を足さない（足すなら `../ai-hub/index.json` にも要登録。本作業では不要）。
16. **正しさが分からないことは実装せず質問に落とす**（下の Stop And Ask）。
17. `.artifacts/agent-git.lock` が存在する間は commit 不可（他エージェント作業中）。
18. commit する場合、メッセージに「根治／真因を特定／完全に直／解決しました／直りました」を**書かない**（`.husky/commit-msg` → `scripts/check-root-cause-claim.mjs` が証拠語なしの宣言をブロック）。リファクタは「挙動不変・未実機」と正直に書く。
19. 診断セル・計器・症状 ID を**足さない**（`instrumentSpecCoverage.test.js` の `MAX_UNDECLARED` が 2026-08-29 時点で上限ちょうどと記録されている。本作業は計器を増やさない）。

---

## Stop And Ask Conditions

次のどれかに当たったら**その場で止めて人間に質問**する（推測で進めない）:

- **S1** 抽出しようとした関数が module-level の `let`（popup 162 個 / content 202 個）を**書き換えて**いる、または `initPopup` と `refresh` の**両方**から参照される共有状態（実測 12 個: `INLINE_*` 4 定数 / `INLINE_OWN_WATCH_URL` / `_opSoundEnabledCache` / `_commentPostDiagCounters` / `_bgmEnabledCachePopup` / `watchMetaCache` / `watchPopupLastPaintedLiveId` / `popupBooleanSettingsRegistry` / `_effectSoundEnabledCache`）を**書き換える**とき → ctx で参照を渡せるか、所有者を移すべきか、判断を仰ぐ。
- **S2** 抽出で **storage キー・保存形式・メッセージ種別・DOM id・`data-*` 属性名**のいずれかを変えないと成立しないとき。
- **S3** 既存 wiring テストの**断言そのもの**を変えないと緑にならないとき（本文の取得元を変えるだけで済まないとき）。
- **S4** テストと実装が矛盾している（テストが意図と逆を固定している）と気づいたとき。
- **S5** 削除候補（重複関数・二重呼び出し等）が本当に不要か**コードから確定できない**とき。例: `initPopup` 内の `paintVersionBadge()` 二重呼び出し（`:19980` と `:20029`。関数自体は冪等（`:19156-19168`）だが、2 回目が意図的な「setup 後の再塗り」かは不明）。
- **S6** `get(null)` の個数（B4）・鏡の書き手（B5）・verify-bump の 4 シンボル（B9）に影響しうるとき。
- **S7** `background.js` / `offscreen` / `page-intercept`（別文脈）に触る必要が出たとき。
- **S8** 追加行 < 削除行 を満たせない抽出になったとき（→ その抽出は中止して報告）。
- **S9** `npm run verify:cc` のどのステップでも赤が出て、**自分の変更に起因すると確定できない**とき（baseline と比べて判断。baseline は下表のとおり全緑）。
- **S10** 複数の設計案（例: 抽出先ディレクトリ／メッセージ登録簿の形／refresh のステージ分割）があり、プロダクト判断が要るとき（下の「実装前に確認すべき質問」）。
- **S11** `.agent/coord.md` の `write_lock.state` が FREE でない、または `updated` が古い（他セッションの作業中の疑い）。

---

## Baseline Commands

**すべて `package.json` の `scripts` に実在するもの**（2026-09-17 確認）。素の `npm run verify` は使わない。

| 目的 | コマンド | 2026-09-17 の実測（分析担当が実行） |
|---|---|---|
| 状態確認 | `git status --short` / `git log -1 --oneline` | `M extension/dist/{content,popup,status,venue}.js`, `M app/dist/live-view.js`, `?? surechigai-user-needs-question.txt` / HEAD `9350c410` |
| 単体テスト | `npm run test:cc` | **921 files passed / 11,518 tests passed / 1 skipped / 6 todo / 87s / exit 0** |
| lint | `npm run lint` | 4 大ファイル単体で exit 0（`npx eslint --no-cache src/extension/{content-entry,popup-entry,venueBar,status-entry}.js`）。★content-entry は `/* eslint-disable max-lines */` で max-lines が抑止されている（Debt D2） |
| 型検査 | `npm run typecheck` | exit 0（ただし entry は `@ts-nocheck`＝実効は lib のみ） |
| ビルド | `npm run build` | 未実行（dist を汚さないため）。実装担当が Phase 1 で実行し記録すること |
| 全ゲート | `npm run verify:cc` | 未実行。実装担当が Phase 1 で実行し記録すること（ログ `.artifacts/verify-cc.log`） |
| 関数ラチェット単体 | `npx vitest run tests/contract/popupEntryFunctionBudget.test.js --reporter=dot` | initPopup 2,595 / refresh 1,774（slack 5 / 26） |
| 層の純粋性 | `npm run check:layer` | verify:cc 内。42 件の許容ベースライン |
| 波及確認 | `npm run impact-check` | 共有 lib を触ったら。警告のみ |
| 生成物 | `npm run tree-map` / `npm run feature-map` | 新規ファイル・import 変更の後に必ず |
| bump 整合 | `npm run verify:bump` | bump する時だけ（Q2） |

**e2e（`npm run test:e2e*`）は baseline に含めない**: memory に「e2e CI が 2026-08-05 から全 failure」とあり、本作業の合否判定に使えない（触らない・直さない）。

---

## Debt Map

凡例 — **実装可**: 本指示書の範囲で今実装してよい ／ **提案**: 設計案を書いて承認を待つ（実装しない）。

### D1. popup-entry.js の 2 大関数と行数ラチェットが同時に限界（最優先）

- **根拠**: `popup-entry.js` 22,655 行 vs 上限 22,660（`eslint.config.js:398`）。`initPopup()` `:19974-22568` = 2,595 行（上限 2,600）。`refresh()` `:15494-17267` = 1,774 行（上限 1,800）。トップレベル関数 438 個のうち 370 個は 50 行以下＝分割は既に進んでおり、残っているのは**巨大 2 関数**。
- **内訳（実測）**: `initPopup` 内 `addEventListener` 90 箇所、`$('id')` 97 種、名前付き内部関数は `submitComment`（`:21332`・約 166 行）1 つだけ。module-level 変数 291 個のうち initPopup が読むのは 30 個、refresh は 37 個、両方が読むのは 12 個（S1 参照）。**トップレベル関数 72 個は initPopup からしか呼ばれない**（= 一緒に外へ出せる塊。下の Phase 4 候補表）。
- **なぜ負債か**: 次の修正が必ずゲートに当たる。修正者が「抽出で行数を作る」作業を強いられ、雑な抽出＝回帰の温床になる。
- **影響範囲**: popup の全画面（B1）。
- **変更リスク**: 中（クロージャ依存・wiring テスト 63 ファイルがファイルパスで本文を読む＝D4）。
- **改善案**: Phase 4（機能クラスタ単位で `src/extension/popup/init/<feature>.js` へ 1 塊ずつ）。
- **検証**: 関数ラチェット低下＋抽出先の単体テスト＋`verify:cc`。
- **判断**: **実装可**（Phase 4）。ただし `refresh()` の分割は **提案**（D7）。

### D2. content-entry.js の max-lines ゲートが死んでいる

- **根拠**: `content-entry.js:1` `/* eslint-disable max-lines */`。`eslint.config.js:404-407` は上限 17,267 と書くが実測 19,347 行。`npx eslint --format json` の `suppressedMessages` に `max-lines:directive` が出る＝**ルールは発火しているが抑止されている**。差分 2,080 行が無監視で積まれた。
- **なぜ負債か**: memory「機械が見ている所だけが動く」の実例。設定コメント（`eslint.config.js:77-79`「増やすのは禁止」）が事実と乖離し、次に読む人を誤らせる。
- **影響範囲**: content-entry の成長抑止のみ（実行時挙動は無関係）。
- **変更リスク**: 低（設定と 1 行のコメント削除）。
- **改善案**: `content-entry.js:1` の directive を消し、`eslint.config.js:406` の `max` を**実測ちょうど**（19,347）に置き直し、コメントに「17,267 は directive で抑止されており実効していなかった（2026-09-17 実測）」と記録。
- **検証**: `npx eslint --no-cache src/extension/content-entry.js` が緑、`max` を 19,346 に一時変更して赤を目視 → 復元（変異確認）。
- **判断**: **実装可（ユーザー確定済み）**。2026-08-06 の指示書 §6 質問C で「やる」と確定し、2026-08-29 の指示書 D-1 でも「未実施」と記録されたまま今日に至る。数値は**実測ちょうど**（popup 側の最新運用 `eslint.config.js:266`「+εを取らない」に合わせる。08-29 版は +50 を提案していたが、どちらでも可＝人間が指定すればそれに従う）。

### D3. 型検査の空白（entry 全部が `@ts-nocheck`）

- **根拠**: `@ts-nocheck` 12 ファイル（全 entry + `popup/**` 4 + `story/**` 2 + `background.js`）。`tsconfig.json` は `checkJs:true` `noImplicitAny:true` だが実効は lib のみ。
- **なぜ負債か**: `npm run typecheck` 緑が「entry も型で守られている」と誤読される。抽出先も `@ts-nocheck` を継承（`htmlReportDocument.js:1`）。
- **改善案**: 物理移動中は継承（Non-Negotiable 14）。**別作業**として「抽出先モジュール単位で `@ts-nocheck` を外し、JSDoc 型を付ける」を提案。
- **判断**: **提案**（本作業では触らない。数を報告するだけ）。

### D4. wiring テストがファイルパスで本文を読む（移設で壊れる／黙って緑になる）

- **根拠**: `readFileSync`/`new URL`/`resolve` の引数で **`popup-entry.js` を直接読むテスト 34 ファイル**、`content-entry.js` **15**、`venueBar.js` **17**、`status-entry.js` **10**（2026-09-17 機械集計。08-29 指示書の「2〜3 本」は過小）。内訳: `src/extension/*.test.js` 8 本・`src/lib/*.test.js` 24 本・`tests/contract` / `src/data` の契約・特性テスト 2 本。移設耐性ヘルパ `tests/helpers/wiringTestSource.js`（`resolveEntryFnSource`・2026-08-10 作成）を使うテストは **1 つだけ**（ヘルパ自身の契約テスト）。例: `src/extension/popupAvatarRetry.wiring.test.js:19-25` は `SRC.indexOf('const storyAvatarLoadGuard = …')` 〜 `SRC.indexOf('let _storyAvatarRetrySweepAt')` の**スライス**で本文を取る。
- **なぜ負債か**: 関数を移すと軒並み赤（地図 §6 で「今日 3 件経験」）。さらに `indexOf` が -1 を返すと `slice(-1, n)` が**末尾の断片を返し、断言が偶然通る**（fail-open）可能性がある。ヘルパは「無ければ throw」で fail-closed。
- **影響範囲**: 抽出のたびに移設対象の関数名で grep して該当テストを直す必要がある。
- **改善案**: **移す関数に限って**、当該テストの「本文取得」を `resolveEntryFnSource('<fn>')` に置き換える（断言は不変）。アンカー方式（変数宣言のスライス）は、その塊が移った先のファイルを読む形に直す。ヘルパの探索対象は `popup-entry.js` と `src/extension/popup/**` のみ（`wiringTestSource.js:56-74`）。content を移すなら探索対象を足す（契約テスト `wiringTestSource.test.js` に「content の実在関数を解決できる」を追加）。
- **判断**: **実装可**（Phase 2 でヘルパ拡張、Phase 4 で対象テストのみ移行）。63 件を一括で書き換えない。

### D5. 責務の混在: initPopup は「配線」ではなく「ハンドラの中身」

- **根拠**: 棚卸し §2-3「addEventListener のコールバック本体が 1,268 行（50%）」。DOM id 97 種のうち `devMonitor*`（開発モニタ・エクスポート）系と `frame*`（枠テーマ）系と `voice*`（音声）系と `commentInput/postCommentBtn`（送信）系がそれぞれ独立の機能塊。
- **改善案**: 機能ごとに `attach<Feature>(ctx)` へ出す（横断的関心で割らない＝仕様 Q4）。
- **判断**: **実装可**（Phase 4）。

### D6. 抽出時の ctx の作り方が未定義（`PopupInitContext` typedef が未作成）

- **根拠**: 棚卸し §5「`PopupInitContext` の typedef を置く」は未実施（grep で docs にしか出ない）。既存の抽出は 2 方式: (a) `buildHtmlReportDeps()`（`popup-entry.js:18229-18240`）で**関数参照と現在値**を deps オブジェクトにして渡す、(b) `attachAiDiagButtonHandler(fastCache, { getEl })`（`popup/attachAiDiagButtonHandler.js:31`）で要素取得器を注入し、専用状態は移設先の module-level に持つ。
- **なぜ負債か**: 方式が決まっていないと抽出ごとに ctx の形が増える。memory「フィールドを個別列挙で詰め替える関数は値を落とす（5 回踏んだ）」。
- **改善案**: `src/extension/popup/initContext.js` に JSDoc typedef を置き、規約「参照を渡す・詰め替えない／定数は import／専用状態は移設先へ同伴」を明文化。
- **判断**: **実装可**（Phase 5）。

### D7. `refresh()` の分割は世代ガードに依存する（高リスク）

- **根拠**: `:15513-15517` で世代番号を取り、本文中 `isFreshRefresh()` 12 箇所・`await` 24 箇所・`refreshTaskGuarded` 10 箇所。refresh からしか呼ばれない関数 35 個。
- **なぜ負債か**: 1,774 行の直列手続きで、await の前後で世代ガードを入れ忘れると**古い放送の描画が新しい放送を上書き**する（コメントに実害の記録）。
- **改善案（仕様 §4 Phase 2 踏襲）**: ステージ関数は `gen` を受け取り**自分の先頭でガード**する規約。着手前に「await ごとの世代チェック有無」を機械集計する。
- **判断**: **提案**（設計案と集計結果を書いて承認待ち。実装しない）。

### D8. storage キーの契約が一部リテラル

- **根拠**: `'nls_…'` リテラルが popup-entry に 8 種（lib に無いもの 8）、content-entry に 6 種（lib に無いもの 3）。lib 側は `*Key.js` 40 ファイル＋ `storageKeys.js`。`docs/feature-map/storage-bus.md` は「書く人だけ」12 キー・「読む人だけ」多数を**疑い**として列挙（偽陽性を含むと明記）。
- **なぜ負債か**: 誰が書き誰が読むかが静的に追えない箇所が残る。
- **改善案**: 移す塊の中にリテラルキーがあれば**移設先でもリテラルのまま**（変えない）。別作業として lib へ集約を提案（各リテラルが動的キーでないことを 1 件ずつ確認してから）。
- **判断**: **提案**（本作業ではキーを 1 文字も動かさない＝B7）。

### D9. メッセージ種別 `'NLS_*'` 46 種に登録簿がない

- **根拠**: `src/extension/**` + `background.js` に散在。lib に `messageTypes` 相当なし（`ls src/lib | grep -i message` は無関係ファイルのみ）。`background.js` の `runtime.onMessage` 17 箇所。
- **改善案**: `src/lib/messageTypes.js`（凍結オブジェクト）＋「entry のリテラルは登録簿の部分集合」テスト（このリポで生き残っている registry 型）。**文字列の値は変えない**。
- **判断**: **提案**（別文脈 background に触るため S7）。

### D10. background.js が lib の定数を手でミラー

- **根拠**: `background.js:33-55`（chunk/tail キー・`readAllCommentsForLiveLocal`）、`:95-109`（commentDb スキーマ）。drift テストは `src/lib/commentDb.test.js:36` と `src/lib/swCommentChunkKeyMirror.test.js` に存在。
- **なぜ負債か**: 二重定義。ただし drift はテストで検知済み（機械が見ている）。
- **改善案**: esbuild で background をバンドルする案（`backfill-sw-entry.js` と同型）。
- **判断**: **提案**（S7）。

### D11. content-entry.js の巨大関数に関数ラチェットがない

- **根拠**: `buildGiftDiagnosticsBundle` `:6047` 915 行／`start` `:14159` 802／`runNdgrBackfillOnce` `:16914` 574／`collectWatchPageSnapshot` `:9031` 517／`persistCommentRowsImpl` `:12247` 470／`bindContentScriptMessageListener` `:10022` 440／`buildAiSharePageDiagnostics` `:9597` 407。150 行以上が 17 個。`popupEntryFunctionBudget` に相当する契約テストなし。
- **改善案**: `tests/contract/contentEntryFunctionBudget.test.js`（上位 7 関数を実測+30 で固定・slack ≤ 200）。抽出候補は診断バンドル 3 関数（`buildGiftDiagnosticsBundle` / `buildAiSharePageDiagnostics` `:9597` / `buildAiShareFastDiagnosticsPayload` `:6963` 328 行）＝**データ組み立て**で DOM 書込が少ない可能性が高いが**未確認**。
- **判断**: ラチェット追加は**実装可**（Phase 2）。抽出は Phase 6 で**依存を実測してから**。

### D12. venueBar.js / status-entry.js は無監視

- **根拠**: `venueBar.js` `mountVenueBarButton` `:2413` = **4,778 行の単一関数**（ファイル 7,196 行）。`status-entry.js` `renderAll` `:1720` 672 行。どちらも eslint の max-lines 対象外。
- **改善案**: `eslint.config.js` に実測ちょうどの max-lines ブロックを足す（安全網のみ）。分割は別地図（仕様 §6 でも対象外）。
- **判断**: ラチェット追加は**実装可**（Phase 2）。分割は**対象外**。

### D13. 生成物ドキュメントとの結合

- **根拠**: `scripts/repo-tree-map.mjs` の `FEATURES` が `popup-entry.js` を 5 箇所で担当ファイルに挙げる（`:118,121,122,123` 等）。`feature-map:check` は esbuild 到達ファイルの drift で赤（`scripts/feature-map.mjs:28-48`）。
- **改善案**: 抽出のたびに Non-Negotiable 8 の順序で再生成し、`FEATURES.paths` を実態に合わせる。
- **判断**: **実装可**（各 Phase の手順に含める）。

### D14. 例外の握り潰しとログの不統一

- **根拠**: `try` ブロック popup 330 / content 415、`catch { /* no-op */ }` 多数。popup の例外バッファ（`consoleErrorBuffer` / `popupErrorLine`）は v0.1.1377 で追加済みだが、握り潰し箇所は経由しない。
- **判断**: **提案**（挙動を変えるため。移動時はそのまま）。

### D15. 重複ヘルパ（entry ごとの自前実装）

- **根拠**: `hasExtensionContext` が `popup-entry.js:3854` と `content-entry.js:8250` に別実装。`isContextInvalidatedError` は `content-entry.js:8257` に自前があり、lib の `reportSilentError.js:11` を popup は import している。`withTimeout` は `popup-entry.js:4880` のみ（lib に無い）。
- **なぜ負債か**: 同じ判定が面ごとに違う挙動になりうる（memory「面ごとに挙動を変えない」）。
- **改善案**: **等価性を 1 件ずつ確認**した上で lib へ寄せる。等価でなければ寄せない。
- **判断**: **提案**（S5。等価性未確認）。

### D16. 契約テストが特定関数の**所在**を固定している

- **根拠**: `storageFullReadCensus.test.js:103-106` は `readCommentBagForMigrationCheap` が `popup-entry.js` に在ること・`await readCommentBagForMigrationCheap(local)` が 4 回あることを固定。`wiringTestSource.test.js:69` は `initPopup` が `popup-entry.js` に在ることを固定。`laneMirrorContract.js:73` は `publishLaneMirror` の所在。
- **改善案**: これらの関数（migration 4 本・`initPopup` 本体・`publishLaneMirror`）は**動かさない**（動かすなら契約テストごと＝S6）。
- **判断**: 制約として Phase 4 の除外リストに載せる。

---

## Implementation Phases

各 Phase は独立に検証・報告できる単位。**Phase の途中で Plan に無いファイル変更が必要になったら止まって報告**（`AGENTS.md §12.1`）。

### Phase 1 — 現状確認と baseline 記録（変更なし）

1. `git status --short` / `git log -1 --oneline` を記録（Non-Negotiable 1）。
2. `.agent/coord.md` を読み `write_lock.state` を記録（S11）。
3. `npm run test:cc` → `npm run lint` → `npm run typecheck` → `npm run build` → `npm run verify:cc` を順に実行し、結果（件数・exit・所要）を Baseline Commands の表に**追記**。build で dist が変わるのは想定内（既存の未コミット差分と同種）。
4. `npx vitest run tests/contract/popupEntryFunctionBudget.test.js --reporter=dot` で initPopup/refresh の現在行数を記録。
5. `docs/handoff/giant-entry-split-PHASE2-INVENTORY-2026-08-10.md` の数値（initPopup 2,553 → 2,595 等）が古いことを**報告に書く**（docs は編集しない）。

**完了条件**: すべて緑、または赤の原因が「自分の変更ではない」と確定して報告済み。

### Phase 2 — 安全網（挙動不変・テスト/設定のみ）

1. **content-entry の関数ラチェット**: `tests/contract/contentEntryFunctionBudget.test.js` を新設。`popupEntryFunctionBudget.test.js` を雛形に、D11 の上位 7 関数を実測+30 で固定し、slack ≤ 200 の督促テストも付ける。**変異確認**: ダミー 60 行を一時追加 → 赤 → 復元。
2. **ヘルパの探索対象拡張**: `tests/helpers/wiringTestSource.js` の `candidateFiles()` に `content-entry.js` と `src/extension/content/**`（将来の受け皿）を追加。ただし**探索順序は popup-entry → popup/** → content-entry → content/** とし、同名関数がある場合は先勝ち**（`hasExtensionContext` が両 entry にある＝D15）。`resolveEntryFnSource(fnName, { entry: 'popup' | 'content' })` の絞り込みオプションを足し、既定は従来どおり。`tests/contract/wiringTestSource.test.js` に「content の実在関数（例 `start`）を解決できる」「`entry:'content'` 指定で popup 側の同名関数を拾わない」を追加。既存 9 ケース（extractFnBody 3 / resolveEntryFnSource 4 / locateEntryFn 2）は触らない。
3. **無監視ファイルのラチェット**: `eslint.config.js` に `src/extension/venueBar.js`（max 7,196）と `src/extension/status-entry.js`（max 4,544）の max-lines ブロックを追加（実測ちょうど・`+ε` を取らない＝popup の運用と同じ）。各ブロックに「安全網のみ。分割は別地図」と 1 行。
4. **D2（content max-lines の復活）を実施**（ユーザー確定済み・Debt D2 参照）: `content-entry.js:1` の directive を削除 → `eslint.config.js:406` の `max` を実測ちょうど（19,347）に → コメントに「17,267 は directive で抑止され実効していなかった（2026-08-06 確定・2026-09-17 実施）」→ 変異確認（`max` を 1 減らして赤 → 復元）。
5. `npm run verify:cc` 緑。新規ファイルは `git add` 明示列挙 → `npm run tree-map` → 生成物 add。

**完了条件**: 新規テスト 2 本が緑かつ変異で赤を確認済み。既存テスト件数が減っていない。

### Phase 3 — 明らかに安全な整理（挙動不変・小さく）

**この Phase で削除・書換をしてよいのは次の 2 種だけ**:

1. **コメント・JSDoc の事実修正**: 移設済みの関数を「popup-entry にある」と書いているコメント等。**根拠コメント（なぜそうしたか）は削らない**（`eslint.config.js:294-296, 359-360` の方針）。
2. **`initPopup` の import 整理**: 未使用 import があれば eslint `no-unused-vars` が既に赤にするはずなので、現時点で 0 のはず。確認だけ。

**やらない**: `paintVersionBadge()` 二重呼び出しの削除（S5 → Q5）、重複ヘルパの統合（D15）、`catch {}` の変更（B11）。

**完了条件**: diff が説明できる行だけで構成され、`verify:cc` 緑。

### Phase 4 — 小さな責務分離（2 トラック・Track A → Track B の順）

popup-entry は**ファイル上限（5 行）と initPopup 上限（5 行）の両方**が尽きている。Track A はファイル上限を、Track B は initPopup 上限を下げる。両方やる。

#### Track A（低リスク・先にやる）— I/O を含まない関数を `src/lib` へ

ルート指示書 Phase A と 08-29 指示書 D-2 の続き。実績コミット `5feeb50a`（`nicoadCommentCelebrationKey`）/ `161117f3`（`avatarEntryCounts`）が手本。**2026-09-17 に本体を機械走査して確認した候補**（I/O トークン無し・module-level 参照無し）:

| 順 | 関数 | 位置 | 行数 | 呼び出し元 | 備考 |
|---|---|---|---:|---:|---|
| A-1 | `mergeCommentsWithInterceptCache` | `:14206` | 104 | 1 | 最大の純関数。`src/lib/interceptCacheMerge.js` 等へ |
| A-2 | `mergeInterceptCacheItems` + `normalizeInterceptCacheItems` | `:14019` / `:13995` | 26 + 18 | 各 1 | 同じ lib ファイルに同居させる |
| A-3 | `stripViewerAvatarContamination` | `:14318` | 49 | 2 | |
| A-4 | `normalizeStoredCommentEntries` | `:8858` | 46 | 1 | |
| A-5 | `formatAiShareDiagnosticsMarkdown` + `romiDebugDataChecklist` | `:5016` / `:4993` | 23 + 13 | 2 / 1 | initPopup からしか呼ばれない＝Track B 4-2 の負担も減る |

**避ける**: `sweepStoryAvatarRetryThrottled`（`popupAvatarRetry.wiring.test.js` が文字列範囲＋件数 2 で固定）、`maybePlaySupportCelebrationImmediate`（module-level 4 変数を参照＝純粋ではない。08-29 版の「安全」判定は誤り）、`clearWatchMetaCard`（`watchMetaCache` 参照）。

**Track A の定型**: (1) 関数名で `src/**/*.test.js` `tests/**` を grep し、文字列で固定しているテストが無いことを確認（あれば S3）→ (2) `src/lib/<name>.js` に `src/lib/AGENTS.md` の定型ヘッダ付きで移し **characterization テスト**（元の入出力を固定）を同時に作る → (3) popup-entry は import して呼ぶだけ → (4) `eslint.config.js:398` を実測へ下げる → (5) `npm run check:layer`（新ファイルが純粋なら赤にならない）→ (6) `npm run feature-map`（新 lib は `app/dist/live-view.js` にも到達する＝B13）→ (7) `verify:cc`。**1 関数（群）= 1 変更単位。A-1〜A-3 で一度止めて報告。**

#### Track B（中リスク）— initPopup の機能クラスタを `src/extension/popup/` へ

**受け皿**: `src/extension/popup/init/<feature>.js`（`eslint.config.js:400-403` で `popup/**` に max-lines 2,000 が予約済み。既存 4 モジュールはフラットに `popup/` 直下＝Q3 で確認）。新ディレクトリを作ったら `ROLES` に 1 行。

**抽出の定型（1 塊ごとに全部やる）**:

1. **棚卸し**: 移す関数群を決め、次を grep で機械集計して報告に載せる: (a) 参照する module-level 変数と、その**書換の有無**（書換があれば S1）、(b) `initPopup` 内クロージャ（`$('…')` で取った要素・`safeRefresh` 等）への依存、(c) 関数名で `src/**/*.test.js` と `tests/**` を grep した該当テスト一覧。
2. **テスト先行**: 該当 wiring テストの本文取得を `resolveEntryFnSource` に置換（断言不変）。移設先の**単体テスト**を新設（happy-dom＋ `{ getEl, … }` 注入。`popup/attachAiDiagButtonHandler.test.js` / `popup/wireLaneUserDetailOpen.test.js` が雛形）。
3. **移動**: 関数本体を**そのまま**新モジュールへ（`@ts-nocheck` と「なぜ切り出したか・依存はどう注入するか」の頭コメント。`attachAiDiagButtonHandler.js:1-14` の形）。popup-entry 側は `import` + 呼び出し最小フック。**専用の module-level 状態は同伴**（`_aiDiagDelegatedAttached` 方式）、共有状態は ctx で**参照**を渡す（詰め替えない）。
4. **ラチェット更新**: `popupEntryFunctionBudget.test.js` の `BUDGET.initPopup` と `eslint.config.js:398` の `max` を実測へ下げる。**追加行 < 削除行** を確認。
5. **生成物**: `git add <new files>` → `npm run tree-map` → `npm run feature-map` → `FEATURES.paths` 修正 → 生成物 add。
6. **検証**: `npm run verify:cc` 緑・`npm run impact-check`（警告を読む）・変異確認（移設先の単体テストの断言を 1 つ反転 → 赤 → 復元）。
7. **報告**（Reporting Format）してから次の塊へ。

**候補（結合の弱い順の仮説。★実施前に定型 1 で必ず再測定する）**:

| 順 | 塊 | 根拠（initPopup からしか呼ばれない関数・実測） | 想定行数 |
|---|---|---|---:|
| 4-1 | **枠テーマ（frame theme）** | `loadPopupFrameSettings` `:4778` / `savePopupFrameSettings` `:4795` / `setFrameShareStatus` `:4803` / `copyTextToClipboard` `:4842` / `openManualCopyOverlay` `:4898` / `syncFrameShareInput` `:5040` ＋ `frameCustomEditor / saveCustomFrame / resetCustomFrame / copyFrameCode / toggleFrameCodeInput / frameShareBox / frameShareCode` のリスナ。`renderFrameSelection` `:4724` / `renderCustomFrameEditor` `:4737` / `applyPopupFrame` `:4748` は他からも呼ばれるか要確認 | 約 300〜400 |
| 4-2 | **開発モニタのエクスポート/DL** | `downloadMcpSnapshotJson` `:4608` / `downloadSessionSummaryJson` `:4637` / `downloadCalibrationData` `:4673` / `clearCalibrationData` `:4702`（純粋部分 `romiDebugDataChecklist` / `formatAiShareDiagnosticsMarkdown` は Track A-5 で先に lib へ）＋ `devMonitorCopyAiBundleBtn`（104 行ハンドラ・棚卸し）/ `devMonitorDownloadAiBundleBtn` / `devMonitorExportMarketingBtn` / `exportMediaKitBtn` のリスナ | 約 400 |
| 4-3 | **コメント送信 `submitComment`** | `:21332`・唯一の名前付き内部関数・棚卸しの第一候補。`_commentPostDiagCounters`（initPopup で 14 回参照・**書換あり**の疑い → S1 で判断）・`withCommentPostDeadline`・`commentInput`/`exportBtn` クロージャ依存 | 約 170 |
| 4-4 | **受動ビュー(passive)の鏡描画** | `applyLaneMirrorForPassive` `:7383` / `applyLaneMirrorForMainPopupFallback` `:7501` / `applyCommentTimelineMirrorForPassive` `:7628` / `applyNorthStarMirrorForPassive` `:7681` / `applyStatCardsMirrorForPassive` `:7737` / `applyTopSupportersMirrorForPassive` `:7753` / `renderStoryUserLaneFromLightCommentsForCurrentLive` `:7566` ＋ initPopup の初回/onChanged 配線。**wiring テストの結合が最も濃い**ので 4-1〜4-3 で定型が固まってから | 約 400 |

**除外（動かさない）**: `initPopup` 自体・`refresh` 自体・`runOneTimeBackfill*` 4 本と `readCommentBagForMigrationCheap`（D16）・`publishLaneMirror`（B5）・verify-bump の 4 シンボル関数（B9）・幕/cloak 関連（B6）。

**完了条件（Phase 4 全体）**: Track A の A-1〜A-3 と Track B の 4-1・4-2 が完了し、`eslint.config.js:398` が 22,400 未満・`BUDGET.initPopup` が 2,000 未満。4-3/4-4 は S1 の結果次第で提案に戻してよい。

### Phase 5 — 境界とインターフェースの明確化

1. `src/extension/popup/initContext.js` に `PopupInitContext` の JSDoc typedef（フィールドは Phase 4 で実際に渡したものだけ。推測で増やさない）。
2. 抽出先モジュールの頭コメント形式を 1 つに固定（`attachAiDiagButtonHandler.js:1-14` を規範）し、Phase 4 の成果物を揃える。
3. `src/extension/popup/README.md` は**作らない**（docs 増殖禁止。規約は typedef ファイルの JSDoc に書く）。

### Phase 6 — テストしやすい構造（content-entry の診断バンドル）

1. `buildGiftDiagnosticsBundle` `:6047`（915 行）/ `buildAiSharePageDiagnostics` `:9597`（407）/ `buildAiShareFastDiagnosticsPayload` `:6963`（328）について、Phase 4 の定型 1 と同じ棚卸しを行い、**DOM 読み取り・module-level 変数への依存を実測**して報告。
2. 依存が「読み取りのみ・引数化できる」と確定した関数だけ、`src/extension/content/diag/<name>.js` へ移して単体テストを付ける（新ディレクトリ → eslint ブロック `src/extension/content/**` max 2,000 と `ROLES` 追加）。確定できなければ**提案に留める**。
3. `contentEntryFunctionBudget` を下げる。

### Phase 7 — 大きな設計変更（提案のみ・実装しない）

次は**設計案と根拠（実測値）を報告に書くだけ**。承認なしに実装しない:

- D7 `refresh()` のステージ分割（await ごとの世代ガード集計を添付）
- D9 メッセージ種別の登録簿
- D8 storage リテラルキーの lib 集約
- D10 `background.js` のバンドル化
- D3 `@ts-nocheck` の段階的撤去
- D14 例外握り潰しの `consoleErrorBuffer` 経由化
- D15 重複ヘルパの統合（等価性表つき）
- D12 `mountVenueBarButton`（4,778 行）の分割

---

## Verification Requirements

- **各 Phase の終わりに** `npm run verify:cc` を実行し、`.artifacts/verify-cc.log` の `verify:cc OK` 行と `REPORT diagnostics` 行を報告に貼る。
- **抽出 1 塊ごとに**: (1) 移設先の単体テスト緑 (2) 移設対象名で grep した既存テストが全部緑 (3) 関数ラチェット・max-lines を下げた後も緑 (4) 変異確認 1 件（断言反転 → 赤 → 復元。**変異が本当に適用されたか**を先に確認: CRLF/空振りの前例）(5) `npm run build` 後の `dist/popup.js` に verify-bump の 4 シンボルが残る（`verify:cc` の verify:bump が見る）。
- **件数の単調性**: `npm run test:cc` の passed 件数が baseline（11,518）を下回らない（減ったら理由を書く）。
- **e2e は走らせない**（baseline に無い。CI 失敗中）。
- **実機確認は本書の範囲外**（拡張の反映は 司令塔が build+commit+push+pull+リロード+F5 を 1 セットで行う）。報告に「⏳実機待ち: <確認項目>」を 1 行で書く。

---

## Reporting Format

各 Phase 完了時と最終報告で、次の順に書く（Markdown・簡潔に）:

```
## Phase N 報告
- 変更ファイル: <追加/変更/削除 を明示・新規は git add 済みか>
- 追加行/削除行: +A / -D（抽出は A < D を明記）
- ラチェット: initPopup 2,595→X / refresh 1,774→Y / popup max-lines 22,660→Z / content max-lines <状態>
- 実行したコマンドと結果: test:cc(件数/exit) / lint / typecheck / build / verify:cc(OK|FAILED・ログ行)
- 変異確認: <何を反転し・赤を確認し・復元したか>
- 棚卸し結果（抽出時）: module-level 依存 N 個（書換 M 個）/ クロージャ依存 / 該当テスト K 件とその扱い
- 生成物: tree-map / feature-map 再生成の有無・FEATURES/ROLES の変更
- 止まった点（Stop And Ask）: 該当番号と質問文
- 提案（実装していないもの）: 箇条書き
- ⏳実機待ち: <1 行>
```

最終報告には加えて: baseline との差分表（テスト件数・各ラチェットの前後）／未着手の Phase と理由／`docs/handoff/giant-entry-split-PHASE2-INVENTORY` の数値が古い旨。

---

## Out-of-scope Items

**触らない（読むのは可）**:

- `tsuioku-no-kirameki/`（紹介 LP・privacy・`/live/`）、`api/`（Vercel Functions）、`app/`（Web版 status / live-view。`app/dist/*` は build が更新するが**自分の変更として扱わない**）
- `docs/`（`docs/refactor-instructions.md` の進捗追記と、`npm run tree-map` / `npm run feature-map` が生成するファイルを除く）、`council/`、`memory/`、`.claude/`
- `scripts/`（`eslint.config.js` と `tests/` 配下は対象。`scripts/repo-tree-map.mjs` の `ROLES` / `FEATURES` 辞書の**1 行追加・paths 修正のみ**可）
- `extension/dist/`・`app/dist/`（生成物）
- `extension/background.js`・`offscreen-entry.js`・`page-intercept-entry.js`（別実行文脈。D9/D10 は提案のみ）
- `venueBar.js` / `status-entry.js` の**分割**（Phase 2 のラチェット追加のみ）
- `refresh()` の分割（提案のみ）
- storage キー・保存形式・メッセージ種別・DOM id・`data-*` の変更（B7）
- 例外処理の変更・ログ統一（D14）
- 型付け（`@ts-nocheck` 撤去）（D3）
- version bump・changelog・commit・push・`copy:ext`・Chrome リロード・CWS 提出（Non-Negotiable 10-11。依頼があった場合のみ）
- e2e テストの修正・実行
- LP/プライバシー文言・CWS 提出文書（`docs/releases/cws-submission-texts.md`）
- 既存の未コミット差分（dist 4 本・`app/dist/live-view.js`・`surechigai-user-needs-question.txt`）

---

## 実装前に確認すべき質問 — 【回答済み・2026-09-17 ユーザー確定】

以下はすべてユーザー回答で確定済み。**再質問しない**。この決定に従って実装する。

- **Q1（D2）→ 確定: 実測ちょうど 19,347** で content-entry の max-lines を復活させる（`+ε` を取らない＝popup の運用に揃える）。
- **Q2（bump 粒度）→ 確定: Phase ごとに patch bump 1 つ**。挙動不変でも「Phase 単位＝説明できる単位」で 1 版上げる。bump は 3 点セット同期（manifest / package / changelog）＋ `npm run verify:bump`。changelog が 20 版ちょうどなので、bump 前に必ず `node scripts/split-changelog.mjs`（実行後に版数を検算）。summary は 35 字以内。★ただし bump・commit・push そのものは司令塔（メインの Claude）が行う（Non-Negotiable 10-11）。実装担当は「この Phase は 1 bump 相当」と報告に明記し、changelog エントリ案（summary＋items）を報告に添える。
- **Q3（Phase 4 受け皿）→ 確定: `src/extension/popup/init/<feature>.js`（新ディレクトリ）**。既存 4 モジュール（`popup/` 直下フラット）とは混ぜない。新ディレクトリを作ったら `scripts/repo-tree-map.mjs` の `ROLES` に 1 行追加（`eslint.config.js:400-403` の `popup/**` max 2,000 は `popup/init/**` にも及ぶことを確認。及ばなければ `src/extension/popup/init/**` のブロックを追加）。
- **Q4（優先順）→ 確定: 指示書どおり**。Phase 4 は Track A（純関数 → lib・低リスク）→ Track B（initPopup クラスタ → popup/init/・中リスク）。content-entry は Phase 2 で安全網（ラチェット）だけ張り、抽出は Phase 6。
- **Q5（paintVersionBadge 二重呼び出し）→ 確定: 削除してよい**。冪等で実害なしだが、`popup-entry.js:19980` と `:20029` のうち**後から呼ばれる側 1 行を Phase 3 で削除**する（どちらを残すかは、初期化順で先に確実に呼ばれる方を残す＝棚卸しで確認してから）。削除は 1 行・挙動不変。迷ったら残す（本作業に影響なし）。
- **Q6（submitComment の計器）→ 確定: ctx で参照渡し**。`_commentPostDiagCounters`（module-level・書換あり）は**所有者を移動せず、参照を ctx で渡す**（詰め替えない）。挙動不変を最優先する。計器の flush も現在の所有者（popup-entry）に残す。
