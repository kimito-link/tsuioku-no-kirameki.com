> ★配置先: `docs/handoff/live-comment-body-DESIGN.md` へ移す(Plan mode のため本ファイルに書いた。司令塔が移す。
>   依頼文の出力名 `live-comment-body-DESIGN-draft.md` は Plan mode の書込制限で使えず、このエージェント用ファイルに書いた)

- 設計: Fable(claude-fable-5-1) / 日付: 2026-09-15 / 行番号は HEAD=6ce6c5d8(v0.1.1512)の実ファイルで確認済み
- 上流: `~/.claude/plans/elegant-crunching-quokka.md`(第1版・実測 #1〜#12)/ 別段の設計 `~/.claude/plans/elegant-crunching-quokka-agent-a0b3f1f533883a0fd.md`(増分集計・匿名衝突・握手=0.1.1513・以下「増分設計」)/ 司令塔実測(2026-09-15): 上位 3 人の直近 5 件ずつ=6 区画・0.6 秒、フル遡及 4.6 秒
- 位置づけ: 増分設計(0.1.1513)の**後**に、A(0.1.1514)と B(0.1.1515)を**別コミット・別 bump**で積む。A と B は互いに依存しない(どちらか単独で revert 可)

## 1. 目的
- **A(拡張)**: 応援レーンのタイルから「その人の、この配信での発言」を**本人のローカル保存分から全件**(上限つき・件数は正直に併記)で読めるようにする。会場モードの発言パネル(`venueBar.js:4174-4269`)と同じ体験を popup 側にも通す。
- **B(公開ページ)**: `/live/` の「💬 コメントで応援した人」の行にホバーしたとき、**その人の直近の発言(最大 5 件)をその場で NDGR から浅く取って表示**する。本文は Redis に SET しない。

## 2. 非目的
- 公開ページに本文を**蓄積・公開**すること(privacy §14「本文は保存しない」`privacy.html:721,724` を守る)。ギフト/広告列のホバー(uid はあるが v1 は対象外)。
- 拡張のオプトイン送信(`topSupporters`)の利用・popup 内に新しい発言パネル DOM を作ること(既存の comeview 詳細を使う)。`personTileDom.js`(タイル正本・凍結 `renderStoryUserLaneDom.js:482`)の変更。
- `crawlNdgrBackward`(`src/lib/ndgrBackfillCrawl.js:466`)の改修・viewUri/audience_token の保存(メモリを含む)・`vercel.json` の変更・増分設計の state(`live:comments:state`)への読み書き。
- popup-entry.js のラチェット(`eslint.config.js:398` max 22660・現在 22653 行=余裕 7 行)に触れる設計。A の popup-entry 差分は **+2 行 −2 行(純増 0)**。

## 3. ユーザー決定(継承・蒸し返さない)
| # | 決定 | 出典 |
|---|---|---|
| U1 | 「本文をプレビューで全部出す・保存するなら Chrome 拡張」→ 拡張は本人ローカルの保存分から全発言 | 2026-09-15 |
| U2 | 「live のほうは、ホバーしたときだけその時の発言を出す」→ /live/ はオンデマンド・サーバ保存なし | 2026-09-15 |
| U3 | 公開ページに本文を蓄積・公開しない(著作権・privacy §14) | 2026-09-15 |
| U4 | 握手は残す・viewUri 保存による握手削減は採らない | 増分設計 H |
| U5 | 匿名は件数順・「匿名NNN」＋identicon | 2026-09-14・AGENTS §3.5 |

## 4. 機能 A の設計(拡張・0.1.1514)
### 4.1 判断: popup からも開けるようにする(会場だけでは足りない)。パネルは**新設しない**
- 会場は `openSpeechPanelFor`(`venueBar.js:4174`)で実現済み。popup の応援レーンのタイルは数値 uid が `<a href=ユーザーページ>`・匿名が `<span>`(`personTileDom.js:58-69`)で、発言へは辿れない。
- **既に「uid → 発言一覧」の経路が 2 本ある**: (i) popup の応援タイムライン行クリック → `comeview.html?user=<uid>&uname=<名>` を popup 窓で開く(`popup-entry.js:13190-13210`) → (ii) comeview が `?user=` を読んで `showUserDetail` を自動で開く(`comeview-entry.js:922-932, 2219-2223`)。`showUserDetail`(`:1056-1214`)は本体アーカイブ(IDB→チャンク→テール `readCanonicalComments` `:1275`)を読み `extractUserCommentRows(rawRows, ukey, 200)`(`:1186`)で全件抽出・サムネ/名前/ID/↗ユーザーページ/NG/メモまで揃う(§3.5 準拠)。
- ⟹ **応援レーンのタイルもこの経路に乗せる**のが最小。新 DOM ゼロ・storage 読みは既存の 1 回だけ。
### 4.2 変更ファイル
| # | ファイル | 差分 |
|---|---|---|
| A1 | `src/lib/comeviewUserDetailLink.js`(新規・純関数) | `buildComeviewUserDetailPath(uid, uname)` → `` `comeview.html?user=${encodeURIComponent(uid)}&uname=${encodeURIComponent(uname)}` ``(`popup-entry.js:13203` の式をここへ)。`laneTileUserDetailTarget({ userKey, title })` → `{ uid, uname }|null`: `userKey` が `u:` 始まり(`venueLaneParityKey` `src/lib/venueLaneParity.js:61-64` の形)なら uid=`slice(2)`、`uname` は `title` を `' | '` で割った先頭(`personTileDom.js:83-85` の tip 形式 `${p.title} | ${fullUid}` に対応)。`export const USER_SPEECH_ROWS_MAX = 1000` |
| A2 | `src/lib/comeviewUserDetailLink.test.js`(新規) | §11.1 |
| A3 | `src/extension/popup/wireLaneUserDetailOpen.js`(新規・ラチェット 2000 `eslint.config.js:402`) | `wireLaneUserDetailOpen(root)`: `root`(document)に **click 委譲を 1 個**(innerHTML 再描画・hollow→real 置換 `renderStoryUserLaneDom.js:446-452` に耐える)。`ev.target.closest('.nl-story-userlane-cell[data-user-key^="u:"]')` → `laneTileUserDetailTarget({ userKey: el.dataset.userKey, title: el.title })`。**修飾キー/中ボタン(`ev.button!==0 || ctrl/meta/shift/alt`)は素通し**=数値 uid の既存リンク(ユーザーページ)は Ctrl+クリック/中クリックで従来どおり。素クリックは `preventDefault` → `chrome.windows.create({ url: chrome.runtime.getURL(path), type:'popup', width:420, height:640 })`・失敗は `window.open`(`popup-entry.js:13205-13209` と同型)。二重配線ガード `root.documentElement.dataset.nlLaneUserDetailWired='1'`(`:13192-13193` と同型) |
| A4 | `src/extension/popup-entry.js` | (a) import 1 行 `import { wireLaneUserDetailOpen } from './popup/wireLaneUserDetailOpen.js';`(`:694` 付近)。(b) 起動処理で `wireLaneUserDetailOpen(document);` 1 行。(c) `:13202-13204` の 3 行を `chrome.runtime.getURL(buildComeviewUserDetailPath(uid, uname))` の 1 行に(import は既存の lib import 群へ名前追加=行数不変)。**純増 0 行**(22653 のまま) |
| A5 | `src/extension/comeview-entry.js` | `:1186` の `200` → `USER_SPEECH_ROWS_MAX`(import 追加)。見出し「全 N 件(新しい M 件を表示)」(`:1190-1192`)は不変=切った事実は見える |
| A6 | `src/extension/venueBar.js` | `:90` `VENUE_SPEECH_PANEL_MAX = 200` → `= 1000`(**数値リテラルのまま**。`venueHoverCard.wiring.test.js:209` が `=\s*\d+` を要求)。`.nlsb-roster-list` は `overflow-y:auto`(`:1623-1626`)でスクロールする |
| A7 | `src/extension/venueSpeechPanelRowsMax.wiring.test.js`(新規) | venueBar.js ソースの `VENUE_SPEECH_PANEL_MAX = (\d+)` を読んで `USER_SPEECH_ROWS_MAX` と一致(手書き 2 箇所を機械で束ねる) |
| A8 | `extension/popup.html` | `:12521` の `title` 末尾に「。タイルを押すとその人の発言一覧（Ctrl+クリックでプロフィール）」を足す(ラチェット無し)。**匿名 `<span>` に `cursor:pointer` は付けない**(affordance 計器 `storyUserLaneClickAffordanceParity.js:31-55` が SPAN の pointer を不一致に数える。計器の前提更新は第2段) |
| A9 | 生成物 | `scripts/repo-tree-map.mjs` FEATURES に 1 行(「応援レーンタイル→発言一覧(comeview 詳細)」paths: A1/A3/`src/extension/comeview-entry.js`)→ `docs/repo-tree-map.*`・`docs/feature-map/*`・`docs/layer-map.html` 再生成 |
### 4.3 上限 1000 の根拠(「全部」との差)
- `extractUserCommentRows` は cap に関係なく全行を走査し `total` を返す(`comeviewActions.js:223-232`)=cap は **DOM 行数だけ**を抑える。
- 本文は 1 行 ≤1000 字(`COMMENT_TEXT_MAX_CHARS` `commentRecord.js:16`)。1000 行でも文字列 ≤1MB・要素 3,000 個(comeview の行=3 span `:1196-1210`)で、popup 応援レーンの LOD 前(5,540 要素・MEMORY)より小さい。実データの分布は 68 分配信で 20,303 行/805 人=平均 25 件・上位例 42 件(計画 #5・増分設計 §5.1)。**1 人 1,000 件超は未観測**(§13-1)。無制限にしない理由: 仮想スクロール無しの `innerHTML` 一括描画で外れ値 1 人にパネルが数万要素になる保険。

## 5. 機能 B の設計(/live/ ホバー・0.1.1515)
### 5.1 経路と前提
- ブラウザ単独不可(`api/live-ranking.js:16`・拡張は `*.nicovideo.jp` 同一オリジン+host_permissions)。サーバは watch HTML→WS 握手→viewUri→NDGR の全経路が Node で動く(計画 #1〜#3・`scripts/live-comment-tally.mjs:111-257`)。
- **1 リクエスト=1 配信ぶんをまとめて取る**: 対象 uid は `live:comments:latest` の `byLive[lv].rankers`(≤10 人・`api/live-ranking.js:40,352`)+要求 uid。上位 3 人×5 件が 6 区画 0.6 秒(司令塔実測)なので、10 人でも浅い cap 内で「各人の新しい方から 5 件」が集まる見込み(取り切れない人は取れた分だけ・§13-2)。同じ配信の別の人へホバーしても**握手は 60 秒に 1 回**(U4 を守りつつ握手回数を抑える唯一の手段)。
### 5.2 新エンドポイント `api/live-recent-comments.js`(新規・npm 依存ゼロ)
- **`POST` JSON `{ "lv": "lvNNN", "uid": "..." }`**(GET は 405)。★POST にする理由: Vercel のアクセスログは URL(クエリ含む)を残す(保持期間は §13-4)ため、`?uid=` だと「誰を見たか」が platform 側に残る。body はログに乗らない。同一オリジン(`vercel.json` の rewrite は `api/` 除外)なので preflight は発生しない。`console.log` に uid/lv/本文を出さない(既存 `:15-18` の掟)。
- 応答(全て `Cache-Control: no-store`): 200 `{ ok:true, lv, uid, texts:string[≤5], found:number, partial:boolean, segments:number, ms:number, cached:boolean }` / 400 `bad_request` / 404 `not_ranked`(uid が rankers に無い・集計未着) / 410 `ended`(wsUrl 空=終了) / 202 `{ ok:false, inFlight:true }` / 501 `ws_unavailable` / 502 `upstream`。
- 処理順: (1) 形検証(`/^lv\d{6,15}$/i`・uid ≤64 字)→ (2) **メモリキャッシュ** `recentByLive: Map<lv, { at, byUid: Record<uid,string[]>, partial }>`(モジュールスコープ=温かいインスタンス内だけ・`RECENT_CACHE_TTL_MS` 内なら即返す・50 配信超は古い順に prune)→ (3) `typeof WebSocket !== 'function'` なら 501(Node 22 未満・§13-3)→ (4) Redis `SET live:recent-lock:<lv> <now> NX EX 10`(`api/live-ranking.js:491-496` と同型・本文は載せない)。取れなければ 202 → (5) `GET live:comments:latest` → 対象 uid 集合(無ければ要求 uid のみ・応答は `found:0` でも 200)→ (6) watch HTML(UA・timeout 2500)→ `extractEmbeddedData`(`nicoliveRankingPick.js:63`)→ `pickWsUrlFromEmbeddedData`(`embeddedDataExtract.js:49`・'' → 410)・`pickProgramBeginAt(props)`(`:89`)→ (7) `fetchViewUri(wsUrl, { timeoutMs:2500 })`(§5.3)→ (8) `crawlNdgrBackward({ viewBase, fetchBinary(UA・timeout 2500), programStartSec, fetchGapMs:30, caps: RECENT_CRAWL_CAPS })` を回し、各 yield の `ndgrChatsToMergeRows(chats)` から対象 uid の行 `{ uid, text, no, vpos, seg, idx }` を貯める。全対象が `RECENT_TEXT_KEEP` 件に達したら `gen.return()`(増分設計 §6-4 と同じ根拠で安全)→ (9) `pickRecentTextsByUid`(§5.4)→ `formatRecentTexts(list, { max:5, maxChars:80 })`(`recentTextRing.js:52`)→ キャッシュ → `DEL` lock → 200。
- `upstash()` は `api/live-ranking.js:119-131` を **export して import**する(2 箇所目を書かない・`package.json:6` `"type":"module"`)。viewUri・wsUrl は関数ローカルのみ・キャッシュにも例外本文にも載せない。
### 5.3 共有 I/O モジュール `src/server/nicoliveGuest.js`(新規ディレクトリ)
- `fetchViewUri(wsUrl, { timeoutMs, WebSocketImpl = globalThis.WebSocket })` と `fetchWatchHtml(lv, { timeoutMs, signal, ua })` を `scripts/live-comment-tally.mjs:106-182` から**移す**(script は import に置換。0.1.1513 が先に着地するので `tallyOne` との衝突なし)。`WebSocketImpl` 注入で偽 WS の単体テストが書ける。
- `src/lib` ではなく `src/server` に置く理由: lib は `window/document/fetch` 禁止。`scripts/repo-tree-map.mjs:50-57` の `ROLES` に `'src/server'`(Node 側 I/O 部品・api と scripts が共用)を 1 行。`check-tracked-imports`(`scripts/check-tracked-imports.mjs:34` は `src/` を見る)に掛かるので **`git add` を明示**。
### 5.4 純関数 `src/lib/recentTextPick.js`(新規・テスト付き)
- `pickRecentTextsByUid(rows, uids, keep)` → `Record<uid, string[]>`(新しい順)。並び: `vpos` 降順 → `no` 降順 → 到着順(`seg` 昇順=区画は新→古 `ndgrBackfillCrawl.js:996-997`、区画内 `idx` 降順)。`vpos`/`no` が両方無い行は到着順のみで並べる。同一本文の連続は `pushRecentText`(`recentTextRing.js:34`)と同じく 1 件に畳む。
- `shouldStopRecentCrawl(counts, uids, keep)` → 全 uid が keep 以上なら true。
### 5.5 画面(`/live/`)
| # | ファイル | 差分 |
|---|---|---|
| B1 | `src/extension/live-ranking-entry.js` | `renderRows`(`:98-117`)の `<li` に `kind==='comment'` のときだけ `data-uid="${esc(r.uid)}" data-lv="${esc(liveId)}"`(`commentRows` は `uid` を持つ `liveRankingView.js:237`)。import `wireRecentHover` と、`elList` 定義(`:20`)の後で `wireRecentHover(elList, { fetchRecent })` を 1 回 |
| B2 | `src/extension/liveRecentHover.js`(新規・DOM+fetch) | `elList` に `mouseover/mouseout/click` の**委譲 3 個**(`render()` の `innerHTML` 全置換 `:238` で消えない)。`closest('li[data-uid]')`。`HOVER_DELAY_MS` 後に `fetchRecent(lv, uid, signal)`(POST・`cache:'no-store'`・AbortController)。ページ内キャッシュ `Map<'lv:uid', {at, texts}>`(`RECENT_CACHE_TTL_MS`)。カードは **body 直下に 1 個**(`position:fixed`・`getBoundingClientRect` で li の下に置く・画面右端/下端では左/上へ折返し)。`mouseout` で relatedTarget が li でもカードでもなければ隠す。`click` は `.ava/.no/.pt` 上だけトグル(`.nm a` のリンクは温存・タッチ端末用)。202 は 1 回だけ 1500ms 後に再試行 |
| B3 | `src/lib/liveRecentHoverCard.js`(新規・純関数) | `buildRecentCardHtml(state)`(`escapeHtml` `htmlText.js:23` 使用): `loading`「発言を取得中…」/ `ok`(`<ul>` 各 `<li>`)/ `empty`「直近の区画には見当たりませんでした」/ `ended`「この放送は終わったみたい」/ `busy`「混み合っています。少し待ってもう一度」/ `error`「いまは取得できませんでした」。`partial` なら末尾に「（直近ぶんだけ）」。`nextHoverState(prev, event)` の遷移表(§8) |
| B4 | `tsuioku-no-kirameki/live/index.html` | `:258` `.col-note` の後に `.recent-card{position:fixed;z-index:50;max-width:320px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px rgba(20,55,92,.14);padding:8px 10px;font-size:.82rem;color:var(--ink)}` `.recent-card ul{margin:4px 0 0;padding-left:1.1em}` `.recent-card .st{color:var(--ink-sub)}` `ol.rank li[data-uid]{cursor:help}`。たぬ姉の吹き出し(`:346`)に「名前にマウスを乗せると、その人の直近の発言をその場で取ってくるわ（保存はしないわ）」を 1 文 |
| B5 | `tsuioku-no-kirameki/privacy.html` | §7 の確定文(`:721,726,728`)・`:403` 最終更新日 |
| B6 | `api/live-ranking.js` | `:119` `async function upstash` に `export` を付ける **1 語のみ** |
| B7 | `scripts/live-comment-tally.mjs` | `:106-182` を削除し `import { fetchViewUri, fetchWatchHtml } from '../src/server/nicoliveGuest.js'`。呼び出し(`:193,201`)の引数を合わせる。stdout・終了コードは不変 |
| B8 | 生成物 | FEATURES 1 行(「/live/ ホバーで直近の発言」paths: B2/B3/`api/live-recent-comments.js`)・ROLES 1 行(§5.3)・`docs/site-health.md`(HTML 変更)・`app/dist/live-ranking.js`(`scripts/build.mjs:206-208`) |

## 6. 仕様の確定値
| 名前 | 値 | 根拠 |
|---|---|---|
| エンドポイント | `POST /api/live-recent-comments` body `{lv,uid}` | §5.2(クエリに uid を置かない) |
| `RECENT_TEXT_KEEP` | 5(既存 `recentTextRing.js:20`) | 会場ホバーカードと同じ件数 |
| カード 1 件の文字数 `maxChars` | 80 | 会場は 60(`:54` 既定)。/live/ のカードは 320px 幅で 2 行入る |
| `RECENT_CRAWL_CAPS` | `{ elapsedMs: 4000, segments: 12, bytes: 2_000_000, rows: 20_000 }` | 6 区画 0.6 秒(実測)の 2 倍を区画に、Vercel 既定 10 秒(§13-3)から HTML 2.5+WS 2.5 を引いた残りの範囲 |
| `fetchGapMs` | 30 | `live-comment-tally.mjs:69` と同じ |
| サーバ側キャッシュ `RECENT_CACHE_TTL_MS` | 60_000 | 握手を 1 配信 60 秒に 1 回へ(U4 と両立)。§7 の文と一致させる |
| ロック `live:recent-lock:<lv>` | `NX EX 10` | crawl 上限 4 秒+握手+HTML < 10 秒 |
| ページ側キャッシュ TTL | 60_000 | サーバと同じ(戻りホバーで再 POST しない) |
| `HOVER_DELAY_MS` | 250 | 通過ホバーで POST しない |
| 202 再試行 | 1 回・1500ms 後 | ロック TTL 10 秒内に 1 本目が終わる想定 |
| HTTP/WS タイムアウト | 2500 / 2500 ms | 合計 9.3 秒 < 10 秒 |
| A の上限 `USER_SPEECH_ROWS_MAX` | 1000 | §4.3 |

## 7. privacy の確定文(§14・`privacy.html`)
- `:721` の li 末尾に追記: 「また、閲覧者が「コメントで応援した人」の名前にマウスを乗せる等の操作をしたときに限り、<strong>その方の直近の発言（最大 5 件・各 80 文字まで）を表示のためにその場で取得して返す</strong>ことがあります。この本文は<strong>データベースやディスクには保存しません</strong>。同じ番組への連続した要求をまとめるため、サーバーのメモリ上に<strong>最長 60 秒</strong>だけ保持し、その後は破棄します。」
- `:726` 末尾に追記: 「名前にマウスを乗せて発言を表示する操作についても、<strong>誰がどの方を表示したかは記録しません</strong>（表示に必要な番組 ID と投稿者の識別子を送信するだけで、ログや解析には残しません）。」
- `:728` 末尾に追記: 「ホバー時に取得した発言本文は上記と別に、最長 60 秒でメモリから消えます。」
- `:403` を「2026年9月15日」(B のコミット)。※ライブ URL で反映を確認(`curl -s https://tsuioku-no-kirameki.com/privacy.html | grep 最終更新`)。

## 8. 状態遷移
```
[A] タイル click ─(修飾/中ボタン)→ 既定動作(数値 uid=ユーザーページ新タブ・匿名=何もしない)
              └(素クリック・data-user-key^=u:)→ preventDefault → comeview.html?user=&uname= を popup 窓で開く
                 → comeview: requestFullRefresh → showUserDetail → 「アーカイブから読み込み中…」→ 全 N 件(新しい ≤1000 件)/「まだ発言がありません」
[B] ページ: idle ─mouseover li[data-uid]→ pending(250ms) ─離脱→ idle
     pending ─経過→ (cache hit → shown) | loading(POST, abortable) ─離脱→ abort→idle
     loading ─200 texts>0→ shown ─200 texts=0→ empty ─410→ ended ─202→ retry1(1.5s)→ loading|busy ─他→ error
     shown/empty/ended/busy/error ─mouseout(relatedTarget∉li,card)→ idle(カード hidden)。render() で li が消えても委譲は残る
[B] サーバ: 検証 → cache(<60s) hit→200(cached:true) | miss → WS 無→501 | lock 取れず→202
     | lock OK → HTML(''→502) → wsUrl(''→410) → viewUri(''→502) → crawl(cap/早期 return) → pick → cache → DEL lock → 200
```

## 9. bump(2 回・各 1 patch・AGENTS §12.5)
- **A=0.1.1514**「応援レーンのタイルから発言一覧を開けるように」(20 字)。items: 「応援レーンのアイコンを押すと、その人がこの配信でした発言を新しい順に読めます（Ctrl+クリックで従来どおりプロフィール）。会場モードの発言パネルも 1,000 件まで表示します。」
- **B=0.1.1515**「ランキングの名前にホバーで直近の発言を表示」(21 字)。items: 「追憶のきらめき ランキング(/live/)で「コメントで応援した人」の名前にマウスを乗せると、その人の直近の発言を最大 5 件その場で取得して表示します。本文はサーバーに保存しません。」
- 各回: `extension/manifest.json:4`・`package.json:3`・`src/lib/changelog.js:19-27` 先頭(★CRLF)・LP `tsuioku-no-kirameki/index.html` の 4 箇所(`scripts/verify-bump.mjs:211-221` の正規表現が照合)。changelog は現在 20 版(`grep -c "version: '"`=20)→ 1 版足すごとに `node scripts/split-changelog.mjs` を **1 回**・実行後に件数を検算(0.1.1513 の後も同じ手順)。
- 新規/変更 lib のコメントに `capturedAt|persistedAt|measuredAt` を書かない(`timeAuthorityRegistry.test.js:11,35-41` が `src/lib` を文字列走査)。

## 10. rollback
- A: 1 コミット `git revert`。storage 形式・API 変更なし。部分戻し: A4(b) の 1 行を消せばタイルは従来動作(モジュールは残っても無害)。
- B: 1 コミット `git revert`。Redis に本文キーは無い。`live:recent-lock:*` は TTL 10 秒で消える。部分戻し: B1 の `data-uid` 付与を外せばホバーは何も起きない(エンドポイントは残っても 404/410 を返すだけ)。script の import 化(B7)は revert で元に戻る。

## 11. 検証手順
### 11.1 単体(`npm run test:cc`)
- A2: `laneTileUserDetailTarget`: `u:123` + `'みち | 123'` → `{uid:'123', uname:'みち'}` / `u:a:xyz` + `'匿名12'` → `{uid:'a:xyz', uname:'匿名12'}`(comeview 側で「匿名NNN」は捨てる `comeview-entry.js:931`) / `c:…`・空 → null / `buildComeviewUserDetailPath('a b','x&y')` がエンコード済み。A7: 一致検査。既存 `venueHoverCard.wiring.test.js`・`venueSpeechPanelUserKey.wiring.test.js` が緑のまま。
- B: `recentTextPick.test.js`: 新→古 3 区画のフィクスチャで各 uid が新しい順 5 件 / `vpos` 無し行は到着順 / 同一本文連続は 1 件 / 対象外 uid は出ない / `shouldStopRecentCrawl` 全員到達で true・1 人足りないと false。`liveRecentHoverCard.test.js`: 6 状態の HTML に本文が `escapeHtml` 済み(`<script>` を通さない)・`partial` 注記・遷移表。`nicoliveGuest.test.js`: 偽 `WebSocketImpl` で `messageServer` → viewUri・`disconnect`/timeout → ''。
- ネガコン: `api/live-recent-comments.js` の `sanitize`(lv/uid)に対し `../` や 65 字 uid → 400。
### 11.2 ゲート順序(各 bump ごと)
新規ファイルを **明示 `git add`** → `npm run build` → `npm run tree-map && npm run feature-map && npm run site-health && npm run layer-map` → bump 3 点+LP 4 箇所 → `split-changelog` 1 回+検算 → `npm run verify:bump` → `npm run verify:cc`(`.artifacts/verify-cc.log`・`tree-map:check`/`site-health:check`/`check:tracked-imports` を含む)→ `.agent/coord.md` を読んでから commit → push。A は加えて `npm run copy:ext` → `reload_extension`(配信視聴中は copy:ext 禁止・§12.5)。
### 11.3 ローカル dry-run(B)
1. Node 22 で `node --input-type=module -e "import h from './api/live-recent-comments.js'; const res={h:{},setHeader(k,v){this.h[k]=v},status(c){this.c=c;return this},json(o){console.log(this.c,JSON.stringify(o))}}; await h({method:'POST',body:{lv:process.argv[1],uid:process.argv[2]}},res)" lvNNN <uid>`(`KV_REST_API_URL/TOKEN` は Vercel の環境変数を人が渡す)。放送中の lv は `node scripts/pick-live-for-check.mjs --json`。
2. 同じ lv で 2 回目 → `cached:true`・`ms` が 1 桁 ms。別 uid でも `cached:true`(1 配信 1 握手の証拠)。
3. stdout/stderr を `grep -E 'audience_token|viewUri|mpn\.live|wss://'` → 0 件。
4. `node scripts/live-comment-tally.mjs --dry-run --lv lvNNN` が B7 の後も同じ 1 行 JSON を出す。
### 11.4 本番
- `curl -s -X POST https://tsuioku-no-kirameki.com/api/live-recent-comments -H 'content-type: application/json' -d '{"lv":"lvNNN","uid":"<rankers の uid>"}'` → 200 と `texts`。存在しない uid → 404。GET → 405。`Cache-Control: no-store` を `-i` で確認。
- `/live/` を実機(Claude-in-Chrome・1040px/720px/モバイル幅)で: 名前にホバー → 250ms 後にカード → 5 件 → 離すと消える。60 秒の再描画中にホバーしても委譲が生きる。モバイル幅でアイコンをタップ → トグル。連続で 10 人をなぞって Network に POST が 10 本・応答の `cached:true` が 2 本目以降。
- A: 実機で popup の応援レーンの数値 uid タイルを素クリック → comeview 窓に発言一覧・Ctrl+クリック → ユーザーページ。匿名タイル → 「匿名NNN」の一覧。会場パネルで 200 件超の人が「新しい 1000 件」まで出る(データがあれば)。

## 12. 3 視点への予備回答
- **実装者**「popup-entry のラチェット 7 行に収まるか」→ +2(import・call)−2(`:13202-13204` の 3 行→1 行)=純増 0。もし収まらなければ (c) を先に入れて計測してから (a)(b)。「`gen.return()` は安全か」→ 増分設計 §6-4 と同じ(先読み fetch は `fetchWithThrottle` が握る・in-flight は 2.5 秒で終わる)。「Vercel が `../src` を bundle するか」→ §13-5(未確認・プレビュー deploy で curl して初めて分かる)。
- **テスター**「匿名の uid は rankers と一致するか」→ `ndgrChatsToMergeRows` の `userId` は数値 uid か `a:` ハッシュ(`ndgrChatRows.js:14-22,53`)で、tally も同じ関数から数えている(`live-comment-tally.mjs:232`)=同一。「キャッシュに他人の本文が 60 秒ある」→ §7 に明記(嘘を書かない)。「WS 無しの環境」→ 501 でカードは `error`(無言にしない)。
- **利用者**「押したのにプロフィールに行かない」→ 詳細の「↗ ユーザーページ」(`comeview-entry.js:1111-1126`)で 1 クリック・Ctrl+クリックで従来動作・popup.html の title にヒント。「ホバーしても何も出ない」→ 250ms 待ち・集計未着の配信は `not_ranked`→`error` 文言。0 件は「直近の区画には見当たりませんでした」と理由付き。

## 13. 未確認事項
1. 1 人 1,000 件超の発言が実データに存在するか(A の上限の妥当性)。
2. 浅い取得(12 区画・4 秒)で 10 人全員の 5 件が揃う率。`?at=now` の起点は 90 秒前(`NDGR_BACKFILL_SEED_LAG_SEC` `:80`)で、直近 90 秒は `previous` 回収(`:667-733`)に依存=最新の 1〜2 件が落ちる可能性。`found`/`partial` を応答に載せて本番で観測する。区画内の行の並び(昇順か)も未実測 → §5.4 は `vpos/no` で並べ直す。
3. Vercel の Node 版(global `WebSocket` は Node 22〜)と関数の実行上限(既定 10 秒か)。`vercel.json` に `functions.maxDuration` を足すかは実測後(非目的に含めた)。
4. Vercel アクセスログの保持期間と、POST body が本当に記録されないこと(POST を選ぶ根拠。公式記述の確認は司令塔)。
5. `api/` から `../src/lib`・`../src/server` の相対 import が Vercel の bundle(nft)で解決されるか(このリポの `api/` は現在 import ゼロ)。
6. ホバー連打時の Vercel 同時実行(ロックで crawl は 1 本だが、202 応答の関数呼び出し自体は増える)。
7. 直接の実測が無いもの: watch HTML をブラウザから CORS で読めない件(`api/live-ranking.js:16` の記述のみ)。B はサーバ経由なので設計には影響しない。
