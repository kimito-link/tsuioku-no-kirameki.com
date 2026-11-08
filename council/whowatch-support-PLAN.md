# ふわっち対応 計画(2026-11-08・スレッド「TikTok・Twitch・Kick に対応する」)

りんく 2026-11-08 13:19「ふわっちかな」(ちくわちゃんのリアルタイムランキングにふわっち枠がある=人が多い)。
ツイキャスはメンテ中で保留(council/twitcasting-support-PLAN.md)。順番: Kick → **ふわっち** → TikTok → ツイキャス(メンテ明け)。

## 目的
- ニコ生版・YouTube/Twitch/Kick 版と同じ画面でふわっちの配信を記録・振り返り・読み上げ・会場表示する(本体に同梱)。

## 設計の要(★2018〜2025 の非公式資料による推定。本物は PC で確かめてから作る)
1. **配信の特定**: 視聴ページ `https://whowatch.tv/viewer/<live_id>`(yt-dlp の正規表現 `whowatch\.tv/viewer/(\d+)`)。
   プロフィール `whowatch.tv/profile/<user_path>` から今の live_id を引く方法は要実測。
2. **配信の情報**: `GET https://api.whowatch.tv/lives/<live_id>` → `live.title`・`user{id,user_path,name}`・`started_at`(ms)・
   `total_view_count`・`comment_count`(yt-dlp 2025)。終わったかは `/lives/<id>/play` の `hls_url` の有無(推定)。
3. **コメント**: `GET https://api.whowatch.tv/lives/<live_id>?last_updated_at=<前回の updated_at>`(0 から)→ `comments[]`(新しい順らしい)・
   `updated_at`(2018 の資料)。コメントの id・時刻・アイコン・アイテム(ギフト)とその pt は資料に無い=要実測。
   ページが WebSocket を使っているかも要実測(使っていればそちらを読む)。
4. **Kick/Twitch で作った口をそのまま使う**: YT_STREAM_META / YT_CHAT_ITEMS → yt_kirameki_db → ytNicoShim → yt-* 画面。
   配信キー `ww.<live_id>.<配信者の user.id>`(タブの URL から引けるよう login の位置に live_id)・人キー `ww:<user.id>`。違いは `src/lib/platform/streamPlatform.js` の表に1行。
5. **アイテム(投げ銭)**: 値段(pt/円)・種類・連投の数え方を実測。公式のランキング(アイテムの順位・ファン)があれば使う。
6. **送信**: ページの入力欄(未ログインは打つ前に止める)。
7. **読み上げ・会場**: 同じ経路。

## 先に PC で確かめること(クラウドからは whowatch.tv に出られない)
- ページ自身の通信(XHR/WebSocket)の口・間隔・要るヘッダ・ログイン不要か。
- 本物のコメント・アイテム・入室・フォロー・終了の形(値は除く)。アイテムの値段の単位。
- 公式ランキング・サポーター的なものの有無と取り方。顔の URL。送信の入力欄とログインの見分け。

## 戻し方
- manifest の whowatch.tv の content script を外せば止まる(記録は `ww.` キーだけ)。ホスト権限が増える=ストアは手アップロード。

## 最初の版(v0.1.1931・2026-11-08・PC 実測前の試作)
- `src/lib/whowatch/wwParse.js`(形は推定・欠けた1件は捨てる)・`extension-youtube/src/ww-content-entry.js`(3秒おきに読む・失敗は倍に延ばして最大60秒)。
- アイテムは kind `superchat`・通貨 `WWPT`(1 pt = 1 で数える・円との比は要実測)・名前と絵(giftName/giftImageUrl)。
- ページから API が読めなければバックグラウンドが代わりに読む(`YT_WW_API_GET`・本体同梱の入口は YT_ で始まる知らせしか出せない)。
- 終わった印は live_status(FINISHED 等)か ended_at。分からなければ配信中として読み続ける。
- 計器 `yt_diag_ww_chat`: via(page/bg)・polls/pollFail/lastError・届いた項目の名前(shapes)・comment_type ごとの数・新しい順か・アイテムの数と pt。
- 送信は入力欄(placeholder に「コメント」)+ form の送信ボタン。形は要実測。
- 試験: wwParse.test.js・tests/e2e/whowatch-recording.spec.js(偽のふわっち・バックグラウンド経由も)。
