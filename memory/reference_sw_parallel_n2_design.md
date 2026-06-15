# reference: SW backfill per-lid 並列(N=2)設計正本

> 2026-06-13 Fable 5 司令塔 + 2視点会議(並行性/退行)の確定結論。
> 対象タスク: SWモード既定ON昇格の最後の壁=「SWエンジンが global single-flight で
> 巨大配信1本が最大15分占有」([[reference_backfill_sw_migration_pr1b]] 宿題4)。
> 実装担当: Codex CLI(codex-impl)。検品: Claude Code 司令塔。

## ゴール

`src/extension/backfill-sw-entry.js` の global single-flight(`crawlState` 1個)を
**per-lid 並列(同時 N=2)** に拡張する。N は content 経路と単一ソース化
(`src/lib/backfillSlotPool.js` の `BACKFILL_PARALLEL_SLOTS` を import)。

## 会議で確定した設計判断(逸脱禁止)

### 1. start 応答の契約(最重要・退行視点で確定)

content(content-entry.js:15754-15767)は `res?.ok` だけ見てワンショット guard
`_swBackfillTriggeredForLiveId` を立てる。reason は読まない。よって:

- **同 lid が実行中 → `{ok:true, reason:'already_running'}` の冪等受理**。
  guard が立ち再送が止まる(従来の ok:false だと毎 tick 再送+完走直後に同 lid を
  ゼロから full crawl する穴があった。`resumeFromVpos:null` 固定なので全量再取得になる)。
- **別 lid で満杯 → `{ok:false, reason:'no_slot'}`**。guard 立たず次 tick 再試行=
  スロットが空いたら自然に入る。content 無変更で機能する(実コード確認済み)。
- viewBase 不正 → `{ok:false, reason:'no_view_base'}`(従来どおり)。

### 2. keepalive は「導出」方式(カウンタ手動管理禁止)

`syncSwKeepalive()` 1関数: `crawlRegistry.size + pendingRetry.size > 0` なら
ensure、0 なら stop。状態遷移(start受理/finally終端/retry schedule/retry fire)の
たびに呼ぶだけ。increment/decrement のペア管理を設計から排除=漏れが構造的に起きない。
⚠️ finally 終端の「registry.delete → retry schedule → sync」は**同一同期区間**で行う
(間に await を挟むと一瞬 0 を踏み、並走 crawl が 30 秒アイドル死=v0.1.647 の SW 版再演)。

### 3. retry は epoch 付き台帳

`pendingRetry: Map<lid, {tid, epoch, scheduledAt}>`。

- 同 lid の**新規 start 受理時**と **rows>0 完走時**に clearTimeout + delete
  (stale timer が完走直後の lid を古い viewBase で再 crawl する穴を塞ぐ)。
- timer 発火時: 台帳の epoch が自分と不一致なら何もしない。一致なら delete してから判定:
  - 同 lid 実行中 → drop(完了後の gap 再アームに委ねる)
  - プール満杯 → **scheduledAt からの経過が SW_RETRY_PENDING_MAX_MS(10分)以内なら
    再スケジュール(scheduledAt 据え置き)**、超過なら drop
  - 空きあり → `_swRetryByLid[lid]` を increment **してから** start
    (予算消費は実行直前のみ。再スケジュールで予算を目減りさせない)
- drop した全経路で `syncSwKeepalive()` を呼ぶ。

### 4. registry release は identity guard 必須

finally のクリーンアップは `if (crawlRegistry.get(lid) === state) crawlRegistry.delete(lid)`。
無条件 delete だと、finally 内の await(staging flush / storage.set)中に同 lid が
再始動した場合、新 crawl のエントリを古い finally が消す → 二重 crawl の隙間。
registry エントリは finally の **await が全部終わった後の同期区間**で消す
(flush 中も「実行中」のままにして同 lid 再始動を弾く)。

### 5. start 経路の一本化 + TOCTOU 禁止

listener と retry timer の両方が同じ `startSwCrawl()`(resolve → **同期で** registry.set
→ runCrawl 起動)を通る。**resolve と registry.set の間に await を挟まない**
(onMessage は逐次ディスパッチなので同期なら隙間ゼロ。この不変条件をコメントで明記)。

### 6. lid 正規化

SW 側も `String(lid).trim().toLowerCase()` で正規化(content は正規化済みだが
swBackfillStagedKey と同規約に統一)。純関数に含めてテスト。

### 7. status 応答は後方互換 + crawls[]

`nls_backfill_sw_status` の外部消費者はゼロ(grep 確認済み)だが診断価値のため:
- 旧フィールド(running/lid/rows/seg/retries)= msg.lid 指定があればその lid、
  なければ実行中の先頭、どれも無ければ `lastFinished`(完走後スナップショット。
  現行の「完走後も running:false で結果が見える」挙動の互換)。
- `crawls: [{lid, rows, seg, retries}]` を追加(実行中全件)。

### 8. スコープ外(今回触らない・既知制限として許容)

- KEY_SW_PROGRESS / KEY_BACKFILL_PROGRESS の完走ミラーは現状どおり単一キー
  last-writer-wins(popup は lid フィルタ済み・status のグローバル診断行は
  並列時に後勝ち=既知制限)。
- staging fold-in(content 10748)と SW writeStagedRows の get→set 交差は既存レース
  (下流 commentNo dedupe で二重保存なし・無駄書きのみ)。並列化で頻度は増えるが今回触らない。
- SW モードフラグ OFF→ON フリップ瞬間は legacy(N=2)+SW(N=2)=最大4並列が一過性で
  併走しうる(有界・許容)。
- `recordedCount: state.rows` が run 単発値で累計でない件(既存非効率)は別 PR。

## 実装構成

### 新規純関数 lib: `src/lib/swCrawlSlots.js` + `swCrawlSlots.test.js`(コロケーション)

```
normalizeSwLid(lid) → string
resolveSwCrawlStart({runningLids, lid, maxParallel})
  → {ok, start, reason: 'ok'|'already_running'|'no_slot'|'bad_lid'}
  // start=true は ok かつ新規実行。already_running は ok:true/start:false。
resolveSwRetryFire({runningLids, lid, maxParallel, scheduledAt, now, maxPendingMs})
  → {action: 'run'|'drop_running'|'reschedule'|'drop_expired'}
```

テスト観点(退行視点会議の12項目):
1. 空きあり+未実行 lid → start
2. 同 lid 実行中 → ok:true/start:false/already_running(冪等受理の固定)
3. 別 lid×N 満杯 → ok:false/no_slot
4. lid 正規化(大文字/空白が同一キーに収束)
5. **maxParallel=1 で従来 single-flight と同値**(巻き戻し保証・rotation gate と同パターン)
6. retry: 同 lid 実行中→drop_running / 満杯→reschedule / 経過超過→drop_expired / 空き→run
7. 境界: runningLids に自 lid を含む満杯(already_running が no_slot に勝つ)

### backfill-sw-entry.js の改修

- `crawlState` → `const crawlRegistry = new Map()` + `const pendingRetry = new Map()`
  + `let lastFinished = null`
- `ensureSwKeepalive/stopSwKeepalive` → 内部は維持し `syncSwKeepalive()` を追加して
  全状態遷移点から呼ぶ
- `runCrawl` の finally: ミラー書込(await)→ 同期区間で
  「identity guard delete → lastFinished 更新 → retry 判定/schedule → _swRetryByLid 掃除
  (rows>0 は delete+pendingRetry cancel)→ syncSwKeepalive()」
- listener: lid 正規化 → `resolveSwCrawlStart` → 応答 → start なら同期 registry.set
  → void runCrawl
- `_swRetryByLid` は `= 0` 代入でなく **delete**(幽霊 lid 防止)

### 触らないもの(絶対)

- background.js 既存行 / content-entry.js(無変更で契約が成立する設計にした)
- crawl lib(ndgrBackfillCrawl 等)/ swBackfillStaging / backfillTransientRetry の中身
- v0.1.642〜705 の根治群(波及ゼロを退行視点会議で確認済み)

## 完了条件

- `npm run verify:cc` 全緑
- バージョン bump(v0.1.706)+ changelog 1行(35字以内)
- 実機検証(司令塔・chrome-devtools-mcp): 2配信同時に SW モードで backfill が並走し、
  3本目が no_slot 待機→スロット空きで自動開始すること
