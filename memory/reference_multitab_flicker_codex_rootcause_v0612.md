---
name: reference_multitab_flicker_codex_rootcause_v0612
description: 複数タブ点滅+取得低下の Codex 真因調査結果(課題A)。persist が leader 制御外で per-tab 並列 + retry クールダウン無しが複合真因
metadata:
  type: project
---

# 複数タブ「ローディング点滅」+取得低下 — Codex 真因調査結果(2026-06-03)

レポート正本: `docs/codex-multitab-flicker-investigation-v0612.md`(**完全版・260行**。
当初は末尾切れだったが Codex 完走分が Resilio 同期で揃った。新規発見5件・修正案4案・推奨アクション完備)。

## 確定した真因(複合・上位3つ)

1. ⭐ **`triggerBackfillRetry` にタブ間クールダウンが無い**(popup-entry.js:7728 / 7987 `maybeAutoRetryBackfillFromProg`)。
   backfill が 90 秒で `rotation_yield`(content-entry.js:14981 `GLOBAL_BACKFILL_ROTATION_MS=90_000`)→
   `KEY_BACKFILL_PROGRESS` の `done=1` を全タブ popup が同時受信 → 全タブが retry 発火 →
   `KEY_BACKFILL_ENABLED` の **remove/set ストーム** → 全タブ onChanged 再発 →
   `safeRefresh`→`clearWatchMetaCard`→`paintOfficialNicoStatsStrip(null)` の**数字消し**が点滅に見える。

2. ⭐ **コメント永続化が leader 制御外で per-tab 並列**(content-entry.js: tail 10049 / chunk 10145 / main 10762、
   persistCoalescer 10424)。同一 liveId を N タブで開くと N 個の content script が同じ
   `nls_ctail_<lv>` / `nls_cchunk_index_<lv>` / `nls_comments_<lv>` を独立 read-merge-write →
   各 write が onChanged → 全タブで `coalescedRefreshScheduler.schedule`(throttle 450ms)→
   N 個 popup が 0.45 秒周期で同期 reflow。**取得低下**は read 混雑で `requeueOnReadFail`(10829)/
   `STORAGE_OP_TIMED_OUT`(10867)を踏み、新着 batch が requeue に流れ throughput が落ちるため。

3. ⭐ **rotation_yield 直後のリーダー昇格空白**(content-entry.js:14973-14975 + 15206-15208)。
   前リーダーが done=1 publish → 次リーダー昇格まで秒単位待ち → その間 backfill 伸びず →
   popup は done=1 を「途中停止」と誤解し retry ENABLED を反射 → でも即再開しない →
   「ローディング/数字」遷移。最後は `shouldScheduleBackfillTransientRetry`
   (backfillTransientRetry.js:43)の `backward_exhausted` 再試行上限に達し**13%で終了**。

## Codex 修正案(4案・★推奨=案3)

- **案1**(最小手・15-30分): `triggerBackfillRetry` に **5〜10秒のタブ間クールダウン**(session storage)。
  新 pure module `src/lib/multiTabBackfillRetryCooldown.js`。加えて `maybeAutoRetryBackfillFromProg`
  (popup-entry.js:7987)が `prog.stopReason` を**読まずに**リトライしている → `rotation_yield`/`aborted`
  なら retry しないよう修正。popup 側 retry 上限も追加(現在無制限)。**影響範囲 popup-entry.js のみ・表示不変**。
  → 点滅頻度を 1/N に。
- **案2**(根治・1-2日): persist(tail/chunk/main)を `runIfTabLeader('nls-persist-'+lid, ...)` で **leader-only** に。
  follower は in-memory バッファ保持(昇格時 flush)、WS 傍受は全タブ継続(fault-tolerance)。
  → write 1/N・取得低下(591中79=13%)を 1タブ時 ≒95% に戻す。既存 persist テスト 20+ファイル要全緑。
- **案3 ★推奨**: 案1+案2 ハイブリッド・段階実装。PR_α(案1)→ ユーザー確認 → PR_β(案2)の2独立PR。
  案1だけでは取得低下残り、案2だけでは点滅残るので両方必要。
- **案4**(大改修・3-5日): ウルトラC full deploy(persist集約 + WS dedupe session共有 + 親タブvisibility基準描画)。
  **一般ユーザー(1-2タブ)には過剰** → Codex 判断「案3で十分」。

実装は全て `tabLeaderLock.js` の延長で可能(ウルトラC への投資が無駄にならない)。v0.1.592 baseline 互換。

## 既存防御で効いているもの(=真因ではない)

- 外部API/DOM scrape/backfill/forward は既に leader 集約済(容疑α は部分該当のみ)
- hidden タブの refresh skip(v0.1.440・decideVisibilityAction)→ 容疑β は増幅役で主役ではない
- v0.1.606 の runInterceptReconcile 撤去は負荷減(退行ではない)、TTL 短縮(v0.1.607)も書き手側は抑制済

## 司令塔が次にやること

- ユーザーに観察依頼(レポート「観察ポイント」(a)-(d)): タブ数差・SW DevTools の storage_op_timeout/persistGuardTimeout・
  storage write 頻度(`nls_backfill_progress` が 10 超なら容疑α確証)・DOM 振動間隔
- 修正は (a)→(b) の順。(a) は軽量・即効。(b) は persist 経路に leader 1 段足す中規模改修(会議モード推奨)
- 関連: [[reference_multitab_scale_ultraC_leader_election]](ウルトラC本体)/
  [[reference_standalone_popup_multitab_empty_dash]](v0.1.414・別系統)/
  [[handoff_2026-06-03_evening_session]]
