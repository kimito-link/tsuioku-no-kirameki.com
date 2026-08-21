# 🗺️ 機能サイトマップ(何が・何をして・どのファイルか・自動生成)

> `npm run tree-map` で再生成。手で編集しない(`--check` が verify:cc で腐りを検知)。
> 全機能を「分類 → 機能 → 役割 → 担当ファイル」で。代表は手動 FEATURES・残りは自動分類で全網羅。視覚版: [feature-sitemap.html](feature-sitemap.html)。

## 📤 送信

> 🦊りんく: コメントを配信に送る係なのだ。
> 🦊こん太: ちゃんと送れたか確かめてるのだ。
> 🦝たぬ姉: 送った人の手元メモも残すのだ。

- **コメント送信(確認/プロファイル)** — 拡張から watch のコメント欄へ送信し、入力欄の変化で成功を推定。送信経路の手元プロファイルも
  - `src/lib/commentSubmitConfirm.js`
  - `src/lib/commentSubmitProfiling.js`
<details><summary>🗂 このカテゴリの全担当ファイル(自動分類) 11</summary>

- `src/lib/commentComposeShortcuts.js` — コメント欄の Enter 系キーで送信するか／既定動作に任せるか。
- `src/lib/commentKindnessNudge.js` — 送信前コメントの攻撃的表現を検知し「やさしく一言」確認を促す純ロジック。
- `src/lib/commentPostDeadline.js` — コメント送信(requestPostCommentToOpenTab)全体を総締切で有界化する純関数。
- `src/lib/commentPostDom.js` — コメント送信ボタン探索を、同一フォーム/近傍スコープを優先して行う。
- `src/lib/commentPostRetriable.js` — popup のコメント送信で、別 frameId を試す価値があるか（8s 走査を避ける判定）。
- `src/lib/commentPostUi.js` — ポップアップのコメント送信 UI を、watch 接続状態と入力状態から一貫して決める。
- `src/lib/commentSendTroubleshootHint.js` — コメント送信エラー文に「再読み込み案内」を 1 回だけ追加する純関数。
- `src/lib/commentSubmitSteps.js` — コメント送信パイプラインの純粋な判定ロジック。
- `src/lib/liveviewPublishOutcomeKey.js` — 純Web公開送信(POST /api/status)結果の【ページ横断】記録キー（council/diagnostics-completeness-root-SYNTHESIS.md 第3段）。
- `src/lib/ownPostedUserIdSet.js` — v0.1.773: 「自分が投稿した userId」の集合を1パスで作る純関数。
- `src/lib/selfPostedMatcher.js` — 自己投稿コメント（self-posted recents）と、保存済みコメント一覧の

</details>

## 📥 取得

> 🦊りんく: コメントを集めてくる入り口なのだ。
> 🦊こん太: 今のコメントも、過去のコメントも拾うのだ。
> 🦝たぬ姉: 同じものは1回だけにする掃除もここなのだ。

- **コメント収穫(DOM 観測)** — watch の仮想スクロールを送りながら DOM 上のコメント行を拾い集める。受理判定は nicoliveDom
  - `src/lib/commentHarvest.js`
  - `src/lib/nicoliveDom.js`
- **過去ログ取得(バックフィル巡回)** — NDGR の backward URI を辿り配信開始まで遡って過去コメントを取り込む巡回エンジン(純ロジック)
  - `src/lib/ndgrBackfillCrawl.js`
- **コメント重複除去(NDGR)** — 再送/再接続/relay overlap の重複を liveId+messageId の canonical key で排除
  - `src/lib/ndgrMessageDedupe.js`
<details><summary>🗂 このカテゴリの全担当ファイル(自動分類) 61</summary>

- `scripts/lib/instrument-core.mjs` — ★計器・検査の共通土台（45リポから収穫した知見の実装）。
- `src/domain/observations/StatObservation.js` — StatObservation - ニコ生から取得する数値の「契約付き観測値」純関数 factory。
- `src/domain/observations/vocabulary.js` — 観測層 (StatObservation) の語彙集 - 不変な enum 定義のみ。
- `src/extension/backfill-sw-entry.js` — Service Worker 側の過去ログ取得(バックフィル)エンジン。NDGR を遡って取り込む。
- `src/extension/page-intercept-entry.js` — MAIN world エントリ（esbuild で単一 IIFE にバンドルされる）
- `src/lib/acquisitionDashboardChart.js` — 「データ取得率」ダッシュボードのチャート計算（純関数）。
- `src/lib/backfillBottleneck.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/backfillCapturedAt.js` — v0.1.405: バックフィルした過去コメントの「実時刻 capturedAt」を推定する純関数。
- `src/lib/backfillFlushThreshold.js` — バックフィル（過去ログ一括取り込み）の persist フラッシュ閾値を、
- `src/lib/backfillHeartbeat.js` — v0.1.795: 裏(背面)タブでも過去ログ backfill を取り切るための「ハートビート」純ロジック。
- `src/lib/backfillOptIn.js` — v0.1.405: 過去ログ一括バックフィル（NDGR backward 巡回）の opt-in 判定 純関数群。
- `src/lib/backfillRemoveGiftSystemMessages.js` — v0.1.172 〜 v0.1.194 までの間に NDGR ギフトシステムメッセージが
- `src/lib/backfillRemoveRecommendedLivePollution.js` — v0.1.200: v0.1.199 以前の間に「おすすめ生放送」セクションの DOM が
- `src/lib/backfillRetryBackoff.js` — v0.1.442: 過去ログバックフィルの一過性 stop 自動リトライの遅延計算（純関数）。
- `src/lib/backfillRinkuNarration.js` — v0.1.410: 過去ログ取り込み（backfill）の進捗に合わせた「りんくのセリフ」を返す純関数。
- `src/lib/backfillRotationGate.js` — v0.1.642: backfill の rotation_yield(90秒強制打ち切り)を「待機している別タブが居るときだけ」
- `src/lib/backfillSlotAutoThrottle.js` — v0.1.6xx: 複数タブ並列 backfill の動的throttle純関数(PR2)。
- `src/lib/backfillSlotPool.js` — v0.1.663: 複数タブ並列 backfill のスロットプール(純ロジック)。
- `src/lib/backfillTransientRetry.js` — v0.1.431: 過去ログ一括バックフィルの「一過性 stop での自動リトライ」判定（純ロジック）。
- `src/lib/backfillVisibilityRearm.js` — v0.1.633: 過去ログ一括バックフィルの「タブ可視状態に戻った時の再開(rearm)」判定（純ロジック）。
- `src/lib/cleanNdgrChatRows.js` — NDGR チャット行の正規化純関数。
- `src/lib/commentIngestLog.js` — コメント取り込みの監査ログ（しおりのようにストレージへイベントが積まれる）。
- `src/lib/commentObservabilityDiag.js` — v0.1.225: コメント記録の uid 解決経路を AI 共有診断 JSON に自動で乗せる純関数。
- `src/lib/commentPipelineLog.js` — コメント取り込みパイプラインの構造化デバッグログ（純関数フォーマッタ）。
- `src/lib/deepHarvestReason.js` — 深掘り収穫(deep harvest)の発動理由(起動/記録ON/配信切替/タブ可視)の定義と判定。
- `src/lib/eventLoopStallSummary.js` — 観測列の「予定時刻 vs 実発火時刻」から
- `src/lib/externalFetchCells.js` — 外部API(貢献度/ニコニ広告)の取得をセルにする(純関数)。
- `src/lib/giftRelayStorageLiveId.js` — ギフト sub-app iframe からの postMessage を storage に書くときの liveId 解決。
- `src/lib/giftSubAppRelayDiag.js` — v0.1.226: ギフトサイドバー cross-origin iframe relay 経路の生存確認用 純関数。
- `src/lib/giftSubAppRelayTrust.js` — Cross-frame gift relay messages are accepted only from NicoNico/local-dev
- `src/lib/globalBackfillQueue.js` — 多タブ時の NDGR バックフィル待ち行列・前面タブ優先（session 共有）。
- `src/lib/googleSuggest.js` — Google サジェスト取得の契約 (URL組み立て + レスポンスパース + message type)
- `src/lib/hiddenOfficialIframeReinjectGate.js` — hidden audition iframe を「再 inject してよいか」を判定する純関数（v0.1.394）。
- `src/lib/iframeOfficialDomFromRelay.js` — v0.1.231: iframe relay (NLS_GIFT_HISTORY_FROM_IFRAME) 受信時の
- `src/lib/interceptBinaryTextExtract.js` — バイナリを UTF-8 として解釈した文字列から、近傍の commentNo とユーザー識別子の組を拾う（ヒューリスティック）。
- `src/lib/interceptViewerJoinSignals.js` — page-intercept 用: JSON から「視聴者入室・オーディエンス更新」らしいユーザ配列を抽出（純関数・PII は userId/表示名/アイコン URL のみ）
- `src/lib/interceptVisitorProbeDebug.js` — TAKT B フォールバック: 来場・入室信号の観測用。既定 OFF。
- `src/lib/mcpBridge/buildLiveMcpSnapshot.js` — L0 Evidence（拡張の観測データ）→ L1 Canonical Snapshot 変換。
- `src/lib/ndgrBacklog.js` — NDGR flush を liveId 確定まで遅延するかを判定する純関数。
- `src/lib/ndgrChatRows.js` — NDGR decodeChat の結果を mergeNewComments 向け行に変換する。
- `src/lib/ndgrDecode.js` — NDGR (のどぐろ) Protobuf 軽量デコーダー
- `src/lib/ndgrFlushDedupKey.js` — NDGR フラッシュ時の重複排除キーを作る純関数(v0.1.836)。
- `src/lib/ndgrForwardCrawl.js` — v0.1.511: NDGR コメントの「前方向（forward）継続取得」巡回エンジン（純ロジック）。
- `src/lib/ndgrHiddenFlushThreshold.js` — 裏タブで「コメントが数十秒遅れて出る」のを止める純関数。
- `src/lib/ndgrUnknownSamplesBudget.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/niconicoInterceptLearn.js` — page-intercept が JSON から拾う userId / nickname / avatar / commentNo の走査（純関数）
- `src/lib/nicoUserProfileApi.js` — ニコニコのユーザープロフィール取得用メッセージ型と uid 妥当性判定(background と文字列同期)。
- `src/lib/nlsInterceptAuth.js` — v0.1.234: page-intercept (MAIN world) → content-entry (ISOLATED world) 経路の
- `src/lib/northStarAcquisitionGauge.js` — 北極星レーン左ガジェット「取得率」メーター用の純関数。
- `src/lib/popupFrameCodec.js` — popup の配色フレーム「共有コード」の エンコード／デコード。
- `src/lib/probeRecommendedLiveSection.js` — v0.1.200: ニコ生 watch ページ内「おすすめ生放送」セクションの観測純関数。
- `src/lib/probeWatchPageDomStructure.js` — v0.1.201: ニコ生 watch ページ主要 DOM の存在を観測する純関数。
- `src/lib/shouldRearmBackfillForOfficialGap.js` — 自動補充の核心: 「公式コメント件数と記録件数のギャップが大きいまま、NDGR バックフィルが
- `src/lib/shouldSkipDeepHarvest.js` — NDGR がリアルタイムでコメントを提供している間は deep harvest（仮想リスト走査）を
- `src/lib/shouldTriggerOfficialGapDeepHarvest.js` — ライブ中に「公式 statistics コメント数」と「記録件数」の差が大きいとき、
- `src/lib/storyGrowthCellSwap.js` — アイコングリッドの「既存マスの中身がすり替わった回数」を観測する純関数(v0.1.1215)。
- `src/lib/storyGrowthChurn.js` — アイコングリッド(story growth)の「作り直し」を観測する純関数(v0.1.1208)。
- `src/lib/swBackfillStaging.js` — Service Worker backfill の取り置きペイロードを扱う純関数群。
- `src/lib/swBackfillTrigger.js` — SW backfill モード(実験)の起動判定純関数。
- `src/lib/userIdPreference.js` — コメント記録まわり: userId の「観測強度」（数字 ID を匿名系より優先する等）
- `tests/helpers/wiringTestSource.js` — wiringTestSource — wiring テストが「関数の本体」を、置き場所に依らず取得するための正本。

</details>

## 💾 記録

> 🦊りんく: 集めたコメントを安全にしまう係なのだ。
> 🦊こん太: 数えた件数が減って見えないように守るのだ。
> 🦝たぬ姉: しまう場所(キー)の名前もここで決めるのだ。

- **記録件数の単調化(減らない表示)** — per-live ゲートで記録件数の表示が後退しないようにする
  - `src/lib/monotonicCommentCount.js`
- **storage キー定義** — chrome.storage のキー名の正本(nls_comments_<lv> 等)
  - `src/lib/storageKeys.js`
<details><summary>🗂 このカテゴリの全担当ファイル(自動分類) 51</summary>

- `scripts/dump-panel-state.mjs` — 実機の chrome.storage.local を吸い出して
- `scripts/record-improvement.mjs` — ★実測値を台帳に書き足す【1本の口】。
- `src/lib/autoBackupState.js` — v0.1.808(星野ロミ式コンポーネント化・第1弾): content-entry.js の巨大化を抑えるため、
- `src/lib/avCue.js` — 「AVCue = 音の再生結果を真実とする単一発火点」の純関数群(V1・DOM/storage/音に触れない)。
- `src/lib/blobDownload.js` — Blob を指定ファイル名で保存する。
- `src/lib/broadcastSessionSummaryDb.js` — 配信セッション単位の軽量サマリ（ポップアップの IndexedDB）
- `src/lib/broadcastSessionSummaryFlush.js` — サマリ IndexedDB への間欠フラッシュ（ポップアップから呼ぶ）
- `src/lib/commentChunkStore.js` — v0.1.509: コメント本体の「追記専用チャンク分割」純関数群＋ストレージ orchestration。
- `src/lib/commentDb.js` — v0.1.514: コメント本体の保存先を `chrome.storage.local`（値まるごと structured clone・
- `src/lib/commentProgressMonitor.js` — 記録進捗の自動監視ロジック（純関数）。
- `src/lib/commentRecord.js` — コメント1件の形・重複排除・マージ（純関数）
- `src/lib/commentRecordBreakdown.js` — v0.1.627: コメント記録カードの「内訳」表示用・純関数。
- `src/lib/commentTailBuffer.js` — v0.1.505: コメント保存の「テールバッファ（追記式チャンク）」純関数群。
- `src/lib/commentTimelineMirrorKey.js` — コメントタイムライン鏡の storage キー正本（council/liveview-wholesale-root-SYNTHESIS.md 第2段）。
- `src/lib/devMonitorTrendSession.js` — 開発監視トレンド: sessionStorage（セッション）+ chrome.storage.local（永続・最大7日）
- `src/lib/displayRecordedCount.js` — 「画面に出す記録件数」の正本を1つに固定する純関数(v0.1.839・第1)。
- `src/lib/effectDetailCells.js` — 演出・効果音・コメント送信の観測を割る(純関数)。
- `src/lib/finalDetailCells.js` — 100個化の最終弾(識別・効果音・BGM・記録の質)。
- `src/lib/giftRecord.js` — ギフト/広告ユーザーの永続化（純関数）
- `src/lib/heavyChunkReadReuse.js` — heavy 全件コメント read の再利用判定純関数
- `src/lib/inFlightGuard.js` — 状態速報「重さ根治 P3」: runStorageOpWithTimeout(storageOpTimeout.js)は Promise.race で
- `src/lib/instantCommentPush.js` — 「コメント即時プッシュレーン(storage迂回)」の純関数部。
- `src/lib/livePersistInterval.js` — v0.1.498〜501: ライブ記録の保存（コアレッサ）最小間隔を決める純粋関数。フリーズ対策 A。
- `src/lib/liveviewPublishOutcome.js` — 純Web公開（応援ライブビューの /api/status への POST）の直近結果を記録・要約する。
- `src/lib/longTaskTracker.js` — メインスレッドを長時間ブロックした「Long Task」を有界に記録する純関数群。
- `src/lib/mirrorBundleKey.js` — 鏡バンドルの storage キー。
- `src/lib/northStarDetailCells.js` — 公式値レーン(ギフト/広告/イベント)の【実績】をセルにする(純関数)。
- `src/lib/northStarMirrorKey.js` — 北極星レーン鏡(公式値レーン)の storage キー。
- `src/lib/persistableCommentRow.js` — v0.1.362: DOM ハーベスト経路で拾ったコメント行を `nls_comments_<lv>` に保存して
- `src/lib/persistThrottle.js` — v0.1.431: 連続フラッシュの合間にイベントループへ制御を返す既定の yield。
- `src/lib/popupWatchSnapshotPersist.js` — 取得した watch snapshot を generation を超えて永続化するためのヘルパ。
- `src/lib/prunableStorageKeys.js` — v0.1.419: storage.local の「定期 prune 対象キー」だけを prefix で絞り込む純関数。
- `src/lib/readAllCommentsForLive.js` — 放送の全コメントを「IndexedDB(SW集約書きの正本) → chrome.storage チャンク → テール」の
- `src/lib/recordingStallWatchdog.js` — 記録停止ウォッチドッグの純粋判定ロジック。
- `src/lib/recordRate.js` — 取得スピード(records/sec)の算出と健康スコア化(純ロジック)。
- `src/lib/roomHeatMirrorKey.js` — 室温(ルーム熱度・5分増減)鏡の storage キー正本
- `src/lib/selfWrittenStorageKeys.js` — refresh() 自身が書くキー(=再描画を誘発してはいけないキー)の判定。
- `src/lib/sessionSummaryCompareTableHtml.js` — セッションサマリ推移テーブル（renderSessionSummaryComparePanel の <table>）の HTML を組む純関数。
- `src/lib/sessionSummaryMirror.js` — セッション比較(記録サマリの推移)の「鏡」スナップショット純関数
- `src/lib/sessionSummaryMirrorKey.js` — セッション比較(記録サマリの推移)鏡の storage キー正本
- `src/lib/sourceProvenance.js` — 値を「**どの経路で取れたか**」で記録し、経路の劣化を検出する(純関数)。
- `src/lib/statCardsMirror.js` — 数字カード鏡のスナップショット純関数。popup 上部の数字カード(記録N件・推定同時接続・来場者数)と
- `src/lib/statCardsMirrorDom.js` — 数字カード鏡(記録/推定同時接続/来場者数+公式統計チップ)の【値セット部分】を、
- `src/lib/statCardsMirrorKey.js` — popup 上部の数字カード群(記録N件・推定同時接続・来場者数・公式統計チップ)を status.html に
- `src/lib/storageOpTimeout.js` — v0.1.502: 単発の非同期処理（主に chrome.storage.local の get/set/remove）を
- `src/lib/storedCommentDedupeKey.js` — 保存済みコメントの重複判定キーを作る純関数(v0.1.1313)。
- `src/lib/storyDetailRelatedEntries.js` — ストーリー詳細／プレビュー脇の「同一ユーザーの直近」リスト用。
- `src/lib/storyDiagMonotonic.js` — 診断カウンタchurn(内訳・用語の顔一覧が増減して見える)の根治。
- `src/lib/supportVisualExpanded.js` — 応援ビジュアル（アイコン列・グリッド・診断）の開閉を storage に保存するときの正規化。
- `src/lib/userProfileLinkHtml.js` — 応援コメントの各種 HTML 出力（マーケティング HTML・HTML 保存レポート等）で、
- `src/lib/userRooms.js` — 保存済みコメントを「ユーザー＝ルーム」に集計（純関数）

</details>

## 🧮 集計

> 🦊りんく: バラバラのコメントを「人ごと」にまとめるのだ。
> 🦊こん太: 誰が応援してくれたか分かるようにするのだ。
> 🦝たぬ姉: 応援レーンの素になる大事な計算なのだ。

- **応援レーン集約(誰が候補か)** — 保存コメント行を userId 単位に畳み込みレーン候補を作る唯一の集約正本(popup/venue 共通)
  - `src/lib/userLaneCandidatesFromStorage.js`
<details><summary>🗂 このカテゴリの全担当ファイル(自動分類) 98</summary>

- `src/domain/lane/aggregate.js` — 応援ユーザーレーンの per-row → per-user 集約（純関数）。
- `src/domain/observations/observationStore.js` — observationStore - StatObservation のメモリ常駐リングバッファ。
- `src/domain/user/identity.js` — ニコ生ユーザー ID の「匿名性」判定と関連アイデンティティ・ユーティリティ。
- `src/lib/auditionEventRankingApi.js` — audition 公式「イベント💎ランキング」無認証 JSON API の URL 組立 & 正規化（純関数）。
- `src/lib/broadcastContext.js` — v0.1.793: 「この配信の配信者(broadcaster)情報」を 1 か所で型定義し、storage キー・
- `src/lib/broadcastCrossCompare.js` — 0.1.24 (Y): 横断比較系の純粋関数群。
- `src/lib/broadcastDurationLabel.js` — HTML レポートの「配信時間」表示ラベルを純粋に整形する。
- `src/lib/broadcasterCommentCount.js` — 「配信者本人のコメント数」を正しく算出する純関数(v0.1.838)。
- `src/lib/broadcasterExcludedCount.js` — v0.1.774: 記録カードの見出し数値から「配信者本人のコメント」を差し引いて、公式(本家コメ)と
- `src/lib/broadcasterFollowTarget.js` — 配信者タイル / casterBanner で出す「配信者の page URL とアイコン」を、
- `src/lib/broadcasterProfileCard.js` — 配信者プロフィールの「レポート用 正規化モデル」と HTML 断片ビルダー（純関数）。
- `src/lib/broadcasterReputationKeywords.js` — 配信者の評判チェック - ネガティブキーワード判定エンジン
- `src/lib/broadcasterReputationView.js` — 配信者の評判チェック - 表示ビューモデル + アラート HTML (純関数)
- `src/lib/broadcasterUidTracker.js` — broadcasterUidTracker — 配信者UIDの sticky 解決(この機能群で唯一の stateful 部品)。
- `src/lib/broadcasterUserId.js` — 配信者 userId を embedded-data / DOM から純粋関数で抽出する。
- `src/lib/broadcastScore.js` — 配信スコアパネル(カラオケ採点/太鼓の達人風)の純粋なスコア化ロジック。
- `src/lib/broadcastScoreHtml.js` — 配信スコアパネル(カラオケ採点風)の HTML を組む純関数。
- `src/lib/broadcastScorePanelViewModel.js` — SC2(council/broadcast-scoring-SYNTHESIS.md §5)のpopupスコアパネル配線から、
- `src/lib/broadcastUrl.js` — ニコニコ生放送 URL / パスから lv ID を取り出す（純関数・DOM非依存）
- `src/lib/broadcastWaveformFingerprint.js` — L3: コメ波形フィンガープリント。
- `src/lib/buildNorthStarAdRankingStatsHtml.js` — 北極星「広告ランキング」レーン用: watch の番組統計と一覧の「貢」の内訳を短い HTML にする。
- `src/lib/capCommentsForAnalytics.js` — マーケ分析・タイムライン用のコメント上限（heavy 時の全件再走査を防ぐ）
- `src/lib/channelBroadcasterMeta.js` — 公式チャンネル放送（運営・業者）の broadcaster メタを embedded-data から
- `src/lib/channelSwitchDiag.js` — 配信切替(SPA遷移)の「送信N/受信N/初描画ms」観測値を組み立てる純関数群。
- `src/lib/channelSwitchDiagKey.js` — 配信切替(SPA遷移でパネルを作り直さず in-place 切替する経路)の「切替回数/初描画ms」観測値を
- `src/lib/commentEchoDetector.js` — L1 コメ伝染 + L5 コメ被り瞬間検出。
- `src/lib/commenterCulturalAnalytics.js` — L6 / L10 / L11 / L14 / L15 — 文化分析系の純粋関数を 1 ファイルに集約。
- `src/lib/commenterFollowAnalytics.js` — 数値IDコメンターのフォロー情報を、マーケ分析HTMLで扱いやすい形へ整える純関数群。
- `src/lib/commenterFollowCache.js` — コメンター（数値 userId）のフォロー/フォロワー数・プレミアム・LV を userId 単位でためる
- `src/lib/commenterFollowingListCache.js` — コメンター（数値 userId）のフォロー先 userId リスト横断キャッシュ。
- `src/lib/commenterHistoricalAnalytics.js` — 過去 N 配信 × 現在配信のコメンターを横断分析する純粋関数群。
- `src/lib/commenterSurvivalCurve.js` — コメンター生存曲線（B6）。
- `src/lib/commentFatigue.js` — コメント疲労（「短い時間でコメントを打つと疲れて失速する」）をデータ化する純関数。
- `src/lib/commentSilenceZones.js` — コメントの沈黙ゾーン検出（連続 X 秒以上のコメ無し区間）+ L2 沈黙の質判定。
- `src/lib/commentVelocityTimeline.js` — コメントの時系列粒度集計と「笑い密度（L4 笑いの瞬間検出）」を純粋関数で計算する。
- `src/lib/commentVelocityWindow.js` — 直近ウィンドウ内のコメント件数と「件/分」換算（純関数）
- `src/lib/completenessScore.js` — 状態速報「網羅的完全性診断(PageSpeed 型)」のスコア集計(純関数)。
- `src/lib/concurrentCalibrationFit.js` — 較正フィット（蓄積した較正サンプルから係数の「推奨値」を導く純関数）。
- `src/lib/concurrentCalibrationLog.js` — 同接推定の較正データロガー（しおりのようにストレージへサンプルが積まれる）。
- `src/lib/concurrentEstimate.js` — 複合シグナルによる同時接続数推定モジュール。
- `src/lib/concurrentPeakAnalysis.js` — 同接推移カーブから「ピーク到達 / 終了時保持率 / 半減点」を求める純粋関数。
- `src/lib/concurrentResolvedFromSnapshot.js` — watch スナップショット（content-entry の collectWatchPageSnapshot 戻り、popup へ送るのと
- `src/lib/concurrentTimelineSeries.js` — 同接推移カーブ（視聴維持率の核）の時系列データを純粋関数で構築する。
- `src/lib/devMonitorGiftRankingExtrasHtml.js` — dev monitor「取得状況サマリ」(#devMonitorGiftRankingExtras)の HTML を組む純関数。
- `src/lib/diagChannelRegistry.js` — 計器チャンネルの台帳。HANDOFF-instrument-channels-2026-08-12.md §3。
- `src/lib/effectSoundPlayer.js` — ギフト/広告/応援者ランキング順位変動に鳴らす短い効果音の再生ロジック(純関数+再生本体)。
- `src/lib/eventRankingReportModel.js` — イベントランキングの「レポート用 正規化モデル」純関数（Phase A・2026-05-26 会議）。
- `src/lib/eventRankingSectionHtml.js` — v0.1.810(星野ロミ式コンポーネント化・第3弾): popup-entry.js の巨大 HTML ビルダー
- `src/lib/eventScoreRankingRelay.js` — audition richview 由来のイベント💎順位リストを親へ relay するときの
- `src/lib/excludeBroadcasterFromCommentEntries.js` — popup の表示用 comment 配列から、配信者本人 user の comment を除外する純関数。
- `src/lib/excludeBroadcasterFromRankedRooms.js` — 応援ランクストリップに渡す前に、配信者本人の room を除外する純関数。
- `src/lib/giftMomentumAnalytics.js` — HTML マーケ分析向けのギフト深掘り集計。
- `src/lib/giftRankingLaneOptIn.js` — v0.1.228: ギフトランキングレーンの opt-in 判定 純関数群。
- `src/lib/hiddenTabExternalFetchGate.js` — v0.1.616: 非可視タブでも外部 API fetch（koken 貢献度 / nicoad 広告 / ギフト履歴 /
- `src/lib/identityAcquisitionCensus.js` — サムネ / 数値ID / アカウント名 の【取得率】を数える純関数。
- `src/lib/inferBroadcasterUserIdFromComments.js` — snapshot の broadcasterUserId が空のとき、保存済みコメント内の表示名から
- `src/lib/isInsideRecommendedUserSection.js` — ニコニコ視聴ページ周辺に出る「おすすめユーザー／フォロー候補」系 UI の子孫かを粗く判定する。
- `src/lib/kiramekiAwards.js` — 「きらめきの賞」判定ロジック（純関数）。
- `src/lib/kiramekiAwardsSectionHtml.js` — HTMLレポートの「きらめき表彰」セクション(CSS+各賞カード)の組み立て。
- `src/lib/kokenContributionRankingApi.js` — koken 公式「ギフト貢献度ランキング」無認証 JSON API の URL 組立 & 正規化（純関数）。
- `src/lib/liveChannelSwitch.js` — 「別の配信へ移動(SPA遷移)するとパネルが壊れる」問題の修正(2026-07-06)。
- `src/lib/liveCommenterStats.js` — 記録済みコメントから「ユニーク投稿者（推定）」用の集計（純関数）
- `src/lib/liveviewMirrorSections.js` — ③WEB丸写しの「セクション・レジストリ」= ①POP の各パネルが③に出るための配線を1箇所に集約した一覧表
- `src/lib/loadLastBroadcastSummary.js` — 0.1.69 (AY): empty state（配信なし）popup で「前回の配信」cards を復元するために、
- `src/lib/mangaBroadcastSummary.js` — 放送終了後の HTML レポート / マーケ分析の頭にくる「漫画読み体験」要約。
- `src/lib/marketingAggregate.js` — userId: string,
- `src/lib/mcpBridge/buildMcpRankingSnippet.js` — MCP / L1 向けに貢献度・広告ランキングの **PII 最小スナップショット** を組み立てる。
- `src/lib/networkErrorProbe.js` — v0.1.201: 拡張の network 層異常を診断 JSON 用に集約する純関数。
- `src/lib/nicoadContributionRankingApi.js` — ニコニ広告(nicoad)「貢献度ランキング」無認証 JSON API の URL 組立 & 正規化（純関数）。
- `src/lib/nicoliveRankingPick.js` — 公式ランキングから【検証に使う配信を1つ選ぶ】純関数。
- `src/lib/nicoUserFollowingApi.js` — nvapi /v1/users/{uid}/following/users の URL 構築とレスポンス正規化。
- `src/lib/officialContributionRankingResolver.js` — 公式貢献度ランキングの取得経路（Koken API / DOM bundle / iframe storage）から
- `src/lib/officialDomRankingRowsToStripRooms.js` — 公式イベント DOM バンドルの貢献度／広告ランキング行を、
- `src/lib/personProfiles.js` — 人物プロファイル畳み込み（person-tile-unify 第1コミット・2026-06-17）。
- `src/lib/pickBroadcasterNameForReputation.js` — 評判チェック用に「配信者名」を解決する純関数 (PR R4)
- `src/lib/popupConcurrentEstimateGate.js` — ポップアップ「推定同時接続」カードでローディングを解除するかどうか。
- `src/lib/popupWatchMetaConcurrentGate.js` — popup の同時視聴者数推定を「出してよいか」判定するゲート(DOM/公式値/直近アクティブから)。
- `src/lib/popupWatchUrlResolveMultiTab.js` — popup が参照する watch URL を「複数の候補ソース」から決める純粋関数。
- `src/lib/rankingPatrolMessages.js` — ランキング巡回(「次の上位配信へ」/ 自動巡回トグル)の共有定数と純関数。
- `src/lib/rankingVisibleRetryDecision.js` — 「タブが可視に復帰したとき、貢献度ランキング取得を再試行すべきか」を決める純関数。
- `src/lib/recentBroadcastLiveIds.js` — 最近の放送 liveId を `broadcastSessionSummary_v1` IDB から取得する純粋関数群。
- `src/lib/sameOriginContribRankingDomShape.js` — watch ページ（live.nicovideo.jp＝content script と同一 origin）の gift
- `src/lib/scrapeEventScoreRankingFromRichviewDom.js` — audition richview（イベント💎順位リスト想定）の DOM から順位つきスコア行を掬う純関数（PR2）。
- `src/lib/summarizeDevMonitorGiftRanking.js` — v0.1.202 A-0: popup「詳しい状況（開発・切り分け用・折りたたみ）」の
- `src/lib/supporterChikuranScore.js` — 「応援者ちくらん β」用のローカル集計コア。
- `src/lib/supporterPowerScoring.js` — 応援者パワー診断スコアリング（OSINT Phase 2-A・v0.1.609）。
- `src/lib/supporterRankingDom.js` — 応援者ランキングの行リスト DOM ビルダー(本物の人物タイルでそっくり)。
- `src/lib/supportGrowthInsights.js` — マーケ分析 / HTML レポート向け「次回の行動提案」を既存集計データから組み立てる（純粋関数）。
- `src/lib/timingConstants.js` — content-entry.js に散在していたマジックナンバーを集約した定数テーブル。
- `src/lib/topSupportersMirror.js` — 応援者ランキング(🥇🥈🥉)鏡の純関数(v0.1.1024)。
- `src/lib/topSupportRankStripConfig.js` — ポップアップ「応援ランキング」ストリップに並べる行数の上限（aggregateCommentsByUser の1行＝1カード）。
- `src/lib/topSupportRankStripStableKey.js` — 応援ランキングストリップの DOM を組み直す必要があるか判定するキー。
- `src/lib/venueIncrementalAggregate.js` — v0.1.754 会場の3時間安定化(会議6体ほぼ全会一致の最大ボトルネック根治): 参加者集計を
- `src/lib/viewerSelfLaneAggregate.js` — v0.1.775: popup の応援アイコン列(りんく段)に「自分(視聴者)」を出すための合成集約。
- `src/lib/watchConcurrentEstimateUiCopy.js` — 同接ツールチップ先頭に載せる、推定方式の短い説明（`renderWatchMetaCard` と一致させる）。
- `src/lib/watchFrameRank.js` — 複数 watch フレーム/タブから「今解決すべき配信」を innerText とURL一致でスコア付けして選ぶ純ロジック。
- `src/lib/watchTabPrioritize.js` — watch タブ候補リストを「対象 watch URL に最も近い」順に並べ替える純粋関数。
- `src/lib/yukkuriBroadcastSummary.js` — 放送終了後の HTML レポート / マーケ分析の頭にくる「ゆっくり解説風」要約セクション。

</details>

## 🪟 表示・演出

> 🦊りんく: 画面に見えるものは、ほぼここなのだ。
> 🦊こん太: 会場の席・群衆・吹き出し・ギフトの演出なのだ。
> 🦝たぬ姉: 応援アイコンの丸い顔もここで描くのだ。

- **popup スクロール(要素を見せる)** — .nl-main などスクロール親で、子要素を見せるための scrollTop 加算 delta を計算
  - `src/lib/nlMainScrollReveal.js`
- **会場ドラッグスクロール(パン)** — 会場を左ドラッグで縦スクロール(パン)する純ロジック。venueBar が pointer を配線して呼ぶ
  - `src/lib/venueDragScroll.js`
- **人物タイル描画(丸サムネ)** — popup 応援アイコン列の「1人ぶんのタイル(丸サムネ+ID+名前)」生成の正本 DOM ビルダー
  - `src/lib/personTileDom.js`
- **会場の席割り** — 150席上限+入れ替えで席を割り当てる。席資格(venueParticipantKey)もここ
  - `src/lib/venueSeats.js`
- **背景群衆(来場者数の表現)** — 席に出せない来場者数(PV)を背景群衆 Canvas の密度で描く
  - `src/lib/crowdRasterizer.js`
- **ギフト投擲演出** — 会場でギフト/広告を投げ主サムネから中央映像へ投げる演出の純関数群
  - `src/lib/giftThrowProjectile.js`
- **吹き出し寿命管理** — 会場の吹き出しの表示上限・追い出し(eviction)ライフサイクル
  - `src/lib/venueBubbleLifecycle.js`
<details><summary>🗂 このカテゴリの全担当ファイル(自動分類) 226</summary>

- `scripts/encode-marketing-html-avatars.mjs` — extension/images/marketing-html-avatars/*.png を data URI にし、
- `scripts/split-avatar-parts.mjs` — 偽市松背景の除去 + パーツ切り出し(one-off アセットパイプライン)
- `src/data/acquirers/laneFromStorage.js` — 応援レーン acquirer: chrome.storage.local(nls_comments) → laneStore の橋渡し。
- `src/data/sources/laneFromStoredComments.js` — 応援ユーザーレーン: 保存済みコメント配列 → LaneCandidate[] の adapter。
- `src/data/store/laneStore.js` — 応援ユーザーレーンの単一 store。
- `src/domain/lane/columns/kontaPolicy.js` — こん太段（konta）の配属 policy — 過渡状態 catchall。
- `src/domain/lane/columns/linkPolicy.js` — りんく段（link）の配属 policy。
- `src/domain/lane/columns/tanuPolicy.js` — たぬ姉段（tanu）の配属 policy。
- `src/domain/lane/evidence.js` — 応援レーンの「確定度(evidence)」判定。
- `src/domain/lane/tier.js` — 応援ユーザーレーンの tier（段）決定。
- `src/domain/user/avatar.js` — ユーザーのアバター観測信号と表示 URL を 1 箇所で組み立てる純関数。
- `src/domain/user/avatarResolver.js` — アバター解決の単一エントリポイント（Hoshino-Romi 流 single component）。
- `src/domain/user/nickname.js` — 表示名（ニックネーム）の「強弱」判定。
- `src/extension/popup/renderAcquisitionDashboard.js` — renderAcquisitionDashboard — 開発者モニタの「データ取得率」ダッシュボードを描く。
- `src/extension/story/laneContentLod.js` — 応援レーンの【中身LOD】— 枠は残す。中身だけ空にする。
- `src/extension/story/renderStoryUserLaneDom.js` — 応援ユーザーレーン DOM の同期（popup-entry から切り出し・状態は引数で受け取る）。
- `src/extension/venue-entry.js` — 会場モード(standalone)のエントリ。venueBar をページに mount するだけの薄い起動点。
- `src/extension/venueBar.js` — 会場モード UI 本体。観客の席割り・群衆・吹き出し・ギフト演出・読み上げ連動を描く。
- `src/lib/adLanePicksFromRooms.js` — 広告ランキング行(officialDomRankingRowsToStripRooms の room)を、popup/会場の人物タイル
- `src/lib/anonymousIdenticon.js` — 匿名 userId 向けの決定論的アバター（SVG data URL）。
- `src/lib/avatarBroadcasterGuard.js` — 配信者アイコン取り違え防止ガード（純粋関数）。
- `src/lib/avatarEntryCounts.js` — コメントエントリ配列から avatar の数を数える純関数。
- `src/lib/avatarLoadReport.js` — アイコン画像(usericon)の【実際のロード失敗】を状態速報の対処候補カードに出す純関数(v0.1.1026)。
- `src/lib/avatarPartsComposer.js` — 匿名ユーザー用アバターのパーツ(髪/目/口など)定義と組み合わせ合成。
- `src/lib/avatarRetrySweepThrottle.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/avatarUrlCompare.js` — アバター URL の比較用ヘルパ（純粋関数）。
- `src/lib/cardFreshnessNote.js` — カードの「鮮度」表示（最終更新からの経過）を作る純関数。
- `src/lib/celebrationCharaAssets.js` — お祝い演出で使う3キャラ(りんく/こんた/混在)の画像パス定義。
- `src/lib/celebrationCommentIncrementalScan.js` — コメント配列のギフト／広告演出: 配信ごとに初回は全件 prime のみ、以降は追加分だけ process。
- `src/lib/celebrationCommentScanSeed.js` — コメント走査系演出のシード（過去分を再発火させない）制御。
- `src/lib/celebrationFlyText.js` — ニコニコ／ボカロ MV 風 — 文字が飛び交う演出の文言生成（純関数）。
- `src/lib/celebrationPika.js` — パチンコ／ボカロ MV 風 — 画面全体「ぴかっ」フラッシュ spec（純関数）。
- `src/lib/cheerPalette.js` — 盛り上げワード（8888 / wwwww / 顔文字 等）のワンクリック挿入パレット。
- `src/lib/comeviewActions.js` — v0.1.666: コメビュのコメント単位アクション(わんコメ同等+追憶独自)の純ロジック。
- `src/lib/comeviewInstantRender.js` — コメビュ別窓で行を即時描画する純ロジック(本文の切り詰め・行の隠し判定など)。
- `src/lib/comeviewRows.js` — v0.1.652: 独自コメビュ「KIRAMEKI Comment View」の表示行ロジック(純関数)。
- `src/lib/comeviewUserNotes.js` — v0.1.667: コメビュのユーザー詳細(わんコメ式 ニックネーム/ラベル/メモ)の純ロジック。
- `src/lib/commentKindnessDisplayModel.js` — やさしさナッジ（コメント送信前の言い換え促し）の「表示モデル」を導出する純関数。
- `src/lib/commentPostWatchTarget.js` — コメント送信コンテキストだけを、表示用の「実質アクティブ watch」判定から分離して解決する。
- `src/lib/commentSummary.js` — v0.1.508: コメント記録の「軽量サマリ（0 秒表示）」純関数群。
- `src/lib/commentTickerLatestHtml.js` — コメントティッカー（最新 1 件）の表示 HTML を組み立てる純関数。
- `src/lib/commentTickerNameLink.js` — 最新コメントティッカーの名前部分に、ニコ動ユーザーページへのリンクを張るかの判定。
- `src/lib/contentViewerNicoadCelebration.js` — watch ページ（content）上で、自分のニコニ広告を DOM から即検知して演出する。
- `src/lib/deriveAvatarUrlFromUid.js` — v0.1.203 Patch 1: niconico ユーザー UID から avatar URL を確定パターンで生成する純関数。
- `src/lib/devMonitorAvatarStats.js` — 開発者向け監視: storage コメント配列からアバター／userId の集計（PII なし・件数のみ）
- `src/lib/devMonitorPaintGate.js` — v0.1.637: 開発者診断パネル(dev monitor)の重い集計を「パネルが開いているときだけ」走らせる
- `src/lib/diagPaintDeferGate.js` — v0.1.639: paint 内の「重い diag 集計(全件 O(N))をスクロール中スキップしてよいか」の純判定。
- `src/lib/domHarvestScrollDefer.js` — 「ユーザーが今まさにスクロール中か」を判定して、コメントの DOM ハーベスト
- `src/lib/effectDirector.js` — 「演出ディレクター」層(パチンコ的ゲーム性 Phase 1・Fable設計 2026-07-04)。
- `src/lib/enrichmentAvatarFallback.js` — enrichRowsWithInterceptedUserIds 内で、全ソースにアバターURLがない場合に
- `src/lib/formatGiftSubAppHistory.js` — v0.1.198: gift sub-app DOM 由来の history / totalCounts を popup 表示用に
- `src/lib/giftAdPipelineCensus.js` — ギフト/広告が「取れて→出て→鳴る」まで通っているかを
- `src/lib/giftBahamutCelebration.js` — ギフト到着時の「画面ズームイン」演出 spec（純関数）。
- `src/lib/giftDeltaFallback.js` — 「ギフト個別イベント欠落配信」のフォールバック検知(2026-07-06)。
- `src/lib/giftDisplayNickname.js` — NDGR ギフト protobuf から拾いがちな「内部用ラベル」を表示名から除外する。
- `src/lib/giftEventStore.js` — v0.1.206 Phase A: NDGR gift event の時系列ストア（純関数）。
- `src/lib/giftHistoryMirror.js` — 投げ一覧(giftHistory・koken API)の「鏡」スナップショット純関数
- `src/lib/giftHistoryMirrorKey.js` — 投げ一覧(giftHistory・koken API)鏡の storage キー正本
- `src/lib/giftHistoryNorthStarPaintKey.js` — 北極星ギフト履歴レーンの再描画スキップ用キー（v0.1.582）。
- `src/lib/giftHistoryOfficialReconcile.js` — 北極星ギフト履歴: 公式番組累計 pt と履歴 API 合計の表示整合（v0.1.581）。
- `src/lib/giftHistorySourcePreference.js` — ギフト履歴レーンの「どのデータ源を表示するか」を決める純関数（v0.1.395）。
- `src/lib/giftHistoryViewModel.js` — 北極星ギフト履歴レーン用 ViewModel（送り主集計 + 個別投げ一覧）。
- `src/lib/giftQuickStatsHtml.js` — ギフト/広告ユーザーのクイック統計（renderGiftQuickStatsPanel の本体）の HTML を組む純関数。
- `src/lib/giftRankStripConfig.js` — ギフト貢献／応援ストリップに並べる行の上限。
- `src/lib/giftSenderObservation.js` — v0.1.214: anonymous gift（userId 空）も nickname を bucket key にして
- `src/lib/giftSidebarRankTabPick.js` — ギフトサイドバー内から「貢献度ランキング」タブ相当の要素を選ぶ。
- `src/lib/giftSubAppFrameSource.js` — v0.1.230: iframe relay の送信元 frame URL を意味のあるカテゴリに分類する純関数群。
- `src/lib/giftSubAppHistoryBlocksHtml.js` — ギフトサブアプリ履歴パネル（renderGiftSubAppHistoryPanel の本体ブロック群）の HTML を組む純関数。
- `src/lib/giftSubAppIframeDomShape.js` — gift sub-app iframe（gift/koken/audition.nicovideo.jp）内の scrape が 0 件の
- `src/lib/giftThrowLedgerTableHtml.js` — ギフト投げ一覧テーブル HTML（マーケ #mkt-gift-ledger と同型・popup 用 nl- クラス）。
- `src/lib/highlightLedger.js` — 配信採点「発表演出」用のハイライト台帳(council/broadcast-scoring-SYNTHESIS.md §2.2・SC2)。
- `src/lib/highlightLedgerKey.js` — 配信採点「発表演出」用のハイライト台帳(実際に画面に出た演出だけを記録する最小台帳)の
- `src/lib/inlineBelowWideRowInsert.js` — below 配置でインラインホストを「動画列の内側」から外すための挿入点解決。
- `src/lib/inlineFirstPaintGate.js` — 初回パネル表示ゲート（横付き）の純粋判定ロジック。
- `src/lib/inlineHostAnchorScoring.js` — 埋め込みパネル（inline host）の挿入アンカー候補をスコアリングする純粋関数。
- `src/lib/inlineHostBesideSizing.js` — beside（横付き）モードの inline panel の幅・高さを最適計算する純粋関数。
- `src/lib/inlineHostDockSizing.js` — dock_bottom モードの inline panel 高さを viewport と player rect から最適計算する純粋関数。
- `src/lib/inlineHostLayoutReset.js` — インラインパネルの placement（below / beside / floating / dock_bottom）を切り替える際に、
- `src/lib/inlineHostMoveProbe.js` — ①POPインラインパネルの host(#nls-inline-popup-host)DOM移設を観測する
- `src/lib/inlineHostRecoveryGate.js` — パネルが「消えたまま戻らない」を防ぐ復帰ゲート(純関数)。
- `src/lib/inlineHostVisibilityIntent.js` — 応援パネル(inline host)を「見せる/消す」1回分の指示を組み立てる純関数。
- `src/lib/inlineModeFlags.js` — popup.html の URL クエリから「どのモードで開かれた popup か」を判定する純関数。
- `src/lib/inlinePanelFocusGate.js` — インラインパネル host element が toolbar 起点の「前面化」操作を受けられる
- `src/lib/inlinePanelLayout.js` — 視聴ページに埋め込む nicolivelog パネルの幅・位置を、動画要素の表示矩形に合わせるための純関数。
- `src/lib/inlinePanelPlacementResolver.js` — インラインパネル配置の「単一の真実」コンポーネント。
- `src/lib/inlinePanelPlacementStorage.js` — インライン配置・幅・ビューポート幅・浮遊アンカーの chrome.storage.local 正本まわり。
- `src/lib/inlinePanelShowGate.js` — 「パネルを出してよいか / 消してよいか」を決める純関数。
- `src/lib/inlinePanelViewportWide.js` — インラインパネルを「タブ幅に近い」まで広げる幅の純粋計算（content-entry から利用）。
- `src/lib/inlinePlacementQuickbar.js` — ヘッダーの「パネル位置」クイックバー用 純関数（v0.1.334）。
- `src/lib/inlinePopupHostPrimaryPick.js` — 複数 `#nls-inline-popup-host` が `isConnected` なとき、どれを primary として残すか。
- `src/lib/inlinePopupIframeVisibilityPolicy.js` — `ensureInlinePopupIframe` の early-return 経路で iframe を再表示するか（DOM 非依存の判定部）。
- `src/lib/interceptAvatarHydration.js` — profile cache の強い avatar を intercept avatar map へ補完する。
- `src/lib/kokenGiftHistoryApi.js` — koken 公式「ギフト履歴（個別イベント）」無認証 JSON API の URL 組立 & 正規化（純関数）。
- `src/lib/kokenGiftHistoryFetchClient.js` — popup / content から service-worker 経由で koken ギフト履歴 API を叩く薄いクライアント。
- `src/lib/laneDetailCells.js` — 応援レーンの観測を【打ち手が変わる単位】に割る(純関数)。
- `src/lib/laneDiag.js` — 応援アイコン列(popup レーン)の「人数整合」診断。popup が描いたレーンの純観測値を組み立てる純関数群。
- `src/lib/laneDiagKey.js` — 応援アイコン列(popup レーン)の「人数整合」観測値を popup が書き、status が読む storage キー。
- `src/lib/laneMirror.js` — 応援レーンの「鏡」スナップショット純関数。popup がレーンを描いた buckets を、status が本物の
- `src/lib/laneMirrorContract.js` — `KEY_LANE_MIRROR`(応援レーンの鏡)の【契約の正本】。
- `src/lib/laneMirrorKey.js` — popup の応援レーン(りんく/こん太/広告/たぬ姉の段組み)を「顔=avatar 含めてそっくり」status へ
- `src/lib/laneMirrorPerLivePublish.js` — laneMirrorPerLivePublish — 配信ごとの鏡(v2)と実DOM受領証を storage へ書く薄いグルー。
- `src/lib/lanePublishSkipDiag.js` — lanePublishSkipDiag — 応援レーン鏡の publish が「到達したか/何で見送られたか」を1行にする純関数。
- `src/lib/laneRosterDelta.js` — 応援レーンの「誰が消えたか」を測る純関数(v0.1.1231・Phase 1 計器)。
- `src/lib/laneRosterKeeper.js` — 応援レーンの「名簿キーパー」(v0.1.1232・Phase 2 蓄積器)。
- `src/lib/laneSceneEnvelope.js` — LaneScene一致証明の封筒(純関数)。lanescene-structural-review-DESIGN.md のMVP実装。
- `src/lib/laneSupplyOriginDiag.js` — 応援レーンの供給元(誰が entriesProvisional を書いたか)を名指しする計器。
- `src/lib/laneTickProbe.js` — ①popup の独立描画トリガ(tickIndependentNorthStar)の自己診断(v0.1.1123)。
- `src/lib/laneTileOscillation.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/lightSupplyOverwriteGuard.js` — 軽い供給(summary+tail)が完全描画を上書きするのを止める判定(純関数)。
- `src/lib/liveAudienceDom.js` — watch ページ DOM から「同時接続（ページ表示）」に近い視聴者数を読む（純関数・ベストエフォート）
- `src/lib/liveStatValuePlaceholder.js` — `.nl-live-stat-value` 向け: 数字表示かプレースホルダー文言かを判定（0.1.68 の極太フォント切替と共通）。
- `src/lib/marketingGiftThrowLedger.js` — マーケ分析 HTML 用: 「誰が・どのアイテムを・いくら投げたか」の投げ履歴台帳を組み立てる純関数。
- `src/lib/marketingHtmlAdvisorAvatars.js` — マーケ分析HTML内のキャラアイコン（単体HTMLで表示するため data URI）。
- `src/lib/mergeGiftHistoryThrows.js` — v0.1.216: 公式ギフト sub-app DOM (`ul.gift-history-list`) から scrape した
- `src/lib/migrateInlinePanelBelowToDock.js` — `below` → `dock_bottom` のワンショット移行（0.1.63 AS）。
- `src/lib/migrateInlinePanelFloatToDock.js` — 旧「ポップアップ風（floating）」利用者を画面下ドックへ一度だけ移す（公式右パネルとの衝突緩和）。
- `src/lib/migrateSuggestInitialInlinePanelPlacement.js` — 新規インストール時のみ、インライン配置キーが未保存なら画面幅で既定を一度書き込む。
- `src/lib/nameplateToggleFinder.js` — ニコ生公式の「なふだを表示」トグルを見つける(純関数)。
- `src/lib/nicoadCelebrationKey.js` — ニコ広/ギフトのシステムコメント演出を「同じコメントで二度光らせない」ための
- `src/lib/nicoAnonymousDisplay.js` — ニコ生の匿名ユーザーID（a: で始まる内部ID）向けの表示補完。
- `src/lib/nicoUserPage.js` — 汎用: ニコ生ユーザーの公開ページ URL / 表示名 を作る純関数。
- `src/lib/nicoUserProfilePage.js` — www.nicovideo.jp/user/<id> のプロフィールページに表示されている
- `src/lib/northStarLaneDom.js` — 北極星レーン(公式値レーン)の body へ mirrorHtml を sanitize して流し込むコア。
- `src/lib/northStarLaneGadgetChara.js` — 北極星レーン左ガジェットのキャラ画像（拡張ルート相対）。
- `src/lib/northStarLaneReason.js` — v0.1.244: 北極星「公式値レーン」の state 細分化用、reason 判定純関数。
- `src/lib/northStarLaneResult.js` — 公式値レーン(Koken 貢献度 / Nicoad 広告)の「取得結果」を、純関数の state 判定が
- `src/lib/northStarLaneVisibility.js` — 北極星レーンの表示/非表示を `data-lane-state` から決める純関数（副作用なし）。
- `src/lib/northStarLaneWaitingUi.js` — 北極星「公式値レーン」の取得待ち（not_yet / iframe_unrendered）用 UI 断片。
- `src/lib/officialEventBannerDom.js` — niconico の watch ページに描画される「○○さんが参加しています！」グリーンバナーから
- `src/lib/paintCompletionProbe.js` — paintCompletionProbe — 「JSが返った時点」でなく【画面に出るまで】を測る(v0.1.1320)。
- `src/lib/paintPerfLog.js` — v0.1.725: 描画(paint)コストの軽量リングバッファ記録(純関数)。
- `src/lib/paintTopSupportRankStyleIntoElement.js` — 応援帯・公式値レーン（貢献度等）で共通の `nl-top-support-rank` ブロック描画。
- `src/lib/parseGiftComment.js` — ニコ生のギフトコメント文字列をパースする純粋関数。
- `src/lib/pickTickerHighlight.js` — コメントティッカーに「留める1件」を選ぶ純関数(v0.1.1226)。
- `src/lib/popupAvatarResolver.js` — v0.1.206 Phase B: popup 表示の avatar URL を統一的に解決する純関数。
- `src/lib/popupCelebrationGate.js` — popup / watch 埋め込みパネル再描画時の応援演出ゲート（単一の開幕判定）。
- `src/lib/popupContextBarModel.js` — popup 上部の接続コンテキスト表示・復旧バー表示・stat 表面状態の純粋ロジック。
- `src/lib/popupEntryPendingSelfPost.js` — popup の表示経路で「pending self-post entry（ndgr 観測前の自コメ仮置き）」を
- `src/lib/popupMainScrollDefer.js` — 拡張ポップアップ `.nl-main` スクロール中に重い DOM 更新を見送るかどうか。
- `src/lib/popupStorageRefreshCoalesce.js` — popup / inline のコメント再描画スケジューラ。
- `src/lib/popupVisibilityGate.js` — popup / inline コメント再描画の可視性ゲート（v0.1.440）。
- `src/lib/previewRenderAckKey.js` — ②応援プレビュー(INLINE_PASSIVE)が「自分が描画できた」を status へ伝えるための専用 ack キー。
- `src/lib/privacyDisplay.js` — 共有・掲載向けに表示ラベルを短く伏せる（完全一致検索を難しくする程度。暗号化や匿名化ではない）。
- `src/lib/provisionalLaneCommentRows.js` — heavy read 完了前に応援ランキングへ載せる暫定コメント行の合成（0 秒表示用）。
- `src/lib/repaintReasonCensus.js` — 「描き直しが何回・どの理由で起きたか」を数える純関数群。
- `src/lib/reportUserThumb.js` — HTML レポート / マーケ分析の各ユーザー行に「最低サムネ」を必ず出すための
- `src/lib/resolveVisitorCount.js` — v0.1.646: 「来場(累計来場者数)」の単一定義。表示場所(popup / status / レポート)で
- `src/lib/sanitizeRoomAvatarsForBroadcaster.js` — 集計済み user room の avatarUrl から「broadcaster icon の取り違え」を除去する純粋関数。
- `src/lib/scoreCountUp.js` — 配信採点パネルの点数カウントアップ演出(council/broadcast-scoring-SYNTHESIS.md §5・SC2)。
- `src/lib/scrapeGiftHistoryList.js` — niconico ギフト sub-app の `gift-history-list` から個別ギフトを抽出する純関数（v0.1.198）。
- `src/lib/scrapeTotalGiftCountList.js` — niconico ギフト sub-app の `total-dold-count-list` から種類別集計を抽出する純関数（v0.1.198）。
- `src/lib/scrollWhiteoutProbe.js` — スクロール時の「白化(画面が一瞬白くなる)」を観測するための純判定。
- `src/lib/scrollWhiteoutReport.js` — スクロール白化(下にスクロールすると重く・一瞬白くなって・遅れて描画される)を状態速報の
- `src/lib/selfActionCelebration.js` — アプリから自分が操作した直後に返す軽量演出の spec。
- `src/lib/sessionCommentCache.js` — v0.1.650: JSONキャッシュ即時表示の本丸。「開いた瞬間に全コメント表示・ローディングなし」。
- `src/lib/storyAvatarDiagLine.js` — 応援グリッド用・診断表示（PII なし・件数のみ）。
- `src/lib/storyAvatarTvFallbackClass.js` — 人物タイル/アイコンの「リモートサムネ取得失敗→ゆっくりTVスタイルへ落とす」class 付け外しの正本。
- `src/lib/storyGrowthLimits.js` — りんく成長グリッド（story growth）の描画上限。
- `src/lib/storyLaneAvatarSrc.js` — 応援レーン(アイコン列)のタイル画像 URL 解決（state 注入型の純関数）。
- `src/lib/storyTileTvStyle.js` — ストーリータイル / レーンアバターで「ゆっくり風キャラ画像かどうか」を判定する純関数。
- `src/lib/storyUserLaneBuckets.js` — 応援ユーザーレーン: ソート済み候補を tier（profileTier）別に上限付きで分割する。
- `src/lib/storyUserLaneClickAffordanceParity.js` — ①POP応援レーンの「クリック不能な手カーソル」実害確定計器
- `src/lib/storyUserLaneContaminationGuard.js` — 応援ユーザーレーン候補から、視聴者/配信者 UID の混入を除外する判定。
- `src/lib/storyUserLaneDisplaySrc.js` — 応援ユーザーレーン（りんく・こん太・たぬ姉）のセル画像 URL。
- `src/lib/storyUserLaneGuideHtml.js` — 応援ユーザーレーンの案内 HTML（ポップアップ・E2E と共有）
- `src/lib/storyUserLaneMeta.js` — 応援ユーザーレーン(=popup「アイコン列・グリッド・診断」)の人物タイルに出す
- `src/lib/storyUserLaneRenderProbe.js` — 応援レーン描画の自己診断（council/lane-render-self-diag-SYNTHESIS.md）。
- `src/lib/storyUserLaneRenderSignature.js` — 応援レーン(renderStoryUserLane)の「見た目が同じなら DOM を付け直さない」ための描画シグネチャを組む純関数。
- `src/lib/storyUserLaneRowModel.js` — 応援ユーザーレーン: 1 ユーザー候補あたりの tier・サムネ・ソート用スコアを一箇所で組み立てる。
- `src/lib/storyUserLaneSort.js` — 応援ユーザーレーンの候補ソート正本。
- `src/lib/suggestInitialInlinePanelPlacement.js` — 新規インストール直後の「おすすめ」インライン配置（storage 未設定時のみ migrate が使う）。
- `src/lib/supportCelebration.js` — 配信中のマイルストーン演出（コメント件数・イベント順位 UP・ギフト件数）の判定。
- `src/lib/supporterRowToPersonTile.js` — 応援者ランキングの行(SupporterRow)を、本物の人物タイル(buildPersonTileEl)が要求する
- `src/lib/supportGridDisplayTier.js` — 応援ユーザーの「表示の立ち位置」（LP モック・ユーザーレーン並びの共通ルール）
- `src/lib/supportGrowthAvatarLoad.js` — 応援グリッド等のリモート avatar img の読み込みガード。
- `src/lib/supportGrowthTileSrc.js` — 応援グリッド用タイル画像 URL の優先解決（純関数）
- `src/lib/thumbDb.js` — サムネイル用 IndexedDB（コンテンツスクリプトのみで使用）
- `src/lib/thumbFifo.js` — サムネ IndexedDB の FIFO トリム用純関数（古い capturedAt 順＝先頭が最古）
- `src/lib/thumbSettings.js` — 定期サムネイル設定（ストレージ値の正規化）
- `src/lib/topSupportRankStripLines.js` — 応援ランキング上位ストリップの各行(サムネ/色アクセント/リンク)を組み立てる純ロジック。
- `src/lib/userCommentProfileCache.js` — userId 単位で表示名・個人サムネ（弱い CDN 既定アイコン以外の http URL）を蓄積し、
- `src/lib/userEntryAvatarResolve.js` — 1 ユーザーエントリーのアバター状態を組み立てる純関数レイヤ。
- `src/lib/userLaneDiagSnapshot.js` — Popup DevTools 用: lane pipeline の観測スナップショット（PII を含めない）。
- `src/lib/userSupportGridAccent.js` — Paul Tol Bright に近い 8 色を OKLCH で表現（カテゴリ識別用）。
- `src/lib/venueAvatar.js` — v0.1.712: 会場モードのアバター解決(サムネ補強)純関数。
- `src/lib/venueAvatarDiagLine.js` — 会場モード(venueBar.js)の「🩺 会場の状態」診断ブロックを組み立てる純関数群。
- `src/lib/venueAvatarReport.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/venueBubbleChurn.js` — 会場「応援TOP」吹き出しchurnの実測計器(診断先行アプローチ)。
- `src/lib/venueBubbleLayout.js` — v0.1.717: 会場モードの吹き出し(セリフ)を「席の外の最上位レイヤー」に置くための配置純関数。
- `src/lib/venueCharacterFrame.js` — 会場モードの「額縁(フレーム)」: ゆっくり3キャラ(りんく/こん太/たぬ姉)の全表情サムネを、
- `src/lib/venueCrowdMotion.js` — 会場の観客シルエット群を「生きている会場」にするための動きパラメータ(純関数)。
- `src/lib/venueDisplayRows.js` — 会場モードの「空っぽ・途中で消える・ちらつき」根治の正本(2026-06-15・会議+根本原因調査)。
- `src/lib/venueDomCensus.js` — 会場5段の【実DOM国勢調査(census)】。
- `src/lib/venueEntryQueue.js` — venueEntryQueue — 会場「入場演出」の差分検出と間引き（純ロジック・DOM を触らない）。
- `src/lib/venueGeometryVerdict.js` — 会場と①POPのタイル寸法差が「CSS不整合」か「測定対象ズレ」かを見分ける純関数(v0.1.1212)。
- `src/lib/venueHeat.js` — v0.1.732: 会場モードの「熱量の色温度」純関数。
- `src/lib/venueHoverCard.js` — 会場アイコンのホバープレビューカード(純ロジック+DOMビルダー)。
- `src/lib/venueLaneMirrorSupply.js` — 会場の「鏡優先+同型フォールバック」供給(純関数)。①POP が実 paint した5段 buckets の鏡
- `src/lib/venueLaneParity.js` — 会場レーンのパリティ計器(純関数)。会場が実際に paint した段割当列を、①POP の実描画鏡
- `src/lib/venueLiveOpenFlag.js` — 「会場モードがいま開いているか」を鏡の供給側へ伝える値。
- `src/lib/venueLiveRoster.js` — v0.1.754 会場の3時間安定化(星野ロミ・メソッド会議の本質解・6体ほぼ全会一致):
- `src/lib/venueMirrorAvatarEnrich.js` — 会場行の avatar を「①の実描画鏡(laneMirror)が解決済みの顔URL」で
- `src/lib/venueMirrorIntakeDiag.js` — venueMirrorIntakeDiag — 会場が鏡を「受け取れているか」を経路ごとに数える純関数(v0.1.1317)。
- `src/lib/venueModeCensus.js` — 会場モード専用の計器(純関数)。
- `src/lib/venueOpenCache.js` — 「会場モードが開いているか」を安く保持する。
- `src/lib/venueOpenLatency.js` — 会場モードの「開いてから見えるまで」を分解して観測する純関数(v0.1.1207)。
- `src/lib/venuePickupBanner.js` — 会場モードの「ピックアップ枠」(BSP風・v0.1.1230)。
- `src/lib/venueResidents.js` — 会場モードの常駐3キャラ(りんく・こん太・たぬ姉)の描画モデル(純関数)。
- `src/lib/venueRoster.js` — 2026-06-14 ユーザー要望「今会場にいるメンバーを視覚的に確認できるボタン・AIも人間も検証
- `src/lib/venueSeatLinkParity.js` — 会場タイルの「リンク欠落」実害確定計器(診断先行アプローチ)。
- `src/lib/venueSeatsDiag.js` — 会場モード(venueBar.js)の「座席健全度」診断。会場が描いている席の純観測値を組み立てる純関数群。
- `src/lib/venueSeatsDiagKey.js` — 会場モードの「座席健全度」観測値を会場(venueBar.js)が書き、status が読む storage キー。
- `src/lib/venueSpeech.js` — v0.1.711: ライブ会場モードの「発言→吹き出し」純関数。
- `src/lib/venueSpeechStreak.js` — 「会話の連鎖」(2026-06-15 会議の最大多数決の本命・弱点A/C):
- `src/lib/venueViewport.js` — v0.1.715: 会場モードの「映像セーフエリア」と「同時表示人数」を決める純関数。
- `src/lib/venueYukkuriNamedCensus.js` — 「名前ありゆっくり顔」実害確定計器(診断先行アプローチ)。
- `src/lib/verifiedAvatarRegistry.js` — 「推測URLだが**実際に画像が出た**」を覚えて、次から本物として扱う純関数群。
- `src/lib/viewerCelebrationMatch.js` — 視聴者本人のギフト／広告システムコメント判定（ニコ生の表記揺れに耐える）。
- `src/lib/watchCelebrationOverlay.js` — popup iframe から content script 経由で呼ぶ。
- `src/lib/watchMetaCardStateGate.js` — watch メタカードの「来場者数 / 推定同時接続」表示状態を、
- `src/lib/watchPageViewerProfile.js` — watch ページのサイトヘッダー付近からログイン中ユーザーのアイコン・表示名を推定。
- `src/lib/watchPopupCelebrationGuard.js` — popup 再描画時の応援演出ガード（純関数）。
- `src/lib/yieldToBrowserPaint.js` — 【層】L0 判定層(依存ゼロ・chrome.* 非依存)
- `src/shared/avatar/avatarUrlGuard.js` — avatar URL 比較・抽出・整合性判定の純粋関数群（shared レイヤ）。
- `src/shared/avatar/clampAvatarUrl.js` — avatar URL の長さ上限を一元適用する純関数（H2 / D-5 / S-13 の根治）。
- `tools/render-og.js` — 追憶の煌めき LP 用 OG 画像（1200×630）を生成する。

</details>

## 🔊 読み上げ

> 🦊りんく: コメントを声で読み上げる係なのだ。
> 🦊こん太: 順番待ちや年齢のチェックもするのだ。
> 🦝たぬ姉: 読みすぎないよう上限も決めてるのだ。

- **読み上げ(再生/キュー/年齢ゲート)** — コメント読み上げの再生・キュー上限・年齢ゲート・ロード状態
  - `src/lib/voicePlayer.js`
  - `src/lib/voiceReadQueue.js`
  - `src/lib/voiceAgeGate.js`
<details><summary>🗂 このカテゴリの全担当ファイル(自動分類) 16</summary>

- `src/lib/reportCompleteVoice.js` — v0.1.806: レポート(HTML/マーケ/メディアキット)の保存が【成功した直後】に、完了の合図として
- `src/lib/voiceAssignment.js` — コメント者ごとに読み上げ声(styleId/ピッチ/速度オフセット)を決定論的に割り当てる純ロジック。
- `src/lib/voiceBubbleRealtimeParity.js` — 「読み上げ」と「吹き出し(画面表示)」が
- `src/lib/voiceComment.js` — ニコ生コメント欄の最大文字数（textarea maxlength と一致）
- `src/lib/voiceDetailCells.js` — 読み上げの観測を【打ち手が変わる単位】に割る(純関数)。
- `src/lib/voiceDirector.js` — council/pachinko-ultimate-SYNTHESIS.md §4(ボイスの歯止め)+§6 Phase B の実装。
- `src/lib/voiceEffectDiag.js` — パチンコボイス演出(voiceDirector.js・Phase B)の発火/スキップ観測値を組み立てる純関数群。
- `src/lib/voiceEffectDiagKey.js` — パチンコボイス演出(voiceDirector.js・Phase B)の「発火/スキップ内訳」観測値を
- `src/lib/voiceFailureTaxonomy.js` — 【層】L0 判定層（純粋関数・I/O禁止）
- `src/lib/voiceInputDevices.js` — マイク確認でサンプルする時間（ms）
- `src/lib/voiceLagBudget.js` — 会場読み上げの件数ゲート実効上限を、処理時間EMA(実測)から動的に
- `src/lib/voiceLoadingState.js` — VOICEVOX 起動待ちのローディング表示を決める純関数群。
- `src/lib/voiceReachabilityProbe.js` — 「読み上げは今どういう状態か」を1行で断定する純関数。
- `src/lib/voiceSynthFailure.js` — 読み上げの合成失敗を分類する純関数(v0.1.1213)。
- `src/lib/voiceSynthFailureReason.js` — 読み上げ合成が失敗した「どこで・なぜ」を名前で返す純関数(v0.1.1224)。
- `src/lib/voicevoxClient.js` — ローカル VOICEVOX エンジン(127.0.0.1:50021)へ音声合成をリクエストするクライアント。

</details>

## 📊 レポート

> 🦊りんく: 配信のまとめを1枚の絵にする係なのだ。
> 🦊こん太: 順位やタイムラインを見やすくするのだ。
> 🦝たぬ姉: 後で振り返るときに役立つのだ。

- **HTMLレポート生成** — マーケ/イベント順位/タイムライン等を1枚の HTML レポートに組み立てる(popup-entry 内)
  - `src/extension/popup-entry.js`
<details><summary>🗂 このカテゴリの全担当ファイル(自動分類) 41</summary>

- `extension/marketing-export-guard.js` — マーケ分析タブ(marketing-export.html)の「何があっても開く」保険。
- `scripts/build-sound-preview.mjs` — 開発用: extension/sound/ 配下の全効果音を1枚のHTMLで試聴できるページを生成する。
- `scripts/inspect-nicolive-watch-stats.mjs` — ニコ生 watch ページの HTML から、来場・同接まわりの数値がどう埋め込まれているかを CLI で確認する。
- `scripts/layer-map-html.mjs` — ★`src/lib` の構成を【HTMLで見える】ようにする。
- `src/extension/marketing-export-entry.js` — マーケ分析レポートの別タブ化(marketing-export.html)のエントリ。
- `src/extension/popup/report/htmlReportDocument.js` — HTMLレポート(振り返り用の保存HTML)組み立てクラスタ。
- `src/lib/adMessageLines.js` — 広告主が入れた文字を、そのままレポートに残すための整形。
- `src/lib/audienceEngagementGap.js` — 来場者数は多いがコメントが少ない状態を検出するローカル分析コア。
- `src/lib/broadcastNarrativeBuilder.js` — コメント本文だけから「配信内容の流れ」を再構成する純粋関数。
- `src/lib/broadcastReportSummary.js` — HTML レポート / マーケ分析の双方で使う「放送全体の純粋集計」。
- `src/lib/commentTimelineReport.js` — 状態速報に「応援コメント(最新N件・本文)」を出す整形 lib。
- `src/lib/deepExportPolicy.js` — popup からの deep export 要求時に、仮想リスト走査を行うかを判定する。
- `src/lib/devMonitorViz.js` — 開発・テスト用監視パネル向けの純粋 HTML 断片（DOM 非依存）。
- `src/lib/exportDownloadFilename.js` — HTML / マーケ分析のダウンロードファイル名（配信開始日 + liveId）。
- `src/lib/exportStageProfiler.js` — HTML / マーケ DL の段階計測（体感調査用）。chrome 非依存の純関数。
- `src/lib/exportWaitNarration.js` — HTML / マーケ DL 待ち中の りんく・こん太・たぬ姉 セリフ（popup 吹き出し用）。
- `src/lib/htmlReportCommenterFollowSection.js` — HTML レポート向けコメンターフォロー分析ブロック。
- `src/lib/htmlReportConceptGuide.js` — HTML レポート用キャラガイド（この拡張の説明／保存ページの使い方）
- `src/lib/liveviewErrorReport.js` — 純Web③(app.tsuioku-no-kirameki.com)専用の最小エラーレポータ(v0.1.1130)。
- `src/lib/marketingChartsHtml.js` — マーケ集計(MarketingReport)から HTMLレポート用のグラフ/チャート HTML を組み立てる。
- `src/lib/marketingDynamicAdvice.js` — 0.1.33 (AH): マーケ分析の各セクションに「内容に応じて変わる」キャラ解説を出す
- `src/lib/marketingReportEmbed.js` — マーケ分析 HTML に埋め込む JSON（表計算・ツール連携用）。
- `src/lib/marketingSupportParticipationCounts.js` — マーケ分析・HTMLレポート先頭 KPI: ギフト投げ主・広告した人の人数。
- `src/lib/mediaKitHtml.js` — 追憶メディアキットの共有用 single-file HTML。
- `src/lib/mediaKitStats.js` — 追憶メディアキット向けの期間集計。
- `src/lib/northStarFallbackHtml.js` — v0.1.241: 北極星「鏡のように貼り付け」レーンの fallback HTML 生成。
- `src/lib/panelMetricsExport.js` — パネル向け速報メトリクス（content メモリ → popup 直結、storage バイパス）。
- `src/lib/reportCommentsCsv.js` — 保存コメント配列を「Excel / LibreOffice / Google Sheets で安全に開ける CSV」に変換する純関数。
- `src/lib/reportCommentsTableSection.js` — HTML レポート「保存コメント一覧」セクション。
- `src/lib/reportFriendlyMetaRowsHtml.js` — v0.1.635: HTML レポートの「やさしいメタ情報」テーブル行ビルダ + ラベル変換（純ロジック）。
- `src/lib/reportHeadInfoRowsHtml.js` — HTML レポートの「head 情報」テーブル行（link / meta / script / noopener）を
- `src/lib/reportNextMemoSectionHtml.js` — v0.1.811(星野ロミ式コンポーネント化・第4弾): popup-entry.js の buildHtmlReportDocument 内
- `src/lib/reportPreviewCtx.js` — レポートプレビューの信頼度注釈に渡す「文脈」を fastDiag から組み立てる純関数。
- `src/lib/reportSelfPostedRowsHtml.js` — v0.1.634: HTML レポートの「自分のコメント抜粋」テーブル行ビルダ（純ロジック）。
- `src/lib/reportSilentError.js` — 内部エラーを静かに記録する純ロジック(context invalidated 等の判定・メッセージ正規化)。
- `src/lib/reportThumbedUsersSectionHtml.js` — HTML レポートの「サムネ付きユーザー一覧」セクションを純粋に組み立てる。
- `src/lib/reportUserRoomTableHtml.js` — v0.1.636: HTML レポートの「ユーザー別集計テーブル」行ビルダ（純ロジック）。
- `src/lib/roomCardInnerHtml.js` — 応援ルームカード（renderUserRooms の各 <li class="room-card">）の inner HTML を組む純関数。
- `src/lib/supportTimelineHtml.js` — 応援タイムラインの行 HTML を純粋に組み立てる（v0.1.340）。
- `src/lib/topSupportRankLinesHtml.js` — 応援ランクストリップの各行（renderTopSupportRankStrip の <a>/<div> 行群）の HTML を組む純関数。
- `src/shared/html/escape.js` — ユーザー由来文字列を HTML 断片に埋め込む前にエスケープする（XSS 対策の共通実装）。

</details>

## 🩺 診断・地図

> 🦊りんく: 今このページ(状態)を作ってる係なのだ。
> 🦊こん太: 困りごとを「症状→原因→次の一手」で出すのだ。
> 🦝たぬ姉: このマップたちも、ここが作ってるのだ。

- **状態速報の整形** — 記録件数・取得率・バックフィル進捗・レーン状態などの状態テキストを整形
  - `src/lib/statusFormat.js`
- **AI診断の状態速報集約** — popup の AI診断コピー固有情報を別キーへ書き、status.html(状態速報)の AI共有まとめに集約。status を見れば全部わかる
  - `src/lib/aiSharePopupDiagKey.js`
  - `src/extension/status-entry.js`
- **状態速報の全体マインドマップ** — status.html を開けば今の状態を枝(概要/コメント取得/北極星/過去ログ/健全性/popup診断)で俯瞰。🟢🟡🔴⚪ の badge 付き折りたたみツリー(外部依存ゼロ)
  - `src/lib/statusMindmapModel.js`
  - `src/extension/status-entry.js`
- **状態速報の対処カード(症状→原因→次の一手)** — 既知パターン辞書で fastDiag/popupDiag を照合し「症状→原因(推定)→次の一手」を重大度順カードで提示。直せない原因は status の外と正直に出す(COUNCIL status-allinone)
  - `src/lib/statusActionAdvisor.js`
  - `src/extension/status-entry.js`
- **サイト健全性検証(リンク切れ防止)** — 公開ページ(LP/記事/docs)の相対内部リンク先がディスクに実在するか静的照合。外部リンクは叩かない(依存/プライバシー/速度ゼロ)。docs/site-health.md に出力・腐り検知
  - `src/lib/siteLinkHealth.js`
  - `scripts/site-health.mjs`
- **影響範囲マップ(変えたら何が壊れるか)** — esbuild の import 到達グラフを逆引きし「このファイルを変えたら、どの機能(entry)が壊れうるか」を波及機能数の降順で一覧。docs/feature-map/impact-map.md。新規ビルド/依存ゼロ(reach 再利用)
  - `scripts/feature-map.mjs`
  - `docs/feature-map/impact-map.md`
- **全体マップ(全地図への入口)** — 地図・診断・検証への唯一の入口ハブ。「どこを直す/何が壊れる/今の状態/壊れてないか/公開記事」を1枚から辿れる。迷ったらここ起点(AGENTS.md §10)
  - `docs/MAP.md`
- **影響範囲ゲート(規律を自動化)** — 星野ロミ式「規律を自動ゲートに」。diff から影響大(複数機能波及)の変更ファイルを検出し波及先機能を列挙。警告のみ(摩擦ゼロ)・--strict で exit1。AGENTS.md §10 のルールを diff 発火に
  - `scripts/impact-check.mjs`
  - `docs/feature-map/impact-map.json`
<details><summary>🗂 このカテゴリの全担当ファイル(自動分類) 79</summary>

- `api/status.js` — status 受け口 Vercel Serverless Function。
- `extension/status-guard.js` — 状態速報ページ(status.html)の「何があっても開く」保険。
- `scripts/run-verify-cc.mjs` — Claude Code 向け verify ランナー。
- `scripts/split-changelog.mjs` — scripts/split-changelog.mjs — changelog.js を直近20版(本体)と旧版(archive)に分割
- `scripts/status-live.mjs` — 状態速報(status.html の「AI共有」全文)を、コピー&貼り付けせずにターミナルへ取得する CLI。
- `scripts/verify-bump.mjs` — extension bump 後の整合性チェッカー
- `scripts/verify-deploy.mjs` — 「Chrome に配ったビルドが本当に今の版か」を照合する。
- `src/extension/popup/attachAiDiagButtonHandler.js` — attachAiDiagButtonHandler — 「AIで診断」ボタンの delegated listener を張る。
- `src/extension/sidepanel-entry.js` — サイドパネルの自己診断だけを担う極小エントリ。
- `src/lib/aiShareDiagSchema.js` — AI 共有診断バンドル（popup が組み立てる JSON / storage の nls_ai_share_fast_diag_v1）の
- `src/lib/aiShareFastDiagKey.js` — v0.1.629: AI 共有 fastDiag キャッシュの storage key を popup と status ページで共有。
- `src/lib/aiShareFullText.js` — 状態速報(AI共有)本文ビルダー。②応援ライブビュー/③WEB が同一の status-report builder を
- `src/lib/avCueDiagKey.js` — AVCue(音+視覚の単一発火点・council/pachinko-av-max-SYNTHESIS.md V1)の観測値を
- `src/lib/bgmPhaseDiag.js` — BGMディレクター(bgmDirector.js)+フェーズディレクター(phaseDirector.js)の観測値を組み立てる
- `src/lib/bgmPhaseDiagKey.js` — BGMディレクター(bgmDirector.js)+フェーズディレクター(phaseDirector.js・Phase C)の
- `src/lib/captureAuditionRichviewEventScoreDiagProbe.js` — audition.nicovideo.jp `/embedded/richview/live` 向けの診断ペイロード（PR1）。
- `src/lib/changelog-archive.js` — 追憶のきらめき 更新履歴アーカイブ（popup のバンドル外）。
- `src/lib/changelog.js` — 拡張の更新履歴データと semver 比較ヘルパ。
- `src/lib/changelogConsistency.js` — 版番号の三者一致を機械照合する純関数(v0.1.835)。
- `src/lib/changelogLineage.js` — changelog 全版を「バグ系統」で枝化する純関数(v0.1.841・修正系譜マップ 第1)。
- `src/lib/commentCountProvenance.js` — 「数字の出どころ（何を数えているか）」を状態速報に事実として出す（council/comment-count-provenance-question.txt）。
- `src/lib/commentPanelHealthProbe.js` — ニコ生の watch ページでコメント欄が「見えない／届かない」状態を検出し、
- `src/lib/commentPanelStatus.js` — コメントパネル検出失敗（DOM 変更等）をポップアップ向けに解釈する純関数
- `src/lib/commentPostDiag.js` — コメント送信(requestPostCommentToOpenTab)の「所要ms/結果/リトライ回数」観測値を
- `src/lib/commentPostDiagKey.js` — コメント送信(requestPostCommentToOpenTab)の「所要ms/結果/リトライ回数」観測値を
- `src/lib/commentPostStatusPresentation.js` — コメント送信 UI の「最終ステータス表示」と aria-describedby を決める純関数群。
- `src/lib/commentWriteModeDiag.js` — コメント記録の「書き込みモード」を1行に要約する純関数。
- `src/lib/commentWriteModeDiagKey.js` — コメント記録の【書き込みモード】(チャンク追記 or 巨大配列の丸ごと書き戻し)を
- `src/lib/customSoundDiag.js` — 「マイ効果音」(customSoundStore.js・Phase A)の取込状況を状態速報 extras(12秒間引き)に
- `src/lib/diagFlushThrottle.js` — 2026-07-06: 即時プッシュ計器(instantPushDiag)が「コメント送信バッチ毎に
- `src/lib/diagnosisRegistry.js` — 状態速報「網羅的完全性診断」の【真実の源泉(Source of Truth)】。
- `src/lib/diagnosticErrorRing.js` — chrome.storage.local に保存する診断エラーリング（純粋・マージのみ）。
- `src/lib/diagnosticRedact.js` — AI共有・診断バンドル向けの URL / 文字列のサニタイズ（純粋関数）。
- `src/lib/diagnosticRingStore.js` — 診断エラーリングを chrome.storage.local に追記（拡張コンテキスト専用）。
- `src/lib/diagnosticsTrust.js` — 「この診断の信頼性」メタ診断（council/diagnostics-completeness-root-SYNTHESIS.md 第1段）。
- `src/lib/diagPublisher.js` — 計器の「書き手」を一本化する共有ヘルパー。HANDOFF-instrument-channels-2026-08-12.md §3 のゲートG4。
- `src/lib/diagSchemaCopy.js` — 計器スナップショットを「フィールド表(schema)だけ」から機械的に組み立てる共有ヘルパー。
- `src/lib/diagWarnings.js` — v0.1.201: 診断 JSON の現在値から「なぜ取れていないか」を導出する純関数群。
- `src/lib/diagWordingGuard.js` — ユーザー向け診断カードの「実害を示唆する語」を検出する純関数(v0.1.835)。
- `src/lib/errorAutoDiagnosis.js` — v0.1.205 Phase D: 既存の診断データ（consoleErrors / networkErrors / diagWarnings）から
- `src/lib/eventSelfStatusHeaderHtml.js` — v0.1.809(星野ロミ式コンポーネント化・第2弾): popup-entry.js の純粋寄り HTML ビルダー
- `src/lib/giftEffectDiag.js` — ギフト/広告の「検知→演出(投擲)→効果音」が揃っているかの純観測値を組み立てる純関数群。
- `src/lib/giftEffectDiagKey.js` — ギフト/広告の「検知→演出(投擲)→効果音」が揃っているかの観測値を venueBar.js が書き、
- `src/lib/healthCellGroups.js` — 健全度セルを【症状の言葉】で枠に分ける(純関数)。
- `src/lib/healthCells.js` — v0.1.1056: パリティ根本修正 Phase4(この修正自体が動いているかを診断シートで検証可能にする)。
- `src/lib/instantPushDiag.js` — コメント即時プッシュレーン(storage迂回)の「送信N/受信N/表示遅延ms」観測値を
- `src/lib/instantPushDiagKey.js` — コメント即時プッシュレーン(storage迂回)の「送信N/受信N/表示遅延ms」観測値を
- `src/lib/keyboardTypeDiagnostic.js` — L12: キーボード型診断（コメンターを 5 つの型に分類）。
- `src/lib/liveHealthScore.js` — 配信ごとの「健康チェック」5段階評価(純関数)。
- `src/lib/liveviewPublishSelfDiag.js` — 純Web公開コピーの自己診断（council/status-self-diagnoses-SYNTHESIS.md）。
- `src/lib/liveViewPublishSignature.js` — 状態速報「重さ根治 P4」: publishLiveViewPublishPayload(status-entry.js)は 3秒 min-gap を
- `src/lib/milestoneEffectDiag.js` — コメント数マイルストーン(100/200/500/1000/2000/3000/5000/10000件)の
- `src/lib/milestoneEffectDiagKey.js` — コメント数マイルストーンの「検知→演出→効果音」が揃っているかの観測値を popup-entry.js が
- `src/lib/northStarMirrorPublishRace.js` — 北極星鏡publish取りこぼしの実害確定計器(診断先行アプローチ)。
- `src/lib/opSoundEffectDiag.js` — 操作音(opSoundDirector.js・Phase D1)の「押下→成功→発音」観測値を組み立てる純関数群。
- `src/lib/opSoundEffectDiagKey.js` — 操作音(opSoundDirector.js・Phase D1)の「押下/成功/発音」観測値を
- `src/lib/panelWakeCurtainDiagKey.js` — 「幕(シェード)が全画面を覆った回数」の観測値を popup-entry.js が書き、status が読む storage キー。
- `src/lib/popupAiDiagOrchestrator.js` — v0.1.211: popup「AI 診断」ボタンのオーケストレータ純関数。
- `src/lib/popupDiagAutoPublish.js` — popup を開いたとき popup 固有診断を status へ自動集約するスケジューラ(純ロジック)。
- `src/lib/popupDiagUptimeNote.js` — popup 固有診断が「popup 起動から何秒後の値か」を明示する注記を作る純関数(v0.1.1211)。
- `src/lib/previewHeavyHint.js` — 「応援プレビュー(②)を開いている間は診断更新が重い」を状態速報で名指しする純関数(v0.1.1020)。
- `src/lib/scoreAnnounceDiag.js` — 結果発表シーケンス(scoreAnnounce.js・SC3・council/broadcast-scoring-SYNTHESIS.md §2.1)の
- `src/lib/scoreAnnounceDiagKey.js` — 結果発表シーケンス(scoreAnnounce.js・SC3・council/broadcast-scoring-SYNTHESIS.md §2.1)の
- `src/lib/sidepanelSelfDiag.js` — sidepanelSelfDiag — サイドパネルが「自分がいま黒くないか」を自己申告するための純ロジック。
- `src/lib/sidepanelSelfDiagKey.js` — サイドパネル自己診断の storage キー。
- `src/lib/statusCopyFreshness.js` — 状態速報の「コピーした本文がどれくらい古いか」を、コピーする側に伝える純関数(v0.1.1222)。
- `src/lib/statusCoreBatch.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/statusExtrasBatch.js` — 状態速報「重さ根治 P2」: status-entry.js の extras ブロック(12秒間引き)が単一キー get だけの
- `src/lib/statusFastDiagLite.js` — status.html 用「軽量 fastDiag ダイジェスト」。
- `src/lib/statusMindmapSignature.js` — マインドマップの再描画を止める署名を作る純関数。
- `src/lib/statusReadPolicy.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/statusRefreshBackoff.js` — v0.1.1010: 状態速報(status.html)の自動更新を「直近 refresh の所要に比例して間引く」純関数。
- `src/lib/statusShareUrls.js` — 状態速報の共有 URL を組み立てる純関数。
- `src/lib/storyDiagMirrorKey.js` — ①「詳しい状況」診断を会場へ鏡映する legacy storage key。
- `src/lib/storyDiagTotalSource.js` — 「記録している応援コメント N 件」の N を1箇所で決める純関数。
- `src/lib/summarizeGiftSubAppHistoryDiag.js` — v0.1.201: gift sub-app DOM の payload を診断 JSON 用 summary に変換する純関数。
- `src/lib/supportVisualStoryCopy.js` — アイコン列・診断ブロックで共有する文言（二重定義防止）。
- `src/lib/watchPopupLoadDiagnostics.js` — watch インラインパネルの読み込みフェーズ計測（DevTools / 実機メモ用）。
- `src/lib/watchSnapshotAlignment.js` — content からの応答(intercept/AI診断 等)が現在解決済の watch と同じ配信由来か判定し別 live の混入を防ぐ。

</details>

## その他

> 🦊りんく: まだ分類していない機能なのだ。
> 🦊こん太: 見つけたら分類してあげるのだ。
> 🦝たぬ姉: FEATURE_CATEGORY に1行足すだけなのだ。

- **会場読み上げ診断(遅延の切り分け)** — 会場モード(comeview)の読み上げ待機件数/間引き/最終発話/合成msを観測し KEY_VOICE_DIAG 経由で status 速報へ集約。「たまに遅れる」の真因(キュー詰まり/合成遅延)を F12 不要で割る純観測
  - `src/lib/voiceDiag.js`
  - `src/lib/voiceDiagKey.js`
  - `src/extension/comeview-entry.js`
  - `src/extension/status-entry.js`
- **パネル描画診断(白化/ローディング固着)** — popup/埋め込みパネルの paint 所要ms・描画見送り・【パネルが白(未描画)か】【ローディング幕が継続中か】を nls_perf_diag_<lv> に観測し status 速報へ。「スクロールで白・放置で固着」を DOM/F12 不要で切り分ける純観測
  - `src/lib/perfDiag.js`
  - `src/extension/popup-entry.js`
  - `src/extension/status-entry.js`
- **レポートのコメント源(全件storage)** — HTML/メディアキットレポートは storage の全件(IDB→チャンク→テール)を読む。popup を当該配信で開いていても表示用キャップ済みエントリで上書きしない(v0.1.853 断線根治)。空のときだけ表示エントリにフォールバック
  - `src/lib/pickCommentsForExport.js`
  - `src/extension/popup-entry.js`
- **レポート内容プレビュー(DL前のリアルタイム可視化)** — HTML/マーケ/メディアキットの主要KPI(本文数/コメントした人=gap正本/分速/ヘビー・一度きり%/来場/沈黙視聴者推定)をレポートが使う純関数(aggregateMarketingReport/analyzeAudienceEngagementGap)で集計し、保存せず status 速報へ。popup が KEY_REPORT_PREVIEW へ15秒間引き publish→status が読む(voiceDiag と同じ storage ブリッジ)。過小集計を保存前に発見できる純観測(v0.1.858)。「コメントした人」はレポート本体と同じ gap.uniqueCommenters を正本に統一(v0.1.859・marketing の uniqueUsers は匿名で過大なので表示しない)
  - `src/lib/reportPreview.js`
  - `src/lib/reportPreviewKey.js`
  - `src/lib/reportPreviewPublish.js`
  - `src/extension/popup-entry.js`
  - `src/extension/status-entry.js`
- **応援ライブビュー(リアルタイム盛り上がり・新規タブ)** — ちくらんカードの「🔥応援ライブビューを開く」で live-view.html?lv=... を新規タブで開く(chrome.runtime.getURL)。chrome.storage を2秒購読し盛り上がり🔥(分速→computeHeatLevel)/応援者ランキング🏆(配信者タイル先頭)/🔗りんく列(数値ID+個人サムネ・categorizeUsersForThumbGrid)/🎁ギフト列(nls_gift_users_<lv>・buildGiftThrowerLaneEntries)/コメント数/来場をリアルタイム再描画。配色は popup(dark)の正確な変数に完全一致。データ取得を createLiveViewDataSource に隔離=将来サーバー公開版(拡張不要で URL 閲覧)へ移植可能(描画は不変)。Web/iOS/Android への土台(v0.1.871-875)
  - `extension/live-view.html`
  - `src/extension/live-view-entry.js`
  - `src/lib/heatLevel.js`
  - `src/lib/userThumbGrid.js`
  - `src/lib/userLaneMergeGiftThrowers.js`
- **盛り上がり判定(熱量・移植可能な純関数)** — 分速コメントから盛り上がり段階(idle/warm/hot/blazing)+スコア(バー幅%)を出す純関数 computeHeatLevel。拡張API非依存=Web/モバイルでそのまま再利用。閾値 8/30/100 per 分・score=min(100,cpm/2)。負/NaN は idle(v0.1.871)
  - `src/lib/heatLevel.js`
- **診断/ちくらん タブ+カードクリックで応援者展開** — 状態ページ【上部ナビ(.map-nav・地図リンクと同列)】に「📊診断/🏆ちくらん」切替を統合(v0.1.870)。body.tab-chikuran で診断系レーンを CSS 非表示・配信カードに集中。各配信カードに details「🏆応援者ランキングを見る」=クリックで topSupporters を🥇🥈🥉展開。応援者データは popup で開いている配信ぶんだけ(reportPreview.liveId 一致)=その配信は展開・他は popup で開く案内(死にリンクにしない)。signature に reportPreview を含めて応援者到着時にカード再構築。将来の Kimito Link ランキングの入口(v0.1.869)
  - `src/extension/status-entry.js`
  - `extension/status.html`
  - `src/lib/supporterRanking.js`
- **ちくらん風 配信カード(サムネ+来場+コメント+ギフト)** — ニコ生公式「注目番組ランキング(ちくらん)」風に、状態ページの配信カード上部へ サムネ画像+配信者名+タイトル+経過/来場/コメント/ギフト を1段表示。表示モデルは純関数 buildChikuranCardModel が正本(取れない値は null=空欄を0と偽らない・サムネ無しは枠+🎥・img onerror で壊れ画像を消す)。サムネ URL は snapshot.thumbnailUrl(og:image/channel thumb・summarizeOneLive が中継)。CSP は img-src 無指定で nicovideo CDN 画像を許可(既存 avatar と同じ)。健康チェック/詳細/放送ボタンは下に残す(v0.1.866)
  - `src/lib/chikuranCard.js`
  - `src/extension/status-entry.js`
  - `src/extension/content-entry.js`
- **応援者ランキング(ちくらん風・将来の Kimito Link ランキング)** — 視聴中1配信の「コメントした人」を件数順に🥇🥈🥉付きで表示(段階A)。aggregateMarketingReport.topUsers(件数順・既存)を整形=新規取得ゼロ。匿名(a:hash/anon:/空)は「(匿名)」と明記し過大を予告(信頼度メーターと同方針)。0件除外。reportPreview の record に topSupporters として同梱し popup→storage→status の既存ブリッジに乗る(新規キー無し)。将来は複数配信横断の累計(段階B)へ拡張する土台(v0.1.865)
  - `src/lib/supporterRanking.js`
  - `src/lib/reportPreview.js`
  - `src/extension/status-entry.js`
- **状態→放送の導線(配信カードから watch へ)** — 状態ページの配信ごとカードに「放送へ行く」状態別ボタン。今そのタブを開いていれば tabs.update で切替(別ウィンドウは windows.update で前面化)・無ければ tabs.create で新規タブ・終了済みは「終了済み」と予告して開く。切替失敗(タブ閉鎖)は新規タブにフォールバック=押しても何も起きないを構造的に潰す。lv 不正はボタンを出さない(死にリンク回避)。判定は純関数 pickOpenAction が正本・新規storage/ページ/権限ゼロ(tabs 既存)。星野ロミ式会議で A案採用(v0.1.864)
  - `src/lib/watchLink.js`
  - `src/extension/status-entry.js`
- **数字の自己矛盾の自動検知(self-verifying)** — 状態速報が自分の出した数字どうしを照合し、論理的に不可能/桁違いの食い違いを⚠に出す。コメントした人>来場・のべ別キー>本文数・レポート本文が記録総数の半分未満(過小集計の疑い)・記録が公式を大きく上回る(別配信混入/二重計上の疑い)・公式値の DOM↔NDGR 乖離(ギフトpt/広告pt が2経路で食い違う・v0.1.863)。人が目で照合しなくても診断が自動で気づく(v0.1.859・statusActionAdvisor の対処カードに統合)
  - `src/lib/numberConsistency.js`
  - `src/lib/statusActionAdvisor.js`
- **診断の信頼度メーター(数値の意味注釈)** — 各数値に「どういう意味か・どれだけ信頼できるか」の短い注釈を付け、確定値と推定値・正本と過大値の取り違えを防ぐ。コメントした人=匿名主体なら推定寄り(NDGR未受信は更に不確か)・のべ別キー=匿名で過大・沈黙視聴者=推定・取得率=backfill中は暫定。NDGR接続/uid率/backfill状態から機械的に決まるものだけ(推測の信頼度を盛らない)。reportPreview の速報行に統合(v0.1.861)
  - `src/lib/metricConfidence.js`
  - `src/lib/reportPreview.js`
  - `src/extension/status-entry.js`
- **時系列トレンド(スナップショットで見えない劣化検知)** — status が主要KPI(記録/公式/取得率/来場)を30秒間引きで storage リング(KEY_STATUS_TREND・上限120点≈1時間)に積み、analyzeTrend が「記録が止まっている(公式だけ増える=取りこぼし)」「取得率が単調に下がり続け>=10pt低下」を時間変化で検知。瞬間のスナップショットでは正常に見える劣化を捕まえる診断3層目(信頼度メーター=値の意味/自己矛盾=瞬間の食い違い/トレンド=時間変化)。statusActionAdvisor の対処カードに統合(v0.1.862)
  - `src/lib/statusTrend.js`
  - `src/lib/statusTrendKey.js`
  - `src/extension/status-entry.js`
  - `src/lib/statusActionAdvisor.js`
<details><summary>🗂 このカテゴリの全担当ファイル(自動分類) 195</summary>

- `app/app.js` — スマホ閲覧用 status Web 版。
- `app/live-view.js` — global NL_BUILD_ID
- `extension/background.js` — MV3 Service Worker
- `scripts/_merge-council.mjs` — 3ラウンド分の council JSON を1つの Markdown 議事録に統合する。
- `scripts/audit-gates.mjs` — ★**計器を計器で測る**(メタ検査)。
- `scripts/build-sounds.mjs` — extension/sound/ の効果音mp3を組み立てる。
- `scripts/build-watch.mjs` — watch では起動時刻を埋める（rebuild 毎に再 import される訳ではないので、
- `scripts/build.mjs` — .env を読み込む(status の共有キー NL_STATUS_INGEST_KEY / NL_STATUS_VIEW_TOKEN は .env から注入)。
- `scripts/capture-store-screenshots.mjs` — Chrome ウェブストア用スクショ自動撮影
- `scripts/check-improvement.mjs` — ★版ごとの実測値が【退化】していないか見張る。
- `scripts/check-layer.mjs` — ★`src/lib` が「純粋ロジックの箱」であり続けることを機械で守る。
- `scripts/check-no-secrets-in-dist.mjs` — ビルド成果物に秘密情報が焼き込まれていないか検査する(fail-closed)。
- `scripts/check-root-cause-claim.mjs` — コミットメッセージの「根治」語を検査する。
- `scripts/check-tracked-imports.mjs` — 「コミットし忘れた新規ファイルを import している」ことを機械的に検出するリリース工程ガード(2026-07-06)。
- `scripts/copy-ext.mjs` — 拡張を「同期対象外フォルダ」へコピーする(Chrome の再読み込み固着の根治)。
- `scripts/council-cleanup.mjs` — 会議ハーネス(meeting.mjs)の後始末。
- `scripts/council-lineup.mjs` — 会議メンバー名簿（クラウドのみ。ローカルOllamaは従来通り meeting.mjs 側の
- `scripts/council-roles.mjs` — 会議ハーネス共通の「役割・出力フォーマット・批判強制」定義。
- `scripts/cws-publish.mjs` — Chrome Web Store Publish API で ZIP をアップロード(+任意で公開申請)する。
- `scripts/delete-dead-lib.mjs` — scripts/delete-dead-lib.mjs — 死蔵lib実装ファイルとそのテストを削除
- `scripts/fix-src-images-mojibake.mjs` — Normalizes known mojibake paths under src/images (mirrored from kimito-link).
- `scripts/install-local-sounds.mjs` — マイ効果音「手動取込」を不要にするローカル自動同梱スクリプト。
- `scripts/layer-config.mjs` — ★どのリポでも使えるように「設定」を読む部分だけを切り出す。
- `scripts/measure-flash-frames.mjs` — 「一瞬の黒」を【画面に出たピクセル】で測る。
- `scripts/meeting-roles.mjs` — meeting.mjs の役割注入版。
- `scripts/meeting.mjs` — 会議ハーネス: 同じ問いを「無料クラウド4系統 + ローカル ollama 数体」に投げ、
- `scripts/pick-live-for-check.mjs` — 検証に使う実配信を【自動で1つ選ぶ】。
- `scripts/repo-tree-map.mjs` — リポジトリのディレクトリツリー＋各ディレクトリの「役割」を自動生成する(2026-06-18 ユーザー提案)。
- `scripts/run-e2e.mjs` — SKIP_E2E=1 のときは成功終了（CI などディスプレイなし環境用）。
- `scripts/scan-dead-lib.mjs` — scripts/scan-dead-lib.mjs — lib/ の死蔵ファイルを entry から到達性スキャンして報告
- `scripts/scout-models.mjs` — Council Scout — 会議メンバー名簿（council-lineup.mjs）の「AI社員の日課」化。
- `scripts/setup-claude-code.mjs` — プロジェクト用 Claude Code 設定を .claude/settings.json に展開する。
- `scripts/sync-lp-twitter-icon.mjs` — LP 右端コラボ用: src/images/icon/twitter-icon.png → extension/images/lp/twitter-icon.png
- `scripts/vendor-visual-explainer.mjs` — Vendors nicobailon/visual-explainer (MIT) into .cursor/skills/visual-explainer/
- `scripts/write-extension-placeholder-icons.mjs` — リポジトリに 256px アイコンしか無い環境向け: manifest 用の小さめ PNG を生成する。
- `src/extension/cloak-failsafe-entry.js` — 幕(cloak)を外す【最速の保険】だけを担う極小エントリ。
- `src/extension/offscreen-entry.js` — feat/multitab-scale-globalcap（2026-05-31）: コメント IDB の「常駐・単一書き手」を担う
- `src/lib/aboutBlankGapVerdict.js` — ★about:blank の隙間(残り32ms)に対する【確定した判定】。
- `src/lib/adMessageCensus.js` — 「広告/ギフトの生データに【メッセージ】が入っているか」を数えるだけの計器。
- `src/lib/aiShareTextChanged.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/anomalyVerdict.js` — 計器の値に「正常域」を持たせ、異常を【名指し】する純関数群。
- `src/lib/arrivalEffect.js` — ニコ生「来場」システムメッセージ(parseArrivalComment.js でパース済み)を、パチンコの
- `src/lib/autoPublishDecision.js` — ③WEB(純Web公開コピー)が古くなる前に自動で再 publish すべきかを判定する純関数(v0.1.1016)。
- `src/lib/autoSectionCensus.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/backgroundWatchTab.js` — 「Alt+Tab に出てこない裏 watch タブ(active:false)」の判定。
- `src/lib/bandScale.js` — 「大きく見せる枠(PICK UP 帯)」の倍率(純関数)。
- `src/lib/bandScaleBoot.js` — PICK UP 帯の倍率を起動時に適用する(副作用モジュール)。
- `src/lib/bgmDirector.js` — council/pachinko-ultimate-SYNTHESIS.md §5(BGM設計)+§6 Phase C の実装。
- `src/lib/blackScreenOwnerCells.js` — 黒画面の【止めている当人】をセルにする(純関数)。
- `src/lib/buildAgeCell.js` — いま動いているビルドが【いつのものか】を出す(純関数)。
- `src/lib/buildWatchMetaCardAudienceViewModel.js` — Watch メタカード「観客」ブロック用 ViewModel（DOM 非依存）。
- `src/lib/bundleBuildId.js` — dist バンドル本文から NL_BUILD_ID(JST, MMDD-HHmmss)の焼き込み値を
- `src/lib/buriedInstrumentCells.js` — 速報の文章に埋もれていた判定を【セル】として掘り起こす(純関数)。
- `src/lib/chikuranHeaderDom.js` — 「ちくらん風」配信者カードのヘッダー DOM ビルダー。
- `src/lib/classifyFeatureCategory.js` — ファイルを機能カテゴリへ自動分類する純関数(v0.1.840・マップ網羅化 第1)。
- `src/lib/cloakFailsafeMarker.js` — 外部保険(cloak-failsafe-entry.js)と本体(popup-entry.js)が
- `src/lib/cloakNotForSidePanel.js` — 「この画面で幕(cloak)を使うべきか」を言う純関数。
- `src/lib/commentMirrorPublishGate.js` — コメント鏡 publish の provisional ガード(純関数 + 状態ファクトリ・v0.1.1018)。
- `src/lib/commentTimelineMirror.js` — コメントタイムラインの「鏡」スナップショット純関数（council/liveview-wholesale-root-SYNTHESIS.md 第2段）。
- `src/lib/consoleErrorBuffer.js` — v0.1.201: window.error / unhandledrejection を捕捉する ring buffer。
- `src/lib/copyTextWithFallback.js` — テキストを「確実に」クリップボードへ入れるためのフォールバック付きコピー。
- `src/lib/currentLiveIdOrigin.js` — 「いま視聴中の配信」を【鏡とは別の起点】から決める純関数。
- `src/lib/customSoundPreset.js` — council/pachinko-ultimate-SYNTHESIS.md §2 の「85素材の完全割り当て表」をそのままJSON化した
- `src/lib/customSoundStore.js` — council/pachinko-ultimate-SYNTHESIS.md §1.2/§1.4/§1.5(Phase A)の実装。
- `src/lib/devAutoReloadDecision.js` — devAutoReloadDecision — 開発用オートリロードの判定(v0.1.1318)。
- `src/lib/devMonitorDebugSubset.js` — ポップアップ「開発・テスト用 監視」用: watch スナップショット _debug から
- `src/lib/devMonitorVizHtml.js` — dev monitor セカンダリ可視化（renderDevMonitorSecondaryViz の <div class="nl-dev-monitor-viz">）の
- `src/lib/devReloadSignal.js` — 開発用ホットリロードのシグナル判定（純関数）。
- `src/lib/domTreeCensus.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/embeddedDataExtract.js` — ニコ生 watch ページの `#embedded-data[data-props]` から初期メタ情報を抽出する純関数。
- `src/lib/eventParticipationProgramsApi.js` — ニコ生「企画イベント参加番組一覧」公式 JSON API の URL 組立 & 正規化（純関数）。
- `src/lib/executeScriptWithTimeout.js` — v0.1.441: `chrome.scripting.executeScript` を timeout 付きで実行する純関数ラッパ。
- `src/lib/externalLinksSectionHtml.js` — v0.1.812(星野ロミ式コンポーネント化・第5弾): buildHtmlReportDocument 内の
- `src/lib/formatDateTime.js` — 日時の数値（epoch ms）を日本語ロケールで `YYYY/MM/DD HH:MM:SS` 形式に整形する
- `src/lib/formatOfficialStreamAgeMinutes.js` — 視聴ページ由来の「放送開始からの経過（分）」を短い日本語にする。
- `src/lib/forwardReactivation.js` — v0.1.765「最終系(a): 入口が死んだ時だけ forward crawl を起動して再接続」の判定(純ロジック)。
- `src/lib/geminiNanoBridge.js` — v0.1.205 Phase C: Built-in AI (Gemini Nano, Chrome 138+) の薄いラッパー。
- `src/lib/globalFetchRateLimiter.js` — v0.1.664 PR4: tokenBucket.js を用いた全タブ横断の fetch レートリミッター(土台)。
- `src/lib/heavyCachePreserve.js` — 軽い read が heavy read の証跡を消さないための純関数(v0.1.1367)。
- `src/lib/hiddenPublishPolicy.js` — 「画面が隠れているとき、鏡の publish まで止めてよいか」の判定(純関数)。
- `src/lib/htmlEscape.js` — 旧パス：`src/lib/htmlEscape.js`
- `src/lib/improvementHistory.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/improvementLedger.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/initShadeDismissPolicy.js` — 初回ロードの幕(シェード)を【いつ畳むか】を決める純関数。
- `src/lib/initShadeFailsafe.js` — 初回ロード幕(.nl-init-shade)の CSS フェイルセーフとクラスの乖離を断つ純関数。
- `src/lib/instrumentSpec.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/isInsideRecommendedLiveSection.js` — v0.1.200: ニコ生 watch ページの「おすすめ生放送」セクション内 DOM を識別する純関数。
- `src/lib/lengthDelimitedStream.js` — length-delimited（varint 長 + ペイロード）の連続を分割する。
- `src/lib/liveEndedFlag.js` — 配信終了フラグ。
- `src/lib/livesCardSignature.js` — livesCardSignature — 配信カードを作り直すべきかの署名(v0.1.1320)。
- `src/lib/liveviewSnapshotFreshness.js` — 純Web応援ライブビューの「スナップショット丸ごと1枚の鮮度」判定（council/liveview-wholesale-root-SYNTHESIS.md 第1段）。
- `src/lib/mainThreadBlockerBoot.js` — メインスレッドを止めた区間を【実測】する(副作用モジュール)。
- `src/lib/mainThreadBlockerCensus.js` — メインスレッドを止めた【当人】を名指しする計器(純関数)。
- `src/lib/mcpBridge/buildMcpMismatchReasons.js` — MCP L1 snapshot の `diag.mismatchReasons` を組み立てる純関数。
- `src/lib/mcpBridge/mergeLiveMcpSnapshot.js` — Canonical Snapshot のマージ（Deterministic + Monotonic Sequence）。
- `src/lib/mcpBridge/schema.js` — L1 Canonical Snapshot の schema 定義（MCP Bridge から AI に返す正準形）。
- `src/lib/mcpBridge/validateLiveMcpSnapshot.js` — Canonical Snapshot の構造検証。schema.js の isCanonicalLiveSnapshot より詳細な
- `src/lib/memoryPressureProbe.js` — メモリ消費とDOM総数を「凍結の予兆」として判定する純関数
- `src/lib/mergeProgramStatsWatchIntoWatchMetaSnapshot.js` — 公式 DOM bundle の programStats.watchCount（累計来場）を snapshot に補完する。
- `src/lib/mirrorBundle.js` — 5種類の「鏡」を同一 tick の 1 バンドルとして扱うための合流バッファ純関数。
- `src/lib/mirrorBundleFlushScheduler.js` — 鏡バンドルの flush スケジューラ(状態を内部に閉じた純ロジック・タイマー非依存)。
- `src/lib/mirrorSanitize.js` — v0.1.237: 北極星「鏡のように貼り付け」用の自前最小サニタイザ。
- `src/lib/nameplateToggleBoot.js` — ①POP の「なふだ」ボタンを配線する(副作用モジュール)。
- `src/lib/nicoCommentPanelAssetLauncher.js` — ニコ生 watch のコメント欄付近から「ギフト / アイテム / スタンプ」等の起動ボタンを推定する。
- `src/lib/noActiveWatchDecision.js` — 「実質アクティブな watch が無い」＝画面を空にするか、を決める純関数(v0.1.1313)。
- `src/lib/northStarCharaTrioConfig.js` — 北極星 3 キャラ trio（りんく / こん太 / たぬ姉）の slot 構成と tier 連動 src 解決。
- `src/lib/northStarMirror.js` — 北極星レーン鏡(公式値レーン)のスナップショット純関数。
- `src/lib/objectUrlRevokeQueue.js` — `URL.createObjectURL` で作った blob URL を、メモリ滞留を抑えながら revoke する
- `src/lib/observerTarget.js` — MutationObserver の監視ルートを決める（ニコ生コメントパネル優先）
- `src/lib/officialEventDomBundle.js` — watch ページの DOM から「配信者の番組周辺の正本値」を 1 関数で総取りするオーケストレータ。
- `src/lib/officialEventRankChange.js` — 配信者が参加しているニコニコイベント(audition)の現在順位(scrapeOfficialEventBannerFromDom の rank)を
- `src/lib/officialEventRankSoundEffect.js` — v0.1.1053: 配信者が参加中のニコニコイベント順位が上下したら効果音(rank_up/rank_down)を鳴らす。
- `src/lib/officialNicoStatsStripDigest.js` — text: string,
- `src/lib/officialStatsWindow.js` — at?: number|null,
- `src/lib/openingFiveMinuteCorrelation.js` — L13: 冒頭 5 分の予兆 → ピーク CPM 相関（散布図用）。
- `src/lib/opSoundDirector.js` — 操作音(パチンコの「玉の打ち出し」比喩・council/operation-sound-SYNTHESIS.md Phase D1)の
- `src/lib/panelCoverCulprit.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/panelLiveSummary.js` — パネルカード用の超軽量サマリ（多タブ時の snapshot / 巨大配列 read 待ちを避ける）。
- `src/lib/panelWakeCurtain.js` — 「黒いまま」を見せないための、いつでも出せる幕。
- `src/lib/panelWakeCurtainDom.js` — 「いつでも出せる幕」の DOM 側（配線1本で使える形）。
- `src/lib/parityVerdict.js` — 3画面パリティ「①POP=②応援プレビュー=③WEBプレビュー が同一で完全か」の総合判定(純関数)。
- `src/lib/parseArrivalComment.js` — ニコ生の「来場」システムメッセージ文字列をパースする純粋関数。
- `src/lib/parseEmbeddedDataViewerInfo.js` — v0.1.203 Patch 3: niconico watch ページの `<script id="embedded-data" data-props='{...}'>`
- `src/lib/parseInterestArrivalComment.js` — ニコ生の興味タグ来場システムコメントをパースする純関数。
- `src/lib/phaseDirector.js` — council/pachinko-ultimate-SYNTHESIS.md §3(物語弧=決定論ステートマシン)+§6 Phase C の実装。
- `src/lib/pickLatestComment.js` — ストレージ上のコメント配列の並びは一定でないため、
- `src/lib/pollUntil.js` — 再読み込み直後など DOM が遅れて現れるまで待つ（純粋な間隔ポーリング）
- `src/lib/popupBooleanSettingController.js` — popup のブール設定 1 件を管理する純粋コントローラ。
- `src/lib/popupBooleanSettingsRegistry.js` — popup のブール設定コントローラをまとめて扱うレジストリ。
- `src/lib/popupCloakRevealTiming.js` — 幕(cloak)をいつ外してよいかを決める純関数(v0.1.1315)。
- `src/lib/popupDomCensus.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/popupErrorLine.js` — popupErrorProbe の速報1行を作る純関数(v0.1.1377)。
- `src/lib/popupFramePresets.js` — popup の配色プリセット（フレーム）管理。
- `src/lib/popupWatchSnapshotRetry.js` — 視聴タブのリロード直後は content script の readiness が揃わず、
- `src/lib/popupWindowEmptyHeight.js` — 0.1.71 (BA): popup window の高さを「state（active watch / empty+history /
- `src/lib/prefersReducedMotion.js` — 【層】L0 判定層(依存ゼロ・chrome.* 非依存)
- `src/lib/prewarmCoordinator.js` — 複数 watch タブで popup.html の prewarm が同時に走るのを防ぐ
- `src/lib/profileResolveState.js` — v0.1.720 PR-T2: プロフィール解決の状態管理（純関数）。
- `src/lib/protobufVarint.js` — Protobuf の非負 varint を読み取る（length-delimited の長さ用）。
- `src/lib/pruneLiveViewPublishBlob.js` — 純Web公開ペイロード(jsonBlob)の容量 prune はしご純関数
- `src/lib/pruneStaleEventDomLvs.js` — v0.1.203 Patch 4: 古い event-dom snapshot 残骸を cleanup 対象として識別する純関数。
- `src/lib/recentTextRing.js` — 「その人の直近N件の発言」を保持する固定長リングの純関数(v0.1.1218)。
- `src/lib/refreshCycleDeadline.js` — 1サイクル全体の締切を持ち、各 read の timeout を残り時間に切り詰める。
- `src/lib/refreshTaskGuard.js` — v0.1.437: popup の `refresh()` で chrome API が永久 pending になっても全カード「—」固定にしない
- `src/lib/resolveKiramekiReturningAndFirstTimeUserKeys.js` — 「きらめきの賞」のかよい / はじまり判定用 userKey 分類（純関数）。
- `src/lib/roomHeatMirror.js` — 室温(ルーム熱度・5分増減)の「鏡」スナップショット純関数
- `src/lib/safeStorageLocal.js` — v0.1.1080: 拡張リロード後の古いタブ(stale content script / iframe)が
- `src/lib/scoreAnnounce.js` — 配信採点「結果発表シーケンス」の純関数プランナー(council/broadcast-scoring-SYNTHESIS.md
- `src/lib/scoreRadar.js` — 配信採点の「講評レーダー」5軸(council/broadcast-scoring-SYNTHESIS.md §2.3)を組む純関数群。
- `src/lib/sidepanelCloakDuration.js` — 幕(cloak)が「いつ外れたか / まだ残っているか」を要約する純関数。
- `src/lib/sidepanelIframeReveal.js` — iframe を【出来上がってから見せる】ための純関数。
- `src/lib/sidepanelIframeSrc.js` — サイドパネルの iframe に渡す src を組み立てる純関数。
- `src/lib/sidePanelLvFromTabs.js` — サイドパネルが【自力で】配信IDを見つけるための純関数。
- `src/lib/sidePanelPrearm.js` — サイドパネルを【押される前に】用意しておく純関数。
- `src/lib/sidepanelUnderlay.js` — サイドパネルの【下敷き】。黒の代わりに地の色を見せる。
- `src/lib/sidePanelWatchTarget.js` — サイドパネルを「どの配信に紐づけるか」を決める純関数。
- `src/lib/silentFailureCells.js` — 【無音で死ぬ】故障を画面に出すセル(純関数)。
- `src/lib/singleFlightByKey.js` — key 単位の single-flight 実行器(純関数コア)。
- `src/lib/standalonePopupClose.js` — v0.1.433: 別ウィンドウ POP（standalone popup window）を「配信に飛ばしたら閉じる」判定（純ロジック）。
- `src/lib/storageErrorState.js` — ストレージ書き込みエラーをポップアップ向けにシリアライズする純関数
- `src/lib/storageRefreshTriggerKey.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/storageWriteLedger.js` — 2026-07-07 (robust-arch Phase 0 / 計器のみ・挙動不変):
- `src/lib/storedCommentDedupeMerge.js` — popup normalizeStoredCommentEntries 用: 同一キー重複行のマージ（PII を増やさずフラグのみ統合）
- `src/lib/supportActivityTimeline.js` — 応援タイムライン: コメントとギフト着弾を時刻順に統合する純関数（v0.1.340）。
- `src/lib/supportTimelineGuard.js` — 応援タイムラインの重い全件読み込みを実行してよいか判定する。
- `src/lib/swCrawlSlots.js` — SW backfill の per-lid 並列スロット判定。
- `src/lib/symptomVerdicts.js` — 「症状名でそのまま引ける」特化判定を**複数**出す純関数。
- `src/lib/tabLeaderLock.js` — PR1-b/PR2（feat/multitab-scale-ultraC）: 同一 origin の複数タブのうち「1タブだけ」が
- `src/lib/timeAuthority.js` — timeAuthority — 「その値がいつ真だったか」と「その値は判定に使えるか」の【唯一の正本】。
- `src/lib/timeAuthorityRegistry.js` — timeAuthorityRegistry — 「独自に時点フィールドを持つファイル」の凍結リスト(祖父条項)。
- `src/lib/tokenBucket.js` — PR5（feat/multitab-scale-ultraC）: トークンバケットによるグローバル流量制御の純ロジック。
- `src/lib/topSupportRankAnonymousFold.js` — userKey: string,
- `src/lib/trackedImports.js` — 「コミットし忘れた新規ファイルを import しているソース」を検出する純ロジック(2026-07-06)。
- `src/lib/trimMap.js` — Map のサイズを max 以下に制限し、先頭（最古挿入順）から削除する。
- `src/lib/unknownVsAbsent.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/versionMismatch.js` — 「本体とページで版がズレている」を検知する純関数(2026-07-06)。
- `src/lib/videoCapture.js` — watch ページの video から PNG を取るためのユーティリティ。
- `src/lib/viewerCountProbeMerge.js` — 【層】L0 判定層(純粋関数・I/O禁止)
- `src/lib/watchAudienceCopy.js` — watch パネル「観客メモ」用の短文・ツールチップ文言（DOM 非依存）。
- `src/lib/watchContext.js` — watch ページ URL と直前の lv から、コンテンツスクリプト用の文脈を純関数で求める
- `src/lib/watchFrameCommentPostGate.js` — watch 上の各フレームが `NLS_POST_COMMENT` / コメント欄系操作を受けてよいかの判定。
- `src/lib/watchProgramEndState.js` — 視聴ページ文言から「番組終了状態」を推定する。
- `src/lib/watchSnapshotKey.js` — heavy read の「まだ現配信のものか」を判定する snapshotKey を作る純関数。
- `src/lib/watchSnapshotOfficialFields.js` — collectWatchPageSnapshot が返すオブジェクトのうち、公式統計・キャプチャ率まわり（DOM 非依存）。
- `src/lib/watchSnapshotPartialMerge.js` — watchMetaCache.snapshot を更新する際の partial-merge 純粋関数。
- `src/lib/watchUrlFreshness.js` — 「最後に視聴した URL（nls_last_watch_url）」フォールバックの鮮度判定。
- `src/shared/niconico/liveId.js` — ニコ生 放送 ID（`lv…` / `ch…`（チャンネル枠））の正規化ユーティリティ。
- `src/speech-recognition-globals.d.ts` — Web Speech API（Chrome は webkit 接頭辞のことがある）
- `tests/e2e/constants.js` — E2E モック視聴ページ（playwright.config の webServer・manifest の host_permissions と一致させる）
- `tests/e2e/fixtures.js` — e2e テスト共通の土台(拡張をロードした Chromium 起動・test/expect の再エクスポート)。
- `tests/e2e/global-setup.js` — ローカル（CI 以外）でモック watch 用の静的サーバが未起動のとき、
- `tests/e2e/global-teardown.js` — global-setup が起動した serve の PID を片付ける（ローカル専用）。
- `tools/audit-lp-overflow.mjs` — One-off LP overflow audit (run: node tools/audit-lp-overflow.mjs)
- `tools/mcp-nicolive/server.mjs` — NicoLive Local MCP Bridge Phase1a (PoC) — stdio JSON-RPC server.
- `tools/mcp-nicolive/store.mjs` — NicoLive Local MCP Bridge - Snapshot Store.

</details>

## 🧬 修正系譜マップ(この系統のバグを過去にどう直したか)

> changelog 全 20 版を「バグ系統」で束ねた枝。同系統をまた触るとき、過去の修正と「なぜ毎回触るか」を辿る(再発防止)。新しい順。

### 🪟 応援レーン・タイル (3版)
- `v0.1.1471` 2026-08-21 — 「無い犯人を探させる」表示をやめました
- `v0.1.1468` 2026-08-21 — 開いた直後を「異常」と誤って赤くするのをやめました
- `v0.1.1456` 2026-08-20 — パネル側の部品数を測れるようにしました

### 🩺 診断・状態速報 (8版)
- `v0.1.1468` 2026-08-21 — 開いた直後を「異常」と誤って赤くするのをやめました
- `v0.1.1463` 2026-08-21 — 診断のセルに「処理時間・部品数・覆い」を出しました
- `v0.1.1462` 2026-08-21 — 重い処理を全部じどうで計測するようにしました
- `v0.1.1461` 2026-08-21 — 画面の構造(DOMの木)を数字で見られるようにしました
- `v0.1.1460` 2026-08-21 — 配信ページに書く診断データが無限に増えるのを止めました
- `v0.1.1456` 2026-08-20 — パネル側の部品数を測れるようにしました
- `v0.1.1454` 2026-08-19 — メモリと画面の部品数を計器に入れました
- `v0.1.1453` 2026-08-19 — 「パネルが2つできた」を画面に出しました

### 🗺 地図・ドキュメント (2版)
- `v0.1.1466` 2026-08-21 — 部品の構成を【絵で見られる】ページを追加しました
- `v0.1.1464` 2026-08-21 — 部品の「書く人・読む人」を機械で突き合わせるようにしました

### 🧊 storage安定 (2版)
- `v0.1.1458` 2026-08-21 — 黒く覆っている【当人】を名指しできるようにしました
- `v0.1.1456` 2026-08-20 — パネル側の部品数を測れるようにしました

### ⚡ 描画・性能 (5版)
- `v0.1.1471` 2026-08-21 — 「無い犯人を探させる」表示をやめました
- `v0.1.1469` 2026-08-21 — 前回の直しが半分だったので、残りも直しました
- `v0.1.1468` 2026-08-21 — 開いた直後を「異常」と誤って赤くするのをやめました
- `v0.1.1462` 2026-08-21 — 重い処理を全部じどうで計測するようにしました
- `v0.1.1459` 2026-08-21 — 固まっている【当人】を名指しできるようにしました

### その他 (6版)
- `v0.1.1472` 2026-08-21 — 誤った犯人を名指しする警告をやめました
- `v0.1.1470` 2026-08-21 — 版ごとの「どれだけ良くなったか」を数字で残すようにしました
- `v0.1.1467` 2026-08-21 — 検査が【自分の壊れ】に気づけるようにしました
- `v0.1.1465` 2026-08-21 — 部品の置き場所を1枚で説明する案内を追加しました
- `v0.1.1457` 2026-08-20 — 引っ張った瞬間に黒くなるのを直しました
- `v0.1.1455` 2026-08-20 — 計器の意味を1枚の台帳にまとめました
