# reference: パネル2万件フリーズ根治 v0.1.705 実装ブリーフ(会議確定・正本)

> 2026-06-13 設計会議(Fable3視点+Codex gpt-5.5)で全員一致確定。
> 司令塔がchrome-devtools-mcpで実機42k件再現+ソース読みで真因特定済み。

## 確定した真因

`refreshSupportActivityTimeline`(popup-entry.js:10438・応援タイムライン)が、
**details が閉じている(普段の action popup は既定で閉じ)のに毎refresh(最長3秒毎)無条件に**:
1. `readAllCommentsForLive(lid)` で全42,000件をメモリに読む(10482)
2. `applyUserCommentProfileMapToEntries` で42k件にO(N)プロファイル適用(10516)
3. `buildSupportActivityTimeline(comments, gifts, {limit:120})` で42k件をフルソートして先頭120件だけ返す(supportActivityTimeline.js:145)

→ renderUserRooms 内の `void refreshSupportActivityTimeline(lid)`(10751・fire-and-forget)から駆動。
devMonitor(14159)/storyAvatarDiag(13926)には「閉じてたら/スクロール中はskip」ガードがあるのに、
応援タイムラインだけガードが無い=これが2万件フリーズの本命。

## PR1(今回・即根治): ガード + 開時再描画 + epoch競合防止

### A. 早期returnガード(本丸)
`refreshSupportActivityTimeline` 冒頭で、body取得直後・click委譲リスナー配線(10447-10466)は通した**後**、
**`relocateSupportTimelineForStandaloneWindow()` を呼んでから**(Codex指摘=ガード前に呼ばないと明示的に閉じたstandaloneが下部へ移動しなくなる)、
`readAllCommentsForLive`(10482)の**前**に:
```js
if (details instanceof HTMLDetailsElement && details.open === false) return;
```
- 件数閾値は併用しない(全員一致=「開いてるのに途中までしか出ない」別退行を生む)。
- 別ウィンドウ(nl-popup-window)は wireSupportTimelineOpenPersistence(10578)で既定 open=true に hydrate 済み→ガードを自然通過し体験不変(下部常設の空白埋めを壊さない)。

### B. 開いた瞬間の再描画配線
既存 toggle リスナー(10593)内に1行追加(新規リスナーは張らない):
```js
details.addEventListener('toggle', () => {
  if (suppressSupportTimelineTogglePersist) return; // hydrate中は二重描画しない
  const open = Boolean(details.open);
  if (open) void refreshSupportActivityTimeline(watchPopupLastPaintedLiveId).catch(() => {});
  void storageSetSafe({ [KEY_SUPPORT_TIMELINE_OPEN]: open }).catch(() => {});
});
```
- liveId は既存の `watchPopupLastPaintedLiveId`(現在描画中のlv)を使う(ロジック重複を避ける・renderUserRooms が10751で更新済)。
- suppress中(hydrateによるopen=true復元)はrefreshを呼ばない=standaloneの初回は renderUserRooms 経由(10751)で1回描かれるので欠落しない。

### C. 非同期競合防止(epoch)= Codex指摘・lv切替/閉開閉の旧結果上書きを防ぐ
module スコープに `let supportTimelineRefreshEpoch = 0;` を追加。
- toggle close時に `supportTimelineRefreshEpoch += 1`(進行中の重い描画を無効化)。
- refreshSupportActivityTimeline 内、`readAllCommentsForLive`/profile読込のawait後・body.innerHTML代入の直前に:
  ```js
  if (myEpoch !== supportTimelineRefreshEpoch || !details.open || watchPopupLastPaintedLiveId !== lid) return;
  ```
  (関数冒頭で `const myEpoch = supportTimelineRefreshEpoch;` を取る)
- これでlv切替・閉開閉中に完了した旧refreshがDOMを上書きしない。

### D. 初期化順(Codex指摘)
現在 safeRefresh が先行→ `await wireSupportTimelineOpenPersistence()` を先に走らせてから初回refresh(standaloneのhydrate-open後に初回が走り閉状態の取りこぼし競合を消す)。該当箇所(20976付近)を確認して直す。

## ガード判定の純関数化(テスト用)
`src/lib/supportTimelineGuard.js` に `shouldRefreshSupportTimeline({detailsOpen, isStandaloneWindow})` を切り出す。
テスト(supportTimelineGuard.test.js):
- 'closed action popup returns false (skip heavy read)'
- 'open action popup returns true'
- 'standalone window default-open returns true'
- 'explicitly closed standalone returns false'

## 必須E2E(実機 or 手動)
- 閉じている間は大量コメント更新でも本文を再描画しない(フリーズ解消)
- 閉→開で最新120件を描画する
- 閉開閉中に完了した旧refreshを描画しない
- lv切替後に旧lvの非同期結果を描画しない
- ギフトのみ更新: 開いてれば🎁件数/pt が出る・閉じてれば集計が走らない
- 別ウィンドウ(standalone)は従来通り常設表示で埋まる

## PR2(別出し・今回やらない): 直近N件高速入口
別ウィンドウ(既定open)は開いてれば依然42k読む。limit=120しか使わないので
`readRecentCommentsForLive`(commentDb.js:203・既存)を再利用した tail-first reader を入口にすれば
開いてる時も軽くなる。ただし readAllCommentsForLive 全連結との見え方差分(古いコメント×ギフトの
時系列マージ)を実機照合してから。挿入順≒時刻順前提でDBスキーマ変更は別案件。**今回は触らない**。

## 壊さないもの
content-entry.js / buildSupportActivityTimeline(純関数・テスト有) / readAllCommentsForLive(他経路で使用)
