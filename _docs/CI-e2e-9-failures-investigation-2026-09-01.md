# CI e2eジョブ 9件連続失敗の調査記録（Codexへの引き継ぎ）

調査=web-ios-android担当のClaudeセッション（越境作業） / 2026-09-01
実装（この記録の続き）=Codex に依頼（ユーザー判断：「codexがこういうの得意だから」）だったが、
Codexが使用制限に達したため、同じClaudeセッションが追加調査を継続（2026-09-01 22時台〜9-2未明）。

**popup-double-scroll.spec.js・popup-window-empty-history-real.spec.js・
popup-multitab-empty-dash-rescue.spec.jsの3件は根本原因を特定・修正し、
ローカルで実行して緑になることを確認済み**（実CIでの最終確認はこの後のpush分で実施予定）。
8回の推測修正の空振りを経て、最終的に実測ベースで真因（primaryBottom過小評価・
POPUP_WINDOW_MAX_HEIGHTクランプ誤検知・100vh依存とhtml.clientHeightのDOM仕様）に
到達した。詳細は下記「popup-double-scroll: 追加調査で判明したこと」節を参照。
残り6件（multitab-storage-contention・popup-comment-compose×2・popup-layout・
snapshot-fetch-hang-resilient・support-activity-timeline・timeline-fill-standalone-window）
は未着手のまま引き継ぐ。

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
| 9 | `tests/e2e/popup-double-scroll.spec.js:21` | standalone popupでbody/htmlはスクロールせず.nl-main 1本のみがスクロールする | **7件の根本原因（原因A〜G）をすべて特定・修正済み。popup-window-empty-history-real.spec.js／popup-multitab-empty-dash-rescue.spec.js／popup-empty-state-window-height.spec.jsを含む4ファイルでローカル緑を確認（下記セクション参照）。** | 実CIでの最終確認が必要 |

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

### 原因C（試行→revert済み）: `treatAsNoActiveWatch`修正は別の回帰を生んだため取り下げた

一度、`pickWatchUrlFromMultipleSources()`で`lastFocusedUrl`由来の`dataBacked`判定を
`lastFocusedNormal`に変える修正を入れたが、実CIで**別の既存テスト
`popup-multitab-empty-dash-rescue.spec.js`（実機の「別タブの記録を誤ってアクティブ表示
しない」安全設計の回帰ガード）を退行させた**。standalone popup windowでは
`chrome.tabs.query({active:true, currentWindow:true})`が popup 自身を返す以上、
「ユーザーが今見ている配信」と「別タブの古い記録」を原理的に区別できず、拡張は
安全側（empty state）に倒す設計になっている。この修正はその安全設計と矛盾したため
`git revert`で取り下げた（コミット`a48b09cc`）。

代わりに、`popup-double-scroll.spec.js`のテストセットアップ自体を、
`popup-window-empty-history-real.spec.js`と同じ「IndexedDB (`nls_broadcast_summary_v1`)
に前回配信サンプルを直接シードし、empty state＝前回配信レビューとして実データを描画させる」
パターンに書き換えた。これにより「配信中かどうか」ではなく「実データがある状態で二重
スクロールしないか」という本来の検証目的を、安全設計と衝突せずに検証できるようにした。

### 原因D・E・F（確定・修正済み・実測で確認）: empty stateの高さ計算が3重に壊れていた

テストセットアップを書き換えた後も、`popup-double-scroll.spec.js`だけでなく
**既存の`popup-window-empty-history-real.spec.js`まで同じ「下空白が異常」症状
（`outerHeight - primaryBottom = -168`）で落ちる**ことが判明し、これが
`popup-double-scroll.spec.js`固有の問題ではなく共通の根本原因であると分かった。
以降、実測ベースで8回の修正試行を経て、独立した3つの原因すべてを特定した。

**原因D: `viewportHint`計算の過小評価**（`resizePopupWindowForState()`）
`nlPopupPrimary.scrollHeight`だけを見てウィンドウ目標高を計算していたが、これは
primary自身の高さのみで、`nl-compose-quick-toolbar`等primaryより前にある兄弟要素の
高さを含まない（実測: `primaryBottom`が`primary.scrollHeight`より208px大きかった）。
修正: `primary.getBoundingClientRect().bottom`（ビューポート絶対位置、兄弟要素込み）
を使うよう変更。

**原因E: `POPUP_WINDOW_MAX_HEIGHT`のクランプ誤検知**（`popupWindowEmptyHeight.js`）
原因D修正で正しい目標高（~1150px級）が計算されるようになった結果、旧上限1100pxに
張り付き、`popup-window-empty-history-real.spec.js`の「レーン空枠バグ（コンテンツ
~2245px→outer=1100だった旧バグ）の回帰ガード」が誤検知するようになった。修正:
上限を1250に緩和し、対応するテスト閾値（`toBeLessThan(1080)`→`toBeLessThan(1200)`）
も更新。

**原因F: 100vh依存と`html.clientHeight`のDOM仕様**（`extension/popup.html` /
`popup-double-scroll.spec.js`）
`html.nl-popup-window`のCSSが`height/max-height: min(var(--nl-pop-height), 100vh)`
としていたが、`chrome.windows.update()`後、**Playwright headless/CI環境で
`window.innerHeight`（=`100vh`の基準）が新ウィンドウ高に追従しないことがあり**、
`100vh`側の古い値（リサイズ前の`720px`）に永続的にクランプされ続けていた
（`--nl-pop-height`をどれだけ大きくしても`min()`が`100vh`側を選び続ける）。
修正: `--nl-pop-height`のみを信頼する形（`100vh`を使わない）に変更。

さらに、この修正後も`popup-double-scroll.spec.js`だけが`clientH=720`で失敗し続けた。
実測したところ`html.offsetHeight`（1123px、正しい）と`getComputedStyle(html).height`
（1122.84px、正しい）は正常なのに、**`html.clientHeight`（`document.documentElement
.clientHeight`）だけが`window.innerHeight`と同じ値（720px）に固定されたまま**だった。
これは拡張のバグではなく、**CSSOM View仕様上`document.documentElement.clientHeight`が
実レイアウト結果ではなくビューポートサイズを返す既知の挙動**（`html`要素固有、`body`
要素等では発生しない）。修正: テスト側の`html`溢れ判定を`html.clientHeight`から
`html.offsetHeight`に変更。

**ローカル検証で踏んだ別の罠（重要）**: 原因C〜Fの調査中、修正を`src/`に加えた直後、
何度再実行しても症状が変わらず数時間ハマった。原因は**`npm run build`し忘れ**——
このリポジトリのE2Eテストは`extension/dist/popup.js`（ビルド成果物）を読み込む構成で、
`src/`への編集は`npm run build`しない限りローカルのPlaywright実行には一切反映されない。
`grep -c "自分のデバッグマーカー" extension/dist/popup.js`で0件だったことで発覚した。
実CI（GitHub Actions）はワークフロー内で毎回buildするため影響を受けないが、
**ローカルで`src/`や`extension/`を編集して`playwright test`を回すときは、必ず先に
`npm run build`すること**。

### 原因G（確定・修正済み）: `hoistQuickToolbarToTop()`がempty stateでも操作ツールバーを非表示から外していた

原因D〜Fをpush・実CI確認したところ、**目標の3ファイルは緑になったが**、それまで
このセッションが見ていなかった別の既存テスト`popup-empty-state-window-height.spec.js`
（履歴ゼロのempty stateでpopup windowが600px前後に縮むことを検証、過去の実ユーザー
影響バグ「0501-1117ビルドでpopupが逆に拡大した」の回帰ガード）が**新たに失敗**した
（`outer:903`、期待`695`、差208px）。原因D（primaryBottom計算修正）の副作用だった。

実測（`primaryRectBottom:863.015625`と`bottomOfPoweredBy:863.015625`が一致、
`primaryScrollHeight:655`との差208px）から、`.nl-comment-compose`（CSS側で
`html.nl-empty-state body .nl-comment-compose { display:none !important }`により
非表示になる設計、9865行目付近）の子であるはずの`.nl-compose-quick-toolbar`が、
**実際には非表示になっていなかった**ことが判明した。

真因は`hoistQuickToolbarToTop()`（v0.1.896「操作ボタン群をパネル上部へ昇格」機能）。
この関数は`.nl-compose-quick-toolbar`を`.nl-comment-compose`の外、`.nl-main`直下
（常に表示される場所）へDOM移動させる。`initPopup()`から`emptyState`のガード無しで
無条件に呼ばれており、empty stateでも操作ツールバーが常時表示の場所に居座り続けていた。

**修正**:
1. `hoistQuickToolbarToTop()`自体がempty stateでは昇格をスキップする（新規昇格を防ぐ）。
2. CSS側に`html.nl-empty-state body .nl-compose-quick-toolbar[data-nl-hoisted='top']`
   の`display:none`ルールを追加（active watch→empty state切り替え時、既に昇格済みの
   DOMをdata属性で確実に非表示にする、DOM位置に依存しない保険）。

`popup-double-scroll.spec.js`・`popup-window-empty-history-real.spec.js`・
`popup-multitab-empty-dash-rescue.spec.js`・`popup-empty-state-window-height.spec.js`
の4ファイルをまとめてローカルで`CI=true npx playwright test`実行し、全て`passed`に
なることを確認済み。フルユニットテスト（8972件）も全通過。実CIでの最終確認はこの
コミット後に必要。

**教訓**: `primaryScrollHeight`から`primaryBottom`（`getBoundingClientRect().bottom`）
への計算式変更は、それまで「兄弟要素を含まない過小評価」で偶然マスクされていた
別の不具合（ツールバー非表示漏れ）を顕在化させた。計算式を「より正確」にする修正は、
既存の不正確な値に依存していた別のロジック・テストに波及することがある——修正後は
関連しそうな既存specを幅広く実行して確認する必要がある。

## 共通パターンの気づき

「非同期完了シグナルを待たず固定スリープ/直後評価に頼っている」という型が#2・#6に明確に
見られ、これは判明済みの#9（popup-double-scroll、クラス付与を待たない）と同型。ただし
#1・#3・#4・#5・#7・#8はそれぞれ異なる種類の問題（レース条件・レイアウト計算のズレ・表示
ロジックの優先順位・クロックスキュー・DOM再アンカリングのタイミング・ボタン検出ロジック）
であり、**一括修正できる単一原因ではない**。9件を1つの原因のせいにしないこと。

## 推奨する進め方（残り6件への引き継ぎ）

popup-double-scroll / popup-window-empty-history-real / popup-multitab-empty-dash-rescue
の3件は解決した。残る6件（`multitab-storage-contention` / `popup-comment-compose`×2 /
`popup-layout` / `snapshot-fetch-hang-resilient` / `support-activity-timeline` /
`timeline-fill-standalone-window`）はこのセッションでは未着手。

1. **ローカルでの検証は必ず`npm run build`してから行う**（このセッションが数時間ハマった罠。
   `extension/dist/popup.js`にデバッグマーカーが実際に入っているかを`grep`で確認する癖をつける）。
2. **診断ログを先に仕込み、1回のCI実行で複数件の実測データをまとめて取得する**アプローチを
   推奨する。12分×N回のCI待ちを繰り返さないため。
3. 1件直すごとに実CIで確認する場合も、**修正は1件ずつ**入れること。複数の仮説を積み重ねてから
   確認すると、どれが効いてどれが効いていないか切り分けられなくなる（このセッションは
   popup-double-scroll系で8回の試行を要した）。
4. **既存の他テストへの影響を必ず確認する**（このセッションはtreatAsNoActiveWatchの修正で
   一度popup-multitab-empty-dash-rescue.spec.jsを退行させ、revertした）。修正前後で
   関連しそうな既存specもまとめて実行し、意図しない回帰がないか確認する。
5. 9件全て緑になったら、PR #247をマージする（マージの実行はユーザーに確認してから）。

## 既知の環境固有の注意点（このセッションで踏んだ地雷）

- このworktreeで`npm ci`していないと、pre-pushフックの`husky`が`vitest`不在で失敗する
  （`npm ci`を先に実行すること）
- `git worktree add`はWindows環境でファイル名長制限（260文字）に既知で引っかかる。
  `git config core.longpaths true`を設定してから実行すると回避できる
- ビルド成果物（`app/dist/`, `extension/dist/`配下）は`npm run build`を実行すると変化するが、
  これらはコミット対象外（差分が出ても`git checkout --`で戻してよい）
