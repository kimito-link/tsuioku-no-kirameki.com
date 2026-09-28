# /live/ 発言カードの初回表示遅延(4〜10秒)を高速化する設計(council-fable手順2・4回目)

> 設計=Fable(claude-fable-5-1) / 素材集め=無料会議(5体)+ラテラルシンキング(司令塔) /
> 裏取り=司令塔(Sonnet 5) / 2026-09-28
>
> council-fableワークフロー3段構えの手順2の成果物(4回目)。1〜3回目の設計
> ([`live-comment-motion-DESIGN.md`](live-comment-motion-DESIGN.md)・
> [`live-gift-pulse-DESIGN.md`](live-gift-pulse-DESIGN.md)・
> [`live-lane-buckets-DESIGN.md`](live-lane-buckets-DESIGN.md))とは独立した設計。

## 背景・経緯

1. ユーザーが`/live/`の「サムネ付きで応援した人」等の名前にホバーした際に出る
   「直近発言カード」の表示が遅い(未キャッシュ時、実測で4.4秒〜10秒)ことに不満を
   示し、「すぐ出るようにしてほしい」と要望した。
2. 司令塔が一次情報(NdgrClientSharp・Discord API・Vercel公式ドキュメント)を調査した
   結果、NDGRのbackwardポインタは前のレスポンスを読まないと次のURLが分からない
   依存連鎖構造であり、**並列化による高速化は技術的に成立しない**と確定した。
3. ユーザーからの「ラテラルシンキングも使って」という指示を受け、司令塔が3つの発想
   (A: 既存のtallyジョブに本文取得を相乗り、B: 統計情報での穴埋め表示、
   C: 待つ基準自体を疑う)を洗い出し、会議に投入した。
4. 会議(5体)は先読み対象の小幅拡大とタイムアウト短縮を提案したが、Fableが
   「上位3×2人への拡大は実質no-op」「タイムアウト短縮は本文欠落を増やすだけ」と
   看破し、代わりに**既存の実装バグ(202応答の再試行なし)**を発見した。

## 確定した技術的事実(変更しない)

- NDGRのbackward巡回は構造的に直列(公式に近いC#クライアントNdgrClientSharpも同様の
  設計)。並列fetchによる高速化は不成立。
- 視聴WS握手の無差別増加禁止(BAN回避)。新しいAPIエンドポイント・新しいインフラは
  追加しない。
- コメント本文は保存しない(privacy §14-1:725「マウスを乗せる等の操作をしたときに
  限り」)。ただし来場者数・コメント数・ギフト/広告ポイント等の**集計値**は既に
  OG画像等で公開している(privacy §14-3:730)。

## A. 理想の体験フロー

閲覧者が`/live/`を開くと、いまも通り上位3配信の発言キャッシュが裏で温まる。気になる
配信カードにマウスを持っていき、レーン(サムネ付き／名前／ギフト／匿名)を眺めている
数百ミリ秒の間に、そのカードの配信ぶんの発言取得が裏で始まっている。名前に乗せた
瞬間、ページ内キャッシュに届いていればカードは即座に発言5件を出す。まだ届いて
いなければスケルトン(既存)が出るが、「取得中の別リクエストが進んでいる」状態(202)
でも骨格が固まったままにならず、届いた瞬間に差し替わる。同じ配信の別の人へ移れば
待ちはゼロ。カードが出ない・固まる・4秒黙る、の3つが消える。速くなる正体は「巡回
そのものの短縮」ではなく「巡回をマウスが名前へ届く前に始める」ことであり、直行
ホバー(カードに入って即名前)の初回だけは従来どおり最長4.4秒待つ。この1点は
正直に残す。

## B. 統合アーキ

変更はクライアント1ファイル+サーバ1ファイルの定数・引数レベル。新エンドポイント・
新インフラ・Redisへの本文保存はなし。

| 層 | ファイル | 現状(裏取り済み) | 変更 |
|---|---|---|---|
| 表示 | `src/lib/liveRecentHoverCard.js` | 6状態の純関数。loading=スケルトン | 変更なし(任意でloadingに件数1行、C-5) |
| 画面 | `src/extension/live-ranking-entry.js` | `prewarmRecent`(372-399)が上位3配信×rankers[0]を逐次POST・**応答は捨てる**。`requestRecent`(490-526)が250ms後にPOST。**515行: 202を受けたらloadingを出してreturn=再試行なし**(司令塔が実在確認済みのバグ)。`_recentCache`(436)はlv単位60秒 | ①202再試行 ②先読み応答を`_recentCache`に入れる ③配信カード滞留(dwell)先読み ④`<section class="live">`に`data-lv` |
| API | `api/live-recent-comments.js` | HTML 2500ms + WS 2500ms + crawl `elapsedMs:4000`(44,48,49行)。cacheはlv単位60秒(199-203)。lockはRedis `SET NX EX 10`(212-222)。`targetUidsFor`(92-110)がrankers≤10を**毎回まとめて**対象にする | ⑤crawlに硬い締め切り`signal`を渡す(elapsedMsは4000のまま) |
| 巡回 | `src/lib/ndgrBackfillCrawl.js` | `ctx = { fetchBinary, sleep, signal, gapMs }`(1171)。`cap_elapsed`はfetchの**合間**にしか判定しない(1182) | 変更なし(呼び出し側がsignalを渡すだけ) |
| I/O | `src/server/nicoliveGuest.js` | `startWatching` 1通のみ・pong/keepSeat無し・即close(53-55)。UAに連絡先(23) | 変更なし |

データの流れ(変更後): `mouseover(section.live)` →400ms滞留→ `fetchRecent(lv,
rankers[0])` → 応答を`_recentCache.set(lv)` → `mouseover(li[data-uid])` →250ms→
`_recentCache` hitなら0ms描画 / missならPOST → 202なら800msごとに再POST(ホバー
継続中のみ・最大12回≒lock TTL 10秒) → ok。

## C. 具体機構

### C-1. 202の再試行(必須の下地・既存バグの修正)

`requestRecent` 515行の`if (resp.status === 202) { showCardFor(li, loading);
return; }`を、ホバー継続中に限り再試行する形へ(司令塔が実在確認済みのバグ)。

```js
const RECENT_RETRY_MS = 800;   // lock TTL 10s(サーバ34行)を12回で使い切る
const RECENT_RETRY_MAX = 12;
async function requestRecent(li, lv, uid, attempt = 0) {
  ...
  if (resp.status === 202) {
    if (attempt >= RECENT_RETRY_MAX) { showCardFor(li, buildRecentCardHtml({ phase: 'error' })); return; }
    showCardFor(li, buildRecentCardHtml({ phase: 'loading' }));
    _hoverTimer = setTimeout(() => { if (_hoverLi === li) requestRecent(li, lv, uid, attempt + 1); }, RECENT_RETRY_MS);
    return;
  }
```

`hideCard()`(479-484)が`_hoverTimer`をclearするので、離れれば再試行も止まる
(既存の仕組みに乗る・新しい状態を増やさない)。これが無いとC-3は「先読み中に
ホバー→202→骨格が永久に固まる」を**増やす**方向に働く。順序はC-1→C-3で固定。

### C-2. 先読みの応答をページ内キャッシュへ入れる

`prewarmRecent` 390-395行は応答を捨てている。fetchと`_recentCache.set`を1本の
関数`fetchRecentInto(lv, uid, signal)`に寄せ、`requestRecent`と`prewarmRecent`の
両方がそれを呼ぶ(書く場所を1つに)。効果: 先読み済み配信のホバーはネットワーク往復
ゼロ(実測0.1〜0.3秒→0)。副次効果として、Vercelの**別インスタンスにルーティング
されてメモリキャッシュが外れる**ケース(G-1)を同一閲覧者については吸収する。

### C-3. 配信カード滞留(dwell)先読み ★本命

- `render()` 286行`'<section class="live">'` → `` `<section class="live"
  data-lv="${esc(l.liveId)}">` ``。
- `elList`への委譲(542行と同じ流儀・renderの外で1回)。

```js
const PREWARM_DWELL_MS = 400;
const PREWARM_TTL_MS = 60000;        // サーバ側キャッシュ(36行)と同じ
/** @type {Map<string, number>} lv → 先読みを投げた時刻 */
const _prewarmedAt = new Map();
let _dwellTimer = null, _dwellSection = null, _prewarmBusy = false;

elList.addEventListener('mouseover', (ev) => {
  const sec = ev.target.closest('section.live[data-lv]');
  if (!sec || sec === _dwellSection) return;
  if (_dwellTimer) clearTimeout(_dwellTimer);
  _dwellSection = sec;
  const lv = sec.getAttribute('data-lv');
  _dwellTimer = setTimeout(() => prewarmOne(lv), PREWARM_DWELL_MS);
});
elList.addEventListener('mouseout', (ev) => {
  if (_dwellSection && !_dwellSection.contains(ev.relatedTarget)) {
    clearTimeout(_dwellTimer); _dwellTimer = null; _dwellSection = null;
  }
});
async function prewarmOne(lv) {
  const c = _recentCache.get(lv);
  if (c && Date.now() - c.at < HOVER_CACHE_TTL_MS) return;           // もう持っている
  const at = _prewarmedAt.get(lv);
  if (at && Date.now() - at < PREWARM_TTL_MS) return;                 // 60秒以内に投げた
  if (_prewarmBusy) return;                                           // 同時1本(Hobbyの同時実行を圧迫しない)
  const uid = firstRankerUidOf(lv);                                   // 直近renderのdataからrankers[0]
  if (!uid) return;
  _prewarmedAt.set(lv, Date.now()); _prewarmBusy = true;
  try { await fetchRecentInto(lv, uid, null); } catch {} finally { _prewarmBusy = false; }
}
```

- `firstRankerUidOf(lv)`は`load()`で受けた最新`data.lives`を`_lastData`に保持して
  引く(render済みのものと同じ源)。
- 既存のページ開封時先読み(上位3)は**そのまま**。両者は`_prewarmedAt`/
  `_recentCache`を共有し二重発火しない。
- 握手の上限(裏取り): サーバ側はlv単位の60秒キャッシュ+10秒lockなので、**1配信
  あたり1分に1握手**が天井(温かい同一インスタンス内)。ページに載る配信は
  `MAX_LIVES = 20`(`api/live-ranking.js:75`。司令塔が実在確認済み)。したがって
  閲覧者が何人いても何回ホバーしても、この機能が起こす握手はサイト全体で
  **≤20本/分**(インスタンス跨ぎで最大2倍程度・G-1)。tallyジョブ
  (`scripts/live-comment-tally.mjs`)が各配信へ約10分ごとに握手している既存負荷と
  比べても桁は同じ。会議の「上位5配信が7割」のような数値は不要で、この**天井の式**
  で安全側の判定ができる。dwellは「閲覧者が注意を向けた配信」だけを対象にするので、
  privacy.html 725行の「名前にマウスを乗せる等の操作をしたときに限り」の範囲内
  (G-7)。

### C-4. crawlに硬い締め切りを渡す(サーバ・定数は変えない)

`api/live-recent-comments.js` 129-135行の`crawlNdgrBackward({...})`に
`signal: AbortSignal.timeout(RECENT_CRAWL_CAPS.elapsedMs + 500)`を追加。根拠:
`cap_elapsed`はfetchの合間にしか見ない(1182行)ため、3.99秒で始まった区画fetchは
`RECENT_HTTP_TIMEOUT_MS=2500`まで走れる。最悪HTML 2500 + WS 2500 + crawl(4000+2500)
= **11.5秒**で、コードが前提にしている10秒予算(32・43・47行のコメント、
`vercel.json`にmaxDuration指定なし)を超える。ユーザー実測の「10秒」はこの経路
(関数タイムアウト→`!resp.ok`→errorカード)か202固着(C-1)のどちらかで説明がつく。
★要確認: `crawlNdgrBackward`のオプション名が`signal`であること(1171行の`ctx`に
`signal`を渡しているのは確認済み・関数シグネチャの受け口は実装前にRead)と、
`fetchWithThrottle`が`ctx.signal`を`fetchBinary`の第2引数へ渡していること
(`fetchBinary` 77行は`o?.signal`を受ける準備がある)。

### C-5. 楽観的表示は「スケルトンの見出し1行」までなら採用可(低優先・任意)

`buildRecentCardHtml({ phase: 'loading', count })`で「💬 N件・直近の発言を取得中…」
を骨格の上に1行。`count`は行の`.pt`(147行)/タイルの`.tpt`(79行)に**既に出ている数**
なので、新規取得ゼロ・privacy影響ゼロ。ただし高速化ではない(D参照)。テストは
`liveRecentHoverCard.test.js`に1ケース足すだけ。

### 不採用(会議案の扱い)

- 「上位3×上位2人」: **効果ゼロ(no-op)**。`targetUidsFor`がrankers≤10を毎回まとめて
  対象にし、キャッシュ鍵はlvなので、同じlvへの2本目のPOSTはキャッシュhitか202を
  返すだけ。握手も増えないが速くもならない。
- `elapsedMs 4000→2000`: 典型ケースは`reached()`(124-127行=**対象全員が5件たまる**)
  が満たされずcapまで走るので、2000にすると得られる本文が半減し「見当たりません
  でした」が増える。予算超過の懸念はC-4で解く。
- 「2件未満ならスケルトン継続」: サーバは応答後に巡回を続けられない(waitUntil相当
  はnpm依存ゼロ方針・16行に反する)うえ、部分結果は60秒キャッシュされるので再要求
  しても同じ部分結果が返る。閾値の数字以前に、キャッシュ構造と噛み合わない。

## D. 会議の「発想B却下」判定への再検証結果(★必須)

**混同は実際に起きていた。** 発想Bが出そうとした値は次の3種で、いずれもコメント
本文ではない。
- 配信単位: `.stats`の👥来場 / 💬コメント / 🎁ギフト / 📣広告
  (`live-ranking-entry.js:289-292`)= `/api/live-ranking`の60秒GETで既に描画済み。
- 人単位: 行の`N件`/`pt`(147行)・タイルの`🎁/📣/💬`(`liveLaneBuckets.js:21-28`)=
  同じ応答のrankers.count / koken / nicoadから既に描画済み。
- privacy.html 725行が「保存しない」と約束しているのは「**直近の発言(最大5件・各
  80文字)の本文**」だけであり、730行は逆に「来場者数・コメント数・ギフト/広告
  ポイント」を**OG画像に焼いてSNSに出している**(=公開集計値として扱う方針が既に
  確定している)。
よって「本文保存の方針違反」を理由にした却下は**誤り**。

ただし**結論を「採用」へ覆すのも誤り**。理由は速度: プレースホルダーに出せるのは
マウスの真下に既に見えている数字で、ユーザーの不満「すぐ出るようにしてほしい」の
対象=**発言本文の初回到着時刻**は1ミリ秒も縮まない。したがって正しい判定は
「**却下理由は誤り(統計値と本文の混同)。ただし高速化施策ではないためMVPには含めず、
C-5の1行表示として任意採用**」。会議が"不採用"に至ったのは理由が間違っていただけで、
優先度の判断結果は偶然おおむね正しかった、という整理になる。

## E. MVP(1つだけ作るなら)

**C-1 + C-2 + C-3を1コミット(クライアントのみ・`live-ranking-entry.js` 1ファイル)**。
3つは分けられない: C-3は202を増やす→C-1が要る、C-3の応答を捨てると効果が半減→
C-2が要る。サーバのC-4は独立した2コミット目(1版ぶん・挙動不変で着地)。C-5は反応を
見てから。

期待値(正直に): 非上位3配信の**初回**ホバー = 4.4秒 −(カード滞留〜名前到達の
時間)。滞留1〜3秒なら体感1.5〜3.5秒。同じ配信の**2人目以降** = 0ms。上位3配信 =
従来どおり先読み済み(C-2で往復もゼロ)。直行ホバーの初回4.4秒は残る。

検証: (1) `npm run test:cc`(C-5を足した場合のみhoverCardテスト追加)。(2)
reality-checkerがchrome-devtoolsで`/live/`を開き、DevTools Networkをthrottling
なしで観察: カードに入って400ms後に`live-recent-comments` POSTが1本出る/同カード内
の別sectionへ動かしても60秒以内は2本目が出ない/名前ホバー時にPOSTが出ない
(キャッシュhit)ことを**リクエスト数で**確認する。(3) 先読み中に名前へホバーして
202 → 800ms後に再POST → okに差し替わることを確認(固まらない)。測定タブは測る前に
閉じる(MEMORY「測定タブ自身が症状を作る」)。

## F. 捨てた案と理由

| 案 | 捨てた理由 |
|---|---|
| 上位3×2人への先読み拡大 | no-op(C-3不採用欄) |
| 全配信(≤20)をページ開封時に先読み | 握手20本/閲覧者。privacy 725行「操作をしたときに限り」を張り詰めさせる。SYNTHESIS §5の「無差別先読み」禁止に該当 |
| elapsedMs 2000 + 部分返却閾値 | 本文が減る/応答後に続けられない/60秒キャッシュと矛盾 |
| 要求uidが5件たまったら巡回を早期終了 | そのlvのキャッシュが他9人ぶん欠けたまま60秒固定され、2人目のホバーが「見当たりません」の嘘になる。60秒に2回目の握手で埋めるのは35行「1番組60秒に1回」とprivacy文言に反する |
| 発言本文をRedis/tallyで温める | privacy §14・著作権(SYNTHESIS §5で決着済み・蒸し返さない) |
| `HOVER_DELAY_MS` 250→0 | 縮むのは0.25秒、行またぎでPOSTが乱れる。dwell先読みが入れば意味が薄い |
| 楽観的表示を"施策"として採用 | Dのとおり速度に寄与しない。1行表示(C-5)に格下げ |
| 新エンドポイント(SSE/ストリーミング返却) | 依頼の前提(新API禁止)。Vercel Node関数で本文をストリームすると60秒メモリ保持の説明が崩れる |

## G. 地雷と回避策

1. **Vercelの別インスタンス**: メモリキャッシュ(61行)はインスタンス内のみ。先読み
   がAで温まり、ホバーがBへ行くとBは冷えていて再巡回(=同じlvに60秒内で2本目の
   握手。lockは同時実行しか防がない)。→ C-2で同一閲覧者ぶんは吸収。構造的な残りは
   Redisに本文を置かない限り消えない(SYNTHESIS §4と同じトレードオフ・受容)。
   設計書に「≤20本/分の天井はインスタンス跨ぎで最大2倍程度」と正直に書く。
2. **202固着**(既存バグ・515行): 先読みがlockを握っている最長10秒の間に同lvを
   ホバーすると骨格が永久表示。C-1をC-3より**先に**入れる。
3. **予算超過11.5秒**(C-4): elapsedMsを弄らずsignalで切る。`AbortSignal.timeout`
   はNode 17.3+・VercelのNode 22前提(17行)で使える。
4. **render()が60秒ごとにinnerHTMLを全置換**(428-429行): sectionへのリスナー
   直付けは消える。委譲のみ・`data-lv`はrender内で付ける。`_dwellSection`は置換で
   古い要素を指すので、タイマー発火時は`sec.isConnected`を見て捨てる。
5. **スクロール通過で先読み乱発**: 400msの滞留タイマー+sectionを出たらclear+同時
   1本(`_prewarmBusy`)+lvごと60秒デデュープ。これで「ホイールで20カードを通過」
   しても0〜1本。
6. **タッチ端末**: mouseoverが来ないのでdwellもhoverも発火しない(現状と同じ)。
   改善対象外と明記。
7. **privacy文言との整合**: dwellは「等の操作」の範囲内。ページ開封時の全配信
   先読みへ広げるなら725行の文言改定が先に要る(=やらない理由)。文言は今回変えない。
8. **uidがbyUidに無い**: ホバー対象uidは全て`commentRows`(rankers≤10)由来
   (`liveLaneBuckets.js:39`)なので通常は含まれるが、約10分ごとの`COMMENTS_KEY`
   更新をまたぐと外れて「見当たりませんでした」(嘘寄り)になる。低頻度。直すなら
   `renderRecentCard`で`!(uid in rec.byUid)`を「集計が更新されました。もう一度
   乗せてください」に分ける(任意)。
9. **クライアント60秒とサーバ60秒のずれ**: クライアントは応答時刻から60秒、
   サーバは巡回時刻から60秒なので最長~120秒前の本文を見せうる。現状も同じ・許容。
   「（直近ぶんだけ）」注記は維持。
10. **計測の作法**: 1サンプルで判定しない。cold(先読み前)/warm(先読み後)/202経路
    の3つを各3回、リクエスト数と`performance.now()`差で記録。「速くなった気がする」
    は判定にしない。
