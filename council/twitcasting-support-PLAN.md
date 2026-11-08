# ツイキャス対応 計画(2026-11-08・スレッド「TikTok・Twitch・Kick に対応する」)

りんくの選択(2026-11-08 判断カード): Kick の次は **ツイキャスを先に**、TikTok はそのあと。

★2026-11-08 13:19 りんく「ツイキャスはハッキングでまだメンテ中なのであとでいいかも」→ 保留。先に TikTok。メンテ明けに再開する。

## 目的
- ニコ生版・YouTube 版・Twitch 版・Kick 版と同じ画面でツイキャスの配信を記録・振り返り・読み上げ・会場表示する(本体に同梱)。

## 非目的(今回やらない)
- 公式 API v2(OAuth・アプリ登録が要る)。視聴者の拡張からはログイン無しでページと同じ口を読む。
- 公式 API の WebSocket URL(2025-06-11 に廃止・PublicApiV2 CHANGELOG)。

## 設計の要(★2020 年の非公式資料による推定。本物は PC で確かめてから作る)
1. **配信中か・movie_id**: `GET https://frontendapi.twitcasting.tv/users/<user>/latest-movie`
   → `{ update_interval_sec, movie: { id, is_on_live } }`(Qiita pasta04・2020)。
2. **コメントの口**: `POST https://twitcasting.tv/eventpubsuburl.php`(form `movie_id`)→ `{ url: "wss://s….twitcasting.tv/event.pubsub/v1/streams/<movie>/events?token=…&n=…" }`。
   届くのは JSON の配列。`type: "comment"`(id・message・createdAt・author{id,name,screenName,profileImage,grade})、
   `type: "gift"`(item{name,image}・sender{…}・message)。ギフトの値段(pt)・id・時刻は資料に無い=要実測。
3. **Kick/Twitch で作った口をそのまま使う**: YT_STREAM_META / YT_CHAT_ITEMS → yt_kirameki_db → ytNicoShim → yt-* 画面。
   配信キー `tc.<user>.<movie id>`・人キー `tc:<author.id>`。サービスの違いは `src/lib/platform/streamPlatform.js` の表に1行足す。
4. **顔**: コメントに profileImage が付く(要実測)。
5. **公式の順位**: ツイキャスの「ギフトランキング」「サポーター」がページにあるか・ログイン無しで読めるかを実測で確かめる。
6. **送信**: ページの入力欄に打つ(未ログインは打つ前に止める)。
7. **読み上げ・会場**: 同じ経路。

## 先に PC で確かめること(クラウドからは twitcasting.tv に出られない=403)
- latest-movie・eventpubsuburl.php が今も動くか、要るヘッダ、トークンの寿命、再接続のしかた。
- 本物のコメント・ギフト(名前・値段・アイテムの種類)・サポーター/メンバーシップ・削除の形(値は除く)。
- ギフトの値段の単位(コイン・円・pt)と、ページのギフトランキングの取り方。
- 送信の入力欄・ボタン・未ログインの見分け方。

## 検証
- 純関数は vitest、偽のツイキャス(WebSocket を TLS で立てる)で e2e。本物は PC(Remote Control)で計器 `yt_diag_tc_chat`。

## 戻し方
- manifest の twitcasting.tv の content script を外せば止まる(記録は `tc.` キーだけ)。
- ★ホスト権限が増える版=ストアはダッシュボードで ZIP を手で上げ直す(AGENTS.md §2)。
