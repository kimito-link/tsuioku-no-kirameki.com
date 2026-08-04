# 調査メモ: 「記録 0」表示バグ(小規模配信でコメントが取れているのに 0)

> 2026-06-20 実機。lv350789652(鳥の定点配信)。popup パネルが「記録 0」だが実際はコメント取れている。
> ユーザー指摘「全部正確に・0はおかしい・すべての数字を正確に出すという根底概念が崩れている」=正論(本物のバグ)。

## 実機の矛盾(同一速報内)
- popup パネル「記録 0」 / 概要サマリ「記録 2」=同時に矛盾。
- romiDebug.observedRecordedCommentCount = 2(内部生値)。
- savedCommentsUidStats: totalSaved:1, withUid:1(保存は起きている)。
- ニコ生公式コメント欄に「1 すごい」が実表示=コメントは存在。
- 配信: 公式コメント7件・経過3h22m・来場101・backfill running:true rows:7 done:0。
- 配信者=そらぴっぴなぎ(uid 50878236・interceptFetchLog の /capi/v1/users/50878236/)。

## popup パネル「記録 N」のデータフロー(実コード裏取り)
content-entry.js:717 observedRecordedCommentCount(生値)
→ :736 recordedCountForDisplay(lid) = resolveMonotonicCommentCountForLive(_recordedDisplayMonotonicByLive,...)
→ :10197 buildPanelSummaryPayloadForCurrentLive の recordedCount
→ popup-entry.js:7294 applyPanelMetricsFromContent → setCountDisplay(recorded,...)
→ popup-entry.js:2295 setCountDisplay 内で **2段のゲート**:
   (a) :2311 resolveBroadcasterExcludedCount(配信者本人コメントを差し引く・v0.1.774)
       display = max(0, rawCount - state.count)  ← state.count(配信者コメント数)≥ rawCount で 0 になる
   (b) :2320 resolveMonotonicCommentCount(同一 lv 内で単調増加・v0.1.645)

## 2つの容疑(どちらも小規模配信で 0 を作りうる・静的データでは断定不可)
1. 🔴 **配信者除外の引き算(broadcasterExcludedCount.js)**: rawCount が 1〜2 と極小のとき、配信者本人コメント
   数 state.count を引くと max(0, 1-1)=0 になりうる。大規模配信(ブラジル戦)では数件引いても無視できるが
   小規模(記録2)では 0 に落ちる=「小さい配信だけ0」の症状と一致。設計の盲点(極小件数での引き算)。
2. **単調ゲート(monotonicCommentCount.js)**: 早い paint で 0 を記録し lv キー不一致等で 2 に上がらない。
   ただし monotonic=max なので後から 2 が来れば上がるはず=単独では 0 固定しづらい。①の引き算で 0 に
   なった値が gate に入ると「0 が max」で固まる合わせ技の可能性。

## 確定する観測(実機 DevTools・これでどちらか判明)
watch タブの拡張 content で(or popup の DevTools console):
- `_broadcasterCountState`(popup-entry)の {lv, count} と `_monotonicCommentCountState` の {lv, max}。
- count >= rawCount(=2) なら①配信者除外が真因。max===0 で固まっていれば②or合わせ技。
- content 側: recordedCountForDisplay(liveId) の戻り値 と observedRecordedCommentCount の生値。

## 修正の着眼点(未確定・断定しない)
- ①が真因なら: 配信者除外の引き算に「rawCount が小さいとき 0 に落とさない」下限 or 「配信者コメント数の
  確度が低いとき引かない」ガード。あるいは引き算自体を「公式と並記」する設計に見直し(引かず注記)。
- ②なら: gate に 0 を記録しない(0 は未確定として gate を更新しない)。
- ユーザーの根底批判=「表示用に何段もゲート(単調/配信者除外/床)を積んだ結果、正確さが崩れた」=
  会議で『表示ゲートの簡素化』を設計し直す価値あり(対症の積み増しでなく根治)。

## ⚠️ 過去の関連(memory)
v0.1.792/804 で「記録が増えて減る」を表示単調化+per-live Map で対症してきた経緯。今回は逆に「正しい値が
0 に潰れる」=ゲートの積み増しが別の不正確さを生んだ可能性。対症を重ねず根本(なぜ複数ソース×複数ゲートか)を問う。

## ✅ 真因 確定(実コードで静的に証明・2026-06-20)
**popup-entry.js:13979 `const _broadcasterCount = Math.max(0, countToShow - displayEntriesBase.length);`**
- v0.1.685 のコメント(:13977)「countToShow>displayEntries 差=配信者コメント」=**誤った前提**。
- 「count はあるが表示エントリ(displayEntriesBase)に出ていない分」を全部『配信者コメント』とみなして
  setCountDisplay(:13981 第3引数 recordedBreakdown._broadcasterCount)に渡す。
- setCountDisplay:2311 resolveBroadcasterExcludedCount が display = max(0, countToShow - _broadcasterCount)
  = max(0, countToShow - (countToShow - displayEntriesBase.length)) = **displayEntriesBase.length**。
- ∴ **表示記録数 = displayEntriesBase.length に潰れる**。小規模/ロード中/匿名でエントリが未生成だと
  displayEntriesBase.length=0 → **記録 0 表示**。countToShow(=2)は無視される。
- 大規模配信で正常だったのは displayEntriesBase が十分埋まっていたから(差≒本物の配信者コメント数)。
- 🔗 **今日の匿名作業と直結**: 匿名コメントは記録される(countToShow に乗る)が userId ベースの
  displayEntry を作らない場合 → 差が「配信者コメント」と誤読され引かれる → 0。匿名が増えるほど悪化。

## 止血(最小)案
- ①の前提が崩れる条件で引かない: `_broadcasterCount` は「displayEntriesBase に出ていない分」でなく
  **実際に配信者(broadcasterUserId)が投稿した数**で算出すべき。最小止血=displayEntriesBase.length が
  countToShow より大幅に小さい(エントリ未生成)ときは _broadcasterCount を立てない(0 に潰さない)。
- or setCountDisplay 側で「rawCount>0 かつ displayCount===0 になる引き算」を禁止(実コメントがあるのに 0 表示を作らない)。
- ただし「増えて減る」回帰を避けるため characterization test 先行。

## 根治(会議)= 表示ゲートの簡素化
ユーザー根底批判「すべての数字を正確に出す概念が崩れた」。複数ソース×複数ゲート(単調/配信者除外/床)の
積み増しが原因。配信者除外は「displayEntries 差」という脆い推定でなく broadcasterUserId 由来の確定数で
のみ引く(or 引かず公式と並記)。会議で設計し直す。
