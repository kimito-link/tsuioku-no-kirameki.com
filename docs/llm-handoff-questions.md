# Codex / Claude などに投げる用の質問テンプレート（nicolivelog）

リポジトリを添付するか、`src/extension`・`src/lib`・`extension/manifest.json` のパスを明示して使ってください。

---

## 1. 文脈の説明（コピペ用）

```
Chrome MV3 拡張 nicolivelog です。
- 対象: https://live.nicovideo.jp/watch/lv... のコメント一覧を、ユーザーが「このPCで記録する」を ON にしたときだけ chrome.storage.local に蓄積する。
- 抽出: DOM の div.table-row[data-comment-type="normal"] と .comment-number / .comment-text（src/lib/nicoliveDom.js）。
- 仮想スクロール対策: コメントパネル内を縦スクロールしながら複数回抽出（src/lib/commentHarvest.js）。MutationObserver はコメントパネル優先で監視し、未取得時は documentElement（src/lib/observerTarget.js、content-entry.js）。URL ポーリングは resolveWatchPageContext（src/lib/watchContext.js）。lv 切替時は pendingRoots を空にしてから再収集。
- ポップアップ: 記録トグル・件数・ユーザー別集計・JSON ダウンロード。アクティブタブが watch でなくても、最後に開いた watch URL（nls_last_watch_url）で件数表示。保存失敗時は nls_storage_write_error を表示（storageErrorState.js）。
- 権限: permissions は storage のみ。tabs は付与していない（host_permissions と last URL フォールバックでポップアップが動く）。
- E2E: Playwright でローカルモック http://127.0.0.1:3456/watch/lv888888888/（tests/e2e）。
制約: DOM に載らないコメントは取れない。投稿者IDが DOM に無いとユーザー別は「ID未取得」にまとまる。
```

---

## 2. レビュー依頼

**既に手元で入っている対策（レビュー時は前提にしてください）**

- `tabs` 権限は外し、`storage` + `host_permissions` と `nls_last_watch_url` でポップアップの URL 解決を補完。
- MutationObserver は `pickCommentMutationObserverRoot`（パネル優先）で再接続。lv 変更時は `pendingRoots.clear()`。
- 保存失敗は `nls_storage_write_error` + ポップアップ警告。成功時に同キーを削除。

**外部 LLM にまだ聞きたい論点（§2 の残り）**

- **セキュリティ・権限**: 上記構成で「まだ広すぎる host パターン」や「別拡張との併用で漏れうるプライバシー」がないか。
- **パフォーマンス**: パネル監視でも `subtree: true` のコスト、ニコ生の巨大 DOM での割り込み頻度は許容か。さらに絞るならどのセレクタか。
- **ストレージ**: 警告のみの次の段階として、**FIFO 切り詰め・世代別キー・圧縮**のどれが現実的か（データ損失ポリシー込み）。
- **SPA 遷移**: 同一タブで lv 連打・戻る/進む・ハッシュのみ変更の境界で、まだ取りこぼしや誤紐付けが起きうるか（content-entry.js / watchContext.js を添付）。

---

## 3. 機能拡張のアイデア依頼

- 投稿者ユーザーIDを DOM 以外から安定取得する方法（公式 API の有無、利用規約上の注意、技術的難易度）。**実装は規約遵守の範囲で**という前提で整理してほしい。
- タイムシフト・アーカイブ視聴ページでも同じ DOM 構造が使われるか。違う場合のセレクタ分岐の考え方。  
  **※社内・外部調査の要約**は [`research-nicolive-pc-comments.md`](research-nicolive-pc-comments.md)（ライブ/タイムシフト同一 DOM、仮想スクロール差、規約論点のメモ）を併せて添付するとよい。
- 「放送開始から完全なコメントログ」をブラウザ拡張だけで実現する限界と、現実的な代替（手動エクスポート、サーバ連携など）。

---

## 4. デバッグ依頼（症状を自分で書き換え）

```
症状: （例）記録 ON なのに保存件数が増えない / しおりが全部 ID未取得 / 深掘りスクロール後に一覧が元に戻らない など
環境: Chrome 版番号、拡張の読み込み方法（未パック）、該当の lv URL（伏せる場合はダミーでよい）
やったこと: npm run build、拡張再読み込み、別拡張の有無
```

求める出力: 疑うファイル名、確認すべき DevTools の見方、修正案のパッチ案。

---

## 5. テスト依頼

- `src/lib/*.test.js`（observerTarget / watchContext / storageErrorState を含む）と `tests/e2e/extension-recording.spec.js` で足りないケース（エッジケースのコメント本文、system メッセージ、空番号など）。
- CI: `test-and-build` は `npm test` → **`npm run lint`** → **`npm run typecheck`（`tsc --noEmit`、`allowJs`、`noImplicitAny`、`**/*.test.js` は除外）** → `npm run build`。別ジョブ `e2e` は Ubuntu + **xvfb** で `npx playwright test`。

---

## 6. 利用規約・コンプライアンス（一般論）

- ニコニコ生放送の利用規約・ガイドライン上、視聴者がコメントをローカルに記録する行為について、**一般論として**注意すべき点のチェックリスト（法的助言ではなく、自己責任で確認すべき項目の列挙）。

---

## 7. 隣プロジェクト（Kimito-Link）向け Codex プロンプト（コピペ用）

別ウィンドウで `C:\Users\info\OneDrive\デスクトップ\Resilio\github\kimito-link` を開いている Codex などに渡す用です（nicolivelog リポジトリ外）。

```
あなたは Kimito-Link サイトの「世界観デザイン（ビジュアル・コピー統一）」を担当する。コード変更は kimito-link ワークスペース内のみ。

必読（順）:
1. src/_docs/AI_HANDOFF_CONTEXT.md（正本は common-layout-v3。ヘッダー/フッターを一から作り直さない）
2. DESIGN_PRINCIPLES.md と src/_docs/COMPONENT_REGISTRY.md

デザイン方針:
- ゆっくり風キャラは既存の src/images/yukkuri-charactore-english/（こん太・たぬ姉・りんく）と src/css/kl-scene-trio.css の kl-scene-trio を正とする。新規画像はライセンス明確なオリジナルのみ。最適化ページ等はサイトルート /images/yukkuri-charactore-english/ を向くテストがあるのでパスを壊さない。
- ロゴは .site-header .logo img のようにコンテキスト付きセレクタで調整（グローバル .logo img 直指定は禁止）。
- TOP・工房・活用術など登録ページ間でトーンを揃える。レイアウト基盤は触らず本文・コンポーネント側で統一。

技術制約: レスポンシブ必須。URL は /path/ 形式、index.html 直URLにしない。www なし・HTTPS 前提。CSS で !important を増やさない。

完了前: npm run check:header-guard、check:no-important、check:ai-rules、test:smoke（package.json 定義に従う）
```

---

このファイルはプロジェクト内の要約用です。外部 LLM には、必要なセクションだけコピーして送って構いません。
