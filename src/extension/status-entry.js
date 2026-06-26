// @ts-nocheck — status UI: read-only DOM/Chrome API。popup と独立。
/**
 * v0.1.629: 固定 URL 状態表示ページ。
 *
 * 目的:
 *   - chrome-extension://[拡張ID]/status.html で常時最新の全配信状態+診断 JSON を表示
 *   - スクショ撮影/コピペ作業を不要にする(AI共有時のフリクション削減)
 *   - 完全リードオンリー: storage write しない・background SW を起こさない・popup の重い初期化と独立
 *
 * データソース(全て chrome.storage.local の既存キー・触らない):
 *   - nls_panel_summary_<lv>       軽量サマリ(主要データ)
 *   - nls_ai_share_fast_diag_v1    fastDiag キャッシュ(視聴中 lives 列挙・content 由来)
 *   - nls_ai_share_popup_diag_v1   popup 固有診断(AI診断コピー由来・popup を開くと更新)
 *   - nls_last_watch_url           最後に視聴した URL(フォールバック)
 *
 * 自動更新:
 *   - setInterval 2 秒
 *   - document.hidden で停止(電池/CPU 節約)
 *   - storage.onChanged で増分 refresh(panel_summary 変化のみ反応)
 *
 * @module status-entry
 */

import { KEY_AI_SHARE_POPUP_DIAG } from '../lib/aiSharePopupDiagKey.js';
// 2026-06-23: status.html 軽量化。2秒ループで巨大 fastDiag(~40KB)を read+parse+JSON.stringify していたのが
//   重さの真因(council/status-heavy-open-SYNTHESIS.md)。status が使う4フィールドだけの軽量ダイジェスト
//   (content が同時に書く)を read する=read 回数同じ・サイズ ~40分の1。読み取りパスは full と同形。
import { KEY_STATUS_FAST_DIAG_LITE } from '../lib/statusFastDiagLite.js';
import { buildStatusMindmapModel } from '../lib/statusMindmapModel.js';
import { buildStatusActions } from '../lib/statusActionAdvisor.js';
// 純Web公開コピーの自己診断(council/status-self-diagnoses-SYNTHESIS.md): 状態速報1枚で「純Webに何が
//   送られ・何件で・古くないか・拡張と一致するか」が分かるようにする。jsonBlob と引数だけから組む純関数
//   =新規 storage read ゼロ。致命は症状カードにも昇格する。
import {
  buildLiveviewPublishSelfDiag,
  formatLiveviewPublishSelfDiagLines,
  liveviewPublishSelfDiagToActionCards
} from '../lib/liveviewPublishSelfDiag.js';
// 直近の公開送信(POST)結果を globalThis に集計(read を増やさない)→自己診断が「未送信/失敗」を検知できる。
import {
  recordLiveviewPublishOutcome,
  summarizeLiveviewPublishOutcome
} from '../lib/liveviewPublishOutcome.js';
// 応援レーン描画の自己診断(council/lane-render-self-diag-SYNTHESIS.md): 「鏡にはあるのに画面に出ない/
//   ローディングが終わらない」を状態速報で切り分ける。popup の storyUserLaneRenderProbe を読むだけ。
import {
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines,
  storyUserLaneRenderDiagToActionCards
} from '../lib/storyUserLaneRenderProbe.js';
import { buildHealthCells, summarizeHealthVerdict } from '../lib/healthCells.js';
import { buildVoiceDiagLine } from '../lib/voiceDiag.js';
import { KEY_VOICE_DIAG } from '../lib/voiceDiagKey.js';
// 共有 URL 組み立て(状態速報/応援ライブビュー/ingest)の純関数。挙動同値で uploadStatusSnapshot から切り出し。
import { buildStatusShareUrls } from '../lib/statusShareUrls.js';
// 応援ライブビュー(拡張内)の「このURLをWEBでも公開する」用: status が組み立てた公開ペイロードを置くキー。
import { KEY_LIVEVIEW_PUBLISH_PAYLOAD } from '../lib/storageKeys.js';
// レポートプレビュー信頼度注釈の文脈(fastDiag→ctx)の純関数。挙動同値で status-entry から切り出し。
import { reportPreviewCtxFromFastDiag } from '../lib/reportPreviewCtx.js';
// v0.1.902: 会場座席の健全度(配信者混入・固着)を健全度パネルに載せる。
import { KEY_VENUE_SEATS_DIAG } from '../lib/venueSeatsDiagKey.js';
// 2026-06-22(council/lane-show-all-active): 応援レーンの人数整合(素性 N/表示 M)を健全度パネルに載せる。
import { KEY_LANE_DIAG } from '../lib/laneDiagKey.js';
// 応援レーン鏡: popup の応援レーン(りんく/こん太/広告/たぬ姉の段組み)を顔まで含めてそっくり映す。
//   データは popup→storage(KEY_LANE_MIRROR)、status が読んで本物の描画関数で描く(会場とは無関係)。
import { KEY_LANE_MIRROR } from '../lib/laneMirrorKey.js';
// 2026-06-26: restoreLaneMirrorBuckets / paintStoryUserLaneDom* の import は応援レーン鏡撤去で不要になり削除。
// 数字カード鏡: v0.1.948 で status への描画は撤去。KEY_STAT_CARDS_MIRROR は
//   loadStatCardsMirrorSafe→jsonBlob 経由で純Web /live-view に継続送信する。
import { KEY_STAT_CARDS_MIRROR } from '../lib/statCardsMirrorKey.js';
// 北極星レーン鏡(公式値レーン): popup→storage(KEY_NORTH_STAR_MIRROR)を status が読んで純Webへ相乗り送信。
import { KEY_NORTH_STAR_MIRROR } from '../lib/northStarMirrorKey.js';
import { createSupportAvatarLoadGuard } from '../lib/supportGrowthAvatarLoad.js';
import { isHttpOrHttpsUrl, NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS } from '../lib/supportGrowthTileSrc.js';
import { storyTileUsesYukkuriTvStyle } from '../lib/storyTileTvStyle.js';
import { upgradeAnonymousAvatarImage } from '../lib/avatarPartsComposer.js';
// 応援者ランキングを本物の人物タイル(サムネ・ID・名前・リンク)で出すための部品(§3.5)。
import { buildPersonTileEl } from '../lib/personTileDom.js';
import { supporterRowToPersonTile } from '../lib/supporterRowToPersonTile.js';
// 応援者ランキングの行リスト(本物タイル・status と純Web で共有=似せて自作しない)。
import { buildSupporterRankingRows } from '../lib/supporterRankingDom.js';
import { deriveAvatarUrlFromUid } from '../lib/deriveAvatarUrlFromUid.js';
import { anonymousIdenticonDataUrl } from '../lib/anonymousIdenticon.js';
import { storyUserLaneMetaLines } from '../lib/storyUserLaneMeta.js';
import {
  applyStoryAvatarTvFallbackClass,
  removeStoryAvatarTvFallbackClass
} from '../lib/storyAvatarTvFallbackClass.js';
import { buildReportPreviewLines } from '../lib/reportPreview.js';
import {
  KEY_REPORT_PREVIEW,
  isReportPreviewFresh
} from '../lib/reportPreviewKey.js';
import { appendTrendSample, analyzeTrend } from '../lib/statusTrend.js';
import { KEY_STATUS_TREND } from '../lib/statusTrendKey.js';
import { pickOpenAction } from '../lib/watchLink.js';
import { buildChikuranCardModel } from '../lib/chikuranCard.js';
// 配信者カードのヘッダー DOM(純DOM・status と純Web で共有=似せて自作しない)。
import { buildChikuranHeaderDom } from '../lib/chikuranHeaderDom.js';
import {
  buildOverviewText,
  buildLiveBlockText,
  buildBackfillProgressLine,
  buildLaneStatusLine,
  sumRecordedFromLives
} from '../lib/statusFormat.js';
import { resolveVisitorCount } from '../lib/resolveVisitorCount.js';
import { PERF_DIAG_PREFIX, isPerfDiag } from '../lib/perfDiag.js';
import { LIVE_ENDED_PREFIX, isLiveEndedFlag } from '../lib/liveEndedFlag.js';
import { buildLiveHealth, scoreToDots } from '../lib/liveHealthScore.js';
import { runStorageOpWithTimeout, STORAGE_OP_TIMED_OUT } from '../lib/storageOpTimeout.js';
import {
  NEXT_LIVE_REQUEST_TYPE,
  AUTOPATROL_ENABLED_KEY
} from '../lib/rankingPatrolMessages.js';
import {
  GOOGLE_SUGGEST_FETCH_MESSAGE_TYPE,
  parseGoogleSuggestResponse,
  isValidSuggestQuery
} from '../lib/googleSuggest.js';
import { analyzeNegativeSuggests } from '../lib/broadcasterReputationKeywords.js';
import {
  buildReputationViewModel,
  buildReputationAlertHtml
} from '../lib/broadcasterReputationView.js';
import { pickBroadcasterNameForReputation } from '../lib/pickBroadcasterNameForReputation.js';
// 2026-06-23: status「視聴中の配信」に死んだタブの記録(last_watch_url)が居座る問題の鮮度ガード。
//   panel_summary.updatedAt が古ければ「視聴中」に出さない（純関数で test 付き）。
import { panelSummaryStorageKey } from '../lib/panelLiveSummary.js';
import { isLastWatchUrlFresh } from '../lib/watchUrlFreshness.js';
// 2026-06-23: Alt+Tab に出ない裏 watch タブ(active:false・過去 autopatrol/古い重複拡張の遺物)を
//   検出して手動クローズ導線を出す(council/orphan-tab-survivor-SYNTHESIS.md)。自動では閉じない。
import { isBackgroundWatchTab } from '../lib/backgroundWatchTab.js';

/** 自動更新間隔(ms)。 */
const REFRESH_INTERVAL_MS = 2000;

/** panel_summary キーのプレフィックス。 */
const PANEL_SUMMARY_PREFIX = 'nls_panel_summary_';

/**
 * v0.1.631: 配信者名・タイトル・watch/comment 数の正本は nls_watch_snapshot_<lv>。
 * panel_summary には broadcasterName が無い(空文字)ため、両方読んでマージする。
 */
const WATCH_SNAPSHOT_PREFIX = 'nls_watch_snapshot_';

/** 最後に視聴した URL の storage key。 */
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

/** 自動更新の一時停止フラグ。 */
let _refreshPausedByUser = false;
/** v0.1.644: 直近の status refresh エラー(画面の自己診断表示用)。 */
let _statusLastErrorText = '';
/** 自動更新タイマー ID。 */
let _refreshTimerId = /** @type {number|null} */ (null);
// v0.1.868: 「スムーズじゃない」対策。追加データ(reportPreview/watchTabMap/trend)は 2 秒ごとに毎回
//   storage を読むと重い=12 秒間引きでキャッシュし、間は前回値を再利用(コア表示は毎回更新のまま)。
const EXTRAS_REFETCH_MS = 12000;
let _extrasCacheAt = 0;
let _extrasCache = /** @type {{reportPreview:any, watchTabMap:any, trendFindings:any[], laneDiag:any, laneMirror:any, statCardsMirror:any, northStarMirror:any, voiceDiag:any, venueSeatsDiag:any}} */ ({
  reportPreview: null,
  watchTabMap: new Map(),
  trendFindings: [],
  laneDiag: null,
  laneMirror: null,
  statCardsMirror: null,
  northStarMirror: null,
  // v0.1.924: voiceDiag/venueSeatsDiag も毎回 read から 12秒間引きへ(下記の真因対応)。
  voiceDiag: null,
  venueSeatsDiag: null
});
/** v0.1.868: 配信カードの再構築 skip 判定用 signature(変化なしなら innerHTML を作り直さない)。 */
let _lastLivesSig = '';
/** v0.1.890: 健全度パネルの再構築 skip 判定用 signature。配信カードと同型=2秒ごとの全セル再生成を止める。 */
let _lastHealthSig = '';
/** v0.1.890: 対処カードの再構築 skip 判定用 signature。2秒ごとの全カード再生成を止める。
 *   初期値は実際の署名(空カード時の '' を含む)と絶対に一致しない sentinel=初回は必ず描画する。 */
let _lastActionSig = ' init';
// _lastStatCardsMirrorSig は v0.1.948 で数字カード鏡 status 描画撤去により削除。
/**
 * 応援レーン鏡のアバター読み込みガード(popup と同設定の本物=createSupportAvatarLoadGuard)。
 *   popup-entry.js:3770 と同じく fallback を先に出してプローブ成功時だけ差し替え=404 フリッカー防止。
 *   io は popup の laneDomIo(popup-entry.js:5135)と同じ4点。status は popup と独立プロセスなので
 *   ここで status 専用に1つ作る(状態=成功/失敗 URL セットは status の鏡描画ぶんだけ保持)。
 */
const _laneMirrorAvatarLoadGuard = createSupportAvatarLoadGuard({
  fallbackSrc: NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
  onFallbackApplied: applyStoryAvatarTvFallbackClass,
  onRemoteSuccess: removeStoryAvatarTvFallbackClass
});
/** 本物 buildPersonTileEl に渡す I/O(popup の laneDomIo と同じ4点)。 */
const _laneMirrorDomIo = {
  storyAvatarLoadGuard: _laneMirrorAvatarLoadGuard,
  isHttpOrHttpsUrl,
  storyTileUsesYukkuriTvStyle,
  upgradeAnonymousAvatarImage
};
/** 応援者ランキング行 → 人物タイル入力の変換に渡す I/O(avatar 導出・meta 構築)。 */
const _supporterTileIo = {
  deriveAvatarUrlFromUid: (uid) => deriveAvatarUrlFromUid(uid),
  anonymousIdenticonDataUrl,
  storyUserLaneMetaLines: (entry, httpCandidate) => storyUserLaneMetaLines(entry, httpCandidate)
};
/** 応援者ランキングの行リスト DOM ビルダーに渡す I/O(本物 supporterRowToPersonTile→buildPersonTileEl)。 */
const _supporterRankingDomIo = {
  supporterRowToPersonTile,
  buildPersonTileEl,
  tileIo: _supporterTileIo,
  domIo: _laneMirrorDomIo
};
/** 直近 render の結果(コピー/ダウンロード用)。 */
let _lastRenderedBundle = /** @type {{ overview: string, lives: object[], textBlob: string, jsonBlob: object }|null} */ (
  null
);
/**
 * v0.1.804: 概要「累計 記録」を後退させない床。enumerate の一瞬の揺れ(タブ query タイミング・
 *   storage クランプで panel summary が一時欠ける)で合算対象から live が落ちて累計だけが減るのを
 *   表示層で吸収する。床はこのページが開いている間だけ(リロードで素直に再計算)。storage には書かない。
 */
let _recordedSumFloor = 0;

/* ============================================================================
 * 起動
 * ========================================================================== */

bootstrap().catch((err) => {
  console.error('[status] bootstrap failed:', err);
});

async function bootstrap() {
  // status-guard.js(「何があっても開く」保険)への合図: 本体が起動したことを伝え、
  //   guard の起動見張り(BOOT_TIMEOUT_MS)を解除する。これより後の描画が重くても guard は黙る。
  //   guard はこのフラグを読むだけ=本体の挙動には一切干渉しない(疎結合)。
  try {
    window.__NL_STATUS_BOOTED = true;
  } catch {
    /* no-op */
  }
  // バージョン + ビルド ID 表示(popup と同じ `v<version>・build<id>`)。
  //   v0.1.642: ビルド番号だけだと「今どのバージョンか」が分からず紛らわしいので
  //   manifest の version も併記する(watch パネルの「ビルド v0.1.642・b...」と揃える)。
  const buildIdEl = document.getElementById('metaBuildId');
  if (buildIdEl) {
    try {
      const ver = String(chrome.runtime.getManifest()?.version || '').trim();
      const bid = typeof NL_BUILD_ID !== 'undefined' ? NL_BUILD_ID : '?';
      buildIdEl.textContent = (ver ? `v${ver} · ` : '') + 'build ' + bid;
    } catch {
      buildIdEl.textContent = 'build ' + (typeof NL_BUILD_ID !== 'undefined' ? NL_BUILD_ID : '?');
    }
  }
  // 自分の URL を footer に
  const urlEl = document.getElementById('statusPageUrl');
  if (urlEl) urlEl.textContent = location.href;

  setupButtons();
  setupVisibilityHandler();
  setupStorageChangeListener();

  // v0.1.797「status が重くて開かない」根治: 初回は短い timeout(1500ms)で走らせ、storage が
  //   混雑していても最大 ~1.5秒で degrade 表示に切り替える(=「開かない」を作らない)。await せず
  //   即 startRefreshLoop に進むので、ページ操作(ボタン等)は最初からブロックされない。短時間で
  //   取れれば通常表示、取れなければ「混雑中・記録は別途継続」を出し、2秒ごとの通常更新が後で埋める。
  void refresh({ timeoutMs: 1500 });
  startRefreshLoop();
}

/* ============================================================================
 * リフレッシュサイクル
 * ========================================================================== */

function startRefreshLoop() {
  if (_refreshTimerId != null) return;
  _refreshTimerId = window.setInterval(() => {
    if (_refreshPausedByUser) return;
    if (document.hidden) return;
    // v0.1.785: storage stall(storage_op_timeout)は status の自己診断 UI に画面表示済みで
    //   グレースフルに degrade する想定内の事象。console.warn は chrome://extensions のエラー欄に
    //   収集され「これ見てどうすればいいの?」を生むため console.debug に下げる(v0.1.776 と同方針=
    //   行動につながらない警告を目立つ場所に出さない)。実エラーは画面の概要欄/AI共有欄で確認できる。
    refresh().catch((err) => console.debug('[status] refresh err', err));
  }, REFRESH_INTERVAL_MS);
}

/**
 * v0.1.644: status の「読み込み中で固まる」を自己診断する。各ステップを timeout 有界化し、
 *   どこで詰まったか/エラー内容を画面(概要欄+AI共有欄)に書き出す。これでコンソールを開かなくても
 *   「status が固まった原因」が画面で分かる(ユーザー指摘「コンソールをスクショしなくてもいいように」)。
 */
/**
 * @param {{ timeoutMs?: number }} [opts]
 *   timeoutMs: 各 storage read の有界化上限。v0.1.797: 初回(first paint)は短く(1500ms)して
 *   storage stall でも「重くて開かない」を作らず即 degrade 表示する。通常更新は 8000ms のまま。
 */
async function refresh(opts = {}) {
  const tmo = Number.isFinite(Number(opts.timeoutMs)) && Number(opts.timeoutMs) > 0
    ? Number(opts.timeoutMs)
    : 8000;
  let step = 'init';
  // v0.1.890: 「状態速報が重い」の真因可視化。refresh 全体と各ステップの所要 ms を測り、最終更新メタに
  //   出す(self-verifying: 推測で重さ対策をする前に、どのステップが重いかを実データで見る)。
  //   計測は performance.now の差分だけ=描画/記録を一切妨げない純観測。
  const _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let _tPrev = _t0;
  /** @type {Array<[string, number]>} 各ステップの所要 ms(降順表示用) */
  const _stepMs = [];
  const _mark = (name) => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    _stepMs.push([name, Math.round(now - _tPrev)]);
    _tPrev = now;
  };
  try {
    // v0.1.868: chrome.storage.local は単一 LevelDB で【並行 read で stall する】(storageOpTimeout.js の
    //   背景コメント参照)。v0.1.867 で Promise.all 並行化したら逆に複数 read が競合して timeout 多発→
    //   fastDiag={}・記録0 と空表示になる退行を出した(ユーザー実機で確認)。並行化を撤回し【直列】に戻す。
    //   「重い/開かない」の本来の対策は別=コア(配信一覧+summaries+fastDiag)を先に描き、重い追加データ
    //   (reportPreview/トレンド/watchTabMap)は失敗しても握って空で描く(画面を白くしない)。
    step = 'enumerateActiveLives';
    const lvList = await runStorageOpWithTimeout(() => enumerateActiveLives(), tmo);
    _mark('lives');
    step = `loadAllSummaries(${lvList.length}件)`;
    const summaries = await runStorageOpWithTimeout(() => loadAllSummaries(lvList), tmo);
    _mark(`summaries×${lvList.length}`);
    // 2026-06-23: 2秒ループは full(~40KB)でなく軽量ダイジェスト(~1KB)を read=重さの真因を断つ。
    //   読み取りパスは full と同形なので renderAll 以下の consumer は無変更(council/status-heavy-open-SYNTHESIS.md)。
    step = 'loadStatusFastDiagLiteSafe';
    const fastDiag = await runStorageOpWithTimeout(() => loadStatusFastDiagLiteSafe(), tmo);
    _mark('fastDiagLite');
    step = 'loadPopupDiagSafe';
    const popupDiag = await runStorageOpWithTimeout(() => loadPopupDiagSafe(), tmo);
    _mark('popupDiag');
    step = 'loadBackfillProgress';
    const backfillProgress = await runStorageOpWithTimeout(() => loadBackfillProgressSafe(), tmo);
    _mark('backfill');
    // 以下は「追加データ」=失敗しても他の表示と記録を妨げない(空で描く)。12 秒間引きでキャッシュ
    //   再利用=2 秒ごとの storage read を減らして「スムーズじゃない」を改善(コア表示は毎回更新のまま)。
    //   ★laneDiag(応援レーン人数整合セル)もここに含める=v0.1.909 で毎回の直列 read に足したら
    //     診断ページが重くなった(ユーザー実機・会場前から重い)ため。診断は軽さ最優先=補助は間引き。
    //   ★v0.1.924: voiceDiag(会場読み上げ診断)/venueSeatsDiag(会場座席診断)も毎回 read から
    //     ここへ移動。真因=この2つが v0.1.902 以降ずっと毎回の直列 read で、laneDiag を間引いた後も
    //     残っていたため診断ページが重いままだった(ユーザー実機「v0.1.923 を入れる前から遅い」)。
    //     どちらも健全度パネルの色セル用の補助情報で、2秒ごとの即時更新は不要=laneDiag と同じ間引きへ。
    const extrasStale = Date.now() - _extrasCacheAt >= EXTRAS_REFETCH_MS;
    if (extrasStale) {
      step = 'loadVoiceDiagSafe';
      const voiceDiag = await runStorageOpWithTimeout(() => loadVoiceDiagSafe(), tmo).catch(() => null);
      step = 'loadVenueSeatsDiagSafe';
      const venueSeatsDiag = await runStorageOpWithTimeout(() => loadVenueSeatsDiagSafe(), tmo).catch(() => null);
      step = 'loadReportPreviewSafe';
      const reportPreview = await runStorageOpWithTimeout(() => loadReportPreviewSafe(), tmo).catch(() => null);
      step = 'queryWatchTabMap';
      const watchTabMap = await runStorageOpWithTimeout(() => queryWatchTabMap(), tmo).catch(() => new Map());
      step = 'recordAndAnalyzeTrend';
      const trendFindings = await runStorageOpWithTimeout(
        () => recordAndAnalyzeTrendSafe(lvList, summaries),
        tmo
      ).catch(() => []);
      step = 'loadLaneDiagSafe';
      const laneDiag = await runStorageOpWithTimeout(() => loadLaneDiagSafe(), tmo).catch(() => null);
      // 応援レーン鏡(顔込み)も extras に同梱=毎回の直列 read を増やさず12秒間引きで読む(診断は軽さ最優先)。
      step = 'loadLaneMirrorSafe';
      const laneMirror = await runStorageOpWithTimeout(() => loadLaneMirrorSafe(), tmo).catch(() => null);
      // 数字カード鏡も extras に同梱=毎回の直列 read を増やさず12秒間引きで読む(診断は軽さ最優先)。
      step = 'loadStatCardsMirrorSafe';
      const statCardsMirror = await runStorageOpWithTimeout(() => loadStatCardsMirrorSafe(), tmo).catch(() => null);
      // 北極星レーン鏡(公式値レーン)も extras に同梱=毎回の直列 read を増やさず12秒間引きで読む。
      step = 'loadNorthStarMirrorSafe';
      const northStarMirror = await runStorageOpWithTimeout(() => loadNorthStarMirrorSafe(), tmo).catch(() => null);
      _extrasCache = { reportPreview, watchTabMap, trendFindings, laneDiag, laneMirror, statCardsMirror, northStarMirror, voiceDiag, venueSeatsDiag };
      _extrasCacheAt = Date.now();
      _mark('extras');
    }
    const { reportPreview, watchTabMap, trendFindings, laneDiag, laneMirror, statCardsMirror, northStarMirror, voiceDiag, venueSeatsDiag } = _extrasCache;
    step = 'renderAll';
    renderAll({ lvList, summaries, fastDiag, popupDiag, backfillProgress, voiceDiag, venueSeatsDiag, laneDiag, laneMirror, statCardsMirror, northStarMirror, reportPreview, trendFindings, watchTabMap });
    _mark('render');
    const _totalMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0);
    updateLastUpdateMeta({ totalMs: _totalMs, stepMs: _stepMs });
    _statusLastErrorText = '';
  } catch (err) {
    // v0.1.797: timeout は「ストレージ混雑(記録は別途継続)」の想定内 degrade=不安にさせない文言に。
    //   それ以外の実エラーだけ「つまずいた処理」を出す(自己診断)。どちらも 2秒ごとの通常更新が後で埋める。
    const timedOut = err === STORAGE_OP_TIMED_OUT;
    if (timedOut) {
      _statusLastErrorText =
        `⏳ ストレージが混雑していて状態の読み込みに少し時間がかかっています。\n` +
        `  記録自体は各 watch タブ側で続いています(止まっていません)。\n` +
        `  数秒ごとに自動で再読み込みします。このまま少しお待ちください。`;
    } else {
      _statusLastErrorText =
        `⚠ 状態の読み込みでつまずきました\n  つまずいた処理: ${step}\n  原因: ${String(err?.message || err)}\n` +
        `  (記録自体は watch タブ側で継続中です。storage が大きいと status の表示だけ遅れることがあります)`;
    }
    try {
      const ovEl = document.getElementById('overviewBody');
      if (ovEl && /読み込み中/.test(ovEl.textContent || '')) {
        ovEl.textContent = _statusLastErrorText;
      }
      const livesEl = document.getElementById('livesBody');
      if (livesEl && /読み込み中/.test(livesEl.textContent || '')) {
        livesEl.className = 'empty-note';
        livesEl.textContent = timedOut
          ? '(ストレージ混雑中… 自動で再読み込みします)'
          : `(${step} で停止。再試行します…)`;
      }
      // v0.1.855: 「いま気になる点」「マインドマップ」も初回 refresh が timeout/失敗すると
      //   「読み込み中…」のまま固着し、最終更新も「—」のまま=何が起きたか分からず空白に見えた
      //   (ユーザー実機: 状態のセルが全部出ない+理由も出ない)。残さず理由を出す(self-verifying)。
      const stuckNote = timedOut
        ? '(ストレージ混雑中… 数秒ごとに自動で再読み込みします)'
        : `(${step} で停止。再試行します…)`;
      for (const id of ['actionBody', 'mindmapBody']) {
        const el = document.getElementById(id);
        if (el && /読み込み中/.test(el.textContent || '')) {
          el.className = 'empty-note';
          el.textContent = stuckNote;
        }
      }
      // 最終更新に「試みたが失敗」を出す。「—」固着=動いていないように見えるのを防ぐ。
      const metaEl = document.getElementById('metaLastUpdate');
      if (metaEl) {
        const t = new Date();
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        metaEl.textContent = `最終更新 ${hh}:${mm} ⚠${timedOut ? '混雑' : '再試行'}`;
      }
      // AI 共有欄にも出して、範囲選択コピーで開発者に渡せるように(実エラー時のみ)。
      const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('aiShareText'));
      if (ta && !ta.value && !timedOut) ta.value = _statusLastErrorText;
    } catch { /* no-op */ }
    // v0.1.785: timeout(storage_op_timeout)は上で _statusLastErrorText として画面に出し、記録自体は
    //   watch タブ側で継続している想定内の degrade。console.warn は chrome://extensions のエラー欄を
    //   汚し「どうすれば?」を生むため console.debug に下げる(DevTools verbose でのみ確認可・v0.1.776 と同方針)。
    console.debug('[status] refresh failed at', step, err);
  }
}

/**
 * @param {{ totalMs?: number, stepMs?: Array<[string, number]> }} [perf]
 *   v0.1.890: refresh 所要時間の計器。totalMs と「重かったステップ top2」を最終更新の隣に出す=
 *   「状態速報が重い」の真因を、推測せず実データで見えるようにする(self-verifying)。
 */
function updateLastUpdateMeta(perf) {
  const el = document.getElementById('metaLastUpdate');
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  let perfText = '';
  const total = perf && Number.isFinite(Number(perf.totalMs)) ? Number(perf.totalMs) : null;
  if (total != null) {
    // 重かったステップ上位2件を「名前:ms」で添える(全体の内訳が一目で分かる)。
    const steps = Array.isArray(perf?.stepMs) ? perf.stepMs.slice() : [];
    steps.sort((a, b) => (Number(b?.[1]) || 0) - (Number(a?.[1]) || 0));
    const topText = steps
      .slice(0, 2)
      .filter((s) => (Number(s?.[1]) || 0) > 0)
      .map((s) => `${s[0]} ${s[1]}ms`)
      .join(' / ');
    perfText = ` ・ 更新 ${total}ms${topText ? `(${topText})` : ''}`;
  }
  el.textContent = `最終更新 ${hh}:${mm}:${ss}${perfText}`;
}

/* ============================================================================
 * lv 列挙(v0.1.630 修正: 「今開いているニコ生タブ」だけに限定)
 *
 *   v0.1.629 では nls_panel_summary_<lv> を全部列挙していたが、過去に視聴したものが
 *   全部残るため 400+ 配信が「視聴中」扱いになる実機問題が出た(ユーザー証言)。
 *   chrome.tabs.query で実際に開いているタブから lv を抽出する経路を最優先にする。
 *
 *   - 経路1: chrome.tabs.query で live.nicovideo.jp/watch/lvXXX のタブから抽出 ← 最優先
 *   - 経路2: fastDiag.lives(視聴中フラグ付き)
 *   - 経路3: last_watch_url から 1 件(フォールバック・鮮度ガード付き)
 *
 *   v0.1.925: 経路3は panel_summary.updatedAt が古い(3分超)なら採用しない。死んだ watch
 *   タブの last_watch_url が「視聴中」に居座る誤表示を防ぐ([[watchUrlFreshness]])。
 * ========================================================================== */

async function enumerateActiveLives() {
  /** @type {string[]} */
  const lvList = [];
  // 経路1: 実際に開いているニコ生 watch タブから lv 抽出
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://live.nicovideo.jp/watch/*', 'https://sp.live.nicovideo.jp/watch/*']
    });
    for (const tab of tabs || []) {
      const url = String(tab?.url || '');
      const m = url.match(/\/watch\/(lv\d{1,15})/);
      if (m) lvList.push(m[1].toLowerCase());
    }
  } catch {
    /* fallthrough */
  }
  if (lvList.length > 0) return uniqLvSorted(lvList);

  // 経路2: fastDiag.lives(視聴中タブ由来のキャッシュ)。2026-06-23: 軽量ダイジェスト(lite)も .lives を
  //   同形で持つ=full を読まずに lv を拾える(稀パスでも 40KB read しない)。
  try {
    const fastDiag = await loadStatusFastDiagLiteSafe();
    const lives = Array.isArray(fastDiag?.lives) ? fastDiag.lives : [];
    for (const r of lives) {
      const lv = String(r?.liveId || r?.lv || '').trim().toLowerCase();
      if (/^lv\d{1,15}$/.test(lv)) lvList.push(lv);
    }
  } catch {
    /* fallthrough */
  }
  if (lvList.length > 0) return uniqLvSorted(lvList);

  // 経路3: last_watch_url から lv 抽出（鮮度ガード付き）
  //   last_watch_url は URL 文字列だけで時刻が無く、watch タブが死んでも誰もクリアしない。
  //   無条件に拾うと「もう見ていない配信」が視聴中に居座る（数値が全て「—」の誤情報カード）。
  //   → 拾った lv の panel_summary.updatedAt を 1 回だけ read し、鮮度が無ければ採用しない。
  //   この追加 read は経路1/経路2が空＝watch タブ 0 の稀パスでだけ通る（軽さ鉄則を守る）。
  try {
    const bag = await chrome.storage.local.get(KEY_LAST_WATCH_URL);
    const url = String(bag?.[KEY_LAST_WATCH_URL] || '');
    const m = url.match(/lv\d{1,15}/);
    if (m) {
      const lv = m[0].toLowerCase();
      let fresh = false;
      try {
        const pKey = panelSummaryStorageKey(lv);
        const sbag = await chrome.storage.local.get(pKey);
        const updatedAt = Number(sbag?.[pKey]?.updatedAt);
        fresh = isLastWatchUrlFresh(updatedAt, Date.now());
      } catch {
        // panel_summary が読めない＝記録の形跡なし＝視聴中とは言えない（採用しない）。
        fresh = false;
      }
      if (fresh) lvList.push(lv);
    }
  } catch {
    /* fallthrough */
  }
  return uniqLvSorted(lvList);
}

function uniqLvSorted(arr) {
  return [...new Set(arr)].sort();
}

// v0.1.864: 放送導線用。今開いている watch タブの lv→{tabId,windowId,active} マップを作る(既存の
//   tabs.query を再利用・新規取得ゼロ)。これでカードの「この放送に切替」が既存タブへフォーカスできる。
//   失敗(権限なし等)は空 Map=ボタンは「放送を開く(新規タブ)」に自然に落ちる(死にリンクにしない)。
//   v0.1.926: tab.active も持つ。active:false の watch タブ=「Alt+Tab に出ない裏タブ」(過去の autopatrol/
//     古い重複拡張の遺物の可能性)を status が検出して手動クローズ導線を出すため([[backgroundWatchTab]])。
//   @returns {Promise<Map<string, {tabId:number, windowId:number, active:boolean}>>}
async function queryWatchTabMap() {
  /** @type {Map<string, {tabId:number, windowId:number, active:boolean}>} */
  const map = new Map();
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://live.nicovideo.jp/watch/*', 'https://sp.live.nicovideo.jp/watch/*']
    });
    for (const tab of tabs || []) {
      const m = String(tab?.url || '').match(/\/watch\/(lv\d{1,15})/);
      if (m && Number.isFinite(Number(tab?.id))) {
        const lv = m[1].toLowerCase();
        // 同 lv が複数タブにある時は最初の1つ(切替先は1つで十分)。
        //   ただし active:true(前面)のタブを優先採用する=同 lv に裏タブと前面タブが両方あるとき、
        //   前面タブを代表にして「裏タブ扱い(=クローズ導線)」の誤爆を防ぐ。
        const cur = map.get(lv);
        const next = {
          tabId: Number(tab.id),
          windowId: Number(tab.windowId),
          active: tab.active === true
        };
        if (!cur || (next.active && !cur.active)) map.set(lv, next);
      }
    }
  } catch {
    /* 権限なし/context 切れ=空 Map(ボタンは新規タブ経路に落ちる) */
  }
  return map;
}

/* ============================================================================
 * サマリ読込(1 回の get() で全配信分一括)
 * ========================================================================== */

async function loadAllSummaries(lvList) {
  if (!Array.isArray(lvList) || !lvList.length) return {};
  /** @type {string[]} */
  const keys = [];
  for (const lv of lvList) {
    keys.push(PANEL_SUMMARY_PREFIX + lv);
    keys.push(WATCH_SNAPSHOT_PREFIX + lv);
    keys.push(PERF_DIAG_PREFIX + lv);
    keys.push(LIVE_ENDED_PREFIX + lv);
  }
  try {
    const bag = await chrome.storage.local.get(keys);
    return bag || {};
  } catch {
    return {};
  }
}

// 2026-06-23: 2秒ループ用の軽量 fastDiag(content が full と同時に書く ~1KB ダイジェスト)。
//   読み取りパスは full と同形=renderAll 以下の consumer は無変更で動く。full(~40KB)は読まない
//   =read+parse+stringify の重さを消す(council/status-heavy-open-SYNTHESIS.md)。
async function loadStatusFastDiagLiteSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_STATUS_FAST_DIAG_LITE);
    return bag?.[KEY_STATUS_FAST_DIAG_LITE] || null;
  } catch {
    return null;
  }
}

// 2026-06-18: popup の AI診断コピーにしか無い popup 固有診断(別キー)を読む。
//   popup を開いたときだけ更新される=古いことがあるので persistedAt を併記して集約する。
async function loadPopupDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_AI_SHARE_POPUP_DIAG);
    return bag?.[KEY_AI_SHARE_POPUP_DIAG] || null;
  } catch {
    return null;
  }
}

// v0.1.852: 会場モード(comeview・別ページ)の読み上げ診断を読む。comeview が定期的に
//   KEY_VOICE_DIAG(nls_voice_diag_v1)へ書く(発話/間引き時)。会場モード未使用なら null=表示しない。
async function loadVoiceDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_VOICE_DIAG);
    return bag?.[KEY_VOICE_DIAG] || null;
  } catch {
    return null;
  }
}

// v0.1.902: 会場モード(venueBar・別ページ)の座席診断を読む。会場が定期的に
//   KEY_VENUE_SEATS_DIAG へ書く。会場モード未使用なら null=セルを出さない。
async function loadLaneDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_LANE_DIAG);
    return bag?.[KEY_LANE_DIAG] || null;
  } catch {
    return null;
  }
}

// 2026-06-22(council/lane-show-all-active): 会場モード(venueBar・別ページ)の座席診断を読む。
async function loadVenueSeatsDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_VENUE_SEATS_DIAG);
    return bag?.[KEY_VENUE_SEATS_DIAG] || null;
  } catch {
    return null;
  }
}

// 応援レーン鏡(KEY_LANE_MIRROR)を読む。popup が renderStoryUserLane の最後で書く=popup を
//   一度も開いていなければ null=鏡セクションは hidden のまま(死にリンクにしない)。例外時も null。
//   ★毎回の直列 read は増やさない=この loader は extras(12秒間引き)からだけ呼ぶ(MEMORY 鉄則)。
async function loadLaneMirrorSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_LANE_MIRROR);
    return bag?.[KEY_LANE_MIRROR] || null;
  } catch {
    return null;
  }
}

// 数字カード鏡(KEY_STAT_CARDS_MIRROR)を読む。popup が renderWatchMetaCard の最後で書く=popup を
//   一度も開いていなければ null=鏡セクションは hidden のまま(死にリンクにしない)。例外時も null。
//   ★毎回の直列 read は増やさない=この loader は extras(12秒間引き)からだけ呼ぶ(MEMORY 鉄則)。
//   スナップショットは popup 側で確定済み(公式チップも digest 確定)=status はそのまま使う(restore 不要)。
async function loadStatCardsMirrorSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_STAT_CARDS_MIRROR);
    return bag?.[KEY_STAT_CARDS_MIRROR] || null;
  } catch {
    return null;
  }
}

/** 北極星レーン鏡(公式値レーン)を読む。popup が KEY_NORTH_STAR_MIRROR へ publish。extras(12秒)で読む。 */
async function loadNorthStarMirrorSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_NORTH_STAR_MIRROR);
    return bag?.[KEY_NORTH_STAR_MIRROR] || null;
  } catch {
    return null;
  }
}

// v0.1.858: レポート(HTML/マーケ/メディアキット)の DL前 主要KPI を読む。popup が
//   KEY_REPORT_PREVIEW へ定期(15秒)に書く。古い snapshot(2分超)や popup 未起動なら null=表示しない。
async function loadReportPreviewSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_REPORT_PREVIEW);
    const rec = bag?.[KEY_REPORT_PREVIEW];
    if (!isReportPreviewFresh(rec, Date.now())) return null;
    return rec;
  } catch {
    return null;
  }
}

// v0.1.862: 時系列トレンドの記録+分析。panel_summary から今回の集計KPI(記録/公式/取得率/来場)を作り、
//   ①既存ログ(新点を積む前=過去の傾向)で劣化を analyzeTrend ②今回のKPIを appendTrendSample で積んで
//   書き戻す(throttle は純関数側=30秒間引き)。分析を「積む前」にするのは、今回の点を含めると現在の値が
//   トレンドの端に入って判定が鈍るため(過去の連続点で傾向を見る)。失敗は握る=他の表示を妨げない。
//   @returns {Promise<import('../lib/statusTrend.js').TrendFinding[]>}
async function recordAndAnalyzeTrendSafe(lvList, summaries) {
  try {
    const lvs = Array.isArray(lvList) ? lvList : [];
    let recorded = 0;
    let official = 0;
    let watch = 0;
    let hasWatch = false;
    let catchingUp = false; // v0.1.887: 放送中×追いつき中(率<100)の配信が1つでもあるか。
    for (const lv of lvs) {
      const s = summaries[PANEL_SUMMARY_PREFIX + lv];
      const snap = summaries[WATCH_SNAPSHOT_PREFIX + lv];
      const rec = Number(s?.recordedCount) || 0;
      const off = Number(s?.officialCount ?? snap?.officialCommentCount) || 0;
      recorded += rec;
      official += off;
      const w = Number(snap?.viewerCountFromDom);
      if (Number.isFinite(w)) { watch += w; hasWatch = true; }
      // 追いつき中判定は buildBackfillProgressLine の正本(放送中×記録あり×率<100)に揃える。
      //   この時点に追いつき中があれば、全体の取得率が見かけ上下がるのは正常=trend の rate-declining を抑止。
      const endedFlag = summaries[LIVE_ENDED_PREFIX + lv];
      const ended = isLiveEndedFlag(endedFlag) ? endedFlag.endedAt : null;
      const livePct = off > 0 ? (rec / off) * 100 : null;
      if (!ended && rec > 0 && (livePct == null || livePct < 100)) catchingUp = true;
    }
    const ratePct = official > 0 ? Math.round((recorded / official) * 100) : null;
    const kpi = { recorded, official, ratePct, watch: hasWatch ? watch : null, catchingUp };

    const bag = await chrome.storage.local.get(KEY_STATUS_TREND);
    const prev = bag?.[KEY_STATUS_TREND] || null;
    const now = Date.now();
    const findings = analyzeTrend(prev, now); // 過去の傾向(今回の点を積む前)。
    const next = appendTrendSample(prev, kpi, now); // throttle で間引かれたら null。
    if (next) await chrome.storage.local.set({ [KEY_STATUS_TREND]: next }).catch(() => {});
    return findings;
  } catch {
    return [];
  }
}

/**
 * v0.1.659: 過去ログ取得の診断(stopReason)を読む。「一気に取れない・50%停止」の真因を
 *   ユーザーが status を開くだけで AI に共有できるように、どの配信が何の理由で止まったかを表示。
 *   nls_backfill_progress_v1 はグローバル(直近1配信分)。
 * @returns {Promise<{lid:string, rows:number, done:number, stopReason:string, errMsg:string}|null>}
 */
async function loadBackfillProgressSafe() {
  try {
    const bag = await chrome.storage.local.get('nls_backfill_progress_v1');
    const p = bag?.['nls_backfill_progress_v1'];
    if (!p || typeof p !== 'object') return null;
    return {
      lid: String(p.lid || ''),
      rows: Number(p.rows) || 0,
      done: Number(p.done) || 0,
      stopReason: String(p.stopReason || ''),
      // v0.1.692: aborted の真因(crawl 例外メッセージ)。content 側 publishBackfillProgress が保全する。
      errMsg: String(p.errMsg || '')
    };
  } catch {
    return null;
  }
}

/* ============================================================================
 * レンダリング
 * ========================================================================== */

// v0.1.861: レポートプレビューの信頼度注釈の文脈は純関数 reportPreviewCtxFromFastDiag(src/lib)に抽出済み
//   (NDGR 接続/userId 付き率/backfill 進行 → 注釈ctx・挙動同値・テストで固定)。import は冒頭。

function renderAll({ lvList, summaries, fastDiag, popupDiag, backfillProgress, voiceDiag, venueSeatsDiag, laneDiag, laneMirror, statCardsMirror, northStarMirror, reportPreview, trendFindings, watchTabMap }) {
  // v0.1.847: 各描画セクションを独立 try/catch で隔離するヘルパ。1つが throw しても他のセクションと
  //   最終更新メタを巻き込まない=「セルが全部消える/最終更新—のまま固まる」を根治。落ちた場所は
  //   console と AI 共有欄に出して真因を追えるようにする(star-romi 失敗体験の除去)。
  /** @param {string} name @param {() => void} fn */
  const safeSection = (name, fn) => {
    try {
      fn();
    } catch (err) {
      try {
        console.error(`[status] section "${name}" failed:`, err);
      } catch {
        /* no-op */
      }
      _statusLastErrorText =
        `⚠ 状態表示の一部(${name})でつまずきました: ${String(err?.message || err)}\n` +
        `  (他の表示と記録は継続しています。次の自動更新で回復する場合があります)`;
    }
  };

  // v0.1.847: livesData 組み立ては全セクションの土台。1配信の summarizeOneLive が throw しても
  //   その配信だけ落とし、他の配信と全セクションを白紙にしない(従来は1件の例外で renderAll 全滅→
  //   セル全消失・最終更新—固着の真因の1つ)。
  const livesData = (Array.isArray(lvList) ? lvList : [])
    .map((lv) => {
      try {
        return summarizeOneLive(
          lv,
          summaries[PANEL_SUMMARY_PREFIX + lv],
          summaries[WATCH_SNAPSHOT_PREFIX + lv],
          summaries[PERF_DIAG_PREFIX + lv],
          summaries[LIVE_ENDED_PREFIX + lv]
        );
      } catch (err) {
        try {
          console.error('[status] summarizeOneLive failed for', lv, err);
        } catch {
          /* no-op */
        }
        return null;
      }
    })
    .filter(Boolean);

  // 概要セクション
  // v0.1.804: enumerate の一瞬の揺れで累計だけが後退するのを床で吸収する。床はページが開いている間
  //   だけ保持し(リロードで素直に再計算)、storage には書かない。本当の値が床を超えれば床も上がる。
  // v0.1.847: 概要算出が throw しても空文字でフォールバック=後続セクションを止めない。
  let overviewText = '';
  try {
    overviewText = buildOverviewText(livesData, { recordedSumFloor: _recordedSumFloor });
    const recordedSumNow = sumRecordedFromLives(livesData);
    if (recordedSumNow > _recordedSumFloor) _recordedSumFloor = recordedSumNow;
  } catch (err) {
    try {
      console.error('[status] buildOverviewText failed:', err);
    } catch {
      /* no-op */
    }
  }
  // v0.1.659: 過去ログ取得の診断(stopReason)を概要に併記。「一気に取れない・50%停止」の真因を
  //   ユーザーが status を開くだけで AI 共有できる(reached_start=完走 / no_progress=疎区間で停止 /
  //   backward_exhausted=入口無し / cap_*=上限 / rate_limited=混雑)。
  // v0.1.692: 行組み立てを純関数 buildBackfillProgressLine(statusFormat.js)へ移譲。
  //   aborted の真因(crawl 例外メッセージ errMsg)があれば「・エラー: ...」を併記する。
  // v0.1.794: 進捗キー(nls_backfill_progress_v1)は content が完走時だけ書くため、長時間/複数配信では
  //   走行中ずっと backfillProgress=null=この行が空になり「過去ログを取っている気配が出ない」。
  //   記録中×放送中(endedAt無し)×未達(取得率<100)の配信があれば「取り込み中…」のフォールバックを
  //   出す(popup の v0.1.764 と対称・数字は出さず不安にさせない)。判定は livesData から行う。
  // v0.1.847: 概要の併記行(過去ログ進捗・公式値レーン)組み立てを隔離。throw しても概要本体は出す。
  let backfillLine = '';
  let laneLine = '';
  safeSection('概要併記', () => {
    const catchingUp = livesData.some(
      (lv) => !lv.endedAt && lv.recordedCount > 0 && (lv.officialRatePct == null || lv.officialRatePct < 100)
    );
    const bpLine = buildBackfillProgressLine(backfillProgress, { catchingUp });
    backfillLine = bpLine ? `\n${bpLine}` : '';
    // v0.1.766(ユーザー要望「概要にレーン状況も入れたい」): 公式値レーン(北極星レーン)の状況を
    //   概要に併記。「レーンが出ていない時」を status を見るだけで分かる。視聴中の配信のみ取得可能
    //   (fastDiag.content.giftDiagnostics の「北極星レーン」)なので、取れたときだけ1行足す。
    const laneStr = buildLaneStatusLine(fastDiag?.content?.giftDiagnostics?.['北極星レーン']);
    laneLine = laneStr ? `\n${laneStr}` : '';
  });
  // v0.1.852: 会場モードの読み上げ診断を概要に併記(使っていなければ空)。「たまに遅れる」の
  //   切り分け=待機ピーク/間引き/最終発話からの経過を status を見るだけで AI 共有できる。
  let voiceLine = '';
  safeSection('会場読み上げ診断', () => {
    const vStr = buildVoiceDiagLine(voiceDiag, Date.now());
    voiceLine = vStr ? `\n${vStr}` : '';
  });
  // v0.1.858: レポート(HTML/マーケ/メディアキット)の DL前 主要KPI を概要に併記。popup を開いて
  //   いる配信だけ取れる(popup が15秒ごとに publish)。保存しなくても中身が分かる=過小集計を即発見。
  let reportPreviewLine = '';
  safeSection('レポート内容プレビュー', () => {
    const rStr = buildReportPreviewLines(reportPreview, reportPreviewCtxFromFastDiag(fastDiag, backfillProgress));
    reportPreviewLine = rStr ? `\n${rStr}` : '';
  });
  const overviewEl = document.getElementById('overviewBody');
  if (overviewEl) {
    overviewEl.textContent =
      (overviewText || '視聴中の配信はありません。') +
      backfillLine + laneLine + voiceLine + reportPreviewLine;
    overviewEl.classList.toggle('empty-note', !overviewText);
  }

  // 配信ごとのカード
  safeSection('配信カード', () => {
  const livesEl = document.getElementById('livesBody');
  if (livesEl) {
    if (!livesData.length) {
      _lastLivesSig = '';
      livesEl.className = 'empty-note';
      livesEl.textContent = '';
      const note = document.createElement('div');
      note.textContent =
        '視聴中の配信が見つかりませんでした。ニコ生 watch ページを開いてから戻ってきてください。';
      livesEl.appendChild(note);
      // 配信が無くても「WEBサイトURLで見る」を失わないフォールバック(送信→現状の概要URLを開く)。
      const webUrlBtn = buildWebUrlButton();
      if (webUrlBtn) {
        webUrlBtn.style.marginRight = '0';
        livesEl.appendChild(webUrlBtn);
      }
    } else {
      // v0.1.868: 「スムーズじゃない」対策。配信カードは 2 秒ごとに innerHTML 全再構築+<img>再生成で
      //   サムネが毎回チラつき重い。表示に効く値だけの軽い signature を作り、変化が無ければ再構築を
      //   丸ごと skip(描画/画像再取得を止める)。値が動いた時だけ作り直す。
      const sig = livesData
        .map((l) => `${l.lv}|${l.recordedCount}|${l.officialCommentCount}|${l.watchCount}|${l.giftPoints}|${l.elapsedSec}|${l.endedAt ? 1 : 0}|${l.thumbnailUrl ? 1 : 0}`)
        .join('~')
        // v0.1.869: 応援者データの配信(reportPreview.liveId)と件数も signature に含める=popup の応援者が
        //   届いたら該当カードを作り直して展開に反映(届くまでは案内のまま)。
        + `#rp:${String(reportPreview?.liveId || '')}:${Array.isArray(reportPreview?.topSupporters) ? reportPreview.topSupporters.length : 0}`;
      if (sig === _lastLivesSig) return; // 変化なし=再描画しない(チラつき/重さの主因を除去)。
      _lastLivesSig = sig;
      // 画面が広いとき方眼紙のように横へ並べるグリッド(狭いと1列)。
      livesEl.className = '';
      livesEl.style.display = 'grid';
      livesEl.style.gap = '12px';
      livesEl.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
      livesEl.innerHTML = '';
      for (const live of livesData) {
        const card = document.createElement('div');
        const isEnded = !!live.endedAt;
        const isBackground = live.perfDiag && live.perfDiag.tabVisible === false;
        let accent = 'var(--nl-border)';
        let bg = 'var(--nl-card-bg)';
        if (isEnded) {
          accent = '#f0a0a0';
          bg = 'rgba(240,160,160,0.08)';
        } else if (isBackground) {
          accent = '#9ca3af';
          bg = 'rgba(156,163,175,0.08)';
        } else {
          accent = 'var(--nl-accent)';
        }
        card.style.cssText =
          'padding:10px 12px;border-radius:8px;' +
          `border:1px solid var(--nl-border);border-left:4px solid ${accent};background:${bg};`;

        // v0.1.866: ちくらん風ヘッダー(サムネ+配信者名+タイトル+経過/来場/コメント/ギフト)を最上部に。
        card.appendChild(buildChikuranHeaderEl(live));

        // 健康チェック(5段階・●○)。数値を読まなくても状態が一目で分かる。
        card.appendChild(buildHealthCheckEl(live));

        const pre = document.createElement('pre');
        pre.textContent = buildLiveBlockText(live);
        pre.style.margin = '0';
        card.appendChild(pre);

        // v0.1.871: 応援ライブビューを新規タブで開くボタン(Chrome 体験・リアルタイムで盛り上がり表示)。
        const liveBtn = buildLiveViewButton(live);
        if (liveBtn) card.appendChild(liveBtn);

        // v0.1.864: 放送導線。状態別ボタン(切替/新規タブ/アーカイブ)。lv 不正なら出さない。
        const watchBtn = buildWatchLinkButton(live, watchTabMap);
        if (watchBtn) card.appendChild(watchBtn);

        // 2026-06-25: 共有導線「🌐 WEBサイトURLで見る」を同じ行に(UIUX: 上部の汎用バーから移設)。
        //   送信→WEB状態速報URLを新規タブで開く。キー未設定ビルドでは null=出さない。
        const webUrlBtn = buildWebUrlButton();
        if (webUrlBtn) card.appendChild(webUrlBtn);

        // 2026-06-23: この配信が「Alt+Tab に出ない裏タブ(active:false)」のときだけ、警告 + 手動クローズ
        //   ボタンを出す(過去 autopatrol/古い重複拡張の遺物対策・自動では閉じない=誤爆ゼロ)。
        const bgTabNotice = buildBackgroundTabCloseNotice(live, watchTabMap);
        if (bgTabNotice) card.appendChild(bgTabNotice);

        // v0.1.869: クリックで応援者ランキングを展開(将来の Kimito Link ランキング)。
        //   応援者データ(topSupporters)は popup で開いている配信ぶんだけ取れる=その配信は展開表示、
        //   他は「この配信を popup で開くと応援者が見えます」と案内(死にリンクにしない)。
        const supEl = buildSupporterExpander(live, reportPreview);
        if (supEl) card.appendChild(supEl);

        livesEl.appendChild(card);
      }
    }
  }
  });

  // 🩹 いま気になる点と対処(症状→原因→次の一手・最上部)
  safeSection('対処候補', () => renderActionCards({ livesData, fastDiag, popupDiag, reportPreview, trendFindings }));

  // 健全度パネル(ファーストビュー・正常100/異常だけ色・対象外は—)
  //   v0.1.894: 会場モード読み上げセル(タイミング・抜け漏れ)を出すため voiceDiag も渡す。
  safeSection('健全度パネル', () => renderHealthCells({ livesData, fastDiag, voiceDiag, venueSeatsDiag, laneDiag }));

  // popup 埋め込み(本物 iframe・v0.1.916 試作): popup.html?inline=1&dock=status&lv=<lv> を iframe で
  //   丸ごと出し「見た目も操作も popup そっくり」を本物のまま映す。下の鏡(間引き)より上に置き、出たら
  //   鏡は安全網として共存。独立 try/catch=iframe が壊れても status コア・鏡を巻き込まない。
  safeSection('popup埋め込み', () => ensureStatusPopupIframe(lvList, laneMirror));

  // 2026-06-26: 応援レーン鏡は status 画面から【撤去】(ユーザー実機「ちくらん画面に応援レーンがあると遅い」)。
  //   status は2秒ループ再描画で、顔つきレーンの毎回 paint が重さ/「—」固まりの一因。応援レーンは各配信カードの
  //   「🔥 応援ライブビューを開く」(buildLiveViewButton→live-view.html?lv=)で必要時だけ別タブに描く。
  //   laneMirror は純Web /live-view 用に publish/jsonBlob 相乗りは継続(status に描かないだけ)。

  // 数字カード鏡: v0.1.948 で status 描画を撤去。
  //   データ(statCardsMirror)は loadStatCardsMirrorSafe→jsonBlob 経由で純Web /live-view に継続送信。
  //   閲覧は配信カードの「🔥 応援ライブビューを開く」(buildLiveViewButton→live-view.html?lv=)から。

  // 全体マインドマップ(折りたたみツリー・ここを見れば全部わかる)
  safeSection('マインドマップ', () => renderMindmap({ overviewText, livesData, fastDiag, popupDiag }));

  // 純Web公開ペイロード(jsonBlob)を先に組み立てる=自己診断(buildAiShareFullText)が「純Webに送る当の
  //   データ」を読めるようにする。従来は buildAiShareFullText の後に組んでいたため自己診断ができなかった。
  const jsonBlob = {
    generatedAt: new Date().toISOString(),
    overview: overviewText,
    lives: livesData,
    fastDiag,
    // 2026-06-23: 純Web版の応援ライブビュー(app/live-view)用。popup の応援レーン/数字カードの鏡
    //   スナップショット(顔/名前込み・既存の純データ)を「スマホへ送信」のペイロードに相乗りさせる。
    //   サーバー(api/status.js)は payload を丸ごと保存=無変更。純Webは本物の paintStoryUserLaneDomFilled
    //   で描く(council/liveview-web-public-SYNTHESIS.md)。popup 未起動なら null=純Web側は空ガイドにフォールバック。
    laneMirror: laneMirror || null,
    statCardsMirror: statCardsMirror || null,
    // 2026-06-25(C1): 北極星レーン鏡(公式値レーン・まず contributionRanking=ギフト貢献度)を純Webへ相乗り。
    //   popup が KEY_NORTH_STAR_MIRROR へ publish→status が extras(12秒)で読む→純Web が本物 paint で描く。
    northStarMirror: northStarMirror || null,
    // 2026-06-25(P3): 応援者ランキング(顔つき)を純Webにも出すため、reportPreview の上位応援者を相乗り送信。
    //   liveId 同梱で鮮度/対象配信を判定。reportPreview が無い(popup 未起動等)なら null=純Web側は hidden。
    //   上位10件 cap で小さい(payload 実測131KB=512KB cap の25%・肥大しない)。
    topSupporters: reportPreview && Array.isArray(reportPreview.topSupporters)
      ? { liveId: String(reportPreview.liveId || ''), rows: reportPreview.topSupporters.slice(0, 10) }
      : null
  };
  // 自己診断の「いま視聴中の lv」= 鏡(北極星/lane/数字)の liveId を優先採用(read を増やさない)。
  const currentLiveId = String(
    northStarMirror?.liveId || laneMirror?.liveId || statCardsMirror?.liveId || ''
  );
  const publishKeys = getUploadConfig();

  // AI 共有用テキスト
  let fullText = '';
  safeSection('AI共有テキスト', () => {
    fullText = buildAiShareFullText({ overviewText, livesData, fastDiag, popupDiag, voiceDiag, venueSeatsDiag, laneDiag, reportPreview, trendFindings, jsonBlob, currentLiveId, publishKeys });
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      document.getElementById('aiShareText')
    );
    if (ta && ta.value !== fullText) ta.value = fullText;
  });

  _lastRenderedBundle = {
    overview: overviewText,
    lives: livesData,
    textBlob: fullText,
    jsonBlob
  };
  // 応援ライブビュー(拡張内 live-view.html)の「このURLをWEBでも公開する」用に、いま組み立てた
  //   公開ペイロード(jsonBlob)+共有キーを storage へ置く。live-view ページは別ページで jsonBlob を
  //   持たないため、再構築せず【これを読んで POST するだけ】=status が送るものと byte 一致(drift ゼロ)。
  publishLiveViewPublishPayload(_lastRenderedBundle.jsonBlob);
}

/** 公開ペイロード書き込みの min-gap 計時(描画のたびに書くが頻度を抑える)。 */
let _liveViewPublishPayloadLastWriteAt = 0;
/**
 * 応援ライブビュー(拡張内)から WEB 公開できるよう、最新の jsonBlob + 共有キーを storage へ置く。
 *   best-effort(失敗しても status を止めない)・3秒 min-gap。キー未設定ビルドでは置かない。
 * @param {object} jsonBlob
 */
function publishLiveViewPublishPayload(jsonBlob) {
  try {
    const { ingestKey, viewToken, appOrigin } = getUploadConfig();
    if (!ingestKey || !viewToken || !jsonBlob) return; // キー未設定=公開不可=置かない
    const now = Date.now();
    if (now - _liveViewPublishPayloadLastWriteAt < 3000) return;
    _liveViewPublishPayloadLastWriteAt = now;
    void chrome.storage.local
      .set({ [KEY_LIVEVIEW_PUBLISH_PAYLOAD]: { jsonBlob, ingestKey, viewToken, appOrigin, savedAt: now } })
      .catch(() => {
        /* best-effort: storage 不可・context 消失 */
      });
  } catch {
    /* no-op */
  }
}

/* ============================================================================
 * 🩹 いま気になる点と対処(症状→原因→次の一手・解決カード)
 * ========================================================================== */

const ACTION_BADGE = { bad: '🔴', warn: '🟡', info: '⚪' };
const FIXABLE_LABEL = {
  yes: 'この画面の操作で対処できます',
  partly: '操作で改善することがあります',
  no: 'status の外が原因(下記の手動操作を試してください)'
};

/**
 * 健全度パネル(ファーストビュー)。buildHealthCells の純粋結果を %+色 セルで描く。
 * 正常=淡い緑・劣化=黄/赤+値・対象外=灰の「—」(失敗体験の除去)。textContent で安全に組む。
 * @param {{ livesData?: any[], fastDiag?: any }} data
 */
function renderHealthCells(data) {
  const host = document.getElementById('healthCells');
  if (!host) return;
  const cells = buildHealthCells(data);
  const v = summarizeHealthVerdict(cells);
  // v0.1.890: 2秒ごとの全セル再生成を止める(配信カード v0.1.868 と同型の signature guard)。
  //   表示に効く値(label/level/value/text)だけで署名し、変化が無ければ DOM を触らない=
  //   健全度パネル(基本6+北極星6+その他=~18セル)の毎回 replaceChildren+createElement ループを skip。
  //   値が変われば再構築されるので表示は常に最新。「状態速報が重い」の render 側ボトルネックを軽くする。
  const sig =
    `${v.level}|${v.text}|` +
    cells.map((c) => `${c.label}:${c.level}:${c.kind === 'pct' ? c.value : c.text || ''}`).join('~');
  if (sig === _lastHealthSig) return; // 変化なし=再描画しない。
  _lastHealthSig = sig;
  // v0.1.846: 先頭に総合判定バッジ。満点=「全部緑」でなく「異常ゼロ」(進行中/対象外は正常)。
  const verdictHost = document.getElementById('healthVerdict');
  if (verdictHost) {
    verdictHost.replaceChildren();
    verdictHost.className = `health-verdict hv-${v.level}`;
    const mark = v.level === 'ok' ? '🟢' : v.level === 'warn' ? '🟡' : '🔴';
    const span = document.createElement('span');
    span.textContent = `${mark} 総合判定: ${v.text}`;
    verdictHost.appendChild(span);
  }
  host.replaceChildren();
  for (const c of cells) {
    const div = document.createElement('div');
    div.className = `hc hc-${c.level}`;
    const label = document.createElement('div');
    label.className = 'hc-label';
    label.textContent = c.label;
    const val = document.createElement('div');
    val.className = 'hc-val';
    val.textContent = c.kind === 'pct'
      ? (c.value == null ? '—' : `${c.value}%`)
      : (c.text || '—');
    div.title = `${c.label}: ${val.textContent}`;
    div.appendChild(label);
    div.appendChild(val);
    host.appendChild(div);
  }
}

/** popup 埋め込み iframe の再生成 skip 判定用 signature(同じ src なら作り直さない=チラつき防止)。 */
let _lastStatusPopupEmbedSrc = '';

/**
 * popup 埋め込み(本物 iframe・v0.1.916 試作): popup.html?inline=1&dock=status&lv=<lv> を iframe で丸ごと
 *   埋め込み「見た目も操作も popup そっくり」を本物のまま映す。鏡(間引き)の抜け漏れを根治する本筋。
 *   dock=status=受動ビュー(popup-entry.js INLINE_PASSIVE)=書かない・注入しない・fetch しない。
 *   lv は renderAll が既に持つ lvList(enumerateActiveLives 経路1=開いている watch タブ優先)を使う
 *   =新規 storage read を増やさない(MEMORY 鉄則)。lvList 空なら laneMirror.liveId にフォールバック。
 *   lv が取れない/iframe を出せない時は section ごと hidden=下の鏡がフォールバックで表示を担保。
 *   会場(venue)とは無関係=popup と status だけ。
 * @param {string[]} lvList 視聴中 lv(優先)
 * @param {{ liveId?: string }|null|undefined} laneMirror 鏡 snapshot(フォールバック lv 源)
 */
/**
 * ★緊急停止フラグ(v0.1.917): false の間は popup 埋め込み iframe を【出さない】。
 * 理由=埋め込んだ iframe 内 popup が「閉じても勝手に別配信タブを開く」実機症状の疑い(過去に backfill
 * 環境を壊した『勝手なタブ操作』と同種)。被害を即止めるため一旦無効化し、原因特定後に true へ戻す。
 * 無効中は下の「鏡」がフォールバックで表示を担保するので status は無事。
 */
const STATUS_POPUP_EMBED_ENABLED = false;

function ensureStatusPopupIframe(lvList, laneMirror) {
  const section = document.getElementById('statusPopupEmbed');
  const host = document.getElementById('statusPopupEmbedHost');
  if (!section || !host) return;

  // 緊急停止: iframe を出さない=section を隠し、既存 iframe があれば src を外して除去(中の popup を停止)。
  if (!STATUS_POPUP_EMBED_ENABLED) {
    const existing = host.querySelector('iframe');
    if (existing) {
      try { existing.setAttribute('src', 'about:blank'); } catch { /* no-op */ }
      try { existing.remove(); } catch { /* no-op */ }
    }
    section.hidden = true;
    _lastStatusPopupEmbedSrc = '';
    return;
  }

  // lv 解決: 開いている watch タブ(lvList) 優先 → 鏡 snapshot の liveId(=popup が最後に開いた配信)。
  const fromList = (Array.isArray(lvList) ? lvList : [])
    .map((s) => String(s || '').trim().toLowerCase())
    .find((s) => /^lv\d{1,15}$/.test(s));
  const fromMirror = String(laneMirror?.liveId || '').trim().toLowerCase();
  const lv = fromList || (/^lv\d{1,15}$/.test(fromMirror) ? fromMirror : '');

  if (!lv) {
    // どの放送も特定できない=iframe を出さず鏡フォールバック(死に画面にしない)。
    section.hidden = true;
    _lastStatusPopupEmbedSrc = '';
    return;
  }

  // chrome-extension://<id>/popup.html?inline=1&dock=status&lv=<lv> を src に焼く。
  //   dock=status で popup は受動ビュー(INLINE_PASSIVE)になり storage/fetch/注入を一切しない。
  let src = '';
  try {
    const u = new URL(chrome.runtime.getURL('popup.html'));
    u.searchParams.set('inline', '1');
    u.searchParams.set('dock', 'status');
    u.searchParams.set('lv', lv);
    src = u.href;
  } catch {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  // signature ガード: src(=lv)が前回と同じなら iframe を作り直さない(再ロードのチラつき/重さ防止)。
  if (src === _lastStatusPopupEmbedSrc) {
    if (host.querySelector('iframe')) return;
  }
  _lastStatusPopupEmbedSrc = src;

  let iframe = /** @type {HTMLIFrameElement|null} */ (host.querySelector('iframe'));
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'nicolivelog popup embed');
    iframe.setAttribute('allow', 'microphone');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.style.backgroundColor = 'transparent';
    host.appendChild(iframe);
  }
  if (iframe.getAttribute('src') !== src) {
    iframe.setAttribute('src', src);
  }
}

// MIRROR_FRESH_MS は v0.1.948 で応援レーン鏡/数字カード鏡の status 描画を撤去したため削除。

/**
 * @param {{ livesData?: any[], fastDiag?: any, popupDiag?: any }} data
 */
function renderActionCards(data) {
  const host = document.getElementById('actionBody');
  if (!host) return;
  let cards;
  try {
    cards = buildStatusActions(data);
  } catch (err) {
    // 星野メソッド: 失敗を空白で終わらせない。必ず「次の一手」を出す(下の AI共有まとめは常に動く)。
    _lastActionSig = ''; // エラー後は次の成功で必ず再構築させる。
    host.className = 'empty-note';
    host.textContent =
      `対処カードを組み立てられませんでした(${String(err?.message || err).slice(0, 80)})。` +
      '下の「🤖 AI に貼る用テキスト」をコピーして AI に貼ると原因を調べられます。';
    return;
  }
  // v0.1.890: 2秒ごとの全カード再生成を止める(健全度パネルと同型の signature guard)。
  //   id+severity+symptom で署名(内容が変われば symptom が変わる)。変化なしなら DOM を触らない。
  const actionSig = cards.map((c) => `${c.id}:${c.severity}:${c.symptom || ''}`).join('~');
  if (actionSig === _lastActionSig) return;
  _lastActionSig = actionSig;
  host.className = '';
  host.innerHTML = '';
  if (!cards.length) {
    host.className = 'empty-note';
    host.textContent = '🟢 大きな問題は見当たりません。';
    return;
  }
  for (const c of cards) {
    const card = document.createElement('div');
    const accent = c.severity === 'bad' ? '#f0a0a0' : c.severity === 'warn' ? '#e0b050' : 'var(--nl-border)';
    card.style.cssText =
      'padding:10px 12px;border-radius:8px;margin-bottom:8px;' +
      `border:1px solid var(--nl-border);border-left:4px solid ${accent};background:var(--nl-card-bg);`;
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:700;margin-bottom:4px;';
    head.textContent = `${ACTION_BADGE[c.severity] || '⚪'} ${c.symptom}`;
    const cause = document.createElement('div');
    cause.style.cssText = 'font-size:13px;color:var(--nl-text-soft);margin-bottom:4px;';
    cause.textContent = `原因(推定): ${c.cause}`;
    const action = document.createElement('div');
    action.style.cssText = 'font-size:13px;margin-bottom:2px;';
    action.textContent = `➡ 次の一手: ${c.action}`;
    const fix = document.createElement('div');
    fix.style.cssText = 'font-size:11.5px;color:var(--nl-text-soft);';
    fix.textContent = FIXABLE_LABEL[c.fixableHere] || '';
    card.append(head, cause, action, fix);
    host.appendChild(card);
  }
}

/* ============================================================================
 * 全体マインドマップ(折りたたみツリー・native <details>・外部ライブラリ無し)
 * ========================================================================== */

const MIND_BADGE = { ok: '🟢', warn: '🟡', bad: '🔴', info: '⚪', '': '' };

/**
 * モデルノードを <details>/<summary>(子あり) or <div.leaf>(葉) の DOM へ。
 * @param {{ label: string, value?: string, badge?: string, children?: any[], open?: boolean }} node
 * @returns {HTMLElement}
 */
function buildMindNodeEl(node) {
  const badge = MIND_BADGE[node.badge || ''] || '';
  const hasKids = Array.isArray(node.children) && node.children.length > 0;
  if (!hasKids) {
    const leaf = document.createElement('div');
    leaf.className = 'leaf';
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = badge;
    const lab = document.createElement('span');
    lab.className = 'mlabel';
    lab.textContent = node.label;
    leaf.appendChild(b);
    leaf.appendChild(lab);
    if (node.value) {
      const v = document.createElement('span');
      v.className = 'mvalue';
      v.textContent = ` — ${node.value}`;
      leaf.appendChild(v);
    }
    return leaf;
  }
  const details = document.createElement('details');
  if (node.open) details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = `${badge} ${node.label}${node.value ? ` — ${node.value}` : ''}`;
  details.appendChild(summary);
  for (const child of node.children) {
    details.appendChild(buildMindNodeEl(child));
  }
  return details;
}

/**
 * @param {{ overviewText?: string, livesData?: any[], fastDiag?: any, popupDiag?: any }} data
 */
function renderMindmap(data) {
  const host = document.getElementById('mindmapBody');
  if (!host) return;
  let model;
  try {
    model = buildStatusMindmapModel(data);
  } catch (err) {
    // 星野メソッド: 失敗を空白で終わらせない。必ず「次の一手」を出す。
    host.className = 'empty-note';
    host.textContent =
      `マインドマップを組み立てられませんでした(${String(err?.message || err).slice(0, 80)})。` +
      '下の「🤖 AI に貼る用テキスト」をコピーして AI に貼ると原因を調べられます。';
    return;
  }
  host.className = 'mind';
  host.innerHTML = '';
  // 根の子(主要枝)を並べる。根自身は見出しに既に出ているので展開済みで描く。
  for (const branch of model.children || []) {
    host.appendChild(buildMindNodeEl(branch));
  }
}

/** 全部ひらく/とじる(マインドマップ内の details を一括操作) */
function setAllMindDetails(open) {
  const host = document.getElementById('mindmapBody');
  if (!host) return;
  host.querySelectorAll('details').forEach((d) => {
    /** @type {HTMLDetailsElement} */ (d).open = open;
  });
}

/* ============================================================================
 * 集計/整形ヘルパ(純関数寄り・テスト容易)
 * ========================================================================== */

// v0.1.871: 「🔥 応援ライブビューを開く」ボタン。クリックで live-view.html?lv=... を新規タブで開く
//   (Chrome 体験・リアルタイムで盛り上がり🔥/応援者🏆/コメント数を脈打たせる)。lv 不正なら出さない。
//   chrome.runtime.getURL で拡張内ページURLを作る=確実に到達(死にリンクにしない)。将来サーバー公開版は
//   ここの URL を公開 URL に差し替えるだけ。
function buildLiveViewButton(live) {
  const lv = String(live?.lv || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lv)) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '🔥 応援ライブビューを開く';
  // ★会議(案C)で役割明確化: これが「ポップアップそっくりの同一画面・リアルタイム・本人用」。
  //   共有したいときは隣の「🔗 WEBサイトURLで共有」。取り違え防止のため tooltip で一言。
  btn.title = 'このポップアップそっくりの画面をリアルタイムで別タブに開きます(本人用)。拡張なしで他人に共有するなら「WEBサイトURLで共有」。';
  btn.style.cssText =
    'margin-top:8px;margin-right:6px;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;' +
    'border:1px solid var(--nl-accent);background:var(--nl-accent);color:#fff;';
  btn.addEventListener('click', () => {
    try {
      const url = chrome.runtime.getURL(`live-view.html?lv=${encodeURIComponent(lv)}`);
      chrome.tabs.create({ url });
    } catch {
      /* context 切れ=無視(次の更新で復帰) */
    }
  });
  return btn;
}

// 2026-06-25: 配信カードの共有ボタン。クリックで現状をサーバーに送信(uploadStatusSnapshot)し、
//   成功したら WEB 状態速報 URL を新規タブで開く。
//   ★会議(council/webview-equals-liveview-SYNTHESIS.md・案C)で用途を明確化=このボタンは
//     「拡張なしで他人に共有(スナップショット)」専用。「応援ライブビューを開く」(本人・リアルタイム・
//     popup そっくり)とは役割が別。文言を「共有」と明記してユーザーの取り違えを無くす(誠実な設計)。
//   結果(成功/失敗・両URL)は従来どおり上部 #uploadResult にも出す。
//   キー未注入ビルドでは出さない(死にボタン回避)。多重送信防止に送信中はボタンを無効化。
function buildWebUrlButton() {
  const { ingestKey, viewToken } = getUploadConfig();
  if (!ingestKey || !viewToken) return null; // キー未設定ビルド=出さない。
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '🔗 WEBサイトURLで共有';
  btn.title = '拡張なしのスマホ/他人でも見られる共有URLを作って開きます(送信した時点のスナップショット)。開くのはポップアップそっくりの「応援ライブビュー」のWeb版です。';
  btn.style.cssText =
    'margin-top:8px;margin-right:6px;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;' +
    'border:1px solid var(--nl-accent);background:var(--nl-card-bg);color:var(--nl-accent);';
  btn.addEventListener('click', async () => {
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = '送信中...';
    const r = await uploadStatusSnapshot();
    btn.textContent = prev;
    btn.disabled = false;
    const resultEl = document.getElementById('uploadResult');
    if (resultEl) {
      if (r.ok) renderUploadResultLinks(resultEl, r);
      else {
        resultEl.replaceChildren();
        resultEl.style.whiteSpace = '';
        resultEl.textContent = `× ${r.error}`;
      }
    }
    // 成功したら新規タブで開く(ユーザー指定: 送信して URL を開く)。
    //   2026-06-25: 主役は popup そっくりの応援ライブビュー(/live-view)。ユーザー確定=「WEBサイトURLで共有」=
    //   popup そっくりのコピーを共有/表示する、が期待。liveViewUrl が無い時だけ状態速報(statusUrl)に落とす。
    const openUrl = r.liveViewUrl || r.url;
    if (r.ok && openUrl) {
      try {
        chrome.tabs.create({ url: openUrl });
      } catch {
        /* context 切れ等=無視(上部 #uploadResult にリンクは出ている) */
      }
    }
  });
  return btn;
}

// v0.1.869: 配信カードの「応援者ランキングを見る」展開(将来の Kimito Link ランキング)。
//   応援者データ(reportPreview.topSupporters)は popup で開いている配信ぶんだけ取れる=その配信
//   (live.lv === reportPreview.liveId)は展開で🥇🥈🥉を表示・他は popup で開く案内(死にリンクにしない)。
//   クリックで開閉する details/summary。textContent で安全に組む。
function buildSupporterExpander(live, reportPreview) {
  const lv = String(live?.lv || '').trim().toLowerCase();
  if (!lv) return null;
  const rpLv = String(reportPreview?.liveId || '').trim().toLowerCase();
  const rows = lv === rpLv && Array.isArray(reportPreview?.topSupporters) ? reportPreview.topSupporters : null;

  const det = document.createElement('details');
  det.style.cssText = 'margin-top:8px;';
  const sum = document.createElement('summary');
  sum.textContent = '🏆 応援者ランキングを見る';
  sum.style.cssText = 'cursor:pointer;font-size:12px;color:var(--nl-accent);user-select:none;';
  det.appendChild(sum);

  const body = document.createElement('div');
  body.style.cssText = 'margin-top:6px;font-size:13px;';
  if (rows && rows.length) {
    // 行描画は純DOMビルダー buildSupporterRankingRows(src/lib)に抽出済み(挙動同値・テストで固定)。
    //   純Web(app/live-view)も同じ io(本物 supporterRowToPersonTile→buildPersonTileEl)で再利用=似せて自作しない。
    body.appendChild(buildSupporterRankingRows(rows, _supporterRankingDomIo));
  } else {
    const hint = document.createElement('div');
    hint.textContent = 'この配信を拡張ポップアップで開くと、応援者ランキングがここに出ます。';
    hint.style.cssText = 'color:var(--nl-text-soft);';
    body.appendChild(hint);
  }
  det.appendChild(body);
  return det;
}

/**
 * v0.1.864: 放送導線ボタン。状態別(切替/新規タブ/アーカイブ)に文言と挙動を分ける(星野ロミ式・
 *   失敗体験の除去)。判定は純関数 pickOpenAction が正本。lv 不正なら null=ボタンを出さない(死にリンク回避)。
 *   切替(tabs.update)が失敗(タブが既に閉じられた等)したら新規タブ生成にフォールバック=「押したのに
 *   何も起きない」を構造的に潰す。
 * @param {object} live
 * @param {Map<string,{tabId:number,windowId:number}>|undefined} watchTabMap
 * @returns {HTMLButtonElement|null}
 */
function buildWatchLinkButton(live, watchTabMap) {
  const lv = String(live?.lv || '').trim().toLowerCase();
  const tabEntry = watchTabMap instanceof Map ? watchTabMap.get(lv) || null : null;
  const action = pickOpenAction({ lv, endedAt: live?.endedAt, tabEntry });
  if (!action) return null; // lv 不正=出さない。
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = `▶ ${action.label}`;
  btn.style.cssText =
    'margin-top:8px;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;' +
    'border:1px solid var(--nl-accent);background:var(--nl-card-bg);color:var(--nl-accent);';
  const openNewTab = () => {
    try {
      if (action.url) chrome.tabs.create({ url: action.url });
    } catch {
      /* context 切れ=無視(次の更新で復帰) */
    }
  };
  btn.addEventListener('click', () => {
    if (action.kind === 'switch' && action.tabId != null) {
      try {
        chrome.tabs.update(action.tabId, { active: true }).then(
          () => {
            // ウィンドウも前面に(別ウィンドウのタブを切替えた時に見える)。
            if (action.windowId != null) {
              try { chrome.windows.update(action.windowId, { focused: true }); } catch { /* no-op */ }
            }
          },
          () => openNewTab() // タブが既に閉じられている等=新規タブにフォールバック。
        );
      } catch {
        openNewTab();
      }
    } else {
      openNewTab(); // open / archive。
    }
  });
  return btn;
}

/**
 * 2026-06-23(council/orphan-tab-survivor): 「Alt+Tab に出ない裏 watch タブ」の警告 + 手動クローズボタン。
 *   active:false の watch タブ=ユーザーが前面で見ていない=過去の autopatrol/古い重複拡張が開いた遺物の
 *   可能性。だが「裏で流し見」している手動タブと観測上は区別できないため、【自動では閉じない】。
 *   ユーザーがボタンを押したときだけ chrome.tabs.remove する(誤爆ゼロ)。active:true(前面)タブには出さない。
 * @param {object} live
 * @param {Map<string,{tabId:number,windowId:number,active:boolean}>|undefined} watchTabMap
 * @returns {HTMLElement|null}
 */
function buildBackgroundTabCloseNotice(live, watchTabMap) {
  const lv = String(live?.lv || '').trim().toLowerCase();
  const tabEntry = watchTabMap instanceof Map ? watchTabMap.get(lv) || null : null;
  if (!tabEntry) return null;
  if (!isBackgroundWatchTab(tabEntry)) return null; // active:true / tabId 無効=出さない(手動視聴は誤爆しない)。

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'margin-top:8px;padding:8px 10px;border-radius:6px;font-size:12px;' +
    'border:1px solid var(--nl-warn,#d97706);background:var(--nl-card-bg);color:var(--nl-text);';

  const msg = document.createElement('div');
  msg.textContent =
    '⚠ このタブは Alt+Tab に出てこない「裏タブ」です(拡張が過去に自動で開いた遺物の可能性)。' +
    '裏でこの配信を流し見していないなら、閉じても問題ありません。';
  msg.style.cssText = 'margin-bottom:6px;line-height:1.5;';
  wrap.appendChild(msg);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '🗙 この裏タブを閉じる';
  btn.style.cssText =
    'padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;' +
    'border:1px solid var(--nl-warn,#d97706);background:var(--nl-card-bg);color:var(--nl-warn,#d97706);';
  const tabId = Number(tabEntry.tabId);
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = '閉じています…';
    try {
      chrome.tabs.remove(tabId).then(
        () => {
          btn.textContent = '✓ 閉じました(次の更新でカードが消えます)';
        },
        () => {
          // 既に閉じられている等=次の更新で自然に消えるので静かに既済扱い。
          btn.textContent = '✓ 閉じました(次の更新でカードが消えます)';
        }
      );
    } catch {
      btn.disabled = false;
      btn.textContent = '🗙 この裏タブを閉じる';
    }
  });
  wrap.appendChild(btn);
  return wrap;
}

/**
 * v0.1.866: ちくらん風ヘッダー。サムネ + 配信者名/タイトル + 経過/来場/コメント/ギフト を1段に並べる。
 *   表示モデルは純関数 buildChikuranCardModel が正本。取れない値は出さない(空欄を0と偽らない)。textContent
 *   で安全に組む。サムネは img の onerror で消す(壊れた画像を残さない=失敗体験の除去)。
 * @param {object} live
 * @returns {HTMLElement}
 */
function buildChikuranHeaderEl(live) {
  // DOM 生成は純DOMビルダー buildChikuranHeaderDom(src/lib)に抽出済み(挙動同値・テストで固定)。
  //   純Web(app/live-view)も同じ buildChikuranCardModel→buildChikuranHeaderDom を再利用=似せて自作しない。
  return buildChikuranHeaderDom(buildChikuranCardModel(live));
}

/**
 * 健康チェック(5段階 ●○)の DOM を作る。
 *   取得率 / 描画(白化リスク) / 鮮度 / スクロール軽さ の4指標。
 *   スコアが低いほど赤め、高いほど緑めに色づけして一目で分かるようにする。
 * @param {object} live
 * @returns {HTMLElement}
 */
function buildHealthCheckEl(live) {
  const h = buildLiveHealth(live);
  const items = [
    { label: '取得', score: h.capture },
    { label: '描画', score: h.render },
    { label: '鮮度', score: h.freshness },
    { label: '軽さ', score: h.scroll }
  ];
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;flex-wrap:wrap;gap:8px 14px;margin-bottom:8px;' +
    'padding-bottom:8px;border-bottom:1px dashed var(--nl-border);font-size:11px;';
  for (const it of items) {
    const cell = document.createElement('span');
    cell.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:1px;';
    const lab = document.createElement('span');
    lab.textContent = it.label;
    lab.style.color = 'var(--nl-text-soft)';
    const dots = document.createElement('span');
    dots.textContent = scoreToDots(it.score);
    // 0-1=赤 / 2-3=黄 / 4-5=緑。
    dots.style.color = it.score >= 4 ? '#16a34a' : it.score >= 2 ? '#d97706' : '#dc2626';
    dots.style.letterSpacing = '1px';
    cell.appendChild(lab);
    cell.appendChild(dots);
    wrap.appendChild(cell);
  }
  return wrap;
}

function summarizeOneLive(lv, summary, snapshot, perfDiag, endedFlag) {
  // panel_summary のスキーマは src/lib/panelLiveSummary.js を参照
  // 防御的に optional access のみで読む(型ガード省略でも UI が壊れない設計)
  const s = summary && typeof summary === 'object' ? summary : null;
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : null;
  const diag = isPerfDiag(perfDiag) ? perfDiag : null;
  const endedAt = isLiveEndedFlag(endedFlag) ? endedFlag.endedAt : null;
  // v0.1.631: 配信者名/タイトル/各種値は snapshot を優先(panel_summary には無いか古い)。
  //   broadcasterName は snapshot にしか無いため必須。
  const broadcasterName = String(
    snap?.broadcasterName || snap?.programProvider?.name || s?.broadcasterName || ''
  );
  const title = String(snap?.title || snap?.programTitle || s?.title || '');
  const recordedCount = numOr(s?.recordedCount, 0);
  // 公式コメ数は panel_summary.officialCount にあるが、snapshot.officialCommentCount も
  //   読みに行く(片方しか入っていないケースに耐える)。
  const officialCommentCount =
    numOrNull(s?.officialCount) ?? numOrNull(snap?.officialCommentCount);
  // v0.1.646: 「来場」は累計来場者数。officialViewerCount は同接(direct)で意味が違うため
  //   来場枠から外す(これを先頭 fallback にしていたため、同接が取れた瞬間だけ来場が
  //   同接値=少ない数に化け「5,088 vs 5,164」のズレになっていた)。popup の
  //   buildWatchMetaCardAudienceViewModel は viewerCountFromDom のみを来場に使う=それに揃える。
  const watchCount = resolveVisitorCount({
    viewerCountFromDom: snap?.viewerCountFromDom,
    panelWatchCount: s?.watchCount
  });
  const adPoints = numOrNull(snap?.officialAdPointsNdgr) ?? numOrNull(s?.adPoints);
  const giftPoints = numOrNull(snap?.officialGiftPointsNdgr) ?? numOrNull(s?.giftPoints);
  // 経過時間は snapshot.streamAgeMin(分)→秒に変換、無ければ panel_summary.elapsedSec。
  const elapsedSec =
    snap && typeof snap.streamAgeMin === 'number' && Number.isFinite(snap.streamAgeMin)
      ? Math.max(0, Math.floor(snap.streamAgeMin * 60))
      : numOrNull(s?.elapsedSec);
  const capturedAt =
    numOrNull(s?.lastIngestAt) ??
    numOrNull(s?.capturedAt) ??
    numOrNull(snap?.officialStatsUpdatedAt);
  const lastIngestAgoMs =
    capturedAt && capturedAt > 0 ? Math.max(0, Date.now() - capturedAt) : null;
  const officialRatePct =
    recordedCount > 0 && officialCommentCount && officialCommentCount > 0
      ? Math.round((recordedCount / officialCommentCount) * 100)
      : null;

  // v0.1.866: ちくらん風レイアウト用にサムネ URL も渡す(snapshot.thumbnailUrl=og:image/channel thumb)。
  const thumbnailUrl = String(snap?.thumbnailUrl || '').trim();
  return {
    lv,
    broadcasterName,
    title,
    thumbnailUrl,
    recordedCount,
    officialCommentCount,
    officialRatePct,
    watchCount,
    adPoints,
    giftPoints,
    elapsedSec,
    capturedAt,
    lastIngestAgoMs,
    perfDiag: diag,
    endedAt,
    // v0.1.855: マインドマップ「記録中の配信」は lv.recording を数えるが、従来 summarizeOneLive は
    //   この field を返しておらず【常に 0 件】と誤報していた(累計13,708件あるのに「記録中0件」=
    //   self-verifying 違反・ユーザー指摘)。配信中(endedAt 無し=列挙された視聴中タブ)を記録中とみなす。
    recording: !endedAt
  };
}

function buildAiShareFullText({ overviewText, livesData, fastDiag, popupDiag, voiceDiag, venueSeatsDiag, laneDiag, reportPreview, trendFindings, jsonBlob, currentLiveId, publishKeys }) {
  const lines = [];
  lines.push('## 君斗りんくの追憶のきらめき 状態速報');
  lines.push(`生成: ${new Date().toISOString()}`);
  lines.push('');
  // 純Web公開コピーの自己診断を1回組む(read なし=渡された jsonBlob/引数だけ)。対処候補カード結合と
  //   専用セクション描画の両方で使い回す。失敗しても状態速報を壊さない。
  let publishSelfDiag = null;
  try {
    publishSelfDiag = buildLiveviewPublishSelfDiag({
      jsonBlob: jsonBlob || null,
      fastDiag,
      currentLiveId: String(currentLiveId || ''),
      publishKeys: publishKeys || {},
      lastPost: summarizeLiveviewPublishOutcome(Date.now()),
      nowMs: Date.now()
    });
  } catch {
    publishSelfDiag = null;
  }
  // 応援レーン描画の自己診断(popup の storyUserLaneRenderProbe から)。「鏡にはあるのに画面に出ない/
  //   ローディングが終わらない」を切り分ける。popupDiag.popup 経由(northStarRenderProbe と同じ場所)。
  let laneRenderDiag = null;
  // 「描画済みなのにローディングが終わらない」検知用: 視聴中の配信の perfDiag.shadeActive(ローディング幕)。
  let laneLoadingActive = false;
  try {
    const probeSnap = (popupDiag?.popup ?? popupDiag)?.storyUserLaneRenderProbe || null;
    laneRenderDiag = buildStoryUserLaneRenderDiag(probeSnap);
    const watching = Array.isArray(livesData)
      ? livesData.find((l) => l && l.recording && l.perfDiag) || livesData.find((l) => l && l.perfDiag)
      : null;
    laneLoadingActive = Boolean(watching && watching.perfDiag && watching.perfDiag.shadeActive === true);
  } catch {
    laneRenderDiag = null;
  }
  if (overviewText) {
    lines.push('### 概要');
    lines.push(overviewText);
    // v0.1.846: 総合判定を概要に1行併記。満点=「異常ゼロ」(進行中/対象外は正常扱い)。
    //   ユーザー要望「全部100%になるまで=修復いらないぐらい完全に」への回答=異常が無ければ満点。
    try {
      const verdict = summarizeHealthVerdict(buildHealthCells({ livesData, fastDiag, voiceDiag, venueSeatsDiag, laneDiag }));
      const vmark = verdict.level === 'ok' ? '🟢' : verdict.level === 'warn' ? '🟡' : '🔴';
      lines.push(`総合判定: ${vmark} ${verdict.text}`);
    } catch {
      /* no-op: 判定失敗は概要を壊さない */
    }
    // v0.1.766: 概要に公式値レーン(北極星レーン)の状況も併記(視聴中の配信のみ)。
    const laneStr = buildLaneStatusLine(fastDiag?.content?.giftDiagnostics?.['北極星レーン']);
    if (laneStr) lines.push(laneStr);
    // v0.1.852: 会場モードの読み上げ診断(使用時のみ)。「たまに遅れる」の切り分け材料を AI 共有に載せる。
    try {
      const vStr = buildVoiceDiagLine(voiceDiag, Date.now());
      if (vStr) lines.push(vStr);
    } catch {
      /* no-op */
    }
    // v0.1.858: レポート(DL前)の主要KPI(本文N/コメントした人/来場と応援参加…)。保存せず中身を共有できる。
    // v0.1.861: 信頼度注釈の文脈を fastDiag から作って渡す(匿名主体=推定寄り 等)。
    try {
      const rStr = buildReportPreviewLines(reportPreview, reportPreviewCtxFromFastDiag(fastDiag));
      if (rStr) lines.push(rStr);
    } catch {
      /* no-op */
    }
    lines.push('');
  }
  // 検知された対処候補(症状→原因→次の一手)。AI が「何を直すか」を先頭で掴めるように上に置く。
  try {
    const actions = buildStatusActions({ livesData, fastDiag, popupDiag, reportPreview, trendFindings });
    // 純Web公開コピーの致命(キー未設定/未送信/送信失敗/件数不一致/liveId 不一致)を症状カードに昇格して結合。
    if (publishSelfDiag) {
      try { actions.push(...liveviewPublishSelfDiagToActionCards(publishSelfDiag)); } catch { /* no-op */ }
    }
    // 応援レーン描画の致命(鏡にはあるのに画面0件/例外/描画済みなのにローディング継続)を症状カードに昇格。
    if (laneRenderDiag) {
      try { actions.push(...storyUserLaneRenderDiagToActionCards(laneRenderDiag, { loadingActive: laneLoadingActive })); } catch { /* no-op */ }
    }
    lines.push('### 検知された対処候補(症状→原因→次の一手)');
    if (!actions.length) {
      lines.push('- 既知パターンに該当する問題は検知されませんでした(未知の症状なら下の診断 JSON を参照)。');
    } else {
      for (const a of actions) {
        const mark = a.severity === 'bad' ? '🔴' : a.severity === 'warn' ? '🟡' : '⚪';
        const fix = a.fixableHere === 'no' ? ' [statusの外が原因]' : a.fixableHere === 'partly' ? ' [操作で改善する場合あり]' : '';
        lines.push(`- ${mark} ${a.symptom}${fix}`);
        lines.push(`    原因(推定): ${a.cause}`);
        lines.push(`    次の一手: ${a.action}`);
      }
    }
    lines.push('');
  } catch {
    // 対処候補の生成失敗は AI共有を妨げない
  }
  if (livesData.length) {
    lines.push('### 配信ごと');
    for (const live of livesData) {
      lines.push(buildLiveBlockText(live));
      lines.push('');
    }
  }
  // 純Web公開コピーの自己診断(これを見れば「純Webに何が送られ・何件で・古くないか・拡張と一致するか」が
  //   一目で分かる=スクショ往復が不要になる)。fastDiag JSON の直前=「データの羅列」の前に「コピーの健全性」。
  if (publishSelfDiag) {
    try {
      const selfLines = formatLiveviewPublishSelfDiagLines(publishSelfDiag);
      if (selfLines.length) { for (const l of selfLines) lines.push(l); lines.push(''); }
    } catch {
      /* no-op: 自己診断の失敗は状態速報を壊さない */
    }
  }
  // 応援レーン描画の自己診断(鏡N件 → 画面M件描画/止まった step/描画済みなのにローディング継続)。
  //   「鏡にはあるのに画面に出ない」を状態速報だけで切り分けられるようにする(スクショ往復ゼロ)。
  if (laneRenderDiag && laneRenderDiag.present) {
    try {
      const laneLines = formatStoryUserLaneRenderDiagLines(laneRenderDiag, { loadingActive: laneLoadingActive });
      if (laneLines.length) { for (const l of laneLines) lines.push(l); lines.push(''); }
    } catch {
      /* no-op: 自己診断の失敗は状態速報を壊さない */
    }
  }
  lines.push('### 診断 JSON (fastDiag)');
  lines.push('```json');
  try {
    lines.push(JSON.stringify(fastDiag || {}, null, 2));
  } catch {
    lines.push('{}');
  }
  lines.push('```');

  // 2026-06-18: popup の AI診断コピーにしか無い popup 固有診断を集約(別キー由来)。
  //   popup を開いたときだけ更新される=古いことがあるので persistedAt と経過を明示する。
  if (popupDiag && typeof popupDiag === 'object') {
    lines.push('');
    lines.push('### popup 固有診断 (AI診断コピー由来)');
    const persistedAt = String(popupDiag.persistedAt || '').trim();
    if (persistedAt) {
      const ageMs = Date.now() - Date.parse(persistedAt);
      const ageStr = Number.isFinite(ageMs)
        ? `(約${Math.max(0, Math.round(ageMs / 1000))}秒前にpopupで取得)`
        : '';
      lines.push(`取得時刻: ${persistedAt} ${ageStr}`);
    } else {
      lines.push('取得時刻: 不明(popup を一度開くと更新されます)');
    }
    lines.push('```json');
    try {
      lines.push(JSON.stringify(popupDiag.popup ?? popupDiag, null, 2));
    } catch {
      lines.push('{}');
    }
    lines.push('```');
  } else {
    lines.push('');
    lines.push('### popup 固有診断 (AI診断コピー由来)');
    lines.push('未取得。ニコ生 watch を開いた状態で拡張ポップアップの「AI診断コピー」を一度押すと、ここに集約されます。');
  }
  return lines.join('\n');
}

function numOr(v, dflt) {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/* ============================================================================
 * ボタン
 * ========================================================================== */

/**
 * ビルド時 define で注入されるアップロード設定(scripts/build.mjs の statusDefine)。
 *   未注入のローカル/テスト環境でも壊れないよう typeof ガードする。
 */
function getUploadConfig() {
  const ingestKey = typeof NL_STATUS_INGEST_KEY !== 'undefined' ? NL_STATUS_INGEST_KEY : '';
  const viewToken = typeof NL_STATUS_VIEW_TOKEN !== 'undefined' ? NL_STATUS_VIEW_TOKEN : '';
  const appOrigin =
    typeof NL_STATUS_APP_ORIGIN !== 'undefined' && NL_STATUS_APP_ORIGIN
      ? NL_STATUS_APP_ORIGIN
      : 'https://app.tsuioku-no-kirameki.com';
  return { ingestKey, viewToken, appOrigin };
}

/**
 * 現在の jsonBlob を app の /api/status へ POST する。
 *   - host_permissions に app オリジンがあるため CORS 不要。
 *   - 成功時は閲覧 URL を返す。
 * @returns {Promise<{ ok: boolean, url?: string, error?: string }>}
 */
async function uploadStatusSnapshot() {
  const { ingestKey, viewToken, appOrigin } = getUploadConfig();
  if (!ingestKey || !viewToken) {
    return { ok: false, error: 'キー未設定(ビルド時に NL_STATUS_INGEST_KEY / NL_STATUS_VIEW_TOKEN を注入してください)' };
  }
  const jsonBlob = _lastRenderedBundle?.jsonBlob;
  if (!jsonBlob) {
    return { ok: false, error: 'まだ送信できる状態がありません' };
  }
  // 共有 URL 組み立ては純関数 buildStatusShareUrls(src/lib)に抽出済み(挙動同値・テストで固定)。
  const { statusUrl, liveViewUrl, ingestUrl } = buildStatusShareUrls(appOrigin, viewToken);
  try {
    const res = await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-share-key': ingestKey },
      body: JSON.stringify({ ...jsonBlob, v: viewToken })
    });
    if (!res.ok) {
      // POST 失敗を globalThis に記録=自己診断が「純Webが古い snapshot を見続けている」を検知できる。
      recordLiveviewPublishOutcome({ ok: false, httpStatus: res.status, error: `送信失敗 (HTTP ${res.status})`, at: Date.now() });
      return { ok: false, error: `送信失敗 (HTTP ${res.status})` };
    }
    recordLiveviewPublishOutcome({ ok: true, httpStatus: res.status, at: Date.now() });
    // 状態速報の Web 版(概要+配信一覧)と、応援ライブビューの Web 版(popup そっくりの応援レーン)の両方の URL を返す。
    return {
      ok: true,
      url: statusUrl,
      liveViewUrl
    };
  } catch (err) {
    recordLiveviewPublishOutcome({ ok: false, httpStatus: null, error: '通信エラー: ' + String(err?.message || err), at: Date.now() });
    return { ok: false, error: '通信エラー: ' + String(err?.message || err) };
  }
}

/**
 * 送信成功時の WEBサイトURL 案内を、クリック可能なアンカーで描く。
 *   - textContent だと URL がただの文字列で貼られない(リンクにならない)ため DOM を組み立てる。
 *   - 状態速報(概要+配信一覧)と 応援ライブビュー(ちくらん・popup そっくり)の2本を出す。
 *   - target=_blank + rel=noopener で別タブで開く(誤って status を離れない)。
 * @param {HTMLElement} resultEl
 * @param {{ url?: string, liveViewUrl?: string }} r
 */
function renderUploadResultLinks(resultEl, r) {
  resultEl.replaceChildren();
  resultEl.style.whiteSpace = 'normal';

  // 2026-06-25: ユーザー要望「『これが そっくりの画面URLです』と出して」。
  //   主役は popup そっくりの応援ライブビュー(/live-view)。URL 文字列そのものを大きく見せ、
  //   開くボタン・コピーボタンを添える(リンク文字だけだと「URLが出た」と気づきにくい)。
  const shareUrl = r.liveViewUrl || r.url || '';

  const head = document.createElement('div');
  head.textContent = '✓ これが そっくりの画面URLです（拡張なしのスマホ/他人でも見られます）:';
  head.style.cssText = 'margin-bottom:6px;font-weight:700;color:var(--nl-accent);';
  resultEl.appendChild(head);

  // URL 文字列そのもの(選択してコピーしやすいよう枠付きで大きく)。
  const urlBox = document.createElement('div');
  urlBox.textContent = shareUrl;
  urlBox.style.cssText =
    'margin:4px 0 8px;padding:8px 10px;border:1px solid var(--nl-accent);border-radius:6px;' +
    'background:var(--nl-card-bg);font-size:13px;word-break:break-all;user-select:all;';
  resultEl.appendChild(urlBox);

  // 操作ボタン行(開く / コピー)。
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;';
  const mkBtn = (/** @type {string} */ label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText =
      'padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;' +
      'border:1px solid var(--nl-accent);background:var(--nl-card-bg);color:var(--nl-accent);';
    return b;
  };
  if (shareUrl) {
    const openBtn = mkBtn('🪞 そっくりの画面を開く');
    openBtn.addEventListener('click', () => {
      try {
        chrome.tabs.create({ url: shareUrl });
      } catch {
        window.open(shareUrl, '_blank', 'noopener');
      }
    });
    btnRow.appendChild(openBtn);

    const copyBtn = mkBtn('📋 URLをコピー');
    copyBtn.addEventListener('click', async () => {
      const prev = copyBtn.textContent;
      try {
        await navigator.clipboard.writeText(shareUrl);
        copyBtn.textContent = '✓ コピーしました';
      } catch {
        copyBtn.textContent = '× コピー不可(手動で選択)';
      }
      setTimeout(() => { copyBtn.textContent = prev; }, 1800);
    });
    btnRow.appendChild(copyBtn);
  }
  resultEl.appendChild(btnRow);

  // 簡易版(状態速報)は副次リンクとして小さく残す(死にリンクにしない)。
  if (r.url && r.url !== shareUrl) {
    const sub = document.createElement('div');
    sub.style.cssText = 'margin-top:2px;font-size:12px;';
    const a = document.createElement('a');
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = '📊 簡易版(状態速報)を見る';
    a.style.wordBreak = 'break-all';
    sub.appendChild(a);
    resultEl.appendChild(sub);
  }
}

/** 自動巡回トグルボタンの文言を現在の有効状態に合わせる。 */
async function refreshAutopatrolToggleLabel() {
  const btn = document.getElementById('btnAutopatrolToggle');
  if (!btn) return;
  // background の getAutopatrolEnabled は「!== false」=既定 ON。
  //   未設定 or true は ON、明示的 false のときだけ OFF として表示を合わせる。
  let enabled = true;
  try {
    const bag = await chrome.storage.local.get(AUTOPATROL_ENABLED_KEY);
    enabled = bag?.[AUTOPATROL_ENABLED_KEY] !== false;
  } catch {
    /* read 失敗時は既定 ON 表示 */
  }
  btn.textContent = enabled ? '🔁 自動巡回 ON' : '🔁 自動巡回 OFF';
  btn.dataset.enabled = enabled ? '1' : '0';
}

function setupPatrolButtons() {
  // v0.1.652: 「コメビュを開く」: 独自コメビュ(comeview.html)を別ウィンドウで開く。
  //   lv は付けない=comeview 側が nls_last_watch_url から自己解決する(配信切替に追従)。
  const btnComeview = document.getElementById('btnComeview');
  if (btnComeview) {
    btnComeview.addEventListener('click', () => {
      const url = chrome.runtime.getURL('comeview.html');
      try {
        chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
      } catch {
        window.open(url, '_blank', 'width=400,height=640');
      }
    });
  }
  // 🗺️ コードの地図を開く: 公開リポの code-tree.html を htmlpreview 経由で図として別タブに。
  //   code-tree.html は拡張に同梱していない(リポの docs/ にある静的コード地図)ため、
  //   GitHub raw を htmlpreview.github.io で描画して開く(配信していなくても・AI にも渡せる URL)。
  const btnCodeMap = document.getElementById('btnCodeMap');
  if (btnCodeMap) {
    btnCodeMap.addEventListener('click', () => {
      const raw = 'https://raw.githubusercontent.com/kimito-link/tsuioku-no-kirameki.com/master/docs/code-tree.html';
      const url = 'https://htmlpreview.github.io/?' + raw;
      try {
        chrome.tabs.create({ url });
      } catch {
        window.open(url, '_blank');
      }
    });
  }
  // 全体マインドマップの全展開/全折りたたみ
  const btnMindExpand = document.getElementById('btnMindExpand');
  if (btnMindExpand) btnMindExpand.addEventListener('click', () => setAllMindDetails(true));
  const btnMindCollapse = document.getElementById('btnMindCollapse');
  if (btnMindCollapse) btnMindCollapse.addEventListener('click', () => setAllMindDetails(false));
  // 「次の上位配信へ」: SW にランキング巡回を1歩進めさせる。
  const btnNext = document.getElementById('btnNextLive');
  const resultEl = document.getElementById('patrolResult');
  if (btnNext) {
    btnNext.addEventListener('click', async () => {
      btnNext.disabled = true;
      const prev = btnNext.textContent;
      btnNext.textContent = '移動中...';
      try {
        const r = await chrome.runtime.sendMessage({ type: NEXT_LIVE_REQUEST_TYPE });
        if (resultEl) {
          if (r?.ok) {
            resultEl.textContent = `⏭ ${r.lv} へ移動しました`;
          } else if (r?.reason === 'no_more_lives') {
            resultEl.textContent = '巡回先が見つかりません(少し待つと補充されます)';
          } else if (r?.reason === 'no_watch_tab_open') {
            resultEl.textContent = 'ニコ生 watch タブを開いてから押してください';
          } else {
            resultEl.textContent = `移動できませんでした (${r?.reason || 'unknown'})`;
          }
        }
      } catch (err) {
        if (resultEl) resultEl.textContent = '通信エラー: ' + String(err?.message || err);
      }
      btnNext.textContent = prev;
      btnNext.disabled = false;
    });
  }

  // 自動巡回 ON/OFF トグル。
  const btnToggle = document.getElementById('btnAutopatrolToggle');
  if (btnToggle) {
    void refreshAutopatrolToggleLabel();
    btnToggle.addEventListener('click', async () => {
      btnToggle.disabled = true;
      try {
        const bag = await chrome.storage.local.get(AUTOPATROL_ENABLED_KEY);
        const cur = bag?.[AUTOPATROL_ENABLED_KEY] !== false; // 既定 ON
        await chrome.storage.local.set({ [AUTOPATROL_ENABLED_KEY]: !cur });
        await refreshAutopatrolToggleLabel();
        if (resultEl) {
          resultEl.textContent = !cur
            ? '🔁 自動巡回を ON にしました(背景で上位配信を巡回記録)'
            : '🔁 自動巡回を OFF にしました';
        }
      } catch (err) {
        if (resultEl) resultEl.textContent = '切替に失敗: ' + String(err?.message || err);
      }
      btnToggle.disabled = false;
    });
  }
}

/* ============================================================================
 * 配信者の評判チェック (PR R3 配線 + R4)
 *   - 配信者名は既存の summaries(snapshot/panel)から自動解決(R4)
 *   - 「チェック」で SW に Google サジェスト取得を依頼(R2)→ネガ判定(R1)→3キャラ表示(R3)
 *   - read-only 思想を壊さない: storage write しない・ボタン押下時だけ SW へ依頼
 * ========================================================================== */

/** summaries バッグから配信者名を自動解決して input に流し込む。 */
async function autofillBroadcasterName() {
  try {
    const lvList = await enumerateActiveLives();
    const summaries = await loadAllSummaries(lvList);
    const lv = Array.isArray(lvList) && lvList.length ? lvList[0] : '';
    const name = pickBroadcasterNameForReputation({ summaries, lv });
    const input = /** @type {HTMLInputElement|null} */ (
      document.getElementById('reputationQuery')
    );
    if (input && name && !input.value.trim()) input.value = name;
  } catch {
    /* 自動入力は best-effort。失敗しても手入力できる。 */
  }
}

/** 1つの配信者名で Google サジェストを取得→ネガ判定→3キャラ表示する。 */
async function runReputationCheck() {
  const input = /** @type {HTMLInputElement|null} */ (
    document.getElementById('reputationQuery')
  );
  const resultEl = document.getElementById('reputationResult');
  const btnRun = /** @type {HTMLButtonElement|null} */ (
    document.getElementById('btnReputationRun')
  );
  if (!resultEl) return;

  const query = String(input?.value ?? '').trim();
  if (!isValidSuggestQuery(query)) {
    resultEl.className = 'empty-note';
    resultEl.textContent = '配信者名を入力してね（1〜100文字）。';
    return;
  }

  if (btnRun) btnRun.disabled = true;
  resultEl.className = 'empty-note';
  resultEl.textContent = 'サジェストを調べているよ…';

  try {
    const res = await chrome.runtime.sendMessage({
      type: GOOGLE_SUGGEST_FETCH_MESSAGE_TYPE,
      query
    });
    if (!res || res.ok !== true) {
      resultEl.className = 'empty-note';
      resultEl.textContent =
        'サジェストを取得できませんでした（時間をおいて再度お試しください）。';
      return;
    }
    const suggests = parseGoogleSuggestResponse(res.json);
    const analyzed = analyzeNegativeSuggests(suggests);
    const vm = buildReputationViewModel({ query, analyzed });
    resultEl.className = '';
    // buildReputationAlertHtml は全入力を escape 済み(lib 側 test で担保)。
    resultEl.innerHTML = buildReputationAlertHtml(vm);
  } catch (err) {
    resultEl.className = 'empty-note';
    resultEl.textContent = '通信エラー: ' + String(err?.message || err);
  } finally {
    if (btnRun) btnRun.disabled = false;
  }
}

function setupReputationCheck() {
  const btnOpen = document.getElementById('btnReputationCheck');
  const lane = document.getElementById('reputationLane');
  if (btnOpen && lane) {
    btnOpen.addEventListener('click', () => {
      lane.hidden = false;
      void autofillBroadcasterName();
      lane.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  const btnRun = document.getElementById('btnReputationRun');
  if (btnRun) btnRun.addEventListener('click', () => void runReputationCheck());
  const input = document.getElementById('reputationQuery');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e instanceof KeyboardEvent && e.key === 'Enter') {
        e.preventDefault();
        void runReputationCheck();
      }
    });
  }
}

// v0.1.869/870: 診断 / ちくらん のタブ切替(上部ナビ .map-nav の button.nav-tab に統合)。body の
//   クラスで CSS が診断系レーンの表示/非表示を切る。ちくらんは将来の Kimito Link ランキングの場所
//   (配信カード=ちくらん風・クリックで応援者展開)。アクティブ表示は地図ナビと同じ nav-here。
function setupStatusTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  if (!tabs.length) return;
  /** @param {string} tab 'diag' | 'chikuran' */
  const activate = (tab) => {
    document.body.classList.toggle('tab-chikuran', tab === 'chikuran');
    for (const el of tabs) {
      const isThis = el instanceof HTMLElement && el.dataset.tab === tab;
      el.classList.toggle('nav-here', isThis);
      if (el instanceof HTMLElement) el.setAttribute('aria-pressed', String(isThis));
    }
  };
  for (const el of tabs) {
    el.addEventListener('click', () => {
      if (el instanceof HTMLElement && el.dataset.tab) activate(el.dataset.tab);
    });
  }
}

function setupButtons() {
  setupPatrolButtons();
  setupReputationCheck();
  setupStatusTabs();
  // 「🌐 WEBサイトURLで見る」は配信カード内(buildWebUrlButton)へ移設済み(2026-06-25)。
  //   上部の汎用ボタンバーからは撤去。送信ロジックは uploadStatusSnapshot + renderUploadResultLinks を共有。
  const btnSelect = document.getElementById('btnSelectAll');
  if (btnSelect) {
    btnSelect.addEventListener('click', () => {
      const ta = /** @type {HTMLTextAreaElement|null} */ (
        document.getElementById('aiShareText')
      );
      if (ta) {
        ta.focus();
        ta.select();
      }
    });
  }
  // AI共有テキストの「ワンクリックcoピー」を配線する共通ヘルパ(上部ボタンと AI共有欄の直近ボタンで共有)。
  //   clipboard.writeText が失敗(権限/非対応)しても、textarea を select して Ctrl+C できる状態にして
  //   フォールバックする(「コピーできない」で詰ませない=星野ロミ式)。
  const wireCopyButton = (id, label) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const text = _lastRenderedBundle?.textBlob || '';
      if (!text) return;
      const flash = (msg, ms) => {
        btn.textContent = msg;
        setTimeout(() => { btn.textContent = label; }, ms);
      };
      try {
        await navigator.clipboard.writeText(text);
        flash('コピーしました ✓', 1500);
      } catch (err) {
        console.warn('[status] clipboard failed:', err);
        // フォールバック: テキストを選択状態にして「あとは Ctrl+C」まで持っていく。
        const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('aiShareText'));
        if (ta) { ta.focus(); ta.select(); }
        flash('選択しました→Ctrl+C', 2000);
      }
    });
  };
  wireCopyButton('btnCopy', 'クリップボードへコピー');
  wireCopyButton('btnCopyAiShareInline', '📋 まるごとコピー');
  // v0.1.856: ファーストビューの「原因が全部わかる共有」大ボタン。中身は同じ全文(textBlob)だが、
  //   まだ生成前(初回 refresh 未完)でも詰ませないよう、空なら1回 refresh を待ってからコピーする。
  {
    const heroLabel = '🔎 これを共有すれば原因が全部わかる（コピー）';
    const heroBtn = document.getElementById('btnShareAll');
    if (heroBtn) {
      heroBtn.addEventListener('click', async () => {
        const heroFlash = (msg, ms) => {
          heroBtn.textContent = msg;
          setTimeout(() => { heroBtn.textContent = heroLabel; }, ms);
        };
        let text = _lastRenderedBundle?.textBlob || '';
        if (!text) {
          heroFlash('まとめ中…', 1200);
          try { await refresh({ timeoutMs: 12000 }); } catch { /* best-effort */ }
          text = _lastRenderedBundle?.textBlob || '';
        }
        if (!text) {
          // それでも空=まだ読み込み中。AI共有欄(あれば)を選択して Ctrl+C に逃がす。
          const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('aiShareText'));
          if (ta && ta.value) { ta.focus(); ta.select(); heroFlash('選択しました→Ctrl+C', 2500); return; }
          heroFlash('まだ読み込み中…もう一度押してください', 2500);
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          heroFlash('コピーしました ✓ そのまま貼ってください', 2500);
        } catch {
          const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('aiShareText'));
          if (ta) { ta.focus(); ta.select(); }
          heroFlash('選択しました→Ctrl+C', 2500);
        }
      });
    }
  }
  const btnDownload = document.getElementById('btnDownload');
  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      const blob = _lastRenderedBundle?.jsonBlob || {};
      const text = JSON.stringify(blob, null, 2);
      const file = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `nicolivelog-status-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    });
  }
  const btnPause = document.getElementById('btnTogglePause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      _refreshPausedByUser = !_refreshPausedByUser;
      btnPause.textContent = _refreshPausedByUser
        ? '自動更新を再開'
        : '自動更新を一時停止';
      const meta = document.getElementById('metaAutoRefresh');
      if (meta) {
        meta.textContent = _refreshPausedByUser ? '自動更新: 停止中' : '自動更新: 2秒';
      }
    });
  }
  hideDevDiagnosticsIfRelease();
}

// v0.1.857: 配布(release)ビルドでは「生診断JSON/全文共有ボタン/AI共有欄」を隠す。
//   これらは自分の viewerUserId・配信URL を含む開発用エクスポートなので本番ユーザーには出さない
//   (ユーザー方針「そもそも開発用なので release時は出さない」)。健全度パネル・総合判定・対処カードは
//   ID を漏らさずユーザーに有用なので残す。NL_RELEASE は esbuild define(NL_DEV_HOTRELOAD と同方式)。
function hideDevDiagnosticsIfRelease() {
  const isRelease = typeof NL_RELEASE !== 'undefined' && NL_RELEASE === true;
  if (!isRelease) return;
  // 共有エクスポート系(ID/URL を含む生データ)だけ隠す。健全度パネルは残す。
  const devOnlyIds = [
    'aiShareLane',   // 🤖 AI に貼る用テキスト(全文・生JSON含む)+まるごとコピー
    'btnShareAll',   // 🔎 これを共有すれば原因が全部わかる(全文コピー)
    'btnCopy',       // クリップボードへコピー(全文)
    'btnSelectAll',  // 全部選択(全文)
    'btnDownload'    // JSON ダウンロード(生診断)
  ];
  for (const id of devOnlyIds) {
    const el = document.getElementById(id);
    if (el) {
      el.hidden = true;
      el.style.display = 'none';
    }
  }
  // share-hero セクション(説明文ごと)も隠す。
  const hero = document.querySelector('.share-hero');
  if (hero instanceof HTMLElement) { hero.hidden = true; hero.style.display = 'none'; }
}

/* ============================================================================
 * visibilitychange + storage onChanged
 * ========================================================================== */

function setupVisibilityHandler() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 何もしない(setInterval 内で hidden チェック)
    } else {
      // 可視に戻ったら即時 refresh して反応性を上げる
      refresh().catch(() => {});
    }
  });
}

function setupStorageChangeListener() {
  try {
    chrome.storage.local.onChanged.addListener((changes) => {
      if (_refreshPausedByUser) return;
      // panel_summary / watch_snapshot 変化のみで refresh(高頻度の他キー変化で過剰 refresh しない)
      for (const k of Object.keys(changes)) {
        if (
          k.startsWith(PANEL_SUMMARY_PREFIX) ||
          k.startsWith(WATCH_SNAPSHOT_PREFIX)
        ) {
          refresh().catch(() => {});
          return;
        }
      }
    });
  } catch {
    /* onChanged が無い環境では setInterval だけ稼働 */
  }
}
