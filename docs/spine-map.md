# 🦴 コードの背骨マップ（データの一生・自動生成）

> `npm run feature-map` で再生成。手で編集しない（`--check` が verify:cc で腐りを検知）。
> 取得→記録→集計→表示の**背骨1本**。網羅でなく根幹だけ。視覚版: [spine-map.html](spine-map.html)。
> 🩸=段間を渡る storage キー(血管)。両側(producer/consumer)が居れば「つながっている」、
> 片側だけなら**断線の疑い**(値は作られたが届かない=過去の broadcaster バグ型)。

✅ 背骨の血管はすべて producer/consumer 両側がつながっています。

## 1. 📡 取得

NDGR(protobuf直読み)+watch DOM観測でコメント/ギフトを集める

担当ファイル:
- `src/extension/content-entry.js`
- `src/extension/page-intercept-entry.js`

次の段へ渡す血管(storageキー):
- 🟢 `KEY_AI_SHARE_FAST_DIAG` → 表示: 診断スナップショット(content→popup/status) — 書 src/extension/content-entry.js → 読 src/extension/popup-entry.js, src/extension/status-entry.js

  ↓

## 2. 💾 記録

IndexedDB / chunk / tail バッファへ永続化(記録本体)

担当ファイル:
- `src/extension/content-entry.js`
- `src/extension/offscreen-entry.js`
- `src/extension/backfill-sw-entry.js`

次の段へ渡す血管(storageキー):
- 🟢 `KEY_COMMENT_PANEL_STATUS` → 表示: 記録パネルの状態(content→popup) — 書 src/extension/content-entry.js → 読 src/extension/popup-entry.js
- 🟢 `fn:chunkIndexKey` → 表示: chunk 索引(content→popup) — 書 src/extension/content-entry.js → 読 src/extension/popup-entry.js
- 🟢 `KEY_BACKFILL_PROGRESS` → 表示: 過去ログ取得の進捗(sw/content→popup) — 書 src/extension/backfill-sw-entry.js, src/extension/content-entry.js, src/extension/popup-entry.js → 読 src/extension/popup-entry.js

  ↓

## 3. 🧮 集計

保存データ→応援レーン/会場/ランキング/プロフィールへ畳み込む

担当ファイル:
- `src/domain`
- `src/data`
- `src/lib`

次の段へ渡す血管(storageキー):
- 🟢 `KEY_USER_COMMENT_PROFILE_CACHE` → 表示: コメント者プロフィール(content→comeview/popup/venue) — 書 src/extension/content-entry.js → 読 src/extension/comeview-entry.js, src/extension/content-entry.js, src/extension/popup-entry.js, src/extension/venueBar.js
- 🟢 `KEY_LIVE_BROADCASTER_CTX` → 表示: 配信者本人の身元(content→venue)=過去の断線バグの経路 — 書 src/extension/content-entry.js → 読 src/extension/venueBar.js

  ↓

## 4. 🪟 表示

パネル(応援レーン)/会場/状態ページへ描く

担当ファイル:
- `src/extension/popup-entry.js`
- `src/extension/venueBar.js`
- `src/extension/status-entry.js`
