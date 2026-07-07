// @ts-nocheck — セクション一覧の宣言(純データ)。実行時 DOM/chrome 非依存。
/**
 * ③WEB丸写しの「セクション・レジストリ」= ①POP の各パネルが③に出るための配線を1箇所に集約した一覧表
 *   (reference_web_mirror_parity_SYNTHESIS.md A-2/A-3 + reference_full_mirror_SYNTHESIS.md C-2)。
 *
 * ★狙い(なぜ要るか): 新パネルを③に出すには手作業5〜6箇所((1)①publish (2)mirrorBundle SECTION_KEYS
 *   (3)status jsonBlob組立 (4)③paint+paintAllMirrors (5)③host DOM (6)prune宣言)が要り、どれか1つ
 *   忘れても safeSection の try/catch と best-effort no-op が握りつぶして【コンパイルもテストも通る】。
 *   実際これで応援タイムライン/投げ一覧/配信採点が次々「③に出ない」まま放置された。
 *   → このレジストリに1 descriptor 登録し、wiring テスト(liveviewMirrorSections.wiring.test.js)が
 *     「登録したのに配線が無い」を CI 赤で捕捉する。忘れ=赤=verify:cc 赤=出荷不可。
 *
 * ★方針(地雷: 勝ちパターンを作り直さない): これは【検証用の一覧表】であり、既存の
 *   SECTION_KEYS / paintAllMirrors / prune はしご / status jsonBlob 組立を【refactor しない】。
 *   descriptor は既存配線の「あるべき姿」を宣言し、wiring テストが実配線と突合するだけの薄い層。
 *   将来 (a)SECTION_KEYS 導出 (b)buildLiveviewJsonBlob 純lib化 (c)MIRROR_PAINTERS 辞書化へ発展できるが、
 *   本段は「登録忘れ=CI赤」の安全網の導入に限定する(fail-closed・段階導入)。
 *
 * @typedef {{
 *   key: string,             // mirrorBundle 節キー(SECTION_KEYS と同値・鏡でない特例は inBundle:false)
 *   blobField: string,       // jsonBlob 上のフィールド名(status-entry が載せる)
 *   paintFn: string,         // ③ app/live-view.js の paint 関数名(paintAllMirrors が呼ぶ)
 *   hostIds: string[],       // ③が描く DOM host id(空=間接描画/直接 host 無し=明示)
 *   prunePolicy: 'never' | { sections: string[] }, // prune はしごで削る section 名(削らないなら 'never' を明示)
 *   inBundle: boolean,       // mirrorBundle SECTION_KEYS に載る鏡か(統合バンドル経由)。
 *                            //   false=status が直載せ(broadcastScore=路線2・statusReport 等)
 *   driftGuardHost: boolean  // hostIds を popup.html と live-view.html の両方で存在検査するか
 *                            //   (true=drift 検知対象。①popup 由来の host をコピーした節)
 * }} LiveviewMirrorSection
 *
 * @module liveviewMirrorSections
 */

/**
 * ③WEB丸写しの全セクション(2026-07-07 時点)。順序は paintAllMirrors の呼び出し順に揃える(可読性)。
 * @type {readonly LiveviewMirrorSection[]}
 */
export const LIVEVIEW_MIRROR_SECTIONS = /** @type {const} */ ([
  // ── 統合バンドル(mirrorBundle SECTION_KEYS)経由の鏡 ──
  {
    key: 'lane',
    blobField: 'laneMirror',
    paintFn: 'paintLaneMirror',
    hostIds: ['sceneStoryUserLaneStack'], // paintStoryUserLaneDomFilled がこのスタックへ描く
    prunePolicy: 'never', // laneMirror は自前 cap(laneMirror.js)で収まる=公開 prune 対象外
    inBundle: true,
    driftGuardHost: false // ①popup と共通の応援レーン構造(手動コピー節ではない)
  },
  {
    key: 'statCards',
    blobField: 'statCardsMirror',
    paintFn: 'paintStatCardsMirror',
    hostIds: ['liveStatCards'],
    prunePolicy: 'never',
    inBundle: true,
    driftGuardHost: false
  },
  {
    key: 'topSupporters',
    blobField: 'topSupporters',
    paintFn: 'paintSupporterRanking',
    hostIds: ['topSupportRankStrip'],
    prunePolicy: { sections: ['topSupporters.rows'] },
    inBundle: true,
    driftGuardHost: false
  },
  {
    key: 'northStar',
    blobField: 'northStarMirror',
    paintFn: 'paintNorthStarMirror',
    hostIds: [], // 貢献度/広告レーンへ間接描画(officialDomRankingRowsToStripRooms 経由)=直接 host 断言なし
    prunePolicy: 'never',
    inBundle: true,
    driftGuardHost: false
  },
  {
    key: 'commentTimeline',
    blobField: 'commentTimelineMirror',
    paintFn: 'paintCommentTimelineMirror',
    hostIds: ['commentTickerSegA'], // 最新1件ティッカー
    prunePolicy: { sections: ['commentTimelineMirror.rows'] },
    inBundle: true,
    driftGuardHost: false
  },
  {
    key: 'giftHistory',
    blobField: 'giftHistoryMirror',
    paintFn: 'paintGiftHistoryMirror',
    hostIds: ['northStarLaneBody-giftHistory', 'northStarLaneThrows-giftHistory'],
    prunePolicy: { sections: ['giftHistoryMirror.ledgerRows', 'giftHistoryMirror.rooms'] },
    inBundle: true,
    driftGuardHost: true // ①popup.html の投げ一覧 host を live-view.html に同期した節
  },
  {
    key: 'roomHeat',
    blobField: 'roomHeatMirror',
    paintFn: 'paintRoomHeatMirror',
    hostIds: ['roomHeatSummary'], // Meta/Fill/Note は Summary 配下=代表hostで存在担保
    prunePolicy: 'never', // スカラー4個(≈100B)=公開 prune 対象外
    inBundle: true,
    driftGuardHost: false // room-heat host は①②③共通の既存構造(手動コピー節ではない)
  },
  {
    // ③WEB記録サマリ推移丸写し(第5号・reference_full_mirror_SYNTHESIS.md M5)。
    key: 'sessionSummary',
    blobField: 'sessionSummaryMirror',
    paintFn: 'paintSessionSummaryMirror',
    hostIds: ['sessionSummaryCompareMount'], // live-view.html に既存(手動コピー節ではない=drift対象外)
    prunePolicy: 'never', // 24行≈5KB のコンパクト表=公開 prune 対象外
    inBundle: true,
    driftGuardHost: false
  },
  // ── 統合バンドルに載らない「view キー」(同一鏡→複数paint) ──
  {
    key: 'supportTimeline',
    blobField: 'commentTimelineMirror', // commentTimeline 鏡を共有(別 host に複数行リストで描く)
    paintFn: 'paintSupportTimelineMirror',
    hostIds: ['supportTimelineBody'],
    prunePolicy: 'never', // データは commentTimeline 側の prune が効く(二重に削らない)
    inBundle: false, // 独立の鏡ではない=SECTION_KEYS に載せない
    driftGuardHost: true // ①popup.html の応援タイムライン host を live-view.html に同期した節
  },
  // ── status 直載せ(路線2・read追加ゼロ・鏡でなく計算 VM) ──
  {
    key: 'broadcastScore',
    blobField: 'broadcastScoreVm',
    paintFn: 'paintBroadcastScorePanel',
    hostIds: ['broadcastScoreMount'],
    prunePolicy: 'never', // VM はコンパクト(score+radar+highlights≤3)=公開 prune 対象外
    inBundle: false, // status が extras 既読値から VM を組んで直載せ(バンドル経由でない)
    driftGuardHost: true // ①popup.html の配信採点 host を live-view.html に同期した節(466行drift根治)
  }
]);

/** バンドル(mirrorBundle SECTION_KEYS)に載るべき節キー一覧(inBundle:true のみ)。 */
export function bundleSectionKeysFromRegistry() {
  return LIVEVIEW_MIRROR_SECTIONS.filter((s) => s.inBundle).map((s) => s.key);
}

/** prune はしごで削られるべき section 名の一覧(prunePolicy が 'never' でないもの)。 */
export function prunableSectionsFromRegistry() {
  const out = [];
  for (const s of LIVEVIEW_MIRROR_SECTIONS) {
    if (s.prunePolicy !== 'never' && s.prunePolicy && Array.isArray(s.prunePolicy.sections)) {
      out.push(...s.prunePolicy.sections);
    }
  }
  return out;
}

/** drift 検知対象(hostIds を popup.html と live-view.html 両方で検査すべき)節の host id 一覧。 */
export function driftGuardHostIdsFromRegistry() {
  const out = [];
  for (const s of LIVEVIEW_MIRROR_SECTIONS) {
    if (s.driftGuardHost) out.push(...s.hostIds);
  }
  return out;
}
