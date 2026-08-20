import js from '@eslint/js';
import globals from 'globals';

const browserChrome = {
  ...globals.browser,
  chrome: 'readonly'
};

export default [
  {
    /*
     * 以下は ESLint が lint してはならない生成物・ベンダ成果物。
     * build/** は CWS 提出用 ZIP のために一時 staging される submission-<ver>/dist/*.js を含む
     * （AGENTS.md §4 参照）。esbuild 由来の minified 出力のため、そのまま lint すると
     * no-unused-vars / no-empty などで 900+ エラーに膨れ、lint が CI ゲートとして機能しなくなる。
     *
     * test-results/** と playwright-report/** は Playwright の per-run 出力で、
     * .gitignore 側でも除外済み。念のため lint 対象からも外す。
     */
    ignores: [
      'extension/dist/**',
      // app/dist/** は Web版(app.tsuioku-no-kirameki.com)の esbuild minified 出力。
      'app/dist/**',
      'node_modules/**',
      '.claude/**',
      // .artifacts/** は verify ログ・調査用展開物（asar 展開した第三者 minified
      // バンドル等）の作業用スクラッチ置き場。git-ignore 済みだが lint 対象だと
      // 展開した minified コードで数千 error になるため除外する。
      '.artifacts/**',
      // tests-tmp/** は実機再現の使い捨て計測スクリプト置き場（git-ignore 済み）。
      // ブラウザ実行される evaluate 断片を含むため Node の globals では必ず no-undef になる。
      'tests-tmp/**',
      'build/**',
      'test-results/**',
      'playwright-report/**',
      // v0.1.602: ユーザーがバックアップ zip を展開する作業用フォルダ。
      // 中の dist は minified 出力のため lint 対象にすると 2400+ errors になる。
      '新しいフォルダー/**',
      '新しいフォルダー */**'
    ]
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...browserChrome,
        Node: 'readonly',
        // scripts/build.mjs が esbuild --define で popup-entry.js に注入するビルド時刻
        NL_BUILD_ID: 'readonly',
        // esbuild --define で注入する dev フラグ（本番 false / dev watch true）。
        NL_DEV_HOTRELOAD: 'readonly',
        // esbuild --define で注入する release フラグ（NL_RELEASE=1 ビルドで true）。
        //   true のとき status の生診断JSON/全文共有ボタン/AI共有欄を隠す(v0.1.857)。
        NL_RELEASE: 'readonly',
        // esbuild --define で注入する package.json version(版混在の実行時検知用・2026-07-06)。
        //   chrome.runtime.getManifest().version と突合する(src/lib/versionMismatch.js)。
        NL_BUNDLE_VERSION: 'readonly',
        // status の「スマホへ送信」用に esbuild --define で注入するアップロード設定
        //（.env から。未設定時は空文字 → ボタン無効）。
        NL_STATUS_INGEST_KEY: 'readonly',
        NL_STATUS_VIEW_TOKEN: 'readonly',
        NL_STATUS_APP_ORIGIN: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    // max-lines ラチェット: 巨大entryがこれ以上成長しないよう現在値+εで上限固定。
    // 抽出が進んだら数値を下げること(増やすのは禁止)。
    // v0.1.858: レポートプレビュー機能のロジックは新規モジュール(reportPreview*.js)へ抽出済み。
    //   popup 側に残るのは「import + paint ループでの呼び出し」の最小フック3行のみ=21025→21028。
    // 2026-06-25: countUniqueAvatarEntries を src/lib/avatarEntryCounts.js へ抽出=21028→21012 に下げ。
    // 2026-06-25: 北極星レーン鏡を純Webへ送る publishNorthStarMirror(chrome.storage I/O グルー=lib抽出不可)を
    //   追加=21012→21040(意図した機能追加・レビュー済み例外)。純関数 buildNorthStarMirrorSnapshot は lib 側。
    // 2026-06-26: 応援プレビュー(passive)の上段3カード退行修正=passive 専用の
    //   applyLightweightPanelSummaryCards 初回+onChanged 配線(INLINE_PASSIVE/lv 状態に依存=lib抽出不可の
    //   storage グルー)を追加=21040→21067(council/liveview-regression-SYNTHESIS.md・レビュー済み例外)。
    // 2026-06-26: 応援プレビュー(passive)で他レーンを出す修正=応援レーンを鏡(KEY_LANE_MIRROR)から描く
    //   applyLaneMirrorForPassive + getStoryUserLaneEls 切り出し + 北極星ギフト履歴を passive で畳む
    //   collapseNorthStarGiftHistoryLaneForPassive(DOM 参照+storage read グルー=lib抽出不可)を追加
    //   =21067→21150(council/liveview-all-lanes-SYNTHESIS.md・レビュー済み例外)。
    // 2026-06-26: 純Web /live-view を拡張内プレビューと同じ全レーンにする修正=広告ランキングも鏡に積むため
    //   publishNorthStarMirror をレーン合流式に変更(_northStarMirrorLanes バッファ+contribution/ad 部分 publish の
    //   合流。INLINE_PASSIVE/liveId 状態に依存する storage I/O グルー=lib抽出不可)+ refreshNorthStarAdRankingLane の
    //   filled/nicoadAPI 経路で adRanking publish 2行を追加=21150→21187
    //   (council/liveview-web-same-as-ext-SYNTHESIS.md・レビュー済み例外)。純関数 buildNorthStarMirrorSnapshot は lib 側。
    // 2026-06-26: 応援レーン描画の自己診断=renderStoryUserLane/applyLaneMirrorForPassive の入口/分岐/出口を
    //   _storyUserLaneRenderProbe に記録(DOM 参照+描画関数フックのグルー=lib抽出不可)+ countStoryUserLaneDomTiles
    //   + 診断JSON への storyUserLaneRenderProbe 露出を追加=21187→21271
    //   (council/lane-render-self-diag-SYNTHESIS.md・レビュー済み例外)。純データの build/format/cards は
    //   src/lib/storyUserLaneRenderProbe.js(test付き)に隔離済み。
    // 2026-06-26: 純Webでコメントが進む(第2段)=publishCommentTimelineMirror(displayEntries 最新N件を鏡に publish・
    //   INLINE_PASSIVE/min-gap/storage I/O グルー=lib抽出不可)+import を追加=21271→21312
    //   (council/liveview-wholesale-root-SYNTHESIS.md・レビュー済み例外)。純データ整形 buildCommentTimelineMirrorSnapshot は
    //   src/lib/commentTimelineMirror.js(test付き)に隔離済み。
    // 2026-06-27: 応援プレビュー(passive)を開いた瞬間の重さ解消(第1段)=passive で heavy comments 全件 IDB read を
    //   走らせない短絡(read を減らすだけ)+ティッカーを鏡から描く applyCommentTimelineMirrorForPassive(DOM 参照+
    //   storage read グルー=lib抽出不可)+初回/onChanged 配線+restoreCommentTimelineRows import を追加=21312→21385
    //   (council/liveview-open-heavy-SYNTHESIS.md・レビュー済み例外)。純データ復元 restoreCommentTimelineRows は
    //   src/lib/commentTimelineMirror.js(test付き)に隔離済み。
    // 2026-06-27: 北極星レーン鏡の貢献度コピー漏れ修正(3画面パリティ P0)=publishNorthStarMirror の deferWrite と
    //   refreshAllNorthStarMirrorLanes の allSettled 後 1 回 flush(後着レーンが 3秒min-gap で落ちるのを断つ・
    //   合流タイミングのグルー=lib抽出不可)を追加=21385→21395(council/three-views-parity-SYNTHESIS.md・レビュー済み例外)。
    //   合流ロジック本体 mergeNorthStarMirrorLanes は src/lib/northStarMirror.js(test付き)に抽出済み(コピー漏れ不変条件を固定)。
    // 2026-06-27: ローディング幕の「描画済みなのに継続」誤検知修正(3画面パリティ P2)=CSS フェイルセーフ(15秒)終了の
    //   animationend で nl-init-shade--done を付け、クラスと視覚の乖離(=shadeActive 永続 true の誤検知)を断つ
    //   ensureInitShadeFailsafeClassSync(DOM イベント配線グルー=lib抽出不可)+import を追加=21395→21442
    //   (council/loading-overlay-stuck-SYNTHESIS.md・レビュー済み例外)。判定 shouldMarkInitShadeDoneOnAnimationEnd は
    //   src/lib/initShadeFailsafe.js(test付き)に抽出済み。
    // 2026-06-27: 応援プレビュー(passive)で北極星(貢献度/広告)を鏡から描く=星野ロミ型「見せる側は同じ鏡を読むだけ」を
    //   北極星にも適用(council/single-source-of-truth-SYNTHESIS.md 第1段)。applyNorthStarMirrorForPassive(KEY_NORTH_STAR_MIRROR
    //   を read→本物 paintTopSupportRankStyleIntoElement で描画・DOM/storage read グルー=lib抽出不可)+初回/onChanged 配線+
    //   restoreNorthStarMirrorRows import を追加=21442→21515(レビュー済み例外)。純データ復元 restoreNorthStarMirrorRows は
    //   src/lib/northStarMirror.js(test付き)に隔離済み。
    //   v0.1.991: renderStoryUserLaneFromLightCommentsForCurrentLive 追加=21515→21533。応援レーン(アイコン列)を
    //   heavy 全件読み非依存で現配信の軽い源(nls_csummary_)から起動する DOM/storage グルー(syncStorySourceEntries・
    //   getStoryUserLaneEls は popup ローカル=lib抽出不可)。北極星 publish 詰まり根治(v0.1.990)後に残った最後の
    //   「アイコン列だけ started=0」を断つ(council/render-not-firing 続き・実機実証済)。レビュー済み例外。
    //   v0.1.992: 独立 tick に applyLightweightPanelSummaryCards(lid) 呼び出し+lid 引数化+コメント=21533→21539。
    //   記録/同接/来場の数字カードを heavy 非依存で panel_summary から埋める(embed_watch で「—」のまま根治)。
    //   v0.1.1019: ②応援プレビューの数字カードを①が焼いた statCardsMirror 鏡から描く applyStatCardsMirrorForPassive
    //   追加=21539→21547(フルコピー根治: ②が生panelを①と別タイミングで読み ①150 vs ②129 とズレていたのを、
    //   ①=②=③同一鏡値に揃える)。sig ガード付きペインターは lib(statCardsMirrorDom.js)へ抽出済み。残る +8 は
    //   chrome.storage read が popup ローカル=lib抽出不可のグルー(既存 applyLaneMirrorForPassive 等と同型)。
    //   同時に②の生panel独自読み(setTimeout/onChanged)を廃止=鏡一本化。レビュー済み例外。
    //   v0.1.1021: renderStoryUserLane の re-render skip 経路(sig一致 early return)にも幕畳み
    //   dismissInitialLoadShade を追加=21547→21549(「描画済みなのにローディングが終わらない」根治。独立tick高頻度で
    //   2回目以降が sig 一致で early return し、幕畳み(5308)に到達せず残っていた)。dismiss は popup DOM/タイマー
    //   操作=lib抽出不可。5308 と同じ1行パターン+コメント1行。レビュー済み例外。
    //   v0.1.1023: refresh() 冒頭に INLINE_PASSIVE 早期return を追加=21549→21552(②応援プレビュー激重・真っ白の
    //   根治。②は refresh の重い本体を走らせず鏡経路で描く=①と storage を奪い合わない)。refresh は popup 本体の
    //   巨大関数=lib抽出不可。ガード1行+裏取り根拠コメント。実行時はむしろ軽くなる。レビュー済み例外。
    //   v0.1.1024: 応援者ランキング(🥇🥈🥉)の②鏡描画を追加=21552→21616(v0.1.1023 で②が refresh を止めた副作用で
    //   refresh 経由でしか描かれない応援者ランキングが②で空になったのを、①publish→②鏡描画で埋める回帰修正)。
    //   publish/passive描画は DOM/storage 操作=lib抽出不可。純関数(cells正規化/sig)は topSupportersMirror.js へ
    //   抽出しテスト済み。lane/northStar/statCards 鏡と同じ轍。レビュー済み例外。
    //   v0.1.1025: ②の実描画件数(応援者ランキング行数)を ack に載せる=21616→21619(嘘の✅根治。parity が①鏡と
    //   突合し②の描画欠落を🔴に。DOM件数取得は popup 依存=lib抽出不可)。レビュー済み例外。
    //   v0.1.1026: 広告列の空畳み振動を抑制=21619→21624(ポーリングで一瞬空になるたび広告列を畳む→再表示の高さ振動で
    //   下のアイコングリッドが揺れていた。一度実データを描いたら一瞬の空では畳まない)。DOM判定は popup 依存=lib抽出不可。
    //   v0.1.1028: ②応援者ランキングの匿名の顔崩れ根治=21624→21629(①POP(8208)と同じ anonymousIdenticonResolver 等を
    //   ②の applyTopSupportersMirrorForPassive に注入。無いと匿名の顔が identicon にならず blank.jpg で崩れる)。
    //   v0.1.1033: 応援レーンの「たぬ姉が少なすぎる」真因(refreshGen レースで heavy が settled に到達しない)を
    //   状態速報から観測する計器を heavy 完了コールバックの early-return 4分岐に配線=21629→21633。純関数は
    //   storyUserLaneRenderProbe.js(テスト付)に隔離済みで、popup 側は callback 内の記録1行ずつのみ(lib抽出不可)。
    //   v0.1.1034: 上の race を根治=heavy 再利用条件を chunkTotal 完全一致から 80%カバー(cachedHeavyCoverageOk)へ緩め、
    //   heavyDataPromise を即 resolve させてレース窓を消す=21633→21636(条件式の inline 変更・lib抽出不可)。
    //   v0.1.1035: レビュー指摘の初回レース残存を塞ぐ=heavy callback が refreshGen で bail する時も、snapshotKey 一致の
    //   有効な全件をキャッシュだけ最新化(stale 描画はしない)→次 refresh が 1034 の再利用に乗り settled で始まれる=21636→21642。
    //   v0.1.1057: HTMLレポート組み立てクラスタ(buildHtmlReportDocument他10関数・約1790行)を
    //   src/extension/popup/report/htmlReportDocument.js へ切り出し=21764→19974。ラチェットを
    //   実測値+50(緊急hotfix用の呼吸代)へ下げる。10年後も楽できる設計の第一歩(popup-entry.js
    //   のcomposition root化)。新モジュール側にも max-lines: 800 の予防ラチェットを設置。
    //   Phase A(2026-07-05): マイ効果音差し替え(IndexedDB取込+割当)のdeps注入配線
    //   (initCustomSoundRuntimeOnce/buildEffectSoundDeps・chrome.storage I/Oグルー=lib抽出不可。
    //   純関数/IDB操作本体は src/lib/customSoundStore.js・customSoundPreset.js にテスト付きで隔離済み)
    //   を追加=19974→20082(council/pachinko-ultimate-SYNTHESIS.md §6 Phase A)。
    //   Phase B(2026-07-05・v0.1.1073): パチンコボイス演出の発火配線(tryPlayVoicePopup/突破・大当たり
    //   チェーンのsetTimeout直列実行・会場優先プレゼンス判定=chrome.storage/タイマーのグルー=lib抽出不可。
    //   歯止め判定本体(voiceGate)と診断整形は src/lib/voiceDirector.js・voiceEffectDiag.js に
    //   テスト付きで隔離済み)を追加=20082→20254。ラチェットは実測+50の20304へ。
    //   Phase C(2026-07-05・v0.1.1074): BGM/フェーズディレクター配線(advancePhaseDirectorPopup・
    //   フィーバーBGM開始/終了・ボイスR条件トリガ・トグル配線=chrome.storage/タイマー/DOMのグルー=
    //   lib抽出不可。純関数本体は src/lib/phaseDirector.js・bgmDirector.js・bgmPhaseDiag.js に
    //   テスト付きで隔離済み)を追加=20254→20519。ラチェットは実測+50の20569へ。
    //   Phase D1(2026-07-05): 操作音配線(triggerOpSound/triggerOpSoundHandlePress/
    //   triggerOpSoundShotSuccess・submitComment/トグル/コピー/公開ボタンへの1行フック=
    //   chrome.storage/DOMのグルー=lib抽出不可。純関数本体は src/lib/opSoundDirector.js・
    //   opSoundEffectDiag.js にテスト付きで隔離済み)を追加=20519→20663。ラチェットは実測+50の20713へ。
    //   v0.1.1077: 状態速報で確定した不具合の修正(ボイスゲート空振り消費防止/payout張り付き
    //   フォールバック/フェーズチップ追加=isUnassignedVoiceKey判定・schedulePayoutFallbackPopup・
    //   paintPhaseMeterPopup/triggerPhaseMeterPulsePopup。DOM/タイマー/chrome.storageのグルーで
    //   lib抽出不可。純関数本体はvoiceDirector.js・phaseDirector.jsにテスト付きで隔離済み)を
    //   追加=20663→20789。ラチェットは実測+50の20839へ。
    //   リリース工程ガード「版混在の実行時検知」(2026-07-06): checkVersionMismatchBanner
    //   (chrome.runtime.getManifest()と突合するDOM反映グルー=lib抽出不可。純関数本体は
    //   src/lib/versionMismatch.jsにテスト付きで隔離済み)を追加=20789→20845。ラチェットは実測+50へ。
    //   感度パッチ(2026-07-06・v0.1.1083): コメント送信の総締切配線(withCommentPostDeadline呼び出し・
    //   revert厳格化条件・計器カウンタ更新=submitComment内のchrome.storage/DOMのグルー=lib抽出不可。
    //   純関数本体はsrc/lib/commentPostDeadline.js・commentPostDiag.jsにテスト付きで隔離済み)を
    //   追加=20845→20910。ラチェットは実測+50の20960へ。
    //   v0.1.1092: コメント即時プッシュレーン(storage迂回)の受信配線(window message リスナ・
    //   STORY_SOURCE_STATE への合流・renderStoryUserLane 軽量再描画・計器カウンタ更新=DOM/
    //   chrome.storageのグルーでlib抽出不可。純関数本体はsrc/lib/instantCommentPush.js・
    //   instantPushDiag.jsにテスト付きで隔離済み)を追加=20910→21116。ラチェットは実測+50の21166へ。
    //   2026-07-06: 「別の配信へ移動(SPA遷移)するとパネルが壊れる」修正=INLINE_OWN_WATCH_URL の
    //   let化+in-place更新関数・NLS_LIVE_CHANNEL_SWITCH 受信配線(window message リスナ・
    //   commentPostUiContext即時更新・refresh()軽量再描画・計器カウンタ更新=DOM/chrome.storageの
    //   グルーでlib抽出不可。純関数本体はsrc/lib/liveChannelSwitch.js・channelSwitchDiag.jsに
    //   テスト付きで隔離済み)を追加=21116→21252。ラチェットは実測+50の21302へ。
    //   SC1(2026-07-06・v0.1.1098): 配信採点の感性ボーナス用フェーズ実績計器
    //   (reachCount/breakthroughCount/jackpotCount/rMax/hotDwellMs/elapsedMs)を
    //   advancePhaseDirectorPopup に追加=BGMトグルと無関係に数える必要がありphaseFor呼び出し点の
    //   chrome.storage計器グルーでlib抽出不可(council/broadcast-scoring-SYNTHESIS.md §1.2)。
    //   21252→21322。ラチェットは実測+50の21372へ。
    //   SC2(2026-07-06・v0.1.1099): popup採点パネル配線(renderBroadcastScorePanel・
    //   appendHighlightAndPublishPopup・フェーズ遷移/マイルストーン確定点へのハイライト台帳追記
    //   フック=chrome.storage read/toggleリスナー配線のグルーでlib抽出不可。liveId突合・
    //   スコア計算・レーダー計算・ハイライト選抜の合成本体は
    //   src/lib/broadcastScorePanelViewModel.js(テスト付き)に隔離済み)を追加=21322→21440。
    //   ラチェットは実測+50の21490へ。
    //   SC3(2026-07-06): 結果発表シーケンス配線(runScoreAnnounceSequence・runScoreAnnounceStep・
    //   buildScoreAnnounceInputs・bindLiveEndedScoreListenerOnce・手動ボタン/P4破棄フック=
    //   chrome.storage.onChanged購読・setTimeout直列実行・DOM演出クラス切替のグルーでlib抽出不可。
    //   純関数プランナー本体は src/lib/scoreAnnounce.js・診断整形は src/lib/scoreAnnounceDiag.js に
    //   テスト付きで隔離済み)を追加=21440→21693。ラチェットは実測+50の21743へ。
    //   第2号(2026-07-07・③WEB投げ一覧丸写し): publishGiftHistoryMirror(paint済みctxを鏡バンドルへ
    //   反映するグルー=INLINE_PASSIVE/storageのグルーでlib抽出不可)+import+refreshNorthStarGiftHistoryLane
    //   のpaint後publish 1行+subAppCtx への ledgerRows 透過=chrome.storage/DOM依存でlib抽出不可。
    //   鏡スナップショット純関数本体は src/lib/giftHistoryMirror.js(テスト付き)に隔離済み
    //   (reference_full_mirror_SYNTHESIS.md B2-3)。追加=21743→21777。ラチェットは実測+50の21827へ。
    //   M3(室温)/M5(記録サマリ推移)で publishRoomHeatMirror/publishSessionSummaryMirror+import を追加
    //   (chrome.storage/DOM依存のグルー1行ずつ・純関数本体は roomHeatMirror.js/sessionSummaryMirror.js に隔離)。
    //   実測21842。ラチェットは実測+50の21892へ。
    //   heavyRace再発の根治(v0.1.1109)で描画単調性ガード+canReuse fresh-read+readAtMs+計器のグルー
    //   (判定純関数は shouldKeepStoryUserLaneTilesOnShrink/decideHeavyChunkReadReuse に隔離・chrome/DOM依存の
    //   配線1行ずつのみ popup 側)。実測21902。ラチェットは実測+50の21952へ。
    //   D-0計器(v0.1.1123)で tick結末probe+幕probe のグルー(計数純関数は laneTickProbe.js/
    //   watchPopupLoadDiagnostics.js に隔離・popup側は record 1行ずつ+診断JSON露出)。実測21963。
    //   ラチェットは実測+50の22013へ。
    //   診断カウンタchurn根治(2026-07-14 diagnostic-architecture-strengthen-DESIGN.md C-3)で単調ゲート
    //   のグルー(判定純関数は storyDiagMonotonic.js に隔離・popup側は3関所への適用+forget呼び出しのみ)。
    //   実測22034。ラチェットは実測+50の22084へ。
    //   lane-never-drop(2026-08-02・v0.1.1232): 応援レーンの表示上限48を撤廃し、「一度出た人」を
    //   名簿から復活合流させる配線を追加(ユーザー確定の不変条件「1度出た人はずっと出る」)。
    //   純関数の名簿ロジックは src/lib/laneRosterKeeper.js にテスト付きで隔離済み=popup 側は
    //   import/state/呼び出しの最小フック6行のみ。残りは既存コメントの契約更新
    //   (limit と鏡cap の関係が①③非対称に変わったため、旧「必ずセットで変更」注記を書き換え)。
    //   実測22104。ラチェットは実測+50の22154へ。
    //   lane-supply-fail-closed(2026-08-04・v0.1.1249): provisional 既定値を fail-closed へ反転し
    //   (申告漏れが「タイル消失」でなく「最長10分stale」に倒れる)、供給元を名指しする計器を追加。
    //   計器の状態・判定・整形は src/lib/laneSupplyOriginDiag.js にテスト付きで隔離=popup 側は
    //   import/state/呼び出し3箇所+origin タグ6箇所の最小フックのみ(縮小判定も lib へ寄せた)。
    //   実測22174。ラチェットは実測+50の22224へ。
    // v0.1.1277: yieldToBrowserPaint に setTimeout の競走を足して +1行(22225)。
    //   サイドパネルが裏に回ると rAF が凍り html_report_build_timeout になる真因の修正。
    //   ★機能追加ではなくバグ修正での増加。実測22225 → ラチェットは実測+50の22275へ。
    // v0.1.1284(venue-exact-parity MVP): ①実DOMのキー列指紋を鏡へ同梱する配線を追加=22225→22284。
    //   内訳は (a)import 2行 (b)_lastPublishedLaneMirrorHash の宣言と控え (c)paint 直後の
    //   _laneDomSelfLast を指紋つきオブジェクトへ拡張 (d)resize で控えを捨てるリスナー、の4点のみ。
    //   ★純関数(laneDomFingerprint/perTierKeysOf/buildVenueSceneReceipts)は全て lib 側に
    //     テスト付きで隔離済みで、popup 側に残るのは chrome/DOM グルーだけ(lib抽出不可)。
    //   実測22284 → ラチェットは実測+50の22334へ。
    // 2026-08-10(Phase 2 の実抽出2件): renderAcquisitionDashboard(121行)と
    //   attachAiDiagButtonHandler(128行・専用の module state 2つも同伴)を
    //   src/extension/popup/ へ抽出=22332→22064。ラチェットを実測+36の22100へ下げた。
    //   ★抽出候補は棚卸し済み(依存ゼロの関数が他に6個・約440行)。
    //     docs/handoff/giant-entry-split-PHASE2-INVENTORY-2026-08-10.md
    // 2026-08-10(v0.1.1315・サイドパネル黒画面の根治): 幕(cloak)の解除を
    //   キャッシュヒット経路にも配線=22100→22117(+17)。
    //   ★実機の計器が名指しした真因: t+60ms で面積あり・全層✅・地はクリームなのに
    //     幕だけ t+1238ms まで残る=約1.2秒「中身が見えない」状態が続いていた。
    //     解除指示が `if (!snapshotCacheHit)` の中と heavy read の後にしか無く、
    //     キャッシュに当たるとブロックごと飛ばされて遅い経路しか残らなかった。
    //   ★判定は純関数 src/lib/popupCloakRevealTiming.js(テスト付)に隔離済みで、
    //     popup 側に残るのは paint/reveal の DOM グルー3行だけ(lib抽出不可)。
    //   実測22117 → ラチェットは実測ちょうどの22117へ(+εを取らない=次も必ず意識させる)。
    //
    // ★2026-08-11(v0.1.1324) 22117 → 22119(+2)。会場の鏡が映らない真因
    //   (heavy read を毎回 STALE_SNAPSHOT で捨てていた)の根治で、
    //     ① `import { buildWatchSnapshotKey } from '../lib/watchSnapshotKey.js';`(1行)
    //     ② snapshotKey 生成箇所の由来コメント(1行)
    //   の2行だけ増えた。★判定ロジック本体は純関数 src/lib/watchSnapshotKey.js
    //   (単体11+配線5テスト付)へ隔離済みで、popup 側に残るのは呼び出し1行のみ。
    //   = このファイルを太らせる変更ではない(むしろ鍵の作り方を lib へ出した)。
    // ★2026-08-12(v0.1.1377-1378) 22119 → 22126(+7)。バグ検出の計器2つを配線した分。
    //   ① popup の例外記録(旧実装は握り潰すだけで何も残さず、一番見る画面の例外が
    //      どこにも残らなかった): import 2行 + buffer 1行 + install 1行 + snapshot 1行
    //   ② サムネ/ID/名前の取得率(ユーザー確定「これが価値高い」): 集計1行 + snapshot 1行
    //   ★どちらも判定・整形・組み立ての本体は純関数へ隔離済み
    //     (src/lib/popupErrorLine.js / src/lib/identityAcquisitionCensus.js・テスト付)。
    //     popup 側に残るのは呼び出しだけ=このファイルを太らせる変更ではない。
    //   ★行数を削るためにコメントから根拠を削るのは本末転倒なので、
    //     実測ちょうど(22126)へラチェットする(+εを取らない=次も必ず意識させる)。
    // ★2026-08-12(v0.1.1380) 22126 → 22129(+3)。fail-open 5件目(58→17枚の縮小が
    //   `roster-unestablished` を通り抜けた)の根治で、ガードへ paintedTiles を渡す
    //   1行と、その理由コメント2行が増えた。判定ロジック本体は純関数
    //   src/lib/lightSupplyOverwriteGuard.js(実機値を再現する単体テスト付)にある。
    // ★2026-08-12(v0.1.1381) 22129 → 22200(+71)。黒画面8版目(会議で設計・正本=
    //   docs/handoff/sidepanel-black-council-MINUTES.md)の2件。
    //   ① 幕(cloak)の判定共有: import 1行 + ensurePopupPrimaryCloakedBeforeFirstReveal の
    //      ガード分岐(外部保険が既に外していたら付け直さない)。
    //   ② シェード締切を「初回可視」起点へ: armInlineShadeDeadlineOnFirstVisible の追加
    //      (prewarm では締切を始めず、見えた瞬間から2.5秒)+ 再入時のタイマー掃除1行。
    //   ★増分の大半は【なぜそうするか】のコメント。7版空振りした症状なので、
    //     次に触る人が「窓0x0は不可侵」「これは黒を消す版ではない」を読めることに価値がある。
    //     行数を削るためにコメントから根拠を削るのは本末転倒(前回の判断を踏襲)。
    //   ★判定・要約の本体は純関数へ隔離済み(src/lib/cloakFailsafeMarker.js /
    //     eventLoopStallSummary.js・単体+配線テスト付)。popup 側は呼び出しのみ。
    // ★2026-08-12(v0.1.1382) 22200 → 22243(+43)。storage 全件読みの根治。
    //   migration 4本が各自 `get(null)`(20.7MBで実測1,157ms)を叩いていたのを、
    //   `readCommentBagForMigrationCheap()` 1本に集約(getKeys()でキー名だけ取り→
    //   `nls_comments_lv*` だけ読む。getKeys が無い旧Chromeは従来どおり全件読みへ倒す)。
    //   ★新規発明ではなく content-entry.js の readPrunableStorageBagCheap(v0.1.419)の横展開。
    //   ★増分の大半は【なぜ全件読みが危険か】の根拠コメント(実測値つき)。
    //     拡張の全ページが同一メインスレッドを共有する事実は、次に触る人が
    //     知らないと必ず同じ穴を掘る(現に popup 側だけ3ヶ月取り残されていた)。
    //   検査: src/lib/storageFullReadCensus.test.js が全件読みの箇所を【数で固定】する。
    files: ['src/extension/popup-entry.js'],
    // ★2026-08-13(v0.1.1386) 22243 → 22311(+68)。「サムネが白い」の実害根治。
    //   uid から式で組んだサムネURLは実在未確認のため score=1 のままで、速報は
    //   「実サムネ0%」と言い続けていた。しかし実測では推測URLの多くが実在した
    //   (curl で5件中3件が HTTP 200・4KBの画像が返る)。
    //   ＝白いのはURLが悪いのではなく【実在を確認する経路が無かった】。
    //   ★直し方の肝は「追加の通信をしない」こと: 画面は既にその URL で <img> を
    //     描いており onload で成功が分かる。その事実を拾うだけで実在確認になる。
    //   増分は onRemoteSuccess の記録フック + 間引き保存の2関数と、その根拠コメント。
    // ★2026-08-13(v0.1.1387) 22311 → 22343(+32)。上の記録を【読む側】を配線した。
    //   記録しただけでは v0.1.1378(サムネ0%を数えただけで直さなかった)と同じ失敗になる
    //   ([[unwired-judgement-is-systemic-2026-08-12]])。起動時に1キー読んで集合を作り、
    //   lanePickCtx 経由で thumbScore 判定に渡す。覚えた瞬間にも集合へ入れる
    //   (storage保存は10秒間引きなので、無いと最大10秒판定が遅れる)。
    //   ★判定・正規化・上限の本体は純関数 src/lib/verifiedAvatarRegistry.js
    //     (単体11 + 配線5テスト)に隔離済み。popup 側は DOM/storage グルーのみ。
    // ★2026-08-17(v0.1.1416) 22343 → 22381(+38)。コメント47秒遅延の調査を止めていた
    //   【計器の矛盾】を解いた。同じ速報に「最大タイマー遅延=753ms ✅健全」と
    //   「即時プッシュ 配達平均47,686ms」が並んでいたが、**どちらも嘘ではなかった**:
    //     - タイマー計器は hidden 中を数えない(Chrome の間引きを停止と誤報しないため・正しい)
    //     - postMessage は間引かれないので、配達 gap だけが hidden 中も伸び続ける
    //   ＝配達平均が1つの数のままでは「裏タブで溜まっただけ(正常)」と
    //     「可視なのに詰まっている(異常)」が混ざり、次の一手が決まらなかった。
    //   増分は可視中だけの EMA 変数1本と、受信ハンドラでの可視/hidden 振り分け + 根拠コメント。
    //   ★新しい storage read は足していない(既存 delta に相乗り)。計器を足して診断を
    //     重くした v1403-1408 の再演を避けるため
    //     ([[instrument-can-kill-the-page-it-measures-2026-08-16]])。
    //   ★判定・文言の本体は純関数 src/lib/instantPushDiag.js(変異で赤を確認済)。
    // ★2026-08-17(v0.1.1418) 22381 → 22408(+27)。ユーザー実機「まだ黒い」への対処。
    //   サイドパネルを開いた直後の暗い時間(初回シェード)の上限を 2.5秒 → 0.9秒 へ、
    //   データ到着ポーリングを 200ms → 60ms へ下げた。
    //   ★増分はすべて【なぜ下げてよいか】の根拠コメント:
    //     - この上限が効くのは「データが最後まで来なかったとき」だけで、
    //       来た場合は5つの早期解除経路が先に外す(=早く外れる副作用は無い)
    //     - 実測(実ブラウザ)で popup.html の色確定は72ms、about:blank の隙間は11ms。
    //       レイアウト安定に2.5秒は要らない
    //   ★CSS 保険(popup.html の @keyframes)も同時に 50%→18% へ動かすこと。
    //     片方だけ下げると体感時間が変わらないまま緑になる(v0.1.1414 の再演)。
    //     contentBlindTime.wiring.test.js が両者の関係を機械照合する(変異で赤を確認済)。
    // ★2026-08-17(v0.1.1423) 22408 → 22426(+18)。幕(cloak)を付けるのをやめた。
    // ★2026-08-19(v0.1.1444) 22426 → 22427(+1)。
    //   初回シェードが hidden の間【一度も畳まれない】穴を塗ぐ arm() の1行。
    //   実測(状態速報): dismissCalls=0 / docHidden=1 /
    //   「初回シェード t+801ms まで中身を覆っていた ★主因=初回シェード」。
    //   ★判定本体は src/lib/initShadeDismissPolicy.js へ逃がしてあり、
    //   ここに増やしたのは呼び出し1行だけ。
    //   増分は【なぜやめたか】の記録のみ(実装は setAttribute を1行消しただけ)。
    //   ユーザー証言「サイドパネル導入時は問題なかった」を git log で裏取りし、
    //   v0.1.1279 で幕を足した版から黒が始まったことを確認した。
    //   以後12版・sidepanel.html は25行→200行まで「黒を消す工夫」を積んだが
    //   実機の黒は一度も消えなかった。＝足すのをやめ、始まりへ戻す判断。
    //   ★この記録を消さないこと。消すと「なぜ幕が無いのか」が分からなくなり、
    //     善意で再び足されて同じ12版を繰り返すことになる。
    // ★v0.1.1450(22427→22492・+65行): サイドパネル黒画面の真因を実測で確定し、
    //   onChanged→北極星tick の無間引き直呼びを既存スロットルへ通した。
    //   実測(実ブラウザ25.9MB): コメント1件で read 60〜103本 / 10秒で149回・待ち7,698ms。
    //   増えた65行の大半は**なぜそうしたかの根拠**(共用スケジューラが使えない理由・
    //   initialRefreshDone を渡してはいけない理由・700ms の算出)。
    //   ★次に触る人が同じ地雷を踏まないためのコストとして、この増加は意図的。
    //   抽出でこの数値を下げるのは歓迎(増やすのは禁止のまま)。
    // ★v0.1.1456(22492→22521・+29行): popup(iframe)側の DOM 量を数える採取を足した。
    //   ★v0.1.1454 で入れた「画面の部品数」は **watch ページ本体**の数で、
    //     実測(ユーザー実機)は 1,441個・メモリ上限の2% ＝ **watch 側は正常**だった。
    //     それでも「ページが応答しません」が出た＝**膨らむ側(popup.html)を誰も測っていない**。
    //   判定は `src/lib/popupDomCensus.js`(純関数)に置き、ここは採取だけ。
    //   ★storage read は増やしていない(既存の計器バッチに相乗り)。
    // ★v0.1.1458(22521→22548・+27行): パネルを覆っている【当人】を名指しする採取を足した。
    //   ★ユーザーは「サイドパネル全部が黒い」と何度も報告したのに、速報には
    //     「中央の塗り主=iframe」としか出なかった。外側(sidepanel.html)の計器は
    //     中央にある iframe しか返せず、**中で何が覆っているかが永久に分からなかった**。
    //   → iframe の【中】で中央から祖先を辿り、暗く不透明な層を名指しする。
    //   判定は `src/lib/panelCoverCulprit.js`(純関数)。ここは採取だけ。
    //   ★storage read は増やしていない(既存の計器バッチに相乗り)。
    rules: { 'max-lines': ['error', { max: 22548, skipBlankLines: false, skipComments: false }] }
  },
  {
    files: ['src/extension/popup/**/*.js'],
    rules: { 'max-lines': ['error', { max: 2000, skipBlankLines: false, skipComments: false }] }
  },
  {
    files: ['src/extension/content-entry.js'],
    rules: { 'max-lines': ['error', { max: 17267, skipBlankLines: false, skipComments: false }] }
  },
  {
    // extension/ 直下の素のスクリプト(esbuild を通さず同梱する .js)。background.js と
    //   status-guard.js(「何があっても開く」保険・v0.1.904)。dist/ の minified 出力とは別物で、
    //   人が書く非モジュールのブラウザ用スクリプト。chrome.* と browser globals を許す。
    files: ['extension/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserChrome }
    }
  },
  {
    // Web版(app.tsuioku-no-kirameki.com)の閲覧ページ。chrome.* には依存しない純ブラウザ。
    files: ['app/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    // Vercel Serverless Function(Node 実行・process/fetch あり)。
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, fetch: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...browserChrome,
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    // v0.1.1417: docs/handoff/bench/*.mjs は調査の再現用 Node スクリプト。
    //   引き継ぎ本文から参照しており、次の担当者がそのまま実行できるよう残す
    //   (仮説を落とした根拠＝計測コードを消すと「30ms だった」が検証不能になる)。
    files: [
      'playwright.config.js',
      'scripts/**/*.mjs',
      'docs/handoff/bench/**/*.mjs',
      'tests/e2e/**/*.js'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.browser,
        chrome: 'readonly',
        Node: 'readonly'
      }
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    files: ['tools/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.node }
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  }
];
