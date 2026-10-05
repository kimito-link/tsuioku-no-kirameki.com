# タイムシフト視聴時のサイドパネル4症状 — 地図（wayfinder MAP）

> 作成: 2026-10-05 / 対象: lv342383970（2023-09-18 20:00 放送・97分・公式チャンネル ch2640322）
> 測り方: `/nicolive-selfcheck`（chrome-devtools MCP に repo の `extension/`(v0.1.1556) を読ませ、
> 実タイムシフトページを開き、storage と NDGR 通信を直接測った）。ユーザーの Chrome（`C:\nicolive-ext` は
> v0.1.1536）とは別環境だが、4症状すべてが同じ値で再現した。1537〜1556 の changelog に該当修正は無い。
> **この地図は実測と実コードの裏取りのみ。推測は「未確認」と明記。**

## 0. 結論（1行ずつ）

| # | 症状 | 真因（確定） | 種別 |
|---|---|---|---|
| 1 | 経過「26703時間54分」 | 経過＝`Date.now() − beginTime` のみ。埋め込みデータの `program.status:"ENDED"` と `endTime` を一切読んでいない | データ側バグ |
| 2 | 応援者が `u/hlTkweodfOQ4gP…` | タイムシフトの NDGR 匿名 ID は `a:` 接頭辞が**無い**（27文字 base64url・`is184=false`）。匿名判定が `a:` 始まりだけなので素通りし、`u/<uid先頭20文字>` フォールバックへ落ちる | データ側バグ |
| 3 | 一括取得 stalled・残り10,615 | タイムシフトではプレイヤーが **NDGR view を2本**開く。拡張は「最後に観測した view」を採用するが、片方は data 系が全部空（backward 0byte / snapshot 404）。その空 view を掴むと backward が永遠に0件 → 10回再シード → 60秒で stalled | データ側バグ |
| 4 | 広告pt・ギフトpt「—」 | 本家の値が 0。nicoad API `totalAdPoint:0 / totalGiftPoint:0`、本家 DOM も「-」。拡張は本家どおり | **不具合ではない** |

→ 1〜3 は **見た目を /live/ に変えても同じ値が並ぶ**。先にデータ側を直す。

## 1. 実測値（証拠）

### 1.1 埋め込みデータ（`#embedded-data[data-props]`）
```
program.status        = "ENDED"
program.beginTime     = 1695034800   (2023-09-18 20:00 JST)
program.endTime       = 1695040646   (+5846s = 1時間37分)
program.vposBaseTime  = 1695034200
program.statistics    = { watchCount:135296, commentCount:11175, timeshiftReservationCount:904 }
```
拡張の snapshot: `nls_watch_snapshot_lv342383970.streamAgeMin = 1602242`（=26704時間）。
`nls_watch_snapshot._debug.edProgramKeys` には `endTime,status` が**含まれている**のに読んでいない。
`nls_live_ended_lv342383970` は null（`isWatchProgramEndedText` の文言がタイムシフト画面に無く、終了検知も走らない）。

### 1.2 記録されたコメントの userId 形式（`nls_cchunk_lv342383970_*` 442件）
| 形式 | 件数 | 例 |
|---|---|---|
| 数値（本物のアカウント） | 24 | `14014777` |
| `a:` 始まり | **0** | — |
| ハッシュ（`a:` 無し） | **417** | `sIEHqCaHKR_Pe1v1ZU61TnVABv8` |
| null | 1 | — |
`is184` は全件 false。`nls_lane_mirror_v2.tanu[0].nameLine = "u/-GGaQpHQUTGLRnNRYU1_"` ＝症状そのもの。
生放送では `a:xxx` 形式（docs/.visual-explainer/comment-capture-forensics.html に記録・今回は未再測）。

### 1.3 NDGR view が2本（決定的）
プレイヤーは起動時に2本の view を `?at=1695034800`（beginTime）で同時に開き、以後 ~24秒刻みで交互に進める。

| view token | `?at=T` entry | backward | segment | snapshot |
|---|---|---|---|---|
| `BBwT4YFPs06…` | 705B・backward URI あり | **200 / 0 byte**（begin, mid, end-60, now-90 全部） | 200 / 3 byte | **404** |
| `BBwq81I68bqh…` | 826B・backward URI あり | **200 / 46〜83 KB**・日本語本文あり・次の backward ポインタ連鎖あり | 1.3〜13 KB | 200 / 0B |

- `WpXb` トークン（`{"userId":"guest",…}`）の有無は結果に**無関係**（両方試した）。
- `?at=now` はどちらも 9 byte（nextAt のみ）。`?at=now−90` でも `BBwq81…` なら backward 65KB → 83KB → 39KB → 69KB と連鎖する ＝ **Date.now() 起点のシードは致命ではない**。
- 拡張の backfill は `BBwT4…` を掴んでいた（network: reqid 208 `?at=now`、267 `?at=1791169075` ともに `BBwT4…`）。
  結果: `nls_backfill_progress_v1 = { stopReason:"stalled", reseeds:10, rows:0, seg:0, elapsedMs:59369 }`。
- 442件取れたのは、プレイヤー自身の `BBwq81…` 由来 segment を page-intercept が横取りしたぶん（再生位置まで）。
  残り = 11175 − 記録数（ユーザー画面 ≈560 → 10,615）。
- `BBwT4…` が何の stream かは**未確認**（本文が一切無いことだけ確定）。

### 1.4 広告pt・ギフトpt
- `GET https://api.nicoad.nicovideo.jp/v1/live/statusarea/lv342383970` → `totalAdPoint:0, totalGiftPoint:0`
- 本家 DOM `.___nicoad-count-item___` / `.___gift-count-item___` の textContent = `"-"`
- 拡張: `nls_event_dom_*.programStats = { adPoints:null, giftPoints:null, commentCount:11175, watchCount:135296 }`
  → `paintOfficialNicoStatsStrip` は `>0` のときだけ採用 → 「—」。本家が「-」なので AGENTS §3.5「本家表現を独自に置き換えない」に沿っており修正不要。

## 2. コードの経路（ファイル:行は 2026-10-05 時点・v0.1.1556）

### 症状1 経過
- `src/extension/content-entry.js:9518` snapshot の `streamAgeMin`（優先1: `programBeginAtMs`、2: `pickProgramBeginAt(embeddedProps)`、3: タイトル日付、4: プレイヤー経過文字列）。すべて `Date.now() −` 起点。
- `src/extension/content-entry.js:11297` `resolvePanelSummaryStreamAgeMin` も同じ4段。
- `src/lib/embeddedDataExtract.js:89` `pickProgramBeginAt` — `endTime` / `status` を拾う関数が**存在しない**。
- 表示: `src/lib/officialNicoStatsStripDigest.js:40` → `src/lib/formatOfficialStreamAgeMinutes.js`（分→「h時間m分」。上限なし）。
- 終了枠の凍結は status ページだけ: `src/extension/status-entry.js:3452` `resolveDisplayElapsedSec(endedFlag, live)`（`src/lib/frozenElapsedOnEnd.js`）。popup/会場/別窓はこれを使っていない。
- 終了検知: `src/lib/watchProgramEndState.js:isWatchProgramEndedText`（文言正規表現）。タイムシフト画面では false。`program.status==='ENDED'` は使われていない。

### 症状2 匿名ID
- 判定の正本: `src/lib/nicoAnonymousDisplay.js:10` `isNiconicoAnonymousUserId` = `startsWith('a:')`。
- 漏れが画面に出る場所: `src/lib/giftDisplayNickname.js:360-369` `formatNicknameWithUidFallback` の最終分岐 `u/${uid.slice(0,20)}`。
- 匿名ラベル採番の正本: `src/lib/nicoUserPage.js:36` `anonymousDisplayLabel`（a: 以外のキーも決定的ハッシュで「匿名NNN」を作れる＝入力を広げれば流用可）。
- NDGR 側: `src/lib/ndgrDecode.js:314` `NDGR_HASHED_USER_ID_RE = /^[a-zA-Z0-9_:-]{8,}$/`（`a:` 無しも通す）、`src/lib/ndgrChatRows.js:14` `ndgrChatUserId`（rawUserId が無ければ hashedUserId をそのまま userId に）。
- `a:` 前提の判定が散っているファイル（12）: broadcastReportSummary / comeviewUserNotes / giftDisplayNickname / liveRankingView / nicoAnonymousDisplay / reportCommentsCsv / storyUserLaneDisplaySrc / storyUserLaneSort / supporterChikuranScore / supportGridDisplayTier / supportGrowthTileSrc / userThumbGrid（いずれも `src/lib/`）。3画面パリティ（会場=応援レーン=別窓）に関わるので**正本1関数に寄せてから**直す。

### 症状3 backfill の view 選択
- 観測: `src/extension/page-intercept-entry.js:509` `observeNdgrViewUri` — `/view/v4/` の URL を見るたび `base` を**最新に上書き**（v0.1.762 のローテーション対策）。view ごとの「本文が取れたか」は見ていない。
- 受け渡し: `document.documentElement[data-nls-ndgr-view-uri]` → `src/extension/content-entry.js:16807` `readNdgrViewBaseUri`。
- 巡回: `src/lib/ndgrBackfillCrawl.js:566-590`（`?at=now` → seed → `seekBackwardUri`）、seed 候補は `:761-784`（`nowSec − lag` と `programStartSec + offset`）。backward が 0 byte でも「入口はある」扱いで再シードを続け、`content-entry.js:17812` の60秒ウォッチドッグで stalled。
- 横取り側の decode: `src/extension/page-intercept-entry.js:598` `handleNdgrResult` / `:705-712`（segment/backward の frame 単位 decode）。どの view 由来の segment かは紐づけていない。

## 3. 直すならここ（候補・仕様は SPEC 側で決める）

1. **経過**: `embeddedDataExtract.js` に `pickProgramEndAt` / `pickProgramStatus` を足し、`content-entry.js:9518` と `:11297` で `status==='ENDED'`（または `endTime < now`）のとき `endTime − beginTime` を返す。popup の「経過」チップが status と同じ凍結値になる。
2. **匿名**: `isNiconicoAnonymousUserId` を「`a:` 始まり **または** 数値でない8文字以上のハッシュ形」に広げる（`NDGR_HASHED_USER_ID_RE` と同じ形）。12ファイルの `a:` 直書きはこの正本関数へ寄せる。表示は既存の「匿名NNN＋identicon」経路に乗るだけ（新UIは作らない）。
3. **backfill**: `observeNdgrViewUri` を「本文(chats>0)が実際に取れた segment を出した view」を優先するよう変える（最新観測ではなく実績で選ぶ）。または backfill 側で「backward が0byte」を `no_entry` として別 view へ切り替える。どちらにするかは SPEC で決める。
4. **広告pt/ギフトpt**: 変更なし。

## 4. 未確認（断定しない）
- 生放送（タイムシフトでない）で hashedUserId が本当に `a:` 付きか（docs の記録のみ。今回は未再測）。
- `BBwT4…` view の正体（統計・運営コメント用か）。
- ユーザー環境（v0.1.1536・ログイン済み）での backfill が同じ view を掴んだか（devtools 環境は未ログイン guest。症状の数字は一致）。

## 5. /live/ の見た目を拡張へ持ち込むかの判断材料
- 4症状のうち3つはデータ側、1つは仕様どおり。**見た目の変更では1つも直らない。**
- 拡張は「会場=応援レーン=別窓は並び・レイアウトまでそっくり同じ」（memory `venue-equals-lane-same-layout`）。/live/ 風にするなら3画面同時＝大きい。
- 推奨: 先に 1〜3 を直して正しい値が並んだ状態を見てから、見た目を変える価値があるか判断する。

---

## 6. 追加の裏取り（SPEC 設計に必要な事実・2026-10-05 司令塔が実コードで確認）

### 6.1 page-intercept は「どの view 由来の segment か」を今は知らない
- fetch フックは [page-intercept-entry.js:954](src/extension/page-intercept-entry.js) で `observeNdgrViewUri(url)` を呼び、
  同じクロージャ内（`url` が見える）で response body を `tryProcessBinaryBuffer(value, ldAcc)`（:721）→
  `processLengthDelimitedNdgrFrame`（:698）→ `handleNdgrResult`（:598）へ流す。**`url` はここまで渡っていない。**
- `processLengthDelimitedNdgrFrame` は `decodeChunkedMessage` → だめなら `decodePackedSegment` の2段。
  `decodeChunkedEntry`（view 応答の中の segment/backward/snapshot URI を取り出す関数、`src/lib/ndgrDecode.js:1080`付近）は
  **page-intercept では import されていない**（:10 の import は `decodeChunkedMessage, decodePackedSegment, ndgrStatisticsHasWireSignal` のみ）。
  ＝「view entry を decode して segment URI → view base の対応表を作る」のは**新規配線**になる。
- 露出している属性: `data-nls-ndgr-view-uri`（最新1本・300字）, `data-nls-ndgr-view-uri-count`（:532-533）。
  content 側は [content-entry.js:16807](src/extension/content-entry.js) `readNdgrViewBaseUri()` で読む（呼び出し 7 箇所: :7166, :9879, :16937, :17624, :17767, :17774, :17906）。
- `observeNdgrViewUri` は内部状態 `_ndgrViewUri = { base, firstBase, count }`（:508）。`firstBase` は診断用で content には渡していない。

### 6.2 crawl 側の「backward が 0 byte」の扱い
- [ndgrBackfillCrawl.js:938](src/lib/ndgrBackfillCrawl.js) `if (!bwRes.bytes || bwRes.bytes.length === 0) break; // この区画終わり`
  ＝ 0 byte は「区画の終わり」扱いで、再シード（`:1043-1058`、予算 `emptyBudget`）へ回る。「この view は死んでいる」とは判定しない。
- 停止理由の集合: [backfillTransientRetry.js:22](src/lib/backfillTransientRetry.js) `BACKFILL_TRANSIENT_STOP_REASONS`（`backward_exhausted`, `no_entry` …）は
  「少し待って `?at=now` から仕切り直す」= **同じ view base で**やり直す。view を替える概念は無い。
- `_ndgrDeterministicBackfillEnabled`（[content-entry.js:16608](src/extension/content-entry.js)、storage フラグ・既定 OFF）で
  `crawlNdgrBackwardDeterministic` に切り替わるが、view の選び方は同じ `readNdgrViewBaseUri()`。

### 6.3 経過時間の入力元
- `programBeginAtMs` の代入は2経路: ① page-intercept の `NLS_INTERCEPT_SCHEDULE`（[page-intercept-entry.js:841](src/extension/page-intercept-entry.js) `{ type, begin }` **`end` は送っていない**）→ [content-entry.js:2338](src/extension/content-entry.js)
  ② `maybeFillProgramBeginFromEmbeddedData`（:2155-2160、`pickProgramBeginAt`）。
- `src` 全体で `'ENDED'` / `programTimeshiftWatch` / `isTimeshift` を参照する箇所は **ゼロ**（grep 確認）。
- `streamAgeMin` の下流: content snapshot（:9518）→ `nls_watch_snapshot_*` と `nls_panel_summary_*`（[panelLiveSummary.js:86,147](src/lib/panelLiveSummary.js)）→ popup `paintOfficialNicoStatsStrip`（[popup-entry.js:9048](src/extension/popup-entry.js)）→ `officialNicoStatsStripDigest` → status/Web の鏡 `statCardsMirror.js`。
  venueBar.js / live-view-entry.js は `streamAgeMin` を直接読まない（grep 0件）＝経過チップは popup と鏡だけ。

### 6.4 匿名判定の散在（行番号つき）
| ファイル:行 | 何をしているか |
|---|---|
| [nicoAnonymousDisplay.js:12](src/lib/nicoAnonymousDisplay.js) | `isNiconicoAnonymousUserId` 正本（`startsWith('a:')`）。利用 3 ファイル: 自身 / storyUserLaneDisplaySrc / supportGridDisplayTier |
| [nicoAnonymousDisplay.js:72](src/lib/nicoAnonymousDisplay.js) | `compactNicoLaneUserId` の `a:` 短縮表示 |
| [giftDisplayNickname.js:365](src/lib/giftDisplayNickname.js) | `formatNicknameWithUidFallback`: `a:` は '' を返す（匿名経路へ）、それ以外は `u/…` |
| [broadcastReportSummary.js:146](src/lib/broadcastReportSummary.js) | レポート集計の匿名分類 |
| [comeviewUserNotes.js:123](src/lib/comeviewUserNotes.js) | コメビュの匿名NNN（採番は nicoUserPage.js へ委譲済み） |
| [liveRankingView.js:285](src/lib/liveRankingView.js) | Web版 /live/ の匿名キー正規化（`a:` を剥がす） |
| [reportCommentsCsv.js:63](src/lib/reportCommentsCsv.js) | CSV の is184 列 |
| [storyUserLaneSort.js:13](src/lib/storyUserLaneSort.js) | 匿名を後ろに並べるソート |
| [supporterChikuranScore.js:156](src/lib/supporterChikuranScore.js) | 匿名スコア判定 |
| [supportGrowthTileSrc.js:95](src/lib/supportGrowthTileSrc.js) / [userThumbGrid.js:53](src/lib/userThumbGrid.js) | 匿名タイルの画像ソース判定 |
- NDGR 由来 userId の確定: [ndgrChatRows.js:14](src/lib/ndgrChatRows.js) `ndgrChatUserId`（rawUserId 優先・無ければ hashedUserId をそのまま）。page-intercept 側も同じ（[page-intercept-entry.js:623](src/extension/page-intercept-entry.js) `chat.rawUserId ? String(chat.rawUserId) : chat.hashedUserId`）。
- 「数値でない＝公開ページ無し」の判定は既にある: [nicoUserPage.js:14](src/lib/nicoUserPage.js) `nicoUserPageUrl` は `/^\d{1,18}$/` のみ URL を返す。
- 既存テスト: `nicoAnonymousDisplay.test.js` / `giftDisplayNickname.test.js` / `nicoUserPage.test.js` / `embeddedDataExtract.test.js` / `formatOfficialStreamAgeMinutes.test.js` / `ndgrBackfillCrawl.test.js`（vitest・`describe/it`・日本語ケース名に版番号を添える流儀）。

## 7. 既存の設計判断と根拠（壊してはいけない境界）
- **view base は「最新観測」で更新する**（v0.1.762 `203119b9`）: 生放送中に view token がローテーションし、古い token に固定すると数%で止まる実害があった。タイムシフト対応で「最初の view に固定」へ戻してはいけない。
- **`u/<uid>` フォールバック**（0.1.181、[giftDisplayNickname.js:343-358](src/lib/giftDisplayNickname.js) のコメント）: 数値 uid でニックネーム未設定の人を「匿名」と誤表示しないため。数値 uid の `u/4814023` 表示は維持する。
- **匿名は「匿名NNN＋identicon」で識別できる形**（AGENTS §3.5・2026-06-10 ユーザー確立）。一律グレー化・ID だけ表示は原則違反。
- **終了枠の経過は凍結する**（v0.1.1535 `elapsedSecAtEnd`、status ページのみ実装済み）。popup も同じ値に揃えるのが筋。
- **3画面パリティ**（会場=応援レーン=別窓・[[venue-equals-lane-same-layout]]）: 匿名表示の変更は popup/venue/live-view に同時に効く共有 lib で行う。
- **外部 API は落ちる前提**（AGENTS §3.6）: view が2本でも片方が死んでいても、取れる方で取り込み、取れなければ理由を出す。

## 8. 変更すると壊れうる箇所
- `isNiconicoAnonymousUserId` を広げると、`anonymousNicknameFallback` が hashed uid に「匿名」を返すようになる → `ndgrChatRows.js:52` で `row.nickname='匿名'` が保存される（保存形が変わる）。`liveCommentTally.js:149` は「匿名は名前を持たない」前提で保存しているので整合を確認する。
- `formatNicknameWithUidFallback` の最終分岐（`u/<slice>`）を匿名扱いに変えると、数値でもない・`a:` でもない**想定外 ID**（例: 内部キー `__anon_ad_2`、[topSupportRankStripLines.js:66](src/lib/topSupportRankStripLines.js) のコメント参照）も匿名扱いになる。内部キーの漏れ防止ガードと衝突しないか確認。
- `observeNdgrViewUri` の属性形式を変えると `readNdgrViewBaseUri` の 7 箇所と `ndgrViewBaseObserved` 診断（:7166, :9879）に影響。属性は**追加**で出し、既存の `data-nls-ndgr-view-uri` の意味は変えない方が安全。
- `streamAgeMin` を「終了枠は固定値」にすると、`concurrentEstimate.js`（同接推定が streamAgeMin を使う: [concurrentEstimate.js:431](src/lib/concurrentEstimate.js)）の入力が変わる。終了枠での推定値の意味は未確認。

## 9. 実装前に決める必要がある質問（Fable が答える）
1. **view の選び方**: (A) page-intercept が view entry を decode して「本文が取れた segment を出した view」を優先する（新規配線・正確） / (B) page-intercept は観測した view base を**全部**（最新順・上限N）属性に出し、crawl 側が「backward 1 hop 目が 0 byte」の view を捨てて次候補へ移る（配線小・実績ベース）。どちらを MVP にするか。生放送のローテーション対策（v0.1.762）を壊さない条件は何か。
2. **匿名判定の境界**: 「`a:` 始まり または 数値でない 8 文字以上の `[A-Za-z0-9_:-]`」でよいか。内部キー（`__anon_ad_2` 等）や空文字をどう除外するか。`is184` フラグは使わない（タイムシフトでは常に false）でよいか。
3. **匿名NNN の採番**: `anonymousDisplayLabel`（nicoUserPage.js）は `a:` 無しキーでも決定的ハッシュで番号を作れる。そのまま使うか、`a:` を付けて正規化してから渡すか（既存の `a:xxx` との衝突・同番号の重複解消 §5.6 との整合）。
4. **保存形**: hashed uid の `nickname` に「匿名」を保存するか、空のままにして表示側で作るか（`liveCommentTally.js:149` の原則「保存形に不要な文字を入れない」）。
5. **経過の定義**: `status==='ENDED'` のとき `endTime−beginTime` を分で返す。`endTime` が無い ENDED（異常データ）は従来どおり `now−begin` か、null（「—」）か。`scheduledEndTime` は使わない方針でよいか。
6. **経過の凍結先**: content snapshot の `streamAgeMin` で返す（popup・鏡が自動で揃う）か、`nls_live_ended_*` の `elapsedSecAtEnd` を埋めて popup 側で `resolveDisplayElapsedSec` を使うか。前者なら `isWatchProgramEndedText` に `status==='ENDED'` を足して終了検知も走らせるべきか（走ると `maybeRunEndedBulkHarvest` が起動する＝スコープ拡大の恐れ）。
7. **同接推定**: 終了枠で `streamAgeMin` が固定値になったとき `concurrentEstimate` の出力をどう扱うか（スコープ外にするなら明記）。
8. **検証の定義**: lv342383970 で何が見えたら完了か（`nls_backfill_progress_v1.rows>0`・`nameLine` に `u/` 無し・`streamAgeMin≈97`）。生放送での回帰確認は何で行うか（`/nicolive-selfcheck` の生放送ケース）。
