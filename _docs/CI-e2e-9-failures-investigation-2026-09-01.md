# CI e2eジョブ 9件連続失敗の調査記録（Codexへの引き継ぎ）

調査=web-ios-android担当のClaudeセッション（越境作業） / 2026-09-01
実装（この記録の続き）=Codex に依頼（ユーザー判断：「codexがこういうの得意だから」）だったが、
Codexが使用制限に達したため、同じClaudeセッションが追加調査を継続（2026-09-01 22時台）。
popup-double-scroll.spec.jsについて根本原因を3件すべて特定・修正し、**ローカルで緑になることを
確認済み**（実CIでの最終確認は引き続き必要）。残り8件は未着手のまま引き継ぐ。

## 発端

「GitHub請求が増えている」というセキュリティ通知の調査から発見。2026-08-18〜9-1の直近20回、
このリポジトリのCIが**全て失敗**していた。e2eジョブが毎回約11.5分実行され、9件のE2E
（Playwright）テストが一貫して落ちる。2週間、誰にも見られず放置されていた（失敗のたびに
Actions時間を消費し続けていた＝課金増の実体）。

## 現在の状態

- PR: https://github.com/kimito-link/tsuioku-no-kirameki.com/pull/247
- ブランチ: `fix/e2e-ci-headless`（base: `master`）
- worktree（このセッションで作業した場所。継続利用または新規作成どちらでもよい）:
  `C:\Users\info\AppData\Local\Temp\claude\C--Users-info-OneDrive--------Resilio-github-web-ios-android\48bd552f-6df2-430c-8ba6-12ac8fb903f5\scratchpad\nl-headless-fix`
  ※このパスはClaudeセッションのスクラッチパッド配下。Codex側で永続的な作業場所が必要なら、
  同じブランチを`git worktree add`で別途チェックアウトすることを推奨。
- コミット構成（4件、push済み）:
  1. `playwright.config.js`のheadless矛盾修正
  2. `popup-double-scroll.spec.js`を`chrome.windows.create({type:'popup'})`経由に修正（1回目）
  3. 同ファイルに`nl-popup-window`クラス付与の`waitForFunction`待機を追加（2回目）

## ★最重要の教訓: ローカル緑はCI緑を保証しない

このセッションは3回、以下のサイクルを繰り返し、**3回とも空振りした**:
```
仮説を立てる → 修正する → ローカル(Windows, CI=true環境変数でCI相当を再現)で実行 → 緑
→ push → 実CI(GitHub Actions, Linux+xvfb)で実行 → 赤（しかも失敗の顔ぶれが実行のたびに変動）
```

**ローカルWindows環境での`CI=true`再現は、実際のLinux+xvfb環境の挙動を正確に再現できていない。**
修正の確定判断は、必ず実際のCI実行結果（`gh run view <id> --log-failed`）で行うこと。
ローカルで緑になったからといって、それだけでpushして「直った」と報告しないこと。

### 実際に踏んだ失敗の記録（証拠）

| CI run ID | 内容 | 結果 |
|---|---|---|
| `33455341656` | 修正前（元の失敗） | 9 failed / 157 passed |
| `33490902980` | headless修正後 | 9 failedのうち1件がリトライで救済され「8 failed」表示。実質改善は限定的 |
| `33492766188` | popup-double-scroll 1回目修正後 | 依然9 failed中に含まれる。失敗する9件の顔ぶれも前回と一部異なる（`extension-interaction`が入れ替わりで出現） |
| `33494632287` | popup-double-scroll 2回目修正後 | 依然`scrollH=873 clientH=720`（前回と全く同じ数値）で失敗 |

`gh run view <id> --repo kimito-link/tsuioku-no-kirameki.com --log-failed`で各runの詳細ログを確認できる。

## 判明している確定事実

`playwright.config.js`の`headless: process.env.CI === 'true' || ...`が、CI環境で
headlessを強制していた。このファイル自身のコメントに「拡張機能の読み込みはChromiumの永続
コンテキストが必要で、多くの環境ではheadless非対応」と明記されているのに矛盾していた。
CIワークフロー(`.github/workflows/ci.yml`)は`xvfb-run`でheaded実行用の仮想ディスプレイを
用意しているが、config側のこの1行がそれを無効化していた。`fixtures.js`の
`launchPersistentContext`呼び出しにheadlessオプションが明示的に渡されていないため、
`use.headless`の値をそのまま継承する構造だった。

修正: `headless: process.env.PW_HEADLESS === '1'`（CIでは強制しない）。
→ **この修正だけでは9件中1件しか解決しなかった。他に独立した原因が複数存在する。**

## 残る9件の根本原因仮説（実装前の調査結果。未検証）

別のExploreエージェントによる調査結果。**いずれも仮説であり、実装前に必ずCI環境での
実測で裏取りしてから修正すること**（このリポジトリの実損記録に何度も出てくる「編集した≠
反映された」「動くはずでは終わらせない」の原則に従う）。

| # | テスト | 検証しようとしていること | 仮説（ファイル:行） | 検証の最小コスト案 |
|---|---|---|---|---|
| 1 | `tests/e2e/multitab-storage-contention.spec.js:61` | 4枚のwatchタブ+inlineパネルがstall下でも全部描画完了する | `refreshGen`世代比較によるpaintマーカー付与のレース。stall window(6s) > poll間隔(3s)で世代が進みすぎ、先発の`isFreshRefresh()`が恒久falseに（`src/extension/popup-entry.js`の`isFreshRefresh`定義・`revealNow`ガード周辺） | `console.debug`で`refreshGen`推移を実測、またはテスト側`STALL_WINDOW_MS`を1500ms未満に縮めて再実行 |
| 2 | `tests/e2e/popup-layout.spec.js:465` | 応援summary中心のelementFromPointがsummary（またはその子）を返し、1クリックで開く | `scrollIntoViewIfNeeded()`直後に座標評価。非同期リフロー（`relocateSupportTimelineForStandaloneWindow()`等）の完了を待っていない | 失敗時`hit.topTag/topId`をログ出力、2フレーム連続で同一rectになるまでpollする安定化を試す |
| 3 | `tests/e2e/popup-window-empty-history-real.spec.js:18` | ウィンドウ高とコンテンツ高の関係（下空白が120px以内） | 実測で「下空白168px」。dockはするが実コンテンツ高計算のズレ | dims.outerHeightとcontent.primaryBottomの実測値をログ出力し、期待値とのズレの構造を特定 |
| 4 | `tests/e2e/snapshot-fetch-hang-resilient.spec.js:40` | snapshot fetchが永久ハングしてもsnapshotFetchActiveは永久trueに張り付かない | ハングとは無関係の疑い。モックの固定25件コメントに対し`panelSummary.recordedCount=42`が優先されず、25で頭打ちになっている（`resolveStoryDiagTotal`等） | `resolveStoryDiagTotal`等のpanelSummary優先ロジックを`popup-entry.js`内で特定 |
| 5 | `tests/e2e/support-activity-timeline.spec.js:27` | コメントとギフトが時刻順に混在して描画される | `formatRelativeTimeJa`が未来5秒超で空文字を返す仕様。先頭表示アイテムがseed分でなくcontent script生成のcapturedAtで、クロックスキューにより空文字化 | `.nl-tl-row`先頭要素の`data-nl-uid`をログ出力し実際の先頭アイテムを確認 |
| 6 | `tests/e2e/timeline-fill-standalone-window.spec.js:28` | 応援タイムラインが下部常設+既定オープンで空白を埋める | dock処理(`docked==='window-bottom'`)は成立するが、`open`制御が非同期`refresh`サイクル依存で`waitForTimeout(2000)`固定待ちが完了前に切れる | `waitForTimeout(2000)`を`expect.poll(() => details.evaluate(el=>el.open), {timeout:15000})`に置換して再実行 |
| 7 | `tests/e2e/extension-interaction.spec.js:57`（flaky） | モックwatchの埋め込みiframe内で記録チェックがトグルできる | `content-entry.js`のresizeリスナーが150ms後に`renderInlineHostAnchoredToVideo`でiframeごとDOM移動（`insertAdjacentElement`）。テストのiframe内操作とレースし`Frame was detached`が発生 | resize発火後に`waitForTimeout(300)`（150ms debounce超え）を挟むか、`reloadCount`変化が止まるまでpollしてから操作開始 |
| 8 | `tests/e2e/popup-comment-compose.spec.js:41,95` | watch接続中はコメント送信できて成功文言を返す／強い言い方では言い換えを促す | モックは送信後1.8秒でtextareaをクリアし`input`イベント発火。拡張側`confirmSubmittedCommentAsync`は最大4秒までポーリングするはずだが、実際には「送信確認できませんでした」で失敗。`findVisibleEnabledSubmitForEditor`がモックの送信ボタンを正しく検出できているか要確認（`src/lib/commentPostDom.js`の`findCommentSubmitButton`のスコアリング） | ボタン検出のスコアを実測（`scoreCommentSubmitButton`の戻り値をログ）、confirmProbesの実際の発火タイミングを確認 |
| 9 | `tests/e2e/popup-double-scroll.spec.js:21` | standalone popupでbody/htmlはスクロールせず.nl-main 1本のみがスクロールする | **3件の根本原因すべてを特定・修正済み。ローカルで緑を確認（下記セクション参照）。** | 実CIでの最終確認が必要 |

## popup-double-scroll: 追加調査で判明したこと（2026-09-01 22時台、Claudeセッション継続分）

3回のローカル緑・CI赤の空振り後、実CIログ（`gh run view <id> --log-failed`）を精査し、診断ログを
仕込んで実測することで、2つの独立した根本原因を特定・修正した。ただし3つ目の問題が残っており、
テストはまだ緑になっていない。

### 原因A（確定・修正済み）: 580pxキャップが`refresh()`のたびに巻き戻る

`src/extension/popup-entry.js`の`applyResponsivePopupLayoutImpl()`は、standalone popup window
（`chrome.windows.create({type:'popup'})`）でも`CHROME_ACTION_POPUP_MAX_HEIGHT_PX=580`のキャップを
無条件適用していた。一方`resizePopupWindowForState()`は`nl-popup-window`クラスを付与し
`--nl-pop-height`を実ウィンドウ高（例780px相当）に上書きするが、これは初回のみ。
`safeRefresh().finally()`から`refresh()`完了のたびに`applyResponsivePopupLayout()`が再実行され
（`storage.onChanged`等、複数のトリガーで頻繁に発火する）、その都度580pxキャップに巻き戻していた。
これが3回の修正試行（`chrome.windows.create`経由の起動・クラス付与の`waitForFunction`待機）が
すべてCIで空振りした理由——**クラス付与のタイミングを直しても、直後のrefreshで即座に上書きされる**
構造だった。

修正: `document.documentElement.classList.contains('nl-popup-window')`を見て、standalone window
なら580pxキャップをスキップするようにした（`src/extension/popup-entry.js`の
`applyResponsivePopupLayoutImpl()`内）。効果は実測済み（`scrollH`が873px→855pxへ改善）。

### 原因B（確定・修正済み）: テストが「アクティブなwatchタブ」を用意していなかった

`popup-double-scroll.spec.js`は「データ入り状態（応援ランキング・記録件数などcontentが埋まった
状態）」を意図していたが、実際にはactive watchタブを一切開かずにpopupだけを起動していた。この
結果、拡張側は「配信中のタブが見つからない」と判定して**empty state**（`nl-empty-state`クラス）
に倒れ、`html.nl-popup-window:not(.nl-empty-state) .nl-main`系のCSS（`.nl-main`をflex化して
残余高を割り当てる規則。6479行目付近）が丸ごと無効化されたまま、前回配信レビューUIとactive watch
用UIが混在した状態で描画されていた（診断ログで`.nl-main`が`display:block`のまま855pxの高さで
描画されていることを実測で確認）。

修正: 他のactive watch系spec（`popup-layout.spec.js`等）と同じパターンで、popupを開く前に
`context.newPage()`でwatchタブ（`MOCK_WATCH`）を開くようにした。

### 原因C（確定・修正済み）: lastFocused由来の解決が誤って`dataBacked`扱いになりtreatAsNoActiveWatchに巻き込まれていた

原因A・Bを修正した状態でも、`htmlClass`に依然`nl-empty-state`が残り、`.nl-main`が`display:block`の
まま（`mainFlex: "0 0 auto"`）で、`scrollH=1163 clientH=720`という新しい超過値で失敗し続けていた。

**当初「`lastFocusedNormalActiveTab`が正しく解決されない」という仮説を立てたが、これは誤りだった。**
SW側から`chrome.windows.getLastFocused({windowTypes:['normal']})`を直接呼ぶタイミング比較テスト
（popup作成前後の複数タイミング・popup内部/外部の両方）を実施したところ、**全てのタイミング・
呼び出し元で一貫して正しくwatchタブを返していた**（実測・`zz-debug-lastfocused.spec.js`）。

真因は`src/lib/popupWatchUrlResolveMultiTab.js`の`pickWatchUrlFromMultipleSources()`の
優先順位1.5（`liveIdsWithData`によるstandalone混信救済）にあった。このロジックは
`lastFocusedUrl → storage → candidateUrls`の順で「データのあるlvか」をチェックし、
**マッチした候補が`lastFocusedUrl`自身であっても、一律で`source: 'dataBacked'`として返していた**
（`popupWatchUrlResolveMultiTab.test.js`の既存テストも、この挙動を仕様として明記していた）。

一方`popup-entry.js`の`treatAsNoActiveWatch`は`'storage'`/`'dataBacked'`ソースを意図的に
「実質アクティブでない」扱いにする設計（別タブの記録を誤ってアクティブ表示しないため）。
この2つが組み合わさることで、**「ユーザーが今まさに見ている通常ウィンドウの前面タブ
（`lastFocusedUrl`）に、正当な理由でデータがある」という最も確度の高いケースまで、
単に「データチェックを先に通っただけ」で低信頼度の`'dataBacked'`経路に格下げされ、
`treatAsNoActiveWatch`に巻き込まれてempty state扱いになっていた**。

このモックwatchページ（`lv888888888`）は`nls_recording_enabled:true`で記録を開始すると
実際にコメント25件を`nls_ctail_lv888888888`（テールキー）と`nls_watch_snapshot_lv888888888`
（スナップショット）に書き込む。`collectDataBackedWatchLvs()`の`hasSnap`判定
（`watchSnapshotStorageKey`ベース）がこれを正しく拾い、`liveIdsWithData`に`lv888888888`を
含めていた——つまり「データがある」判定自体は正しく、そのデータが`lastFocusedUrl`由来だった
ときの`source`の付け方だけが誤っていた。

**修正**: `pickWatchUrlFromMultipleSources()`で、優先順位1.5の候補が`lastFocusedUrl`自身に
マッチした場合は`source`を`'lastFocusedNormal'`のまま返すようにした（`storage`/`candidateUrls`
由来のときは従来どおり`'dataBacked'`）。既存テスト`popupWatchUrlResolveMultiTab.test.js`の
該当ケースも新しい正しい仕様に更新（期待値を`'dataBacked'`→`'lastFocusedNormal'`に修正）。
関連ユニットテスト41件・フルスイート8972件とも全通過。

**ローカル検証で踏んだ別の罠（重要）**: この修正を`src/`に加えた直後、何度再実行しても
`nl-empty-state`が解消せず数時間ハマった。原因は**`npm run build`し忘れ**——このリポジトリの
E2Eテストは`extension/dist/popup.js`（ビルド成果物）を読み込む構成で、`src/`への編集は
`npm run build`しない限りローカルのPlaywright実行には一切反映されない。`grep -c "自分の
デバッグマーカー" extension/dist/popup.js`で0件だったことで発覚した。実CI（GitHub Actions）は
ワークフロー内で毎回buildするため影響を受けないが、**ローカルで`src/`を編集して
`playwright test`を回すときは、必ず先に`npm run build`すること**。

`tests/e2e/popup-double-scroll.spec.js`をローカルで`CI=true npx playwright test`実行し、
2件とも`passed`になることを確認済み（`scrollH`は依然大きい値だが、`.nl-main`が正しく
flex化され1本のスクロールに収まっているため、テストの意図する「縦スクロール要素は1つだけ」
という条件は満たされる）。実CIでの最終確認はこのコミット後に必要。

## 共通パターンの気づき

「非同期完了シグナルを待たず固定スリープ/直後評価に頼っている」という型が#2・#6に明確に
見られ、これは判明済みの#9（popup-double-scroll、クラス付与を待たない）と同型。ただし
#1・#3・#4・#5・#7・#8はそれぞれ異なる種類の問題（レース条件・レイアウト計算のズレ・表示
ロジックの優先順位・クロックスキュー・DOM再アンカリングのタイミング・ボタン検出ロジック）
であり、**一括修正できる単一原因ではない**。9件を1つの原因のせいにしないこと。

## 推奨する進め方（このセッションからの提案）

1. **診断ログを先に仕込み、1回のCI実行で複数件の実測データをまとめて取得する**アプローチを
   推奨する。12分×N回のCI待ちを繰り返さないため。具体的には、失敗しやすい9件それぞれに
   `test.info().annotations.push()`で診断情報（実際の値・タイミング）を追加してから
   一度にpush・CI実行し、実測結果を見てから本当に効く修正を1件ずつ確定させる。
2. 1件直すごとに実CIで確認する場合も、**修正は1件ずつ**入れること（今回のセッションのように
   複数の仮説を積み重ねてから確認すると、どれが効いてどれが効いていないか切り分けられなくなる）。
3. PR #247には既にheadless修正とpopup-double-scrollの2回の試行が積まれている。
   popup-double-scrollの2回の試行は効果が確認できていないため、**新しい仮説（#9の
   「実際のレイアウト不具合」説）で書き直すか、いったんrevertしてから再着手する**ことも検討する。
4. 9件全て緑になったら、PR #247をマージする（マージの実行はユーザーに確認してから）。

## 既知の環境固有の注意点（このセッションで踏んだ地雷）

- このworktreeで`npm ci`していないと、pre-pushフックの`husky`が`vitest`不在で失敗する
  （`npm ci`を先に実行すること）
- `git worktree add`はWindows環境でファイル名長制限（260文字）に既知で引っかかる。
  `git config core.longpaths true`を設定してから実行すると回避できる
- ビルド成果物（`app/dist/`, `extension/dist/`配下）は`npm run build`を実行すると変化するが、
  これらはコミット対象外（差分が出ても`git checkout --`で戻してよい）
