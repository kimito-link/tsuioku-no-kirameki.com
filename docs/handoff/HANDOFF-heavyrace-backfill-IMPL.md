# HANDOFF — heavyRace再発(大配信+backfill)の根治 実装ハンドオフ

> 段2(Fable設計)完了・2026-07-08。素材=`council/heavyrace-backfill-SYNTHESIS.md`(真因確定済み)。
> 実装は次段(別チャット)。**全行番号は 2026-07-08 の実コードで実読・裏取り済み**(popup-entry.js は行がずれやすいので、実装前に各節の「アンカー文字列」で grep して現在行を再特定すること)。
> 対象は**①拡張の描画層のみ**。③WEB丸写し・記録(content-entry)・②INLINE_PASSIVE は不触(§D参照)。

## 0. 症状と真因(要約・詳細はSYNTHESIS)

大配信7,900人+backfill進行中の embed_watch で、応援レーンが「サムネ無し(たぬ姉段)74件で固着」。
`heavyRaceReturns:11 / heavySettleState:"race" / entriesLen:307 / domTilesPainted:74`。

因果チェーン(実コードで確定):

1. **canReuse 永久不成立**: `canReuseHeavyChunkRead`(popup-entry.js:15645-15652)の実体 `cachedHeavyCoverageOk`(:15634-15640)は `cachedHeavy.arr.length >= Math.floor(currentChunkTotal * 0.8)`。backfill 中は total が秒単位で増える→race 時にキャッシュ(:16234)しても次 refresh で 80% を割る→毎回全件 re-read。
2. **read が追い越される**: 全件 read は大配信で5〜13秒。その間に次の refresh が `refreshGen` を進める(:14954)→heavy コールバック(:16226)が `refreshGen !== watchPopupRefreshGeneration`(:16230)で `bailHeavy(RACE)`(:16235)→`paintWatchPopupUi()`(:16270)に到達しない→settled が永遠に立たない。
3. **追い越しの主犯は poll でなく onChanged**: v1037 の poll 見送り(:21611-21612)は 3秒 poll しか守っていない。backfill 中は `nls_cdb_summary_/nls_ctail_/nls_cchunk_index_` が毎秒更新→`onStorageChanged`(:21482)→`scheduleCoalescedStorageRefresh`(:21509)→**450ms スロットル**(coalescedRefreshScheduler :17858-17860、lib=`src/lib/popupStorageRefreshCoalesce.js`)で `safeRefresh()` が回り続ける。ここに `heavyReadActive` チェックは**無い**。BroadcastChannel 経由(:21543-21545)も同様。さらに `readHeavyFromStoreGuarded`(:15702-15706)は single-flight でないため**同一 lv の全件 read が多重に走り得る**。
4. **たぬ姉固着の機序**: race で settled が来ない間、レーンは暫定(summary+tail 由来の短い候補)で描かれ続ける。暫定 entry は avatarUrl 未解決→tier<3→`pickStoryUserLaneCellDisplaySrc` が匿名 uid の HTTP を落とす(`src/lib/storyUserLaneDisplaySrc.js:49` `stripHttp = tier < 3 && isNiconicoAnonymousUserId(uid)`)→Identicon/TV=たぬ姉段。**一度良い描画(200+タイル)が出ても、次の暫定 paint(74件)が上書きして退化する**。

対策は3層。**A(描画単調性=即効)→B(canReuse成立=根治)→C(追い越し抑止=慎重)** の順に独立パッチで入れる。

---

## A. 描画単調性ガード(即効・最優先)

### 方針
既存 `shouldKeepStoryUserLaneTilesOnEmpty`(`src/extension/story/renderStoryUserLaneDom.js:96-105`)は「候補が**空**のとき既存タイルを畳まない」。今回はその**縮小版**を隣に足す:
「**同一配信で、supply が暫定(heavy 未settle)で、今回描く総タイル数が前回 DOM 実タイル数より大幅に少ないなら、paint を見送り前回の完全描画を守る**」。

### A-1. 純関数(lib・テスト先行)
`src/extension/story/renderStoryUserLaneDom.js` に追加(OnEmpty の直下・同型シグネチャ):

- `export const STORY_USER_LANE_SHRINK_KEEP_RATIO = 0.6;`
- `export function shouldKeepStoryUserLaneTilesOnShrink(els, currentLiveId, lastTiledLid, nextTileCount, entriesProvisional)`

判定ルール(全部 AND):
1. `entriesProvisional === true`(settled な正当減少は必ず描く=「配信中に contamination フィルタで正当に減る」ケースを殺さない)
2. `String(currentLiveId).trim().toLowerCase()` が非空かつ `lastTiledLid` と一致(**配信切替は必ず描く**。OnEmpty :97-99 と同一の正規化)
3. 現 DOM 実タイル数 `prev = countStoryUserLaneDomTiles 相当`(els の laneLink/laneGift/laneAd/laneKonta/laneTanu の childElementCount 合計。OnEmpty :100-103 と同じ走査をこの関数内に持つ) が `> 0`
4. `nextTileCount < Math.floor(prev * STORY_USER_LANE_SHRINK_KEEP_RATIO)`(実測: prev=200超 vs next=74 → keep。prev=200 vs next=190 → 描く)

テスト(`renderStoryUserLaneDom.test.js` の describe を1本追加・OnEmpty のテスト:171-191 と同型のヘルパ流用):
- 同一lv+provisional+大幅減(200→74)→true / settled(provisional=false)なら同条件でも false / lv不一致→false / prev=0(初回)→false / 微減(200→190)→false / 増加→false / 境界(prev=100, next=59→true, next=60→false)。

### A-2. provisional シグナルを STORY_SOURCE_STATE に載せる
`renderStoryUserLane` は heavy settled を知らないので、状態に1フラグ足す:

- `STORY_SOURCE_STATE`(popup-entry.js:5876-5887)に `entriesProvisional: false` を追加。
- `syncStorySourceEntries(liveId, displayList, storageRowsForLane)`(:7669)に第4引数 `opts = {}` を追加し、冒頭で `STORY_SOURCE_STATE.entriesProvisional = opts.provisional === true;`(**毎呼び出しで上書き=sticky にしない**。デフォルト false なので既存呼び出しは全て挙動不変)。
- 呼び出し元の指定(実読済み・6箇所):
  - **:16118(heavy paint 本線)**: `{ provisional: laneFeedPick.provisional === true || !watchPopupHeavyCommentsSettled }`。
    ⚠ `laneFeedPick.provisional` 単独では不十分: `selectLaneFeedCommentRows`(`src/lib/provisionalLaneCommentRows.js:84-86`)は「merged が primary を超えない」と heavy 未settle でも false を返す。今回の実機(entriesLen:307)はこの穴に落ちた可能性が高い。`!watchPopupHeavyCommentsSettled` を OR で必ず併記。
  - **:7008(軽量起動パス `renderStoryUserLaneFromLightCommentsForCurrentLive`)**: `{ provisional: true }`(summary+tail 由来=定義上暫定)。
  - :8702 / :15335 / :15447(`syncStorySourceEntries('', [])` リセット系)・:14580(nls_comments 全件フォールバック)= **無指定のまま**(デフォルト false・挙動不変)。

### A-3. ガードの差し込み位置(1箇所)
`renderStoryUserLane` 内、**laneSig 計算(:6700-6706)と sig 代入(:6717 `storyUserLaneLastRenderSig = laneSig;`)の間**(sig 一致 skip ブロック :6707-6716 の直後):

- `nextTileCount = picked.length + buckets.gift.length + buckets.ad.length`(gift/ad は :6693/:6698 で確定済み。DOM 実タイル数 = 5段合計なので比較対象を揃える)
- keep 判定 true なら: 新 step を記録して return。
- **sig を更新せずに return するのが肝**: heavy settle 後の本描画は sig 不一致で必ず通る。同じ暫定が再来しても skip が続くだけで churn しない。

### A-4. 観測(状態速報で効きを見る)
`src/lib/storyUserLaneRenderProbe.js`:
- `STORY_USER_LANE_STEPS`(:31-37)に `SHRINK_KEPT: 'shrink-kept'` を追加。
- probe(:43-58)に `shrinkKeepCount: 0` を追加し、`recordStoryUserLaneStep`(:89)で step===SHRINK_KEPT のとき +1(HEAVY_SETTLE.RACE カウント :78-80 と同型)。
- `snapshotStoryUserLaneRenderProbe`(:112)にパススルー、`formatStoryUserLaneRenderDiagLines`(:227)に `shrinkKeepCount > 0` のとき1行(「⚠ 暫定縮小の上書きを N 回防御(前回の完全描画を保持)」)。
- ⚠ SHRINK_KEPT で return する経路でも **DONE を最後に記録**(OnEmpty :6537 と同じく `{ domTilesPainted: countStoryUserLaneDomTiles(els) }` 付き)。しないと `started>completed` で「未完走」誤診(既存コメント :6708-6711 の教訓)。

### A-5. 壊さないことの確認
- diff-skip(`storyLaneTierBodyKey` :113-126 / `_laneTierLastKey` :60)= **不触**。ガードは fillLaneTier より上流で return するだけ。
- OnEmpty ガード(:6537/:6721)= 不触(空は OnEmpty、縮小は OnShrink と役割分離)。
- 三重安全網(reveal 1500ms/window load 800ms/shade 5s)・`dismissInitialLoadShade` 経路(:6714/:6747-6749)= 不触。skip 時は DOM にタイルが残っている(prev>0 が条件)ので幕は既に畳まれているか、sig-skip 側 :6714 が畳む。
- `_storyUserLaneLastTiledLid`(:6237, 代入 :6737)= 読むだけ。書き込みは従来どおり実 paint 時のみ。
- `publishLaneMirror`(:6769-6774)= skip 時は publish されない=③の鏡は**前回の完全描画のまま**(むしろ正しい。§D)。

---

## B. canReuse 成立(根治): 全件 re-read ループを断つ

### 方針(会議(d)差分readは第2段に降格)
80% coverage 判定に「**前回読了時の total 基準 + 読了の新しさ**」の第2成立条件を足す。
= 「直近 N 秒以内に、その時点の total をほぼ全部読み切った完全 read がある」なら、現 total に対する coverage が割れていても再利用する(不足分は tail concat :15746-15751 と次回 read が埋める)。これで backfill 中の全件 re-read が**最頻でも N 秒に1回**に落ち、read が settle する時間が生まれる。

backfill 検知は**新規 read 不要**: 実は検知自体が不要な設計にした(coverage が割れる=total が25%超/数秒で増えた=backfill 様の成長、のときだけ第2条件が意味を持つ)。なお既存シグナル `_backfillStateForOfficial`(:10111、KEY_BACKFILL_PROGRESS の onChanged :10233-10240 で更新・read 追加ゼロ)が実在するので、第2段でギャップ幅を「backfill 確定中はさらに広げる」チューニングに使える(初版では使わない=最小変更)。

### B-1. 純関数(新規 lib・テスト先行)
新規 `src/lib/heavyChunkReadReuse.js`:

- `export const HEAVY_FULL_REREAD_MIN_GAP_MS = 12_000;`(robust-arch Phase1 の min-gap はしごと同じ思想。計器を見て調整する前提の定数)
- `export function decideHeavyChunkReadReuse({ lv, cached, currentChunkTotal, nowMs, minGapMs })` → `{ reuse: boolean, reason: 'coverage' | 'fresh-read' | '' }`
  - `cached = { lv, arrLength, chunkTotal, readAtMs }`(watchMetaCache.lastCommentsArr の縮約・**配列本体は渡さない**=純関数を軽く保つ)
  - **条件1(現行そのまま=coverage)**: `cached.lv === lv && arrLength > 0 && (currentChunkTotal == null || currentChunkTotal === 0 || arrLength >= Math.floor(currentChunkTotal * 0.8))` → `'coverage'`
  - **条件2(新設=fresh-read)**: `cached.lv === lv && arrLength > 0 && cached.chunkTotal != null && arrLength >= Math.floor(cached.chunkTotal * 0.8)`(=**読了時点では完全だった**) `&& Number.isFinite(cached.readAtMs) && nowMs - cached.readAtMs < minGapMs` → `'fresh-read'`
  - readAtMs 欠落(旧形式キャッシュ)は条件2不成立=現行と同一挙動(後方互換)。

テスト(`heavyChunkReadReuse.test.js`): coverage 成立/ fresh-read 成立(coverage 割れ+読了12秒未満+読了時完全)/ 読了が古い→不成立 / 読了時から不完全(arrLength < 0.8*own chunkTotal)→不成立 / lv 不一致 / readAtMs 無し / currentChunkTotal null(非チャンク)→coverage 扱い / minGap 境界。

### B-2. popup-entry の配線(3箇所)
1. **判定の置換**: :15634-15640 の `cachedHeavyCoverageOk` 式を `decideHeavyChunkReadReuse` 呼び出しに置換(`nowMs = Date.now()`、`minGapMs = HEAVY_FULL_REREAD_MIN_GAP_MS`)。`canReuseHeavyChunkRead`(:15645-15652)は `decision.reuse` を使う形に整理(idbMode/commentsChunked/currentChunkTotal != null の外側条件は現状維持)。
   - ⚠ **coverage 概念の他の2箇所は不触**: session persist ゲート(:15717-15726。stale な短配列を session に焼かない=現行の 80% 判定のまま)と `arrCoversTotal`(:16242-16245。空 resp 保護)は据え置き。
2. **readAtMs の記録(read 完了時刻)**: `watchMetaCache.lastCommentsArr` への書き込み2箇所に `readAtMs: Date.now()` を追加:
   - race パス :16234(v1035 自己修復の書き込み)— **ここが自己修復の起点**: race で bail しても readAtMs が今なので、次 refresh(450ms後)は fresh-read で reuse=即 settled で始まる。C 無しでも A+B だけでループが切れる。
   - settled パス :16253-16257。
   - 型コメント :3823 の `{ lv, arr, chunkTotal }` に readAtMs を追記。
3. **計器(1個)**: fresh-read reuse の発火回数をモジュールカウンタで持ち、`publishLaneDiag`(:6753)の payload か既存 fastDiag の heavy 系(heavySettleState の隣)に加算値として載せる(`getLiveViewPublishPruneCount` と同型の「中で数えて外で読む」)。実配信で「fresh-read が効いているか/ギャップ12sが適正か」を1回のコピペで判定するため。

### B-3. 意味論の確認(実装者向け)
- reuse 時 `watchPopupHeavyCommentsSettled = true` で始まる(:15654)→ laneFeed は primary(全件由来)・provisional=false→**A のガードは発動しない**(正しい: 全件由来の描画は多少古くても「完全」)。
- 新着は tail concat(:15746-15751/:16260-16262)で毎 refresh 上乗せされるので、レーン/ティッカーの鮮度は落ちない。件数カードは summary 系が担う(reuse と無関係)。
- ギフト Bahamut/マイルストーン抑止(:15653 コメント)は「settled=完全配列」を前提にする既存 v1034 の 80% reuse と同じ意味論(読了時完全な配列)なので新リスクなし。
- ロールバック = 条件2を消すだけ(1 lib 関数内)。

---

## C. 追い越し(race)そのものの抑止(慎重・v1032 地雷回避)

**⚠ 禁止事項の再確認**: `refresh()` / `safeRefresh` 冒頭への早期 return は**足さない**(v1032 退行=ちらつき)。以下はどちらも「read を減らす/合流させる」方向のみで、refresh 本体は完走する。

### C-1. heavy read の single-flight 化(推奨・B と同 PR でも可)
現状 `readHeavyFromStoreGuarded`(:15702-15706)は呼ばれるたび新しい全件 read を開始する。poll ガード(:21612)はあるが、onChanged coalesced 経由(:21509)の refresh は素通り=**同一 lv の read が多重に走る**。

最小変更:
- `watchMetaCache`(:3805-3825)に `heavyReadInflight: null`(`{ lv, promise } | null`)を追加。
- `readHeavyFromStoreGuarded` 冒頭で `heavyReadInflight && heavyReadInflight.lv === lv` なら**その promise を返す**(新 read を張らない)。そうでなければ従来どおり read を開始し `heavyReadInflight = { lv, promise }` をセット、`finally` で `heavyReadActive = false` と inflight クリア(現行 :15705 の finally に併記)。
- withTimeout(15s) は共有 promise 側に既にかかっている=合流側も必ず settle(永久 pending なし)。
- **効果**: read 中に refresh が来ても「新 read で上書き」でなく「進行中 read に合流」。read 完了時点で**最新 gen の refresh がその結果を持っている**ので、:16230 の gen チェックを最新側が通過→settled→paint。古い gen 側は従来どおり RACE で bail するが、キャッシュ最新化(:16234)は走るので無害。
- 純ロジックを切るなら新規 `src/lib/singleFlightByKey.js`(`createSingleFlightByKey()` → `run(key, fn)`)+テスト(同 key 合流/別 key 非合流/reject 後クリア)。popup-entry 側は5行程度に収まるなら inline でも可(max-lines と相談)。
- ⚠ lv が変わったら合流しない(条件に lv 一致を含む)=配信切替で古い read に乗らない。

### C-2. coalesced onChanged の見送り(条件付き・別パッチ・計器が残ったら)
C-1+B 後も実配信で `heavyRaceReturns` が増え続ける場合のみ:
- `scheduleCoalescedStorageRefresh`(:18386-18405)で `allHighFreq === true && watchMetaCache.heavyReadActive` のとき、`runRefresh` の代わりに `applyLightweightPanelSummaryCards()` を呼んで見送る(**v1037 poll ガード :21611-21612 と完全同型**=出荷済み前例のあるパターン。数字カードの鮮度は軽量系で継続)。
- 非高頻度キー(設定トグル等)は見送らない(`allHighFreq` 判定 :18398-18400 で自然に除外)。
- 見送り分の catch-up は「backfill 中は毎秒 onChanged が来る+3秒 poll がある」ので構造的に保証される(専用の再スケジュールは足さない=最小)。
- ⚠ これは「トリガの間引き」であって refresh 冒頭 return ではない(前回描画は画面に残る・軽量カードは更新される)= v1032 の症状(白/ちらつき)とは経路が違うことをレビューで明記する。

---

## D. ③WEB(丸写し)非影響の確認(実コード根拠)

| 変更 | ③への経路 | 判定 |
|---|---|---|
| A(paint 見送り) | ③のレーンは `publishLaneMirror`(:6769)が書く `KEY_LANE_MIRROR` を read するだけ(app/live-view.js / applyLaneMirrorForPassive :6801)。見送り時は publish も走らない=鏡は**前回の完全描画のまま**保持 | 影響なし(むしろ③のたぬ姉化も同時に直る) |
| B/C(read 経路) | ③/②passive は heavy read を**そもそも走らせない**(`INLINE_PASSIVE` → heavyDataPromise=null :15707-15708) | 影響なし |
| 全体 | `publishCommentTimelineMirror`(:16083)・statusReport(textContent)・`KEY_LIVEVIEW_PUBLISH` 系(robust-arch Phase1)は一切触らない。innerHTML 行き HTML 文字列を blob に足さない(規約R-1)遵守 | 影響なし |

①の描画が正しくなれば、①の buckets を鏡化する③は自動的に正しくなる(鏡は描画の下流)。

---

## 移行表(この順で独立パッチ・各1 patch bump)

| 段 | 内容 | 触るファイル | リスク | 戻し方 |
|---|---|---|---|---|
| **1. A** | 単調性ガード+provisional フラグ+計器 | `src/extension/story/renderStoryUserLaneDom.js`(+test) / `src/lib/storyUserLaneRenderProbe.js`(+test) / popup-entry.js(:5876 state, :7669 sync, :7008/:16118 呼び出し, :6716付近 ガード差し込み) | 低(provisional=true のときのみ発動・デフォルト無変化) | ガード呼び出し1行を消す |
| **2. B** | canReuse fresh-read 条件+readAtMs+計器 | 新規 `src/lib/heavyChunkReadReuse.js`(+test) / popup-entry.js(:15634-15652 置換, :16234/:16253 readAtMs, :3823 型) | 中(reuse 意味論は v1034 の延長) | lib の条件2を無効化 |
| **3. C-1** | heavy read single-flight | popup-entry.js(:3805 watchMetaCache, :15702 guarded) / (任意)新規 `src/lib/singleFlightByKey.js` | 低(read を減らす方向のみ) | 合流分岐を消す |
| **4. C-2** | coalesced 見送り(**計器が残ったときだけ**) | popup-entry.js(:18386) | 中(v1037 同型だが要実機確認) | 分岐を消す |

各段の出荷ゲート: **`npm run verify:cc` 一本**(piecemeal 禁止・memory 鉄則)+ 新規 lib を足した段は tree-map/feature-map 再生成をコミットに含める + reality-checker(⚠ BG 実行中に司令塔が commit しない=detached HEAD 事故のメモリ参照)。

**実機の成功判定**(大配信+backfill 中の状態速報1コピペ):
- `heavySettleState: settled`(race 固着が消える)・`heavyRaceReturns` が増加停止
- `domTilesPainted` が縮小逆行しない(74 固着の消滅)・段別再描画回数(getStoryLaneRepaintCounts)が暴れない
- A計器 `shrinkKeepCount` > 0(ガードが実弾を止めた証拠)・B計器 fresh-read reuse > 0
- 鏡(③)のたぬ姉/りんく件数が①と一致

## 地雷リスト(SYNTHESIS+実読で確定・実装時に毎回見る)

1. 記録(content-entry)不触。read を**減らす**方向のみ(read cache 新設は過去2回却下の逆風)。
2. `refresh()`/`safeRefresh` 冒頭の早期 return 禁止(v1032 退行)。C-2 は「トリガ間引き+軽量カード代替」であって早期 return ではない。
3. diff-skip(`storyLaneTierBodyKey` / `_laneTierLastKey`)不触。A のガードは fillLaneTier の上流。
4. backfill を止めない・遅くしない(B は読む側の頻度制御のみ)。
5. 初回 paint 三重安全網・幕(shade)経路不触。A の skip 経路でも DONE 記録+domTilesPainted を必ず残す(未完走誤診防止)。
6. popup-entry は max-lines 上限付近→判定ロジックは必ず lib へ(A=renderStoryUserLaneDom.js / B=heavyChunkReadReuse.js / C=singleFlightByKey.js)。
7. v1037 ガード(`heavyReadActive` :3816 / poll 見送り :21612 / withTimeout 15s :15704)は**活かす**(C-1 はその強化であって置換ではない)。
8. 会議段の「差分read関数」「isFullyPainted フラグ」は**実在しない**→本設計では採用せず(差分readは B で足りないときの第2段)。
9. session persist ゲート(:15717-15726)の 80% 判定は変えない(stale 配列を session に焼くと再オープン時に汚染)。
10. 未マージの `feat/robust-arch-phase0-instrument`(popup-entry.js を触る)とコンフリクトし得る→着手前にマージ状況を確認し、必要ならそちらを先に取り込む。
11. lane limit を触らない(200 のまま)。鏡 cap との対(v1051/1052 の教訓)にも触らない。
