# 引き継ぎ: サムネ白丸バグ・コメント反応速度(両方とも段階0/MVP完了・次フェーズ未着手)

日付: 2026-07-20。コンテキストウィンドウ上限のため引き継ぎ。

## 現在の状態

- ブランチ: `feat/avatar-stability-mvp`(push済み、最新コミット`07cdf914`)
- バージョン: v0.1.1176
- 作業ツリー: ビルド成果物(`app/dist/live-view.js`・`extension/dist/popup.js`・
  `extension/dist/status.js`)のみ未コミットの差分あり(`npm run build`の副産物、ソース変更
  ではない)。次に作業する際は`npm run verify:cc`を回せば自然に解消される。

## 今回のセッションで扱った2件

### 1. 会場サムネ白丸バグ(venue-avatar-stale-mirror)

**症状**: ユーザーが会場モードの「会場参加者」パネルで、記名ユーザーの顔アイコンが白丸
(サムネ未解決)のまま出ないと報告。実機スクショ2枚(白丸→数十分後に正常回復)+状態速報+
curl実測で真因を特定。

**真因(確定)**: `src/lib/supportGrowthAvatarLoad.js`の画像プローブ(`createSupportAvatarLoadGuard`)
は「一度プローブに失敗(timeout/error)したURLを`failedKeys`に永久登録し、以後いっさい
再プローブしない」設計。TTLもリトライ上限もない。`clearFailedUrls()`の呼び出しはリポ全体で
`popup-entry.js`(配信切替時)の1箇所のみで、`venueBar.js`には無い。さらに応援レーンの
diff-skip機構(`storyLaneTierBodyKey`)により、鏡(popup側が確定したレーンデータのコピー)が
数時間staleのままだとタイルは会場を開いた瞬間の1回しか再構築されず、プローブもその1回きり。
つまり「たまたま最初のロードでネットワーク一時失敗したユーザーは、会場タブを閉じるまで
永久に白丸のまま」というバグ。curl実測で7 UID中5件はCDN URL自体は実在(200)することを
確認済み=「画像が無い」のではなく「一度の一時的失敗が固着している」。

**正本**: リポ直下 `venue-avatar-stale-mirror-DESIGN.md`(Fable設計、司令塔が実機+コードで
裏取り済み)。

**実装済み(段階0、v0.1.1175、push済み)**: 計器のみ・挙動変更ゼロ。
- `supportGrowthAvatarLoad.js`: `failedKeys`をSet→Map化(`kind:'timeout'|'error'`,
  `failCount`, `lastFailAt`を記録)。`getDiagnostics()`に`failedTimeout`/`failedError`/
  `retriedTotal`(常に0・将来拡張用)/`lastFailAgoMs`を追加。
- `venueDomCensus.js`/`venueLaneParity.js`: 上記フィールドを状態速報の「会場一致」行まで
  配線(`顔404=N(t:X,e:Y)`という表示)。
- 既存の`blank`/`blankAnon`(白丸census)・`mirrorAgeSec`(鏡年齢)は**既に実装済みだった**
  (設計時にFableが「新規実装が必要」と提案していたが、実装直前の確認で判明し無駄な重複を回避)。

**次フェーズ(未着手)**: 設計書§C参照。
- 段階1: 負キャッシュTTL+指数バックオフ再プローブ(会場のみopt-in、`retryPolicy`引数)。
  `isProbeRetryEligible`純関数+`retrySweep`(既存`diagDue`3秒min-gapに相乗り)。
- 段階2: 鏡stale二段窓(`VENUE_LANE_MIRROR_HARD_WINDOW_MS`=15分でfallback降格。SOFT窓180秒
  は既存のまま不変)。
- **診断ファースト**: 実機で段階0の計器値(`failedTimeout`/`failedError`/`鏡age`)を1回
  収集してから段階1のTTL初期値(仮30s/10min/5回)を確定させる設計。まだ実機データは
  収集していない。

### 2. コメント投稿の反応速度改善(comment-post-speed)

**症状**: ユーザーが「自分がコメントを打つ反応速度を速くしたい」と要望。

**核心の発見**: 状態速報の「画面実着(echo)2.7秒」はユーザー体感の遅延の正体では**なかった**。
自コメの楽観的表示(pending-self)・送信成功判定(`requestPostCommentToOpenTab`の`result.ok`)・
失敗時ロールバック(`revertLastSelfPostedComment`)は**すべて既に実装済み**。欠けていたのは
「押下直後にレーン再描画を要求するトリガ」1本だけ(`appendSelfPostedComment`呼び出し後、
storage往復→onChanged→450msスロットル→refresh完了を待つだけの配線漏れ)。

会議(council-fable、クラウド3体成功)は「instantCommentPush.jsパターンを自コメに応用」
「専用高速キュー」等を提案したが、Fable設計フェーズの追加コード裏取りで**すべて既存資産の
再発明または劣化**と判明し不採用。

**正本**: リポ直下 `comment-post-speed-DESIGN.md`+`comment-post-speed-IMPLEMENTATION-HANDOFF.md`。

**実装済み(MVP、v0.1.1176、push済み)**:
- `popupStorageRefreshCoalesce.js`: `scheduleImmediate(runRefresh, {floorMs=150})`を追加
  (既存`schedule()`は無変更)。前回実行からfloorMs未満ならスキップ、以上なら即時実行+
  `lastPaintAt`更新(直後の通常scheduleがtrailingに畳まれ2連発しない)。
- `commentPostDiag.js`: `takeOptimisticPaintSamples`(押下→楽観表示描画完了の実測用純関数)+
  `lastOptimisticPaintMs`/`avgOptimisticPaintMs`/`instantPaintRuns`を追加。状態速報3行目
  「楽観表示 直近X秒(平均Y秒) / 即時paintN回」。
- `popup-entry.js`: `appendSelfPostedComment`の戻り値を`Promise<number|null>`に変更(押下
  時刻atを返す)。`requestSelfCommentInstantPaint()`(薄い関数)を`submitComment`の楽観追記
  直後・revert(明確失敗/例外)直後に配線。`renderStoryUserLane`のpaint直後に
  `consumeCommentPostOptimisticPaintSamples()`を配線。
- `coalescerMinMs`(1500ms)・`ndgrFlushMs`(150ms)等の既存フリーズ対策定数には**一切触れて
  いない**(設計の中核原則)。

**次フェーズ(未着手・裁定待ち)**: 設計書§B-3「入力欄の楽観クリア」(押下と同時に入力欄を
空にし、失敗時のみ復元)。UXの是非がユーザー裁定待ちのためMVPに含めていない。

**実機での効果検証は未実施**: 両方とも段階0/MVPの計器・配線までで、実際の配信で
before/after比較はまだ行っていない。

## reality-checker検証で踏んだ地雷(次回も注意)

1. **`instantPaintRuns`カウンタの配線漏れ**: `scheduleImmediate`の戻り値(true/false)を
   握りつぶしてカウンタをインクリメントし忘れる、という「計器を足したのに実際は動いていない」
   バグ。型チェック・既存テストどちらも通過するため機械的に検出されない。**新しい計器の
   カウンタを追加するときは、実際にインクリメントする行まで実装したか必ず目視確認すること**。
2. **`tree-map`再生成漏れ**: ルート直下に新規trackedファイル(DESIGN.md等)を追加すると
   `docs/repo-tree-map.md`の「ルート直下の設定ファイル: N件」がドリフトする。
   `npm run verify:cc`をコミット前に回して緑を確認しても、**コミット後にもう一度クリーンな
   状態で`npm run verify:cc`を独立実行して確認する**のが確実(reality-checkerがこの手順で
   両方の見落としを検知した)。

## 次にやるべきこと

優先順位は特に指定なし。以下のどれからでも着手可能:

1. **実機での効果確認**(推奨・両方に共通): 拡張をリロードして実配信で試し、状態速報の
   新計器(会場の`顔404=N(t:X,e:Y)`、コメントの`楽観表示 直近X秒`)が実際に印字されるか、
   数値が妥当かを確認する。特にコメント速度側は「押下→楽観表示」が理論値(百ms台)に
   縮まっているかを実測すべき。
2. **サムネ白丸の段階1着手**: 実機で段階0の計器値を1回収集してから、負キャッシュTTL+
   バックオフ再プローブを実装。
3. **コメント速度のPhase 2裁定**: 入力欄の楽観クリアをやるかユーザーに確認。

## 関連メモリ

- `venue-avatar-stale-mirror-design-2026-07-20`(会場サムネ白丸の真因確定・段階0実装済み)
- `comment-post-speed-design-2026-07-19`(コメント速度設計・実装完了・reality-checker教訓)
- `avatar-stability-mvp-2026-07-18`(前回セッションのサムネ対策、今回の白丸再発とは別系統の
  地雷=heavyRace single-flight化。この対策自体は今も有効)
- MEMORY.mdの索引にも上記のリンクあり
