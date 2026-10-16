# 起動静穏窓(boot quiescence)— 設計+実装ハンドオフ(2026-10-16)

> ★★【却下済み(2026-10-16 実装→実測)】実装して flag on/off を同じ配信で交互に各4回測定した結果、効かなかった: storage.get 回数 OFF 598〜646 vs ON 621〜736(減らない)・読み出し量 OFF 3.6〜8.1MB vs ON 10.6〜11.5MB(増える)・BUSY% 差なし。仮説H1(起動中の refresh 再発火の連打)は誤り、または別経路が主。コードは破棄。**再提案しない**。次は「初回 refresh の中で何を何回読んでいるか」の時系列(--trace と --gets の時刻順)から。以下は経緯として残す。

> 設計=Fable(council-fable 手順2) / 素材=無料会議5体(参考のみ・誤りあり) / 裏取り=司令塔(関数名の実在確認済み。行番号は Fable の読みで未再確認=着手時に grep し直す)。
> 実装は【まだしていない】。次チャット/別モデルで着手。

## 結論
起動が重いのは1回の処理ではなく、起動直後から定常時の更新経路(storage.onChanged→450msスロットル→`refresh()` / 北極星 tick 0・400・1500・4000ms / 3秒 poll)がキャッシュの冷えた状態で全速で回るため、という仮説(H1)。MVP=初回 `refresh()` が完走して幕が外れるまで、これらの描き直し要求を1本の trailing に畳む(上限4秒で fail-open)。

## 先にやる(作り込み前・安い確かめ)
同じ lv・実機データ複製で `node scripts/perf-ab/boot-profile.mjs --lv <lv> --gets 1 --seconds 8` を5回。`[gets-by-keys]` の「refresh 1回につき必ず1回読む19キーの設定bag」の回数=refresh 回数。**≥6 なら H1 採用、≤2 なら取り下げ(H2=1回が重い)**。**司令塔の先行測定(2026-10-16・3回・実配信 lv351605203・8秒)**: 起動8秒に同じ読み出しが 繰り返されている — nls_gift_subapp_history 55〜69回 / nls_broadcaster_profile 56〜64回 / nls_koken_api_contrib+iframe_official_dom 43〜51回 / nls_gift_users 36〜45回 / nls_comment_ingest_log_v1 29〜36回 / nls_gift_ranking_lane_enabled 24〜28回(軽い読み一式は12〜13回)。複数の更新経路が起動中に何十回も走っている=H1 を強く支持(設定bag 1キー組の厳密な refresh 回数は未確認だが ≥6 は十分満たす)。
併せて `--trace 1` で CrGpuMain の `GPUTask` を前後比較(傾向のみ)。

## 設計
- 新規 `src/lib/bootQuiescence.js`(L0・I/Oなし・時計は引数): `createBootQuiescence({maxMs, enabled})` → `shouldDefer(source, nowMs)` / `release(nowMs)`(pending だった source 一覧を返す) / `snapshot()`。定数 `BOOT_QUIESCENCE_ENABLED=true`、`BOOT_QUIESCENCE_MAX_MS=4000`。enabled=false・release 済み・maxMs 超は常に false(fail-open)。
- `src/extension/popup-entry.js` のフック(各1行・max-lines 余裕0行のため):
  1. `scheduleCoalescedStorageRefresh`: `isAllSelfWrittenRenderArtifacts` 判定の【後】・`coalescedRefreshScheduler.schedule` の【前】に gate(source='storage')。
  2. `northStarTickScheduler.schedule` の前に gate(source='tick')。`setTimeout(tickIndependentNorthStar, 400/1500/4000)` も gate 経由。【同期の初回 `tickIndependentNorthStar()` は gate しない】。
  3. 3秒 poll(`POLL_INTERVAL_MS`)の tick 本体で gate(source='poll')。
  4. 解除: `safeRefresh().finally` の `wasInitialRefresh` 分岐で `release()`。pending だった source を既存スケジューラでそれぞれ1回だけ流す。
  5. `requestSelfCommentInstantPaint` は gate しない。
  6. 速報: `snapshot()` を perfDiag に1項目。`repaintReasons.boot_deferred` を既存計器に載せる。
- 不変条件: 記録キーに触れない/初回 refresh は従来どおり全員描く(タイルは減らない)/フラグ false で完全に旧経路。

## 地雷
- `coalescedRefreshScheduler` と `northStarTickScheduler` は状態を共有しない(v0.1.508 再発の型)。gate は両者の手前・スケジューラ自体は触らない。
- 解除漏れ=更新停止が最悪。maxMs の fail-open を判定関数の内部に持つ。
- popup-entry.js は max-lines 張り付き。ロジックは lib へ。`npm run tree-map` は `git add` の後。dist の日本語は `\uXXXX`、CRLF で置換が空振り、changelog summary 35字。
- 自己書き込みキーの穴(selfWrittenStorageKeys.js)。既存の判定順を変えない。
- 配信切替が窓の中で起きると最大4秒遅れる(許容)。
- 計器を足して満足しない(新規表示は snapshot 1項目だけ)。

## 捨てた案(再提案しない)
- 前回描画のスナップショット即表示: v1527 で入れ v1530 で撤去済み(二供給源の競合・一瞬黒)。
- 顔画像の CSS/SVG 合成: 再標本化・α丸めで画素不一致+タイルごとの mask/blend で再ラスタが増え GPU 側が悪化する向き。
- 記録時/SW/offscreen での顔の前倒し: 記録経路に触る・寄与は主スレッドの約11%(toBlob 665ms/6,020ms)。
- 小さな殻だけ先に開く: 殻は既にある。pull/可視域のみ読む: LOD(v1441 OFF)と同じ穴。
- content-visibility / software canvas / GPU OFF / storage キャッシュ追加: 過去に済み・却下。
- 会議の「React/VirtualDOM」「iframe は独立 compositor を持たない」は誤り/未検証(素の DOM)。

## 完了判定(前後各5回・`make-before.mjs --ref master` で修正前を作る)
| 指標 | 合格 |
|---|---|
| refresh 回数(8秒) | 修正前 ≥6 を確認の上、修正後 ≤3 |
| storage.get 回数 | 563 → ≤250 |
| BUSY% | 80〜97% → ≤60%、最長連続稼働 ≤0.9s |
| Microtask+mojo | 3.3s → ≤2.0s |
| タイル数(.nl-story-userlane-cell) | 前後同数以上 |
| フラグ false | 修正前の数字に一致 |
実機: 配置→拡張更新→サイドパネルを3回開き `npm run status:live` で `repaintReasons.boot_deferred`>0・起動直後の storage_changed 回数の減少・`reveal.paintAt→revealAt` の短縮を見る。黒/縞の体感は補強のみ。回数だけ減って1回が重いなら H2 が次。

## 黒い幕・縞の切り分け(Fable)
拡張側で効く可能性: 起動中の invalidate 回数(本MVP)、`backdrop-filter`(popup.html 付近)・`perspective`・`will-change` が初回画面に乗っているかを `--eval` で数える。拡張の外(直せない): サイドパネルの滑り出し中の未レイアウト・iframe 初期 about:blank の色・ラスタ未完の帯の表示そのもの・外部オーバーレイ。
