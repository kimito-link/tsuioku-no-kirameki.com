# 会議依頼書(フルAI・TDD): 北極星レーン描画の不安定を構造から根治(コンポーネント化+リファクタ) v0.1.617→

> ⚠️ フルAI会議の依頼書(正本)。司令塔がディープリサーチ2系統(外部OSS+自コード)を実施済み。
> 会議メンバーは (1) リサーチ結論を敵対的に検証し、(2) **テスト駆動で**コンポーネント化+リファクタを設計・実装する。
> ブランチ `fix/koken-contrib-hidden-tab-stuck`(origin/master = e77980a = v0.1.615・既に v0.1.616-617 の修正/観測コミットが乗っている)。

## 0. ユーザーの一次要望(北極星)
実機(2代目ミュントゥ lv350672510・5時間超・コメント9700件)で:
- 北極星レーン(ランキング表示帯)が**出たり消えたりする**
- **スクロールする瞬間にパネルが白くなる**
- 記録が伸びにくい / パネルごと空白になることがある
- ユーザー指示:「**コンポーネント化とリファクタリングをうまく組み合わせる会議をやって、フルAIモードでテスト駆動。ディープリサーチしてから**」

## 1. ディープリサーチ結論(2系統・会議は敵対的に検証せよ)

### 1.1 外部OSS調査(web.dev / MDN / Chrome公式 / Shopify・Microsoft)
**「出たり消えたり・白くなる」は同一根本原因**: 30秒/3秒ポーリングで各レーンを `innerHTML` 全置換 →
既存ノード全破棄で一瞬空(白)→ 再構築で reflow。さらに描画連鎖に await(storage/重い取得)が挟まり
「空状態」が長時間露出 = ちらつき。

推奨改修(優先度順・リスク×効果):
- **A: innerHTML 全置換 → DocumentFragment + replaceChildren(アトミック差し替え)** … 効果大/リスク低/工数小。
  メモリ上で組んで1回差し替え=途中の空状態が見えない。MDN/web.dev 実証。
- **B: 重い取得を描画連鎖から外し fire-and-forget + 完了後に該当レーンだけ差分更新** … 9.4秒空白消失。
  (一部 v0.1.617 で実施済み: syncKokenGiftHistory / timeline 非ブロック化)
- **C: storage 直読み → in-memory キャッシュ + chrome.storage.onChanged 購読(write-time 更新)** …
  ポーリング毎の直列 await 連鎖が消え描画即完結。Chrome 公式パターン。プロジェクトの setStorageLocalSilent 方針と同型。
- **D: レーン/行に content-visibility:auto + contain-intrinsic-size** … 画面外スキップでスクロール実測7倍。
  ⚠️ **A/C で forced reflow 源を断った後**でないと web.dev 警告どおり無効化される(導入順厳守)。
- **E: morphdom 差分パッチ + レーン単位 render(viewModel,container) IF へ Strangler 段階移行** …
  真の差分更新(スクロール位置/focus/transition 保持)。13.9k行のコンポーネント化の土台。リスク中・工数大(段階)。

推奨順: A → B(済) → C → D → E。A〜D は振る舞い不変・最小加法で「症状隠しでなく原因機構の構造除去」方針に合致。
最大主因の推定: **B(重い await が連鎖内)+ A(innerHTML 全置換の空状態)の合わせ技**。

### 1.2 自コード調査(現状構造)
- **再描画トリガー**: ポーリング(inline 3秒 / popup 30秒)→ safeRefresh → renderUserRooms →
  refreshAllNorthStarMirrorLanes。加えて storage.onChanged(コメント更新)でも safeRefresh。
- **全レーン共通の `paintTopSupportRankStyleIntoElement` が毎回 `el.innerHTML = html` で全置換**(差分更新なし)。
  `renderNorthStarLane` / `mountNorthStarLaneWaitingUi` も innerHTML 全置換。→ A の対象。
- **1ポーリング tick で chrome.storage.local.get が 9-10 回**(各レーンが個別に読む)。→ C の対象。
- **重い処理**: refreshNorthStarGiftHistoryLaneAsync の readAllCommentsForLive(全コメント9400件)、
  syncKokenGiftHistoryForPopup の全ギフト履歴 SW 取得(9.4秒)。→ B(一部 v0.1.617 で非ブロック化済)。
- **v0.1.616-617 の自分の変更は悪化要因ではない**(観測ゼロコスト・storage +2回は軽微・真因A/B/C を対処)。
  ただし**根本の innerHTML 全置換は未対処**=今回の会議の核心。
- 既存計画 `plan_popup_entry_componentization.md`(A-1→B-5→C-7順)があるので会議は必ず読むこと。

## 2. 会議タスク(TDD で進める)

### 2.1 第一目標: 改修Aの設計と実装(最優先・最大効果/最小リスク)
- 全レーン共通の `paintTopSupportRankStyleIntoElement`(popup-entry.js)の `el.innerHTML = html` を
  **DocumentFragment + replaceChildren**(または同等のアトミック差し替え)に置換。
- ⚠️ **振る舞い完全不変**(出力 DOM は同一・既存 e2e/ユニット全緑)。HTML 生成ロジックは流用し、
  「文字列→DOM 化→アトミック差し替え」だけ変える。XSS 安全性(現状の sanitize)を維持。
- TDD: HTML 生成を純関数として切り出し(可能なら)、ユニットテストで「同じ入力→同じ DOM 構造」を固定。

### 2.2 第二目標: 改修C(storage 読みのホットパス排除)
- 北極星レーンが描画で読む storage(koken/nicoad/event score/voting/gift)を **in-memory キャッシュ + onChanged**
  購読に寄せ、描画は同期キャッシュ参照に。複数キーは1回の get に束ねる。
- ⚠️ liveId 切替時のキャッシュ無効化・stale 防止を厳密に(既存の watchMetaCache / liveId echo 確認と整合)。
- TDD: キャッシュ更新ロジック(onChanged → cache 反映 / liveId 不一致は無視)を純関数化してテスト。

### 2.3 第三目標: 改修D(content-visibility)— A/C 完了後のみ
- レーン枠・ランキング行に content-visibility:auto + contain-intrinsic-size。
- ⚠️ A/C で forced reflow を消した後に入れる(順序厳守)。スクロールバージャンプ防止に intrinsic-size 調整。

### 2.4 コンポーネント化(Strangler・段階)
- 「データ → 表示用 view-model」変換(順位整形/dedup/サンプリング等)を**純関数 lib に抽出**してユニットテスト化。
  プロジェクトの既存方針(htmlReportKiramekiAwards.js 等の lib 抽出・dedup 回帰テスト前例)と一致。
- レーン単位で render(viewModel, container) IF に統一し、**1レーンずつ**新経路へ呼び替え。
  各ステップで git diff + npm run verify + 実機 parity 確認してから次へ。**一気に書き換えない。**
- 旧 innerHTML 経路は全レーン移行後に撤去。

### 2.5 絶対遵守
- **v0.1.592 baseline を壊さない**(reference_baseline_v0192_zip)。
- **API で取れているデータは消さない / 参加中レーンは従来通り出す**(機能後退ゼロ)。
- v0.1.616-617 の観測(externalFetchProbe / northStarRenderProbe)は残置(回帰検出)。
- **症状隠し禁止**(白くなるのを CSS で隠すだけ等は却下。原因=innerHTML 全置換+await 連鎖を構造除去)。
- 各ステップで **npm run verify 全緑**を保つ(TDD・Strangler の鉄則)。
- bump → v0.1.618 以降(改修単位ごとに細かく)。

### 2.6 テスト方針(TDD)
- 純関数(view-model 変換・キャッシュ更新・state 判定)はユニットテストを**先に**書く(red→green)。
- 回帰: 既存 e2e(event-broadcasters-lane / gift-history-live-source / nicoad-ad-ranking /
  popup-layout 等)が緑のまま。innerHTML→fragment 化で DOM 構造が変わらないこと。
- 実機 parity: 改修ごとに診断バンドル(northStarRenderProbe の Completed が増える・白飛びが消える)で確認。

## 3. 出力
- 真因再確認 + 改修A〜E の設計と実装計画を `docs/north-star-lane-repaint-refactor-v0617.md` に。
- 実装を段階コミットで `fix/koken-contrib-hidden-tab-stuck`(または新ブランチ)に push。
- `npm run verify` 全緑を各段階で。

## 4. 環境・主要ソース
- `src/extension/popup-entry.js`(13.9k行)
  - 全レーン共通 painter: `paintTopSupportRankStyleIntoElement`(innerHTML 全置換=A の核心)
  - 待機/placeholder: `renderNorthStarLane` / `mountNorthStarLaneWaitingUi`(innerHTML 全置換)
  - 一括再描画: `refreshAllNorthStarMirrorLanes`(直列 await・v0.1.617 で一部非ブロック化済)
  - 各レーン: refreshNorthStar{ContributionRanking,GiftHistory,EventCurrentRank,EventBroadcasters,
    EventVotingSupporters,ProgramPoints}LaneAsync / refreshNorthStarAdRankingLane(v0.1.617 async)
  - ポーリング: setInterval(safeRefresh, POLL_INTERVAL_MS=3s/30s)(:20512 付近)
  - 観測: _northStarRenderProbe / _externalFetchProbe(残置)
- `src/lib/northStarLaneReason.js`(determineNorthStarLaneState・v0.1.617 で API rows 込み)
- `src/lib/officialContributionRankingResolver.js`(koken/bundle/iframe resolve 純関数)
- memory: plan_popup_entry_componentization.md(既存抽出計画・必読) / reference_baseline_v0192_zip /
  reference_koken_api_lane_stuck_meeting_brief_v0616(前会議) /
  feedback_ai_generic_rules_master(DO_NOT_REWRITE・実装/レビュー分離)

## 5. 完了条件
1. 改修A(innerHTML→アトミック差し替え)実装 + 既存テスト全緑 + 実機で白飛び/出たり消えたり解消。
2. 改修C(storage ホットパス排除)実装 + キャッシュ純関数テスト。
3. 改修D(content-visibility・A/C後)。
4. コンポーネント化の第一歩(view-model 純関数抽出 + ユニットテスト)。
5. 機能後退ゼロ(API データは出る・参加中は出る・diag の Completed が増える)。
6. npm run verify 全緑(各段階)+ v0.1.618+ bump + docs。

## 6. 残課題(別系統・記録)
- コメント送信 11.3秒の遅延(recordCommentSubmitTotal)— popup 重い別問題。
- iframe warmup(mountSuccess:false で死んでいる)の撤去 — API 直叩きが担うので不要・段階的に。
- 「記録が伸びない」(コメント取り込み層)— 描画とは別系統。本会議後に診断。
