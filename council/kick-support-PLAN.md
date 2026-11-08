# Kick 対応 計画(2026-11-08・スレッド「TikTok・Twitch・Kick に対応する」)

りんくの選択(2026-11-07 判断カード): Twitch → **Kick** → TikTok。Twitch は PR #590(v0.1.1918)でマージ済み。

## 目的
- ニコ生版・YouTube 版・Twitch 版と同じ画面で Kick の配信を記録・振り返り・読み上げ・会場表示する(本体に同梱)。

## 非目的(今回やらない)
- Kick 公式 API(OAuth・webhook)。りんくの開発者アプリは /live/ の一覧用。視聴者の拡張からはログイン無しで読む。
- Kick 公式のギフト(Kicks)ランキングの読み取り(次の段・まずは記録から数える)。

## 設計の要
1. **読む = Kick のページ自身が使う Pusher(wss://ws-us2.pusher.com・公開キー)**。ログイン無しで購読できる。
   チャンネル `chatrooms.<chatroomId>.v2` ほか(`chatroom_<id>`・`channel.<channelId>`・`channel_<channelId>`)を購読し、
   来たイベントをすべて受ける(どのチャンネルに来るかが変わっても取りこぼさない)。id で重ねない。
   - ChatMessageEvent → text / SubscriptionEvent → membership / GiftedSubscriptionsEvent → membership_gift(giftCount)
     / StreamHostEvent → kk_host / KicksGifted → superchat(通貨 KICKS)。純関数 `src/lib/kick/kickChatParse.js`。
2. **配信の情報 = `https://kick.com/api/v2/channels/<slug>`**(同じサイトから・形を検証・取れなければ日付キー)。
   chatroom.id・channel id・livestream(id・タイトル・同接・開始時刻)・配信者の顔。
3. **Twitch で作った口をそのまま使う**: YT_STREAM_META / YT_CHAT_ITEMS → yt_kirameki_db → ytNicoShim → yt-* 画面。
   配信キー `kk.<slug>.<livestream id>`・人キー `kk:<user id>`(id が無いサブスク等は、チャットで見た名前→id、無ければ `kk:@<slug>`)。
   プラットフォームで違う所(リンク先・サムネ・言葉・送信先・顔の置き場)を `src/lib/platform/streamPlatform.js` の表にまとめ、
   Twitch 専用に書いていた分岐(isTwStreamKey 等)を表引きに置き換える。
4. **顔**: チャットに顔は無い。`/api/v2/channels/<slug>` を人ごとに(同時2件・覚える)。間に合わなければ yt_kk_icons に置いて画面で埋める(Twitch と同じ)。
5. **送信**: Kick の入力欄(contenteditable)に打って送信ボタン(無ければ Enter)。未ログインは打つ前に止める。
6. **読み上げ・会場**: Twitch と同じ経路。

## 変更ファイル
- 新規: `src/lib/kick/`(Pusher の1件の解釈・URL・配信キー・API の形の検証)、`src/lib/platform/streamPlatform.js`、
  `extension-youtube/src/kick-content-entry.js`(→ dist/yt-kick-content.js)、`tests/e2e/kick-recording.spec.js`
- 既存: ytNicoShim / background-entry / venue-inline-entry / ytGiftToNico / ytWording / ytCommentSendReason / ytPanelRoute /
  youtube-build.mjs / manifest(kick.com の content script とホスト権限)/ stage-submission.py
- ニコ生版の共有コードは触らない。

## 検証
- 純関数は vitest、偽の Kick(Pusher を TLS で立てる)で e2e。本物は PC(Remote Control)で計器 `yt_diag_kk_chat` を読む。
- クラウドからは kick.com に出られない。イベント名・項目名は本物で確かめるまで「推定」。

## 戻し方
- manifest の kick.com の content script を外せば止まる(記録は `kk.` キーだけ)。

## ストア
- ホスト権限 kick.com が増える → ダッシュボードから手アップロード(Twitch と一緒に1回で出す)。
