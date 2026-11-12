// @ts-nocheck — VoicePlayer は依存注入(deps)クラス。型は呼び出し側の配線で担保。
//   comeview-entry.js と同じ方針(@ts-nocheck)。ロジックは変更しない。
import { buildVoiceReadingText, buildMergedVoiceText } from './voicevoxClient.js';
import { voiceEngineDeviceNote } from './voiceLoadingState.js';
import { isVoiceItemStale } from './voiceAgeGate.js';
import { classifyVoiceSynthNull } from './voiceSynthFailure.js';
import {
  KEY_VOICE_ASSIGNMENTS,
  KEY_VOICE_READ_NAME_ENABLED,
  KEY_VOICE_READING_ENABLED
} from './voiceKeys.js';
import { classifyVoiceSynthFailureReason } from './voiceSynthFailureReason.js';
import { startVoiceWarmup } from './voiceWarmup.js';
import { isStreamedVoice, shouldStreamVoice } from './voiceStream.js';
import { isWeakVoicePc } from './voiceNarrowing.js';
import {
  createVoiceOverloadState,
  noteVoiceSynthOutcome,
  resolveVoiceOverloadTimeouts,
  capVoiceSynthDepthForOverload
} from './voiceEngineOverload.js';
import { observeVoicePlayback } from './voicePlaybackQuality.js';
import {
  LIGHT_VOICE_MAX_CHARS,
  LIGHT_VOICE_PROBE_TEXT,
  lightVoiceToneFor,
  shouldProbeVoicevox,
  shouldUseLightVoice
} from './voiceLightFallback.js';
import { createLightSpeaker } from './voiceLightSpeaker.js';
import { createVoiceClipCache, voiceClipKey } from './voiceClipCache.js';
import {
  findVoiceChorusHost,
  isVoiceChorusEnabled,
  joinVoiceChorus,
  KEY_VOICE_CHORUS_ENABLED,
  planVoiceChorusOverlays
} from './voiceChorus.js';
import { COMEVIEW_NG_STORAGE_KEY, isVoiceItemNgMuted, voiceNgKeySet } from './voiceNgMute.js';
import {
  capVoiceMaxCharsByBoost,
  computeVoiceCongestion,
  computeVoiceE2eAverage,
  computeVoicePlaybackRate,
  mergeRepeatedVoiceItem,
  pushVoiceQueue,
  resolveVoiceSynthDepth,
  VOICE_PLAYBACK_RATE_MAX
} from './voiceReadQueue.js';
// 2026-07-24(段階1=apply・council-fable設計venue-bubble-voice-realtime-max-DESIGN.md): 件数
//   ゲート実効上限を処理時間EMAから算出し、pushVoiceQueueのmaxへ実適用する(shadow実測で
//   effectiveQueueMax<8が実配信で起きることを確認済み)。
// 2026-07-28(段階0=shadow・council-fable設計voice-lag-decomposition-DESIGN.md): 体感遅延の
//   真因診断(合成待ち/準備待ち/実再生の3分解+需要/供給+判定)。挙動には一切介入しない印字のみ。
import {
  updateVoiceServiceTimeEma, resolveVoiceQueueMax, stepVoiceQueueMax,
  updateVoiceEventRatioEma, foldVoiceArrivalWindow, computeVoiceLagVerdict,
  computeSustainedPressureBoost, mergeVoiceSpeedBoost, computeBacklogCatchUpBoost,
  createVoicePaceState, noteVoicePaceArrival, noteVoicePacePlayed, computeVoicePaceFloor,
  resolveVoiceQueueMaxByChars, estimateVoiceStartDelayMs
} from './voiceLagBudget.js';
import {
  createVoiceSynthTracker, foldVoiceStageEma, measureVoiceGapMs, measureWavAudioMs, recordVoiceE2eSample, recordVoiceStreamDone, recordVoiceSynthStage,
  resetVoiceWarmMeasure
} from './voiceStageTiming.js';
import {
  applyVoiceVolumeToWav, KEY_VOICE_VOLUME_PERCENT, measureVoiceWavLevel, normalizeVoiceVolumePercent, VOICE_VOLUME_DEFAULT, voiceTargetPeak
} from './voiceVolume.js';
import { decideVoiceGpuTip, decideVoiceLagNotice } from './voiceLagNotice.js';
import {
  classifyVoiceImportance,
  createVoiceFirstSpeakerState,
  noteVoiceSpeakerInLive,
  shouldSkipVoiceWhenBusy,
  VOICE_BUSY_QUEUE_MIN,
  voicePriorityForImportance
} from './voiceBusyPriority.js';
import {
  KEY_VOICE_NARROW_MODE, KEY_VOICE_WEAK_PC, prepareVoiceStyleIds, rememberWeakVoicePc, forgetWeakVoicePcIfFast
} from './voiceNarrowing.js';

/**
 * ★v0.1.1326: 生存確認の再試行バックオフ(ms)。初回失敗後にこの間隔で最大3回試す。
 *
 * なぜ増やしたか: 会場モードは content script → MV3 SW プロキシ経由で、SW のコールド
 *   起床が既定タイムアウト(5000ms)に間に合わないことがある。従来は再試行1回だけで
 *   諦めて「VOICEVOXが見つかりません」を出し、ボタンが OFF に戻っていた。
 *   VOICEVOX が本当に未起動なら3回とも即座に refused で返るので、待ち時間は増えない
 *   (待つのは「応答が遅いだけ」のときだけ=直したい状況とコストが一致する)。
 */
export const VOICE_ALIVE_RETRY_BACKOFF_MS = Object.freeze([0, 500, 1500]);
/** つながっていないまま ON のとき、エンジンを探し直す間隔。0 なら探さない。 */
export const VOICE_ENGINE_RETRY_MS = 8000;

/**
 * ★v0.1.1327: 音声解錠(audio unlock)用の無音 WAV。
 *   44バイトのヘッダのみ(データ0サンプル)= 実質無音・即座に終わる。
 *   data: URI なので外部取得なし(CWS 審査の外部リソース規約に抵触しない)。
 */
export const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

export class VoicePlayer {
  constructor(deps = {}) {
    this.storage = deps.storage;
    this.onToggle = deps.onToggle || (() => {});
    this.onStatus = deps.onStatus || (() => {});
    // v0.1.770: VOICEVOX 起動待ちの「楽しいローディング」用。状態を渡し、表示層が遅延ガード
    //   付きで演出する(reference_voice_loading_delight_meeting_2026-06-16.md)。未配線なら no-op。
    //   onStatus(テキスト)も従来どおり呼ぶので既存表示は壊れない。
    this.onLoadingState = deps.onLoadingState || (() => {});
    this.onSkip = deps.onSkip || (() => {});
    /** P5: 遅れが大きいときの一言(空文字=消す)。判定は voiceLagNotice.js。 */
    this.onLagNotice = deps.onLagNotice || (() => {});
    /** 2026-11-01: GPU の案内(遅れの一言とは別の行・voiceLagNotice.decideVoiceGpuTip)。 */
    this.onGpuTip = deps.onGpuTip || (() => {});
    this._gpuTipText = '';
    this._lagNoticeShown = false;
    this.isObsMode = deps.isObsMode || (() => false);
    this.audioConstructor = deps.audioConstructor;
    /*
     * ★v0.1.1327: 音声解錠(無音1回再生)専用のコンストラクタ。
     *   既定は実ブラウザの Audio。audioConstructor と分けるのは、呼び出し側/テストが
     *   audioConstructor の生成回数を「読み上げの再生回数」として数えているため
     *   (ここを共用すると計測が1つズレる=実際に既存テストが赤くなった)。
     */
    this.unlockAudioConstructor =
      deps.unlockAudioConstructor ||
      (typeof globalThis !== 'undefined' && typeof globalThis.Audio === 'function'
        ? globalThis.Audio
        : null);
    this.createObjectURL = deps.createObjectURL;
    this.revokeObjectURL = deps.revokeObjectURL;
    this.fetchVoicevoxAlive = deps.fetchVoicevoxAlive;
    /*
     * ★v0.1.1326: 理由付きの生存確認。未配線(既存の呼び出し側・テスト)なら
     *   従来の fetchVoicevoxAlive を包んで {ok, reason:'refused'} に均す=後方互換。
     *   reason が要るのは表示だけなので、未配線でも挙動は壊れない。
     */
    this.probeVoicevoxAlive =
      deps.probeVoicevoxAlive ||
      (async () => {
        const ok = await this.fetchVoicevoxAlive();
        return { ok: !!ok, reason: ok ? '' : 'refused' };
      });
    this.fetchVoiceStyleIds = deps.fetchVoiceStyleIds;
    /** P3: 声のモデルの先読み(/initialize_speaker)。無ければ先読みしない。 */
    this.initVoiceSpeaker = deps.initVoiceSpeaker || null;
    /** 2026-10-26: 声を使う前に温める(voiceWarmup.js)。fetchSynthesizeVoice と同じものを渡す。無ければ何もしない。 */
    this.voiceWarmup = deps.voiceWarmup || null;
    /**
     * 2026-10-26: 声を少しずつ受け取って鳴らす(voiceStream.js)。両方そろったときだけ使う。
     *   probeVoiceStreaming: エンジンが対応しているか / createStreamedAudio: StreamedVoice を鳴らす Audio もどき
     */
    this.probeVoiceStreaming = deps.probeVoiceStreaming || null;
    /** エンジンが GPU を使えるか(遅れの一言に GPU の案内を添えるため・voiceLagNotice.js)。 */
    this.probeVoiceGpu = deps.probeVoiceGpu || null;
    /** @type {boolean|null} */
    this._gpuCapable = null;
    this.createStreamedAudio = deps.createStreamedAudio || null;
    this._streamSupported = false;
    /** 遅い PC と分かったら、この ON の間は覚えておく(少しずつ読むと合成の計器が速く見えるため)。 */
    this._slowEngine = false;
    this._weakPcState = { saved: false };
    /** 2026-10-31: 合成の時間切れが続いたら「混雑中」=1件ずつ・長めに待つ(voiceEngineOverload.js)。 */
    this._overload = createVoiceOverloadState();
    /** 2026-11-03: VOICEVOX に頼んでまだ返ってきていない合成の数(混雑中は1件ずつ頼むため)。 */
    this._synthInFlight = 0;
    /**
     * 2026-11-03: VOICEVOX が追いつかない間だけ使う軽い声(voiceLightFallback.js)。
     *   既定はブラウザの読み上げ(Windows の声)。無い環境では null=VOICEVOX だけで読む。
     */
    this.lightSpeaker = deps.lightSpeaker === undefined ? createLightSpeaker() : deps.lightSpeaker;
    /** 'auto'(既定)か 'off'(VOICEVOX だけで読む)。 */
    this.lightVoiceSetting = 'auto';
    this._lightProbeAt = 0;
    /** 軽い声で続けて読めなかった回数。3回続いたらこの ON の間は使わない(無音のまま切り替え続けないため)。 */
    this._lightFailStreak = 0;
    /**
     * 2026-11-09: PC の声が Chrome に止められている('not-allowed'=読み込み直したあと未クリック)。
     *   この間は「配信ページを1回クリックして」と画面に出し、クリックされたら数え直して再び試す。
     */
    this._lightBlocked = false;
    this._activationListening = false;
    /** クリックを待つ相手(既定はこのページ・試験では差し替える)。 */
    this._activationTarget = deps.activationTarget || globalThis;
    this.fetchSynthesizeVoice = deps.fetchSynthesizeVoice;
    this.resolveVoice = deps.resolveVoice;

    this.enabled = false;
    /** ボタンに出す意思。エンジンが居なくても ON のまま(enabled は声を出してよいときだけ true)。 */
    this.readingWanted = false;
    this._intentSerial = 0;
    this._connectInFlight = false;
    /** @type {Array<() => void>} */
    this._connectWaiters = [];
    /** @type {Set<AbortController>} */
    this._synthAborts = new Set();
    this._engineRetryTimer = 0;
    this.engineRetryMs = Number.isFinite(Number(deps.engineRetryMs)) ? Number(deps.engineRetryMs) : VOICE_ENGINE_RETRY_MS;
    this._deviceNote = '';
    this.readNameEnabled = false;
    /** v0.1.1812: コメビュで NG にした人(読まない)。 */
    this.ngKeys = new Set();
    this.toggleBusy = false;
    this.styleIds = [];
    this.assignments = {};
    this.queue = [];
    // v0.1.768: 先読み合成を【深さ1→最大3】に。単一スロット this.prefetch から、
    //   item オブジェクトをキーに「合成中の WAV Promise」を持つ Map に拡張。
    //   再生中に N+1 だけでなく N+2/N+3 も先行合成し、フラッド時に合成を遊ばせない。
    this.prefetches = new Map();
    // 2026-11-12: 声のつくり置き(voiceClipCache.js)。短い文はその人の声で一度作ったら覚え、
    //   次からは合成せずに鳴らす(混雑中も「大事でない」短文を読める)。
    this._clipCache = deps.clipCache || createVoiceClipCache();
    // 2026-11-12: 合唱(voiceChorus.js)。同じ言葉が何人からも来たら、覚えた声を重ねて1回で鳴らす(既定 ON)。
    this.chorusEnabled = true;
    /** @type {Set<any>} */
    this._chorusAudios = new Set();
    /** @type {Set<any>} */
    this._chorusTimers = new Set();
    /** 合唱で重ねられなかった(声を覚えていない)仲間。空いた時に1人ずつ作る。 @type {Array<{ key: string, text: string, voice: any }>} */
    this._chorusPending = [];
    this.playing = false;
    this.generation = 0;
    this.stopCurrent = null;
    /** @type {{ item: any, shiftAt: number, playAt: number, expectedMs: number, chars: number, audioStarted: boolean, cancelled: boolean } | null} */
    this._current = null;
    this.skipTimer = null;
    // v0.1.1065: 会場読み上げの計器。comeview(KEY_VOICE_DIAG)と同形のカウンタを持ち、
    //   onDiag(注入)経由で呼び出し元がstorageへ書く。従来この経路は完全に無計器で、
    //   状態速報の「会場読み上げ」行が別経路(comeview)の化石を表示し続けていた。
    this.onDiag = deps.onDiag || (() => {});
    // 2026-07-24 会場読み上げの件数ゲート実効上限state(council-fable設計・段階1=apply)。
    //   serviceTimeEma=1件あたり処理時間のEMA、effectiveQueueMax=そこから計算した実効上限
    //   (pushVoiceQueueのmaxに実適用・床2〜天井8)、growStreak=復帰ヒステリシスの連続カウンタ。
    this._serviceTimeEmaMs = -1;
    /** v0.1.1797: 届く間隔と声の長さ(追いついた後も保つ早口の床)。 */
    this._paceState = createVoicePaceState();
    this._effectiveQueueMax = 8;
    this._growStreak = 0;
    // 2026-07-28(段階0=shadow・council-fable設計voice-lag-decomposition-DESIGN.md): 体感遅延
    //   真因診断の内部state。印字のみ・挙動には一切使わない(DESIGN.md鉄則: 判定で挙動を変えない)。
    this._synthWaitEmaMs = -1;
    this._playPrepEmaMs = -1;
    this._playbackEmaMs = -1;
    this._expectedPlayEmaMs = -1;
    this._arrivalWindowState = null;
    // v0.1.1861: 「その配信で初めてのコメント」を覚える(混雑時は大事なものだけ読む)。
    this._firstSpeakerState = createVoiceFirstSpeakerState();
    this._dropCountGateTotal = 0;
    this._dropHeadStaleTotal = 0;
    this._dropSweepStaleTotal = 0;
    this._voicedRecentRatioEma = -1;
    this._capLagTicks = 0;
    this._diagBornAt = Date.now();
    this._spokenSampleCount = 0;
    this.diag = {
      enabled: false, queueNow: 0, queueMax: 0, spokenTotal: 0, staleDropTotal: 0,
      playbackTimeoutTotal: 0, lastSpokenBase: 0, lastSynthMs: -1, lastDepth: 0,
      lastSpeedBoost: 0, lastPhase: '', lastPhaseAt: 0,
      // v0.1.1088計器(voice-tempo-realtime-SYNTHESIS §3 Phase 1): 「到着→発声」の体感遅延。
      //   lastE2eMs=直近1件・e2eAvgMs=EMA(係数0.3・窓バッファ無し=メモリ有界)。
      //   mergeTotal=mergeRepeatedVoiceItem で吸収した累計(統合が効いているかの計器)。
      lastE2eMs: -1, e2eAvgMs: -1, mergeTotal: 0,
      // 2026-11-12計器(声のつくり置き): clipHitTotal=合成せずに覚えた声で鳴らす準備をした件数、
      //   clipBusyKeepTotal=混雑で読まない所を覚えた声があるので読んだ件数、clipStoreTotal=覚えた件数、
      //   clipBytes/clipKeys=今覚えている量(上限 8MB)。
      clipHitTotal: 0, clipBusyKeepTotal: 0, clipStoreTotal: 0, clipBytes: 0, clipKeys: 0,
      // 2026-11-12計器(合唱): chorusJoinTotal=合唱に加わった件数、chorusPlayTotal=声を重ねて鳴らした回数、
      //   chorusOverlayTotal=重ねた声の数、chorusLearnTotal=空いている時に作っておいた声の数。
      chorusJoinTotal: 0, chorusPlayTotal: 0, chorusOverlayTotal: 0, chorusLearnTotal: 0,
      // 2026-07-24 計器(段階1=apply・council-fable設計venue-bubble-voice-realtime-max-DESIGN.md):
      //   serviceTimeEmaMs=1件あたり処理時間の実測EMA、effectiveQueueMax=そこから算出した
      //   実効上限(pushVoiceQueueのmaxに実適用)、rateClampTotal=playbackRateが上限1.35で
      //   飽和した回数、voicedRatio=spokenTotal/(spokenTotal+staleDropTotal)(生存者バイアスの緑を潰す指標)。
      serviceTimeEmaMs: -1, effectiveQueueMax: 8, rateClampTotal: 0, voicedRatio: -1,
      // 2026-07-28計器(段階0=shadow・council-fable設計voice-lag-decomposition-DESIGN.md):
      //   serviceTimeの3分解(合成待ち/準備待ち/実再生/期待再生時間)+drop原因の分別+需要/供給+判定。
      synthWaitEmaMs: -1, playPrepEmaMs: -1, playbackEmaMs: -1, expectedPlayEmaMs: -1,
      arrivalPerMin: -1, voicedRecentRatio: -1,
      // v0.1.1222計器: 持続過負荷ブースト(pressure由来)。lastSustainedBoost=直近の上乗せ値、
      //   sustainedBoostTotal=キュー長では出せない速度を実際に足した累計。
      //   ★「速くしたのに読める数が増えたか」を後から検算するための計器(効果の裏取り用)。
      lastSustainedBoost: 0, sustainedBoostTotal: 0, lastBacklogBoost: 0, lastPaceFloor: 0, queueMaxByChars: 0,
      dropCountGateTotal: 0, dropHeadStaleTotal: 0, dropSweepStaleTotal: 0,
      // 2026-08-01計器(v0.1.1213): 合成が null で返った件を数える。
      //   実配信(lv351072048)で「需要52.2/分・読めた約6件・間引き12件」=**約34件がどの計器にも
      //   乗っていない**帳尻の穴が見つかった。真犯人は下の !wav 分岐が spokenTotal も drop も
      //   増やさずに continue していたこと(voicevoxClient は 8000ms タイムアウトで null を返す)。
      //   これが無いと「なぜ読まれないか」が原理的に分からない。
      synthNullTotal: 0, synthNullNearTimeout: 0,
      // v0.1.1224計器: 合成失敗の【理由別】内訳。従来は6通りの失敗が全部 null に畳まれ、
      //   実配信の「合成失敗17件(その他16)」の正体を誰も答えられなかった。
      //   原因ごとに打つ手が正反対(接続不能=拡張では直せない / HTTP拒否=絞れば直る)。
      synthFailReasons: {},
      upstreamEmaMs: -1, lastUpstreamMs: -1, queueWaitEmaMs: -1, engineWaitEmaMs: -1,
      audioQueryEmaMs: -1, synthesisEmaMs: -1, warmSynthEmaMs: -1,
      coldSynthTotal: 0, coldSynthMaxMs: 0, lastColdSynthMs: -1,
      speakerInitTotal: 0, speakerInitMaxMs: 0, voiceBorrowTotal: 0, e2eSampleTotal: 0, e2eSumMsTotal: 0, e2eMaxMs: 0, bgInitTotal: 0, bgInitMaxMs: 0, bgInitYieldTotal: 0, readerYieldTotal: 0,
      streamTotal: 0, streamFirstAudioEmaMs: -1, warmSynthSamples: 0, contendedSynthTotal: 0,
      warmSynthRtfPermille: -1, warmRtfSamples: 0,
      playCheckedTotal: 0, playCutShortTotal: 0, playStallTotal: 0, streamUnderrunTotal: 0, streamUnderrunMaxMs: 0,
      playErrorAfterStartTotal: 0, clipItemTotal: 0, quietItemTotal: 0, streamGainDropTotal: 0,
      outPeakEmaPermille: -1, outRmsDbMin: 999, outRmsDbMax: -999, lastOutRmsDb: 0, lastPlayIssue: '', venueGate: '',
      lagVerdict: '', diagBornAt: this._diagBornAt
    };
    // 2026-10-22計器(P1): 合成1件ごとのエンジン待ち・初めての声を測る(印字専用)。
    this._synthTracker = createVoiceSynthTracker();
    // 2026-10-22(P2): 読み上げ音量(%)。ポップアップのスライダーが storage へ書き、変わった瞬間に効く。
    this.volumePercent = VOICE_VOLUME_DEFAULT;
    /** chrome.storage.onChanged 互換(addListener を持つもの)。無ければ起動時の値のまま。 */
    this.storageOnChanged = deps.storageOnChanged || null;
  }

  _emitDiag() {
    this.diag.enabled = this.enabled;
    this.diag.queueNow = this.queue.length;
    if (this.queue.length > this.diag.queueMax) this.diag.queueMax = this.queue.length;
    try { this.onDiag(this.diag); } catch { /* 計器は本体の再生を妨げない */ }
  }

  // ★v0.1.1506: キー文字列の正本は voiceKeys.js。getter の【形は残し】戻り値だけ委譲する
  //   (comeview-entry.js と二重定義になっていた。片方だけ直す事故を構造的に無くす)。
  get VOICE_READING_ENABLED_KEY() { return KEY_VOICE_READING_ENABLED; }
  get VOICE_ASSIGNMENTS_KEY() { return KEY_VOICE_ASSIGNMENTS; }
  get VOICE_READ_NAME_KEY() { return KEY_VOICE_READ_NAME_ENABLED; }

  /**
   * @param {{ forceOn?: boolean }} [opts]
   *   forceOn=true なら保存状態に関わらず読み上げを自動 ON にする(会場モードを開いたら
   *   「いきなり読み上げ上がる」ユーザー期待のため。comeview の ?voice=1 相当)。
   *   このとき persist:true で storage にも ON を残し、以後も復元される。
   */
  async initialize(opts = {}) {
    if (this.isObsMode()) return;
    let bag = {};
    try {
      if (this.storage) {
        bag = await this.storage.get([
          this.VOICE_READING_ENABLED_KEY,
          this.VOICE_ASSIGNMENTS_KEY,
          this.VOICE_READ_NAME_KEY,
          KEY_VOICE_VOLUME_PERCENT,
          COMEVIEW_NG_STORAGE_KEY,
          KEY_VOICE_CHORUS_ENABLED
        ]);
      }
    } catch {
      bag = {};
    }
    const rawAssignments = bag[this.VOICE_ASSIGNMENTS_KEY];
    this.assignments = (!rawAssignments || typeof rawAssignments !== 'object' || Array.isArray(rawAssignments)) ? {} : rawAssignments;
    this.readNameEnabled = bag[this.VOICE_READ_NAME_KEY] === true;
    this.volumePercent = normalizeVoiceVolumePercent(bag[KEY_VOICE_VOLUME_PERCENT]);
    this.ngKeys = voiceNgKeySet(bag[COMEVIEW_NG_STORAGE_KEY]);
    this.chorusEnabled = isVoiceChorusEnabled(bag[KEY_VOICE_CHORUS_ENABLED]);
    this._watchVolumeSetting();

    this._emitToggle();

    const forceOn = opts.forceOn === true;
    if (forceOn || bag[this.VOICE_READING_ENABLED_KEY] === true) {
      // forceOn のときは storage にも残す(persist:true)。保存復元のときは false(既存挙動維持)。
      await this.enable({ persist: forceOn });
    }
  }

  /** ポップアップで音量が変わったら、次に鳴らす声から反映する(1回だけ購読)。コメビュの NG の変更も同じ口で拾う。 */
  _watchVolumeSetting() {
    const ev = this.storageOnChanged;
    if (this._volumeWatched || !ev || typeof ev.addListener !== 'function') return;
    this._volumeWatched = true;
    try {
      ev.addListener((changes, areaName) => {
        if (areaName && areaName !== 'local') return;
        const c = changes && changes[KEY_VOICE_VOLUME_PERCENT];
        if (c) this.volumePercent = normalizeVoiceVolumePercent(c.newValue);
        const ng = changes && changes[COMEVIEW_NG_STORAGE_KEY];
        if (ng) this.ngKeys = voiceNgKeySet(ng.newValue);
        const ch = changes && changes[KEY_VOICE_CHORUS_ENABLED];
        if (ch) this.chorusEnabled = isVoiceChorusEnabled(ch.newValue);
        const en = changes && changes[KEY_VOICE_READING_ENABLED];
        if (!en) return;
        const next = en.newValue === true;
        if (next && this.readingWanted) return;
        if (!next && !this.readingWanted) return;
        if (next) void this.enable({ persist: false });
        else this.disable({ persist: false });
      });
    } catch { /* 購読できなくても起動時の値で鳴らす */ }
  }

  _emitToggle() {
    // 第1引数はボタンの ON/OFF(意思)。声を出してよいかは this.enabled。
    this.onToggle(this.readingWanted, this.readNameEnabled, this.toggleBusy);
  }

  _showSkipped(count) {
    if (count <= 0) return;
    this.onSkip(count);
  }

  /**
   * v0.1.799: item が【鳴らずに捨てられた】(stale/件数drop/合成失敗/flush/stop/merge)ときだけ
   *   呼ぶ drop 専用シグナル。再生パスでは絶対に呼ばない(=onAudioStart と排他)。吹き出し側は
   *   これを resolved として受け、pending→unvoiced に落として流速寿命で消す(床いっぱい残さない)。
   *   onPlayStart(再生・破棄の両方で発火する曖昧な「消費」信号)は後方互換でそのまま残す。
   * @param {{ onDropped?: Function }} item
   */
  _notifyDropped(item) {
    if (item && typeof item.onDropped === 'function') {
      try { item.onDropped(); } catch { /* no-op: 吹き出し通知失敗は再生に影響させない */ }
    }
  }

  _abortSynthControllers() {
    for (const ac of this._synthAborts) {
      try { ac.abort(); } catch { /* no-op */ }
    }
    this._synthAborts.clear();
  }

  stop() {
    this._abortSynthControllers();
    const dropped = this.queue;
    this.queue = [];
    this.generation += 1;
    for (const entry of this.prefetches.values()) {
      try { entry.abort?.abort(); } catch { /* no-op */ }
    }
    this.prefetches.clear();
    this._chorusPending = [];
    // v0.1.799: 破棄した待機 item の吹き出しを unvoiced へ(pending のまま床いっぱい残さない)。
    for (const item of dropped) this._notifyDropped(item);
    if (typeof this.stopCurrent === 'function') this.stopCurrent();
    this.stopCurrent = null;
    this._stopChorus();
    try { this.lightSpeaker?.cancel?.(); } catch { /* 軽い声が無くても止めは失敗しない */ }
    this._updateLagNotice(); // 止めたら遅れの一言も消す(待ちは空)。
  }

  /**
   * v0.1.1979: 待ちの1件を、まだ声づくりを頼んでいなければ読まずに外す(会場が吹き出しを声に合わせて待たせ、
   *   3秒たっても順番が来ない件を「読まずに吹き出しだけ」にするため・venueBubbleVoiceHold.js)。
   *   声づくりを頼み済み(prefetches にある)の件と、もう待ちから取り出された件は触らない(作った声を捨てない)。
   * @param {Function} onDropped enqueue に渡した onDropped(件の目印)
   * @returns {'dropped'|'inflight'|'not-queued'}
   */
  dropQueuedUnstarted(onDropped) {
    const i = typeof onDropped === 'function' ? this.queue.findIndex((q) => q && q.onDropped === onDropped) : -1;
    if (i < 0) return 'not-queued';
    const item = this.queue[i];
    if (this.prefetches.has(item)) return 'inflight';
    this.queue.splice(i, 1);
    if (typeof item.onPlayStart === 'function') item.onPlayStart();
    this._notifyDropped(item);
    this._updateLagNotice();
    return 'dropped';
  }

  /**
   * 2026-11-12: 吹き出しを声に合わせて待たせている件を、声づくりの途中でも外す(会場の待ちの上限・venueBubbleVoiceSync.js)。
   *   待ちにあれば外して onDropped を呼ぶ('dropped')。もう取り出されて声づくり中なら、鳴らさない印を付ける
   *   ('cancelled'・できあがった時に onDropped が呼ばれる)。鳴り始めた件・知らない件は触らない('not-queued')。
   * @param {Function} onDropped
   * @returns {'dropped'|'cancelled'|'not-queued'}
   */
  dropQueuedAny(onDropped) {
    if (typeof onDropped !== 'function') return 'not-queued';
    const i = this.queue.findIndex((q) => q && q.onDropped === onDropped);
    if (i >= 0) {
      const [item] = this.queue.splice(i, 1);
      const pf = this.prefetches.get(item);
      if (pf) {
        try { pf.abort?.abort(); } catch { /* no-op */ }
        this.prefetches.delete(item);
      }
      if (typeof item.onPlayStart === 'function') item.onPlayStart();
      this._notifyDropped(item);
      this._updateLagNotice();
      return 'dropped';
    }
    const cur = this._current;
    if (cur && cur.item && cur.item.onDropped === onDropped && !cur.audioStarted) {
      cur.cancelled = true;
      return 'cancelled';
    }
    return 'not-queued';
  }

  /** 合成時間÷声の長さ(3件以上測れていれば・無ければ 0)。 */
  _synthRtf() {
    const rtfSamples = Number(this.diag.warmRtfSamples) || 0;
    const rtfPermille = Number(this.diag.warmSynthRtfPermille);
    return rtfSamples >= 3 && rtfPermille > 0 ? rtfPermille / 1000 : 0;
  }

  /**
   * 2026-11-12: 待ちにある1件の声が鳴り始めるまでの見込み(会場の吹き出しを待たせるか・venueBubbleVoiceSync.js)。
   * @param {Function} onDropped 列に入れた時の onDropped(どの件かの印)
   * @returns {{ ms: number, ahead: number, important: boolean } | null} 待ちに無ければ null
   */
  estimateStartDelayMs(onDropped) {
    try {
      const i = typeof onDropped === 'function' ? this.queue.findIndex((q) => q && q.onDropped === onDropped) : -1;
      if (i < 0) return null;
      const item = this.queue[i];
      const maxChars = computeVoiceCongestion(this.queue.length).maxChars;
      const chars = (/** @type {any} */ it) => buildMergedVoiceText(it, { maxChars }).length;
      const rtf = this._synthRtf();
      const now = Date.now();
      const cur = this.playing ? this._current : null;
      let currentRemainingMs = 0;
      if (cur) {
        currentRemainingMs = cur.playAt > 0 && cur.expectedMs > 0
          ? cur.expectedMs - (now - cur.playAt)
          : estimateVoiceStartDelayMs({ aheadChars: [cur.chars] }, this._paceState, rtf) - (now - cur.shiftAt);
      }
      // 2026-11-12: 覚えた声で鳴らす件は声づくりの時間を数えない(待たせても間に合う)。
      const cached = (/** @type {any} */ it) => this._isClipReady(it);
      const ms = estimateVoiceStartDelayMs({
        currentRemainingMs: Math.max(0, currentRemainingMs),
        aheadChars: this.queue.slice(0, i).map(chars),
        aheadCached: this.queue.slice(0, i).map(cached),
        selfChars: chars(item),
        selfCached: cached(item)
      }, this._paceState, rtf);
      return { ms, ahead: i + (cur ? 1 : 0), important: item.priority === 'high' || !!item.importance };
    } catch {
      return null;
    }
  }

  /**
   * v0.1.773 長時間ラグ対策: 待機中のキューだけを破棄して「今」へリセットする。
   *   再生中の1本は止めない(stop と違い不協和を出さない)。タブが裏に回って drain が
   *   スロットリングされ溜まった backlog を、可視復帰時に一掃して定常ラグの蓄積を断つ。
   *   破棄した item には onPlayStart(=消費=resolved)を通知し、吹き出し側の状態整合を保つ。
   * @returns {number} 破棄した件数
   */
  flushPendingQueue() {
    const dropped = this.queue;
    this.queue = [];
    this.prefetches.clear();
    for (const item of dropped) {
      if (item && typeof item.onPlayStart === 'function') item.onPlayStart();
      this._notifyDropped(item); // v0.1.799: 鳴らず破棄→吹き出しを unvoiced へ
    }
    if (dropped.length > 0) this._showSkipped(dropped.length);
    return dropped.length;
  }

  disable({ persist = true } = {}) {
    this._intentSerial += 1;
    this.readingWanted = false;
    this.enabled = false;
    this.toggleBusy = false;
    if (this._engineRetryTimer) {
      clearTimeout(this._engineRetryTimer);
      this._engineRetryTimer = 0;
    }
    this._deviceNote = '';
    this.stop();
    this.onLoadingState('idle');
    this._emitToggle();
    if (persist && this.storage) {
      this.storage.set({ [this.VOICE_READING_ENABLED_KEY]: false }).catch(() => {});
    }
  }

  _scheduleEngineRetry(serial) {
    if (this._engineRetryTimer || !(this.engineRetryMs > 0)) return;
    this._engineRetryTimer = setTimeout(() => {
      this._engineRetryTimer = 0;
      if (serial !== this._intentSerial || !this.readingWanted || this.enabled) return;
      void this._connect(serial);
    }, this.engineRetryMs);
    try { this._engineRetryTimer.unref?.(); } catch { /* ブラウザの timer には unref が無い */ }
  }

  _emitDeviceNote() {
    if (!this.enabled || !this.readingWanted) return;
    const text = voiceEngineDeviceNote(this._gpuCapable);
    if (!text || text === this._deviceNote) return;
    this._deviceNote = text;
    try { this.onStatus(text); } catch { /* 表示の失敗は読み上げに影響させない */ }
  }

  /**
   * ★v0.1.1327: クリックの「ユーザー操作」を【その場で】使って音声を解錠する。
   *
   * ■ なぜ要るか(ユーザー実機「一瞬ONになって戻ってしまう」)
   *   Chrome は自動再生をブロックし、`audio.play()` は【ユーザー操作の延長】でしか
   *   通らない。ところが enable() は
   *     クリック → (生存確認 最大3回+バックオフ) → スタイル取得 → …数百ms〜数秒…
   *     → 最初のコメント到着 → 合成 → ようやく audio.play()
   *   という流れで、実際に鳴らす時点では**クリックから遠く離れている**。
   *   すると NotAllowedError になり、再生パス(:612-617)が disable() を呼ぶため
   *   「ONになった直後にOFFへ戻る」ように見えていた。
   *   ★comeview(拡張ページ)は制約が緩く、会場(content script)だけで出る非対称の正体。
   *
   * ■ 何をするか
   *   クリック直後の同期タイミングで、無音の短い音を1回 play() しておく。
   *   これが通れば以後の play() は解錠済みとして扱われる(標準的な audio unlock 手法)。
   *   失敗しても握りつぶす=従来どおり進む(悪化させない)。
   *
   * @returns {Promise<boolean>} 解錠できたか(できなくても enable は続行する)
   */
  async primeAudioUnlock() {
    /*
     * ★解錠用の Audio は【注入された audioConstructor を使わない】。
     *   理由: 呼び出し側/テストは audioConstructor を「読み上げの再生」として数えており、
     *   ここで1個増やすと再生パスの計測(fakeAudios[0] 等)がズレる=既存の
     *   lagDecomposition テストが実際に赤くなった。解錠は再生とは別物なので分離する。
     *   unlockAudioConstructor が無い環境(テスト等)では解錠をスキップする(害を出さない)。
     */
    const Ctor = this.unlockAudioConstructor;
    if (typeof Ctor !== 'function') return false;
    try {
      const a = new Ctor();
      // 無音(1サンプルの WAV)。外部リソースを取りに行かない=CWS 審査上も安全。
      a.src = SILENT_WAV_DATA_URI;
      a.volume = 0;
      const p = a.play();
      if (p && typeof p.then === 'function') await p;
      try { a.pause(); } catch { /* no-op */ }
      this._audioUnlocked = true;
      return true;
    } catch {
      // ブロックされた=解錠できなかった。enable は続行し、鳴らす時に改めて判断する。
      return false;
    }
  }

  async enable({ persist = true } = {}) {
    if (this.isObsMode()) return;
    const serial = this._intentSerial;
    this.readingWanted = true;
    this._emitToggle();
    if (persist && this.storage && serial === this._intentSerial && this.readingWanted) {
      this.storage.set({ [this.VOICE_READING_ENABLED_KEY]: true }).catch(() => {});
    }
    await this._connect(serial);
  }

  /**
   * エンジンへつなぐ。ボタンの ON は enable が先に出す。ここが遅くても OFF は serial で無効になる。
   * @param {number} serial
   */
  async _connect(serial) {
    if (serial !== this._intentSerial || !this.readingWanted) return;
    if (this.enabled) return;
    if (this._connectInFlight) {
      await new Promise((resolve) => { this._connectWaiters.push(resolve); });
      if (serial !== this._intentSerial || !this.readingWanted || this.enabled) return;
    }
    this._connectInFlight = true;
    this.toggleBusy = true;
    this._emitToggle();
    const aborted = () => serial !== this._intentSerial || !this.readingWanted;
    try {
      // ★v0.1.1327: 非同期処理に入る【前】に解錠する。ここが唯一「クリックの延長」に居られる瞬間。
      await this.primeAudioUnlock();
      if (aborted()) return;
      this.onLoadingState('checking');
      let probe = await this.probeVoicevoxAlive();
      if (!probe.ok && !aborted()) {
        this.onLoadingState('connecting');
        for (const waitMs of VOICE_ALIVE_RETRY_BACKOFF_MS) {
          if (aborted()) return;
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
          if (aborted()) return;
          probe = await this.probeVoicevoxAlive();
          if (probe.ok) break;
        }
      }
      if (aborted()) return;
      if (!probe.ok) {
        this.diag.lastEnableFailReason = String(probe.reason || 'unknown');
        this.diag.enableFailTotal = (Number(this.diag.enableFailTotal) || 0) + 1;
        this._emitDiag();
        // ボタンは ON のまま。OFF は保存しない。つながるまで声は出さない。
        this.enabled = false;
        this.onLoadingState('notfound', probe.reason);
        this._scheduleEngineRetry(serial);
        return;
      }

      const allStyleIds = await this.fetchVoiceStyleIds();
      if (aborted()) return;
      startVoiceWarmup(this.voiceWarmup, allStyleIds);
      this._synthTracker.reset();
      resetVoiceWarmMeasure(this.diag);
      this._streamSupported = false;
      if (this.probeVoiceStreaming && this.createStreamedAudio) {
        void Promise.resolve()
          .then(() => this.probeVoiceStreaming())
          .then((ok) => { this._streamSupported = ok === true; }, () => {});
      }
      this._gpuCapable = null;
      this._deviceNote = '';
      if (this.probeVoiceGpu) {
        void Promise.resolve()
          .then(() => this.probeVoiceGpu())
          .then((ok) => {
            this._gpuCapable = typeof ok === 'boolean' ? ok : null;
            this._emitDeviceNote();
          }, () => {});
      }
      const prepared = await prepareVoiceStyleIds(allStyleIds, {
        readSettings: async () => {
          const b = this.storage ? await this.storage.get([KEY_VOICE_NARROW_MODE, KEY_VOICE_WEAK_PC]) : {};
          this._slowEngine = b[KEY_VOICE_WEAK_PC] === true;
          return { mode: b[KEY_VOICE_NARROW_MODE], weak: b[KEY_VOICE_WEAK_PC] };
        },
        initSpeaker: this.initVoiceSpeaker
      });
      if (aborted()) return;
      this.styleIds = prepared.styleIds;
      this.diag.voiceNarrowed = prepared.narrowed;
      this.generation += 1;
      this.enabled = true;
      this.diag.lastEnableFailReason = '';
      this._emitDiag();
      this.onLoadingState('ready');
      this._emitDeviceNote();
      this._emitToggle();
    } finally {
      this._connectInFlight = false;
      const same = serial === this._intentSerial;
      if (same) {
        this.toggleBusy = false;
        this._emitToggle();
      }
      const waiters = this._connectWaiters;
      this._connectWaiters = [];
      for (const wake of waiters) {
        try { wake(); } catch { /* no-op */ }
      }
    }
  }

  _voiceUserKeyForItem(item) {
    const userId = String(item?.userId || '').trim();
    const name = String(item?.nickname || '').trim();
    const key = String(item?.userKey || item?.key || '').trim();
    return userId || key || name || 'anon';
  }

  /**
   * v0.1.1800: 待っている件+新しい件の文字数から件数の上限を見積もる(voiceLagBudget.resolveVoiceQueueMaxByChars)。
   * @param {object} candidate
   * @returns {number}
   */
  _resolveQueueMaxByChars(candidate) {
    try {
      const maxChars = computeVoiceCongestion(this.queue.length + 1).maxChars;
      const counts = [...this.queue, candidate].map((it) => buildMergedVoiceText(it, { maxChars }).length);
      // v0.1.1801: 声を作る速さ(合成時間÷声の長さ)が3件以上測れていれば、作る時間も数える。
      const synthRtf = this._synthRtf();
      const byChars = resolveVoiceQueueMaxByChars(counts, this._paceState, synthRtf);
      if (byChars == null) return this._effectiveQueueMax;
      this.diag.queueMaxByChars = byChars;
      return byChars;
    } catch {
      return this._effectiveQueueMax;
    }
  }

  /**
   * 2026-11-12(合唱): 重ねる声の文(名前を付けない本文だけ・人によらず同じ文)。
   * @param {any} item
   */
  _chorusText(item) {
    try {
      return buildVoiceReadingText({ name: '', text: item?.body }, { maxChars: computeVoiceCongestion(this.queue.length).maxChars });
    } catch {
      return '';
    }
  }

  /**
   * 2026-11-12(合唱): 主役の声が鳴り始めたら、覚えた声がある仲間の声を少しずつずらして重ねる。
   * @param {any} item
   * @param {number} boost 主役の声を作った時の早口(近い早口の声を選ぶ)
   * @param {number} playbackRate 主役と同じ再生速度
   */
  _playChorusOverlays(item, boost, playbackRate) {
    if (!this.chorusEnabled || !Array.isArray(item?.chorus) || item.chorus.length === 0) return;
    const text = this._chorusText(item);
    if (!text) return;
    // 覚えていない仲間は、空いた時に作る候補へ(同じ声は1回・最大16人)。
    for (const who of item.chorus) {
      const voice = this.resolveVoice(who, this.assignments, this.styleIds);
      const key = voiceClipKey(voice, text);
      if (!key || this._clipCache.has(key) || this._chorusPending.some((p) => p.key === key)) continue;
      if (this._chorusPending.length >= 16) this._chorusPending.shift();
      this._chorusPending.push({ key, text, voice });
    }
    const overlays = planVoiceChorusOverlays(item.chorus, (who) => {
      const hit = this._clipCache.get(voiceClipKey(this.resolveVoice(who, this.assignments, this.styleIds), text), boost);
      return hit ? hit.wav : null;
    });
    if (overlays.length === 0) return;
    this.diag.chorusPlayTotal = (Number(this.diag.chorusPlayTotal) || 0) + 1;
    this.diag.chorusOverlayTotal = (Number(this.diag.chorusOverlayTotal) || 0) + overlays.length;
    const generation = this.generation;
    for (const o of overlays) {
      const timer = setTimeout(() => {
        this._chorusTimers.delete(timer);
        if (generation !== this.generation || !this.enabled) return;
        let url = '';
        try {
          const loud = applyVoiceVolumeToWav(o.clip, (this.volumePercent * o.gainPercent) / 100);
          url = this.createObjectURL(new Blob([loud], { type: 'audio/wav' }));
          const AudioCtor = this.audioConstructor;
          const audio = new AudioCtor(url);
          if (playbackRate !== 1.0) {
            audio.preservesPitch = true;
            audio.playbackRate = playbackRate;
          }
          let done = false;
          const cleanup = () => {
            if (done) return;
            done = true;
            clearTimeout(guard);
            this._chorusAudios.delete(audio);
            try { this.revokeObjectURL(url); } catch { /* no-op */ }
          };
          // ended が来ない時の後始末(短い声なので10秒で十分)。
          const guard = setTimeout(cleanup, 10000);
          audio._nlChorusCleanup = cleanup;
          audio.addEventListener('ended', cleanup, { once: true });
          audio.addEventListener('error', cleanup, { once: true });
          this._chorusAudios.add(audio);
          const p = audio.play();
          if (p && typeof p.catch === 'function') p.catch(cleanup);
        } catch {
          if (url) { try { this.revokeObjectURL(url); } catch { /* no-op */ } }
        }
      }, o.delayMs);
      this._chorusTimers.add(timer);
    }
  }

  /** 2026-11-12(合唱): 重ねている声と、これから重ねる予定を止める。 */
  _stopChorus() {
    for (const t of this._chorusTimers) clearTimeout(t);
    this._chorusTimers.clear();
    for (const a of [...this._chorusAudios]) {
      try { a.pause(); } catch { /* no-op */ }
      try { a._nlChorusCleanup?.(); } catch { /* no-op */ }
    }
    this._chorusAudios.clear();
  }

  /**
   * 2026-11-12(合唱): 読み上げ待ちが空いている時だけ、合唱で重ねられなかった仲間の声を1人ぶん作っておく
   *   (次に同じ言葉が来た時から重なる)。待ちがある間は作らない=読み上げの合成を奪わない。
   */
  _learnChorusMember() {
    if (!this.chorusEnabled || this._chorusPending.length === 0) return;
    if (!this.enabled || this.queue.length > 0 || this._synthInFlight > 0 || this._useLightVoice()) return;
    while (this._chorusPending.length > 0) {
      const next = this._chorusPending.shift();
      if (!next || this._clipCache.has(next.key)) continue;
      const abort = new AbortController();
      this._synthAborts.add(abort);
      const promise = this._synthesizeTracked(next.text, next.voice, { signal: abort.signal })
        .catch(() => null)
        .finally(() => { this._synthAborts.delete(abort); });
      this.diag.chorusLearnTotal = (Number(this.diag.chorusLearnTotal) || 0) + 1;
      this._rememberClip(next.key, 0, promise);
      return; // 1回に1人だけ
    }
  }

  /**
   * 2026-11-12: 声のつくり置きの鍵(この人の声+読む文)。覚えない文なら ''。
   * @param {any} item
   * @param {string} [text] 読む文(省略時は今の混雑の上限で作る)
   */
  _clipKeyFor(item, text) {
    try {
      const t = typeof text === 'string'
        ? text
        : buildMergedVoiceText(item, { maxChars: computeVoiceCongestion(this.queue.length).maxChars });
      return voiceClipKey(this.resolveVoice(item.userKey, this.assignments, this.styleIds), t);
    } catch {
      return '';
    }
  }

  /**
   * 2026-11-12: この件を覚えた声で鳴らせるか(合成済みの先読みがある件も含む)。
   * @param {any} item
   */
  _isClipReady(item) {
    if (!item) return false;
    const pf = this.prefetches.get(item);
    if (pf && pf.cached) return true;
    return this._clipCache.has(this._clipKeyFor(item));
  }

  /**
   * 2026-11-12: 覚えた声があれば、合成せずに「先読み済み」として置く。置けたら true。
   * @param {any} item
   * @param {number} generation
   */
  _attachCachedClip(item, generation) {
    if (!item || generation !== this.generation) return false;
    const existing = this.prefetches.get(item);
    if (existing && existing.generation === generation) return !!existing.cached;
    const congestion = computeVoiceCongestion(this.queue.length);
    const effBoost = this._resolveEffectiveSpeedBoost(congestion.speedBoost);
    const text = buildMergedVoiceText(item, { maxChars: capVoiceMaxCharsByBoost(effBoost, congestion.maxChars) });
    const key = this._clipKeyFor(item, text);
    const hit = key ? this._clipCache.get(key, effBoost) : null;
    if (!hit) return false;
    this.prefetches.set(item, {
      generation,
      promise: Promise.resolve(hit.wav),
      boostAtSynth: hit.boost,
      textLength: text.length,
      abort: null,
      cached: true
    });
    this.diag.clipHitTotal = (Number(this.diag.clipHitTotal) || 0) + 1;
    return true;
  }

  /**
   * 2026-11-12: できあがった声を覚える(短い文だけ・少しずつ届いた声は届き終わってから)。
   * @param {string} key
   * @param {number} boost 合成した時の早口
   * @param {Promise<any>} wavPromise
   */
  _rememberClip(key, boost, wavPromise) {
    if (!key) return;
    Promise.resolve(wavPromise).then(async (wav) => {
      if (!wav) return;
      let whole = wav;
      if (isStreamedVoice(wav)) {
        const ok = await wav.whenDone;
        if (!ok) return;
        whole = wav.toWav();
      }
      if (this._clipCache.put(key, boost, whole)) {
        this.diag.clipStoreTotal = (Number(this.diag.clipStoreTotal) || 0) + 1;
        const st = this._clipCache.stats();
        this.diag.clipBytes = st.bytes;
        this.diag.clipKeys = st.keys;
      }
    }).catch(() => { /* 覚えられなくても読み上げは止めない */ });
  }

  /** item 1件ぶんの合成を起動し、in-flight WAV Promise を返す(まだ無ければ）。 */
  _ensurePrefetch(item, generation) {
    if (!item || generation !== this.generation) return null;
    const existing = this.prefetches.get(item);
    if (existing && existing.generation === generation) return existing.promise;
    // 2026-11-12: 覚えた声があれば合成しない。
    if (this._attachCachedClip(item, generation)) return this.prefetches.get(item).promise;
    const congestion = computeVoiceCongestion(this.queue.length);
    // v0.1.1222: 実効上限が絞られるとキューが5件に届かず congestion の上位段が発火しない構造穴を
    //   pressure(需要/供給比)由来のブーストで埋める。上げるだけ・落ち着いていれば0。
    const effBoost = this._resolveEffectiveSpeedBoost(congestion.speedBoost);
    const assigned = this.resolveVoice(item.userKey, this.assignments, this.styleIds);
    const text = buildMergedVoiceText(item, { maxChars: capVoiceMaxCharsByBoost(effBoost, congestion.maxChars) });
    // 2026-10-26: 待ちが無く何も鳴っていない時だけ、少しずつ受け取る(合成の待ちがそのまま声の遅れになる時)。
    if (!this._slowEngine && isWeakVoicePc(this.diag)) this._slowEngine = true;
    const stream = shouldStreamVoice({
      supported: this._streamSupported,
      idle: this.queue[0] === item && !this.stopCurrent,
      slowEngine: this._slowEngine,
      textLength: text.length
    });
    // v0.1.1224: 失敗理由を計器へ(_synthesizeTracked が onFailure を渡す)。
    const abort = new AbortController();
    this._synthAborts.add(abort);
    const promise = this._synthesizeTracked(
      text,
      {
        ...assigned,
        speedOffset: assigned.speedOffset + effBoost
      },
      { stream, signal: abort.signal }
    ).catch(() => null).finally(() => { this._synthAborts.delete(abort); });
    // v0.1.1089(voice-tempo-realtime-SYNTHESIS §3 Phase 2): 合成起動時点のspeedBoostを保存する。
    //   このWAVは既にこの速度で焼き固まっているため、再生直前に「今」の混雑度と比較して
    //   playbackRateで追いつかせる(合成のやり直しなし=ゼロコスト)。
    this.prefetches.set(item, { generation, promise, boostAtSynth: effBoost, textLength: text.length, abort });
    this._rememberClip(voiceClipKey(assigned, text), effBoost, promise);
    return promise;
  }

  /**
   * v0.1.1224: 合成失敗の理由を1件記録する。voicevoxClient の onFailure から呼ばれる。
   * @param {{ stage?: string, error?: unknown, httpStatus?: number, bodyInvalid?: boolean }} info
   */
  /**
   * 合成を依頼し、段階計測(エンジン待ち・audio_query/synthesis・初めての声)を diag へ記録する。
   * 戻り値・例外は fetchSynthesizeVoice と同じ(計器は読み上げの挙動を変えない)。
   * @param {string} text
   * @param {{ styleId?: number, pitchOffset?: number, speedOffset?: number }} voice
   * @param {{ stream?: boolean }} [extra]
   */
  _synthesizeTracked(text, voice, extra = {}) {
    const track = this._synthTracker.begin(voice?.styleId);
    /** @type {{ queryMs?: number, synthMs?: number }} */
    let timing = {};
    /** この1件が時間切れで終わったか(混雑の判定に使う)。 */
    let timedOut = false;
    const startedAt = Date.now();
    const overloadTimeouts = resolveVoiceOverloadTimeouts(this._overload.overloaded);
    this._synthInFlight += 1;
    let settled = false;
    const settle = () => { if (!settled) { settled = true; this._synthInFlight = Math.max(0, this._synthInFlight - 1); } };
    // 同期で呼ぶ(enqueue 直後に合成が起動していることを既存テストが固定している=v0.1.800)。
    let started;
    try {
      started = this.fetchSynthesizeVoice(text, voice, {
        ...overloadTimeouts,
        onFailure: (info) => {
          const reason = this._recordSynthFailureReason(info);
          if (reason === 'timeout' || reason === 'query_timeout') timedOut = true;
        },
        onTiming: (t) => { timing = t || {}; },
        ...(extra.stream === true ? { stream: true } : {}),
        ...(extra.signal ? { signal: extra.signal } : {})
      });
    } catch (err) {
      started = Promise.reject(err);
    }
    return Promise.resolve(started)
      .then(
        (wav) => {
          settle();
          /** @type {any} */
          let r = null;
          try { r = track.end({ ...timing, audioMs: measureWavAudioMs(wav) }, !!wav); recordVoiceSynthStage(this.diag, r); } catch { /* 計器は本体を止めない */ }
          this._noteOverload({ timedOut, ok: !!wav, totalMs: Date.now() - startedAt });
          const judge = () => {
            // P3: 遅いPCと分かったら一度だけ記録('auto' のとき次の読み上げ ON から絞る)。
            if (this.storage) rememberWeakVoicePc(this.diag, this._weakPcState, () => this.storage.set({ [KEY_VOICE_WEAK_PC]: true }));
            // 2026-10-26: 速い PC と十分に分かったら、誤って残った「弱い」の記録を消す。
            if (this.storage) {
              forgetWeakVoicePcIfFast(this.diag, this._weakPcState, () => {
                this._slowEngine = false;
                return this.storage.set({ [KEY_VOICE_WEAK_PC]: false });
              });
            }
          };
          judge();
          // 少しずつ受け取った声は、届き終わった時に速さを数える。
          if (r && isStreamedVoice(wav)) void recordVoiceStreamDone(this.diag, r, wav, () => Date.now(), judge);
          return wav;
        },
        (err) => {
          settle();
          try { track.end(timing, false); } catch { /* no-op */ }
          this._noteOverload({ timedOut, ok: false });
          throw err;
        }
      );
  }

  _recordSynthFailureReason(info) {
    try {
      const reason = classifyVoiceSynthFailureReason(info);
      const bag = this.diag.synthFailReasons || (this.diag.synthFailReasons = {});
      bag[reason] = (Number(bag[reason]) || 0) + 1;
      return reason;
    } catch { /* 計器の失敗は読み上げを止めない */ }
    return '';
  }

  /**
   * 2026-10-31: 合成1件の結果から「エンジン混雑中」を更新し、計器に出す(状態速報で見える)。
   * @param {{ timedOut?: boolean, ok?: boolean, totalMs?: number }} outcome
   */
  _noteOverload(outcome) {
    try {
      const was = this._overload.overloaded;
      const now = noteVoiceSynthOutcome(this._overload, outcome);
      this.diag.voiceOverloaded = now;
      if (now && !was) this.diag.voiceOverloadTotal = (Number(this.diag.voiceOverloadTotal) || 0) + 1;
    } catch { /* 計器の失敗は読み上げを止めない */ }
  }

  /**
   * v0.1.1222: 実際に適用する speedBoost を決める(既存の混雑ブースト ∪ 持続過負荷ブースト)。
   *
   * 【なぜ要るか】混雑ブーストは【絶対キュー長】依存(5件で0.5・8件で0.8)だが、実効上限が
   *   処理時間EMAから3まで絞られると**キューは構造的に5件へ到達できない**=上位2段が
   *   永久に発火しない。結果「速く読んで消化する」より「入口で捨てる」に倒れていた
   *   (2026-08-01 実測: 需要102.3/分 vs 供給39.6/分・間引き88件・判定=playback・実効上限3)。
   *   pressure はキュー長に依らず過負荷を検出できるので、この穴だけを埋める。
   *
   * ★上げるだけ(mergeVoiceSpeedBoost が max を取る)なので、既存の速さを下回らせない。
   * @param {number} congestionBoost 既存の混雑由来ブースト
   * @returns {number}
   */
  _resolveEffectiveSpeedBoost(congestionBoost) {
    const sustained = computeSustainedPressureBoost({
      arrivalPerMin: this.diag?.arrivalPerMin,
      serviceTimeEmaMs: this._serviceTimeEmaMs,
      sampleCount: this._spokenSampleCount
    });
    // v0.1.1797: 順番待ちが伸びていたら、それでも上げる(pressure が 1.2 未満の「少しだけ足りない」を拾う)。
    //   追いついた後も、声の長さが間隔を上回る分(床)だけは早口を保つ(0 に戻ると遅れが再び積もって揺れた)。
    const paceFloor = computeVoicePaceFloor(this._paceState);
    const backlog = computeBacklogCatchUpBoost(this.diag?.queueWaitEmaMs, paceFloor);
    this.diag.lastPaceFloor = paceFloor;
    this.diag.lastBacklogBoost = backlog;
    const merged = mergeVoiceSpeedBoost(congestionBoost, Math.max(sustained, backlog));
    // 計器: 持続ブーストが実際に効いた累計(効果を後から検算できるようにする)。
    if (sustained > 0 && merged > congestionBoost) {
      this.diag.sustainedBoostTotal = (Number(this.diag.sustainedBoostTotal) || 0) + 1;
    }
    this.diag.lastSustainedBoost = sustained;
    return merged;
  }

  /**
   * v0.1.768: 先頭から深さ分(最大3)の item を先行合成する。
   *   再生中に N+1 だけでなく N+2/N+3 も貯めることで、フラッド時に合成を遊ばせない。
   *   深さは詰まり具合(resolveVoiceSynthDepth)で動的=落ち着いていれば1=無駄打ちしない。
   *   先読みした item が後で stale 破棄されても、再生直前に必ず age-gate を通すので無駄打ちは回収。
   */
  _startPrefetch(generation) {
    if (generation !== this.generation) {
      for (const entry of this.prefetches.values()) {
        try { entry.abort?.abort(); } catch { /* no-op */ }
      }
      this.prefetches.clear();
      return;
    }
    // 2026-11-12: 覚えた声がある件は、合成を待たずに(軽い声の間でも)その人の声で鳴らせるよう置いておく。
    const cachedReady = new Set();
    for (const item of this.queue) {
      if (item && this._attachCachedClip(item, generation)) cachedReady.add(item);
    }
    // 2026-11-03: 軽い声で読んでいる間は VOICEVOX に読み上げを頼まない(速さの確かめだけ)。
    if (this._useLightVoice()) {
      this._maybeProbeVoicevox();
      return;
    }
    // 同時に頼むのは常に1件。遅い CPU では並行の合成が全部を遅くする(時間切れが積もる)。
    //   今の1件が終わってから次を頼む。再生とその次の合成は重なってよい。
    const depth = Math.min(1, capVoiceSynthDepthForOverload(resolveVoiceSynthDepth(this.queue.length, {
      pending: this.queue.length
    }), this._overload.overloaded));
    // v0.1.1088計器(設計書§2): diag.lastDepth は宣言のみでどこからも代入されていなかった
    //   化石計器。ここで実値を代入して修理する(先読み深さの実測)。
    this.diag.lastDepth = depth;
    const wanted = new Set(cachedReady);
    for (let i = 0; i < depth && i < this.queue.length; i++) {
      const item = this.queue[i];
      if (!item) continue;
      // 2026-11-03: 混雑中は、VOICEVOX がまだ前の合成をしている間は次を頼まない。
      //   拡張が諦めた依頼も VOICEVOX は最後まで計算するので、重ねて頼むほど全部が遅れる
      //   (実測: CPU 100%・時間切れ1,940件)。頼まなかった件は順番が来たときに頼む。
      if (this._synthInFlight > 0 && !this.prefetches.has(item)) continue;
      wanted.add(item);
      this._ensurePrefetch(item, generation);
    }
    // キューから消えた item の先読みは破棄(取りこぼした WAV は GC される=メモリ有界)。
    for (const [key, entry] of this.prefetches) {
      if (!wanted.has(key)) {
        try { entry.abort?.abort(); } catch { /* no-op */ }
        this.prefetches.delete(key);
      }
    }
  }

  /**
   * 2026-11-03: VOICEVOX が混雑中(時間切れが続いた)なら、合成を頼み済みの件を守る判定を返す。
   *   混雑していなければ null(=従来どおり件数・鮮度で捨てる)。
   * @returns {((x: any) => boolean) | null}
   */
  _inflightKeeper() {
    if (!this._overload.overloaded) return null;
    return (x) => this.prefetches.has(x);
  }

  /** 2026-11-03: 今、軽い声で読むか(VOICEVOX が混雑中で、軽い声が使えるときだけ)。 */
  _useLightVoice() {
    let available = false;
    try { available = !!this.lightSpeaker && this._lightFailStreak < 3 && this.lightSpeaker.available(); } catch { available = false; }
    const on = shouldUseLightVoice({ overloaded: this._overload.overloaded, available, setting: this.lightVoiceSetting });
    this.diag.lightVoiceActive = on;
    return on;
  }

  /** 軽い声で読んでいる間、ときどき VOICEVOX に短い文を頼んで速さを確かめる(速ければ混雑が解けて戻る)。 */
  _maybeProbeVoicevox() {
    const nowMs = Date.now();
    if (!shouldProbeVoicevox({ nowMs, lastProbeAt: this._lightProbeAt, inFlight: this._synthInFlight })) return;
    this._lightProbeAt = nowMs;
    try {
      const voice = this.resolveVoice('', this.assignments, this.styleIds);
      void Promise.resolve(this._synthesizeTracked(LIGHT_VOICE_PROBE_TEXT, voice)).catch(() => null);
    } catch { /* 確かめられなくても軽い声で読み続ける */ }
  }

  /**
   * 2026-11-03: 1件を軽い声で読む。人ごとの声(どの声・高さ・速さ)は voiceLightFallback.lightVoiceToneFor。
   * @param {any} item
   * @param {number} generation
   */
  async _playLight(item, generation) {
    this._maybeProbeVoicevox();
    const text = buildMergedVoiceText(item, { maxChars: LIGHT_VOICE_MAX_CHARS });
    const speaker = this.lightSpeaker;
    let started = false;
    if (text && speaker) {
      const tone = lightVoiceToneFor(String(item.userKey || ''), speaker.voices().length);
      this.stopCurrent = () => speaker.cancel();
      try {
        started = await speaker.speak(text, tone, {
          onStart: () => {
            if (this._current && this._current.item === item) this._current.audioStarted = true;
            if (typeof item.onAudioStart === 'function') item.onAudioStart();
            try { if (typeof item.onAudible === 'function') item.onAudible(); } catch { /* 枠の失敗で再生を止めない */ }
          }
        });
      } catch { started = false; }
      this.stopCurrent = null;
    }
    if (started && typeof item.onAudioEnd === 'function') item.onAudioEnd();
    if (typeof item.onPlayStart === 'function') item.onPlayStart();
    if (text && speaker) {
      this._lightFailStreak = started ? 0 : this._lightFailStreak + 1;
      this._noteLightResult(started, speaker);
    }
    if (!started || generation !== this.generation) {
      this._notifyDropped(item);
      return;
    }
    this.diag.spokenTotal += 1;
    this.diag.lightSpokenTotal = (Number(this.diag.lightSpokenTotal) || 0) + 1;
    this.diag.lastSpokenBase = Date.now();
    const denom = this.diag.spokenTotal + this.diag.staleDropTotal;
    this.diag.voicedRatio = denom > 0 ? this.diag.spokenTotal / denom : -1;
    this._voicedRecentRatioEma = updateVoiceEventRatioEma(this._voicedRecentRatioEma, 1);
    this.diag.voicedRecentRatio = this._voicedRecentRatioEma;
    this._emitDiag();
    this._updateLagNotice(); // 「PC の声で読んでいます」を出す
  }

  /**
   * 2026-11-09: 軽い声の失敗理由を計器に残し、Chrome に止められたら(not-allowed)画面で案内する。
   * @param {boolean} started
   * @param {any} speaker
   */
  _noteLightResult(started, speaker) {
    let err = '';
    try { err = typeof speaker.lastError === 'function' ? String(speaker.lastError() || '') : ''; } catch { err = ''; }
    if (started) {
      if (this._lightBlocked) { this._lightBlocked = false; this.diag.lightVoiceBlocked = false; this._updateLagNotice(); }
      return;
    }
    if (!err) return;
    this.diag.lightLastError = err;
    this.diag.lightErrorTotal = (Number(this.diag.lightErrorTotal) || 0) + 1;
    if (err !== 'not-allowed') return;
    this.diag.lightBlockedTotal = (Number(this.diag.lightBlockedTotal) || 0) + 1;
    if (!this._lightBlocked) {
      this._lightBlocked = true;
      this.diag.lightVoiceBlocked = true;
      this._listenForActivation();
      this._emitDiag();
      this._updateLagNotice();
    }
  }

  /** ページがクリック・キー操作されたら、止められていた PC の声をもう一度試せるようにする。 */
  _listenForActivation() {
    const g = /** @type {any} */ (this._activationTarget);
    if (this._activationListening || typeof g.addEventListener !== 'function') return;
    this._activationListening = true;
    const onAct = () => {
      try {
        g.removeEventListener('pointerdown', onAct, true);
        g.removeEventListener('keydown', onAct, true);
      } catch { /* no-op */ }
      this._activationListening = false;
      this._lightBlocked = false;
      this.diag.lightVoiceBlocked = false;
      this._lightFailStreak = 0;
      this.diag.lightActivatedAt = Date.now();
      this._emitDiag();
      this._updateLagNotice();
    };
    try {
      g.addEventListener('pointerdown', onAct, true);
      g.addEventListener('keydown', onAct, true);
    } catch { this._activationListening = false; }
  }

  async _drainQueue() {
    if (this.playing || !this.enabled || this.isObsMode()) return;
    this.playing = true;
    try {
      while (this.enabled && this.queue.length) {
        const now = Date.now();
        let allStale = true;
        for (const qItem of this.queue) {
          if (!isVoiceItemStale(qItem.enqueuedAt, now, this.queue.length, qItem.priority === 'high').stale) {
            allStale = false;
            break;
          }
        }
        if (allStale && this.queue.length > 0) {
          // v0.1.781: 全部 stale でも【最新の1件は読む】。以前は全捨て→ゼロ音声(回帰)だったが、
          //   コメントが流れている限り「今のコメント」は必ず1つ読む方が体感が良い(無音より新着優先)。
          //   古い分だけ捨て、最新(末尾)を残してそのまま再生フローへ進める。
          const newest = this.queue[this.queue.length - 1];
          // 2026-11-03: 混雑中は合成中の件も残す(捨てても VOICEVOX は止まらず、作業だけ無駄になる)。
          const keepInflight = this._inflightKeeper();
          const survivors = this.queue.filter((q) => q === newest || (keepInflight ? keepInflight(q) : false));
          const dropped = this.queue.filter((q) => !survivors.includes(q));
          for (const d of dropped) {
            if (typeof d.onPlayStart === 'function') d.onPlayStart();
            this._notifyDropped(d); // v0.1.799: 鳴らず破棄→吹き出しを unvoiced へ
          }
          this.queue = survivors;
          if (dropped.length > 0) {
            this._showSkipped(dropped.length);
            this.diag.staleDropTotal += dropped.length;
            // 2026-07-28計器(段階0=shadow): 全stale時の先頭群破棄(3地点のうちの1つ)。
            this._dropSweepStaleTotal += dropped.length;
            this.diag.dropSweepStaleTotal = this._dropSweepStaleTotal;
            for (let _i = 0; _i < dropped.length; _i += 1) {
              this._voicedRecentRatioEma = updateVoiceEventRatioEma(this._voicedRecentRatioEma, 0);
            }
            this.diag.voicedRecentRatio = this._voicedRecentRatioEma;
            this._emitDiag();
          }
          // newest はこの後の通常フロー(下の shift→合成→再生)で必ず再生される。
          //   その際の age-gate は queueLength=1 で評価される(下で再取得)ので通常しきい値が効く。
        }

        const queueLength = this.queue.length;
        const generation = this.generation;
        // v0.1.768: 先頭から深さ分(最大3)を【先に】合成起動してから先頭を取り出す。
        //   こうすると N の再生でブロックしている間に N+1/N+2/N+3 の合成が並走する。
        this._startPrefetch(generation);

        const item = this.queue.shift();
        if (!item) continue;
        // 2026-11-12: 今の件(声が始まるまでの見込み・待ちの上限で鳴らさない印)。
        this._current = { item, shiftAt: Date.now(), playAt: 0, expectedMs: 0, chars: 0, audioStarted: false, cancelled: false };
        // 2026-07-24計器(段階0=shadow): 1件あたり処理時間(shift〜再生完了)の起点。
        //   staleで即時破棄されたitemは合成/再生を伴わないため計測対象外(下のstale分岐でreturn)。
        const _serviceStart = Date.now();
        // 2026-10-22計器(P1): キュー投入→取り出し(順番待ち)。
        foldVoiceStageEma(this.diag, 'queueWaitEmaMs', measureVoiceGapMs(item.enqueuedAt, _serviceStart));

        const ageCheck = isVoiceItemStale(item.enqueuedAt, Date.now(), queueLength, item.priority === 'high');
        // 2026-11-03: 混雑中は、合成を頼み済みの件と、後ろにもう新しい件が無い件は古くても読む
        //   (遅い PC ではどの件も8秒を超えるので、ここで捨てると1件も鳴らない)。
        const keepInflight = this._inflightKeeper();
        const keepAnyway = !!keepInflight && (keepInflight(item) || this.queue.length === 0);
        if (ageCheck.stale && !keepAnyway) {
          if (typeof item.onPlayStart === 'function') item.onPlayStart();
          this._notifyDropped(item); // v0.1.799: stale で鳴らず破棄→吹き出しを unvoiced へ
          this._showSkipped(1);
          this.diag.staleDropTotal += 1;
          // 2026-07-28計器(段階0=shadow): 先頭itemの単体stale破棄(3地点のうちの1つ)。
          this._dropHeadStaleTotal += 1;
          this.diag.dropHeadStaleTotal = this._dropHeadStaleTotal;
          this._voicedRecentRatioEma = updateVoiceEventRatioEma(this._voicedRecentRatioEma, 0);
          this.diag.voicedRecentRatio = this._voicedRecentRatioEma;
          this._emitDiag();
          this.prefetches.delete(item);
          continue;
        }

        // 2026-11-03: VOICEVOX が追いつかない間は軽い声で読む(すでに合成を頼んだ件はそれを待つ)。
        if (this._useLightVoice() && !this.prefetches.has(item)) {
          await this._playLight(item, generation);
          continue;
        }

        const congestion = computeVoiceCongestion(queueLength);
        // v0.1.1222: 先読み側と同じ実効ブーストを使う(2経路で速度が食い違わないようにする)。
        const effBoostNow = this._resolveEffectiveSpeedBoost(congestion.speedBoost);
        const assigned = this.resolveVoice(item.userKey, this.assignments, this.styleIds);

        // 先頭は _startPrefetch で必ず先読み起動済み(深さ>=1)。その in-flight を再利用する。
        const pf = this.prefetches.get(item);
        this.prefetches.delete(item);
        // v0.1.1089(Phase 2): 先読み済みWAVは pf.boostAtSynth の速度で焼き固まっている。
        //   先読み無し(その場で合成)なら今の実効ブーストがそのまま合成速度=補正不要(等速)。
        const boostAtSynth = pf ? pf.boostAtSynth : effBoostNow;
        const inlineText = pf ? '' : buildMergedVoiceText(item, { maxChars: capVoiceMaxCharsByBoost(effBoostNow, congestion.maxChars) });
        // v0.1.1800: 読んだ文字数(1文字あたりの長さを覚えて、件数の上限を文字数から見積もるため)。
        const spokenChars = pf ? Number(pf.textLength) || 0 : inlineText.length;
        if (this._current && this._current.item === item) this._current.chars = spokenChars;
        const _synthStart = Date.now(); // v0.1.1065計器: 合成待ち(先読み済ならほぼ0)。
        const inlineAbort = pf ? null : new AbortController();
        if (inlineAbort) this._synthAborts.add(inlineAbort);
        let inlinePromise = null;
        if (!pf) {
          inlinePromise = this._synthesizeTracked(
            inlineText,
            {
              ...assigned,
              speedOffset: assigned.speedOffset + effBoostNow
            },
            { signal: inlineAbort.signal }
          ).finally(() => { this._synthAborts.delete(inlineAbort); });
          this._rememberClip(voiceClipKey(assigned, inlineText), effBoostNow, inlinePromise.catch(() => null));
        }
        const wav = pf ? await pf.promise : await inlinePromise;
        this.diag.lastSynthMs = Math.max(0, Date.now() - _synthStart);
        this.diag.lastSpeedBoost = effBoostNow;
        // 2026-07-28計器(段階0=shadow・voice-lag-decomposition-DESIGN.md C-1): 合成待ち時間の
        //   EMA化。先読みが効いていればほぼ0のはず(coldsynth判定の核心=W/S比)。
        this._synthWaitEmaMs = updateVoiceServiceTimeEma(this._synthWaitEmaMs, this.diag.lastSynthMs);
        this.diag.synthWaitEmaMs = this._synthWaitEmaMs;

        // 2026-11-12: 吹き出しの待ちの上限を過ぎた件(dropQueuedAny)は、できあがっても鳴らさない(後から鳴るとずれる)。
        const cancelledByVenue = !!(this._current && this._current.item === item && this._current.cancelled);
        if (!wav || cancelledByVenue || !this.enabled || generation !== this.generation || this.isObsMode()) {
          if (isStreamedVoice(wav)) wav.cancel(); // 鳴らさないので受け取りもやめる
          // v0.1.1213: 合成が null で返った件を数える。ここは以前どのカウンタも増やさずに
          //   捨てており、実配信で「需要52.2/分・読めた6件・間引き12件」=約34件が
          //   どの計器にも乗らない穴になっていた(=なぜ読まれないか答えられない)。
          //   無効化/世代替わり/OBSは別事由なので、合成失敗(!wav)のときだけ数える。
          if (cancelledByVenue) this.diag.venueHoldCancelTotal = (Number(this.diag.venueHoldCancelTotal) || 0) + 1;
          if (!wav) {
            this.diag.synthNullTotal += 1;
            const failure = classifyVoiceSynthNull({ synthMs: this.diag.lastSynthMs });
            if (failure.nearTimeout) this.diag.synthNullNearTimeout += 1;
          }
          if (typeof item.onPlayStart === 'function') item.onPlayStart();
          this._notifyDropped(item); // v0.1.799: 合成失敗/無効化で鳴らず→吹き出しを unvoiced へ
          continue;
        }

        // 再生開始の直前にもう一段、先の合成を深める(消化が進んだぶん次を貯める)。
        this._startPrefetch(generation);

        let objectUrl = '';
        try {
          // 2026-10-22(P2): 文ごとに最大振幅を揃え、音量設定を掛ける(音割れしない範囲)。
          // 2026-10-26: 少しずつ届く声は Web Audio で鳴らす(作れなければ届き終わるのを待って丸ごと)。
          const streamedAudio = isStreamedVoice(wav) && this.createStreamedAudio
            ? this.createStreamedAudio(wav, this.volumePercent)
            : null;
          /** @type {any} */
          let audio = streamedAudio;
          /** @type {{ peak: number, rms: number } | null} */
          let wholeLevel = null;
          if (!audio) {
            const whole = isStreamedVoice(wav) ? (await wav.whenDone, wav.toWav()) : wav;
            const loud = applyVoiceVolumeToWav(whole, this.volumePercent);
            wholeLevel = measureVoiceWavLevel(loud);
            const blob = new Blob([loud], { type: 'audio/wav' });
            objectUrl = this.createObjectURL(blob);
            const AudioCtor = this.audioConstructor;
            audio = new AudioCtor(objectUrl);
          }
          // v0.1.1089(voice-tempo-realtime-SYNTHESIS §3 Phase 2): 再生直前の「今」の混雑度と
          //   合成時点の混雑度を比べ、今の方が詰まっていれば playbackRate で追いつかせる
          //   (合成やり直しなし=ゼロコスト・上げるだけ=間延び退行なし)。
          // v0.1.1222: 「今」の混雑も実効ブースト(pressure込み)で見る。焼き固まった速度との
          //   比較なので、両辺を同じ物差しにしないと playbackRate 補正が過小になる。
          const boostNow = this._resolveEffectiveSpeedBoost(
            computeVoiceCongestion(this.queue.length).speedBoost
          );
          // 少しずつ流す声は速さを変えない(声の高さも変わるため)。待ちが無い時だけ使うので補正はほぼ要らない。
          const playbackRate = streamedAudio ? 1.0 : computeVoicePlaybackRate(boostAtSynth, boostNow);
          if (playbackRate !== 1.0) {
            audio.preservesPitch = true;
            audio.playbackRate = playbackRate;
          }
          // 2026-10-26計器: 聞こえ方(途切れ・つっかえ・音割れ・小さすぎ)を数える(再生には触れない)。
          observeVoicePlayback(audio, {
            diag: this.diag,
            playbackRate,
            outPeak: wholeLevel ? wholeLevel.peak : -1,
            outRms: wholeLevel ? wholeLevel.rms : -1,
            targetPeak: voiceTargetPeak(this.volumePercent),
            onRecorded: () => this._emitDiag()
          });
          // 2026-07-24計器(段階0=shadow): playbackRateが上限で飽和=補正が追いつけていない兆候。
          if (playbackRate >= VOICE_PLAYBACK_RATE_MAX) this.diag.rateClampTotal += 1;

          // 2026-07-28計器(段階0=shadow・voice-lag-decomposition-DESIGN.md C-1): 準備待ち/実再生/
          //   期待再生時間の計測。'playing'は観測専用({once:true}・try/catch)、finish()の
          //   ライフサイクル(resolve/再生制御)には一切介入しない(地雷G-2)。
          const _prepStart = Date.now();
          let _playbackStartAt = -1;
          let _audibleSent = false;
          const notifyAudible = () => {
            if (_audibleSent) return;
            _audibleSent = true;
            try { if (typeof item.onAudible === 'function') item.onAudible(); } catch { /* 枠の失敗で再生を止めない */ }
          };
          try {
            audio.addEventListener('playing', () => {
              notifyAudible();
              try {
                const prepMs = Math.max(0, Date.now() - _prepStart);
                this._playPrepEmaMs = updateVoiceServiceTimeEma(this._playPrepEmaMs, prepMs);
                this.diag.playPrepEmaMs = this._playPrepEmaMs;
                _playbackStartAt = Date.now();
                const durationSec = Number(audio.duration);
                if (this._current && this._current.item === item) this._current.playAt = _playbackStartAt;
                if (Number.isFinite(durationSec) && durationSec > 0) {
                  const expectedMs = (durationSec * 1000) / (Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1);
                  if (this._current && this._current.item === item) this._current.expectedMs = expectedMs;
                  this._expectedPlayEmaMs = updateVoiceServiceTimeEma(this._expectedPlayEmaMs, expectedMs);
                  this.diag.expectedPlayEmaMs = this._expectedPlayEmaMs;
                }
              } catch { /* 計測失敗は本体の再生に影響させない */ }
            }, { once: true });
          } catch { /* addEventListener自体が無いFakeAudio等でも壊れない */ }

          await new Promise((resolve) => {
            let settled = false;
            // v0.1.1065: 再生watchdog(comeview v0.1.883の移植)。'ended'/'error'が一度も来ない
            //   ケース(裏タブ中断・音声デバイス切替・blob再生stall)でawaitが永久pendingになると
            //   この経路は無計器のまま全読み上げが止まり「テンポよく出ない」になる。20秒で強制解放。
            const _watchdog = setTimeout(() => {
              this.diag.playbackTimeoutTotal += 1;
              finish();
            }, 20000);
            const finish = () => {
              if (settled) return;
              settled = true;
              clearTimeout(_watchdog);
              audio.removeEventListener('ended', finish);
              audio.removeEventListener('error', finish);
              if (objectUrl) this.revokeObjectURL(objectUrl);
              objectUrl = '';
              this.stopCurrent = null;
              // 2026-07-28計器(段階0=shadow): 'playing'が発火していれば実再生時間を計測。
              if (_playbackStartAt > 0) {
                try {
                  const playbackMs = Math.max(0, Date.now() - _playbackStartAt);
                  this._playbackEmaMs = updateVoiceServiceTimeEma(this._playbackEmaMs, playbackMs);
                  this.diag.playbackEmaMs = this._playbackEmaMs;
                  noteVoicePacePlayed(this._paceState, playbackMs, playbackRate, boostAtSynth, spokenChars);
                } catch { /* 計測失敗は無視 */ }
              }
              // v0.1.771: 再生が終わった(ended/error/stop)→ 吹き出しに「読み上げ終了」を通知。
              //   これで「声がまだ喋っているのに吹き出しが先に消える」をゼロにできる。
              if (typeof item.onAudioEnd === 'function') item.onAudioEnd();
              resolve();
            };
            this.stopCurrent = () => {
              try { audio.pause(); } catch { /* no-op */ }
              finish();
            };
            audio.addEventListener('ended', finish, { once: true });
            audio.addEventListener('error', finish, { once: true });
            try {
              const playResult = audio.play();
              if (typeof item.onPlayStart === 'function') item.onPlayStart();
              // v0.1.1088計器(設計書§3 Phase 1): 「到着(enqueuedAt)→声が出る(今)」のE2Eを計測。
              //   item に enqueuedAt が無ければ0扱い(壊れず未計測相当のスパイクにしない配慮は
              //   EMA側でなく Math.max(0, ...) で吸収)。再生ロジック自体には触れない(計測のみ)。
              const _enqueuedAt = Number(item.enqueuedAt);
              if (Number.isFinite(_enqueuedAt) && _enqueuedAt > 0) {
                const e2e = Math.max(0, Date.now() - _enqueuedAt);
                this.diag.lastE2eMs = e2e;
                this.diag.e2eAvgMs = computeVoiceE2eAverage(this.diag.e2eAvgMs, e2e);
                recordVoiceE2eSample(this.diag, e2e);
              }
              this._updateLagNotice();
              if (this._current && this._current.item === item) {
                this._current.audioStarted = true;
                if (!this._current.playAt) this._current.playAt = Date.now();
              }
              // v0.1.771: 実際に再生が始まった瞬間だけ通知(drop/merge/失敗では呼ばれない)。
              //   吹き出しはここで speaking になり、onAudioEnd まで消えない。
              if (typeof item.onAudioStart === 'function') item.onAudioStart();
              // 2026-11-12(合唱): 仲間の声を重ねる(覚えた声がある人だけ・合成しない)。
              try { this._playChorusOverlays(item, boostAtSynth, playbackRate); } catch { /* 合唱の失敗は主役の声に影響させない */ }
              if (playResult && typeof playResult.catch === 'function') {
                playResult.catch((err) => {
                  if (err && err.name === 'NotAllowedError') {
                    /*
                     * ★v0.1.1327: ここで disable() しない。
                     *   従来はブロックされるたびに読み上げを OFF に落としており、
                     *   ユーザーには「ONにした直後に勝手に戻る」as見えていた(実機報告
                     *   「一瞬ONになって戻ってしまう」)。
                     *   ブロックは【この1件が鳴らせなかった】だけで、読み上げ機能が
                     *   壊れたわけではない。次のコメントでは解錠済みかもしれない。
                     *   ONのまま案内だけ出し、ユーザーがページを一度クリックすれば
                     *   自然に復帰する(解錠は primeAudioUnlock でも試みている)。
                     */
                    this.diag.audioBlockedTotal = (Number(this.diag.audioBlockedTotal) || 0) + 1;
                    this.onStatus('⚠️ブラウザが音声をブロックしています。ページのどこかを一度クリックすると鳴ります');
                  }
                  finish();
                });
              }
            } catch {
              finish();
            }
          });
        } catch {
          if (typeof item.onPlayStart === 'function') item.onPlayStart();
          // v0.1.799: 再生例外。onAudioStart 済みなら speaking のままで resolved は無視されるため安全。
          //   未再生なら pending→unvoiced で吹き出しを流速寿命へ(床いっぱい残さない)。
          this._notifyDropped(item);
          if (objectUrl) this.revokeObjectURL(objectUrl);
        }
        // 2026-11-12(合唱): 待ちが空いたら、まだ覚えていない仲間の声を1人ぶん作っておく。
        try { this._learnChorusMember(); } catch { /* no-op */ }
        // v0.1.1065計器: 1件完了(comeviewと同じくcatch経路も含む)。
        this.diag.spokenTotal += 1;
        this.diag.lastSpokenBase = Date.now();
        this._spokenSampleCount += 1;
        // 2026-07-24(段階1=apply・council-fable設計venue-bubble-voice-realtime-max-DESIGN.md):
        //   1件あたり処理時間(shift〜再生完了)をEMA化し、そこから実効上限を計算する。
        //   ここで更新したthis._effectiveQueueMaxは次のenqueue時にpushVoiceQueueへ実適用される。
        this._serviceTimeEmaMs = updateVoiceServiceTimeEma(this._serviceTimeEmaMs, Date.now() - _serviceStart);
        const _computedMax = resolveVoiceQueueMax(this._serviceTimeEmaMs);
        const _step = stepVoiceQueueMax(this._effectiveQueueMax, _computedMax, this._growStreak);
        this._effectiveQueueMax = _step.nextMax;
        this._growStreak = _step.nextGrowStreak;
        this.diag.serviceTimeEmaMs = this._serviceTimeEmaMs;
        this.diag.effectiveQueueMax = this._effectiveQueueMax;
        const _voicedDenom = this.diag.spokenTotal + this.diag.staleDropTotal;
        this.diag.voicedRatio = _voicedDenom > 0 ? this.diag.spokenTotal / _voicedDenom : -1;
        // 2026-07-28計器(段階0=shadow・voice-lag-decomposition-DESIGN.md C-3/C-4): 発話成功(hit=1)を
        //   直近voiced率へ・仮説C(hysteresis)検出用capLagTicksを更新し・判定を計算する。
        //   判定(lagVerdict)は印字専用で、この値でキュー制御や混雑ヒューリスティクスは一切変えない。
        this._voicedRecentRatioEma = updateVoiceEventRatioEma(this._voicedRecentRatioEma, 1);
        this.diag.voicedRecentRatio = this._voicedRecentRatioEma;
        {
          const _pressure = (this.diag.arrivalPerMin > 0 && this._serviceTimeEmaMs > 0)
            ? (this.diag.arrivalPerMin * this._serviceTimeEmaMs) / 60000
            : -1;
          this._capLagTicks = (_pressure >= 0 && _pressure <= 1.2 && _computedMax - this._effectiveQueueMax >= 2)
            ? this._capLagTicks + 1
            : 0;
          this.diag.lagVerdict = computeVoiceLagVerdict({
            serviceTimeEmaMs: this._serviceTimeEmaMs,
            synthWaitEmaMs: this._synthWaitEmaMs,
            expectedPlayEmaMs: this._expectedPlayEmaMs,
            playbackEmaMs: this._playbackEmaMs,
            arrivalPerMin: this.diag.arrivalPerMin,
            effectiveQueueMax: this._effectiveQueueMax,
            computedMax: _computedMax,
            capLagTicks: this._capLagTicks,
            sampleCount: this._spokenSampleCount
          });
        }
        this._emitDiag();
      }
    } finally {
      this.playing = false;
      this._current = null;
      this._updateLagNotice(); // 待ちが空になったら遅れの一言を消す。
      if (this.enabled && this.queue.length) void this._drainQueue();
    }
  }

  /** P5: 遅れの一言を出す/消す(状態が変わったときだけ通知)。 */
  _updateLagNotice() {
    this._updateGpuTip();
    const r = decideVoiceLagNotice(this._lagNoticeShown, { ...this.diag, queueNow: this.queue.length }, { gpuCapable: this._gpuCapable });
    if (r.shown === this._lagNoticeShown && !r.shown) return;
    this._lagNoticeShown = r.shown;
    try { this.onLagNotice(r.text); } catch { /* no-op: 表示の失敗は読み上げに影響させない */ }
  }

  /** 2026-11-01: GPU の案内を出す/消す(文言が変わったときだけ通知)。 */
  _updateGpuTip() {
    const text = this.enabled ? decideVoiceGpuTip(this.diag, this._gpuCapable) : '';
    if (text === this._gpuTipText) return;
    this._gpuTipText = text;
    try { this.onGpuTip(text); } catch { /* no-op: 表示の失敗は読み上げに影響させない */ }
  }

  enqueue(items) {
    if (!this.enabled || this.isObsMode() || !Array.isArray(items)) return;
    let droppedCount = 0;
    for (const item of items) {
      if (!item || (item.kind !== 'comment' && item.kind !== 'gift')) continue;
      // v0.1.1812: コメビュで NG にした人は読まない(画面から消した人の声だけ聞こえる食い違いをなくす)。
      if (isVoiceItemNgMuted(item, this.ngKeys)) {
        this.diag.ngMutedTotal = (Number(this.diag.ngMutedTotal) || 0) + 1;
        this._notifyDropped(item);
        continue;
      }

      const name = this.readNameEnabled ? String(item.nickname || '').trim() : '';
      let body = '';
      if (item.kind === 'gift') {
        const count = item.gift?.count > 1 ? `を${item.gift.count}個` : 'を';
        body = `ギフト、${item.gift?.name || 'アイテム'}${count}贈りました。${item.gift?.message || ''}`.trim();
      } else {
        body = String(item.text || '').trim();
      }

      // v0.1.1811: 読む文字が無い(絵文字・記号だけ)ときも「鳴らない」と知らせる(吹き出しを合成待ちのまま8秒残さない)。
      if (!buildVoiceReadingText({ name, text: body })) { this._notifyDropped(item); continue; }

      // 2026-10-22計器(P1): 受信→キュー投入。保存のまとめ書き(最大1.5秒)等の上流の遅れ。
      //   receivedAt は呼び出し側(会場)が渡す受信時刻(無ければ計測しない)。
      const _upstreamMs = measureVoiceGapMs(item.receivedAt, Date.now());
      if (_upstreamMs >= 0) {
        this.diag.lastUpstreamMs = _upstreamMs;
        foldVoiceStageEma(this.diag, 'upstreamEmaMs', _upstreamMs);
      }

      // 2026-07-28計器(段階0=shadow・voice-lag-decomposition-DESIGN.md C-3): 有効候補
      //   (テキスト構築に成功した=読み上げ対象になりうる)ごとに到着窓を畳む(件/分)。
      //   merge吸収分もここで数える(別コメントとして到着している需要のため)。
      this._arrivalWindowState = foldVoiceArrivalWindow(this._arrivalWindowState, Date.now(), 1);
      this.diag.arrivalPerMin = this._arrivalWindowState.arrivalPerMin;

      // v0.1.1861: 混雑(読み上げ待ち2件以上)のときは大事なもの(ギフト・広告・配信者・その配信で
      //   初めてのコメント)だけ読む。吹き出しは出す(onDropped で声なしの寿命へ)。初めてかどうかは
      //   読まなかった件でも覚える(次のコメントは「2回目」)。
      const userKey = this._voiceUserKeyForItem(item);
      const importance = classifyVoiceImportance({
        kind: item.kind,
        text: item.kind === 'gift' ? '' : body,
        userId: item.userId,
        isModerator: item.isModerator,
        broadcasterUid: item.broadcasterUid,
        firstInLive: noteVoiceSpeakerInLive(this._firstSpeakerState, item.liveId, userKey)
      });
      // 2026-11-12(合唱): 待っている件と同じ言葉を別の人が書いたら、その件の合唱に加える
      //   (別の1件として読まない=読み上げの待ちを増やさない)。大事なものは合唱にせず1件で読む。
      if (this.chorusEnabled) {
        const hostIdx = findVoiceChorusHost(this.queue, { body, userKey, importance });
        if (hostIdx >= 0 && joinVoiceChorus(this.queue[hostIdx], userKey) !== 'dup') {
          this.diag.chorusJoinTotal = (Number(this.diag.chorusJoinTotal) || 0) + 1;
          if (typeof item.onPlayStart === 'function') { try { item.onPlayStart(); } catch { /* no-op */ } }
          this._notifyDropped(item);
          continue;
        }
      }

      // 2026-11-12: 覚えた声がある短文は合成ゼロで鳴らせるので、混雑中でも読む(1人1声のまま)。
      const busySkip = shouldSkipVoiceWhenBusy({ queueLength: this.queue.length, importance });
      const clipReady = busySkip && this._clipCache.has(this._clipKeyFor({ userKey, name, body, count: 1 }));
      if (clipReady) this.diag.clipBusyKeepTotal = (Number(this.diag.clipBusyKeepTotal) || 0) + 1;
      if (busySkip && !clipReady) {
        this.diag.busySkipTotal = (Number(this.diag.busySkipTotal) || 0) + 1;
        if (typeof item.onPlayStart === 'function') { try { item.onPlayStart(); } catch { /* no-op */ } }
        this._notifyDropped(item);
        continue;
      }
      if (importance && this.queue.length >= VOICE_BUSY_QUEUE_MIN) {
        this.diag.busyImportantTotal = (Number(this.diag.busyImportantTotal) || 0) + 1;
      }

      const candidate = {
        userKey,
        name,
        body,
        count: 1,
        enqueuedAt: Date.now(),
        priority: voicePriorityForImportance(importance),
        /** 2026-11-12: 大事なもの(配信者・初コメも)。会場が「見込みが長いので読まない」から外す。 */
        importance,
        // onPlayStart: 「item が消費された(再生/破棄/merge/失敗)」= resolved 信号(後方互換)。
        onPlayStart: item.onPlayStart,
        // v0.1.771: 吹き出しを読み上げに連動させるため、実際の再生開始/終了だけを通知する。
        //   onAudioStart は audio.play() が実際に走ったときだけ・onAudioEnd は再生終了(ended/error/stop)時。
        onAudioStart: item.onAudioStart,
        onAudioEnd: item.onAudioEnd,
        // 音が実際に出た瞬間(audio の playing / 少しずつ鳴らす開始 / PC の声の onstart)。play() を呼んだ瞬間ではない。
        onAudible: item.onAudible,
        // v0.1.799: 鳴らず破棄された時だけ発火する drop 専用シグナル(再生では呼ばれない)。
        onDropped: item.onDropped
      };

      this.diag.voiceEnqueuedTotal = (Number(this.diag.voiceEnqueuedTotal) || 0) + 1; // v0.1.1776計器: 読む列に来た件数
      const merged = mergeRepeatedVoiceItem(this.queue, candidate);
      this.queue = merged.queue;
      if (merged.merged) {
        this.diag.mergeTotal += 1; // v0.1.1088計器: 統合が効いているかの累計(無計器だった)。
        if (typeof candidate.onPlayStart === 'function') candidate.onPlayStart();
        this._notifyDropped(candidate); // v0.1.799: merge で吸収=この吹き出しは別途鳴らない→unvoiced へ
        continue;
      }
      
      // v0.1.782: わんコメ(OneComme limitQueue=10)に倣い、リアルタイム維持の主軸を
      //   【件数ゲート(最古drop)】に置く。上限を 12→8 に下げ、ラグを「8件 × 再生1本」に有界化。
      //   溢れたら最古から捨てる=常に直近コメントが読まれ、絶対にゼロ音声にならない。時間ゲート
      //   (voiceAgeGate)は安全網(8秒・タブ凍結放置だけ落とす)に格下げ済み。
      // 2026-07-24(段階1=apply・council-fable設計venue-bubble-voice-realtime-max-DESIGN.md): 8固定は
      //   天井のみ(voiceLagBudget.VOICE_QUEUE_MAX_CEIL)。実際のmaxは処理時間EMAから動的算出した
      //   this._effectiveQueueMax(床2〜天井8)。実配信で処理時間が伸びた(1703ms/件)ときに8件固定だと
      //   ラグ上界が安全網(8000ms)を超えるのを、実効上限の動的縮小で構造的に防ぐ。
      // v0.1.1800: 待っている件の文字数から上限を見積もる(長い声の直後に平均が膨らんで、続く短い
      //   コメントまで飛ばしていた)。見積もれなければ従来の this._effectiveQueueMax。
      const queueMax = this._resolveQueueMaxByChars(candidate);
      const pushed = pushVoiceQueue(this.queue, candidate, { max: queueMax, keep: this._inflightKeeper() });
      this.queue = pushed.queue;
      noteVoicePaceArrival(this._paceState, candidate.enqueuedAt);
      
      if (pushed.dropped && pushed.dropped.length > 0) {
        for (const dropped of pushed.dropped) {
          if (typeof dropped.onPlayStart === 'function') dropped.onPlayStart();
          this._notifyDropped(dropped); // v0.1.799: 件数ゲートで最古drop→吹き出しを unvoiced へ
        }
        droppedCount += pushed.dropped.length;
      }
    }

    if (droppedCount > 0) {
      this._showSkipped(droppedCount);
      this.diag.staleDropTotal += droppedCount; // 件数ゲート(最古drop)も間引きとして計上。
      // 2026-07-28計器(段階0=shadow): 件数ゲート最古drop(3地点のうちの1つ)。
      this._dropCountGateTotal += droppedCount;
      this.diag.dropCountGateTotal = this._dropCountGateTotal;
      for (let _i = 0; _i < droppedCount; _i += 1) {
        this._voicedRecentRatioEma = updateVoiceEventRatioEma(this._voicedRecentRatioEma, 0);
      }
      this.diag.voicedRecentRatio = this._voicedRecentRatioEma;
    }
    this._emitDiag();
    // v0.1.800「吹き出しと読み上げを同時に」(会議 案B): enqueue した瞬間にキュー先頭の合成を
    //   即起動して、再生開始までの待ち(Δ)を縮める。再生中(playing)でも prefetch は並走できる
    //   (_drainQueue は playing なら return するが prefetch は別)。順序は変えない(FIFO 不変=
    //   どの声がどの吹き出しか崩さない)。深さは resolveVoiceSynthDepth で有界=速い配信でも暴走しない。
    if (this.enabled && !this.isObsMode() && this.queue.length) {
      try { this._startPrefetch(this.generation); } catch { /* no-op: 先回し合成失敗は再生に影響させない */ }
    }
    if (this.queue.length) void this._drainQueue();
  }

  /**
   * v0.1.800: 外部(会場)から「今キューにある先頭群の合成を即起動」するための公開フック。
   *   吹き出しを出した直後に呼ぶと、再生開始までの待ち(Δ)が合成時間まで縮む。深さ有界・FIFO不変。
   */
  kickPrefetch() {
    if (!this.enabled || this.isObsMode() || !this.queue.length) return;
    try { this._startPrefetch(this.generation); } catch { /* no-op */ }
  }
}
