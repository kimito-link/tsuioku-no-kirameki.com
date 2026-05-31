/**
 * content-entry.js に散在していたマジックナンバーを集約した定数テーブル。
 * 星野ロミ式「設定定数」パターンで、チューニングと可読性を改善。
 */

export const INGEST_TIMING = /** @type {const} */ ({
  debounceMs: 80,
  livePollMs: 4000,
  statsPollMs: 45_000,
  panelScanMs: 550,
  ndgrFlushMs: 150,
  ndgrPendingThreshold: 240,
  ndgrPendingMax: 1200,
  interceptReconcileMs: 320,
  endedHarvestCheckMs: 4000,
  // v0.1.472: 300ms→800ms。長尺配信で storage 配列が大きくなると 300ms ごとの
  //   全件 read/write がメインスレッドを圧迫してスクロールが重くなるため緩和。
  // v0.1.488: さらに 1200ms へ。多タブ+高コメント配信で I/O 競合が起きやすいため
  //   書き込み頻度を一段落とし、storage.get のタイムアウトを抑える。
  // v0.1.489: 1500ms へ延長し、burstThreshold を無効化（0）。
  //   高流量時に O(N) マージが頻発して watch ページ全体がフリーズする問題（応答しません）を防ぐため、
  //   純粋な時間間隔でのみ書き込むように変更。
  coalescerMinMs: 1500,
  // 以前は高流量時に即時 flush していたが、巨大配列の同期マージが連続すると
  // メインスレッドを占有するため無効化（0）。
  coalescerBurstThreshold: 0,
  // v0.1.502: 永続化「書き込み」の有界化タイムアウト。多タブで共有 chrome.storage.local
  //   が巨大配列書き込みで stall すると get/set/remove の await が settle せず、
  //   persistCommentRowsChain / flushMutex の直列チェーンを永久ブロックして「最終取り込み
  //   ◯秒前」のまま記録が止まる退行が起きる（読み取り側 2000ms 有界化の書き込み版が未対応
  //   だった非対称）。書き込みは read より重いので read(2000ms)より長めに取る。timeout 時は
  //   未永続 rows を再エンキューして自動回復させる。
  // v0.1.504: 4000→10000。1万件級の単一キー配列の構造化クローン set は環境（OneDrive 配下の
  //   プロファイル等）によって 4 秒を超えることがあり、毎回 timeout→再エンキュー→より大きな
  //   set を再発行…の thrash で記録が ~1万件で頭打ちになる退行を確認。正当に重いだけの書き込みは
  //   完了させ、真に stuck したケースだけ外側ガード（×4=40s）で解放する。
  persistWriteTimeoutMs: 10000,
  visibleScanDelayMs: 380,
  pageFrameLoopMs: 360,
  /** scroll/resize からのインライン再レイアウトのみ（メンテ処理は走らせない） */
  pageFrameLayoutScrollDebounceMs: 150,
  /** 非可視タブで livePanelScan を N 回に 1 回だけ（可視復帰で onTabVisible が補償） */
  hiddenLivePanelScanStride: 3,
  /** 非可視時の AI 診断ストレージ書き込み最小間隔 */
  aiShareFastDiagHiddenMinIntervalMs: 6000,
  /** 可視時の AI 診断ストレージ書き込み最小間隔（従来 1500ms と同等） */
  aiShareFastDiagVisibleMinIntervalMs: 1500
});

/**
 * 初回パネル表示ゲート（横付き）。watch を開いた直後 ~300-500ms は niconico の
 * leo-player flex 行が未完成で beside 挿入先が見つからず below(細い帯) に一瞬落ちる。
 * その「崩れた初回」を見せないため、挿入先が安定するまで描画を遅らせる。
 *   besideSettleDeadlineMs: これを超えたら待たずに描画（お困り配信者で leo-player が
 *     render に到達しないケースの安全網）。実測 beside 確定 ~533ms + CPU 競合余裕 + 分散。
 *   geomStableFrames: 挿入先 rect が「同一(±tolerance)」で連続するフレーム数。
 *     差し替え途中の中間 rect 誤検知（早すぎ）を防ぐため 2。
 *   geomStableTolerancePx: 同一とみなす rect の許容差。
 */
export const INLINE_FIRST_PAINT = /** @type {const} */ ({
  besideSettleDeadlineMs: 800,
  geomStableFrames: 2,
  geomStableTolerancePx: 2
});

export const SUBMIT_TIMING = /** @type {const} */ ({
  editorPollTimeoutMs: 8000,
  editorPollIntervalMs: 50,
  reactSettleMs: 220,
  buttonPollTimeoutMs: 1200,
  buttonPollIntervalMs: 80
});

export const MAP_LIMITS = /** @type {const} */ ({
  activeUserMax: 12_000,
  interceptMax: 50_000
});

export const HARVEST_TIMING = /** @type {const} */ ({
  delayMs: 600,
  // deep 仮想走査のレイアウト安定待ち（短すぎると取りこぼし、長すぎると所要時間増）
  scrollWaitMs: 42,
  secondPassGapMs: 180,
  quietUiMs: 800,
  periodicMs: 120_000,
  stabilityFollowUpMs: 90_000,
  ndgrActiveThresholdMs: 60_000,
  // NDGR 継続中でもこれより長く deep が無いと強制 2-pass（取り込み率との折り合い）
  deepRecoveryMs: 240_000
});

/**
 * ライブ中: 公式 statistics のコメント累計と記録件数の差が大きいときの追い quiet deep。
 * 配信終了後の DOM 検知 bulk（watchProgramEndState）と併用する。
 */
export const OFFICIAL_GAP_DEEP_TIMING = /** @type {const} */ ({
  cooldownMs: 36_000,
  minOfficialComments: 120,
  minGapAbsolute: 170,
  gapRatioOfOfficial: 0.058,
  // 公式ギャップが残ったまま NDGR バックフィルが未完了で止まっているとき、ワンショット
  //   guard を解除して「続きから」再開する上限回数（liveId 単位）。cooldownMs(36s) で
  //   throttle される。
  //   fix/broadcast-bulk-catchup（2026-05-31）: 「一気に・自動で・手動ボタン無しで取り切る」
  //   方針に合わせ 12→40 へ引き上げ（36s × 40 ≒ 24 分ぶん粘れる）。長尺・高流量で 1 巡回
  //   15 分上限に複数回ぶつかる放送でも、ギャップが埋まるまで自動で続きを遡れるようにする。
  //   no_progress が永遠に続く異常ケースは上限 40 で有界化（暴走防止）。
  maxGapRearms: 40
});

/**
 * reached_start（配信開始まで到達＝遡り切ったとみなす）で終わったのに、実記録が公式件数の
 * この比率に満たない場合を「明らかな誤完了」とみなすしきい値。
 *
 * fix/broadcast-bulk-catchup（2026-05-31・コードレビュー反映）:
 *   記録カードの「公式件数に届いていません」表示（backfillRinkuNarration）と、watchdog の
 *   reached_start 再 sweep 許可（content-entry の reachedStartGapOverride）で**同じしきい値**を
 *   使い、「未達と表示するのに自動回復しない」帯（旧: カード 0.95 / 再sweep 0.5 の不整合）を解消する。
 *   0.5 未満（記録が公式の半分未満）だけを誤完了として扱い、50〜95% の near-complete な
 *   reached_start は AGENTS §3.3「reached_start のときだけ達成宣言」を尊重して静観する。
 */
export const BACKFILL_FALSE_COMPLETION_RATIO = 0.5;
