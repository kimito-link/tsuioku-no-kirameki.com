# タイムシフト視聴時の3データ側バグ — 実装仕様（SPEC）

> 設計=Fable(claude-fable-5-1) / 地図・裏取り=司令塔(Claude) / 2026-10-05
> 地図: [timeshift-sidepanel-symptoms-MAP.md](timeshift-sidepanel-symptoms-MAP.md)（v0.1.1556 基準・実測裏取り済み）
> 司令塔の裏取り: Fable が挙げたファイル:行（identity.js:31 の `isAnonymousStyleNicoUserId` / storyUserLaneMeta.js:53 /
> popup-entry.js:4567 / liveCommentTally.js:139 / content-entry.js:16918,16683,16698,17444,17459-17478 / eslint.config.js:398,408 /
> ndgrBackfillCrawl.js:938-940 / feature-map.mjs:108-132 / giftDisplayNickname.test.js:63-66）はすべて実コードで一致を確認した。
>
> **司令塔の裁定（Fable の「未解決の質問」への回答）**
> 1. hashed 形の境界 16〜40 文字: **採用**（実測 20・27、`a:` 本体 16。既存 identity.js の `{10,26}` は段付け用の別定義で触らない）。
> 2. endTime 欠落の ENDED は「—」: **採用**（AGENTS §3.6 嘘の数字を出さない）。
> 3. 2b（`a:` 直書きの正本寄せ・CSV の is184 値変化）: **今回のスコープに入れる**（正本1本の原則。changelog に明記）。
> 4. バグ3は初回60秒 stalled → 再試行で view 切替の MVP: **採用**（crawl 内早期見切りは次版候補）。
> 5. 死亡マークはタブ寿命 in-memory: **採用**。

---

## 1. Problem Statement

### バグ1: 終了した放送の「経過」が 26703 時間と出る
- `src/extension/content-entry.js:9518`（snapshot の `streamAgeMin`）と `:11297`（`resolvePanelSummaryStreamAgeMin`）は4段とも `Date.now() − begin` で経過を出す。埋め込みデータに `program.status:"ENDED"` と `program.endTime` が入っているのに読んでいない（地図 §1.1・§6.3「`'ENDED'` 参照箇所ゼロ」）。
- status ページだけは v0.1.1535 の `elapsedSecAtEnd` 凍結があるが、タイムシフト画面では終了文言が無く `nls_live_ended_*` が立たない。

### バグ2: 応援者が `u/hlTkweodfOQ4gP…` と出る
- タイムシフトの NDGR 匿名 ID は `a:` 無し 27 文字 base64url（442 件中 417 件・`is184` 全件 false）。
- 正本 `nicoAnonymousDisplay.js:10 isNiconicoAnonymousUserId` は `startsWith('a:')` だけ。素通りした hashed uid は `giftDisplayNickname.js:359 formatNicknameWithUidFallback` の最終分岐 `u/${uid.slice(0,20)}` に落ちる。
- 画面に出る経路: `userLaneCandidatesFromStorage.js:312`（`pickGiftRankDisplayNicknameWithUidFallback`）が集約行の `nickname` に `u/-GGaQ…` を**合成**し、`storyUserLaneMeta.js:53-59`（`isAnonymousStyleNicoUserId` は hashed を既に匿名扱い）が `anonymousNicknameFallback(uid, 'u/-GGaQ…')` で nick 非空としてそのまま nameLine に通す。段付け（たぬ姉）と identicon（`popup-entry.js:4567`）は既に匿名として動いており、壊れているのは**名前行**だけ。
- コメビュ（`comeviewAnonLabel`）・mediaKit・supportTimeline も `a:` 限定で、同じ人が場所ごとに違う見え方になる。

### バグ3: 一括取得が stalled・残り 10,615
- タイムシフトではプレイヤーが NDGR view を 2 本開き、`BBwT4…` は backward が常に 0 byte。`page-intercept-entry.js:509 observeNdgrViewUri` は最後に観測した view を `data-nls-ndgr-view-uri` に出す（v0.1.762）。約 24 秒ごとに交互に観測されるので `runNdgrBackfillOnce`（`content-entry.js:16918`）が `BBwT4…` を掴むと backward 0 byte →「区画終わり」（`ndgrBackfillCrawl.js:938`）→ 再シード → 60 秒ウォッチドッグ（`content-entry.js:17812`）で `stalled`。一過性リトライは同じ view でやり直すので永久に 0 件。

広告pt/ギフトpt「—」は本家が 0 で仕様どおり。対象外。

---

## 2. Solution

### 方針（3バグ共通）
- 判定は**共有 lib の純関数**に置き、`content-entry.js` / `page-intercept-entry.js` / `popup-entry.js` は配線だけ（max-lines ラチェット `eslint.config.js:398/408`・3 画面パリティ）。
- 地図 §7 の既存設計判断を壊さない: `data-nls-ndgr-view-uri` の意味（最新観測）不変・数値 uid の `u/<uid>` 不変・`isAnonymousStyleNicoUserId`（domain/user/identity.js）の境界は触らない。
- 版の粒度: **4 版**。

| 版 | 内容 | 主な変更ファイル |
|---|---|---|
| 0.1.1557 | バグ1 経過: ENDED は `endTime−beginTime` に凍結 | `src/lib/embeddedDataExtract.js`・`content-entry.js`（2 箇所） |
| 0.1.1558 | バグ2a 匿名: 正本判定を hashed 形へ広げ、`u/` 合成を止める | `nicoAnonymousDisplay.js`・`giftDisplayNickname.js`・`comeviewUserNotes.js`・`userThumbGrid.js` |
| 0.1.1559 | バグ2b `a:` 直書きを正本関数へ寄せる | `broadcastReportSummary.js`・`reportCommentsCsv.js`・`storyUserLaneSort.js`・`supporterChikuranScore.js` |
| 0.1.1560 | バグ3 view: 観測済み view を複数露出し、0 件で死んだ view を次回スキップ | `page-intercept-entry.js`・`content-entry.js`・新 `src/lib/ndgrViewBasePick.js` |

### 地図 §9 の質問への回答
1. **view の選び方 → (B)。** page-intercept は観測 view base を「最新順・重複なし・上限 4」で新属性 `data-nls-ndgr-view-uri-recent`（JSON 配列）に出す。既存 `data-nls-ndgr-view-uri` は最新 1 本のまま（7 箇所の読み手・診断は無変更）。content 側は候補配列から「この liveId で死亡判定されていない最初の候補」を選ぶ。死亡判定は巡回結果 `rows===0 && seg===0 && stopReason∈{stalled, backward_exhausted, no_entry}` のみ（`seg` は backward 本文が非 0 byte のときだけ増える＝`ndgrBackfillCrawl.js:939-940`）。(A) は hot path への新規配線なので Out of Scope。
   **v0.1.762 を壊さない条件**: (i) 候補先頭は常に最新観測 (ii) 死亡マークは rows=0 で終わった巡回でしか付かない (iii) 全候補死亡なら先頭（最新）に戻す (iv) 新 token は死亡集合に無いので最優先。
2. **匿名判定の境界 → 「`a:` 始まり または hashed 形」。** hashed 形 = `^[A-Za-z0-9_-]{16,40}$` かつ 全桁数字でない かつ `__` で始まらない。`__anon_ad_2` / `__gift_sender_…` は `__` で除外。`t:`/`s:` キーは `:` が文字集合外。`is184` は使わない。
3. **匿名NNN の採番 → 生 uid をそのまま `anonymousDisplayLabel` へ。`a:` を付けて正規化しない**（uid は同一性キー。`anonymousDisplayLabel` は `a:` 無しでも決定的）。
4. **保存形 → 特別扱いしない。** `anonymousNicknameFallback(hash,'')` が `'匿名'` を返すので `ndgrChatRows.js:54` / `page-intercept-entry.js:623-631` は hashed 行にも `nickname:'匿名'` を保存する＝`a:` 行と同形。`liveCommentTally.js:139` は hashed を既に匿名として `name:''`。既存 storage の nickname 無し行は描画時に uid から導かれる（マイグレーション不要）。
5. **経過の定義 → `status==='ENDED'` のとき `round((endTime−beginTime)/60000)`。** `endTime` 無しの ENDED は null（「—」）。`scheduledEndTime` 等は読まない。ON_AIR/不明は従来どおり。
6. **凍結先 → content snapshot の `streamAgeMin`。** popup・panel summary・鏡が自動で揃う。`isWatchProgramEndedText` に ENDED は足さない（`maybeRunEndedBulkHarvest` が起動する＝スコープ拡大）。`nls_live_ended_*` も書かない。
7. **同接推定 → スコープ外**（入力が真の経過に変わるだけ）。
8. **検証の定義 → §5.3。**

---

## 3. User Stories
- **U1** タイムシフト（ENDED・endTime あり）: popup の経過チップ・status・Web の鏡が「1時間37分」。
- **U2** タイムシフトのレーン（会場＝応援レーン＝別窓）: hashed uid の人は「匿名（nameLine）・`sIEHq…Bv8`（idLine）・identicon」で `a:` の人と同じ見た目。コメビュ／mediaKit／supportTimeline では「匿名NNN」。
- **U3** 一括取得が 2 本の view のうち本文が取れる方で進み `rows>0`。
- **U4 生放送**: `status` が ENDED でないので経過は `now−begin`。`a:` uid の表示は不変。view 候補先頭は最新観測で従来どおり。
- **U5 終了直後の生放送**: 埋め込みデータは読込時の静的値なので本仕様は無反応。従来の文言検知→`elapsedSecAtEnd` 凍結が効く。
- **U6 endTime 欠落の ENDED**: 「—」。
- **U7 view が 1 本**: 候補 1 要素、死亡でも `all_dead` で返す＝今日と同じ。
- **U8 両方の view が空**: A 死亡 → B 死亡 → `all_dead` で最新に戻る＝今日と同じ失敗形（`NDGR_BACKFILL_TRANSIENT_RETRY_MAX=7` で有界）。
- **U9 既存 storage との互換**: `laneAggregates` は開くたび再構築、鏡は次回 publish で上書き。
- **U10 3 画面パリティ**: nameLine 正本 `storyUserLaneMetaLines` と nickname 合成 `userLaneCandidatesFromStorage` は共有。

---

## 4. Implementation Decisions

### 4.1 バグ1（0.1.1557）
`src/lib/embeddedDataExtract.js` に追加:
```js
export function pickProgramEndAt(props): number | null        // program.endTime(秒/ms/ISO) → ms
export function pickProgramStatus(props): string | null       // program.status を trim+大文字
export function describeEmbeddedProgramElapsed(props): { ended: boolean, elapsedMin: number | null }
```
`describeEmbeddedProgramElapsed`: `ended = status==='ENDED'`。`ended && begin && end && end>=begin` → `round((end−begin)/60000)`、それ以外で ended なら null。ended=false なら elapsedMin は常に null。
`content-entry.js:9518` IIFE 先頭と `resolvePanelSummaryStreamAgeMin` 冒頭に「`ed.ended` なら `return ed.elapsedMin`」を入れる。

### 4.2 バグ2a（0.1.1558）
`nicoAnonymousDisplay.js`: `NICO_HASHED_ANON_USER_ID_RE = /^[A-Za-z0-9_-]{16,40}$/`、`isNiconicoHashedAnonymousUserId(userId)`（空/`__`始まり/全桁数字は false）、`isNiconicoAnonymousUserId = a: 規則 || hashed`。
`giftDisplayNickname.js:365` `/^a:/i` → `isNiconicoAnonymousUserId(uid)`。
`comeviewUserNotes.js:123` → `isNiconicoAnonymousUserId(s)`。
`userThumbGrid.js:50-56` ローカル `isAnonymousLikeUserId` → 正本へ委譲。
自動で広がる箇所（変更なし）: supportGridDisplayTier.js:23,73,139 / storyUserLaneDisplaySrc.js:49 / ndgrChatRows.js:54 / page-intercept-entry.js:626,631 / storyUserLaneMeta.js:55。

### 4.3 バグ2b（0.1.1559）
`broadcastReportSummary.js:146` / `reportCommentsCsv.js:63` / `storyUserLaneSort.js:13` / `supporterChikuranScore.js:156` を `isNiconicoAnonymousUserId` へ。`compactNicoLaneUserId` の `a:` 短縮は現状維持。`liveRankingView.js:285` は前処理なので無変更。

### 4.4 バグ3（0.1.1560）
新規 `src/lib/ndgrViewBasePick.js`:
```js
export const NDGR_VIEW_BASE_RECENT_MAX = 4;
export function pushRecentNdgrViewBase(recent, base, max = NDGR_VIEW_BASE_RECENT_MAX): string[]
export function parseNdgrViewBaseCandidates(recentAttr, latestAttr): string[]   // latest を必ず先頭
export function pickNdgrViewBase(candidates, deadBases): { base, reason: 'none'|'latest'|'skip_dead'|'all_dead' }
export function shouldMarkNdgrViewBaseDead({ stopReason, rows, seg }): boolean
```
`page-intercept-entry.js observeNdgrViewUri`: `_ndgrViewUri.recent` を `pushRecentNdgrViewBase` で更新し、変わったときだけ `data-nls-ndgr-view-uri-recent`（JSON 配列・各 300 字）を書く。既存 2 属性は無変更。
`content-entry.js`: `readNdgrViewBaseCandidates()` 追加、`_ndgrDeadViewBasesByLiveId`（liveId→Set）追加、`runNdgrBackfillOnce` で `pickNdgrViewBase` → `viewBase`、`_backfillProgress.viewPick/viewBaseHash` 診断、finally で `shouldMarkNdgrViewBaseDead` なら死亡集合へ追加。`publishBackfillProgress` の storage 書き出しに `viewPick`/`viewBaseHash` を追加（additive）。一過性リトライは無変更。SW backfill / heartbeat / ndgrForward は `readNdgrViewBaseUri()` のまま。

契約: `data-nls-ndgr-view-uri`（既存・最新 1 本）/ `data-nls-ndgr-view-uri-recent`（新・JSON 配列 最大 4・各 300 字）。

---

## 5. Testing Decisions
### 5.1 純関数テスト（vitest）
- `embeddedDataExtract.test.js`: pickProgramEndAt（実値 1695040646→ms / 無し→null / 負値→null）、pickProgramStatus、describeEmbeddedProgramElapsed（ENDED→97 / ENDED+end無し→null / end<begin→null / ON_AIR→ended:false / null props）。
- `nicoAnonymousDisplay.test.js`: hashed 27 文字・先頭 `-` の 20 文字は匿名／数値・`__anon_ad_2`・9 文字・41 文字・日本語・空は非匿名／`a:` 規則不変／`anonymousNicknameFallback(hashed,'')==='匿名'`。
- `giftDisplayNickname.test.js`: hashed → ''（既存 `abc-xyz`・50 字 x・数値 `u/` は不変）。
- `storyUserLaneMeta.test.js`: hashed + nick 空 → nameLine「匿名」。
- `userLaneCandidatesFromStorage.test.js`: hashed 集約行に `u/` を合成しない。
- `comeviewUserNotes.test.js` / `anonLabelSingleSource.test.js`: hashed も匿名NNN・同 uid 同番号。
- `ndgrChatRows.test.js`: `a:` 無し chat にも nickname「匿名」。
- 2b: 各既存テストに 1 ケース（無ければ正本テストに委ねる）。
- 新規 `ndgrViewBasePick.test.js`: push（先頭/重複移動/上限/空）・parse（JSON/壊れ/非 https）・pick（none/latest/skip_dead/all_dead）・shouldMarkDead（true 3 理由・rows/seg>0 false・他理由 false）。
### 5.2 配線テスト（ソース文字列）
- `src/extension/embeddedProgramElapsed.wiring.test.js`: `describeEmbeddedProgramElapsed(` が content-entry に 2 回以上、各出現の近傍で `.ended` を条件に return。
- `src/extension/ndgrViewBasePick.wiring.test.js`: page-intercept が新属性を setAttribute し `pushRecentNdgrViewBase(` を呼ぶ／content が新属性を getAttribute し `pickNdgrViewBase(` の `.base` を viewBase に使い `shouldMarkNdgrViewBaseDead(` の結果で `.add(`／`readNdgrViewBaseUri()` の呼び出し数が 7 のまま。
- `formatNicknameWithUidFallback` 本文に `/^a:/` が残っていない。
### 5.3 実機確認（/nicolive-selfcheck）
| バグ | 見る場所 | 完了条件 |
|---|---|---|
| 1 | `nls_watch_snapshot_lv342383970.streamAgeMin` / `nls_panel_summary_*.streamAgeMin` | 両方 97。popup チップ「1時間37分」 |
| 2a | `nls_lane_mirror_v2` 各段 | 非数値 uid の `nameLine` が `/^u\//` に一致しない・`displaySrc` が `data:` |
| 2a | `nls_cchunk_*` 新規行 | hashed 行に `nickname:'匿名'` |
| 3 | `nls_backfill_progress_v1` | `rows>0`・`stopReason!=='stalled'`・`viewPick∈{skip_dead,latest}`・`viewBaseHash` が `BBwq81…` の末尾。記録件数が 442 から増える |
生放送 1 本: `streamAgeMin` が 2 分で増える／`viewPick==='latest'` かつ `rows>0`／`a:` uid の表示が修正前と同一／`nls_live_ended_*` が立たない。
### 5.4 変異テスト
ended ゲート除去→ON_AIR ケース赤／content の return 片方除去→wiring 赤／a: のみに戻す→hashed ケース赤／下限 8→`ch2640322` 赤／`__` 除外除去→`__anon_ad_2` 赤／`formatNicknameWithUidFallback` を `/^a:/` に戻す→hashed・wiring 赤／pick が dead 無視→skip_dead 赤／全 dead で ''→all_dead 赤／shouldMarkDead が rate_limited で true→赤／新属性 setAttribute 除去→wiring 赤。

---

## 6. Out of Scope
広告pt/ギフトpt／/live/ の見た目取り込み／同接推定の終了枠挙動／`BBwT4…` view の正体／(A) view entry decode／crawl 内の早期見切り（新 stopReason）／死亡マークの永続化／SW backfill・heartbeat・ndgrForward の view 選択／`nls_live_ended_*` を ENDED で立てる／`isAnonymousStyleNicoUserId`・`nicoliveDom.js` の境界変更／popup レーン nameLine の「匿名NNN」化／既存 storage の `u/` クリーニング／`is184` 再定義・CSV 列名変更／`data-nls-ndgr-view-uri-count` の借金回収／`compactNicoLaneUserId` の hashed 専用短縮。

---

## 7. Further Notes（地雷）
1. `anonymousNicknameFallback` を広げると hashed 行に `nickname:'匿名'` が保存される（`a:` と同形）。`ndgrChatRows.test.js` で固定。
2. `__anon_ad_2` 等は `__` 接頭辞で除外。`topSupportRankStripLines.js:295-299` は `isAnonOfficialDomRank` を先に見るので二重ガード。
3. 属性は追加のみ。`data-nls-ndgr-view-uri` の意味と 7 箇所の読み手は不変。
4. 属性予算（v0.1.1460）: `recent` が変わったときだけ書く。
5. `scripts/feature-map.mjs` の属性台帳・`FEATURES` 辞書に `src/lib/ndgrViewBasePick.js` を足し `npm run feature-map` / `npm run tree-map`（`git add -A` の**後**）。
6. max-lines ラチェット: content-entry への追加は ~25 行以内。ロジックは lib。
7. CRLF 混在で置換が空振りすることがある。
8. `giftDisplayNickname.test.js:66`（50 字 x）は上限 40 のおかげで不変。
9. `comeviewAnonLabel` の契約「匿名形式でなければ空文字」は `mediaKitHtml.js:149` / `supportTimelineHtml.js:28` が依存。数値除外と charset で担保。
10. タイムシフトの seed は `programStartSec + offset` 候補に依存。`endTime` 追加で壊れない。
11. 死亡集合のリセットは `_backfillTransientRetryByLiveId` と同じ場所。実コードで reset 箇所を確認してから置く。
12. 終了直後の生放送は本仕様無反応（U5）。
13. 2b の CSV は利用者の出力物: changelog に「タイムシフトの匿名コメントも is184=true」と明記。
14. changelog summary 35 字以内・`npm run verify:bump`。
15. 修正前に lv342383970 の `nls_lane_mirror_v2` と生放送 1 本のスナップショットを取り、修正後と差分で見る。

---

## 仕様に根拠がない断定（assumption list）
- A1: hashed 長さ 16〜40 は実測 2 点（20 断片・27）と `a:` 本体 16 からの設計値。
- A2: `program.status` の ENDED 以外の値は未確認（ENDED のときだけ凍結なので依存しない）。
- A3: ON_AIR で `endTime` が予定終了として入るかは未確認（status ゲートで無視）。
- A4: 生放送で `a:` 無し hashed が出ないことは docs 記録のみ。出ても段付けは変わらず名前行が `u/`→`匿名` になるだけ。
- A5: `nls_lane_mirror_v2` の上書きタイミングは未確認（§5.3 で実測）。
- A6: `pickGiftRankDisplayNickname` が stored `'匿名'` をそのまま通すことはコメントのみで確認。
- A7: page-intercept 向け DOM ハーネス付き vitest は無い前提（ソース文字列テスト）。
- A8: 健全な view で「backward URI あり＋本文 0 byte」が連続しないとは仮定していない（だから早期見切りは入れない）。
- A9: feature-map の属性台帳が新属性を自動で通すかは未確認。
- A10: `viewBaseHash`（token 末尾 12 字）は公開 URL の一部で秘密ではない前提。

---

## 実装後の訂正（2026-10-05・司令塔の実機計測で判明）
- §5.3「`nls_cchunk_*` 新規行の hashed 行に `nickname:'匿名'`」は**誤り**。chunk に保存される行は
  `{capturedAt, commentNo, id, liveId, text, userId, vpos}` で、数値 uid でも `nickname` は保存されない
  （実測 8,465 行すべて nickname 無し）。表示側（storyUserLaneMeta / comeviewAnonLabel）が uid から「匿名」を
  導くので利用者には影響しない。A6 相当の仮定だった。
- §5.3 の「記録件数が公式 11175 の 95% 以上」は未達: `reached_start` で 8,464 行取得・記録 9,180 / 公式 11,175（82%）。
  stopReason は `reached_start`（配信開始まで遡り切った）。差分の内訳（ギフト/運営行の除外・重複排除・公式カウントの定義差）は未調査。
