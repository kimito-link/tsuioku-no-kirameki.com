# 配信中コメントの過去分さかのぼり取得調査（8サービス）

調査日時: 2026-11-16 18:52〜19:05 JST
目的: 配信の途中から開いても、配信中にログインなしで配信開始からのコメントを全件取得できる方法があるかを、本物の配信ページ・実 API で検証する。

---

## サマリー表

| サービス | 今取れる過去分 | 最大で取れる過去分 | 方法（URL の形とパラメータ） | ログイン要否 | 確かめた配信 URL と日時 |
|---|---|---|---|---|---|
| **YouTube Live** | 直近数分（実測 75件） | **直近のみ（約75件・全件不可）** | `POST youtubei/v1/live_chat/get_live_chat?key=...`（初回 `reloadContinuationData` のみ）。`get_live_chat_replay` は配信中 400 エラー | 不要 | `https://www.youtube.com/watch?v=P1wbekkCljw` (2026-11-16 18:58 JST) |
| **Twitch** | 0件（IRC 新着のみ） | **全件（公開 VOD 有効時）** / 不可（VOD 非公開時） | `POST https://gql.twitch.tv/gql` (`VideoCommentsByOffsetOrCursor` で配信中 VOD の `contentOffsetSeconds` を `0` から順送り) | 不要 | `https://www.twitch.tv/stylishnoob4` (2026-11-16 18:56〜18:57 JST) |
| **Kick** | 0件（ソケットのみ・`/history` 未使用） | **全件** | `GET https://web.kick.com/api/v1/chat/<channelId>/history?cursor=<data.cursor>`（1ページ約25件） | 不要 | `https://kick.com/chessbrah` (`channelId: 1286990`, 2026-11-16 18:56〜18:57 JST) |
| **ふわっち** | 直近 100件 | **最大 301件**（全件不可） | `GET https://api.whowatch.tv/lives/<liveId>?last_updated_at=0&limit=500`（`limit=500` 以上で上限 301件） | 不要 | `https://whowatch.tv/viewer/77766074` (2026-11-16 18:53〜18:54 JST) |
| **SHOWROOM** | 直近 101件 | **101件**（全件不可） | `GET https://www.showroom-live.com/api/live/comment_log?room_id=<roomId>`（パラメータ変更不可） | 不要 | `https://www.showroom-live.com/r/NOA_ROOM` (`room_id: 259899`, 2026-11-16 18:53 JST) |
| **ミクチャ** | 直近 14〜55件 | **直近最大 55件**（全件不可） | `GET https://mixch.tv/api-web/lives/<userId>/messages`（パラメータ変更不可） | 不要（※1） | `https://mixch.tv/u/18741728/live` (2026-11-16 18:55 JST) |
| **TikTok LIVE** | 0件（ソケットのみ） | **不可** | 公開 HTTP 履歴口なし。未ログインではコメントソケット自体が開かない | **要ログイン** | `https://www.tiktok.com/live` (2026-11-16 18:58 JST, CAPTCHA ゲート) |
| **ABEMA** | 直近最大 100件 | **全件** | `GET https://api.p-c3-e.abema-tv.com/v1/slots/<slotId>/comments?until=<createdAtMs-1>&limit=100` | 不要（匿名トークン自動付与） | `https://abema.tv/now-on-air/abema-news` (`CHWBFqEHifQBsm`, 2026-11-16 19:04 JST) |

※1 ミクチャは今回 200 OK でログイン不要だったが、`extension-youtube/src/mx-content-entry.js` に記録されている通り、未ログイン状態では環境・アクセス状況によりログイン画面へリダイレクトされることがある。

---

## サービスごとの詳細

### 1. YouTube Live
- **今使っている口**: `extension-youtube/src/content-chat-entry.js`（チャット iframe の DOM 監視、配信終了後のみ `get_live_chat_replay` を使用）。
- **実際のリクエスト URL**:
  - 配信中: `POST https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false&key=<INNERTUBE_API_KEY>`
  - アーカイブ用: `POST https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay?prettyPrint=false&key=<INNERTUBE_API_KEY>`
- **応答の形のキー名**:
  - `continuationContents.liveChatContinuation.actions`（チャット行配列。各要素は `addChatItemAction.item.liveChatTextMessageRenderer` 等、`timestampUsec` を保持）
  - `continuationContents.liveChatContinuation.continuations`（次回継続トークン配列。実測では `invalidationContinuationData` のみ）
- **1ページの件数・さかのぼれた件数**:
  - 初回 `reloadContinuationData` で `actions` **75件**（`timestampUsec` 付き 71件、範囲 `2026-11-16T09:55:06.825Z`〜`09:58:35.245Z` の約3分半分）のみ取得。
  - 次回用トークンは `invalidationContinuationData`（新着待機用）のみで、古い方向へのページ送りトークンは返らない。
- **スクロール読み込み**: Playwright で `/live_chat?is_popout=1&v=P1wbekkCljw` および `/watch?v=P1wbekkCljw` 内の `#item-scroller` を `scrollTop = 0` にしても、`get_live_chat` の追加リクエストは **0件**（なし）。
- **アーカイブ用口の配信中利用**: 配信中の `continuation` を `get_live_chat_replay` に渡したところ（プレーンおよび `currentPlayerState: { playerOffsetMs: "0" }` 両方）、**`400 Request contains an invalid argument.`** で失敗した。
- **ログイン要否・429**: ログイン不要。429 未発生。
- **推測**: 配信者が DVR（巻き戻し）を有効にしていても、配信中の `liveChatRenderer` は `"isReplay":false` であり、配信中（放送終了・アーカイブ化前）に配信開始からの全件を API で取る手段は確認できなかった。

---

### 2. Twitch
- **今使っている口**: `extension-youtube/src/tw-content-entry.js`（匿名 IRC `wss://irc-ws.chat.twitch.tv:443` `justinfanNNNN`）。過去分 0件。
- **実際のリクエスト URL**:
  - `POST https://gql.twitch.tv/gql`（ヘッダ: `Client-Id: kimne78kx3ncx6brgo4mv6wki5h1ko`）
  - 配信中 VOD 特定: `query{user(login:"<login>"){id stream{id createdAt} videos(first:1,type:ARCHIVE){edges{node{id createdAt lengthSeconds}}}}}`
  - VOD コメント取得: `operationName: "VideoCommentsByOffsetOrCursor"`, `extensions: { persistedQuery: { version: 1, sha256Hash: "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a" } }`
- **応答の形のキー名**:
  - `data.video.comments.edges[].node`（`id`, `commenter`, `contentOffsetSeconds`, `createdAt`, `message`, `__typename`）
  - `data.video.comments.pageInfo.hasNextPage`
- **1ページの件数・さかのぼれた件数**:
  - 配信中（`stylishnoob4`, `stream: 316792616051`, `createdAt: 2026-11-16T08:08:46Z`）において、すでに配信中の VOD（`id: "2930362620"`, `createdAt: 2026-11-16T08:08:52Z`, `lengthSeconds: 6503`）が生成されていた。
  - `variables: { videoID: "2930362620", contentOffsetSeconds: 0 }` で **58件**（`contentOffsetSeconds: 6..41`）を取得。
  - `contentOffsetSeconds: 42`（前ページ末尾+1）で次ページ **57件**（`contentOffsetSeconds: 36..53`）を取得。
  - `contentOffsetSeconds: 6473`（現在時刻付近）で **36件**（最新 `2026-11-16T09:57:15.163Z`）を取得。
  - すなわち配信開始（6秒目）から現在時刻まで、ログインなしで取得可能だった。
- **失敗した試み**:
  - `edges[last].cursor` を渡した `variables: { videoID, cursor }` の 2ページ目は `edges: 0` が返った（`edges[0].cursor` と `edges[last].cursor` が同一値だったため、配信中 VOD では `cursor` ではなく `contentOffsetSeconds` を進める必要がある）。
  - 視聴ページ自身が呼んでいる GQL `MessageBuffer_Channel`（`sha256Hash: bfc959904f55b5003ae4674d4bea83ebdcd8867ad76e12f38957d433902d2fcc`）は、実測で `data.channel` のキーが空・`recentChatMessages` 0件だった。
- **ログイン要否・429**: ログイン不要。429 未発生。
- **推測・制約**: 配信者が「過去の配信を保存する（アーカイブ公開）」を無効にしている場合や、サブスクライバー限定 VOD に設定している場合は `videos(type:ARCHIVE)` から VOD コメントを取れないと推測される（未公開 VOD 枠での実測は未実施）。

---

### 3. Kick
- **今使っている口**: `extension-youtube/src/kick-content-entry.js` はリアルタイム WebSocket（Centrifugo / Pusher）のみ接続しており、`web.kick.com/api/v1/chat/<id>/history` は現在未使用。
- **実際のリクエスト URL**:
  - 初回: `GET https://web.kick.com/api/v1/chat/<channelId>/history`
  - ページ送り: `GET https://web.kick.com/api/v1/chat/<channelId>/history?cursor=<data.cursor>`
  - ※ `<channelId>` は `/api/v2/channels/<slug>` の `id`（`1286990`）。`chatroom.id`（`1279951`）ではない。
- **応答の形のキー名**:
  - トップ: `data`, `message`
  - `data`: `messages`（配列・新しい順）, `cursor`（マイクロ秒相当の数値文字列。例: `1794822519781459`）, `pinned_message`
  - `messages[0]`: `id`, `chat_id`, `user_id`, `content`, `type`, `metadata`, `sender`, `created_at`, `thread_parent_id`
- **1ページの件数・さかのぼれた件数**:
  - 1ページ **23〜25件**。
  - `chessbrah`（配信開始 `2026-11-16 07:57:24Z`）にて、`?cursor=` を繰り返して **16ページ・計 397件** を取得し、配信開始前（`2026-11-16T07:51:50Z`）まで **全件さかのぼり成功**。
- **失敗した試み**:
  - `?before=<id>`, `?before=<created_at>`, `?message_id=<id>`, `?next=<id>`, `?offset=50`, `?limit=200`, `?page=2` はすべて無視され、最新 23件が返った。`?cursor=<data.cursor>` のみ有効。
- **ログイン要否・429**: ログイン不要。16連続リクエストで **429 は 0回**。

---

### 4. ふわっち (whowatch.tv)
- **今使っている口**: `extension-youtube/src/ww-content-entry.js`（`GET https://api.whowatch.tv/lives/<liveId>?last_updated_at=0`）。
- **実際のリクエスト URL**:
  - `GET https://api.whowatch.tv/lives/<liveId>?last_updated_at=0&limit=500`
- **応答の形のキー名**:
  - トップ: `live`, `comments`, `deleted_comment_ids`, `updated_at`, `live_sent_items`, `polling_interval`, `jwt`, `comment_server_url`, `comment_count` 等
  - `comments[0]`: `id`, `user`, `comment_type`, `anonymized`, `enabled`, `live_id`, `posted_at`, `message`, `escaped_message` 等
- **1ページの件数・さかのぼれた件数**:
  - `limit` 省略時: **100件**（`liveId: 77771065` で確認）。
  - `limit` 指定時: `limit=300` で **300件**、`limit=500` / `1000` / `2000` / `5000` / `10000` では **301件** で打ち止め（総コメント数 `comment_count: 5514` の配信 `77766074` にて確認）。
- **スクロール読み込み・失敗した試み**:
  - `https://whowatch.tv/viewer/77766074` でコメント欄を上にスクロールしても追加コメント API リクエストなし。
  - `/lives/<id>/comments`, `/lives/<id>/comments?before=...`, `/lives/<id>/comments?max_id=...`, `/lives/<id>/comments?offset=50` はすべて **404**。
  - `?last_updated_at=0&offset=50`, `?before=<posted_at>`, `?max_comment_id=<id>` は無視され直近 100件のまま。
  - `comment_server_url`（`wss://ws.whowatch.tv/socket`）は WebSocket 用であり HTTP GET 不可。
- **ログイン要否・429**: ログイン不要。5連打で **429 は 0回**。

---

### 5. SHOWROOM
- **今使っている口**: `extension-youtube/src/sr-content-entry.js`（`GET https://www.showroom-live.com/api/live/comment_log?room_id=<roomId>`）。
- **実際のリクエスト URL**:
  - `GET https://www.showroom-live.com/api/live/comment_log?room_id=259899`
- **応答の形のキー名**:
  - トップ: `comment_log`（配列・新しい順）
  - `comment_log[0]`: `aft`, `avatar_id`, `avatar_url`, `class_level`, `class_level_image`, `comment`, `created_at`, `name`, `ua`, `user_id`
- **1ページの件数・さかのぼれた件数**:
  - 実測 **101件**（`created_at: 1794821678`〜`1794822850`、配信開始 `1794819636` には届かず）。
- **スクロール読み込み・失敗した試み**:
  - `https://www.showroom-live.com/r/NOA_ROOM` でスクロールしても追加リクエストなし（`[]`）。
  - `?limit=200`, `?count=200`, `?offset=50`, `?page=2`, `?before=<created_at>`, `?until=<created_at>`, `?live_id=<live_id>` はすべて無視され同じ 101件が返却。
- **ログイン要否・429**: ログイン不要。

---

### 6. ミクチャ (mixch.tv)
- **今使っている口**: `extension-youtube/src/mx-content-entry.js`（`GET https://mixch.tv/api-web/lives/<userId>/messages`）。
- **実際のリクエスト URL**:
  - `GET https://mixch.tv/api-web/lives/18741728/messages`
- **応答の形のキー名**:
  - ルートが配列（新しい順）
  - `messages[0]`: `kind`, `user_id`, `name`, `level`, `created`, `message_id`, `superfan_rank`, `vip_rank`, `body`
- **1ページの件数・さかのぼれた件数**:
  - 実測 **14〜55件**（検証した8配信中最大が `18741728` の 55件。ギフトや入室ログ含む）。
- **スクロール読み込み・失敗した試み**:
  - `https://mixch.tv/u/18741728/live` でスクロールしても追加リクエストなし（`[]`）。
  - `?limit=200`, `?count=200`, `?offset=50`, `?page=2`, `?before=<message_id>`, `?before_id=<message_id>`, `?max_id=<message_id>`, `?until=<created>`, `?created_before=<created>` はすべて無視され同じ 55件が返却。
- **ログイン要否**: 今回の API 直接取得およびページ表示ではログイン不要で 200 OK（ただし環境・アクセス状況によりログイン画面リダイレクトの可能性がある点は `mx-content-entry.js` の既存実装通り）。

---

### 7. TikTok LIVE
- **今使っている口**: `extension-youtube/src/tt-main-entry.js` + `tt-content-entry.js`（ページ自身の WebSocket `wss://webcast*.tiktok.com/...` を MAIN 世界で横取り）。
- **実測・確認結果**:
  - 本調査（2026-11-16 18:58 JST）では未ログインの Playwright で `https://www.tiktok.com/live` を開いた際、ページ内に CAPTCHA ゲート（`has captcha: true`）が存在し配信一覧リンクを取得できなかった。また `https://webcast.tiktok.com/webcast/feed/?aid=1988&channel_id=1111005&content_type=0&count=5` への直接 fetch はステータス 200 で空ボディだった。
  - また `council/tiktok-support-PLAN.md`（2026-11-09 PC 実測）に記録されている通り、未ログインではコメントの WebSocket (`webcast-ws`) 自体が開かない（映像のみ再生・コメント 0件）。
- **結論**: ログインなしでのコメント取得・過去分さかのぼりはともに**不可**。

---

### 8. ABEMA
- **今使っている口**: `extension-youtube/src/ab-main-entry.js` + `ab-content-entry.js`（ページ自身の fetch/XHR 応答を MAIN 世界で写す。コメント欄を開いている間のみ受信）。
- **実際のリクエスト URL**:
  - 2026-11-16 実測では `GET https://api.p-c3-e.abema-tv.com/v1/slots/<slotId>/comments?until=<createdAtMs>&limit=100`（ページ自身がスクロール時に呼ぶのは `?until=<createdAtMs>&limit=20`、新着ポーリングは `?since=<createdAtMs>&limit=100`）。
  - ※リクエストにはページが匿名セッション用に自動取得した `Authorization: Bearer ...` ヘッダが付与される。
- **応答の形のキー名**:
  - トップ: `comments`（配列・新しい順）
  - `comments[0]`: `id`, `message`, `createdAtMs`, `userId`
- **1ページの件数・さかのぼれた件数**:
  - 1ページ最大 **100件**（`limit=500`, `limit=1000` を指定しても上限 100件）。
  - `abema-news`（`slotId: CHWBFqEHifQBsm`、19:00 開始番組、コメント表示数 224）にて、初回 100件の末尾 `createdAtMs - 1` を `until` に渡してループしたところ、4ページ目（`len=0`）までに **計 240件** を取得し、番組開始直後（`2026-11-16T10:00:12.667Z` = 19:00:12 JST）まで **全件さかのぼり成功**。
- **スクロール読み込み**:
  - ページ自身もコメント欄を上にスクロールすると `GET .../v1/slots/<slotId>/comments?until=<oldest_createdAtMs>&limit=20` を自動で発行することを確認した。
- **失敗した試み**:
  - `?before=<id>`, `?after=<id>`, `?untilMs=<ms>`, `?beforeMs=<ms>`, `?createdAtMs=<ms>`, `?cursor=<id>`, `?offset=100` はすべて無視され最新 100件が返却。`?until=<createdAtMs>` のみ有効。
- **ログイン要否・429**: ログイン不要（匿名セッションの `Authorization` ヘッダで動作）。429 未発生。
- **補足**: `src/lib/abema/abParse.js` に記載のある別形式 `/v1/chats/<chatId>/messages` については、今回確認した `mahjong-2` および `abema-news` では使われていなかった（どちらも `/v1/slots/<slotId>/comments`）。
