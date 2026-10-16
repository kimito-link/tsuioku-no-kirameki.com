# 小さな storage 読み出しの一括化(storage get batching)— 設計+実装ハンドオフ(2026-10-16)

> 設計=司令塔(実測つき・先行事例=DataLoader 方式) / 実装は【まだしていない】。実験は scripts/perf-ab/boot-profile.mjs の `--gets batch`(製品は変えない)。
> 関連(却下済み・再提案しない): [boot-quiescence-DESIGN-and-HANDOFF-2026-10-16.md](boot-quiescence-DESIGN-and-HANDOFF-2026-10-16.md)(回数を畳む案は効かなかった)。

## 事実(実測・実配信 lv351605203・起動8秒・各4回の交互測定)
- 起動8秒の chrome.storage.local.get 約 460〜540 回のうち小さな読み(≤20KB)が約 350 回。paint 末尾の各 async(refreshOfficialEventDomBundle / refreshGiftRankStrip / refreshGiftRankingFetchPrompt / refreshBackfillRecordCardHint / refreshRecordingRecoveryHint / refreshNorthStar*Lane / resolveBroadcasterProfileModel …)が 1 キーずつ別 get している(popup-entry.js の各所・refresh は 8 秒で約 10 回)。
- 同じ時刻に束ねた場合の見積もり(呼び出し時刻のクラスタ数): 窓 2ms で 139 / 5ms で 121 / 20ms で 85(349 本から)。
- 窓5ms の束ね実験(boot-profile --gets batch・大きなキーは束ねず素通し): **gets 459/513/535/489 → 91/111/102/131(−78%)**、task 6473/5866/4972/4624ms → 4083/4640/4152/4825ms、BUSY 83/75/63/60% → 53/60/53/62%、タイル数は同じ(492〜494)。中央値で task 約 −1.0 秒(約 −18%)・BUSY 約 −12 ポイント。ばらつきが大きい(ベースライン自体が 4.6〜6.5 秒)ので、実装後に同じ手順で n≥6 の再測定が必要。
- 目的: 重さの主因候補(storage の読み出しの本数とその待ち)を、読み出しの【中身を変えずに】本数だけ減らす。

## 設計(最小・既製の型)
先行事例: DataLoader(同じ tick の呼び出しを1回にまとめ、結果を各呼び出し元に配る)。新概念は持ち込まない。
- 新規 `src/lib/storageGetBatcher.js`(L0・I/Oは注入): `createStorageGetBatcher({ get, setTimer, windowMs = 5, isBigKey })` → `batchedGet(keys)`。
  - 対象: 引数が文字列 or 文字列配列で、コールバックなし。**大きなキーが1つでも含まれる呼び出しは束ねず素通し**(大きな読みが小さな読みを待たせない)。`get({k: default})` 形式も素通し。
  - 窓内の呼び出しを集め、キーの和集合を1回 get → 各呼び出し元には【自分が要求したキーだけ】を返す(存在しないキーは含めない=元の `chrome.storage.local.get` と同じ意味)。
  - ★同じキーを2つ以上の呼び出し元が要求したら、2人目以降には structuredClone を渡す(同じ配列/オブジェクトを共有すると、片方の破壊的変更がもう片方に漏れる)。
  - get が reject したら、束ねた全員に流さず、各呼び出しを個別に再実行(元の挙動=失敗は自分だけ)。
  - フラグ `STORAGE_GET_BATCH_ENABLED`(false で素通し=旧経路)・`STORAGE_GET_BATCH_WINDOW_MS = 5`。
- `isBigKey` の正本: 実測で大きかったキー群の正規表現を1か所に(実験の BIG と同じ: nls_comments / nls_cchunk / nls_ctail / nls_user_comment_profile / nls_calibration / nls_comment_ingest_log / nls_watch_snapshot / nls_lane_mirror / nls_comment_timeline)。★新しい大きなキーが増えたら足す(漏れても正しさは壊れず、効果が落ちるだけ)。
- 配線(popup-entry.js・最小): 【どちらかを選ぶ】(a) モジュール先頭で popup 文書内の `chrome.storage.local.get` を batchedGet に差し替える(差分が最小・暗黙)/(b) 明示的に paint 末尾の小さな読み 約20か所を `batchedLocalGet(...)` に置換(差分は大きいが明示的)。推奨は (a) をフラグ付きで(撤回が1行)。他の文書(content/SW)には適用しない。
- 守る不変条件: 読み出しの内容・結果の形を変えない/書き込み(set/remove)には触れない(読み取りだけ)/記録経路のキー(ctail/comments_/cchunk/csummary/IndexedDB)の読みは大きなキー扱いで素通し/窓による遅れは最大5ms。

## 地雷
- 結果オブジェクトの共有(上記 structuredClone)。
- `storageKeyMemo`(v1630)の absorbBag/onChanged の version 照合は get の戻りを使う: 戻りの形が同じなので影響なしのはずだが、wiring テスト(bootReadBudgetWiring)が読む文字列(`chrome.storage.local.get(`)を壊さないこと。
- `withTimeout(chrome.storage.local.get(...), N)` の呼び出し側は、束ねによる最大5ms の遅れを含めてもタイムアウトに影響しない(最小のタイムアウトが 1,200ms)。
- `readStorageBagWithRetry` など再試行ラッパは、束ねの reject→個別再実行と二重に再試行しない(リトライは呼び出し側に任せ、バッチャは reject 時に個別に1回だけ)。
- popup-entry.js の max-lines: 現行 21,815 行/上限 22,096(余裕 約280行)。配線は (a) なら数行。
- 既存テストが `chrome.storage.local.get` の文字列を数える箇所(storageFullReadCensus.test.js など)を確認してから触る。

## 完了判定(同じ配信・`--ext` で OFF/ON を交互に n≥6)
| 指標 | 合格 |
|---|---|
| 起動8秒の get 回数 | 約 500 → ≤150 |
| BUSY% / task ms の中央値 | 悪化しない・実験の傾向(−12pt / −1s)が再現 |
| タイル数・描画結果 | 同数以上・`npm run test:cc`/`verify:cc` 緑 |
| フラグ false | 旧経路の数字に一致 |
| 実機(長時間) | 状態速報の `unknown` 描き直し・起動直後の遅延が悪化しない。体感の黒/縞は補強のみ |
