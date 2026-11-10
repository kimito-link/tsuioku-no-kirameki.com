# ミクチャ対応 計画(2026-11-08・スレッド「TikTok・Twitch・Kick に対応する」)

りんく 11-08「ミクチャやショールームもいけそうですか？」→ SHOWROOM の次に作る。

## 形(2026-11-08 PC 実測・本物・ログインなし・値抜き)
- ページ mixch.tv/u/<A>/live。A = broadcasterInfo.id = liveInfo.id。
- GET /api-web/users/<A>/live → liveInfo{id, chat, live_session_id, title, viewer, visitor, created}・broadcasterInfo{id, name, profile_image_url, live_status}・loginInfo(未ログインは null)。
- ソケット wss://chat.mixch.tv/torte/room/<A>(= liveInfo.chat・クエリなし)。受けるだけで流れてくる。1通 = JSON 1件。
- 開いた時点の分 GET /api-web/lives/<A>/messages(ルートが配列・新しい順・created は秒・message_id はソケットと同じ)。
- kind: 0 コメント(body・name・user_id・created・message_id)/ 42 45 46 48 53 120 ギフト(item_id・count・anonymous・profile_image_url。120 だけ item_price)/ 10 状態(viewer・point)/ 13 視聴者一覧 / 61 入室 / 62 ファン / 50 シェア / 164〜168 バトル。
- 値段 /items/available?live_session_id= の items[{id, price, url}]。item_id と id は 484/487 件で対応。単位はコインとみている(未確認)。
- アイテムの名前の口は未発見(ギフトの name は贈った人)。→ 名前は「ギフト」とだけ出し、絵(items.url)と値段で見せる。
- 順位 /api-web/users/<A>/fans/ranking/monthly の superfans[{name, score, profile_image_url}](今月・ログイン不要)。
- 未ログイン: 入力欄が無く「コメントするにはログインしてください」。/api-web/login-status が null。

## 作り(v0.1.1936)
- src/lib/mixch/mxParse.js(純関数)・extension-youtube/src/mx-content-entry.js(入口)。SHOWROOM と同じ形。
- 配信キー mx.<A>.<live_session_id>、人キー mx:<user_id>。匿名のギフトは mx:n:匿名 にまとめる。通貨 MXCOIN(price × count)。
- 計器 yt_diag_mx_chat(kinds・liveStatus の値・itemsVia・giftCoin・unknownGifts)。

## PC で確かめること(未確認)
- /items/available のホスト(/api-web/items/… か /items/… か。両方試して計器 itemsVia に残す)。
- 配信の終わりの印(今は liveInfo が消える/live_session_id が 0 で終わりとみる。live_status の値を計器で集める)。
- ギフトの count が 2 以上になるか(ソケットの分)。price の単位。
- ログイン中の送信欄の形。
