# 司令塔の統合（裏取り済み）: 裏タブ backfill 凍結を SW alarm で根治

会議4役応答（groq gpt-oss-120b / groq llama-3.3-70b / nvidia qwen3.5-122b / gemini-2.5-flash・
ローカル全 abort=冷起動）。**4役とも主軸は (A) `chrome.alarms` を駆動源にする**で一致。
(C) WebAudio/wakeLock keep-alive は審査/電力リスクで nvidia・gemini が明確に却下。
(B)「SW に全部移す」は大改造で却下。**結論=A（alarm）+ 既存 SW backfill エンジン（B の資産）の合体。**

## 司令塔の裏取りで判明した「会議が知らなかった事実」（これで案が確定）

1. **SW は既に alarm 駆動の背景ワーカーを本番運用している**（background.js）:
   - `chrome.alarms`（AUTO_BACKUP 5分・AUTOPATROL 0.5分）+ `onAlarm` ハンドラ稼働中。
   - autopatrol は alarm で背景タブを開閉し、`fetch(..., {credentials:'omit'})` で公開ページを叩く。
   - → 会議が「実装できるか？」と論じた alarm 駆動 SW は**既に存在し実証済み**。新規リスクは小さい。
2. **SW backfill エンジンは既に完成度高く存在する**（backfill-sw-entry.js・`importScripts` 済み）:
   - `swFetchBinary`（credentials:'omit'）で NDGR を SW から直接 crawl。
   - SW アイドル死対策の keepalive（`getPlatformInfo` を20秒ごと）内蔵。
   - tab へ送れない時は **storage へ staging**（`nls_swbf_staged_<lid>`）→ content が
     `maybeFoldSwBackfillStaging` で正本へ畳み込む。**タブが凍結でも行は失われない。**
   - transient リトライ・並列スロット・mirror progress も実装済み。
   - **唯一の起動経路が content の throttled tick からの message** = だから裏タブで起動できない。
3. **真因は「凍結」でなく「タイマー間引き(1/分)」**（RT が動いている事実から確定）:
   - 報告は RT 3,291 行が増えている = タブは hard-freeze でなく **intensive throttling**。
   - RT は player の NDGR long-poll（イベント駆動）なので間引きの影響を受けない。
   - backfill は seed 探索（最大20hop）+多数の `await sleep`/`fetch` が **setTimeout 律速**。
     1/分に間引かれると最初の seed すら返らず `seg:0/running:true/stopReason:""` が何時間も続く。
   - ストール検知（content-entry.js:16217）も同じ間引き tick に乗るので時間どおり救援できない。
4. **viewBase は DOM 属性 `data-nls-ndgr-view-uri` で storage に無い**:
   - SW が独立して backfill するには viewBase が要る。content が storage に書いていない。
   - → MVP は「content が viewBase 等を storage に hb（ハートビート）として書く」配線が核。
   - 鮮度: page-intercept(MAIN world)は RT が動く限り最新 view を観測し続けるので、
     content が tick で hb を更新できれば viewBase は新鮮（RT が生きている＝view も生きている）。

## 採用案（MVP・退行ゼロ・最小配線）

**「content が backfill ハートビートを storage に書き、SW の新 alarm がそれを読んで、
前面タブが居ない配信だけ既存 SW crawl エンジンで掘る」**

### データの流れ
```
content (tick・recording 中・viewBase 観測済み)
  └─ setStorageLocalSilent(nls_backfill_hb_<lid>, {lid,viewBase,programBeginAtMs,
        officialCount,recordedCount,foreground,ts})   ← 新規(軽量・1キー/配信)
SW alarm 'nls_backfill_bg_kick'(1分)
  └─ 全 nls_backfill_hb_* を読む
  └─ shouldSwKickBackfillForLive(hb, now, swAlreadyCrawling, hasForegroundTab) が true の配信だけ
       → backfill-sw エンジンの startSwCrawl({lid,viewBase,...}) を呼ぶ(tabId 無し)
  └─ crawl は tab へ送れない(tabId 無し)→ 即 staging に切替→ nls_swbf_staged_<lid> に書く
content (tick・生きている時)
  └─ maybeFoldSwBackfillStaging が staged 行を正本へ畳み込む(★ 繰り返し畳めるよう修正)
```

### 退行ゼロの担保（既存根治を壊さない）
- **v0.1.758 前面優先**: hb の `foreground=document.hasFocus()`。SW は
  **前面タブが1つでも居る配信は kick しない**（`hasForegroundTab` で除外）。
  前面タブが居る時は従来どおり content の高速経路だけが走る＝1bit も変えない。
- **全タブ裏のときだけ** SW が掘る（=今回の困りごとの状況に正確に限定）。
- **storage stall 対策**: SW crawl は既存の有界化（per-request timeout・staging・keepalive）を
  そのまま使う。alarm は1分粒度＝叩きすぎない。並列は既存 `resolveSwCrawlStart`(slots=2)で有界。
- **キルスイッチ**: 新キー `nls_backfill_bg_kick_enabled_v1`（既定 ON だが false で従来動作へ即戻し）。
- **fail-open**: hb 不在/壊れ/alarm 失敗は従来動作に degrade（記録/RT を止めない）。

### 純ロジック切り出し（TDD・src/lib）
- 新 `src/lib/backfillHeartbeat.js`:
  - `backfillHeartbeatKey(lid)` / `buildBackfillHeartbeat({...})` / `parseBackfillHeartbeat(raw)`
  - `shouldSwKickBackfillForLive({heartbeat, now, swAlreadyCrawling, hasForegroundTab,
       maxStaleMs, minGap})` → {kick:boolean, reason:string}
    - kick=false reason: 'no_hb' / 'stale_hb' / 'foreground_present' / 'already_crawling' /
      'no_gap' / 'bad_lid' / 'no_view_base' / 'disabled'
  - すべて純関数（chrome 非依存）。`backfillHeartbeat.test.js` で全分岐テスト。

### SW 側（background.js・手書きミラー）
- `startSwCrawl` を IIFE から `self.__nlsSwBackfill` に公開（backfill-sw-entry.js 末尾で代入）。
  - background.js は `globalThis.__nlsSwBackfill?.startSwCrawl(args)` を呼ぶ。
- 新 alarm `nls_backfill_bg_kick`（periodInMinutes:1）を ensure + onAlarm 分岐追加。
- `runBackfillBgKickTick()`: hb 全読み→前面タブ集合を `chrome.tabs.query` で取得→
  純関数 `shouldSwKickBackfillForLive` で判定→kick。

## 第2フェーズ（MVP の後・今回はやらない）
- hb に rows 進捗をミラーして status に「裏で取得中…」を出す（v0.1.794 と接続）。
- viewBase 鮮度が切れた配信の forward 再活性を SW 側でも持つ。
- per-lv 進捗キーで2配信同時の両方表示。

## 会議の誤り/限界（裏取りで訂正した点）
- groq llama は「content-entry.js の setInterval を chrome.alarms に置換」と書いたが、
  **content の alarm 化はタブ凍結を解決しない**（alarm は SW のもの・content には無い）。
  正しくは SW に alarm を置き、SW が掘る。
- gpt-oss-120b の A+C（WebAudio keep-alive）は CWS 審査リスクで採らない（nvidia/gemini に同意）。
- 「SW に message で content を起こす」案（Architecture 2）は**凍結/間引きタブが message を
  確実に処理しない**ため不採用。SW が自分で掘る（Architecture 1）が確実。
