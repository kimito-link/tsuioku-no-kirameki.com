# nicolivelog

ニコニコ生放送（`https://live.nicovideo.jp/watch/lv...`）のコメントを、**オプトイン**で `chrome.storage.local` に蓄積する Chrome 拡張（MV3）のプロトタイプです。

## 開発

```bash
npm install
npm run verify    # テスト + ビルド（本番読み込み前の確認に使う）
# または
npm test
npm run build
```

- ビルド成果物: `extension/dist/content.js`, `extension/dist/popup.js`
- ウォッチ: `npm run build:watch`（別ターミナルで常駐）

### 本番の放送で使う手順

1. リポジトリで **`npm run verify`**（または `npm run build`）を実行する。  
2. Chrome の **`chrome://extensions`** で nicolivelog を **再読み込み**する（コードを変えたあとは毎回）。  
3. **`https://live.nicovideo.jp/watch/lv...`**（実際の放送ページ）を開く。  
4. ツールバーの拡張アイコン → ポップアップで **「このPCで記録する」** をオンにする。  
5. しばらく待つか、コメント一覧を少しスクロールすると件数が増えることがあります（仮想リストのため）。

初回だけ拡張の読み込み（上記「拡張機能の読み込み」）が必要です。

### GitHub Actions（CI）

`.github/workflows/ci.yml` が **任意のブランチへの push** と **Pull Request** で動きます。リポジトリの **Actions** タブから **「CI」→「Run workflow」** でも手動実行できます。

動かないときは次を確認してください。

- このリポジトリを **GitHub に push** しているか（`git remote -v` でリモート確認）
- リポジトリの **Settings → Actions → General** でワークフローが無効になっていないか

### E2E（Playwright・拡張の読み込み）

実ニコ生ページはログインや配信状況に依存するため、**ローカル静的モック**（`http://127.0.0.1:3456/watch/lv888888888/`）で「記録 ON → `chrome.storage` にコメントが溜まる」経路を検証します。

```bash
npm run playwright:install   # 初回のみ Chromium を取得
npm run test:e2e             # ビルド後、headed Chromium で実行（画面が開きます）
```

- ディスプレイのない CI では `SKIP_E2E=1 npm run test:e2e` でスキップできます。
- 拡張の読み込み都合で **headless 非対応**のため、ローカルではウィンドウが表示されます。

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

- コメント一覧は仮想スクロールのため、**開いた直後にスクロール走査で可能な限り拾い**、その後は新規 DOM と手動スクロールでも追記します。サーバにしかない全履歴の完全再現は保証しません。
- 利用規約・ガイドラインは各自で確認してください
