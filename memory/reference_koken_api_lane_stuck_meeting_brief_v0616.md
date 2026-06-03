# 会議依頼書(フルAI): API直叩きなのに北極星レーンが「問い合わせ中」で不安定(v0.1.616)

> ⚠️ フルAI活用会議の依頼書(正本)。司令塔(Claude Code)が**実機診断で真因を一点まで絞り込み済み**。
> Codex/サブエージェントは (1) 司令塔の確定事実を敵対的に検証し、(2) 最善の修正を設計+実装する。
> ブランチ `fix/koken-contrib-hidden-tab-stuck`(origin/master = e77980a = v0.1.615 ベース)。
> これは popup の北極星レーン制御=拡張本体寄りの縄張りだが、会議形式(多角検証)で進める。

## 0. ユーザーの一次要望(最重要・北極星)

スクショ実機(2代目ミュントゥ lv350672510・福引券目標の単発配信=イベント非参加):
- 「イベントランキング」「応援者ランキング」レーンが **「ニコニコの公式から、問い合わせ中だよ」** の
  りんく/こん太/たぬ姉キャラ案内を出したまま。
- 貢献度ランキング・ギフト履歴も「(取得中...)」がちらっと見える/描画が安定しない。
- **ユーザーの核心指摘**:「**API ちょくたたきなら、これ(問い合わせ中)を消すべきでは?**」
  「描画が安定しない」「APIちょくたたきなのにこれがちらっとみえてしまう」。

→ 目標: **API 直叩きで取れているデータは安定して出し、iframe scrape 時代の「問い合わせ中」
  キャラ案内を出さない。イベント非参加なら該当レーンは畳む(v0.1.615 の方針を完遂)。**

## 1. 確定した事実(実機診断 schema 1.2 ×3回 + koken API 実叩き。Codex は敵対的に検証せよ)

### 1.1 取得層(SW fetch / API)は完璧 ★確証済み
v0.1.616 で追加した `content.giftDiagnostics.externalFetchProbe`(観測)が3回連続で:
```
intervalTicks: 4, leaderRan: 4, leaderSkipped: 0   ← interval 回り・このタブがリーダー
kokenSent: 4, kokenLastOk: true, kokenLastStatus: 200, kokenLastRows: 73  ← koken 73件取得
nicoadSent: 4, nicoadLastOk: true, nicoadLastStatus: 200, nicoadLastRows: 10 ← 広告10件取得
nicoadFetchStatus: "ok"  ← never固定バグ(setAttribute未実装)も v0.1.616 で修正済み
```
- koken API を Claude-in-Chrome で実機直叩き → lv350672510 / lv350673796 とも **200 で満額**
  (SEM 250000, 名無し 90500, ... / ひろ 30900 ...)。**API もネットワークも SW fetch も健全。**
- 拡張エラーページに koken 例外は0件(唯一のエラーは「コメント送信 11.3秒」=別問題)。

### 1.2 popup は koken storage を正しく読めている ★確証済み
v0.1.616 で追加した `popup.northStarRenderProbe`(観測):
```
lastContribResolveRows: 73   ← popup が koken storage(nls_koken_api_contrib_<lv>)を73件読めた
contribResolveCalls: 8        ← resolve は8回呼ばれた
```
→ **storage 書込成功・読込成功・liveId 一致すべて OK。** 「書込失敗」「liveId 不一致」「別storage」
  はすべて棄却。

### 1.3 真因A: `refreshAllNorthStarMirrorLanes` が一度も完了しない ★最重要
同 `northStarRenderProbe`:
```
refreshAllStarted: 4, refreshAllCompleted: 0   ← 4回開始・0回完了!!
lastReachedLane: "after_event_lanes"           ← イベントレーンの後で止まる
lastError: ""                                   ← throw ではなく hang/激重
lastRunAgoMs: 85504                             ← 最後の実行は85秒前
```
- `refreshAllNorthStarMirrorLanes`(popup-entry.js)は**直列 await 連鎖**:
  syncKokenGiftHistoryForPopup → contrib → giftHistory → programPoints → ad →
  eventCurrentRank → eventCumulative → **eventBroadcasters → eventVotingSupporters**
  →(`lastReachedLane="after_event_lanes"` はここ)→ **refreshSupportActivityTimeline →
  maybeCelebrateGiftEventsAfterRefresh**。
- `after_event_lanes` で止まる = **refreshSupportActivityTimeline か
  maybeCelebrateGiftEventsAfterRefresh が hang/激重**で、完了に到達しない。
- 完了しない → 次の render(ポーリング/コメント更新で renderUserRooms 再呼び出し)が重なる
  → 描画が安定しない/ちらつく。

### 1.4 真因B: state 判定が API storage を見ない(「問い合わせ中」の出所)★確証済み
`src/lib/northStarLaneReason.js` の `determineNorthStarLaneState`:
```js
case 'contributionRanking': {
  const count = Array.isArray(bundle?.contributionRanking) ? bundle.contributionRanking.length : 0;
  if (count > 0) return 'ok';
  return 'iframe_unrendered';  // ← bundle(iframe/DOM経由)しか見ない。koken API storage を見ていない
}
case 'adRanking': { ... return 'fetch_error'; }  // ← nicoad API storage を見ていない
```
- 診断 `北極星レーン`: 貢献度=`iframe_unrendered`, 広告=`fetch_error`(API では取れているのに)。
- ただし `refreshNorthStarContributionRankingLaneAsync` は **rows>0 なら paint して return**
  (state 判定に行かない)。**state 判定に落ちるのは resolve が空を返した render のみ。**
  → ちらつきの片側は「render が koken storage 書込前に走り resolve=空 → 問い合わせ中表示」、
    もう片側は「書込後に走り 73件 paint」。この race と真因A(未完了)が合わさる。

### 1.5 真因C: イベント系2レーンが非参加でも「問い合わせ中」(v0.1.615 が効いていない?)
- スクショで問い合わせ中なのは **eventBroadcasters / eventVotingSupporters**(audition API 経路。
  koken とは別 storage: nls_event_score_ranking_<lv> / nls_event_voting_ranking_<lv>)。
- 診断 `auditionFetchStatus: "empty"`・`eventBanner: null`・`officialNicoEventRank: 1`(NDGR field6)。
  この配信は**イベント非参加**(福引券目標のみ)。よって本来は v0.1.615(PR #218)で
  **レーンごと畳む**はず。だが実機で畳まれず「問い合わせ中」が出ている。
- v0.1.615 の修正(refreshAllNorthStarMirrorLanes を finally で必ず呼ぶ+13s タイムアウト畳み)は
  このブランチ(master=v0.1.615 ベース)に入っている**はず**。なのに効いていない。
  → **真因A(refreshAllNorthStarMirrorLanes が完了しない)が原因で、v0.1.615 の hide も走らない**
    可能性が高い(eventBroadcasters の hide は連鎖の中。after_event_lanes 到達=hide は走った
    はずだが、その後 render が完了せず次 render の mount で上書き?要検証)。

## 2. 会議タスク

### 2.1 第一目標: 真因A(refreshAllNorthStarMirrorLanes 未完了)の確定
- `refreshSupportActivityTimeline`(popup-entry.js:10038)と
  `maybeCelebrateGiftEventsAfterRefresh`(:2073)のどちらが hang/激重か特定。
  - celebration は `maybeCelebrateFromGiftCount`/`primeGiftEventCelebrationsFromCount` で
    アニメ await の可能性。timeline は storage 全件 read の可能性。
- なぜ `Completed: 0` で `Started: 4` か(毎回必ず同じ所で止まる構造か、render 多重か)。
- 「ちらつき/不安定」の機序を確定(未完了 render と次 render の mount/paint の競合)。

### 2.2 修正設計(複数案からCodexが最善を選び実装)
司令塔の候補(Codex は改善・追加可):

- **(必須)案A: ランキング系レーンを後続の重い処理から独立させる**
  - refreshAllNorthStarMirrorLanes の直列連鎖で、ranking 系(contrib/gift/ad/event)を**先に確定描画**し、
    `refreshSupportActivityTimeline` / `maybeCelebrateGiftEventsAfterRefresh` を **非ブロック
    (fire-and-forget)** か個別 try/catch+タイムアウトで隔離。1つの hang が全レーンを巻き込まない。
  - これで真因A(未完了)と「ちらつき」を構造的に解消。v0.1.615 の event hide も確実に走る。

- **(必須)案B: state 判定を API storage 込みにする**
  - `determineNorthStarLaneState`(純関数)に koken/nicoad API storage の rows 有無を渡し、
    取れていれば `ok`(iframe_unrendered/fetch_error を出さない)。
  - これで「API 直叩きなのに問い合わせ中」(ユーザー核心指摘)を根治。
  - ⚠️ ただし description は popup-entry 側で paint 済みなら state 判定に来ない設計。
    「resolve 空の瞬間に問い合わせ中が出る」race を消すには、**resolve 空でも『API 取得済みなら
    待機UIでなく前回値維持 or 簡素な未取得表示』**にする等、ちらつき抑止も込みで設計せよ。

- **(任意)案C: 不要になった iframe warmup の整理**
  - `iframeWarmupSummary` で koken/audition/nicoad mount が全部 `mountSuccess:false`(死んでいる)。
    API 直叩きが全部担うなら iframe warmup 経路は不要。撤去で popup 軽量化(「コメント送信が
    劇的に遅い」=popup 重い、の改善にも寄与しうる)。ただし影響範囲が広いので**段階的に**。
    まず案A+Bで症状を消し、Cは別PRでも可。

### 2.3 絶対遵守
- **v0.1.592 baseline を壊さない**(reference_baseline_v0192_zip)。
- **イベント参加中の配信では従来通りランキングを出す**(隠しすぎ厳禁=機能後退)。
- **API で取れているデータは消さない**(案Bで ok 判定にしても、取れた rows は必ず出す)。
- v0.1.605 の「公式APIに問い合わせ中」正直化の意図は残しつつ、**API 直叩きで取れている時は
  問い合わせ中を出さない**(取得経路が変わった事実に追従)。
- 他の北極星レーン(番組pt=ok で出ている等)を壊さない。
- v0.1.616 で追加した観測(externalFetchProbe / northStarRenderProbe)は**残す**(回帰検出に有用)。
- バージョン bump → v0.1.617 想定。

### 2.4 テスト方針
- 純関数化できる判定(state が API storage 込みで ok/未取得を返す)はユニットテスト。
- 回帰: koken rows>0 で contrib レーンが ok・「問い合わせ中」を出さない / イベント非参加で
  event 2レーンが畳む / refreshAllNorthStarMirrorLanes が timeline/celebration の hang でも
  ranking 系を描画完了する(probe で Completed>0 を担保)。
- 既存テスト全緑(npm run verify): northStarLaneReason / northStarLaneWaitingUi /
  officialContributionRankingResolver / event-broadcasters-lane(e2e)等。

## 3. 出力
- 真因A確定レポート + 採用案の根拠を `docs/codex-koken-api-lane-stuck-fix-v0616.md` に。
- 実装を `fix/koken-contrib-hidden-tab-stuck` に commit + push。
- `npm run verify` 全緑。

## 4. 環境・主要ソース
- 起点: `fix/koken-contrib-hidden-tab-stuck`(origin/master = e77980a = v0.1.615)。
  既に v0.1.616 の観測コミット 3本が乗っている(externalFetchProbe / nicoad属性 / northStarRenderProbe)。
- `src/extension/popup-entry.js`
  - 連鎖本体: `refreshAllNorthStarMirrorLanes`(:10243付近・v0.1.616観測入り)
  - contrib レーン: `refreshNorthStarContributionRankingLaneAsync`(:9448)
  - resolve: `resolveOfficialContributionRankingRows`(:8840付近・観測入り)
  - 後続の重い2つ: `refreshSupportActivityTimeline`(:10038)/ `maybeCelebrateGiftEventsAfterRefresh`(:2073)
  - 待機UI: `mountAllNorthStarLanesBundleLoadingUi`(:8676)/ `renderNorthStarLane`
  - state→待機UI: contrib は :9477-9478 で determineNorthStarLaneState→renderNorthStarLane
- `src/lib/northStarLaneReason.js`(`determineNorthStarLaneState`・state 純関数=案B の核心)
- `src/lib/officialContributionRankingResolver.js`(koken/bundle/iframe 3経路 resolve 純関数)
- `src/lib/kokenContributionRankingApi.js` / `nicoadContributionRankingApi.js`(API URL/正規化)
- content 取得本体: `maybeFetchKokenContribRankingMirrorOnce` / `maybeFetchNicoadContribRankingMirrorOnce`
  / `runExternalApiFetchesAsTabLeader`(content-entry.js・v0.1.616観測入り)
- 関連 reference: reference_koken_contribution_ranking_api / reference_event_lane_stuck_meeting_brief_v0613
  / reference_north_star_lane_hidden_css_specificity / reference_baseline_v0192_zip

## 5. 完了条件
1. 真因A確定(refreshSupportActivityTimeline / maybeCelebrateGiftEventsAfterRefresh のどちらが hang か)。
2. API 直叩きで取れているデータ(koken 73件等)が**安定して**表示され、「問い合わせ中」キャラ案内が
   出ない(ちらつかない)。
3. イベント非参加で event 2レーンが畳む(v0.1.615 の方針完遂)。
4. イベント参加中は従来通り出る(機能後退ゼロ)。
5. npm run verify 全緑 + 回帰テスト。
6. v0.1.617 bump + docs。
7. (任意)コメント送信 11.3秒の遅延は別件として記録(本会議のスコープ外だが関連=popup 重い)。
