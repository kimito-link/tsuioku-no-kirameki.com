# 実装ハンドオフ: ①POP応援レーンと会場モードのメンバー完全一致(v0.1.1111〜)

> この1枚だけで着手できる。設計正本=[memory/reference_pop_venue_parity_SYNTHESIS.md](memory/reference_pop_venue_parity_SYNTHESIS.md)(Fable設計・司令塔裏取り済み・2026-07-08)。
> 実装は別モデル(次チャット)。会議→Fable→実装の3段構えの手順3。

## 読む順
1. この1枚(スコープと完了判定)
2. 設計正本の §0(一致の定義=P/T/X 3層)と §C(具体機構)・§G(地雷)
3. 触るファイルの現物: `src/extension/venueBar.js`(供給と描画の結線部)・`src/lib/laneMirror.js`+`src/lib/laneMirrorKey.js`(鏡=正本)・`src/lib/venueLaneBuckets.js`(現行の会場段仕分け)

## 背景(1分)
- 会場は v0.1.789 から①と同じ storage 集計が母集団(`VENUE_ROSTER_ENABLED=false`・venueBar.js:53)だが、**段判定の入力合成が別実装**(avatarObserved:false固定・uid導出URL混入)+**ギフト/広告段が未配線**(bucketVenueLaneSeats が gift:[], ad:[])のため、実機で「りんく段①40 vs 会場43」「会場に広告段が無い」の不一致が出ている(2026-07-08 lv350912687 で確定)。
- 解 = **①が実paintした5段buckets の鏡(既存 `KEY_LANE_MIRROR`='nls_lane_mirror_v1')を会場の正本に昇格**。会場は「P層=鏡そのまま + T層=cap溢れを末尾に継ぎ足し(全員500) + X層=直近発言者(60秒猶予)」で描画。一致は計器が1行トークンで言い切る。

## スコープ(MVP=Phase 0+1 のみ。Phase 2/3 はやらない)

### Phase 0: 計器(先にやる・描画に触らない)
- 新規 `src/lib/venueLaneParity.js`(純関数)+ テスト: 会場の実段割当列 vs 鏡 を突合し `{mode, perTier, unexplained, verdict, line}` を返す(スキーマは設計正本 §C-2)。
- venueBar.js の `publishVenueSeatsDiag` に同梱(新storageキーを作らない)。状態速報に1行出す。
- 新規 `src/lib/venueLaneParity.wiring.test.js`: venueBar.js ソースに `buildVenueLaneParity(` 呼び出しが存在することを assert(配線忘れ=CI赤)。
- **完了判定**: verify:cc 全緑 + 実配信の状態速報に `会場一致 🔴 link: extra3(13702502,…) / ad: pop10 venue0` のような分類付きトークンが出る(=既知の不一致が計器に写る)。

### Phase 1: 鏡消費(本体)
- 新規 `src/lib/venueLaneMirrorSupply.js`(純関数)+ テスト: `isLaneMirrorUsableForVenue`(usable判定: 同liveId & age≤180s)/`venueRowsFromLaneMirror`(鏡→会場rows・**preCount/preHasGift/preGiftCount を aggregatedCandidates から join**=L7)/`composeVenueLaneBuckets`(P+T+X合成)。鏡セル復元は既存 `restoreLaneMirrorBuckets`(laneMirror.js:105)を再利用。
- venueBar.js 差し替え **2箇所+1分岐だけ**:
  1. `handleStorageChange` に `changes[KEY_LANE_MIRROR]` 分岐(newValue直採用→閉包 `laneMirrorSnap` 更新→rAFで commitDisplay 再実行)+ open 時 catch-up read 1回。
  2. aggregateParticipants の `baseRows = venueRowsFromUserLaneCandidates(...)` を「usable なら鏡由来rows+tail、でなければ既存」に。
  3. renderSeats の `bucketVenueLaneSeats(...)` を「mirror mode なら `composeVenueLaneBuckets(...)`、fallback なら既存」に。
- mergeSpeakersIntoVenueRows は不変(鏡非在籍の発言者に `_venueTransient:true` を付けるだけ)。
- **完了判定**: 実配信で token ✅(全段プレフィックス一致・会場に広告段10人が出る)/ ①パネルを閉じ180s後 ⚪fallback へ自動降格→再開で復帰 / 吹き出し・ギフト投げ・読み上げ・順位バッジ・VIP光らせ生存(reality-checker) / `renderStoryUserLaneDom.js`/`personTileDom.js` の diff ゼロ。

## 着手手順
1. ブランチ `feat/venue-lane-mirror-parity` を master(0ae3fa77+)から。
2. TDD: venueLaneParity.js のテストから(fixture=実機ケース: 鏡 link40 vs 会場 link43(extra 13702502/33687377/96090801)・ad pop10/venue0 → 🔴 と分類が出る)。
3. Phase 0 実装 → verify:cc → bump(1変更=1 patch・manifest/package/changelog 同期) → 実配信で計器確認。
4. Phase 1 実装 → verify:cc → reality-checker(自己採点禁止) → bump → 実機確認。
5. 反映3手順(pull→拡張リロード→watchタブF5)を報告に併記。

## 地雷(必読・設計正本 §G の要約)
- **絶対に触らない**: enrich関所 commitDisplay(v0.1.1110)/ diff-skip(storyLaneTierBodyKey)/ buildPersonTileEl・wrapTileEl の DOM 経路 / venueViewport の間引き層 / VENUE_ROSTER_ENABLED(=false のまま)。
- 供給はどちらの mode でも必ず commitDisplay を通す(入口を変えない)。
- preCount/preHasGift/preGiftCount を鏡由来 rows で落とすと VIP光らせが死ぬ(v0.1.734の轍)→ join をテストで固定。
- 一致判定は「diag時に storage 再読み」ではなく「この paint に使った snap の参照」と比べる(TOCTOU・嘘の緑防止)。
- 鏡縮退(512KB自衛で cap 半減)時は ✅ を出さず ⚪鏡縮退(mirrorPruned)。
- storage 書き込みキーの新設禁止(venueSeatsDiag への同梱のみ・+~2KB)。③jsonBlob(112%)に足さない。
- Phase 3(①のcap 200→500)は**今回やらない**。やるときは `laneDisplayLimit.js` 定数集約+容量3ゲート(設計正本 §E)。

## 転記元(実在確認済みパス)
- 鏡: `src/lib/laneMirrorKey.js:11`(KEY_LANE_MIRROR)・`src/lib/laneMirror.js`(build/restore・512KB自衛:91-96)・`src/extension/popup-entry.js:6804/7253`(publishLaneMirror)・limit=200: popup-entry.js:6566
- 会場: `src/extension/venueBar.js`(:53 VENUE_ROSTER_ENABLED / commitDisplay=enrich関所 / renderSeats / handleStorageChange / mergeSpeakersIntoVenueRows)・`src/lib/venueLaneBuckets.js`(:36 venueSeatEntryToLaneItem・:95 bucketVenueLaneSeats)・`src/lib/venueSeats.js:752`(venueRowsFromUserLaneCandidates)
- 段判定: `src/lib/supportGridDisplayTier.js`(TIER_RULES:142-149・explain版あり=計器に使える)・`src/lib/storyUserLaneBuckets.js`・`src/lib/storyUserLaneSort.js:22`
- 参考の同型実装(③WEB鏡の消費側): popup-entry.js:6848/6971(restoreLaneMirrorBuckets→本物lib paint)
