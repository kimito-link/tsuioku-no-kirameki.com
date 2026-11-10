# SHOWROOM 対応 計画(2026-11-08・スレッド「TikTok・Twitch・Kick に対応する」)

りんく 2026-11-08「ミクチャやショールームもいけそうですか?」→「どんどんつづけて」。順番: ふわっち → **SHOWROOM** → ミクチャ。

## 形(2026-11-08 PC 実測・ログインなし・値抜き。C:/Users/info/nicolive-ext-showroom-shapes.json)
- 部屋: `GET /api/room/status?room_url_key=<key>` → room_id・live_id・started_at(秒)・is_live・broadcast_host・broadcast_key
- `GET /api/live/live_info?room_id=` → bcsvr_host・bcsvr_key・live_id(開始時刻・視聴数は無い)。視聴数は `/api/live/polling` の online_user_num
- 過去分: `comment_log`(新しい順)・`gift_log`(古い順)。created_at は秒
  - comment_log: user_id, name, comment, avatar_id, avatar_url, created_at, class_level, …
  - gift_log: user_id, name, gift_id, num, image, avatar_url, created_at, …
- `gift_list`: {normal, enquete} の行に gift_id, gift_name, point, free, image。有料/無料は free
- 順位: `summary_ranking` ranking[{user_id, name, avatar_url, point, rank, order}]・`stage_user_list`(pt なし)
- ソケット: ページと同じ `wss://online.showroom-live.com/`。`SUB\t<bcsvr_key>` → `MSG\t<key>\t{json}`(t=1 コメント cm/ac/u/av/created_at・t=2 ギフト g/n/gt/ac/u/av・t=8 テロップ・t=1001 お知らせ?・t=17/18/100 不明)。終了の知らせは未観測
- 送信欄: `input[placeholder="コメントを投稿"]`・`button.st-comment__button`。未ログインでも使える形=DOM で判定できない → `/api/current_user`(is_login / user_id)で見る(形は要実測)

## 作り(v0.1.1933)
- `src/lib/showroom/srParse.js`・`extension-youtube/src/sr-content-entry.js`。配信キー `sr.<room_url_key>.<live_id>`・人キー `sr:<user_id>`
- 開いた時点はログ、以後はソケット。同じコメント/ギフトはどちらから来ても同じ id(人・秒・本文の指紋/ギフト番号・個数)
- 有料ギフト = superchat(通貨 SRPT = point × 個数)。無料ギフト(星・種)は記録しない(計器 freeGifts だけ)
- 公式の順位は summary_ranking(pt)を YT_LEADERBOARD へ(1分おき)
- 終了は room/status の is_live=false(30秒おき)
- 計器 `yt_diag_sr_chat`(types・freeGifts・unknownGifts・giftPt・boardFrom・wsState)
- 人のページへのリンクは未対応(login 空)。人のプロフィール URL の形を実測してから

## 戻し方
- manifest の www.showroom-live.com の content script を外せば止まる(記録は `sr.` キーだけ)。ホスト権限が増える=ストアは手アップロード
