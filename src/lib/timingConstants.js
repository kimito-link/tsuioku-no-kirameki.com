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
  coalescerMinMs: 300,
  // 高流量時は 300ms 待たずに早期 flush（体感レイテンシ短縮）。
  // NDGR_CHAT_ROWS_POST_CHUNK=220 より少し上に置き、1チャンク=即flushを避ける。
  coalescerBurstThreshold: 260,
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
  gapRatioOfOfficial: 0.058
});
