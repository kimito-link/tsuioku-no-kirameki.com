# 横の欄(サイドパネル)・コメビュが「どの配信を出すか」— SPEC(統合版)

- 作成: 2026-11-09 会議(Fable)。クラウド案(旧 SPEC: ニコ生の3層を通す)と PC 案(`panel-target-DESIGN-pc.md`: BG のタブ対応表+resolver)を、
  **実コード(0.1.1945 master + staged 0.1.1946 候補)で両案の主張を裏取りしてから1本に統合**した。地図 = [panel-stream-selection-MAP.md](panel-stream-selection-MAP.md)。
- 方式: AGENTS.md §12.10(wayfinder→to-spec)。実装は §7 のフェーズ順に **1版=1つの意味ある変更**。着手前に §12.1 の Plan ゲート。
- 一言: **ニコ生版の3層(A 外枠の追従 / B 中身の選択 / C 最後に見た配信の記憶)を YouTube 系(YouTube+6サービス)にもそのまま通す。
  shim は「本物の URL ⇔ 疑似 lv」の翻訳だけをする境界に戻す。BG に新しい決定機構は作らない。計器を先に入れ、数で直った/直っていないを決める。**

---

## 1. 目的・非目的

**目的**
1. YT 系の配信タブを前面にしたら横の欄がその配信を出し、前面が変わらない限り戻らない(「一瞬変わって戻る」根絶)。
2. 別サービスへ移ったら言葉(「Kicks ランキング」等)も含めて画面がまっさらになる(ニコ生版と同じ=iframe を読み込み直す)。
3. 記録の無いチャンネル(配信前の部屋)を前面にしたら「その部屋・記録 0」を出す(前に見ていた別の配信を出し続けない)。
4. コメビュ(`?lv=` 無し)はニコ生版と同じ決まりで「最後に前面で見た配信」に追従する。
5. **ニコ生版は1行も変えない**(`popup-entry.js` / `comeview-entry.js` / `content-entry.js` / `sidePanelLvFromTabs.js` / `popupWatchUrlResolveMultiTab.js` 無改変)。

**非目的**: shim(2,484行)の全面分割 / 複数ウィンドウで別窓の前面を追う(ニコ生版も自窓だけ) / 記録の仕組み・置換表・ギフト集計 / manifest(権限・content_scripts)の変更 /
「配信していない部屋」の専用の空画面(§3-d)。

---

## 2. 実コードで裏取りした事実(両案の主張の検証・行番号は HEAD)

| 主張 | 検証結果 |
|---|---|
| PC: 探り読み `collectDataBackedWatchLvs` は P:16660・上限 `min(2800, 900+350N)`ms | **正**。入口 P:15015 は「写した activeTab が watch でない かつ INLINE_OWN_WATCH_URL 無し」のときだけ走る。shim は `nls_comments_<lv>` を聞かれるたび `lastAskedLv` を更新し(S:784)全件を IndexedDB から組む(S:786)。`nls_watch_snapshot_`/`nls_chunk_index_` は shim が答えないので、探り読みの材料は重い全件組み立てだけ |
| PC: `noActiveWatchDecision.js:75` でサイドパネルは空にしない | **正**(常駐面は activeTab 以外の経路でも保つ)。だから storage 経路が YouTube を返すと画面がそのまま YouTube になる |
| PC: BG に `tabs.on*` リスナ無し・YT_STREAM_META は 6+1 本の content が送る | **正**。BG:744 の handler は `sender` を videoId の補完にしか使わず、タブ対応表は無い。payload に `endedAt` はある(`live` フラグは無い=`live` は `!endedAt` の導出)。`yt_active_video_id` は毎 META で上書きされる単一値(PC の地雷どおり使わない) |
| クラウド: boot は YT 系で src 固定・YouTube↔Kick で読み込み直さない | **正**(boot:64, 83-86)。`isYtPanelTabUrl` はホスト一致(ytPanelRoute.js:10)なので YouTube トップでも YT 版へ切替わる |
| クラウド: shim が `nls_last_watch_url` を newest で差し替え(S:777)、summaries 変化で偽の変化を配る(S:1061-1070・旧 SPEC の 1114-1131 はずれ) | **正**。`nls_last_watch_url` は popup では「遅い側(3秒に1回)」の描き直しトリガ(storageTriggerPolicy.js:51)=偽の変化が refresh を起こす。コメビュは `/lv\d{1,15}/` で追従(comeview:2381-2384) |
| クラウド: popup が疑似 lv を `nls_last_watch_url` に書く | **正**(P:15031-15042・source activeTab/lastFocusedNormal のとき)。shim の `realLocal.set` 横取り(S:841)は mirror だけ直し、この漏れは塞いでいない |
| クラウド: `windows.getLastFocused` は写していない | **正**(wrap は tabs.query/get のみ S:888-889) |
| クラウド: `venue-inline-entry.js` は 7 サービス全部の上の枠に入っている | **正**(manifest・`dist/yt-venue-inline.js`・all_frames:false)。1秒おき `sync()` が `location.href` を見る |
| クラウド: 仮キーでも送信が届く | **正**(BG:277 `relayToChatFrame` は `loginOfStreamKey` でタブを探す) |
| 旧 SPEC の wiring 案「shim に `location.reload(` が無いことを固定」 | **誤**。S:1145 に孤児リロードの `location.reload()` が既にある。固定するのは `frontWatchKey`/`reloadIfWordingPlatformChanged` の不在 |
| PC: 「配信がありません」(docs/plan-empty-state-no-broadcast.md:34) | その行はニコ生版の「source=storage/none → 空にする」規則の説明。拡張の画面にこの文言は無い(あるのは別ページの「表示できる配信がありません」) |
| staged の 0.1.1946 候補 | `/mnt/project-files/platform-panel/candidate-0.1.1946.patch` と同一(22ファイル) |

---

## 3. 2つの案の比較と採否

| 論点 | クラウド案 | PC 案 | **採否と理由** |
|---|---|---|---|
| どこで決めるか | 層 A(boot)が前面タブの配信キーを src に焼く+層 C を本物にする | BG が YT_STREAM_META の `sender.tab.id` で対応表(storage.session)→パネルの resolver | **クラウド**。ニコ生版に存在する部品の流用(車輪の再発明をしない)。PC 案は層 A+B+C を BG と resolver で作り直す。PC 自身が挙げる地雷(META は sender 無しでも来る・session は再起動で空・SW 起動待ち・90秒の stale)はニコ生版の層には無い問題 |
| (a) 文言の元文保持(PC C-4)・単一値リセット | iframe 読み込み直しで不要 | 版2で必要 | **クラウド(原則不要)**。boot の配信キーが変われば iframe ごと新品=shim のモジュール変数も DOM の文も全部まっさら。残る隙は「前面が配信以外のとき、層 B が別サービスの配信を選ぶ」1ケースだけ(ニコ生版にも同じ中身の乗り換えはあるが文言はサービス非依存)。これは計器 `contentPlatformMismatch`(§6)で**数を見てから**判断し、0 でなければ条件付きフェーズ(§7 最終行)で C-4 の最小形だけ入れる。先回りで作らない |
| (b) URL だけのチャンネルキーは live/終了・過去配信を区別できない。BG 対応表は要るか | ページが `yt_last_stream_url` を書く。キーは読むときに引き当て | 対応表 `{key,url,live,at}`・ended→none | **クラウド+補強**。選択に live は要らない: ニコ生版も終了済み watch ページを前面にすればその記録を出す(振り返りが本来の用途)。「どの過去配信か」は今と同じ `newestKeyForChannel`(そのチャンネルの最新記録)で決め、部屋が配信を始めた瞬間は C2 の「引き当て変化で1回配る」で追従。`live` は summaries の `endedAt` から導ける(正本は1つ・記憶に複製しない=PC 自身の「SW が ended を落とすと永久 live」地雷を避ける)。`yt_last_stream_url` は `{url, key, at}`(key は診断用・読むときは url から引き直す) |
| (c) 探り読み遮断(PC C-3) | 言及なし | comments キーが2 lv 以上なら答えず lastAskedLv も触らない | **PC の薄い形を採用(層 C の後)**。仮キーで前面の配信タブは常に写るので探り読みは「前面が配信以外」のときだけ走る(ニコ生版と同じ条件)。しかし YT 系では探り読みが (1) 全タブの全件を IndexedDB から組む(2.8秒超で空振り) (2) `lastAskedLv` を最後のタブに書き換え、画面の中身は変わらないのに言葉のサービスが変わる、の2つの副作用を持つ。ニコ生版の探り読みは 3キー/lv の軽い get で副作用が無い。よって「探り読みの形(1回の get に comments キーが2 lv 以上)のときは lastAskedLv を触らず・全件も組まず・答えない」。答えないぶん dataBacked は YT 系で効かなくなるが、層 C 後は storage 経路が正しい値を持つので最後の手段として足りる(今までの dataBacked は newest=YouTube を選ぶ誤答経路だった) |
| (d) 空の状態 | 仮キーで「記録 0」 | 「配信がありません」(ended / 表に無い → none) | **クラウド**。ニコ生版の空状態は「watch URL が1つも取れない(source=none)」のときだけ(§2)。チャンネルページに専用の空画面を足すのはニコ生版に無い振る舞いの追加。仮キーは boot/層 B に渡す値が無い問題の正しい手当てで、送信・撮影も届く。ただし「記録 0 なのに配信者名が YouTube」(PC D 未確認)にならないよう、仮キーの配信者情報は URL の login から出し newest に倒さない(計器 `placeholder.broadcasterFrom`) |
| (e) フェーズ順 | 0 計器+仮キー → 1 層A → 2 層C → 3 層B | 版1 対応表+resolver+計器 → 版2 文言 → 版3 鏡 → 版4 content 共通化 | **計器だけを 1946 に単独で**(1946 候補は仮キーと計器を1版に混ぜている=「1変更=patch 1つ」違反)。以降 仮キー → 層C(真因の根) → 層A → 探り読み → 層B。層 C を A より先にするのは MAP §0 のとおり根が C で、A は言葉の掃除。詳細 §7 |
| 計器 | shim 内 `yt_diag_panel_stream` | `yt_diag_panel_target_v1`(kind・tabsQuery 時間・probeSkipped 等) | **両方の和集合**(§6)。PC の `tabsQuery.slowOver1100ms`・`probeSkipped`・`windowMismatch` は仮説 H-a/H-c の裏取りに要る |
| 1946 候補の shim 追加分(`frontWatchKey`・`reloadIfWordingPlatformChanged`・`lastAnnouncedWatchUrl`・`frontKeyCache`) | 捨てる | (言及なし) | **捨てる**。層 A/B/C の再実装。残すのは streamPlatform.js の仮キー2関数+test と `streamKeyForWatchUrl` の fallback |

---

## 4. 部品の境界

### A1. `src/lib/youtube/ytPanelRoute.js`(純関数・変更)
- `ytPanelStreamKeyOfUrl(url) → 'yt:<videoId>' | '<platform.id>:<login>' | ''`。YouTube は `isYtWatchLikeUrl`+`parseYtVideoIdFromUrl`(ytPageMeta.js)、6サービスは `platformChannelOfUrl`(streamPlatform.js)。配信ページ以外(YouTube ホーム・Twitch 一覧)は `''`。
  **チャンネル単位**のキーにする(boot は summaries を知らないので配信番号は引けない。同じチャンネルで次の配信が始まっても iframe は作り直さず、中身は層 B/C が追う)。
- `buildYtPanelSrc(key) → 'yt-sidepanel.html?inline=1&dock=sidepanel&stream=<encodeURIComponent(key)>'`・`readYtPanelStreamKey(src)`(`readSidePanelLv` と同じ型)。`YT_PANEL_SRC` は key='' の形として残す。
- `isYtPanelTabUrl` = `ytPanelStreamKeyOfUrl(url) !== ''`(ホスト一致→配信ページ一致。手書き正規表現は削除)。`ytPanelRoute.test.js` の配線固定文2行(`return YT_PANEL_SRC;`・`loader.update(YT_PANEL_SRC)`)は新しい形に書き直す。
- 束の注意: boot(`dist/sidepanel-iframe-boot.js` 4.8KB)が streamPlatform.js の parse 群を抱える。`sidepanel-first-byte-paint.spec.js` で測り、30KB 超なら `channelFromUrl` 群だけの軽い入口を切る(測ってから)。

### A2. `src/extension/sidepanel-iframe-boot-entry.js`(極小のまま)
- `pickSrc`: `const k = ytPanelStreamKeyOfUrl(activeUrl); if (k) return buildYtPanelSrc(k);`。ニコ生 watch タブが無く YT 系の配信タブが**ちょうど1つ**なら `pickLvFromTabs` と同じ決まりでそれ(複数なら選ばない)。問い合わせは `STREAM_PLATFORM_TAB_URLS`+YouTube watch/live 形の**別定数**(`SIDE_PANEL_WATCH_TAB_QUERY` は無改変=wiring テストの固定文を守る)。
- `follow(tab)`: `const k = ytPanelStreamKeyOfUrl(tab.url); if (k) { if (k !== readYtPanelStreamKey(ifr.src)) loader.update(buildYtPanelSrc(k)); return; }`。以降のニコ生の行(`if (!lv || lv === shownLv()) return;` 等)は無改変。
- 描画・状態・storage に触れない掟はそのまま。boot の判断の証拠は iframe の `src` 属性(e2e で読む)。

### A3. shim 起動部(ytNicoShim.js「1. 起動モード」S:76-88)
- `stream` を読み `panelStreamKey` に持つ。`screenPlatformBase()` の最初の描画は `lastAskedLv ? … : platformOfPanelStreamKey(panelStreamKey)`。`newestVideoIdOf(knownSummaries)` への依存を外す。
- popup の `INLINE_OWN_WATCH_URL` には流さない(ニコ生版サイドパネルでも `?lv=` は popup に読まれない=P:1063-1073・完全コピー)。

### C1. `extension-youtube/src/pfLastStreamUrl.js`(新設・content script 用の共通部品1つ)
- `content-entry.js:10556-10578 rememberWatchPageUrl` の**完全コピー**: URL が変わったとき/前面に来たとき(focus・visibilitychange→visible)だけ 400ms 後に書く。同じ URL は force 以外書き直さない。
- 書く先 **`yt_last_stream_url` = `{ url, key, at }`**(新キー)。`nls_last_watch_url` には書かない(ニコ生側は URL 全体を `/lv\d{1,15}/` で緩く探すので videoId に `lv123` が混ざると偽 lv を拾い得る)。
- 起動は `venue-inline-entry.js` の `sync()` 内1か所(7サービス共通・manifest 無改変)。`currentVideoId()` が '' なら書かない。`isExtensionContextAlive` で切れていたら何もしない。

### C2. shim の翻訳(「chrome の差し替え」部)
- `shimGet(nls_last_watch_url)`: `yt_last_stream_url.url` → `streamKeyForWatchUrl`(仮キー fallback 込み)→ `https://live.nicovideo.jp/watch/<疑似 lv>`。無いとき(一度もページが書いていない初回)だけ `newestVideoIdOf`(計器 `source:'newest'`)。
- `onChanged`: 本物の `yt_last_stream_url` の変化を `nls_last_watch_url` の変化に翻訳して配る。`yt_stream_summaries` の変化では配らない(C' 撤去)。例外1つ: いまの `yt_last_stream_url.url` の引き当て(仮キー→本物/新しい配信番号)が summaries の変化で変わったときだけ翻訳 URL を配る(`reason:'resolve'`)。同じ lv は続けて配らない。
- `realLocal.set` 横取りに1つ足す: popup が `nls_last_watch_url` に疑似 lv URL を書こうとしたら `watchUrlForStreamKey` で本物 URL に戻し `yt_last_stream_url` へ向け直す(既存の漏れを塞ぐ)。
- 層 B(別フェーズ): `real.windows.getLastFocused` を `wrapTabsFn` と同じ型で包み `tabs[]` を `mapTab`。

### C3. 探り読みの副作用止め(shimGet・別フェーズ)
- 1回の get の key 一覧に `nls_comments_` が**2 lv 以上**=探り読み。そのときは `lastAskedLv` を更新せず・`buildCommentsForLv` も呼ばず・comments キーは答えない(undefined のまま)。計器 `probe.skipped`。popup 自身の読み(P:8312/15438)は1 lv ずつなので影響しない(wiring テストで固定)。

---

## 5. 状態遷移(前面タブ → boot / 中身(層 B) / 記憶(層 C) / コメビュ)

| # | 操作 | boot(src の stream) | 中身 | 記憶 `yt_last_stream_url` | コメビュ |
|---|---|---|---|---|---|
| 1 | YouTube → Kick(両方記録あり) | `yt:V`→`kick:slug` で読み込み直し(言葉もまっさら) | activeTab(写し)=Kick | Kick ページが focus で書く | 翻訳された変化で Kick へ |
| 2 | Kick → メール等 → Kick | 配信以外では保つ。戻っても同じキーなら何もしない | activeTab 無し→(探り読みは答えない)→lastFocused(写し・配信以外)→storage=Kick | 戻ったとき force で書き直し | 変化なし(同じ lv は配らない) |
| 3 | 記録の無い SHOWROOM の部屋 | `showroom:room` で読み込み直し | activeTab=仮キー `sr.room.00000`→「記録 0」・配信者は URL の login から | 書く | 仮キーの lv |
| 3' | その部屋が配信を始める | 変化なし(チャンネル単位) | 次の refresh で写しが本物のキーに | 変化なし | `reason:'resolve'` の1回で本物の lv へ |
| 4 | 2ウィンドウ(A=YouTube・B=Twitch) | 各パネルは自窓の前面だけ(`ownWindowId`) | `currentWindow` で各々 | 最後に focus したページが勝つ(ニコ生版と同じ) | 最後に focus した方 |
| 5 | ニコ生 lv1 → YouTube V → lv1 | `lv1`→`yt:V`→`lv1`(ニコ生の行は無改変) | 各版の既存経路 | ニコ生は `nls_last_watch_url`・YT は `yt_last_stream_url`(別の引き出し) | 各版が自分の引き出しだけ見る |
| 6 | 初回で記憶が空 | 前面が配信なら boot が決める | activeTab 優先。記憶は newest(最後の手段・計器に出る) | 最初の focus で埋まる | newest(初回だけ) |

---

## 6. 計器(フェーズ 0・shim 内 `shimDiag` → storage `yt_diag_panel_stream`・`yt_diag_live_rows` と同じ 10 秒間引き書き)

| 項目 | 何を測るか(直す前に出るはずの値 → 直った後の値) |
|---|---|
| `lastWatch {source:'page'|'newest'|'none', url, key, lv, at}` | 直す前は常に `newest` → 直った後 `page` 100% |
| `askedLvHistory[≤10] {at, lv, probe}` | 前面 Kick のまま Kick→YouTube→Kick と動く(「一瞬変わって戻る」が数で見える)→ 前面が変わらない間は1種類 |
| `announceHistory[≤10] {at, lv, reason:'summaries'|'page'|'resolve'}` | `summaries` が asked の反転の直前にある → `summaries` = 0 |
| `popupLastWatchWrites {count, last}` | 0 より大(疑似 lv の漏れの実証)→ 向け直し後 `nls_last_watch_url` の実値に `lv9…` が入らない |
| `activeQuery[≤5] {at, host, mapped, key, ms}` + `tabsQuery {calls, slowOver1100ms, emptyActive}` | MAP §4-2(パネル操作中も配信タブが返るか)と PC 仮説 H-a(1200ms 超で tabs=[])の裏取り。`mapped:false` が SHOWROOM/mixch/TikTok で出れば `channelFromUrl` の形の不一致 |
| `probe {calls, lvs, skipped, buildMs}` | 探り読みの回数と全件組み立ての時間(C3 の必要性の実証)|
| `lastFocused {calls, mismatchWindow}` | PC 仮説 H-c(別窓) |
| `placeholder {shown, broadcasterFrom:'login'|'newest'}` | 「記録 0 なのに配信者が YouTube」が出ていないか |
| `panelStreamKey` / `contentPlatformMismatch` | 層 A 以降。src の stream のサービスと `lastAskedLv` のサービスが食い違った回数(§3-a の判断材料) |

**合格の数**(PC 実機・7サービスを順に前面にして各 30 秒): `askedLvHistory` の lv の種類数 = 切替回数+1・`announce(summaries)` = 0・`source:'newest'` = 0・
iframe src の付け替え回数 = サービス切替回数・`contentPlatformMismatch` = 0・`nls_last_watch_url` の実値に `lv9` 無し。`npm run status:live` で司令塔が読む(りんくに見え方を聞かない)。

---

## 7. フェーズ(1フェーズ = patch 1つ・`npm run verify:bump`・各フェーズで `test:cc`→`typecheck`→`verify:cc`→`verify:extension`→§6 の数)

| 版 | 内容 | テスト・固定 | 戻し方 |
|---|---|---|---|
| **0 / 0.1.1946** | **計器だけ**(§6)。staged 候補のうち shim の `frontWatchKey`/`reloadIfWordingPlatformChanged`/`lastAnnouncedWatchUrl`/`frontKeyCache` と仮キーは**入れない**(dist は再生成)。changelog「横の欄がどの配信を出したかを診断に記録」 | wiring: `ytNicoShim.js` に `frontWatchKey`・`reloadIfWordingPlatformChanged` が無い。既存 7 本 `*-recording.spec.js` 緑。PC 実機で §6 の「直す前の値」を取る(真因の確証) | この版だけ revert |
| **1 / 0.1.1947** | 仮キー: streamPlatform.js の `placeholderStreamKeyForChannel`/`isPlaceholderStreamKey`+`streamKeyForWatchUrl` の fallback(候補から残す部分)。配信者情報は login から | unit: 候補の `streamPlatform.reload.test.js` 追加分+TikTok(`@名前.名前`)/SHOWROOM の往復。計器 `placeholder.broadcasterFrom` = `login` | この版だけ revert(旧挙動に戻るだけ) |
| **2 / 0.1.1948** | 層 C(§4-C1・C2): ページが書く・shim が翻訳・C' 撤去・popup の疑似 lv 書き込みの向け直し | unit: 翻訳(本物 URL→疑似 lv URL・同じ lv は配らない・引き当て変化で1回)。wiring: manifest の 7 サービスに `dist/yt-venue-inline.js`・shim から `newestVideoIdOf(next)` の announce が消えている。e2e: 既存 7 本に「読み込み後 `yt_last_stream_url.url` がそのページ」を1行ずつ。ニコ生 `comment-post`/`multitab-*`/`popup-multitab-empty-dash-rescue` 緑 | この版だけ revert → 推測に戻る |
| **3 / 0.1.1949** | 層 A(§4-A1〜A3): boot が配信キーを src に焼き、キーが変われば読み込み直す。`isYtPanelTabUrl` を配信ページ一致へ(YouTube トップでは前の配信を保つ=意図した変更・changelog に1行) | unit: `ytPanelRoute.test.js` に 7 サービスのキー・非配信ページ `''`・`build/read` 往復・encode。wiring: `sidePanelLvWiring.wiring.test.js` のニコ生の固定文が全部そのまま緑+「boot が `ytPanelStreamKeyOfUrl` で比較し `loader.update(buildYtPanelSrc` を呼ぶ」。e2e 新規 `sidepanel-stream-follow.spec.js`(`sidepanel.html` を開き偽 Kick/SHOWROOM 2タブで iframe src が切替で変わり配信以外で変わらない)+`sidepanel-first-byte-paint.spec.js`(束のサイズ) | この版だけ revert → src 固定に戻る(層 C は生きる) |
| **4 / 0.1.1950** | 探り読みの副作用止め(§4-C3) | unit: 2 lv 以上の get で `lastAskedLv` 不変・答えない・1 lv なら従来どおり。計器 `probe.skipped` > 0・`askedLvHistory` に `probe:true` が出ない | この版だけ revert |
| **5 / 0.1.1951** | 層 B の写し漏れ(`windows.getLastFocused` を mapTab)+旧 `isYtPanelTabUrl` の名残・コメント整理+`docs/repo-tree-map` の `FEATURES` に「横の欄の配信選び」 | unit: 写しの往復。`npm run tree-map`・`verify:cc` 緑 | この版だけ revert |
| **(条件付き) 6** | `contentPlatformMismatch` が実機で 0 でないときだけ: 文言の元文保持の最小形(Text ノードに置換前の文を控えて引き直す=PC C-4 の縮小)。0 なら作らない | 計器の数が条件 | — |

`copy:ext` は配信視聴中にしない(§12.5)。反映は司令塔が `reload_extension` まで行う。

---

## 8. リスク(ニコ生版が壊れ得る所)と手当て

| リスク | 手当て |
|---|---|
| boot の束が大きくなり最初の描画が遅れる | フェーズ 3 で `sidepanel-first-byte-paint.spec.js` を測る。30KB 超なら軽い入口 |
| boot のニコ生の行を触る | 変更は YT 系の early-return だけ。wiring テストの固定文がそのまま緑 |
| `isYtPanelTabUrl` の意味変更で YouTube トップでは YT 版に切替わらない | ニコ生版の「配信以外では保つ」への統一=意図した変更。changelog に1行 |
| `yt_last_stream_url` を `status-entry.js`/`watchUrlFreshness.js` が知らない | 既存どおり(今も YT 系の記憶はニコ生の引き出しに正しく入っていない)。疑似 lv の混入が止まる分だけ良くなる |
| venue-inline に書き手を足し会場のタイマーと競合 | 400ms デバウンスの1キー・try/catch・DOM に触れない |
| C' 撤去で配信開始の瞬間に追従しない | C2 の `reason:'resolve'` で担保・unit で固定 |
| 探り読みを答えないことで YT 系の dataBacked が効かない | 層 C 後は storage 経路が正しい。計器 `source` の内訳で `dataBacked` が必要だった実例が出たら再検討(先回りしない) |
| 探り読みの形の誤判定(popup 自身が 2 lv 以上を1回で聞く経路) | grep 済み(P:8312/15438/16681 のうち複数 lv は 16681 の探り読みだけ)。wiring テストで固定 |
| 計器の書き込みが描き直しを誘発 | `yt_diag_live_rows` と同じ経路(10 秒間引き・`nls_` でないキー) |

---

## 9. 三視点の批判と答え(要点)

- **実装者**「層 C の前に層 A を入れた方が見た目の効果が早い」→ 根は C(MAP §0)。A を先にすると iframe 作り直しが C' の症状を隠し、計器の「直す前の値」が取れなくなる。
- **実装者**「MAP §4-2 が偽(パネル操作中に `tabs.query` が配信タブを返さない)なら層 B は空振り」→ フェーズ 0 の `activeQuery` で測る。偽なら boot の `stream` を popup の `INLINE_OWN_WATCH_URL` に流す案をフェーズ 3.5 として別 Plan(ニコ生側に触るので)。
- **テスター**「PC 実機でしか再現しない」→ だから計器が 0 版。合否は §6 の数。e2e は `sidepanel.html`(外枠)を開いて iframe src を読む。
- **利用者**「YouTube トップで横の欄が変わらなくなる」→ ニコ生でもトップでは前の配信を保つ。配信ページを開けば即その配信。「部屋が配信を始めたら勝手に変わる?」→ 変わる(前面の部屋なので意図どおり)。「また『できたはず』で終わらない?」→ §6 の数を司令塔が `status:live` で読む。りんくの作業は無い。
