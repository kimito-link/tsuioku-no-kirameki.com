# ディープリサーチ統合（司令塔が一次裏取り）: 多タブ storage 競合の快適化

deep-research ハーネス（6角度・16ソース・71主張→25検証・3票敵対検証）+ 司令塔の実コード突合。
生データ: tasks/wll95h6zi.output。会議統合の前段: council/multitab-display-fix-SYNTHESIS.md。

## 一次裏取りで「確定(3-0)」したこと

1. **chrome.storage.local はトランザクション/原子性なし**（Chrome公式docs + Chromium DevRel）。
   - ⚠ただし「clobber(データ消失)」と本件「popup read timeout→カード—固着」は**別機序**。後者は
     LevelDB deserialize + 二重IPCシリアライズ + 重い write トラフィックによる**レイテンシ/詰まり**。
     **no-transaction が —固着の THE 原因だと一次ソースは立証していない**（→ 測ってから直す）。
2. **Web Locks(navigator.locks) が単一書き手/リーダー選出の世界標準**。exclusive で直列化、
   ifAvailable(即時失敗→null)/signal(AbortSignalでタイムアウト)/steal で**非ブロッキング取得**。
   RxDB・pubkey/broadcast-channel が「Web Locks主・メッセージ式フォールバック」で実装（一次確認）。
3. **★最重要の落とし穴（適用の鍵）**: Web Locks は **per-origin**。content script は**ホストページ
   origin(live.nicovideo.jp)**、popup/SW は **chrome-extension:// origin** で動く=**別オリジン**。
   → **content タブが取った Web Lock は popup を排他しない。** 調整は同一オリジン内に閉じる必要。

## 敵対検証で「却下(誤り)」されたこと＝作らない

- ❌「DevRel公式が IndexedDB移行を推奨」(0-3) → 公式の唯一解ではない。会議の中心案の論拠は薄い。
- ❌「Web Locks が write を native に coalesce する」→ exclusive は**直列化するだけ**。N書込を1つに
  畳むのは**アプリ側の debounce/batch が別途必要**。
- ❌「StorageManager.estimate / structured clone回避 等の"意外な最適化"」→ **今回の生存主張に一次裏取り
  が無い＝未検証**。"こんな方法があったのか"枠として安易に実装しない（裏取りできた範囲で実装する）。

## 実コード突合（司令塔）

- popup も content も **`commentsStorageKey(lv)` で同じ `chrome.storage.local` を直接 read/write**
  （popup-entry:6143/13441・content-entry の persist 群）。= 単一 LevelDB を両者が叩く。
- リーダー選出(`runIfTabLeader`/tabLeaderLock.js)は **content↔content(page origin) で既に稼働**
  （fetch/scrape/backfill を1タブ化済み=PR0-3 master入り）。**popup は別オリジンなのでこの輪に入れない**
  （リサーチの落とし穴と完全一致）。
- IDB+Offscreen 単一書き手は **封印済み**（FORCE_DISABLE_COMMENT_IDB_PATH=true・SW idleで死ぬ）。

## 結論＝研究に沿った「快適化」の正しい順序

リサーチが示す通り、**まず測る→各オリジン内で write coalesce + read cache（ロック不要・低リスク）**を入れ、
**cross-origin の単一書き手(Web Lock+メッセージブリッジ)は最後**（封印済みの轍を踏まないよう慎重に）。

### PR4-0【測定・極小リスク・挙動不変】★研究の openQuestion への回答を先に取る
- popup の refresh と content の persist に「storage get/set 所要ms・回数・サイズ」の軽量計測を仕込み、
  status の既存 paintPerf/fastDiag 同様に**間引き保存**。多タブ実機で「read詰まり vs write過多」どちらが
  律速かを**数値で確定**してから次へ（リサーチ: 一次ソースは原因未特定＝推測実装を避ける）。

### PR4-a【write coalesce + 不要 re-read 削減・低リスク・記録不変】
- content の comment 書き込みを **debounce/batch coalesce**（同一 lv の連続 set を間引く・マージ内容は不変）。
  ＝研究が「Web Locks では畳めない、アプリ側で必須」と明言した部分。
- 保存時の付随 re-read（KEY_AUTO_BACKUP_STATE 等の毎回読み）を削る。
- 純関数 `src/lib/storageWriteCoalesce.js`（新規・vitest）。**ロックは使わない**（同一オリジン内の自タブ直列化で十分・
  cross-origin 問題を持ち込まない）。

### PR4-b【popup hot-read の in-memory TTL cache + onChanged invalidate・低〜中】
- popup refresh の多並列 get に **read-once + in-memory TTL cache**（公式docsの preload パターン・2-1で確認）+
  **onChanged で invalidate**（docsには無いがコミュニティ標準＝慎重に自前）。3秒poll を「変化時のみ描画」に。
- popup は storage read を **ifAvailable 的に"待たない"**＝詰まったら前回キャッシュを出す（—固着を出さない）。
- 純関数 `src/lib/ttlReadCache.js`（新規・vitest）。

### PR4-c【cross-origin 単一書き手・高リスク・任意・最後】
- どうしても write 競合が残るなら、**書き込みを SW/拡張オリジン経由のメッセージ1経路に funneling** し、
  拡張オリジン内で Web Lock 直列化（content の page-origin ロックは popup を排他しないため、ここで初めて
  メッセージブリッジが要る）。⚠封印済み Offscreen+SW-idle の轍に注意＝PR4-a/b で足りれば**やらない**。

## DoD / 守るもの
- 既存 e2e `tests/e2e/multitab-storage-contention.spec.js`（4タブ+inline・stall注入）が GREEN。
- verify:cc 全8緑。console副作用禁止(v0.1.422教訓)。記録の心臓部(merge/dedupe)は不変。
- 各段で実機（多タブ→popup/status が—固着しない・記録が落ちない）を確認してから次へ。

## 出典（一次中心）
- https://developer.chrome.com/docs/extensions/reference/api/storage （no-transaction・preloadパターン）
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/y5hxPcavRfU （DevRel: not ACID）
- https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request （exclusive/ifAvailable/signal/steal）
- https://github.com/w3c/web-locks/blob/main/EXPLAINER.md （per-origin scope=落とし穴の根拠）
- https://rxdb.info/leader-election.html / https://github.com/pubkey/broadcast-channel （実装事例）
- https://nolanlawson.com/2021/08/22/speeding-up-indexeddb-reads-and-writes/ （IDB最適化・参考）
