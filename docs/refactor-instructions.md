# refactor-instructions.md — 点滅追跡計器の撤去と安全な負債整理（実装担当モデル向け指示書）

> **作成**: 2026-08-06 / 司令塔(Claude Code)が実コードを読んで証拠ベースで作成
> **改訂**: 2026-08-06 追補 — §6 の質問A〜Dはユーザー確定済み（回答を §6 に記載）。
> ユーザー指摘「診断ページが重い。干渉しない仕組みを作るべきかもしれない」を受け
> **Track B（診断ページの重さ・真因調査）** を追加。Track A（計器撤去）とは**独立して実施・コミットできる**。
> ⚠️ Track B は当初「コア3read のバッチ化」で起案されたが、**実測（2026-08-06T07:18Z・v0.1.1277）で効果が否定された**
> ため「まず真因を特定する調査」へ書き直した（§8 D-8）。実測より前の仮説をこの文書に書き戻さないこと。
> **対象リポ**: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com`
> **想定実装者**: Codex / Opus / Cursor 等（`/goal docs/refactor-instructions.md` で渡される前提）
> **着手前に必読**: [AGENTS.md](../AGENTS.md)（特に §3 設計判断・§12 実装前ゲート・§12.5 version bump）、
> [CLAUDE.md](../CLAUDE.md)、[docs/handoff/HANDOFF-resume-0806-sidepanel.md](handoff/HANDOFF-resume-0806-sidepanel.md)
>
> ⚠️ **ルート直下に別の `refactor-instructions.md`（entry 分割・component-factoring 計画）が既に存在する。**
> あれは「popup-entry / content-entry を薄くする」長期計画（Phase 0 完了・Phase 1 未着手）で、**本書とは別タスク**。
> 本書は「点滅追跡で入れた計器の撤去＋確実に安全な整理」に**限定**する。entry 分割はここではやらない。

---

## 1. Objective（目的）

2026-08-01〜06 の「パネル点滅」調査で `src/extension/content-entry.js` に投入された
**点滅追跡専用の診断計器（8系統）と、その残骸（死んだ送信口・終了済み実験フラグ）を、挙動を変えずに撤去する。**

- 背景: 点滅は Side Panel 移行（v0.1.1275）で解決済み。5日間で28版、うち14版が計器だった
  （[docs/handoff/HANDOFF-resume-0806-sidepanel.md](handoff/HANDOFF-resume-0806-sidepanel.md) §未解決(4)）。
- ユーザーの明言した方針: **「用が済んだ計器は外す。ただし診断強化そのものは残す」**。
  → 撤去するのは点滅追跡専用の計器**だけ**。診断の仕組み（状態速報・fastDiag・診断レジストリ・
  進行中バグ用の計器）は**残す**。
- 副次目的（安全なもののみ）: content-entry.js の死んでいる max-lines ラチェットの復活、
  計器スナップショット重複の解消。

**追加目的（Track B・独立実施可）**: 診断ページ（status-entry.js）の更新が実測 9.8秒かかる問題の
**真因特定**。実測で重いのは `lives`(5.5秒) と `summaries`(4.3秒) の2つだけと判明済み（§8 D-8）。
原因が確定するまで修正はしない（調査→提案→承認→実装の順）。

**目的ではないもの**: 見た目の綺麗さ・entry ファイルの分割・新機能・未解決バグ（101%二重計上／
「watchページが見つかりません」）の修正。

---

## 2. Project Understanding（プロジェクト理解・証拠ベース）

### 2.1 何をするものか

**「君斗りんくの追憶のきらめき」** — ニコニコ生放送（`*.nicovideo.jp`）の応援コメントを
利用者本人のローカル（`chrome.storage.local`）に記録し、3キャラ（りんく／こん太／たぬ姉）の
レーンで振り返れる Chrome 拡張（MV3）。CWS 公開中（拡張ID `cjbabignmmodaickpeckiojjabnlogdb`）。
LP + プライバシーポリシーは `tsuioku-no-kirameki/`（Cloudflare Pages 自動デプロイ）。

### 2.2 主要エントリーポイント（esbuild bundle: `scripts/build.mjs` → `extension/dist/` ほか）

| ファイル | 行数 | 責務 |
|---|---|---|
| `src/extension/content-entry.js` | 19,464 | **watch ページ常駐の記録エンジン**。NDGR受信・DOM収集・記録・backfill・インラインパネル host 管理。**本書の主戦場** |
| `src/extension/popup-entry.js` | 22,225 | ポップアップ/サイドパネル UI 本体（応援レーン・HTMLレポート・診断共有）。**本書では触らない** |
| `src/extension/page-intercept-entry.js` | 1,531 | MAIN world スクリプト（fetch フック・コメント送信 `NLS_INTERCEPT_COMMENT_POST` 経路）。v0.1.1276 で点滅調査トラップは**撤去済み** |
| `src/extension/status-entry.js` | 3,656 | 状態速報（診断）ページ |
| `extension/background.js` | — | SW。**Side Panel を開くクリックリスナー（v0.1.1275・触るな）**。`chrome.sidePanel.open()` は同期呼び出し必須 |
| `src/lib/*.js` | 約640モジュール + 約650テスト | 純関数ライブラリ（vitest 対象） |

### 2.3 データフロー（本書に関わる範囲）

- コメント: NDGR(fetch intercept, MAIN world) + DOM 走査 → content-entry が `chrome.storage.local` へ記録。
- 診断: content-entry が `buildAiShareFastDiagnosticsPayload()`（行7236）と
  `buildAiSharePageDiagnostics()`（行9883）で診断 JSON を構築 → `src/lib/statusFastDiagLite.js` が
  「印字用サブセット(lite)」を作る → 状態速報のコピペ・`npm run status:live` に出る。
  **lite に通っていない計器はユーザーのコピペに永久に出ない**（memory [[fastdiag-lite-is-the-printer-subset]]）。
  → 計器を消すときは **full(2箇所) + lite + 整形(aiShareFullText.js)** を揃って消す必要がある。

### 2.4 検証コマンド（実在を package.json で確認済み）

| コマンド | 内容 |
|---|---|
| `npm run verify:cc` | **出荷ゲート一本**。test:cc → lint → typecheck → build → no-secrets → tracked-imports → tree-map:check → site-health:check → feature-map:check → verify:bump の10段（`scripts/run-verify-cc.mjs`）。失敗時は `.artifacts/verify-cc.log` を読む |
| `npm run test:cc` | vitest（dot reporter）。`npx vitest run` をパイプ付きで打つのは禁止（Windows でハング） |
| `npm run lint` / `npm run typecheck` | eslint / tsc --noEmit |
| `npm run verify:bump` | manifest / package.json / changelog の版数同期チェック |
| `npm run tree-map` / `npm run feature-map` | lib ファイルを消したら**再生成してコミットに含める**（check が verify:cc 内にあり、古いままだと落ちる） |
| 個別テスト | `npx vitest run src/lib/<file>.test.js --reporter=dot` |

### 2.5 このリポ固有の地雷（実績あり・必ず守る）

- **Windows**: 日本語パスは引用符。PowerShell に日本語文字列を渡さない。Unix パイプ（`tail`/`head`/`grep`）を PowerShell で使わない。
- **dist は git 追跡**。pre-push フックがビルドを走らせるため **push 直後は dist の buildId が1つずれる**。追いかけない（既知の揺れ）。
- **wiring テストは変異で赤を確認するまでが1セット**（memory [[wiring-test-mutation-check-2026-08-01]]）。
  ゲート・計器を撤去したときは、**テストの「向き」を反転**させて「消えていること」を固定する
  （HANDOFF-resume-0806 踏んだ地雷#4）。regex は前後アンカーまで固定（[[mutation-test-needs-anchored-regex-2026-08-05]]）。
- **python の一括置換は CRLF/LF で壊れる**（`newline=''` 必須）。原則 Edit ツール等の exact-match 置換を使う。
- **バンドラは日本語を `\uXXXX` にする**ので dist の grep では日本語文言は見つからない。
- **paint 毎の DOM 走査は禁止**（v0.1.1201 で拡張全体を重くした前科）。

---

## 3. Behaviors To Preserve（絶対に壊してはいけない既存挙動）

以下は**計器と同じ名前空間・同じ関数に混在している「実挙動」**。1行も変えない。

1. **`INLINE_HOST_HIDDEN_ATTR`（`data-nls-hidden`）= 「消えている」状態の唯一の正本**
   - 定義: `src/lib/inlineHostVisibilityIntent.js:103`
   - CSS ルール `#nls-inline-popup-host[data-nls-hidden="1"] { display:none !important; ... }`
     （content-entry.js 行3605付近・v0.1.1266 で「CSS既定を安全側に反転」した着地）
   - host 生成直後の属性付与（content-entry.js 行4299。「こん太を押すまで出さない」を守る窓ゼロの実装）
   - 固定テスト: `src/lib/inlineHostHiddenAttr.wiring.test.js`（**残す**）
2. **`setInlineHostDisplay()`（行3096）= host の display を書き換える唯一の入口**
   - 9箇所に散っていた直接代入の集約。属性の付け外しと必ずセット。関数自体・集約構造は残す
     （内部の計器呼び出し `noteHostHidden`/`noteHostShown`/`noteInlineHostHideReason`/`trail` だけが撤去対象）。
3. **`setInlineHostVisible()`（行3194）= 見せる/消すの唯一の入口**（display/opacity/pointerEvents/aria-hidden をセットで書く）
4. **`_inlineHostEverShown` ガード（行3192・v0.1.1274）**: 一度表示したパネルを `autoshow_off` で消さない。
   固定テスト: `src/lib/autoshowHideExperiment.wiring.test.js` の該当 it（このガードの断言は**残す**か、テスト再編時も断言を維持）。
5. **`shouldHideInlineHostOnMissingPanel()`（inlineHostRecoveryGate.js・使用箇所 行13167）**:
   ニコ生 SPA 再描画でコメントパネルが一時未検出でも「watch URL に居る限り消さない」ガード。
   `verdict.hide` の判定と `hidePageFrameOverlay('left_watch_page')` への流れは不変。
   （撤去してよいのは診断カウンタ `_inlineHostRecoveryDiag` への加算だけ）
6. **`ensurePageFrameStyleAlive()`（行3022）**: 拡張の `<style>` が外部に消されたとき貼り直す自己修復。
   4秒経路から無条件で呼ばれる（行13145）。**復帰経路なので残す**（[[gate-may-be-the-only-recovery-path-2026-08-04]]）。
   （撤去してよいのは回数カウンタ `_pageFrameStyleReattachCount` だけ）
7. **Side Panel まわり（extension/background.js）**: クリックリスナーの同期 `chrome.sidePanel.open()`、
   `nls_toolbar_action_policy`（`prefer_focus_inline` で埋め込みへ戻す道）。**一切触らない**。
8. **記録エンジン全体**: NDGR受信・DOM走査・persist・backfill・4秒 poll（`syncLiveIdFromLocation` 等）の
   タイマー構造。`stopContentIntervalsIfContextInvalidated` の解除順も不変。
9. **進行中バグ調査用の計器（撤去禁止）**: `dedupeSeedDiag`（記録101%二重計上の調査中・HANDOFF §未解決(2)）、
   `commentSubmitDiag`（送信の感度計測）、`scrollWhiteoutDiag`・`hostMoveDiag`（§6 質問A=残すで確定）。
10. **プライバシー/ストア関連**: manifest の権限・description・privacy 文書には触れない。
11. **【Track B】status-entry.js のコア read は直列のまま**。`Promise.all` 並行化は
    **v0.1.867 で実施→実機退行（timeout 多発・fastDiag={}・記録0）→v0.1.868 で撤回済み**
    （status-entry.js 行631-633 のコメントで確認済み）。**並行化は提案すら禁止**。
    正しい方向は「read の回数・量そのものを減らす」。
12. **【Track B】extras 17項目のバッチ read（`_extrasBatchGuard`・v0.1.1084・12秒間引き
    `EXTRAS_REFETCH_MS`）は手当て済みの現役構造**（status-entry.js 行669-681・
    `src/lib/statusExtrasBatch.js`）。触らない。
13. **【Track B】stale-guarded-read の意味論**（timeout しても throw せず stale 値で描く・
    2026-07-14 の608秒固まり根治）を変えない。
14. **IndexedDB へのコメント保存移行は永久却下済み**（2026-06-01 実機失敗・
    `FORCE_DISABLE_COMMENT_IDB_PATH` が content-entry.js に現存）。候補に挙げない。

---

## 4. Non-Negotiables（作業規律・違反したら差し戻し）

1. **最初に `git status` を確認**。既存の未コミット変更（`app/dist/live-view.js` / `extension/dist/popup.js` /
   `extension/dist/status.js` の dist 揺れ、未追跡の council ログ類）と**自分の変更を混ぜない**。
   未追跡ファイルの削除・gitignore 追加は**しない**（ユーザーのローカル資産）。
2. **編集前に baseline を記録**: `npm run verify:cc` を1回流し、結果（10段の OK/NG）を控える。
   baseline で既に赤いものは自分の責任範囲外として記録だけする（黙って直さない）。
3. **変更は小さく戻しやすい単位**（計器1系統 = 1コミット目安）。各フェーズ末に検証。
4. **無関係な整形・ついでリファクタ禁止**（AGENTS.md §12.2「外科的に変更」）。
5. **既存挙動を勝手に変えない**。§3 のリストに触れる必要が生じたら**停止して質問**。
6. **version bump は §12.5 に従う**: 意味ある変更1つ = patch 1つ。3点セット
   （`extension/manifest.json` / `package.json` / `src/lib/changelog.js` 先頭・summary 35字以内）を同期し
   `npm run verify:bump` を通す。本タスクは「計器撤去」で1バンプ、「ラチェット復活」で1バンプが目安。
7. **push しただけでは Chrome に届かない**: 報告には反映3手順（pull → 拡張リロード → watch タブ F5）を1行添える。
8. **lib ファイルを削除したら** `npm run tree-map` と `npm run feature-map` を再生成しコミットに含める。
9. **`git add` は新規/削除ファイルを明示列挙**（フィルタ add による取りこぼし事故の実績あり・AGENTS.md §12.5）。
10. commit メッセージ規約は AGENTS.md §7（`refactor(content): ...` 等・日本語可）。

---

## 5. Stop And Ask Conditions（実装を止めて質問する条件)

- §3 の「Behaviors To Preserve」のいずれかを変更・削除しないと先へ進めないとき。
- 撤去対象リスト（§7 Phase 2-4 の名指し分）**以外**の計器・診断・ゲートを消したくなったとき
  （特に `scrollWhiteoutDiag` / `hostMoveDiag` / `dedupeSeedDiag` / `commentSubmitDiag` / 診断レジストリ系）。
- テストが「計器の存在」を固定していて、撤去の向きに反転してよいか判断がつかないとき
  （例: そのテストが実挙動の断言を**同居**させている場合 — `autoshowHideExperiment.wiring.test.js` が該当。
  実挙動の断言だけ残して計器の断言を落とす、が原則だが、切り分けに迷ったら質問）。
- `statusFastDiagLite.js` から削るフィールドが撤去対象リスト外に及ぶとき。
- `extension/background.js`・`manifest.json`・storage キーのスキーマ・保存済みデータに影響が及ぶとき。
- baseline の `verify:cc` が赤で、原因が自分の変更か既存かを切り分けられないとき。
- eslint ラチェット復活（Phase 5）で lint が予想外の別ルールで赤くなったとき。
- 【Track B】真因調査の結果、修正案が §3 の 11〜14（直列維持・extras 不可侵・stale-guard 意味論・
  IndexedDB 却下）のいずれかに抵触するとき、または表示の鮮度・更新間隔などユーザー体感が
  変わりうる案しか無いとき（例: トレンド記録 `recordAndAnalyzeTrendSafe` 内の `set`
  （status-entry.js 行1305）を読み取りサイクル外へ出す・混雑中スキップする等は挙動が変わりうるので
  実装前に必ず質問）。
- 【Track B】調査で計器（タイミング計測）を仕込む必要があり、それが出荷版に乗るとき
  （計器スパイラルの再発防止: [[instrument-spiral-25-versions-2026-08-06]]。計器を2版続けて
  入れる前に必ず立ち止まる）。

---

## 6. 実装前の質問と回答（2026-08-06 ユーザー確定済み・実装者は再質問不要）

- **質問A → 確定: 残す**。`scrollWhiteoutDiag`（v0.1.923）と `hostMoveDiag`（v0.1.1124）は
  点滅追跡以前からの計器で HANDOFF の撤去リスト8系統に入っていない。**撤去対象に含めない**。
- **質問B → 確定: ファイルごと削除**。撤去する計器の lib モジュール（`hostVisibilityWatch.js` 等 +
  単体テスト）は削除する（参照ゼロで残すと死コードになるため）。
- **質問C → 確定: やる**。content-entry.js 行1 の `/* eslint-disable max-lines */` を外し、
  ラチェットを実測+50 に張り直す（Phase 5）。
- **質問D → 確定: 今回はやらない**。ルート直下の設計文書の `docs/handoff/` への移動は提案のみ（Phase 6）。

Track B で新たに質問が生じた場合（§5 の Stop And Ask 条件）は、その都度停止して質問すること。

---

## 7. Baseline Commands（Phase 0 で必ず実行・記録）

```bash
git status                  # 既存差分の確認（dist 3ファイルの揺れは既知）
git log --oneline -5        # 現在地の確認（v0.1.1277 相当のはず）
npm run verify:cc           # 10段の結果を控える（.artifacts/verify-cc.log）
```

---

## 8. Debt Map(負債地図・証拠つき)

### D-1. 点滅追跡計器8系統が content-entry.js に残留【本タスクの本体・実装してよい】

- **根拠**: `src/extension/content-entry.js` 行2827-3087（状態と rAF ループ）、行7313-7360 と
  行10046-10090（診断 JSON への出力・**ほぼ同一ブロックが2箇所に重複**）、行14974（`startHostVisibilityWatch()` を無条件起動）。
  HANDOFF-resume-0806 §未解決(4) が撤去対象を名指し:
  `vanishForensics` / `hostStyleTrace` / `hostAncestryTrace` / `hostVisWatch` / `hostFlipCensus` /
  `hostHideReason` / `styleReattach` / `hostRecoveryDiag`。
- **なぜ負債か**: 点滅は Side Panel 移行で解決済み＝用済み。`startHostVisibilityWatch` は
  **rAF 毎フレームループ**で、Side Panel 既定でも回り続ける（host 不在時はほぼ no-op だが wakeup は毎フレーム）。
  `ensureHostAncestryMutationTrace` は host+親+祖父に MutationObserver を張る。
  状態速報 JSON が長く読みにくい（ユーザーも「削ると読みやすくなる」と明言）。
  **実測証拠（2026-08-06T07:18Z・v0.1.1277・ユーザー実機の速報）**: Side Panel 移行後にも
  `hostVisWatch: frames 12660` / `hostAncestryTrace: 属性変化1830件` / `hostStyleTrace: 946回` と
  **全計器が回り続けている**ことが確認された＝撤去の妥当性の裏づけ。
- **影響範囲**: content-entry.js、`src/lib/statusFastDiagLite.js`（passthrough）、`src/lib/aiShareFullText.js`（整形）、
  lib 8ファイル（`hostVisibilityWatch.js` / `hostVisibilityFlipCensus.js` / `hostStyleMutationTrace.js` /
  `hostVanishForensics.js` / `inlineHostVanishClassifier.js` / `inlineHostHideReasonCensus.js` の各実装+単体テスト。
  ※`inlineHostVisibilityIntent.js` と `inlineHostRecoveryGate.js` は**実挙動を含むので削除禁止**）、
  wiring テスト5+本（`hostVisWatch` / `hostFlipCensus` / `hostStyleTrace` / `inlineHostHideReason` /
  `vanishForensics1267` の各 .wiring.test.js）。
- **変更リスク**: 中。計器と実挙動が同じ関数に混在（§3 参照）。lint(no-unused-vars) と
  wiring テスト反転で機械検出できる。
- **改善案**: Phase 2-4 の手順どおり1系統ずつ撤去。
- **検証**: 各コミットで `npm run test:cc` + `npm run lint`、フェーズ末に `verify:cc`。
  撤去後に「消えていること」を固定するテストを1本追加（§9 Phase 3 参照）。

### D-2. MAIN world 書き込みトラップの死んだ送信口【確実な死コード・実装してよい】

- **根拠**: v0.1.1276（commit ee29dba9）で page-intercept-entry.js 側のトラップ本体・受信側を撤去済み
  （`grep hwt src/extension/page-intercept-entry.js` は0件）。しかし content-entry.js に
  `armHostWriteTrap()`（行2871・呼び出し 行3050, 4307）、`helloHostWriteTrap()`（行2886・呼び出し 行14366）、
  `_hwtArmedHost`（行2863）が残り、**誰も聴いていない CustomEvent（`nls:hwt-arm`/`nls:hwt-hello`）を dispatch し続けている**。
- **なぜ負債か**: 受信者ゼロの送信＝純粋な死コード。読み手を「MAIN world に何かある」と誤誘導する。
- **影響/リスク**: 低。dispatch は no-op。削除で挙動不変。
- **検証**: `grep -rn "hwt" src/` が0件になること + test:cc 緑。

### D-3. 終了済み二分実験フラグ【確実な死コード・実装してよい（テストの扱いに注意）】

- **根拠**: `INLINE_AUTOSHOW_HIDE_EXPERIMENT = false`（content-entry.js 行3190。コメントに
  「実験は終了(2026-08-05)・無罪と確定」と明記）。`src/lib/autoshowHideExperiment.wiring.test.js` が
  「フラグが定義されている」ことを固定している。
- **なぜ負債か**: 実験終了・恒久 false。フラグ分岐が読み手の認知コストになる。
- **実測で確認された実害（2026-08-06 速報）**: `パネルを消した理由 ⚠ 1774回 —
  autoshow_off_experiment_skipped 887 / autoshow_off 887` と、**実験由来のタグが本番の診断に
  50% を占めて出続けている**。実コードで裏取り済みの構造:
  - `noteInlineHostHideReason('autoshow_off_experiment_skipped')`（content-entry.js 行7939）は
    autoshow の hide 判定が立つたび**無条件に**打たれる census 記録（＝計器。名前が実験当時のまま）。
  - 実際に消す実行は行7960 `if (!INLINE_AUTOSHOW_HIDE_EXPERIMENT && !_inlineHostEverShown)` に
    ゲートされており、フラグは恒久 false なので**実効条件は `!_inlineHostEverShown` だけ**
    （= v0.1.1274 の everShown ガード。これは意図された実挙動）。
  - つまり**挙動は正しく、汚れているのは計器のタグ名と実験フラグの残骸**。887回の
    `_skipped` は「everShown により消さなかった」回数が実験名で記録されているだけ。
- **畳み方（挙動不変を厳守）**: 行7960 の条件を `if (!_inlineHostEverShown)` に畳む。
  verdict.hide かつ everShown=true のときの**素通り（通常描画へ進む）は意図された挙動なので維持**。
  `autoshow_off_experiment_skipped` の note はタグごと撤去（hostHideReason census 自体が
  Phase 3 #6 の撤去対象）。`autoshowHideExperiment.wiring.test.js` は行43/50 でこの note の
  存在を固定しているため、**反転**が必要。
- **注意**: 同テスト内の **「一度でも表示したら autoshow_off では消さない」（v0.1.1274 ガード）の断言は実挙動**。
  フラグ撤去時、この断言は独立テストとして**必ず残す**（テスト名を実態に合わせて改名可）。
- **検証**: 変異（ガード条件を `if(false)` 前置）でテストが赤くなることを確認してから戻す。
  撤去後の実機速報で `autoshow_off_experiment_skipped` が診断から消えていること。

### D-4. content-entry.js の max-lines ラチェットが死んでいる【実装してよい（§6 質問C=やるで確定）】

- **根拠**: `eslint.config.js` 行251-253 は `max-lines: 17267` を課しているが、
  content-entry.js **行1に `/* eslint-disable max-lines */`**（v0.1.723 で追加・commit 904efc4c）があり
  **ルールは一度も効いていない**（実測: 19,464行でも `npx eslint --no-cache` が exit 0。本調査で確認済み）。
  popup-entry.js のラチェットは生きていて版ごとに保守されているのと対照的。
- **なぜ負債か**: 「ラチェットで成長を止めている」という config コメントと実態が乖離。
  ガードがあると信じられているのに無い＝サイレントな成長を許す。
- **改善案**: 撤去フェーズ完了**後**に行1の disable を外し、eslint.config.js の max を
  「その時点の実測+50」へ更新（popup-entry と同じ流儀でコメントに実測値と理由を記す）。
- **検証**: `npm run lint` 緑。変異（適当な行を51行追加）で赤くなることを手元確認して戻す。

### D-5. 診断スナップショット構築の重複【実装してよい（Phase 4 で自然解消・残りは任意）】

- **根拠**: `buildAiShareFastDiagnosticsPayload()`（行7236〜）と `buildAiSharePageDiagnostics()`（行9883〜）に
  計器スナップショット群（hostFlipCensus〜hostRecoveryDiag、各 line 整形込み）の**ほぼ同一ブロックが2箇所**。
- **なぜ負債か**: 片方だけ直す事故の温床（このリポで実績のある「配線漏れ」型）。
- **改善案**: 撤去でブロック自体が消えるのが第一。撤去後も両者に残る共通部が3項目以上あれば
  1ヘルパー関数へ寄せる（**任意・小さく**。大きな組み替えはしない）。

### D-6. ルート直下の設計文書散乱【提案のみ・実装しない】

- **根拠**: git 追跡のルート直下に `lane-never-drop-*.md` / `venue-*-SPEC.md` / `*-DESIGN.md` 等 20+ ファイル。
  2026-07-31 に「設計文書は `docs/handoff/` へ」の方針が確立済み（memory 索引・tree-map drift の実績）。
  ほかに未追跡の council ログ・`UsersinfoAppData...json` 等の作業残骸もあるが**ユーザーのローカル資産なので触らない**。
- **リスク**: 移動はリンク・`site-health`・tree-map に波及。**本タスクでは提案に留める**（質問D）。

### D-7. 全 entry の `@ts-nocheck`【提案のみ・実装しない】

- **根拠**: `src/extension/*.js` 全6 entry + 一部 lib（aiShareFullText.js 等）の行1に `@ts-nocheck`。
  typecheck が entry 本体を素通りしている。
- **判断**: 19k/22k 行の entry から外すのは大工事で、entry 分割計画（ルートの refactor-instructions.md）の
  領分。**ここではやらない**。

### D-8. 診断ページの更新が9.8秒（真因未確定・調査から始める）【Track B・調査は実装してよい、修正は承認後】

- **実測（2026-08-06T07:18Z・v0.1.1277・ユーザー実機）**:
  ```
  更新所要(計器): 9812ms(重い順: lives 5493ms / summaries×1 4314ms / render 5ms)
  ```
  条件: 記録中は**1配信のみ**・取得率100%（3,726/3,720）・最終取り込み5秒前・backfill 停止中。
- **この実測が否定したこと（重要・逆戻り禁止）**:
  1. **「コア3read（fastDiagLite/popupDiag/backfill）のバッチ化」は的外れ**。3つとも重い順に
     一度も出てこない。9.8秒のほぼ全部が `lives` と `summaries`。→ 当初案のバッチ化フェーズは
     **効果が実測で否定済みとして本書から削除**（やらない）。
  2. **「診断は記録側書き込みの被害者」という従来説明（[[status-diag-is-victim-not-cause-2026-08-02]]）
     だけでは説明できない**。上の実測はほぼ空いている状態で lives 5.5秒・summaries 4.3秒。
     従来説明を前提にした対策を立てないこと。
- **実コードで確認済みの事実（調査の出発点）**:
  - `enumerateActiveLives()`（status-entry.js 行870-929）の経路1は **`chrome.tabs.query`**
    （storage read ではない）。watch タブが開いていれば経路1で early return するので、
    5.5秒は tabs.query 自体（またはガード層）で費やされている可能性がある。**LevelDB とは限らない**。
  - `loadAllSummaries()`（行974-989）は**既に1回の `chrome.storage.local.get(keys)`**（配信ごとに
    `nls_panel_summary_` / `nls_watch_snapshot_` / `nls_perf_diag_` / `nls_live_ended_` の4キー）。
    1配信=4キーの単発 get に4.3秒。**呼び出し回数の問題ではなく、値の大きさか storage 層の詰まり**。
    `nls_watch_snapshot_<lv>` は cached-first render 用スナップショット（`src/lib/storageKeys.js`
    行650-656）で、**サイズがコメント件数に比例するかは未確認**＝要調査。
- **なぜ負債か**: 診断ページの体感が壊れている（9.8秒/更新）のに、原因の所在（tabs.query か・
  値の肥大か・storage 層か）が特定されていない。
- **変更リスク**: 調査自体は低（読むだけ+ローカル計測）。修正は真因次第＝**原因確定前に修正しない**。
- **改善案**: §9 Track B の手順（調査→報告→承認→実装）。
- **検証**: 修正が入る場合は同じ計器行（更新所要の重い順）で before/after を実測比較。

---

## 9. Implementation Phases（実装フェーズ・この順で・各フェーズ末に検証）

**Track A（Phase 0〜6・計器撤去）と Track B（Phase B0〜B2・診断ページの重さ調査）は独立**。
どちらか片方だけ実施しても意味が通る。コミット・version bump も混ぜない。

### Phase 0: 現状確認（編集なし）

1. `git status` / `git log --oneline -5` を記録。
2. `npm run verify:cc` を実行し baseline を記録（§7）。
3. 本書 §3（Behaviors To Preserve）の各箇所を実際に Read して現物を確認する
   （行番号は v0.1.1277 時点。ズレていたら現物優先で読み直す）。

### Phase 1: 安全網の確認（テスト追加のみ可・実装変更なし）

1. 実挙動を固定している既存テストが緑であることを個別確認:
   - `src/lib/inlineHostHiddenAttr.wiring.test.js`（hidden 属性の正本）
   - `src/lib/inlineHostVisible.wiring.test.js`（見せる/消すの唯一入口）
   - `src/lib/inlineHostRecoveryGate.test.js`（SPA 再描画ガード）
   - `src/lib/inlinePanelShowGate` 系テスト
   - `src/lib/autoshowHideExperiment.wiring.test.js`（everShown ガードの断言を含む）
2. これらが撤去対象の計器に依存していないか読む。依存があれば Stop And Ask。

### Phase 2: 確実な死コードの撤去（1コミット）

1. **hwt 送信口**（D-2）: `armHostWriteTrap` / `helloHostWriteTrap` / `_hwtArmedHost` と呼び出し3箇所
   （行3048-3051, 4307, 14366）を削除。
2. **実験フラグ**（D-3）: `INLINE_AUTOSHOW_HIDE_EXPERIMENT` を撤去し分岐を畳む。
   `autoshowHideExperiment.wiring.test.js` は「フラグ存在」断言を削り、
   **everShown ガードの断言は独立して残す**（改名可）。撤去を固定する断言
   （`INLINE_AUTOSHOW_HIDE_EXPERIMENT` が content-entry に**現れない**こと）を追加。
3. 検証: `npm run test:cc` + `npm run lint`。変異確認（ガードに `if(false)` 前置→赤→戻す）。

### Phase 3: 点滅計器の撤去（1系統=1コミット・依存の浅い順)

対象8系統（HANDOFF 名指し分のみ。**これ以外は消さない**）:

| # | 計器 | content-entry の主な撤去点 | lib（§6 質問B=削除で確定） | 反転すべき wiring テスト |
|---|---|---|---|---|
| 1 | `hostAncestryTrace` | `_hostAncestryTrace`(2857) / `ensureHostAncestryMutationTrace`(2898) / 呼び出し(3044, 4306) / snapshot 2箇所 | （content 内実装のみ） | — |
| 2 | `hostStyleTrace` | `_hostStyleTrace`(2836) / `_hostStyleObserver` / `_hostMutPrevVisible` | `hostStyleMutationTrace.js` + test | `hostStyleTrace.wiring.test.js` |
| 3 | `vanishForensics` | `_vanishForensics`(2837) / `trail()`(2839) / `captureVanishSnapshot`(2979) / rAF 内の遷移検出(3057-3072) / `_hostRafPrevVisible` / `_lastLivePollTickAt`(2861, 12958) | `hostVanishForensics.js` / `inlineHostVanishClassifier.js` + tests | `vanishForensics1267.wiring.test.js` |
| 4 | `hostVisWatch` | `_hostVisWatch`(2830) / `noteHostFrame`(3073) | `hostVisibilityWatch.js` + test | `hostVisWatch.wiring.test.js` |
| 5 | `hostFlipCensus` | `_hostFlipCensus`(2827) / `noteHostHidden`/`noteHostShown`(3141-3142) | `hostVisibilityFlipCensus.js` + test | `hostFlipCensus.wiring.test.js` |
| 6 | `hostHideReason` | `_hostHideReasonCensus`(3166) / `noteInlineHostHideReason`(3169, 3123) | `inlineHostHideReasonCensus.js` + test | `inlineHostHideReason.wiring.test.js` |
| 7 | `styleReattach` | `_pageFrameStyleReattachCount`(2859, 3025) **のみ**（`ensurePageFrameStyleAlive` 本体は残す） | — | — |
| 8 | `hostRecoveryDiag` | `_inlineHostRecoveryDiag`(6121) と加算(13173 等) **のみ**（gate 本体・`shouldHideInlineHostOnMissingPanel` は残す。`formatInlineHostRecoveryLine` import は未使用化したら import から外す） | （`inlineHostRecoveryGate.js` は**削除禁止**） | `inlineHostRecoveryGate.test.js` は挙動断言を残す |

各系統で必ずセットで行うこと:
1. content-entry の状態・呼び出し・**診断 JSON 2箇所**（行7313-7360 / 10046-10090 相当）から除去。
2. `src/lib/statusFastDiagLite.js` の passthrough（行104-176 相当）から該当フィールドを除去。
3. `src/lib/aiShareFullText.js` の該当整形を除去。
4. lib 実装+単体テストを削除（§6 質問B=削除で確定）。wiring テストは**反転**（「import されていない/識別子が現れない」を
   アンカー付き regex で断言する形へ）。反転テストは新設1本 `src/lib/flickerInstrumentsRemoved.wiring.test.js` に
   集約してよい（既存 wiring テストは削除）。
5. `npm run test:cc` + `npm run lint`（no-unused-vars が取り残し import を検出する）。
6. 変異確認: 撤去断言テストに対し、ダミーで `createHostVisibilityWatch` 等の文字列を content-entry に足す→赤→戻す。

### Phase 4: rAF ループ本体の撤去（1コミット）

Phase 3 完了後、`startHostVisibilityWatch()`（行3030-3087）の中身は計器のみになる（本調査で確認済み:
tick 内は trace 再attach / hwt 再arm / vanish 採取 / noteHostFrame の4つで全て計器）。
1. `startHostVisibilityWatch` / `_hostVisWatchRaf` / 起動呼び出し（行14974）を削除。
2. 診断 JSON の重複ブロック（D-5）で残った共通部があれば、3項目以上のときだけ小ヘルパーへ寄せる（任意）。
3. `npm run verify:cc` フル実行。lib 削除に伴い `npm run tree-map` / `npm run feature-map` を再生成しコミットへ含める。
4. **version bump**（§12.5 の3点セット・summary 例「点滅追跡の計器を撤去」）。

### Phase 5: max-lines ラチェット復活（§6 質問C=やるで確定・1コミット）

1. content-entry.js 行1 の `/* eslint-disable max-lines */` を削除。
2. 撤去後の実測行数を測り、`eslint.config.js` の content-entry ブロックを「実測+50」へ更新
   （popup-entry と同じ流儀で、実測値・日付・理由をコメントに記す）。
3. `npm run lint` 緑を確認。ダミー51行追加→赤→戻す、の変異確認。
4. 必要なら bump（挙動不変の開発ガードのみなので、Phase 4 のバンプに同梱可否は §12.5 の粒度判断に従い、
   迷ったら別 patch にする）。

### Phase 6: 提案書き出し（実装しない）

D-6（ルート文書移動）・D-7（@ts-nocheck）・entry 分割（ルートの refactor-instructions.md との統合方針）を
最終報告に「提案」として列挙する。**承認なしに着手しない。**

---

### Track B: 診断ページの重さ・真因調査（Phase B0〜B2・Track A と独立）

> 前提: §8 D-8 を熟読。**当初案「コア3read のバッチ化」は実測で効果が否定済み＝やらない。**
> `Promise.all` 並行化は提案も禁止（§3-11）。IndexedDB 移行は永久却下（§3-14）。
> extras バッチ（§3-12）と stale-guard 意味論（§3-13）は触らない。
> **原因が確定するまで修正コードを書かない。**

#### Phase B0: 実測の再確認（編集なし）

1. status-entry.js の計測機構（`_mark` / `_stepMs`・行625-629 付近）を読み、
   「更新所要(計器)」の重い順表示がどの step 名をどう束ねているか把握する。
2. D-8 の実測値（lives 5493ms / summaries×1 4314ms / render 5ms）を出発点として記録する。
   追加の実測が必要ならユーザーに状態速報のコピペを依頼する
   （[[feedback-trust-status-report-over-browser-check]]: 実機目視でなく速報コピペで切り分ける）。

#### Phase B1: 真因の切り分け（読解+ローカル検証のみ・出荷版への計器追加は Stop And Ask）

以下の仮説を**この順で**実コードとローカル計測で潰す。各仮説に「支持する証拠/否定する証拠」を記録する:

1. **`lives` 5.5秒 = `chrome.tabs.query` 側か、ガード層か**
   - `enumerateActiveLives`（行870-929）は watch タブがあれば経路1（tabs.query）だけで返る。
   - `_livesGuard`（`createStaleGuardedRead`・行319）のラッパが遅延を足していないか読む。
   - 同ファイルの `queryWatchTabMap()`（行941-968）も同じ tabs.query を打つ。同一サイクル内で
     tabs.query が何回飛ぶか数える（回数が多ければそれ自体が手がかり）。
   - tabs.query が遅い場合、それは storage ではなく**ブラウザプロセス/レンダラの混雑**。
     「診断は被害者」説とは別のボトルネック像になるため、証拠を添えて報告する。
2. **`summaries` 4.3秒 = 値の肥大か、storage 層か**
   - 4キーのうちどれが大きいかを特定する。`chrome.storage.local.getBytesInUse([key])` を
     DevTools コンソール（またはユーザー依頼のワンライナー）で採るのが最短。
   - 特に `nls_watch_snapshot_<lv>` の中身を書き込み側（content-entry / popup）から追い、
     **サイズがコメント件数(3,726件)に比例する構造かどうか**を確定する。
     比例するなら「診断側の read は O(1)」という従来認識（memory）の訂正として報告する。
   - `nls_panel_summary_` / `nls_perf_diag_` / `nls_live_ended_` も同様にサイズ確認。
3. **残る可能性: 単発 get 自体が詰まる**（記録側の書き込みキューとの競合）
   - 1・2 で説明がつかない場合のみ。取り込みが続いている実測条件（最終取り込み5秒前）と
     矛盾しないかを付記する。
4. 途中で出荷版に計時計器を足したくなったら **Stop And Ask**（§5。計器スパイラル再発防止）。

#### Phase B2: 修正提案（実装は承認後）

1. B1 の結論を「真因・証拠・反証済み仮説」の形で報告し、真因に対応する**最小の修正案**を
   1〜3案提示する（例は真因次第。値の肥大なら「スナップショットの分割/軽量化（表示に必要な
   フィールドだけの lite 化＝fastDiagLite と同じ既存の勝ちパターン）」、tabs.query 重複なら
   「同一サイクル内の結果共有」など）。
2. ユーザーの言う「干渉しない仕組み」に相当する構造案も、**真因の証拠と整合するものだけ**
   候補として添える（例: 記録側が混雑を宣言する軽量フラグ→診断側が更新間隔を動的に落とす／
   混雑中は stale 表示を明示して read を見送る等）。**IndexedDB 移行・並行化は候補に入れない。**
3. 各案に「変わりうる体感（鮮度・更新間隔）」を明記する。体感が変わる案は承認必須。
4. 承認された案のみ実装。実装時は lib に純関数+テストを切り、同じ計器行で before/after を実測。
   version bump は Track A と別 patch。

---

## 10. Verification Requirements（検証要件）

- 各コミット: `npm run test:cc` + `npm run lint` 緑。
- 各フェーズ末: `npm run verify:cc` 10段オール緑（baseline で既に赤かった段はその旨併記）。
- 撤去断言テストは**変異で赤を確認してから**コミット（確認手順をコミットメッセージか報告に1行残す）。
- 撤去完了後の外形確認（できれば）: `npm run status:live` またはユーザーの状態速報コピペで、
  診断 JSON から撤去8系統のキーが消え、`dedupeSeedDiag` 等の現役計器が**残っている**こと。
- 実機（拡張リロード後の watch ページ）での動作確認はユーザー手動が必要（[[claude-cannot-drive-own-extension-pages]]）。
  依頼文には反映3手順を1行で添える。確認観点: ①インラインモード（`prefer_focus_inline`）でパネルが
  従来どおり出る/消える ②Side Panel が従来どおり開く ③コメント記録が続く。
- 【Track B】調査フェーズは「証拠つきの結論報告」が成果物（コード変更ゼロでも完了扱い）。
  修正を実装した場合のみ、状態速報の「更新所要(計器)」行の before/after 実測を必須とする
  （before: lives 5493ms / summaries×1 4314ms / 計9812ms）。

## 11. Reporting Format（最終報告の形式）

1. 実行した全フェーズと各コミット（hash・1行要約・対象計器）。Track A / Track B を分けて書く。
2. baseline と最終の `verify:cc` 結果（10段の OK/NG 対比）。
3. 削除したファイル一覧・削減行数・診断 JSON から消えたキー一覧。
4. 変異確認の実施記録（どのテストに何を仕込んで赤を確認したか）。
5. Stop And Ask に該当して**やらなかったこと**（あれば理由つき）。
6. Phase 6 の提案リスト。
7. 【Track B】真因調査の結論: 支持された仮説・反証された仮説・各証拠（実測値/該当コード行）・
   修正案リスト（B2 を実装まで進めた場合は before/after 実測）。
8. 最後に実行したコマンドとその結果。
9. ユーザー向け1行: 「反映は git pull → 拡張リロード → watch タブ F5 で行えます」。

## 12. Out-of-scope Items（本タスクでやらないこと）

- `popup-entry.js` の変更全般（ラチェット・分割含む）。
- entry 分割・component-factoring（ルートの `refactor-instructions.md` の領分）。
- 未解決バグの修正: 「watchページが見つかりません」／記録101%二重計上／サイドパネル切替の設定UI。
- `scrollWhiteoutDiag` / `hostMoveDiag` / `dedupeSeedDiag` / `commentSubmitDiag` の撤去（質問A=残すで確定）。
- `extension/background.js`・`manifest.json`・storage スキーマ・CWS 提出物・privacy 文書。
- ルート直下ファイルの移動・削除・.gitignore 変更（質問D=今回はやらないで確定・提案のみ）。
- `@ts-nocheck` の除去。
- 未追跡ファイル（council ログ等）への一切の操作。
- 【Track B】コア3read（fastDiagLite/popupDiag/backfill）のバッチ化（**実測で効果否定済み**・§8 D-8）。
- 【Track B】`Promise.all` によるコア read の並行化（v0.1.867→868 で実機退行・撤回済み・提案も禁止）。
- 【Track B】IndexedDB へのコメント保存移行（2026-06-01 実機失敗・`FORCE_DISABLE_COMMENT_IDB_PATH` で永久却下）。
- 【Track B】extras 17項目バッチ（`statusExtrasBatch.js`・12秒間引き）の変更。
- 【Track B】真因が確定する前のいかなる「重さ修正」実装。
