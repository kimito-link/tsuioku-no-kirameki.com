# nicolivelog 現状引き継ぎ（詳細・コピペ用）

最終確認日: 2026-04-08  
確認ワークスペース: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\nicolivelog`

## 0. まず最初に知っておくこと

- この文書は、実コードを確認したうえで整理した `インラインパネル配置 / watch 側 content-entry 周辺` の handoff です。
- 現在ブランチは `feature/support-grid-phase1-visual` です。
- 現在の `HEAD` は `8024c47` です。
- 作業ツリーは `dirty` です。インラインパネル以外にも、`intercept / dev monitor / official fields / comment record` 系の未コミット変更があります。
- したがって、`git restore .` や大きな revert で片付ける前提は危険です。差分は必ず対象を絞って扱ってください。
- ソースの正は `src/extension/*.js` と `src/lib/` です。`extension/dist/*.js` は `npm run build` の成果物なので手編集しません。

## 1. プロジェクト

- 名前: `君斗りんくの追憶のきらめき`
- 開発識別子: `nicolivelog`
- 種類: Chrome 拡張（Manifest V3）
- 主用途: ニコニコ生放送 watch 上で、応援コメントの記録・可視化・補助 UI を行う
- popup は 2 文脈あります
- `chrome-extension://.../popup.html` のツールバーポップアップ
- `popup.html?inline=1` を iframe で読む watch 埋め込みインラインパネル

補足:

- popup と inline iframe は `chrome.storage.local` を共有します
- 同期の一部設計メモは `docs/inline-popup-sync.md` にあります

## 2. 品質ルール

- 変更後の最低ライン: `npm test`
- マージ前の推奨: `npm run verify`
- `verify` は `npm test && npm run lint && npm run typecheck && npm run build`

## 3. 今のブランチと作業ツリー

2026-04-08 時点の確認結果:

- 現在ブランチ: `feature/support-grid-phase1-visual`
- HEAD: `8024c47`
- 直近コミット:
- `8024c47 refactor(intercept): normalizeViewerJoin 純関数化・emit順序・flush内重複除外`
- `7d530d3 feat(intercept): 視聴者入室 NLS_INTERCEPT_VIEWER_JOIN と即時プロファイル反映`
- `9e49a2d fix(concurrent): direct しきい値を実測帯に合わせ 90s/210s、表形式境界テスト`
- `eb6c321 chore: ローカル生成物を gitignore、記録OFF時の capture 窓テスト`
- `de4e170 feat: 取り込みログ間引き・トレンド重複抑止・同接ゲート・来場プローブ`

未コミット変更の確認結果:

- `extension/dist/content.js`
- `extension/dist/popup.js`
- `extension/popup.html`
- `src/extension/content-entry.js`
- `src/extension/popup-entry.js`
- `src/lib/commentRecord.js`
- `src/lib/commentRecord.test.js`
- `src/lib/devMonitorAvatarStats.js`
- `src/lib/devMonitorTrendSession.js`
- `src/lib/devMonitorTrendSession.test.js`
- `src/lib/devMonitorViz.js`
- `src/lib/storageKeys.js`
- `src/lib/storageKeys.test.js`
- `src/lib/watchSnapshotOfficialFields.js`
- `src/lib/watchSnapshotOfficialFields.test.js`
- untracked: `src/images/`

要点:

- inline panel だけでなく、同時接続や監視系の別文脈も混ざっています
- 他人の並行作業が含まれている可能性を前提に、関係ない差分を巻き込まないでください

## 4. 契約を壊しやすいもの

ここは大きく変えないこと。

- `extension/manifest.json`
- `chrome.storage.local` の `nls_*` キー
- content / popup / background 間の `NLS_*` メッセージ型
- `chrome.tabs.sendMessage` の `frameId` 経路
- `popup.html` をツールバーと inline iframe の両方で使う前提

## 5. 直近の主戦場

最重要ファイル:

- `src/extension/content-entry.js`
- `src/extension/popup-entry.js`
- `src/lib/storageKeys.js`
- `src/lib/inlinePanelLayout.js`
- `extension/popup.html`

関連テスト / 参照:

- `src/lib/storageKeys.test.js`
- `src/lib/inlinePanelLayout.test.js`
- `tests/e2e/inline-panel-align.spec.js`
- `docs/inline-popup-sync.md`

## 6. インラインパネルの現在設計

### 配置モード

ストレージキー:

- `nls_inline_panel_placement`

値:

- `below`
- `beside`
- `floating`

定義と正規化:

- `src/lib/storageKeys.js`
- `normalizeInlinePanelPlacement(raw)` は `below / beside / floating` に正規化
- `src/lib/storageKeys.test.js` に境界テストあり

意味:

- `below`: プレイヤー行の下に出す。ワイド画面で横回り込みしにくい
- `beside`: 親レイアウトに任せて横付きにする。従来挙動に近い
- `floating`: `document.body` 上に `position: fixed` で右上付近に出す。プレイヤー DOM への挿入に依存しない

### 幅モード

ストレージキー:

- `nls_inline_panel_width_mode`

値:

- `player_row`
- `video`

計算:

- `src/lib/inlinePanelLayout.js`
- `computeInlinePanelLayout(mode, args)`

意味:

- `player_row`: 視聴行相当の幅を使う
- `video`: 動画表示幅に寄せる

## 7. content-entry 側で重要な関数

### レンダリング入口

- `renderPageFrameOverlay()`
- `renderInlinePopupHost(target)`
- `renderInlineHostAnchoredToVideo(video)`
- `renderInlinePanelFloatingHost()`

### 挿入先の解決

- `findWatchFrameTargetElement()`
- `findFrameInsertAnchorFromVideo(base)`
- `resolveInlinePanelInsertAnchor(domAnchor, placement)`
- `findBesideFlexRowColumnInsertion(video)`
- `insertionParentForElement(el)`
- `getInsertionContainerRect(hostParent, viewport)`
- `inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter)`
- `clearInlineHostFloatingLayout(host)`

### 実行制御

- `shouldRunWatchContentInThisFrame()`
- `isWatchInlinePanelTopFrame()`
- `startPageFrameLoop()`
- boot guard: `globalThis.__NLS_CONTENT_ENTRY_STARTED__`

### 診断

- `buildAiSharePageDiagnostics()`
- `noteInlinePanelRenderError(where, err)`
- メッセージ型: `NLS_AI_SHARE_PAGE_DIAGNOSTICS`

## 8. 直近で起きていた問題と、コード上の対処ポイント

### 8-1. 「位置」ラジオが効かない / 大画面で横にずれる

問題の要点:

- ターゲットが `<video>` ではなくラッパー `div` になる経路がある
- `beside` 時に、挿入の基準が行コンテナ側に寄ると、パネルが画面下や意図しない場所へ落ちる

現在の対処:

- `renderInlineHostAnchoredToVideo(video)` で `beside` 時は `video` を基準に挿入解決する
- `findBesideFlexRowColumnInsertion(video)` で、視聴行の flex を見つけたら「動画を含む列」の直後に出す
- 単純に `<video>` 直後へ入れるのでなく、内側ラッパーの `overflow` に閉じ込められにくい位置を狙う

見る場所:

- `src/extension/content-entry.js`
- `findBesideFlexRowColumnInsertion(video)`
- `resolveInlinePanelInsertAnchor(domAnchor, placement)`
- `renderInlineHostAnchoredToVideo(video)`

### 8-2. Shadow DOM で親が取れず、パネルが載らない

問題の要点:

- Shadow DOM 直下ノードは `parentElement === null` でも `parentNode` は `ShadowRoot`
- ここを `HTMLElement` 前提で扱うと、`hostParent` が `null` になりやすい

現在の対処:

- `insertionParentForElement(el)` で `parentElement` が無くても `parentNode` を挿入親候補にする
- `getInsertionContainerRect(hostParent, viewport)` で `ShadowRoot` の場合は `shadowRoot.host` の矩形を使う

見る場所:

- `src/extension/content-entry.js`
- `insertionParentForElement(el)`
- `getInsertionContainerRect(hostParent, viewport)`

### 8-3. beside で見えない。内側ラッパーの overflow に埋まる

問題の要点:

- 横付き時にプレイヤー内部の狭いラッパーへ差し込むと、`overflow: hidden` で見えなくなることがある

現在の対処:

- `findBesideFlexRowColumnInsertion(video)` を追加
- 「動画側カラムの直後」に差す経路を優先

### 8-4. 内側 video が小さすぎると即非表示になり、ラッパー fallback に落ちない

問題の要点:

- ラッパー `div` をターゲットした場合でも、内部 video の実表示幅が小さいケースがある
- 旧経路では video 基準の即非表示に吸われると、コンテナ基準の配置まで行けない

現在の対処:

- `renderInlinePopupHost(target)` で、候補 video が `260x140` 未満なら container 経路にフォールバック

見る場所:

- `src/extension/content-entry.js`
- `renderInlinePopupHost(target)`

### 8-5. 拡張の再読み込み後に、記録もパネルも死ぬ

問題の要点:

- `document.documentElement[data-nls-active]` だけを開始ガードにすると、拡張再読み込み後の新しい isolated world では `start()` が再実行されない

現在の対処:

- boot guard を `globalThis.__NLS_CONTENT_ENTRY_STARTED__` に変更
- DOM 属性は補助で残すが、開始可否の唯一の判断にはしない

見る場所:

- `src/extension/content-entry.js`
- `if (!__nlsBootGlobal.__NLS_CONTENT_ENTRY_STARTED__) { ... start().catch(() => {}) }`

### 8-6. 初回だけ target 未検出だと再描画ループが始まらない

問題の要点:

- 初回描画時点で video / target がまだ無いことがある
- ここで `return` してループ未開始だと、その後プレイヤーが出ても何も起きない

現在の対処:

- `renderPageFrameOverlay()` の末尾で `startPageFrameLoop()` を必ず呼ぶ
- `!target` や小サイズ時でも、ループ自体は積む

見る場所:

- `src/extension/content-entry.js`
- `renderPageFrameOverlay()`
- `startPageFrameLoop()`

補足:

- `PAGE_FRAME_LOOP_MS` は現在 `360ms`

### 8-7. パネルを開くとコメント欄が滝のように流れ、記録が溜まらない

問題の要点:

- ループごとに DOM 再挿入判定をしている
- `video` と `host` の間に空白 text node があると、`previousSibling === insertAfter` が偽になり、毎 tick 移動し続ける
- その結果、公式コメント欄側の再描画を誘発しやすい

現在の対処:

- `inlinePopupHostIsCorrectlyPlaced()` を `previousElementSibling === insertAfter` ベースに
- 移動時は `insertAfter.insertAdjacentElement('afterend', host)` を使う

見る場所:

- `src/extension/content-entry.js`
- `inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter)`
- `renderInlineHostAnchoredToVideo(video)`
- `renderInlinePopupHost(target)`

### 8-8. プレイヤー DOM に依存せず出したい

現在の対処:

- `floating` モードを追加
- `renderInlinePanelFloatingHost()` で `document.body` へ固定表示
- popup 側ラジオで切り替え可能

見る場所:

- `src/lib/storageKeys.js`
- `src/extension/content-entry.js`
- `src/extension/popup-entry.js`
- `extension/popup.html`

## 9. popup 側で確認すべき点

### UI

- `extension/popup.html`
- `位置`: `below / beside / floating`
- `幅`: `player_row / video`
- 開発欄に `AI 共有用にコピー（診断まとめ）` ボタンあり

### ストレージ保存

- `src/extension/popup-entry.js`
- `saveInlinePanelPlacement(...)`
- `saveInlinePanelWidthMode(...)`
- ラジオ変更時に `chrome.storage.local` を更新

### 診断コピー

- `src/extension/popup-entry.js`
- watch タブ候補を集めて `tabsSendMessageWithRetry(..., { type: 'NLS_AI_SHARE_PAGE_DIAGNOSTICS' }, { frameId: 0, ... })`
- content 側が返した診断を Markdown に整形して clipboard へコピー

## 10. AI 共有用診断の中身

`buildAiSharePageDiagnostics()` が含めるもの:

- top frame か
- 現在 URL
- content script が動いているか
- `__NLS_CONTENT_ENTRY_STARTED__` が立っているか
- `data-nls-active` の状態
- `shouldRunWatchContentInThisFrame()` の評価
- `videoCount`
- `frameTarget`
- `placementMode`
- `widthMode`
- `insertionPlan`
- host の矩形、表示状態、親情報
- `recentRenderErrors`
- `pageFrameLoopTimerActive`

含めないもの:

- コメント本文
- ユーザー固有の生データ

## 11. まず読むべきファイル

優先順:

- `src/extension/content-entry.js`
- `src/lib/storageKeys.js`
- `src/lib/inlinePanelLayout.js`
- `src/extension/popup-entry.js`
- `extension/popup.html`
- `src/lib/storageKeys.test.js`
- `src/lib/inlinePanelLayout.test.js`
- `tests/e2e/inline-panel-align.spec.js`
- `docs/inline-popup-sync.md`

## 12. 変更時の注意

- `manifest` は権限や注入条件に直結するので、 inline panel の修正で安易に触らない
- `NLS_*` の型名は変えない
- `nls_*` の storage key は rename しない
- `frameId` を無視した message 送信にしない
- `extension/dist/*.js` を直接直さず、必ず `src` から build する
- 他の dirty 差分を巻き込まない
- 全体 revert をしない

## 13. テスト観点

ユニット:

- `src/lib/storageKeys.test.js`
- `src/lib/inlinePanelLayout.test.js`

E2E:

- `tests/e2e/inline-panel-align.spec.js`
- 必要に応じて `tests/e2e/page-frame.spec.js`
- 必要に応じて `tests/e2e/popup-open-performance.spec.js`
- 必要に応じて `tests/e2e/smoke.spec.js`

最低限:

- `npm test`

マージ前推奨:

- `npm run verify`

## 14. 次の担当者向けの進め方

1. `git branch --show-current` と `git status --short` で、今見ている複製パスと作業ツリーを確認する
2. 比較したい「以前安定していたコミット SHA」を必ず固定する
3. `src/extension/content-entry.js` の差分を中心に、配置回帰だけを切り出して見る
4. `manifest / storage key / NLS_* / frameId` 契約は維持したまま、最小差分で戻す
5. 必要なら popup 側ラジオと content 側の実挙動が一致しているかを watch 実機と E2E で確かめる

## 15. Codex / Cursor / Claude にそのまま渡す短い依頼文

```text
この md を前提に、(1) 現在ブランチと「以前安定していたコミット」の git diff で inline panel 回帰差分を整理し、(2) 全体 revert ではなく最小差分で直す案を出し、(3) manifest / nls_* storage key / NLS_* message / frameId 経路は互換維持で進めてください。source of truth は src/extension/*.js と src/lib/ です。extension/dist/*.js は手編集しません。
```

## 16. もっと長い依頼文

```text
nicolivelog（君斗りんくの追憶のきらめき）の watch 埋め込みインラインパネルの回帰調査をお願いします。実コード確認済みの handoff はこの md にあります。現在の主戦場は src/extension/content-entry.js, src/extension/popup-entry.js, src/lib/storageKeys.js, src/lib/inlinePanelLayout.js, extension/popup.html です。問題は主に、位置ラジオの効き方、beside の挿入位置、Shadow DOM の親解決、初回未検出時のループ未開始、拡張再読み込み後の start 不発、DOM 再挿入ループによるコメント欄の滝再描画です。作業ツリーは dirty で inline panel 以外の差分も混ざっているため、全体 revert は禁止です。比較したい過去コミット SHA を固定したうえで、manifest / nls_* / NLS_* / frameId の契約を壊さず、最小差分で直すパッチ方針を出してください。必要なら AI 共有用診断の payload も利用してください。
```
