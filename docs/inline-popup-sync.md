# インライン iframe とツールバーポップアップの同期仕様

## 概要

`popup.html` は次のふたつの文脈で読み込まれます。

- **ツールバーポップアップ** — `chrome-extension://…/popup.html`
- **watch 埋め込み（インライン）** — `popup.html?inline=1` を iframe で表示

どちらも同じ `chrome.storage.local` を共有します。

## 初回メイン UI クローク（`data-nl-popup-primary-cloak`）

- 利用条件ゲート（`#usageTermsGate`）の**外側の兄弟**として `.nl-popup-primary` を置き、`html[data-nl-popup-primary-cloak='1']` のあいだだけメイン領域を `visibility: hidden` にします（ゲート操作は常に可能）。
- `popup-entry.js` は**最初の** `refresh()` が初回ペイント（`markPopupRefreshContentPainted`）まで進んだタイミングで一度だけ解除し、以降の `safeRefresh` では再クロークしません（定期更新で UI が一瞬消えるのを避けるため）。
- E2E は `data-nl-popup-content-painted='1'` のあと、`data-nl-popup-primary-cloak` が付かないことを確認します。

## 応援ビジュアル（`nls_support_visual_expanded`）

- 開閉状態はストレージキー **`nls_support_visual_expanded`** に保存されます。
- **`chrome.storage.onChanged` から `details.open` を自動同期しない**設計です。インラインとポップアップの両方が同じキーを購読していると、一方の `open` 代入がもう一方で `toggle` を連鎖させ、二重の永続化や見た目のちらつきの原因になるためです。
- 同期の実際の挙動:
  - 各ドキュメントは、**初回** `loadPopupFrameSettings` 完了後に `applySupportVisualExpandedFromStorage` でストレージから開閉を反映します。
  - 以降は **ユーザーが `<summary>` でトグルしたときだけ** ストレージへ書き戻します。
- そのため、**インラインとポップアップを同時に開いていると、応援ビジュアルの開閉表示が一瞬だけ食い違う**ことがあります。必要なら将来、`runtime.sendMessage` などで明示同期する別 PR を検討してください。

## その他の共有キー

記録 ON/OFF、コメントデータ、ストレージエラー、コメントパネル検出警告などは通常どおり `onChanged` で両方に反映されます（応援ビジュアルと同様の抑止はかけていません）。
