# コメント取得 品質改善 調査レポート

Claude Code による静的解析結果（2026-06-01）

---

## 優先度：高（取りこぼし）

### 1. WebSocket再接続時のdedupe初期化漏れ
- **ファイル**: `src/extension/page-intercept-entry.js:404,422`
- **問題**: `_ndgrDedupe.resetForLive()` は起動時のみ呼ばれる。WS再接続時にNDGRサーバーが過去ログを再送（BackwardSegment）するが、dedupeマップが初期化直後のため重複コメントが通過する
- **修正方針**: WS `close` イベントリスナーで再接続検知し、`resetForLive()` を再実行 or incremental flush

### 2. commentNo欠落時のdkey granularityが秒単位
- **ファイル**: `src/lib/commentRecord.js:75-84`
- **問題**: commentNoが取れない場合のdedupeキーが `liveId||text|秒|userId` の秒単位。同秒内に別ユーザーが同テキストを投稿すると片方が消える
- **現コード**:
  ```js
  const sec = Math.floor(Number(rec.capturedAt || 0) / 1000);
  return `${liveId}||${text}|${sec}|${uid}`;
  ```
- **修正方針**: `capturedAt` をミリ秒精度に変更（`Math.floor(.../ 100)` で100ms単位にするだけでも大幅改善）、またはUUIDをfallbackキーに使用

---

## 優先度：中（速度）

### 3. IndexedDB書き込みが実質直列
- **ファイル**: `src/lib/commentDb.js:125-130`
- **問題**: `getKey(dkey).onsuccess` の中で `store.add()` を呼ぶパターン。バッチ100件でも getKey × 100回を直列待機
- **修正方針**: 全dkeyを先に `getAll` or `openCursor` で一括取得 → 重複除外 → 残りを一括 `add`

### 4. postMessageチャンクサイズが超大規模配信で不足
- **ファイル**: `src/extension/page-intercept-entry.js:111,113`
- **問題**: `NDGR_CHAT_ROWS_BATCH_MS=80ms`、`NDGR_CHAT_ROWS_POST_CHUNK=220行` → 上限約2750件/秒。3000件/秒超の配信でキューイング遅延が発生
- **修正方針**: チャンクサイズを動的調整（受信レート計測して自動拡張）

### 5. Fetch stream途中abort時のデータ損失
- **ファイル**: `src/extension/page-intercept-entry.js:924-950`
- **問題**: `reader.read()` がabortされた場合、`ldAcc` のpendingデータが破棄される。長時間NDGRストリームでメモリ圧迫時に発生しうる
- **修正方針**: `ldAcc.getStats().droppedBytes > 0` を検知したら再接続ロジックをトリガー

---

## 優先度：低

### 6. Fiber scan上限500件
- **ファイル**: `src/extension/page-intercept-entry.js:341`
- **問題**: `i < 500` の上限。超大規模配信で500人超のuserId補完がスキップされcommentNo欠落dkeyに落ちる
- **修正方針**: 上限を5000に拡張（ページレンダリング負荷と要トレードオフ確認）

### 7. NDGRデコードの未知フィールド対応
- **ファイル**: `src/lib/ndgrDecode.js:467`
- **問題**: `NDGR_KNOWN_MSG_FN = new Set([1, 8, 20, 24])` — niconico仕様変更で新fieldが追加されると無視される
- **修正方針**: n-air-app/nicolive-comment-protobuf を定期参照、fallback全試行ロジック強化

---

## 要約表

| 優先度 | ファイル | 行 | 問題 |
|--------|----------|----|------|
| 高 | page-intercept-entry.js | 404,422 | WS再接続でdedupe初期化漏れ |
| 高 | commentRecord.js | 75-84 | dkey秒単位granularityで誤dedupe |
| 中 | commentDb.js | 125-130 | IDB書き込み直列でバッチ効果薄い |
| 中 | page-intercept-entry.js | 111,113 | チャンクサイズ不足（3000件/秒超） |
| 中 | page-intercept-entry.js | 924-950 | stream abort時データ損失 |
| 低 | page-intercept-entry.js | 341 | Fiber scan上限500件 |
| 低 | ndgrDecode.js | 467 | 未知NDGRフィールド非対応 |
