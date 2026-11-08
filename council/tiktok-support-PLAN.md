# TikTok LIVE 対応 計画(2026-11-08・スレッド「TikTok・Twitch・Kick に対応する」)

順番(りんく 11-08): Twitch → Kick → ふわっち → SHOWROOM → ミクチャ → TikTok → ツイキャス(メンテ明け)。

## 方針
- 公式 API は無い。外部の有料署名サービス(Euler Stream・tik.tools)は使わない。
- 視聴ページ tiktok.com/@<名前>/live を開いている間だけ、そのタブで読む(他のサービスと同じ)。
- 読み方の候補は2つ。**PC で本物の形を取ってから決める**(ふわっちで推定の形が外れた教訓)。
  1. ページ自身の WebSocket(webcast…/im/push 系と言われる)の受信をメイン世界で横取りし、protobuf を自前の小さな読み取りで解く。
     クラス名が難読化されていても壊れにくい。gzip かどうか・枠の形(PushFrame)は未確認。
  2. チャット欄の DOM を読む(data-e2e 属性があれば使う)。ギフトがどこまで文字で出るかは未確認。
- 公開されている protobuf の定義(TikTok-Live-Connector・AGPL)のコードは写さない。フィールド番号は PC の実測で確かめて自前で書く。
  参考の番号(main ブランチ・古い可能性): ChatMessage user=2 comment=3 / GiftMessage giftId=2 repeatCount=5 user=7 repeatEnd=9
  groupId=11 giftDetails=15(giftName=16 diamondCount=12 giftImage=1)/ User userId=1 nickname=3 profilePicture=9 uniqueId=38 /
  RoomUserSeq viewerCount=3 / Message type=1 binary=2。
- ギフトはコイン(diamondCount × 個数)。連打ギフトは repeatEnd が来たときだけ数える(途中の分を重ねない)。
- 配信キー tt.<名前>.<roomId>、人キー tt:<userId>。

## PC で取るもの(ログインしない・値は抜いて形だけ)
- 日本からログインなしで配信が見られるか。コメント欄・ギフト表示が出るか。
- WebSocket の URL(クエリの値は抜く)、受信フレームの先頭バイト・gzip の有無、ack を送っているか、type(WebcastChatMessage 等)の種類と数。
- チャット欄・ギフトの DOM の data-e2e 属性と入れ子。
- 送信欄の場所と未ログイン時の表示。
