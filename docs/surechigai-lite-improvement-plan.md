# すれちがいライト知見の取り込み計画（追憶のきらめき）

最終更新: 2026-04-13  
目的: 新機能追加より先に、既存コードの信頼性・運用性・保守性を改善する。

---

## ディープリサーチ結果（現状）

### 1) ストレージI/Oの堅牢性がファイルごとに不統一
- `src/lib/userCommentProfileCache.js` には `readStorageBagWithRetry()` があり、起動直後の `chrome.storage.local.get` 失敗に対応済み。
- 一方で `src/lib/devMonitorTrendSession.js`、`src/lib/broadcastSessionSummaryFlush.js` は単発 `get/set` が残っており、失敗時に握りつぶしが多い。
- `src/extension/content-entry.js` / `src/extension/popup-entry.js` では一部 `readStorageBagWithRetry()` 利用済みで、採用方針が混在している。

### 2) catch の文脈ログが不足
- `src/lib/broadcastSessionSummaryFlush.js` に無言 catch が存在し、障害時の原因追跡が難しい。
- `src/lib/devMonitorTrendSession.js` でも storage 周辺で catch が silent になっている。
- `src/extension/content-entry.js` は「best-effort no-op」が大量にあり、すべてをログ化するとノイズ過多になるため、優先モジュールを絞って段階導入が必要。

### 3) スロットリングの実装が二重管理
- `src/lib/devMonitorTrendSession.js` では `_lastChromeTrendPersistMs` / `_lastSessionTrendAppendMs` を個別管理。
- `src/lib/persistThrottle.js` に共通化可能な `createPersistCoalescer()` があるため、設計統一の余地あり。

### 4) タブ復帰時の再走査は「短いデバウンス」はあるが長めガードがない
- `src/extension/content-entry.js` の `onTabVisibleForCommentHarvest()` は 850ms デバウンスあり。
- ただし「短時間での visible 切り替え連打」を抑える 30 秒級の冷却時間は未導入。

### 5) コメント本文の上限未設定
- `src/lib/commentRecord.js` の `normalizeCommentText()` は整形品質が高いが、最大長制限がない。
- 長文連打時のストレージ肥大化・重複判定コスト増につながるリスクがある。

### 6) キャッシュは件数LRU中心で、時間TTLがない
- `src/lib/userCommentProfileCache.js` は `updatedAt` を保持し件数上限で prune している。
- ただし時間ベースの失効（TTL）がなく、古いプロフィールが残留しやすい。

---

## 実装方針（段階導入）

### Phase 1: 低リスク・即効（先行）
1. 例外ログの文脈付与（対象限定）
2. `readStorageBagWithRetry()` の横展開
3. コメント本文の最大長制限

### Phase 2: 中リスク・高効果
4. `userCommentProfileCache` に TTL 導入
5. タブ復帰時の 30 秒ガード追加

### Phase 3: 設計統一
6. `devMonitorTrendSession` のスロットリングを共通化（`persistThrottle` 利用）
7. 必要に応じて metrics/log 連携を追加

---

## TODO（実施チェックリスト）

### [P0] 先に着手
- [x] `src/lib/broadcastSessionSummaryFlush.js` の silent catch を文脈付きログへ変更（`[broadcastSessionSummaryFlush]` プレフィックス）。
- [x] `src/lib/devMonitorTrendSession.js` の silent catch を文脈付きログへ変更（quota/private mode は debug レベル相当コメントで区別）。
- [x] `src/lib/broadcastSessionSummaryFlush.js` の `chrome.storage.local.get` を `readStorageBagWithRetry()` 経由に統一。
- [x] `src/lib/devMonitorTrendSession.js` の chrome storage read を `readStorageBagWithRetry()` へ置換（既存JSON互換維持）。
- [x] `src/lib/commentRecord.js` に `COMMENT_TEXT_MAX_CHARS` を導入し `normalizeCommentText()` の最後で `slice`。
- [x] `src/lib/commentRecord.test.js` に「最大長超過で切り詰め」テストを追加。

### [P1] 次に実施
- [x] `src/lib/userCommentProfileCache.js` に TTL 定数（例: 30日）を追加し、`normalizeUserCommentProfileMap()` または prune 経路で期限切れを除外。
- [x] `src/lib/userCommentProfileCache.test.js` に TTL 失効テストを追加（有効・期限切れ・境界時刻）。
- [x] `src/extension/content-entry.js` の `onTabVisibleForCommentHarvest()` に `lastVisibleRefreshAt` を追加し、30秒未満では deep harvest を抑制。
- [x] `src/extension/content-entry.js` の visible 復帰ガードに対するユニット/統合テスト方針を追加（少なくとも手動確認手順を doc 化）。

### [P2] 設計統一
- [x] `src/lib/devMonitorTrendSession.js` の `_lastChromeTrendPersistMs` / `_lastSessionTrendAppendMs` を共通 throttler へ寄せる設計案を作成。
- [x] `src/lib/persistThrottle.js` の API 拡張要否を確認（liveIdごとの粒度制御が必要か）。
- [x] `src/lib/devMonitorTrendSession.test.js` を維持しつつ共通 throttler 版に移行（既存の「連打しても増えない」性質を保証）。

### [運用TODO]
- [ ] ログ方針を明文化（`warn`/`error`/silent の基準）して docs に追記。
- [ ] 実ブラウザで「拡張再読み込み直後」「storage失敗注入」「タブ切替連打」の再現確認を行う。
- [ ] 改善後に `npm test`（関連テスト）と lints を実行し、退行がないことを確認。

---

## P1 手動検証手順（visible 復帰30秒ガード）

### 前提
- 記録を ON にした状態で `watch` ページを開く。
- コメント欄が表示される配信で確認する（deep harvest が実行可能な状態）。

### 手順
1. タブを非表示にして 1 秒以内に戻す操作を 3 回以上繰り返す。  
2. DevTools の Performance またはログ出力で `runDeepHarvest` 相当の重い処理が連続起動しないことを確認する。  
3. 30 秒以上待ってから再度タブを戻し、1 回だけ再走査が走ることを確認する。  
4. 記録 OFF / liveId 不在 / コメント記録不可条件でも、復帰時に harvest が起動しないことを確認する。  

### 期待結果
- 30 秒未満の visible 連打では deep harvest が追加実行されない。  
- 30 秒経過後の復帰では通常どおり 1 回実行される。  
- 既存の 850ms デバウンスと競合せず、UI 操作遅延やコメント取りこぼし悪化がない。  

### 補足（将来の自動テスト方針）
- `onTabVisibleForCommentHarvest()` を薄いラッパにして、時刻依存ロジックを純関数化すれば単体テストしやすい。  
- `nowMs`, `lastRunAt`, `recording`, `liveId`, `visibilityState` を入力に持つ `shouldRunVisibleHarvest()` を追加する方針が安全。  

---

## 受け入れ条件（Definition of Done）

- 対象モジュールの無言 catch が、少なくとも「原因切り分け可能な文脈ログ」に置換されている。
- `readStorageBagWithRetry()` が新規対象モジュールで利用され、単発 `get` 失敗時でも空配列/空オブジェクトにフォールバックできる。
- コメント本文長の上限がコードとテストで固定化されている。
- プロフィールキャッシュに TTL が入り、期限切れデータが自然に除去される。
- タブ復帰連打で deep harvest の過剰実行が発生しない（30秒ガード）。
- 関連テスト・lint が通る。

---

## 実装順（推奨）

1. P0 を1PRで実施（小さく確実）
2. P1 を2つに分けて実施（TTL / visibleガード）
3. P2 を最後に実施（設計差分が大きいため）

---

## P2 設計メモ（共通 throttle 化）

### 目的
- `devMonitorTrendSession` 内で重複している時刻管理（`_lastChromeTrendPersistMs` / `_lastSessionTrendAppendMs`）を共通化し、実装の散逸を防ぐ。

### 候補
- A案: `persistThrottle.js` に key 単位 throttler（`createKeyedThrottle`）を追加  
- B案: `devMonitorTrendSession` 内に専用ヘルパーを作る（外部公開なし）  

### 推奨（段階導入）
- まず B案で `shouldPassThrottle(map, key, minMs, nowMs)` を導入し、既存テストを維持。  
- その後、他モジュールでも同パターンが増えた時点で A案へ昇格（`persistThrottle.js` へ集約）。  
- 現時点では `devMonitorTrendSession` ローカルヘルパーで十分で、`persistThrottle.js` の API 追加は見送り。  

### 実装TODO（P2着手時）
- [x] `src/lib/devMonitorTrendSession.js` にローカルヘルパー `shouldPassThrottle(...)` を追加。  
- [x] `_lastChromeTrendPersistMs` / `_lastSessionTrendAppendMs` の判定分岐をヘルパーへ置換。  
- [x] `src/lib/devMonitorTrendSession.test.js` の既存ケース（連打抑制・間隔後追加）を維持しつつリファクタ後の回帰を確認。  
- [x] 必要であれば `src/lib/persistThrottle.js` に key 単位 API を追加する設計レビューを実施。  

