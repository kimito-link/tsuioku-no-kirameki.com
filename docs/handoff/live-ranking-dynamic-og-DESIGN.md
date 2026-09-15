# 設計書 — 配信ごとの動的 OGP(`/live/?lv=lvNNN` を X 等に貼るとその配信のカードが出る)・第2段

- 設計: Fable(claude-fable-5-1 サブエージェント) / 日付: 2026-09-15 / HEAD=b9fa6411(v0.1.1516)
- 上流: `docs/handoff/live-ranking-share-DESIGN.md`(第1段。§2 の非目的「配信ごとの動的 OG(第2段)」が本書)。第1段の決定 A〜M は蒸し返さない。
- 行番号は 2026-09-15 の実ファイルで確認済み。Vercel の仕様は `vercel.com/docs/project-configuration/vercel-json`(last_updated 2026-08-14)を取得して照合した。★未確認は §14 に隔離してある。

## 1. 目的
- シェア済み URL `https://tsuioku-no-kirameki.com/live/?lv=lvNNN` を X 等に貼ると、**その配信の配信サムネ・配信者名・番組名**がカードに出る。
- 人間のブラウザは**今までどおり静的 `/live/`** を受け取る(第1段の `?lv=` 先頭固定・`shareHref` は不変)。
- 動的画像生成はしない(og:image は保存済みの配信サムネ URL を指すだけ)。

## 2. 非目的
動的画像生成(Pillow/@vercel/og) / og に支援者名・コメント本文・数値(来場/pt)を出す / 終了配信の追跡(privacy §14-3 の「最新1件・1h」は不変) / クローラー要求を契機にニコ生を叩く(api/live-og はニコ生へ一切 fetch しない) / X 側キャッシュのパージ / `/live/` 自体(lv 無し)のカード変更 / シェア URL の形の変更 / npm 依存の追加 / `src/extension/live-ranking-entry.js` の変更。

## 3. ユーザー決定(継承・確定)
OGP は配信ごと(`?lv=` 付き URL 単位) / カードの中身は `/live/` の配信カードと同じ素材(サムネ・配信者名・番組名) / 第1段 D「支援者名は載せない」・H「数値なし」を og にも適用 / 第1段で配った `?lv=` URL を壊さない。

## 4. ルーティングの確定案(A/B/C 評価 → **C を採用**)
| 案 | 中身 | 判定 |
|---|---|---|
| A | `has:[{type:query,key:lv}]` だけで `/live/` を常に api へ。api は meta + `<script>location.replace(...)</script>` で人間を戻す | **却下**。①人間の `?lv=` 訪問が全部 Function 経由(コールドスタート・Redis GET が人間の待ちに乗る) ②ループ回避に `&r=1` 等の目印が要り URL が変わる ③JS を実行するクローラー(Googlebot)が同 URL を再取得して回る ④JS 無効の人間は白画面 |
| B | api が `tsuioku-no-kirameki/live/index.html` を fs で読み、og 部分だけ差し替えて**ページ全体**を返す | **却下**。Function バンドルに静的 HTML が同梱されるか(ファイルトレース)が未確認で、外れると本番で初めて 500 になる。人間の訪問が Function 経由になる点は A と同じ |
| **C** | **`has` で「`lv` クエリあり ∧ User-Agent がカード用クローラー」のときだけ `/api/live-og` へ rewrite**。人間は従来どおり静的 | **採用**。人間の経路に変更ゼロ(第1段の実機確認が生きる)。og HTML は**リダイレクトを一切含めない**のでループが構造的に起きない(§5.4)。Function を叩くのはクローラーだけ(シェア1件につき各 SNS 1〜数回) |

Vercel 仕様の裏取り(同ページ「Rewrite `has` or `missing` object definition」節):
- `type` は `header` / `cookie` / `host` / `query` の4種。**`query` と `header` の両方が使える**(user-agent は request header)。
- `value` 省略=「そのキーがあれば一致」。文字列は regex として扱われ、`first-(?<paramName>.*)` の名前付き捕捉を destination で `:paramName` として使える。
- `has` 配列は**全条件を満たしたとき**に一致(同節「it will match when all conditions are met」は value object の記述だが、配列も AND。★配列の AND は既存 rewrite(`vercel.json:18-20` の `missing` 1件)しか前例がないため §14-1)。
- 「`rewrites` では named parameters がクエリ文字列として通る(pass through in the query string)」(同ページ「Route parameters」節)。既存 catch-all(`vercel.json:22-26`)で `?lv=` が `location.search` に届いていることは第1段の実装で確認済み。
- 「`source` はファイルであってはならない(ファイルシステムが rewrite より優先)」。`/live/` はリポ直下に実体が無い(`tsuioku-no-kirameki/live/` は catch-all 経由)ので該当しない。
- 「`has` は `vercel dev` では動かない。デプロイでは動く」→ **ローカル検証不可。本番 curl で確認する**(§12)。
- 今日の本番実測: `curl -A 'Twitterbot/1.0' 'https://tsuioku-no-kirameki.com/live/?lv=lv999999999'` → `200 text/html`(静的 HTML=汎用カード)。`/live/og` `/api/live-og` はどちらも 404(未使用パス)。

### 4.1 `vercel.json` の差分(catch-all `22-26` の**前**・`/` の 2 ルール(7-21)の後に挿入)
```json
{
  "source": "/live/",
  "has": [
    { "type": "query", "key": "lv" },
    { "type": "header", "key": "user-agent",
      "value": ".*(Twitterbot|facebookexternalhit|Discordbot|Slackbot|LinkedInBot|TelegramBot|Mastodon|Bluesky|Misskey|SummalyBot).*" }
  ],
  "missing": [{ "type": "host", "value": "app.tsuioku-no-kirameki.com" }],
  "destination": "/api/live-og"
}
```
- `Twitterbot/1.0` は X のクローラー UA(第1段 §11 と同じく非公式資料由来。X 公式 docs は 402 で取得不可=§14)。他の UA 名は各社の一般に知られた形で**未確認**(§14-2)。**一致しなくても害は「汎用カードのまま」**(今日と同じ)で、fail-soft。
- regex が値全体に対する一致か部分一致かは明記が無いため `.*(...).*` で両方に耐える形にする(§14-1)。
- `/live`(末尾スラッシュ無し)が同じ source に一致するかは未確認(§14-1)。シェア URL(`SHARE_PAGE_URL`=`live-ranking-entry.js:45`)は必ず `/live/` なので主経路は覆う。
- `missing host` は既存 3 ルールと同じ流儀(app. サブドメインは対象外)。

## 5. `api/live-og.js`(新規・npm 依存ゼロ・薄い I/O 係)
前例: `api/live-recent-comments.js:22-28` が `upstash` を `./live-ranking.js` から、純関数を `../src/lib/*` から import している。同じ形。

### 5.1 入出力
- `GET /api/live-og?lv=lvNNN`(rewrite 経由でも直叩きでも同じ)。GET 以外は 405 JSON(`live-ranking.js:542-545` と同形)。
- 応答は**常に 200 `text/html; charset=utf-8`**。Redis 障害・不在 lv・不正 lv でも 200 で汎用カード(§8)。★5xx/404 を返すとクローラーはカードを出さない=「汎用」の方が「無い」より良い(AGENTS §3.6 fail-soft)。
- ヘッダ: `Cache-Control: no-store`(`live-ranking.js:472` と同じ・理由は §9)・`X-Robots-Tag: noindex`。
- 手順: ① `lv = String(req.query?.lv||'').trim().toLowerCase()`(`req.query` は `live-ranking.js:476` の前例) ② `LIVE_ID_RE`(`liveRankingView.js:33`)不合格なら `live=null` ③ 合格なら `upstash(['GET', STORE_KEY])` → `JSON.parse` → `lives.find(l => String(l.liveId).toLowerCase()===lv)`(`attachComments` は呼ばない=支援者を og に載せないので不要) ④ 例外は全部 `live=null` ⑤ `buildLiveOgHtml({ lv, live })` を `res.setHeader('Content-Type', …); res.status(200).end(html)` で返す(`end` は Node 標準)。
- `STORE_KEY` は `live-ranking.js:30` の const(未 export)。**`export const STORE_KEY` に 1 行変更**して import する(文字列を2箇所に書かない)。
- ニコ生への fetch は**しない**(クローラーの要求回数がそのままニコ生への負荷になる経路を作らない)。

### 5.2 純関数側(`src/lib/liveOgHtml.js` 新規 + `liveRankingView.js` に `liveOgTitle`)
- 前例 `src/lib/liveRecentHoverCard.js`(状態→HTML 文字列の純関数・DOM/fetch なし)。`check-layer`(`layer-config.mjs:50` の forbid: chrome/fetch/localStorage/sessionStorage/indexedDB/document/window)に触れない。
- ★**本体ファイルのコメントにも `capturedAt`/`persistedAt`/`measuredAt` を書かない**(`timeAuthorityRegistry.test.js:11` の `TIME_FIELD_RE` が `src/lib` を文字列走査・`:45`)。og にキャッシュバスターは付けないので時点フィールドを扱う必要がない。
- `liveOgTitle(live)`(`liveRankingView.js` の `liveShareText`(401-408)の直後に追加。`trimTo`(389-393・非 export)と `SHARE_NAME_MAX/SHARE_TITLE_MAX`(360-361)をそのまま使う)。
- `buildLiveOgHtml({ lv, live })` → 文字列。`escapeHtml`(`htmlText.js:23`)を**全 content に**、URL には `safeHttpUrl`(`:37`)を通す。定数 `LIVE_OG_ORIGIN='https://tsuioku-no-kirameki.com'`・`LIVE_OG_FALLBACK_IMAGE='https://tsuioku-no-kirameki.com/images/og-live-ranking.png'`(第1段の生成物・実在 197,139 bytes・寸法は第1段 §5.6/§8-1)。

### 5.3 og HTML の中身(全文がこの形。`<script>`・`http-equiv` は**存在しない**)
```html
<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>{title}</title><meta name="robots" content="noindex">
<meta property="og:type" content="website"><meta property="og:site_name" content="追憶のきらめき ランキング">
<meta property="og:url" content="https://tsuioku-no-kirameki.com/live/?lv=lvNNN">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:image" content="{image}"><meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="854"><meta property="og:image:height" content="480">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{image}">
<meta name="twitter:image:alt" content="{name}の配信「{番組名}」の配信画面">
</head><body><p>{title}</p><p><a href="/live/?lv=lvNNN">追憶のきらめき ランキングで、いま支えている人を見る</a></p></body></html>
```
- `og:image:width/height` は **URL パスの `thumbnail-(\d+)x(\d+)` から読めたときだけ**出す(実 URL 例 `…/screenshot/1/thumbnail-854x480/screenshot.jpg`・`live-ranking.js:102`)。読めなければ省く(数字を発明しない)。フォールバック PNG のときは `image/png`・幅高は省く。
- `og:url` は**取得された URL と同じ**にする(FB 系は og:url が違うとそちらを再取得する)。不在/不正 lv は `/live/`(静的ページと同じ汎用カードに収束)。

### 5.4 人間のリダイレクトとループ回避
C 案では人間は og HTML を**受け取らない**(UA 不一致→静的)。それでも og HTML に**リダイレクトを置かない**(`<script>` も `<meta http-equiv=refresh>` も無し)。理由: どちらもクローラー側で「同じ URL を同じ UA で再取得」に化けてループになりうる。誤って人間が受け取っても本文のリンク 1 本で `/live/?lv=` へ行ける。★ループ回避は「目印パラメータ」ではなく「リダイレクトが無いこと」で担保する=検証は `grep -c '<script\|http-equiv'` が 0(§12-3)。

## 6. og:title / og:description の確定文
`liveOgTitle(live)`(材料は `streamer.name` と `title` だけ・`liveShareText` と同じ正規化と上限):
| 分岐 | 文 | 最大長(`Array.from`) |
|---|---|---|
| name・title あり | `{name}の配信「{title}」 ― いま支えている人` | 18+4+24+12=**58** |
| title のみ | `「{title}」 ― いま支えている人` | 1+24+12=**37** |
| name のみ | `{name}の配信 ― いま支えている人` | 18+14=**32** |
| 両方空 / live 不在 | `いま配信を支えている人 ― ニコニコ生放送（追憶のきらめき ランキング）`(`live/index.html:20` と同文) | **36** |
- 第1段の投稿本文 `{name}の配信「{title}」を、いま支えている人` と**同じ素材で語尾だけ違う見出し体**にする。二重に見えるのは承知の上で採用: 投稿本文は投稿者が X の画面で自由に書き換え/削除できる(第1段 §1)ので、**カード側だけが不変の身元表示**になる。逐語一致は避けた(`を、`→` ― `)。
- 数値(来場/pt/経過)は入れない(第1段 H と同じ理由: X は初回取得を保持するので投稿後に必ず古くなる)。
- `og:description`(定数・配信で変えない): `いまこの瞬間、この配信をギフト・広告・コメントで支えている人を、配信サムネ・配信者つきでリアルタイムに。主役は配信者ではなく「応援した人」。`(支援者名・数値なし)。X の summary_large_image で description が表示されるかは未確認(§14-3)なので、身元は og:title に集約する。

## 7. og:image = 配信サムネ(生成不要の根拠)
- 保存形 `thumbnail.large`(`live-ranking.js:261`・`httpUrlOrEmpty` 済み・絶対 URL)。本番実測(2026-09-15・lv351378046 の large): `HTTP 200` / `Content-Type: image/jpeg` / `Content-Length: 39795` / `Cache-Control: max-age=7`。
- 854x480(16:9)は X の大画像カードに載る寸法(X は 2:1 に上下を切る見込み=§14-3)。生成しないので Python/フォント/PNG の追跡ファイルが増えない。
- 優先: `large` → 無ければ **フォールバック PNG**(middle 以下は使わない=サイズ表記の裏取りを 1 パターンに絞る)。`safeHttpUrl` を通らない値も PNG。
- ★サムネ URL のパス(`screenshot/1/`)は配信中に変わる(司令塔の観測)。X は初回取得時に画像を自社 CDN へ複製する(未確認・§14-3)ため、後で元 URL が 404 になってもカードは残る見込み。残らなくても害は「画像なしカード」=第1段以前と同じ。

## 8. 終了配信・不在 lv のフォールバック
| 状態 | 判定 | og:title / image / url |
|---|---|---|
| 放送中で一覧にある | `lives[]` に一致 | 配信ごと(§6/§7)・`/live/?lv=` |
| 終了・TTL 切れ・未収集 | 一致なし | 汎用(§6 最終行)・PNG・`/live/` |
| 形が不正(`lv1`・`abc`) | `LIVE_ID_RE` 不合格 | 同上(Redis を読まない) |
| Redis 障害・壊れた JSON | 例外 | 同上・**200 のまま**(5xx を出さない) |
- 判定材料は `live:ranking:latest`(放送中のみ・TTL 1h=`live-ranking.js:61`)だけ。終了を知るためにニコ生を叩かない(§2)。★シェアの**初回取得が終了後**だと、その URL は X 上で汎用カードのまま固定される(X 側キャッシュは当方から消せない・第1段 §7)。許容し、§10 の1文で開示する。

## 9. キャッシュ設計
- og HTML は `Cache-Control: no-store`。理由: Vercel CDN のキャッシュ鍵に UA が含まれるか未確認(§14-1)で、含まれないと**クローラー向け HTML が人間に配られる**事故になりうる。Function 1 回=Redis GET 1 回(今日の保存形は 75,413 bytes・19 配信)で、呼ぶのはクローラーだけなので `s-maxage` で節約する動機が無い。
- X 側: カードは URL 単位で初回取得を保持(期間は非公式・パージ不可=第1段 §7/§11)。**配信ごと URL なので初回取得=シェア時点のサムネが残る**。多少古くても許容(§7)。
- サムネ CDN 側 `max-age=7`(実測)は当方の設計に影響しない(X が取りに行くのは 1 回)。

## 10. privacy / 著作権
- og に出すのは**保存済みの公開情報 3 点**(番組名・配信者名・配信サムネ URL)。コメント本文(第3段のホバー)・支援者名(第1段 D)・数値は出さない=`buildLiveOgHtml` の入力に `gift/ad/comment` を渡さない(テストで固定・§13)。
- 新たな取得・保存は無い(§14-1 の取得元・§14-3 の保存期間は不変)。閲覧者情報も無い(クローラーの要求は他ページと同じ通常のアクセス)。
- `privacy.html` §14-3(729 行)の末尾に 1 文を足す(掲載停止 §14-4 の期待値を正直に): `SNS 等に貼られたリンクのカード（配信サムネ・配信者名・番組名）は、貼られた SNS 側が取得時点の内容を保持するもので、当サイトからは更新・削除できません。` 「最終更新」(403 行)は既に `2026年9月15日`。**同日コミットなら日付変更不要**、日をまたいだら更新(681 行の約束)。
- サムネは配信者の画面のスクショで、ニコ生が watch ページで公開している URL をそのまま指すだけ(自サイトに複製しない・改変しない)。表示主体は SNS 側。

## 11. シェア URL の互換
- `shareHref`(`live-ranking-entry.js:64-68`)・`SHARE_PAGE_URL`(45)・`liveIdFromQuery`(49-56)は**不変**。既に X に貼られた `?lv=` URL は、X が再取得しない限り汎用カードのまま(第1段の挙動)。新規に貼られた URL から配信ごとカードになる。
- 人間の経路(静的 `/live/`・先頭固定・不在文言)は byte 単位で不変。

## 12. 変更ファイルと差分
| # | ファイル | 差分 |
|---|---|---|
| 1 | `vercel.json` | §4.1 の 1 ルールを 21 行目の後(catch-all の前)に挿入 |
| 2 | `api/live-og.js`(新規) | §5.1。eslint は `api/**/*.js` を既に対象(`eslint.config.js:436`) |
| 3 | `api/live-ranking.js` | `:30` を `export const STORE_KEY = …` に(1 語) |
| 4 | `src/lib/liveRankingView.js` | `liveShareText`(408)の後に `liveOgTitle` |
| 5 | `src/lib/liveRankingView.test.js` | §13 の liveOgTitle ケース |
| 6 | `src/lib/liveOgHtml.js`(新規)+ `liveOgHtml.test.js`(新規) | §5.2-5.3・§13 |
| 7 | `tsuioku-no-kirameki/privacy.html` | 729 行末尾に §10 の 1 文 |
| 8 | `tsuioku-no-kirameki/live/index.html` | **据え置き**(17-26 の og:* は lv 無しの `/live/` 用としてそのまま正) |
| 9 | bump 3 点+LP 4 パターン | `extension/manifest.json`・`package.json` → `0.1.1517`。`src/lib/changelog.js` 先頭に §12.1(★CRLF・現在 20 版=`git ls-files --eol`/`grep -c` 実測)→ `node scripts/split-changelog.mjs` 1 回 → 検算: changelog 20 に戻る/`changelog-archive.js` の版数が **1376→1377**。LP は `verify-bump.mjs:211-221` の 4 正規表現(現在 `tsuioku-no-kirameki/index.html` の 14/28/45/10274 行が `0.1.1516`)を個別置換 |
| 10 | `scripts/repo-tree-map.mjs` | `FEATURES`(145 行の後)に 1 行: `{ feature: 'ランキング(/live/)の配信ごと OGP', desc: 'vercel.json が「?lv= あり∧カード用クローラー UA」だけ /api/live-og へ rewrite。api は live:ranking:latest から該当配信を引き、og:image=配信サムネ(thumbnail.large)・og:title=liveOgTitle の最小 HTML を返す(リダイレクト無し・no-store)。人間は従来どおり静的 /live/。不在 lv は汎用カード。支援者名・本文・数値は出さない(v0.1.1517)', paths: ['api/live-og.js', 'src/lib/liveOgHtml.js', 'src/lib/liveRankingView.js', 'vercel.json'], tags: ['LP', '公開', 'ランキング'] }`。ついでに `ROLES.api`(89 行「status エンドポイント」)は古いので `'サーバレス API(status / live-ranking / live-recent-comments / live-og)'` に |
| 11 | 生成物 | `docs/repo-tree-map.*`・`docs/feature-map/*`・`docs/site-health.md`・`changelog-archive.js`。`app/dist/*` は entry 不変なので差分なし(buildId ずれは追わない=MEMORY) |

### 12.1 changelog エントリ(`CHANGELOG_SUMMARY_MAX=35`)
```js
Object.freeze({
  version: '0.1.1517', date: '2026-09-15',
  summary: 'シェアしたリンクのカードが配信ごとに',   // 18 字(`Array.from` 実測)
  items: Object.freeze([
    '追憶のきらめき ランキング(/live/)の配信リンク(?lv=付き)を X などに貼ると、その配信の画面サムネ・配信者名・番組名がカードに出るようになりました。',
    'カードに出るのはニコ生が公開している番組名・配信者名・サムネだけです。応援した人の名前・コメント・数値は載せません。放送が終わった配信のリンクは、これまでどおりランキング共通のカードになります。'
  ])
}),
```

## 13. テスト一覧
`liveRankingView.test.js`(`describe('liveOgTitle')`): 4 分岐の文言 `toBe` / 最大長 4 本を `toBe(58/37/32/36)` / `Array.from` で絵文字が割れない / `watchCount`・`giftTotal`・`comment` を持つ live でも文が変わらない(ネガコン) / `null`・`{}` → 汎用文。
`liveOgHtml.test.js`(`describe('buildLiveOgHtml')`):
| ケース | 期待 |
|---|---|
| 放送中(large あり) | `og:image`=large URL・`og:url` に `?lv=lv1234567`・`og:image:width` 854/`height` 480(URL に `thumbnail-854x480`)・`twitter:card` summary_large_image |
| large 無し / `javascript:` | `og:image` がフォールバック PNG・width/height 無し・`javascript:` を含まない |
| live=null / lv 不正 | 汎用 title・PNG・`og:url` が `/live/`(クエリ無し) |
| 幅高が読めない URL | `og:image:width` を含まない |
| エスケープ | title に `"<&>'` → 属性内が `&quot;&lt;&amp;&gt;&#39;`・生の `<` が meta 内に出ない |
| ★リダイレクト不在 | 出力に `<script` も `http-equiv` も**含まない**(§5.4 の担保) |
| ★支援者・本文・数値不在 | `gift.rankers[0].name`・`comment.rankers[0].name`・`watchCount:12345` を持つ live でも出力にその文字列が**含まれない** |
| ネガコン | lv が違えば `og:url` が違う / title が違えば `og:title` が違う |
`api/live-og.js` 自体の単体テストは置かない(前例 `api/*` に test 無し・I/O 係)。本番 curl(§12-4)で検証する。

## 14. 未確認事項(断定しない・本番で確定させる)
1. **Vercel**: `has` 配列 2 件の AND / header regex の全体一致か部分一致か(`.*…*` で両対応にした) / 大文字小文字 / `/live`(スラッシュ無し)の一致 / rewrite の一致が配列順で先勝ちか(`routes` の文は明記・`rewrites` は同様と推定) / has 付き rewrite でクエリが `req.query` に届くか / CDN キャッシュ鍵に UA が入るか(→ `no-store` で回避)。**`vercel dev` では `has` が動かない**(公式)ので、確認は push 後の本番 curl のみ。
2. **クローラー UA**: `Twitterbot/1.0` 以外の名前は一般知識で未確認。外れても汎用カード(今日と同じ)。
3. **X 側**: summary_large_image で og:title/description のどちらが表示されるか / 16:9 画像の切り抜き / 画像の自社 CDN 複製 / カード保持期間 / 投稿画面のプレビューが Twitterbot で取得しに来るか。X 公式 docs は 402 で取得できず、第1段 §11 と同じ「実際に貼って目視」で確定する。
4. 終了後に初回取得された URL が汎用で固定される件の実頻度。

## 15. rollback
- 1 コミット。`git revert <sha>` で `vercel.json` の rule が消え、クローラーは静的 `/live/`(汎用カード)に戻る。人間の経路は元から不変なので影響ゼロ。生成物・changelog-archive も同コミット内。X に一度取り込まれた配信ごとカードは残る(消せない・第1段 §7)。
- 部分無効化(revert せず止めたいとき): `vercel.json` の該当 rule だけ削除して push。api ファイルが残っても直叩き以外で到達しない。

## 16. 検証手順(順序どおり)
1. `npm run test:cc`(§13 全部緑・既存 `liveRankingView.test.js` 不変)。
2. ゲート順(`run-verify-cc.mjs:61-86`: test→lint→typecheck→build→no-secrets→tracked-imports→…→tree-map→site-health→feature-map→layer→verify:bump): `git add api/live-og.js src/lib/liveOgHtml.js src/lib/liveOgHtml.test.js docs/handoff/live-ranking-dynamic-og-DESIGN.md`(新規は明示列挙・AGENTS §12.5)→ `npm run tree-map && npm run feature-map && npm run site-health` → bump 3 点+LP 4 パターン+split-changelog 検算(20 / 1376→1377)→ `npm run verify:cc`(赤なら `.artifacts/verify-cc.log`)→ `git add -A` → commit `feat(live): シェアされた配信リンクのカードを配信ごとに(動的 OGP)` → `.agent/coord.md` 確認(AGENTS §13)→ push。
3. 静的検査(push 前): `grep -c '<script\|http-equiv' src/lib/liveOgHtml.js` → **0**。
4. 本番(反映後・`LV`=`/api/live-ranking` の `lives[0].liveId`):
   - `curl -sS -A 'Twitterbot/1.0' "https://tsuioku-no-kirameki.com/live/?lv=$LV" | grep -o 'og:image" content="[^"]*"'` → `asset2.dlive.nicovideo.jp` の URL。同コマンドで `og:url` に `?lv=$LV`。
   - `curl -sS -A 'Mozilla/5.0 (Windows NT 10.0) Chrome/128' "https://tsuioku-no-kirameki.com/live/?lv=$LV"` と `curl -sS https://tsuioku-no-kirameki.com/live/` の `diff` が**空**(人間は静的・第1段 §8-5 と同じ)。
   - `-A Twitterbot` で `/live/`(lv 無し)→ `og-live-ranking.png`(据え置き確認)。`?lv=lv999999999` → 汎用 title・PNG・`200`。`?lv=abc` → 同じ・`200`。
   - `curl -sS -A Twitterbot -o /dev/null -w '%{http_code}\n' "https://tsuioku-no-kirameki.com/live?lv=$LV"`(スラッシュ無し)→ §14-1 の確定(200 かつ og:image が asset2 なら一致。静的なら twin rule を足す)。
   - `curl -sS -X POST https://tsuioku-no-kirameki.com/api/live-og` → `405`。`curl -sSI -A Twitterbot "…/live/?lv=$LV" | grep -i 'cache-control\|x-robots'` → `no-store` / `noindex`。
   - Claude-in-Chrome で `https://tsuioku-no-kirameki.com/live/?lv=$LV` → 先頭固定(第1段の実機確認が壊れていない)。
   - **X 手動**(validator 廃止): 投稿画面に `https://tsuioku-no-kirameki.com/live/?lv=$LV` を貼り、プレビューに配信サムネ・見出しが出るのを目視。**投稿はしない**。プレビューが出なければ Vercel の Function ログで Twitterbot の到達有無を見る(到達なし=rewrite 不一致・到達あり=meta 側)。
   - `curl -sS https://tsuioku-no-kirameki.com/privacy.html | grep -c 'SNS 等に貼られた'` → 1 以上。

## 17. 3視点
- **実装者**: 触るのは vercel.json 1 ルール・api 1 新規・lib 1 新規+1 関数・privacy 1 文。人間経路ゼロ変更。地雷は `TIME_FIELD_RE`(§5.2)・changelog CRLF・`STORE_KEY` の export 忘れ(`live-og.js` が独自文字列を持つと 2 箇所目になる)。
- **テスター**: `has` はローカルで動かないので「テストが緑=動く」ではない。本番 curl の 4 系統(クローラー/人間/lv 無し/不在)を全部通すまで完了と言わない。og HTML の「無いこと」(script/名前/数値)はテストで固定。
- **利用者**(シェアする人・される配信者): 貼った瞬間に配信の顔が出る。配信者は自分の番組名と画面が X に出る=ニコ生 watch ページを貼ったときと同じ露出(新しい情報は無い)。停止希望は §14-4 のままだが、X 側のカードは消せないことを §10 の 1 文で正直に書く。
