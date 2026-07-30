# 実装ハンドオフ: 大配信激重の根治アーキテクチャ（この1枚で着手できる）

> 3段構え(/council-fable)の手順3。**設計=Fable / 裏取り=司令塔 / 2026-07-07**。
> 実装は次段(別モデル)。この1枚だけで着手できる粒度で書いた。設計の全文は
> [memory/reference_robust_architecture_SYNTHESIS.md](memory/reference_robust_architecture_SYNTHESIS.md)。

## 読む順（最短）
1. この1枚（スコープ・着手手順・地雷）
2. `memory/reference_robust_architecture_SYNTHESIS.md` の **A（真犯人）と E（MVP）と G（移行表）と H（地雷）**。B〜Dは必要時に。
3. `AGENTS.md` §3（設計判断）・§12.5（bump粒度+反映3手順）
4. 触るファイルだけ実読: `src/extension/status-entry.js`（1527-1670 と 300-305）・`src/lib/liveViewPublishSignature.js`・`src/lib/laneMirror.js`（pruneの手本）

## 真犯人（1行）
**`KEY_LIVEVIEW_PUBLISH_PAYLOAD`（0.5MB級ジャンボキー）を 3秒間隔で set → onChangedファンアウトで ~20-30MB/分が browser process の storage/IPC を輻輳させ、無関係な postMessage 配達（13秒滞留）や入力まで巻き添えにしている。** voiceは温度計（対象外）。publish45分停止は「publishがstatusページ生存に人質」の別欠陥。

## ★進捗（2026-07-07 更新）

- **Phase 0（計器のみ・挙動不変）= 実装済**。commit `65fe7722`・ブランチ `feat/robust-arch-phase0-instrument`・**PR #241**（master ベース・未マージ）・v0.1.1101。
  - C-2 書込台帳(`src/lib/storageWriteLedger.js` 新規 + `safeStorageLocalSet` にフック1つ)。status:live に「書込上位5キー bytes/分」。
  - C-1 配達/描画ギャップ分離(`instantPushDiag` に `lastDeliveryGapMs`/`avgDeliveryGapMs`)。status:live に「内訳: 配達平均◯ms / 描画平均◯ms」。
  - reality-checker が C-3 の import 取りこぼし(`buildStorageWriteLedgerLines` 未import→safeSection 握りつぶし→書込台帳永久空欄)を発見・修正済。教訓=`npm run verify:cc` 一本で回す([[verify-cc-lint-catches-unwired-import-2026-07-07]])。
- **★Phase 1 = MVP = 実装済**（2026-07-07・commit `0517180a`・v0.1.1102・ブランチ `feat/robust-arch-phase0-instrument` に push 済／未マージ）。
  - min-gap `3000→12000ms`（`LIVEVIEW_PUBLISH_MIN_GAP_MS`・書込頻度-75%）。
  - 容量prune はしご = 新規純関数 `src/lib/pruneLiveViewPublishBlob.js`（448KB超で ①commentTimelineMirror.rows半減 →②topSupporters.rows 10→5 →③statusReport切詰め）。`publishLiveViewPublishPayload` の set 直前に配線。
  - 嘘つかない: `snapshotMeta.pruned` に内訳を残し、`liveviewPublishSelfDiag` のコメント鏡①vs③突合を prune時「正常(容量削減)」扱い（本物の欠落は🔴のまま）。
  - 計器: `getLiveViewPublishPruneCount()` を status:live 概要に併記（0回なら空）+ ⚠️削減行。
  - reality-checker verdict=pass。verify:cc 全9ゲート緑。新規テスト13件。
- **★次 = 実配信で計器を1回読む**（Phase 0の書込台帳=`KEY_LIVEVIEW_PUBLISH_PAYLOAD` bytes/分 と 配達/描画gap）。狙い: (i)書込≦2.5MB/分 (ii)jsonBlob≦87% (iii)instantPush avgGap 13,475→<2,000ms を実測で確認。**外れた場合の分岐**=deliveryGap支配なら設計通り／paintGap支配なら Phase 3(fullText dirty-skip)を繰り上げ。
- **その後 = Phase 2**(SW-alarm publisher・publish45分停止の根治)／**Phase 3**(fullText dirty-skip)。設計は SYNTHESIS.md C-4/C-5。
- sound作業は `stash@{0}`（pachinkoブランチ)に退避中。

## スコープ = まず MVP（Phase 1）だけ。次に Phase 0 を先に出すのが安全

⚠️ 表の順は「0→1」だが、**Phase 0（計器）を先に出す**のが正しい。MVPの効果を測る物差しが要るため。実際の着手順:

### 着手1: Phase 0（計器のみ・挙動不変）— patch v+1
- **C-1 配達/描画ギャップ分離**: `handleInstantCommentPushMessage`(status-entry.js ではなく **popup-entry.js:6031**)冒頭で `const handlerAt = Date.now()` を取り、`sentAt` との差 `deliveryGapMs` を既存 `diagFlushThrottle` 経由の instantPushDiag に積む（新規 direct set を作らない）。EMA は既存 `computeInstantPushGapAverage`(instantCommentPush.js:193) を流用。
- **C-2 書込台帳 `storageWriteLedger`(要新設)**: `src/lib/safeStorageLocal.js` の set ラッパにフック1つ。キー名→{回数, 概算bytes}。**上位5キーのみサンプリング**（全キー stringify は重い）。flush は `diagFlushThrottle` 流用（10秒）。status:live に「書込上位5キー bytes/分」1行。
- **完了判定**: 新フィールド `avgDeliveryGapMs` と「書込上位5キー」が status:live に出て、**既存の全数値が不変**（＝挙動不変の証明）。

### 着手2: Phase 1 = MVP（費用対効果最大の1手）— patch v+2
- **頻度**: `status-entry.js:1672`（★Phase 0 で +15 ずれた・旧1657）の `if (now - _liveViewPublishPayloadLastWriteAt < 3000)` の **`3000` → `12000`**。既存の軽量sig skip(liveViewPublishSignature.js)はそのまま。
- **サイズ pruneはしご `pruneLiveViewPublishBlob`(要新設)**: set 直前（status-entry.js:1678・旧1663 の直前）に `JSON.stringify(blob).length` を測り、**448*1024 超**なら順に削る: ① `commentTimelineMirror.rows` 半減（`.rows` は実在=commentTimelineMirror.js:16 typedef 確認済） → ② `topSupporters.rows` 10→5（jsonBlob:1576 で `{liveId, rows}` 形） → ③ `statusReport`（=fullText文字列・jsonBlob:1601）末尾切詰め+「※容量超過のため切詰め」。手本=`laneMirror.js:30` の cap半減パターン(`LANE_MIRROR_MAX_JSON_BYTES=512*1024` + rows≤8 で break)。
- **純ロジックは lib へ**: `pruneLiveViewPublishBlob(blob, {maxBytes}) => {blob, pruned[]}` を新規 lib + ユニットテスト(TDD)。jsonBlob 組立(1555-1581)は status-entry のまま、prune だけ純関数に。
- **嘘つかない**: 削ったら `jsonBlob.snapshotMeta.pruned = [...]` を必ず残し、`liveviewPublishSelfDiag.js` が1行表示。**①vs③の件数突合が pruned を正常扱いする分岐を同patchで入れる**（地雷: lane-limit-200-mirror-cap-parity）。
- **消す側に計器**（鉄則: story-userlane-churn-v1039）: prune 発動回数カウンタを status:live に。
- **完了判定**（大配信中の status:live）: (i) `KEY_LIVEVIEW_PUBLISH_PAYLOAD` 書込 ≦2.5MB/分 (ii) jsonBlob ≦87% (iii) instantPush `avgGapMs` 13,475→<2,000ms (iv) prune発動時に明記行。

**MVPが13秒を消す論拠**: v0.1.1062 で read頻度を下げただけで Chrome全体フリーズが緩和した実測前例（同じLevelDB/IPCバックエンド）。write側最大の蛇口を -77% に絞る。**外れた場合の保険**=Phase 0 の deliveryGap/paintGap 分離で次の1手が数値で確定（deliveryGap支配→設計通り / paintGap支配→Phase 3を繰り上げ）。

### 着手3以降: Phase 2（SW-alarm publisher）→ Phase 3（fullText dirty-skip）
- 設計 SYNTHESIS.md の C-4 / C-5 と G表の通り。Phase 2 は publish の45分停止を根治（statelessな read→POST。既存 `shouldAutoPublish`(autoPublishDecision.js:43) と live-view-entry.js:145-159 の read+POST を流用）。Phase 3 は Phase 0 で paintGap 支配と出た時に優先。

## 着手手順（ブランチ + TDD）
```bash
git checkout -b feat/robust-arch-phase0-instrument   # Phase 0。以降 phase ごとにブランチ
# TDD: 純関数から。pruneLiveViewPublishBlob と storageWriteLedger の集計は lib に切り出しユニットテスト
npm run test:cc            # verify:cc / test:cc を使う（verify 直/パイプは Claude ターミナルでハング）
npm run typecheck
```
- **純ロジックは lib に出してテスト**: `pruneLiveViewPublishBlob(blob, {maxBytes})` → `{blob, pruned[]}`、台帳集計、sig-skip。DOM/chrome依存は薄いアダプタに寄せる。
- テスト手本: `src/lib/autoPublishDecision.test.js`・`liveViewPublishSignature` 周辺の既存テスト。

## 機械的な完了判定（このハンドオフの Done）
- Phase 0: status:live に `avgDeliveryGapMs` と書込台帳上位5キーが出る／既存数値不変／test:cc緑・typecheck緑。
- Phase 1(MVP): 上の (i)-(iv)。ローカルで `npm run status:live` が新フィールドを表示。
- 各patch: `npm run verify:bump` 緑（manifest/package/changelog 同期）・反映3手順を push 報告に併記。

## 地雷（壊すな・SYNTHESIS.md H の要約）
- **即時プッシュ経路（content→iframe postMessage・popup-entry.js:5964 diff-skip・nonce検証 instantCommentPush.js:65-76）に手を入れない**。C-1計器はハンドラ冒頭の時刻取得のみ。
- **新規 per-tick 書込は必ず `diagFlushThrottle` 経由**。direct set を1つも増やさない。
- **prune で行数を削るときは `snapshotMeta.pruned` に明記** し、①vs③件数突合を pruned 許容に（嘘の🔴防止）。
- **SW は stateless のみ**（キュー/未flush状態を持たない＝~30秒死対策）。リトライは次alarm/次flush周期まで待つだけ（同期密ループ禁止）。
- **voice には触るな**（offscreen移設は却下済み。根拠=voicevoxClient.js:305-323 が非同期fetch）。
- 配信視聴中の `npm run copy:ext` 禁止（版混在バナー地雷・AGENTS.md §12.5）。

## 転記元の実在パス一覧（司令塔が2026-07-07に裏取り済み）
- 書く: `status-entry.js:1652-1668 publishLiveViewPublishPayload`（min-gap 3000=1657／set=1663）
- jsonBlob組立: `status-entry.js:1527-1596`（statusReport同梱=1586）
- 購読(ファンアウト): `live-view-entry.js:257-259`／read+POST手本: `live-view-entry.js:144-159`
- キー: `storageKeys.js:563 KEY_LIVEVIEW_PUBLISH_PAYLOAD='nls_liveview_publish_payload_v1'`
- prune手本: `laneMirror.js:30 LANE_MIRROR_MAX_JSON_BYTES=512*1024`／自己診断: `liveviewPublishSelfDiag.js`
- 流用ヘルパ: `diagFlushThrottle.js`／`inFlightGuard.js`／`storageOpTimeout.js`／`liveViewPublishSignature.js`／`autoPublishDecision.js:43 shouldAutoPublish`
- 権限: `manifest.json:14 unlimitedStorage / :17 alarms / :21 offscreen`
- sig-skip手本: `status-entry.js:300-305 _lastLivesSig/_lastHealthSig`

## 実装は今やらない
次チャットで **この HANDOFF を読ませ → `feat/robust-arch-phase0-instrument` を切り → 別モデルで Phase 0 から MVP を TDD 実装**。各 phase 完了ごとに司令塔が `git diff` 読み戻し + `/code-review` + reality-checker 検証 + reference/MEMORY 更新。
