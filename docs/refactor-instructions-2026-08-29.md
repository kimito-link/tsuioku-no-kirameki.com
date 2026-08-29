# refactor-instructions — popup-entry.js の肥大を止め、ラチェットを効く状態に戻す

> 実装担当モデル向け指示書（2026-08-29 作成）。
> 前回の指示書 [`docs/refactor-instructions.md`](refactor-instructions.md)（2026-08-06・点滅追跡計器の撤去）は
> **完遂済み**（v0.1.1278 で7系統撤去。残る `styleReattach` は計器ではなく実挙動なので意図的に残置）。
> 本書はその続き。★前回の Non-Negotiables は今も有効なので踏襲する。

---

## 1. Objective（目的）

**巨大 entry が「これ以上太らない」状態を実際に効かせ、太った分を安全に外へ出す。**

このリポには既に `max-lines` ラチェットという方針がある（`eslint.config.js:76`
「抽出が進んだら数値を下げること（**増やすのは禁止**）」）。
だが実測すると **2本のうち1本でラチェットが無効化されており、その間に 2,078 行超過している**。

本タスクのゴールは3つだけ:

1. `content-entry.js` のラチェットを**実際に効く状態に戻す**（ユーザーは 2026-08-06 に「やる」で確定済み・未実施）
2. `popup-entry.js` から**I/O を含まない関数を `src/lib` へ抽出**し、上限を下げる
3. 抽出のたびに**ラチェットの数値を下げる**（下げないと、また静かに太る）

★見た目の綺麗さは目的ではない。**「次に触る人が楽になること」だけ**を狙う。

---

## 2. Project Understanding（証拠ベース）

### 2.1 これは何か

ニコニコ生放送（`*.nicovideo.jp`）の応援コメントを**利用者のローカル**（`chrome.storage.local` /
IndexedDB）に記録し、放送後に3レーン＋活発度で振り返る Chrome 拡張（MV3）。
正式名「君斗りんくの追憶のきらめき」、内部コードネーム `nicolivelog`、現行 v0.1.1491。

- **正本ドキュメント**: [`AGENTS.md`](../AGENTS.md)（505行・**最初に読む**）／入口は [`docs/MAP.md`](MAP.md)
- `CLAUDE.md` は AGENTS.md への案内板（Claude Code が AGENTS.md を自動読込しないため）

### 2.2 エントリーポイント（`scripts/build.mjs` の `targets` が正本・全13本）

esbuild で `iife` にバンドル。`minifyIdentifiers: false`（dist を grep で検査するため関数名を残す）。

| 出力 | ソース |
|---|---|
| `extension/dist/popup.js` | `src/extension/popup-entry.js` ★本タスクの主対象 |
| `extension/dist/content.js` | `src/extension/content-entry.js` ★本タスクの主対象 |
| `extension/dist/status.js` | `src/extension/status-entry.js` |
| `extension/dist/venue.js` | `src/extension/venue-entry.js` |
| `extension/dist/page-intercept.js` / `backfill-sw.js` / `offscreen.js` / `comeview.js` / `sidepanel.js` / `live-view.js` / `marketing-export.js` / `cloak-failsafe.js` | 各 `*-entry.js` |
| `app/dist/app.js` / `app/dist/live-view.js` | `app/app.js` / `app/live-view.js`（純Web版・**esm**） |

`extension/background.js`（3,717行）は**esbuild を通さない素のクラシック SW**。

★`app/live-view.js` は `popup-entry.js` を **dynamic import** している
（`globalThis.chrome` をシムで置いてから読む）。popup-entry を触ると**純Web版にも波及する**。

### 2.3 モジュールの責務

| 場所 | 役割 | 実測 |
|---|---|---|
| `src/lib` | **純粋関数の箱**（判定・変換・集計）。専用ルール [`src/lib/AGENTS.md`](../src/lib/AGENTS.md) | 739ファイル・中央値102行・純粋678/719・テスト848 |
| `src/domain` | ドメイン正本（レーン集約・列ポリシー・identity） | 20 |
| `src/extension` | バンドル entry（機能境界） | 46 |
| `src/shared` / `src/data` | 共有小部品 / acquirer・source 層 | 7 / 7 |

★**`src/lib` は既に1ファイル1責務が成立している。負債はここではない。**
`src/lib/AGENTS.md` は「`src/extension/*-entry.js` とは性格がまったく違う箱なので、
**同じ気持ちで触らない**」と明記している。

### 2.4 データフロー（本タスクに関わる範囲）

```
ニコ生 watch ページ
  └ page-intercept（MAIN world・document_start）… ページ内 fetch/XHR を傍受
  └ content-entry（isolated・document_idle）  … 収集・DOM 観測・inline パネル
        ↓ chrome.runtime.sendMessage / chrome.storage.local
  background.js（SW）→ offscreen-entry（IndexedDB 常駐書き手）
        ↓ chrome.storage.local / IndexedDB
  popup-entry（応援レーン描画）／ status-entry（状態速報）／ venueBar（会場）
        ↓ 利用者が鍵を入れたときだけ
  app.tsuioku-no-kirameki.com/api/status（★オプトイン・未設定なら機能自体が出ない）
```

### 2.5 外部依存

- **ランタイム依存ゼロ**（`package.json` に `dependencies` キー自体が無い）。devDeps 12件のみ
- 外部通信先（`manifest.json` の `host_permissions` が境界の正本）:
  `*.nicovideo.jp` / `app.tsuioku-no-kirameki.com` / `suggestqueries.google.com` /
  `127.0.0.1:50021`（VOICEVOX・ローカル）/ `127.0.0.1:3456`・`localhost:3456`
- 永続化: `chrome.storage.local` ＋ **IndexedDB 4系統**
  （`nls_comment_db_v1` / `nls_thumb_v1` / `tk-custom-sounds` / `nls_broadcast_summary_v1`）

---

## 3. Behaviors To Preserve（絶対に壊してはいけない）

AGENTS.md §3 が正本。**リファクタで壊しやすいのは §3.5 と §3.6。**

1. **§3.2 3キャラの役割**: りんく=配信者視点 / こん太=ファン視点 / たぬ姉=匿名ガイド（184匿名の振り分け先）
2. **§3.5 ユーザー情報セットの原則**: 人が出る場所では「サムネ・ID・ハンドルネーム・リンク」を
   **セットで**出す。ID だけ・頭文字アイコンだけは原則違反。匿名は「匿名NNN」+ identicon で
   識別できる形にする（**一律グレー化は禁止**）。サムネが無ければ `deriveAvatarUrlFromUid` で導出
3. **§3.6 外部 API は落ちる前提**: レスポンスは**形から検証**（`isLikelyNicoadRankingShape` が手本）。
   fail-soft（正規化失敗は `null`、**rows>0 のときだけ storage を上書き**＝空配列で clobber しない）。
   `<img>` には load 失敗フォールバック必須。**全体 try/catch で握り潰さず、壊れた1件だけ捨てて残りを描く**
4. **オプトイン送信**: `app.tsuioku-no-kirameki.com` への送信は利用者が鍵を入れたときだけ。
   未設定なら公開機能を出さない（fail-closed）。この既定を変えない
5. **`src/lib` の純粋性**: `chrome.*` / `fetch` / `document` / `window` / `localStorage` /
   `indexedDB` を**実コードで**呼ばない（コメント・文字列内は可）。`npm run check:layer` が守っている

---

## 4. Non-Negotiables（作業規律・違反したら差し戻し）

1. **最初に `git status` を確認**し、既存の未コミット変更と自分の変更を**混ぜない**。現状:
   - `M app/dist/live-view.js` / `M extension/dist/popup.js` / `M extension/dist/status.js`
     … **既知の buildId 揺れ**（追わない・戻さない）
   - `?? council/auto/` … ★**master では `.gitignore` 済み**。作業ブランチが master の
     council 系コミットを取り込んでいないため未追跡に見えるだけ。**触らない**
   - `?? council-scout/briefs/2026-08-{25,27,29}.md` … ★**.gitignore に「briefs/ はコミット対象」と
     明記があり、過去7本はコミット済み**。だが本タスクの対象外。**触らない**（扱いは §5 で質問）
2. **編集前に baseline を記録**（§6）。baseline で既に赤いものは自分の責任範囲外として
   **記録だけする**（黙って直さない）
3. **変更は小さく戻しやすい単位**。★**関数1つの抽出 = 1コミット**を目安にする
4. **無関係な整形・ついでリファクタ禁止**（AGENTS.md §12.2「外科的に変更」）
5. **既存挙動を勝手に変えない**。§3 に触れる必要が生じたら**停止して質問**
6. **version bump は AGENTS.md §12.5**: 意味ある変更1つ = patch 1つ。3点セット
   （`extension/manifest.json` / `package.json` / `src/lib/changelog.js` 先頭・**summary 35字以内**）を
   同期し `npm run verify:bump` を通す
7. **`npm run tree-map` は `git add` の【後】**。正しい順:
   `git add -A` → `npm run tree-map` → `git add -A` → `npm run verify:cc`
8. **`git add` は新規/削除ファイルを明示列挙**（フィルタ add の取りこぼし事故の実績あり）
9. commit メッセージは AGENTS.md §7（`refactor(popup): ...` 等・日本語可）。
   ★**「根治」語は `.husky/commit-msg` がブロックする**（90日で164回宣言し41回再発した実績への機械ガード）
10. **push しただけでは Chrome に届かない**。報告に反映3手順（pull → 拡張リロード → watch タブ F5）を添える

---

## 5. Stop And Ask Conditions（実装を止めて質問する）

以下に該当したら**手を止めて質問**。勝手に決めない。

- §3 の Behaviors To Preserve に触れる必要が出た
- **抽出しようとした関数が wiring テストに文字列で固定されている**（§8 D-3 参照）が、
  テスト側をどう直すべきか判断できない
- `verify:bump` が守る4シンボル（§8 D-3）を動かす必要が出た
- `manifest.json` / `privacy.html` / ストア掲載文 / DB スキーマ（IndexedDB のDB名・version）に影響する
- 削除候補が本当に不要か確証が持てない
- ラチェットの数値を**上げる**必要が出た（★下げるのは自由・上げるのは要相談）
- テストと実装が矛盾している

---

## 6. Baseline Commands（Phase 0 で必ず実行し結果を控える）

```bash
git status --short
npm run test:cc          # 実測 68秒
npm run lint
npm run typecheck        # 実測 4秒
npm run build
npm run verify:cc        # 上記＋15段のゲート。全体で数分
```

### ★2026-08-29 時点の実測 baseline（これと比べる）

| 対象 | 結果 |
|---|---|
| `npm run test:cc` | ✅ **894 passed / 1 skipped（895 files）・11,181 passed / 6 todo** |
| `npm run typecheck` | ✅ 通る（4秒） |
| `npm run lint` | ✅ 通る |
| `npm run verify:cc` | ✅ 全段 OK |
| `npm run check:layer` | ✅ 合格 |
| **GitHub Actions `test-and-build`** | ✅ success |
| **GitHub Actions `e2e`** | 🔴 **failure（2026-08-25 以降ずっと）** |

★**e2e の赤は既存の未解決課題**。原因は `multitab-storage` 系の
「tab#1 の inline パネルが描画完了マーカーを立てる」が 30秒タイムアウト。
**あなたのせいではないし、本タスクで直す対象でもない**。触らないこと。

---

## 7. ★このリポ固有の地雷（先に読む・実績あり）

| 地雷 | 内容 |
|---|---|
| **wiring テストがソースを文字列で読む** | 90本中89本が `readFileSync` でソースを読む。うち2本は `popup-entry.js` を読み、`SRC.indexOf('const storyAvatarLoadGuard = ...')` のような**文字列位置でブロックを切り出す**。★**関数を抽出するとこの文字列が消えて落ちる**（＝正しい挙動。配線が消えたのか移動したのか機械には区別できない） |
| **`verify:bump` が dist を grep** | `applyStoryGrowthIconAttributes` / `syncStorySourceEntries` / `renderCharacterScene` / `paintWatchPopupUi` の4シンボルが `extension/dist/popup.js` に含まれることを検査する。★**この4つを抽出・改名すると落ちる** |
| **`tree-map:check` / `feature-map:check`** | ファイルの追加・移動・削除で落ちる。`npm run tree-map` / `npm run feature-map` を再生成してコミットに含める |
| **`instrumentSpecCoverage.test.js`** | `MAX_UNDECLARED = 97` が**現在ちょうど97でギリギリ**。診断セルを増やすと即赤 |
| **`check:tracked-imports`** | `git add` し忘れたファイルへの import を検出（新規ファイルを作ったら必ず add） |
| **dist の buildId** | pre-push で毎回1つずれる。**追わない** |
| **changelog は20版で上限** | ★**2026-08-29 実測で現在ちょうど20版＝次の bump で必ず超える**。超えたら `node scripts/split-changelog.mjs` を実行し、`src/lib/changelog-archive.js` へ押し出す。★**実行後に「changelog + archive の版の総数」が実行前と一致するか必ず検算する**（過去に全1,331版を消した事故がある） |
| **`src/lib` の純粋性** | 抽出先で `chrome.*` を呼ぶと `check:layer` が赤くなる。I/O は呼び出し側に残す |

---

## 8. Debt Map（負債地図・すべて実測つき）

### D-1. ★`content-entry.js` のラチェットが無効化されている【最優先・実装してよい】

- **根拠**（実測）:
  - `src/extension/content-entry.js:1` に `/* eslint-disable max-lines */`
  - `eslint.config.js:405` の上限は `17267`
  - disable を外して `npx eslint` した結果:
    **`File has too many lines (19345). Maximum allowed is 17267`** ＝ **2,078行超過**
  - ユーザーは 2026-08-06 の指示書 §6「質問C → 確定: **やる**」と判断済み。**未実施のまま**
- **なぜ負債か**: ラチェットの目的は「これ以上太らないこと」。無効化されている間に2,078行増えた。
  ★**判定はあるのに効いていない**＝このリポが最も嫌う「守っているつもりで守れていない」型
- **影響範囲**: `content-entry.js` のみ（lint の通過条件が変わる）
- **変更リスク**: **低**。挙動は1行も変わらない。ただし外した瞬間 lint が赤になるので、
  上限を実測値に張り直すのが必須
- **改善案**:
  1. `/* eslint-disable max-lines */` を削除
  2. `eslint.config.js:405` の上限を **実測値+50**（呼吸代）に張り直す
  3. 変更理由を既存コメントの流儀に合わせて1行残す（いつ・なぜ・元は何だったか）
- **検証**: `npm run lint`（緑になること）／わざと1行足すと赤くなることを確認
- **判断**: ★**実装してよい**（ユーザー確定済み・挙動不変）

### D-2. ★`popup-entry.js` が上限に余裕ゼロ【実装してよい・段階的に】

- **根拠**（実測）:
  - 行数 **22,660** / `eslint.config.js:397` の上限 **22,660** ＝ **余裕 0 行**
  - 内訳: `function` 宣言 **440個** / `import` 元 **321ファイル** / `export` **0個** /
    `catch` 401 / `chrome.storage` 参照 135 / `setTimeout` 68
  - ★**I/O（`chrome.` / `document.` / `window.` / `fetch` / `setTimeout` / `addEventListener`）を
    含まない 25行以上の関数が 64個**ある。上位（★地雷判定は実測済み・2026-08-29）:

    | 行数 | 関数 | 位置 | テスト参照 | verify-bump | 判定 |
    |---:|---|---|---:|---:|---|
    | 187 | `mergeInterceptCacheItems` | :14026 | 0 | 0 | ✅ 安全 |
    | 137 | `sweepStoryAvatarRetryThrottled` | :5185 | **1** | 0 | 🔴 **★避ける** |
    | 118 | `maybePlaySupportCelebrationImmediate` | :2543 | 0 | 0 | ✅ 安全 |
    | 112 | `mergeCommentsWithInterceptCache` | :14213 | 0 | 0 | ✅ 安全 |
    | 106 | `noteCommentMilestoneHighWater` | :2661 | 0 | 0 | ✅ 安全 |
    | 95 | `clearWatchMetaCard` | :9487 | 0 | 0 | ✅ 安全 |
    | 82 | `applySelfPostedRecentsFromBag` | :5500 | 0 | 0 | ✅ 安全 |
    | 69 | `scanCommentsForGiftBahamut` | :3083 | 0 | 0 | ✅ 安全 |

    ★**`sweepStoryAvatarRetryThrottled` は選ばないこと。**
    `popupAvatarRetry.wiring.test.js` が `SRC.indexOf('const storyAvatarLoadGuard = ...')` 〜
    `SRC.indexOf('let _storyAvatarRetrySweepAt')` の**文字列範囲**でブロックを切り出しており、
    さらに「掃引が2つの描画経路の両方から呼ばれている」ことを**数 2 で固定**している
    （片肺配線を実際に捕まえた実績あり）。抽出すると確実に落ちる。

    ★**推奨する最初の3件**: `mergeInterceptCacheItems`(187) /
    `maybePlaySupportCelebrationImmediate`(118) / `mergeCommentsWithInterceptCache`(112)
    ＝ 合計 **417行**。これだけで上限を 22,660 → 約 22,250 まで下げられる見込み
    （★実際の減少幅は import 行の追加を差し引いて実測すること）。
- **なぜ負債か**: 余裕ゼロ＝**hotfix で1行足すこともできない**。
  過去に 21,764 → 19,974 まで下げた実績（v0.1.1057・HTMLレポート1,790行を
  `popup/report/htmlReportDocument.js` へ抽出）があるので、**やり方は確立している**
- **影響範囲**: `popup-entry.js` と抽出先。★**`app/live-view.js`（純Web版）が dynamic import
  しているので、そちらの動作にも波及する**
- **変更リスク**: **中**。§7 の wiring テスト・`verify:bump` の4シンボルに当たると落ちる
- **改善案**（★1関数=1コミット・小さく）:
  1. 上表から**wiring テストにも `verify:bump` の4シンボルにも当たらない**ものを1つ選ぶ
  2. `src/lib/<名前>.js` へ移し、`src/lib/AGENTS.md` の定型ヘッダを付ける
  3. **単体テストを同時に作る**（`src/lib` は848テストある箱。テスト無しで置かない）
  4. `popup-entry.js` は import して呼ぶだけにする
  5. ★**`eslint.config.js:397` の上限を、減った実測値に下げる**（下げないと意味がない）
- **検証**: `npm run test:cc` / `npm run lint` / `npm run check:layer` / `npm run verify:cc`
- **判断**: ★**実装してよい。ただし上位3件までで一度止めて報告**（残りは効果を見てから）

### D-3. ★抽出を阻む「文字列で固定されたテスト」【実装前に必読・単独では触らない】

- **根拠**（実測）:
  - `popup-entry.js` をソース文字列として読むテスト **2本**:
    `heavyReuseNotDoubleGated.wiring.test.js` / `popupAvatarRetry.wiring.test.js`
    （加えて `giftHistoryLaneStateWiring.test.js`）
  - 固定している文字列の例:
    `SRC.indexOf('const storyAvatarLoadGuard = createSupportAvatarLoadGuard(')`,
    `SRC.indexOf('const canReuseHeavyChunkRead')`, `SRC.indexOf('const giftHistoryApiRows =')`
  - `verify-bump.mjs:137-140` が dist に含まれることを要求する4シンボル:
    `applyStoryGrowthIconAttributes` / `syncStorySourceEntries` / `renderCharacterScene` / `paintWatchPopupUi`
- **なぜ負債か**: これは**負債であると同時に安全網**でもある。
  wiring テストは「片肺配線」（2経路のうち1つにしか繋がっていない）を実際に捕まえた実績がある
  （`popupAvatarRetry.wiring.test.js` のヘッダに実損記録）。★**軽々に消してはいけない**
- **影響範囲**: 抽出のたびに当たる
- **変更リスク**: **高**。テストを「通すために」緩めると、守っていたものが消える
- **改善案**: ★**この負債は今回直さない**。D-2 の抽出対象を選ぶときに
  **これらに当たらないものを選ぶ**ことで回避する。当たってしまったら §5 に従って**停止して質問**
- **判断**: ★**提案のみ。実装しない**

### D-4. lv-ID 判定の正規表現が107箇所にインライン展開【提案のみ】

- **根拠**（実測）: `/^lv\d{1,15}$/` 系が **107箇所**（テスト除く）。
  内訳 `popup-entry.js` 28 / `content-entry.js` 21 / `htmlReportDocument.js` 8 / ほか
  - ★**表記が揺れている実証**: `content-entry.js:3895` だけ `/^lv\d+$/`（桁上限なし）。
    `content-entry.js:17512` は `.toLowerCase()` を挟むが `comeview-entry.js:357` は挟まない
  - `src/lib/broadcastUrl.js` に `extractLiveIdFromUrl` 等はあるが、`isValidLiveId` 相当の共有 export は無い。
    `audienceEngagementGap.js:86` に**非 export の** `normalizeLiveId` がローカル定義されている
- **なぜ負債か**: 同じ判定の表記揺れは、**片方だけ直して片方が残る**事故を生む
- **影響範囲**: 107箇所（＝広い）
- **変更リスク**: **中〜高**。107箇所の一括置換は「ついでリファクタ」の典型で、
  Non-Negotiables §4 に反する。かつ `.toLowerCase()` の有無は**意図的な差の可能性**がある
- **改善案**: `src/lib/liveId.js` に `isValidLiveId` / `normalizeLiveId` を新設（テスト付き）。
  ★**置換はせず、新規コードだけがそれを使う**。既存107箇所は触らない
- **判断**: ★**提案のみ。今回は新設までで止め、置換はしない**

### D-5. 同型の除外関数が2本ある【提案のみ・小さい】

- **根拠**: `src/lib/excludeBroadcasterFromCommentEntries.js`(38行) と
  `excludeBroadcasterFromRankedRooms.js`(36行) が、**参照するフィールド名（`userId` / `userKey`）
  以外は1文字も違わない**
- **なぜ負債か**: 片方だけ直る危険
- **変更リスク**: **低**（どちらもテストあり）だが、**得られる価値も小さい**（74行）
- **改善案**: キー名を引数に取る1本へ統合
- **判断**: ★**提案のみ**。D-1/D-2 が終わって余力があれば

### D-6. ゲート13本中11本に selftest が無い【提案のみ・1本ずつなら実装可】

- **根拠**（`npm run audit:gates` の実測出力）:
  - **selftest が無い: 11/13本** → 毒を入れても赤くなるか誰も確かめていない
  - **「測れなかった」を出せない: 10/13本** → 走査0件でも緑になる
  - 見本は `scripts/check-layer.mjs`。監査自身が「**1リリース1本ずつでよい**」と書いている
  - ★注意: 監査は `codeOnly()` で**文字列リテラルを空にしてから**判定する。
    `process.argv.includes('--selftest')` だけでは検出されない。
    見本と同じく **`const SELFTEST = process.argv.includes('--selftest');`** の形にすること
    （実際 `check-tracked-imports.mjs` は selftest を持つのに「・」と出ている）
- **判断**: ★**D-1/D-2 の範囲外**。やるなら**別タスクとして1本ずつ**

---

## 9. Implementation Phases（小さく安全な順）

### Phase 0 — 現在状態の記録（コード変更なし）

1. `git status --short` を取り、§4-1 の3種（dist揺れ / council/auto / briefs）が
   **自分の変更でないこと**を確認して控える
2. §6 の baseline コマンドを全部走らせ、**結果を控える**
3. ★baseline と §6 の表を突き合わせ、**食い違いがあれば報告してから進む**

### Phase 1 — 安全網の確認（コード変更なし）

4. D-2 で抽出しようとしている関数が、§7 の地雷に当たらないか**先に grep で確かめる**:
   ```bash
   grep -rn "<関数名>" --include='*.test.js' src/
   grep -n "<関数名>" scripts/verify-bump.mjs
   ```
5. 当たるなら**別の関数を選ぶ**（当たったまま進まない）

### Phase 2 — D-1（ラチェットを効かせる・挙動不変）

6. `content-entry.js:1` の `/* eslint-disable max-lines */` を削除
7. `eslint.config.js:405` の上限を実測値+50 に張り直し、理由を1行コメントで残す
8. `npm run lint` が緑 → ★**わざと1行足すと赤くなることを確認**してから戻す
9. bump（3点セット + `npm run verify:bump`）してコミット

### Phase 3 — D-2（1関数ずつ抽出・最大3件で止まる）

各関数について、以下を**1コミット**として繰り返す:

10. `src/lib/<名前>.js` を新規作成（`src/lib/AGENTS.md` の定型ヘッダを付ける）
11. **単体テストを同時に作る**
12. `popup-entry.js` を import 呼び出しに置き換える
13. `eslint.config.js:397` の上限を**減った実測値に下げる**
14. `npm run test:cc` → `npm run lint` → `npm run check:layer` → `npm run verify:cc`
15. `git add` は新規ファイルを**明示列挙**。`npm run tree-map` は add の**後**
16. bump してコミット
17. ★**3件終わったら止めて報告**（残りは効果を見てから判断）

### Phase 4 — 提案のみ（実装しない）

18. D-3 / D-4 / D-5 / D-6 について、**やるとしたら何をどの順でやるか**を報告に書く。
    ★コードは書かない

---

## 10. Verification Requirements

各フェーズの**末尾で必ず**:

```bash
npm run test:cc      # 894 files / 11,181 tests が緑のままか
npm run lint
npm run typecheck
npm run check:layer  # src/lib の純粋性
npm run verify:cc    # 15段ゲート
```

- ★**baseline と同じか良いこと**を確認する。悪化したら**その場で止める**
- ★e2e は baseline から赤（§6）。**走らせなくてよいし、直さなくてよい**
- 生成物を触ったら `npm run tree-map` / `npm run feature-map` を再生成してコミットに含める

---

## 11. Reporting Format（最後に必ず出す）

```markdown
## 実行したコマンドと結果
| コマンド | baseline | 変更後 |
|---|---|---|
| npm run test:cc | 894 files / 11,181 tests 緑 | ... |
| npm run lint | 緑 | ... |
| npm run verify:cc | 全段OK | ... |

## 変更したファイル（1行ずつ・なぜ触ったか）

## ラチェットの推移
| ファイル | 前 | 後 |
|---|---|---|
| content-entry.js | 17,267（disable で無効） | ... |
| popup-entry.js | 22,660（余裕0） | ... |

## 止めて質問したこと / 判断に迷ったこと

## 提案のみに留めたもの（D-3〜D-6）とその理由

## 反映3手順
pull → 拡張リロード → watch タブ F5
```

---

## 12. Out-of-scope（今回やらないこと）

- **e2e の赤の修正**（baseline から赤・別の未解決課題）
- **D-3 の wiring テストの作り替え**（安全網でもあるため）
- **D-4 の107箇所の一括置換**（新設までで止める）
- **未追跡ファイルの add / 削除 / gitignore 追加**
  （`council/auto/` は master で ignore 済み・`briefs/` は別途ユーザー判断）
- **dist の buildId 揺れの追跡**
- `src/lib` の整理（**既に1ファイル1責務が成立している。触らない**）
- `content-entry.js` からの関数抽出（★Phase 2 でラチェットを効かせるところまで。
  抽出は popup 側の結果を見てから別タスク）
- manifest / privacy.html / ストア掲載文の変更
- IndexedDB のスキーマ・DB名・version の変更
