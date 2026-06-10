# CWS Publish API セットアップ(初回のみ・約5分)

これを一度やれば、以後の CWS 申請は Claude が
`node scripts/cws-publish.mjs build/<zip> --publish` で**完全自動**実行できる。
(CWS の管理画面は Chrome のポリシーで拡張からの自動操作が禁止されているため、
 公式 Publish API が唯一の全自動ルート)

公式手順: https://developer.chrome.com/docs/webstore/using-api

## 手順(ユーザーのブラウザで実施)

1. https://console.cloud.google.com/apis/credentials を開く
   (CWSデベロッパー登録と同じ Google アカウントで)
2. プロジェクトを1つ作成(名前は何でも・例: cws-publish)
3. 「APIとサービス → ライブラリ」で **Chrome Web Store API** を検索して有効化
4. 「OAuth同意画面」: User Type=外部 → アプリ名等を最低限入力 → テストユーザーに自分の
   Gmail を追加 → 保存
5. 「認証情報 → 認証情報を作成 → OAuthクライアントID」:
   アプリの種類 = **デスクトップアプリ** → 作成 → **クライアントIDとシークレット**を控える
6. 次の URL をブラウザで開く(CLIENT_ID を差し替え):
   ```
   https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob
   ```
   → 同意すると**認証コード**が表示されるのでコピー
   (oob が拒否される場合は redirect_uri を http://localhost:8818 にして、リダイレクト先URLの
   ?code= をコピーでも可)
7. 認証コード→リフレッシュトークン交換(Claude に「コード貼るので交換して」と言えば
   下のコマンドを Claude が実行する):
   ```bash
   curl -s -X POST https://oauth2.googleapis.com/token \
     -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET \
     -d code=認証コード -d grant_type=authorization_code \
     -d redirect_uri=urn:ietf:wg:oauth:2.0:oob
   ```
   応答 JSON の `refresh_token` を控える
8. リポジトリ直下に `.cws-credentials.json` を作成(**gitignore 済み・コミットされない**):
   ```json
   {
     "clientId": "...",
     "clientSecret": "...",
     "refreshToken": "..."
   }
   ```

## 以後の申請(毎回・Claude が自動実行)

```bash
python scripts/stage-submission.py <version>
node scripts/cws-publish.mjs build/tsuioku-no-kirameki-<version>.zip --publish
```

※ ストア説明文の変更はAPIの items では更新できない(掲載情報はダッシュボード手動)。
   説明文を変えた回だけ、ダッシュボードで「詳細な説明」を
   docs/releases/cws-store-listing.md から貼り直す。
