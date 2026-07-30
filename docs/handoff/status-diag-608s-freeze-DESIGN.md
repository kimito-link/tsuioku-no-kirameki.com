# 設計書 — 診断ページ608秒級固まりの根治

- 設計: Fable(claude-fable-5サブエージェント) / 裏取り・統合: 司令塔(Claude Code) / 素材: 会議ハーネス(4モデル)
- 日付: 2026-07-14
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物

## 背景・実測値

6配信同時記録・累計コメント32,979件という大規模状態のとき、診断ページ(status.html)が真っ白のまま608秒(10分)級で固まる。
```
更新所要(計器): 608277ms(重い順: summaries×1 229960ms / lives 197068ms / fastDiagLite 178988ms)
```
過去(2026-07-04・9,400コメント/1配信)の同型問題への緩和策(v0.1.1062: バックオフ天井120秒+3秒有界化degrade)はあるが、今回はそれでも防げていない。

## 真因(実コード裏取り確定)

1. `runStorageOpWithTimeout`(`src/lib/storageOpTimeout.js`)は`Promise.race`でtimeout側が先にrejectしても、`opFn()`自体(実際のchrome.storage.local.get)は裏で実行され続ける「幽霊read」を生む。abortする仕組みは無い。
2. コア5read(lives/summaries/fastDiagLite/popupDiag/backfillProgress)にin-flightガードが無い。
3. コアreadの実処理自体は軽い設計(O(配信数)止まり)。229秒/197秒/179秒という重さは関数ロジックではなくchrome.storage.local(単一LevelDB)側のI/O自体が詰まっていることを示す。
4. 実測値「summaries 229960ms」は、timeoutでrejectされたのではなく`opFn()`自体が実際に229秒かけてresolveした、ということ。8秒タイマーが裏タブ化によりスロットリングされ発火しなかった可能性が高い。
5. timeout rejectで`refresh()`全体が丸ごとcatchへ落ちる(コア5readに`.catch()`が無い)。
6. `_refreshInFlight`ガードは幽霊readを塞き止めない。次のrefresh tickが同じ関数を再度呼び、前回の幽霊readと新規readが同じLevelDBに対して多重に競合する。
7. **【却下事実】IndexedDB化(`_commentIdbEnabled`)は既に試して実機破綻した過去がある**: `content-entry.js:10432-10437`の`FORCE_DISABLE_COMMENT_IDB_PATH = true`は2026-06-01に「SW idle停止でappendが成立しない」実機破綻を受けて意図的に殺した経路。会議で複数モデルが「IndexedDB強制有効化」を提案したが、これは再訪不可。

## 設計(Fable)

### A. 理想の状態
6配信同時記録+backfill走行でLevelDBが数百秒級にstallしても、診断ページは(1)真っ白にならない(2)重ければ古い値のまま正直に表示する(3)診断が記録を妨げない(4)自己回復する(5)タイマーに命綱を預けない(Date.now壁時計ベース)。

### B. 統合アーキ
| ファイル | 変更 |
|---|---|
| `src/lib/storageOpTimeout.js` | 既存`runStorageOpWithTimeout`は無変更。新export`startStorageOpWithTimeout`追加(race/op両方返す) |
| `src/lib/inFlightGuard.js` | 既存`createInFlightGuard`は無変更。新export`createStaleGuardedRead`追加(stale-while-revalidate) |
| `src/extension/status-entry.js` | コア5readを新ガード5本に置換。refresh()はコアreadで二度とthrowしない |

### C. 具体機構(詳細は本ファイルの元Fable回答参照・実装時に再取得)

**C-1**: `storageOpTimeout.js`に`startStorageOpWithTimeout(opFn, timeoutMs, sentinel)`を追加。`{ race, op }`を返す。

**C-2**: `inFlightGuard.js`に`createStaleGuardedRead(opFn, options)`を追加。in-flight中は新規read発行せずlast-goodをstale供給、幽霊のresolveをharvestしてlast-good更新、seqガードで逆転上書き防止、60秒天井で強制reissue。

**C-3**: `status-entry.js`にコア5ガード(`_livesGuard`等)をモジュールスコープに追加、`refresh()`内のコア5readをガード経由に置換、鮮度表示(`⏳N秒前の値`/`⚠混雑が長引いています`)を追加。

### D. 偽陽性潰し
「in-flightガードが利きすぎて診断が古い値に固着する」を4層で防止: (1)幽霊harvestで自動回復 (2)reissue天井60秒で固着保険 (3)seqガードで逆転上書き防止 (4)鮮度の可視化(ヘッダー+stepMsラベルの`(stale)`)。

### E. MVP
`createStaleGuardedRead`新設+コア5readへの適用のみで1パッチ。真っ白の直接原因(timeout→catch転落)と固まりの増幅器(幽霊read多重競合)の両方が同時に切れる。

### F. 捨てた案
1. IndexedDB強制有効化 — 却下(過去に実機破綻して意図的に殺された経路)
2. コアread1バッチ化 — 今回見送り(単発getが229秒かかる事実に効かない・利得小)
3. 本物のAbortController — 不採用(chrome.storage.local.getにabort APIが存在しない)
4. `runStorageOpWithTimeout`自体の改造 — 不採用(書き込み側30箇所の生命線・新export追加で同じ目的達成)
5. stale時のrenderAllスキップ — 今回不採用(v0.1.1140のrenderAll内訳計器の実測を見てから判断)
6. timeout短縮 — 不採用(正常readまでstale化する)

### G. 地雷と回避策
1. 書き込み側(content-entry.js)への波及ゼロを`git diff --stat`で確認(対象3ファイル+テストのみ)
2. 既存テスト(inFlightGuard.test.js等)は対象コード無変更なので無変更で緑のはず
3. 幽霊opのunhandled rejectionを`.catch(() => {})`で必ず握る
4. `_statusLastErrorText`のクリア条件変更(stale時は保持)の実機確認必須
5. タイマースロットリング前提を忘れずDate.now()比較のみに依存させる
6. 検証はreality-checkerに委任。実機確認は「1.5秒以内描画/(stale)表示/混雑解消後の鮮度回復/AI共有コピペへの反映」の4点
