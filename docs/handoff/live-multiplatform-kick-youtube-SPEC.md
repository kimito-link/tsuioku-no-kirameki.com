# 実装仕様: /live/ に Kick（先行）と YouTube（後続の枠だけ）を並べる

> 作成: 2026-10-01 / **設計=Fable（claude-fable-5-1）／地図・裏取り=司令塔（Claude Opus 5.5）**
> 地図: [live-multiplatform-kick-youtube-MAP.md](live-multiplatform-kick-youtube-MAP.md)。コード変更なし。
> 地図 §0 のユーザー決定（別セクション・同接順・Kick 先行・YouTube は API 値をそのまま並べるだけ）は前提であり覆さない。

## 司令塔の裏取り結果（2026-10-01・実コードで確認済み）

| Fable の主張 | 確認結果 |
|---|---|
| `api/live-ranking.js` が `upstash`(:136)・`TTL_SECONDS`(:61)・`readBody`(:366) を export | ✅ 実在。`upstash` は live-og / live-og-image / live-recent-comments が既に import |
| `src/lib/htmlText.js` に `escapeHtml`(:23)・`safeHttpUrl`(:37)・`formatNumberJa`(:47) | ✅ 実在（entry 内の `esc`/`num` はこれらの別名） |
| `liveRankingView.js` に `jstClock`(:66, **引数は UNIX 秒**)・`elapsedText`(:82)・`freshness`(:98, 既定 `STALE_MIN=60`)・`cacheBust`(:143) | ✅ 実在 |
| `src/lib/timeAuthority.js:72` `toEpochMs` | ✅ 実在 |
| `bindImgFallback`（entry:175）が `img.sicon` / `.shot img.shotimg` を拾う | ✅ 実在。Kick カードが同じクラスを使えばそのまま効く |
| workflow のジョブは `refresh` / `tally` / `og` | ✅（live-ranking.yml :38 / :79 / :107） |
| privacy.html §14（`id="s14"`、14-1〜14-4） | ✅（:703〜:731） |
| `live-ranking-entry.js` に max-lines ラチェットは無い | ✅ eslint.config.js の max-lines 対象は popup/content/venueBar/status のみ |
| `src/server/` に fetch 注入の前例 | ✅ `src/server/nicoliveGuest.js` + `.test.js` が存在（A8 の流儀は実装時に読んで合わせる） |

**司令塔の追記（3視点レビューで見つけた抜け）**
- **鍵登録前にマージすると Actions の `kick` ジョブが5分ごとに赤くなる**（503 no credentials）。実装ハンドオフで「Vercel に鍵登録 → 手動実行で実測 → それから cron を有効化」の順に固定する。
- 「Kick」の表記とブランド色バッジは未解決の質問 #6。ロゴ画像は使わない。

---

## 1. Problem Statement

`/live/`（`tsuioku-no-kirameki/live/index.html` + `src/extension/live-ranking-entry.js` + `api/live-ranking.js`）はニコ生専用に作られている。lv 前提が随所に固定されており（`LIVE_ID_RE`、`?lv=` ピン、X シェア、OG、ingest 検証）、`render()` の各 tracker（`tracker/giftPulse/laneTracker/motion/supporterFeeds/commentPulse`）は lv をキーに状態を持つ。ここに Kick/YouTube の配信を同じ `lives[]`・同じループへ混ぜると、

- 存在しないフィールド（gift/ad/comment）で各 lib が想定外入力を受ける、
- 推定値（ニコ生）と実数（Kick/YouTube）を `sortByEstimatedConcurrent` で混ぜて並べて不公平になる、
- `api/live-ranking.js` の handler（既に ingest×2・state・refresh・GET の分岐持ち）に外部 API 呼び出しが増え、ニコ生収集の失敗と連鎖する、

という壊れ方をする。したがって本件は「既存のニコ生の流れに一切触れずに、横に別系統を 1 本立てる」設計でなければならない。あわせて Kick は規約上グレー（一般規約 §1.4）なので、**公式 API のみ・出典表示・配信ページへのリンク・1 か所で止められる作り**を構造として持つ必要がある。

---

## 2. Solution

### 2.1 一言で

**別関数・別キー・別エンドポイント・別セクション・別テスト。** ニコ生側のファイルへの変更は「画面に 1 つのコンテナ要素を足す」「entry から新しい fetch を 1 本増やす」だけに限定する。Kick/YouTube の全ロジックは新規ファイルに置く。

```
GitHub Actions (5分) ──x-share-key──▶ GET /api/live-platforms?refresh=1&platform=kick
                                         │ src/server/kickApi.js (token + livestreams)
                                         │ src/lib/kickLivestreams.js (形検証・正規化・ソート・保存可否)
                                         ▼
                                   Redis live:kick:latest (EX 3600)
                                         ▲
閲覧者 /live/ ──GET /api/live-ranking──▶ ニコ生（既存・不変）
            └─GET /api/live-platforms─▶ { platforms: { kick, youtube } }  ← 別 fetch・片方が落ちても片方は出る
                                         │ src/lib/livePlatformsHtml.js (純関数で HTML 文字列)
                                         ▼
                                   <section id="platforms"> （#list の下・別セクション）
```

### 2.2 地図 §7 の質問 1〜12 への回答

1. **収集の置き場**: **別関数 `api/live-platforms.js` + 別 Redis キー `live:kick:latest`**。`api/live-ranking.js` の `collect()`/handler には触らない。根拠は地図 §4「性質の違うデータは別キー」と §5「handler は既に分岐が多い」。`upstash()`・`TTL_SECONDS`・`readBody` は `api/live-ranking.js` の export を再利用（前例: live-recent-comments.js）。Vercel 関数数は 5→6 本（Hobby 上限は未確認）。

2. **応答の形**: **画面が別エンドポイント `GET /api/live-platforms` を並行で取る**（同梱しない）。(a) 同梱するとニコ生側の 404/500 判定と Kick の状態が 1 つの HTTP ステータスに潰れる、(b) 別 fetch なら「ニコ生だけ落ちた／Kick だけ落ちた」が自然に独立する。鮮度は既存 `freshness(capturedAt, nowMs)` をセクションごとに呼ぶ。60 秒の再取得は既存 `load()` と同じ周期で `loadPlatforms()` を並走させるが、**Kick 側は `?refresh=1` を送らない**（収集は cron 専任・質問 4）。

3. **正規化スキーマ**: プラットフォーム共通の「1 配信」を次で固定する（`src/lib/kickLivestreams.js` の JSDoc `@typedef PlatformLive` が正本）。**ニコ生の既存 `lives[]` は触らない**。
   ```
   PlatformLive = {
     platform: 'kick' | 'youtube',
     id: string,                 // Kick: livestream id（文字列化）/ YouTube: videoId
     url: string,                // 配信ページ（http(s) のみ・safeHttpUrl 相当の検疫済み）
     title: string,              // ≤120 字
     thumbnail: string,          // '' 可
     channel: { name: string, icon: string, url: string },  // 各 '' 可
     viewers: number,            // API が返した実数（0 以上の整数・推定しない）
     startedAt: number,          // epoch ms（取れなければ 0）
     category: string,           // '' 可
     mature: boolean,
     language: string            // BCP47（'' 可）
   }
   ```
   「推定同時視聴」の語は Kick 行では使わない（「同時視聴（Kick の値）」と書く）。

4. **収集頻度とトリガー**: **Kick は Actions の 5 分 cron に相乗り**（`.github/workflows/live-ranking.yml` に独立ジョブ `kick`・`needs` なし）。**閲覧者 refresh では Kick を叩かない（MVP）**。レート制限が未確認で、閲覧者数に比例する呼び出しは「発明した数字」で挑むことになる（地図 §4）。鍵なし `?refresh=1` は 403。解禁はレート制限ヘッダを実測してから `KICK_PUBLIC_REFRESH_MIN_MS` を足す第 2 段。YouTube の 2 段構え（search 15 分 + videos 数分）は **2 キー** `live:youtube:search`（候補 videoId）と `live:youtube:latest`（表示用 `PlatformLive[]`）で表現し、将来 `youtube-search`（15 分）と `youtube-videos`（5 分）の 2 ジョブを足す。キー名だけ本仕様で確定。

5. **App token の扱い**: **Redis キャッシュ `live:kick:token`**。`expires_in`（値未確認）を読んで `EX = clamp(expires_in - 60, 60, 3600)`。読めなければ保存しない（毎回取る）。失敗時: (a) token 取得失敗 → `502 { error: 'kick token failed' }`、保存済みは触らない。(b) livestreams が 401 → token を `DEL` して **1 回だけ**取り直して再試行、再失敗は 502。(c) 鍵未設定 → `503 { error: 'no credentials' }`（Actions は赤＝黙って成功させない）。

6. **件数と絞り込み**: `language_code=ja`、`limit=100`、**MVP は 1 ページのみ**（次ページ cursor があり 100 件ちょうどなら `truncated: true`、画面は「上位のみ表示」）。表示件数 `KICK_MAX_LIVES = 20`（既存 `MAX_LIVES` と同値）。`viewer_count` 降順を自前ソート。**`has_mature_content=true` は保存するが表示しない（既定）**、`SHOW_MATURE = false` 1 か所で切替（未解決 #1）。カテゴリは `category.name` をテキストチップで出すだけ。

7. **画面構成**: **タブではなくスクロール**。`<main id="list">`（ニコ生）の直後に `<section id="platforms" class="platforms" aria-live="polite">`、その中に `<section class="platform" data-platform="kick">`。各セクションに独自の見出し（`Kick ― いま配信中（同時視聴の多い順）`）とメタ行（`配信中 N 配信・N分前 更新`）。既存 `#meta` はニコ生件数のまま。**`?lv=` ピン・X シェアは Kick 行に出さない（MVP）**（lv 専用のため。Out of Scope）。

8. **Kick 行で出すもの/出さないもの**: 出す＝サムネ・配信者アイコン＋名前＋チャンネルリンク・タイトル・開始時刻と経過（`jstClock`/`elapsedText` 再利用）・同時視聴（実数）・カテゴリ・LIVE バッジ・順位番号。**出さない＝脈拍レーン・4 段アイコン列・ギフト/広告/コメント 3 列・拡張導線（🧩）・X シェア・ホバーカード**。出典表示はセクション末尾 `<p class="platform__source">`「出典: Kick 公式 API（同時視聴数・サムネ・配信者名は Kick が返す値をそのまま表示）。各カードは Kick の配信ページへのリンクです。」＋下部 `.note` に 1 段落（§4.6）。

9. **キルスイッチ**: **Redis キー `live:platforms:off`**（JSON `{ "kick": true, "youtube": false }`）。`POST /api/live-platforms?ingest=off`（x-share-key 必須・body `{ platform: 'kick', off: true }`）で設定。GET は off なら `{ ok:false, disabled:true, lives:[] }`、`?refresh=1` も収集せず 200 `{ ok:true, stored:false, disabled:true }`（cron は緑のまま）。画面は disabled のセクションを描かない。**再デプロイ不要で即時に止まる**。鍵を Vercel から消すのも二重の保険（質問 5(c)）。

10. **YouTube の拡張余地**: 同じ `PlatformLive` 型・同じ応答の `platforms.youtube`。キー `live:youtube:latest` / `live:youtube:search`。I/O は `src/server/youtubeApi.js`、純ロジックは `src/lib/youtubeLiveVideos.js`（名前だけ予約・実装しない）。画面は `platforms.youtube.lives.length > 0` のときだけ描く（MVP は `{ ok:false, error:'not implemented', lives:[] }`）。**日本語判定は未決定**（未解決 #4）。規約上の禁止（自前指標・順位推移）は `livePlatformsHtml.js` が増分・推定系の関数を import しないことで構造的に守る。

11. **privacy.html / LP の文言**: `tsuioku-no-kirameki/privacy.html` §14 の 14-1 に「Kick の配信一覧（`api.kick.com`・公式 API）」を 1 行追加し、新設 `14-5. 他の配信プラットフォーム` に「Kick 公式 API から取得した公開情報（配信者名・アイコン・サムネ・同時視聴数・カテゴリ）をそのまま表示／当サイトが推定・集計した値ではない／最新 1 件のみ保存・1 時間で消える／閲覧者の情報は取らない／掲載停止は 14-4 と同じ連絡先」。YouTube 実装時は「YouTube API Services を使用」「Google プライバシーポリシーへのリンク」「30 日以内に更新/削除」を追記。`/live/index.html` の `.note` にも 1 段落。**触ったら `npm run site-health`**。

12. **テスト方針**: 3 層。(a) 純関数（vitest）: `kickLivestreams.test.js`・`livePlatformsHtml.test.js`。(b) サーバ I/O: `src/server/kickApi.test.js`（`fetchImpl` 注入で token→401→再取得）。(c) 配線テスト `src/lib/livePlatforms.wiring.test.js`（entry のソース文字列を読む・`liveGiftPulse.wiring.test.js` の流儀）。「空で上書きしない」は純関数 `decideKickStore` に判定を置いて (a) で固定。

---

## 3. User Stories

| # | 状況 | 期待する振る舞い |
|---|---|---|
| S1 | 正常系: ニコ生も Kick も収集済み | `#list` にニコ生（従来どおり）、その下に `#platforms > section[data-platform=kick]`。見出し「Kick ― いま配信中」、メタ「配信中 **N** 配信・M分前 更新」、`viewers` 降順で最大 20 枚。各カード「**1,234人** 同時視聴（Kick の値）」。 |
| S2 | Kick 0 件（API 正常・`data: []`） | `{ lives: [], count: 0 }` を保存（0 件は正常）。画面は見出し＋「いま Kick で表示できる日本語配信がありません」（キャラ顔つき）。ニコ生は不変。 |
| S3 | 読み込み中（初回） | `#platforms` は空のまま（骨格を出さない）。応答後に初めてセクションが現れる。 |
| S4 | Kick API 失敗（5xx / timeout / 形違い） | 収集側 `502 { ok:false, error:'kick api failed' or 'kick shape invalid', status }`、保存済みは触らない。Actions `kick` は赤。画面は直前の保存値（TTL 1h 内）＋ stale なら「⚠ N分前の情報です」。保存値も無ければ「Kick の一覧をまだ取得できていません」。 |
| S5 | token 失敗 | `502 { error:'kick token failed' }`。保存済み不変。画面は S4 と同じ。 |
| S6 | livestreams が 401 | `live:kick:token` を DEL → 取り直し → **1 回だけ**再試行。再失敗は S5。 |
| S7 | 鍵未設定 | `?refresh=1` は 503（Actions 赤）。GET は `{ ok:false, error:'no credentials', lives:[] }`。画面はセクションを**描かない**。 |
| S8 | 古いデータ（cron 停止） | stale ならメタ行が `.stale` で「⚠ N分前の情報です」。TTL で消えたら S4 の「まだ取得できていません」。 |
| S9 | ニコ生だけ落ちた | 既存 `showState()` が `#meta`/`#list` に出す。`#platforms` は影響を受けない。 |
| S10 | Kick だけ落ちた（`/api/live-platforms` 500/通信） | `#platforms` にだけ「Kick の一覧を読み込めませんでした（次回の自動更新で再試行）」。 |
| S11 | キルスイッチ ON | GET は disabled、画面は描かない。cron は 200 `{ stored:false, disabled:true }`（緑）。再デプロイなし。 |
| S12 | 成人向け配信 | 保存はする（`mature:true`）。`SHOW_MATURE=false` で除外し「成人向け N 件は表示していません」を小さく添える（隠したことを黙らない）。 |
| S13 | サムネ読込失敗 | 既存 `bindImgFallback` で `.shot img.shotimg` → キャラの幕、`img.sicon` → りんくの顔。`referrerpolicy="no-referrer"` を付ける。 |
| S14 | モバイル幅（<640px） | 既存 `.live__head` と同じグリッド（クラス共用）。横スクロールなし・16px ガター。 |
| S15 | `truncated:true` | メタに「上位のみ表示（Kick 側の一覧が 100 件を超えています）」。 |

---

## 4. Implementation Decisions

### 4.1 新規ファイル

| ファイル | 層 | 役割 |
|---|---|---|
| `api/live-platforms.js` | Vercel Function | GET（保存済み配布）/ `?refresh=1&platform=kick`（収集・x-share-key）/ `POST ?ingest=off`（キルスイッチ）。npm 依存ゼロ。 |
| `src/server/kickApi.js` | サーバ I/O | token 取得・livestreams 取得（fetch 注入可能）。Redis は触らない。 |
| `src/lib/kickLivestreams.js` | 純関数 | 形検証・正規化・ソート・保存可否・URL 組み立て。 |
| `src/lib/livePlatformsHtml.js` | 純関数 | 応答 → セクション HTML 文字列。DOM を触らない。 |
| `src/lib/kickLivestreams.test.js` / `src/lib/livePlatformsHtml.test.js` / `src/server/kickApi.test.js` / `src/lib/livePlatforms.wiring.test.js` | テスト | §5。 |

既存ファイルへの変更（最小）: `src/extension/live-ranking-entry.js`（import・`elPlatforms`・`loadPlatforms()`・タイマー配線）、`tsuioku-no-kirameki/live/index.html`（コンテナ 1 要素・CSS・note 1 段落）、`tsuioku-no-kirameki/privacy.html`（§14 追記）、`.github/workflows/live-ranking.yml`（`kick` ジョブ）、`scripts/repo-tree-map.mjs`（`ROLES['api']` と `FEATURES` に 1 行）。**`api/live-ranking.js` は変更しない**。

### 4.2 環境変数と Redis キー

| 名前 | 置き場 | 意味 |
|---|---|---|
| `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` | Vercel 環境変数（ユーザーが直接入力・司令塔は値を見ない） | App token 取得用 |
| `YOUTUBE_API_KEY` | 同上（後続） | 予約のみ |
| `STATUS_INGEST_KEY` | 既存 | `?refresh=1` と `?ingest=off` の x-share-key（鍵を増やさない） |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 既存 | `upstash()` が読む |

| Redis キー | 型 | TTL | 中身 |
|---|---|---|---|
| `live:kick:latest` | string(JSON) | `TTL_SECONDS`(3600) | `KickStored`（§4.5） |
| `live:kick:token` | string | `clamp(expires_in-60, 60, 3600)` | access_token（応答・ログに出さない） |
| `live:kick:refresh-lock` | string | 30 秒 | `SET NX`（cron 二重実行防止） |
| `live:platforms:off` | string(JSON) | なし | `{ kick?: boolean, youtube?: boolean }` |
| `live:youtube:latest` / `live:youtube:search` | string(JSON) | 後続で決める | 予約のみ |

キー文字列は `api/live-platforms.js` で `export const KICK_STORE_KEY = 'live:kick:latest'` 等として 1 か所に置く（`OG_IMAGE_KEY` の前例）。

### 4.3 `src/lib/kickLivestreams.js`（純関数）

```js
/** @typedef {{ platform:'kick'|'youtube', id:string, url:string, title:string, thumbnail:string,
 *   channel:{ name:string, icon:string, url:string }, viewers:number, startedAt:number,
 *   category:string, mature:boolean, language:string }} PlatformLive */

export const KICK_LIVESTREAMS_URL = 'https://api.kick.com/public/v2/livestreams';
export const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';
export const KICK_LANGUAGE_CODE = 'ja';
export const KICK_PAGE_LIMIT = 100;
export const KICK_MAX_LIVES = 20;          // ★MAX_LIVES(20)と同値。増やさない
export const KICK_TITLE_MAX = 120;         // probeWatchPage の title.slice(0,120) と同値
export const KICK_NAME_MAX = 80;           // streamer.name の slice(0,80) と同値

export function isLikelyKickLivestreamsShape(json): boolean        // data が配列なら true（包みの形は未確認のため data だけ見る）
export function normalizeKickLivestream(raw): PlatformLive | null  // id か slug が作れなければ null（その 1 件だけ捨てる）
export function normalizeKickLivestreams(json): PlatformLive[] | null  // 形違いは null（空配列ではない）
export function sortByViewers(lives): PlatformLive[]               // 降順・同点は元順・元配列を壊さない
export function kickChannelUrl(slug): string                       // /^[a-z0-9_-]{1,64}$/i のときだけ https://kick.com/<slug>
export function decideKickStore({ ok, lives }): { store: boolean, reason: string }  // 0 件は store:true、null は false
export function isTruncated(json, limit): boolean                  // cursor あり && 件数 >= limit
```

対応: `id`←`id`（文字列化）、`title`←`title`（≤120・空白圧縮の 1 行ヘルパをこのファイルに持つ）、`thumbnail`←`thumbnail`（`safeHttpUrl`・`src/lib/htmlText.js`。オブジェクト `{ src }` でも読む＝A3）、`channel.name`←`broadcaster_user.username`、`channel.icon`←`broadcaster_user.profile_picture`（`safeHttpUrl`）、`channel.url`/`url`←`kickChannelUrl(channel.slug)`、`viewers`←`viewer_count`（0 以上の整数・他は 0）、`startedAt`←`toEpochMs(started_at)`（`src/lib/timeAuthority.js`）、`category`←`category.name`（≤80）、`mature`←`has_mature_content === true`、`language`←`language_code`（≤16）。

### 4.4 `src/server/kickApi.js`（I/O・fetch 注入）

```js
/** @param {{ clientId:string, clientSecret:string, fetchImpl?:typeof fetch, timeoutMs?:number }} d
 *  @returns {Promise<{ ok:true, token:string, expiresIn:number } | { ok:false, status:number, error:string }>} */
export async function fetchKickAppToken(d)
// POST KICK_TOKEN_URL, body = new URLSearchParams({ grant_type:'client_credentials', client_id, client_secret })
// Content-Type: application/x-www-form-urlencoded / signal: AbortSignal.timeout(timeoutMs=8000)
// json.access_token が非空文字列でなければ ok:false。expiresIn = Number(json.expires_in)||0。

/** @param {{ token:string, languageCode?:string, limit?:number, fetchImpl?:typeof fetch, timeoutMs?:number }} d
 *  @returns {Promise<{ ok:boolean, status:number, json:unknown|null, headersSample?:Record<string,string> }>} */
export async function fetchKickLivestreams(d)
// GET `${KICK_LIVESTREAMS_URL}?language_code=ja&limit=100`、Authorization: Bearer <token>
// UA は既存と同じ 'tsuioku-no-kirameki.com live-ranking (admin@kimito-link.com)'（live-og-bake.mjs:53 と同文・実装時に確認）
// レート制限らしきヘッダ（x-ratelimit-* 等）があれば headersSample として返す（実測用）
```

`timeoutMs` 既定 8000 は `FETCH_TIMEOUT_MS`（`api/live-ranking.js:157`）と同値（export されていないので数値再掲＋出所コメント）。

### 4.5 `api/live-platforms.js`（handler）

```js
export const KICK_STORE_KEY = 'live:kick:latest';
export const KICK_TOKEN_KEY = 'live:kick:token';
export const KICK_REFRESH_LOCK_KEY = 'live:kick:refresh-lock';
export const PLATFORMS_OFF_KEY = 'live:platforms:off';
export const YOUTUBE_STORE_KEY = 'live:youtube:latest';     // 予約
export const YOUTUBE_SEARCH_KEY = 'live:youtube:search';    // 予約
import { upstash, TTL_SECONDS, readBody } from './live-ranking.js';

export async function collectKick(deps)   // export はローカル検証用（collect() と同じ流儀）
export default async function handler(req, res)
```

分岐（上から順に）:
1. `Cache-Control: no-store`。
2. `POST ?ingest=off`: x-share-key 検証（不一致 401）→ `readBody` → `{ platform:'kick'|'youtube', off:boolean }` 以外は 400 → `PLATFORMS_OFF_KEY` を読み該当だけ更新して `SET`（TTL なし）→ 200 `{ ok:true, off }`。
3. `GET` 以外は 405。
4. `GET ?refresh=1`: x-share-key **必須**（無ければ 403）。`platform` は `kick` のみ（他は 400）。off なら 200 `{ ok:true, stored:false, disabled:true }`。鍵未設定 503。ロックが取れなければ 200 `{ ok:true, stored:false, inFlight:true }`。`collectKick()` → `decideKickStore()` → store:false なら 502（保存しない）／store:true なら `SET KICK_STORE_KEY <KickStored> EX TTL_SECONDS` → 200 `{ ok:true, stored:true, count, truncated, matureCount }`。finally でロック DEL。
5. `GET`（閲覧者）: `PLATFORMS_OFF_KEY`・`KICK_STORE_KEY` を読み、**常に 200**:

```jsonc
{
  "ok": true,
  "capturedAt": 1790000000000,
  "platforms": {
    "kick": {
      "ok": true, "platform": "kick", "capturedAt": 1790000000000,
      "count": 37, "shown": 20, "truncated": false, "matureCount": 2,
      "language": "ja", "source": "kick-public-api-v2",
      "lives": [ /* PlatformLive[]（viewers 降順・KICK_MAX_LIVES 件・mature を含む） */ ]
    },
    // 失敗/未収集/停止/鍵なし: { "ok": false, "platform": "kick", "error": "not collected yet" | "disabled" | "no credentials" | "broken payload", "disabled": true?, "lives": [] }
    "youtube": { "ok": false, "platform": "youtube", "error": "not implemented", "lives": [] }
  }
}
```

`KickStored` = `{ ok:true, platform:'kick', capturedAt, count, shown, truncated, matureCount, language, source, lives }`。GET はそのまま `platforms.kick` に入れる（検疫は保存時に済ませる）。

`collectKick({ fetchImpl, now })`: (1) `GET KICK_TOKEN_KEY` → 無ければ `fetchKickAppToken` → `SET … EX clamp` (2) `fetchKickLivestreams` → 401 なら DEL → 取り直し → 1 回だけ再試行 (3) `normalizeKickLivestreams` → null なら `{ ok:false, error:'kick shape invalid', status }` (4) `sortByViewers` → `slice(0, KICK_MAX_LIVES)` → `KickStored`。**token の値は console にもレスポンスにも例外メッセージにも出さない**。

### 4.6 画面

**index.html**（`<main id="list">` の直後）:
```html
<section id="platforms" class="platforms" aria-live="polite"></section>
```
CSS（inline `<style>` に追加。既存 `.live__head/.shot/.sicon/.sname/.times/.now` を流用）:
```css
.platforms { display: grid; gap: 16px; margin-top: 24px; }
.platform__title { margin: 0 0 4px; font-size: 1.15rem; color: var(--navy-deep); display: flex; align-items: center; gap: 8px; }
.platform__badge { font-size: .72rem; font-weight: 800; letter-spacing: .06em; padding: 3px 8px; border-radius: 6px; background: #53fc18; color: #0b0e0b; }
.platform__meta { margin: 0 0 10px; font-size: .86rem; color: var(--ink-sub); display: flex; gap: 8px; flex-wrap: wrap; }
.platform__list { display: grid; gap: 12px; }
.plive { border: 1px solid var(--line); border-radius: 16px; background: var(--card); overflow: hidden; box-shadow: 0 6px 20px rgba(20,55,92,.06); }
.plive .category { font-size: .74rem; color: var(--ink-sub); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; }
.platform__source { margin: 8px 0 0; font-size: .74rem; color: var(--ink-sub); }
```
（CSS 変数名 `--navy-deep/--ink-sub/--line/--card` は実装時に index.html の `:root` で実在を確認すること。）
`.note` に 1 段落: 「★<b>Kick の一覧</b>は、Kick の公式 API が返す配信中の日本語配信を<b>同時視聴数の多い順</b>に並べたものです。同時視聴数・配信者名・サムネ・カテゴリは Kick の値をそのまま表示しています。ギフト・コメントの集計は行っていません。」

**セクション DOM（`livePlatformsHtml.js` が生成）**:
```html
<section class="platform" data-platform="kick">
  <h2 class="platform__title"><span class="platform__badge">Kick</span>いま配信中 <small>同時視聴の多い順</small></h2>
  <p class="platform__meta">配信中 <b>N</b> 配信<span>・M分前 更新</span><span>・成人向け K 件は表示していません</span><span>・上位のみ表示</span></p>
  <div class="platform__list">
    <article class="plive" data-platform="kick" data-id="<id>">
      <div class="live__head">
        <a class="shot" href="<url>" target="_blank" rel="noopener noreferrer" aria-label="Kick の配信ページを開く（新しいタブ）">
          <img class="shotimg" src="<cacheBust(thumbnail, capturedAt)>" width="352" height="198" alt="配信画面のサムネイル" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          <span class="rankno r1">1</span><span class="onair">LIVE</span>
        </a>
        <div class="live__info">
          <div class="streamer"><img class="sicon" src="<channel.icon or FACE.linkNormal>" alt=""><a class="sname" href="<channel.url>" target="_blank" rel="noopener noreferrer">name</a></div>
          <h3><a href="<url>" target="_blank" rel="noopener noreferrer">title</a></h3>
          <div class="times"><span>▶ HH:MM 開始</span><span>経過 <b>1時間20分</b></span></div>
          <span class="category">cat</span>
        </div>
        <div class="now"><b>1,234人</b><span>同時視聴（Kick の値）</span></div>
      </div>
    </article>
  </div>
  <p class="platform__source">出典: Kick 公式 API（同時視聴数・サムネ・配信者名は Kick が返す値をそのまま表示）。各カードは Kick の配信ページへのリンクです。</p>
</section>
```

**`src/lib/livePlatformsHtml.js`**:
```js
export const SHOW_MATURE = false;   // ★1 か所
export function buildPlatformSectionHtml(section, o): string   // o = { nowMs, faces:{linkBlink,linkNormal,tanuHalf}, maxLives?, showMature? }。ok:false/disabled/no credentials/undefined は ''、lives 空は .empty
export function buildPlatformCardHtml(live, rankNo, capturedAt, nowMs): string
export function platformsErrorHtml(msg, face): string
```
import: `escapeHtml`/`safeHttpUrl`/`formatNumberJa`（`src/lib/htmlText.js`）、`jstClock`/`elapsedText`/`freshness`/`cacheBust`（`src/lib/liveRankingView.js`）。**`jstClock`/`elapsedText` は UNIX 秒を取るので `startedAt`(ms) は `/1000` して渡す。** 推定・増分・順位推移の関数（`estimateConcurrentForLive`・`createGiftPulseRegistry`・`createRowChangeTracker` 等）は **import しない**（配線テストで固定）。

**entry の追加**:
```js
import { buildPlatformSectionHtml, platformsErrorHtml } from '../lib/livePlatformsHtml.js';
const elPlatforms = /** @type {HTMLElement} */ (document.getElementById('platforms'));
let _platformsLoading = false;
function loadPlatforms() {
  if (!elPlatforms || _platformsLoading) return Promise.resolve();
  _platformsLoading = true;
  return fetch('/api/live-platforms', { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(`Kick の一覧を読み込めませんでした (${r.status})`); return r.json(); })
    .then((data) => {
      const p = data && data.platforms && typeof data.platforms === 'object' ? data.platforms : {};
      elPlatforms.innerHTML = ['kick', 'youtube'].map((k) => buildPlatformSectionHtml(p[k], { nowMs: Date.now(), faces: FACE })).join('');
      bindImgFallback(elPlatforms);
    })
    .catch((e) => { if (!elPlatforms.children.length) elPlatforms.innerHTML = platformsErrorHtml(String(e && e.message ? e.message : e), FACE.tanuHalf); })
    .finally(() => { _platformsLoading = false; });
}
```
配線: 初回ロード直後・自動更新（既存と同じ条件）・`visibilitychange` の 3 経路で呼ぶ。**`load()` の中には入れない**。`render()`・tracker 群・`sortByEstimatedConcurrent`・`pinLiveFirst` には一切渡さない。

### 4.7 GitHub Actions（`kick` ジョブ）

```yaml
  kick:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Kick の一覧を集める
        env: { INGEST_KEY: ${{ secrets.STATUS_INGEST_KEY }} }
        run: |
          if [ -z "$INGEST_KEY" ]; then echo "::error::secrets.STATUS_INGEST_KEY が未登録です"; exit 1; fi
          code=$(curl -sS -o /tmp/kick.json -w '%{http_code}' --max-time 60 -H "x-share-key: $INGEST_KEY" \
            "https://app.tsuioku-no-kirameki.com/api/live-platforms?refresh=1&platform=kick")
          echo "HTTP $code"; cat /tmp/kick.json || true; echo ""
          if [ "$code" != "200" ]; then echo "::error::Kick 収集に失敗 (HTTP $code)"; exit 1; fi
          if ! grep -Eq '"stored":true|"disabled":true' /tmp/kick.json; then echo "::error::保存されていません"; exit 1; fi
```
`concurrency.group` は既存のまま。

### 4.8 ドキュメント・索引の同期

- `scripts/repo-tree-map.mjs`: `ROLES['api']` の文言に live-platforms を追加、`FEATURES` に「ランキング(/live/)Kick セクション」1 行 → `npm run tree-map`（`git add` の後）。
- bump 3 点セット → `npm run verify:bump`。

---

## 5. Testing Decisions

既存流儀: `import { describe, it, expect } from 'vitest'`、対象の隣に `*.test.js`、it 名は日本語。

### `src/lib/kickLivestreams.test.js`
- `isLikelyKickLivestreamsShape: data が配列なら true、null/文字列/data が配列でない object は false`
- `normalizeKickLivestream: 実形に近い 1 件を PlatformLive に（platform:'kick'・viewers 整数・startedAt は epoch ms・url は https://kick.com/<slug>）`
- `normalizeKickLivestream: id が無い／slug が形外の 1 件は null`
- `normalizeKickLivestream: thumbnail/profile_picture に javascript: や相対 URL が来たら ''`
- `normalizeKickLivestream: thumbnail が { src } のオブジェクトでも読める`
- `normalizeKickLivestream: viewer_count が負・文字列・欠落なら 0、has_mature_content は === true だけ true`
- `normalizeKickLivestream: title は 120 字・username は 80 字で切る`
- `normalizeKickLivestreams: 形が違えば null。壊れた 1 件だけ落として残りを返す`
- `sortByViewers: 降順・同点は元順・元配列を壊さない`
- `kickChannelUrl: 許す文字だけ通し、スラッシュ・空・長すぎは ''`
- `decideKickStore: ok:false → false / lives:null → false / lives:[] → true / lives:[1件] → true`
- `isTruncated: cursor あり && 件数 >= limit のときだけ true`

### `src/lib/livePlatformsHtml.test.js`
- `buildPlatformSectionHtml: ok:false / disabled / no credentials / undefined は ''`
- `buildPlatformSectionHtml: lives 空は見出し＋「表示できる日本語配信がありません」`
- `buildPlatformSectionHtml: viewers 降順を変えず、maxLives(20) で切る`
- `buildPlatformSectionHtml: mature は既定で除外し「成人向け N 件は表示していません」。showMature:true なら描く`
- `buildPlatformSectionHtml: truncated:true で「上位のみ表示」`
- `buildPlatformSectionHtml: stale な capturedAt で .stale と ⚠ 文言`
- `buildPlatformCardHtml: title/name の <script> はエスケープされる`
- `buildPlatformCardHtml: url '' は <a> を作らない、thumbnail '' は .noimg`
- `buildPlatformCardHtml: 同時視聴は桁区切り＋「（Kick の値）」、「推定」の語を含まない`
- `buildPlatformCardHtml: referrerpolicy="no-referrer" と cacheBust の ?t= が付く`
- `★推定・増分・順位推移の関数を import していない（ソース文字列に estimateConcurrent / createGiftPulseRegistry / createRowChangeTracker が無い）`

### `src/server/kickApi.test.js`（`fetchImpl` 注入・実ネットワークへ出ない）
- `fetchKickAppToken: form-urlencoded で id.kick.com へ POST し、access_token と expires_in を返す`
- `fetchKickAppToken: access_token 無し/HTTP 4xx は ok:false（例外にしない）`
- `fetchKickLivestreams: Bearer と language_code=ja&limit=100 を付けて GET`
- `fetchKickLivestreams: 401/5xx/timeout は ok:false と status（throw しない）`
- `★token の値を console に出さない`（console.* をスパイ）

### `src/lib/livePlatforms.wiring.test.js`（entry のソース文字列を読む）
- `loadPlatforms は load とは別関数として 1 回だけ定義される`
- `loadPlatforms は /api/live-platforms を叩き、?refresh=1 を付けない`
- `elPlatforms に対して bindImgFallback を呼ぶ`
- `sortByEstimatedConcurrent / pinLiveFirst / tracker.begin に platforms 由来の配列を渡していない`
- `初回ロード・自動更新・visibilitychange の 3 経路で loadPlatforms が呼ばれる`

### api 層
`api/*.test.*` の前例は無い。handler 自体はテストせず、判定は純関数に寄せる。実機確認は reality-checker に委任。

---

## 6. Out of Scope

- YouTube の実装（`youtubeApi.js`・`youtubeLiveVideos.js`・Actions 2 ジョブ・privacy の YouTube 文言）。本仕様はスキーマ・キー名・応答と画面の枠だけ。
- Kick 行の X シェア・`?kick=<id>` ピン・OG カード。
- 閲覧者トリガーの Kick refresh（レート制限実測後の第 2 段）。
- cursor ページング（実数を測ってから）。
- Kick のギフト/チャット集計・脈拍レーン・4 段アイコン列・ホバーカード。
- カテゴリ絞り込み・`ja` 以外の言語。
- Twitch（書面許可待ち）。
- `api/live-ranking.js` のリファクタ。

---

## 7. Further Notes（地雷・注意点）

1. **鍵が来たら最初に実測して決める**: Vercel に鍵を入れた直後、`workflow_dispatch` で `kick` ジョブを 1 回だけ手動実行し、応答から (a) `count`（日本語配信の実数）(b) `truncated` (c) `headersSample`（レート制限ヘッダ）(d) token の `expiresIn` を読み、本書末尾に「実測」として追記してから定数を決める。**実測前に数字を増やさない。**
2. **サムネのホットリンク可否は未確認**。全カードがキャラの幕になるなら「サムネを出さない」判断が要る。
3. **`has_mature_content` の表示可否はユーザー判断待ち**（既定非表示）。
4. `live-ranking-entry.js` に max-lines ラチェットは無い（裏取り済み）。それでも追加は最小にし、HTML 組み立ては lib に置く。
5. **`npm run tree-map` は `git add` の後**。新規ファイル 4 本＋テスト 4 本は `git add` で明示列挙（`??` 取りこぼしで Vercel ビルド失敗の前例）。
6. **CRLF**: entry/index.html を触る前に改行コードを確認（Edit の空振り）。
7. index.html / privacy.html を触ったら **`npm run site-health`**。
8. **Actions の赤の意味を変えない**: ニコ生 `refresh` は「0 件＝赤」、Kick は「0 件＝緑・形不正/通信失敗＝赤・disabled＝緑」。workflow のコメントに明記。
9. **token を漏らさない**: `live:kick:token` の値はレスポンス・ログ・例外メッセージに乗せない。
10. Vercel Hobby の関数数上限（未確認）: デプロイ失敗時はまずここを疑う。
11. **実機検証は reality-checker に委任**: 「GET /api/live-platforms が 200 で `platforms.kick.lives` が配列」「`#platforms` にセクションが描かれる」「ニコ生側 `#list` の DOM が変更前後で同一」。
12. YouTube 実装時、`livePlatformsHtml.js` に増分・順位の矢印・前回比を**足さない**（YouTube 規約）。
13. **（司令塔追記）鍵登録前に `kick` ジョブを有効にしない**（5 分ごとに赤くなる）。順序は実装ハンドオフ参照。

---

## 未解決の質問

1. `has_mature_content=true` の配信を表示するか（既定: 非表示）。
2. Kick の日本語配信の実数と `language_code=ja` の精度。100 件超ならページングへ。
3. レート制限（ヘッダの有無・値）。閲覧者 refresh の解禁はこの実測次第。
4. YouTube の日本語判定の方法。
5. `expires_in` の実値。
6. Kick ブランド色（`#53fc18`）をバッジに使ってよいか（ロゴは使わない）。
7. キルスイッチを環境変数でも見るか（既定: Redis のみ）。

## 根拠のない断定の一覧（assumption list）

- **A1** v2 livestreams の応答は `{ data: [...] }`（包みの形は未確認）。
- **A2** チャンネル URL は `https://kick.com/<channel.slug>`、slug は `[a-z0-9_-]`。
- **A3** `thumbnail` は文字列 URL か `{ src }`。
- **A4** `started_at` は ISO 8601。
- **A5** Vercel の環境変数変更は再デプロイが要る。
- **A6** Vercel Hobby の関数数上限は 12。
- **A7** 閲覧者の GET（Redis 読みのみ）は軽い。
- **A8** `kickApi.test.js` は `fetchImpl` 注入で自己完結（`nicoliveGuest.test.js` の流儀は実装時に合わせる）。
- **A9** `api/live-ranking.js` からの import は Vercel のバンドルで動く（前例あり）。
