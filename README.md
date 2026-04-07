# nicolivelog

ニコニコ生放送（`https://live.nicovideo.jp/watch/lv...`）のコメントを、**オプトイン**で `chrome.storage.local` に蓄積する Chrome 拡張（MV3）のプロトタイプです。

## 開発

```bash
npm install
npm run verify    # テスト + ESLint + TypeScript(checkJs) + ビルド（本番読み込み前の確認に使う）
# または
npm test
npm run lint
npm run typecheck   # tsc --noEmit（noImplicitAny、**/*.test.js は対象外）
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

### 動作確認チェックリスト（手元）

1. **`npm run verify`** が通っていること（上記「開発」）。  
2. **`chrome://extensions`** で nicolivelog を **再読み込み**（ピン留めするとアイコンが出やすい）。  
3. **パターン A（本番）**: `https://live.nicovideo.jp/watch/lv...` を開く → ポップアップで記録 ON → 件数が `-` から増えるか、コメント一覧を少しスクロールして再確認。  
4. **パターン B（モック・ログイン不要）**: 別ターミナルで下記のいずれかで静的サーバを起動し、`http://127.0.0.1:3456/watch/lv888888888/` を開く → 記録 ON → 件数が増えるか確認（または `npm run test:e2e` / CI 相当の `npx playwright test` で同経路を自動確認）。  
   - **推奨（Playwright と同じ前提）**: リポジトリルートで  
     `npx serve tests/e2e/fixtures -l tcp://127.0.0.1:3456 --no-port-switching`  
     `3456` が埋まっていると **別ポートに逃げず失敗**するため、古い `serve` や別アプリが掴んでいないか確認する。  
   - **代替**: `cd tests/e2e/fixtures` のうえで `npx serve . -l tcp://127.0.0.1:3456 --no-port-switching`（相対パスはカレント依存なので、うまくいかないときは上の1行を使う）。  
5. **開発者ツール**: 拡張の service worker または watch ページ上で **Application → Storage → Extension**（または該当拡張のストレージ）に `nls_recording_enabled` / `nls_comments_lv...` があるか。  
6. **JSON エクスポート**: 件数が 1 以上で「JSONをダウンロード」が押せるか。  
7. 保存に失敗したとき、ポップアップに **赤系の保存エラー表示**が出るか（容量超過などの再現は難しい場合あり）。

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
npm run test:e2e:smoke-monkey # スモーク + ポップアップモンキーだけ（同上・ヘッド付き）
```

- GitHub Actions では **xvfb** 上で `playwright test` を実行するジョブ（`.github/workflows/ci.yml` の `e2e`）があります。**`test-and-build`（`npm run verify`）が成功したあと**にだけ E2E が走ります。ローカルでビルド済みなら `npm run test:e2e:ci` で E2E のみ実行できます。
- 手元で E2E を省略するときは `SKIP_E2E=1 npm run test:e2e` でスキップできます。
- 拡張の読み込み都合で **headless 非対応**のため、ローカルではウィンドウが表示されます。

#### 手動でモックサーバだけ立てるとき（E2E 以外の確認用）

Playwright が起動する設定と揃えると取り違えが減ります。

- コマンド例（ルートから）:  
  `npx serve tests/e2e/fixtures -l tcp://127.0.0.1:3456 --no-port-switching`
- **`--no-port-switching`**: 既定の `serve` はポート占有時に**別ポートへ自動退避**します。ブラウザやテストは `3456` 固定で繋ぐため、**見えているページと実際のサーバがずれる**ことがあります。手動・Playwright ともこのフラグで「3456 で取れなければ失敗」にします。
- モック URL・`tabs.query` 用パターンはテスト側の単一ソース [`tests/e2e/constants.js`](tests/e2e/constants.js) と、マニフェストの `host_permissions`（`http://127.0.0.1:3456/*`）と一致させてあります。

## 拡張機能の読み込み

1. Chrome で `chrome://extensions` を開く
2. 「デベロッパーモード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」→ このリポジトリの **`extension`** フォルダを指定

## 使い方

1. ニコ生の watch ページを開く
2. ツールバーの nicolivelog アイコンからポップアップを開く
3. **「このPCで記録する」** をオン
4. ポップアップの **「ユーザー別（しおり）」** に、投稿者ごとの件数・最新文が並びます（`chrome.storage.onChanged` でリアルタイム更新）
5. **「JSONをダウンロード」** で、いま表示中の放送 ID に対応するコメント配列をファイルに保存できます（アクティブタブが別ページでも、直近に開いた watch の URL があればその件数・エクスポート対象になります）
6. 詳細な生データは開発者ツール → Application → Extension storage の `nls_comments_lv...` で確認

記録は既定でオフです。UI改修でコメントが取れなくなった場合は [`src/lib/nicoliveDom.js`](src/lib/nicoliveDom.js) のセレクタ・パースだけを直してください。

ユーザーIDは `data-user-id` 等と、コメント行内の **`/user/数字` リンク** から推定します。DOMにIDが無いコメントは「ユーザーID未取得」にまとまります。

## 制限

- コメント一覧は仮想スクロールのため、**開いた直後にスクロール走査で可能な限り拾い**、その後は **MutationObserver（子ノード＋テキスト変更）** と **約2秒ごとの表示範囲スキャン**で追記します（UI が行の中身だけ差し替えると `childList` だけでは取りこぼすため）。サーバにしかない全履歴の完全再現は保証しません。
- 利用規約・ガイドラインは各自で確認してください

### 権限（セキュリティメモ）

- マニフェストの `permissions` は **`storage`・`unlimitedStorage`・`scripting`・`downloads`・`alarms`・`tabs`・`sidePanel`**（現行 `extension/manifest.json` と一致させること）。`tabs` はアクティブタブの URL 取得などに、`scripting` はページ側フックに、`downloads` は JSON エクスポートに、`alarms` はバックグラウンドの定期処理に使います。
- ポップアップが `chrome.tabs.query` でアクティブタブの URL を読むときは、**`host_permissions` に一致するオリジン**（例: `https://live.nicovideo.jp/*` および E2E 用 `http://127.0.0.1:3456/*`）上のタブであれば URL を取得できます。一致しないタブでは URL が空になることがあり、その場合はコンテンツスクリプトが保存する **`nls_last_watch_url`** で件数・エクスポート対象を補います。
- `chrome.storage.local` の容量を超えたなどで保存に失敗すると **`nls_storage_write_error`** が立ち、ポップアップに警告が出ます。成功した書き込みのあとに自動で消えます。記録中にコメントパネル DOM が見つからない場合は **`nls_comment_panel_status`** で警告できます（サイト改修の検知用）。

## Codex / Claude 向けの質問集

外部の AI に設計レビューやデバッグ方針を聞くときのテンプレは [`docs/llm-handoff-questions.md`](docs/llm-handoff-questions.md) にまとめてあります（§1 は現行実装の文脈、§2 は「既に入った対策」と「残りの論点」に分離済み）。**Kimito-Link を別セッションの Codex に任せるとき**は同ファイルの **§7** をコピペしてください。タイムシフト視聴時の DOM などの**調査メモ（非公式要約）**は [`docs/research-nicolive-pc-comments.md`](docs/research-nicolive-pc-comments.md) を参照してください。
