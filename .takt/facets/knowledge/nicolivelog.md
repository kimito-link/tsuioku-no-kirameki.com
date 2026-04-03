# nicolivelog プロジェクト知識

## 目的（プロトタイプ）
- `live.nicovideo.jp/watch/lv...` で **記録ON** にするとコメントがローカルに蓄積されるブラウザ拡張（MV3）。
- 将来: ユーザー別まとめ・応援スコア・他サイトは後追い。

## ビルド・テスト
```bash
npm install
npm run lint       # ESLint（src / extension / tests / scripts）
npm run typecheck  # tsc --noEmit（noImplicitAny、*.test.js 除外、JSDoc で src / extension を検査）
npm run verify     # テスト + lint + typecheck + ビルド（推奨）
npm test
npm run build
npm run test:e2e # Playwright（ローカル、拡張読み込み・ビルド込み）
npm run test:e2e:ci # ビルド後のみ E2E（CI の xvfb ジョブと同様に `npx playwright test`）
npm run build:watch   # 開発時（esbuild watch）
```

Chrome で **パッケージ化されていない拡張機能** として **`extension` ディレクトリ** を読み込む（詳細は [README.md](../../../README.md)）。

## テスト駆動の方針
- **純関数・パーサ**: Vitest（`src/lib/*.test.js`）。`nicoliveDom.test.js` は `@vitest-environment happy-dom`。
- **DOM 依存**: 実機HTMLは [`src/fixtures/nicolive-comment-list.html`](../../../src/fixtures/nicolive-comment-list.html) に貼り足してテスト拡張可。
- **chrome.* API**: プロトタイプは結合テスト手動。Phase 2 でモック化検討。

## ストレージ
- `nls_recording_enabled`: `true` のときのみ記録（既定はオフ＝キー未設定もオフ扱い）。
- `nls_last_watch_url`: コンテンツスクリプトが更新。ポップアップがアクティブタブ非 watch のときの表示用。
- `nls_storage_write_error`: 保存失敗時のメタ（成功時に削除）。ポップアップで警告。
- `nls_comments_<lv>`: コメントオブジェクトの配列（`commentRecord.js` の形）。

## 主要パス
- [`extension/manifest.json`](../../../extension/manifest.json)
- [`extension/popup.html`](../../../extension/popup.html)
- [`extension/dist/content.js`](../../../extension/dist/content.js) / [`popup.js`](../../../extension/dist/popup.js) — **`npm run build` 後**
- [`src/extension/content-entry.js`](../../../src/extension/content-entry.js) / [`popup-entry.js`](../../../src/extension/popup-entry.js)
- [`src/lib/nicoliveDom.js`](../../../src/lib/nicoliveDom.js) — **UI改修時はここだけ優先修正**
- [`src/lib/commentHarvest.js`](../../../src/lib/commentHarvest.js) — パネル検出・仮想リスト走査
- [`src/lib/observerTarget.js`](../../../src/lib/observerTarget.js) — MutationObserver 監視ルート（パネル優先）
- [`src/lib/watchContext.js`](../../../src/lib/watchContext.js) — URL と lv 遷移の純関数
- [`src/lib/storageErrorState.js`](../../../src/lib/storageErrorState.js) — ストレージエラー JSON 用

## TAKT タスク進捗（参考）
1. `nico-url-parse` — 完了（`broadcastUrl.js`）
2. `storage-schema` / dedupe — 完了（`commentRecord.js`）
3. `ext-mv3-skeleton` + popup — 完了
4. `nico-comment-parse-fixture` — 実機HTMLで拡張可能（フィクスチャ雛形あり）

## リスク
- ニコ生DOM変更で抽出が壊れる → `nicoliveDom.js` のみ差し替え。
- 仮想リストにより表示外コメントは取れない → 仕様として許容。
- manifest は `permissions: ["storage"]` のみ（`tabs` なし）。ポップアップのタブ URL は host_permissions 範囲内で取得。

## CI
- `.github/workflows/ci.yml`: `test-and-build`（Vitest + **ESLint** + **tsc** + esbuild）と `e2e`（Ubuntu + xvfb + Playwright + 拡張読み込み）。

## 外部 LLM 向けテンプレ
- [`docs/llm-handoff-questions.md`](../../../docs/llm-handoff-questions.md)（§1 文脈・§2 残論点・§7 Kimito-Link Codex 用プロンプト）
