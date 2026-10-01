# 地図(wayfinder): /live/ に Kick（先行）と YouTube（後続）を並べる

> 作成: 2026-10-01 / 司令塔(Claude Opus 5.5)が実コードを読んで作成。コード変更なし。
> 次の段: Fable が本地図から `live-multiplatform-kick-youtube-SPEC.md` を書く。

## 0. お題とユーザー決定（再質問しない）

- /live/ にニコ生以外の配信も並べる。**ニコ生とは別セクション**で、各セクション内は**同接の多い順**。
- **Kick を先に**、YouTube は後から（Kick で作った枠に乗せる）。
- Kick の規約: 開発者規約は見つからない。一般規約 §1.4 は自動アクセス・スクレイピングを禁止。
  ユーザー判断で「**公式 API を使う限り進める**」（日本語の Kick ランキングサイトが5つ以上公然と運営されている・
  Kick 自身が app token 用の公開 API を出している、が根拠）。出典表示＋Kick 配信ページへのリンク＋
  止められる作り（1か所で非表示）を保険とする。
- YouTube の規約（一次情報で確認済み・[[youtube-live-ranking-policy-and-quota-2026-10-01]]）:
  API 値をそのまま多い順に並べるのは可。**自前計算の指標（脈拍レーン・熱いチップ・コメント勢い・独自スコア）・
  チャンネル間の順位推移は禁止**。出典表示・privacy 追記・データは30日以内に更新/削除。
- Twitch は書面許可待ちで保留（[[twitch-developer-agreement-blocks-third-party-display-2026-09-25]]）。本件の対象外。

## 1. 入口

- 画面: `https://tsuioku-no-kirameki.com/live/` → [tsuioku-no-kirameki/live/index.html](../../tsuioku-no-kirameki/live/index.html)
  - 見出しは `<h1>…<small>いま支えている人 ― ニコニコ生放送</small>`（index.html:387）
  - 一覧の器は `<main id="list">` 1つだけ（index.html:403）、上部の要約は `#meta`（:389）
- API: `GET /api/live-ranking`（Vercel Functions・npm 依存なし）→ [api/live-ranking.js](../../api/live-ranking.js)
- 定期収集: GitHub Actions [.github/workflows/live-ranking.yml](../../.github/workflows/live-ranking.yml) が5分ごとに
  `?refresh=1` を x-share-key 付きで叩く（:25 cron, :50-53 curl）。Vercel Hobby の cron は1日1回なので Actions を使う（:3-9 コメント）。

## 2. 主要ファイルと責務

| ファイル | 責務 |
|---|---|
| [api/live-ranking.js](../../api/live-ranking.js) (720行) | ニコ生の収集 `collect()`、Redis 保存、閲覧者 refresh のスロットル/ロック、コメント集計・OG 画像の ingest |
| [api/live-recent-comments.js](../../api/live-recent-comments.js) | ホバー時の直近発言（ニコ生 NDGR 専用） |
| [src/extension/live-ranking-entry.js](../../src/extension/live-ranking-entry.js) (779行) | 画面の DOM 組み立て（`render()`）、60秒ごとの再取得、ホバーカード、脈拍レーン描画 |
| [src/lib/liveRankingView.js](../../src/lib/liveRankingView.js) | 純関数: `LIVE_ID_RE`、`watchUrlOf`、`estimateConcurrentForLive`、`sortByEstimatedConcurrent`、`supporterRows`/`commentRows` |
| [src/lib/liveMotion.js](../../src/lib/liveMotion.js) / [liveGiftPulse.js](../../src/lib/liveGiftPulse.js) | 脈拍レーン・応援者チップ・熱いチップ（ニコ生専用の自前計算） |
| [src/lib/concurrentEstimate.js](../../src/lib/concurrentEstimate.js) | 同接推定。`PLATFORM_PROFILES` / `getPlatformProfile`（:91-127, commit b39acdad）＝係数のプロファイル化だけで、データ取得の抽象ではない |
| [vercel.json](../../vercel.json) | rewrite のみ。関数設定・cron なし |

`api/` の関数は現在5本（live-og-image / live-og / live-ranking / live-recent-comments / status）。

## 3. データの流れ（ニコ生・現状）

1. Actions → `GET /api/live-ranking?refresh=1`（x-share-key）→ `handler`（live-ranking.js:508）
2. `collect()`（:308）: `live.nicovideo.jp/ranking` の HTML から lv 抽出 → 全件 `probeWatchPage()` を並列 → ON_AIR かつ個人配信に絞り `MAX_LIVES=20`（:75）→ `collectOne()` で koken/nicoad を付与
3. **空なら保存しない**（:678-693 `zero lives — not stored`）→ `SET live:ranking:latest EX 3600`（:694, `TTL_SECONDS` :61）
4. 閲覧者: `load()`（live-ranking-entry.js:394-406）が `/api/live-ranking` → 次に `?refresh=1`。60秒ごと（`AUTO_REFRESH_MS` :361）
   - 鍵なし refresh は前回収集から60秒未満なら保存済みを返す（`PUBLIC_REFRESH_MIN_MS` :58、:655-660）、`SET NX` ロック30秒（:662-667）
5. GET 時に `attachComments()`（:476）が `live:comments:latest` を lv ごとに合流
6. `render()`（entry:268-346）: `sortByEstimatedConcurrent` → `pinLiveFirst(?lv=)` → 各配信を
   `<section class="live" data-lv>` に組み立て。`renderHead`（:226-265）は `watchUrlOf(l.liveId)`・`l.thumbnail.small…`・
   `l.streamer.{icon50,name,pageUrl}`・`estimateConcurrentForLive`（「約N人 推定同時視聴」）を使う。
   その後に stats（来場/コメント/ギフト/広告/拡張導線/Xシェア）、脈拍レーン、4段アイコン列、3列（ギフト/広告/コメント）。

## 4. 既存の設計判断と根拠（壊してはいけない境界）

- **空で上書きしない**（live-ranking.js:678 コメント・実際に再現した事故）。別キーごとに同じ掟（コメント ingest :531-537、OG :612-615）。
- **性質の違うデータは別キー**（`COMMENTS_KEY` 冒頭コメント :32-39「片方が落ちてももう片方は出る」）。→ Kick/YouTube も別キーにするのが既存流儀と整合。
- **閲覧者 refresh で外部を乱打しない**（スロットル＋ロック）。外部 API の上限がある Kick/YouTube ではさらに重要。
- **取得の上限を発明しない**（:27-28「実測していない数字へ広げない」）。
- **外部 API はいつか落ちる・形が変わる**（AGENTS.md §3.6）: 形から検証・fail-soft・代替表示・壊れた1件だけ捨てる。
- **ユーザー情報セット**（AGENTS.md §3.5）: サムネ・名前・リンクを分かる限りセットで出す。
- `lv` 前提が随所に固定: `LIVE_ID_RE=/^lv\d{6,15}$/i`（liveRankingView.js:36）、ingest 検証（live-ranking.js :530, :572, :608）、`shareHref`/`?lv=` ピン（entry :60-80）、OG 画像。

## 5. 変更すると壊れうる箇所

- `render()` の各 tracker（`tracker/giftPulse/laneTracker/motion/supporterFeeds/commentPulse` の begin/end, entry :291-345）は lv をキーに状態を持つ。Kick/YouTube を同じループに混ぜると、存在しないフィールド（gift/ad/comment）で各種 lib が想定外入力を受ける。
- `sortByEstimatedConcurrent` は推定値で並べる。YouTube/Kick は実数なので混ぜて並べると比較が不公平（ユーザーへも説明済み）。
- `#meta` の「放送中 N 配信」はニコ生件数前提。
- `api/live-ranking.js` の handler は既に分岐が多い（ingest×2・state・refresh・GET）。ここに外部 API 呼び出しを足すとニコ生収集の失敗と連鎖しうる。
- OG/Xシェア（`?lv=`）・`live-og-bake.mjs`・`live-comment-tally.mjs` は lv 専用。
- `max-lines` ラチェット — live-ranking-entry.js の行数制限は**未確認**。
- `npm run tree-map` / `feature-map` / `verify:cc` の門（新規ファイル追加時）。

## 6. 未確認の前提・追加調査が必要な点

- **Kick**（一次情報: docs.kick.com）
  - `GET https://api.kick.com/public/v2/livestreams`（App/User Access Token）。`language_code`（BCP47, 最大25）、`category_id`、`limit` 1-1000（既定100）、`cursor`。
    返却: `viewer_count, title, thumbnail, broadcaster_user{id,username,profile_picture}, channel{slug}, category{id,name,thumbnail}, id, language_code, started_at, tags, has_mature_content`。
    **並び順は「oldest to newest」**＝同接順は自前ソート。
  - v1 `/public/v1/livestreams` は `sort=viewer_count` を持つが**非推奨**。
  - App token: `POST https://id.kick.com/oauth/token`（`grant_type=client_credentials, client_id, client_secret`, form-urlencoded）。`expires_in` あり（値の大きさは**未確認**）。
  - **レート制限: ドキュメントに記載なし（未確認）**。
  - **日本語配信の実数: 未計測**（鍵が来たら1回叩いて数える）。`language_code=ja` の精度（配信者の自己申告か）も**未確認**。
    件数が limit を超える場合は cursor でページングが要る（全件取って同接順に並べるため）。
  - `has_mature_content=true` の扱い（成人向け）— 表示してよいか**未決定**。
  - サムネ URL の寿命・ホットリンク可否（referrerpolicy=no-referrer で読めるか）**未確認**。
  - 配信ページ URL は `https://kick.com/<channel.slug>` と推測（**未確認**だが一般的形式）。
- **YouTube**（一次情報で確認済みの部分は §0 と memory）
  - search.list は別枠100回/日 → 一覧再構築は約15分に1回が上限。videos.list(1単位/50件)で同接更新は毎分可。
  - 日本語配信の判定: `regionCode=JP`/`relevanceLanguage=ja` は保証なし → タイトル等での判定方法が**未決定**。
  - `concurrentViewers` は配信者が隠すと欠落。
- **Vercel**: Hobby の関数数上限（12と記憶・**未確認**）・関数実行時間上限。現在5本なので +1〜2 は余裕がある見込み（推測）。
- **鍵の保管**: `KICK_CLIENT_ID`/`KICK_CLIENT_SECRET`（・将来 `YOUTUBE_API_KEY`）を Vercel 環境変数へ。Secret はユーザーが直接入力（司令塔は値を見ない。Twitch と同じ運用）。App token のキャッシュ先（Redis に置くか毎回取るか）**未決定**。

## 7. 実装前に決める必要がある質問（Fable が答える）

1. **収集の置き場**: `api/live-ranking.js` の `collect()` に足すか、別関数（例 `api/live-platforms.js`）＋別 Redis キー（例 `live:kick:latest`）にするか。ニコ生収集との失敗の独立性・既存 handler の複雑さ・関数数で判断。
2. **応答の形**: `/api/live-ranking` の応答に同梱するか、画面が別エンドポイントを並行で取るか。60秒ごとの再取得・鮮度表示（`freshness`）との整合。
3. **正規化スキーマ**: プラットフォーム共通の「1配信」の形（例 `platform, id, url, title, thumbnail, channel{name,icon,url}, viewers, startedAt, category, mature`）を決めるか。ニコ生の既存 `lives[]` は触らない前提でよいか。
4. **収集頻度とトリガー**: Kick は Actions の5分 cron に相乗りか。閲覧者 refresh（60秒）で Kick も叩くか（レート制限未確認なのでスロットル幅をどうするか）。YouTube は search 15分＋videos 数分の2段構えをどう表現するか。
5. **App token の扱い**: 毎回取得か Redis キャッシュ（`expires_in` 未確認）か。失敗時の挙動。
6. **件数と絞り込み**: Kick 何件表示（上位20？）、`language_code=ja` のみか、`has_mature_content` は除外か表示か、カテゴリの扱い。
7. **画面構成**: 別セクションの見出し・タブかスクロールで並べるか・セクションごとの「放送中 N 配信」と鮮度。ニコ生の `?lv=` ピン・Xシェアとの関係（Kick 行のシェアは出すか）。
8. **Kick 行で出すもの/出さないもの**: ニコ生と同じ脈拍レーン等は出さない（データが無い）で確定してよいか。出典表示の文言と位置。
9. **キルスイッチ**: Kick（や YouTube）を1か所で止める手段（環境変数？定数？）。
10. **YouTube の拡張余地**: Kick で決めた枠のどこに YouTube が乗るか（実装は後続だが、スキーマとキー設計は今決める）。日本語判定の方法。
11. **privacy.html / LP の文言**: /live/ は当サイト側の公開ページで拡張のプライバシーとは別物。どこに「Kick/YouTube API を使用」を書くか（YouTube は privacy 記載が規約上必須）。
12. **テスト方針**: 既存は vitest の純関数テスト（liveRankingView.test.js 等）。Kick 応答の形検証（`isLikely…Shape` の流儀）・正規化・ソート・空で上書きしない、をどの層で固定するか。
