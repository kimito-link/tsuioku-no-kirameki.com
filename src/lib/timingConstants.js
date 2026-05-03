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
  pageFrameLoopMs: 360
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
  scrollWaitMs: 48,
  secondPassGapMs: 180,
  quietUiMs: 800,
  periodicMs: 120_000,
  stabilityFollowUpMs: 90_000,
  ndgrActiveThresholdMs: 60_000,
  deepRecoveryMs: 300_000
});

/**
 * ライブ中: 公式 statistics のコメント累計と記録件数の差が大きいときの追い quiet deep。
 * 配信終了後の DOM 検知 bulk（watchProgramEndState）と併用する。
 */
export const OFFICIAL_GAP_DEEP_TIMING = /** @type {const} */ ({
  // ライブ中追い deep: CPU との折り合いで 40s 前後に寄せる（従来 55s）
  cooldownMs: 42_000,
  minOfficialComments: 120,
  minGapAbsolute: 190,
  gapRatioOfOfficial: 0.065
});
