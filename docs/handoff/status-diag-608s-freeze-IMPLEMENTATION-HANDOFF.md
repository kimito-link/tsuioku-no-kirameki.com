# 実装ハンドオフ — 診断ページ608秒級固まりの根治

正本設計: [status-diag-608s-freeze-DESIGN.md](status-diag-608s-freeze-DESIGN.md)

**重要**: このファイルの詳細差分(C章のbefore/after完全版)は、設計を行ったFableサブエージェントの応答(セッション内)にある。実装開始時は、まず正本設計のC章に書かれた行番号・関数名を実際のコードと突き合わせて裏取りし、差分が古くなっていないか確認してから着手すること。

## スコープ(MVP)

1. `src/lib/storageOpTimeout.js`に`startStorageOpWithTimeout(opFn, timeoutMs, sentinel)`を追加(既存`runStorageOpWithTimeout`は1バイトも変えない)
2. `src/lib/inFlightGuard.js`に`createStaleGuardedRead(opFn, options)`を追加(既存`createInFlightGuard`は無変更)
3. `src/extension/status-entry.js`のコア5read(lives/summaries/fastDiagLite/popupDiag/backfillProgress)を新ガード経由に置換。timeoutでもrefresh()がthrowしなくなり、last-good(直近成功値)をstale供給する設計に変える
4. 鮮度表示(`⏳N秒前の値(混雑中・裏で読み直し中)` / `⚠N秒前の値(混雑が長引いています・記録は継続中)`)をヘッダーに追加
5. `_mark`のラベルに`(stale)`を付ける(既存のstepMs配線に相乗りするだけで、AI共有テキストのコピペにも自動で出る)

## 着手手順(TDD)

1. ブランチを切る(例: `perf/status-stale-guarded-read`)
2. `src/lib/storageOpTimeout.test.js`に`startStorageOpWithTimeout`のテストを追加(raceがsentinel rejectしてもopは後からresolveできる/timeoutMs≤0でrace===op)→ 実装
3. `src/lib/inFlightGuard.test.js`に`createStaleGuardedRead`のテストを追加(in-flight中はstale即返し・harvest後のlast-good更新・seq逆転防止・60秒天井reissue・hadData:false初回)。`vi.useFakeTimers()`使用時はunhandled rejectionを防ぐため`.catch()`を先に付ける作法を守る → 実装
4. `status-entry.js`のコア5readをガード経由に置換
5. 鮮度表示・`_statusLastErrorText`のクリア条件変更を適用
6. `npm run verify:cc`を実行し全緑を確認
7. `git diff --stat`で変更が`src/lib/storageOpTimeout.js`・`src/lib/inFlightGuard.js`・`src/extension/status-entry.js`(+テスト2ファイル+dist)のみであることを確認。`content-entry.js`/`venueBar.js`/`comeview-entry.js`のdiffがゼロであることが「書き込み側・会場側への波及ゼロ」の証明
8. version bump(3点セット)+`npm run copy:ext`

## 機械的な完了判定

- `npm run verify:cc`全緑
- 実機確認(reality-checkerに委任): (1) 6配信+backfill中にstatus.htmlを開いて1.5秒以内に何か描画される (2) ヘッダーに`(stale)`と`⏳◯秒前の値`が出る (3) 混雑解消後に⏳が消えて鮮度が戻る (4) AI共有コピペのstepMsに`summaries×N(stale)`のような表記が写る

## 地雷(正本設計Gから再掲)

1. `content-entry.js`/`venueBar.js`/`comeview-entry.js`には一切触れない(書き込み側・会場側は無関係のはずで、diffが出たら設計違反のシグナル)
2. `runStorageOpWithTimeout`本体は無変更(書き込み側30箇所の生命線)
3. 幽霊opの`.then().catch(() => {})`を忘れずunhandled rejectionを防ぐ
4. IndexedDB化(`_commentIdbEnabled`/`FORCE_DISABLE_COMMENT_IDB_PATH`)には絶対に触れない(2026-06-01に実機破綻して意図的に殺された経路)
5. 検証エージェント(reality-checker)実行中はcommitしない([[reality-checker-stash-detaches-head-2026-07-07]])

## 次に必要な作業

実装は次チャット、または別モデルへ委譲してよい。着手時はこの1枚と正本設計、必要なら本セッションのFable応答(会話履歴)を参照すること。
