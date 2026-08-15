// venueBar.js — 会場モード UI 本体。観客の席割り・群衆・吹き出し・ギフト演出・読み上げ連動を描く。
// v0.1.1287: combineCanonicalComeviewRows = チャンクとテールを commentNo で重複排除して合流する
//   純関数(comeview と同じ正本)。会場の発言パネルがテールを読むために使う。
import { isGenericComeviewName, combineCanonicalComeviewRows } from '../lib/comeviewRows.js';
import {
  applyVenuePickupView,
  buildVenuePickupView,
  createVenuePickupBanner
} from '../lib/venuePickupBanner.js';
import { pickTickerHighlightEntry } from '../lib/pickTickerHighlight.js';
import {
  buildVenueSeating,
  collectAudienceFaceUserIds,
  hasRealThumbnail,
  deriveNicoUserIconUrl,
  VENUE_FULLSCREEN_MAX_SEATS,
  venueRowsFromUserLaneCandidates
} from '../lib/venueSeats.js';
import { userLaneCandidatesFromStorage } from '../lib/userLaneCandidatesFromStorage.js';
import {
  KEY_LIVE_BROADCASTER_CTX,
  normalizeBroadcasterCtx,
  isBroadcasterCtxUsableForGuard
} from '../lib/broadcastContext.js';
import { readChunkedComments, chunkIndexKey, chunkStorageKey, isChunkIndex } from '../lib/commentChunkStore.js';
import { extractUserCommentRows, comeviewUserKeyForRow } from '../lib/comeviewActions.js';
import {
  createVenueOpenLatencyState,
  noteVenueOpened,
  noteVenueMirrorSettled,
  noteVenueAggregateSettled,
  noteVenueFirstPaint,
  summarizeVenueOpenLatency
} from '../lib/venueOpenLatency.js';
import { selectNewChunkSeqs, mergeUserLaneAggregates } from '../lib/venueIncrementalAggregate.js';
import {
  touchRoster,
  pruneRoster,
  rosterToVenueRows,
  hydrateRosterFromCandidates,
  VENUE_ROSTER_WINDOW_MS,
  VENUE_ROSTER_VIP_WINDOW_MS,
  VENUE_ROSTER_MAX_SEATS
} from '../lib/venueLiveRoster.js';
// 2026-07-30(wayfinder→to-spec方式・venue-avatar-hover-preview-SPEC.md §4.1): 会場アイコンの
//   ホバープレビューカード。純ロジック+DOMビルダーはここに切り出し済み(buildPersonTileEl等の
//   タイル正本は一切変更しない)。
import {
  readVenueTileThumbState,
  buildVenueHoverCardModel,
  createVenueHoverCardEl,
  renderVenueHoverCard,
  resolveVenueHoverCardPlacement,
  formatVenueHoverRelativeTime
} from '../lib/venueHoverCard.js';

/**
 * 会場の参加者ソース切替。
 *
 * v0.1.789 「レーンを鏡のように映す」へ統一(ユーザー指摘=本体のサムネを鏡映するのと同じく、会場は
 *   レーンをそのまま映せばよい): false にすると content inline 会場も standalone と同じ
 *   「レーン集約(userLaneCandidatesFromStorage→venueRowsFromUserLaneCandidates)を鏡映する」経路に
 *   統一される。
 *
 * 経緯: v0.1.754 で「3時間でも O(席数) 一定」の性能対策として content inline 会場だけを
 *   ストリーム駆動 roster(独自の在席 Map)に切り替えた。だが roster は ①userId 必須(ニコ生は匿名
 *   主体なので数値ID の人しか座らない) ②4分窓(VIP 15分・応援しても黙ると退席) のため、レーン
 *   (全セッション累積・サムネ持ちが並ぶ)と人が一致せず「レーンにいる応援者が会場にいない」乖離を
 *   生んだ。性能の心配は既に解決済み=レーン集約経路は v0.1.754 で【差分(新規 seq)だけ集約してマージ】
 *   = O(追加分)になっており、storage 変化時トリガ(near-realtime)+30秒 backstop で軽い。よって
 *   roster は不要な二重実装。レーン正本を鏡映する1経路に統一する(=会場は常にレーンと同じ人)。
 *
 * true に戻すと v0.1.754 のストリーム駆動 roster へロールバック可(キルスイッチ温存)。
 * standalone(venue.html)は onLiveComments が来ないため元から false 扱い(rosterDriven=!isStandalone と合成)。
 *
 * 正本(2026-06-17): 会場の参加者データ源は popup 応援アイコン列(renderStoryUserLane)と同一の
 *   純関数 userLaneCandidatesFromStorage。popup と会場の顔ぶれは一致するのが正(=この「鏡映」設計)。
 *   席資格(誰が座れるか)の正本は venueSeats.js#venueParticipantKey(userId あれば匿名も着席)。
 *   popup と会場で「誰を出すか」がズレたら、それは描画/表示間引き(visibleSeats)層のバグ=ここではない。
 */
const VENUE_ROSTER_ENABLED = false;
/**
 * 発言パネル(アイコンクリックで開く)に出す最大件数。新しい方から採る。
 * 上限を設けるのは、1配信で数百件しゃべる人がいてもパネルが実用的な長さに収まるようにするため。
 * 全件数は見出しに併記するので「切られた」ことは読み手に伝わる(黙って切らない)。
 */
const VENUE_SPEECH_PANEL_MAX = 200;
import { resolveDisplayRows } from '../lib/venueDisplayRows.js';
import { createVenueEntryQueue, VENUE_ENTRY_FLIGHT_MS } from '../lib/venueEntryQueue.js';
import { runStorageOpWithTimeout, STORAGE_OP_TIMED_OUT } from '../lib/storageOpTimeout.js';
import { buildVenueResidents } from '../lib/venueResidents.js';
import {
  commentDbSummaryKey,
  commentsStorageKey,
  KEY_USER_COMMENT_PROFILE_CACHE,
  KEY_EFFECT_SOUND_ENABLED,
  KEY_VENUE_EFFECT_SOUND_PRESENCE,
  KEY_CUSTOM_SOUND_REV,
  isEffectSoundEnabled,
  // Phase C(2026-07-05): BGM(リーチ/フィーバーループ)の既定OFFトグル+グループ別音量。
  KEY_BGM_ENABLED,
  KEY_BGM_VOLUME_REACH,
  KEY_BGM_VOLUME_FEVER,
  isBgmEnabled,
  // v0.1.1090: 個別ギフトイベント欠落配信のデルタ補完検知(giftDeltaFallback.js)向け。
  officialGiftPointsAggregateStorageKey
} from '../lib/storageKeys.js';
import {
  EFFECT_SOUND_KINDS,
  playEffectSound,
  effectSoundKindForGiftTier,
  EFFECT_SOUND_VARIANT_PATHS,
  EFFECT_SOUND_PATHS,
  defaultVolumeForEffectSoundKind
} from '../lib/effectSoundPlayer.js';
import { directHit, makeInitialComboState, GIFT_TIER_LADDER } from '../lib/effectDirector.js';
// Phase A(2026-07-05): マイ効果音差し替え(IndexedDB取込+割当)。起動時+customSoundRev変化時に
//   customVariantPaths を再構築し、playEffectSound の deps(variantPaths/paths/getUrl/rng/volume)へ
//   カスタム優先で注入する。effectSoundPlayer.js 自体は無改変。
import {
  loadCustomSoundRuntimeState,
  mergeVariantPaths,
  getUrlForCustomSound,
  rotationRngFor
} from '../lib/customSoundStore.js';
import { KEY_GIFT_EFFECT_DIAG } from '../lib/giftEffectDiagKey.js';
import {
  makeInitialGiftEffectDiag,
  buildGiftEffectDiagSnapshot,
  giftSoundDiagFieldForPlayResult,
  computeGiftGapAverage
} from '../lib/giftEffectDiag.js';
// Phase B(2026-07-05): パチンコボイス演出+歯止め(council/pachinko-ultimate-SYNTHESIS.md §4/§6)。
//   voiceGate=事象履歴の純関数(個別CD/上限+グローバル45秒CD+1配信20回+VOICEVOX発話中スキップ)。
//   再生は既存 playEffectSound+buildEffectSoundDeps 経由(カスタム未割当キーは no-path 無音=安全)。
import {
  makeInitialVoiceGateState,
  voiceGate,
  planJackpotChain,
  isUnassignedVoiceKey,
  resetVoiceGateStateForLiveIfChanged
} from '../lib/voiceDirector.js';
import { makeInitialVoiceEffectDiag, buildVoiceEffectDiagSnapshot, voiceSkipFieldForGateReason } from '../lib/voiceEffectDiag.js';
import { KEY_VOICE_EFFECT_DIAG } from '../lib/voiceEffectDiagKey.js';
// Phase C(2026-07-05): 物語弧の完成(council/pachinko-ultimate-SYNTHESIS.md §3/§5/§6)。
//   meterStateFor(既存M)→baselineFor(B)→R→phaseForの決定論ステートマシンでフェーズを進め、
//   遷移の瞬間だけR条件ボイス/BGMを発火する。effectSoundPlayer.js/voiceDirector.jsは無改変。
import { meterStateFor, makeInitialExcitementMeter } from '../lib/effectDirector.js';
import {
  baselineFor,
  rWithWarmup,
  phaseFor,
  makeInitialBaselineState,
  makeInitialPhaseState,
  PHASE
} from '../lib/phaseDirector.js';
import {
  createBgmRuntime,
  reachBgmDecision,
  makeInitialReachBgmState,
  feverBgmStart,
  feverBgmExtend,
  feverBgmShouldEnd,
  feverBgmStop,
  makeInitialFeverBgmState,
  reachLoopVariantIndex,
  feverLoopVariantIndex,
  clampBgmVolume,
  BGM_REACH_DEFAULT_VOLUME,
  BGM_FEVER_DEFAULT_VOLUME,
  FADE_MS
} from '../lib/bgmDirector.js';
import { makeInitialBgmPhaseDiag, buildBgmPhaseDiagSnapshot } from '../lib/bgmPhaseDiag.js';
import { KEY_BGM_PHASE_DIAG } from '../lib/bgmPhaseDiagKey.js';
// SC2(council/broadcast-scoring-SYNTHESIS.md §2.2): ハイライト台帳(実際に発火した演出だけ記録)。
import { appendHighlight, isHighlightWorthyKind } from '../lib/highlightLedger.js';
import { KEY_HIGHLIGHT_LEDGER } from '../lib/highlightLedgerKey.js';
// anonymousIdenticonDataUrl は P3(v0.1.1117)で venueLaneBuckets(①正本委譲)側へ移動=venueBar 直参照なし。
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { pickNewVenueSpeech, mergeSpeakersIntoVenueRows, liveFeedSpeechRows } from '../lib/venueSpeech.js';
import { isContextInvalidatedError } from '../lib/reportSilentError.js';
// v0.1.1080: マイ効果音・ボイス/BGM計器が直接 chrome.storage.local を叩くと、拡張リロード後の
//   古い会場レイヤーで同期 TypeError(chrome.storage が undefined)が uncaught のまま残る。
//   唯一の安全な入口に集約する(popup-entry.js と同じ helper を共有)。
import { safeStorageLocalGet, safeStorageLocalSet, safeStorageOnChangedAddListener } from '../lib/safeStorageLocal.js';
import {
  updateSpeechStreak,
  pruneSpeechStreaks,
  streakGlowStage,
  streakBubbleLifetimeMs,
  resolveBubbleFlowLifetimeMs
} from '../lib/venueSpeechStreak.js';
// 2026-07-21 診断先行(応援TOP吹き出しchurn実測計器): 生成頻度・寿命分布・強制退去を数えるだけ
//   (観測のみ・修正はしない・新規DOM走査やタイマーは追加しない)。
import {
  createVenueBubbleChurnState,
  observeVenueBubbleSpawn,
  observeVenueBubbleEviction,
  observeVenueBubbleRemoval,
  toVenueBubbleChurnDiag
} from '../lib/venueBubbleChurn.js';
import { enrichVenueRowsWithProfileAvatars } from '../lib/venueAvatar.js';
// v0.1.1118 鏡enrich(P4): ①が解決済みの顔URL(鏡displaySrc)を追加のenrich源にする(新規readゼロ)。
import { buildVenueMirrorAvatarMap, enrichVenueRowsWithMirrorAvatars } from '../lib/venueMirrorAvatarEnrich.js';
// ★KEY_LANE_MIRROR の契約(消費者登録簿・段別の不変条件)は src/lib/laneMirrorContract.js が正本。
//   会場は reader として登録済み。読み口は必ず acceptLaneMirrorSnapshot を通す(受け入れ点は2箇所)。
import { sanitizeLaneMirrorForRead } from '../lib/laneMirrorContract.js';
// ★v0.1.1318: アイコン未設定(404)の人を白丸でなく「その人ごとのゆっくり顔」にするため。
import { anonymousIdenticonDataUrl } from '../lib/anonymousIdenticon.js';
import {
  createVenueMirrorIntakeState,
  observeVenueMirrorChange,
  observeVenueMirrorAccept,
  formatVenueMirrorIntakeLine
} from '../lib/venueMirrorIntakeDiag.js';
// fallback 経路で「ギフト段が作れない」ことを正直に伝える文言(①③と同じ正本ファイル)。
import { buildVenueFallbackGiftEmptyNoteHtml } from '../lib/storyUserLaneGuideHtml.js';
// v0.1.1111 会場=①レーン鏡映(メンバー完全一致): ①の実paint鏡(KEY_LANE_MIRROR)を会場の正本に昇格。
//   設計正本=memory/reference_pop_venue_parity_SYNTHESIS.md(P層=鏡そのまま/T層=cap溢れの尾/X層=直近発言者)。
// ★v0.1.1300: 配信ごとキー(v2)を優先し、無ければ旧グローバルキーへ落ちる。
//   旧キーは「最後に書いた配信」が他配信を上書きするため、多配信タブでは
//   正しい配信の鏡が liveId 照合で弾かれ「鏡なし」に見えていた(=fallback降格)。
import { KEY_LANE_MIRROR, laneMirrorKeyFor, laneReceiptKeyFor } from '../lib/laneMirrorKey.js';
import { KEY_STORY_DIAG_MIRROR } from '../lib/storyDiagMirrorKey.js';
// 記録件数の正本購読(story-diag-realtime-sync-DESIGN.md): ①popup非依存で content-entry.js が
//   書く nls_panel_summary_<lv> を購読し、①が閉じていても件数だけはリアルタイムで動かす。
import { panelSummaryStorageKey } from '../lib/panelLiveSummary.js';
// ★v0.1.1300: isReceiptComparable = 受領証と鏡が同じ内容を指すときだけ比較を許す関所。
import { isReceiptComparable, restoreLaneMirrorBuckets } from '../lib/laneMirror.js';
import {
  composeVenueLaneBuckets,
  isLaneMirrorUsableForVenue,
  venueMirrorAgeNotice,
  venueRowsFromLaneMirror,
  venueSeatIndexByUid
} from '../lib/venueLaneMirrorSupply.js';
import {
  buildVenueLaneParity,
  toVenueLaneParityDiag,
  venueLaneParityKey,
  VENUE_LANE_TRANSIENT_WINDOW_MS
} from '../lib/venueLaneParity.js';
// v0.1.1137(lanescene-structural-review MVP): venueLaneParityの厳密突合(P/T/X層・DOM census)とは
//   独立に、①と会場が同じ鏡世代(revision)を見ているかを1行で確認する軽量な代理指標。
// ★venue-exact-parity-SPEC-2026-08-07 §3-3: 受領証の組み立ては純関数へ移した。
//   旧インライン組み立て(venueBar.js:5300-5324)は venueReceipt.revision に pop 側の値を
//   自己代入していた=revision比較が恒真(C1)。両辺を別の入力から作る関数に閉じ込めることで、
//   自己代入は【関数の外から作れない】(檻=laneSceneEnvelope.receipts.test.js が変異で赤にする)。
import { laneDomFingerprint, buildVenueSceneReceipts, compareRenderReceipts } from '../lib/laneSceneEnvelope.js';
// v0.1.1113 実DOM census(Tri-Parity): ✅の根拠をデータからDOMへ(reference_diag_truth_SYNTHESIS.md)。
import { collectVenueLaneDomCensus, venueDomCensusToParityDom } from '../lib/venueDomCensus.js';
import { nicoUserPageUrl, anonymousDisplayLabel } from '../lib/nicoUserPage.js';
import { isNumericNicoUserId } from '../domain/user/identity.js';
// person-tile-unify 第3コミット(2026-06-22): 会場の席タイルを popup の本物ビルダーで描く。
//   独自DOM生成をやめ、popup「アイコン列・グリッド・診断」と同じ顔ぶれ・見た目にする。
//   依存(io)も popup と同じ本物を会場が生成・import する(スタブ化しない)。
import { buildPersonTileEl } from '../lib/personTileDom.js';
import { createSupportAvatarLoadGuard } from '../lib/supportGrowthAvatarLoad.js';
import {
  applyStoryAvatarTvFallbackClass,
  removeStoryAvatarTvFallbackClass
} from '../lib/storyAvatarTvFallbackClass.js';
import { storyTileUsesYukkuriTvStyle } from '../lib/storyTileTvStyle.js';
// ★v0.1.1238: 会場は匿名の顔をSVGのまま使うため upgradeAnonymousAvatarImage を import しない
//   (venuePersonTileIo のコメント参照)。popup/comeview/status は従来どおり合成PNGを使う。
import {
  isHttpOrHttpsUrl,
  NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS
} from '../lib/supportGrowthTileSrc.js';
// storyUserLaneMetaLines は P3(v0.1.1117)で venueSeatEntryToLaneItem(正本)経由に一本化=venueBar 直参照なし。
import { bucketVenueLaneSeats, flattenVenueLaneBuckets, venueSeatEntryToLaneItem } from '../lib/venueLaneBuckets.js';
// 2026-07-14 診断先行(venue-tile-link-parity-diagnose-DESIGN.md): タイル実体(鏡uid)⇄席クラス
//   (roster uid)の二重ソース不一致が実害を出しているかを累積で数える計器(観測のみ・修正はしない)。
import {
  beginVenueSeatLinkPaint,
  createVenueSeatLinkParityState,
  observeVenueSeatLink,
  toVenueSeatLinkParityDiag
} from '../lib/venueSeatLinkParity.js';
// 2026-07-15 診断先行(venue-yukkuri-named-diagnose): 「名前ありゆっくり顔」の実害を数えるだけの計器
//   (修正はしない・観測のみ)。真因は桁レンジ境界(isAnonymousStyleNicoUserId)で、意図的仕様のため触らない。
import {
  createVenueYukkuriNamedCensusState,
  observeVenueYukkuriNamedTile,
  toVenueYukkuriNamedCensusDiag
} from '../lib/venueYukkuriNamedCensus.js';
import {
  paintStoryUserLaneDomFilled,
  resetStoryUserLaneDom
} from './story/renderStoryUserLaneDom.js';
// v0.1.902: 会場座席の健全度を健全度パネルに載せる(配信者混入・固着を AI/人間が一目で発見)。
import { KEY_VENUE_SEATS_DIAG } from '../lib/venueSeatsDiagKey.js';
import { buildVenueSeatsDiagSnapshot } from '../lib/venueSeatsDiag.js';
import { renderVenueStoryDiagMirrorPanel, storyDiagMirrorStatus } from '../lib/venueStoryDiagMirrorPanel.js';
import {
  computeVenueParticipantAvatarCounts,
  venueDiagSig,
  buildVenueDiagHtml
} from '../lib/venueAvatarDiagLine.js';
import {
  seatsPerRow,
  resolveVisibleArenaCount,
  resolveVenueMaxHeightVh,
  selectStableVisibleMembers,
  partitionThumbnailFirst
} from '../lib/venueViewport.js';
import {
  initVenueDragState,
  beginVenueDrag,
  updateVenueDrag,
  endVenueDrag
} from '../lib/venueDragScroll.js';
import { buildVenueRoster, formatVenueRosterSummary } from '../lib/venueRoster.js';
import {
  bubbleAnchorForSeatRect,
  resolveBubbleY,
  BUBBLE_ANCHOR_GAP
} from '../lib/venueBubbleLayout.js';
import { drawCrowdOnCanvas } from '../lib/crowdRasterizer.js';
import {
  resolveVenueHeatLevel,
  heatLevelToWarmColor,
  heatLevelToGlowOpacity,
  heatLevelToLabel
} from '../lib/venueHeat.js';
import { VoicePlayer } from '../lib/voicePlayer.js';
import { KEY_VOICE_DIAG } from '../lib/voiceDiagKey.js';
import { buildVoiceDiagSnapshot } from '../lib/voiceDiag.js';
import {
  shouldRenderLoading,
  resolveVoiceLoadingView,
  VOICE_LOADING_FLICKER_GUARD_MS
} from '../lib/voiceLoadingState.js';
import {
  nextBubbleVoiceState,
  selectBubblesToEvict,
  resolvePendingLifetimeMs,
  BUBBLE_VOICE_AFTERGLOW_MS,
  BUBBLE_VOICE_SPEAKING_CAP_MS
} from '../lib/venueBubbleLifecycle.js';
import { resolveVoiceForUser } from '../lib/voiceAssignment.js';
import { buildVenueCharacterFrame } from '../lib/venueCharacterFrame.js';
import { parseGiftCommentText, parseNicoadCommentText } from '../lib/parseGiftComment.js';
import {
  resolveGiftProjectile,
  resolveGiftThrowPath,
  canLaunchGiftThrow,
  resolveVisibleThrowPoint,
  GIFT_THROW_DURATION_MS
} from '../lib/giftThrowProjectile.js';
// 2026-07-06: ニコ生「来場」システムメッセージをパチンコの入賞演出(保留玉が入る)として飛ばす。
//   検知は parseArrivalComment.js(純関数・厳格regex)、ラベル/音/CD判定は arrivalEffect.js。
//   演出自体は既存の launchGiftThrow(投げ銭風飛翔)を流用し、新規の投擲経路は増やさない。
//   設計原則(ユーザー確定・最重要): 無料イベント(来場)を派手にすると有料ギフト演出の価値が
//   下がる=演出強度は【来場 < gift_small < … < mega】の最下段固定(音は常にhold_lamp・昇格禁止)。
import { parseArrivalCommentText } from '../lib/parseArrivalComment.js';
import {
  ARRIVAL_EFFECT_CD_MS,
  ARRIVAL_EMOJI,
  buildArrivalLabel,
  arrivalSoundKindForCount,
  shouldFireArrivalEffect,
  arrivalMeterWeight
} from '../lib/arrivalEffect.js';
// v0.1.1090: 個別ギフトイベント欠落配信のフォールバック検知(集計ptデルタ)。
//   合計ギフトpt(NDGR statistics)だけは取れるのに個別イベントが一切来ない配信(既知の仕様ムラ)
//   向けに、帳簿方式で「まだ説明されていないpt」を1件のイベントとして合成する純関数。
import {
  computeGiftDelta,
  accountRealGiftEvent,
  makeInitialGiftDeltaState
} from '../lib/giftDeltaFallback.js';
import {
  isVoicevoxAlive,
  probeVoicevoxAlive,
  listVoicevoxStyleIds,
  synthesizeVoice
} from '../lib/voicevoxClient.js';

const ROOT_ID = 'nlsb-venue-root';
const STYLE_ID = 'nlsb-venue-style';
// 別窓化で開閉状態の永続化を一旦停止(1541 はコメントアウト中)。復活に備えキーは残す。
// eslint-disable-next-line no-unused-vars
const OPEN_STORAGE_KEY = 'nls_venue_open';
const AGGREGATE_INTERVAL_MS = 30_000;
// 北極星「コメントがリアルタイムでちゃんと出る」: poll を 1.5→0.8秒に上げて取りこぼし/遅延を減らす
//   (storage.onChanged のイベント駆動と並走するハートビート)。会議(無料LLM)一致。
const SPEECH_INTERVAL_MS = 800;
const BUBBLE_LIFETIME_MS = 4_000;
const BUBBLE_FADE_MS = 600;
// v0.1.755 リアルタイム完璧化: 同時表示数を 6→12 に拡大。洪水時に「出してすぐ最古を消す」で
//   一瞬しか見えない問題を緩和(寿命は流速可変で短くするので画面は埋まり続けない)。
const BUBBLE_MAX = 12;
// 吹き出し流速(件/秒)を測る短い窓。寿命可変(速いほど短命)の入力。
const BUBBLE_FLOW_WINDOW_MS = 3_000;
const BUBBLE_TEXT_MAX = 36;
const VENUE_LAYOUT_CLASSES = [
  'nlsb-mode-empty',
  'nlsb-mode-vip',
  'nlsb-mode-normal',
  'nlsb-mode-packed'
];
// v0.1.1127 Patch B: mirror mode の会場は①POP完全一致のため、v0.1.1120で外した
// キャラ案内帯/空段ノート/フッターを意図的に戻す。不要ならこの1行を false に戻す。
const VENUE_LANE_GUIDES_EXACT_COPY = true;
/*
 * ★v0.1.1280: fallback 経路(①の鏡が無い/古すぎる)のときだけ差し替える gift 段の空文言。
 *   fallback は席から段を組むため構造上ギフト段を作れない=「該当者がいません」は嘘になる。
 *   文言の正本は①③と同じ storyUserLaneGuideHtml.js(エスケープ処理も共有する)。
 */
const VENUE_FALLBACK_GIFT_EMPTY_HTML = buildVenueFallbackGiftEmptyNoteHtml();

/**
 * 会場の席タイル(buildPersonTileEl)に渡す avatar load guard と I/O。
 *   popup-entry.js の storyAvatarLoadGuard(L3793)と【同設定】で会場が自前に持つ。
 *   コールバック(TV-fallback クラス付け外し)も popup と同じ本物を import(スタブ化しない)。
 *   会場は content script の別レイヤー/別バンドルなので、popup のインスタンスは届かない=
 *   同じ lib の本物から会場が同設定で生成する(live-view が io を自前で組むのと同型)。
 */
// venue-avatar-stale-mirror-DESIGN.md §C-1b(段階1): 会場は数時間規模でpopupが開かれない
//   ことがあり、一度の一時的プローブ失敗(timeout/error)が永久固着して白丸のまま=真因確定済み。
//   retryPolicy を opt-in(会場のみ・既定値のまま)で有効化し、TTL+指数バックオフで再プローブ
//   の機会を与える。popup側は§Eの段階3判断まで既定null(従来の恒久負キャッシュ)のまま。
/*
 * ★v0.1.1318: アイコン未設定の人を「全員同じ白丸」にしない(実機報告「サムネがおちてる」)。
 *
 * ■ 実測(2026-08-10・curl で確認)
 *     未設定ユーザー(135315894/138512750/138339168) → 404
 *     設定済ユーザー(128121142/4046119)             → 200
 *   ＝URL の作り方は正しく、404 は【本当にアイコンを設定していない人】。
 *   guard は失敗時に全員へ同じ blank.jpg(公式の未設定アイコン)を出すので、
 *   未設定の人が多い配信では会場が【白丸だらけ】になる。
 *
 * ■ 直し方は v0.1.1307(広告段)と同じ結論
 *   「404 の白丸でなく【ゆっくり顔】にする」。今回は会場にも同じ扱いを与える。
 *   失敗した URL には uid が含まれる(usericon/s/<uid/10000>/<uid>.jpg)ので、
 *   そこから uid を復元して【その人ごとの identicon】を生成する
 *   ＝全員違う顔になり、誰が誰か見分けられる(白丸だらけにならない)。
 */
/** @param {string} requestedSrc @returns {string} 解決できなければ ''(共通fallbackへ倒れる) */
const venueAvatarFallbackFor = (requestedSrc) => {
  try {
    const m = /\/usericon\/(?:[sm]\/)?\d+\/(\d{1,14})\.jpg/i.exec(String(requestedSrc || ''));
    const uid = m ? m[1] : '';
    if (!uid) return '';
    return anonymousIdenticonDataUrl(uid, 64) || '';
  } catch {
    return ''; // 失敗時は共通 fallback(blank.jpg)へ倒れる
  }
};
const venueAvatarLoadGuard = createSupportAvatarLoadGuard({
  fallbackSrc: NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
  fallbackSrcFor: venueAvatarFallbackFor,
  onFallbackApplied: applyStoryAvatarTvFallbackClass,
  onRemoteSuccess: removeStoryAvatarTvFallbackClass,
  retryPolicy: {}
});

/**
 * buildPersonTileEl(p, io) の io 引数。popup の laneDomIo(popup-entry.js:5232)と同形。
 *
 * ★v0.1.1238: 会場では `upgradeAnonymousAvatarImage` を**注入しない**(匿名の顔はSVGのまま)。
 *   実測(ブラウザ): 会場内img 228枚・ユニーク177種で、匿名の顔は1件 29,262バイトの
 *   PNG(128x128)だった。文字列だけで 5.05MB・デコード後ビットマップ推定 11MB。
 *   一方、席の実表示は 22px(下の [data-thumb="0"] のCSS)= 5.8倍の過剰。
 *   SVG(anonymousIdenticonDataUrl・約2.5KB)なら約1/12で済む。
 *   ★ホバーカード(72px)も席の img.src を流用するが、readVenueTileThumbState
 *     (venueHoverCard.js:48)が data:image/svg+xml を identicon として扱う分岐を持つ。
 *     SVGはベクタなので拡大しても劣化しない=従来のPNG(128px)より鮮明になる。
 *   ★popup/comeview/status の注入は変更していない(会場だけの最適化)。
 *   personTileDom.js は凍結ファイルなので触らず、io の有無で制御する
 *   (:95 の `typeof io.upgradeAnonymousAvatarImage === 'function'` が分岐点)。
 */
const venuePersonTileIo = {
  storyAvatarLoadGuard: venueAvatarLoadGuard,
  isHttpOrHttpsUrl,
  storyTileUsesYukkuriTvStyle
};

const STORY_GUIDE_FACE_LINK =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
const STORY_GUIDE_FACE_KONTA =
  'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png';
const STORY_GUIDE_FACE_GIFT = STORY_GUIDE_FACE_KONTA;
const STORY_GUIDE_FACE_TANU =
  'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png';

/**
 * @param {string} rel
 * @returns {string}
 */
function resolveVenueAssetUrl(rel) {
  try {
    return typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.getURL === 'function'
      ? chrome.runtime.getURL(rel)
      : rel;
  } catch {
    return rel;
  }
}

/**
 * v0.1.1117 白円根治(P3): ①の lanePickCtx(popup-entry.js:6524-6528)と同じ意味の資産を会場側で解決。
 *   yukkuriSrc=①の STORY_GRID_DEFAULT_TILE_IMG と同一アセット / tvSrc=①の
 *   STORY_REMOTE_FAILED_PLACEHOLDER_IMG(=blank.jpg)と同値。venueSeatEntryToLaneItem 経由で
 *   ①正本の displaySrc 導出(buildStoryUserLaneCandidateRow)に渡る。
 */
const venueLanePickCtx = {
  yukkuriSrc: resolveVenueAssetUrl(STORY_GUIDE_FACE_LINK),
  tvSrc: NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
  anonymousIdenticonEnabled: true
};

/**
 * 会場の participant から人物タイル要素(buildPersonTileEl)を作る共通ヘルパ。
 *
 * 席ループと「応援者トップNバー」で【同じ描画】を使うために切り出した(2026-07-01 会議
 * venue-role-separation フェーズ2)。avatar 解決順(http→数値ID由来→ゆっくり顔)・meta 表記・
 * 匿名の顔(identicon)は popup と同じ正本を通す=バー側で opts を渡し忘れて匿名の顔が崩れる
 * (handoff 地雷#3)を構造的に防ぐ。タイル本体は buildPersonTileEl(personTileDom.js)一本。
 *
 * @param {{ userId?: string, name?: string, avatar?: string, key?: string }} participant
 * @param {string} [fallbackLabel] userId も key も無いときの表示名(席番号など)
 * @returns {HTMLElement}
 */
function buildVenuePersonTile(participant, fallbackLabel = '会場') {
  // v0.1.1117 白円根治(P3): トップバー独自の第2導出(推測URL直入れ=白円の同型)を削除し、
  //   席と同じ venueSeatEntryToLaneItem(=①正本 buildStoryUserLaneCandidateRow へ委譲)一本に統一。
  const item = venueSeatEntryToLaneItem(
    { seatIndex: 0, participant: /** @type {any} */ (participant) },
    { fallbackLabel, pickCtx: venueLanePickCtx }
  );
  if (item) {
    return buildPersonTileEl(
      { displaySrc: item.displaySrc, title: item.title, meta: item.meta, entry: item.entry },
      venuePersonTileIo
    );
  }
  // participant 不正(uid も key も無い)時の最終フォールバック=旧実装と同じく描画は止めない。
  return buildPersonTileEl(
    {
      displaySrc: '',
      title: anonymousDisplayLabel(String(fallbackLabel)),
      meta: { idLine: '', nameLine: '' },
      entry: { userId: '' }
    },
    venuePersonTileIo
  );
}

/**
 * 診断パネル等で表示名を innerHTML に差し込む前に HTML エスケープする。
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** @typedef {ReturnType<typeof venueRowsFromUserLaneCandidates>[number]} VenueRow */

const VENUE_CSS = `
  .nlsb-root {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    pointer-events: none;
    color: #f7f7f7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .nlsb-root.nlsb-is-open {
    pointer-events: auto;
  }
  /* ★2026-08-11 v0.1.1323 ユーザー報告「会場モードにするボタンがないかも？どこ？」:
     見つけられなかったのは position:absolute + 暗色 + 13px の三重苦だった。
       ① absolute = .nlsb-root(ページ内)の右下 = スクロールすると流れて画面外へ出る
       ② 背景 rgba(20,24,30,.82) はニコ生の暗いページに溶ける(同系色)
       ③ 13px・パディング7px = 視線が拾う前に他のUIに埋もれる
     → fixed で画面右下に常駐させ、桜ピンク(DESIGN.md の主アクセント)で必ず目に入るようにする。
     ★会場を開いている間は隠す(html.nlsb-venue-open で制御)。閉じるのはヘッダーの「✕ 閉じる」。 */
  .nlsb-toggle {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483000;
    min-height: 44px;
    padding: 12px 20px;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 999px;
    background: linear-gradient(135deg, #ff8fb1, #ff6f9c);
    color: #fff;
    font-weight: 700;
    letter-spacing: 0.02em;
    box-shadow: 0 6px 20px rgba(214, 51, 108, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25);
    cursor: pointer;
    pointer-events: auto;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
    transition: transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
  }
  .nlsb-toggle:hover {
    background: linear-gradient(135deg, #ff7ea6, #ff5e91);
    transform: translateY(-2px);
    box-shadow: 0 10px 26px rgba(214, 51, 108, 0.55), 0 2px 6px rgba(0, 0, 0, 0.25);
  }
  /* 会場を開いている間はボタンを隠す(ヘッダーの「✕ 閉じる」が閉じる手段)。
     fixed 化で最前面に来たため、開いている間も出したままだと会場の上に浮いて邪魔になる。
     ★セレクタは html.nlsb-venue-open(既存の文字列契約・content-entry.js:2923 が
       「venueBar.js が open 中に立てる documentElement クラス」として wiring テストで固定)。
       会場側の独自クラスを新設しない=契約を1本に保つ。 */
  html.nlsb-venue-open .nlsb-toggle {
    display: none;
  }
  /* 動きを減らす設定の人には拡大アニメを出さない(a11y)。 */
  @media (prefers-reduced-motion: reduce) {
    .nlsb-toggle {
      transition: none;
    }
    .nlsb-toggle:hover {
      transform: none;
    }
  }
  .nlsb-toggle:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  /* v0.1.1230 ピックアップ枠(BSP風): 会場ヘッダー直下に常設。高さを先に確保して
     出たり消えたりで下の段が動かないようにする(ユーザー報告「上下に動く」の対策と同趣旨)。 */
  .nlsb-pickup {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    margin: 4px 0 6px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 190, 90, 0.55);
    /*
     * ★v0.1.1337: 地の色を【不透明で】敷く(実機で読めなくなっていた)。
     *   旧: linear-gradient のみ = 透明度 0.22〜0.06 の帯だけ。
     *   会場の暗い背景の上なら成立するが、後ろにニコ生のページ(カテゴリタグ等)が
     *   透けると文字と背景が重なって【判読不能】になる。実機スクリーンショットで確認。
     *   さらに data-empty の opacity:0.55 が乗ると実質 0.03〜0.12 まで薄くなっていた。
     *   → 不透明の下地(#2a2118 相当)を先に置き、その上に既存のグラデを重ねる。
     *     色は会場の暗色系に馴染ませる(白背景でも黒背景でも読める濃さ)。
     */
    background-color: rgba(38, 30, 20, 0.92);
    background-image: linear-gradient(90deg, rgba(255, 176, 62, 0.28), rgba(255, 176, 62, 0.1));
    color: #fff5e8;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
    font-size: 13px;
    line-height: 1.35;
  }
  /* ★空のときも【薄くしすぎない】(0.55 だと下地ごと透けて読めなくなる)。 */
  .nlsb-pickup[data-empty='1'] { opacity: 0.85; }
  .nlsb-pickup__badge {
    flex: 0 0 auto;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(255, 152, 0, 0.9);
    color: #fff;
  }
  .nlsb-pickup__body {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .nlsb-pickup__meta {
    flex: 0 0 auto;
    font-size: 11px;
    opacity: 0.75;
  }
  .nlsb-stage {
    position: fixed;
    inset: 0;
    z-index: 1;
    display: grid;
    box-sizing: border-box;
    padding: clamp(52px, 7vh, 76px) clamp(14px, 3vw, 44px) 64px;
    overflow: hidden;
    /* FX(ビネット等)の mix-blend を中央映像へ漏らさないため独立スタッキング(会議確定)。 */
    isolation: isolate;
    /*
     * ユーザー方針(2026-06-13 強)「配信の画面と実際の画面にスモークをかけないで・ちゃんと
     * 見たい」: 全面を覆う暗幕(linear-gradient)を撤去。背景は透明にして、後ろのニコ生映像と
     * 本家UIをそのまま見せる。会場の雰囲気は上端・下端の淡いステージ照明だけで出し、中央の
     * 映像にはかけない(上下のグラデは画面端で transparent に消えるので映像本体は素通し)。
     */
    /*
     * 2026-06-14 星野アイデア会議2「熱量の色温度」: 下端(客席)の照明色をコメント速度連動で
     * 注入する。--nlsb-heat-color(涼=青紫→暖=オレンジ)/ --nlsb-heat-opacity(過疎=ほぼ透明→
     * 怒涛=濃い)を JS が更新。映像中央は素通しのまま(下端だけ色温度が変わる)。
     * 既定は涼色・薄めにして未設定時も従来の雰囲気を壊さない。
     */
    --nlsb-heat-color: rgb(120, 130, 200);
    --nlsb-heat-opacity: 0.12;
    background:
      radial-gradient(ellipse 70% 24% at 50% 0%, rgba(120, 165, 224, 0.16), transparent 70%),
      radial-gradient(
        ellipse 96% 30% at 50% 100%,
        color-mix(in srgb, var(--nlsb-heat-color) calc(var(--nlsb-heat-opacity) * 100%), transparent),
        transparent 74%
      );
    opacity: 0;
    transform: translateY(18px);
    visibility: hidden;
    pointer-events: none;
    overscroll-behavior: contain;
    transition:
      opacity 180ms ease,
      transform 180ms ease,
      visibility 0s linear 180ms,
      background 800ms ease;
  }
  .nlsb-root.nlsb-is-open .nlsb-stage {
    opacity: 1;
    transform: translateY(0);
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }
  /*
   * 後方ビネット(ライブ演出会議 確定①・プロの「空席を闇に沈める」術のWeb再現)。
   * ⚠️ユーザー方針「中央の配信映像にスモークをかけない」を厳守: 中央は大きく transparent で
   * くり抜き、暗くするのは【四隅】と【下端の席エリア後方】だけ。これで空席/隙間が闇に溶けて
   * 「奥まで満員」に見えつつ、配信映像(中央セーフエリア)は素通しのまま。
   * pointer-events:none でクリック透過・吹き出しレイヤー(z5)より下(z0)。
   */
  .nlsb-stage::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse 78% 64% at 50% 46%, transparent 52%, rgba(2, 4, 10, 0.55) 100%),
      linear-gradient(to bottom, transparent 64%, rgba(2, 4, 12, 0.5) 100%);
  }
  /* v0.1.772: 閉じるは右上隅(absolute)でなくヘッダー右端の他ボタンと並べる(nlsb-comeview-btn 流用)。
     閉じる専用に薄赤の見た目を上書きして「閉じる」と分かりやすくする。 */
  .nlsb-close-btn {
    border-color: rgba(255, 150, 150, 0.45);
    background: rgba(60, 30, 34, 0.7);
    color: #ffd2cf;
  }
  .nlsb-close-btn:hover {
    background: rgba(90, 40, 46, 0.92);
    border-color: rgba(255, 170, 170, 0.7);
  }
  .nlsb-close-btn:focus-visible {
    outline: 2px solid #ffb4a2;
    outline-offset: 2px;
  }
  /* v0.1.770 VOICEVOX 起動待ちの「楽しいローディング」(会議 2026-06-16):
     会場は『開演前の期待感』。控えめにふわっと脈動する(派手すぎ厳禁=過去にリバーブ等は却下)。
     遅延ガード(180ms)は JS 側で制御し、一瞬成功ではこの class が付かない=チラつかない。 */
  .nlsb-voice-status.is-loading {
    color: #ffd98a;
    animation: nlsb-voice-loading 1.25s ease-in-out infinite;
  }
  .nlsb-voice-status.is-error {
    color: #ffb4a2;
    animation: none;
  }
  @keyframes nlsb-voice-loading {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-voice-status.is-loading {
      animation: none;
      opacity: 0.92;
    }
  }
  /*
   * 会議確定B(2026-06-13): 中央に「映像セーフエリア」を確保して配信映像を見せる。
   *   上端=なし(背景の光の海)、中央=何も置かない空き(映像が透ける)、下端=ひな壇。
   *   ひな壇を画面の下に逃がし、中央 1fr を空けることで映像が常に見える。
   */
  .nlsb-stage-layout {
    position: relative;
    z-index: 1;
    display: grid;
    /*
     * 2026-06-22 会場スペース拡大(ユーザー要望「席を画面いっぱいに広げる」):
     *   旧 width:min(1500px,100%);margin:0 auto は広い画面で左右に余白を残し、seatsHost の
     *   clientWidth が 1500px で頭打ち→perRow(seatsPerRow)が伸びず席が画面端まで並ばなかった
     *   (実機「会場スペースが狭い」不満の核)。全幅にすると seatsHost.clientWidth=実画面幅となり
     *   perRow が自然に増え、resolveVisibleArenaCount(perRow×8段)で同時表示席が画面端まで埋まる。
     *   「全員載せる」ロジック(buildVenueSeating の論理席/resolveDynamicArenaCap の人数連動上限)は
     *   一切変えない=全幅化で『ほか N人』に回る人が減り、より多くが席に出る方向にだけ働く。
     *   映像セーフエリア(上段 safe)は縦分割で守られるので全幅でも映像は覆わない。
     */
    width: 100%;
    height: 100%;
    min-height: 0;
    margin: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      "safe"
      "seating";
    gap: clamp(8px, 1.5vh, 16px);
    /*
     * 親は pointer-events:auto のまま(none にすると実マウスのヒットテストが親で止まり、
     * 子の <a> リンクが「クリックできない」になる=ユーザー不満の原因だった)。
     * 中央の映像を触りたいときは下の .nlsb-safe-area だけ none で透過させる。
     */
    pointer-events: auto;
  }
  /* 中央の映像セーフエリア: UI を一切置かず、クリックを透過して映像/本家UIを直接触れる。 */
  .nlsb-safe-area {
    grid-area: safe;
    min-height: 0;
    pointer-events: none;
  }
  /* 配信者ステージカードは映像を覆うので撤去(中央は映像そのものを見せる)。 */
  .nlsb-center {
    display: none;
  }
  .nlsb-center-label {
    color: #9fd1ff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
  }
  .nlsb-center-title {
    overflow: hidden;
    font-size: clamp(18px, 2.4vw, 28px);
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-center-meta {
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
    letter-spacing: 0.08em;
  }
  /*
   * 会場席は画面下端のひな壇だけにする(中央の映像セーフエリアは空ける)。高さは
   * 下端 max 35vh に制限し、配信映像を覆わない(会議確定B「ひな壇は下端 30〜35vh」)。
   */
  .nlsb-seating {
    grid-area: seating;
    align-self: end;
    display: grid;
    width: 100%;
    /* ★2026-08-11: 人数連動(旧 48→72vh)を撤回し 48vh 固定にした(会議4体・3対1)。
       ユーザー実機2,769人で「配信の映像はちゃんとみたい」＝映像が実質ゼロだったため。
       正本の経緯は src/lib/venueViewport.js の resolveVenueMaxHeightVh JSDoc。

       ★fallback を 55vh → 48vh に変更した理由(css_default_should_be_the_safe_state):
       JS の注入(renderSeats 内)が走る前や、何らかの理由で注入が失敗した場合、
       この fallback がそのまま効く。55vh のままだと「注入が失敗したときだけ
       映像が余計に潰れる」= 直したはずの症状が経路によって復活する。
       CSS 既定は常に【安全な側】に置く。 */
    max-height: var(--nlsb-venue-max-h, 48vh);
    min-height: 0;
    box-sizing: border-box;
    grid-template-areas:
      "header"
      "topbar"
      "seats";
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    position: relative; /* 3キャラ常駐レイヤー(.nlsb-residents)の絶対配置の基準 */
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    /* スモークを薄く: 名前が読める最低限の暗さだけ残し、下の映像を極力透けさせる。 */
    background: rgba(9, 13, 19, 0.28);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    overscroll-behavior: contain;
    pointer-events: auto;
  }
  /* 3キャラ常駐(りんく・こん太・たぬ姉): 配信画面の「まわり(左右の縁)」に出す。会場の席とは
     重ねない=満員でも邪魔にしない(ユーザー実機指摘の根治)。3人が画面を囲んで一緒に観てる感。
     stageLayout 全面を覆う透明レイヤー・pointer-events:none で映像/クリック/席リンクを邪魔しない。 */
  .nlsb-residents {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
  }
  .nlsb-resident {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: clamp(40px, 4.4vw, 64px);
  }
  /* 配置: りんく=左上・たぬ姉=左下(縦に2人)・こん太=右中央。映像の左右の縁に寄せ中央は空ける。 */
  .nlsb-resident-rinku   { left: 6px;  top: 8%; }
  .nlsb-resident-tanunee { left: 6px;  top: 34%; }
  .nlsb-resident-konta   { right: 6px; top: 18%; }
  .nlsb-resident-img {
    width: 100%;
    height: auto;
    object-fit: contain;
    /* 実視聴者と区別する金色の光。reduced-motion でも静的グローは残す。 */
    filter: drop-shadow(0 0 6px rgba(255, 206, 96, 0.9)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
    animation: nlsb-resident-glow 2.8s ease-in-out infinite;
  }
  .nlsb-resident-name {
    margin-top: 1px;
    font-size: 10px;
    font-weight: 700;
    color: #ffe7b0;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
    white-space: nowrap;
  }
  @keyframes nlsb-resident-glow {
    0%, 100% { filter: drop-shadow(0 0 5px rgba(255, 206, 96, 0.7)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
    50% { filter: drop-shadow(0 0 9px rgba(255, 220, 120, 1)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-resident-img { animation: none; }
  }
  /* v0.1.777 額縁フレーム: 3キャラ全表情サムネを四辺に沿って並べ会場を囲む。中央(映像)と
     コメント欄は触らない。各タイルは JS が edge(top/right/bottom/left)と pos(0..1)を data 属性で渡し、
     ここで辺に貼り付ける。軽量 .thumb128 を使い負荷を抑える。 */
  .nlsb-charframe {
    position: absolute;
    inset: 0;
    z-index: 4; /* 客席(seats)より背面・映像セーフエリアより前。吹き出し(z5)/常駐(z6)より背面 */
    pointer-events: none;
    overflow: hidden;
  }
  .nlsb-charframe-tile {
    position: absolute;
    width: clamp(26px, 2.6vw, 40px);
    height: auto;
    opacity: 0.85;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6));
  }
  .nlsb-charframe-tile[data-edge="top"]    { top: 2px; transform: translateX(-50%); }
  .nlsb-charframe-tile[data-edge="bottom"] { bottom: 2px; transform: translateX(-50%); }
  .nlsb-charframe-tile[data-edge="left"]   { left: 2px; transform: translateY(-50%); }
  .nlsb-charframe-tile[data-edge="right"]  { right: 2px; transform: translateY(-50%); }
  /* v0.1.778 ギフト/広告の投げ演出: 投げ主のサムネ座標から中央映像へ放物線で飛ぶ。
     bubbleLayer(最前面・overflow外)に乗せ、JS は起点 left/top と --dx/--dy/--mid* を CSS 変数で
     渡すだけ=GPU アニメで毎フレーム JS 計算しない。プール再利用+同時上限で会場を重くしない。 */
  .nlsb-gift-proj {
    position: absolute;
    z-index: 7; /* 吹き出し(z5)・常駐(z6)より前=投げ物は最前面で映像へ飛ぶ */
    display: none;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(20, 24, 32, 0.82);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    will-change: transform, opacity;
    /* v0.1.783: テキスト投げ物のみ screen 合成(中央映像を隠しすぎない)。
       実画像(is-image)は写真調なので screen を外し、はっきり見せる。 */
    mix-blend-mode: screen;
    transform: translate(-50%, -50%);
  }
  /* v0.1.783: 実画像の投げ物。pill 背景を消して画像そのものを大きく飛ばす。 */
  .nlsb-gift-proj.is-image {
    padding: 0;
    background: transparent;
    border-radius: 0;
    mix-blend-mode: normal;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55));
  }
  .nlsb-gift-proj-img {
    width: 56px;
    height: 56px;
    object-fit: contain;
    display: block;
  }
  .nlsb-gift-proj.is-flying {
    display: inline-flex;
    animation: nlsb-gift-fly var(--nlsb-gift-dur, 1500ms) cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  }
  .nlsb-gift-proj-emoji { font-size: 18px; }
  /* v0.1.783「一瞬で見えない」改善: 着弾(70%)で一度大きく見せて(バースト)から、
     余韻を残してフェード。以前は終端で scale(0.45)+opacity0 に縮んで消え、見る間もなかった。 */
  @keyframes nlsb-gift-fly {
    0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
    10%  { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
    55%  { transform: translate(calc(-50% + var(--nlsb-gift-mx)), calc(-50% + var(--nlsb-gift-my))) scale(1.14) rotate(7deg); opacity: 1; }
    72%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1.35) rotate(-3deg); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1.05) rotate(-2deg); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-gift-proj.is-flying {
      animation: nlsb-gift-fade var(--nlsb-gift-dur, 1500ms) ease-out forwards;
    }
    /* reduced-motion: 飛ばさず、着弾点でふわっと出して消える(余韻は残す)。 */
    @keyframes nlsb-gift-fade {
      0%   { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0; }
      20%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0.95; }
      80%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0.95; }
      100% { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0; }
    }
  }
  .nlsb-header {
    grid-area: header;
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 38px;
    box-sizing: border-box;
    padding: 7px 14px;
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(14, 19, 27, 0.55);
  }
  /* 2026-07-01 会議(venue-role-separation フェーズ2): ひな壇上部「応援者トップNバー」。
     密集会場でも上位が必ず大きく見える。高さ固定=下の席を揺らさない(v0.1.1026 高さ振動対策)。 */
  .nlsb-topbar {
    grid-area: topbar;
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
    height: 72px;
    padding: 4px 14px;
    overflow-x: auto;
    overflow-y: hidden;
    background: linear-gradient(180deg, rgba(255, 210, 110, 0.10), rgba(14, 19, 27, 0.0));
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    scrollbar-width: thin;
  }
  .nlsb-topbar[hidden] { display: none; }
  .nlsb-topbar-label {
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 700;
    color: #ffd88a;
    letter-spacing: 0.04em;
    writing-mode: vertical-rl;
    text-orientation: upright;
    line-height: 1;
    opacity: 0.9;
  }
  .nlsb-topbar-list {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .nlsb-topbar-cell {
    position: relative;
    flex: 0 0 auto;
    width: 56px;
  }
  /* トップバーのアバターは席より大きく主役感を出す(顔=買った本物タイル buildPersonTileEl 流用)。 */
  .nlsb-topbar-cell .nl-story-userlane-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
  }
  .nlsb-topbar-cell .nl-story-userlane-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.25);
  }
  .nlsb-topbar-cell .nl-story-userlane-meta {
    max-width: 56px;
    overflow: hidden;
    font-size: 9px;
    line-height: 1.15;
    text-align: center;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* 上位3位は金・銀・銅の縁 + 順位バッジ(席と同じ🥇🥈🥉)。静的=ピカピカしない。 */
  .nlsb-topbar-cell[data-venue-rank] .nl-story-userlane-avatar { border-width: 3px; }
  .nlsb-topbar-cell[data-venue-rank='1'] .nl-story-userlane-avatar { border-color: #ffcf5a; }
  .nlsb-topbar-cell[data-venue-rank='2'] .nl-story-userlane-avatar { border-color: #d8dde6; }
  .nlsb-topbar-cell[data-venue-rank='3'] .nl-story-userlane-avatar { border-color: #e0a878; }
  .nlsb-topbar-cell[data-venue-rank]::after {
    position: absolute;
    top: -4px;
    right: 2px;
    z-index: 2;
    font-size: 15px;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .nlsb-topbar-cell[data-venue-rank='1']::after { content: '🥇'; }
  .nlsb-topbar-cell[data-venue-rank='2']::after { content: '🥈'; }
  .nlsb-topbar-cell[data-venue-rank='3']::after { content: '🥉'; }
  .nlsb-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-note {
    color: rgba(255, 255, 255, 0.62);
    font-size: 10px;
    white-space: nowrap;
  }
  /* Phase C(council/pachinko-ultimate-SYNTHESIS.md §6): 盛り上がりフェーズの色替えチップ。
     一度作ったDOM要素はremoveしない(churn地雷対策)。クラス切替のみで進行を表す。 */
  .nlsb-phase-meter {
    flex: 0 0 auto;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.55);
    transition: background-color 0.4s ease, color 0.4s ease;
  }
  .nlsb-phase-meter--atsui { background: rgba(255, 196, 0, 0.22); color: #ffd76a; }
  .nlsb-phase-meter--reach { background: rgba(255, 122, 0, 0.28); color: #ffab5c; }
  .nlsb-phase-meter--breakthrough,
  .nlsb-phase-meter--jackpot { background: rgba(255, 64, 64, 0.32); color: #ff8a8a; }
  .nlsb-phase-meter--payout { background: rgba(255, 213, 79, 0.35); color: #ffe58a; }
  /* 修正4: リーチ中は点滅系クラス+突破/大当たりチェーン発火時は強調アニメ(§本体)。
     いずれもクラス切替のみ(DOM追加削除なし・派手なカットインは作らない)。 */
  .nlsb-phase-meter--blink { animation: nlsb-phase-meter-blink 1.1s ease-in-out infinite; }
  .nlsb-phase-meter--pulse { animation: nlsb-phase-meter-pulse 0.5s ease-out; }
  @keyframes nlsb-phase-meter-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  @keyframes nlsb-phase-meter-pulse {
    0% { transform: scale(1); }
    40% { transform: scale(1.22); }
    100% { transform: scale(1); }
  }
  .nlsb-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
  }
  /* コメビュ起動ボタン(会場ヘッダー右)。読み上げ付きコメントビューアを別窓で開く。 */
  .nlsb-comeview-btn {
    flex: 0 0 auto;
    min-height: 28px;
    padding: 4px 11px;
    border: 1px solid rgba(141, 200, 255, 0.4);
    border-radius: 999px;
    background: rgba(30, 41, 56, 0.7);
    color: #cfe6ff;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: auto;
  }
  .nlsb-comeview-btn:hover {
    background: rgba(48, 64, 86, 0.92);
    border-color: rgba(141, 200, 255, 0.6);
  }
  .nlsb-comeview-btn:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-seats {
    grid-area: seats;
    position: relative;
    display: block;
    gap: clamp(0px, 0.2vh, 4px);
    min-height: 0;
    box-sizing: border-box;
    padding: clamp(10px, 2vh, 22px) 14px;
    --nl-surface: rgba(255, 255, 255, 0.96);
    --nl-border: rgba(78, 109, 148, 0.26);
    --nl-text: #243244;
    --nl-text-sub: #56687d;
    --nl-muted: #6f7c8b;
    --nl-user-accent: #5aa7ff;
    /*
     * 横スクロールバー根絶(ユーザー不満「位置がずれてスクロールバーが出て変な動きで
     * 見えなくなる」): 同時表示人数は selectStableVisibleMembers で行に収まる数に制限済み
     * なので横溢れは起きないが、保険として overflow-x:hidden で横スクロールを構造的に殺す。
     * 縦も clip(段数が増えても下端 35vh に収め、映像へはみ出さない)。 -> 見切れる不満解消のため auto に変更
     */
    overflow-x: hidden;
    overflow-y: auto;
    /* v0.1.1129: 会場のスクロールバー非表示(ユーザー要望「会場モードはスクロールバーが
       でてるのなくせないですか?」)。スクロール機能(ホイール/パン/タッチ)はそのまま=
       バーの見た目だけ消す。①POPは触らない(会場スコープのみ)。 */
    scrollbar-width: none;
    /* 2026-06-14 会議(摩擦ゼロUI): 会場は左ドラッグでパンできる=grab カーソルで掴めると示す。
       席リンク(.nlsb-seat-link)上はリンクカーソルを優先(下のセレクタで上書き)。
       v0.1.738: パンできる(縦に溢れている)時だけ grab を出す=掴めるのに動かない誤解を防ぐ。
       全席が画面に収まる時は通常カーソル。.nlsb-can-pan を renderSeats が溢れ時に付与。 */
    cursor: default;
    touch-action: pan-y;
    background:
      radial-gradient(ellipse at 50% 100%, rgba(102, 144, 190, 0.16), transparent 62%);
    overscroll-behavior: contain;
    contain: layout paint;
  }
  /* v0.1.1129: Chrome系のスクロールバー非表示(scrollbar-width:none の webkit 版)。 */
  .nlsb-seats::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
  .nlsb-seats.nlsb-mode-empty {
    display: grid;
    place-items: center;
  }
  /* LANE_CSS_SYNC_BEGIN popup.html:829-1067 */
  .nlsb-venue-lane-stack.nl-story-userlane-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-x: hidden;
    overflow-y: visible;
    margin: 0 0 4px;
    min-height: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-tier-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-tier-wrap--gift {
    padding: 6px 6px 4px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--nl-surface) 82%, #e8b84a 18%);
    border: 1px solid color-mix(in srgb, var(--nl-border) 70%, #d4a017 30%);
  }
  .nlsb-venue-lane-stack .nl-story-userlane-tier-hint {
    margin: 0;
    padding: 4px 6px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.4;
    color: var(--nl-text-sub);
    border-radius: 8px;
    background: color-mix(in srgb, var(--nl-surface) 88%, #b8a06a 12%);
    border: 1px solid color-mix(in srgb, var(--nl-border) 75%, #c9a227 25%);
  }
  .nlsb-venue-lane-stack .nl-story-userlane {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    align-content: flex-start;
    gap: 6px 8px;
    margin: 0;
    min-height: 0;
    max-height: none;
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
    /* v0.1.1133: v0.1.1129 は外枠 .nlsb-seats のスクロールバーだけ消しており、①からの
       転写元 CSS(LANE_CSS_SYNC_BEGIN)にある段自体(たぬ姉等)の overflow-x:auto には
       効いていなかった(段だけ独自スクロールバーが出る不具合)。ここにも同様に適用する。 */
    scrollbar-width: none;
  }
  .nlsb-venue-lane-stack .nl-story-userlane::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    flex-shrink: 0;
    max-width: 100%;
    min-width: 0;
    border-radius: 999px;
    padding-right: 6px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell--accent {
    padding: 3px 5px 3px 3px;
    background: color-mix(in srgb, var(--nl-user-accent) 20%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--nl-user-accent) 48%, transparent);
  }
  .nlsb-venue-lane-stack a.nl-story-userlane-cell--linkable {
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    transition: background-color 0.12s;
  }
  .nlsb-venue-lane-stack a.nl-story-userlane-cell--linkable:hover {
    background-color: color-mix(in srgb, var(--nl-border) 40%, transparent);
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    min-width: 0;
    /* ①popup.html の html.nl-inline(動画埋め込み表示)限定拡大ルールと同値。
       会場は常にその表示に相当するため無条件適用(avatar 38px 拡大と同じ扱い)。 */
    max-width: min(142px, 34vw);
    font-size: 11px;
    line-height: 1.22;
    text-align: left;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta__id,
  .nlsb-venue-lane-stack .nl-story-userlane-meta__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta__id {
    color: var(--nl-text-sub);
    font-weight: 600;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta__name {
    color: var(--nl-text);
    font-weight: 500;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-avatar {
    width: 38px;
    height: 38px;
    border-radius: 999px;
    object-fit: cover;
    object-position: center;
    border: 1.5px solid color-mix(in srgb, var(--nl-border) 82%, #fff 18%);
    box-shadow: 0 1px 3px rgb(2 17 31 / 22%);
    background: var(--nl-surface);
    flex-shrink: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-avatar.nl-avatar--tv-fallback {
    object-fit: contain;
    padding: 3px;
    background: linear-gradient(180deg, #efebe9, #d7ccc8);
    border-color: color-mix(in srgb, #8d6e63 55%, var(--nl-border) 45%);
  }
  /* ★v0.1.1049: サムネ持ち=大(現状38px維持) / 匿名(実サムネ無し)=小・ぎゅうぎゅう詰め。
     popup.html と同じ規約([data-thumb="0"] 側のみ・displaySrc が http か)を会場にも。
     VIP金縁/streak/順位バッジは border/box-shadow を触るだけ=サイズ非依存で競合しない。 */
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-avatar {
    width: 22px;
    height: 22px;
    border-width: 1px;
    box-shadow: none;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-thumb="0"] {
    gap: 4px;
    padding-right: 4px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-meta {
    font-size: 9px;
    max-width: 72px;
  }
  /* ★v0.1.1376: たぬ姉段の段内LOD(遠近法)。popup.html と同じ規約を会場にも。
     先頭24人は読めるpill / 25人目以降の匿名はアイコンのみ=群れとして見せる。
     ★会場はタイルが wrapTileEl でラップされる(renderStoryUserLaneDom.js:402)ので
     【子孫形】で書く(①popup は直接子形)。ここを直接子形にすると会場だけ効かない。
     根拠と実測(1,615px→598px)は popup.html の同名ブロックのコメント参照。 */
  .nlsb-venue-lane-stack .nl-story-userlane--tanu > :nth-child(n + 25) .nl-story-userlane-cell[data-thumb="0"] {
    gap: 0;
    padding-right: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane--tanu > :nth-child(n + 25) .nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-meta {
    display: none;
  }
  .nlsb-venue-lane-stack .nl-story-userlane--tanu > :nth-child(n + 25) .nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-avatar {
    width: 22px;
    height: 22px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
    margin: 0 0 6px;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__lines {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__line {
    display: flex;
    align-items: flex-start;
    /* 顔アイコンを display:none にしたぶん、左の余白は不要(v0.1.1199)。 */
    gap: 0;
    padding: 5px 8px;
    border-radius: 10px;
    background: linear-gradient(180deg, #fffaf0, #fff4db);
    border: 1px solid #f5d28d;
    color: #6b4f18;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.38;
    box-shadow: 0 1px 5px rgb(148 101 14 / 9%);
    min-width: 0;
  }
  /*
   * v0.1.1199(ユーザー要望 2026-07-31): 会場では段の説明文からキャラ顔アイコンを外す。
   *   説明文は5段ぶん繰り返されるため、24pxの丸顔+枠が5回並んで場所を取り、
   *   会場が賑わっている(191人)ときほど参加者の邪魔になっていた。文言自体は
   *   「どの段か」を伝える役目があるので残し、装飾だけ落とす。
   *   ①POP側は storyUserLaneGuideHtml.js が正本で従来どおり顔つき(このCSSは会場限定)。
   */
  /*
   * 2026-08-01(v0.1.1220): v0.1.1199 の display:none を撤回して復活。
   *   消してほしかったのは「映像に重なる」3キャラ常駐(v0.1.1214で対応済み)の方で、
   *   段の説明文の顔アイコンは映像に重ならないので残す=ユーザー確定
   *   「重ならない部分は残してほしい」。
   *   ★「会場=①と見た目もそっくり同じ」方針に従い①側と同じ寸法。
   */
  .nlsb-venue-lane-stack .nl-story-userlane-guide__face {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    object-fit: cover;
    object-position: center;
    border: 1px solid color-mix(in srgb, var(--nl-border) 82%, #fff 18%);
    background: var(--nl-surface);
    flex: 0 0 auto;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__foot {
    margin: 2px 0 0;
    padding: 0 2px;
    font-size: 10px;
    font-weight: 800;
    color: var(--nl-muted);
    line-height: 1.35;
  }
  .nlsb-venue-lane-stack .nl-story-userlane__empty-note {
    margin: 4px 0 2px;
    padding: 8px 10px;
    font-size: clamp(10px, 2.4vw, 11px);
    line-height: 1.45;
    font-weight: 600;
    color: var(--nl-text-sub);
    border-radius: 10px;
    background: color-mix(in srgb, var(--nl-surface) 92%, var(--nl-border) 8%);
    border: 1px solid color-mix(in srgb, var(--nl-border) 70%, transparent);
  }
  .nlsb-venue-lane-stack .nl-story-userlane__empty-note-p {
    margin: 0 0 6px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane__empty-note-p:last-child {
    margin-bottom: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__count {
    color: #9a6f12;
    font-weight: 800;
  }
  /* LANE_CSS_SYNC_END */
  .nlsb-story-diag {
    margin: 8px 0 10px;
    padding: 8px 10px 10px;
    border: 1px solid color-mix(in srgb, var(--nl-border) 74%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--nl-surface) 94%, #f4fbff 6%);
    color: var(--nl-text-sub);
    font-size: 11px;
    line-height: 1.45;
  }
  .nlsb-story-diag__head {
    margin: 0 0 6px;
    color: var(--nl-text);
    font-size: 11px;
    font-weight: 800;
  }
  .nlsb-story-diag .nl-story-diag__lead {
    margin: 0 0 6px;
  }
  .nlsb-story-diag .nl-story-diag__lead strong {
    color: var(--nl-text);
    font-weight: 800;
  }
  .nlsb-story-diag .nl-story-diag__more {
    margin: 0;
    padding: 4px 8px 6px;
    border: 1px solid color-mix(in srgb, var(--nl-border) 80%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--nl-surface) 92%, transparent);
  }
  .nlsb-story-diag .nl-story-diag__summary {
    cursor: pointer;
    color: var(--nl-muted);
    font-size: 10px;
    font-weight: 700;
    list-style-position: outside;
  }
  .nlsb-story-diag .nl-story-diag__body {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid color-mix(in srgb, var(--nl-border) 65%, transparent);
    color: var(--nl-muted);
    font-size: 10px;
    line-height: 1.4;
  }
  .nlsb-story-diag .nl-story-diag__list {
    margin: 0 0 6px;
    padding-left: 1.1em;
  }
  .nlsb-story-diag .nl-story-diag__list li {
    margin-bottom: 4px;
  }
  .nlsb-story-diag .nl-story-diag__technical {
    margin: 0;
    color: var(--nl-text-sub);
    font-size: 10px;
    overflow-wrap: anywhere;
  }
  .nlsb-seat {
    position: relative;
    display: inline-flex;
    min-width: 0;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    overflow: visible;
  }
  .nlsb-seats.nlsb-can-pan {
    cursor: grab;
  }
  .nlsb-seats.nlsb-is-grabbing {
    cursor: grabbing;
    user-select: none;
  }
  /* 診断: メンバー一覧パネル(モーダル風)。会場の上に重ねて出す。 */
  .nlsb-roster-panel {
    position: absolute;
    top: 8%;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, 92vw);
    max-height: 72vh;
    z-index: 6;
    display: flex;
    flex-direction: column;
    background: rgba(18, 22, 30, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    color: #eef1f6;
    font-size: 13px;
    overflow: hidden;
  }
  .nlsb-roster-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }
  .nlsb-roster-close {
    /* v0.1.738: 当たり判定を広げ(36x36)確実に押せるように。背景を薄く付けて存在を明示。 */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    color: #eef1f6;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 8px;
  }
  .nlsb-roster-close:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  .nlsb-roster-close:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-roster-summary {
    padding: 8px 14px;
    font-size: 12px;
    color: #b9c2d0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .nlsb-roster-list {
    overflow-y: auto;
    padding: 6px 0;
  }
  .nlsb-roster-row {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
  }
  .nlsb-roster-row:nth-child(odd) {
    background: rgba(255, 255, 255, 0.03);
  }
  .nlsb-roster-seat {
    color: #8b94a3;
    font-variant-numeric: tabular-nums;
  }
  .nlsb-roster-who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /*
   * 2026-07-31: 発言パネル(クリックで開く)は本文を読ませるのが目的なので、
   *   名簿の1行省略(nowrap+ellipsis)を打ち消して折り返す。名簿側の見た目は変えない。
   */
  .nlsb-speech-panel .nlsb-roster-who {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    word-break: break-word;
    line-height: 1.45;
  }
  .nlsb-speech-panel .nlsb-roster-badges {
    flex: 0 0 auto;
    opacity: 0.7;
    font-size: 11px;
    white-space: nowrap;
  }
  .nlsb-speech-panel .nlsb-roster-row {
    align-items: flex-start;
    gap: 8px;
  }
  .nlsb-roster-badge {
    display: inline-block;
    margin-left: 4px;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
  }
  .nlsb-roster-badge.thumb { background: rgba(255, 200, 90, 0.25); color: #ffd66f; }
  .nlsb-roster-badge.gift { background: rgba(120, 200, 255, 0.22); color: #9fd4ff; }
  .nlsb-roster-badge.on { background: rgba(120, 220, 140, 0.22); color: #9fe6af; }
  .nlsb-roster-badge.off { background: rgba(255, 255, 255, 0.08); color: #99a2b0; }
  .nlsb-roster-empty {
    padding: 24px 14px;
    text-align: center;
    color: #99a2b0;
  }
  /* 2026-07-01 会議(venue-diag): 「🩺 会場の状態」パネルの中身。roster と同じ overlay 枠を流用し、
     内側の文章だけをここで整える。件数のみ・PII なし(純関数 venueAvatarDiagLine.js が組む)。 */
  .nl-venue-diag {
    padding: 12px 14px 14px;
    line-height: 1.7;
    font-size: 13px;
    color: #d7dce6;
  }
  .nl-venue-diag p { margin: 0 0 8px; }
  .nl-venue-diag p:last-child { margin-bottom: 0; }
  .nl-venue-diag strong { color: #fff; }
  .nl-venue-diag__warn { color: #ffcf7a; }
  .nl-venue-diag__ok { color: #9fe6af; }
  .nl-venue-diag__foot {
    font-size: 11px;
    color: #99a2b0;
  }
  .nlsb-seat.nlsb-is-empty {
    display: none;
    opacity: 0.12;
    pointer-events: none;
    filter: blur(0.5px);
  }
  /* 2026-06-15 星野ロミ会議(サムネ優遇を"一目で特別"に): 1.12倍では脳が比較を要求し
     ノイズとして処理される(ユーザー実機「特別になってない」)→倍率の"断絶"を作る。
     会議7体一致=scale 1.45(28→約40px)で「大きい=重要」を本能で認識させる。金縁を太く
     はっきり+明るさ+12%。脈動は付けない(止まった大きさ=存在そのもの・上品さを保つ)。 */
  .nlsb-seat.nlsb-seat-vip .nl-story-userlane-avatar {
    filter: brightness(1.12);
    border-color: rgba(255, 220, 130, 1);
    box-shadow: 0 0 0 2px rgba(255, 206, 96, 0.55), 0 0 10px 1px rgba(255, 190, 70, 0.42), 0 1px 3px rgb(2 17 31 / 22%);
    z-index: 5;
  }
  /* 2026-07-01 会議(venue-grid-diag): 応援者ランキング上位3位の席に順位バッジを重ねる。
     旧「金色オーラで脈動」はユーザー要望で廃止(ピカピカ演出なし)。バッジは席の右上に
     絵文字(🥇🥈🥉)を絶対配置で重ねるだけ=高さ・レイアウトを一切変えない(v0.1.1026 の
     高さ振動を原理的に踏まない)。脈動・アニメーションは付けない(上品さ・静けさを保つ)。 */
  .nlsb-seat[data-venue-rank] {
    position: relative;
  }
  .nlsb-seat[data-venue-rank]::after {
    position: absolute;
    top: -2px;
    right: -2px;
    z-index: 6;
    font-size: 0.9em;
    line-height: 1;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  }
  .nlsb-seat[data-venue-rank='1']::after { content: '🥇'; }
  .nlsb-seat[data-venue-rank='2']::after { content: '🥈'; }
  .nlsb-seat[data-venue-rank='3']::after { content: '🥉'; }
  /* v0.1.742 一緒に過ごしている感(co-presence): 誰かがコメントした瞬間、その人の席が
     ふわっと一度だけ反応する。吹き出しだけでなく「会場が一人ひとりの発言に反応する」ことで
     一緒にいる感を強める(星野式・摩擦ゼロ=自動・設定不要)。0.6秒で1回だけ・上品に。 */
  .nlsb-seat.nlsb-seat-speaking .nl-story-userlane-avatar {
    animation: nlsb-seat-speak 0.6s ease-out;
  }
  @keyframes nlsb-seat-speak {
    0% {
      transform: scale(1);
    }
    35% {
      transform: scale(1.18);
      filter: brightness(1.15);
    }
    100% {
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-seat.nlsb-seat-speaking .nl-story-userlane-avatar {
      animation: none;
    }
  }
  /*
   * 2026-08-08 入場演出(サイドパネル→会場へ「運ぶ」): 新しく来た人のアイコンが
   * 画面端から自分の席へ弧を描いて飛び、着弾で席が一度ふくらむ。
   *
   * ★これは飾りであると同時に【計器】でもある。会場は「気づいたら居る」ので
   *   載っていないのか目立たないのか区別できない。入場をイベントにすると
   *   「飛んでこない＝載っていない」が目視で分かる。
   *   だから reduced-motion でも【消さずに】ゆっくり出す(検証価値を残す)。
   *
   * 正本SPEC: docs/handoff/venue-transport-effect-SPEC-2026-08-08.md
   */
  .nlsb-entry-proj {
    position: absolute;
    left: 0;
    top: 0;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    overflow: hidden;
    pointer-events: none;
    opacity: 0;
    z-index: 6;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85), 0 6px 18px rgba(0, 0, 0, 0.5);
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
  }
  .nlsb-entry-proj img,
  .nlsb-entry-proj .nl-story-userlane-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 50%;
  }
  .nlsb-entry-proj.is-flying {
    animation: nlsb-entry-fly var(--nlsb-entry-dur, 900ms) cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  }
  @keyframes nlsb-entry-fly {
    0%   { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
    12%  { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    60%  { transform: translate(calc(-50% + var(--nlsb-entry-mx)), calc(-50% + var(--nlsb-entry-my))) scale(1.06); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--nlsb-entry-dx)), calc(-50% + var(--nlsb-entry-dy))) scale(0.92); opacity: 0; }
  }
  /* 着弾: 席が一度だけふくらんで「確定」を示す。 */
  .nlsb-seat.nlsb-seat-entered .nl-story-userlane-avatar {
    animation: nlsb-seat-enter 0.5s ease-out;
  }
  @keyframes nlsb-seat-enter {
    0%   { transform: scale(0.72); filter: brightness(1.3); }
    55%  { transform: scale(1.14); filter: brightness(1.12); }
    100% { transform: scale(1); filter: brightness(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    /* ★飛ばさない。ただし【消さない】=着弾点でふわっと出して消える(入場が分かる)。 */
    .nlsb-entry-proj.is-flying {
      animation: nlsb-entry-fade var(--nlsb-entry-dur, 900ms) ease-out forwards;
    }
    @keyframes nlsb-entry-fade {
      0%   { transform: translate(calc(-50% + var(--nlsb-entry-dx)), calc(-50% + var(--nlsb-entry-dy))) scale(1); opacity: 0; }
      25%  { transform: translate(calc(-50% + var(--nlsb-entry-dx)), calc(-50% + var(--nlsb-entry-dy))) scale(1); opacity: 0.95; }
      75%  { transform: translate(calc(-50% + var(--nlsb-entry-dx)), calc(-50% + var(--nlsb-entry-dy))) scale(1); opacity: 0.95; }
      100% { transform: translate(calc(-50% + var(--nlsb-entry-dx)), calc(-50% + var(--nlsb-entry-dy))) scale(1); opacity: 0; }
    }
    .nlsb-seat.nlsb-seat-entered .nl-story-userlane-avatar { animation: none; }
  }
  /* v0.1.743 「会話の連鎖」(会議の最大多数決の本命・弱点A/C): 同じ人が短い間隔で続けて喋ると、
     その席が段階的に暖色(コーラル)で輝き、連続するほど強く速く脈動する=「溜まっていく感」。
     金色オーラ(.nlsb-seat-regular=支えてる人)とは別軸の「いま盛り上げてる人」を引き立てる。
     data-streak=1..4 を JS が席に付け、段階ごとに色の強さ/脈動速度が上がる。発言が途切れると
     prune で data-streak が外れて自然に消える。*/
  .nlsb-seat[data-streak] .nl-story-userlane-avatar {
    box-shadow: 0 0 9px 2px rgba(255, 138, 92, 0.6), inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    animation: nlsb-seat-streak 1.4s ease-in-out infinite;
    z-index: 4;
  }
  .nlsb-seat[data-streak="2"] .nl-story-userlane-avatar { box-shadow: 0 0 11px 3px rgba(255, 132, 86, 0.72), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 1.2s; }
  .nlsb-seat[data-streak="3"] .nl-story-userlane-avatar { box-shadow: 0 0 13px 4px rgba(255, 120, 80, 0.82), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 1.0s; }
  .nlsb-seat[data-streak="4"] .nl-story-userlane-avatar { box-shadow: 0 0 16px 5px rgba(255, 108, 74, 0.92), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 0.85s; }
  @keyframes nlsb-seat-streak {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.18); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-seat[data-streak] .nl-story-userlane-avatar {
      animation: none;
    }
  }
  /* 数値 ID 持ち=クリックでユーザーページへ飛べるリンク。会場は開時のみ操作可能。
     リンク本体は本物タイルの a.nl-story-userlane-cell--linkable が持つので、ラッパー(.nlsb-seat-link)は
     カーソルとヒットテスト透過だけを担う。 */
  a.nlsb-seat-link,
  .nlsb-seat.nlsb-seat-link {
    cursor: pointer;
    pointer-events: auto;
  }
  .nlsb-seat .nl-story-userlane-cell {
    pointer-events: auto;
  }
  .nlsb-seat-link:hover .nl-story-userlane-meta__name {
    color: #bfe1ff;
    text-decoration: underline;
  }
  .nlsb-seat-link:hover .nl-story-userlane-avatar {
    border-color: rgba(191, 225, 255, 0.6);
  }
  .nlsb-seat-link:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
    border-radius: 3px;
  }
  /*
   * 会議確定A: 吹き出し専用の最上位レイヤー。席コンテナ(.nlsb-seats overflow:hidden)の
   * 外・stage 直下に置き、セリフがクリップされない/アバターに潜らない。
   */
  .nlsb-bubble-layer {
    position: absolute;
    inset: 0;
    z-index: 5;
    overflow: visible;
    pointer-events: none;
  }
  /*
   * 吹き出し本体。レイヤー基準で left/top を JS が席頭上にセットする。
   * translate(-50%, -100%) で「指定点が吹き出しの下辺中央」になる。
   * 会議確定B: font 18px(12px から大幅拡大)・最大2行・読みやすさ最優先(星野ロミ流)。
   */
  /*
   * 2026-07-30(wayfinder→to-spec方式・venue-avatar-hover-preview): 会場アイコンのホバー
   * プレビューカード。吹き出し(z:5)より前・投げ物演出(z:7)より背面になるよう z:6 とし、
   * stage 直下の最後に append することで常駐レイヤー(同z:6)より DOM 順で手前にする。
   * pointer-events:none=マウスを一切奪わない(カード越しのクリック・ドラッグ・下のタイルへの
   * ホバーは素通し)。表示/非表示はクラス nlsb-hover-card--open のトグルのみ(最小構成)。
   */
  .nlsb-hover-card {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 6;
    display: none;
    box-sizing: border-box;
    width: max-content;
    max-width: min(26ch, 70vw);
    padding: 10px 12px;
    gap: 10px;
    border: 1px solid rgba(20, 29, 42, 0.16);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.97);
    color: #141d28;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34);
    pointer-events: none;
  }
  .nlsb-hover-card.nlsb-hover-card--open {
    display: flex;
  }
  .nlsb-hover-card__avatar-box {
    flex: 0 0 auto;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: rgba(20, 29, 42, 0.12);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nlsb-hover-card__avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .nlsb-hover-card__body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
    line-height: 1.4;
  }
  .nlsb-hover-card__name {
    font-size: 15px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-hover-card__id {
    /* 2026-07-30(council-fable設計・venue-hover-card-content-DESIGN.md 必答1): 文言は
       そのまま(匿名の同一人物照合に必須)・体裁だけ格下げ(名前/活動より控えめな見た目)。 */
    font-size: 11px;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-hover-card__stats {
    font-weight: 600;
  }
  /*
   * 2026-07-31(ユーザー要望): 直前の発言内容。「多忙なあやりん」が何を言ったか分からない、
   *   という指摘への回答。本文はモデル側で60字に畳んであるが、それでも席を覆わないよう
   *   2行までで省略する(カードは会場の上に重なるため縦に伸ばさない)。
   */
  /* v0.1.1218: 直近数件を縦に並べる。以前は1件前提で -webkit-line-clamp:2 だったため、
     複数件にすると3行目以降が隠れて「出しているのに見えない」状態になっていた。 */
  .nlsb-hover-card__last-text {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.4;
    opacity: 0.9;
    word-break: break-word;
  }
  /* 1件ぶん。長文は buildVenueHoverCardModel 側で既に切ってあるので、ここでは
     2行までに抑えて「1件が縦に伸びてカードが会場を覆う」のを防ぐ。 */
  .nlsb-hover-card__speech {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .nlsb-hover-card__speech + .nlsb-hover-card__speech {
    margin-top: 2px;
    opacity: 0.72; /* 古い発言ほど控えめ=最新がどれか一目で分かる */
  }
  .nlsb-hover-card__thumb-status {
    opacity: 0.65;
    font-size: 12px;
  }
  .nlsb-bubble {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 5;
    box-sizing: border-box;
    width: max-content;
    max-width: min(30ch, 40vw);
    padding: 9px 13px;
    overflow: hidden;
    border: 1px solid rgba(20, 29, 42, 0.16);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.97);
    color: #141d28;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34);
    font-size: clamp(16px, 1.4vw, 20px);
    font-weight: 700;
    line-height: 1.4;
    opacity: 1;
    overflow-wrap: anywhere;
    word-break: break-all;
    pointer-events: none;
    text-shadow: none;
    transform: translateY(-100%);
    white-space: normal;
    animation: nlsb-bubble-pop 160ms ease-out;
    transition: opacity ${BUBBLE_FADE_MS}ms ease;
  }
  .nlsb-bubble::after {
    position: absolute;
    top: 100%;
    left: var(--nlsb-bubble-tail-x, 50%);
    width: 0;
    height: 0;
    border: 7px solid transparent;
    border-top-color: rgba(255, 255, 255, 0.97);
    content: "";
    transform: translateX(-50%);
  }
  .nlsb-bubble.nlsb-is-leaving {
    opacity: 0;
  }
  /* v0.1.800「吹き出しと読み上げを同時に立ち上げる」(会議 案C・2段階表示):
     読み上げONのとき、声が鳴り始める前は「仮(淡い・少し小さい)」で出し、onAudioStart で
     仮 class を外す瞬間に「本(鮮明・等倍)」へ瞬時昇格=声と同時に立ち上がった体感を作る。
     声非依存(v0.1.757)は不変: 仮でも必ず即出る・声が来なければ仮のまま流速寿命で消える。
     transition は短く(120ms)=「遅延」と感じない範囲で昇格のメリハリだけ付ける。 */
  .nlsb-bubble.nlsb-bubble-previoice {
    opacity: 0.78;
    transform: translateY(-100%) scale(0.965);
    transform-origin: bottom center;
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-bubble.nlsb-bubble-previoice {
      transform: translateY(-100%);
      transition: none;
    }
  }
  /* v0.1.773 軽い同期: 読み上げが鳴り始めた瞬間に一度だけ淡く光らせ「声＝この吹き出し」を結ぶ。
     上品に1回だけ(派手すぎ厳禁)。即時表示は変えない=即時性は維持。 */
  .nlsb-bubble.nlsb-bubble-voiced {
    animation: nlsb-bubble-voiced 620ms ease-out;
  }
  @keyframes nlsb-bubble-voiced {
    0% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 0 rgba(141, 200, 255, 0.55); }
    40% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 5px rgba(141, 200, 255, 0.32); }
    100% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 0 rgba(141, 200, 255, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-bubble.nlsb-bubble-voiced { animation: none; }
  }
  @keyframes nlsb-bubble-pop {
    from {
      opacity: 0;
      transform: translateY(calc(-100% + 6px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(-100%);
    }
  }
  .nlsb-bubble-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .nlsb-empty-message {
    display: none;
    color: rgba(255, 255, 255, 0.52);
    font-size: 12px;
    letter-spacing: 0.02em;
  }
  .nlsb-seats.nlsb-mode-empty .nlsb-empty-message {
    display: block;
  }
  .nlsb-crowd-canvas {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: clamp(200px, 40vh, 350px);
    z-index: 0; /* ひな壇(.nlsb-seating z:1)の裏 */
    pointer-events: none;
    opacity: 0;
    transition: opacity 1200ms ease-in-out;
    mix-blend-mode: screen; /* サイリウムを美しく光らせる */
  }
  .nlsb-crowd-canvas.nlsb-is-visible {
    opacity: 1;
  }
  @media (max-width: 900px) {
    /* ★2026-08-11: fixed 化に伴い、狭い窓では少し内側+上に寄せる。
       ニコ生の右下UI(コメント入力欄まわり)と重なって押せなくなるのを避ける。 */
    .nlsb-toggle {
      right: 12px;
      bottom: 76px;
      font-size: 14px;
      padding: 10px 16px;
    }
    .nlsb-stage {
      padding-right: 10px;
      padding-left: 10px;
    }
    .nlsb-stage-layout {
      grid-template-rows: minmax(120px, 22vh) minmax(0, 1fr);
    }
    .nlsb-center {
      width: min(620px, 92vw);
      border-radius: 14px;
    }
    .nlsb-seats {
      padding-right: 10px;
      padding-left: 10px;
    }
  }
  @media (max-height: 560px) {
    .nlsb-stage {
      padding-top: 48px;
      padding-bottom: 54px;
    }
    .nlsb-stage-layout {
      grid-template-rows: minmax(100px, 22vh) minmax(0, 1fr);
      gap: 10px;
    }
    .nlsb-center {
      gap: 5px;
      padding-top: 14px;
      padding-bottom: 14px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-toggle,
    .nlsb-stage,
    .nlsb-seat,
    .nlsb-bubble {
      transition: none;
    }
    .nlsb-bubble {
      animation: none;
    }
  }
  /* v0.1.1115 ①POP遮蔽(reference_venue_pop_copy_SYNTHESIS.md §C-1): 会場open中は①POP(インライン
     埋め込みホスト)を畳む。会場=①の鏡なので同じ情報の二重表示であり、①のキャラ案内バナーが
     会場の背景に透けて邪魔になるのを消す。配信映像と本家watch UIは今後も素通し(スモーク禁止
     方針は不変・隠すのは拡張自身の冗長UIのみ)。
     ★display:none は禁止: iframe のレイアウト消滅で①の paint/鏡publish が痩せ、会場は鏡で
     生きているため自殺になる。visibility:hidden はレイアウト保持=鏡は生き続ける。 */
  html.nlsb-venue-open #nls-inline-popup-host {
    visibility: hidden !important;
    pointer-events: none !important;
  }
  /* v0.1.1119 見た目①化(P5・reference_venue_pop_copy_SYNTHESIS.md §C-3): 段(レーン帯)配下は
     ①応援レーンと同じ見た目に=会場独自の席装飾(VIP金縁・連鎖発光)を段の中では無効化する。
     順位バッジ(🥇🥈🥉)と発話の一拍(speaking)は残す(既存ユーザー指示=光る演出なし・バッジのみ)。
     ★LANE_CSS_SYNC マーカー区間の外に書く(区間内直接編集は同期テスト赤/黙ったdriftの地雷)。
     ★席ラップ(.nlsb-seat)の display/overflow は触らない(吹き出し/ギフト起点の座標系を変えない)。 */
  .nlsb-venue-lane-stack .nlsb-seat.nlsb-seat-vip .nl-story-userlane-avatar {
    filter: none;
    border-color: color-mix(in srgb, var(--nl-border) 82%, #fff 18%);
    box-shadow: none;
    z-index: auto;
  }
  .nlsb-venue-lane-stack .nlsb-seat[data-streak] .nl-story-userlane-avatar {
    box-shadow: none;
    animation: none;
    z-index: auto;
  }
  /* v0.1.1121 surface行単位化(C): v0.1.1119 の stack 全面surfaceは、ガイド/空文込みの下端55vh
     バンド全体を白い大パネルにして画面下半分を占有した(実機で確認)。surfaceは【実在タイルの行
     (.nl-story-userlane)だけ】に敷く=透け防止(タイル背後)と「画面を占有しない」を粒度で両立。
     空の段は hidden(display:none)なので白帯自体が存在しない。①と同じ不透明(半透明は棄却=
     透け防止の毀損+①との見た目差の再導入)。 */
  .nlsb-venue-lane-stack .nl-story-userlane {
    background: var(--nl-surface);
    border: 1px solid var(--nl-border);
    border-radius: 10px;
    padding: 6px;
  }
  /* gift/ad 段は wrap 自体が金色surface(--gift ルール)を既に持つ=行に重ねるとカードの入れ子に
     なるため除外。 */
  .nlsb-venue-lane-stack .nl-story-userlane-tier-wrap--gift .nl-story-userlane {
    background: none;
    border: none;
    padding: 0;
  }
`;

// colorFromKey(名前/IDから色生成)は person-tile-unify 第3コミットで不要になり削除。
//   席タイルは本物 buildPersonTileEl が描き、アバター枠の背景は CSS(.nl-story-userlane-avatar)が担う。

/** @type {string|null} */
let _forcedLiveId = null;

/**
 * @returns {string}
 */
function liveIdFromPathname() {
  if (_forcedLiveId) return _forcedLiveId;
  const match = String(location.pathname || '').match(/^\/watch\/(lv\d{1,15})(?:\/|$)/i);
  return match ? match[1].toLowerCase() : '';
}

function ensureVenueStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = VENUE_CSS;
  (document.head || document.documentElement).appendChild(style);
}

/**
 * 席ノードを作る。person-tile-unify 第3コミット(2026-06-22): 席タイル本体は描かず、
 *   演出(VIP/常連/発話/streak)を被せる【ラッパー】だけを用意する。タイル本体は renderSeats で
 *   popup の本物 buildPersonTileEl を差し込む(顔ぶれ・見た目を popup「アイコン列」と一致)。
 *
 *   ラッパーは <div>(<a> ではない): リンク(クリックでユーザーページ)は本物タイルが自前で
 *   <a href> を持つ(buildPersonTileEl が linkable 判定で生成)。ラッパーを <a> にすると <a>in<a>
 *   入れ子になるため div にして、リンク判定は popup と同一基準(本物タイル)へ完全に委ねる。
 *
 * @param {number} seatIndex
 */
function createSeatNode(seatIndex) {
  const seat = document.createElement('div');
  seat.className = 'nlsb-seat nlsb-is-empty';
  seat.dataset.seatIndex = String(seatIndex);
  seat.setAttribute('aria-hidden', 'true');
  // tile: renderSeats が buildPersonTileEl で作る本物タイル要素(.nl-story-userlane-cell)。
  //   座標測定(吹き出し/ギフト)は tile 内の .nl-story-userlane-avatar を基準にする。
  return { seat, tile: /** @type {HTMLElement|null} */ (null) };
}

/**
 * 会場用の応援レーンDOM骨格を組む。
 * popup/status/live-view と同じ共有 renderer に渡すための要素セットだけを作る。
 * @returns {any}
 */
function createVenueStoryLaneDom() {
  const stack = document.createElement('div');
  stack.className = 'nl-story-userlane-stack nlsb-venue-lane-stack';
  stack.hidden = true;

  const makeGuide = () => {
    const guide = document.createElement('div');
    guide.className = 'nl-story-userlane-guide';
    const lines = document.createElement('div');
    lines.className = 'nl-story-userlane-guide__lines';
    guide.appendChild(lines);
    return { guide, lines };
  };
  /** @param {string} laneName */
  const makeLane = (laneName) => {
    const lane = document.createElement('div');
    lane.className = 'nl-story-userlane';
    lane.dataset.laneName = laneName;
    lane.hidden = true;
    return lane;
  };
  const makeWrap = (className = '') => {
    const wrap = document.createElement('div');
    wrap.className = `nl-story-userlane-tier-wrap${className ? ` ${className}` : ''}`;
    return wrap;
  };

  const top = makeGuide();
  const giftGuide = makeGuide();
  const adGuide = makeGuide();
  const kontaGuide = makeGuide();
  const tanuGuide = makeGuide();
  const bottom = makeGuide();

  const linkWrap = makeWrap();
  const giftWrap = makeWrap('nl-story-userlane-tier-wrap--gift');
  const adWrap = makeWrap('nl-story-userlane-tier-wrap--gift');
  const kontaWrap = makeWrap();
  const tanuWrap = makeWrap();

  const laneLink = makeLane('link');
  const laneGift = makeLane('gift');
  const laneAd = makeLane('ad');
  const laneKonta = makeLane('konta');
  const laneTanu = makeLane('tanu');

  const hintLink = document.createElement('div');
  hintLink.className = 'nl-story-userlane-tier-hint';
  hintLink.textContent = 'りんく候補はまだ少なめです。下の段も会場の応援者です。';
  hintLink.hidden = true;

  linkWrap.append(laneLink, hintLink);
  giftWrap.append(giftGuide.guide, laneGift);
  adWrap.append(adGuide.guide, laneAd);
  kontaWrap.append(kontaGuide.guide, laneKonta);
  tanuWrap.append(tanuGuide.guide, laneTanu);
  stack.append(top.guide, linkWrap, giftWrap, adWrap, kontaWrap, tanuWrap, bottom.guide);

  return {
    stack,
    laneLink,
    laneGift,
    laneAd,
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    giftWrap,
    adWrap,
    guideTop: top.guide,
    guideLinesTop: top.lines,
    guideMidGift: giftGuide.guide,
    guideLinesMidGift: giftGuide.lines,
    guideMidAd: adGuide.guide,
    guideLinesMidAd: adGuide.lines,
    guideMidKonta: kontaGuide.guide,
    guideLinesMidKonta: kontaGuide.lines,
    guideMidTanu: tanuGuide.guide,
    guideLinesMidTanu: tanuGuide.lines,
    guideBottom: bottom.guide,
    guideLinesBottom: bottom.lines
  };
}

/**
 * 席の「アイコン位置」基準要素を返す。person-tile-unify 第3コミット: 旧 node.icon の代替。
 *   本物タイル内のアバター img(.nl-story-userlane-avatar)があればそれ、無ければタイル全体、
 *   それも無ければラッパー(seat)。吹き出し・ギフトの座標起点に使う。
 * @param {{ seat: HTMLElement, tile: HTMLElement|null }} node
 * @returns {HTMLElement|null}
 */
function seatAnchorEl(node) {
  if (!node) return null;
  const tile = node.tile;
  if (tile) {
    const avatar = tile.querySelector('.nl-story-userlane-avatar');
    if (avatar instanceof HTMLElement) return avatar;
    return tile;
  }
  return node.seat || null;
}

/**
 * v0.1.753: 拡張コンテキストが有効か(content-entry.js の hasExtensionContext と同義)。
 * 拡張を更新/リロードすると、開きっぱなしの古いタブの content script は
 * 「Extension context invalidated」状態になり chrome.* が全失敗する。chrome.runtime.id が
 * undefined 化するのを唯一の検知点として、storage 呼び出しが throw する前に先回りで判定する。
 * @returns {boolean}
 */
function hasVenueExtensionContext() {
  try {
    return Boolean(chrome?.runtime?.id && chrome?.storage?.local);
  } catch {
    return false;
  }
}

/**
 * ニコ生 watch ページに独立 fixed レイヤーの会場モード UI を1個だけ追加する。
 * @param {{ standalone?: boolean }} options
 */
export function mountVenueBarButton(options = {}) {
  const isStandalone = !!options.standalone;
  // v0.1.752: 未マウント時も呼び出し側が null チェック不要なよう no-op API を返す。
  const NOOP_API = { onLiveComments: () => {} };
  if (!liveIdFromPathname()) return NOOP_API;
  if (document.getElementById(ROOT_ID)) return NOOP_API;
  const parent = isStandalone ? document.body : document.documentElement;
  if (!parent) return NOOP_API;

  ensureVenueStyle();

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.className = 'nlsb-root nlsb-full';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nlsb-toggle';
  toggle.textContent = '🏟 会場モード';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'nlsb-venue-stage');

  const stage = document.createElement('section');
  stage.id = 'nlsb-venue-stage';
  stage.className = 'nlsb-stage';
  stage.setAttribute('role', 'dialog');
  stage.setAttribute('aria-modal', 'true');
  stage.setAttribute('aria-label', '全画面会場モード');
  stage.setAttribute('aria-hidden', 'true');

  const close = document.createElement('button');
  close.type = 'button';
  // v0.1.772 ユーザー指摘「閉じるは会場モードの近く(=ヘッダー)に無いとわかりにくい」:
  //   右上隅の absolute 配置(nlsb-close)をやめ、ヘッダー右端に他のボタンと並べる(nlsb-comeview-btn
  //   スタイル流用)。nlsb-close-btn は閉じる専用の見た目(薄赤)を当てるための追加クラス。
  close.className = 'nlsb-comeview-btn nlsb-close-btn';
  close.textContent = '✕ 閉じる';
  close.title = '会場モードを閉じます';

  // v0.1.770 ユーザー要望「会場モードの閉じるボタンも会場のタブにつけて」:
  //   別窓化した会場タブ(standalone=venue.html)にも閉じるボタンを出す。インライン版は会場を畳むだけ
  //   だが、standalone は専用タブなので【タブごと閉じる】(window.close())。OBS キャプチャ用途では
  //   ツールバーを出したくないので OBS モードのときだけ従来どおり隠す。
  const isObsCapture = (window.name || '').includes('OBS') || window.location.search.includes('obs=');
  if (isStandalone) {
    toggle.style.display = 'none';
    if (isObsCapture) {
      close.style.display = 'none';
    } else {
      close.textContent = '✕ タブを閉じる';
      close.title = '会場タブを閉じます';
    }
    // スタンドアロン時は背景を黒系に塗り、映像セーフエリアを確保
    root.style.background = '#0a0b0c';
  }

  /** 群衆canvasの解像度(CSSで画面幅に引き伸ばす)。閉じるとき0に落として復元するため定数化。 */
  const CROWD_CANVAS_W = 1200;
  const CROWD_CANVAS_H = 350;
  const crowdCanvas = document.createElement('canvas');
  crowdCanvas.className = 'nlsb-crowd-canvas';
  // 高画質すぎると重いので適度な解像度に固定（CSSで画面幅に引き伸ばす）
  // ★v0.1.1239: 寸法は定数化。会場を閉じたとき stopCrowdMotion が 0 に落として
  //   バックストア(1200x350x4B = 1.68MB)を解放し、開くとき ensureCrowdCanvasSize が戻す。
  crowdCanvas.width = CROWD_CANVAS_W;
  crowdCanvas.height = CROWD_CANVAS_H;

  const stageLayout = document.createElement('div');
  stageLayout.className = 'nlsb-stage-layout';
  stageLayout.appendChild(crowdCanvas); // 背景として配置

  const center = document.createElement('div');
  center.className = 'nlsb-center';
  const centerLabel = document.createElement('div');
  centerLabel.className = 'nlsb-center-label';
  centerLabel.textContent = '配信者ステージ';
  const centerTitle = document.createElement('div');
  centerTitle.className = 'nlsb-center-title';
  centerTitle.textContent = String(document.title || '').trim() || '配信中の番組';
  const centerMeta = document.createElement('div');
  centerMeta.className = 'nlsb-center-meta';
  centerMeta.textContent = liveIdFromPathname();
  center.append(centerLabel, centerTitle, centerMeta);

  const seating = document.createElement('div');
  seating.className = 'nlsb-seating';

  const header = document.createElement('div');
  header.className = 'nlsb-header';
  const title = document.createElement('div');
  title.className = 'nlsb-title';
  title.textContent = '会場参加者 0人';
  // Phase C(2026-07-05・council/pachinko-ultimate-SYNTHESIS.md §6): 盛り上がりフェーズの色替え
  //   チップ。一度作ったら絶対remove/再生成しない(churn地雷対策)。CSSクラス切替とtextContent
  //   更新だけで進行する(paintPhaseMeterDom)。id固定でHTML側からも参照できるようにする。
  const phaseMeter = document.createElement('div');
  phaseMeter.id = 'nlsbPhaseMeter';
  phaseMeter.className = 'nlsb-phase-meter nlsb-phase-meter--normal';
  phaseMeter.textContent = '通常';
  phaseMeter.setAttribute('aria-label', '盛り上がりフェーズ: 通常');
  // ヘッダー右側: コメビュ起動ボタン + 集計メモ。
  const headerRight = document.createElement('div');
  headerRight.className = 'nlsb-header-right';
  // 診断: 今会場にいるメンバー一覧ボタン(AIも人間も検証用・誰が顔付き席/点描か)。
  const rosterBtn = document.createElement('button');
  rosterBtn.type = 'button';
  rosterBtn.className = 'nlsb-comeview-btn';
  rosterBtn.textContent = '👥 一覧';
  rosterBtn.title = '今この会場にいるメンバーの一覧(診断)を開く';
  rosterBtn.addEventListener('click', () => toggleRosterPanel());
  // 2026-07-01 会議(venue-diag): 会場の状態(参加者/席/アバター解決率/配信者混入)を平易に出す
  //   折りたたみ診断。既定は畳む(没入 UI を邪魔しない)。overlay なので席の高さを侵さない。
  const diagBtn = document.createElement('button');
  diagBtn.type = 'button';
  diagBtn.className = 'nlsb-comeview-btn';
  diagBtn.textContent = '🩺 状態';
  diagBtn.title = '会場の状態(参加者数・アバター解決率など)を開く';
  diagBtn.addEventListener('click', () => toggleDiagPanel());
  const comeviewBtn = document.createElement('button');
  comeviewBtn.type = 'button';
  comeviewBtn.className = 'nlsb-comeview-btn';
  comeviewBtn.textContent = '💬 コメビュ';
  comeviewBtn.title = '読み上げ付きコメントビューア(別ウィンドウ)を開く';
  comeviewBtn.addEventListener('click', () => {
    // content script は chrome.windows を直接呼べないので SW へ依頼(status.html と同経路)。
    try {
      chrome.runtime.sendMessage({ type: 'NLS_OPEN_COMEVIEW', liveId: liveIdFromPathname() });
    } catch {
      // 拡張コンテキスト切れ等は黙って無視(次回クリックで再試行)。
    }
  });

  const voiceBtn = document.createElement('button');
  voiceBtn.type = 'button';
  voiceBtn.className = 'nlsb-comeview-btn nlsb-voice-btn';
  voiceBtn.style.marginLeft = '8px';
  voiceBtn.textContent = '🔈 読み上げ: OFF';
  
  const voiceStatus = document.createElement('span');
  voiceStatus.className = 'nlsb-voice-status';
  voiceStatus.style.marginLeft = '8px';
  voiceStatus.style.fontSize = '12px';
  voiceStatus.style.color = '#7a828e';

  let venueWindowBtn = null;
  if (!isStandalone) {
    venueWindowBtn = document.createElement('button');
    venueWindowBtn.type = 'button';
    venueWindowBtn.className = 'nlsb-comeview-btn'; // スタイル流用
    venueWindowBtn.textContent = '↗ 別窓化';
    venueWindowBtn.title = '会場モードを別ウィンドウ(OBS等用)で開く';
    venueWindowBtn.style.marginLeft = '8px';
    venueWindowBtn.addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ type: 'NLS_OPEN_VENUE', liveId: liveIdFromPathname() });
        // 別窓化したらインライン版は一旦閉じる
        userChangedOpen = true;
        setOpen(false, true);
      } catch {
        /* no-op */
      }
    });
  }

  const note = document.createElement('div');
  note.className = 'nlsb-note';
  // 2026-06-22 会場「全員500人」: 席上限の表示も実定数に追従させる(150 固定の取り残しを是正)。
  note.textContent = `全コメント集計・最大${VENUE_FULLSCREEN_MAX_SEATS}席`;
  // v0.1.772: 閉じるボタンをヘッダー右端に並べる(会場の操作ボタンを一箇所に集約)。
  //   OBS キャプチャ時は close.style.display='none' 済みなので append しても表示されない。
  if (venueWindowBtn) {
    headerRight.append(rosterBtn, diagBtn, comeviewBtn, voiceBtn, voiceStatus, venueWindowBtn, note, close);
  } else {
    headerRight.append(rosterBtn, diagBtn, comeviewBtn, voiceBtn, voiceStatus, note, close);
  }
  header.append(title, phaseMeter, headerRight);

  // 2026-07-01 会議(venue-role-separation フェーズ2 = 可視性回復): ひな壇の【上】に固定高の
  //   「応援者トップN」バー。868人の密集会場でも上位が必ず大きく見える(席の🥇🥈🥉が小さすぎる
  //   問題への回答)。データは席と同じ rankVenueContributors(順位バッジとスコア源を共有=drift なし)、
  //   描画は席と同じ buildVenuePersonTile(匿名も含む=会場の「全員主役」を壊さない)。
  //   高さは CSS 固定 + 「一度描いたら空では畳まない」で下の席を揺らさない(v0.1.1026 高さ振動対策)。
  const topBar = document.createElement('div');
  topBar.className = 'nlsb-topbar';
  topBar.hidden = true; // 上位が居ない(全員無言)間は出さない。一度出たら空で畳まない(下記 sig ガード)。
  const topBarLabel = document.createElement('div');
  topBarLabel.className = 'nlsb-topbar-label';
  topBarLabel.textContent = '応援者トップ';
  const topBarList = document.createElement('div');
  topBarList.className = 'nlsb-topbar-list';
  topBar.append(topBarLabel, topBarList);

  const seatsHost = document.createElement('div');
  seatsHost.className = 'nlsb-seats nlsb-mode-empty';
  const venueLaneEls = createVenueStoryLaneDom();
  const venueStoryFaces = {
    faceLink: resolveVenueAssetUrl(STORY_GUIDE_FACE_LINK),
    faceGift: resolveVenueAssetUrl(STORY_GUIDE_FACE_GIFT),
    faceAd: resolveVenueAssetUrl(STORY_GUIDE_FACE_GIFT),
    faceKonta: resolveVenueAssetUrl(STORY_GUIDE_FACE_KONTA),
    faceTanu: resolveVenueAssetUrl(STORY_GUIDE_FACE_TANU)
  };
  seatsHost.appendChild(venueLaneEls.stack);
  const storyDiagHost = document.createElement('div');
  storyDiagHost.className = 'nlsb-story-diag';
  storyDiagHost.hidden = true;
  seatsHost.appendChild(storyDiagHost);
  /** @type {ReturnType<typeof createSeatNode>[]} */
  const seatNodes = [];
  for (let i = 0; i < VENUE_FULLSCREEN_MAX_SEATS; i += 1) {
    const node = createSeatNode(i);
    seatNodes.push(node);
  }

  const emptyMessage = document.createElement('div');
  emptyMessage.className = 'nlsb-empty-message';
  emptyMessage.textContent = 'まだ名前付きの参加者がいません';
  seatsHost.appendChild(emptyMessage);

  // 2026-06-14 会議(星野ロミ・摩擦ゼロUI): 会場を左ドラッグでパン(縦スクロール)できるように。
  //   純ロジックは venueDragScroll(テスト済)。ここは pointer イベントの薄い配線だけ。
  //   ドラッグ判定(moved)が立ったら席リンクの click を1回だけ抑止し、誤遷移を防ぐ。
  let venueDrag = initVenueDragState();
  const venueDragMaxScroll = () => Math.max(0, seatsHost.scrollHeight - seatsHost.clientHeight);
  seatsHost.addEventListener('pointerdown', (e) => {
    // 左ボタンのみ。スクロールバー上のドラッグは OS に任せる(配信操作を邪魔しない)。
    if (e.button !== 0) return;
    venueDrag = beginVenueDrag(e.clientY, seatsHost.scrollTop);
    seatsHost.classList.add('nlsb-is-grabbing');
  });
  seatsHost.addEventListener('pointermove', (e) => {
    if (!venueDrag.active) return;
    const r = updateVenueDrag(venueDrag, e.clientY, venueDragMaxScroll());
    venueDrag = r.state;
    if (venueDrag.moved) {
      seatsHost.scrollTop = r.scrollTop;
      // ドラッグ中はテキスト選択を避ける。
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
  });
  const endVenueDragHandler = () => {
    const { state, wasDrag } = endVenueDrag(venueDrag);
    venueDrag = state;
    seatsHost.classList.remove('nlsb-is-grabbing');
    if (wasDrag) {
      // 直後の click(席リンク)を1回だけ飲み込む(ドラッグで指を離した位置のリンクへ飛ばない)。
      /** @param {Event} ev */
      const swallow = (ev) => {
        ev.stopPropagation();
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        seatsHost.removeEventListener('click', swallow, true);
      };
      seatsHost.addEventListener('click', swallow, true);
    }
  };
  seatsHost.addEventListener('pointerup', endVenueDragHandler);
  seatsHost.addEventListener('pointerleave', endVenueDragHandler);
  seatsHost.addEventListener('pointercancel', endVenueDragHandler);

  // 中央の映像セーフエリア(UI を置かず、配信映像を常に見せる)。
  const safeArea = document.createElement('div');
  safeArea.className = 'nlsb-safe-area';
  safeArea.setAttribute('aria-hidden', 'true');

  if (isStandalone && liveIdFromPathname()) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://live.nicovideo.jp/embed/${liveIdFromPathname()}`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.pointerEvents = 'auto'; // 操作可能にする
    safeArea.appendChild(iframe);
    safeArea.style.pointerEvents = 'auto';
  }

  // 3キャラ常駐レイヤー(ユーザーアイデア): 会場を開いた瞬間から りんく・こん太・たぬ姉 が
  //   最前列中央に居て、集計が一瞬0件でも「無人/ローディング」に見えない最後の砦。
  //   seating 配下の専用固定レイヤー=seating パイプライン(参加者カウント)とは独立。
  const residentsLayer = document.createElement('div');
  residentsLayer.className = 'nlsb-residents';
  residentsLayer.setAttribute('aria-hidden', 'false');

  // v0.1.777 額縁フレーム: 3キャラ全表情サムネで四辺を囲む専用レイヤー(中央の映像/コメント欄は触らない)。
  const charFrameLayer = document.createElement('div');
  charFrameLayer.className = 'nlsb-charframe';
  charFrameLayer.setAttribute('aria-hidden', 'true');

  // v0.1.1230: ピックアップ枠(BSP風)。会場ヘッダーの直下=いま見ている場所に常設で置く。
  //   ★①POPのticker(「応援 N コメント」の右)だとスクロール外で目に入らず、
  //     「埋もれるコメントを拾う」のに拾った先がまた埋もれていた(ユーザー報告)。
  //   DOM は一度作ったら remove しない(churn地雷対策)。中身の差し替えだけで進行する。
  const pickupEls = createVenuePickupBanner(document);
  // seating は下端のひな壇だけ(header + pickup + seats)。
  seating.append(header, pickupEls.root, topBar, seatsHost);
  // center は CSS で display:none(撤去)だが、互換のため DOM には残す。
  // 3キャラ常駐は配信画面の「まわり(左右の縁)」に出す(会場の席とは重ねない=邪魔にしない)。
  //   stageLayout 基準=映像セーフエリアの高さに合わせて左右に配置できる。
  stageLayout.append(crowdCanvas, safeArea, charFrameLayer, seating, center, residentsLayer);
  // 吹き出し専用の最上位レイヤー(会議確定A): 席コンテナの overflow:hidden の外に置くことで
  //   セリフがクリップされず・アバターに潜らない。席の座標を測ってこの上に頭上配置する。
  const bubbleLayer = document.createElement('div');
  bubbleLayer.className = 'nlsb-bubble-layer';
  bubbleLayer.setAttribute('aria-live', 'polite');
  // 診断: メンバー一覧パネル(モーダル風)。DOM はここで作り、描画関数は下(lastRosterInput 宣言後)で定義。
  // 2026-07-31(ユーザー要望): アイコンをクリックすると、その人の発言を全部読めるパネル。
  //   ホバーカードは直前の1件しか出せない(マウスを外すと消える小さな吹き出し)ため、
  //   「この人が何を言ってきたか」を追うにはクリックで開く一覧が要る。
  //   ★読み込みはクリックした瞬間だけ(comeview の同型実装と同じ方針)=常時のstorage readは増やさない。
  const speechPanel = document.createElement('div');
  speechPanel.className = 'nlsb-roster-panel nlsb-speech-panel';
  speechPanel.hidden = true;

  const rosterPanel = document.createElement('div');
  rosterPanel.className = 'nlsb-roster-panel';
  rosterPanel.hidden = true;
  // 2026-07-01 会議(venue-diag): 「🩺 会場の状態」パネル。roster と同じ overlay 流儀=席の高さを侵さない。
  const diagPanel = document.createElement('div');
  diagPanel.className = 'nlsb-roster-panel nlsb-venue-diag-panel';
  diagPanel.hidden = true;
  // 2026-07-30(wayfinder→to-spec方式・venue-avatar-hover-preview-SPEC.md §4.3): ホバープレビュー
  //   カードはシングルトン1個をstage直下に常設(表示/非表示と中身差し替えのみ・500人規模でも
  //   DOM数は人数非依存)。stage.appendの最後に置くことで、同z-index(6)の常駐レイヤーより
  //   DOM順で手前に来る。
  const hoverCardEl = createVenueHoverCardEl(document);
  stage.append(stageLayout, bubbleLayer, rosterPanel, speechPanel, diagPanel, hoverCardEl);

  // 2026-07-30(wayfinder→to-spec方式・venue-avatar-hover-preview-SPEC.md §4.3/§7):
  //   委譲リスナー2個(seatsHost/topBarList)+シングルトンカードのみ。タイル個別リスナー・
  //   新規タイマー・新規計算(APIコール等)は一切無い(500人規模でも人数非依存)。
  const VENUE_HOVER_CARD_OPEN_DELAY_MS = 120;

  /** 開いているカードを閉じ、退避したtitleを復元する。全経路(pointerout/pointerdown/scroll)は
   *  必ずこの単一関数を通る(「消す側」の経路漏れを作らない・[[story-userlane-churn-filllanetier-v1039]]の鉄則)。 */
  const closeHoverCard = () => {
    if (_hoverCardTimer) {
      clearTimeout(_hoverCardTimer);
      _hoverCardTimer = 0;
    }
    const anchorEl = _hoverCardOpenFor;
    _hoverCardOpenFor = null;
    hoverCardEl.classList.remove('nlsb-hover-card--open');
    if (!(anchorEl instanceof HTMLElement)) return;
    const backup = _hoverCardTitleBackupByEl.get(anchorEl);
    if (!backup) return;
    _hoverCardTitleBackupByEl.delete(anchorEl);
    // paint(renderSeats)がホバー中にtitleを再セットしている可能性があるため、現在値が
    // 空のときだけ復元する(上書きされていたらそちらが最新の正しい値・SPEC.md §7-2の地雷対策)。
    if (!anchorEl.title) anchorEl.title = backup.seatTitle;
    if (backup.cellEl instanceof HTMLElement) {
      if (!backup.cellEl.title) backup.cellEl.title = backup.cellTitle;
      const img = backup.cellEl.querySelector('img');
      if (img instanceof HTMLElement && !img.title) img.title = backup.imgTitle;
    }
  };

  /**
   * 席なしタイル(広告主等)のホバーデータを、その瞬間だけ解決する(v0.1.1204)。
   * 席あり(seat)は paint 時に登録済みなので、ここへは来ない。
   * ★paint 時に全タイルを走査する実装は hot path 汚染で実機が重くなったため、
   *   「ホバーされた1枚だけ・その場で」に変更した。走査対象は同じ段の中だけ。
   * @param {HTMLElement} el
   * @returns {{ uid: string, displayName: string, count: number, hasGift: boolean, giftCount: number, venueRank: number, lastAt: number, tier?: string, lastText?: string, recentTexts?: string[] }|null}
   */
  const resolveSeatlessHoverData = (el) => {
    try {
      const laneEl = el.closest?.('.nl-story-userlane');
      if (!(laneEl instanceof HTMLElement)) return null;
      // 段の識別子は makeLane が刻む dataset.laneName(venueBar.js:1936)。
      const tier = String(laneEl.dataset?.laneName || '').trim();
      const items = /** @type {any} */ (_laneItemsByTier)[tier];
      if (!Array.isArray(items) || !items.length) return null;
      // この1枚が段の何番目かを、同じ段の兄弟から求める(段内だけの走査)。
      const siblings = laneEl.querySelectorAll('.nl-story-userlane-cell');
      let idx = -1;
      for (let i = 0; i < siblings.length; i += 1) {
        if (siblings[i] === el) { idx = i; break; }
      }
      if (idx < 0 || idx >= items.length) return null;
      const it = items[idx];
      const seatIdx = Number(it?._venueSeatIndex);
      if (Number.isInteger(seatIdx) && seatIdx >= 0) return null; // 席ありは対象外
      const u = String(it?.entry?.userId || '').trim();
      return {
        uid: u,
        displayName: String(it?.title || '').trim(),
        count: 0,
        hasGift: tier === 'gift',
        giftCount: 0,
        venueRank: 0,
        lastAt: 0,
        tier,
        lastText: '',
        // 席なしタイル(広告主等)は発言記録に紐づかないので空。
        recentTexts: []
      };
    } catch {
      return null;
    }
  };

  /** アンカー要素にホバー中のカードを実際に開く。 @param {HTMLElement} anchorEl */
  const openHoverCardFor = (anchorEl) => {
    let data = _hoverCardDataByEl.get(anchorEl);
    if (!data) {
      // 席なしタイル(広告主等)はここで初めて解決する(paint 時には触らない)。
      const seatless = resolveSeatlessHoverData(anchorEl);
      if (seatless) {
        data = seatless;
        _hoverCardDataByEl.set(anchorEl, seatless); // 同じ要素の2回目以降は走査しない
      }
    }
    if (!data) return; // データ無し=fail-closed(ネイティブtitleがそのまま生きる)。
    _hoverCardOpenFor = anchorEl;

    // title退避(seat/cell/imgの3点)。カード表示中は二重ツールチップを避ける。
    const cellEl = anchorEl.querySelector instanceof Function
      ? anchorEl.querySelector('.nl-story-userlane-cell') || (anchorEl.classList?.contains('nl-story-userlane-cell') ? anchorEl : null)
      : null;
    const imgEl = cellEl instanceof HTMLElement ? cellEl.querySelector('img') : null;
    _hoverCardTitleBackupByEl.set(anchorEl, {
      seatTitle: anchorEl.title || '',
      cellTitle: cellEl instanceof HTMLElement ? cellEl.title || '' : '',
      imgTitle: imgEl instanceof HTMLElement ? imgEl.title || '' : '',
      cellEl: cellEl instanceof HTMLElement ? cellEl : null
    });
    anchorEl.title = '';
    if (cellEl instanceof HTMLElement) cellEl.title = '';
    if (imgEl instanceof HTMLElement) imgEl.title = '';

    const thumb = readVenueTileThumbState(/** @type {HTMLElement|null} */ (cellEl));
    // 2026-07-30(council-fable設計・venue-hover-card-content-DESIGN.md 必答2/必答4):
    //   diagModeは既存の🩺状態パネルの開閉状態に連動(新規UI・新規storageを追加しない)。
    //   開いた瞬間の状態を都度読む(固定しない・地雷3)。nowMsは純関数を汚さないための注入。
    const model = buildVenueHoverCardModel({ ...data, thumb, nowMs: Date.now(), diagMode: !diagPanel.hidden });
    renderVenueHoverCard(hoverCardEl, model);
    hoverCardEl.classList.add('nlsb-hover-card--open');

    const anchorRect = anchorEl.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const cardRect = hoverCardEl.getBoundingClientRect();
    const placement = resolveVenueHoverCardPlacement({
      anchor: {
        left: anchorRect.left - stageRect.left,
        top: anchorRect.top - stageRect.top,
        width: anchorRect.width,
        height: anchorRect.height
      },
      card: { width: cardRect.width, height: cardRect.height },
      viewport: { width: stageRect.width, height: stageRect.height }
    });
    hoverCardEl.style.left = `${placement.left}px`;
    hoverCardEl.style.top = `${placement.top}px`;
  };

  /**
   * ホバー/クリックのアンカー要素を求める。
   *
   * ★v0.1.1206 修正: 従来は席(.nlsb-seat)とトップバー(.nlsb-topbar-cell)だけを見ていたため、
   *   席を持たないタイル(広告ランキング由来の広告主など)は【ホバー検知の対象ですらなかった】。
   *   v0.1.1201 で「席なしにもカードを出す」実装を入れたのに一度も動かなかったのはこれが原因。
   *   .nl-story-userlane-cell(段のタイル本体)も対象に加える。
   *
   * ★席あり(.nlsb-seat)はタイルを内側に包む(wrapTileEl: seat.replaceChildren(tileEl))ため、
   *   closest を素直に使うと内側のタイルが先に当たり、席側の正しいデータ(発言数・順位・
   *   最終発言時刻)ではなく席なし用の簡易データが使われてしまう。だから席を優先する。
   *
   * @param {EventTarget|null} target
   * @returns {HTMLElement|null}
   */
  const resolveHoverAnchor = (target) => {
    if (!(target instanceof HTMLElement)) return null;
    const seat = target.closest('.nlsb-seat, .nlsb-topbar-cell');
    if (seat instanceof HTMLElement) return seat;
    const cell = target.closest('.nl-story-userlane-cell');
    return cell instanceof HTMLElement ? cell : null;
  };

  /** @param {HTMLElement} host */
  const wireHoverCardDelegation = (host) => {
    host.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return; // MVPはタッチ非対応(既存タップ挙動を邪魔しない)。
      const anchorEl = resolveHoverAnchor(e.target);
      if (!(anchorEl instanceof HTMLElement)) return;
      if (anchorEl === _hoverCardOpenFor) return; // 同じ席内での移動は無視。
      if (_hoverCardTimer) clearTimeout(_hoverCardTimer);
      _hoverCardTimer = window.setTimeout(() => {
        _hoverCardTimer = 0;
        openHoverCardFor(anchorEl);
      }, VENUE_HOVER_CARD_OPEN_DELAY_MS);
    });
    host.addEventListener('pointerout', (e) => {
      const anchorEl = resolveHoverAnchor(e.target);
      if (!(anchorEl instanceof HTMLElement)) return;
      const related = resolveHoverAnchor(e.relatedTarget);
      if (related === anchorEl) return; // 同じ席内の子要素間移動は無視。
      closeHoverCard();
    });
  };
  wireHoverCardDelegation(seatsHost);
  wireHoverCardDelegation(topBarList);

  /**
   * v0.1.1205: アイコンをクリックしたら、その人の発言を全部出すパネルを開く。
   *   ホバーカードは直前1件しか出せないので、「何を言ってきたか」を追う導線をここで足す。
   *   ★席・トップバーのどちらでも動くよう、ホバーと同じ委譲方式にする。
   *   ★storage read はクリックの瞬間だけ(openSpeechPanelFor の中)=常時readは増えない。
   * @param {HTMLElement} host
   */
  const wireSpeechPanelDelegation = (host) => {
    host.addEventListener('click', (e) => {
      const anchorEl = resolveHoverAnchor(e.target);
      if (!(anchorEl instanceof HTMLElement)) return;
      const data = _hoverCardDataByEl.get(anchorEl) || resolveSeatlessHoverData(anchorEl);
      const uid = String(data?.uid || '').trim();
      if (!uid) return; // uid が無い(広告主等)は発言記録に紐づかない=何も開かない
      closeHoverCard();
      void openSpeechPanelFor({ uid, displayName: String(data?.displayName || '') });
    });
  };
  wireSpeechPanelDelegation(seatsHost);
  wireSpeechPanelDelegation(topBarList);
  // ドラッグスクロール中・スクロール中はカードを浮遊させたまま残さない(即閉じ)。
  seatsHost.addEventListener('pointerdown', closeHoverCard);
  seatsHost.addEventListener('scroll', closeHoverCard);

  root.append(toggle, stage);
  parent.appendChild(root);

  let open = false;
  // 別窓化リファクタで参照側が外れ書込専用に(復活に備え代入は残す)。
  // eslint-disable-next-line no-unused-vars
  let userChangedOpen = false;

  // v0.1.770 起動待ちの「楽しいローディング」(会議 2026-06-16・遅延ガードで一瞬成功はチラつかせない)。
  //   状態を受け、checking は 180ms 経ってもまだ ready で無ければ初めて演出を描く。connecting(再試行中)は
  //   即描く。ready/idle で空にし、notfound で起動案内に切替。voiceStatus の内容/見た目はこの driver が所有。
  let voiceLoadingTimer = 0;
  // ★v0.1.1326: 第2引数 reason(timeout/refused/http-error)で文言を出し分ける。
  const renderVoiceLoading = (
    /** @type {string} */ state,
    /** @type {'timeout'|'refused'|'http-error'|'no-fetch'|''} */ reason
  ) => {
    const view = resolveVoiceLoadingView(state, 'venue', reason);
    voiceStatus.classList.toggle('is-loading', view.kind === 'loading');
    voiceStatus.classList.toggle('is-error', view.kind === 'error');
    voiceStatus.textContent = view.text;
  };
  const driveVoiceLoading = (
    /** @type {string} */ state,
    /** @type {'timeout'|'refused'|'http-error'|'no-fetch'|''} */ reason = ''
  ) => {
    if (voiceLoadingTimer) {
      window.clearTimeout(voiceLoadingTimer);
      voiceLoadingTimer = 0;
    }
    if (state === 'checking') {
      // 遅延ガード: すぐには描かない。180ms 後にまだ checking のままなら初めて演出を出す。
      voiceStatus.classList.remove('is-loading', 'is-error');
      voiceStatus.textContent = '';
      voiceLoadingTimer = window.setTimeout(() => {
        voiceLoadingTimer = 0;
        if (shouldRenderLoading('checking', VOICE_LOADING_FLICKER_GUARD_MS)) renderVoiceLoading('checking', '');
      }, VOICE_LOADING_FLICKER_GUARD_MS);
      return;
    }
    renderVoiceLoading(state, reason);
  };

  // v0.1.1065: 会場読み上げの計器を KEY_VOICE_DIAG へ書く(3秒min-gap・他診断と同型)。
  //   これまで会場のVoicePlayerは無計器で、状態速報の「会場読み上げ」行は別経路(comeview)の
  //   古いスナップショットを表示し続けていた(=読み上げ不調の切り分けが不可能だった)。
  let _venueVoiceDiagLastWriteAt = 0;
  const publishVenueVoiceDiag = (/** @type {import('../lib/voiceDiag.js').VoiceDiagState} */ diag) => {
    const now = Date.now();
    if (now - _venueVoiceDiagLastWriteAt < 3000) return;
    _venueVoiceDiagLastWriteAt = now;
    const snap = { ...buildVoiceDiagSnapshot(diag, now), source: 'venue' };
    void chrome.storage.local.set({ [KEY_VOICE_DIAG]: snap }).catch(() => {});
  };

  const voicePlayer = new VoicePlayer({
    storage: typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null,
    onDiag: publishVenueVoiceDiag,
    onToggle: (/** @type {boolean} */ enabled, /** @type {boolean} */ readNameEnabled, /** @type {boolean} */ toggleBusy) => {
      voiceBtn.disabled = toggleBusy;
      voiceBtn.classList.toggle('is-on', enabled);
      voiceBtn.textContent = enabled ? '🔊 読み上げ: ON' : '🔈 読み上げ: OFF';
    },
    // onStatus は読み上げブロック警告(audio NotAllowedError)等の臨時メッセージ用に温存。
    //   起動待ちの状態表示は onLoadingState(driveVoiceLoading)が所有する。
    onStatus: (/** @type {string} */ msg) => {
      if (!msg) return; // 空クリアは onLoadingState('ready') 側でやる(driver の class も外す)
      voiceStatus.classList.remove('is-loading');
      voiceStatus.classList.toggle('is-error', /見つかりません|ブロック/.test(msg));
      voiceStatus.textContent = msg;
    },
    onLoadingState: (
      /** @type {string} */ state,
      /** @type {'timeout'|'refused'|'http-error'|'no-fetch'|''} */ reason = ''
    ) => driveVoiceLoading(state, reason),
    onSkip: () => {},
    isObsMode: () => {
      return (window.name || '').includes('OBS') || window.location.search.includes('obs=');
    },
    audioConstructor: typeof window !== 'undefined' ? window.Audio : null,
    createObjectURL: typeof URL !== 'undefined' ? URL.createObjectURL.bind(URL) : null,
    revokeObjectURL: typeof URL !== 'undefined' ? URL.revokeObjectURL.bind(URL) : null,
    fetchVoicevoxAlive: isVoicevoxAlive,
    // ★v0.1.1326: 理由付きの生存確認を配線(未配線だと reason が常に 'refused' になり、
    //   起動しているのに「見つかりません」と言い続ける従来の誤案内が残る)。
    probeVoicevoxAlive,
    fetchVoiceStyleIds: listVoicevoxStyleIds,
    fetchSynthesizeVoice: synthesizeVoice,
    resolveVoice: resolveVoiceForUser
  });
  
  voiceBtn.addEventListener('click', () => {
    if (voicePlayer.enabled) {
      voicePlayer.disable();
    } else {
      voicePlayer.enable();
    }
  });
  
  // 会場モードは開いたら「いきなり読み上げ上がる」のがユーザー期待(comeview の ?voice=1 相当)。
  //   保存状態に関わらず自動 ON。OBS 透過モードは VoicePlayer 内で isObsMode により enable を
  //   スキップするので forceOn を渡しても安全(無音オーバーレイのまま)。
  void voicePlayer.initialize({ forceOn: true });
  let aggregateTimer = 0;
  let aggregateInFlight = false;
  let speechTimer = 0;
  let speechInFlight = false;
  // v0.1.1080: Phase C の受動tick(BGMダック+フェーズ進行)の id。拡張リロード後は
  //   markContextInvalidated から clearInterval する(他の会場タイマーと同型)。
  let bgmPhaseTickTimer = 0;
  let speechGeneration = 0;
  let speechLiveId = '';
  /** @type {{ seenKeys: Set<string>|null, primed: boolean }} */
  let speechState = { seenKeys: null, primed: false };
  // 「会話の連鎖」(v0.1.743+): 発言者キー→{連続数,最終発言時刻}。連続発言で席が継続的に輝く。
  /** @type {Map<string, { count: number, lastAt: number }>} */
  const speechStreaks = new Map();
  let activeLiveId = '';
  let escapeListening = false;
  // 退避強化(1000人超): 群衆 canvas は seed+人数が同じなら描画結果が同じ純粋関数なので、
  //   観客数が変わらない限り 1.5s 毎の再描画をスキップ(重い描画を無駄打ちしない)。
  let lastCrowdCount = -1;
  let lastCrowdSeed = NaN;
  // 「生きている会場」(2026-06-15 会議+査読研究): 観客が静かな時は呼吸でそよぎ、盛り上がると
  //   同期して揺れる。renderSeats が現在の観客数/seed を、applyVenueHeat が heatLevel を更新し、
  //   アニメループ(rAF・約18fps)が drawCrowdOnCanvas を {timeMs,heatLevel} 付きで再描画する。
  let crowdAnimCount = 0;
  let crowdAnimSeed = 0;
  let crowdHeatLevel = 0;
  /** @type {number} */
  let crowdRaf = 0;
  let crowdLastDrawMs = 0;
  const crowdReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** @type {VenueRow[]} */
  let baseRows = [];
  // v0.1.754 3時間安定化: 参加者集計のインクリメンタル状態。チャンクは append-only なので一度
  //   集約した seq の結果は不変=未処理 seq だけ読んで既存集約へマージすれば全件再読みと同じ総数に。
  /** @type {number[]} 既に集約済みのチャンク seq(この配信で) */
  let aggregatedChunkSeqs = [];
  /** @type {import('../lib/userLaneCandidatesFromStorage.js').UserLaneCandidateFromStorage[]} 累積集約候補(userId 単位) */
  let aggregatedCandidates = [];
  // v0.1.754 ストリーム駆動在席: onLiveComments で通過毎に touch する in-memory 在席 Map。
  //   storage 全集計(30秒毎 O(N))の代わり=3時間でも O(席数) 一定。standalone は onLiveComments が
  //   来ないので rosterDriven=false で従来の storage 経路へ degrade。VENUE_ROSTER_ENABLED でロールバック可。
  /** @type {Map<string, import('../lib/venueLiveRoster.js').RosterEntry>} */
  const liveRoster = new Map();
  // ストリーム駆動で在席を回すか。standalone(venue.html=onLiveComments 来ない)は必ず false で
  //   従来の storage 経路へ degrade。VENUE_ROSTER_ENABLED=false で全面ロールバック(静的判定=const)。
  const rosterDriven = VENUE_ROSTER_ENABLED && !isStandalone;
  /** @type {number} rAF id(描画集約) */
  let rosterCommitRaf = 0;
  /** @type {number} 沈黙中も退席を反映する軽量 prune タイマー */
  let rosterPruneTimer = 0;
  // 「空っぽ・途中で消える」根治(v0.1.745+): 直近の非空表示行を保持し、集計/poll が一瞬0件や
  //   storage 失敗で来ても会場を空で再描画しない(resolveDisplayRows・前状態保持)。配信切替で破棄。
  /** @type {VenueRow[]} */
  let lastGoodRows = [];
  // v0.1.1110 会場サムネ白円根治: プロファイルキャッシュ(userId→{avatarUrl})の会場内キャッシュ。
  //   チャンク本体(nls_cchunk)には avatarUrl が無いので、記名ユーザーの実サムネはこの補強が唯一の供給源。
  //   v0.1.754 のストリーム駆動化で enrich(v0.1.712)が「開いた瞬間の aggregateParticipants 1回」に
  //   退化し、以降の在席描画(rosterToVenueRows→commitDisplay)が補強を素通り→記名段が白円、の退行を塞ぐ。
  //   更新元=aggregateParticipants(初回/standalone 30秒)+storage.onChanged(newValue直採用=追加readゼロ)。
  //   消費=commitDisplay が毎描画で enrich(冪等)。
  /** @type {Record<string, { avatarUrl?: unknown }>|null} */
  let profileAvatarMap = null;
  // v0.1.1111 会場=①レーン鏡映: ①の実paint鏡(KEY_LANE_MIRROR)のキャッシュ。
  //   laneMirrorSnap=最新(開時catch-up 1回+onChangedのnewValue直採用=追加readゼロ)。
  //   laneMirrorPaintSnap=【この baseRows/paint に実際に使った鏡】(TOCTOU排除=一致判定はこれと突合)。
  /** @type {Partial<import('../lib/laneMirror.js').LaneMirrorSnapshot>|null} */
  let laneMirrorSnap = null;
  /** @type {Partial<import('../lib/laneMirror.js').LaneMirrorSnapshot>|null} */
  let laneMirrorPaintSnap = null;
  /**
   * 関所が直近に落としたセル数(段別の不変条件違反)。既存の診断行に併記するだけで
   * 新しい観測系統は作らない。通常は 0。0 でなければ①側が契約違反の鏡を書いている。
   */
  let _laneMirrorSanitizeDropped = 0;
  /**
   * ★v0.1.1300: ①(popup/サイドパネル)が書いた実DOM受領証。
   *   会場は【別ドキュメントの DOM】を持つので、受領証はデータ本体と分けて運ぶ。
   *   比較してよいのは isReceiptComparable(snap, receipt) が true のときだけ
   *   (= receipt.fingerprintFor === snap.contentHash)。時計では判定しない。
   * @type {any}
   */
  let _laneReceiptFromPopup = null;
  /**
   * ★venue-exact-parity-SPEC-2026-08-07 §3-3: 会場【実DOM】のキー列指紋(diagDue のときだけ更新)。
   *   census が既に集めている keys 列(venueDomCensus.js:97-98)から作る=追加のDOM走査ゼロ。
   *   ①の実DOM指紋(鏡の domSelf.fingerprint)と突き合わせる相手。'' は未計測(=⚪)。
   */
  let _venueDomFingerprintLast = '';
  /**
   * ★席なし(unseated)件数。鏡セルが席を得る条件は【uid一致のみ】(venueSeatIndexByUid)で、
   *   名前でしか同定できない人は席に結びつかず生タイルとして段に出る=これは正常。
   *   「段img 19 − 席16 = 3」を説明済みの差分にするための数値(新しい観測系統は作らない)。
   */
  let _venueUnseatedCount = 0;
  /** 見出しの人数だけの基準文(鏡の鮮度は後段で併記する)。 */
  let _venueTitleBaseText = '';
  /** 直近に書いた見出し文(値が変わったときだけ DOM に書くため)。 */
  let _venueTitleLastText = '';
  /**
   * ★鏡snapshotの受け入れ関所。読み口はこの1関数に集約する(受け入れ点は catch-up と
   *   onChanged の2箇所。wiringテストが呼び出し数で固定する)。
   *
   *   なぜ要るか: 会場には鏡経路と fallback 経路があり、fallback(venueLaneBuckets.js)は
   *   匿名を弾くのに鏡経路(composeVenueLaneBuckets)は鏡の段構成を【無検査で】信じていた。
   *   どちらを通ったかで画面の「法」が変わる状態だったため、読み口で不変条件を強制する。
   *
   * @param {unknown} rawSnap
   * @returns {Partial<import('../lib/laneMirror.js').LaneMirrorSnapshot>|null} null=使えない(fallbackへ)
   */
  /*
   * ★v0.1.1317: 会場の鏡うけとり計器(なぜ更新が止まったかを名指しするため)。
   *   書き手は動いているのに会場の鏡が古い、という実測から「読み手が真因」まで
   *   絞れているが、その先(通知が来ない/キー不一致/関所却下)は測らないと決まらない。
   */
  const _venueMirrorIntake = createVenueMirrorIntakeState();
  /** 関所が捨てた理由(sanitize の issues を1行に。計器が原因を名乗るために持つ)。 */
  let _laneMirrorSanitizeIssues = '';
  /** @param {unknown} rawSnap */
  function acceptLaneMirrorSnapshot(rawSnap) {
    const r = sanitizeLaneMirrorForRead(rawSnap);
    _laneMirrorSanitizeDropped = r.droppedLinkAnon + r.droppedKontaAnon + r.droppedUnkeyed;
    // ★関所が null を返した理由を保存する(「捨てられた」だけでは次の一手が決まらない)。
    _laneMirrorSanitizeIssues = Array.isArray(r.issues) ? r.issues.join('/') : '';
    return /** @type {any} */ (r.snap);
  }
  // venue-avatar-stale-mirror-DESIGN.md §C-1d: 鏡capturedAtの前進(popup復帰等)を検知する
  //   ための直前値。composeVenueBaseRowsが新しい鏡をpaintに採用するたびに更新する。
  let _lastPaintedMirrorCapturedAt = 0;
  /** @type {Record<string, unknown>|null} */
  let storyDiagMirrorSnap = null;
  let storyDiagMirrorRenderSig = '';
  // 記録件数の正本購読(story-diag-realtime-sync-DESIGN.md §C-2)。
  //   入力の出どころ: nls_panel_summary_<lv>。content-entry.js が取込イベント+min-gap 2秒で
  //   popup非依存に書く recordedCount(AGENTS.md §12.8 の表示正本)。①popupが閉じていても
  //   この経路だけで件数は動き続ける(本設計の根治点)。
  /** @type {Record<string, unknown>|null} */
  let panelSummarySnap = null;
  let _panelSummaryLastSeenAt = 0;
  /** X層: 鏡にまだ居ない直近発言者の初見時刻(壁時計)。60秒窓内は「暫定」=説明済み差分。 */
  /** @type {Map<string, number>} */
  const venueTransientFirstSeen = new Map();
  /** 鏡更新の再供給を rAF に集約(コメント怒涛でも1フレーム1回)。 */
  let laneMirrorRecommitRaf = 0;
  // 一度でも非空を描いたか(renderSeats の保険ガード用)。配信切替の意図的クリアと区別する。
  let hasRenderedNonEmpty = false;
  // v0.1.1138(2026-07-14 会場独自受け皿の撤去・「消す側」の計器): fallback時に段から除外された
  //   匿名の人数。会場独自の受け皿を持たなくなったため、これが唯一の可視化手段。
  let _anonExcludedCount = 0;
  // 2026-07-14 席リンク一致計器(診断先行アプローチ): タイル実体(鏡uid)と席クラス(roster uid)の
  //   二重ソース不一致が実害を出しているかを累積で数える(観測のみ・修正はしない)。
  const _seatLinkParity = createVenueSeatLinkParityState();
  // 2026-07-15 名前ありゆっくり顔 計器(診断先行アプローチ): 実害の有無・頻度を累積で数える
  //   (観測のみ・修正はしない)。
  const _yukkuriNamedCensus = createVenueYukkuriNamedCensusState();
  // 2026-07-21 応援TOP吹き出しchurn計器(診断先行アプローチ): 生成頻度・寿命分布・強制退去を
  //   累積で数える(観測のみ・修正はしない)。
  const _bubbleChurn = createVenueBubbleChurnState();
  // 応援者トップNバーの状態(renderTopBar / clearDisplay が触る・宣言はここ=TDZ 回避)。
  let _lastTopBarSig = '';
  let _topBarShownOnce = false;
  // 2026-07-24: RANKバッジ(dataset.venueRank)の局所diff-skip用。renderSeats全体のsig-skipは
  //   v0.1.1032で実機ちらつき回帰を招き撤回済みの地雷なので導入しない。DOM要素(node.seat)単位で
  //   「最後に書き込んだvenueRank」だけを覚え、同じ値ならdataset書き込みそのものをスキップする。
  /** @type {WeakMap<HTMLElement, number>} */
  const _lastVenueRankByNode = new WeakMap();
  // 2026-07-30(wayfinder→to-spec方式・venue-avatar-hover-preview-SPEC.md §4.3): ホバープレビュー
  //   カード用のデータ。paint時(席装飾ループ/renderTopBar)にWeakMapへ相乗り登録するだけで、
  //   DOM書き込み・新規タイマー・新規計算は無い(RANKバッジちらつき教訓=diff-skip不要な設計)。
  /** @type {WeakMap<HTMLElement, { uid: string, displayName: string, count: number, hasGift: boolean, giftCount: number, venueRank: number, lastAt: number, tier?: string, lastText?: string, recentTexts?: string[] }>} */
  const _hoverCardDataByEl = new WeakMap();
  // v0.1.1207: 会場の「開いてから見えるまで」を分解して観測する(ユーザー報告
  //   「立ち上がりが遅い/出ないときがある」を体感でなく数字で切り分けるため)。
  const _openLatency = createVenueOpenLatencyState();
  // v0.1.1204: 段ごとの item 列(paint 時に参照を控えるだけ・DOM走査なし)。席なしタイル
  //   (広告主等)にホバーされた瞬間だけ、この列から索引でデータを引いてカードを出す。
  //   ★paint のたびに querySelectorAll する実装は hot path 汚染で実機が重くなったため撤去した。
  /** @type {{ link: any[], gift: any[], ad: any[], konta: any[], tanu: any[] }} */
  let _laneItemsByTier = { link: [], gift: [], ad: [], konta: [], tanu: [] };
  /** @type {WeakMap<HTMLElement, { seatTitle: string, cellTitle: string, imgTitle: string, cellEl: HTMLElement|null }>} */
  const _hoverCardTitleBackupByEl = new WeakMap();
  let _hoverCardTimer = 0;
  /** @type {HTMLElement|null} 現在カードを開いている(または開こうとしている)アンカー要素。 */
  let _hoverCardOpenFor = null;
  // 診断シート(メンバー一覧ボタン)用: renderSeats が最新の席割りをここに保存する。
  /** @type {{ allSeats: any[], visibleSeats: any[], audienceCount: number }} */
  let lastRosterInput = { allSeats: [], visibleSeats: [], audienceCount: 0 };

  // v0.1.902: 健全度パネル「会場座席」セル用。集約関数が掴んだ配信者 uid を renderSeats から
  //   参照して「配信者本人が席に混入していないか(v0.1.901 除外の回帰検出)」を観測する。
  /** @type {string} 直近の配信者 uid(''=未取得=混入判定不能)。 */
  let _lastBroadcasterUid = '';
  let _venueSeatsDiagLastWriteAt = 0;

  // v0.1.1053: ギフト/広告の効果音 ON/OFF(既定 true)。popup と同じ設定キーを共有する。
  let _effectSoundEnabledCache = true;
  void chrome.storage.local.get(KEY_EFFECT_SOUND_ENABLED).then((bag) => {
    _effectSoundEnabledCache = isEffectSoundEnabled(bag?.[KEY_EFFECT_SOUND_ENABLED]);
  }).catch(() => {});
  chrome.storage.onChanged?.addListener?.((changes, area) => {
    if (area !== 'local' || !changes[KEY_EFFECT_SOUND_ENABLED]) return;
    _effectSoundEnabledCache = isEffectSoundEnabled(changes[KEY_EFFECT_SOUND_ENABLED].newValue);
  });

  // Phase A(2026-07-05): マイ効果音(IndexedDB取込+割当)。起動時+customSoundRev変化時に
  //   customVariantPaths/gainForを再構築する。effectSoundPlayer.js は無改変・deps注入のみで差し替わる。
  /** @type {{ customVariantPaths: Record<string, ReadonlyArray<string>>, gainFor: (kind: string) => number, urlsById: Map<string, string>, localBundledCount?: number }} */
  let _customSoundState = { customVariantPaths: {}, gainFor: () => 1.0, urlsById: new Map() };
  const refreshCustomSoundState = () => {
    void loadCustomSoundRuntimeState({ previousUrlsById: _customSoundState.urlsById }).then((state) => {
      _customSoundState = state;
    }).catch(() => {});
  };
  refreshCustomSoundState();
  safeStorageOnChangedAddListener((changes, area) => {
    if (area !== 'local' || !changes[KEY_CUSTOM_SOUND_REV]) return;
    refreshCustomSoundState();
  });
  /**
   * playEffectSound呼び出し共通のdeps組み立て(カスタム優先マージ+決定論順繰りrng+gain反映)。
   * @param {string} kind
   * @returns {Parameters<typeof playEffectSound>[1]}
   */
  const buildEffectSoundDeps = (kind) => {
    const variantPaths = mergeVariantPaths(EFFECT_SOUND_VARIANT_PATHS, _customSoundState.customVariantPaths);
    const variants = variantPaths[String(kind)];
    const n = Array.isArray(variants) ? variants.length : 1;
    return {
      // playEffectSound の deps 型は Record<string, string[]>(可変)だが、実体は
      //   EFFECT_SOUND_VARIANT_PATHS 由来の Object.freeze 配列を含みうる(effectSoundPlayer.js は
      //   resolveEffectSoundPath 内で読むだけで変更しないため実害なし)。型注釈だけの相違。
      variantPaths: /** @type {Record<string, string[]>} */ (variantPaths),
      paths: EFFECT_SOUND_PATHS,
      getUrl: (p) => getUrlForCustomSound(p, (q) => chrome.runtime.getURL(q)),
      rng: rotationRngFor(kind, n),
      volume: _customSoundState.gainFor(kind) * defaultVolumeForEffectSoundKind(kind)
    };
  };

  // v0.1.1053: 会場windowが生存している間、3秒間隔でプレゼンスを書く(popup側の二重再生防止用)。
  //   既存の3秒 min-gap タイマーと相乗りせず独立させる(この機能のためだけに他の計測を巻き込まない)。
  let _venueEffectSoundPresenceLastWriteAt = 0;
  const writeVenueEffectSoundPresence = () => {
    const now = Date.now();
    if (now - _venueEffectSoundPresenceLastWriteAt < 3000) return;
    _venueEffectSoundPresenceLastWriteAt = now;
    void chrome.storage.local.set({ [KEY_VENUE_EFFECT_SOUND_PRESENCE]: now }).catch(() => {});
  };

  // v0.1.1054: 「ギフトがちゃんと飛ぶか・タイミングよく音が出るか」を状態速報1枚で確認できる
  //   ようにする計器(検知→演出→音の3段階カウンタ・観測のみ・描画/演出は変えない)。
  const _giftEffectDiagCounters = makeInitialGiftEffectDiag();
  let _giftEffectDiagLastWriteAt = 0;
  // v0.1.1156: 1件のギフト処理内で publishGiftEffectDiag は最低2回呼ばれる
  //   (演出直後=giftThrown加算済み・音カウンタはまだ0/setTimeoutコールバック内=音カウンタ加算後)。
  //   この2回は数msしか離れておらず、2回目は必ず3秒min-gapに弾かれてstorageへ届かない。
  //   結果「演出✅・音0」の中間状態が次のギフト系イベントが来るまで(配信終了まで)嘘のまま
  //   残り続ける実測バグを踏んだ(検知1→演出1✅→音0が624秒経っても解消しなかった)。
  //   弾かれた書き込みは「まだ反映していない差分がある」フラグを立て、min-gap明け直後に
  //   1回だけ追いpublishするタイマーで拾う(他の診断のmin-gap設計自体は変えない)。
  let _giftEffectDiagDirty = false;
  let _giftEffectDiagFlushTimer = 0;
  // v0.1.1090: 個別ギフトイベント欠落配信のデルタ補完検知(帳簿state・配信=liveId単位で
  //   computeGiftDelta が内部でリセットする。ここでは1個の可変stateを持ち回すだけ)。
  let _giftDeltaState = makeInitialGiftDeltaState('');
  // 2026-07-06: 来場入賞演出専用の20秒CD(積み増し禁止=CD中に来場が来ても待たせず単にスキップし
  //   カウンタだけ計上する)。0=未発火(shouldFireArrivalEffectはlastAt=0/十分先のnowMsで発火可)。
  let _lastArrivalEffectAtMs = 0;
  /** @param {number} now */
  const writeGiftEffectDiagSnapshot = (now) => {
    _giftEffectDiagLastWriteAt = now;
    _giftEffectDiagDirty = false;
    _giftEffectDiagCounters.soundEnabled = _effectSoundEnabledCache;
    const snap = buildGiftEffectDiagSnapshot(_giftEffectDiagCounters, now);
    void chrome.storage.local.set({ [KEY_GIFT_EFFECT_DIAG]: snap }).catch(() => {});
  };
  const publishGiftEffectDiag = () => {
    const now = Date.now();
    const elapsed = now - _giftEffectDiagLastWriteAt;
    if (elapsed < 3000) {
      // 弾かれた=直近の書き込み以降にカウンタが変化した可能性がある。取りこぼさないよう、
      //   min-gap明け直後に1回だけ追いpublishする(タイマーは1本だけ・多重予約しない)。
      _giftEffectDiagDirty = true;
      if (!_giftEffectDiagFlushTimer) {
        _giftEffectDiagFlushTimer = window.setTimeout(() => {
          _giftEffectDiagFlushTimer = 0;
          if (_giftEffectDiagDirty) writeGiftEffectDiagSnapshot(Date.now());
        }, 3000 - elapsed + 50);
      }
      return;
    }
    writeGiftEffectDiagSnapshot(now);
  };

  // Phase B(2026-07-05): パチンコボイス演出+歯止め(council/pachinko-ultimate-SYNTHESIS.md §4/§6)。
  //   本Phaseはイベント直結トリガのみ(メーターR条件のボイスはPhase C)。
  //   voiceGate は事象履歴の純関数=決定論(乱数なし)。state はコンテキスト内メモリで持ち回す。
  let _voiceGateState = makeInitialVoiceGateState();
  const _voiceEffectDiagCounters = makeInitialVoiceEffectDiag();
  let _voiceEffectDiagLastWriteAt = 0;
  const publishVoiceEffectDiag = () => {
    const now = Date.now();
    if (now - _voiceEffectDiagLastWriteAt < 3000) return; // 3秒 min-gap(他の診断と同型)。
    _voiceEffectDiagLastWriteAt = now;
    _voiceEffectDiagCounters.soundEnabled = _effectSoundEnabledCache;
    const snap = { ...buildVoiceEffectDiagSnapshot(_voiceEffectDiagCounters, now), source: 'venue' };
    void safeStorageLocalSet({ [KEY_VOICE_EFFECT_DIAG]: snap });
  };
  // VOICEVOX発話中判定(§4.3)。読み上げ側(voicePlayer)は改変せず、再生中フラグと待機キュー長を
  //   読み取り専用で参照するだけ。発話中(またはキュー2件以上)は voice_* をスキップして諦める
  //   (遅延再生禁止=文脈がズレた頃に鳴る事故の禁止)。
  const isNarratingNow = () => {
    try {
      return voicePlayer.playing === true || (Array.isArray(voicePlayer.queue) && voicePlayer.queue.length >= 2);
    } catch {
      return false;
    }
  };
  /**
   * ボイス1本をゲート(個別CD/上限・グローバル45秒CD・1配信20回・VOICEVOXスキップ)経由で鳴らす。
   * @param {string} key voice_* のいずれか
   * @returns {'played'|'off'|string} 'played'=実際に鳴らした。それ以外はスキップ理由等。
   */
  const tryPlayVoice = (key) => {
    if (!_effectSoundEnabledCache) return 'off';
    // 修正1: カスタム未割当キーはゲートより先に諦める(ゲートstateを一切消費しない・§本体)。
    //   voice_*はeffectSoundPlayer.js同梱の合成音フォールバックを持たない新設キーのため、
    //   割当が無ければ100%no-pathで無音に終わる=CD/カウンタを消費させると診断が嘘をつく。
    if (isUnassignedVoiceKey(key, _customSoundState.customVariantPaths)) {
      _voiceEffectDiagCounters.skippedUnassigned += 1;
      _voiceEffectDiagCounters.lastEventAt = Date.now();
      publishVoiceEffectDiag();
      return 'unassigned';
    }
    const stateBeforeGate = _voiceGateState;
    const gate = voiceGate(stateBeforeGate, key, Date.now(), {
      liveId: speechLiveId,
      isNarrating: isNarratingNow()
    });
    _voiceGateState = gate.nextState;
    _voiceEffectDiagCounters.lastEventAt = Date.now();
    if (!gate.allowed) {
      const field = voiceSkipFieldForGateReason(gate.reason);
      if (field) _voiceEffectDiagCounters[field] += 1;
      publishVoiceEffectDiag();
      return gate.reason;
    }
    // 「鳴らした」時だけ数える(戻り値を見ずに数えると診断が嘘をつく・v0.1.1057と同じ教訓)。
    const result = playEffectSound(key, buildEffectSoundDeps(key));
    if (result === 'played') {
      _voiceEffectDiagCounters.fired += 1;
      _voiceEffectDiagCounters.lastKey = key;
    } else if (result === 'no-path') {
      // 保険(修正1): 事前チェックのすり抜け(blob URL失効等)があってもCD/カウンタを巻き戻す。
      _voiceGateState = resetVoiceGateStateForLiveIfChanged(stateBeforeGate, speechLiveId);
      _voiceEffectDiagCounters.skippedUnassigned += 1;
    }
    publishVoiceEffectDiag();
    return result;
  };
  /**
   * 大当たりチェーン(§3.3「突破→大当たり」「大当たり→払い出し」のイベント駆動分)。
   *   (イベント側 gift_mega SE=scheduleGiftSound が既に予約) → voice_jackpot → payout SE 1本 の直列。
   *   チェーン全体を voice_jackpot のゲート(300秒CD/1配信3回)に従属させる=バースト時に payout だけ
   *   連発する積み増しを構造的に防ぐ(§7 音の積み増し禁止)。ゲートが通らなければ何も足さない
   *   (イベント側SEは鳴っているので演出は欠落しない)。
   */
  const scheduleJackpotVoiceChain = () => {
    if (!_effectSoundEnabledCache) return;
    // 修正1: voice_jackpotが未割当ならゲートを消費せず諦める(§本体)。イベント側SE(gift_mega等)は
    //   既に鳴っているのでpayoutチェーンだけを諦めても演出は欠落しない。
    if (isUnassignedVoiceKey('voice_jackpot', _customSoundState.customVariantPaths)) {
      _voiceEffectDiagCounters.skippedUnassigned += 1;
      _voiceEffectDiagCounters.lastEventAt = Date.now();
      publishVoiceEffectDiag();
      return;
    }
    const gate = voiceGate(_voiceGateState, 'voice_jackpot', Date.now(), {
      liveId: speechLiveId,
      isNarrating: isNarratingNow() // voice_jackpot は§4.3の唯一の例外=narrating では拒否されない
    });
    _voiceGateState = gate.nextState;
    _voiceEffectDiagCounters.lastEventAt = Date.now();
    if (!gate.allowed) {
      const field = voiceSkipFieldForGateReason(gate.reason);
      if (field) _voiceEffectDiagCounters[field] += 1;
      publishVoiceEffectDiag();
      return;
    }
    // planJackpotChain の delayMs は「直前ステップからの遅延」= 累積して直列にスケジュールする。
    let atMs = 0;
    for (const step of planJackpotChain()) {
      atMs += step.delayMs;
      window.setTimeout(() => {
        const result = playEffectSound(step.kind, buildEffectSoundDeps(step.kind));
        if (step.kind === 'voice_jackpot' && result === 'played') {
          _voiceEffectDiagCounters.fired += 1;
          _voiceEffectDiagCounters.lastKey = 'voice_jackpot';
        }
        publishVoiceEffectDiag();
      }, atMs);
    }
    publishVoiceEffectDiag();
  };

  // v0.1.1061: ギフト音のバースト置換+着弾同期(実試聴フィードバック「出ない・ずれる」の根治)。
  //   従来は 1 ギフト=1 playEffectSound 即時呼びだったため、storage 経由でまとめて届くバーストでは
  //   (a)同ティア連続が 600ms ガードに食われ2発目以降が無音=「出ないときがある」
  //   (b)音が投げた瞬間・見た目の着弾は飛翔時間後=「ずれる」
  //   になっていた。演出ディレクター(effectDirector)の「コンボは加算でなく置換」で、
  //   飛翔中に届いた分は予約済みの1本をティア昇格させるだけにし、着弾タイミングで1本だけ鳴らす。
  //   ギフトのコンボ窓は10秒(30秒だと安定した連続ギフトが常時megaに張り付くため・決定論)。
  const GIFT_COMBO_WINDOW_MS = 10_000;
  let _giftComboState = makeInitialComboState();
  let _pendingGiftSound = /** @type {{ kind: string, timer: number, run: () => void }|null} */ (null);
  /**
   * ギフト1件ぶんの音をディレクター経由で予約する。
   * @param {string|undefined} tier 'small'|'medium'|'large'|'mega'
   * @param {number} _flightMs 投擲アニメの飛翔時間(ms)。v0.1.1066で待機をやめ未使用化(呼び出し側の互換のため引数は維持)
   * @param {number} [detectAt] v0.1.1088計器: このギフトの検知時刻(epoch ms)。未指定なら計測しない(既存呼び出し互換)。
   * @returns {'scheduled'|'coalesced'|'off'} v0.1.1091: 'off'を含む全戻り値がgiftEffectDiagへ
   *   直接計上される(呼び出し元が戻り値を見なくても取りこぼしが数字に残る)。
   */
  const scheduleGiftSound = (tier, _flightMs, detectAt) => {
    if (!_effectSoundEnabledCache) {
      // v0.1.1091根治: 従来はこの早期returnが呼び出し元でも無視され(呼び出し元は'coalesced'
      //   しか見ていなかった)、guarded/noPath/error/coalescedの内訳が全てゼロなのに音が
      //   1件だけ静かに消える「内訳で説明できない取りこぼし」を生んでいた(状態速報2回実測)。
      //   ここで直接計上し、どの経路を通っても必ずどれかのカウンタが増えるようにする。
      _giftEffectDiagCounters.giftSoundOff += 1;
      publishGiftEffectDiag();
      return 'off';
    }
    const baseKind = effectSoundKindForGiftTier(tier);
    _giftComboState = directHit(_giftComboState, baseKind, Date.now(), {
      ladder: GIFT_TIER_LADDER,
      windowMs: GIFT_COMBO_WINDOW_MS
    });
    const kind = _giftComboState.kind || baseKind;
    // Phase B(2026-07-05): パチンコボイス(イベント直結・council/pachinko-ultimate-SYNTHESIS.md §3.3)。
    //   優先度は§4.3: P1大当たりチェーン > P2ボイス。gift_mega(直撃/コンボ昇格の結果)は
    //   voice_jackpot→payoutチェーン、それ以外の昇格(promotedSteps≥1)は「上乗せ」ボイス。
    //   連打はvoiceGate(個別CD+グローバル45秒CD)が自然に間引く=45秒CDで1回だけ鳴る。
    if (kind === 'gift_mega') {
      scheduleJackpotVoiceChain();
    } else if (_giftComboState.promotedSteps >= 1) {
      tryPlayVoice('voice_kamitsumi');
    }
    if (_pendingGiftSound) {
      // 置換: 予約済みの1本を昇格させるだけ(音を積み増ししない=太鼓の達人式)。
      _pendingGiftSound.kind = kind;
      return 'coalesced';
    }
    // v0.1.1066: 実試聴「タイミングが遅れてる」→飛翔時間まるごと待つのをやめ、最大200msに短縮。
    //   (投げた瞬間に音が出始める方が体感が良い。200msはバースト統合の窓として最低限残す)
    const pending = { kind, timer: 0, run: /** @type {() => void} */ (() => {}) };
    const runPendingGiftSound = () => {
      _pendingGiftSound = null;
      try {
        // 「鳴らした」時だけ数える(戻り値を見ずに数えると診断が嘘をつく・v0.1.1057と同じ教訓)。
        // 修正3: playEffectSoundの戻り値がplayed以外(guarded/no-path/error)でも診断に内訳として
        //   計上する(従来は無条件で捨てられ「⚠N件鳴っていない」の内訳不明の原因だった)。
        const playResult = playEffectSound(pending.kind, buildEffectSoundDeps(pending.kind));
        if (playResult === 'played') {
          _giftEffectDiagCounters.giftSoundPlayed += 1;
          // v0.1.1088計器: 「検知→音」の体感ギャップ(演出・音の挙動は不変・時刻記録のみ)。
          if (Number.isFinite(Number(detectAt)) && Number(detectAt) > 0) {
            const gap = Math.max(0, Date.now() - Number(detectAt));
            _giftEffectDiagCounters.lastSoundGapMs = gap;
            _giftEffectDiagCounters.avgSoundGapMs = computeGiftGapAverage(_giftEffectDiagCounters.avgSoundGapMs, gap);
          }
          // SC2(§2.2): 「実際に鳴った」瞬間のみ、gift_large以上をハイライト台帳へ記録する
          //   (playEffectSoundの戻り値'played'を見て記録=見てない演出が結果に出る構造を防止)。
          if (pending.kind === 'gift_large' || pending.kind === 'gift_mega') {
            appendHighlightAndPublish(speechLiveId, pending.kind, Date.now());
          }
        } else {
          const field = giftSoundDiagFieldForPlayResult(playResult);
          if (field) _giftEffectDiagCounters[field] += 1;
        }
      } catch {
        // v0.1.1091根治: buildEffectSoundDeps等(カスタム音State構築)が想定外に投げても、
        //   ここが「内訳が全部ゼロなのに音だけ消える」最後の抜け穴にならないようにする
        //   (嘘をつかない診断の原則・playEffectSound自体は既に自前でtry/catch済みなので
        //   ここに届く例外は deps 組み立て側に限られる)。
        _giftEffectDiagCounters.giftSoundError += 1;
      }
      publishGiftEffectDiag();
    };
    pending.timer = window.setTimeout(runPendingGiftSound, 0); // v0.1.1068: 即発音(同一バーストの統合はsetTimeout(0)がループ後に走ることで維持)
    pending.run = runPendingGiftSound;
    _pendingGiftSound = pending;
    // Phase C(2026-07-05): 盛り上がりメーター(M)にギフト重みを加算(§3.2: small/medium/large/mega=4/8/16/32)。
    //   comboStreakはギフトの連続コンボ数(effectDirector.directHit)=§3.3「コンボ2連中/3連目」条件。
    advancePhaseDirector({
      addWeight: meterWeightForGiftTier(tier),
      giftLargeOrAbove: kind === 'gift_large' || kind === 'gift_mega',
      giftMega: kind === 'gift_mega',
      comboStreak: _giftComboState.comboCount
    });
    return 'scheduled';
  };

  // v0.1.1156: 「検知→演出✅→音の内訳が全部ゼロ」実機バグの根治。scheduleGiftSoundが予約する
  //   setTimeout(0)はページ/タブが閉じられる瞬間に発火せず消えることがあり、_pendingGiftSoundが
  //   giftSoundPlayed/Coalesced/Guarded/NoPath/Error/Offのどれにも計上されないまま失われていた
  //   (診断が「⚠N件鳴っていない」と嘘をつかない設計のはずが、ここだけ抜け穴だった)。
  //   pagehide時に保留中の1本があれば強制的に走らせて必ずどれかのカウンタへ計上する。
  window.addEventListener(
    'pagehide',
    () => {
      if (_pendingGiftSound && _pendingGiftSound.run) {
        window.clearTimeout(_pendingGiftSound.timer);
        _pendingGiftSound.run();
      }
    },
    { once: true }
  );

  /* ==========================================================================
   * Phase C(2026-07-05): 物語弧の完成(council/pachinko-ultimate-SYNTHESIS.md §3/§5/§6)。
   *   meterStateFor(既存M・effectDirector.js)→baselineFor(B)→R→phaseFor の決定論
   *   ステートマシンでフェーズを進め、遷移の瞬間だけR条件ボイス/BGMを発火する。
   *   effectSoundPlayer.js/voiceDirector.js/effectDirector.jsは無改変(deps注入+関数呼び出しのみ)。
   * ======================================================================== */

  /** メーター重み(§3.2表そのもの)。コメント+1・広告+8・ギフトは帯別。
   *   節目到達+10はコメント数マイルストーン検知(popup-entry.js専属)側で加算する
   *   (venueBar.jsはコメント数マイルストーンを扱わない=comment_milestone_effect_diagはpopup専用)。 */
  const METER_WEIGHT_COMMENT = 1;
  const METER_WEIGHT_AD = 8;
  /** @type {Readonly<Record<string, number>>} */
  const METER_WEIGHT_FOR_GIFT_TIER = Object.freeze({ small: 4, medium: 8, large: 16, mega: 32 });
  /** @param {string|undefined} tier @returns {number} */
  const meterWeightForGiftTier = (tier) => METER_WEIGHT_FOR_GIFT_TIER[String(tier || 'small')] ?? METER_WEIGHT_FOR_GIFT_TIER.small;

  let _meterState = makeInitialExcitementMeter();
  let _baselineState = makeInitialBaselineState();
  /** @type {import('../lib/phaseDirector.js').PhaseState} */
  let _phaseState = makeInitialPhaseState(Date.now());
  /** 配信検知時刻(ウォームアップ3分の起点・§3.2)。0=未検知。 */
  let _streamDetectedAtMs = 0;
  let _reachBgmState = makeInitialReachBgmState();
  let _feverBgmState = makeInitialFeverBgmState();
  let _bgmEnabledCache = true; // v0.1.1075: 既定ON(ユーザー明示指示・isBgmEnabledと同じ向き)
  let _bgmVolumeReach = BGM_REACH_DEFAULT_VOLUME;
  let _bgmVolumeFever = BGM_FEVER_DEFAULT_VOLUME;
  const _bgmRuntime = createBgmRuntime();
  void safeStorageLocalGet([KEY_BGM_ENABLED, KEY_BGM_VOLUME_REACH, KEY_BGM_VOLUME_FEVER]).then((bag) => {
    _bgmEnabledCache = isBgmEnabled(bag?.[KEY_BGM_ENABLED]);
    if (Number.isFinite(Number(bag?.[KEY_BGM_VOLUME_REACH]))) _bgmVolumeReach = clampBgmVolume(Number(bag[KEY_BGM_VOLUME_REACH]));
    if (Number.isFinite(Number(bag?.[KEY_BGM_VOLUME_FEVER]))) _bgmVolumeFever = clampBgmVolume(Number(bag[KEY_BGM_VOLUME_FEVER]));
  });
  safeStorageOnChangedAddListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[KEY_BGM_ENABLED]) _bgmEnabledCache = isBgmEnabled(changes[KEY_BGM_ENABLED].newValue);
    if (changes[KEY_BGM_VOLUME_REACH] && Number.isFinite(Number(changes[KEY_BGM_VOLUME_REACH].newValue))) {
      _bgmVolumeReach = clampBgmVolume(Number(changes[KEY_BGM_VOLUME_REACH].newValue));
    }
    if (changes[KEY_BGM_VOLUME_FEVER] && Number.isFinite(Number(changes[KEY_BGM_VOLUME_FEVER].newValue))) {
      _bgmVolumeFever = clampBgmVolume(Number(changes[KEY_BGM_VOLUME_FEVER].newValue));
    }
  });

  const _bgmPhaseDiagCounters = makeInitialBgmPhaseDiag();
  let _bgmPhaseDiagLastWriteAt = 0;
  const publishBgmPhaseDiag = () => {
    const now = Date.now();
    if (now - _bgmPhaseDiagLastWriteAt < 3000) return; // 3秒 min-gap(他の診断と同型)。
    _bgmPhaseDiagLastWriteAt = now;
    _bgmPhaseDiagCounters.bgmEnabled = _bgmEnabledCache;
    const snap = buildBgmPhaseDiagSnapshot(_bgmPhaseDiagCounters, now);
    void safeStorageLocalSet({ [KEY_BGM_PHASE_DIAG]: snap });
  };

  // SC2(council/broadcast-scoring-SYNTHESIS.md §2.2): ハイライト台帳(KEY_HIGHLIGHT_LEDGER)への
  //   追記ヘルパ。popup-entry.jsのappendHighlightAndPublishPopupと同型。書き手は「実際に発火が
  //   確定した演出だけ」相乗りする(新規writerを作らず既存の確定分岐に載せる・§6却下事項)。
  /** @param {string} liveId @param {string} kind @param {number} atMs */
  const appendHighlightAndPublish = (liveId, kind, atMs) => {
    if (!isHighlightWorthyKind(kind)) return;
    void safeStorageLocalGet(KEY_HIGHLIGHT_LEDGER).then((bag) => {
      const next = appendHighlight(bag?.[KEY_HIGHLIGHT_LEDGER], { liveId, kind, atMs });
      void safeStorageLocalSet({ [KEY_HIGHLIGHT_LEDGER]: next });
    });
  };

  /**
   * カスタム割当済みBGM URLを1本選ぶ(§5.3決定論ローテーション)。未割当キーはno-path扱い(空文字)
   *   =bgmDirector.createBgmRuntime().start()側で「urlが無ければ何もしない」の安全側フォールバックに乗る。
   * @param {string} key bgm_reach_loop/bgm_fever_loop/bgm_jingle_stage/bgm_jingle_win
   * @param {number} [variantIndex]
   * @returns {string}
   */
  const resolveBgmUrl = (key, variantIndex) => {
    const variants = _customSoundState.customVariantPaths[key];
    if (!Array.isArray(variants) || variants.length === 0) return '';
    const idx = Number.isFinite(Number(variantIndex)) ? Math.max(0, Number(variantIndex)) % variants.length : 0;
    return getUrlForCustomSound(variants[idx], (q) => chrome.runtime.getURL(q));
  };

  /** フィーバー終了(§5.2「アウト3.0秒→bgm_jingle_win」)。 */
  const endFeverBgm = () => {
    _bgmRuntime.stop(FADE_MS.feverOut, () => {
      const winUrl = resolveBgmUrl('bgm_jingle_win', 0);
      if (winUrl) playEffectSound('bgm_jingle_win', { ...buildEffectSoundDeps('bgm_jingle_win'), getUrl: () => winUrl });
    });
    _feverBgmState = feverBgmStop(_feverBgmState);
    _bgmPhaseDiagCounters.feverOutCount += 1;
    _bgmPhaseDiagCounters.lastEventAt = Date.now();
    publishBgmPhaseDiag();
  };

  /**
   * フィーバー開始(payoutチェーン完了合図)。bgm_jingle_stage(直列)→ループイン(§3.3/§5.2)。
   * @returns {boolean} true=実際にフィーバーが始まった(BGM ONかつ開始成立)。falseなら
   *   呼び出し側(advancePhaseDirector)がpayout張り付き対策のフォールバックを仕掛ける必要がある。
   */
  const startFeverBgm = () => {
    const startDecision = feverBgmStart(_feverBgmState, Date.now(), { bgmEnabled: _bgmEnabledCache });
    if (startDecision.action !== 'start') return false;
    _feverBgmState = startDecision.nextState;
    const stageUrl = resolveBgmUrl('bgm_jingle_stage', (_feverBgmState.loopIndex - 1) % 2);
    if (stageUrl) playEffectSound('bgm_jingle_stage', { ...buildEffectSoundDeps('bgm_jingle_stage'), getUrl: () => stageUrl });
    const loopUrl = resolveBgmUrl('bgm_fever_loop', feverLoopVariantIndex(_feverBgmState.loopIndex));
    _bgmRuntime.start(loopUrl, _bgmVolumeFever, FADE_MS.feverIn);
    _bgmPhaseDiagCounters.feverInCount += 1;
    _bgmPhaseDiagCounters.lastEventAt = Date.now();
    publishBgmPhaseDiag();
    // Phase C: フィーバーBGMイン時のR条件ボイス(§4.1 voice_stage)。
    tryPlayVoice('voice_stage');
    return true;
  };

  /**
   * 払い出し張り付き対策(修正2): BGM無効時/フィーバー未開始時は payoutChainDone合図が
   *   永遠に来ない(fever終了判定のみに依存していたため)。payout SEの再生予定時刻+2秒で
   *   決定論的にpayoutChainDoneを合図する(チェーン不走行時はこの関数を呼ばず次tickで即合図)。
   *   0=未予約。多重予約はしない(既に予約済みなら上書きしない=最初の予定を信じる)。
   */
  const PAYOUT_FALLBACK_SE_TO_DONE_MS = 2_000;
  let _payoutFallbackAtMs = 0;
  /** @param {number} nowMs */
  const schedulePayoutFallback = (nowMs) => {
    if (_payoutFallbackAtMs > 0) return; // 既に予約済み(二重予約防止)。
    _payoutFallbackAtMs = nowMs + PAYOUT_FALLBACK_SE_TO_DONE_MS;
  };
  const clearPayoutFallback = () => {
    _payoutFallbackAtMs = 0;
  };

  /**
   * リーチBGMのin/out判定を1歩進める(§5.2)。
   * @param {string} phase
   * @param {number} R
   * @param {number} nowMs
   */
  const tickReachBgm = (phase, R, nowMs) => {
    const decision = reachBgmDecision(_reachBgmState, phase, R, nowMs, { bgmEnabled: _bgmEnabledCache });
    _reachBgmState = decision.nextState;
    if (decision.action === 'start') {
      const url = resolveBgmUrl('bgm_reach_loop', reachLoopVariantIndex(_reachBgmState.loopIndex));
      _bgmRuntime.start(url, _bgmVolumeReach, decision.fadeMs);
      _bgmPhaseDiagCounters.reachInCount += 1;
      _bgmPhaseDiagCounters.lastEventAt = Date.now();
      publishBgmPhaseDiag();
    } else if (decision.action === 'stop') {
      _bgmRuntime.stop(decision.fadeMs);
      _bgmPhaseDiagCounters.reachOutCount += 1;
      _bgmPhaseDiagCounters.lastEventAt = Date.now();
      publishBgmPhaseDiag();
    }
  };

  /**
   * フェーズディレクターを1歩進める(§6 Phase C の核)。M(メーター)更新→B更新→R算出→
   *   phaseFor遷移→R条件ボイス/BGM/hold_lampの発火まで一括で行う。
   *   呼び出し頻度: ギフト/広告イベント時(即時=既存イベント直結層と同じ即応性)+12秒相当の
   *   受動tick(コメントのみの配信でも減衰・降格・リーチタイムアウトが進むように)。
   * @param {{ addWeight?: number, milestoneApproach?: boolean, milestoneHit500?: boolean,
   *   milestoneHit1000Plus?: boolean, giftLargeOrAbove?: boolean, giftMega?: boolean, comboStreak?: number }} [events]
   */
  const advancePhaseDirector = (events = {}) => {
    const now = Date.now();
    if (_streamDetectedAtMs === 0) _streamDetectedAtMs = now;
    const dtMs = _meterState.updatedAt > 0 ? now - _meterState.updatedAt : 0;
    _meterState = meterStateFor(_meterState, now, Math.max(0, Number(events.addWeight) || 0));
    _baselineState = baselineFor(_baselineState, _meterState.value, dtMs);
    const r = rWithWarmup(_meterState.value, _baselineState.value, now - _streamDetectedAtMs);
    const prevPhase = _phaseState.phase;
    const prevHighestR = Number(_phaseState.highestR) || 0;
    const result = phaseFor(_phaseState, r, events, now);
    _phaseState = result.nextState;
    _bgmPhaseDiagCounters.phase = result.phase;
    _bgmPhaseDiagCounters.r = r;
    _bgmPhaseDiagCounters.b = _baselineState.value;
    _bgmPhaseDiagCounters.lastEventAt = now;

    // 採点用フェーズ実績(§SC1・BGMトグルと無関係に数える。既存reachInCount等はBGM ON時のみ
    //   動くため採点に使えない=設計書の重要発見)。liveId・rMax・持続率の分母も同じtickで進める。
    _bgmPhaseDiagCounters.liveId = liveIdFromPathname();
    _bgmPhaseDiagCounters.rMax = Math.max(Number(_bgmPhaseDiagCounters.rMax) || 0, r);
    _bgmPhaseDiagCounters.elapsedMs = (Number(_bgmPhaseDiagCounters.elapsedMs) || 0) + dtMs;
    if (r >= 1.5) _bgmPhaseDiagCounters.hotDwellMs = (Number(_bgmPhaseDiagCounters.hotDwellMs) || 0) + dtMs;
    if (result.changed && !result.silent) {
      if (result.phase === PHASE.REACH) _bgmPhaseDiagCounters.reachCount += 1;
      else if (result.phase === PHASE.BREAKTHROUGH) _bgmPhaseDiagCounters.breakthroughCount += 1;
      else if (result.phase === PHASE.JACKPOT) _bgmPhaseDiagCounters.jackpotCount += 1;
      // SC2(council/broadcast-scoring-SYNTHESIS.md §2.2): フェーズ遷移(実際に画面のフェーズ
      //   チップにも出ている確定事象)をハイライト台帳へ追記する。新規writerを作らず、
      //   この確定分岐に相乗りする(popup-entry.jsのadvancePhaseDirectorPopupと同型)。
      const highlightPhaseKind =
        result.phase === PHASE.REACH ? 'phase_reach'
        : result.phase === PHASE.BREAKTHROUGH ? 'phase_breakthrough'
        : result.phase === PHASE.JACKPOT ? 'phase_jackpot'
        : '';
      if (highlightPhaseKind) appendHighlightAndPublish(_bgmPhaseDiagCounters.liveId, highlightPhaseKind, now);
    }

    if (result.holdLampFired && _effectSoundEnabledCache) {
      playEffectSound('hold_lamp', buildEffectSoundDeps('hold_lamp'));
    }

    if (result.changed && !result.silent) {
      // 修正4: 突破/大当たりチェーン発火時はフェーズチップへ強調アニメ(§本体)。
      if (result.phase === PHASE.BREAKTHROUGH || result.phase === PHASE.JACKPOT) {
        triggerPhaseMeterPulseDom();
      }
      if (prevPhase === PHASE.NORMAL && result.phase === PHASE.ATSUI) {
        tryPlayVoice('voice_chance');
      } else if (result.phase === PHASE.REACH) {
        if (_effectSoundEnabledCache) playEffectSound('reach', buildEffectSoundDeps('reach'));
        tryPlayVoice('voice_atsui');
      } else if (result.phase === PHASE.PAYOUT && prevPhase === PHASE.JACKPOT) {
        // 大当たり→払い出し: payout SE 1本(§3.3)。BGM ONならフィーバーイン。
        if (_effectSoundEnabledCache) playEffectSound('payout', buildEffectSoundDeps('payout'));
        const feverStarted = startFeverBgm();
        // 修正2: BGM OFF/フィーバー未開始ならフィーバー終了合図(feverBgmShouldEnd)が一生来ない。
        //   payout SE予定時刻+2秒でpayoutChainDoneを決定論的に予約する(フォールバック)。
        if (!feverStarted) schedulePayoutFallback(now);
      } else if (result.phase === PHASE.NORMAL && prevPhase === PHASE.PAYOUT) {
        // フィーバー終了→通常(§3.3「払い出し→通常」)。BGM ONならジングルでシメ済み(endFeverBgmが担当)。
        clearPayoutFallback();
      }
    }

    // R自己最高更新かつR>=6.0でvoice_max(§4.1)。
    if (r >= 6.0 && r > prevHighestR) {
      tryPlayVoice('voice_max');
    }

    tickReachBgm(result.phase, r, now);
    if (_feverBgmState.playing) {
      if (events.giftMega || events.milestoneHit1000Plus) _feverBgmState = feverBgmExtend(_feverBgmState);
      if (feverBgmShouldEnd(_feverBgmState, now)) {
        endFeverBgm();
        // フィーバー終了はフェーズ層にも伝える(払い出し→通常・§3.3)。
        _phaseState = phaseFor(_phaseState, r, { payoutChainDone: true }, now).nextState;
        clearPayoutFallback();
      }
    }
    // 修正2: BGM OFF/フィーバー未開始で予約されたフォールバック(schedulePayoutFallback)の
    //   予定時刻に達したらpayoutChainDoneを合図する。PAYOUTフェーズを抜けていれば予約は無意味
    //   なのでクリアする(既にNORMAL等へ遷移済み=他経路で解決済み)。
    if (_payoutFallbackAtMs > 0) {
      if (_phaseState.phase !== PHASE.PAYOUT) {
        clearPayoutFallback();
      } else if (now >= _payoutFallbackAtMs) {
        clearPayoutFallback();
        _phaseState = phaseFor(_phaseState, r, { payoutChainDone: true }, now).nextState;
        _bgmPhaseDiagCounters.phase = _phaseState.phase;
      }
    }
    publishBgmPhaseDiag();
    paintPhaseMeterDom(result.phase, r);
  };

  // Phase C: (a) フィーバー中の音量ダック(VOICEVOX発話中50%・§5.2)。既存の発話中判定を再利用する
  //   (voicePlayer自体は無改変・読み取り専用参照)。(b) イベントが無い間も減衰/降格/リーチ120秒上限/
  //   フィーバー終了判定を進める受動tick(§3.3の時間依存の遷移はイベント駆動だけでは進まないため)。
  //   新規のstorage/直列readは増やさない(純粋な時間計算のみ・MEMORY鉄則)。
  // v0.1.1080: 拡張リロード後は markContextInvalidated が clearInterval する(他の会場
  //   タイマーと同型)。これが無いと advancePhaseDirector 経由の publishBgmPhaseDiag が
  //   無効化された chrome.storage へ触り続け、タブを閉じない限り空 tick が走り続ける。
  bgmPhaseTickTimer = window.setInterval(() => {
    if (_bgmRuntime.isPlaying()) {
      if (isNarratingNow()) _bgmRuntime.duck();
      else _bgmRuntime.unduck();
    }
    if (_streamDetectedAtMs > 0) advancePhaseDirector({});
  }, 1000);

  /** @type {Readonly<Record<string, string>>} */
  const PHASE_METER_LABEL = Object.freeze({
    normal: '通常', atsui: '煽り', reach: 'リーチ', breakthrough: '突破', jackpot: '大当たり', payout: '払い出し'
  });
  let _lastPaintedPhaseMeterSig = '';
  /**
   * 会場画面のメーターDOM(#nlsbPhaseMeter)へフェーズ色+ラベルを反映する。
   *   一度作ったDOMはremoveしない(churn地雷対策・council §6 Phase C手順書)。要素が無ければ何もしない
   *   (HTML側未対応でも安全に動く)。
   *   修正4: リーチ中は点滅系クラス(nlsb-phase-meter--blink)を付ける(§本体「リーチ中はチップを
   *   点滅系クラスに」)。突破/大当たりの強調アニメは別途triggerPhaseMeterPulseDomで発火する。
   * @param {string} phase
   * @param {number} r
   */
  function paintPhaseMeterDom(phase, r) {
    const el = document.getElementById('nlsbPhaseMeter');
    if (!el) return;
    const label = PHASE_METER_LABEL[phase] || phase;
    const sig = `${phase}|${label}`;
    if (sig !== _lastPaintedPhaseMeterSig) {
      _lastPaintedPhaseMeterSig = sig;
      const blinkClass = phase === PHASE.REACH ? ' nlsb-phase-meter--blink' : '';
      el.className = `nlsb-phase-meter nlsb-phase-meter--${phase}${blinkClass}`;
      el.textContent = label;
      el.setAttribute('aria-label', `盛り上がりフェーズ: ${label}`);
    }
    el.dataset.r = r.toFixed(2);
  }

  /**
   * 突破/大当たりチェーン発火時の強調アニメ(修正4・§本体)。既存クラスに
   *   nlsb-phase-meter--pulse を付け、animationendで自動的に外す(DOM追加削除なし)。
   *   要素が無ければ何もしない(HTML側未対応でも安全)。
   */
  function triggerPhaseMeterPulseDom() {
    const el = document.getElementById('nlsbPhaseMeter');
    if (!el) return;
    el.classList.remove('nlsb-phase-meter--pulse');
    // 同フレームでの再付与はブラウザが無変化とみなしanimationendが発火しないことがあるため
    //   reflowを挟んで再起動する(既存の.is-flying再起動パターンと同じ手法)。
    void el.offsetWidth;
    el.classList.add('nlsb-phase-meter--pulse');
    el.addEventListener(
      'animationend',
      () => el.classList.remove('nlsb-phase-meter--pulse'),
      { once: true }
    );
  }

  // 診断パネルの描画/開閉。buildVenueRoster(純関数・テスト済)で誰が顔付き席/点描かを表にする。
  const renderRosterPanel = () => {
    const roster = buildVenueRoster(lastRosterInput);
    const summaryLine = formatVenueRosterSummary(roster.summary);
    const head =
      `<div class="nlsb-roster-head">` +
      `<strong>会場メンバー一覧（診断）</strong>` +
      `<button type="button" class="nlsb-roster-close" aria-label="閉じる">×</button>` +
      `</div>` +
      `<div class="nlsb-roster-summary">${escapeHtml(summaryLine)}</div>`;
    const rowsHtml = roster.rows
      .map((r) => {
        const who = r.name || (r.userId ? `id:${r.userId}` : '匿名');
        const badges =
          (r.hasThumb ? '<span class="nlsb-roster-badge thumb">サムネ</span>' : '') +
          (r.isGift ? '<span class="nlsb-roster-badge gift">ギフト</span>' : '') +
          (r.visible
            ? '<span class="nlsb-roster-badge on">表示中</span>'
            : '<span class="nlsb-roster-badge off">隠れ</span>');
        return (
          `<div class="nlsb-roster-row">` +
          `<span class="nlsb-roster-seat">#${r.seatIndex + 1}</span>` +
          `<span class="nlsb-roster-who">${escapeHtml(who)}</span>` +
          `<span class="nlsb-roster-badges">${badges}</span>` +
          `</div>`
        );
      })
      .join('');
    rosterPanel.innerHTML =
      head +
      `<div class="nlsb-roster-list">${rowsHtml || '<div class="nlsb-roster-empty">まだ誰もいません</div>'}</div>`;
    const closeBtn = rosterPanel.querySelector('.nlsb-roster-close');
    if (closeBtn) closeBtn.addEventListener('click', () => toggleRosterPanel(false));
  };
  // v0.1.738: 診断パネルの外側(会場ステージ)をクリックしたら閉じる(× が反応しない時の保険)。
  //   パネル内部のクリックは閉じない。リスナーは開いている間だけ張る(開くクリック自身で
  //   即閉じしないよう、次のtickで張る)。
  /** @param {MouseEvent} event */
  const onRosterOutsideClick = (event) => {
    if (rosterPanel.hidden) return;
    const target = /** @type {Node|null} */ (event.target);
    if (target && rosterPanel.contains(target)) return; // パネル内は維持
    toggleRosterPanel(false);
  };
  // ───────── 発言パネル(アイコンクリックで開く・v0.1.1205) ─────────
  /**
   * 発言パネル用にこの配信の記録を読む。
   * ★呼ばれるのはクリックの瞬間だけ(常時のstorage readは1件も増やさない)。
   *   大配信では read が browser process を詰まらせる既知の地雷があるため、
   *   タイムアウト付きで走らせ、失敗しても会場の描画は止めない。
   * @param {string} liveId
   * @returns {Promise<any[]>}
   */
  const readVenueCommentRowsForSpeech = async (liveId) => {
    const lid = String(liveId || '').trim();
    if (!lid) return [];
    /** @type {unknown[]} */
    let rows = [];
    try {
      const result = await runStorageOpWithTimeout(
        () => readChunkedComments(lid, commentsStorageKey(lid), (keys) => chrome.storage.local.get(keys)),
        8000
      );
      rows = Array.isArray(result?.rows) ? result.rows : [];
    } catch {
      rows = [];
    }
    /*
     * ★v0.1.1287: テール(nls_ctail_<lv>)も読む。会場の発言パネルだけが読んでいなかった。
     *
     * ■ なぜ「発言がありません」が出続けたか(2026-08-07 実機・ユーザー証言「出たところを見たことがない」)
     *   コメントはまずテールに溜まり、compaction されて初めてチャンクへ畳まれる。
     *   しきい値は通常 200件 or 10秒、【巨大メイン(5,000件超)では 1,500件】
     *   (commentTailBuffer.js:30,33,67)。つまり大配信では
     *   【直近1,500件がチャンクに存在しない窓】ができる。
     *   発言数の少ない人がその窓に入ると、チャンクだけ読む会場では total=0 になる。
     *
     * ■ 正しい読み方の正本は comeview(comeview-entry.js:1172-1177)
     *   あちらは「チャンク → テールを合流」の2段で読む。会場だけがこの2段目を欠いていた。
     *   合流は既存の純関数 combineCanonicalComeviewRows(commentNo で重複排除)をそのまま使う
     *   =独自実装を作らない。
     *
     * ■ テールは任意(失敗しても握る)
     *   テールが読めなくても、チャンク分だけで従来どおり動く=fail-soft。
     *   read は【クリックした瞬間だけ】という既存設計を維持する(常時経路には足さない)。
     */
    try {
      const tKey = tailStorageKey(lid);
      const bag = await chrome.storage.local.get(tKey);
      rows = combineCanonicalComeviewRows(rows, Array.isArray(bag[tKey]) ? bag[tKey] : []);
    } catch {
      /* テールは任意=読めなくてもチャンク分で動く */
    }
    return rows;
  };

  /** @param {MouseEvent} event */
  const onSpeechOutsideClick = (event) => {
    if (speechPanel.hidden) return;
    const target = /** @type {Node|null} */ (event.target);
    if (target && speechPanel.contains(target)) return;
    closeSpeechPanel();
  };
  const closeSpeechPanel = () => {
    speechPanel.hidden = true;
    stage.removeEventListener('click', onSpeechOutsideClick);
  };
  /**
   * その人の全発言を読み込んでパネルに出す。
   * ★storage read はこの関数の中だけ=クリックした瞬間だけ(常時readを増やさない)。
   * @param {{ uid: string, displayName: string }} who
   */
  const openSpeechPanelFor = async (who) => {
    const uid = String(who?.uid || '').trim();
    const name = String(who?.displayName || '').trim() || uid || '(名前なし)';
    if (!uid) return; // uid が無い人(広告主等)は発言記録に紐づかない
    const head =
      `<div class="nlsb-roster-head">` +
      `<span class="nlsb-roster-title">${escapeHtml(name)} の発言</span>` +
      `<button type="button" class="nlsb-roster-close" aria-label="閉じる">✕</button>` +
      `</div>`;
    speechPanel.innerHTML = `${head}<div class="nlsb-roster-list"><div class="nlsb-roster-empty">読み込み中…</div></div>`;
    speechPanel.hidden = false;
    const closeBtnEl = speechPanel.querySelector('.nlsb-roster-close');
    if (closeBtnEl) closeBtnEl.addEventListener('click', () => closeSpeechPanel());
    setTimeout(() => {
      if (!speechPanel.hidden) stage.addEventListener('click', onSpeechOutsideClick);
    }, 0);

    /** @type {Array<{ text?: unknown, capturedAt?: unknown }>} */
    let rows = [];
    let total = 0;
    try {
      const lid = String(activeLiveId || liveIdFromPathname() || '');
      const raw = await readVenueCommentRowsForSpeech(lid);
      // v0.1.1248(2026-08-04 真因確定): extractUserCommentRows が期待するのは
      //   comeviewUserKeyForRow が返す【接頭辞つきキー】('u:<userId>' / 'n:<name>')であり、
      //   生の uid ではない(comeviewActions.js:226 は完全一致で照合する)。
      //   ここは生の uid("140475218")を渡していたため "140475218" !== "u:140475218" で
      //   全行が外れ、total が常に0=「この配信の記録にはまだ発言がありません」と
      //   出続けていた(実測: 速報では同一人物が6〜12件発言・応援者ランキング1位)。
      //   データも liveId も正しく、キーの書式だけが違う。正しい呼び出し側は
      //   comeview-entry.js:1052(comeviewUserKeyForRow を経由してから渡す)。
      const userKey = comeviewUserKeyForRow({ userId: uid });
      const picked = extractUserCommentRows(raw, userKey, VENUE_SPEECH_PANEL_MAX);
      rows = picked.rows;
      total = picked.total;
    } catch {
      rows = [];
      total = 0;
    }
    if (speechPanel.hidden) return; // 読み込み中に閉じられた

    const listHtml = rows.length
      ? rows
          .slice()
          .reverse() // 新しい順に読めるほうが「直前に何を言ったか」を追いやすい
          .map((r) => {
            const t = String(r?.text || '').trim();
            if (!t) return '';
            const at = Number(r?.capturedAt) || 0;
            const rel = at > 0 ? formatVenueHoverRelativeTime(at, Date.now()) : '';
            return (
              `<div class="nlsb-roster-row">` +
              `<span class="nlsb-roster-who">${escapeHtml(t)}</span>` +
              `<span class="nlsb-roster-badges">${escapeHtml(rel)}</span>` +
              `</div>`
            );
          })
          .join('')
      : '';
    const note = total > rows.length ? `（新しい ${rows.length} 件を表示 / 全 ${total} 件）` : `（全 ${total} 件）`;
    speechPanel.innerHTML =
      `<div class="nlsb-roster-head">` +
      `<span class="nlsb-roster-title">${escapeHtml(name)} の発言${escapeHtml(total ? note : '')}</span>` +
      `<button type="button" class="nlsb-roster-close" aria-label="閉じる">✕</button>` +
      `</div>` +
      `<div class="nlsb-roster-list">${listHtml || '<div class="nlsb-roster-empty">この配信の記録にはまだ発言がありません</div>'}</div>`;
    const closeBtn2 = speechPanel.querySelector('.nlsb-roster-close');
    if (closeBtn2) closeBtn2.addEventListener('click', () => closeSpeechPanel());
  };

  /** @param {boolean} [force] */
  const toggleRosterPanel = (force) => {
    const next = typeof force === 'boolean' ? force : rosterPanel.hidden;
    if (next) renderRosterPanel();
    rosterPanel.hidden = !next;
    if (next) {
      // 開いたクリックが即座に外側判定されないよう、次tickでリスナーを張る。
      setTimeout(() => {
        if (!rosterPanel.hidden) stage.addEventListener('click', onRosterOutsideClick);
      }, 0);
    } else {
      stage.removeEventListener('click', onRosterOutsideClick);
    }
  };

  // 2026-07-01 会議(venue-diag): 「🩺 会場の状態」パネルの描画/開閉。
  //   純ロジック(件数計算/HTML)は src/lib/venueAvatarDiagLine.js(テスト済)。ここは薄い配線だけ。
  //   renderSeats が毎回書き込む _lastVenueSeatsDiagObs(席数/参加者/ほかN/配信者混入)と、
  //   その場で participants から数えたアバター解決率を合わせて出す。sig 無変化なら DOM を触らない。
  /** @type {Partial<import('../lib/venueSeatsDiag.js').VenueSeatsDiagState>} */
  let _lastVenueSeatsDiagObs = {};
  let _lastVenueDiagSig = '';
  const renderDiagPanel = () => {
    const participants = (lastRosterInput.allSeats || []).map((s) => s && s.participant).filter(Boolean);
    const counts = computeVenueParticipantAvatarCounts(participants);
    const seatsDiag = _lastVenueSeatsDiagObs || {};
    const sig = venueDiagSig(counts, seatsDiag);
    // 無変化(件数が同じ)なら本文は触らない=明滅しない。閉じてる間の再計算も避ける。
    if (sig === _lastVenueDiagSig && diagPanel.querySelector('.nl-venue-diag')) return;
    _lastVenueDiagSig = sig;
    const updatedAgoMs =
      Number.isFinite(Number(seatsDiag.lastUpdateAt)) && Number(seatsDiag.lastUpdateAt) > 0
        ? Math.max(0, nowMs() - Number(seatsDiag.lastUpdateAt))
        : -1;
    const body = buildVenueDiagHtml({ counts, seatsDiag, updatedAgoMs });
    diagPanel.innerHTML =
      `<div class="nlsb-roster-head">` +
      `<strong>🩺 会場の状態</strong>` +
      `<button type="button" class="nlsb-roster-close" aria-label="閉じる">×</button>` +
      `</div>` +
      body;
    const closeBtn = diagPanel.querySelector('.nlsb-roster-close');
    if (closeBtn) closeBtn.addEventListener('click', () => toggleDiagPanel(false));
  };
  /** @param {MouseEvent} event */
  const onDiagOutsideClick = (event) => {
    if (diagPanel.hidden) return;
    const target = /** @type {Node|null} */ (event.target);
    if (target && diagPanel.contains(target)) return;
    toggleDiagPanel(false);
  };
  /** @param {boolean} [force] */
  const toggleDiagPanel = (force) => {
    const next = typeof force === 'boolean' ? force : diagPanel.hidden;
    if (next) {
      _lastVenueDiagSig = ''; // 開くたびに最新を1回描く(前回 sig を無視)。
      renderDiagPanel();
    }
    diagPanel.hidden = !next;
    if (next) {
      setTimeout(() => {
        if (!diagPanel.hidden) stage.addEventListener('click', onDiagOutsideClick);
      }, 0);
    } else {
      stage.removeEventListener('click', onDiagOutsideClick);
    }
  };
  // ユーザー方針「しゃべった匿名もアリーナに出して吹かせる」: 発言した userId を蓄積し、
  //   buildVenueSeating の promoteUserIds に渡して匿名でも席に座らせ吹き出させる。
  /** @type {Set<string>} */
  const spokenUserIds = new Set();
  /** @type {Map<string, number>} */
  let seatByKey = new Map();
  // 2026-07-30(wayfinder→to-spec方式・venue-ranking-churn-SPEC.md §4.3): 応援者ランキングの
  //   ヒステリシス安定化状態。seatByKeyと同じライフサイクル(初期化・配信切替リセット)で
  //   持ち回す(=リセット漏れによる前配信の現職持ち越し事故を構造的に防ぐ)。
  /** @type {string[]} */
  let supporterOrderKeys = [];
  let _supporterRankDrops = 0;
  let _supporterRankOvertakes = 0;
  /**
   * @typedef {{ bubbleKey?: number|string, seatIndex: number, fallbackAnchor?: {x:number,y:number}|null,
   *   element: HTMLDivElement, fadeTimer: number, removeTimer: number, removed: boolean,
   *   voiceState?: string, createdAt?: number, flowLifetimeMs?: number, reducedMotion?: boolean,
   *   speakingCapTimer?: number, _x?: number, _y?: number, _h?: number }} VenueBubble
   */
  /** @type {Map<number|string, VenueBubble>} */
  const bubbleBySeat = new Map();
  /** @type {VenueBubble[]} */
  const activeBubbles = [];

  // v0.1.755 リアルタイム完璧化: 吹き出しの「流速(件/秒)」を直近窓で測り、寿命を可変にする
  //   (速いほど短命=画面が古い吹き出しで埋まり「今」が見えなくなるのを防ぐ)。
  /** @type {number[]} 直近の吹き出し時刻(ms)。窓外は捨てる。 */
  let bubbleFlowTimestamps = [];
  /** @param {number} nowMs */
  const recordBubbleFlow = (nowMs) => {
    bubbleFlowTimestamps.push(nowMs);
    const cutoff = nowMs - BUBBLE_FLOW_WINDOW_MS;
    if (bubbleFlowTimestamps.length > 256 || bubbleFlowTimestamps[0] < cutoff) {
      bubbleFlowTimestamps = bubbleFlowTimestamps.filter((t) => t >= cutoff);
    }
  };
  /** @param {number} nowMs @returns {number} 直近窓のコメント/秒 */
  const currentBubbleFlowPerSec = (nowMs) => {
    const cutoff = nowMs - BUBBLE_FLOW_WINDOW_MS;
    const n = bubbleFlowTimestamps.filter((t) => t >= cutoff).length;
    return (n / BUBBLE_FLOW_WINDOW_MS) * 1000;
  };

  /**
   * @param {VenueBubble} bubble
   */
  const removeBubble = (bubble) => {
    if (!bubble || bubble.removed) return;
    bubble.removed = true;
    // 2026-07-24 計器(観測のみ): 消滅時点のvoiceStateを数える(voiced/unvoiced分布・偽陽性潰し用)。
    try { observeVenueBubbleRemoval(_bubbleChurn, bubble.voiceState); } catch { /* 計器失敗は描画を止めない */ }
    if (bubble.fadeTimer) clearTimeout(bubble.fadeTimer);
    if (bubble.removeTimer) clearTimeout(bubble.removeTimer);
    if (bubble.speakingCapTimer) clearTimeout(bubble.speakingCapTimer);
    const key = bubble.bubbleKey != null ? bubble.bubbleKey : bubble.seatIndex;
    if (bubbleBySeat.get(key) === bubble) {
      bubbleBySeat.delete(key);
    }
    const index = activeBubbles.indexOf(bubble);
    if (index >= 0) activeBubbles.splice(index, 1);
    bubble.element.remove();
  };

  /**
   * v0.1.757: 席が無い発言者(150席溢れの観客・名前のみ匿名)の吹き出しを置く決定座標。
   * speakerKey のハッシュで毎回同じ位置(同じ人は同じ場所)・会場の下端(客席)領域に散らす。
   * 席が後で出来れば次回の発言は席の頭上に戻る。bubbleLayer 基準のローカル座標(px)。
   * @param {string} speakerKey
   * @returns {{ x: number, y: number }}
   */
  const crowdBubbleAnchor = (speakerKey) => {
    let h = 2166136261;
    const s = String(speakerKey || '');
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const frac = ((h >>> 0) % 1000) / 1000; // 0..1 決定的
    let w = 800;
    let bottom = 560;
    try {
      const r = bubbleLayer.getBoundingClientRect();
      if (r && r.width > 0) w = r.width;
      if (r && r.height > 0) bottom = r.height - 80; // 下端の客席帯
    } catch { /* no-op */ }
    const x = Math.round(40 + frac * Math.max(80, w - 200));
    return { x, y: Math.max(40, bottom) };
  };

  const clearBubbles = () => {
    for (const bubble of [...activeBubbles]) removeBubble(bubble);
  };

  /**
   * @param {string} text
   * @returns {string}
   */
  const truncateBubbleText = (text) => {
    const chars = Array.from(String(text || '').trim());
    if (chars.length <= BUBBLE_TEXT_MAX) return chars.join('');
    return `${chars.slice(0, BUBBLE_TEXT_MAX).join('')}…`;
  };

  /**
   * @param {{ speakerKey: string, text: string }} speech
   */
  const showSpeechBubble = (speech) => {
    const seatIndex = seatByKey.get(speech.speakerKey);
    const hasSeat = typeof seatIndex === 'number' && Number.isInteger(seatIndex);
    const node = hasSeat ? seatNodes[seatIndex] : null;
    // v0.1.757「音声だけ出て吹き出し出ない/読み飛ばし」根治(会議): 席が無い発言者(150席溢れの観客・
    //   名前のみ匿名等)でも、黙って return せず【観客領域の決定座標(speakerKey ハッシュ)】に吹き出す。
    //   声は席非依存で必ず鳴るので、吹き出しも席非依存で必ず出して対称にする(v0.1.745の精神)。
    const seatUsable = hasSeat && node && !node.seat.classList.contains('nlsb-is-empty');

    const streak = updateSpeechStreak(speechStreaks, speech.speakerKey, Date.now());
    if (seatUsable) {
      // v0.1.742 co-presence: 発言した席を一度だけふわっと反応させる(会場が発言に気づく演出)。
      node.seat.classList.remove('nlsb-seat-speaking');
      void node.seat.offsetWidth; // reflow を強制してアニメーションを再起動
      node.seat.classList.add('nlsb-seat-speaking');
      window.setTimeout(() => node.seat.classList.remove('nlsb-seat-speaking'), 650);

      // v0.1.743 「会話の連鎖」: 同じ人が短い間隔で続けて喋ったら席が継続的に輝く。
      const streakStage = streakGlowStage(streak.count);
      if (streakStage > 0) node.seat.dataset.streak = String(streakStage);
      else delete node.seat.dataset.streak;
    }

    const text = truncateBubbleText(speech.text);
    if (!text) return;
    // 吹き出しのキー: 席があれば seatIndex(number)、無ければ speakerKey 由来(席番号と衝突しない string)。
    const bubbleKey = seatUsable ? seatIndex : `nf:${speech.speakerKey}`;
    const previous = bubbleBySeat.get(bubbleKey);
    if (previous) removeBubble(previous);
    // v0.1.771: 上限超過時は「読み上げ中(speaking)は最後まで残す」優先順位で消す。
    //   会議: unvoiced/pending(古い順)→ done → speaking(古い発言順)。盲目的な最古削除をやめる。
    if (activeBubbles.length >= BUBBLE_MAX) {
      const toEvict = selectBubblesToEvict(activeBubbles, BUBBLE_MAX - 1, Date.now());
      for (const victim of toEvict) removeBubble(victim);
      // 2026-07-21 計器(観測のみ): 上限超過による強制退去回数を数える。失敗は握る(描画を止めない)。
      try { observeVenueBubbleEviction(_bubbleChurn, toEvict.length); } catch { /* 計器失敗は描画を止めない */ }
    }

    const element = document.createElement('div');
    element.className = 'nlsb-bubble';

    const textSpan = document.createElement('span');
    textSpan.className = 'nlsb-bubble-text';
    textSpan.textContent = text;
    element.appendChild(textSpan);

    element.setAttribute('aria-hidden', 'true');
    // 会議確定A: 席ノードでなく最上位レイヤーへ描く(overflow:hidden に切られない)。
    bubbleLayer.appendChild(element);

    // v0.1.755 リアルタイム完璧化: 流速可変の基準寿命(速い配信は短命=次々入れ替え、過疎は長く)。
    //   その上で連続発言の人は少し長く残す(会話の連鎖)。max で「連続発言は流速可変より短くしない」。
    const now = Date.now();
    recordBubbleFlow(now);
    const ratePerSec = currentBubbleFlowPerSec(now);
    const flowBase = resolveBubbleFlowLifetimeMs(ratePerSec, BUBBLE_LIFETIME_MS);
    const lifetimeMs = Math.max(flowBase, streakBubbleLifetimeMs(streak.count, flowBase));
    // 2026-07-21 計器(観測のみ): 吹き出し1個の生成・寿命バケット・流速を数える。失敗は握る(描画を止めない)。
    try { observeVenueBubbleSpawn(_bubbleChurn, { flowLifetimeMs: flowBase, ratePerSec }); } catch { /* 計器失敗は描画を止めない */ }
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const bubble = {
      bubbleKey,
      seatIndex: seatUsable ? seatIndex : -1,
      // 席が無い発言者は観客領域の決定座標(speakerKey ハッシュで毎回同じ位置)へ。
      fallbackAnchor: seatUsable ? null : crowdBubbleAnchor(speech.speakerKey),
      element,
      fadeTimer: 0,
      removeTimer: 0,
      removed: false,
      // v0.1.771 読み上げ連動: pending=合成待ち(流速寿命で消える)/speaking=再生中(消さない)/
      //   done=再生終了(余韻)/unvoiced=鳴らない(流速寿命のまま)。createdAt/flowLifetimeMs/reducedMotion は
      //   状態が変わったとき寿命を再計算するために保持。
      voiceState: 'pending',
      createdAt: now,
      flowLifetimeMs: lifetimeMs,
      reducedMotion,
      speakingCapTimer: 0
    };
    bubbleBySeat.set(bubbleKey, bubble);
    activeBubbles.push(bubble);

    // 席の座標を測ってレイヤー基準の頭上へ配置。既存吹き出しと重なれば上へ逃がす(衝突回避)。
    positionBubble(bubble);

    // 初期(pending)の寿命。読み上げONなら合成遅れに備えて床(BUBBLE_PENDING_VOICE_FLOOR_MS)を効かせ、
    //   「声が鳴り始める前に流速寿命で消える」隙間を塞ぐ。speaking になればこのタイマーは解除される。
    scheduleBubbleFade(bubble, resolvePendingLifetimeMs(lifetimeMs, voicePlayer.enabled));
    // v0.1.800 案C: 読み上げONのときだけ「仮(previoice)」見た目で出す(声が鳴り始めたら本表示へ昇格)。
    //   読み上げOFF/VOICEVOX無しのときは付けない=従来どおり最初から鮮明(声非依存・v0.1.757 不変)。
    if (voicePlayer.enabled) element.classList.add('nlsb-bubble-previoice');
    return bubble;
  };

  /**
   * 吹き出しの fade/remove タイマーを(再)設定する。寿命変更(状態遷移)時に呼ぶ。
   * @param {VenueBubble} bubble
   * @param {number} lifetimeMs 表示開始(createdAt)からの総寿命でなく「今から」消えるまでの ms
   */
  const scheduleBubbleFade = (bubble, lifetimeMs) => {
    if (!bubble || bubble.removed) return;
    if (bubble.fadeTimer) { clearTimeout(bubble.fadeTimer); bubble.fadeTimer = 0; }
    if (bubble.removeTimer) { clearTimeout(bubble.removeTimer); bubble.removeTimer = 0; }
    const ms = Math.max(0, lifetimeMs);
    if (!bubble.reducedMotion) {
      bubble.fadeTimer = window.setTimeout(() => {
        bubble.fadeTimer = 0;
        if (!bubble.removed) bubble.element.classList.add('nlsb-is-leaving');
      }, Math.max(0, ms - BUBBLE_FADE_MS));
    }
    bubble.removeTimer = window.setTimeout(() => {
      bubble.removeTimer = 0;
      removeBubble(bubble);
    }, ms);
  };

  /**
   * 読み上げが【実際に始まった】= speaking。再生終了(markBubbleDone)まで吹き出しを消さない。
   *   滞留対策として安全上限(SPEAKING_CAP)だけは保険のタイマーを張る。
   * @param {VenueBubble} bubble
   */
  const markBubbleSpeaking = (bubble) => {
    if (!bubble || bubble.removed) return;
    const next = nextBubbleVoiceState(bubble.voiceState, 'audioStart');
    if (next !== 'speaking' || bubble.voiceState === 'speaking') { bubble.voiceState = next; return; }
    bubble.voiceState = 'speaking';
    // 消えるタイマーを解除して「鳴っている間は残す」。fade も戻す(既に薄くなっていたら濃く戻る)。
    if (bubble.fadeTimer) { clearTimeout(bubble.fadeTimer); bubble.fadeTimer = 0; }
    if (bubble.removeTimer) { clearTimeout(bubble.removeTimer); bubble.removeTimer = 0; }
    bubble.element.classList.remove('nlsb-is-leaving');
    // v0.1.800 案C: 声が鳴り始めた瞬間に「仮(previoice)」を外して「本(鮮明・等倍)」へ瞬時昇格
    //   =声と同時に立ち上がった体感。あわせて一度だけ淡く光らせる(v0.1.773 voiced)。
    bubble.element.classList.remove('nlsb-bubble-previoice');
    // v0.1.773 軽い同期: 声が鳴り始めた瞬間に吹き出しを一度だけ強調(視聴覚を結びつけ「同時」と
    //   感じさせる)。吹き出しは即時のまま=即時性は犠牲にしない(会議の(A)全面同期は不採用)。
    bubble.element.classList.add('nlsb-bubble-voiced');
    if (bubble.speakingCapTimer) clearTimeout(bubble.speakingCapTimer);
    bubble.speakingCapTimer = window.setTimeout(() => {
      bubble.speakingCapTimer = 0;
      // 上限超過(極端に長い読み上げ)= done 同様に余韻で畳む(枠を空ける)。
      markBubbleDone(bubble);
    }, BUBBLE_VOICE_SPEAKING_CAP_MS);
  };

  /**
   * 読み上げが【終わった】= done。余韻(AFTERGLOW)を置いてから消す。
   * @param {VenueBubble} bubble
   */
  const markBubbleDone = (bubble) => {
    if (!bubble || bubble.removed) return;
    const next = nextBubbleVoiceState(bubble.voiceState, 'audioEnd');
    bubble.voiceState = next;
    // v0.1.800 案C: 念のため仮(previoice)を外す(pending のまま audioEnd 取りこぼし経路でも鮮明に)。
    bubble.element.classList.remove('nlsb-bubble-previoice');
    if (bubble.speakingCapTimer) { clearTimeout(bubble.speakingCapTimer); bubble.speakingCapTimer = 0; }
    if (next === 'done') scheduleBubbleFade(bubble, BUBBLE_VOICE_AFTERGLOW_MS);
  };

  /**
   * v0.1.799: 読み上げが【鳴らずに捨てられた】(stale/件数drop/合成失敗/merge)= resolved。
   *   pending のままだと床(=鮮度ゲート8秒)いっぱい残ってしまうので unvoiced に落とし、
   *   通常の流速寿命で普通に消す。onDropped は再生では発火しないので speaking 中に来ない
   *   (nextBubbleVoiceState の終端ガードでも speaking/done は維持=取りこぼし無し)。
   * @param {VenueBubble} bubble
   */
  const markBubbleResolved = (bubble) => {
    if (!bubble || bubble.removed) return;
    const next = nextBubbleVoiceState(bubble.voiceState, 'resolved');
    if (next === bubble.voiceState) return; // speaking/done/unvoiced は変化なし
    bubble.voiceState = next; // pending → unvoiced
    // v0.1.800 案C: 鳴らないと確定したら「仮(previoice)」を外して鮮明に戻す(淡いまま消えると
    //   「読まれなかったから薄いまま」に見えて不自然。鳴らないコメントも普通の吹き出しとして見せる)。
    bubble.element.classList.remove('nlsb-bubble-previoice');
    // 流速寿命(=showSpeechBubble 当初の lifetimeMs)で消す。床(pending floor)は使わない。
    const flow = typeof bubble.flowLifetimeMs === 'number' && bubble.flowLifetimeMs > 0
      ? bubble.flowLifetimeMs
      : 0;
    const age = Date.now() - (bubble.createdAt || Date.now());
    scheduleBubbleFade(bubble, Math.max(0, flow - age));
  };

  // v0.1.778 ギフト/広告の投げ演出: 投げ主のサムネ座標→中央映像へ放物線で飛ばす。
  //   DOMプール(固定数を使い回し)+同時上限(canLaunchGiftThrow)で会場を重くしない。
  /** @type {HTMLDivElement[]} 使い回す投げ物要素のプール。 */
  const giftProjPool = [];
  let giftProjActive = 0;
  const GIFT_PROJ_POOL_SIZE = 10;
  /** bubbleLayer ローカル座標での席アイコン中心(無ければ crowdBubbleAnchor)。 @param {string} speakerKey */
  const giftThrowOriginForSpeaker = (speakerKey) => {
    const seatIndex = seatByKey.get(speakerKey);
    const node = typeof seatIndex === 'number' ? seatNodes[seatIndex] : null;
    // person-tile-unify 第3コミット: 旧 node.icon は廃止。本物タイルのアバター要素を起点に。
    const anchorEl = node ? seatAnchorEl(node) : null;
    if (anchorEl && anchorEl.isConnected) {
      try {
        const layerRect = bubbleLayer.getBoundingClientRect();
        const r = anchorEl.getBoundingClientRect();
        if (r.width > 0) {
          return { x: r.left - layerRect.left + r.width / 2, y: r.top - layerRect.top + r.height / 2 };
        }
      } catch { /* fallthrough */ }
    }
    return crowdBubbleAnchor(speakerKey); // 席無し/匿名/座標不能はフォールバック
  };
  /** 中央映像(safeArea)の中心を bubbleLayer ローカル座標で。 */
  const giftThrowTarget = () => {
    try {
      const layerRect = bubbleLayer.getBoundingClientRect();
      const r = safeArea.getBoundingClientRect();
      if (r.width > 0) {
        return { x: r.left - layerRect.left + r.width / 2, y: r.top - layerRect.top + r.height / 2 };
      }
    } catch { /* fallthrough */ }
    // 保険: レイヤー中央上寄り。
    const lr = bubbleLayer.getBoundingClientRect();
    return { x: lr.width / 2, y: lr.height * 0.4 };
  };
  /**
   * v0.1.1057: 診断カウンタ(giftThrown)が「実際に投げたか」を正しく数えられるよう、
   *   早期return(上限超過/会場閉時)かどうかを呼び出し元へ返す(観測のみ・演出ロジックは不変)。
   * @param {string} speakerKey
   * @param {{ kind:string, emoji:string, label:string, durationMs:number, imageUrl?:string }} proj
   * @param {number} [detectAt] v0.1.1088計器: このギフトの検知時刻(epoch ms)。未指定なら計測しない。
   * @returns {boolean} true=実際に投擲DOMを生成した / false=上限超過・会場閉等で捨てた
   */
  const launchGiftThrow = (speakerKey, proj, detectAt) => {
    if (!proj || !open) return false;
    if (!canLaunchGiftThrow(giftProjActive)) {
      // 2026-07-30(診断先行アプローチ): 同時投擲上限(GIFT_THROW_MAX_CONCURRENT)超過は
      //   性能ガードによる正常動作だが、従来この件数を計上する内訳が無く「検知N→演出N-k」の
      //   差分が常に⚠(取りこぼし)扱いになっていた(実配信で検知24→演出21の3件差を誤診断)。
      //   proj.kindで種別を判定し、音側(giftSoundGuarded等)と同じ思想で内訳計上する。
      if (proj.kind === 'ad') {
        _giftEffectDiagCounters.adThrowCapGuarded += 1;
      } else {
        _giftEffectDiagCounters.giftThrowCapGuarded += 1;
      }
      publishGiftEffectDiag();
      return false; // 上限超過は捨てる(性能最優先)
    }
    const el = giftProjPool.pop() || (() => {
      const d = document.createElement('div');
      d.className = 'nlsb-gift-proj';
      bubbleLayer.appendChild(d);
      return d;
    })();
    // 2026-07-06根治: 「デルタ補完/来場入賞(匿名speakerKey='')は音は鳴るが飛翔が見えない」の
    //   修正。origin/target が (0,0)・領域外・NaN 等の「レイアウト未確定の失敗値」なら
    //   resolveVisibleThrowPoint が可視の既定位置へ差し替える(純関数・giftThrowProjectile.js)。
    //   bubbleLayer の実サイズが取れなければ既定サイズ(800x600想定)を最終手段に使う。
    let layerSize = null;
    try {
      const lr = bubbleLayer.getBoundingClientRect();
      layerSize = { width: lr.width, height: lr.height };
    } catch { /* layerSize=null のまま resolveVisibleThrowPoint 側の既定にフォールバック */ }
    const rawOrigin = giftThrowOriginForSpeaker(speakerKey);
    const rawTarget = giftThrowTarget();
    const originResolved = resolveVisibleThrowPoint(rawOrigin, layerSize, 'origin');
    const targetResolved = resolveVisibleThrowPoint(rawTarget, layerSize, 'target');
    if (originResolved.usedFallback || targetResolved.usedFallback) {
      _giftEffectDiagCounters.throwPointFallbackUsed += 1;
    }
    const origin = { x: originResolved.x, y: originResolved.y };
    const target = { x: targetResolved.x, y: targetResolved.y };
    const path = resolveGiftThrowPath(origin, target);
    el.innerHTML = '';
    // v0.1.783: item_id があれば実画像を投げ物に。読み込み失敗時は絵文字へフォールバック。
    //   画像は写真調なので mix-blend:screen を外す(is-image クラスで CSS 切替)。
    const imageUrl = String(proj.imageUrl || '');
    el.classList.toggle('is-image', Boolean(imageUrl));
    if (imageUrl) {
      const img = document.createElement('img');
      img.className = 'nlsb-gift-proj-img';
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'eager';
      // 失敗したら画像をやめて絵文字+ラベルに差し替え(欠け画像を出さない)。
      img.addEventListener('error', () => {
        el.classList.remove('is-image');
        img.remove();
        const emoji = document.createElement('span');
        emoji.className = 'nlsb-gift-proj-emoji';
        emoji.textContent = proj.emoji;
        const label = document.createElement('span');
        label.textContent = proj.label;
        el.prepend(label);
        el.prepend(emoji);
      }, { once: true });
      img.src = imageUrl;
      el.append(img);
    } else {
      const emoji = document.createElement('span');
      emoji.className = 'nlsb-gift-proj-emoji';
      emoji.textContent = proj.emoji;
      const label = document.createElement('span');
      label.textContent = proj.label;
      el.append(emoji, label);
    }
    el.style.left = `${path.startX}px`;
    el.style.top = `${path.startY}px`;
    el.style.setProperty('--nlsb-gift-dx', `${path.dx}px`);
    el.style.setProperty('--nlsb-gift-dy', `${path.dy}px`);
    el.style.setProperty('--nlsb-gift-mx', `${path.midX}px`);
    el.style.setProperty('--nlsb-gift-my', `${path.midY}px`);
    el.style.setProperty('--nlsb-gift-dur', `${proj.durationMs}ms`);
    giftProjActive += 1;
    const recycle = () => {
      el.removeEventListener('animationend', recycle);
      // v0.1.1088計器: 「検知→着弾演出」の体感ギャップ(着弾=投擲アニメ完了の瞬間・演出は不変)。
      if (Number.isFinite(Number(detectAt)) && Number(detectAt) > 0) {
        const gap = Math.max(0, Date.now() - Number(detectAt));
        _giftEffectDiagCounters.lastBurstGapMs = gap;
        _giftEffectDiagCounters.avgBurstGapMs = computeGiftGapAverage(_giftEffectDiagCounters.avgBurstGapMs, gap);
        publishGiftEffectDiag();
      }
      // v0.1.783: is-flying と is-image を両方落とす(プール再利用時に画像用スタイルが残らないよう)。
      el.classList.remove('is-flying', 'is-image');
      el.style.cssText = '';
      el.textContent = '';
      giftProjActive = Math.max(0, giftProjActive - 1);
      if (giftProjPool.length < GIFT_PROJ_POOL_SIZE) giftProjPool.push(el);
      else el.remove();
    };
    el.addEventListener('animationend', recycle, { once: true });
    // 念のための保険タイマー(animationend 取りこぼし時も必ず回収)。
    window.setTimeout(recycle, proj.durationMs + 400);
    // reflow を挟んでから is-flying(アニメ再起動の確実化)。
    void el.offsetWidth;
    el.classList.add('is-flying');
    return true;
  };
  /* ------------------------------------------------------------------ */
  /* 入場演出(サイドパネル→会場へ「運ぶ」) 2026-08-08                    */
  /* 正本SPEC: docs/handoff/venue-transport-effect-SPEC-2026-08-08.md    */
  /* ------------------------------------------------------------------ */
  /** 差分検出と間引きの正本(純ロジック・DOM無し)。 */
  const entryQueue = createVenueEntryQueue();
  /** 入場投射体のプール(gift と同じ作法)。 @type {HTMLElement[]} */
  const entryProjPool = [];
  const ENTRY_PROJ_POOL_SIZE = 8;
  /** 計器: 入場演出の実績(状態速報に出す)。 */
  const _entryEffectDiag = { flown: 0, seatedDirect: 0, suppressedFirst: 0, suppressedLiveChange: 0, noSeat: 0 };

  /**
   * 画面端(サイドパネル側)の座標を bubbleLayer ローカルで返す。
   * ★サイドパネルと会場は別ウィンドウ/別ドキュメントなので DOM をまたいで実際に飛ばすことは
   *   できない。「その方向から飛んでくる」見立てで十分伝わる(SPEC §5)。
   *   Chrome のサイドパネルは既定で【右】なので右端から。
   * @param {number} seatY 着地点のY(高さを合わせると自然に見える)
   */
  const entryOriginPoint = (seatY) => {
    try {
      const lr = bubbleLayer.getBoundingClientRect();
      return { x: lr.width + 40, y: Number.isFinite(seatY) ? seatY : lr.height * 0.5 };
    } catch {
      return { x: 900, y: 300 };
    }
  };

  /**
   * 席の中心を bubbleLayer ローカル座標で返す(giftThrowOriginForSpeaker の着地版)。
   * @param {string} key 席 key
   * @returns {{ x: number, y: number, node: any } | null}
   */
  const entrySeatPoint = (key) => {
    const seatIndex = seatByKey.get(key);
    const node = typeof seatIndex === 'number' ? seatNodes[seatIndex] : null;
    const anchorEl = node ? seatAnchorEl(node) : null;
    if (!anchorEl || !anchorEl.isConnected) return null;
    try {
      const layerRect = bubbleLayer.getBoundingClientRect();
      const r = anchorEl.getBoundingClientRect();
      if (r.width <= 0) return null;
      return {
        x: r.left - layerRect.left + r.width / 2,
        y: r.top - layerRect.top + r.height / 2,
        node
      };
    } catch {
      return null;
    }
  };

  /**
   * 1人ぶんの入場を飛ばす。
   * ★アイコンは【席タイルの実アバターを複製】する。席タイルは正本の解決器を通って
   *   作られているので、これで白丸事故(v1286)を構造的に避けられる=自前で解決し直さない。
   * @param {string} key 席 key
   * @returns {boolean} true=飛ばした / false=席が無い等で飛ばせなかった(着席はしている)
   */
  const launchEntryFlight = (key) => {
    if (!open) return false;
    const seat = entrySeatPoint(key);
    if (!seat) {
      _entryEffectDiag.noSeat += 1;
      return false; // 席が見つからない=演出だけ諦める(その人は席に居る)
    }
    const el = entryProjPool.pop() || (() => {
      const d = document.createElement('div');
      d.className = 'nlsb-entry-proj';
      bubbleLayer.appendChild(d);
      return d;
    })();
    el.innerHTML = '';
    // 席の実アバターを複製(解決済みの img をそのまま使う)。
    const srcEl = seatAnchorEl(seat.node);
    const srcImg = srcEl ? srcEl.querySelector('img') : null;
    if (srcImg instanceof HTMLImageElement && srcImg.src) {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.src = srcImg.src;
      el.append(img);
    } else if (srcEl instanceof HTMLElement) {
      // 画像でない(ゆっくり顔の合成DOM等)ならクローンで見た目を保つ。
      const clone = /** @type {HTMLElement} */ (srcEl.cloneNode(true));
      clone.removeAttribute('id');
      el.append(clone);
    }
    const origin = entryOriginPoint(seat.y);
    const dx = seat.x - origin.x;
    const dy = seat.y - origin.y;
    el.style.left = `${origin.x}px`;
    el.style.top = `${origin.y}px`;
    el.style.setProperty('--nlsb-entry-dx', `${dx}px`);
    el.style.setProperty('--nlsb-entry-dy', `${dy}px`);
    // 中間点を少し上に持ち上げて弧を描く(gift と同じ考え方)。
    el.style.setProperty('--nlsb-entry-mx', `${dx * 0.55}px`);
    el.style.setProperty('--nlsb-entry-my', `${dy * 0.55 - 46}px`);
    el.style.setProperty('--nlsb-entry-dur', `${VENUE_ENTRY_FLIGHT_MS}ms`);

    const recycle = () => {
      el.removeEventListener('animationend', recycle);
      el.classList.remove('is-flying');
      el.style.cssText = '';
      el.textContent = '';
      entryQueue.onFlightDone(key);
      if (entryProjPool.length < ENTRY_PROJ_POOL_SIZE) entryProjPool.push(el);
      else el.remove();
      // 着弾: 席を一度ふくらませて「確定」を示す。
      const landed = entrySeatPoint(key);
      if (landed && landed.node && landed.node.seat) {
        const seatEl = landed.node.seat;
        seatEl.classList.remove('nlsb-seat-entered');
        void seatEl.offsetWidth; // reflow でアニメ再起動を確実に
        seatEl.classList.add('nlsb-seat-entered');
        window.setTimeout(() => seatEl.classList.remove('nlsb-seat-entered'), 700);
      }
    };
    el.addEventListener('animationend', recycle, { once: true });
    // 保険タイマー(animationend 取りこぼしでもキューを詰まらせない)。
    window.setTimeout(recycle, VENUE_ENTRY_FLIGHT_MS + 400);
    void el.offsetWidth;
    el.classList.add('is-flying');
    _entryEffectDiag.flown += 1;
    return true;
  };

  /**
   * renderSeats の直後に呼ぶ: 新規入場者を検出して演出を起こす。
   * ★人は絶対に消さない。演出を間引くだけ(SPEC §4)。
   * @param {string} liveId
   */
  const runEntryEffects = (liveId) => {
    try {
      const keys = Array.from(seatByKey.keys()).map((k) => String(k));
      const r = entryQueue.tick({ keys, liveId: String(liveId || '') });
      if (r.suppressedReason === 'first_paint') _entryEffectDiag.suppressedFirst += r.seat.length;
      else if (r.suppressedReason === 'live_changed') _entryEffectDiag.suppressedLiveChange += r.seat.length;
      else _entryEffectDiag.seatedDirect += r.seat.length;
      for (const key of r.fly) {
        if (!launchEntryFlight(key)) entryQueue.onFlightDone(key); // 飛ばせなくても枠は返す
      }
    } catch { /* 演出の失敗は会場の描画を止めない */ }
  };

  /** speech.text からギフト/広告を検出して投げる。 @param {{ text?: unknown, speakerKey?: string }} speech */
  const maybeThrowGiftFromSpeech = (speech) => {
    const text = String(speech?.text || '');
    if (!text) return;
    const gift = parseGiftCommentText(text);
    if (gift) {
      const _detectAt = Date.now(); // v0.1.1088計器: 検知→音/着弾ギャップの起点。
      _giftEffectDiagCounters.giftDetected += 1;
      _giftEffectDiagCounters.lastEventAt = _detectAt;
      // v0.1.1090: 本物の個別イベントを検知した=帳簿に「説明済み」として計上する
      //   (このptぶんはデルタ合成が二重に投げないようにする)。
      // 既知の限度: 同じギフトがコメント本文パースとNDGR構造化eventの両方から観測される配信では
      //   (handleNewGiftEvents側は既存のthrownGiftEventKeysで重複投擲を防いでいるが、この経路には
      //   同型のdedupが無い=既存の設計・v0.1.778コメント参照)accountedPointsが実際より過大になり
      //   得る。帳簿は単調加算のため自己修復しないが、安全側(デルタ合成を過小評価するだけで
      //   誤検知・二重発火は起きない)に倒れる。dedup自体は本パッチのスコープ外。
      _giftDeltaState = accountRealGiftEvent(_giftDeltaState, Number(gift?.point) || 0, _detectAt);
      const p = resolveGiftProjectile(gift, 'gift');
      if (p) {
        // v0.1.1057: launchGiftThrow の戻り値(実際に投げたか)を見てからカウントする。
        //   従来は呼び出し直後に無条件加算しており、上限超過等の早期returnも「投げた」扱いに
        //   なって giftThrown が実態より過大(=取りこぼしを過小報告)していた。
        if (launchGiftThrow(speech.speakerKey, p, _detectAt)) {
          _giftEffectDiagCounters.giftThrown += 1;
          // v0.1.1061: 即時再生をやめ、着弾タイミングに1本だけ予約(バーストは置換昇格)。
          if (scheduleGiftSound(p.tier, p.durationMs, _detectAt) === 'coalesced') {
            _giftEffectDiagCounters.giftSoundCoalesced += 1;
          }
        }
      }
      publishGiftEffectDiag();
      return;
    }
    const ad = parseNicoadCommentText(text);
    if (ad) {
      _giftEffectDiagCounters.adDetected += 1;
      _giftEffectDiagCounters.lastEventAt = Date.now();
      const p = resolveGiftProjectile(ad, 'ad');
      if (p) {
        if (launchGiftThrow(speech.speakerKey, p)) {
          _giftEffectDiagCounters.adThrown += 1;
          if (_effectSoundEnabledCache) {
            playEffectSound(EFFECT_SOUND_KINDS.AD, buildEffectSoundDeps(EFFECT_SOUND_KINDS.AD));
            _giftEffectDiagCounters.adSoundPlayed += 1;
          }
          // Phase C(§3.2): 広告+8をメーターへ加算。
          advancePhaseDirector({ addWeight: METER_WEIGHT_AD });
        }
      }
      publishGiftEffectDiag();
    }
  };

  /**
   * 2026-07-06: 「来場」システムメッセージ(放送者の好み/大百科記事/好き/興味)を検知して
   *   パチンコの入賞演出(保留玉が入る)として投げる。既存のギフト投擲(launchGiftThrow)を
   *   流用し、新規の投擲経路は増やさない。v0.1.1095の教訓を踏襲: launchGiftThrow の戻り値
   *   ゲート+ブロック全体try/catch+例外はerror計上(嘘をつかない全数計上)。
   * @param {{ text?: unknown, speakerKey?: string }} speech
   */
  const maybeThrowArrivalFromSpeech = (speech) => {
    const text = String(speech?.text || '');
    if (!text) return;
    const arrival = parseArrivalCommentText(text);
    if (!arrival) return;
    const _detectAt = Date.now();
    _giftEffectDiagCounters.arrivalDetected += 1;
    _giftEffectDiagCounters.lastEventAt = _detectAt;
    try {
      // 歯止め: 来場演出専用の20秒CD。CD中は演出をスキップしカウンタ計上のみ(積み増し禁止=
      //   待たせて後で鳴らさない)。CD自体は検知カウンタとは独立に計上する。
      if (!shouldFireArrivalEffect(_lastArrivalEffectAtMs, _detectAt, ARRIVAL_EFFECT_CD_MS)) {
        _giftEffectDiagCounters.arrivalSkippedCd += 1;
        publishGiftEffectDiag();
        return;
      }
      const label = buildArrivalLabel(arrival);
      const tier = 'small'; // 来場は常に軽量演出(設計原則: 無料イベントは有料ギフトより必ず控えめ。件数はラベルのみで表現し、音は常にhold_lamp固定=昇格しない)
      const proj = {
        kind: 'gift',
        emoji: ARRIVAL_EMOJI,
        label,
        point: 0,
        tier,
        durationMs: GIFT_THROW_DURATION_MS[tier],
        imageUrl: ''
      };
      if (launchGiftThrow('', proj, _detectAt)) {
        _lastArrivalEffectAtMs = _detectAt;
        _giftEffectDiagCounters.arrivalThrown += 1;
        const soundKind = arrivalSoundKindForCount(arrival.totalCount);
        const playResult = playEffectSound(soundKind, buildEffectSoundDeps(soundKind));
        if (playResult === 'played') {
          _giftEffectDiagCounters.arrivalSoundPlayed += 1;
        }
        // メーター連動: 実際に人が来た事実はコメント+1と同じ重みで加算(上限5・順位変動と違い許容対象)。
        advancePhaseDirector({ addWeight: arrivalMeterWeight(arrival.totalCount) });
      }
    } catch {
      // v0.1.1095と同じ「嘘をつかない」原則: この経路のどこかで想定外の例外が起きても、
      //   内訳が全部ゼロなのに演出/音だけ消える事故を再発させない。
      _giftEffectDiagCounters.giftSoundError += 1;
    }
    publishGiftEffectDiag();
  };

  // v0.1.778: NDGR構造化ギフトevent(StoredGiftEvent: {userId,itemName,point,capturedAt})からの投げ。
  //   ギフトコメント本文(maybeThrowGiftFromSpeech)が来ない配信でも、これが確実な一次トリガ。
  //   onChanged は配列全体が来るので、既に投げた event を seen で除外して新着だけ投げる。
  /** @type {Set<string>} */
  const thrownGiftEventKeys = new Set();
  /** @param {Array<Record<string, any>>} events */
  const handleNewGiftEvents = (events) => {
    if (!open || !Array.isArray(events)) return;
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      const uid = String(ev.userId || '').trim();
      const item = String(ev.itemName || '').trim();
      const point = Number(ev.point) || 0;
      // v0.1.783: NDGR event 経路は item_id を持つ → 実画像で投げられる。
      const itemId = String(ev.itemId || '').trim();
      const key = `${uid}|${ev.capturedAt || ''}|${item}|${point}`;
      if (thrownGiftEventKeys.has(key)) continue;
      thrownGiftEventKeys.add(key);
      // seen 集合の暴走防止(直近のみ保持)。
      if (thrownGiftEventKeys.size > 400) {
        const arr = [...thrownGiftEventKeys];
        thrownGiftEventKeys.clear();
        for (const k of arr.slice(-200)) thrownGiftEventKeys.add(k);
      }
      const _detectAt = Date.now(); // v0.1.1088計器: 検知→音/着弾ギャップの起点。
      _giftEffectDiagCounters.giftDetected += 1;
      _giftEffectDiagCounters.lastEventAt = _detectAt;
      // v0.1.1090: 本物の個別イベントを検知した=帳簿に「説明済み」として計上する。
      _giftDeltaState = accountRealGiftEvent(_giftDeltaState, point, _detectAt);
      const proj = resolveGiftProjectile({ item, point, itemId }, 'gift');
      // 起点: 席キーは venueSpeakerKey/venueParticipantKey と同じ `u:${uid}` 形にする
      //   (raw uid だと seatByKey に当たらず常に crowdBubbleAnchor へ落ちる)。
      if (proj) {
        // v0.1.1156: 他2経路(maybeThrowGiftFromSpeech/handleGiftPointsAggregate)と同じく
        //   launchGiftThrow の戻り値(実際に投げたか)を見てからカウントする。従来は無条件加算で、
        //   同時投擲上限超過等の早期returnも「投げた」扱いになり giftThrown が実態より過大
        //   (=音の取りこぼしを過小報告)していた。
        if (launchGiftThrow(uid ? `u:${uid}` : '', proj, _detectAt)) {
          _giftEffectDiagCounters.giftThrown += 1;
          // v0.1.1061: 即時再生をやめ、着弾タイミングに1本だけ予約(バーストは置換昇格)。
          if (scheduleGiftSound(proj.tier, proj.durationMs, _detectAt) === 'coalesced') {
            _giftEffectDiagCounters.giftSoundCoalesced += 1;
          }
        }
      }
      publishGiftEffectDiag();
    }
  };

  /**
   * v0.1.1090: 「ギフト個別イベント欠落配信」のフォールバック検知。
   *   個別ギフトイベント(コメント本文/NDGR構造化event)が一切来ない配信でも、NDGR statistics
   *   由来の合計ギフトpt(officialGiftPointsAggregateStorageKey・content-entry.js が書く)だけは
   *   取れることがある(既知のニコ生仕様ムラ)。computeGiftDelta(帳簿方式・決定論)で
   *   「まだ説明されていないpt」を検知し、あれば1件を匿名ギフトとして通常の投擲+効果音経路に
   *   流す(handleNewGiftEvents と同じ launchGiftThrow/scheduleGiftSound を使う=演出/音の
   *   経路は増やさない)。送り主が特定できないため speakerKey は空(crowdBubbleAnchorへ
   *   フォールバック=既存の匿名ギフトと同じ扱い)。
   * v0.1.1095根治: 従来は launchGiftThrow の戻り値を見ずに giftThrown を無条件加算し、
   *   scheduleGiftSound 呼び出しも無条件で行っていた。handleNewGiftEvents/maybeThrowGiftFromSpeech
   *   (本物経路)は「launchGiftThrow が実際に投げた(true)時だけ giftThrown+scheduleGiftSound」の
   *   順序を守っており、デルタ経路だけこの順序が崩れていた(実質的には無条件呼びなのでこちら側が
   *   鳴りやすい方向の非対称ではあるが、本物経路と完全に同一の配線にして仕様上の差異を無くす)。
   *   さらに実配信2回で「検知1→演出1✅→音0(off/guarded/noPath/error/coalescedいずれも0)」が
   *   観測された=scheduleGiftSound 呼び出し経路のどこかで例外が静かに飲まれ、v0.1.1091の
   *   全数計上(嘘をつかない原則)が機能しない抜け道が残っていた疑いが濃い。1件ごとに
   *   try/catch で囲み、例外時も giftSoundError へ計上してループ・以降のイベント処理・
   *   publishGiftEffectDiag を継続させる(1件の異常が残りの合成イベントを道連れにしない)。
   * @param {number} aggregatePoints
   */
  const handleGiftPointsAggregate = (aggregatePoints) => {
    if (!open) return;
    const currentLiveId = liveIdFromPathname();
    if (!currentLiveId) return;
    const { events, nextState } = computeGiftDelta(_giftDeltaState, aggregatePoints, Date.now(), {
      liveId: currentLiveId
    });
    _giftDeltaState = nextState;
    if (events.length === 0) return;
    for (const ev of events) {
      const _detectAt = Date.now();
      _giftEffectDiagCounters.giftDetected += 1;
      _giftEffectDiagCounters.lastEventAt = _detectAt;
      _giftEffectDiagCounters.deltaSynthesized += 1;
      _giftEffectDiagCounters.deltaPoints += ev.points;
      try {
        // 汎用ラベル(既存の itemName 欠落フォールバックと同じ思想=「反応した」ことを優先)。
        //   匿名ギフト扱いなので送り主名は出さず、pt だけ明記する。🎁絵文字が種別を示すため
        //   「ギフト」接頭辞は付けない(clampLabelの14文字上限で大きいptが崩れて見えるのを避ける)。
        const proj = resolveGiftProjectile({ item: `+${ev.points.toLocaleString('ja-JP')}pt`, point: ev.points }, 'gift');
        if (proj) {
          // v0.1.1095: handleNewGiftEvents/maybeThrowGiftFromSpeech と同じく、launchGiftThrow が
          //   実際に投げた(true)時だけ giftThrown を加算し scheduleGiftSound を呼ぶ(本物経路と
          //   完全に同一の順序・条件に揃える=演出/音の経路差異を無くす)。
          if (launchGiftThrow('', proj, _detectAt)) {
            _giftEffectDiagCounters.giftThrown += 1;
            if (scheduleGiftSound(proj.tier, proj.durationMs, _detectAt) === 'coalesced') {
              _giftEffectDiagCounters.giftSoundCoalesced += 1;
            }
          }
        }
      } catch {
        // v0.1.1095根治: この経路(投擲+音予約)のどこかで想定外の例外が起きても、「内訳が
        //   全部ゼロなのに音だけ消える」を再発させない(v0.1.1091と同じ嘘をつかない原則)。
        _giftEffectDiagCounters.giftSoundError += 1;
      }
      publishGiftEffectDiag();
    }
  };

  /**
   * 1つの吹き出しを、対応する席の頭上(レイヤー基準)へ絶対配置する。
   * 既に表示中の吹き出しと縦に重なる場合は上方向へオフセットして読めるようにする。
   * v0.1.757: 席が無い発言者(fallbackAnchor あり)は席矩形でなくその決定座標へ置く。
   * @param {{ seatIndex:number, fallbackAnchor?:{x:number,y:number}|null, element:HTMLDivElement, removed:boolean, _x?:number, _y?:number, _h?:number }} bubble
   */
  const positionBubble = (bubble) => {
    if (!bubble || bubble.removed) return;
    /** @type {{x:number,y:number}} レイヤー基準の吹き出しアンカー(席下端中央 or 観客フォールバック)。 */
    let anchor;
    const node = bubble.seatIndex >= 0 ? seatNodes[bubble.seatIndex] : null;
    if (node) {
      // 保険(PR3): 段の再描画中など席ノードが一瞬 DOM から外れていると getBoundingClientRect が
      //   0 を返し、吹き出しが画面外へ飛んで消えて見える。未接続なら座標計算せず一時的に隠す。
      // person-tile-unify 第3コミット: 旧 node.icon は廃止。座標の基準は本物タイルのアバター要素
      //   (.nl-story-userlane-avatar)・無ければタイル全体にフォールバック(seatAnchorEl)。
      const anchorEl = seatAnchorEl(node);
      if (!node.seat.isConnected || !anchorEl || !anchorEl.isConnected) {
        bubble.element.style.visibility = 'hidden';
        return;
      }
      bubble.element.style.visibility = '';
      const layerRect = bubbleLayer.getBoundingClientRect();
      const seatRect = anchorEl.getBoundingClientRect();
      const rel = {
        left: seatRect.left - layerRect.left,
        top: seatRect.top - layerRect.top,
        width: seatRect.width,
        height: seatRect.height
      };
      anchor = bubbleAnchorForSeatRect(rel, BUBBLE_ANCHOR_GAP);
    } else if (bubble.fallbackAnchor) {
      // 席無し: 観客領域の決定座標へ(席矩形が無いので衝突回避だけ後段で効かせる)。
      bubble.element.style.visibility = '';
      anchor = bubble.fallbackAnchor;
    } else {
      return; // 席も座標も無い=描けない(従来どおり)
    }
    const h = bubble.element.offsetHeight || 40;
    const bw = bubble.element.offsetWidth || 160;
    // 既存の表示中吹き出し(自分以外)の占有帯を集めて衝突回避。
    const placed = [];
    for (const b of activeBubbles) {
      if (b === bubble || b.removed || !b._x) continue;
      placed.push({ x: b._x, y: b._y, h: b._h || 40 });
    }
    const y = resolveBubbleY({ x: anchor.x, y: anchor.y, h }, placed, {
      xThreshold: 130,
      vGap: 8,
      minY: 8
    });
    
    // 画面端で見切れないようにX座標をクランプする
    let targetLeft = anchor.x - bw / 2;
    const maxLeft = window.innerWidth - bw - 8;
    if (targetLeft < 8) targetLeft = 8;
    if (targetLeft > maxLeft) targetLeft = maxLeft;
    const tailOffset = anchor.x - targetLeft;

    bubble._x = anchor.x;
    bubble._y = y;
    bubble._h = h;
    bubble.element.style.setProperty('--nlsb-bubble-tail-x', `${tailOffset}px`);
    bubble.element.style.left = `${targetLeft}px`;
    bubble.element.style.top = `${y}px`;
  };

  /** 表示中の全吹き出しを席座標へ再追従(スクロール/リサイズ/段再描画後)。 */
  const repositionAllBubbles = () => {
    for (const b of [...activeBubbles]) positionBubble(b);
  };

  /**
   * 配信切替・再オープン時に過去ログを再生しないよう、純関数へ渡す基準を未シードへ戻す。
   * @param {string} [nextLiveId]
   */
  const resetSpeechTracking = (nextLiveId = '') => {
    speechGeneration += 1;
    speechLiveId = nextLiveId;
    speechState = { seenKeys: null, primed: false };
    speechStreaks.clear();
    // 前状態保持(lastGood)も破棄: 配信切替/閉じる時は前配信の参加者を持ち越さない(INV-3)。
    lastGoodRows = [];
    hasRenderedNonEmpty = false;
    liveRoster.clear(); // v0.1.754: 在席も持ち越さない(再オープンで storage から再 hydrate)
    clearBubbles();
  };

  /**
   * 2026-06-14 星野アイデア会議2「熱量の色温度」: 直近コメントの速さから会場照明の色温度を更新。
   *   過疎=涼しい青紫、怒涛=熱いオレンジ。映像中央は素通しのまま下端(客席)だけ色が変わる。
   *   stage に CSS 変数を注入するだけ(色/不透明度の補間と速度→熱量の正規化は純関数 venueHeat)。
   * @param {Array<{ capturedAt?: number|null }>} commentRows 直近コメント行(capturedAt 付き)
   */
  const applyVenueHeat = (commentRows) => {
    const level = resolveVenueHeatLevel(commentRows, { now: Date.now() });
    stage.style.setProperty('--nlsb-heat-color', heatLevelToWarmColor(level));
    stage.style.setProperty('--nlsb-heat-opacity', String(heatLevelToGlowOpacity(level)));
    // 任意: 盛り上がり具合を支援技術/ツールチップ向けに持たせる(視覚に依存しない情報)。
    stage.setAttribute('data-nls-heat', heatLevelToLabel(level));
    // 「生きている会場」: この盛り上がりで観客の揺れの速さ/大きさが決まる。
    crowdHeatLevel = level;
  };

  /** 単調増加の時刻(ms)。performance.now があれば使う。 */
  const nowMs = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  /**
   * 「生きている会場」アニメループ。観客 canvas を約18fpsで再描画し、観客を呼吸・同期させる。
   * reduced-motion / 観客0 / 閉じてる時は走らない(無駄な描画ゼロ)。
   */
  const crowdMotionTick = () => {
    crowdRaf = 0;
    if (!open || crowdReducedMotion || crowdAnimCount <= 0) return;
    const t = nowMs();
    // ~18fps(55ms)に間引き。重い canvas を毎フレーム描かない(大規模配信でも安全)。
    if (t - crowdLastDrawMs >= 55) {
      crowdLastDrawMs = t;
      drawCrowdOnCanvas(crowdCanvas, crowdAnimCount, crowdAnimSeed, {
        timeMs: t,
        heatLevel: crowdHeatLevel
      });
    }
    if (typeof requestAnimationFrame === 'function') {
      crowdRaf = requestAnimationFrame(crowdMotionTick);
    }
  };

  /**
   * 群衆canvasの寸法を戻す(v0.1.1239)。stopCrowdMotion が 0 に落としてバックストアを
   * 解放するため、描き始める前に必ず復元する。既に正しい寸法なら何もしない
   * (寸法代入は canvas をクリアする副作用があるため、無条件代入は避ける)。
   */
  const ensureCrowdCanvasSize = () => {
    try {
      if (crowdCanvas && crowdCanvas.width !== CROWD_CANVAS_W) {
        crowdCanvas.width = CROWD_CANVAS_W;
        crowdCanvas.height = CROWD_CANVAS_H;
      }
    } catch { /* canvas 不在環境でも会場は止めない */ }
  };

  const startCrowdMotion = () => {
    if (crowdReducedMotion || crowdRaf || !open || crowdAnimCount <= 0) return;
    if (typeof requestAnimationFrame !== 'function') return;
    ensureCrowdCanvasSize();
    crowdLastDrawMs = 0;
    crowdRaf = requestAnimationFrame(crowdMotionTick);
  };

  const stopCrowdMotion = () => {
    if (crowdRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(crowdRaf);
    crowdRaf = 0;
    // ★v0.1.1239: 群衆canvasのバックストア(1200x350x4B = 1.68MB)を解放する。
    //   従来は rAF を止めるだけでピクセルバッファが残り続けていた。
    //   width=0 でバックストアが破棄される(次に描くとき setupCrowd 側が寸法を戻す)。
    try {
      if (crowdCanvas && crowdCanvas.width > 0) {
        crowdCanvas.width = 0;
        crowdCanvas.height = 0;
        // ★寸法を戻すと canvas はクリアされる。再描画スキップのキャッシュを無効化しないと
        //   「同じ人数だから描かない」判定に当たって群衆が空のままになる(必須)。
        lastCrowdCount = -1;
        lastCrowdSeed = Number.NaN;
      }
    } catch { /* canvas 不在環境でも会場は止めない */ }
  };

  /** v0.1.1118 鏡enrichマップのキャッシュ(鏡 capturedAt が変わったときだけ作り直す=毎commitのO(鏡)回避)。 */
  let _mirrorAvatarMapCacheAt = -1;
  /** @type {Map<string, string>} */
  let _mirrorAvatarMapCache = new Map();
  const currentMirrorAvatarMap = () => {
    const snap = laneMirrorPaintSnap || laneMirrorSnap;
    const cap = Math.max(0, Number(/** @type {any} */ (snap)?.capturedAt) || 0);
    if (cap !== _mirrorAvatarMapCacheAt) {
      _mirrorAvatarMapCacheAt = cap;
      _mirrorAvatarMapCache = buildVenueMirrorAvatarMap(/** @type {any} */ (snap));
    }
    return _mirrorAvatarMapCache;
  };

  const renderStoryDiagMirrorPanel = () => {
    const result = renderVenueStoryDiagMirrorPanel(storyDiagHost, storyDiagMirrorSnap, {
      liveId: String(activeLiveId || liveIdFromPathname() || ''),
      nowMs: Date.now(),
      lastSig: storyDiagMirrorRenderSig,
      panelSummary: panelSummarySnap
    });
    storyDiagMirrorRenderSig = result.sig;
  };

  /**
   * 表示行を「新鮮優先・空なら前回保持」で確定してから席を描く(空っぽ・消える根治の入口)。
   * 集計/poll はここを通すことで、一瞬0件や storage 失敗でも会場が空で再描画されない。
   * @param {VenueRow[]} incoming 今回の集計/マージ結果(空になりうる)
   */
  const commitDisplay = (incoming) => {
    // v0.1.1110 白円根治: どの供給経路(storage集計/在席roster/発言マージ)でも描画直前に必ず
    //   プロファイルキャッシュ補強を通す(補強済み行は素通り=冪等)。経路ごとの enrich 配線忘れを
    //   関所1箇所で構造的に不可能にする(v0.1.754 で在席経路が補強を素通りした退行の再発防止)。
    // v0.1.1118 鏡enrich(P4): その後段で「①が解決済みの顔URL(鏡displaySrc・score2のみ)」を注入。
    //   トップバー/fallback でも①とバイト一致の顔になる(score比較で強い方のみ=冪等)。
    const resolved = resolveDisplayRows(
      enrichVenueRowsWithMirrorAvatars(
        enrichVenueRowsWithProfileAvatars(incoming, profileAvatarMap),
        currentMirrorAvatarMap()
      ),
      lastGoodRows
    );
    lastGoodRows = resolved.nextLastGood;
    renderSeats(resolved.rows);
    // v0.1.1230: ピックアップ枠を更新。①POPと【同一の純関数】で選ぶので、
    //   7秒バケットが同じなら同じ1件になる(画面ごとに違うものが出ない)。
    //   diff-skip 済み=同じ内容なら DOM を書き換えない。
    try {
      const picked = pickTickerHighlightEntry(resolved.rows, Date.now());
      applyVenuePickupView(pickupEls, buildVenuePickupView(picked));
    } catch { /* 枠の更新失敗は席の描画を止めない */ }
  };

  /**
   * 表示行をクリアして会場を空に戻す(配信切替など意図的な空表示専用)。
   * 通常の集計/poll は commitDisplay を使うこと(空再描画しない)。
   */
  const clearDisplay = () => {
    lastGoodRows = [];
    hasRenderedNonEmpty = false;
    // 配信切替は意図的クリア=トップNバーも畳んで前配信の応援者を持ち越さない。
    _topBarShownOnce = false;
    _lastTopBarSig = '';
    topBar.hidden = true;
    topBarList.replaceChildren();
    renderSeats([]);
  };

  let residentsRendered = false;
  /**
   * 3キャラ常駐(りんく・こん太・たぬ姉)を最前列中央に描く。会場を開いた瞬間に集計を待たず
   * 1回呼ぶ=開いた直後から必ず誰かが居る。画像は拡張URLに解決。読み込み失敗は名札のみへ。
   */
  /*
   * 3キャラ常駐(りんく・こん太・たぬ姉)を配信画面の左右の縁に出す演出。
   * v0.1.1214 廃止(フラグOFF・ユーザー要望 2026-08-01): 映像に重なって
   *   「見づらくなる」ため。左上りんく・左下たぬ姉・右こん太の3体と、
   *   名前ラベル・金色のグロー枠がまとめて出なくなる。
   *   額縁フレーム(VENUE_CHAR_FRAME_ENABLED・v0.1.1114廃止)と同じ流儀=復活はこのフラグ1つ。
   */
  const VENUE_RESIDENTS_ENABLED = false;
  const renderResidents = () => {
    if (!VENUE_RESIDENTS_ENABLED) return; // 廃止中: residentsLayer は空のまま
    if (residentsRendered) return;
    const resolveUrl =
      typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function'
        ? /** @param {string} rel */ (rel) => chrome.runtime.getURL(rel)
        : /** @param {string} rel */ (rel) => rel;
    const residents = buildVenueResidents(resolveUrl);
    residentsLayer.textContent = '';
    for (const r of residents) {
      const cell = document.createElement('div');
      cell.className = `nlsb-resident nlsb-resident-${r.id}`;
      const img = document.createElement('img');
      img.className = 'nlsb-resident-img';
      img.src = r.imgSrc;
      img.alt = `${r.name}(会場の案内役)`;
      img.addEventListener('error', () => { img.style.display = 'none'; });
      const label = document.createElement('div');
      label.className = 'nlsb-resident-name';
      label.textContent = r.name;
      cell.append(img, label);
      residentsLayer.appendChild(cell);
    }
    residentsRendered = true;
  };

  // v0.1.777 額縁フレーム: 3キャラ全表情サムネを四辺に並べ会場を囲む(1回だけ描画・軽量 thumb128)。
  // v0.1.1114 廃止(フラグOFF): 四辺のキャラ顔散らばりが「会場に顔が多く見える」誤認の一因
  //   (実DOM census の容疑者④)としてユーザー要望で非表示化。計器(額縁N)→廃止の順=v0.1.1113 の
  //   census トークンで廃止効果(額縁12→0)を同じ物差しで検証できる。復活はこのフラグ1つ。
  const VENUE_CHAR_FRAME_ENABLED = false;
  let charFrameRendered = false;
  const renderCharFrame = () => {
    if (!VENUE_CHAR_FRAME_ENABLED) return; // 廃止中: charFrameLayer は空のまま=census の額縁0
    if (charFrameRendered) return;
    const resolveUrl =
      typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function'
        ? /** @param {string} rel */ (rel) => chrome.runtime.getURL(rel)
        : /** @param {string} rel */ (rel) => rel;
    const tiles = buildVenueCharacterFrame(resolveUrl);
    charFrameLayer.textContent = '';
    for (const t of tiles) {
      const img = document.createElement('img');
      img.className = 'nlsb-charframe-tile';
      img.src = t.src;
      img.alt = '';
      img.dataset.edge = t.edge;
      // 辺に沿った位置(pos 0..1)を %。top/bottom は left%、left/right は top%。
      if (t.edge === 'top' || t.edge === 'bottom') img.style.left = `${(t.pos * 100).toFixed(2)}%`;
      else img.style.top = `${(t.pos * 100).toFixed(2)}%`;
      img.addEventListener('error', () => { img.style.display = 'none'; });
      charFrameLayer.appendChild(img);
    }
    charFrameRendered = true;
  };

  // 2026-07-01 会議(venue-role-separation フェーズ2): 応援者トップNバーの描画。
  //   sig(上位の userId+順位)が無変化なら DOM を触らない=毎フレーム作り直さない(hot path 保護)。
  //   一度でも非空を描いたら、一瞬の空(データ遅延)では畳まない=高さ振動を作らない(v0.1.1026)。
  //   状態フラグは clearDisplay(先に定義)からも触るため、宣言は関数より前(下の hasRenderedNonEmpty 付近)。
  /** @param {Array<{ rank:number, participant:{ key?:string, userId?:string, name?:string, count?:number, hasGift?:boolean, giftCount?:number, lastAt?:number, lastText?:string, recentTexts?:string[] } }>} topSupporters */
  const renderTopBar = (topSupporters) => {
    const list = Array.isArray(topSupporters) ? topSupporters : [];
    // 空入力でも、一度出したバーは畳まない(前回の顔を残す=明滅/高さ振動を防ぐ)。
    if (list.length === 0) {
      if (!_topBarShownOnce) topBar.hidden = true;
      return;
    }
    // sig=上位の key と順位の並び(capturedAt など時刻は入れない=v0.1.1022 明滅の教訓)。
    const sig = list.map((x) => `${x.rank}:${x.participant?.key || ''}`).join('|');
    if (sig === _lastTopBarSig && _topBarShownOnce) return;
    _lastTopBarSig = sig;
    const frag = document.createDocumentFragment();
    for (const item of list) {
      const cell = document.createElement('div');
      cell.className = 'nlsb-topbar-cell';
      if (item.rank >= 1 && item.rank <= 3) cell.dataset.venueRank = String(item.rank);
      cell.appendChild(buildVenuePersonTile(item.participant, '応援者'));
      // 2026-07-30(wayfinder→to-spec方式・venue-avatar-hover-preview-SPEC.md §4.3): ホバー
      //   プレビューカード用データをWeakMapへ相乗り登録。sig-skipで一度も再構築されない間は
      //   この登録も走らない(既存cellは残るためカードのデータも古いまま=許容。SPEC.md §7末尾)。
      const p = item.participant || {};
      _hoverCardDataByEl.set(cell, {
        uid: String(p.userId || '').trim(),
        displayName: String(p.name || '').trim() || String(item?.participant?.key || ''),
        count: Number(p.count) || 0,
        hasGift: p.hasGift === true,
        giftCount: Number(p.giftCount) || 0,
        venueRank: Math.max(0, Math.floor(Number(item.rank) || 0)),
        // 2026-07-30(MVP-2・venue-hover-card-content-DESIGN.md): 最終発言時刻(既存データ・
        //   新規取得ゼロ)。ホバーカードで相対時刻(「3分前」等)に変換して表示する。
        lastAt: Number(p.lastAt) || 0,
        // 2026-07-31(ユーザー要望): 直前の発言内容(既存データ・新規取得ゼロ)。
        lastText: String(p.lastText || ''),
        recentTexts: Array.isArray(p.recentTexts) ? p.recentTexts : []
      });
      frag.appendChild(cell);
    }
    topBarList.replaceChildren(frag);
    topBar.hidden = false;
    _topBarShownOnce = true;
  };

  /** @param {VenueRow[]} rows */
  const renderSeats = (rows) => {
    // 保険ガード: 一度でも非空を描いた後に空入力が来たら無視する(空っぽ・消えるの二重防御)。
    //   意図的クリア(配信切替)は clearDisplay 経由で hasRenderedNonEmpty=false にしてから通す。
    const incomingRows = Array.isArray(rows) ? rows : [];
    if (incomingRows.length === 0 && hasRenderedNonEmpty) {
      return;
    }
    const seating = buildVenueSeating(incomingRows, {
      maxSeats: VENUE_FULLSCREEN_MAX_SEATS,
      prevSeatByKey: seatByKey,
      isGenericName: isGenericComeviewName,
      promoteUserIds: spokenUserIds,
      // 光らせ演出(金色オーラ)はユーザー要望で無効。上位貢献者は順位バッジ(venueRank)で示す。
      vipRegular: false,
      // 2026-07-30(venue-ranking-churn-SPEC.md §4.3): 応援者ランキングのヒステリシス安定化。
      prevSupporterOrderKeys: supporterOrderKeys
    });
    if (seating.participantCount > 0) hasRenderedNonEmpty = true;
    seatByKey = seating.seatByKey;
    // 2026-07-30: 次回commitへ安定化済み順序を持ち回す(消す側の計器も同時に更新)。
    supporterOrderKeys = seating.supporterRank.orderKeys;
    _supporterRankDrops += seating.supporterRank.droppedKeys.length;
    _supporterRankOvertakes += seating.supporterRank.overtakeCount;
    if (topBar.dataset.rankDrops !== String(_supporterRankDrops)) {
      topBar.dataset.rankDrops = String(_supporterRankDrops);
    }
    if (topBar.dataset.rankOvertakes !== String(_supporterRankOvertakes)) {
      topBar.dataset.rankOvertakes = String(_supporterRankOvertakes);
    }
    // 応援者トップNバー(ひな壇上部)。席と同じ seating 結果から描く=二重集計しない(drift なし)。
    renderTopBar(seating.topSupporters);
    seatsHost.classList.remove(...VENUE_LAYOUT_CLASSES);
    seatsHost.classList.add(`nlsb-mode-${seating.layoutMode}`);
    // ★2026-08-11: 人数連動を撤回し 48vh 固定を注入する(関数側で固定)。
    //   旧: 少人数は低く映像を広く、満員は高く客席を奥まで(人数↑→会場↑)。
    //   撤回理由: 2,769人の実機で 72vh となり配信映像が実質ゼロ=ユーザー不満の直接原因。
    //   満席感は面積でなく「全員の顔(overflow-y)+入場演出」で表現する方針に変更。
    //   経緯の正本は src/lib/venueViewport.js の resolveVenueMaxHeightVh JSDoc。
    //   ここは呼び出し署名を変えずに残す(参加者数は将来の密度表現で使う余地がある)。
    const seatingHostEl = seatsHost.parentElement;
    if (seatingHostEl) {
      seatingHostEl.style.setProperty(
        '--nlsb-venue-max-h',
        `${resolveVenueMaxHeightVh(seating.participantCount)}vh`
      );
    }
    // 会議確定B(横スクロール根絶+映像セーフエリア): 論理席は維持しつつ、同時表示は
    //   行に収まる数に絞る。縮小でなく表示人数を減らす(名前/ID/サムネを潰さない)。
    //   直近発言者は selectStableVisibleMembers で必ず表示に含め、席順は安定(ちらつかない)。
    const seatAreaWidth = seatsHost.clientWidth || window.innerWidth || 1280;
    // v0.1.737 実機修正: 実効幅は席幅+gap。68/84 だと gap ぶん足りず1席多く詰めて横溢れ
    //   (893>882で見切れ)。gap+余白を見込んだ実効幅にして 1 行に確実に収める。
    const seatMinWidth =
      seating.layoutMode === 'vip' ? 158 : seating.layoutMode === 'normal' ? 92 : 76;
    const perRow = seatsPerRow(seatAreaWidth - 28, seatMinWidth);
    // 2026-06-22 会場「全員500人」(council/venue-all-faces-500): 旧実装は rows:8 + 動的cap(max150)で
    //   同時表示を ~150 に頭打ちさせ、超過は点描逃げ=「482人なのに96人しか顔が出ない」の核だった。
    //   全員を顔付きにするため、必要な段数(全員÷perRow)を maxRows として確保し、hardCap を席プール上限
    //   (VENUE_FULLSCREEN_MAX_SEATS=500)まで開ける。8段超ぶんは seatsHost の overflow-y で縦スクロール。
    //   ★resolveDynamicArenaCap は潰さず、ここで hardCap を明示する(他の呼び出し元/テストは不変)。
    const neededRows = Math.max(1, Math.ceil(seating.seats.length / Math.max(1, perRow)));
    const venueMaxRows = Math.min(
      neededRows,
      Math.ceil(VENUE_FULLSCREEN_MAX_SEATS / Math.max(1, perRow))
    );
    const visibleSeatCount = resolveVisibleArenaCount({
      totalCount: seating.seats.length,
      perRow,
      rows: venueMaxRows,
      hardCap: VENUE_FULLSCREEN_MAX_SEATS
    });
    const visibleSeatsRaw = selectStableVisibleMembers(
      seating.seats,
      visibleSeatCount,
      spokenUserIds,
      (entry) => String(entry?.participant?.userId || entry?.participant?.key || '').trim()
    );
    // v0.1.745 ユーザー実機「サムネ持ちが最前列に来てない・大きくなってない」根治:
    //   visibleSeats は seatIndex 順で、後段の tier 充填もこの順。前列予約(frontRow)だけでは
    //   サムネ持ちが少数+席churn のとき手前段に集まりきらず、奥段に散らばっていた(実機計測で
    //   VIPが tier0/3/4 に散在)。ここで「実サムネ持ちを先頭へ」安定パーティションし、tier 充填が
    //   必ず手前段(tier0=大きい段)からサムネ持ちで埋まるようにする。group 内は元順維持=ちらつかない。
    /** @param {any} entry 席エントリ(visibleSeatsRaw の要素)。any で T 推論を妨げない。 */
    const seatHasRealThumb = (entry) => {
      const p = entry?.participant || {};
      const avatarUrl = String(p.avatar || '').trim();
      const derived = deriveNicoUserIconUrl(String(p.userId || '').trim());
      return hasRealThumbnail(avatarUrl) || hasRealThumbnail(derived);
    };
    const visibleSeats = partitionThumbnailFirst(visibleSeatsRaw, seatHasRealThumb);
    const visibleSeatKeys = new Set(visibleSeats.map(entry => entry.participant.key));

    // 【2026-06-17 確定】アリーナ席=アクティブユーザー(コメント/ギフト/広告した人・匿名/非匿名問わず)。
    //   userId があれば匿名でも venueParticipantKey が席キーを返す(席資格の正本は venueSeats.js)。
    //   ここで数える「ほか N人」= 1画面に表示した席(visibleSeatKeys)に入りきらなかったアクティブ分。
    //   来場者数(PV)とは別物(来場者は背景群衆 Canvas)。promoteUserIds は表示優先のヒントで席資格ではない。
    const { totalAnonymous } = collectAudienceFaceUserIds(rows, {
      isGenericName: isGenericComeviewName,
      promoteUserIds: spokenUserIds,
      excludeKeys: visibleSeatKeys
    });
    // 診断シート(メンバー一覧ボタン)用に最新の席割りを保持。誰が顔付き席/点描かを data 化する。
    lastRosterInput = {
      allSeats: seating.seats,
      visibleSeats,
      audienceCount: totalAnonymous
    };
    // person-tile-unify 第4コミット(2026-06-17): 旧「ほか観客 N人」は来場者数(PV)や「匿名の観客」と
    //   二重に取り違えられ紛らわしかった。totalAnonymous の実態は「席(visibleSeats)に表示しきれなかった
    //   アクティブ参加者」(席に座った人を excludeKeys で除外済み・匿名とは限らず数値IDも含む)。
    //   誤読の核だった「観客」語を外し「ほか N人」に正本化(全員『会場参加者』前提で残りを表す)。
    //   来場者数(PV)の実値取得→二層表示は別途(PV 取得経路の新規配線が要るため範囲外・過剰実装回避)。
    // ★v0.1.1280: 鏡の鮮度を後段で併記するため、人数だけの基準文を控えておく
    //   (併記は鏡の判定が確定した後=段割当の直前で行う)。
    _venueTitleBaseText =
      totalAnonymous > 0
        ? `会場参加者 ${seating.participantCount}人 ・ ほか ${totalAnonymous}人`
        : `会場参加者 ${seating.participantCount}人`;
    title.textContent = _venueTitleBaseText;
    // PR-C1: 人数ラスタライザ Canvas (Antigravity Enhanced)
    if (totalAnonymous > 0) {
      crowdCanvas.classList.add('nlsb-is-visible');
      // liveId をシードとして安定描画
      const seed = Array.from(activeLiveId).reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0);
      crowdAnimCount = totalAnonymous;
      crowdAnimSeed = seed;
      // 退避強化: 同じ人数+同じ seed なら静止描画は同一(純粋)→再描画を省く。ただし動きを付ける
      //   場合はアニメループ側が毎フレーム描くので、ここでは「初回/人数変化時の即時1枚」を担う。
      if (totalAnonymous !== lastCrowdCount || seed !== lastCrowdSeed) {
        // ★v0.1.1239: この経路は startCrowdMotion を通らずに直接描くため、
        //   閉じたとき 0 に落とした寸法をここでも戻す(復元漏れ=群衆が出ない)。
        ensureCrowdCanvasSize();
        drawCrowdOnCanvas(crowdCanvas, totalAnonymous, seed, crowdReducedMotion ? null : { timeMs: nowMs(), heatLevel: crowdHeatLevel });
        lastCrowdCount = totalAnonymous;
        lastCrowdSeed = seed;
      }
      startCrowdMotion();
    } else {
      crowdCanvas.classList.remove('nlsb-is-visible');
      lastCrowdCount = -1;
      crowdAnimCount = 0;
      stopCrowdMotion();
    }

    const visibleSeatIndexSet = new Set(visibleSeats.map((entry) => entry.seatIndex));
    const entryBySeatIndex = new Map(visibleSeats.map((entry) => [entry.seatIndex, entry]));
    for (let i = 0; i < seatNodes.length; i += 1) {
      const node = seatNodes[i];
      node.seat.classList.add('nlsb-is-empty');
      node.seat.classList.remove(
        'nlsb-seat-link',
        'nlsb-seat-vip',
        'nlsb-seat-regular'
      );
      node.seat.setAttribute('aria-hidden', 'true');
      node.seat.removeAttribute('title');
      delete node.seat.dataset.tierIndex;
      // 2026-07-24: venueRankはここでdeleteしない(装飾ループのWeakMap diff-skipに一本化)。
      //   1コメントごとに全参加者のスコアが僅かに動き上位3位が頻繁に入れ替わる構造(venueSeats.js
      //   resolveVenueRegularScore)に対し、順位不変でも毎paintでdelete→再代入していたのがバッジの
      //   明滅(ちらつき)の真因。renderSeats全体のsig-skipはv0.1.1032で撤回済みの地雷なので、
      //   ここではRANKバッジのdataset属性1つだけを対象にした局所diff-skipで対処する。
      delete node.seat.dataset.streak;
      if (!visibleSeatIndexSet.has(i)) {
        if (node.seat.parentElement) node.seat.parentElement.removeChild(node.seat);
        node.seat.replaceChildren();
        node.tile = null;
      }
    }

    // v0.1.1111 会場=①レーン鏡映: 段割当の正本を選ぶ。鏡を使った供給(laneMirrorPaintSnap)なら
    //   P層=鏡の5段そのまま(集合も順序も①と同一・広告/ギフト段も鏡から出る=未配線の欠落が直る)。
    //   鏡なしなら従来どおり(fallback)。v0.1.1138(2026-07-14 会場独自受け皿の撤去): 会場独自の
    //   受け皿は持たない=①のcap外・匿名は会場のどこにも表示しない(①に載った瞬間、次の鏡で現れる)。
    const fallbackLaneBuckets = bucketVenueLaneSeats(visibleSeats, {
      maxTotal: visibleSeats.length,
      // v0.1.1117 白円根治(P3): ①と同じ資産で displaySrc を導出(委譲先は venueLaneBuckets)。
      pickCtx: venueLanePickCtx
    });
    // v0.1.1138(「消す側」の計器): fallback時に段から除外された匿名の人数を黙らない。
    _anonExcludedCount = Math.max(
      0,
      visibleSeats.length - flattenVenueLaneBuckets(fallbackLaneBuckets).length
    );
    const lanePaintSnap = laneMirrorPaintSnap;
    const laneComposed = lanePaintSnap
      ? composeVenueLaneBuckets({
          mirrorBuckets: restoreLaneMirrorBuckets(lanePaintSnap),
          seatIndexByUid: venueSeatIndexByUid(visibleSeats)
        })
      : null;
    const laneBuckets = laneComposed ? laneComposed.buckets : fallbackLaneBuckets;
    const visibleLaneItems = flattenVenueLaneBuckets(laneBuckets);
    // v0.1.1207: 会場が実際に描いた瞬間と、そのとき人が居たかを刻む。
    //   「出ない」報告が仕様(匿名主体で0人)か不具合かを、体感でなく数字で分けるため。
    try { noteVenueFirstPaint(_openLatency, Date.now(), visibleLaneItems.length); } catch { /* no-op */ }
    // 2026-07-31(ユーザー指摘): ホバーカードのラベルを段に合わせて出し分けるための uid→段 索引。
    //   広告段/ギフト段に載る条件は「投げたこと」であって発言ではないため、「発言N」は嘘になる。
    //   flattenVenueLaneBuckets は段を捨てて平坦化するので、平坦化する前のここで拾っておく。
    //   ★描画ループ(visibleLaneItems)には一切触らない=既存の diff-skip/churn 対策に無干渉。
    /** @type {Map<string, string>} */
    const laneTierByUid = new Map();
    for (const tierName of ['link', 'gift', 'ad', 'konta', 'tanu']) {
      const arr = Array.isArray(/** @type {any} */ (laneBuckets)?.[tierName])
        ? /** @type {any} */ (laneBuckets)[tierName]
        : [];
      for (const it of arr) {
        const u = String(it?.entry?.userId || '').trim();
        // 同一 uid が複数段に居る場合は先勝ち(link→gift→ad の順=発言段を優先)。
        if (u && !laneTierByUid.has(u)) laneTierByUid.set(u, tierName);
      }
    }
    const isLaneMirrorPaintMode = Boolean(lanePaintSnap);
    /*
     * ★v0.1.1280: 鏡がどれくらい古いかを見出しに併記する(既存の title 要素に足すだけ・新規DOMなし)。
     *
     *   会場と①がずれる最大の原因は【鏡の陳腐化】だった。鏡は①が描画したときにしか
     *   更新されないので、①を閉じたまま会場を見ると古いまま止まる(実測 656秒)。
     *   SOFT〜HARD の帯域は「ちらつき防止のため意図的に古い鏡を使い続ける」設計なので、
     *   降格はさせず【事実だけ伝える】。ユーザーが初めて「なぜずれるか」を画面で知れる。
     *   ★値が変わったときだけ書く(paint 毎の DOM 書き込みを増やさない)。
     */
    try {
      const nowForAge = Date.now();
      const ageSec = lanePaintSnap && Number(lanePaintSnap.capturedAt) > 0
        ? Math.round((nowForAge - Number(lanePaintSnap.capturedAt)) / 1000)
        : -1;
      const notice = venueMirrorAgeNotice(
        isLaneMirrorPaintMode ? 'mirror' : 'fallback',
        ageSec
      );
      const nextTitle = notice ? `${_venueTitleBaseText} ・ ${notice}` : _venueTitleBaseText;
      if (_venueTitleLastText !== nextTitle) {
        _venueTitleLastText = nextTitle;
        title.textContent = nextTitle;
      }
    } catch { /* 表示の失敗は描画を止めない */ }
    emptyMessage.hidden = visibleLaneItems.length > 0;
    if (visibleLaneItems.length === 0) {
      resetStoryUserLaneDom(venueLaneEls);
    } else {
      paintStoryUserLaneDomFilled(
        venueLaneEls,
        venueStoryFaces,
        laneBuckets,
        visibleLaneItems.length,
        venuePersonTileIo,
        {
          recordedCommentRowsTotal: isLaneMirrorPaintMode
            ? lanePaintSnap.pickedLength
            : seating.participantCount,
          totalCandidates: isLaneMirrorPaintMode
            ? lanePaintSnap.totalCandidates
            : seating.participantCount,
          // v0.1.1133: fallback でも同じ共有rendererの案内文言を出す。fallback は件数だけ
          //   seating.participantCount に差し替え、a:匿名ルール等の説明文は①POPと同じ正本に揃える。
          guides: VENUE_LANE_GUIDES_EXACT_COPY,
          /*
           * ★v0.1.1280: fallback 経路のときだけ gift 段の空文言を差し替える。
           *   fallback は席から段を組むため【構造上 gift 段を作れない】(①の gift/ad は
           *   tier 判定を通さない後付けで、席からは導出できない)。
           *   それを「いまの記録では該当者がいません」と断定するのは嘘なので、
           *   「①パネルが必要」であることを正直に言う。
           *   ★mirror 経路(鏡がある)ときは渡さない=鏡が空だと知っている=従来の断定でよい。
           */
          emptyTextOverrides: isLaneMirrorPaintMode
            ? undefined
            : { gift: VENUE_FALLBACK_GIFT_EMPTY_HTML },
          wrapTileEl: (tileEl, item) => {
            const laneItem = /** @type {{ _venueSeatIndex?: unknown }} */ (item || {});
            // v0.1.1111: 席を持たないアイテム(鏡由来の uid 無し広告主セル等)は _venueSeatIndex=-1
            //   =素通しで lane に直接出す(誤って席0を乗っ取らない)。既存bucket出力は常に有効index。
            const seatIndexRaw = Number(laneItem._venueSeatIndex);
            if (!Number.isInteger(seatIndexRaw) || seatIndexRaw < 0) return tileEl;
            const node = seatNodes[seatIndexRaw];
            if (!node) return tileEl;
            node.seat.replaceChildren(tileEl);
            node.tile = tileEl;
            return node.seat;
          }
        }
      );
    }

    // 2026-07-31(ユーザー指摘): 広告段の #1/#5 等にホバーしても何も出ない件の解消。
    //   ホバーカードのデータ登録は「席装飾ループ」(下)に相乗りしていたが、そのループは
    //   v0.1.1111 の契約で席なしアイテム(_venueSeatIndex:-1)を continue で飛ばす。
    //   広告ランキング由来のセルは uid を持たない=席が割り当たらないため、カードのデータが
    //   一度も登録されず「ホバーしても無反応」になっていた(リンクが無いのも同じ理由)。
    //
    // ★v0.1.1204 訂正: 当初は paint ごとに5段の全タイルを querySelectorAll で走査していたが、
    //   これは「paint のたびの DOM 走査は hot path 汚染」という既存規律の違反で、実機で
    //   拡張全体が重くなった(2026-07-31 ユーザー報告)。段の item 列だけを控えておき、
    //   実際にホバーされた瞬間に索引で引く方式へ変更する=paint 時のDOM走査ゼロ。
    _laneItemsByTier = {
      link: Array.isArray(/** @type {any} */ (laneBuckets)?.link) ? /** @type {any} */ (laneBuckets).link : [],
      gift: Array.isArray(/** @type {any} */ (laneBuckets)?.gift) ? /** @type {any} */ (laneBuckets).gift : [],
      ad: Array.isArray(/** @type {any} */ (laneBuckets)?.ad) ? /** @type {any} */ (laneBuckets).ad : [],
      konta: Array.isArray(/** @type {any} */ (laneBuckets)?.konta) ? /** @type {any} */ (laneBuckets).konta : [],
      tanu: Array.isArray(/** @type {any} */ (laneBuckets)?.tanu) ? /** @type {any} */ (laneBuckets).tanu : []
    };

    // L17: 席装飾(リンク化・VIP・順位バッジ・ストリーク)は段の描画列に適用する。
    // 席リンク一致計器: 毎paint観測(diagDueの3秒期日に入れない=過渡的不一致も累積に残す)。
    //   publishは既存publishVenueSeatsDiagの3秒min-gapサイクルに相乗り(新規タイマー/read/writeなし)。
    beginVenueSeatLinkPaint(_seatLinkParity);
    const seatLinkWallNow = Date.now();
    // ★venue-exact-parity-SPEC §5-3: 席なし(=uid で席に結びつかなかった)件数を既存ループの
    //   分岐で数える(新規ループを作らない=§7 の予算表)。「段img 19 − 席16 = 3」を
    //   説明済みの差分にするための数値であり、異常ではない(席は装飾・段が正本)。
    let unseatedThisPaint = 0;
    for (const item of visibleLaneItems) {
      // v0.1.1111: 席なしアイテム(-1)は席装飾の対象外(wrapTileEl と同じ規則で席0を誤装飾しない)。
      const seatIndexRaw = Number(item?._venueSeatIndex);
      if (!Number.isInteger(seatIndexRaw) || seatIndexRaw < 0) { unseatedThisPaint += 1; continue; }
      const seatIndex = seatIndexRaw;
      const node = seatNodes[seatIndex];
      const entry = entryBySeatIndex.get(seatIndex);
      if (!node || !entry) continue;
      const participant = entry.participant || {};
      const uid = String(participant.userId || '').trim();
      const rawName = String(participant.name || '').trim();
      // 観測のみ(データ不変・失敗は握る=描画を止めない)。item は既に構築済み=新規計算ゼロ。
      try {
        observeVenueYukkuriNamedTile(_yukkuriNamedCensus, { uid, rawName, displaySrc: item?.displaySrc });
      } catch {
        /* 計器失敗は描画を止めない */
      }
      const displayName =
        String(item?.title || '').trim() ||
        rawName ||
        (uid ? anonymousDisplayLabel(uid) : anonymousDisplayLabel(participant.key || `会場${seatIndex + 1}`));
      const tile = node.seat.querySelector('.nl-story-userlane-cell');
      if (tile instanceof HTMLElement) node.tile = tile;
      const seatLinkOn = isNumericNicoUserId(uid) && nicoUserPageUrl(uid) !== '';
      node.seat.classList.toggle('nlsb-seat-link', seatLinkOn);
      // 観測のみ(DOM/データ不変・失敗は握る=描画を止めない)。tileは直前で取得済み=新規クエリ0。
      try {
        observeVenueSeatLink(_seatLinkParity, {
          seatIndex,
          mirrorUid: String(item?.entry?.userId || '').trim(),
          rosterUid: uid,
          seatLinkOn,
          tileTag: tile instanceof HTMLElement ? tile.tagName : '',
          tileHref: tile instanceof HTMLAnchorElement ? tile.getAttribute('href') || '' : '',
          mode: isLaneMirrorPaintMode ? 'mirror' : 'fallback',
          wallNow: seatLinkWallNow
        });
      } catch {
        /* 計器失敗は描画を止めない */
      }
      node.seat.title = displayName;
      node.seat.classList.remove('nlsb-is-empty');
      node.seat.setAttribute('aria-hidden', 'false');
      node.seat.classList.toggle('nlsb-seat-vip', item?._venueIsVip === true);
      node.seat.classList.remove('nlsb-seat-regular');
      const venueRank = Math.max(0, Math.floor(Number(entry.venueRank || item?._venueRank) || 0));
      // 2026-07-24(局所diff-skip): この席(node.seat)へ最後に書き込んだ順位と同じなら何もしない。
      //   順位が実際に変わったときだけdataset書き込み(delete/再代入)を行い、無変化でのバッジ明滅を防ぐ。
      if (_lastVenueRankByNode.get(node.seat) !== venueRank) {
        if (venueRank >= 1 && venueRank <= 3) {
          node.seat.dataset.venueRank = String(venueRank);
        } else {
          delete node.seat.dataset.venueRank;
        }
        _lastVenueRankByNode.set(node.seat, venueRank);
      }
      // 2026-07-30(wayfinder→to-spec方式・venue-avatar-hover-preview-SPEC.md §4.3): ホバー
      //   プレビューカード用データをWeakMapへ相乗り登録(DOM書き込みなし・diff-skip不要)。
      _hoverCardDataByEl.set(node.seat, {
        uid,
        displayName,
        count: Number(participant.count) || 0,
        hasGift: participant.hasGift === true,
        giftCount: Number(participant.giftCount) || 0,
        venueRank,
        // 2026-07-30(MVP-2・venue-hover-card-content-DESIGN.md): 最終発言時刻(既存データ・
        //   新規取得ゼロ)。ホバーカードで相対時刻(「3分前」等)に変換して表示する。
        lastAt: Number(participant.lastAt) || 0,
        // 2026-07-31: 段。広告/ギフト段では「発言N」でなく「広告(◯分前)」等に出し分ける。
        tier: uid ? laneTierByUid.get(uid) || '' : '',
        // 2026-07-31(ユーザー要望): 直前の発言内容(既存データ・新規取得ゼロ)。
        lastText: String(participant.lastText || ''),
        // v0.1.1218: ホバーで直近数件を読めるようにする(既存データ・新規取得ゼロ)。
        recentTexts: Array.isArray(participant.recentTexts) ? participant.recentTexts : []
      });
      const speakerKey = uid ? `u:${uid}` : rawName ? `n:${rawName}` : '';
      const streakEntry = speakerKey ? speechStreaks.get(speakerKey) : null;
      const seatStreakStage = streakEntry ? streakGlowStage(streakEntry.count) : 0;
      if (seatStreakStage > 0) {
        node.seat.dataset.streak = String(seatStreakStage);
      } else {
        delete node.seat.dataset.streak;
      }
    }
    _venueUnseatedCount = unseatedThisPaint;

    // v0.1.1113 一致計器 v3(Tri-Parity): 鏡データ=段割当データ=【段実DOM】の3点一致で初めて✅。
    //   census は席装飾ループの【後】=この paint の最終DOM(装飾で is-empty が外れた後)を数える。
    //   同一同期フレームで paint に使った laneBuckets と突合=TOCTOU無し・新規readゼロ。
    //   publish と同じ3秒期日(diagDue)のときだけ census+parity を組む(毎paint禁止=hot path 保護)。
    //   期日外は前回値を保持(明滅させない)。計器失敗は描画を止めない。
    const diagDue = nowMs() - _venueSeatsDiagLastWriteAt >= 3000;
    const laneWallNow = Date.now();
    const laneTransientKeys = currentVenueTransientKeys(laneWallNow);
    /** @type {ReturnType<typeof toVenueLaneParityDiag>} */
    let laneParityDiag = /** @type {any} */ (_lastVenueSeatsDiagObs ? (_lastVenueSeatsDiagObs.laneParity ?? null) : null);
    // v0.1.1137(lanescene-structural-review MVP): ①=会場の鏡世代突合(軽量な代理指標)。
    /** @type {ReturnType<typeof compareRenderReceipts>|null} */
    let sceneReceiptDiag = /** @type {any} */ (_lastVenueSeatsDiagObs ? (_lastVenueSeatsDiagObs.sceneReceipt ?? null) : null);
    if (diagDue) {
      // venue-avatar-stale-mirror-DESIGN.md §C-1c: 再プローブスイープを既存diagDue(3秒
      //   min-gap)に相乗り(新規タイマーを作らない=hot path保護)。TTL+バックオフを経過した
      //   失敗記録だけを再プローブする(観測のみのcensusと違い実際にimg.srcを叩き得る副作用)。
      try {
        venueAvatarLoadGuard.retrySweep(venueLaneEls.stack, laneWallNow);
      } catch { /* 計器/再試行の失敗は描画を止めない */ }
      try {
        /** @type {Record<string, string[]>} */
        const painted = {};
        for (const tier of ['link', 'gift', 'ad', 'konta', 'tanu']) {
          painted[tier] = (Array.isArray(/** @type {any} */ (laneBuckets)[tier]) ? /** @type {any} */ (laneBuckets)[tier] : [])
            .map((/** @type {unknown} */ it) => venueLaneParityKey(/** @type {any} */ (it)))
            .filter(Boolean);
        }
        // 実DOM census(数えるだけ・1ノードも触らない)。失敗は dom:null=⚪「DOM未計測」(fail-closed)。
        /** @type {ReturnType<typeof venueDomCensusToParityDom>} */
        let domSummary = null;
        try {
          // ★venue-exact-parity-SPEC §3-3: summarize(venueDomCensusToParityDom)は keys 列を
          //   落とす(PII/容量)。指紋は【落とす前の生値】から作るので、ここで1変数受けする。
          //   census は既にキー列を集めているので追加のDOM走査はゼロ(§7 予算表)。
          const rawCensus = collectVenueLaneDomCensus({
            laneEls: {
              link: venueLaneEls.laneLink,
              gift: venueLaneEls.laneGift,
              ad: venueLaneEls.laneAd,
              konta: venueLaneEls.laneKonta,
              tanu: venueLaneEls.laneTanu
            },
            stackEl: venueLaneEls.stack,
            extras: {
              charFrameLayer,
              crowdOn: totalAnonymous > 0,
              crowdCount: totalAnonymous,
              // v0.1.1116 白円計器: 会場の顔プローブ実績(成功/404)を census 経由で状態速報へ。
              //   getDiagnostics は Set サイズ集計のみ=3秒期日内の1回呼びで hot path 無汚染。
              avatarProbe: venueAvatarLoadGuard.getDiagnostics()
            }
          });
          _venueDomFingerprintLast = laneDomFingerprint({
            link: rawCensus.perSection?.link?.keys,
            gift: rawCensus.perSection?.gift?.keys,
            ad: rawCensus.perSection?.ad?.keys,
            konta: rawCensus.perSection?.konta?.keys,
            tanu: rawCensus.perSection?.tanu?.keys
          });
          domSummary = venueDomCensusToParityDom(rawCensus);
        } catch {
          domSummary = null;
          // census 自体に失敗した=会場DOMを写せていない。指紋も捨てる(古い指紋で✅を名乗らない)。
          _venueDomFingerprintLast = '';
        }
        laneParityDiag = toVenueLaneParityDiag(
          buildVenueLaneParity({
            snap: lanePaintSnap || laneMirrorSnap,
            liveId: String(activeLiveId || liveIdFromPathname() || ''),
            nowMs: laneWallNow,
            mode: lanePaintSnap ? 'mirror' : 'fallback',
            painted,
            transientKeys: laneTransientKeys,
            visibleShown: visibleSeats.length,
            logicalTotal: seating.seats.length,
            dom: domSummary
          })
        );
        /*
         * ★関所が落としたセル数を既存の1行に併記する(新しい観測系統は作らない)。
         *   通常は 0。0 でなければ①側が契約違反の鏡を書いている=書き手を名指しできる。
         *   [[instrument-spiral-25-versions-2026-08-06]] の反省により、計器の新設はしない。
         */
        if (laneParityDiag && _laneMirrorSanitizeDropped > 0) {
          laneParityDiag = {
            ...laneParityDiag,
            line: `${laneParityDiag.line} / 鏡除外${_laneMirrorSanitizeDropped}`
          };
        }
        /*
         * ★venue-exact-parity-SPEC §5-3: 席なし件数も既存の1行に併記する(同上・新設しない)。
         *   席は uid でしか結びつかない(venueSeatIndexByUid=uid-only join)ので、
         *   名前でしか同定できない人は席なしの生タイルとして段に出る=これは【正常】。
         *   0 でなければ「段の枚数と席の枚数がなぜ違うか」がこの数値で説明済みになる。
         */
        if (laneParityDiag && _venueUnseatedCount > 0) {
          laneParityDiag = {
            ...laneParityDiag,
            line: `${laneParityDiag.line} / 席なし${_venueUnseatedCount}`
          };
        }
        /*
         * ★venue-exact-parity-SPEC-2026-08-07 §3-3(MVPの中核): 受領証を【3つの独立起点】から組む。
         *
         *   旧実装(v0.1.1137〜1283)はここでインラインに組み立てており、
         *     - venueReceipt.revision に popEnvelope.revision を【自己代入】(C1: revision比較が恒真)
         *     - pop/venue 両 hash が同じ lanePaintSnap 起点(C2: X と copy(X) の比較)
         *     - ①が snapshot に焼いた contentHash を誰も読まない(C3)
         *   の3点で恒真=「①が0件描画でも鏡さえ残れば ✅」という嘘の緑を出していた。
         *
         *   新実装の起点:
         *     ① 側 = laneMirrorSnap(最新の受理済み鏡)の capturedAt / contentHash / domSelf.fingerprint
         *     会場側 = lanePaintSnap(実際に描いた鏡)の capturedAt + laneBuckets からの再計算 hash
         *              + _venueDomFingerprintLast(会場【実DOM】census 由来の指紋)
         *   → revision差=「古い/先の世代を描いた」、hash差=「同世代で中身が違う」、
         *     指紋差=「データは同じなのに画面の顔ぶれが違う」を別々に名指しできる。
         */
        /*
         * ★v0.1.1300(受領証の分離): ①の実DOM指紋は、鏡データ本体(domSelf)ではなく
         *   【別キーの受領証】から取れる場合がある。受領証は表示面固有なので、
         *   共通データ(鏡)から切り離してある。
         *   ★使ってよいのは isReceiptComparable が true のときだけ
         *     = receipt.fingerprintFor === snap.contentHash(内容アドレス一致)。
         *     時計では判定しない: sig一致で描画スキップ中の DOM は不変=指紋は
         *     「古くて正しい」ので、時計で切ると正しい値を捨てる。
         *   鏡本体に domSelf があるならそちらを優先する(既存挙動を変えない)。
         */
        let _acceptedForScene = laneMirrorSnap;
        try {
          const hasOwnFp = String(laneMirrorSnap?.domSelf?.fingerprint || '').trim() !== '';
          if (!hasOwnFp && _laneReceiptFromPopup) {
            const cmp = isReceiptComparable(laneMirrorSnap, _laneReceiptFromPopup);
            if (cmp.comparable) {
              const base = laneMirrorSnap?.domSelf;
              _acceptedForScene = {
                ...laneMirrorSnap,
                domSelf: /** @type {import('../lib/laneMirror.js').LaneMirrorDomSelf} */ ({
                  measured: base?.measured === true || _laneReceiptFromPopup.measured === true,
                  perTier: base?.perTier ?? _laneReceiptFromPopup.perTier,
                  dpr: base?.dpr ?? _laneReceiptFromPopup.dpr ?? 1,
                  measuredAt: base?.measuredAt ?? _laneReceiptFromPopup.measuredAt ?? 0,
                  fingerprint: String(_laneReceiptFromPopup.fingerprint || ''),
                  fingerprintFor: String(_laneReceiptFromPopup.fingerprintFor || '')
                })
              };
            }
          }
        } catch { /* 受領証の合成失敗は既存経路(鏡のdomSelf)に任せる */ }
        const sceneReceipts = buildVenueSceneReceipts({
          acceptedSnap: _acceptedForScene,
          paintedSnap: lanePaintSnap,
          paintedBuckets: laneBuckets,
          venueDomFingerprint: _venueDomFingerprintLast
        });
        sceneReceiptDiag = sceneReceipts
          ? compareRenderReceipts(sceneReceipts.popReceipt, sceneReceipts.venueReceipt)
          : null;
      } catch {
        /* 計器失敗は描画を止めない(前回値を保持) */
      }
    }
    // 席が動いた(段の再描画/表示人数変化)後、表示中の吹き出しを席頭上へ追従させる。
    //   併せて「パン可能(縦に溢れている)」かを判定して grab カーソルの出し分けを更新する。
    //   v0.1.738: 全席が画面に収まる時は grab を出さない(掴めるのに動かない誤解を防ぐ)。
    const updatePanAffordance = () => {
      const canPan = seatsHost.scrollHeight > seatsHost.clientHeight + 2;
      seatsHost.classList.toggle('nlsb-can-pan', canPan);
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        repositionAllBubbles();
        updatePanAffordance();
      });
    } else {
      repositionAllBubbles();
      updatePanAffordance();
    }

    // v0.1.902: 健全度パネル「会場座席」セル用の純観測値を storage へ(min-gap で間引き)。
    //   配信者混入=v0.1.901 の本人除外が効いているかの回帰検出。visibleSeats に配信者 uid を
    //   持つ席があれば混入(本来あってはならない)。配信者 uid 未取得時は判定不能(broadcasterKnown=false)。
    const bcUid = String(_lastBroadcasterUid || '').trim();
    const broadcasterInSeats =
      bcUid !== '' &&
      visibleSeats.some(
        (entry) => String(entry?.participant?.userId || '').trim() === bcUid
      );
    const seatsDiagObs = {
      enabled: open,
      // ★v0.1.1050: 会場が観測した配信ID。パリティ突合で status が「現配信か」を判定し、前配信の
      //   残骸(古いスナップショット)を現配信と突き合わせて嘘の🔴を出さないためのガード(観測のみ)。
      liveId: String(activeLiveId || liveIdFromPathname() || ''),
      seatsShown: visibleSeats.length,
      participantCount: seating.participantCount,
      otherCount: totalAnonymous,
      broadcasterInSeats,
      broadcasterKnown: bcUid !== '',
      // ★これは会場パネル renderDiagPanel が nowMs()(相対)と引き算する用の相対時計。
      //   storage(状態速報)へ出す lastUpdateAt は publishVenueSeatsDiag が Date.now()(壁時計)で
      //   上書きするので、ここは相対のまま=会場パネルの「更新◯秒前」は相対同士で正しく出る。
      lastUpdateAt: nowMs(),
      // v0.1.1043: 「なぜ全員出ないか」を状態速報で数値切り分けするための計器。
      //   既に算出済みの値を載せるだけ(新規計算/再描画を足さない=churn 源にしない)。
      //   perRow*venueMaxRows と participantCount と 500 のどれで可視席が頭打ちかを status が判定。
      perRow,
      venueMaxRows,
      seatAreaWidth,
      hardCap: VENUE_FULLSCREEN_MAX_SEATS,
      // v0.1.1111: 会場=①レーンのメンバー一致トークン(P/T/X 3層)。状態速報が1行そのまま出す。
      laneParity: laneParityDiag,
      // v0.1.1137(lanescene-structural-review MVP): ①=会場の鏡世代突合(軽量な代理指標・独立判定)。
      sceneReceipt: sceneReceiptDiag,
      // v0.1.1138(「消す側」の計器): fallback時に段から除外された匿名の人数。
      anonExcluded: _anonExcludedCount,
      // ★venue-exact-parity-SPEC §5-3: 席に結びつかなかった段タイル数(uid-only join の説明済み差分)。
      //   ★状態速報へは laneParity.line への併記で出る(この構造フィールドは診断パネル/回帰テスト用)。
      unseated: _venueUnseatedCount,
      // 2026-07-14 席リンク一致計器: タイル実体(鏡uid)⇄席クラス(roster uid)の二重ソース突合(累積)。
      seatLinkParity: toVenueSeatLinkParityDiag(_seatLinkParity, Date.now()),
      // 2026-07-15 診断先行(venue-yukkuri-named-diagnose): 「名前ありゆっくり顔」の実害を数えるだけの1行。
      yukkuriNamedCensus: toVenueYukkuriNamedCensusDiag(_yukkuriNamedCensus),
      // 2026-07-21 診断先行: 応援TOP吹き出しchurnの実害を数えるだけの1行。
      bubbleChurn: toVenueBubbleChurnDiag(_bubbleChurn),
      storyDiagMirror: storyDiagMirrorStatus(storyDiagMirrorSnap, String(activeLiveId || liveIdFromPathname() || ''), Date.now()),
      // v0.1.1207: 会場の立ち上がり分解(開く→鏡→集計→初描画→初席)。ユーザー報告
      //   「立ち上がりが遅い/出ないときがある」を体感でなく数字で切り分けるため。
      //   ★ここに載せないと状態速報に出ない([[fastdiag-lite-is-the-printer-subset]]の同型)。
      openLatency: summarizeVenueOpenLatency(_openLatency),
      // ★v0.1.1317: 会場が鏡を受け取れているか(通知/キー一致/関所)を1行で出す。
      //   ★ここに載せないと状態速報に出ない([[fastdiag-lite-is-the-printer-subset]]の同型)。
      //   観測ゼロなら空文字=行ごと出ない(普段の速報を汚さない)。
      mirrorIntakeLine: formatVenueMirrorIntakeLine(_venueMirrorIntake, Date.now()),
      /*
       * ★v0.1.1405: 判定の【材料】も載せる(行だけでは画面のセルが作れない)。
       *
       * ■ なぜ必要か
       *   会場が publish していたのは整形済みの1行だけで、(a)通知が来ない /
       *   (b)別配信の鏡 / (c)関所で却下 を区別するカウンタは会場の外に出ていなかった。
       *   ＝ 状態速報の本文を人が読む以外に使い道がなく、未解決の
       *   「会場一致が鏡stale(656s)で固定」を **画面が名指しできなかった**。
       *   ★[[screen-only-info-never-reaches-the-report-2026-08-11]] の逆向きの穴
       *     (報告にしか出さない情報は画面に届かない)。
       *
       * ★構造のまま渡す=読み手(healthCells)が judgeVenueMirrorIntake で判定する。
       *   ここで判定結果を文字列化して渡すと、また同じ穴を作る。
       */
      mirrorIntake: {
        changedEvents: _venueMirrorIntake.changedEvents,
        keyMatched: _venueMirrorIntake.keyMatched,
        keyMissed: _venueMirrorIntake.keyMissed,
        accepted: _venueMirrorIntake.accepted,
        rejectedByGate: _venueMirrorIntake.rejectedByGate,
        lastMissedKeys: (_venueMirrorIntake.lastMissedKeys || []).slice(0, 3),
        lastExpectedKey: _venueMirrorIntake.lastExpectedKey,
        lastAcceptedAt: _venueMirrorIntake.lastAcceptedAt,
        lastRejectReason: _venueMirrorIntake.lastRejectReason
      },
      /*
       * ★v0.1.1348: 会場のアイコン実績を【トップレベル】にも載せる(v0.1.1347 の断線修理)。
       *
       * ■ v0.1.1347 で読み手(aiShareFullText)に `venueSeatsDiag.avatarProbe` を読む行を足したが、
       *   書き手はここに載せておらず【永久に出ない行】だった(通し確認を怠った)。
       *   avatarProbe は census の extras 経由で laneParity.dom へ平坦化されるだけで、
       *   しかも whitelist は probeFail 1個しか通していない。
       *   ＝[[venue-mirror-is-the-primary-path]]「個別列挙して作り直す関数が値を落とす」の再演。
       *
       * ★census 側(extras.avatarProbe)は現状維持で、ここに【追加で】貫通させる
       *   (既存契約を壊さない)。同じ 3秒 min-gap 内の1回呼びなので hot path は汚さない。
       */
      avatarProbe: venueAvatarLoadGuard.getDiagnostics()
    };
    publishVenueSeatsDiag(seatsDiagObs);
    // 2026-07-01 会議(venue-diag): 「🩺 会場の状態」パネル用に最新の観測値を保持。
    //   パネルが開いている時だけ再描画(sig 無変化なら DOM を触らない=hot path を汚さない)。
    _lastVenueSeatsDiagObs = seatsDiagObs;
    if (!diagPanel.hidden) renderDiagPanel();
    // v0.1.1053: 会場が生きている間だけプレゼンスを書く(popup側の効果音二重再生防止・3秒min-gap内蔵)。
    if (open) writeVenueEffectSoundPresence();
    // 2026-08-08 入場演出: 席が DOM に載った【後】に呼ぶ(座標が取れるのはこの時点以降)。
    //   新規が居なければ何もしない=通常 paint を汚さない。
    runEntryEffects(String(activeLiveId || liveIdFromPathname() || ''));
  };

  /**
   * 会場座席の観測値を storage へ書く(min-gap で間引き=描画 hot path を汚さない)。
   *   失敗は握る=会場を止めない(publishVoiceDiag と同型)。
   * @param {Partial<import('../lib/venueSeatsDiag.js').VenueSeatsDiagState>} obs
   */
  const publishVenueSeatsDiag = (obs) => {
    try {
      // min-gap 判定は単調増加の相対時計(nowMs=performance.now)でよい。
      const monotonic = nowMs();
      if (monotonic - _venueSeatsDiagLastWriteAt < 3000) return; // 3秒 min-gap。
      _venueSeatsDiagLastWriteAt = monotonic;
      // ★lastUpdateAt/capturedAt は storage 経由で状態速報の Date.now() と引き算される=【壁時計】でなければ
      //   ならない(相対時計 performance.now を混ぜると「更新 17億秒前=約56年前」の異常表示になる)。
      //   nowMs()(相対)と Date.now()(epoch)のクロック取り違えが会場座席セルの誤表示の真因。
      const wallNow = Date.now();
      const snap = buildVenueSeatsDiagSnapshot({ ...obs, lastUpdateAt: wallNow }, wallNow);
      if (!hasVenueExtensionContext()) return;
      chrome.storage.local.set({ [KEY_VENUE_SEATS_DIAG]: snap }).catch(() => {
        /* best-effort: storage 不可・context 消失 */
      });
    } catch {
      /* no-op */
    }
  };

  /**
   * v0.1.1111 会場=①レーン鏡映: baseRows の供給合成。鏡が使える(同一配信・180s以内・非空)なら
   *   P層=鏡の順序そのままの行 + T層=鏡に居ない集計候補(=①のcap外)を末尾へ。使えなければ
   *   fallbackRows(従来経路)をそのまま返す=①未描画/開直後でも会場は空白にならない(L8)。
   *   使った鏡は laneMirrorPaintSnap に固定(renderSeats の段割当・一致判定と同一snap=TOCTOU排除)。
   *
   * v0.1.1136 C2(scroll-whiteout-freeze設計とは別件・venue-pop-parity-loop-root-cause設計C2):
   *   reason='stale'(同一配信・鏡はあるが180s窓超え)のときは fallback へ切替えず、直近の鏡
   *   (laneMirrorSnap自体・古いだけで実在する)を使い続ける。これにより配信のコメント速度が
   *   遅い時間帯で「鏡モード⇔fallbackモード」を数分おきに往復してりんく段が総入替=出たり
   *   消えたりする(diff-skipキーがモードごとに変わるため)実害を止める。fallback降格は
   *   liveIdMismatch/absent/empty のときだけ(=鏡が本当に使えない・別配信・鏡が届く前)。
   *
   * v0.1.1195(venue-avatar-stale-mirror-DESIGN.md 根治2・二段窓): 上記C2は「数分規模の一時的な
   *   遅れ」を想定した判断であり、popupが数時間開かれないケースは想定の外だった(実測: 鏡stale
   *   21437s=約6時間の間、その間に来た新規参加者が段に一切現れない)。そこでHARD窓(15分)を
   *   足し、超えた鏡は reason='staleHard' として fallback へ降格させる。staleButUsable は
   *   reason==='stale' の厳密一致なので、この行を変えずに 'staleHard' が自動的に降格する。
   *   SOFT(3分)帯の挙動は1バイトも変わらない=C2のちらつき防止はそのまま維持される。
   * @param {ReadonlyArray<{userId?: unknown}>} candidates 集計候補(preCount join 用)
   * @param {VenueRow[]} fallbackRows 従来経路の行(venueRowsFromUserLaneCandidates の出力)
   * @returns {VenueRow[]}
   */
  const composeVenueBaseRows = (candidates, fallbackRows) => {
    const liveId = String(activeLiveId || liveIdFromPathname() || '');
    const usable = isLaneMirrorUsableForVenue(laneMirrorSnap, liveId, Date.now());
    const staleButUsable = !usable.usable && usable.reason === 'stale';
    if (!usable.usable && !staleButUsable) {
      laneMirrorPaintSnap = null;
      return fallbackRows;
    }
    laneMirrorPaintSnap = laneMirrorSnap;
    // venue-avatar-stale-mirror-DESIGN.md §C-1d: 鏡capturedAtが前進した(popup復帰等でstorageが
    //   新鮮化した)節目で、timeout種別の失敗記録だけ消して即座の再機会を与える(errorは維持=
    //   404の再打撃を避ける)。clearFailedUrls(全消し)は使わない(§G-1: succeededKeysも消えて
    //   全タイルが一瞬白丸に戻るちらつきを防ぐため)。
    try {
      const cap = Math.max(0, Number(laneMirrorSnap?.capturedAt) || 0);
      if (cap > 0 && cap > _lastPaintedMirrorCapturedAt) {
        _lastPaintedMirrorCapturedAt = cap;
        venueAvatarLoadGuard.clearTimedOutFailures();
      }
    } catch { /* no-op: 計器/再試行の失敗は描画を止めない */ }
    /** @type {Map<string, any>} */
    const byUid = new Map();
    for (const c of Array.isArray(candidates) ? candidates : []) {
      const uid = String(/** @type {any} */ (c)?.userId || '').trim();
      if (uid && !byUid.has(uid)) byUid.set(uid, c);
    }
    const mirrorRows = venueRowsFromLaneMirror(laneMirrorPaintSnap, byUid);
    /** @type {Set<string>} */
    const inMirror = new Set();
    for (const r of mirrorRows) {
      inMirror.add(r.userId);
      // 鏡に現れた人は X層(暫定)を卒業=①と同化した。
      venueTransientFirstSeen.delete(`u:${r.userId}`);
    }
    const tail = (Array.isArray(fallbackRows) ? fallbackRows : []).filter(
      (r) => !inMirror.has(String(r?.userId || '').trim())
    );
    return /** @type {VenueRow[]} */ ([...mirrorRows, ...tail]);
  };

  /**
   * X層の現在有効な暫定キー集合を返し、窓の2倍を過ぎた古い記録は掃除する(Map を有界に保つ)。
   * @param {number} nowWallMs
   * @returns {Set<string>}
   */
  const currentVenueTransientKeys = (nowWallMs) => {
    /** @type {Set<string>} */
    const out = new Set();
    for (const [k, at] of venueTransientFirstSeen) {
      if (nowWallMs - at > VENUE_LANE_TRANSIENT_WINDOW_MS * 2) {
        venueTransientFirstSeen.delete(k);
        continue;
      }
      if (nowWallMs - at <= VENUE_LANE_TRANSIENT_WINDOW_MS) out.add(k);
    }
    return out;
  };

  /**
   * 鏡の新着(onChanged)を rAF に集約して再供給→再描画。コメント怒涛+3秒鏡でも1フレーム1回。
   */
  const scheduleLaneMirrorRecommit = () => {
    if (laneMirrorRecommitRaf) return;
    const run = () => {
      laneMirrorRecommitRaf = 0;
      if (!open) return;
      baseRows = composeVenueBaseRows(
        aggregatedCandidates,
        venueRowsFromUserLaneCandidates(aggregatedCandidates)
      );
      commitDisplay(baseRows);
    };
    laneMirrorRecommitRaf =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : (run(), 0);
  };

  const aggregateParticipants = async () => {
    if (!open || aggregateInFlight) return;
    // v0.1.753: 拡張更新後の古いタブは chrome.* が全失敗する。storage を叩く前に先回りで検知し、
    //   無限リトライを止めて再読み込み案内を出す(黙って凍結しない)。
    if (!hasVenueExtensionContext()) { markContextInvalidated(); return; }
    const liveId = liveIdFromPathname();
    if (!liveId) return;
    aggregateInFlight = true;
    try {
      if (activeLiveId !== liveId) {
        activeLiveId = liveId;
        baseRows = [];
        seatByKey = new Map();
        // 2026-07-30(venue-ranking-churn-SPEC.md §4.3): 応援者ランキング安定化状態も
        //   seatByKeyと同じ場所でリセット(前配信の現職を持ち越さない)。
        supporterOrderKeys = [];
        _supporterRankDrops = 0;
        _supporterRankOvertakes = 0;
        spokenUserIds.clear(); // 別配信の昇格匿名を持ち越さない
        aggregatedChunkSeqs = []; // v0.1.754: 別配信の集約状態を持ち越さない
        aggregatedCandidates = [];
        liveRoster.clear(); // v0.1.754: 別配信の在席を持ち越さない
        // v0.1.1111: 別配信の鏡/暫定(X層)を持ち越さない(鏡はliveId不一致でも弾かれるが明示クリア)。
        laneMirrorPaintSnap = null;
        venueTransientFirstSeen.clear();
        // 配信切替は意図的な空表示(前配信を持ち越さない)。clearDisplay で lastGood も破棄。
        clearDisplay();
      }
      // v0.1.754 3時間安定化: まず安いインデックス1キーだけ読む。チャンク化済みなら【新規 seq の
      //   チャンクだけ】読んで差分集約→既存集約へマージ(O(新規分))。全件再読み(O(N)・数万件で
      //   メインスレッド圧迫・8秒timeout超で会場停止)をやめる。チャンクは append-only なので等価。
      const idxKey = chunkIndexKey(liveId);
      const idxBag = await runStorageOpWithTimeout(
        () => chrome.storage.local.get(idxKey),
        8000
      );
      if (!open || liveIdFromPathname() !== liveId) return;
      const index = idxBag ? idxBag[idxKey] : null;
      // ⚠️ LANE_OPTS チェックリスト(新しい opts を足したら下の userLaneCandidatesFromStorage 呼び出し
      //   2 箇所すべてに渡ること):
      //   - requireText      : 本文ありの行だけ参加者にする(v0.1.740・配信者の本文空行混入を弾く)
      //   - broadcasterUid    : 配信者の数値 userId(下で storage から読む)
      //   - broadcasterIconUrl: 配信者アイコン URL(同上)
      //   broadcasterUid と broadcasterIconUrl は【両方そろって初めて】guard が有効になる
      //   (userLaneCandidatesFromStorage 内 Boolean(uid && iconUrl))。片方欠けると guard 無効=
      //   配信者アイコン付きの匿名行が会場に座る既知バグ(v0.1.793)が再発する。
      // v0.1.793: broadcaster ctx を storage(content-entry が書く)から読み LANE_OPTS に混ぜる。
      //   inline も standalone(venue.html)も storage 経由で取れる(content の変数は別バンドルで届かない)。
      //   経路の正本は src/lib/broadcastContext.js。ctx は補助情報なので、読めなくても(timeout 等)
      //   guard 無効で集計は続ける(局所 catch で握りつぶす=会場本体を止めない)。
      let _bcCtx = normalizeBroadcasterCtx(null);
      try {
        const _bcBag = await runStorageOpWithTimeout(
          () => chrome.storage.local.get(KEY_LIVE_BROADCASTER_CTX),
          3000
        );
        if (!open || liveIdFromPathname() !== liveId) return;
        _bcCtx = normalizeBroadcasterCtx(_bcBag?.[KEY_LIVE_BROADCASTER_CTX]);
      } catch {
        // broadcaster ctx が読めなくても会場は止めない(guard 無効のまま集計続行)。
      }
      const _bcUsable = isBroadcasterCtxUsableForGuard(_bcCtx, liveId);
      // v0.1.901: 配信者【本人除外】は uid だけで効く(iconUrl 不要)。アイコン化け防止(iconUrl 必須)とは
      //   別物なので、uid と配信が一致していれば iconUrl の有無によらず broadcasterUid を渡す。
      //   これで iconUrl 未取得でも本人(放送主)が会場席に座るのを防ぐ。配信一致は
      //   isBroadcasterCtxUsableForGuard と同じ規則(ctx.liveId 空は後方互換で許容)で判定する。
      const _bcLiveMatches = (() => {
        const cur = String(liveId ?? '').trim().toLowerCase();
        const own = String(_bcCtx.liveId ?? '').trim().toLowerCase();
        return !(cur && own && cur !== own);
      })();
      const _bcUidForExclude = _bcCtx.uid && _bcLiveMatches ? _bcCtx.uid : '';
      // v0.1.902: 健全度パネルの「配信者混入」セル用に、判明している配信者 uid を保持する。
      //   renderSeats が visibleSeats とこの uid を突合し、除外漏れ(本人が席に座る)を検知する。
      _lastBroadcasterUid = _bcUidForExclude;
      // v0.1.740: requireText:true で「実際にコメントした人(本文あり)」だけを参加者にする。
      const LANE_OPTS = {
        requireText: true,
        // 本人除外は uid だけで効くので _bcUidForExclude(iconUrl 不問)。アイコン化け防止の
        //   broadcasterIconUrl は従来どおり両方そろった _bcUsable 時のみ(誤除外を避ける)。
        broadcasterUid: _bcUidForExclude,
        broadcasterIconUrl: _bcUsable ? _bcCtx.iconUrl : ''
      };
      if (isChunkIndex(index, liveId) && Array.isArray(/** @type {any} */ (index).seqs)) {
        // --- チャンク化済み: 差分(新規 seq)だけ集約してマージ ---
        const allSeqs = /** @type {number[]} */ (/** @type {any} */ (index).seqs);
        const newSeqs = selectNewChunkSeqs(allSeqs, aggregatedChunkSeqs);
        if (newSeqs.length > 0) {
          const keys = newSeqs.map((seq) => chunkStorageKey(liveId, seq));
          const bag = await runStorageOpWithTimeout(
            () => chrome.storage.local.get(keys),
            8000
          );
          if (!open || liveIdFromPathname() !== liveId) return;
          /** @type {unknown[]} */
          let newRows = [];
          for (const key of keys) {
            const part = bag ? bag[key] : null;
            if (Array.isArray(part)) newRows = newRows.concat(part);
          }
          const newCandidates = userLaneCandidatesFromStorage(newRows, liveId, LANE_OPTS);
          aggregatedCandidates = mergeUserLaneAggregates(aggregatedCandidates, newCandidates);
          aggregatedChunkSeqs = aggregatedChunkSeqs.concat(newSeqs);
        }
        // v0.1.1111: 鏡が使えれば「鏡そのまま+cap外の尾」、使えなければ従来行(fallback)。
        baseRows = composeVenueBaseRows(
          aggregatedCandidates,
          venueRowsFromUserLaneCandidates(aggregatedCandidates)
        );
      } else {
        // --- 未チャンク化(従来 main・小規模/移行前): 従来どおり全件読み(件数が小さいので安全) ---
        const result = await runStorageOpWithTimeout(
          () =>
            readChunkedComments(liveId, commentsStorageKey(liveId), (keys) =>
              chrome.storage.local.get(keys)
            ),
          8000
        );
        if (!open || liveIdFromPathname() !== liveId) return;
        const candidates = userLaneCandidatesFromStorage(result.rows, liveId, LANE_OPTS);
        // v0.1.1111: 鏡更新時の再供給(scheduleLaneMirrorRecommit)が同じ候補で組み直せるよう保持
        //   (frozen/readonly の候補をミュータブル配列へコピー=chunk移行後の merge とも整合)。
        aggregatedCandidates = Array.from(candidates);
        baseRows = composeVenueBaseRows(candidates, venueRowsFromUserLaneCandidates(candidates));
      }
      // パネルと同じ低頻度キャッシュで実サムネを補強し、会場だけ顔が欠ける差をなくす。
      const profileBag = await runStorageOpWithTimeout(
        () => chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE),
        8000
      );
      if (!open || liveIdFromPathname() !== liveId) return;
      const profileMap =
        /** @type {Record<string, { avatarUrl?: unknown }>|null} */ (
          profileBag?.[KEY_USER_COMMENT_PROFILE_CACHE] || null
        );
      // v0.1.1110: 補強は commitDisplay(全描画の関所)が毎回行う。ここでは閉包キャッシュの
      //   更新だけ(読めなかった時は前回のキャッシュを null で潰さない)。
      if (profileMap) profileAvatarMap = profileMap;
      // commitDisplay 経由=空(0件)なら前回の非空表示を維持し、会場を空で再描画しない。
      commitDisplay(baseRows);
    } catch (err) {
      // v0.1.753: 拡張更新後の context invalidated は「一時的に読めない」ではなく恒久失敗。
      //   黙って前状態維持の無限リトライをやめ、ページ再読み込み案内を出してループを止める。
      if (isContextInvalidatedError(err) || !hasVenueExtensionContext()) {
        markContextInvalidated();
        return;
      }
      // storage timeout / 拡張更新中など一時的に読めない場合は前状態を維持し次回集計へ任せる。
      if (err !== STORAGE_OP_TIMED_OUT) {
        // 想定外エラーも会場は前状態維持(空再描画しない)。ログだけ残す。
        console.warn('[venue] aggregate failed; keeping last good', err);
      }
    } finally {
      aggregateInFlight = false;
    }
  };

  /** @type {number[]} */
  let aggregateBurstTimers = [];
  const clearAggregateBurst = () => {
    for (const t of aggregateBurstTimers) clearTimeout(t);
    aggregateBurstTimers = [];
  };

  const stopAggregation = () => {
    clearAggregateBurst();
    if (rosterPruneTimer) { clearInterval(rosterPruneTimer); rosterPruneTimer = 0; }
    if (rosterCommitRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rosterCommitRaf);
    }
    rosterCommitRaf = 0;
    if (!aggregateTimer) return;
    clearInterval(aggregateTimer);
    aggregateTimer = 0;
  };

  const startAggregation = () => {
    if (aggregateTimer || rosterPruneTimer) return;
    // v0.1.1111 会場=①レーン鏡映: 開いた瞬間の catch-up を1回だけ(以降は onChanged の newValue 直採用)。
    //   読めなくても会場は止めない(fallback=従来経路で描く)。鏡が取れたら rAF 再供給で即同化。
    void (async () => {
      try {
        if (!hasVenueExtensionContext()) return;
        const _catchUpLiveId = String(activeLiveId || liveIdFromPathname() || '').trim().toLowerCase();
        const _panelKey = _catchUpLiveId ? panelSummaryStorageKey(_catchUpLiveId) : '';
        // ★v0.1.1300: この配信専用の鏡(v2)と受領証も一緒に読む。
        const _mirrorKey = laneMirrorKeyFor(_catchUpLiveId);
        const _receiptKey = laneReceiptKeyFor(_catchUpLiveId);
        const _keys = [KEY_LANE_MIRROR, KEY_STORY_DIAG_MIRROR];
        if (_panelKey) _keys.push(_panelKey);
        if (_mirrorKey) _keys.push(_mirrorKey, _receiptKey);
        const bag = await runStorageOpWithTimeout(() => chrome.storage.local.get(_keys), 3000);
        // ★受け入れ点1/2(開時 catch-up): 関所を必ず通す(laneMirrorContract.js の契約)。
        //   ★v0.1.1300: 配信ごとキー(v2)を【優先】する。無ければ旧グローバルキー。
        //     旧キーは他配信の①が最後に書くと上書きされ、liveId 照合で弾かれて
        //     「鏡なし」に見える(会場が fallback へ降格し gift/ad 段が消える真因)。
        const snap =
          (_mirrorKey ? acceptLaneMirrorSnapshot(bag?.[_mirrorKey]) : null) ||
          acceptLaneMirrorSnapshot(bag?.[KEY_LANE_MIRROR]);
        // 受領証(①が実際に描いた DOM の要約)。比較は isReceiptComparable が許すときだけ。
        if (open && _receiptKey && bag?.[_receiptKey]) {
          _laneReceiptFromPopup = /** @type {any} */ (bag[_receiptKey]);
        }
        if (open && snap) {
          laneMirrorSnap = snap;
          scheduleLaneMirrorRecommit();
        }
        const storySnap = bag?.[KEY_STORY_DIAG_MIRROR];
        if (open && storySnap && typeof storySnap === 'object') {
          storyDiagMirrorSnap = /** @type {Record<string, unknown>} */ (storySnap);
        }
        const panelSnap = _panelKey ? bag?.[_panelKey] : null;
        if (open && panelSnap && typeof panelSnap === 'object') {
          panelSummarySnap = /** @type {Record<string, unknown>} */ (panelSnap);
          _panelSummaryLastSeenAt = Date.now();
        }
        if (open && ((storySnap && typeof storySnap === 'object') || (panelSnap && typeof panelSnap === 'object'))) {
          renderStoryDiagMirrorPanel();
        }
        // v0.1.1207: 鏡の catch-up が決着した瞬間(取れた/空だった のどちらも決着)。
        try {
          noteVenueMirrorSettled(_openLatency, Date.now(), {
            absent: !(snap && typeof snap === 'object')
          });
        } catch { /* 計器失敗は会場を止めない */ }
      } catch {
        /* 鏡の catch-up 失敗は無視(fallback で描く・onChanged が来れば同化する) */
        // v0.1.1207: 失敗(タイムアウト含む)も「決着」として刻む=遅さの理由が読める。
        try { noteVenueMirrorSettled(_openLatency, Date.now(), { timedOut: true }); } catch { /* no-op */ }
      }
    })();
    if (rosterDriven) {
      // v0.1.754 ストリーム駆動: storage は「開いた瞬間の catch-up を1回」だけ。aggregateParticipants
      //   が aggregatedCandidates(チャンク差分集計)を満たした後、それで在席を hydrate し、以降は
      //   onLiveComments のストリームに任せる(30秒の全集計ループは回さない=3時間でも軽い)。
      void (async () => {
        await aggregateParticipants(); // 1回だけ(チャンク差分読み)
        try { noteVenueAggregateSettled(_openLatency, Date.now()); } catch { /* no-op */ }
        if (!open || !rosterDriven) return;
        hydrateRosterFromCandidates(liveRoster, aggregatedCandidates, {
          maxSeats: VENUE_ROSTER_MAX_SEATS
        });
        scheduleRosterCommit();
      })();
      // 沈黙中も退席を席へ反映する軽量 prune(全集計でなく O(席数) の掃除のみ)。
      rosterPruneTimer = window.setInterval(() => {
        if (!open || !rosterDriven) return;
        const before = liveRoster.size;
        pruneRoster(liveRoster, Date.now(), {
          windowMs: VENUE_ROSTER_WINDOW_MS,
          vipWindowMs: VENUE_ROSTER_VIP_WINDOW_MS,
          maxSeats: VENUE_ROSTER_MAX_SEATS
        });
        if (liveRoster.size !== before) {
          baseRows = rosterToVenueRows(liveRoster);
          commitDisplay(baseRows);
        }
      }, 5_000);
      return;
    }
    // --- standalone(venue.html)/ロールバック: 従来の storage 集計経路(不変) ---
    void aggregateParticipants();
    // v0.1.741 安定化(100回やっても出る): 開いた直後はコメント記録がまだ storage に
    //   書かれている途中のことがある。1回きりの集計+30秒間隔だと「開いた瞬間0人で待たされる」
    //   再現性の低さが出る。開いて数秒は短間隔でバースト再集計し、データが書かれ次第すぐ会場へ
    //   反映する(storage.onChanged 経由でも来るが、初期化タイミングの取りこぼしを確実に拾う保険)。
    clearAggregateBurst();
    for (const delay of [400, 1000, 2000, 3500, 5500, 8000]) {
      aggregateBurstTimers.push(
        window.setTimeout(() => {
          if (open) void aggregateParticipants();
        }, delay)
      );
    }
    aggregateTimer = window.setInterval(() => {
      void aggregateParticipants();
    }, AGGREGATE_INTERVAL_MS);
  };

  // v0.1.752: storage poll とリアルタイム live feed の両方が通る共通処理。引数 rows から
  //   新着発言を抽出(pickNewVenueSpeech)→席へマージ→吹き出し+読み上げ。両経路が同じ
  //   speechState.seenKeys を共有するので、同じコメントが poll と live で来ても1回だけ吹く。
  /** @param {Array<Record<string, any>>} rows */
  const processSpeechRows = (rows) => {
    // 熱量の色温度: コメントが来ない時もこの poll は回る(窓が空けば level 0 へ自然に冷める)。
    applyVenueHeat(rows);
    // 「会話の連鎖」: 発言が途切れた人のストリークを掃除(席のグローが自然に消える)。
    pruneSpeechStreaks(speechStreaks, Date.now());
    // primeEmit: 会場を開いた瞬間に直近3件を吹き出す(過疎番組でも会場が喋って見える)。
    //   2回目以降は primed 済みなので新着だけ。過去ログ一斉飛びは起きない。
    // v0.1.755 リアルタイム完璧化: maxEmit 8→24。洪水時に「9件目以降の新着を取りこぼす」のを防ぐ
    //   (会議結論=取りこぼさず全部通す)。同時表示数は BUBBLE_MAX(12)+流速可変寿命で抑えるので
    //   画面は埋まり続けない。24 は1ポーリング/1バーストの現実的上限(初回フラッシュは primeEmit で別管理)。
    const result = pickNewVenueSpeech(rows, speechState, { maxEmit: 24, primeEmit: 3 });
    speechState = {
      seenKeys: result.seenKeys,
      primed: result.primed
    };
    // ユーザー方針「しゃべった人を席に出して吹かせる」: 新着発言者を会場行にマージして
    //   先に席を作り直す(buildVenueSeating が capturedAt=now で上位席へ出す)。その後で
    //   吹き出しを出すと、しゃべった人の席が必ず存在するので吹き出しが宙に浮かない。
    if (result.speeches.length > 0) {
      // しゃべった人(匿名含む)の userId を昇格集合へ。次の renderSeats でアリーナ席に座り
      //   吹き出しが席の頭上に出る(ニコ生実況は匿名主体なのでこれが無いと吹き出さない)。
      for (const speech of result.speeches) {
        const uid = String(speech.userId || '').trim();
        if (uid) spokenUserIds.add(uid);
      }
      // v0.1.757「読み飛ばし/音声だけ出て吹き出し出ない」根治(会議7体): showSpeechBubble は
      //   発言者の席(seatByKey)が無いと黙って return する。一方 voicePlayer は席非依存で必ず鳴る
      //   =非対称。v0.1.754 で rosterDriven 時に発言者の即着席を skip し席更新を rAF に分離したため、
      //   この同 tick の showSpeechBubble 時に新発言者の席が未作成→吹き出しドロップ(回帰)。
      //   対策: rosterDriven でも【発言者だけは showSpeechBubble の前に同期で在席へ touch し、席を
      //   同期 commit】して必ず座らせる(発言→即着席→吹き出し)。rAF コミットは通常更新用に残す。
      const nowMs = Date.now();
      if (rosterDriven) {
        for (const speech of result.speeches) {
          touchRoster(liveRoster, { userId: speech.userId, name: speech.name, text: speech.text }, nowMs);
        }
        baseRows = rosterToVenueRows(liveRoster);
        commitDisplay(baseRows); // 同期で renderSeats→seatByKey 更新(吹き出しが席を見つけられる)
      } else {
        // 非ストリーム(standalone/rollback)は従来どおり発言者マージで席を即更新。
        // v0.1.1111(X層): 鏡使用中は「鏡にまだ居ない発言者」を暫定として初見時刻を記録。
        //   60秒窓内は一致判定で「暫定」=説明済み(ライブ感の即着席と①一致を両立)。
        //   鏡に現れたら composeVenueBaseRows が記録を消す(=①と同化した)。
        if (laneMirrorPaintSnap) {
          const wallNow = Date.now();
          for (const speech of result.speeches) {
            const uid = String(speech.userId || '').trim();
            if (!uid) continue;
            const k = `u:${uid}`;
            if (!venueTransientFirstSeen.has(k)) venueTransientFirstSeen.set(k, wallNow);
          }
        }
        baseRows = mergeSpeakersIntoVenueRows(baseRows, result.speeches, nowMs);
        commitDisplay(baseRows);
      }
    }
    // Phase C(§3.2): コメント+1をメーターへ加算(件数ぶんまとめて1回のtickで進める=毎発言ごとに
    //   B/フェーズ計算をN回走らせない。減衰の連続性はmeterStateForの経過時間ベース計算で保たれる)。
    if (result.speeches.length > 0) {
      advancePhaseDirector({ addWeight: METER_WEIGHT_COMMENT * result.speeches.length });
    }
    for (const speech of result.speeches) {
      // 吹き出しは「しゃべった瞬間」に必ず出す。音声(VOICEVOX)とは切り離す。
      //   旧実装は読み上げON時に onPlayStart(声の再生開始)で吹き出していたが、VOICEVOXが
      //   無い/起動していないと声が鳴らず onPlayStart が呼ばれない→吹き出しが永久に出ない
      //   バグだった(ユーザー実機で発覚)。会場の既定は読み上げ自動ONなので踏みやすい。
      //   吹き出しは視覚要素なので音声の成否に依存させない。声は鳴るなら別途鳴る。
      const bubble = showSpeechBubble(speech);
      // v0.1.778: ギフト/広告コメントなら投げ主のサムネから中央映像へアイテムを投げる。
      maybeThrowGiftFromSpeech(speech);
      // 2026-07-06: 来場システムメッセージならパチンコ入賞演出(保留玉が入る)として投げる。
      maybeThrowArrivalFromSpeech(speech);
      if (voicePlayer.enabled) {
        // v0.1.771: 吹き出しを読み上げに連動。実際に鳴り始めたら speaking(消さない)、鳴り終えたら done。
        // v0.1.799「読み上げとコメントがずれる」根治: 床を鮮度ゲート(8秒)に合わせたので、鳴らずに
        //   捨てられた吹き出しが pending のまま8秒残らないよう、onDropped(再生では発火しない drop 専用
        //   シグナル)で resolved を通知し unvoiced(流速寿命)へ落とす。再生時は onAudioStart→speaking。
        //   onPlayStart(再生/破棄の両方で発火する曖昧信号)は配線しない(取りこぼし回避・従来どおり)。
        //   bubble が無い(空テキスト等で出なかった)場合は no-op で安全。
        voicePlayer.enqueue([{
          kind: 'comment',
          userId: speech.userId,
          nickname: speech.name,
          key: speech.key,
          text: speech.text,
          onAudioStart: bubble ? () => markBubbleSpeaking(bubble) : undefined,
          onAudioEnd: bubble ? () => markBubbleDone(bubble) : undefined,
          onDropped: bubble ? () => markBubbleResolved(bubble) : undefined
        }]);
      }
    }
  };

  // v0.1.754 ストリーム駆動在席: 在席 Map の変更を rAF で集約して席へ反映。コメント怒涛でも
  //   1フレーム1回の renderSeats に間引く(buildVenueSeating の prevSeatByKey で席は安定・軽い)。
  const scheduleRosterCommit = () => {
    if (rosterCommitRaf) return;
    const run = () => {
      rosterCommitRaf = 0;
      if (!open || !rosterDriven) return;
      pruneRoster(liveRoster, Date.now(), {
        windowMs: VENUE_ROSTER_WINDOW_MS,
        vipWindowMs: VENUE_ROSTER_VIP_WINDOW_MS,
        maxSeats: VENUE_ROSTER_MAX_SEATS
      });
      baseRows = rosterToVenueRows(liveRoster);
      commitDisplay(baseRows); // keep-last-good + renderSeats(prevSeatByKey で安定)
    };
    rosterCommitRaf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(run)
        : (run(), 0);
  };

  // v0.1.752 リアルタイム化: 録画側(content-entry.js persistCommentRows)が新着コメントを
  //   in-memory で即流すフック。storage 往復(~1.5秒のコアレッサ)を待たず吹き出す。
  //   commentNo を持つ行だけに絞る=後から storage 経路で来る同じコメントと venueSpeechKey が
  //   一致し seenKeys で dedup される(二重吹き出し防止)。会場が閉じている/別配信なら何もしない。
  //   throw しても録画パイプラインを壊さないよう、呼び出し側(content)で try/catch する。
  /**
   * @param {string} incomingLiveId
   * @param {ReadonlyArray<Record<string, unknown>>} rows
   */
  const onLiveComments = (incomingLiveId, rows) => {
    if (!open) return; // 閉じている間は何もしない(開いた時に pollSpeech が storage から再シード)
    const cur = liveIdFromPathname();
    if (!cur || cur !== incomingLiveId) return; // 配信切替中の遅延コールバックは捨てる
    if (speechLiveId !== cur) resetSpeechTracking(cur); // pollSpeech と同じ追従
    const feedRows = liveFeedSpeechRows(rows);
    if (feedRows.length === 0) return;
    processSpeechRows(feedRows); // 吹き出し/読み上げ(従来どおり)
    // v0.1.754: 在席は「通過した瞬間に touch」。storage 集計を待たない=3時間でも O(席数)。
    //   touchRoster が requireText/userId を内部で守る(匿名/本文空は席に入れない・v0.1.740)。
    if (!rosterDriven) return;
    const now = Date.now();
    for (const r of feedRows) touchRoster(liveRoster, r, now);
    scheduleRosterCommit();
  };

  const pollSpeech = async () => {
    if (!open || speechInFlight) return;
    // v0.1.753: 拡張更新後の古いタブは chrome.storage が全失敗する。先回りで検知して停止+案内。
    if (!hasVenueExtensionContext()) { markContextInvalidated(); return; }
    const liveId = liveIdFromPathname();
    if (!liveId) return;
    if (speechLiveId !== liveId) resetSpeechTracking(liveId);
    const generation = speechGeneration;
    const tailKey = tailStorageKey(liveId);
    const summaryKey = commentDbSummaryKey(liveId);
    // v0.1.1090: onChanged だけに頼らず、既存の定期ポーリングに相乗りして「会場を開いた時点で
    //   既に貯まっている集計ギフトpt」も拾う(保険・tail/summaryと同じ方針)。
    const giftPointsAggregateKey = officialGiftPointsAggregateStorageKey(liveId);
    // story-diag-realtime-sync §D-2(b): onChanged 欠落時の自己修復(15秒以上更新が無いときだけ
    //   1 key read)。担わない責務: 通常時の更新(それは onChanged が担う=毎tick read を増やさない)。
    const STORY_DIAG_PANEL_STALE_MS = 15_000;
    const needsPanelSummaryRefresh =
      Date.now() - _panelSummaryLastSeenAt > STORY_DIAG_PANEL_STALE_MS;
    const panelKey = needsPanelSummaryRefresh ? panelSummaryStorageKey(liveId) : '';
    speechInFlight = true;
    try {
      const bag = await chrome.storage.local.get(
        panelKey
          ? [tailKey, summaryKey, giftPointsAggregateKey, panelKey]
          : [tailKey, summaryKey, giftPointsAggregateKey]
      );
      if (
        !open ||
        generation !== speechGeneration ||
        speechLiveId !== liveId ||
        liveIdFromPathname() !== liveId
      ) {
        return;
      }
      const tailRows = Array.isArray(bag?.[tailKey]) ? bag[tailKey] : [];
      const summary = /** @type {{ recent?: unknown }|undefined} */ (bag?.[summaryKey]);
      const recentRows = Array.isArray(summary?.recent) ? summary.recent : [];
      const rows = tailRows.length > 0 ? tailRows : recentRows;
      processSpeechRows(rows);
      const aggregatePoints = bag?.[giftPointsAggregateKey];
      if (typeof aggregatePoints === 'number') handleGiftPointsAggregate(aggregatePoints);
      if (panelKey) {
        const panelSnap = bag?.[panelKey];
        if (panelSnap && typeof panelSnap === 'object') {
          panelSummarySnap = /** @type {Record<string, unknown>} */ (panelSnap);
          _panelSummaryLastSeenAt = Date.now();
          renderStoryDiagMirrorPanel();
        }
      }
    } catch (err) {
      // v0.1.753: context invalidated(拡張更新後の古いタブ)は恒久失敗→停止+案内。
      if (isContextInvalidatedError(err) || !hasVenueExtensionContext()) {
        markContextInvalidated();
        return;
      }
      // 一時的に storage を読めない場合は、基準を進めず次回の軽量ポーリングへ任せる。
    } finally {
      speechInFlight = false;
    }
  };

  const handleStorageChange = (/** @type {any} */ changes, /** @type {string} */ areaName) => {
    if (areaName !== 'local' || !open) return;
    const liveId = liveIdFromPathname();
    if (!liveId) return;
    const tailKey = tailStorageKey(liveId);
    const summaryKey = commentDbSummaryKey(liveId);
    // v0.1.756 リアルタイム完璧化(ユーザー洞察: コメビュは速い→同じ経路に): コメビュ comeview は
    //   onChanged の newValue を【その場で直接】処理して速い。会場はここで pollSpeech(非同期の
    //   storage.local.get 再取得=1往復の遅延)していた。tail が変わったら newValue を直接
    //   processSpeechRows へ渡し、再取得を省いて即座に吹き出し/読み上げする(コメビュと同経路)。
    if (changes[tailKey] && Array.isArray(changes[tailKey].newValue)) {
      processSpeechRows(/** @type {Array<Record<string, any>>} */ (changes[tailKey].newValue));
    } else if (changes[tailKey] || changes[summaryKey]) {
      // tail が無い(summary だけ等)時は従来どおり storage から読む保険。
      void pollSpeech();
    }
    // v0.1.778: NDGR構造化ギフトevent(nls_gift_events_<lv>)の新着を投げ演出の主トリガにする。
    //   ギフトコメント本文は来ないことがある(NDGR仕様・診断 gifts:0 でも giftPoints あり)ので、
    //   構造化 event(userId/itemName/point を直接持つ)を一次ソースにする方が確実。
    const giftEventsKey = `nls_gift_events_${liveId}`;
    if (changes[giftEventsKey] && Array.isArray(changes[giftEventsKey].newValue)) {
      handleNewGiftEvents(/** @type {Array<Record<string, any>>} */ (changes[giftEventsKey].newValue));
    }
    // v0.1.1090: 個別ギフトイベント欠落配信のフォールバック検知。content-entry.js が
    //   NDGR statistics 由来の合計ギフトptをこのキーへ書く(officialGiftPointsAggregateStorageKey)。
    //   個別イベントが一切来ない配信でも、集計だけは取れることがある(既知の仕様ムラ)。
    const giftPointsAggregateKey = officialGiftPointsAggregateStorageKey(liveId);
    if (changes[giftPointsAggregateKey] && typeof changes[giftPointsAggregateKey].newValue === 'number') {
      handleGiftPointsAggregate(/** @type {number} */ (changes[giftPointsAggregateKey].newValue));
    }
    // v0.1.1110 白円根治(鮮度側): プロファイルキャッシュが後から充実したら在席サムネへ即反映。
    //   onChanged の newValue を直接採用=追加 storage read ゼロ(大配信の輻輳を増やさない)。
    //   rosterDriven は次フレームで再commit(rAF集約・O(席数))=白円→実サムネが数百msで埋まる。
    //   standalone は次の30秒集計 or 次の描画で新キャッシュが効く(再描画トリガ不要)。
    const profChange = changes[KEY_USER_COMMENT_PROFILE_CACHE];
    if (
      profChange &&
      profChange.newValue &&
      typeof profChange.newValue === 'object' &&
      !Array.isArray(profChange.newValue)
    ) {
      profileAvatarMap = /** @type {Record<string, { avatarUrl?: unknown }>} */ (profChange.newValue);
      if (rosterDriven) scheduleRosterCommit();
    }
    // v0.1.1111 会場=①レーン鏡映: ①が publish した実paint鏡の新着を newValue 直採用(追加readゼロ)。
    //   rAF集約で再供給→再描画(①のpaint後 数百msで会場が同じ5段に同化する)。
    // ★v0.1.1300: この配信専用キー(v2)を優先。旧グローバルキーは互換のため後段で見る。
    //   ★v2 が来たら旧キーの変化は【無視】する: 旧キーは他配信の①も書くので、
    //     ここで採用すると別配信の鏡で上書きしてしまう(単一グローバルキーの害)。
    const _perLiveKey = laneMirrorKeyFor(liveId);
    const perLiveChange = _perLiveKey ? changes[_perLiveKey] : null;
    const mirrorChange = perLiveChange || changes[KEY_LANE_MIRROR];
    /*
     * ★v0.1.1317: 会場が鏡を「受け取れているか」を経路ごとに数える(会場が完全一致しない件)。
     *
     * ■ なぜ要るか
     *   書き手は毎秒 publish していて見送り0なのに、会場の鏡は実測 656秒古かった。
     *   ＝読み手が真因と確定済み(lanePublishSkipDiag.js の判断表)。しかし既存の計器は
     *   「鏡が何秒古いか」しか言わず、【なぜ更新が止まったか】を名指しできない。
     *   候補は (a)通知が来ない (b)キー不一致(liveId食い違い) (c)関所で却下 で、
     *   打ち手が正反対なので推測で直すと必ず外す。だから測る。
     *   ★特に (b): 会場の liveId は location.pathname 由来、書き手は popup が解決した値。
     */
    try {
      observeVenueMirrorChange(_venueMirrorIntake, {
        changedKeys: Object.keys(changes || {}),
        expectedKey: _perLiveKey || KEY_LANE_MIRROR,
        matched: Boolean(mirrorChange && mirrorChange.newValue)
      });
    } catch { /* 計器失敗は受け取りを止めない */ }
    if (mirrorChange && mirrorChange.newValue) {
      // ★受け入れ点2/2(onChanged): 関所を必ず通す(laneMirrorContract.js の契約)。
      const accepted = acceptLaneMirrorSnapshot(mirrorChange.newValue);
      try {
        observeVenueMirrorAccept(_venueMirrorIntake, {
          accepted: Boolean(accepted),
          nowMs: Date.now(),
          reason: accepted ? '' : (_laneMirrorSanitizeIssues || '関所が捨てた')
        });
      } catch { /* 計器失敗は受け取りを止めない */ }
      if (accepted) {
        laneMirrorSnap = accepted;
        scheduleLaneMirrorRecommit();
      }
    }
    // ①の実DOM受領証の新着(データ本体とは別キー=表示面固有だから分けている)。
    const _receiptChangeKey = laneReceiptKeyFor(liveId);
    const receiptChange = _receiptChangeKey ? changes[_receiptChangeKey] : null;
    if (receiptChange && receiptChange.newValue && typeof receiptChange.newValue === 'object') {
      _laneReceiptFromPopup = /** @type {any} */ (receiptChange.newValue);
    }
    const storyDiagChange = changes[KEY_STORY_DIAG_MIRROR];
    if (storyDiagChange && storyDiagChange.newValue && typeof storyDiagChange.newValue === 'object') {
      storyDiagMirrorSnap = /** @type {Record<string, unknown>} */ (storyDiagChange.newValue);
      renderStoryDiagMirrorPanel();
    }
    // ── 記録件数の正本購読(v0.1.117x・story-diag-realtime-sync設計 §C-2) ──────────────
    // 入力の出どころ: nls_panel_summary_<lv>。content-entry.js が取込イベント+min-gap 2秒で
    //   popup非依存に書く recordedCount(= recordedCountForDisplay(lid)・per-live単調化済み・
    //   AGENTS.md §12.8 の表示正本)。
    // 出力の使われ方: renderStoryDiagMirrorPanel → resolveStoryDiagTotal が KEY_STORY_DIAG_MIRROR
    //   由来の total(①popupのarr.length系)より優先して「記録している応援コメント N 件です」の N になる。
    // 担う責務: newValue 直採用(追加readゼロ)でのキャッシュ更新と再描画キック。
    // 担わない責務: 集計(contentが正本)・内訳(withUid等は鏡=①popupが唯一の計算者)・
    //   単調化(storyDiagMonotonic が担う)・保険read(既存ポーリング相乗り側が担う)。
    // ①popupが閉じていてもこの経路だけで件数は動き続ける=本設計の根治点。
    const panelChange = changes[panelSummaryStorageKey(liveId)];
    if (panelChange && panelChange.newValue && typeof panelChange.newValue === 'object') {
      panelSummarySnap = /** @type {Record<string, unknown>} */ (panelChange.newValue);
      _panelSummaryLastSeenAt = Date.now();
      renderStoryDiagMirrorPanel();
    }
    // v0.1.741 安定化: 参加者データはコメントチャンク(nls_cchunk_<lv>_*)に入る。
    //   以前は summaryKey 変化時しか再集計せず、チャンクだけ更新された時に会場が古いまま/空に
    //   なる(=開いた瞬間0人で30秒待ち)再現性の低さがあった。チャンク/インデックス/サマリの
    //   いずれかが変わったら再集計し、コメントが書かれ次第ほぼ即座に会場へ反映する。
    // v0.1.754: ストリーム駆動時は在席を onLiveComments が更新する=storage チャンク変化での
    //   全集計(O(N))は回さない(これが3時間で重くなる元凶だった)。standalone/rollback のみ従来の再集計。
    if (rosterDriven) return;
    const idxKey = chunkIndexKey(liveId);
    const chunkPrefix = `nls_cchunk_${liveId}`;
    let chunkChanged = false;
    for (const k in changes) {
      if (k === idxKey || k === summaryKey || (k.indexOf(chunkPrefix) === 0)) {
        chunkChanged = true;
        break;
      }
    }
    if (chunkChanged) void aggregateParticipants();
  };

  const stopSpeechPolling = () => {
    if (!speechTimer) return;
    clearInterval(speechTimer);
    speechTimer = 0;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    }
  };

  // v0.1.753: 拡張更新後の古いタブ(Extension context invalidated)で、会場が黙って凍結する
  //   のをやめ、ユーザーに「ページ再読み込み」を促す。chrome.* は全失敗するので集計/発話/群衆の
  //   全ループを止め(無効コンテキストへの無限リトライ停止)、ヘッダーに案内を1度だけ出す。
  //   復旧は content script の再起動が必要=ページ再読込のみ(この古いタブからは自己回復不能)。
  let _contextInvalidated = false;
  const markContextInvalidated = () => {
    if (_contextInvalidated) return; // 1度だけ
    _contextInvalidated = true;
    try { stopAggregation(); } catch { /* no-op */ }
    try { stopSpeechPolling(); } catch { /* no-op */ }
    try { stopCrowdMotion(); } catch { /* no-op */ }
    // v0.1.1080: Phase C の受動tick(BGMダック+フェーズ進行)も他の会場タイマーと同型で止める。
    if (bgmPhaseTickTimer) { clearInterval(bgmPhaseTickTimer); bgmPhaseTickTimer = 0; }
    try {
      title.textContent = '⚠ 拡張が更新されました。ページを再読み込み(F5)してください';
      title.style.color = '#ffcf66';
    } catch { /* no-op */ }
  };

  const startSpeechPolling = () => {
    if (speechTimer) return;
    void pollSpeech();
    speechTimer = window.setInterval(() => {
      void pollSpeech();
    }, SPEECH_INTERVAL_MS);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }
  };

  /** @param {KeyboardEvent} event */
  const onEscapeKey = (event) => {
    if (event.key !== 'Escape' || !open) return;
    // v0.1.738: 診断パネルが開いていれば、まずそれだけ閉じる(会場ごと閉じない)。
    //   × が反応しない時の確実な代替手段(ユーザー報告対策)。
    if (!rosterPanel.hidden) {
      toggleRosterPanel(false);
      return;
    }
    userChangedOpen = true;
    setOpen(false, true);
  };

  const addEscapeListener = () => {
    if (escapeListening) return;
    window.addEventListener('keydown', onEscapeKey);
    escapeListening = true;
  };

  const removeEscapeListener = () => {
    if (!escapeListening) return;
    window.removeEventListener('keydown', onEscapeKey);
    escapeListening = false;
  };

  // リサイズ/スクロールで席の座標が変わったら吹き出しを席頭上へ追従(rAF で間引き)。
  let reflowRaf = 0;
  let reflowListening = false;
  const onBubbleReflow = () => {
    if (reflowRaf) return;
    reflowRaf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => {
            reflowRaf = 0;
            repositionAllBubbles();
          })
        : 0;
    if (!reflowRaf) repositionAllBubbles();
  };
  const addBubbleReflowListener = () => {
    if (reflowListening) return;
    window.addEventListener('resize', onBubbleReflow);
    window.addEventListener('scroll', onBubbleReflow, true);
    reflowListening = true;
  };
  const removeBubbleReflowListener = () => {
    if (!reflowListening) return;
    window.removeEventListener('resize', onBubbleReflow);
    window.removeEventListener('scroll', onBubbleReflow, true);
    if (reflowRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(reflowRaf);
    reflowRaf = 0;
    reflowListening = false;
  };

  /**
   * @param {boolean} nextOpen
   * @param {boolean} persist
   */
  const setOpen = (nextOpen, persist) => {
    open = nextOpen === true;
    root.classList.toggle('nlsb-is-open', open);
    // v0.1.1115 ①POP遮蔽: 会場open中だけ document ルートに印を付け、CSS(VENUE_CSS末尾)が
    //   ①POPホスト(#nls-inline-popup-host)を visibility:hidden にする。open→close 往復で
    //   toggle が印を外す=style残骸ゼロ。ホストが無いページ(standalone会場タブ)は自然に no-op。
    try {
      document.documentElement.classList.toggle('nlsb-venue-open', open);
    } catch { /* documentElement 不在環境でも会場は止めない */ }
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    stage.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      try { noteVenueOpened(_openLatency, Date.now()); } catch { /* 計器失敗は会場を止めない */ }
      addEscapeListener();
      addBubbleReflowListener();
      // 3キャラ常駐: 集計を待たず先に描く=開いた瞬間から必ず誰かが居る(無人に見せない)。
      renderResidents();
      renderCharFrame(); // v0.1.777 額縁フレーム(四辺を3キャラで囲む)
      startAggregation();
      startSpeechPolling();
    } else {
      removeEscapeListener();
      removeBubbleReflowListener();
      stopAggregation();
      stopSpeechPolling();
      stopCrowdMotion();
      resetSpeechTracking();
      // ★v0.1.1237: 閉じたら DOM と集計データを解放する(メモリリーク根治)。
      //   実測(ブラウザ): 会場を開くとヒープ +14.9MB(48.2→63.1MB)。従来はタイマーを
      //   止めるだけで clearDisplay を呼ばず、228枚のタイル・画像・集計が残り続けていた。
      //   clearDisplay は hasRenderedNonEmpty=false にするので、次に開けば再描画される
      //   (配信切替時 :5408 と同じ経路)。
      clearDisplay();
      aggregatedChunkSeqs = [];
      aggregatedCandidates = [];
      spokenUserIds.clear();
      laneMirrorPaintSnap = null;
      venueTransientFirstSeen.clear();
    }
    if (persist) {
      // ユーザー要望により状態を復元しなくなったため、保存も無効化する
      // void chrome.storage.local.set({ [OPEN_STORAGE_KEY]: open }).catch(() => {});
    }
  };

  toggle.addEventListener('click', () => {
    userChangedOpen = true;
    setOpen(!open, true);
  });
  close.addEventListener('click', () => {
    // v0.1.770: standalone(別窓化した会場タブ)はタブごと閉じる。インライン版は会場を畳むだけ。
    if (isStandalone) {
      // まず集計/再生を止めてから閉じる(pagehide でも止まるが先に止めて取りこぼし防止)。
      stopAggregation();
      stopSpeechPolling();
      stopCrowdMotion();
      try {
        window.close();
      } catch {
        /* window.close が拒否される環境(稀)では会場だけ畳んでフォールバック */
      }
      // window.close が無視された場合の保険: 会場ステージを閉じる。
      userChangedOpen = true;
      setOpen(false, false);
      return;
    }
    userChangedOpen = true;
    setOpen(false, true);
  });
  window.addEventListener(
    'pagehide',
    () => {
      stopAggregation();
      stopSpeechPolling();
      stopCrowdMotion();
      resetSpeechTracking();
      removeEscapeListener();
    },
    { once: true }
  );

  // v0.1.773 長時間ラグ対策(会議): タブが裏に回ると setTimeout/合成がスロットリングされ、
  //   復帰時に古い読み上げ backlog が溜まったまま=「今」から大きく遅れて喋り出す。可視復帰時に
  //   待機中の読み上げキューを一掃して「今」へリセットする(再生中の1本は止めない)。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!open || !voicePlayer.enabled) return;
    try { voicePlayer.flushPendingQueue(); } catch { /* no-op */ }
  });

  if (isStandalone) {
    setOpen(true, false);
  } else {
    // ユーザー要望: 「開いた瞬間会場モードになるのやめたほういいかも。過去のなにかをひきずるような」
    // ページロード時は常に閉じた状態からスタートし、意図して開く形にする。
    setOpen(false, false);
  }

  // v0.1.752: 録画側(content-entry.js)が新着コメントを in-memory で即流すための API を返す。
  //   watch タブの content script は同一コンテキストなので storage 往復を待たず吹き出せる。
  //   別コンテキストの standalone venue.html は呼ばれず、従来どおり pollSpeech のみで動く(無害)。
  return { onLiveComments };
}

export function mountVenueStandalone(/** @type {string} */ liveId) {
  _forcedLiveId = liveId;
  mountVenueBarButton({ standalone: true });
}
