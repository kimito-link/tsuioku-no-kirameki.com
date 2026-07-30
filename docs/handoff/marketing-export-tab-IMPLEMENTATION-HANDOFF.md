# 実装ハンドオフ: マーケ分析レポートの別タブ化

> 正本設計: `marketing-export-tab-DESIGN.md` は**未作成**(このファイルが暫定の正本を兼ねる)。
> 元プランは `C:\Users\info\.claude\plans\giggly-brewing-sutherland.md` に保存済み。
> ※ 実体の無いファイルへのリンク記法は site-health のリンク切れ検査に当たるため外してある
>   (2026-07-31: ルート直下からこのディレクトリへ移動して git 管理下に入ったことで検出された)。
> 日付: 2026-07-17

## 背景

popupの「📊 マーケ」ボタンを押すと、popup内で同期的に重い処理(コメント全件集計・過去配信比較・
巨大HTML組み立て)が走り、体感1〜5分popupが固まったように見える。ユーザー要望:
「クリックしたら別タブが開いて、DAMのカラオケ採点や太鼓の達人のフィナーレのように、待ち時間中は
キャラクター演出があり、完了したらレポート内の各セクションが音付きで順番に発表されていき、
そのままダウンロードできる」。

## 進捗状況(2026-07-17時点)

### ✅ PR1: 完了・commit済み(commit 30805233・master push未実施)

- `extension/marketing-export.html`(待機演出UI・りんく/こん太/たぬ姉が交代セリフ)
- `extension/marketing-export-guard.js`(status-guard.js型の起動見張り)
- `src/extension/marketing-export-entry.js`(本体。popup-entry.js:19688-20022の処理を
  storage読み直しベースで移植)
- `scripts/build.mjs`にentry追加

**⚠️ 直接URLでの実機確認は未完了**: `chrome-extension://<id>/marketing-export.html?lv=<配信ID>`を
ユーザーに直接開いてもらう確認は「でません・めんどう」と難航。原因未特定のまま**PR2に先行着手**した
(popupボタンから開けるようにすれば確認しやすくなる、という判断)。

### ✅ PR2: 完了・commit済み(commit 50493db0・v0.1.1166・master push未実施)

- `src/extension/popup-entry.js`: `devMonitorExportMarketingBtn`ハンドラ(旧19688-20022行・
  約340行)を全削除し、`openOrFocusMarketingExportTab(lid)`を呼ぶだけの薄いハンドラに置換。
- `openOrFocusMarketingExportTab`新設(popup-entry.js、`buildHtmlReportDeps`の直前に配置)。
  `chrome.tabs.query`で同一liveIdの処理中タブを検知→フォーカス、無ければ`chrome.tabs.create`。
- 不要になったimport 9個を削除(`aggregateMarketingReport`/`buildMarketingDashboardHtml`等、
  いずれも`marketing-export-entry.js`側に既に移植済み)。
- `npm run verify:cc`全緑確認済み(PR1+PR2両方の変更を含めて全体テスト7965件緑・lint・
  typecheck・build・tracked-imports・tree-map・site-health・feature-map・verify:bump)。
- `npm run copy:ext`実行済み(BUILD_ID: 0717-131254)。

**⚠️ 未検証(次にやるべきこと)**: ユーザーに以下の手順で実機確認してもらう必要がある:
1. `chrome://extensions`で拡張の🔄(リロード)を押す
2. 記録済みの配信をwatchタブで開き、拡張のポップアップを開く
3. 「📊 マーケ」ボタンを押す
4. **確認ポイント**:
   - 新しいタブが自動で開くか
   - popupがすぐ元通り操作可能に戻るか(固まらないか)
   - 新しいタブでりんく/こん太/たぬ姉の待機演出が表示されるか
   - 進捗テキストが更新されていくか
   - 最終的にダウンロードが自動で始まるか
   - 完了画面(「✅ ダウンロードを開始しました」)が出るか
   - もう一度「📊 マーケ」ボタンを押しても新しいタブが増えず、既存タブにフォーカスするか
     (連打での単一インスタンス制御確認)

エラーが出た場合は、devtoolsのコンソールエラー、またはスクリーンショットがあると切り分けが早い。
PR1で難航した「直接URL入力」よりボタン操作の方が簡単なはずなので、今回はうまくいく可能性が高い。

### ⬜ PR3: 未着手(セクション順次発表演出+待機演出の本格実装+Web Audio API音)

PR1/PR2の実機確認が済んでから着手する。プランの§4/§5参照。

## 次にやるべきこと(優先順)

1. **PR1の直接URL確認が難航した原因を先に切り分ける**。候補:
   - `<配信ID>`のプレースホルダーをそのままコピーして使った(実際のlv番号に置換していない)
   - 拡張リロード(chrome://extensions 🔄)を忘れている
   - 記録済みコメントが無い配信IDを使った(コメント0件だとエラー画面になる=「出ない」ように見える)
   - 実装自体のバグ(URLパラメータの`lv`パースやscript読み込みの失敗)
   実機のスクリーンショット、または devtools のコンソールエラーを見せてもらうと切り分けが早い。
2. **PR2に先に進む**という判断もアリ。popupの「📊 マーケ」ボタンから開けるようになれば、
   直接URL入力の手間が無くなり、ユーザーにとって確認しやすくなる。
   `devMonitorExportMarketingBtn`ハンドラを以下に置き換える(プランの§2参照):
   ```js
   $('devMonitorExportMarketingBtn')?.addEventListener('click', async () => {
     const prm = lastDevMonitorPanelParams;
     const lid = String(prm?.liveId || $('exportJson')?.dataset.liveId || '').trim().toLowerCase();
     if (!lid) { /* 既存の「liveIdなし」表示 */ return; }
     await openOrFocusMarketingExportTab(lid);
   });
   ```
   `openOrFocusMarketingExportTab`は`chrome.tabs.query`で既存タブを検知→フォーカス、
   無ければ`chrome.tabs.create`で新規作成する単一インスタンス制御ヘルパー(プラン§6に実装例あり)。
   `showExportWaitPanel('marketing')`呼び出しをこのハンドラから削除する(HTML書き出し側の
   同関数呼び出しは無変更で残す・popup-entry.js:19670-19686の「メディアキット保存」ハンドラとは
   無関係と確認済み)。

## 参考: 実装で判明した重要事実

- `aggregateMarketingReport`/`buildMarketingDashboardHtml`はchrome非依存の純関数、呼び出し
  引数は一切変えていない。
- popup専用メモリ`watchMetaCache.snapshot`は`chrome.storage.local`の
  `nls_watch_snapshot_<lv>`キー(`watchSnapshotStorageKey`)から読み直せば再構成できる
  (`marketing-export-entry.js`の`runExport`関数冒頭で実施済み)。
- ダウンロードされる単独HTMLファイルは拡張コンテキスト外のため、既存mp3ベースの効果音は使えない。
  PR3では Web Audio API での合成音を使う方針(`src/extension/content-entry.js`に既存のAudioContext
  利用例あり)。
- `.mkt-section`クラス(69箇所)・`id="mkt-xxx"`が`marketingChartsHtml.js`の生成HTMLに既に
  付与されているため、PR3のセクション順次発表演出はこの構造をそのまま使える(大きな改造不要)。

## 機械的な完了判定

- [ ] `npm run verify:cc`全緑
- [ ] (PR1)実機で`marketing-export.html?lv=<配信ID>`が待機演出→ダウンロードまで動く
- [ ] (PR2)popupの「📊 マーケ」ボタンでタブが開き、popupが即座に操作可能に戻る
- [ ] (PR2)ボタン連打で複数タブが開かない・既存タブがあればフォーカスされる
- [ ] (PR3)ダウンロードしたHTMLを単体で開いてもセクション演出・音が機能する(オフライン確認)

## 地雷

- `npm run copy:ext`は配信視聴中には実行しない(既存ルール・版混在事故)。
- dist配下のbuild-id churnはcommit後に`git checkout -- <path>`で毎回破棄する
  (`app/dist/live-view.js`・`extension/dist/popup.js`・`extension/dist/status.js`等が
  pre-pushフックのbuildで書き換わる)。
- tree-map/feature-map再生成を新規ファイル追加時のコミットに必ず含める(`npm run tree-map` /
  `npm run feature-map`)。
