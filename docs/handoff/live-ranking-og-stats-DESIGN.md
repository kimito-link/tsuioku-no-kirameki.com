# 設計書 — 配信ごとの OGP カードに「来場・コメント・ギフト・広告」の数字を入れる(画像合成＋og:description)・第3段

- 設計: Fable(claude-fable-5-1 サブエージェント) / 日付: 2026-09-15 / HEAD=4f9b9c58(v0.1.1517)
- 上流: `docs/handoff/live-ranking-dynamic-og-DESIGN.md`(第2段)。同書 §2 の非目的「数値を出す」と §3「H 数値なし」を**本書で覆す**(ユーザー決定)。それ以外の第1・2段の決定(D 支援者名なし・C 案 UA ゲート rewrite・no-store・リダイレクト不在・api はニコ生へ fetch しない)は不変。
- 行番号は 2026-09-15 の実ファイルで確認済み。外部仕様は Vercel `docs/limits`(last_updated 2026-09-03)・`docs/functions/limitations`(2026-08-24)・Upstash `redis/overall/pricing` を当日取得。X 公式 docs は 402 で取得不可(第1・2段と同じ)。未確認は §16 に隔離。

## 1. 目的
- `https://tsuioku-no-kirameki.com/live/?lv=lvNNN` のカードに、その配信の **来場・コメント・ギフト・広告** の数字を出す。
- 出し方は **画像に合成**(og:image を「サムネ＋数字帯」の JPEG に差し替え)**と og:description の両方**(ユーザー決定)。
- 数字は「貼った時点の目安」(§9)。人間の経路(静的 `/live/`)は byte 単位で不変。

## 2. 非目的
支援者名・コメント本文を og/画像に出す / 数字のリアルタイム更新(X はカードを初回取得で固定・パージ不可=第1段 §7) / 終了配信の追跡 / `api/` への npm 依存追加(画像合成は GitHub Actions 側) / SVG の og:image(X は png/jpeg のみ) / ロゴ画像の合成(LOGO-RULES の「明るい地」制約を 1200x630 の写真の上で満たす設計は別件) / 肖像権の扱い(次の別要望) / `vercel.json` の変更(§6) / `src/extension/live-ranking-entry.js` の変更 / tally ジョブ(`scripts/live-comment-tally.mjs`)の変更。

## 3. ユーザー決定(継承・確定)
画像合成＋description の両方 / 数字は 4 つ(来場・コメント・ギフト pt・広告 pt) / 第1段 D「支援者名なし」は継続 / 第1段 H「数値なし」は**撤回** / `?lv=` URL と v0.1.1517 の動的 OG を壊さない / `api/` は npm 依存ゼロのまま。

## 4. 数字の出典(実コード・実測)
| 数字 | 保存形のキー | 出典(`api/live-ranking.js`) | 性質 |
|---|---|---|---|
| 来場 | `watchCount` | watch ページ埋め込み JSON(`:93` `WATCH_COUNT_RE`・`:282`) | ニコ生公式の累計来場者数 |
| コメント | `commentCount` | 同 `:94`・`:283` | ニコ生公式の累計コメント数(★当サイト集計 `comment.comments` ではない。公式値・欠落しない・`attachComments` 不要) |
| ギフト | `giftTotal` | `:277` = koken ranking `rank=10`(`:268`)の `contribution` 合計 | ★**上位 10 名の合計**(総額ではない)。`/live/` の表示(`live-ranking-entry.js:258` 「🎁 ギフト Npt」)と同じ値・同じ語 |
| 広告 | `adTotal` | `:291` = nicoad `contentTotalContribution` | ニコ生公式の広告合計 |
- 本番実測(2026-09-15 09:44Z・17 配信): 来場 74〜8,368 / コメント 1〜12,324 / ギフト 0〜117,280(**8/17 が 0**) / 広告 10,867〜1,275,956(0 件なし)。`comment` が null の配信 5/17 → コメントは `commentCount` を使う根拠。
- 表示は `formatNumberJa`(`src/lib/htmlText.js:47`・`12,324`)。`/live/` の 4 項目(`live-ranking-entry.js:256-259`)と**同じ語・同じ整形**にする(画面とカードで数字の意味がズレない)。

## 5. 画像合成の場所(A/B/C/D 評価 → **D を採用**)
| 案 | 中身 | 判定 |
|---|---|---|
| A | Actions が Pillow で焼き**リポにコミット**(`tsuioku-no-kirameki/images/og-live/<lv>.jpg`) | **却下(構造的に不可)**。①push ごとに Vercel が本番デプロイ → 5 分ごと=288 回/日 > **Hobby「Deployments Created per Day: 100」**(Vercel docs/limits)。②リポ肥大: 1 枚 79KB(§7 実測)×20×288/日 ≈ 455MB/日が git 履歴に積む(AGENTS §13 の警戒対象そのもの)。③`permissions: contents: read`(`live-ranking.yml:29-30`)を write に上げる必要。頻度を 1 時間に落としても ②は 38MB/日で不可 |
| B | Vercel Blob に置く(REST API・curl) | **保留**。新しい秘密(`BLOB_READ_WRITE_TOKEN`)を GitHub と Vercel に追加・TTL が無いので削除ジョブが要る・「焼けたか」のフラグは結局 Redis に要る。D で足りるなら増やさない |
| C | `@vercel/og`(Satori)で api が生成 | **却下**。npm 依存ゼロ方針(第2段 §2)を破る・日本語フォントの同梱・クローラー要求のたびに生成 |
| **D** | **Actions(Pillow)で焼き、JPEG バイトを既存の Upstash Redis に置く。新 Function `api/live-og-image` が Redis から読んで image/jpeg を返す** | **採用**。新しい外部サービス・秘密・コミットが**ゼロ**。既存の `x-share-key` 投入経路(`live-ranking.js:476-540` と同形)・既存 `upstash()`(`:128`)・既存 TTL の掟をそのまま使う。掃除は TTL で自動(§6) |

D の容量裏取り: 1 run の投入 = 1 POST(20 枚×約 106KB(79KB の base64)= 約 2.1MB)< Vercel Function 本文上限 **4.5MB**(docs/functions/limitations)。Redis 1 リクエスト上限 **10MB**(Upstash pricing・Free でも同値)。データ量 2.1MB < Free の 256MB。コマンド数は §6 の設計で **1 run = 3 コマンド**(864/日・約 26K/月)。Free 上限は「500K commands/月」。★当リポの Upstash プランと現在の月間消費は未確認(§16-1)。

## 6. 焼く運用(どのジョブ・頻度・置き場・掃除)
- **新ジョブ `og`** を `.github/workflows/live-ranking.yml` に足す。`needs: refresh`(`tally` と並列・`:73-99` の tally は触らない)。`timeout-minutes: 4`。workflow 全体の `concurrency`(`:32-35`)がそのまま効く。`permissions` は `contents: read` のまま(コミットしない)。
  - steps: `actions/checkout@v4`(persist-credentials: false)→ `actions/setup-node@v4`(22)→ `actions/setup-python@v5`(3.12・`cache: pip`)→ `pip install pillow` → **フォント取得**(§8)→ `node scripts/live-og-bake.mjs`(env `STATUS_INGEST_KEY`)。鍵未登録なら `::error::` で exit 1(`:47-50` と同じ掟)。
- **頻度**: refresh と同じ 5 分(cron の遅延は GitHub 仕様)。画像の数字は refresh 直後の `live:ranking:latest` の値(投入から焼き上がりまで 1 分未満の見込み・§16-3)。
- **置き場(Redis)**: ハッシュ **`live:og:img`**(field=`lvNNN`・value=JSON 文字列 `{"type":"image/jpeg","w":1200,"h":630,"b64":"…"}`)。投入は **`HSET live:og:img:tmp …`(全 field 1 コマンド)→ `EXPIRE live:og:img:tmp 3600` → `RENAME live:og:img:tmp live:og:img`** の 3 コマンド=**原子的に丸ごと差し替え**(前回の配信が残らない・読み手が半端な状態を見ない・RENAME は TTL を引き継ぐ)。
- **掃除**: TTL 3600 秒(`TTL_SECONDS`=`live-ranking.js:61` と同値・`export` する)。焼きが止まれば 1 時間で消え、`api/live-og` は自動でサムネ直(§7)に戻る。終了配信は次 run の一覧に無い → 次の RENAME で消える。**リポにも Blob にも何も残らない**。
- **サムネ URL が配信中に変わる件**(`screenshot/1`→`/12`): bake は毎 run 現在の `thumbnail.large`(`:289`)を取りに行くので常に現在の URL。取れなかった配信は**その run では焼かない**(hash に入らない → サムネ直へ fail-soft)。
- **空で上書きしない**(`:497-503` の掟): 焼けた枚数 0 なら POST しない(exit 1・`::error::`)。api 側も `images` が 0 件なら 502 で保存しない。
- **焼かない配信**: 4 つの数字が全部 0(数字帯に出すものが無い)。サムネ直のまま。
- **上限**: `MAX_LIVES`(`:67`=20)と同じ 20 枚まで(一覧がそれ以上になることは無い)。JPEG は quality 80 で焼き、1 枚が 300KB を超えたら quality 70 で焼き直し、それでも超えたら捨てる(api も base64 400,000 字超を 400 で拒否)。

## 7. `api/live-og` が焼いた画像に切り替える条件分岐
- `api/live-og.js` `handler`(`:47-76`)の `findLive` の後に **`HEXISTS live:og:img <lv>`** を 1 回(例外は false)。`buildLiveOgHtml({ lv, live: found, bakedImage })` の第 3 引数に渡す(`:62` の 1 行変更)。ニコ生へは引き続き fetch しない。
- `src/lib/liveOgHtml.js` の画像優先順位(`:77-83`)を 3 段に: **焼いた JPEG**(`bakedImage===true` かつ live あり)→ `thumbnail.large` → フォールバック PNG。
  - 焼いた JPEG の URL = `${LIVE_OG_ORIGIN}/api/live-og-image?lv=${lv}`(`vercel.json:33` の catch-all は `api/` を除外しているので rewrite 追加なし=**vercel.json 据え置き**)。`og:image:type=image/jpeg`・`og:image:width=1200`・`height=630`(定数。api の投入検証が 1200x630 以外を拒否するので不変式として成立)。
- **新 Function `api/live-og-image.js`**(npm 依存ゼロ・`upstash`/`TTL_SECONDS`/`readBody` を `./live-ranking.js` から import。`readBody`(`:329`)と `TTL_SECONDS`(`:61`)は `export` を付ける 2 語変更):
  - `GET ?lv=`: `LIVE_ID_RE` 不合格 → 302 `/images/og-live-ranking.png`。`HGET live:og:img <lv>` → JSON parse → `type` が `image/jpeg` → `res.setHeader('Content-Type','image/jpeg')`・`Cache-Control: public, max-age=300`(焼く周期と同じ)・`res.status(200).end(Buffer.from(b64,'base64'))`。不在/壊れ/Redis 障害 → **302 フォールバック PNG**(画像への 302 はループしない=第2段 §5.4 の禁止は HTML の話)。
  - `POST`(`x-share-key`・`live-ranking.js:477-482` と同形): body `{ v:1, images:{ lvNNN:{type,w,h,b64} } }`。検証: lv 正規表現(`:493` と同じ)・`type` は `image/jpeg` のみ・`w=1200,h=630` 固定・`b64` は `/^[A-Za-z0-9+/=]+$/` かつ ≤400,000 字・デコード先頭 3 バイトが `FF D8 FF`。通った field が 0 なら 502 `zero images — not stored`。通ったら §6 の HSET/EXPIRE/RENAME。応答 `{ ok:true, stored:true, images:N }`(bake は `"stored":true` を grep して緑・`:68` と同じ)。
  - GET 以外・POST 以外は 405。`X-Robots-Tag: noindex`。

## 8. 画像デザイン(要素・配色・サイズ・数字整形)
- **キャンバス 1200x630**(第1段 PNG と同寸・X の大画像は 2:1 前後)。配信サムネ(854x480)を cover で拡大しセンタークロップ(上下 22px ずつ落ちる)。
- **下部の帯** y=440..630(190px)・`NAVY_TOP (8,15,34)` α215(`gen-og-live-ranking.py:39` の配色)。
  - 行1 y=454・32px・`CREAM (255,250,244)`: `{配信者名} の配信`(名前は `trimTo(…, SHARE_NAME_MAX=18)`・`liveRankingView.js:360,389` と同じ切り方)。右端に `HH:MM 時点`(JST・22px・(190,205,235))。番組名は載せない(32px で 18+24 字=約 1,470px と横幅を超える。番組名は og:title が担う)。
  - 行2 y=496・行3 y=550・44px・`GOLD (246,196,83)`: `来場 8,368   コメント 12,324` / `ギフト 117,280pt   広告 1,275,956pt`。**0 の項目は省く**(左詰め・行が空けば行2 だけ)。最悪幅(来場 8,368,000＋コメント 12,324,000)は 44px で **792px**(Pillow 実測)< セーフ幅 1,080。
  - 左上 (40,32) にピル `追憶のきらめき ランキング`(CREAM 地・INK 文字・24px・`pill()` 流用)。**絵文字は描かない**(BIZ UD に無く豆腐になる=同 py `:134` の実測)。
- **フォント**: BIZ UDGothic Bold(第1段と同じ書体)。Actions には無いので `https://raw.githubusercontent.com/googlefonts/morisawa-biz-ud-gothic/main/fonts/ttf/BIZUDGothic-Bold.ttf`(OFL 1.1・`gh api` で実在確認・**4,638,128 B**)を `actions/cache`(key=URL)で取り、`OG_FONT_PATH` 環境変数で Python に渡す。**リポにコミットしない**(5MB 門に対し 4.6MB=AGENTS §13 の既知の赤を増やさない)。ローカルは `C:\Windows\Fonts\BIZ-UDGothicB.ttc`。取れなければその run は焼かない(exit 1)。
- **実測(本番サムネ 36,972B → 1200x630)**: JPEG q80 **79,208B** / q85 91,539B / PNG 482,863B → **JPEG q80**。合成 355ms(フォント読込込み・Windows)。
- **役割分担**(正本 1 つ): 数字の整形・0 省略・名前の切り詰め・時刻ラベルは **Node(`scripts/live-og-bake.mjs`)が `src/lib/liveOgStats.js`(§10 の description と同じ純関数)で決めて `plan.json` に書く**。Python(`tools/og-live-compose.py`)は plan の文字列を**描くだけ**(数字を計算しない・ネットに出ない)。サムネ取得も Node(UA は tally と同じ連絡先付き `live-comment-tally.mjs:54` の形・timeout 8s)。

## 9. 数字の鮮度の割り切り
- X はカードを**初回取得時点で固定**(第1段 §7・パージ不可)。→ どう設計しても「貼った瞬間の数字」。本書は**それを目安として明示する**設計: 画像に `HH:MM 時点` を焼く(§8)。
- 画像の数字 = 直近 refresh の値(≤ 5 分＋cron 遅延)。description の数字 = クローラー取得時点の Redis(≤ 5 分・閲覧者 refresh で ≤ 1 分)。**両者が数分ズレうる**が、どちらも「時点の目安」であり、画像側に時刻がある。description には時刻を入れない(`capturedAt` を `src/lib` で扱うと `timeAuthorityRegistry.test.js:11` の `TIME_FIELD_RE` に当たる。時刻ラベルは `scripts/` 側で作る)。
- ★X の大画像カードでは description が表示されない見込み(第2段 §14-3・未確認)。**X で数字を届ける手段は画像だけ**=画像合成の価値はここ。description は Discord/Slack/Bluesky/Mastodon/LINE 向け。

## 10. og:description の確定文(数字入り)
新純関数 `src/lib/liveOgStats.js`:
- `liveOgStatItems(live)` → `[{ key:'watch', label:'来場', text:'8,368', unit:'' }, { key:'comment', label:'コメント', … }, { key:'gift', label:'ギフト', text:'117,280', unit:'pt' }, { key:'ad', label:'広告', …, unit:'pt' }]`。値は `Number()`→有限かつ >0 のものだけ(**0・NaN・欠落は省く**)。整形は `formatNumberJa`。
- `liveOgStatsSentence(items)` → `来場8,368・コメント12,324・ギフト117,280pt・広告1,275,956pt`(空配列 → `''`)。
- `liveOgDescription(live)` → live あり: **`${liveShareText(live)}。${sentence}。`**(`liveShareText`=`liveRankingView.js:401-408` がユーザー指定の前半「〈配信者〉の配信「〈番組名〉」を、いま支えている人」そのもの)。sentence が空なら `${liveShareText(live)}。追憶のきらめき ランキングで、支えている人を配信ごとに。`。live なし → 現行定数 `LIVE_OG_DESCRIPTION`(`liveOgHtml.js:30-31`)のまま。
- 最大長(コードポイント): 前半 57(第1段の実測上限)+1+ 数字部 最悪 56(各 7 桁)+1 = **115**。
- `buildLiveOgHtml` の `desc`(`:94`)を `liveOgDescription(live)` に差し替え。`twitter:image:alt` は不変。

## 11. privacy / 著作権
- 出すのは**公開情報の集計値 4 つ**(いずれもニコ生が番組ページで公開する数、ギフトは公開ランキング上位 10 名の合計=`/live/` が既に同じ語で表示)。本文・支援者名は引き続き出さない(§13 のテストで固定)。
- **新しい点**: 配信サムネを**当方が加工(数字帯を重ねる)して当サイトから配布**する。第2段 §10「自サイトに複製しない・改変しない」から変わる。緩和: 放送中のみ・TTL 1 時間で消える・元画像はニコ生が watch ページで公開している同じスクショ・加工は帯の重ね描きのみ(切り抜き・色変更なし)。肖像権は別要望で扱う(§2)。
- `privacy.html:730` の 1 文を差し替え: `SNS 等に貼られたリンクのカード（配信サムネに来場者数・コメント数・ギフト/広告のポイントを重ねた画像、配信者名、番組名）は、貼られた SNS 側が取得時点の内容を保持するもので、当サイトからは更新・削除できません。数字は取得時点の目安で、リアルタイムには更新されません。`。「最終更新」(`:403`)は `2026年9月15日` のまま(同日なら不変・日をまたげば更新=`:681` の約束)。

## 12. 段階案(description 先行・画像は後)
| 段 | 中身 | 版 | 効く SNS |
|---|---|---|---|
| **1** | `liveOgStats.js`＋`liveOgHtml.js` の description＋privacy 1 文 | **0.1.1518** | Discord/Slack/Bluesky/Mastodon/LINE(X は見込み不可) |
| **2** | `api/live-og-image.js`＋`live-og.js` の HEXISTS＋workflow `og` ジョブ＋`live-og-bake.mjs`＋`og-live-compose.py` | **0.1.1519** | X を含む全部 |
- 第 2 段は Upstash 消費(§16-1)と Actions の所要(§16-3)を初回 run で実測してから常用にする。第 1 段だけでも「数字を載せる」決定は満たす(X 以外)。ユーザーが「同時に出す」なら 1518 一本にまとめてよいが、**revert を独立させるため 2 コミット推奨**。

## 13. 変更ファイルと差分
| # | ファイル | 差分 |
|---|---|---|
| 1 | `src/lib/liveOgStats.js`(新規)+ `liveOgStats.test.js` | §10 の 3 関数。`fetch/document/window` を持たない(`layer-config` の forbid) |
| 2 | `src/lib/liveOgHtml.js` | `:30-31` の定数は残す(live なし用)。`:77-83` に焼き画像の段を足す(`bakedImage`)。`:94` を `liveOgDescription(live)` に |
| 3 | `src/lib/liveOgHtml.test.js` | `:80-98` の「数値不在」を分割: 名前・本文・**個別 contribution(90003)・uid(60004)・count(60005)は不在のまま**、`70001`(watchCount)・`80002`(giftTotal)は **description に出る**(反転)。追加: 0 省略 / 全 0 で数字文なし / `bakedImage:true` → `og:image` が `/api/live-og-image?lv=` ・1200x630・jpeg / `bakedImage:false` → 従来どおり large / live なしで `bakedImage:true` でも PNG |
| 4 | `api/live-og.js` | `:61` の後に HEXISTS(try/catch→false)・`:62` に第 3 引数。import に `OG_IMAGE_KEY` |
| 5 | `api/live-og-image.js`(新規) | §7。eslint は `api/**/*.js` 対象(`eslint.config.js:436`) |
| 6 | `api/live-ranking.js` | `:61` `export const TTL_SECONDS`・`:329` `export function readBody`・`OG_IMAGE_KEY='live:og:img'` を定数として export(文字列を 2 箇所に書かない) |
| 7 | `scripts/live-og-bake.mjs`(新規・npm 依存ゼロ) | GET `/api/live-ranking` → 各配信の large を fetch → `plan.json`(§8)→ `python3 tools/og-live-compose.py plan.json outdir` を `child_process.spawnSync` → 出来た JPEG を base64 → 1 POST。`--dry-run`(POST せず outdir に残す)・`--lv`・`--limit`(tally と同じ流儀) |
| 8 | `tools/og-live-compose.py`(新規・Pillow) | plan を描くだけ。`gen-og-live-ranking.py` の `pill()`・配色定数を写す(build/ ではなく tools/ 同士なので import 可=`from gen_og_live_ranking import …` は BIZ フォントパスが Windows 固定のため**しない**。定数だけ複製し理由をコメント) |
| 9 | `.github/workflows/live-ranking.yml` | `og` ジョブ追加(§6)。refresh/tally 不変 |
| 10 | `tsuioku-no-kirameki/privacy.html` | `:730` 差し替え(§11) |
| 11 | `scripts/repo-tree-map.mjs` | `FEATURES` `:146` の desc を「数字を description と焼いた JPEG に出す(v0.1.1519)」に更新し paths に `api/live-og-image.js`・`src/lib/liveOgStats.js`・`scripts/live-og-bake.mjs`・`tools/og-live-compose.py` を追加。`ROLES['tools']`(`:84`)に「OG 合成」を一言 |
| 12 | bump | `extension/manifest.json`・`package.json`・`src/lib/changelog.js` 先頭(★CRLF・現在 20 版=`git ls-files --eol` 実測)→ `node scripts/split-changelog.mjs` → 検算: 20 に戻る・`changelog-archive.js` **1377→1378**(2 段なら 1379)。LP 4 パターン(`verify-bump.mjs:211-221`・`index.html` の 14/28/45/10274 行が `0.1.1517`) |
| — | `vercel.json` / `live/index.html` / `live-ranking-entry.js` / tally | **据え置き** |

### 13.1 changelog(summary ≤35 字・`Array.from`)
- 0.1.1518 `summary: 'シェアカードの説明文に応援の数字'`(16 字)。items: 「配信リンクのカード説明文に、来場・コメント・ギフト・広告の数字(取得時点)が入るようになりました。応援した人の名前・コメント本文は引き続き載せません。」
- 0.1.1519 `summary: 'シェアカードの画像に応援の数字を合成'`(18 字)。items: 「カード画像が、配信サムネに来場・コメント・ギフト・広告の数字と時刻を重ねたものになりました(放送中の配信のみ・数字は貼った時点の目安)。」

## 14. rollback
- 段 1: `git revert` 1 コミット → description が定数に戻る。X 等に取り込まれたカードは残る(消せない・第1段 §7)。
- 段 2: `git revert` 1 コミット → Function と `og` ジョブが消える。Redis の `live:og:img` は **TTL 1 時間で自然消滅**。revert 前に貼られた URL の `og:image`(`/api/live-og-image?lv=`)は X 側に複製済みなら残り、再取得されれば 404(Function 不在)→ 画像なしカード。
- 部分停止(revert せず): workflow の `og` ジョブを削除して push → 1 時間後に全カードがサムネ直へ自動で戻る(`HEXISTS` が 0)。

## 15. 検証手順(順序どおり)
1. `npm run test:cc`(§13-1/3 緑・`liveRankingView.test.js` 不変)。`python tools/og-live-compose.py`(ローカルで `--dry-run` の plan から 1 枚)→ 寸法 1200x630・`FF D8 FF`・<300KB。
2. ゲート: `git add`(新規 5 ファイルを**明示列挙**・AGENTS §12.5)→ `npm run tree-map && npm run feature-map && npm run site-health` → bump → `npm run verify:cc` → `.agent/coord.md` 確認 → push。
3. 段 2 の初回: Actions で `og` ジョブを `workflow_dispatch`。ログの 1 行 JSON(`{kind:'og-bake', lives, baked, skipped, ms, bytes}`)で **所要 ms・枚数・総バイト**を記録(§16-3 の確定)。
4. 本番(`LV`=`/api/live-ranking` の `lives[0].liveId`):
   - `curl -sS -A 'Twitterbot/1.0' "https://tsuioku-no-kirameki.com/live/?lv=$LV" | grep -o 'og:image" content="[^"]*"\|og:description" content="[^"]*"'` → image が `/api/live-og-image?lv=$LV`(段 1 のみなら asset2 のまま)・description に `来場`・`pt`。
   - `curl -sS -o og.jpg -w '%{http_code} %{content_type} %{size_download}\n' "https://tsuioku-no-kirameki.com/api/live-og-image?lv=$LV"` → `200 image/jpeg` ・`xxd -l 3 og.jpg` が `ffd8ff`。`?lv=lv999999999` → `302` → `/images/og-live-ranking.png`。`-X PUT` → 405。POST 鍵なし → 401。
   - 人間: `curl -sS -A 'Mozilla/5.0 … Chrome/128' "…/live/?lv=$LV"` と `curl -sS …/live/` の diff が空(第2段 §16-4 と同じ)。
   - `curl -sS https://tsuioku-no-kirameki.com/privacy.html | grep -c 'ポイントを重ねた画像'` → 1。
   - **X 手動**: 投稿画面に貼りプレビューで数字帯が読めるか目視(投稿しない)。読めなければ §8 の 44px を 52px に上げる(行 3 本→2 本に組み替え)。

## 16. 未確認事項(断定しない・初回 run と本番で確定)
1. **Upstash のプラン・現在の月間コマンド消費**。本設計の追加は 3 コマンド/run(約 26K/月)+クローラーごとの HEXISTS/HGET。Free の 500K/月を既存消費と合わせて超えないかを **Upstash コンソールで確認してから段 2 を有効化**。超えそうなら `og` を `*/10`(別 cron に分ける)へ。
2. **Vercel**: `res.redirect(302, …)`(Node helper・docs 確認済み)が Function から静的 PNG へ効くこと / `request.body` が 2MB の JSON を自動 parse すること(4.5MB 未満・仕様上は可) / Function 応答の `Cache-Control: public, max-age=300` が CDN に乗るか(乗らなくても害なし)。
3. **Actions の所要**: setup-python＋pip pillow＋フォント cache＋20 枚(ローカル 355ms/枚・ネット込みで 1 枚 <1s 見込み)。**未計測**。timeout 4 分で初回に測る。GitHub の raw URL のブランチ名(`main`)は未確認(gh api はパスの実在のみ確認)。
4. **X**: 大画像カードで description が出ないこと / 画像内 44px(タイムライン幅換算でスマホ約 13px)の可読性 / 1200x630 の切り抜き。X 公式 docs は 402。「実際に貼って目視」で確定(第1・2段と同じ)。
5. ギフトが「上位 10 名の合計」である点を privacy に明記すべきかは `/live/` 側の表示(既に同じ語)と合わせて別途判断(本書は現状の語を踏襲)。

## 17. 3視点
- **実装者**: 純関数 1 新規・Function 1 新規・スクリプト 2 新規・既存は 1 行〜数語の変更。地雷: `TIME_FIELD_RE`(時刻ラベルは `scripts/` で作る)/ changelog CRLF / `readBody`・`TTL_SECONDS` の export 忘れ / 新規ファイルの `git add` 列挙 / Python 側で数字を整形し直さない(plan の文字列をそのまま描く)。
- **テスター**: 「description に数字が出る」と「名前・本文・個別 pt が出ない」を**同じテストで両方**固定する(反転させたテストが片方だけ緩むのを防ぐ)。`HEXISTS` 失敗→サムネ直、hash 不在→302 PNG、POST 0 件→502 の 3 つの fail-soft を本番 curl で必ず通す。Actions の緑は「`"stored":true` を grep」でしか成立させない。
- **利用者**(シェアする人・配信者): 貼った瞬間に「来場 8,368・ギフト 117,280pt」が画面付きで出る=応援の規模が一目で伝わる。数字は貼った時点で止まる(画像に時刻)。配信者の画面スクショに帯が乗って当サイトから 1 時間だけ配られる点は §11 のとおり開示する。
