# お題: 応援アイコン列(応援レーン)が空になる — 保存コメントに userId が付かない

## 背景(司令塔が実コードで確認済みの確定事実。推測でない)

ニコ生視聴を盛り上げる Chrome 拡張(MV3)。視聴者/コメント者のアバターを横一列に
並べる「応援レーン」が、**実機で全然出ない(前は即時に出ていた=退化)**。コメント記録
自体は健全(記録 14,973 件・recording:true・取得率 103%)。表示のレーンだけ空。

## 応援レーンの確定した契約(実コードで裏取り済)

`src/lib/userLaneCandidatesFromStorage.js:90` `userLaneCandidatesFromStorage(storedComments, liveId, opts)`:
- `storedComments`(保存済みコメント配列)を live で絞り、**`row.userId` で groupBy**。
  - `:117-118` `const uid = String(row?.userId ?? '').trim(); if (!uid) continue;`
    = **userId が無い行はレーンに一切乗らない**。
- 各 uid につきアバターは `row.avatarUrl` から選ぶが `:145` `isAvatarUrlForUserId(u, userId)`
  = **avatarUrl に埋め込まれた uid と row.userId が一致する行だけ**採用。
- nickname は `row.nickname` から。
- 結論: レーンに出るには **保存行が `userId` を持ち、かつ `avatarUrl`(uid 一致)** が要る。

## 実機 diag(2026-06-17T04:32)の決定的な値

- `commentObservability.savedCommentsUidStats = { totalSaved: 0, withUid: 0, withoutUid: 0, withUidPercent: 0 }`
  - `aggregateSavedCommentsUidStats(next)`(commentObservabilityDiag.js:152)は **保存予定配列 next の
    各 `e.userId` を数える**。**withUid:0 = 保存行に userId が 1 件も無い**。
- `avatarUidDiag = { interceptedUsersTotal: 69, uidNoAv: 69, avAndUid: 0, avNoUid: 0, bothEmpty: 0 }`
  - userId を持つユーザーは 69 人 known。だが **avatar と uid が両方そろった人が 0**。
- `avatarNicknameMatchDiag = { avatarMapSize: 159, nicknameMapSize: 39, avAndNick: 1, avNoNick: 158, nickNoAv: 38 }`
  - アバターは 159 件あるが、ニックネームと紐付いたのは 1 件だけ。
- `commentIngestBySource = { backfill: 13979, visible: 1345, mutation: 205, deep: 162, ndgr: 69, ... }`
  - 記録の 93% が **backfill(過去ログ crawl)**。backfill 行は通常 userId を持たない。
- `ndgrWireCounters = { chats: 104, decoded: 111, giftsWithUid: 12, ... }`
  - `ndgrChatToPersistRatio = { decodedChats: 104, ndgrPersistedRows: 69, ratioPercent: 66.3 }`
    = NDGR 由来で 69 行が保存された。**この 69 行に userId があれば withUid は 0 にならないはず。**

## 司令塔が確認した「userId が付くはずの経路」(にもかかわらず 0)

- NDGR→保存行変換 `ndgrChatsToMergeRows`(ndgrChatRows.js:32)は
  `row.userId = ndgrChatUserId(chat)`(= rawUserId or hashedUserId)を**正しく付ける**。
  - v0.1.803 で `shouldAcceptNdgrChatAsComment` 採用判定を足したが、これは**採用を増やす**変更
    (no 無し匿名でも userId があれば採用)。**減らす変更ではない**=これ単体ではレーンを空に
    しない。むしろ「レーン復活」を狙った変更だった(が実機では空のまま)。
- merge/persist `commentRecord.js` は keep キーに `userId` を含み**保存時に userId を保つ**。
- ⇒ 変換も保存も userId を保つのに、保存行の withUid が 0。

## 仮説(どれが本命か会議で詰めたい。司令塔は単独で content-entry.js 17000 行を
読み切れずクラッシュ多発のため、観点を絞ってほしい)

- **仮説A**: NDGR の `decodeChat` が**通常(番号付き)コメントの userId(rawUserId/hashedUserId)を
  抽出できていない**。69 行は `chat.no != null` で採用されるが userId 空のまま保存→withUid:0。
  page-intercept 経路の userId 69 人(interceptedUsersTotal)は **別経路(learnUser)**で content の
  保存行とは別物。content の NDGR decode 経路の userId 抽出が壊れている疑い。
- **仮説B**: 保存の主役が backfill 13979(userId 無し)で、`aggregateSavedCommentsUidStats(next)` が
  見る `next` が **backfill 偏重の配列**になっており、userId 付き NDGR 69 行が別配列(tail/chunk)に
  分離していて next に乗らない。診断の withUid:0 は「next には userId 行が無い」だけで、レーンが
  読む storedComments とは別物の可能性(=診断とレーン読み出しの対象がズレている)。
- **仮説C**: avatar と userId が**別マップに溜まって join されない**(avAndUid:0)。userId 付き行は
  あるが avatarUrl が付かず、`isAvatarUrlForUserId` を通る avatarUrl が無いのでレーンに出ない。
  アバター解決(profile/intercept)が保存行に avatarUrl を書き戻す経路が切れている疑い。
- **仮説D(退化の起点)**: 「前は即時に出ていた」= 最近の変更が起点。直近で content-entry.js を
  触ったのは v0.1.769(storage stall spiral 根治)・v0.1.786(gift 無界 storage RMW)・v0.1.792/801/804。
  storage stall 対策で profile/avatar 書き戻しや next 集約を間引いた副作用で userId/avatar が
  保存行に乗らなくなった可能性。

## 問い(4ブロックで: 結論 → 根拠 → 反論・リスク → 具体案[どこを読む/直す])

1. **本命の仮説はどれか**(A〜D)。diag の withUid:0 / avAndUid:0 / ndgrPersistedRows:69 /
   backfill 偏重 から、最も整合する1つを選び、なぜ他を退けるか。
2. **withUid:0 の意味の確定**: `aggregateSavedCommentsUidStats(next)` の `next` は、レーンが読む
   `storedComments` と**同一の配列か**。違うなら「診断は 0 でもレーンの素は別にある」可能性。
   司令塔がまず確認すべき content-entry.js の箇所(関数名/変数名)を**具体的に**指定してほしい。
3. **avAndUid:0 の意味**: userId と avatar が join されない構造。保存行に avatarUrl を書き戻す
   経路(profile 解決→全件パッチ)が間引きで止まっていないか。確認すべき関数。
4. **最小修正の方向**: 記録本体(IDB)は不可侵・新 storage 書き込みは増やさない・star ロミ観点
   (重くしない・有界・割り切る)。userId が保存行に乗る/avatar が join される最小の直し方。
5. **批判役**: 「userId を保存行に必ず付ける」修正が、backfill 13979 行(userId 無しが正常)を
   壊さないか。匿名(184)の hashedUserId をレーンに出すのはプライバシー上問題ないか
   (本拡張は匿名表示の方針あり)。

## 制約
- 記録の永続(IDB/chunk/テール)の不変条件を壊さない。表示(レーン)だけ直す。
- 新しい storage 書き込みを増やさない(過去に storage 飽和事故あり)。
- 純関数化してテスト可能に。
- 「安全に」最優先。content-entry.js は巨大なので、**読むべき箇所をピンポイントで**示してほしい。
