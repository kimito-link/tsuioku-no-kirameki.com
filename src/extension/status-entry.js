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
// リリース工程ガード「版混在の実行時検知」(2026-07-06): NL_BUNDLE_VERSION(このバンドルの
//   ビルド時 package.json version)と chrome.runtime.getManifest().version(実行時本体 version)を
//   突合し、ズレていれば画面上部にバナーを出す。詳細は src/lib/versionMismatch.js の背景コメント参照。
import { detectVersionMismatch } from '../lib/versionMismatch.js';
// v0.1.1080: BGM設定パネル(Phase C)が直接 chrome.storage.local を叩くと、status.html を
//   タブに残したまま拡張をリロードした場合に同期 TypeError が uncaught で残る。
//   唯一の安全な入口に集約する(popup-entry.js/venueBar.js と同じ helper を共有)。
import {
  safeStorageLocalGet,
  safeStorageLocalSet,
  safeStorageLocalRef,
  getStorageWriteLedger
} from '../lib/safeStorageLocal.js';
import { buildStorageWriteLedgerLines } from '../lib/storageWriteLedger.js';
// 2026-06-23: status.html 軽量化。2秒ループで巨大 fastDiag(~40KB)を read+parse+JSON.stringify していたのが
//   重さの真因(council/status-heavy-open-SYNTHESIS.md)。status が使う4フィールドだけの軽量ダイジェスト
//   (content が同時に書く)を read する=read 回数同じ・サイズ ~40分の1。読み取りパスは full と同形。
import { KEY_STATUS_FAST_DIAG_LITE } from '../lib/statusFastDiagLite.js';
import {
  createPaintProbeState,
  observePaintCompletion,
  formatPaintCompletionLine
} from '../lib/paintCompletionProbe.js';
import { buildLivesCardSignature } from '../lib/livesCardSignature.js';
import { buildStatusMindmapModel } from '../lib/statusMindmapModel.js';
import { copyTextWithFallback } from '../lib/copyTextWithFallback.js';
import {
  buildStatusCopyButtonLabel,
  buildStatusCopyStaleBanner
} from '../lib/statusCopyFreshness.js';
import { buildStatusActions } from '../lib/statusActionAdvisor.js';
// 純Web公開コピーの自己診断(council/status-self-diagnoses-SYNTHESIS.md): 状態速報1枚で「純Webに何が
//   送られ・何件で・古くないか・拡張と一致するか」が分かるようにする。jsonBlob と引数だけから組む純関数
//   =新規 storage read ゼロ。致命は症状カードにも昇格する。
// AI共有(状態速報)本文ビルダーを lib に切り出し(②応援ライブビュー/③WEB で再利用)。挙動同値。
import { buildAiShareFullText } from '../lib/aiShareFullText.js';
// v0.1.1016: ③WEB が古くなる前に自動で再 publish すべきかの判定(手動ボタンの往復を無くす)。
import { shouldAutoPublish } from '../lib/autoPublishDecision.js';
// 直近の公開送信(POST)結果を globalThis に集計(read を増やさない)→送信時の記録に使う。
import {
  recordLiveviewPublishOutcome
} from '../lib/liveviewPublishOutcome.js';
// 根2対策(council/diagnostics-completeness-root-SYNTHESIS.md 第3段): 送信結果を【ページ横断 storage】にも記録。
//   globalThis はページごと別物=拡張内 live-view の公開ボタンで送っても status から読めず「押したのに未送信」
//   誤報になっていた。storage に1件記録すれば、どのページで送っても status が読める。
import {
  KEY_LIVEVIEW_PUBLISH_OUTCOME,
  buildLiveviewPublishOutcomeRecord,
  summarizeLiveviewPublishOutcomeRecord
} from '../lib/liveviewPublishOutcomeKey.js';
// KEY_PREVIEW_RENDER_ACK は statusExtrasBatch.js の1バッチ get 内で読む(重さ根治 P2・2026-07-06)。
import { buildHealthCells, summarizeHealthVerdict } from '../lib/healthCells.js';
// ★v0.1.1412: 取得経路の履歴(降格＝ニコ生の構造変更の予兆 を検出する)。
import { fromStorable, toStorable, noteSource } from '../lib/sourceProvenance.js';
import { buildVoiceDiagLine } from '../lib/voiceDiag.js';
import { KEY_VOICE_DIAG } from '../lib/voiceDiagKey.js';
// v0.1.1010: 取り込み中の更新激重(7071ms)を所要比例の間引きで緩和する純関数。
import { computeRefreshBackoffTicks } from '../lib/statusRefreshBackoff.js';
// 共有 URL 組み立て(状態速報/応援ライブビュー/ingest)の純関数。挙動同値で uploadStatusSnapshot から切り出し。
import { buildStatusShareUrls } from '../lib/statusShareUrls.js';
// 応援ライブビュー(拡張内)の「このURLをWEBでも公開する」用: status が組み立てた公開ペイロードを置くキー。
import {
  KEY_BACKFILL_LIVE_METRIC,
  KEY_LIVEVIEW_PUBLISH_PAYLOAD,
  KEY_CUSTOM_SOUND_REV,
  KEY_BGM_ENABLED,
  KEY_BGM_VOLUME_REACH,
  KEY_BGM_VOLUME_FEVER,
  isBgmEnabled
} from '../lib/storageKeys.js';
// レポートプレビュー信頼度注釈の文脈(fastDiag→ctx)の純関数。挙動同値で status-entry から切り出し。
import { reportPreviewCtxFromFastDiag } from '../lib/reportPreviewCtx.js';
// 重さ根治 P2(2026-07-06): extras の単一キー get 項目(17個)を1回の get([...])へ統合する
//   純粋部品(バッチ対象キー配列+bag からの取り出し)。詳細は statusExtrasBatch.js 冒頭コメント参照。
import { EXTRAS_BATCH_KEYS, pickExtrasBatchValues } from '../lib/statusExtrasBatch.js';
// v0.1.902: 会場座席の健全度(配信者混入・固着)を健全度パネルに載せる。
import { KEY_VENUE_SEATS_DIAG } from '../lib/venueSeatsDiagKey.js';
import { KEY_GIFT_EFFECT_DIAG } from '../lib/giftEffectDiagKey.js';
import { buildGiftEffectDiagLines, giftEffectDiagToActionCards } from '../lib/giftEffectDiag.js';
// v0.1.1058: コメント数マイルストーン(検知→演出→音)の取りこぼしを状態速報で確認できるようにする。
import { KEY_MILESTONE_EFFECT_DIAG } from '../lib/milestoneEffectDiagKey.js';
// v0.1.1067 開発用: 効果音試聴パネル(音源の正本リストと実再生音量をそのまま使う)。
import { EFFECT_SOUND_PATHS, EFFECT_SOUND_VARIANT_PATHS, defaultVolumeForEffectSoundKind } from '../lib/effectSoundPlayer.js';
// Phase A(2026-07-05) 開発用: マイ効果音差し替え(IndexedDB取込+割当)。取込UIは診断ページに置く
//   (試聴パネルと同じ扱い=release非表示)。プリセット表(§2のJSON化)で自動割当する。
import {
  CUSTOM_SOUND_PRESET,
  CUSTOM_SOUND_PRESET_KEYS,
  parseAudiostockNoFromFilename,
  presetIdForNo,
  buildPresetNoIndex
} from '../lib/customSoundPreset.js';
import {
  openCustomSoundDb,
  putSoundBlob,
  getSoundBlob,
  listSoundBlobs,
  countSoundBlobs,
  getAssignment,
  setAssignment,
  clearAssignment,
  listAssignments,
  countAssignments,
  bumpCustomSoundRev,
  loadLocalBundledSoundManifest
} from '../lib/customSoundStore.js';
import { buildMilestoneEffectDiagLines, milestoneEffectDiagToActionCards } from '../lib/milestoneEffectDiag.js';
// Phase B(2026-07-05): パチンコボイス演出(voiceDirector.js)の発火/スキップ内訳を extras(12秒間引き)で
//   読む。venueBar/popup が書く純観測値=歯止め(個別CD/上限/45秒CD/読み上げ中スキップ)の動作証明。
import { buildVoiceEffectDiagLines } from '../lib/voiceEffectDiag.js';
import { KEY_VOICE_EFFECT_DIAG } from '../lib/voiceEffectDiagKey.js';
// Phase C(2026-07-05): BGMディレクター(bgmDirector.js)+フェーズディレクター(phaseDirector.js)の
//   in/out回数・現在フェーズ・R値・B値を extras(12秒間引き)で読む。venueBar/popup が書く純観測値。
import { buildBgmPhaseDiagLines } from '../lib/bgmPhaseDiag.js';
import { KEY_BGM_PHASE_DIAG } from '../lib/bgmPhaseDiagKey.js';
// SC2(council/broadcast-scoring-SYNTHESIS.md §2.2): ハイライト台帳(実際に発火した演出だけ記録)を
//   extras(12秒間引き)で読む。venueBar/popup が書く純観測値。キー定数自体は
//   statusExtrasBatch.js が EXTRAS_BATCH_KEYS へ統合済み(直接importは不要)。
import { buildHighlightLedgerDiagLines } from '../lib/highlightLedger.js';
// SC3(council/broadcast-scoring-SYNTHESIS.md §2.1): 結果発表シーケンス(scoreAnnounce.js)の
//   起動/完走/中断観測値を extras(12秒間引き)で読む。popup が書く純観測値。キー定数自体は
//   statusExtrasBatch.js が EXTRAS_BATCH_KEYS へ統合済み(直接importは不要)。
import { buildScoreAnnounceDiagLines } from '../lib/scoreAnnounceDiag.js';
// ③WEB配信採点丸写し(第3号・reference_full_mirror_SYNTHESIS.md M2/A-3・路線2): status が既に extras で
//   読んでいる5値(reportPreview/bgmPhaseDiag/giftEffectDiag/voiceDiag/highlightLedger)から①と同じ純lib
//   で view-model を組み、jsonBlob.broadcastScoreVm に載せる(新規 storage read ゼロ・publish ゼロ)。
//   R-1: VM 戻りは score/radar/highlights 等の構造化データのみ=HTML文字列を含まない(③で buildBroadcastScorePanelHtml が HTML 化)。
import { buildBroadcastScorePanelViewModel } from '../lib/broadcastScorePanelViewModel.js';
// Phase D1(2026-07-05): 操作音(opSoundDirector.js)の「押下→成功→発音」観測値を extras(12秒間引き)で
//   読む。popup が書く純観測値=「押下は鳴るのに成功が無い/成功しているのに未割当」を1枚で見分ける。
import { buildOpSoundEffectDiagLines } from '../lib/opSoundEffectDiag.js';
import { KEY_OP_SOUND_EFFECT_DIAG } from '../lib/opSoundEffectDiagKey.js';
// 感度パッチ(2026-07-06): コメント送信の総所要ms/結果(ok/fail/timeout)/フレーム試行回数を
//   extras(12秒間引き)で読む。「送信中…」張り付き・自コメ「一瞬載って消える」の切り分け用。
import { buildCommentPostDiagLines } from '../lib/commentPostDiag.js';
import { KEY_COMMENT_POST_DIAG } from '../lib/commentPostDiagKey.js';
// v0.1.1092: コメント即時プッシュレーン(storage迂回)の送信N/受信N/表示遅延msを
//   extras(12秒間引き)で読む。「送っているのに受けていない/受けているのに表示に出ない」の切り分け用。
import { buildInstantPushDiagLines } from '../lib/instantPushDiag.js';
// 2026-07-06: 配信切替(SPA遷移で iframe を作り直さない in-place 切替)の送信N/受信N/初描画msを
//   extras(12秒間引き)で読む。「切替が来ているのに送信ボタンが灰色のまま」等の切り分け用。
import { buildChannelSwitchDiagLines } from '../lib/channelSwitchDiag.js';
// v0.1.1072: マイ効果音(customSoundStore.js・Phase A)の取込状況を extras(12秒間引き)で計測する。
//   コアreadには足さない(既知の地雷=v1045/v1046)。IDBが開けない環境では静かに「-」表示。
import { buildCustomSoundDiagSnapshot, buildCustomSoundDiagLine } from '../lib/customSoundDiag.js';
// 2026-06-22(council/lane-show-all-active): 応援レーンの人数整合(素性 N/表示 M)を健全度パネルに載せる。
import { KEY_LANE_DIAG } from '../lib/laneDiagKey.js';
// 応援レーン鏡: popup の応援レーン(りんく/こん太/広告/たぬ姉の段組み)を顔まで含めてそっくり映す。
//   データは popup→storage(KEY_LANE_MIRROR)、status が読んで本物の描画関数で描く。
//   ★このキーの読者一覧は src/lib/laneMirrorContract.js の LANE_MIRROR_CONSUMERS が正本。
//     status だけでなく【会場モード(venueBar.js)も読む】(v0.1.1111 で会場の正本に昇格)。
//     旧コメントは会場を読者から除外していたが誤り(2026-08-06 に訂正)。
import { KEY_LANE_MIRROR } from '../lib/laneMirrorKey.js';
// 2026-06-26: restoreLaneMirrorBuckets / paintStoryUserLaneDom* の import は応援レーン鏡撤去で不要になり削除。
// 数字カード鏡: v0.1.948 で status への描画は撤去。KEY_STAT_CARDS_MIRROR は
//   loadStatCardsMirrorSafe→jsonBlob 経由で純Web /live-view に継続送信する。
import { KEY_STAT_CARDS_MIRROR } from '../lib/statCardsMirrorKey.js';
// 北極星レーン鏡(公式値レーン): popup→storage(KEY_NORTH_STAR_MIRROR)を status が読んで純Webへ相乗り送信。
import { KEY_NORTH_STAR_MIRROR } from '../lib/northStarMirrorKey.js';
// コメントタイムライン鏡(第2段): 純Webで「コメントが進む」ため popup が publish した最新N件を jsonBlob に相乗り。
import { KEY_COMMENT_TIMELINE_MIRROR } from '../lib/commentTimelineMirrorKey.js';
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
import { backfillLiveThroughputLine } from '../lib/backfillRinkuNarration.js';
import { resolveVisitorCount } from '../lib/resolveVisitorCount.js';
import { PERF_DIAG_PREFIX, isPerfDiag } from '../lib/perfDiag.js';
import { LIVE_ENDED_PREFIX, isLiveEndedFlag } from '../lib/liveEndedFlag.js';
import { buildLiveHealth, scoreToDots } from '../lib/liveHealthScore.js';
import { runStorageOpWithTimeout, STORAGE_OP_TIMED_OUT } from '../lib/storageOpTimeout.js';
/*
 * ★v0.1.1371: boot(init)で await する storage read の上限[ms]。
 *   ここが無界だと storage stall のとき init が止まり、refresh にも到達せず【画面が白紙】になる
 *   (2026-08-12 実機の真因: init 冒頭の2つの await が timeout 無しだった)。
 *   短く倒す=読めなくても既定値で先へ進む方が必ず良い。
 *   ★既定値は fail-closed(送らない/未設定扱い)なので、timeout しても安全側に倒れる。
 */
const BOOT_STORAGE_TIMEOUT_MS = 1_500;
// 重さ根治 P3(2026-07-06): runStorageOpWithTimeout はタイムアウトしても opFn 自体は裏で生き続ける
//   (Promise.race の性質)。次 tick が同じ opFn を再発行すると幽霊 read と多重競合するため、
//   loadCustomSoundDiagSafe(IndexedDB open+count+fetch を伴う唯一の重い extras 処理)に
//   in-flight ガードを掛けて新規発行を抑止する。popup-entry.js の heavyReadActive と同型。
import { createInFlightGuard, createStaleGuardedRead } from '../lib/inFlightGuard.js';
// 重さ根治 P4(2026-07-06): publishLiveViewPublishPayload の dirty check(内容不変なら set 省略)用。
import { buildLiveViewPublishSignature } from '../lib/liveViewPublishSignature.js';
// Phase 1 MVP(2026-07-07): 純Web公開ペイロードを1枚あたり上限で段階的に削る純関数。
//   min-gap 3000→12000 と対で「set 頻度」だけでなく「1枚のサイズ」も絞り、KEY_LIVEVIEW_PUBLISH_PAYLOAD
//   の onChanged ファンアウト(browser process 輻輳の真犯人)を細くする。
import { pruneLiveViewPublishBlob, LIVEVIEW_PUBLISH_MAX_JSON_BYTES } from '../lib/pruneLiveViewPublishBlob.js';
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
// ★v0.1.1388: 1サイクル全体の締切。個別 timeout(10本×8秒=80秒)の合計に天井を付ける。
import {
  createRefreshDeadline, REFRESH_CYCLE_BUDGET_MS, REFRESH_FIRST_CYCLE_BUDGET_MS
} from '../lib/refreshCycleDeadline.js';
// ★v0.1.1388: 症状別判定を【画面に】出す(v0.1.1385 はコピー本文にしか配線されていなかった)。
import { buildSymptomVerdicts } from '../lib/symptomVerdicts.js';
import { popupSnapshotAgeMs } from '../lib/aiShareFullText.js';
// ★v0.1.1389: 33セルを症状の言葉(コメント記録/人の識別/レーン/公式値/演出/健全性)で枠に分ける。
import { groupHealthCells, summarizeGroup } from '../lib/healthCellGroups.js';

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

/**
 * ★v0.1.1242(CWS提出ブロッカー BLOCKING-1): WEB公開の明示同意フラグ(既定OFF)。
 *
 * 旧実装は同意ゲートが無く、status ページを開いて視聴しているだけで 120秒ごとに
 * 視聴者のユーザーID・名前・コメント本文を外部サーバーへ自動送信していた
 * (privacy.html 等4文書の「自動送信しない」と真逆=CWS User Data Policy 違反)。
 * true を明示的に保存するまで自動送信しない。手動の共有ボタンは従来どおり
 * 「押した=その回の同意」として扱うので、このフラグの対象は【自動送信のみ】。
 */
const KEY_WEB_PUBLISH_OPT_IN = 'nls_web_publish_opt_in';

/** 同意フラグのメモリキャッシュ。判定は同期で行うため(コアreadを増やさない)。 */
let _webPublishOptIn = false;

/** 同意フラグを storage から読み直してキャッシュする(失敗時は false=送らない側に倒す)。 */
async function refreshWebPublishOptInCache() {
  try {
    /*
     * ★v0.1.1371: 【必ず timeout で有界化する】。
     *
     * ■ 何が起きていたか(2026-08-12 実機・status.html が真っ白のまま返らない)
     *   この関数は boot の最初(init)で `await` されており、しかも生の
     *   `chrome.storage.local.get` を timeout 無しで待っていた。
     *   chrome.storage.local は単一 LevelDB で、他タブの巨大 read-merge-write が
     *   走ると **settle せず永久 pending** になりうる(storageOpTimeout.js の背景)。
     *   ＝storage が詰まると **init がここで止まり、下の refresh()/startRefreshLoop に
     *   一生到達しない**。画面は白紙のまま、速報も書かれない(=コピーする物が無い)。
     *   ★このページの他の read は全て有界化済みで、ここだけが非対称に無防備だった
     *     ([[shared-helper-hides-canonical-bugs-2026-08-07]] と同じ「1箇所だけ素通し」)。
     *
     * ■ fail-closed は維持: 読めないなら false(送らない)。
     *   ★同意フラグを「読めなかった」ことを「同意した」に倒してはいけない。
     */
    const bag = await runStorageOpWithTimeout(
      () => chrome.storage.local.get(KEY_WEB_PUBLISH_OPT_IN),
      BOOT_STORAGE_TIMEOUT_MS
    );
    _webPublishOptIn = bag?.[KEY_WEB_PUBLISH_OPT_IN] === true;
  } catch {
    _webPublishOptIn = false; // fail-closed: 読めない/timeout なら送らない
  }
  return _webPublishOptIn;
}

/** 同意フラグを保存してキャッシュも更新する。 */
async function setWebPublishOptIn(next) {
  const value = next === true;
  _webPublishOptIn = value;
  try {
    await chrome.storage.local.set({ [KEY_WEB_PUBLISH_OPT_IN]: value });
  } catch {
    /* best-effort: 保存に失敗してもキャッシュは反映済み(次回起動で既定OFFに戻る=安全側) */
  }
  return value;
}

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
/**
 * ★v0.1.1384: 拡張更新時の自動タブリロードの痕跡(background.js が書く)。
 *   これが出れば「手動F5は不要」と確定でき、ユーザーへの依頼を1手減らせる。
 * @type {{ at?: number, reason?: string, tabCount?: number, reloaded?: number }|null}
 */
let _autoTabReloadRec = null;
/**
 * ★v0.1.1412: 取得経路の履歴(storage 由来)。
 *   「先週は embedded-data で取れていた」を覚えていないと降格を判定できない。
 */
const KEY_SOURCE_PROVENANCE = 'nls_source_provenance_v1';
/** @type {Record<string, any>|null} */
let _sourceProvenanceStored = null;
// 重さ根治 P3(2026-07-06): loadCustomSoundDiagSafe(IndexedDB open+count+fetch)の幽霊 read 対策。
//   前回発行分が未解決の間は新規発行せず、直近スナップショット(fallback)を呼び出し側で渡す。
const _customSoundDiagGuard = createInFlightGuard(() => loadCustomSoundDiagSafe(), { ceilingMs: 15000 });
// 2026-07-14 診断ページ608秒固まり根治: コア5readにも幽霊read抑止+last-good stale供給を適用。
//   実測 summaries×1 229960ms=単発get(24キー)が229秒settleしなかった間、旧実装は
//   (a)timeout→refresh全体がcatch転落=真っ白、(b)次tickが同キーへ新規get発行=幽霊と多重競合、
//   の両方を起こしていた。ガードは「読まない・落とさない・古い値を正直に出す」に変える。
const CORE_READ_REISSUE_CEILING_MS = 60_000; // 229秒級stallでも並走幽霊は最大4本(現状は数十本)
const _livesGuard = createStaleGuardedRead(() => enumerateActiveLives(), {
  emptyValue: [],
  reissueCeilingMs: CORE_READ_REISSUE_CEILING_MS
});
const _summariesGuard = createStaleGuardedRead((lvList) => loadAllSummaries(lvList), {
  emptyValue: {},
  reissueCeilingMs: CORE_READ_REISSUE_CEILING_MS
});
const _fastDiagGuard = createStaleGuardedRead(() => loadStatusFastDiagLiteSafe(), {
  emptyValue: null,
  reissueCeilingMs: CORE_READ_REISSUE_CEILING_MS
});
const _popupDiagGuard = createStaleGuardedRead(() => loadPopupDiagSafe(), {
  emptyValue: null,
  reissueCeilingMs: CORE_READ_REISSUE_CEILING_MS
});
const _backfillGuard = createStaleGuardedRead(() => loadBackfillProgressSafe(), {
  emptyValue: null,
  reissueCeilingMs: CORE_READ_REISSUE_CEILING_MS
});
// 2026-07-15: extras(12秒間引き)の幽霊read対策。コア5readと同じ理由(runStorageOpWithTimeout直呼びは
//   timeoutしてもopFn自体を止められず、次のextras間引きtickが同じキーへ再発行して幽霊readと多重競合する)。
//   実測(23,944件規模の大規模配信)でstatus.htmlのフリーズが608秒修正後も残っていたため対象を広げる。
//   queryWatchTabMap/recordAndAnalyzeTrendSafeはコアread化と別理由(chrome.tabs.query・read+set混在)で
//   別ガードに分ける(統合するとwriteの副作用タイミングが変わる)。
const _extrasBatchGuard = createStaleGuardedRead(() => safeStorageLocalGet(EXTRAS_BATCH_KEYS), {
  emptyValue: {},
  reissueCeilingMs: CORE_READ_REISSUE_CEILING_MS
});
const _watchTabMapGuard = createStaleGuardedRead(() => queryWatchTabMap(), {
  emptyValue: new Map(),
  reissueCeilingMs: CORE_READ_REISSUE_CEILING_MS
});
/** v0.1.1005: 直近 refresh の所要計器(totalMs と重いステップ)。コピー本文(AI共有)にも出すため保持。
 *   renderAll は当該 refresh の render 計測【前】に走るので、前サイクルの値を本文に載せる(代表値として十分)。 */
let _lastRefreshPerf = /** @type {{ totalMs: number|null, stepMs: Array<[string, number]>, tabsQuerySlow?: { count: number, worstMs: number, lastMs: number, lastTabCount: number } }} */ ({ totalMs: null, stepMs: [] });
/** 2026-07-14: renderAll 内の各セクション(配信カード/マインドマップ/AI共有テキスト等)の所要 ms
 *   (降順)。診断ページ軽量化(lazy details 化)の対象を実測で決めるための自己計測(観測のみ)。 */
let _lastRenderSectionMs = /** @type {Array<[string, number]>} */ ([]);
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
  venueSeatsDiag: null,
  // 根2対策: 送信結果(ページ横断 storage)。どのページで送っても status が「送信済み」を読める。
  publishOutcomeRec: null,
  // 第2段: コメントタイムライン鏡(最新N件)。純Webで「コメントが進む」ため jsonBlob に相乗り。
  commentTimelineMirror: null,
  // v0.1.1046: 走行中スループット計器(過去ログ取得の律速切り分け)。extras 側=毎回の直列 read に足さない。
  backfillLiveMetric: null,
  // v0.1.1054: ギフト/広告の「検知→演出→効果音」整合診断。他の観測系と同じく12秒間引きへ。
  giftEffectDiag: null,
  // v0.1.1072: マイ効果音(customSoundStore.js)の取込状況。IDB readのため12秒間引き必須。
  customSoundDiag: null,
  // Phase B(v0.1.1073): パチンコボイス演出の発火/スキップ内訳。補助情報=extras(12秒間引き)のみ。
  voiceEffectDiag: null,
  // Phase C(v0.1.1074): BGM in/out・現在フェーズ・R値・B値。補助情報=extras(12秒間引き)のみ。
  bgmPhaseDiag: null,
  // Phase D1(2026-07-05): 操作音の押下→成功→発音観測値。補助情報=extras(12秒間引き)のみ。
  opSoundEffectDiag: null,
  // 感度パッチ(2026-07-06): コメント送信の所要ms/結果/フレーム試行回数観測値。補助情報=extras(12秒間引き)のみ。
  commentPostDiag: null,
  // v0.1.1092: コメント即時プッシュレーン(storage迂回)の送信/受信/表示遅延観測値。補助情報=extras(12秒間引き)のみ。
  instantPushDiag: null,
  // 2026-07-06: 配信切替(SPA遷移で iframe を作り直さない in-place 切替)の送信/受信/初描画観測値。補助情報=extras(12秒間引き)のみ。
  channelSwitchDiag: null,
  // SC2(council/broadcast-scoring-SYNTHESIS.md §2.2): ハイライト台帳(実際に発火した演出の記録)。補助情報=extras(12秒間引き)のみ。
  highlightLedger: null,
  // SC3(council/broadcast-scoring-SYNTHESIS.md §2.1): 結果発表シーケンスの起動/完走/中断観測値。補助情報=extras(12秒間引き)のみ。
  scoreAnnounceDiag: null,
  sidepanelSelfDiag: null
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
 * v0.1.1222: 直近 render の本文が「いつ組まれたか」と「その時点で元データが何秒古かったか」。
 *   共有ボタンは _lastRenderedBundle.textBlob(=最後に描けた本文)を渡すため、混雑時
 *   (実測: 更新に103秒)は数十秒前の凍った値がコピーされる。画面ヘッダーには鮮度が
 *   出ていたが【コピー本文には入っていなかった】ので、受け取り側は古いと分からない。
 *   2026-08-01 に実際これで読み上げの状態を誤読しかけた(会場休止中/累計値)。
 */
let _lastRenderedAtMs = 0;
/** 本文を組んだ時点で元データが何秒古かったか(コアread の stale 供給ぶん)。 */
let _lastRenderedSourceStaleSec = 0;
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

/**
 * リリース工程ガード「版混在の実行時検知」(2026-07-06)。
 *   このバンドル(status.js)をビルドした時点の package.json version(NL_BUNDLE_VERSION)と、
 *   実行時に効いている本体 manifest の version を突合する。ズレていれば
 *   #nlVersionMismatchBanner に文言を出す(DOM は一度作ったら remove せず hidden 切替=
 *   status-guard.js の流儀に倣う)。
 */
function checkVersionMismatchBanner() {
  const el = document.getElementById('nlVersionMismatchBanner');
  if (!el) return;
  let manifestVersion = '';
  try {
    manifestVersion = String(chrome.runtime.getManifest()?.version || '');
  } catch {
    manifestVersion = '';
  }
  const bundledVersion = typeof NL_BUNDLE_VERSION !== 'undefined' ? String(NL_BUNDLE_VERSION) : '';
  const result = detectVersionMismatch(bundledVersion, manifestVersion);
  if (result.mismatch) {
    el.textContent = result.message;
    el.removeAttribute('hidden');
  } else {
    el.setAttribute('hidden', '');
  }
}

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

  // ★v0.1.1242(BLOCKING-1): WEB公開の同意フラグを最初に読む(既定OFF)。
  //   これより前に自動送信が走ることはない(maybeAutoPublishStatusSnapshot は
  //   描画のたびに呼ばれるが、キャッシュ初期値 false=送らない側に倒れている)。
  await refreshWebPublishOptInCache();
  // ★v0.1.1245: 共有キーを storage から読む(ビルドに焼き込まない)。
  //   キャッシュ初期値は未設定なので、これより前に送信やURL提示が走ることはない。
  await refreshUploadConfigCache();

  try {
    checkVersionMismatchBanner();
  } catch {
    /* no-op: バナー描画に失敗しても通常の初期化は続ける */
  }

  setupButtons();
  setupVisibilityHandler();
  setupStorageChangeListener();
  setupSoundPreviewPanel();
  setupMyCustomSoundPanel();
  setupBgmSettingsPanel();

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

/** v0.1.1009: refresh が実行中か(再入防止)。前回が終わる前に次の tick を走らせない。 */
let _refreshInFlight = false;
/** v0.1.1009: storage 混雑時に次の tick を何回スキップするか(残り回数)。 */
let _refreshBackoffTicks = 0;
/** v0.1.1062: この所要(ms)を超えた更新は「混雑」とみなし、次回の各readを短いtimeoutで有界化する。 */
const REFRESH_CONGESTED_MS = 10_000;
/** v0.1.1062: 混雑時の各read timeout(通常8000ms)。62秒級のマラソン更新を素早いdegradeに変える。 */
const CONGESTED_TIMEOUT_MS = 3_000;

/** v0.1.1062: 実効的な自動更新間隔を正直に表示する(2秒と書いたまま実際は90秒、を作らない)。 */
function updateAutoRefreshMeta() {
  const meta = document.getElementById('metaAutoRefresh');
  if (!meta) return;
  if (_refreshPausedByUser) { meta.textContent = '自動更新: 停止中'; return; }
  if (_refreshBackoffTicks <= 0) { meta.textContent = '自動更新: 2秒'; return; }
  const waitSec = Math.round(((_refreshBackoffTicks + 1) * REFRESH_INTERVAL_MS) / 1000);
  meta.textContent = `自動更新: 混雑中→約${waitSec}秒に自動調整`;
}

/**
 * ★v0.1.1371: 初回描画までの「読み込み中」表示を消す(初回 render 成功時に1回だけ)。
 *
 * ★status.html に【静的に】置いてある(JSが1行も動かなくても出る)ので、
 *   消すのはここだけ。失敗しても描画は壊さない。
 */
function dismissStatusBootNotice() {
  try {
    const el = document.getElementById('nlStatusBootNotice');
    if (el && !el.classList.contains('nl-status-boot-notice--done')) {
      el.classList.add('nl-status-boot-notice--done');
    }
  } catch {
    /* no-op: 表示の後始末が失敗しても本体を止めない */
  }
}

/**
 * ★v0.1.1371: 「開いた瞬間の1回」と「2秒ごとの1回」を同じ処理にする。
 *
 * ■ 何が起きていたか(2026-08-12 実機・ユーザーのスクショは【真っ白のまま】)
 *   描画経路は setInterval で回る refresh() 【だけ】だった。
 *   ＝ページを開いてから最初の描画まで **最低 REFRESH_INTERVAL_MS(2秒)** 何も出ない。
 *   さらに初回は _lastRefreshPerf が空なので下の congested 判定が必ず false になり、
 *   ★**初回だけ「一番遅い条件(記録中のstorage競合)」を「一番長いtimeout」で走る**。
 *   実測はコード内に残っていた: backfill 1918ms / fastDiagLite 1749ms / summaries 1724ms。
 *   2秒の空白 + 混雑した初回read = ユーザーが見た「白いまま返ってこない」。
 *
 * ■ なぜ速報で捕まえられなかったか(ユーザー指摘「状態速報なくても分かるようにして」)
 *   速報は refresh() が**成功して初めて**書かれる。初回が終わらない間は速報が存在しない。
 *   ＝**一番知りたい時間帯に計器が黙る**([[instrument-must-not-overwrite-its-own-evidence]] と同型)。
 *
 * @param {{ first?: boolean }} [opts] first=true なら初回(混雑を仮定して短いtimeoutで走る)
 */
function runRefreshTick(opts) {
  const first = opts?.first === true;
  if (_refreshPausedByUser) return;
  // ★初回は hidden でも描く。開いた直後は hidden 判定が true になりうるうえ、
  //   ここで降りると「開いたのに永久に白い」を作る(降りた後に誰も再挑戦しない)。
  if (!first && document.hidden) return;
  if (_refreshInFlight) return;
  if (!first && _refreshBackoffTicks > 0) { _refreshBackoffTicks -= 1; return; }
  _refreshInFlight = true;
  const prevTotalMs = Number(_lastRefreshPerf?.totalMs);
  /*
   * ★初回は「未知」であって「軽い」ではない。
   *   従来は prevTotalMs が無い=congested false=通常の長いtimeout(8000ms)だった。
   *   未知を軽い側に倒すと、一番混んでいる初回が一番長く待つ。短い側に倒して素早くdegradeする
   *   (degradeしても画面は出る=白いままより必ず良い)。
   */
  const congested = first
    ? true
    : Number.isFinite(prevTotalMs) && prevTotalMs > REFRESH_CONGESTED_MS;
  /*
   * ★v0.1.1410: 初回は【開くまでの時間】が体感そのものなので予算を強く締める。
   *   実測 6004ms の refresh が 12秒予算に収まっていた=何にも止められず、
   *   その間ページが出なかった。1.5秒で切り上げ、残りは次のtick(2秒後)が埋める。
   */
  refresh(
    first
      ? { timeoutMs: CONGESTED_TIMEOUT_MS, budgetMs: REFRESH_FIRST_CYCLE_BUDGET_MS }
      : congested
        ? { timeoutMs: CONGESTED_TIMEOUT_MS }
        : {}
  )
    .catch((err) => console.debug('[status] refresh err', err))
    .finally(() => {
      _refreshInFlight = false;
      _refreshBackoffTicks = computeRefreshBackoffTicks(Number(_lastRefreshPerf?.totalMs));
      updateAutoRefreshMeta();
    });
}

function startRefreshLoop() {
  if (_refreshTimerId != null) return;
  // ★v0.1.1371: interval の登録と同時に【1回すぐ描く】。2秒の空白を消す。
  runRefreshTick({ first: true });
  /*
   * ★v0.1.1009/1010「過去ログ取り込み中に状態速報が重い(1819→7071ms)」の緩和: backfill SW/content が
   *   単一 LevelDB に大きな staged 書込(最大2000行/2.5秒)を、2配信同時記録中はさらに倍で出すため、
   *   status の read がそれと競合して 1 refresh が数百ms〜7秒に膨れる(実機 backfill 1918ms/
   *   fastDiagLite 1749ms/summaries 1724ms=小さな read すら競合で待たされる)。
   *   そこで (a)前回の refresh が終わるまで次を走らせない(再入防止=積み上がりを断つ)、
   *   (b)前回の所要に【比例して】次の tick を間引く(v0.1.1010・computeRefreshBackoffTicks)=
   *      重いほど控えめにして書込が drain する余地を作る。通常時(軽い)は2秒のまま=鮮度不変。
   *   記録/取り込みには触らない(status の更新頻度だけ)。
   * ★v0.1.1371: 上記のガードは runRefreshTick に集約(初回と同じ経路を通す=判断が2箇所に割れない)。
   */
  _refreshTimerId = window.setInterval(() => {
    runRefreshTick();
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
  const tmoBase = Number.isFinite(Number(opts.timeoutMs)) && Number(opts.timeoutMs) > 0
    ? Number(opts.timeoutMs)
    : 8000;
  /*
   * ★v0.1.1388(ユーザー実機「診断おもくてひらかない」の根治):
   *   ここから下は timeout 付きの read を **10本、直列に await** する。
   *   1本ずつは有界(既定8000ms)でも **合計に上限が無かった**=最悪 10×8000=80秒/サイクル。
   *   refresh は2秒ごとに回るので数サイクルで180秒を超える(ユーザー実機と一致)。
   *
   *   ★並列化(Promise.all)では解かない。v0.1.867 で並列化して **退行**させた実績があり
   *     (単一LevelDBの並行readがstall→fastDiag={}・記録0)、v0.1.868 で直列へ戻している
   *     (上のコメントが正本)。＝**直列のまま、合計に天井を付ける**。
   *
   *   `_slice(既定値)` が「残り予算と既定値の小さい方」を返す。残りが尽きたら 0 =
   *   read を発行せず、ガードの直近値(stale)で描く。画面が出ないより古い値の方が良い。
   */
  const _deadline = createRefreshDeadline({
    totalMs: Number.isFinite(Number(opts.budgetMs)) && Number(opts.budgetMs) > 0
      ? Number(opts.budgetMs)
      : REFRESH_CYCLE_BUDGET_MS
  });
  /** @param {number} [want] @returns {number} この read に許す timeout[ms](0=読まない) */
  const _slice = (want) => _deadline.next(Number(want) || tmoBase);
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
    // 2026-07-14 診断ページ608秒固まり根治: コア5readはガード経由(timeoutでもthrowしない)。
    //   幽霊readが多重に競合していた旧実装(runStorageOpWithTimeout直呼び)から置換。
    step = 'enumerateActiveLives';
    const lvRes = await _livesGuard.read({ timeoutMs: _slice() });
    const lvList = lvRes.value;
    _mark(lvRes.stale ? 'lives(stale)' : 'lives');
    step = `loadAllSummaries(${lvList.length}件)`;
    const sumRes = await _summariesGuard.read({ timeoutMs: _slice(), arg: lvList });
    const summaries = sumRes.value;
    _mark(sumRes.stale ? `summaries×${lvList.length}(stale)` : `summaries×${lvList.length}`);
    // 2026-06-23: 2秒ループは full(~40KB)でなく軽量ダイジェスト(~1KB)を read=重さの真因を断つ。
    //   読み取りパスは full と同形なので renderAll 以下の consumer は無変更(council/status-heavy-open-SYNTHESIS.md)。
    step = 'loadStatusFastDiagLiteSafe';
    const fdRes = await _fastDiagGuard.read({ timeoutMs: _slice() });
    const fastDiag = fdRes.value;
    _mark(fdRes.stale ? 'fastDiagLite(stale)' : 'fastDiagLite');
    step = 'loadPopupDiagSafe';
    const pdRes = await _popupDiagGuard.read({ timeoutMs: _slice() });
    const popupDiag = pdRes.value;
    _mark(pdRes.stale ? 'popupDiag(stale)' : 'popupDiag');
    step = 'loadBackfillProgress';
    const bfRes = await _backfillGuard.read({ timeoutMs: _slice() });
    const backfillProgress = bfRes.value;
    _mark(bfRes.stale ? 'backfill(stale)' : 'backfill');
    const coreReads = [lvRes, sumRes, fdRes, pdRes, bfRes];
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
      // 重さ根治 P2(2026-07-06): 単一キー get のみの17項目(voiceDiag〜commentPostDiag)を
      //   従来は個別に runStorageOpWithTimeout(=直列 await 17回)していたのを、1回の
      //   chrome.storage.local.get([...]) へ統合する。混雑時の理論最悪(17×タイムアウト)を
      //   1×タイムアウトへ縮める。純粋な取り出しロジックは src/lib/statusExtrasBatch.js(test付き)。
      //   ★統合しないもの(意味が変わる/別APIのため個別 await のまま):
      //     queryWatchTabMap(chrome.tabs.query)・recordAndAnalyzeTrendSafe(read+set混在)・
      //     loadCustomSoundDiagSafe(IndexedDB open+count。P1(v0.1.1084)で別途 count() 化済み)。
      // 2026-07-15: コア5readと同じstale-while-revalidateガード経由に変更(旧runStorageOpWithTimeout
      //   直呼びは幽霊readの多重競合を止められなかった)。
      step = 'loadExtrasBatch';
      const extrasRes = await _extrasBatchGuard.read({ timeoutMs: _slice() });
      const extrasBag = extrasRes.value;
      _mark(extrasRes.stale ? 'extrasBatch(stale)' : 'extrasBatch');
      const {
        voiceDiag,
        venueSeatsDiag,
        reportPreview,
        laneDiag,
        laneMirror,
        statCardsMirror,
        northStarMirror,
        publishOutcomeRec,
        commentTimelineMirror,
        giftHistoryMirror,
        roomHeatMirror,
        sessionSummaryMirror,
        previewRenderAck,
        backfillLiveMetric,
        giftEffectDiag,
        milestoneEffectDiag,
        voiceEffectDiag,
        bgmPhaseDiag,
        opSoundEffectDiag,
        commentPostDiag,
        instantPushDiag,
        channelSwitchDiag,
        highlightLedger,
        scoreAnnounceDiag,
        sidepanelSelfDiag
      } = pickExtrasBatchValues(extrasBag, Date.now());
      step = 'queryWatchTabMap';
      const wtRes = await _watchTabMapGuard.read({ timeoutMs: _slice() });
      const watchTabMap = wtRes.value;
      _mark(wtRes.stale ? 'watchTabMap(stale)' : 'watchTabMap');
      step = 'recordAndAnalyzeTrend';
      const trendFindings = await runStorageOpWithTimeout(
        () => recordAndAnalyzeTrendSafe(lvList, summaries),
        _slice()
      ).catch(() => []);
      // v0.1.1072: マイ効果音(取込件数/割当キー数/rev)も extras(12秒間引き)へ。IDB read のため
      //   コアには絶対足さない(既知の地雷=v1045/v1046と同型)。失敗時は「-」表示スナップショットへ。
      // 重さ根治 P3(2026-07-06): runStorageOpWithTimeout のタイムアウトは opFn 自体を止めない
      //   (裏で生き続ける幽霊 read)ため、in-flight ガードで新規発行そのものを抑止する。
      //   未解決中は直近キャッシュ(なければ dbAvailable:false スナップショット)を fallback として返す。
      step = 'loadCustomSoundDiag';
      const customSoundDiagFallback =
        _extrasCache.customSoundDiag || buildCustomSoundDiagSnapshot({ dbAvailable: false });
      const customSoundDiag = await runStorageOpWithTimeout(
        () => _customSoundDiagGuard.run(customSoundDiagFallback),
        _slice()
      ).catch(() => customSoundDiagFallback);
      /*
       * ★v0.1.1384: 自動タブリロードの痕跡(1キーだけ・extras 側=12秒間引き)。
       *   コアには足さない([[status-extras-read-not-core-read]])。
       *   失敗しても null のまま=行が出ないだけで、速報全体は止めない。
       */
      /*
       * ★v0.1.1415: 小さな1キー read を【1本にまとめる】。
       *
       * ■ なぜ
       *   実測で分かった重さの正体は「読む量」ではなく **read の本数 ×
       *   書き込みとの競合**(同じreadが 平常1ms → backfill中217ms)。
       *   ＝ **直列に並べた本数がそのまま体感になる**。
       *   `chrome.storage.local.get` は複数キーを1回で取れるので、
       *   情報量を1bitも減らさずに本数だけ減らせる。
       *
       *   ★v0.1.1412 で私が sourceProvenance を**独立した1本**として足したのは誤り。
       *     計器を足すたびに read が1本増えるなら、計器が診断を殺す
       *     (observer effect)。**足すときは既存のバッチに相乗りさせる**。
       */
      step = 'smallKeysBatch';
      {
        const _small = await runStorageOpWithTimeout(
          () => chrome.storage.local.get(['nls_last_auto_tab_reload', KEY_SOURCE_PROVENANCE]),
          _slice()
        ).catch(() => null);
        if (_small) {
          _autoTabReloadRec = _small.nls_last_auto_tab_reload || null;
          _sourceProvenanceStored = _small[KEY_SOURCE_PROVENANCE] || null;
        }
      }
      _extrasCache = { reportPreview, watchTabMap, trendFindings, laneDiag, laneMirror, statCardsMirror, northStarMirror, voiceDiag, venueSeatsDiag, publishOutcomeRec, commentTimelineMirror, giftHistoryMirror, roomHeatMirror, sessionSummaryMirror, previewRenderAck, backfillLiveMetric, giftEffectDiag, milestoneEffectDiag, customSoundDiag, voiceEffectDiag, bgmPhaseDiag, opSoundEffectDiag, commentPostDiag, instantPushDiag, channelSwitchDiag, highlightLedger, scoreAnnounceDiag, sidepanelSelfDiag };
      _extrasCacheAt = Date.now();
      _mark('extras');
    }
    const { reportPreview, watchTabMap, trendFindings, laneDiag, laneMirror, statCardsMirror, northStarMirror, voiceDiag, venueSeatsDiag, publishOutcomeRec, commentTimelineMirror, giftHistoryMirror, roomHeatMirror, sessionSummaryMirror, previewRenderAck, backfillLiveMetric, giftEffectDiag, milestoneEffectDiag, customSoundDiag, voiceEffectDiag, bgmPhaseDiag, opSoundEffectDiag, commentPostDiag, instantPushDiag, channelSwitchDiag, highlightLedger, scoreAnnounceDiag, sidepanelSelfDiag } = _extrasCache;
    // 2026-07-14 診断ページ608秒固まり根治: コアreadがstale供給(timeoutでも直近成功値)された場合、
    //   嘘の新鮮さを装わずヘッダーに鮮度を明記する(parity診断群と同じ「嘘をつかない」原則)。
    const staleCores = coreReads.filter((r) => r.stale);
    const neverHadData = staleCores.some((r) => !r.hadData);
    let staleNote = '';
    // v0.1.1222: コピー本文にも同じ鮮度を載せるため、この時点の古さを保持しておく
    //   (画面ヘッダーだけに出していたのが、古い本文を共有してしまう穴の原因だった)。
    _lastRenderedSourceStaleSec = 0;
    if (staleCores.length > 0 && !neverHadData) {
      const worstSec = Math.round(Math.max(...staleCores.map((r) => r.ageMs)) / 1000);
      _lastRenderedSourceStaleSec = worstSec;
      staleNote = worstSec >= 600
        ? ` ⚠${worstSec}秒前の値(混雑が長引いています・記録は継続中)`
        : ` ⏳${worstSec}秒前の値(混雑中・裏で読み直し中)`;
    }
    if (neverHadData) {
      // 初回から混雑=一度も成功値が無い。旧catchの⏳文言と同趣旨をここで出す(画面は空degradeのまま)。
      _statusLastErrorText =
        `⏳ ストレージが混雑していて状態の読み込みに少し時間がかかっています。\n` +
        `  記録自体は各 watch タブ側で続いています(止まっていません)。\n` +
        `  数秒ごとに自動で再読み込みします。このまま少しお待ちください。`;
    }
    step = 'renderAll';
    /*
     * ★v0.1.1371: ここまで来れば「画面に何かが出る」ことが確定=読み込み表示を下ろす。
     *   ★degrade(stale値/空)でも下ろす。中身が薄くても【画面が出ている】方が、
     *     「読み込み中」が居座り続けるより正しい(永久ローディングを作らない)。
     */
    dismissStatusBootNotice();
    // v0.1.1005: 前サイクルの所要計器をコピー本文へ渡す(画面ヘッダーだけでなく AI共有テキストにも出す)。
    // 2026-07-14: renderAll 内のセクション別内訳(前サイクル計測)も同様に渡す(診断ページ軽量化の実測材料)。
    renderAll({ lvList, summaries, fastDiag, popupDiag, backfillProgress, backfillLiveMetric, voiceDiag, venueSeatsDiag, laneDiag, laneMirror, statCardsMirror, northStarMirror, reportPreview, trendFindings, watchTabMap, publishOutcomeRec, commentTimelineMirror, giftHistoryMirror, roomHeatMirror, sessionSummaryMirror, previewRenderAck, refreshPerf: _lastRefreshPerf, renderSectionMs: _lastRenderSectionMs, giftEffectDiag, milestoneEffectDiag, customSoundDiag, voiceEffectDiag, bgmPhaseDiag, opSoundEffectDiag, commentPostDiag, instantPushDiag, channelSwitchDiag, highlightLedger, scoreAnnounceDiag, sidepanelSelfDiag, extrasAgeMs: _extrasCacheAt ? Math.max(0, Date.now() - _extrasCacheAt) : null });
    _mark('render');
    /*
     * ★v0.1.1320: 「JSが返るまで」でなく【画面に出るまで】を測る。
     *
     * ■ なぜ必要か(2026-08-10 に判明した計器の欠陥)
     *   ここより下の _totalMs は renderAll から【JSが返った時点】で確定する。
     *   style/layout/paint は**その後**にブラウザが走らせるので計器の【外】。
     *   ＝速報の「更新所要 6ms」は「JSが6msで返った」であって「画面が軽い」ではない。
     *   ★このファイル自身に反証が残っていた:
     *     「1回目 12,610ms(extras 12,607 / render 3) → 2回目 5ms」
     *     ＝render 3ms でも実所要は12秒。render の小ささは軽さを意味しない。
     *
     * ■ 測り方: rAF は「次の描画の直前」、その中の setTimeout(0) は「描画の直後」に戻る。
     *   この2点で JS 復帰→実描画 を挟み込む。計測だけで描画には触らない。
     */
    try {
      if (typeof requestAnimationFrame === 'function') {
        const _paintT0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        requestAnimationFrame(() => {
          setTimeout(() => {
            try {
              const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
              observePaintCompletion(_paintProbe, now - _paintT0);
            } catch { /* 計器の失敗は描画を壊さない */ }
          }, 0);
        });
      }
    } catch { /* no-op */ }
    const _totalMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0);
    updateLastUpdateMeta({ totalMs: _totalMs, stepMs: _stepMs, staleNote });
    // 次サイクルのコピー本文に出すため、この refresh の計器を保持(render 込みの最新 totalMs/stepMs)。
    // ★v0.1.1314: tabs.query の遅延計器を同梱する(「lives が遅い」の内訳を名指しするため)。
    //   遅延を1度も観測していなければ count=0 で、速報には1行も出ない。
    _lastRefreshPerf = {
      totalMs: _totalMs,
      stepMs: _stepMs.slice(),
      tabsQuerySlow: { ..._tabsQuerySlowDiag },
      // ★v0.1.1320: JSが返った後の style/layout/paint まで含めた実所要。
      //   これが大きければ「重いのはDOMの作り直し」＝拡張の中で直せる、と名指しできる。
      paintCompletionLine: formatPaintCompletionLine(_paintProbe, { jsMs: _totalMs })
    };
    if (staleCores.length === 0) _statusLastErrorText = '';
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
    /*
     * ★v0.1.1371: 失敗経路でも読み込み表示を下ろす。
     *   ここは renderAll に到達しないので、下ろさないと「読み込み中」が【永久に居座る】。
     *   下の _statusLastErrorText が理由を画面に出すので、消しても情報は失われない
     *   (むしろ「読み込み中」が理由を覆い隠す方が悪い)。
     */
    dismissStatusBootNotice();
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
 * @param {{ totalMs?: number, stepMs?: Array<[string, number]>, staleNote?: string }} [perf]
 *   v0.1.890: refresh 所要時間の計器。totalMs と「重かったステップ top2」を最終更新の隣に出す=
 *   「状態速報が重い」の真因を、推測せず実データで見えるようにする(self-verifying)。
 *   staleNote: 2026-07-14 診断ページ608秒固まり根治。コアreadがstale供給された場合の鮮度明記。
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
  el.textContent = `最終更新 ${hh}:${mm}:${ss}${perfText}${perf?.staleNote || ''}`;
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

/**
 * ★v0.1.1314: `chrome.tabs.query` が遅かった回数と最悪値(診断ページ 9.8 秒の切り分け用)。
 *   storage を触らない API なので、ここが遅いなら真因は storage 競合ではない。
 * @type {{ count: number, worstMs: number, lastMs: number, lastTabCount: number }}
 */
const _tabsQuerySlowDiag = { count: 0, worstMs: 0, lastMs: 0, lastTabCount: -1 };

/**
 * ★v0.1.1320: 「JSが返ってから画面に出るまで」の実測(既存計器の盲点を埋める)。
 *   既存の totalMs は renderAll から JS が返った時点で止まるので、
 *   style/layout/paint(=DOMを作り直しすぎたときの重さ)が一切写らなかった。
 */
const _paintProbe = createPaintProbeState();

async function enumerateActiveLives() {
  /** @type {string[]} */
  const lvList = [];
  // 経路1: 実際に開いているニコ生 watch タブから lv 抽出
  try {
    /*
     * ★v0.1.1314: `chrome.tabs.query` だけの所要を単独で測る。
     *
     * ■ なぜ要るか(2026-08-06 に測って未解明のまま残っている数字)
     *   診断ページ 9,812ms の内訳で `lives` が 5,493ms を占めていた。
     *   しかし `lives` は【tabs.query + fastDiag フォールバック】の合計なので、
     *   どちらが遅いのか名指しできない＝計器が症状しか出していない。
     *   ★tabs.query は storage を触らない(browser プロセスが応える)ので、
     *     もし tabs.query 単独が遅いなら【storage競合説では説明できない】=
     *     真因は拡張の外(browser プロセスの混雑)側にある、と切り分けられる。
     *   逆に tabs.query が速ければ、遅いのは fastDiag 経路＝storage 側と確定する。
     *
     * ★この計器は「遅いときだけ」記録する(常時書くと storage を汚す)。
     */
    const _tq0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const tabs = await chrome.tabs.query({
      url: ['https://live.nicovideo.jp/watch/*', 'https://sp.live.nicovideo.jp/watch/*']
    });
    const _tqMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - _tq0
    );
    // 1秒以上かかったら記録する(通常は数ms。閾値を超えた回数と最悪値だけ持つ)。
    if (_tqMs >= 1000) {
      _tabsQuerySlowDiag.count += 1;
      if (_tqMs > _tabsQuerySlowDiag.worstMs) _tabsQuerySlowDiag.worstMs = _tqMs;
      _tabsQuerySlowDiag.lastMs = _tqMs;
      _tabsQuerySlowDiag.lastTabCount = Array.isArray(tabs) ? tabs.length : -1;
    }
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
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み。
//   本体は削除せず残置(別の掃除パッチ用)。
// eslint-disable-next-line no-unused-vars
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
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
async function loadLaneDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_LANE_DIAG);
    return bag?.[KEY_LANE_DIAG] || null;
  } catch {
    return null;
  }
}

// 2026-06-22(council/lane-show-all-active): 会場モード(venueBar・別ページ)の座席診断を読む。
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
async function loadVenueSeatsDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_VENUE_SEATS_DIAG);
    return bag?.[KEY_VENUE_SEATS_DIAG] || null;
  } catch {
    return null;
  }
}

// v0.1.1054: 会場モード(venueBar)が書く「ギフト/広告の検知→演出→効果音」整合診断を読む。
//   会場モード未使用/ギフト無し配信なら null=行を出さない(voiceDiag/venueSeatsDiag と同方針)。
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
async function loadGiftEffectDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_GIFT_EFFECT_DIAG);
    return bag?.[KEY_GIFT_EFFECT_DIAG] || null;
  } catch {
    return null;
  }
}

// v0.1.1058: popup-entry.js が書く「コメント数マイルストーンの検知→演出→効果音」整合診断を読む。
//   マイルストーン未到達の配信なら null=行を出さない(giftEffectDiag/voiceDiag と同方針)。
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
async function loadMilestoneEffectDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_MILESTONE_EFFECT_DIAG);
    return bag?.[KEY_MILESTONE_EFFECT_DIAG] || null;
  } catch {
    return null;
  }
}

// Phase B(v0.1.1073): venueBar/popup が書く「パチンコボイスの発火/スキップ内訳」を読む。
//   ボイストリガが一度も無い配信なら null=行を出さない(giftEffectDiag と同方針)。
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
async function loadVoiceEffectDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_VOICE_EFFECT_DIAG);
    return bag?.[KEY_VOICE_EFFECT_DIAG] || null;
  } catch {
    return null;
  }
}

// Phase C(v0.1.1074): venueBar/popup が書く「BGM in/out・現在フェーズ・R値・B値」を読む。
//   フェーズ判定が一度も走っていない配信なら null=行を出さない(voiceEffectDiagと同方針)。
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
async function loadBgmPhaseDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_BGM_PHASE_DIAG);
    return bag?.[KEY_BGM_PHASE_DIAG] || null;
  } catch {
    return null;
  }
}

// Phase D1(2026-07-05): popup が書く「操作音(押下→成功→発音)」観測値を読む。
//   投稿操作が一度も無い配信なら null=行を出さない(voiceEffectDiag と同方針)。
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
async function loadOpSoundEffectDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_OP_SOUND_EFFECT_DIAG);
    return bag?.[KEY_OP_SOUND_EFFECT_DIAG] || null;
  } catch {
    return null;
  }
}

// 感度パッチ(2026-07-06): popup が書く「コメント送信(所要ms/結果/フレーム試行回数)」
//   観測値を読む。送信操作が一度も無い配信なら null=行を出さない(他の診断と同方針)。
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
async function loadCommentPostDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_COMMENT_POST_DIAG);
    return bag?.[KEY_COMMENT_POST_DIAG] || null;
  } catch {
    return null;
  }
}

// v0.1.1072: マイ効果音(customSoundStore.js)の取込状況を読む。status ページ自身が IndexedDB を
//   直接開いて件数を数える(他ページの publish を待たない=診断ページの統計行と同じ読み方)。
//   IDBが開けない環境(indexedDB未定義・open失敗)では dbAvailable:false で静かに「-」表示にする。
// v0.1.1084: 件数を数えるためだけにBlob本体込みで全件カーソル走査(listSoundBlobs)していたのを
//   IDBObjectStore.count()ベースのcountSoundBlobs/countAssignmentsへ差し替え(重さ根治P1)。
//   件数比例で重くなっていた大配信時のextras遅延を解消する(取込UI側のrenderList/renderStatsは
//   一覧表示そのものが必要なためlistSoundBlobs/listAssignmentsのまま=無改修)。
/**
 * sound/custom/manifest.json は**拡張同梱の静的ファイル**で実行中に変わらない。
 * ★v0.1.1237: 従来は loadCustomSoundDiagSafe(:1099)と setupMyCustomSoundPanel(:3143)が
 *   同じURLを独立に fetch していた(二重取得)。1本の Promise を共有して初回だけ取りに行く。
 * @type {Promise<Record<string,string>|null>|null}
 */
let _localSoundManifestPromise = null;
function loadLocalSoundManifestShared() {
  if (!_localSoundManifestPromise) {
    _localSoundManifestPromise = loadLocalBundledSoundManifest({
      getUrl: (p) => chrome.runtime.getURL(p)
    }).catch(() => null);
  }
  return _localSoundManifestPromise;
}

async function loadCustomSoundDiagSafe() {
  // ローカル同梱本数(sound/custom/manifest.json)は IndexedDB の有無に関係なく計測する
  //   (install-local-sounds.mjs による自動同梱の実態を必ず出す・静かに0埋め)。
  let localBundledCount = 0;
  try {
    const manifestFiles = await loadLocalSoundManifestShared();
    localBundledCount = manifestFiles ? Object.keys(manifestFiles).length : 0;
  } catch {
    localBundledCount = 0;
  }
  if (typeof indexedDB === 'undefined') {
    return buildCustomSoundDiagSnapshot({ dbAvailable: false, localBundledCount });
  }
  try {
    const db = await openCustomSoundDb();
    const [blobCount, assignedKeyCount, bag] = await Promise.all([
      countSoundBlobs(db),
      countAssignments(db),
      chrome.storage.local.get(KEY_CUSTOM_SOUND_REV)
    ]);
    return buildCustomSoundDiagSnapshot({
      blobCount,
      assignedKeyCount,
      totalKeyCount: CUSTOM_SOUND_PRESET_KEYS.length,
      rev: Number(bag?.[KEY_CUSTOM_SOUND_REV]) || 0,
      dbAvailable: true,
      localBundledCount
    });
  } catch {
    return buildCustomSoundDiagSnapshot({ dbAvailable: false, localBundledCount });
  }
}

// 応援レーン鏡(KEY_LANE_MIRROR)を読む。popup が renderStoryUserLane の最後で書く=popup を
//   一度も開いていなければ null=鏡セクションは hidden のまま(死にリンクにしない)。例外時も null。
//   ★毎回の直列 read は増やさない=この loader は extras(12秒間引き)からだけ呼ぶ(MEMORY 鉄則)。
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
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
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
async function loadStatCardsMirrorSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_STAT_CARDS_MIRROR);
    return bag?.[KEY_STAT_CARDS_MIRROR] || null;
  } catch {
    return null;
  }
}

/** 北極星レーン鏡(公式値レーン)を読む。popup が KEY_NORTH_STAR_MIRROR へ publish。extras(12秒)で読む。
 *  重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。 */
// eslint-disable-next-line no-unused-vars
async function loadNorthStarMirrorSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_NORTH_STAR_MIRROR);
    return bag?.[KEY_NORTH_STAR_MIRROR] || null;
  } catch {
    return null;
  }
}

/** 送信結果(ページ横断 storage)を読む。status / live-view どちらの公開ボタンで送ってもここに残る(根2対策)。
 *  重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。 */
// eslint-disable-next-line no-unused-vars
async function loadLiveviewPublishOutcomeSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_LIVEVIEW_PUBLISH_OUTCOME);
    return bag?.[KEY_LIVEVIEW_PUBLISH_OUTCOME] || null;
  } catch {
    return null;
  }
}

/** コメントタイムライン鏡(最新N件)を読む。popup が KEY_COMMENT_TIMELINE_MIRROR へ publish。extras(12秒)で読む。
 *  重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。 */
// eslint-disable-next-line no-unused-vars
async function loadCommentTimelineMirrorSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_COMMENT_TIMELINE_MIRROR);
    return bag?.[KEY_COMMENT_TIMELINE_MIRROR] || null;
  } catch {
    return null;
  }
}

// v0.1.858: レポート(HTML/マーケ/メディアキット)の DL前 主要KPI を読む。popup が
//   KEY_REPORT_PREVIEW へ定期(15秒)に書く。古い snapshot(2分超)や popup 未起動なら null=表示しない。
// 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get(鮮度判定込み)へ統合済み(残置)。
// eslint-disable-next-line no-unused-vars
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
      errMsg: String(p.errMsg || ''),
      // v0.1.999 スループット計器: 状態速報の「⏱ 取得速度」行が使う(観測値・取り込みには影響しない)。
      seg: Number(p.seg) || 0,
      elapsedMs: Number(p.elapsedMs) || 0,
      reseeds: Number(p.reseeds) || 0
    };
  } catch {
    return null;
  }
}

/**
 * v0.1.1045 段1: 走行中スループット計器(KEY_BACKFILL_LIVE_METRIC)を読む(観測のみ)。
 *   content が走行中に 1Hz で書く。yield bridging が律速か・裏タブペース(fg=0)かを実機で確定する材料。
 *   ⚠️ KEY_BACKFILL_PROGRESS とは別キー。popup は絶対に読まない(v0.1.657 実況殺しの維持)。
 * @returns {{lid:string, running:number, seg:number, rows:number, genSteps:number, dataSegs:number, bridgingSteps:number, yields:number, yieldWaitMsTotal:number, elapsedMs:number, fg:number, ts:number}|null}
 * 重さ根治 P2(2026-07-06): 呼び出し元は statusExtrasBatch.js の1バッチ get へ統合済み(残置)。
 */
// eslint-disable-next-line no-unused-vars
async function loadBackfillLiveMetricSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_BACKFILL_LIVE_METRIC);
    const m = bag?.[KEY_BACKFILL_LIVE_METRIC];
    if (!m || typeof m !== 'object') return null;
    return {
      lid: String(m.lid || ''),
      running: Number(m.running) || 0,
      seg: Number(m.seg) || 0,
      rows: Number(m.rows) || 0,
      genSteps: Number(m.genSteps) || 0,
      dataSegs: Number(m.dataSegs) || 0,
      bridgingSteps: Number(m.bridgingSteps) || 0,
      yields: Number(m.yields) || 0,
      yieldWaitMsTotal: Number(m.yieldWaitMsTotal) || 0,
      elapsedMs: Number(m.elapsedMs) || 0,
      fg: Number(m.fg) || 0,
      ts: Number(m.ts) || 0
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

function renderAll({ extrasAgeMs, lvList, summaries, fastDiag, popupDiag, backfillProgress, backfillLiveMetric, voiceDiag, venueSeatsDiag, laneDiag, laneMirror, statCardsMirror, northStarMirror, reportPreview, trendFindings, watchTabMap, publishOutcomeRec, commentTimelineMirror, giftHistoryMirror, roomHeatMirror, sessionSummaryMirror, previewRenderAck, refreshPerf, renderSectionMs, giftEffectDiag, milestoneEffectDiag, customSoundDiag, voiceEffectDiag, bgmPhaseDiag, opSoundEffectDiag, commentPostDiag, instantPushDiag, channelSwitchDiag, highlightLedger, scoreAnnounceDiag, sidepanelSelfDiag }) {
  // v0.1.847: 各描画セクションを独立 try/catch で隔離するヘルパ。1つが throw しても他のセクションと
  //   最終更新メタを巻き込まない=「セルが全部消える/最終更新—のまま固まる」を根治。落ちた場所は
  //   console と AI 共有欄に出して真因を追えるようにする(star-romi 失敗体験の除去)。
  // 2026-07-14: renderAll 内の「どのセクションが重いか」を可視化する自己計測を追加(観測のみ・
  //   描画ロジックは不変)。診断ページ軽量化(lazy details 化)の対象を推測でなく実測で決めるための前提計器。
  const _sectionMs = [];
  /** @param {string} name @param {() => void} fn */
  const safeSection = (name, fn) => {
    const _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
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
    } finally {
      const _t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      _sectionMs.push([name, Math.round(_t1 - _t0)]);
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
    // v0.1.1045 段1: 走行中スループット計器(別キー・観測のみ)。running=1 かつ新鮮(15秒以内)の
    //   ときだけ「⏱ 取得速度(走行中)」を出す=固着で止まった過去の走行中を残さない(self-verifying)。
    //   yield bridging が律速か・裏タブペース(fg=0)かを実機1枚で確定するための行。
    if (
      backfillLiveMetric &&
      backfillLiveMetric.running === 1 &&
      backfillLiveMetric.ts > 0 &&
      Date.now() - backfillLiveMetric.ts < 15000
    ) {
      const liveTput = backfillLiveThroughputLine(backfillLiveMetric);
      if (liveTput) backfillLine += `\n${liveTput}`;
    }
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
  // v0.1.1054: ギフト/広告の「検知→演出→効果音」整合診断を概要に併記(会場モード未使用/
  //   ギフト無し配信なら空=ノイズにしない)。「ギフトがちゃんと飛ぶか・音が出るか」を目視せず確認できる。
  let giftEffectLine = '';
  safeSection('ギフト効果音診断', () => {
    const gLines = buildGiftEffectDiagLines(giftEffectDiag, Date.now());
    giftEffectLine = gLines.length ? `\n${gLines.join('\n')}` : '';
  });
  // v0.1.1058: コメント数マイルストーンの「検知→演出→効果音」整合診断も概要に併記
  //   (マイルストーン未到達の配信なら空=ノイズにしない)。
  let milestoneEffectLine = '';
  safeSection('マイルストーン効果音診断', () => {
    const mLines = buildMilestoneEffectDiagLines(milestoneEffectDiag, Date.now());
    milestoneEffectLine = mLines.length ? `\n${mLines.join('\n')}` : '';
  });
  // v0.1.1072: マイ効果音(取込件数/割当キー数/rev)を概要に併記。IDBが開けない環境では「-」表示
  //   (buildCustomSoundDiagLine が静かに済ませる・絶対制約)。
  let customSoundLine = '';
  safeSection('マイ効果音計器', () => {
    const cStr = buildCustomSoundDiagLine(customSoundDiag);
    customSoundLine = cStr ? `\n${cStr}` : '';
  });
  // Phase B(v0.1.1073): パチンコボイスの発火/スキップ内訳を概要に併記(ボイストリガが一度も
  //   無い配信なら空=ノイズにしない)。歯止め(§4)の動作証明を状態速報1枚で確認できる。
  let voiceEffectLine = '';
  safeSection('パチンコボイス計器', () => {
    const vLines = buildVoiceEffectDiagLines(voiceEffectDiag, Date.now());
    voiceEffectLine = vLines.length ? `\n${vLines.join('\n')}` : '';
  });
  // Phase C(v0.1.1074): BGM/フェーズ計器(in/out回数・現在フェーズ・R値・B値)を概要に併記
  //   (フェーズ判定が一度も走っていない配信なら空=ノイズにしない)。
  let bgmPhaseLine = '';
  safeSection('パチンコBGM/フェーズ計器', () => {
    const bLines = buildBgmPhaseDiagLines(bgmPhaseDiag, Date.now());
    bgmPhaseLine = bLines.length ? `\n${bLines.join('\n')}` : '';
  });
  // Phase D1(2026-07-05): 操作音(押下→成功→発音)計器を概要に併記(投稿操作が一度も
  //   無い配信なら空=ノイズにしない)。「押下は鳴るのに成功が無い/成功しても未割当」を1枚で確認。
  let opSoundEffectLine = '';
  safeSection('操作音計器', () => {
    const oLines = buildOpSoundEffectDiagLines(opSoundEffectDiag, Date.now());
    opSoundEffectLine = oLines.length ? `\n${oLines.join('\n')}` : '';
  });
  // 感度パッチ(2026-07-06): コメント送信(所要ms/結果/フレーム試行回数)計器を概要に併記
  //   (送信操作が一度も無い配信なら空=ノイズにしない)。「送信中…」張り付き・自コメ「一瞬
  //   載って消える」の切り分けに、締切超過件数と取消件数を1枚で確認できる。
  let commentPostLine = '';
  safeSection('コメント送信計器', () => {
    const cLines = buildCommentPostDiagLines(commentPostDiag, Date.now());
    commentPostLine = cLines.length ? `\n${cLines.join('\n')}` : '';
  });
  // v0.1.1092: コメント即時プッシュレーン(storage迂回)の送信N/受信N/表示遅延msを概要に併記
  //   (プッシュが一度も無い配信なら空=ノイズにしない)。埋め込みパネルが実際に即時反映できているかの切り分け用。
  let instantPushLine = '';
  safeSection('即時プッシュ計器', () => {
    const iLines = buildInstantPushDiagLines(instantPushDiag, Date.now());
    instantPushLine = iLines.length ? `\n${iLines.join('\n')}` : '';
  });
  // robust-arch Phase 0(2026-07-07・計器のみ・挙動不変): このページ(status)から出た
  //   chrome.storage.local への書込を「上位5キー bytes/分」で概要に併記する。真犯人と
  //   目された巨大キー(KEY_LIVEVIEW_PUBLISH_PAYLOAD)の書込量を実配信で数値化し、MVP
  //   (min-gap 3000→12000+prune)の効果を測る物差しにする。書込ゼロなら空=ノイズにしない。
  let writeLedgerLine = '';
  safeSection('書込台帳計器', () => {
    const wLines = buildStorageWriteLedgerLines(getStorageWriteLedger(), Date.now(), 5);
    writeLedgerLine = wLines.length ? `\n${wLines.join('\n')}` : '';
  });
  // robust-arch Phase 1 MVP(2026-07-07): 公開ペイロード容量 prune(削り)の発動累計回数を概要に併記。
  //   「消す側にも計器を置く」鉄則(story-userlane-churn-v1039)。0回なら空=ノイズにしない。
  //   詳細な削り内訳(section/前後件数)は「純Web公開コピーの自己診断」の⚠️削減行に出る。
  let prunePublishLine = '';
  safeSection('公開ペイロードprune計器', () => {
    const pc = getLiveViewPublishPruneCount();
    prunePublishLine = pc > 0
      ? `\n公開ペイロード容量削減(prune): 累計 ${pc} 回発動(1枚が上限448KB超のとき③WEB送信ぶんを段階的に削減。内訳は下の自己診断⚠️行)`
      : '';
  });
  // 2026-07-06: 配信切替(SPA遷移で iframe を作り直さない in-place 切替)の送信N/受信N/初描画msを
  //   概要に併記(切替が一度も無い配信なら空=ノイズにしない)。「切替が来ているのに送信ボタンが
  //   灰色のまま」等の切り分け用。
  let channelSwitchLine = '';
  safeSection('配信切替計器', () => {
    const sLines = buildChannelSwitchDiagLines(channelSwitchDiag, Date.now());
    channelSwitchLine = sLines.length ? `\n${sLines.join('\n')}` : '';
  });
  /*
   * ★v0.1.1384: 拡張更新時に watch タブが【自動リロードされたか】を出す。
   *
   * ■ なぜ(2026-08-13 ユーザーの困りごと)
   *   ユーザーは更新のたび「🔄 → watch タブ F5」を手作業でやっていた(1日11版=11回)。
   *   しかし background.js の reloadExistingWatchTabs() が効いているなら **F5 は不要**。
   *   ★「効いているか」を誰も測っていなかったため、私(司令塔)は毎回 F5 を依頼し続けた。
   *   この行が出れば、次からその依頼を**やめられる**。
   */
  let autoTabReloadLine = '';
  safeSection('自動タブリロード計器', () => {
    const rec = _autoTabReloadRec;
    if (!rec || typeof rec !== 'object') return;
    const at = Number(rec.at) || 0;
    if (at <= 0) return;
    const agoSec = Math.max(0, Math.round((Date.now() - at) / 1000));
    const reloaded = Math.max(0, Number(rec.reloaded) || 0);
    autoTabReloadLine =
      `\n拡張更新時の自動タブリロード: ${reloaded > 0 ? '✅' : '⚠'}${reloaded}枚を再読込` +
      `(${agoSec}秒前・経路=${String(rec.reason || '?')})` +
      (reloaded > 0 ? ' ★手動F5は不要です' : ' ★対象タブが無かった(watchを開く前の更新)');
  });
  // SC2(council/broadcast-scoring-SYNTHESIS.md §2.2): ハイライト台帳(実際に発火した演出の
  //   件数/最終記録ago/上位ラベル)を概要に併記(台帳が空の配信なら空=ノイズにしない)。
  let highlightLedgerLine = '';
  safeSection('配信採点ハイライト計器', () => {
    const hLines = buildHighlightLedgerDiagLines(highlightLedger, Date.now());
    highlightLedgerLine = hLines.length ? `\n${hLines.join('\n')}` : '';
  });
  // SC3(council/broadcast-scoring-SYNTHESIS.md §2.1): 結果発表シーケンス(起動/完走/中断)を
  //   概要に併記(発表が一度も起動していない配信なら空=ノイズにしない)。
  let scoreAnnounceLine = '';
  safeSection('配信採点 結果発表計器', () => {
    const aLines = buildScoreAnnounceDiagLines(scoreAnnounceDiag, Date.now());
    scoreAnnounceLine = aLines.length ? `\n${aLines.join('\n')}` : '';
  });
  const overviewEl = document.getElementById('overviewBody');
  if (overviewEl) {
    overviewEl.textContent =
      (overviewText || '視聴中の配信はありません。') +
      backfillLine + laneLine + voiceLine + reportPreviewLine + giftEffectLine + milestoneEffectLine + customSoundLine + voiceEffectLine + bgmPhaseLine + opSoundEffectLine + commentPostLine + instantPushLine + writeLedgerLine + prunePublishLine + channelSwitchLine + autoTabReloadLine + highlightLedgerLine + scoreAnnounceLine;
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
      // v0.1.1242: 自動公開の明示同意(既定OFF)。ボタンの直下に置く。
      const consentEl = buildAutoPublishConsentToggle();
      if (consentEl) livesEl.appendChild(consentEl);
      // v0.1.1245: 共有キーの設定欄(ビルドに焼き込まないための入口)。未設定なら開いて出る。
      livesEl.appendChild(buildUploadConfigEditor());
    } else {
      // v0.1.868: 「スムーズじゃない」対策。配信カードは 2 秒ごとに innerHTML 全再構築+<img>再生成で
      //   サムネが毎回チラつき重い。表示に効く値だけの軽い signature を作り、変化が無ければ再構築を
      //   丸ごと skip(描画/画像再取得を止める)。値が動いた時だけ作り直す。
      /*
       * ★v0.1.1320: signature から `elapsedSec`(経過【秒】)を外し、【分】に丸めて入れる。
       *
       * ■ 何が起きていたか(2026-08-10 実測)
       *   上のコメントが「2秒ごとの innerHTML 全再構築+<img>再生成を止める」と書いている
       *   その guard の signature に、配信中ずっと増え続ける `elapsedSec` が入っていた。
       *   ＝**guard が一度も効かない**。止めたかった再構築がそのまま起き続けていた
       *   (カード1枚30〜60要素・サムネ <img> 再生成つき)。自分で自分の対策を無効化していた。
       *
       * ■ 分に丸めてよい根拠
       *   カードの表示は「経過 2:01:00」＝**分単位**(buildChikuranHeaderEl)。
       *   秒精度は画面に出ないので、signature に秒を持つ理由が無い。
       *   分に丸めれば「表示が変わるとき」だけ再構築＝コメントの意図どおりになる。
       *   ★`null`(未取得)は 'x' に落として 0分 と区別する(未取得→0分の誤判定を防ぐ)。
       */
      // v0.1.869: 応援者データ(reportPreview)の変化も署名に含める＝届いたらカードを作り直す。
      const sig = buildLivesCardSignature(livesData, {
        liveId: reportPreview?.liveId,
        topSupportersLength: Array.isArray(reportPreview?.topSupporters)
          ? reportPreview.topSupporters.length
          : 0
      });
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
        // v0.1.1242: 自動公開の明示同意(既定OFF)。何が送られるかを明記して選ばせる。
        const consentEl = buildAutoPublishConsentToggle();
        if (consentEl) card.appendChild(consentEl);
        // v0.1.1245: 共有キーの設定欄(ビルドに焼き込まないための入口)。未設定なら開いて出る。
        card.appendChild(buildUploadConfigEditor());

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
  safeSection('対処候補', () => renderActionCards({ livesData, fastDiag, popupDiag, reportPreview, trendFindings, giftEffectDiag, milestoneEffectDiag }));

  // 健全度パネル(ファーストビュー・正常100/異常だけ色・対象外は—)
  //   v0.1.894: 会場モード読み上げセル(タイミング・抜け漏れ)を出すため voiceDiag も渡す。
  //   ★v0.1.1362: backfillLiveMetric を渡す=「取り込み律速」セルの入力。
  //     渡し忘れると判定はあるのにセルが na のまま=配線されていない片肺になる。
  /*
   * ★v0.1.1395: v1390 で足した特化セル5種の入力を【実際に渡す】。
   *   渡していなかったので、registry にもテストにも居るのに
   *   実機では4つが出ていなかった(作っただけ=同じ穴を自分でまた作った)。
   *   → [[unwired-judgement-is-systemic-2026-08-12]]
   */
  const _popupSnapForCells = popupDiag?.popup ?? popupDiag;
  const _liveElapsedMs = (() => {
    // 「取得中」が詰まりかどうかは配信の経過時間で決まる(giftAdPipelineCensus)。
    const openedAt = Number(livesData?.[0]?.openTime || livesData?.[0]?.startedAt || 0);
    return openedAt > 0 ? Math.max(0, Date.now() - openedAt) : 0;
  })();
  const _mirrorAgeMs = (() => {
    const cap = Number(laneMirror?.capturedAt || 0);
    return cap > 0 ? Math.max(0, Date.now() - cap) : 0;
  })();
  /*
   * ★v0.1.1412: 取得経路の履歴を更新して保存する。
   *
   *   ★これが無いと「先週は embedded-data だった」を誰も覚えず、
   *     降格(=ニコ生が構造を変えた)を**永久に検出できない**。
   *   ★書き込みは値が変わったときだけ(毎回書くと storage 競合を自分で増やす。
   *     今セッションで「診断が重い」の真因が**書き込み競合**だと実測済み)。
   */
  safeSection('取得経路の記録', () => {
    const st = fromStorable(_sourceProvenanceStored);
    for (const lv of livesData) {
      if (!lv) continue;
      noteSource(st, { field: 'viewerCount', source: lv.viewerCountSource, at: Date.now() });
    }
    const next = toStorable(st);
    const prevJson = JSON.stringify(_sourceProvenanceStored || {});
    const nextJson = JSON.stringify(next);
    if (nextJson === prevJson) return; // 変化なし=書かない
    _sourceProvenanceStored = next;
    chrome.storage.local.set({ [KEY_SOURCE_PROVENANCE]: next }).catch(() => { /* 保存失敗は無害 */ });
  });

  safeSection('健全度パネル', () => renderHealthCells({
    livesData, fastDiag, popupDiag, voiceDiag, venueSeatsDiag, laneDiag,
    giftEffectDiag, milestoneEffectDiag, previewRenderAck, laneMirror, backfillLiveMetric,
    // ★v0.1.1395 追加分(特化セル5種の入力)
    commentPostDiag: _extrasCache?.commentPostDiag ?? null,
    instantPushDiag: _extrasCache?.instantPushDiag ?? null,
    /*
     * ★v0.1.1403「無音で死ぬ」セルの入力(silentFailureCells.js)。
     *   ★どれも extras(12秒間引き)で **既に読んでいる** 値なので storage 読み取りは増えない。
     *   ★ここへ足し忘れると registry・純関数・test を作っても **画面に出ない**
     *     (v0.1.1390 で実際に4セルが出なかった穴。ゲートが赤くなるので気づける)。
     */
    customSoundDiag,
    /*
     * ★v0.1.1404: ビルドの古さセル(buildAgeCell.js)の入力。
     *   NL_BUILD_ID はビルド時に埋め込まれる定数(識別子は残らない)。
     *   ★ここで渡さないとセルが永久に na になる=「登録したのに出ない」の再演。
     */
    /*
     * ★v0.1.1408: 操作音/BGM セル(finalDetailCells.js)の入力。
     *   どちらも extras(12秒間引き)で既に読んでいる=storage 読み取りは増えない。
     */
    opSoundEffectDiag,
    bgmPhaseDiag,
    // ★v0.1.1412: 取得経路の履歴(降格＝ニコ生の構造変更の予兆 を判定する材料)
    sourceProvenanceStored: _sourceProvenanceStored,
    buildId: typeof NL_BUILD_ID !== 'undefined' ? NL_BUILD_ID : '',
    appVersion: (() => {
      try { return String(chrome.runtime.getManifest()?.version || ''); } catch { return ''; }
    })(),
    mainThreadBlocker: _popupSnapForCells?.mainThreadBlocker ?? null,
    liveElapsedMs: _liveElapsedMs,
    // ★v0.1.1396: 会場が「いま」開いているかは、古い venueSeatsDiag ではなく
    //   【鏡の新しさ】で判断する(鏡は会場が開いている間だけ更新され続ける)。
    //   古い snap の enabled を使うと、11日前の化石値で「開いている」と誤判定する。
    venueOpen: _mirrorAgeMs > 0 && _mirrorAgeMs < 180_000,
    venueMirrorAgeMs: _mirrorAgeMs,
    venueTiers: {
      link: laneMirror?.link?.length || 0, gift: laneMirror?.gift?.length || 0,
      ad: laneMirror?.ad?.length || 0, konta: laneMirror?.konta?.length || 0,
      tanu: laneMirror?.tanu?.length || 0
    },
    venueHasGiftData: Number(fastDiag?.content?.giftDiagnostics?.['北極星レーン']?.['1_貢献度ランキング']?.apiRows || 0) > 0
  }));

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
  // 第1段(council/liveview-wholesale-root-SYNTHESIS.md): 全鏡は【この1回の描画ループ】で束ねて1枚にする。
  //   純Web側が「全レーン揃って・1回だけ鮮度判定」できるよう、統合スナップショットの基準時刻を1つ明示で打つ。
  //   ★基準時刻は now ではなく【各鏡 capturedAt の最大(=最も新しく popup が描いた瞬間)】にする。now にすると
  //     popup を17分開いていなくても「常に新鮮」と偽ってしまう。最大なら「データが本当はいつのものか」を誠実に表す。
  const _snapshotCapturedAt = Math.max(
    0,
    Number(laneMirror?.capturedAt) || 0,
    Number(statCardsMirror?.capturedAt) || 0,
    Number(northStarMirror?.capturedAt) || 0,
    Number(commentTimelineMirror?.capturedAt) || 0,
    Number(giftHistoryMirror?.capturedAt) || 0,
    Number(roomHeatMirror?.capturedAt) || 0,
    Number(sessionSummaryMirror?.capturedAt) || 0
  );
  const jsonBlob = {
    generatedAt: new Date().toISOString(),
    // 純Web(app/live-view)が per-section ではなく「丸ごと1枚」で鮮度判定するための統合基準時刻
    //   (鏡がまだ一度も無いなら 0=純Web側は「時刻不明=とりあえず出す」にフォールバック)。
    snapshotMeta: { capturedAt: _snapshotCapturedAt },
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
      : null,
    // 第2段(council/liveview-wholesale-root-SYNTHESIS.md): コメントタイムライン鏡(最新N件)。純Webで
    //   「コメントが進む動き」を出す。popup が KEY_COMMENT_TIMELINE_MIRROR へ publish→ここで相乗り→純Webが貼る。
    commentTimelineMirror: commentTimelineMirror || null,
    // ③WEB投げ一覧丸写し(第2号・reference_full_mirror_SYNTHESIS.md B2-5): 北極星 giftHistory レーン
    //   (貢献者 rooms + 個別投げ明細 ledgerRows)の鏡。popup が KEY_GIFT_HISTORY_MIRROR へ publish→
    //   extras(12秒間引き)で読む→ここで相乗り→純Web③が本物 lib(strip + ledger table)で描く。
    //   R-1: HTML は載せない=データ行を運ぶ(③で escapeHtml 済み lib が HTML 化)。
    giftHistoryMirror: giftHistoryMirror || null,
    // ③WEB室温丸写し(第4号・reference_full_mirror_SYNTHESIS.md M3): 室温(直近5分の応援増加=件数/人数/
    //   熱度%/文言)の鏡。popup が KEY_ROOM_HEAT_MIRROR へ publish→extras(12秒間引き)で読む→ここで相乗り→
    //   純Web③が①と同じ描画(renderRoomHeatSummary 相当)で描く。数値4個+文言のみ=最軽量(R-1 遵守・HTML 無し)。
    roomHeatMirror: roomHeatMirror || null,
    // ③WEB記録サマリ推移丸写し(第5号・reference_full_mirror_SYNTHESIS.md M5): 記録サマリの推移(この放送・
    //   約1分ごとのサンプル最大24行)の鏡。popup が KEY_SESSION_SUMMARY_MIRROR へ publish→extras(12秒間引き)で
    //   読む→ここで相乗り→純Web③が本物 lib(buildSessionSummaryCompareTableHtml)で描く。
    //   R-1: HTML は載せない=数値行を運ぶ(③で escapeHtml 済み lib が HTML 化)。24行≈5KB でコンパクト。
    sessionSummaryMirror: sessionSummaryMirror || null
  };
  // 自己診断の「いま視聴中の lv」= 鏡(北極星/lane/数字)の liveId を優先採用(read を増やさない)。
  const currentLiveId = String(
    northStarMirror?.liveId || laneMirror?.liveId || statCardsMirror?.liveId || ''
  );

  // ③WEB配信採点丸写し(第3号・reference_full_mirror_SYNTHESIS.md M2・路線2): status 既読の5値から①と同じ
  //   純lib(buildBroadcastScorePanelViewModel)で view-model を組み、jsonBlob に載せる。③は
  //   buildBroadcastScorePanelHtml を呼ぶだけ(VM ロジックは①と1回で共有)。
  //   ★VM が liveId 未一致/鮮度落ち/未観測で null を返す設計(空パネルにしない)なので null なら載せない。
  //   ★VM 戻りは構造化データのみ(score/radar/highlights)=innerHTML 行きの HTML 文字列は含まない(R-1 遵守)。
  //   liveId は鏡優先→無ければ reportPreview.liveId にフォールバック(VM 側でも previewRec.liveId と突合される)。
  const scoreLiveId = currentLiveId || String(reportPreview?.liveId || '');
  const broadcastScoreVm = scoreLiveId
    ? buildBroadcastScorePanelViewModel({
        liveId: scoreLiveId,
        nowMs: Date.now(),
        previewRec: reportPreview,
        phaseStats: bgmPhaseDiag,
        giftDiag: giftEffectDiag,
        voiceDiag,
        ledger: highlightLedger && typeof highlightLedger === 'object' ? highlightLedger : null
      })
    : null;
  if (broadcastScoreVm) jsonBlob.broadcastScoreVm = broadcastScoreVm;

  const publishKeys = getUploadConfig();

  // AI 共有用テキスト
  let fullText = '';
  safeSection('AI共有テキスト', () => {
    fullText = buildAiShareFullText({ overviewText, livesData, fastDiag, popupDiag, voiceDiag, venueSeatsDiag, laneDiag, laneMirror, reportPreview, trendFindings, jsonBlob, currentLiveId, publishKeys, publishOutcomeRec, previewRenderAck, refreshPerf, renderSectionMs, giftEffectDiag, milestoneEffectDiag, customSoundDiag, voiceEffectDiag, bgmPhaseDiag, opSoundEffectDiag, commentPostDiag, instantPushDiag, channelSwitchDiag, highlightLedger, scoreAnnounceDiag, sidepanelSelfDiag, extrasAgeMs });
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      document.getElementById('aiShareText')
    );
    if (ta && ta.value !== fullText) ta.value = fullText;
  });

  // ②応援ライブビュー/③WEB に①と【全く同じフル状態速報】を出すため、status が組み立てた本文(fullText)を
  //   jsonBlob に1フィールド同梱する。②③は再構築せず【これを貼るだけ】=①とバイト一致(drift ゼロ)。
  //   2026-06-29(HANDOFF-resume-0629 §3 (A)(B)): 描画だけでなく自己診断まで②③で見せるのがゴール。
  jsonBlob.statusReport = fullText;
  _lastRenderedBundle = {
    overview: overviewText,
    lives: livesData,
    textBlob: fullText,
    jsonBlob
  };
  // v0.1.1222: 共有ボタンが「この本文はいつのものか」を言えるようにする(黙って古い値を渡さない)。
  _lastRenderedAtMs = Date.now();
  // 応援ライブビュー(拡張内 live-view.html)の「このURLをWEBでも公開する」用に、いま組み立てた
  //   公開ペイロード(jsonBlob)+共有キーを storage へ置く。live-view ページは別ページで jsonBlob を
  //   持たないため、再構築せず【これを読んで POST するだけ】=status が送るものと byte 一致(drift ゼロ)。
  publishLiveViewPublishPayload(_lastRenderedBundle.jsonBlob);

  // v0.1.1016: ③WEB を古くする前に自動で再 publish(手動ボタンの往復を無くす)。
  //   ①POP・②応援プレビューは鏡が数秒ごとに新鮮化されるのに ③WEB だけ手押しで、押し忘れると常に 🟡 保留に
  //   なる。配信中(watch有)で最新 jsonBlob が組めているこの拍子に、古くなりかけたら1回だけ POST して 🟢 を保つ。
  //   判定は純関数 shouldAutoPublish(誤発射しない・無駄打ちしない)。実 POST は既存の uploadStatusSnapshot を再利用。
  maybeAutoPublishStatusSnapshot(livesData, publishOutcomeRec);

  // 次サイクルの自己診断(AI共有欄)に「renderAll 内のどのセクションが重いか」を出すため保持
  //   (整形側 formatRenderSectionMsLine が降順ソートするので、ここでは計測順のまま保持する)。
  _lastRenderSectionMs = _sectionMs.slice();
}

/**
 * v0.1.1016: 自動 publish の一手。判定(shouldAutoPublish)に通れば uploadStatusSnapshot を fire-and-forget で1回呼ぶ。
 *   - watch 有・キー有・payload 有・非送信中で、前回送信から一定時間経過(or 未送信)のときだけ送る。
 *   - 送信結果は uploadStatusSnapshot 内で globalThis+storage に記録される=次回の判定材料になる。
 *   - best-effort: 失敗しても status を止めない(次の描画ループで再試行される)。
 * @param {any[]} livesData
 * @param {{ at?: number }|null|undefined} publishOutcomeRec
 */
function maybeAutoPublishStatusSnapshot(livesData, publishOutcomeRec) {
  try {
    const { ingestKey, viewToken } = getUploadConfig();
    const hasWatchTab = Array.isArray(livesData) && livesData.some((l) => l && l.recording);
    const outcome = summarizeLiveviewPublishOutcomeRecord(publishOutcomeRec || null, Date.now());
    const decision = shouldAutoPublish({
      // ★v0.1.1242: 明示同意(既定OFF)が最優先ゲート。未同意なら他が揃っていても送らない。
      optedIn: _webPublishOptIn === true,
      hasKeys: Boolean(ingestKey && viewToken),
      hasPayload: Boolean(_lastRenderedBundle?.jsonBlob),
      hasWatchTab,
      inFlight: _autoPublishInFlight,
      everSent: outcome.everSent,
      lastSentAtMs: publishOutcomeRec && Number(publishOutcomeRec.at) > 0 ? Number(publishOutcomeRec.at) : 0,
      nowMs: Date.now()
    });
    if (!decision.publish) return;
    _autoPublishInFlight = true;
    void uploadStatusSnapshot().finally(() => {
      _autoPublishInFlight = false;
    });
  } catch {
    _autoPublishInFlight = false;
    /* best-effort: 自動 publish の失敗は status を止めない */
  }
}

/** 公開ペイロード書き込みの min-gap 計時(描画のたびに書くが頻度を抑える)。 */
let _liveViewPublishPayloadLastWriteAt = 0;
// Phase 1 MVP(2026-07-07・robust-architecture): 公開ペイロードの set 最小間隔[ms]。
//   3000→12000。KEY_LIVEVIEW_PUBLISH_PAYLOAD(0.5MB級)の onChanged ファンアウトが browser process の
//   storage/IPC を輻輳させ、無関係な postMessage 配達(13秒滞留)や入力まで巻き添えにする真犯人。
//   書込頻度を -75% に絞る(v0.1.1062 で read 頻度を下げただけで Chrome フリーズが緩和した実測前例と同型)。
const LIVEVIEW_PUBLISH_MIN_GAP_MS = 12000;
/** v0.1.1016: 自動 publish の多重送信防止フラグ(同時に2本 POST しない)。 */
let _autoPublishInFlight = false;
// 重さ根治 P4(2026-07-06): 直近 set 時のシグネチャ(buildLiveViewPublishSignature)。3秒 min-gap
//   通過後、内容が前回 set と同じなら約131KB級の chrome.storage.local.set を省略する。
let _liveViewPublishPayloadLastSig = '';
/** Phase 1 MVP: prune(容量削り)発動の累計回数。消す側にも計器を置く鉄則(story-userlane-churn-v1039)。 */
let _liveViewPublishPruneCount = 0;
/**
 * 応援ライブビュー(拡張内)から WEB 公開できるよう、最新の jsonBlob + 共有キーを storage へ置く。
 *   best-effort(失敗しても status を止めない)・3秒 min-gap。キー未設定ビルドでは置かない。
 *   重さ根治 P4: min-gap 通過後、内容が前回 set と同じシグネチャなら set 自体を省略する
 *   (min-gap 変数の更新条件・タイミングは無変更=set する分岐でのみ更新)。
 * @param {object} jsonBlob
 */
function publishLiveViewPublishPayload(jsonBlob) {
  try {
    const { ingestKey, viewToken, appOrigin } = getUploadConfig();
    if (!ingestKey || !viewToken || !jsonBlob) return; // キー未設定=公開不可=置かない
    const now = Date.now();
    if (now - _liveViewPublishPayloadLastWriteAt < LIVEVIEW_PUBLISH_MIN_GAP_MS) return;
    // Phase 1 MVP: min-gap 通過後・set 直前に容量 prune はしごを通す。上限超過ぶんだけ段階的に削り、
    //   削った内訳を snapshotMeta.pruned に残す=①vs③件数突合が「削ったから減った=正常」と判定でき
    //   嘘の🔴を出さない(地雷: lane-limit-200-mirror-cap-parity)。純関数=入力 jsonBlob は破壊しない。
    const { blob: publishBlob, pruned } = pruneLiveViewPublishBlob(jsonBlob, {
      maxBytes: LIVEVIEW_PUBLISH_MAX_JSON_BYTES
    });
    if (pruned.length) {
      _liveViewPublishPruneCount += 1;
      // 嘘をつかない: 削った事実を必ず載せる(自己診断が1行で見せる)。既存 snapshotMeta を壊さない。
      const meta = publishBlob.snapshotMeta && typeof publishBlob.snapshotMeta === 'object'
        ? { ...publishBlob.snapshotMeta }
        : {};
      meta.pruned = pruned;
      publishBlob.snapshotMeta = meta;
    }
    // シグネチャは【実際に置く publishBlob】で取る=prune 結果が変わったら set し直す。
    const sig = buildLiveViewPublishSignature(publishBlob);
    if (sig && sig === _liveViewPublishPayloadLastSig) return; // 変化なし=set 省略(min-gap 計時は更新しない)
    _liveViewPublishPayloadLastWriteAt = now;
    _liveViewPublishPayloadLastSig = sig;
    void safeStorageLocalSet({
      [KEY_LIVEVIEW_PUBLISH_PAYLOAD]: { jsonBlob: publishBlob, ingestKey, viewToken, appOrigin, savedAt: now }
    });
  } catch {
    /* no-op */
  }
}

/** Phase 1 MVP: prune 発動の累計回数を状態速報へ出すためのアクセサ(消す側の計器)。 */
export function getLiveViewPublishPruneCount() {
  return _liveViewPublishPruneCount;
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
  /*
   * ★v0.1.1388: 症状別判定も署名に入れる。
   *   入れないと「セルは同じだが症状別が変わった」paint が diff-skip で捨てられ、
   *   **足した判定が画面に永久に出ない**([[verify-output-appears-before-shipping-2026-08-09]])。
   *   ここは計器を足す版で必ず踏む穴なので、判定の生成を署名の前に置く。
   */
  const _popupSnapForSig = data?.popupDiag?.popup ?? data?.popupDiag;
  let _symptomSig = '';
  try {
    _symptomSig = buildSymptomVerdicts({
      identityAcquisition: _popupSnapForSig?.identityAcquisition || null,
      laneRenderProbe: _popupSnapForSig?.storyUserLaneRenderProbe || null,
      avatarLoadDiag: _popupSnapForSig?.avatarLoadDiag || null,
      updateMs: _lastRefreshPerf?.totalMs,
      popupAgeMs: popupSnapshotAgeMs(_popupSnapForSig)
    }).map((s) => `${s.id}:${s.level}`).join('~');
  } catch {
    _symptomSig = '';
  }
  /*
   * ★v0.1.1409(退化の修理): 署名から【毎秒変わる値】を外す。
   *
   * ■ 何が起きたか
   *   v0.1.1403〜1408 で 53→100 セルに増やした際、
   *   「◯秒前」「◯分経過」のような **時刻由来の文字列** を text に持つセルを
   *   多数足した。署名は text をそのまま含んでいたので、
   *   **中身が何も変わっていなくても毎tick 署名が変わる**。
   *   ＝ diff-skip が一度も効かず、19枠×100セル(約500 DOMノード)を
   *   **2秒ごとに全再構築**していた。ユーザー実機「診断タブが重すぎて開かない」。
   *
   * ★[[status-slow-correlates-with-record-count-2026-08-06]] の教訓どおり、
   *   重さの原因は件数ではなく **再構築の頻度**。
   *   ★[[timestamp-in-dedupe-key-double-counts-2026-08-10]] と同じ型＝
   *     「鍵に時刻を混ぜると毎回別物になる」。
   *
   * ■ 直し方: 署名は **level と数値** だけで作る(表示は従来どおり text を出す)。
   *   level が変われば必ず再描画されるので、**異常の見落としは起きない**。
   *   秒数の刻みだけが画面に反映されなくなるが、それは次の tick で追いつく。
   */
  const sig =
    `${v.level}|${v.text}|${_symptomSig}|` +
    cells.map((c) => `${c.id}:${c.level}:${c.kind === 'pct' ? c.value : ''}`).join('~');
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
    /*
     * ★v0.1.1388(ユーザー実機「診断の箇所が1つしかない」の根治):
     *   症状別判定(v0.1.1385 で新設)は **コピー本文(aiShareFullText.js)にしか配線されて
     *   おらず、この画面から一度も呼ばれていなかった**＝ユーザーの指摘は完全に正しい。
     *   私は「症状別判定を新設した」と報告したが、**画面上は存在していなかった**。
     *   → [[unwired-judgement-is-systemic-2026-08-12]] を書いた本人が同じ穴を作った。
     *
     *   ★掟(symptomVerdicts.js の JSDoc が正本):
     *     - 異常だけ出す(正常なら1行も出さない=ノイズを作らない)
     *     - 1行目に次の一手(読んで直せない判定は価値が低い)
     *     - 仕様上取れないもの(匿名のサムネ)を異常と呼ばない
     *   ＝**総合判定が緑でも、症状別が赤ならここに出る**のが本来の姿。
     */
    try {
      // 署名計算で既に解いた同じスナップショットを使う(二重に解かない・スコープも揃える)。
      const popupSnap = _popupSnapForSig;
      const verdicts = buildSymptomVerdicts({
        identityAcquisition: popupSnap?.identityAcquisition || null,
        laneRenderProbe: popupSnap?.storyUserLaneRenderProbe || null,
        avatarLoadDiag: popupSnap?.avatarLoadDiag || null,
        updateMs: _lastRefreshPerf?.totalMs,
        popupAgeMs: popupSnapshotAgeMs(popupSnap)
      });
      for (const sv of verdicts) {
        const row = document.createElement('div');
        row.className = `health-symptom hs-${sv.level}`;
        row.textContent = `${sv.level === 'bad' ? '🔴' : '🟡'} ${sv.symptom}: ${sv.line}`;
        row.title = sv.line;
        verdictHost.appendChild(row);
      }
    } catch {
      /* 症状別判定の失敗で総合判定まで消さない(画面を白くしない) */
    }
    /*
     * ★v0.1.1388(ユーザー実機「サムネイルとんでる」への回答を画面に出す):
     *   会場参加者が全員 匿名(a:) の配信では、**数値IDも個人サムネも仕様上存在しない**
     *   (identityAcquisitionCensus.js:19)＝ゆっくり顔で出るのが正しい挙動。
     *   ところがその理由は `identityAcquisition.line` に書いてあるのに
     *   **コピー本文にしか出ておらず、画面には一度も出ていなかった**
     *   ＝ユーザーには「サムネが飛んでいる不具合」にしか見えない。
     *   → [[symptom-owner-must-be-told-2026-08-12]](症状が出ている当の画面に出す)
     *
     *   ★ここは「直すのは表示ではなく説明」。挙動(ゆっくり顔)は正しいので変えない。
     *     赤くもしない(仕様上取れないものを異常と呼ばない)。
     */
    try {
      const idLine = String(_popupSnapForSig?.identityAcquisition?.line || '').trim();
      if (idLine) {
        const note = document.createElement('div');
        note.className = 'health-idnote';
        note.textContent = idLine;
        note.title = idLine;
        verdictHost.appendChild(note);
      }
    } catch {
      /* 説明行の失敗で画面を壊さない */
    }
  }
  host.replaceChildren();
  /*
   * ★v0.1.1389: 33セルを【症状の言葉】で枠に分ける。
   *
   * ■ ユーザーに何度も言わせた要望(これが本来の姿)
   *   「この枠をコメント関連・ID・サムネ・アカウント名・紐づけ関連などで
   *     区分して枠を増やしてほしい」
   *   従来は33セルが1枚の平坦なグリッドで、探している項目に辿り着けなかった。
   *   ★特に「ID・サムネ・名前」は uid-rate(record) / avatar(northstar) /
   *     venue-yukkuri-face(venue) と**3カテゴリに散っていた**=並べても集まらない。
   *
   * ■ ここでやらないこと(壊さないための境界)
   *   - セルの中身・判定・色は変えない(buildHealthCells の出力をそのまま描く)
   *   - diagnosisRegistry の category は変えない(完全性スコアの集計を壊さない)
   *   ＝**並べ替えと見出しだけ**の層。分類表は src/lib/healthCellGroups.js が正本。
   *
   * ★未知のセルは「その他」に落ちる(登録漏れでも画面から消えない)。
   */
  const groups = groupHealthCells(cells);
  for (const g of groups) {
    const sec = document.createElement('div');
    sec.className = 'hc-group';
    const head = document.createElement('div');
    head.className = 'hc-group-head';
    const title = document.createElement('span');
    title.className = 'hc-group-title';
    title.textContent = g.label;
    head.appendChild(title);
    // 異常件数を見出しに出す(枠が増えても異常を見落とさないため)。
    const sum = summarizeGroup(g.cells);
    if (sum.bad > 0 || sum.warn > 0) {
      const badge = document.createElement('span');
      badge.className = `hc-group-badge hcg-${sum.level}`;
      badge.textContent = sum.bad > 0 ? `要確認 ${sum.bad}` : `注意 ${sum.warn}`;
      head.appendChild(badge);
    }
    const hint = document.createElement('span');
    hint.className = 'hc-group-hint';
    hint.textContent = g.hint;
    head.appendChild(hint);
    sec.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'health-cells';
    for (const c of g.cells) {
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
      grid.appendChild(div);
    }
    sec.appendChild(grid);
    host.appendChild(sec);
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
    // v0.1.1054: ギフト/広告の検知はしたが投擲演出/効果音が出ていない取りこぼしを症状カードに昇格。
    //   aiShareFullText.js には既に配線済みだったが、status画面の対処候補パネル側は漏れていた(片翼統合)。
    try { cards.push(...giftEffectDiagToActionCards(data.giftEffectDiag)); } catch { /* no-op */ }
    // v0.1.1058: コメント数マイルストーンの検知はしたが演出/効果音が出ていない取りこぼしも同様に昇格。
    try { cards.push(...milestoneEffectDiagToActionCards(data.milestoneEffectDiag)); } catch { /* no-op */ }
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
/** ★v0.1.1320: マインドマップの diff-skip 用。変化が無ければDOMを触らず開いた枝を残す。 */
let _lastMindmapSig = '';

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
  /*
   * ★v0.1.1320: 中身が同じなら作り直さない(diff-skip)。
   *
   * ■ 何が起きていたか(2026-08-10 実測)
   *   ここには guard が【一つも無く】、2秒ごとに `host.innerHTML=''` で
   *   100〜200ノードの DOM を全消し→全再生成していた(SVG/canvasではなく純DOM)。
   *   ★さらに <details> ごと作り直すので、**ユーザーが開いた枝が2秒で閉じる**。
   *     「全部ひらく」を押しても2秒で元に戻る＝ms以前に「画面が言うことを聞かない」。
   *
   * ■ 直し方
   *   モデルを文字列化した署名で差分を取り、変化が無ければ**DOMに触らない**。
   *   ＝開いた枝はそのまま残る(ユーザー操作を壊さない)。
   *   署名はモデル(表示に出る値)そのものなので、表示が変わるときは必ず作り直される。
   */
  let sig = '';
  try {
    sig = JSON.stringify(model);
  } catch {
    sig = ''; // 署名を作れないときは従来どおり毎回描く(安全側)
  }
  if (sig && sig === _lastMindmapSig && host.firstChild) return;
  _lastMindmapSig = sig;
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
/**
 * ★v0.1.1242(CWS提出ブロッカー BLOCKING-1): 自動でWEB公開し続けることへの明示同意トグル。
 *
 * 既定OFF。ONにするまで自動送信は一切行わない(手動の共有ボタンは押した時点が同意なので別扱い)。
 * 送信内容には視聴者のユーザーID・表示名・コメント本文が含まれるため、何が送られるかを
 * ラベルに明記して選ばせる(privacy.html §4 と同じ内容を1行で示す)。
 * キー未設定ビルド(=ストア提出版)では公開機能そのものが無いので出さない。
 *
 * @returns {HTMLElement|null}
 */
/**
 * ★v0.1.1245: 共有キーの設定欄（折りたたみ）。**ビルドに焼き込まないための入口**。
 *
 * 旧実装はビルド時に `.env` の値を dist へ焼いていたが、`extension/dist/status.js` は
 * git 追跡下で公開リポジトリに push されており、書き込み認証キーが誰でも読めていた。
 * 鍵をローテーションしても次の push でまた漏れる構造だったので、
 * **利用者が自分の端末に入力して保存する**方式へ変えた（chrome.storage.local）。
 *
 * 未設定でも拡張の記録・表示は完全に動く（共有機能だけが出ない）。
 *
 * @returns {HTMLElement}
 */
function buildUploadConfigEditor() {
  const cfg = getUploadConfig();
  const details = document.createElement('details');
  details.style.cssText =
    'margin-top:8px;padding:6px 8px;border-radius:6px;font-size:11px;line-height:1.5;' +
    'border:1px solid var(--nl-border);background:var(--nl-card-bg);';
  // 未設定なら開いた状態で出す（何をすればいいか一目で分かる）
  details.open = !(cfg.ingestKey && cfg.viewToken);

  const summary = document.createElement('summary');
  summary.style.cssText = 'cursor:pointer;font-weight:600;';
  summary.textContent = cfg.ingestKey && cfg.viewToken
    ? '🔑 WEB共有の設定（設定済み）'
    : '🔑 WEB共有の設定（未設定＝共有機能は使えません）';
  details.appendChild(summary);

  const note = document.createElement('p');
  note.style.cssText = 'margin:6px 0;color:var(--nl-muted);';
  note.textContent =
    '記録をスマホや他の人に見せる「WEB共有」を使うときだけ必要です。空のままでも記録・表示は問題なく動きます。' +
    'この値はこのPCの中だけに保存され、外部には送られません。';
  details.appendChild(note);

  /** @param {string} label @param {string} value @param {string} hint */
  const field = (label, value, hint) => {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:block;margin:6px 0;';
    const cap = document.createElement('span');
    cap.style.cssText = 'display:block;margin-bottom:2px;';
    cap.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = hint;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.style.cssText =
      'width:100%;padding:4px 6px;border-radius:4px;font-size:11px;font-family:monospace;' +
      'border:1px solid var(--nl-border);background:var(--nl-bg);color:var(--nl-fg);';
    wrap.appendChild(cap);
    wrap.appendChild(input);
    details.appendChild(wrap);
    return input;
  };

  const ingestInput = field('書き込みキー（x-share-key）', cfg.ingestKey, '未設定');
  const tokenInput = field('閲覧トークン（URLの ?v=）', cfg.viewToken, '未設定');
  const originInput = field('送信先（通常は変更不要）', cfg.appOrigin, DEFAULT_APP_ORIGIN);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:6px;';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = '保存';
  saveBtn.style.cssText =
    'padding:4px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;' +
    'border:1px solid var(--nl-accent);background:var(--nl-card-bg);color:var(--nl-accent);';
  const result = document.createElement('span');
  result.style.cssText = 'color:var(--nl-muted);';
  saveBtn.addEventListener('click', async () => {
    await setUploadConfig({
      ingestKey: ingestInput.value,
      viewToken: tokenInput.value,
      appOrigin: originInput.value
    });
    const now = getUploadConfig();
    result.textContent = now.ingestKey && now.viewToken
      ? '✅ 保存しました（画面を更新すると共有ボタンが出ます）'
      : '保存しました（未設定＝共有機能は出ません）';
  });
  row.appendChild(saveBtn);
  row.appendChild(result);
  details.appendChild(row);
  return details;
}

function buildAutoPublishConsentToggle() {
  const { ingestKey, viewToken } = getUploadConfig();
  if (!ingestKey || !viewToken) return null; // キー未設定=公開機能なし=出さない
  const wrap = document.createElement('label');
  wrap.style.cssText =
    'display:flex;align-items:flex-start;gap:6px;margin-top:8px;padding:6px 8px;border-radius:6px;' +
    'font-size:11px;line-height:1.5;cursor:pointer;border:1px solid var(--nl-border);background:var(--nl-card-bg);';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = _webPublishOptIn === true;
  cb.style.cssText = 'margin-top:2px;flex:0 0 auto;cursor:pointer;';
  const text = document.createElement('span');
  text.textContent =
    '配信中、この画面の内容(視聴者のID・表示名・コメント本文を含みます)を2分ごとに自動でWEBへ公開する。' +
    'OFFのあいだは自動送信しません(「🔗 WEBサイトURLで共有」を押したときだけ送信します)。';
  cb.addEventListener('change', () => {
    void setWebPublishOptIn(cb.checked === true);
  });
  wrap.appendChild(cb);
  wrap.appendChild(text);
  return wrap;
}

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
  // v0.1.1003 ★記録>本家の誤検知根治: 「本家コメ(statistics.comments)が新鮮か」の判定には、
  //   コメント取り込み時刻(lastIngestAgoMs)ではなく【公式統計が最後に更新された時刻】を使う。
  //   両者は別クロック=コメントは毎秒来る(lastIngest=0秒前)が公式統計は遅延更新で数分古いことが
  //   あり、従来は「0秒前=新鮮」と誤認して『遅延では説明できない』要確認を誤発火していた。
  //   snapshot.officialCommentStatsUpdatedAt(content の stats.comments 更新時刻)から齢を出す。
  const officialCommentStatsUpdatedAt =
    numOrNull(s?.officialCommentStatsUpdatedAt) ?? numOrNull(snap?.officialCommentStatsUpdatedAt);
  const officialCommentStatsAgeMs =
    officialCommentStatsUpdatedAt && officialCommentStatsUpdatedAt > 0
      ? Math.max(0, Date.now() - officialCommentStatsUpdatedAt)
      : null;
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
    /*
     * ★v0.1.1412: 視聴者数を「どの経路で取れたか」。
     *   content-entry が既に付けている値('ws'|'embedded'|'dom'|'none')をそのまま運ぶ。
     *   embedded(JSON) → dom(画面文字) へ落ちたら**ニコ生が構造を変えた予兆**として鳴らす
     *   (判定は sourceProvenance.js)。ここで落とすと計器が永久に鳴らない。
     */
    viewerCountSource: snap?.viewerCountSource,
    recordedCount,
    officialCommentCount,
    officialRatePct,
    watchCount,
    adPoints,
    giftPoints,
    elapsedSec,
    capturedAt,
    lastIngestAgoMs,
    // v0.1.1003: 公式統計の鮮度(本家コメが新鮮か=遅延で記録超を説明できるかの正しいクロック)。
    officialCommentStatsAgeMs,
    // v0.1.1007: 記録>本家(要確認)の「焼き付き vs 本家遅延」を時系列で切り分ける材料(panel_summary に既にある)。
    //   窓内で 本家Δ ≈ 記録Δ なら母数差/遅延、本家Δ≪記録Δ なら記録の過剰増(二重)。新規 read ゼロ。
    officialStatisticsCommentsDelta: numOrNull(s?.officialStatisticsCommentsDelta),
    officialReceivedCommentsDelta: numOrNull(s?.officialReceivedCommentsDelta),
    officialCommentSampleWindowMs: numOrNull(s?.officialCommentSampleWindowMs),
    perfDiag: diag,
    endedAt,
    // v0.1.855: マインドマップ「記録中の配信」は lv.recording を数えるが、従来 summarizeOneLive は
    //   この field を返しておらず【常に 0 件】と誤報していた(累計13,708件あるのに「記録中0件」=
    //   self-verifying 違反・ユーザー指摘)。配信中(endedAt 無し=列挙された視聴中タブ)を記録中とみなす。
    recording: !endedAt
  };
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
 * 共有キーのアップロード設定。**ビルドには一切焼き込まない**(v0.1.1245)。
 *
 * ★2026-08-03 の事故: 旧実装はビルド時 define(scripts/build.mjs の statusDefine)で
 *   `.env` の値を dist に焼き込んでいた。`extension/dist/status.js` は git 追跡下で
 *   **公開リポジトリに push されていた**ため、`ingestKey`(=/api/status の【書き込み】認証)が
 *   誰でも読める状態だった。CRX を展開されるまでもなく GitHub で読めた。
 *   鍵をローテーションしても、次のビルド+push で新しい鍵がまた公開される構造だったため、
 *   **鍵をバンドルに載せない**方式へ変更した。
 *
 *   保存先は chrome.storage.local(拡張専用領域・他サイトや他拡張から読めない)。
 *   利用者が設定欄に一度入力すれば以後保持される。未設定なら公開機能は出ない
 *   (従来の「キー未設定ビルド」と同じ挙動なので、呼び出し側は不変)。
 *
 *   ★同期で読めるようメモリにキャッシュする(呼び出しが6箇所あり、描画経路から
 *   同期的に呼ばれるため)。storage 読みは bootstrap で1回だけ(コアread を増やさない)。
 */
const KEY_STATUS_UPLOAD_CONFIG = 'nls_status_upload_config_v1';
const DEFAULT_APP_ORIGIN = 'https://app.tsuioku-no-kirameki.com';

/** @type {{ ingestKey: string, viewToken: string, appOrigin: string }} */
let _uploadConfigCache = { ingestKey: '', viewToken: '', appOrigin: DEFAULT_APP_ORIGIN };

function getUploadConfig() {
  return _uploadConfigCache;
}

/** storage から共有キーを読み直してキャッシュする(失敗時は未設定=公開機能を出さない側に倒す)。 */
async function refreshUploadConfigCache() {
  try {
    // ★v0.1.1371: boot で await されるので必ず有界化する(理由は
    //   refreshWebPublishOptInCache のコメント参照=storage stall で init が止まり白紙になる)。
    const bag = await runStorageOpWithTimeout(
      () => chrome.storage.local.get(KEY_STATUS_UPLOAD_CONFIG),
      BOOT_STORAGE_TIMEOUT_MS
    );
    const raw = bag?.[KEY_STATUS_UPLOAD_CONFIG];
    const src = raw && typeof raw === 'object' ? raw : {};
    _uploadConfigCache = {
      ingestKey: String(src.ingestKey || '').trim(),
      viewToken: String(src.viewToken || '').trim(),
      appOrigin: String(src.appOrigin || '').trim() || DEFAULT_APP_ORIGIN
    };
  } catch {
    // fail-closed: 読めないなら未設定扱い(送信もURL提示もしない)
    _uploadConfigCache = { ingestKey: '', viewToken: '', appOrigin: DEFAULT_APP_ORIGIN };
  }
  return _uploadConfigCache;
}

/** 共有キーを保存してキャッシュも更新する。空文字で保存すれば公開機能を無効化できる。 */
async function setUploadConfig(next) {
  const src = next && typeof next === 'object' ? next : {};
  const value = {
    ingestKey: String(src.ingestKey || '').trim(),
    viewToken: String(src.viewToken || '').trim(),
    appOrigin: String(src.appOrigin || '').trim() || DEFAULT_APP_ORIGIN
  };
  _uploadConfigCache = value;
  try {
    await chrome.storage.local.set({ [KEY_STATUS_UPLOAD_CONFIG]: value });
  } catch {
    /* best-effort: 保存に失敗してもキャッシュは反映済み(次回起動で未設定に戻る=安全側) */
  }
  return value;
}

/**
 * 現在の jsonBlob を app の /api/status へ POST する。
 *   - host_permissions に app オリジンがあるため CORS 不要。
 *   - 成功時は閲覧 URL を返す。
 * @returns {Promise<{ ok: boolean, url?: string, error?: string }>}
 */
/**
 * 送信結果を【ページ横断 storage】に1件記録(best-effort)。globalThis 記録(recordLiveviewPublishOutcome)と
 *   併用し、status だけでなく拡張内 live-view から送ってもどちらのページからも読めるようにする(根2対策)。
 * @param {{ ok: boolean, httpStatus?: number|null, error?: string, liveId?: string }} outcome
 */
function persistLiveviewPublishOutcome(outcome) {
  try {
    const local = globalThis.chrome?.storage?.local;
    if (!local) return;
    const rec = buildLiveviewPublishOutcomeRecord({ ...outcome, at: Date.now() });
    void local.set({ [KEY_LIVEVIEW_PUBLISH_OUTCOME]: rec });
  } catch {
    /* best-effort: 記録失敗は送信を妨げない */
  }
}

async function uploadStatusSnapshot() {
  const { ingestKey, viewToken, appOrigin } = getUploadConfig();
  if (!ingestKey || !viewToken) {
    return { ok: false, error: 'キー未設定(この画面の「🔑 WEB共有の設定」で書き込みキーと閲覧トークンを入力してください)' };
  }
  const jsonBlob = _lastRenderedBundle?.jsonBlob;
  if (!jsonBlob) {
    return { ok: false, error: 'まだ送信できる状態がありません' };
  }
  // 送信した snapshot の対象 lv(鏡 liveId 優先)=送信結果記録に添える(別配信判定用)。
  const sentLiveId = String(
    jsonBlob?.northStarMirror?.liveId || jsonBlob?.laneMirror?.liveId || jsonBlob?.statCardsMirror?.liveId || ''
  );
  // 共有 URL 組み立ては純関数 buildStatusShareUrls(src/lib)に抽出済み(挙動同値・テストで固定)。
  const { statusUrl, liveViewUrl, ingestUrl } = buildStatusShareUrls(appOrigin, viewToken);
  try {
    const res = await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-share-key': ingestKey },
      body: JSON.stringify({ ...jsonBlob, v: viewToken })
    });
    if (!res.ok) {
      // POST 失敗を globalThis + storage 両方に記録=どのページからも「純Webが古い」を検知できる。
      recordLiveviewPublishOutcome({ ok: false, httpStatus: res.status, error: `送信失敗 (HTTP ${res.status})`, at: Date.now() });
      persistLiveviewPublishOutcome({ ok: false, httpStatus: res.status, error: `送信失敗 (HTTP ${res.status})`, liveId: sentLiveId });
      return { ok: false, error: `送信失敗 (HTTP ${res.status})` };
    }
    recordLiveviewPublishOutcome({ ok: true, httpStatus: res.status, at: Date.now() });
    persistLiveviewPublishOutcome({ ok: true, httpStatus: res.status, liveId: sentLiveId });
    // 状態速報の Web 版(概要+配信一覧)と、応援ライブビューの Web 版(popup そっくりの応援レーン)の両方の URL を返す。
    return {
      ok: true,
      url: statusUrl,
      liveViewUrl
    };
  } catch (err) {
    recordLiveviewPublishOutcome({ ok: false, httpStatus: null, error: '通信エラー: ' + String(err?.message || err), at: Date.now() });
    persistLiveviewPublishOutcome({ ok: false, httpStatus: null, error: '通信エラー: ' + String(err?.message || err), liveId: sentLiveId });
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
      // v0.1.975: navigator.clipboard 失敗時も execCommand('copy') で実際にコピーする。
      const outcome = await copyTextWithFallback(shareUrl);
      copyBtn.textContent =
        outcome === 'clipboard' || outcome === 'execCommand'
          ? '✓ コピーしました'
          : '× コピー不可(手動で選択)';
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
      const flash = (msg, ms) => {
        btn.textContent = msg;
        setTimeout(() => { btn.textContent = label; }, ms);
      };
      const text = _lastRenderedBundle?.textBlob || '';
      if (!text) {
        // v0.1.975: 従来は無反応(if(!text) return)で「押しても何も起きない」と感じさせた。
        //   初回 refresh 前でも詰ませないよう、待ってから再取得する。
        flash('まとめ中…', 1200);
        try { await refresh({ timeoutMs: 12000 }); } catch { /* best-effort */ }
        const retry = _lastRenderedBundle?.textBlob || '';
        if (!retry) { flash('まだ読み込み中…もう一度押してください', 2500); return; }
      }
      const body = _lastRenderedBundle?.textBlob || '';
      // v0.1.975: navigator.clipboard 失敗時に「選択するだけ」で終わらず execCommand('copy') で
      //   実際にコピーする(council なし=実コードで原因特定: フォールバックが select 止まりだった)。
      const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('aiShareText'));
      const outcome = await copyTextWithFallback(body, { selectEl: ta });
      if (outcome === 'clipboard' || outcome === 'execCommand') {
        flash('コピーしました ✓', 1500);
      } else if (outcome === 'selected') {
        flash('選択しました→Ctrl+C', 2000);
      } else {
        flash('コピーできませんでした', 2000);
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
        // v0.1.1222: この本文がどれくらい古いかを、コピーする側にも受け取る側にも伝える。
        //   混雑時(実測: 更新に103秒)は数十秒前の凍った値が渡るのに「コピーしました ✓」としか
        //   出ておらず、古いと分からないまま判断に使われていた(2026-08-01 に実際に踏んだ)。
        //   古さ = 本文を組んでからの経過 + 組んだ時点で元データが古かったぶん。
        const ageSec =
          Math.max(0, Math.round((Date.now() - (_lastRenderedAtMs || Date.now())) / 1000)) +
          Math.max(0, Math.floor(_lastRenderedSourceStaleSec || 0));
        const banner = buildStatusCopyStaleBanner(ageSec);
        // v0.1.975: navigator.clipboard 失敗時も execCommand('copy') で実際にコピーする。
        const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('aiShareText'));
        const outcome = await copyTextWithFallback(banner + text, { selectEl: ta });
        const { label } = buildStatusCopyButtonLabel(outcome, ageSec);
        heroFlash(label, 3500);
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
      updateAutoRefreshMeta();
    });
  }
  hideDevDiagnosticsIfRelease();
}

// v0.1.857: 配布(release)ビルドでは「生診断JSON/全文共有ボタン/AI共有欄」を隠す。
//   これらは自分の viewerUserId・配信URL を含む開発用エクスポートなので本番ユーザーには出さない
//   (ユーザー方針「そもそも開発用なので release時は出さない」)。健全度パネル・総合判定・対処カードは
//   ID を漏らさずユーザーに有用なので残す。NL_RELEASE は esbuild define(NL_DEV_HOTRELOAD と同方式)。
/**
 * Phase C(2026-07-05・council/pachinko-ultimate-SYNTHESIS.md §5.1/§6): BGM設定パネル。
 *   トグル(既定OFF)+リーチ/フィーバー音量スライダー(上限0.30クランプ)。開発用パネルではないので
 *   hideDevDiagnosticsIfReleaseの対象外(常時表示)。
 */
function setupBgmSettingsPanel() {
  const toggle = /** @type {HTMLInputElement|null} */ (document.getElementById('bgmEnabledToggle'));
  const reachSlider = /** @type {HTMLInputElement|null} */ (document.getElementById('bgmVolumeReachSlider'));
  const feverSlider = /** @type {HTMLInputElement|null} */ (document.getElementById('bgmVolumeFeverSlider'));
  const reachValueEl = document.getElementById('bgmVolumeReachValue');
  const feverValueEl = document.getElementById('bgmVolumeFeverValue');
  if (!toggle || !reachSlider || !feverSlider) return;

  const BGM_VOLUME_MAX = 0.30;
  const BGM_REACH_DEFAULT = 0.12;
  const BGM_FEVER_DEFAULT = 0.15;
  const clamp = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(BGM_VOLUME_MAX, n)) : fallback;
  };

  void safeStorageLocalGet([KEY_BGM_ENABLED, KEY_BGM_VOLUME_REACH, KEY_BGM_VOLUME_FEVER]).then((bag) => {
    toggle.checked = isBgmEnabled(bag?.[KEY_BGM_ENABLED]);
    const reachV = clamp(bag?.[KEY_BGM_VOLUME_REACH], BGM_REACH_DEFAULT);
    const feverV = clamp(bag?.[KEY_BGM_VOLUME_FEVER], BGM_FEVER_DEFAULT);
    reachSlider.value = String(reachV);
    feverSlider.value = String(feverV);
    if (reachValueEl) reachValueEl.textContent = reachV.toFixed(2);
    if (feverValueEl) feverValueEl.textContent = feverV.toFixed(2);
  });

  toggle.addEventListener('change', () => {
    void safeStorageLocalSet({ [KEY_BGM_ENABLED]: toggle.checked });
  });
  reachSlider.addEventListener('input', () => {
    const v = clamp(reachSlider.value, BGM_REACH_DEFAULT);
    if (reachValueEl) reachValueEl.textContent = v.toFixed(2);
    void safeStorageLocalSet({ [KEY_BGM_VOLUME_REACH]: v });
  });
  feverSlider.addEventListener('input', () => {
    const v = clamp(feverSlider.value, BGM_FEVER_DEFAULT);
    if (feverValueEl) feverValueEl.textContent = v.toFixed(2);
    void safeStorageLocalSet({ [KEY_BGM_VOLUME_FEVER]: v });
  });
}

/**
 * v0.1.1067 開発用: 効果音試聴パネル。EFFECT_SOUND_VARIANT_PATHS/EFFECT_SOUND_PATHS(正本)を
 *   そのまま列挙し、実再生と同じ音量(defaultVolumeForEffectSoundKind)で鳴らす。release では
 *   hideDevDiagnosticsIfRelease が丸ごと隠す。
 */
function setupSoundPreviewPanel() {
  const list = document.getElementById('soundPreviewList');
  if (!list) return;
  /** @type {Array<[string, string]>} kind, path */
  const entries = [];
  for (const [kind, paths] of Object.entries(EFFECT_SOUND_VARIANT_PATHS)) {
    for (const p of paths) entries.push([kind, p]);
  }
  for (const [kind, p] of Object.entries(EFFECT_SOUND_PATHS)) {
    if (!entries.some(([, q]) => q === p)) entries.push([kind, p]);
  }
  /** @type {HTMLAudioElement|null} */
  let cur = null;
  for (const [kind, path] of entries) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:2px 0;font-size:12px';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '▶';
    btn.addEventListener('click', () => {
      try {
        if (cur) { try { cur.pause(); } catch { /* no-op */ } }
        const a = new Audio(chrome.runtime.getURL(path));
        a.volume = defaultVolumeForEffectSoundKind(kind);
        cur = a;
        void a.play().catch(() => {});
      } catch { /* 試聴失敗は無害 */ }
    });
    const label = document.createElement('span');
    label.textContent = `${path.replace('sound/', '')} 〔${kind}・音量${defaultVolumeForEffectSoundKind(kind)}〕`;
    row.append(btn, label);
    list.appendChild(row);
  }
}

/**
 * Phase A(2026-07-05) 開発用: マイ効果音差し替えパネル。
 *   council/pachinko-ultimate-SYNTHESIS.md §1.3 の取込UIを実装する:
 *     1. ファイル一括選択→ファイル名から No. をパース→プリセット表で自動割当(1クリック)。
 *     2. キーごとの割り当てリスト+▶試聴(実再生と同じ経路=blob URL)+gainスライダー。
 *     3. 「既定に戻す」=assignments の該当キー削除(合成音フォールバックへ)。
 *   トリム/加工UIは作らない(素材をそのまま鳴らす・設計書の絶対制約)。
 *   IndexedDB自体は release でも使えて構わない(音声データは常にユーザー端末内のみ)が、
 *   取込UI自体は開発用パネル扱い(hideDevDiagnosticsIfRelease が丸ごと隠す・既存踏襲)。
 */
function setupMyCustomSoundPanel() {
  const fileInput = document.getElementById('myCustomSoundFileInput');
  const importResult = document.getElementById('myCustomSoundImportResult');
  const statsEl = document.getElementById('myCustomSoundStats');
  const listEl = document.getElementById('myCustomSoundList');
  const localNoteEl = document.getElementById('myCustomSoundLocalNote');
  // 2026-07-05: ローカル自動同梱(scripts/install-local-sounds.mjs)の検出本数を注記する。
  //   取込UIは「上書き用」であることを明示し、手動取込が必須ではないことを伝える。
  if (localNoteEl) {
    // ★v0.1.1237: 共有 Promise 経由(loadCustomSoundDiagSafe と同じ1本を使う=二重fetch解消)。
    void loadLocalSoundManifestShared().then((manifestFiles) => {
      const n = manifestFiles ? Object.keys(manifestFiles).length : 0;
      localNoteEl.textContent = n > 0
        ? `ローカル同梱を検出(${n}本)。下の取込UIは上書き用です(未操作でも自動で鳴ります)。`
        : 'ローカル同梱は未検出です(npm run copy:ext で自動生成されます)。下の取込UIで手動取込できます。';
    }).catch(() => {
      localNoteEl.textContent = '';
    });
  }
  if (!fileInput || !listEl) return;
  if (typeof indexedDB === 'undefined') {
    if (importResult) importResult.textContent = 'この環境では IndexedDB が使えないため、マイ効果音は利用できません。';
    return;
  }

  /** @type {HTMLAudioElement|null} 試聴中の1本(切替時に前の再生を止める)。 */
  let curPreviewAudio = null;
  /** @type {Map<string, string>} 割当済みblobの表示用URL(パネルを開いている間だけ保持・リロードで消えてよい)。 */
  const previewUrlCache = new Map();

  const getDb = () => openCustomSoundDb();

  /** 統計行(取込件数/割当キー数/rev)を再描画する。診断ページ内の表示専用(extras計器はstatus側で別途集計)。 */
  async function renderStats() {
    if (!statsEl) return;
    try {
      const db = await getDb();
      const blobs = await listSoundBlobs(db);
      const assignments = await listAssignments(db);
      const bag = await chrome.storage.local.get(KEY_CUSTOM_SOUND_REV);
      const rev = Number(bag?.[KEY_CUSTOM_SOUND_REV]) || 0;
      statsEl.textContent = `取込済み: ${blobs.length}本 / 割当済みキー: ${assignments.length}/${CUSTOM_SOUND_PRESET_KEYS.length} / 世代(rev): ${rev}`;
    } catch {
      statsEl.textContent = '';
    }
  }

  /** キーごとの割り当てリストを再描画する(一度作ったDOMは使い回さず毎回作り直す=このパネルはON/OFF操作が主で高頻度更新ではないため許容)。 */
  async function renderList() {
    listEl.innerHTML = '';
    let db;
    try {
      db = await getDb();
    } catch {
      listEl.textContent = 'IndexedDB を開けませんでした。';
      return;
    }
    for (const key of CUSTOM_SOUND_PRESET_KEYS) {
      const preset = CUSTOM_SOUND_PRESET[key] || [];
      let assignment = null;
      try {
        assignment = await getAssignment(db, key);
      } catch {
        assignment = null;
      }
      const row = document.createElement('div');
      row.style.cssText = 'padding:6px 4px;border-top:1px solid rgba(128,128,128,0.25);font-size:12px';

      const head = document.createElement('div');
      head.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      const title = document.createElement('strong');
      title.textContent = key;
      const state = document.createElement('span');
      const assignedIds = Array.isArray(assignment?.ids) ? assignment.ids : [];
      state.textContent = assignedIds.length > 0
        ? `カスタム${assignedIds.length}本割当中`
        : `未割当(既定=${preset.length}本のプリセット候補あり)`;
      head.append(title, state);
      row.appendChild(head);

      if (assignedIds.length > 0) {
        const gainRow = document.createElement('div');
        gainRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:4px';
        const gainLabel = document.createElement('span');
        const gain = typeof assignment?.gain === 'number' ? assignment.gain : 1.0;
        gainLabel.textContent = `音量 ${gain.toFixed(2)}`;
        const gainSlider = document.createElement('input');
        gainSlider.type = 'range';
        gainSlider.min = '0';
        gainSlider.max = '1';
        gainSlider.step = '0.05';
        gainSlider.value = String(gain);
        gainSlider.addEventListener('change', () => {
          void (async () => {
            const d = await getDb();
            await setAssignment(d, key, assignedIds, Number(gainSlider.value));
            await bumpCustomSoundRev(safeStorageLocalRef());
            gainLabel.textContent = `音量 ${Number(gainSlider.value).toFixed(2)}`;
          })();
        });
        gainRow.append(gainLabel, gainSlider);
        row.appendChild(gainRow);

        for (const id of assignedIds) {
          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:2px';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = '▶';
          btn.addEventListener('click', () => {
            void (async () => {
              try {
                let url = previewUrlCache.get(id);
                if (!url) {
                  const d = await getDb();
                  const rec = await getSoundBlob(d, id);
                  if (!rec?.blob) return;
                  url = URL.createObjectURL(rec.blob);
                  previewUrlCache.set(id, url);
                }
                if (curPreviewAudio) { try { curPreviewAudio.pause(); } catch { /* no-op */ } }
                const a = new Audio(url);
                a.volume = typeof assignment?.gain === 'number' ? assignment.gain : 1.0;
                curPreviewAudio = a;
                void a.play().catch(() => {});
              } catch { /* 試聴失敗は無害 */ }
            })();
          });
          const idLabel = document.createElement('span');
          idLabel.textContent = id;
          btnRow.append(btn, idLabel);
          row.appendChild(btnRow);
        }

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.textContent = '既定に戻す';
        resetBtn.style.marginTop = '4px';
        resetBtn.addEventListener('click', () => {
          void (async () => {
            const d = await getDb();
            await clearAssignment(d, key);
            await bumpCustomSoundRev(safeStorageLocalRef());
            await renderList();
            await renderStats();
          })();
        });
        row.appendChild(resetBtn);
      }

      listEl.appendChild(row);
    }
  }

  /** ファイル選択→No.パース→プリセット自動割当(1クリック)。 */
  fileInput.addEventListener('change', () => {
    void (async () => {
      const files = Array.from(fileInput.files || []);
      if (files.length === 0) return;
      if (importResult) importResult.textContent = '取込中…';
      const noIndex = buildPresetNoIndex();
      /** @type {Map<string, string[]>} key → 変奏順に並べたid配列(insert中に組み立てる) */
      const byKey = new Map();
      let imported = 0;
      let unmatched = 0;
      try {
        const db = await getDb();
        for (const file of files) {
          const no = parseAudiostockNoFromFilename(file.name);
          if (no == null || !noIndex.has(no)) {
            unmatched += 1;
            continue;
          }
          const meta = noIndex.get(no);
          const id = presetIdForNo(no);
          await putSoundBlob(db, { id, blob: file, name: file.name, bytes: file.size, importedAt: Date.now() });
          const list = byKey.get(meta.key) || [];
          list[meta.variantIndex] = id;
          byKey.set(meta.key, list);
          imported += 1;
        }
        // 既存割当とマージ(同じ取込を2回に分けて行った場合でも欠番が埋まるように)。
        for (const [key, ids] of byKey.entries()) {
          const existing = await getAssignment(db, key);
          const merged = Array.isArray(existing?.ids) ? existing.ids.slice() : [];
          ids.forEach((id, idx) => { if (id) merged[idx] = id; });
          const compact = merged.filter((v) => typeof v === 'string' && v);
          await setAssignment(db, key, compact, existing?.gain);
        }
        if (byKey.size > 0) await bumpCustomSoundRev(safeStorageLocalRef());
        if (importResult) {
          importResult.textContent = `取込完了: ${imported}本を${byKey.size}キーに自動割当しました` +
            (unmatched > 0 ? `(未対応${unmatched}本はファイル名からNo.を特定できませんでした)` : '');
        }
      } catch {
        if (importResult) importResult.textContent = '取込中にエラーが発生しました。';
      }
      fileInput.value = '';
      await renderList();
      await renderStats();
    })();
  });

  // ★v0.1.1237(診断ページ初回12.6秒の根治): 従来はここで無条件に renderList/renderStats を
  //   発火していた。両者は IndexedDB を **全件走査**(listSoundBlobs=Blob本体込み・
  //   getAssignment の直列ループ)するため、同じ DB を軽量 count で読む extras
  //   (loadCustomSoundDiag)がその後ろで順番待ちし、初回 refresh が 12,607ms になっていた。
  //   実測: 1回目 12,610ms(extras 12,607 / render 3) → 2回目 5ms。
  //   ★このパネルは開発用(release非表示)なので、開いたときだけ読めば十分。
  const panelEl = document.getElementById('myCustomSoundPanel');
  const renderPanelOnce = () => {
    void renderList();
    void renderStats();
  };
  if (panelEl instanceof HTMLDetailsElement) {
    if (panelEl.open) renderPanelOnce(); // 既に開いている(前回状態の復元等)なら即描く
    else panelEl.addEventListener('toggle', () => { if (panelEl.open) renderPanelOnce(); });
  } else {
    renderPanelOnce(); // 入れ物が見つからない環境では従来どおり(挙動不変のfail-soft)
  }
}

function hideDevDiagnosticsIfRelease() {
  const isRelease = typeof NL_RELEASE !== 'undefined' && NL_RELEASE === true;
  if (!isRelease) return;
  // 共有エクスポート系(ID/URL を含む生データ)だけ隠す。健全度パネルは残す。
  const devOnlyIds = [
    'soundPreviewPanel', // 🔊 効果音試聴(開発用・v0.1.1067)
    'myCustomSoundPanel', // 🎛️ マイ効果音差し替え(開発用・Phase A・2026-07-05)
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
          /*
           * ★v0.1.1320: interval と同じガードを通す(この経路が全部迂回していた)。
           *
           * ■ 何が起きていたか(2026-08-10 実測)
           *   interval 側(startRefreshLoop)は4つのガードを持つ:
           *     _refreshPausedByUser / document.hidden / **_refreshInFlight(再入防止)** / backoff
           *   ★この listener は1つ目しか無く、`refresh()` を【直接】呼んでいた。
           *   content-entry は `nls_panel_summary_<lv>` を 2秒ごと/配信ごとに書くので、
           *   記録中は interval の2秒に【加えて】書き込みのたびに refresh が走り、
           *   しかも**再入を許す**。startRefreshLoop のコメントが
           *   「再入防止＝積み上がりを断つ」と書いた当のものを、この経路が無効化していた。
           *
           * ■ 直し方: 画面が見えていないなら描かない・前回が走っていれば重ねない。
           *   ★鮮度は落ちない(2秒 interval は従来どおり動く)。減るのは【重複した実行】だけ。
           */
          if (document.hidden) return;
          if (_refreshInFlight) return;
          _refreshInFlight = true;
          refresh()
            .catch(() => {})
            .finally(() => {
              _refreshInFlight = false;
            });
          return;
        }
      }
    });
  } catch {
    /* onChanged が無い環境では setInterval だけ稼働 */
  }
}
