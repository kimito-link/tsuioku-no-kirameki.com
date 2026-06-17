# 統合: コメント投稿者のプロフィール/アバター解決が動かない真因(司令塔の実コード裏取りで確定)

ユーザー報告(全部1つの根)= ①応援アイコン列が出ない(17人ぶんだけ) ②マーケ分析が薄い(全員匿名・avatar0)
③メディアキットも薄い。生成HTML解析: topUsers 30人中 avatar 0・数字userId 1・commenterFollowDataset=None。
diag: avatarUidDiag avAndUid:0 / uidNoAv:72 / avatarMapSize:17。

## 真因(実コードで確定・readChunkedComments 非対応の断線)

コメント投稿者の **avatar/nickname/followerCount を解決する2関数が、旧コメント保存キー
`nls_comments_<lv>`(commentsStorageKey)を直接読んでいる**が、記録は **chunk モード**(v0.1.505+)に
移行済みで、chunk モードでは `nls_comments_<lv>` を書かない(content-entry.js:11499-11503
`...(chunkMode ? (chunkCommentWrite ? chunkCommentWrite.writes : {}) : { [key]: next })`
= chunk のときは main キーへ書かない)。

そのため2関数は **comments を空配列として読み**、候補ゼロで即 return する:
- `maybeFetchCommenterFollowBatchOnce`(content-entry.js:14584)
  - 14594-14600 `const bag = await chrome.storage.local.get([commentsKey,...]); const comments = bag[commentsKey]||[]`
  - 14604-14607 `collectNumericCommentersFromComments(comments)` → `if (!stats.length) return;`
  - → follower fetch が一度も走らない → **commenterFollowDataset=None**。
- `maybeResolveNamedUserProfilesOnce`(content-entry.js:14435)
  - 14442/14458 同じく `bag[commentsKey]` を読み 14483 `for (const c of comments)` で候補収集
  - comments 空 → candidates 空 → profile(nickname/avatar) fetch が走らない。

一方、**表示/記録経路は chunk 対応の `readChunkedComments`** を使っている
(content-entry.js:10042, 10089, 11256)。= 表示は chunk を読むのに、プロフィール解決だけ旧 main キーを
読む **非対称な断線**。avatar が17件だけ付くのは page-intercept(fetch傍受 learnUser)が独立に拾った分。

## ⚠️ Explore エージェントの誤結論を司令塔が裏取りで訂正
- 探索AIは「v0.1.801 の `if (isAutopatrolTab()) return`(content-entry.js:13837)が
  runExternalApiFetchesAsTabLeader 全体を止め、profile fetch を巻き込んだ」と結論。**これは誤り**。
  - `isAutopatrolTab()`(content-entry.js:8040)は URL hash `#nls_autopatrol=1` のときだけ true。
    ユーザーの通常 watch タブは hash 無し=**false=gate に掛からない**。
  - diag `externalFetchProbe: leaderRan:6 / leaderSkipped:0 / kokenSent:6 / nicoadSent:6`
    = ユーザーのタブで runExternalApiFetchesAsTabLeader は **6回リーダー実行済み**=gate は通過している。
  - つまり2関数は **呼ばれている**。止まっているのは関数内部(comments 空で return)。
  - 教訓(memory 既出の再実証): 探索AIの結論は素材・**司令塔の裏取り必須**。今回は diag の
    leaderRan:6 が決定的反証だった。

## 匿名(a:xxx)は原理的に解決不能(これは正しい)
NDGR の hashedUserId(a:xxx)は一方向ハッシュで数字 userId へ逆引き不可。553ユニーク中 数字 userId は
26人。匿名527人は avatar/follower を出せない(identicon/匿名表示で割り切る=星野ロミ的)。
**ただし数字 userId 26人ぶんすら今は解決できていない**=ここが直せる本丸。

## 採用する最小修正(記録本体不可侵・新 storage 書き込みゼロ)
2関数の `bag[commentsKey]` 直読みを、表示経路と同じ **`readChunkedComments(lid, commentsKey, getMany)`**
(commentChunkStore.js:273・chunk→main フォールバック)に置き換える。これだけで chunk モードでも
数字 commenter を拾え、follower/profile fetch が走り、avatar/nickname/follower が解決する。
- getMany = `(keys) => chrome.storage.local.get(keys)`(既存 chunkGetMany と同型・timeout 付き推奨)。
- 退行ゼロ: 非 chunk(小規模)配信は main フォールバックで従来どおり。匿名は従来どおり解決不能(正常)。
- レート/有界は既存のまま(COMMENTER_FOLLOW_FETCH_MIN_GAP_MS・BATCH・pickFollowUidsToFetch・
  shouldResolveProfile TTL)=星野ロミ「画面に出る数字IDだけ・有界・割り切る」を既に満たす。

## 星野ロミ視点(deep-research 完了・NDGR実仕様の裏取り付き)

deep-research(100エージェント・18ソース・25クレーム adversarial 検証)で以下が確定:

### NDGR 実仕様(高確度・Dwango公式 proto n-air-app/nicolive-comment-protobuf MIT で裏取り)
- Chat メッセージのフィールドは content(1)/name(2)/vpos(3)/account_status(4)/
  **raw_user_id(5, optional int64)** / **hashed_user_id(6, optional string)** /modifier(7)/no(8) **のみ**。
  **アバター・アイコンURL・フォロワー数はストリームに一切乗らない**(nickname=name(2)だけ部分的に乗る)。
  =avatar は数字 raw_user_id から CDN で、follower は API で『ストリームの外』で解決するしかない(構造的事実)。
- 匿名(184)は raw_user_id を出さず hashed_user_id のみ。**a:xxx は一方向で数字IDへ逆引き不能**(確定)。
  ただし hashed_user_id は **同一配信枠内で per-user に安定**(枠/コミュニティ単位・週次木9時リセット)
  =枠内だけの仮IDで色分け・識別はできる(個人特定はしない)。
- (既知の裏取り)Gift は item_id(1)/item_name(6) が Chat の content(1)/hashed_user_id(6) と field 衝突。
  oneof 構造分岐("chat" in t / "gift" in t)が正道。推測 decode 時は hashedUserId に ID 形式検証必須
  (v0.1.803 の `^[a-zA-Z0-9_:-]{8,}$` 補強が正しいと再確認)。

### 星野ロミならこう実装する(原則+割り切りライン)
1. **既にあるデータを最大限活かす**: 数字 raw_user_id は NDGR ストリームに既に届いている。それを
   `deriveAvatarUrlFromUid`(既存)で **usericon CDN を決定的に生成**:
   `secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/<bucket>/<userId>.jpg`(**bucket=floor(userId/10000)**)。
   = 数字IDの人は**API を叩かずに**即 avatar が出る(重い fetch 不要)。`onerror` で identicon フォールバック。
2. **画面/記録に出る数字IDだけ・有界・遅延解決**: 全員は引かない。LRU(maxSize 有界)+ TTL +
   stale-while-revalidate(必要時だけ非同期解決し stale を返す)。失敗は静かに諦める。既存の
   `COMMENTER_FOLLOW_FETCH_MIN_GAP_MS`/`pickFollowUidsToFetch`/`shouldResolveProfile` がこれを満たす。
3. **匿名は無理に個人特定しない(プライバシー)**: a:xxx は逆引き不能=**決定的 identicon**(DiceBear 等:
   同一 seed→同一アバター・APIキー不要・ストレージレス)or ハッシュ色分けで割り切る。枠内仮IDで
   「同じ人が何回コメントしたか」までは出せる(OneComme ancient-bbs テンプレが実証=枠終了で破棄)。
4. **follower 等の重い項目**: 公開 API(api.cas.nicovideo.jp/v1/search/users 等で nickname/followerCount/
   icons)で取れるが**画面に出る数字IDだけ・有界バッチ・レート尊重**。全員ぶんは引かない。

### 本バグへの含意
- 今回の断線(chunk 未対応で comments 空)を直せば、**数字IDの人は avatar が即出る**(CDN 決定的生成)。
- 匿名527人は仕様上 avatar 不能=identicon フォールバックで「空っぽに見えない」を担保すべき(第2フェーズ)。
- =「全員出ない」の主因は本バグ(数字IDすら解決経路が空読みで死んでいた)。直せば数字ID分は即回復。
正本フル: deep-research 出力(tasks/wmbtnh3hy.output)。

## 検証観点(実機)
chunk モードの長尺配信で「数字 userId のコメント者に avatar/nickname が付く・commenterFollowDataset に
follower 行が入る・応援アイコン列に数字IDの人が並ぶ」。匿名は従来どおり匿名表示。
