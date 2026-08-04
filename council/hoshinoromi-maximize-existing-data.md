# お題: 星野ロミ式「元からあるデータを最大活用」+コンポーネントファクタリングで一気に直す

## ユーザーの思想(お題の核)
「星野ロミ理論=元からあるデータを活かすのが十分に活かされていない。
**コンポーネントファクタリング(部品化)をうまく使いこなせば一気に解決する**と思う。」
直近の実害=「コメントは大量に取れるのに会場/レーンに人が出ない(匿名でも元々出ていた=退化)」。

## 司令塔が機能マップ→実コード→実機生バイトで裏取りした真因(確定・推測でない)

### ユーザー指摘どおり「届いているのに捨てている」が起きている
- 実機診断(複数配信で再現): `ndgrTagHistogram.msg = {1:11, 2:10, 3:10}` だが `ndgrWireCounters.chats:1`。
  = **NicoliveMessage.chat(msg field 1)が 11 件届いて復号されているのに、chat として採用されたのは1件だけ。**
- 実コード(src/lib/ndgrDecode.js:689-702):
  ```
  if (mfn === 1 || mfn === 20) {
    const chat = decodeChat(buf, ms, me);
    if (chat.no != null) { chats.push(chat); }   // ← no(コメント番号)が無いと捨てる
    else { /* gift fallback・失敗なら何も残らない */ }
  }
  ```
- `decodeChat`(ndgrDecode.js:228-253)は **no が null でも rawUserId(field5)/hashedUserId(field6)/
  content(field1)/is184(field7) を取れている**。= **userId 付きのコメントが手元にあるのに、
  `no != null` ゲートで丸ごと捨てている。**
- 結果: 匿名(184)など no を持たないコメントは NDGR chat 経路で捨てられ、コメントは DOM(visible)で
  しか拾えず userId が付かない → レーン(userLaneCandidatesFromStorage は `if(!uid) continue`=userId
  必須)に乗らない → **会場/レーンが空。記録件数は visible で取れるので健全(取得率97-101%)。**
- = まさに「元からあるデータ(届いている userId 付き chat)を活かせていない」。捨てなければレーンは戻る。

### 機能マップ(ユーザー作の storage-bus 図)を使って切り分けた
- `npm run feature-map` 再生成。lane キー(KEY_USER_COMMENT_PROFILE_CACHE/KEY_LIVE_BROADCASTER_CTX)は
  producer/consumer 両方そろう=storage 配管は健全→断線は storage より上流(ingest/decode)と判明。
- 図の守備範囲(storage)では今回の上流断線は出ない=機能マップに「ingest source 別・userId 付与率」を
  足せばこの種も図で気づける(後述 Q3)。

## コンポーネントファクタリングの観点(ユーザーの本筋)
今の問題は「chat を使えるか」の判定(`no != null`)が decode ループに直書きで、しかも厳しすぎる。
これを **部品化**して「採用条件=content があるか(=表示できるコメント)・userId があるか」を明示すれば、
no が無くても userId と本文を活かせる。同型の「元データを活かしきれていない」箇所が他にもあるはず:
- backfill 経路でも同じ decodeChat を使っている(no 無し chat を捨てているなら過去ログでも userId 喪失)。
- レーン/会場/吹き出し/アバターは全部「コメント→userId/avatar 集約」の同じ部品を共有すべき。

## このプロジェクトの制約(必ず守る)
- Windows + PowerShell。`npm run verify:cc`。1変更=patch1つ・changelog35字。
- 純ロジックは src/lib(ndgrDecode.js / ndgrChatRows.js / userLaneCandidatesFromStorage.js)に切り出して
  単体テスト。実機生バイト(下記 hex)を fixture にできる。
- 記録(コメント本体)を壊さない・重複させない(no 無し chat を採用すると dedupe キーが no 依存なら衝突/
  重複の罠=既存 dedupe を確認)。ゼロ音声/画面溢れ等の既存根治は不変。
- 偽陽性を増やさない(no も content も無い空 chat を拾うと水増し)。

## 実機生バイト(裏取り素材・council はこれで構造を推定せよ)
- msg:1 が chat。msg:2(byte12)= `089cbfc7d10610a889aea902`(field1 varint+field2 varint=サーバ時刻ping?)
- msg:3(byte8)= `0a0608fce7a0a701`(field1 LEN→中 field1 varint)
- chat(msg:1)の例は診断に raw が出ていないが、decodeChat が no=null/userId 有りで返している事実が核心。

## 会議への質問(役割分担 + 結論→根拠→反論→具体案 の4ブロックで)
役割: 総合役=設計整合と退行防止 / 発散役=別の切り口 / 批判役=各案の穴を最低1つ /
実装役=具体的なファイル・関数・採用条件・dedupe キー・テスト名・hex fixture まで。

### Q1: chat 採用条件を「no 必須」から何に変えるのが正しいか(元データを活かす)
- 案: `chat.no != null` を「`content` が非空 or `no != null`」に緩め、userId(rawUserId/hashedUserId)を
  必ず持ち越す。no 無し匿名コメントも userId 付きで採用 → レーン復活。
- 罠: dedupe。記録の重複判定が no 依存なら、no 無し chat は dedupe キーをどう作るか
  (既存 buildDedupeKey は no 無し時 text+sec+uid にフォールバックする実装か要確認)。重複/欠落を出さない境界。
- 偽陽性: no も content も無い chat(システム/座席?)は拾わない。looksLikeValidGiftItemId の chat 版が要るか。

### Q2: コンポーネントファクタリングで「コメント→userId/avatar 集約」を一本化する
- 今 lane/会場/roster/吹き出し/アバターが別々に userId を扱っている。星野ロミ式に「元データ(記録済み
  コメント+intercept profile)から userId/avatar/nickname を1つの部品で集約」して全表示が共有する設計は?
  userLaneCandidatesFromStorage がその中心になれるか。重複実装(v0.1.740 等の対症)を畳めるか。
- 「軽い・有界・割り切り」(星野ロミ)を保ちつつ部品化する具体形。

### Q3: 機能マップに「ingest source/userId 付与率」を足して上流断線も図示
- 今回 storage バス図では出なかった。図に「コメントの ingest 経路(ndgr/visible/...)別件数」「userId
  付与率」を出せば、『NDGR chat が来てない/捨ててる』を図で一発で気づける。どう機械化するか。

### Q4(批判役): no 緩和の危険・切り分けの甘さ
- no 必須は何のために入った?(過去の偽陽性対策の可能性=git 経緯)。緩めると何が壊れるか。
- chats:1/decoded:197 は「decode 取りこぼし」と確定したが、msg:1=11→chat1 の 10 件が本当に
  no 無し chat か(別種を msg:1 で受けている可能性)。実 hex で確証を取る手順。

## 期待する最終成果(司令塔が統合・裏取り)
星野ロミ式「元からあるデータ(届いている userId 付き chat)を捨てず活かす」+ コンポーネント
ファクタリング(コメント→userId/avatar 集約の一本化)で、レーン/会場が一気に戻る1案。MVP(no 緩和で
レーン復活・dedupe 安全)と、構造(集約部品の一本化・機能マップ拡張)を分けて。記録は壊さない。
具体ファイル・採用条件・dedupe キー・テスト名・hex fixture まで。会議は素材・司令塔が ndgrDecode の
実バイトと既存 dedupe で裏取りして収束。
