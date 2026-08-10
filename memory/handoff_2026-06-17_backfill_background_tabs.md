# 引き継ぎ: 裏タブ backfill + 記録停止 + status 重い (2026-06-17)

## 時系列(全部 master push 済み)
- **v0.1.795(a754f034)**: 全タブ裏で backfill が止まる真因(タイマー間引き)を SW alarm 駆動で根治。
  会議4役一致+裏取り。だが **既定 ON で出してしまった**(反省)。
- **v0.1.796(6630ca03)**: ⚠️ユーザー「v0.1.795 反映後にコメント記録が止まった」→ 自分の変更を疑い、
  背面 kick を【既定 OFF=opt-in】へ格下げ(記録保護)。content writeBackfillHeartbeat を _backfillBgKickEnabled
  で gate・SW runBackfillBgKickTick の enabled を ===true・lib 既定 enabled=false。
- **v0.1.797(8c83e549)**: ユーザー「status.html が重くて開かない」→ bootstrap の await refresh() で
  storage 混雑時に最大~32秒固まるのを、初回 timeout 1500ms+非 await+落ち着いた degrade 文言で解消。
  さらに maybeFoldSwBackfillStaging の10秒ごと get を OFF 時は live 1回 latch に戻す(記録 I/O 削減)。
  **chrome-devtools で storage 永久 stall を再現し『~1.5秒で混雑表示・固まらない』を実機検証済み+スクショ。**

## ✅ 確認できたこと
- status が重くて開かない → 直った(headless Chrome で検証)。
- 記録保護 → 背面 kick を既定 OFF にし、記録ホットパスの余計な storage I/O(hb 書き込み・index RMW・
  10秒 fold get)を全部止めた。既定状態は v0.1.794 とほぼ同じ記録挙動に戻したはず。

## ⚠️ まだユーザー実機確認が必要(これが「ちゃんと動いてる」の最後の関門)
**司令塔は実機の生 storage を読めない**(Claude-in-Chrome は chrome-extension:// 不可・chrome-devtools は
拡張なしの別 Chrome)。なので以下はユーザー報告 or web 版で確認するしかない:
1. **v0.1.797 を反映**(git pull→拡張リロード→放送ページ F5・popup/status ヘッダが 0.1.797)。
2. **記録件数が再び増えるか**(=v0.1.796/797 で記録が戻ったか)。
   - 増える → v0.1.795 が原因で確定・解決。task #4/#7 完了。
   - 増えない → v0.1.795 は無関係で【別の既存原因】。診断 JSON の running/stopReason/storage timeout で
     切り分け直す(記録停止の既存系統=v0.1.784/786 のような storage stall / ギフト RMW / 長時間の別要因)。
3. status を開いて「重くない・すぐ開く」も確認。

## 次の改善候補(goal の残り)
- **#6 裏タブ取得を記録を壊さず安全に再有効化**: 背面 kick を「SW crawl が記録 IDB append と競合しない」
  形に作り直して既定 ON に戻す。案=SW 側で記録(NLS_CDB_APPEND)処理中は crawl を yield/間引く・
  staging 書き込み頻度をさらに絞る・alarm 粒度を上げる・1度に1配信だけ。まず #4 で「v0.1.795 が
  本当に原因か」を確定してから(別原因なら再有効化してよい)。
- **#5 残り(貼らずに状態が分かる)**: status 軽量化は完了。記録停止/詰まりを popup/会場パネルに常時
  出す(status を開かなくても気づく)はまだ。
- **web 版で司令塔が状態を読む経路**: status の『スマホへ送信』→ app.tsuioku-no-kirameki.com/?v=token は
  https なので Claude-in-Chrome で開ける。ユーザーが1回押せば貼らずに司令塔が読める(次回試す)。

## 環境
- Windows+PowerShell。`npm run verify:cc`。1変更=patch1つ・changelog35字以内・manifest/package 同期。
- push hook が毎回再ビルド→dist の NL_BUILD_ID バッジが1サイクル遅れる(cosmetic・追わない)。
- 正本=memory/reference_backfill_background_tabs_meeting_2026-06-17.md。
