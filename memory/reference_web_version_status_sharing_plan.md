---
name: reference-web-version-status-sharing-plan
description: きらめきの「スマホでも見れるWeb版」構想 — 録る=拡張必須/見せる=Web可の境界線とVercel+Railway構成メモ
metadata:
  type: project
---

# きらめき Web版(スマホ閲覧)構想 — 2026-06-04 着想

ユーザー発案:「CHROME拡張経由しなくても WEB版できないか」「拡張なくてもスマホで見れるのでは」。

## 核心の境界線(これは原理的に動かない)

| 役割 | 担当 | Web化 |
|---|---|---|
| **録る**(NDGR/WS傍受・公式pt取得) | Chrome拡張(必須) | ❌不可 |
| **見せる・共有**(status/HTMLレポート) | 現状は拡張内 | ✅Web化できる |

- 録る心臓部は manifest の `world:"MAIN" + all_frames:true + host_permissions` でニコ生watchページ内部に潜り込む傍受(`src/extension` に381箇所)。普通のWebサイトからは同一オリジン/CORSで絶対届かない。
- `status.html`/`status.js` の整形・表示ロジックは拡張非依存。JSONを渡せばそのままWebページに移植可能。
- → **スマホ閲覧の正解形**: `[PC拡張]録る → [サーバー]保存 → [Vercel等]URLで配信 → スマホで閲覧`。これは MEMORY の OSINT Phase 4「公開SaaS」と同じルート。

## 実現方式の選択肢

- **方式A(¥0・サーバー不要)**: 拡張のDLボタン→JSONをGist/Pages→Web版status.htmlが `?url=` で読む。貼った時点のスナップショット。「スクショの代わり」には十分。
- **方式B(常時最新・本格)**: 拡張が数秒ごとにサーバーへpush。ユーザーは方式B方向を志向(スマホで常に最新を見たい)。

## ユーザーの既存インフラ(2026-06-04 スクショ確認)

- **Vercel**: `kimito-link/web-health-check-app`(= dns-osint の Web版と思われる)。tsuioku-no-kirameki.com も Vercel ホスティングのはず。
- **Railway 3プロジェクト**:
  - `gregarious-unity`(GitHub+Node 2/2)
  - `reasonable-abundance`(GitHub+Node+**Postgres** 3/3)← DBあり
  - `adequate-miracle`(GitHub+Node 2/2)
- → dns-osint は「Vercel=Web / Railway=Node+Postgres」構成で稼働中 = **今回作りたい構成そのもの**。これをお手本にできる。
- **きらめき用には Railway も Vercel もまだ未連携**。新規に1セット作る必要あり。

## 重要な発見(罠)

- ローカル `dns-osint-pro-ver2.0` フォルダは **Chrome拡張だけ**(background.js/popup.js/manifest.json のみ)。Railway/Vercelに出すサーバー/Web側コードはこの中に無い。
- 「dns-osintのこの流れを真似る」には、**実際にデプロイしている Web/サーバー側リポ(別の場所 or GitHubのみ)を読む必要がある**。`web-health-check-app` のソースの所在は次回要確認。

## お手本 = oshin(dns-osint / web-health-check)の構成(2026-06-04 実読)

GitHub `kimito-link/web-health-check-app`(main・Vercel `app.web-health-check.link`)を gh で実読した。

- **構成**: Next.js 16 + React 19 + TypeScript のみ。`next.config.ts`/`src/app/...`。**DB なし・Railway 連携なし**(依存は next/react/fast-xml-parser だけ)。
- **データの持ち方**: `src/app/api/*/route.ts` に13個の Vercel Functions プロキシ(ssl/headers/ip-info/meta/redirect/sitemap/wp-detect/suggest各種)。ユーザーがドメイン入力 → その場でAPI叩く → 表示。**サーバーに状態を貯めない**。
- **ドメイン構成**: 本ドメイン=LP(`web-health-check-link`)、`app.`サブドメイン=実アプリ(`web-health-check-app`)。LP と app は別 Vercel プロジェクト。
- **oshin の現行戦略(HANDOFF-NEXT-SESSION.md・kimito「5年後楽したい」発)**: 拡張コードを **`chrome.*` API 依存ゼロに書き換え、同じ popup.js を Chrome/Web/iOS/Android で使い回す**(v9.0.0・`feature/v9-no-chrome-api`)。変換表: `chrome.runtime.sendMessage`→`fetch('/api/...')` / `chrome.storage.local`→`localStorage` / `chrome.tabs.create`→`window.open` / `chrome.downloads`→`<a download>` / background.js は全削除。

## きらめきへの当てはめ(決定的な差が1つ)

oshin は「入力→その場でAPI取得」型なので Web で100%再現できる。**きらめきは「ニコ生ページを傍受して録る」型 = 録るだけは Web から原理的に不可**(前述の境界線)。

→ きらめきの正しい設計 = **oshin方式(app サブドメイン+Next.js+Vercel) + 1点だけサーバー保存**:
```
[録る] Chrome拡張(ここだけ拡張必須・ニコ生傍受)
  ↓ fetch POST でアップロード
[保存] Vercel Functions + ストア(Railwayの reasonable-abundance の Postgres が使える)
  ↓
[見せる] app.tsuioku-no-kirameki.com (Next.js・oshinと同じ作り・status.js の整形ロジック移植)
  ↓ スマホで URL 開くだけ ✅
```
oshin の app 構成はそのまま流用でき、**きらめき特有なのは「拡張が録ったデータを保存するエンドポイント1本」だけ**。oshin の `popup.js` chrome.* 剥がし作業は、きらめきの「見せる」部分(status化)では既に status.html が下地済みなので不要。録る拡張はそのまま残す(剥がさない)。

ドメイン: `tsuioku-no-kirameki.com`=既存LP(Vercel) / `app.tsuioku-no-kirameki.com`=新規(status Web版)。

## DNS / ホスティング構成(2026-06-04 スクショ確認)

- **Cloudflare で6ドメイン管理中**: reverse-re-birth-hack.com / kimito-link.com / surechigai-nico.link / doin-challenge.com / web-health-check.link ほか。oshin も surechigai-nico も全部 Cloudflare DNS 運用が確立済み。Workers&Pages に clerk-proxy あり。
- **ただし `tsuioku-no-kirameki.com` だけ別**: Xserver(旧Sixcore)のネームサーバーを向いている(Xserverパネルの「旧Sixcoreで利用する」が選択状態)。= **きらめきだけ Cloudflare に入っていない**。
- **ユーザー方針**: 「Vercelにアップして Cloudflare 管理がいいかも」= oshin と同じ運用に揃える。
  - 目標構成: `tsuioku-no-kirameki.com` の NS を Cloudflare へ変更 → `tsuioku-no-kirameki.com`=Vercel(LP) / `app.tsuioku-no-kirameki.com`=Vercel(status Web版)を CNAME で向ける。oshin(web-health-check.link)で実証済みパターン。
- ⚠️ **NS切り替えは戻しにくい外向き操作**。実作業前に「現 LP が Xserver 配信か Vercel 配信か」を必ず確定すること(Xserver上に実体があるなら、Cloudflare移行時に LP も Vercel に移すか Cloudflareで Xserver に向けるか設計が要る)。NS変更の実操作はユーザーがパネルで行う前提。dig/whois で実態確認してから手順化する。

## ⚠️ Vercel デプロイの罠(2026-06-04 実エラー)

きらめきリポ(`kimito-link/tsuioku-no-kirameki.com`)を**そのまま Vercel に import すると必ず失敗する**。理由: これは Chrome拡張リポで `package.json` の `build`=`node scripts/build.mjs`(拡張ビルド)。Vercel が `vercel build` を叩くと拡張をビルドしようとして死ぬ。`vercel.json`/`next.config`/ルート`index.html` 無し=Webサイトとして作られていない。失敗デプロイは放置で害なし(何も公開されない)。

このリポは3つ同居: ①拡張(`extension/` `src/`) ②**LP=`tsuioku-no-kirameki/index.html`**(`npm run lp:serve` で配信している実体) ③マーケHTML(ルート `nicolivelog-marketing-*.html`)。

- **LP を Vercel に上げるなら**: このリポでOKだが **Root Directory=`tsuioku-no-kirameki`** に指定 + **Build Command を空**(静的配信)。`tsuioku-no-kirameki/index.html` がそのまま出る。
- **status Web版(本題)は別リポで Next.js 新規作成**。きらめき拡張リポは Vercel に繋がない。oshin `web-health-check-app`(Next.js16+React19・src/app/api/*/route.ts)をテンプレに。

## ✅ LP の Vercel デプロイ成功(2026-06-04・master commit 19db305)

`vercel.json` を master に追加し、LP が Vercel で稼働確認済み:
- URL: https://tsuioku-no-kirameki-com.vercel.app/ (→ `/tsuioku-no-kirameki/` に 307 リダイレクト)
- タイトル正常・`../extension/images` のロゴ HTTP 200・LP内 favicon 200(画像欠けなし)
- `vercel.json`: `buildCommand:null`/`installCommand:null`(拡張ビルドskip)+ `/`→`/tsuioku-no-kirameki/` redirect。これでこのリポを Vercel に上げても拡張ビルドが走らず静的配信される。
- → 本番 `tsuioku-no-kirameki.com` をこの Vercel プロジェクトに向ければLP移行完了(Cloudflare移行後)。

## 🎯 ゴール確定(2026-06-04 ユーザー)= 「拡張と全く同じ体験をスマホで再現」

「放送URL貼るだけで拡張なしで取れないか?」への回答 = **部分Yes・コメント本文はNo**:
- ✅ URL→サーバーで取れる: タイトル/配信者/来場/公式コメント数/pt/サムネ等のメタ(oshin /api 方式)
- ❌ URLだけでは取れない: **コメント1件1件の本文**(NDGR専用プロトコル・視聴中ブラウザ内接続でしか張れない・CORS壁)。きらめきの心臓=全コメ記録はここ。

→ 「全く同じ体験」の唯一の実現形 = **録るのは拡張(PC常駐・無改造)→ POSTでサーバー保存 → スマホはURL開くだけで拡張と同じUI**。スマホに拡張は不要、録る主体がPC拡張なだけで「見る体験」は100%再現可能。

確定アーキテクチャ:
```
[PC拡張] 録る(NDGR傍受・全コメ)→ fetch POST(配信中ずっと)
[Vercel Functions + ストア] 受信・保存
[app.tsuioku-no-kirameki.com] status.js のロジック移植で拡張と同じ描画
→ スマホでURL開くだけ ✅
```
進行順(ユーザー指定「接続してから本格で」): ①本番ドメイン接続(Cloudflare→LP/app を Vercel)→ ②本格実装(POST受け口+保存+同UI描画)。ストアは Railway `reasonable-abundance` の Postgres が使える。LP/app は同一 or 別 Vercel プロジェクト(ユーザー「LPもappもVercelで楽に」)。

## ✅✅ 本番ドメイン接続 完了(2026-06-04)

`tsuioku-no-kirameki.com` → Cloudflare(DNS)→ Vercel(LP)の接続が完了:
- Cloudflare 移行済み(権威NS=patryk/gabriella.ns.cloudflare.com)。元々 Sixcore だったが移行完了。
- Vercel Domains で `tsuioku-no-kirameki.com` = **Valid Configuration**(Auto configure で TXT _vercel + CNAME→vercel-dns-016 を Cloudflare に追加、両方 DNS only グレー雲)。
- Cloudflare 権威の A = `216.150.1.193`/`216.150.16.193`(Vercel IP)。Vercel IP 直当てで `Server: Vercel` + `Location: /tsuioku-no-kirameki/`(vercel.json redirect 効作)+ LPタイトル正常を確証。
- 注: ローカルPCのDNSキャッシュが切れるまで手元ブラウザは旧 nginx(Xserver)を見ることがあるが、世界的には切替済み。
- vercel.json の Auto configure 承認時「既存レコード削除でダウンタイム可能性」警告が出たが、LP実体は Vercel 側に既にあったので実質無停止。

→ 「接続してから本格で」の**接続フェーズ完了**。次は本格実装(app=status Web版)。

### Cloudflare DNS 最終状態(2026-06-04・7レコード・全グレー雲=DNSのみ)
- `A @ 216.150.1.193`(DNSのみ)/ `A @ 216.150.16.193`(DNSのみ)← Vercel IP
- `CNAME app → cname.vercel-dns.com`(DNSのみ)← **app サブドメイン DNS 準備済み**。Vercel で app プロジェクト作って紐付けるだけ。
- `CNAME www → 92070e400261b57c.vercel-dns-016.com`(DNSのみ)
- `TXT _vercel`(所有確認)/ `TXT @ SPF`(メール不使用・残置害なし)/ `TXT default._domainkey DKIM`(同)
- ※ Vercel は Cloudflare オレンジ雲と相性悪い → **全部グレー(DNS only)が正解**。当初オレンジだった3件をグレーに変更して「推奨事項=設定完了」になった。
- Vercel Domains: `tsuioku-no-kirameki.com`=Valid / `....i5pp.vercel.app`=Valid(307で本番へ)。本番 IP直当てで Server:Vercel 確証済み。

## 💡 ユーザーの最終ビジョン = ChatWork型(中央集約)(2026-06-04)

ユーザー言「プラットフォームの拡張アプリでさくっと WEB版両方使えれば便利・チャットワークみたいにできれば」。

= **データを1ヶ所(サーバー)に集約し、拡張/Web/スマホ/将来アプリは全部その同じデータを見る窓口**にする。ChatWork が「アプリでもブラウザでも同じ」なのと同型。oshin の「1コードベース全プラットフォーム」思想とも一致。

**ChatWork との唯一の差(受容必須)**: ChatWork は発言=ユーザーがアプリに打ち込む→どの窓口からも書ける。きらめきは発言=ニコ生に流れるコメントを**拾う**→拾える場所はニコ生ページ内(=拡張)に限られる(NDGR+CORSの壁)。よって:
- **見る/共有/閲覧** = どの窓口からも同じ(ChatWork通り)✅
- **録る(拾う)** = 拡張が中央の蛇口として担当(1台でOK・これだけは代替不可)

→ これは不便ではなく ChatWork型の理想形(録る蛇口1つ・見る窓口無限)。

「拡張連動なしにできない?」への結論: **コメント全文を拡張なしで録るのは原理的にほぼ不可**(サーバーでPuppeteer常駐はログイン要・規約リスク・コスト高・非現実的)。概要(タイトル/来場/公式数)だけなら放送URL→サーバーで可。でもユーザーの本意は「録る無し」ではなく「ChatWorkのように見る側がどこからでも」なので、中央集約設計で完全に叶う。

作るもの(=ChatWorkの「サーバー+Web版」に相当):
①拡張に「録ったデータをサーバー送信」機能を1個追加(蛇口→中央)
②Vercelに保存(中央)
③app.tsuioku-no-kirameki.com で表示(窓口・スマホOK)
DNSは全部通済み(app含む)。あとは①②③の中身実装のみ。

## 次セッションの入口

1. ✅完了: `web-health-check-app`(gh)実読。Next.js+Vercel構成・oshin v9戦略まで把握。
2. きらめき用 `app.tsuioku-no-kirameki.com` を新規 Vercel プロジェクトで作る(oshin の web-health-check-app をテンプレに)。最小は「拡張からの POST 受け口 + 保存 + status整形表示」。
3. 保存先: 方式A(¥0スナップショット共有=Gist/静的)で先に体感 → 物足りなければ方式B(Railway Postgres `reasonable-abundance` に push で常時最新)へ。
4. 拡張側: `status.js` の DLボタンに「サーバーへアップロード」を1本足すだけ(録る部分は無改造)。

関連: [[handoff_2026-06-04_v0631_session_complete]](status.html が既にWeb化の素地)、OSINT Phase 4 公開SaaS構想。
