#!/usr/bin/env node
/**
 * cws-publish.mjs — Chrome Web Store Publish API で ZIP をアップロード(+任意で公開申請)する。
 *
 * 背景(2026-06-10): CWS の管理画面は Chrome のポリシーで拡張からの自動操作が全面ブロック
 * ("The extensions gallery cannot be scripted")のため、ブラウザ自動化では申請できない。
 * 公式の Publish API が唯一の全自動ルート。
 *   https://developer.chrome.com/docs/webstore/using-api
 *
 * 使い方:
 *   node scripts/cws-publish.mjs build/tsuioku-no-kirameki-0.1.682.zip            # アップロードのみ
 *   node scripts/cws-publish.mjs build/tsuioku-no-kirameki-0.1.682.zip --publish  # +審査へ提出(公開申請)
 *
 * 認証情報(1回だけセットアップ・docs/releases/cws-publish-api-setup.md 参照):
 *   リポジトリ直下の .cws-credentials.json (gitignore 済み) に
 *   { "clientId": "...", "clientSecret": "...", "refreshToken": "..." }
 *   または環境変数 CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN。
 */

import fs from 'node:fs';
import path from 'node:path';

const EXTENSION_ID = 'cjbabignmmodaickpeckiojjabnlogdb';

function loadCredentials() {
  const file = path.join(process.cwd(), '.cws-credentials.json');
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw.clientId && raw.clientSecret && raw.refreshToken) return raw;
  }
  const { CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN } = process.env;
  if (CWS_CLIENT_ID && CWS_CLIENT_SECRET && CWS_REFRESH_TOKEN) {
    return {
      clientId: CWS_CLIENT_ID,
      clientSecret: CWS_CLIENT_SECRET,
      refreshToken: CWS_REFRESH_TOKEN
    };
  }
  console.error(
    '認証情報がありません。docs/releases/cws-publish-api-setup.md の手順で\n' +
      '.cws-credentials.json を作成してください(初回のみ・5分)。'
  );
  process.exit(2);
}

async function accessToken(creds) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    console.error('アクセストークン取得失敗:', JSON.stringify(json));
    process.exit(3);
  }
  return json.access_token;
}

async function main() {
  const zipPath = process.argv[2];
  const doPublish = process.argv.includes('--publish');
  if (!zipPath || !fs.existsSync(zipPath)) {
    console.error('usage: node scripts/cws-publish.mjs <zip path> [--publish]');
    process.exit(1);
  }
  const creds = loadCredentials();
  const token = await accessToken(creds);
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-goog-api-version': '2'
  };

  console.log(`アップロード中: ${zipPath} → item ${EXTENSION_ID}`);
  const upload = await fetch(
    `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}`,
    { method: 'PUT', headers, body: fs.readFileSync(zipPath) }
  );
  const uploadJson = await upload.json();
  console.log('upload:', JSON.stringify(uploadJson));
  if (uploadJson.uploadState !== 'SUCCESS' && uploadJson.uploadState !== 'IN_PROGRESS') {
    console.error('アップロード失敗。itemError を確認してください。');
    process.exit(4);
  }

  if (doPublish) {
    console.log('審査へ提出(公開申請)中…');
    const publish = await fetch(
      `https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}/publish`,
      { method: 'POST', headers }
    );
    const publishJson = await publish.json();
    console.log('publish:', JSON.stringify(publishJson));
    const ok = Array.isArray(publishJson.status) && publishJson.status.includes('OK');
    if (!ok) {
      console.error('公開申請が OK になりませんでした。status を確認してください。');
      process.exit(5);
    }
    console.log('✅ 審査のため送信されました。');
  } else {
    console.log('✅ アップロード完了(下書き)。--publish を付けると審査へ提出します。');
  }
}

await main();
