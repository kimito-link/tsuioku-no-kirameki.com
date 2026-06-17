# 統合: 応援レーンが空 — 保存行に userId が付かない断線

会議 4 応答(groq gpt-oss-120b / groq llama-3.3-70b / openrouter gpt-oss-120b / local qwen2.5)
全員一致=**仮説A(userId が保存行に乗っていない)**。+ 司令塔の実コード裏取りで【真因を確定】。

## 会議の一致点
- **本命=仮説A**。`withUid:0`(保存行に userId 0)・`avAndUid:0`(uid+avatar 同時 0)・
  `uidNoAv:69`(uid はあるが avatar 無しが 69=NDGR 行数と一致)の3つを同時に説明できるのは
  「userId がそもそも保存行に乗っていない」だけ。仮説B/C/D は退ける。
- 修正方向=NDGR/行変換で userId を確実に付ける + avatar を join。記録本体は不可侵。
- 批判役=「userId 必須化」が backfill(userId 無しが正常)を壊さないか・匿名 hashedUserId の
  プライバシー(本拡張は匿名表示方針)。

## ⚠️ 会議のハルシネ(実コードを知らない)= 司令塔が訂正
会議は存在しないファイル/関数を多数仮定した(`commentIngestPipeline.js`・`prepareForPersist`・
`profile/patchAll.js`・`storage.readAllComments` 等)。**実コードには無い**。会議結論は素材として
採用し、経路は司令塔の裏取りを正本とする(memory 既出の教訓を再実証)。

## 司令塔の裏取りで確定した【真因=commentNo キーの enrichment 断線】

応援レーン `userLaneCandidatesFromStorage`(userLaneCandidatesFromStorage.js:117,145)は
**保存行の `userId`(+ uid 一致 avatar)** が必須。保存行に userId を付けるのは:

1. **NDGR 行**: `ndgrChatsToMergeRows`(ndgrChatRows.js:51)が `row.userId = ndgrChatUserId(chat)` を
   付ける。**これは no が無くても userId を付ける**(v0.1.803 で no無し採用も追加済)。
2. **DOM 観測行(visible/mutation/deep)**: `enrichRowsWithInterceptedUserIds`
   (content-entry.js:9674)が **intercept マップを commentNo で引いて** userId を補完する:
   - `:9678-9679` `const no = String(r.commentNo ?? '').trim(); const entry = no ? interceptedUsers.get(no) : undefined;`
   - intercept マップ `interceptedUsers` は **commentNo キー**で、`:9430` `if (!no) continue;` =
     **no が無い行はマップに入れない**・`:9679` no が無い行は引けない。

### 断線の本体
ニコ生が **匿名(184)/no無しコメント主体**に寄ると(v0.1.803 を入れた動機そのもの):
- DOM 観測行(visible 1345 / mutation 205 / deep 162 = 計 1712 行)は **commentNo が無い**ものが多く、
  `enrichRowsWithInterceptedUserIds` が **commentNo キーで引けず userId を一切付けられない**。
- backfill(13979 行)は過去ログで元々 userId が wire に無いことが多い。
- 結果、保存行の大半が userId 無し → `withUid:0` → レーンの groupBy(userId)が空 → **レーンが出ない**。
- **v0.1.803 は no無しコメントを「行として採用」したが、no無し行の userId enrichment 経路は
  足さなかった**=「採用はされるが userId が付かない行」を増やしただけでレーンは空のまま。
  (interceptedUsersTotal:69 はマップに 69 人いるが、commentNo キーなので no無し行に join できない)

### avAndUid:0 の意味(二次)
userId が付かない以上 avatar(uid 一致)も join しようがない(`isAvatarUrlForUserId(u, userId)` が
常に false)。avatar マップ(159)と uid マップ(69)が別々で交わらない=userId 断線の帰結。

## 採用する最小修正の方向(第1フェーズ・記録本体不可侵・新 storage 書き込みゼロ)

**no無し行にも userId enrichment 経路を足す**(commentNo 以外のキーで join):
- 案1(本命): `enrichRowsWithInterceptedUserIds` で **no が無い行でも、行が既に持つ
  `r.userId`(NDGR 由来)を尊重**し、さらに intercept マップを **userId キーでも**引けるようにする
  (`interceptedAvatars`/`interceptedNicknames` は既に userId キー=これらで avatar/nickname を補完)。
  - NDGR 行は ndgrChatsToMergeRows が userId を付けているので、no無しでも userId は保持される
    →レーンに乗る。DOM 観測の no無し行は userId が取れないので従来どおりレーン対象外(割り切り)。
- 案2(補強): page-intercept / learnUser が **no無し+uid の匿名を userId キーで seed**(v0.1.803 で
  page-intercept-entry に追加済)→ content 側の `interceptedAvatars`/`interceptedNicknames`
  (userId キー)に乗るので、userId を持つ行には avatar/nickname が join される。
- ⚠️ DOM 観測の no無し行に「commentNo が無いから userId が永久に付かない」問題は、no無し行に
  userId を載せる別経路(text+sec 近接で intercept とマッチ等)が要るが、これは第2フェーズ
  (over-engineering を避け、まず NDGR userId 行がレーンに出ることを実機確認してから)。

## まず実機で確認したいこと(司令塔の次アクション)
- **NDGR 行(userId 付き)が実際にレーンに出るか**。出るなら案1+2 で大半が回復。
- DOM 観測の no無し行まで出したいなら第2フェーズ(text+sec join)。

## 退行ゼロの担保
- 記録の永続(IDB/chunk/テール)不変・新 storage 書き込みゼロ・backfill の userId 無しはそのまま
  (レーン対象外で正常)・匿名 hashedUserId は ID 形式のときだけ採用(v0.1.803 の gift 誤読対策を維持)。
- 純関数化してテスト。

## 検証観点(実機)
「コメントが来た瞬間に応援アイコン列に人が並ぶ(userId 付き NDGR コメントの人)」。
backfill だけの過去ログは従来どおりレーンに出ない(userId 無しが正常)。
