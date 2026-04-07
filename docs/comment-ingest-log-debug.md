# コメント取り込み監査ログ（`nls_comment_ingest_log_v1`）のデバッグ手順

ニコ生 watch 向け MV3 拡張において、`chrome.storage.local` の監査ログが期待どおり書かれているかを確認するための**実装準拠**メモです。  
実装の正は `src/lib/commentIngestLog.js`・`src/lib/storageKeys.js`・`src/extension/content-entry.js`（`persistCommentRowsImpl`）です。

## ストレージキーと Extension ID

- **キー文字列**: `nls_comment_ingest_log_v1`（コード上は `KEY_COMMENT_INGEST_LOG`）
- **Extension ID**: `manifest.json` には載らない。`chrome://extensions`（デベロッパーモード ON）の拡張カードに表示される 32 文字の ID を使う。

## データ構造（実装どおり）

- **値の形**: `{ v: 1, items: CommentIngestLogItem[] }`  
  - `v` は**数値**（文字列 `'v1'` ではない）。
- **`items` の並び**: **時系列で古い → 新しい**。**最新は末尾**（`items[items.length - 1]`）。
- **リングバッファ**: 新規行は**末尾に追加**し、`slice(-cap)` で**先頭から超過分を捨てる**（`appendCommentIngestLog`）。`cap` は実装で 16〜5000 にクランプ。
- **高頻度経路の間引き**: `persistCommentRowsImpl` では **`maybeAppendCommentIngestLog`** を呼ぶ。`source` が **`ndgr` / `visible`** のとき、同一 `liveId`・同一 `source` で**直前行からの経過が短く**（ndgr 5s / visible 4s）、かつ `added` が小さく `totalAfter` の増分も小さい場合は**追記しない**（`null` → その回の `set` に監査ログキーを含めない）。`mutation` / `deep` 等は従来どおり毎回評価される。

## 書き込みが発生する場所（誤解しやすい点）

- 監査ログの追記は **`src/extension/content-entry.js` の `persistCommentRowsImpl` 内**で、**コンテンツスクリプトから** `chrome.storage.local.set` にマージされる。
- **Service Worker 経由のメッセージは不要**（`background.js` はこのキーを書かない）。
- 追記条件: **`storageTouched || pendingTouched` が真**のときだけ `maybeAppendCommentIngestLog` が呼ばれる（戻り値が `null` のときは監査ログを更新しない）。  
  **プロフィールキャッシュのみ更新（`cacheTouched` のみ）**の `else if (cacheTouched)` 分岐の `set` には **`KEY_COMMENT_INGEST_LOG` は含まれない**。

## DevTools で「ストレージに書かれているか」を確認する

**ニコ生ページの「Local Storage」は拡張の `chrome.storage.local` ではない。**  
**Application → Storage → Extension storage → local** で、キー `nls_comment_ingest_log_v1` を探す。

### 推奨エントリポイント（どれでも可）

1. **Service Worker**: `chrome://extensions` → 対象拡張の「Service worker」→ 検査 → Application → Extension storage → local  
2. **ポップアップ**: 拡張アイコン → 右クリック → 「ポップアップを検査」→ 同上  
3. **watch タブ**: F12 → Application → Extension storage → 対象拡張を選び → local  

値は `{ v: 1, items: [...] }`。表は **Refresh** で最新化。

### Console で即確認（実行コンテキストに注意）

次は **Service Worker / ポップアップの DevTools**、または **watch タブの Console で実行コンテキストを「拡張（コンテンツスクリプト）」に切り替えたうえで**実行する。  
既定の **top（ページのメイン世界）** では `chrome` が無いことが多い。

```js
chrome.storage.local.get('nls_comment_ingest_log_v1').then((data) => {
  const log = data['nls_comment_ingest_log_v1'];
  console.log('nls_comment_ingest_log_v1 件数:', log?.items?.length ?? 0);
  console.table(log?.items?.slice(-5) ?? []);
});
```

## 「空のまま」のチェックリスト（優先の目安）

| 優先 | 要因 | 確認 |
|------|------|------|
| 1 | 記録 OFF | ポップアップで記録 ON か |
| 2 | `storageTouched` も `pendingTouched` も立たず早期 return、または `cacheTouched` のみ | マージや self-posted 消費がストレージを更新していない。プロフィールだけ更新では監査ログは増えない |
| 3 | ビルド未反映 | `src/` 変更後は `npm run build` → `chrome://extensions` で Reload → **watch タブもリロード** |
| 4 | `persistCommentRowsImpl` が動いていない | NDGR バッチ / deep harvest / visible / mutation デバウンス等が発火していない |
| 5 | 別タブ・URL 不一致 | `manifest` の `content_scripts.matches` に合うページで `dist/content.js` が動いているか |
| 6 | `storageTouched \|\| pendingTouched` が false のため監査ログ経路に入らない、または `maybeAppendCommentIngestLog` が間引きで `null` | 一時ログ（下記）で (b) 相当の出力と照合 |

## 一時デバッグ（任意）

### (a) `storage.onChanged`（例: `background.js` の末尾に一時追加）

Service Worker の Console で更新を見る。SW が止まっている間はログは出ないが、**ストレージの値は更新されたまま**。

```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.nls_comment_ingest_log_v1) {
    const ch = changes.nls_comment_ingest_log_v1;
    console.log('nls_comment_ingest_log_v1 更新', {
      items数: ch.newValue?.items?.length ?? 0
    });
    console.table(ch.newValue?.items?.slice(-3) ?? []);
  }
});
```

### (b) `persistCommentRowsImpl` 内（`const src = ...` の直後に挿入・`const src` は二重に書かない）

```js
console.group('persistCommentRowsImpl → 監査ログ追加');
console.log('storageTouched:', storageTouched, 'pendingTouched:', pendingTouched);
console.log('source:', src, 'batchIn:', rows.length, 'added:', added.length, 'totalAfter:', next.length);
console.groupEnd();
```

ログは **watch タブの DevTools（コンテンツスクリプトコンテキスト）** に出る。

## 最小再現（Console スニペット）

ストレージ経路とスキーマだけを切り離して試す。実行コンテキストは上記と同じ（拡張コンテキスト）。

```javascript
(async function testIngestLogWrite() {
  const LOG_KEY = 'nls_comment_ingest_log_v1';
  const TEST_CAP = 20;

  const result = await chrome.storage.local.get([LOG_KEY]);
  const current = result[LOG_KEY] || { v: 1, items: [] };

  const newRow = {
    t: Date.now(),
    liveId: 'lv99999999',
    source: 'debug_test',
    batchIn: 10,
    added: 5,
    totalAfter: 105,
    official: 2
  };

  const newItems = [...current.items, newRow].slice(-TEST_CAP);
  await chrome.storage.local.set({ [LOG_KEY]: { v: 1, items: newItems } });

  const verify = await chrome.storage.local.get([LOG_KEY]);
  console.log('verified last', verify[LOG_KEY]?.items?.at(-1));
})();
```

単体テストは `src/lib/commentIngestLog.test.js` を参照。

## 製品 UI について

監査ログのコピー・消去はポップアップの **「詳しい状況（開発・切り分け用・折りたたみ）」** 内のボタンから行う。常時バッジは出ない。
