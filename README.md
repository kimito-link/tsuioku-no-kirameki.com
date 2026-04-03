# nicolivelog

ニコニコ生放送（`https://live.nicovideo.jp/watch/lv...`）のコメントを、**オプトイン**で `chrome.storage.local` に蓄積する Chrome 拡張（MV3）のプロトタイプです。

## 開発

```bash
npm install
npm test
npm run build
```

- ビルド成果物: `extension/dist/content.js`, `extension/dist/popup.js`
- ウォッチ: `npm run build:watch`（別ターミナルで常駐）

## 拡張機能の読み込み

1. Chrome で `chrome://extensions` を開く
2. 「デベロッパーモード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」→ このリポジトリの **`extension`** フォルダを指定

## 使い方

1. ニコ生の watch ページを開く
2. ツールバーの nicolivelog アイコンからポップアップを開く
3. **「このPCで記録する」** をオン
4. ポップアップの **「ユーザー別（しおり）」** に、投稿者ごとの件数・最新文が並びます（`chrome.storage.onChanged` でリアルタイム更新）
5. 詳細な生データは開発者ツール → Application → Extension storage の `nls_comments_lv...` で確認

記録は既定でオフです。UI改修でコメントが取れなくなった場合は [`src/lib/nicoliveDom.js`](src/lib/nicoliveDom.js) のセレクタ・パースだけを直してください。

ユーザーIDは `data-user-id` 等と、コメント行内の **`/user/数字` リンク** から推定します。DOMにIDが無いコメントは「ユーザーID未取得」にまとまります。

## 制限

- 画面上に載っているコメントのみ（仮想リストでDOMから消えた過去コメントは含まれないことがあります）
- 利用規約・ガイドラインは各自で確認してください
