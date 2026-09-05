// @ts-nocheck — VoicePlayer は依存注入(deps)クラス。型は呼び出し側の配線で担保。
//   comeview-entry.js と同じ方針(@ts-nocheck)。ロジックは変更しない。
import { buildVoiceReadingText, buildMergedVoiceText } from './voicevoxClient.js';
import { isVoiceItemStale } from './voiceAgeGate.js';
import { classifyVoiceSynthNull } from './voiceSynthFailure.js';
import {
  KEY_VOICE_ASSIGNMENTS,
  KEY_VOICE_READ_NAME_ENABLED,
  KEY_VOICE_READING_ENABLED
} from './voiceKeys.js';
import { classifyVoiceSynthFailureReason } from './voiceSynthFailureReason.js';
import {
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
  computeSustainedPressureBoost, mergeVoiceSpeedBoost
} from './voiceLagBudget.js';

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
    this.fetchSynthesizeVoice = deps.fetchSynthesizeVoice;
    this.resolveVoice = deps.resolveVoice;

    this.enabled = false;
    this.readNameEnabled = false;
    this.toggleBusy = false;
    this.styleIds = [];
    this.assignments = {};
    this.queue = [];
    // v0.1.768: 先読み合成を【深さ1→最大3】に。単一スロット this.prefetch から、
    //   item オブジェクトをキーに「合成中の WAV Promise」を持つ Map に拡張。
    //   再生中に N+1 だけでなく N+2/N+3 も先行合成し、フラッド時に合成を遊ばせない。
    this.prefetches = new Map();
    this.playing = false;
    this.generation = 0;
    this.stopCurrent = null;
    this.skipTimer = null;
    // v0.1.1065: 会場読み上げの計器。comeview(KEY_VOICE_DIAG)と同形のカウンタを持ち、
    //   onDiag(注入)経由で呼び出し元がstorageへ書く。従来この経路は完全に無計器で、
    //   状態速報の「会場読み上げ」行が別経路(comeview)の化石を表示し続けていた。
    this.onDiag = deps.onDiag || (() => {});
    // 2026-07-24 会場読み上げの件数ゲート実効上限state(council-fable設計・段階1=apply)。
    //   serviceTimeEma=1件あたり処理時間のEMA、effectiveQueueMax=そこから計算した実効上限
    //   (pushVoiceQueueのmaxに実適用・床2〜天井8)、growStreak=復帰ヒステリシスの連続カウンタ。
    this._serviceTimeEmaMs = -1;
    this._effectiveQueueMax = 8;
    this._growStreak = 0;
    // 2026-07-28(段階0=shadow・council-fable設計voice-lag-decomposition-DESIGN.md): 体感遅延
    //   真因診断の内部state。印字のみ・挙動には一切使わない(DESIGN.md鉄則: 判定で挙動を変えない)。
    this._synthWaitEmaMs = -1;
    this._playPrepEmaMs = -1;
    this._playbackEmaMs = -1;
    this._expectedPlayEmaMs = -1;
    this._arrivalWindowState = null;
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
      lastSustainedBoost: 0, sustainedBoostTotal: 0,
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
      lagVerdict: '', diagBornAt: this._diagBornAt
    };
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
          this.VOICE_READ_NAME_KEY
        ]);
      }
    } catch {
      bag = {};
    }
    const rawAssignments = bag[this.VOICE_ASSIGNMENTS_KEY];
    this.assignments = (!rawAssignments || typeof rawAssignments !== 'object' || Array.isArray(rawAssignments)) ? {} : rawAssignments;
    this.readNameEnabled = bag[this.VOICE_READ_NAME_KEY] === true;

    this._emitToggle();

    const forceOn = opts.forceOn === true;
    if (forceOn || bag[this.VOICE_READING_ENABLED_KEY] === true) {
      // forceOn のときは storage にも残す(persist:true)。保存復元のときは false(既存挙動維持)。
      await this.enable({ persist: forceOn });
    }
  }

  _emitToggle() {
    this.onToggle(this.enabled, this.readNameEnabled, this.toggleBusy);
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

  stop() {
    const dropped = this.queue;
    this.queue = [];
    this.generation += 1;
    this.prefetches.clear();
    // v0.1.799: 破棄した待機 item の吹き出しを unvoiced へ(pending のまま床いっぱい残さない)。
    for (const item of dropped) this._notifyDropped(item);
    if (typeof this.stopCurrent === 'function') this.stopCurrent();
    this.stopCurrent = null;
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
    this.enabled = false;
    this.toggleBusy = false;
    this.stop();
    this.onLoadingState('idle');
    this._emitToggle();
    if (persist && this.storage) {
      this.storage.set({ [this.VOICE_READING_ENABLED_KEY]: false }).catch(() => {});
    }
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
    if (this.isObsMode() || this.toggleBusy) return;
    this.toggleBusy = true;
    this._emitToggle();
    // ★v0.1.1327: 非同期処理に入る【前】に解錠する。ここが唯一「クリックの延長」に
    //   居られる瞬間で、await を挟んだ後では手遅れになる。
    await this.primeAudioUnlock();
    // v0.1.770: 起動待ちの表示は onLoadingState(状態)が所有する(遅延ガードで一瞬成功はチラつかせない)。
    //   onStatus(テキスト)は audio ブロック警告など臨時メッセージ専用に残す。
    this.onLoadingState('checking');

    // 2026-06-14: 会場モード(content script・SW プロキシ経由)では MV3 SW のコールド起床で
    //   初回の生存確認がタイムアウトしやすい。初回失敗時に再試行する(SW が起きた後の
    //   2回目はほぼ通る)。VOICEVOX が本当に未起動なら全部失敗して従来どおり案内を出す。
    //
    // ★v0.1.1326(ユーザー実機「押してもONにならない」の根治):
    //   ① 再試行を 1回 → 3回(バックオフ 0/500/1500ms)。MV3 SW の起床が 5000ms でも
    //      間に合わないことがあり、1回の再試行では取りこぼしていた。
    //   ② 失敗しても【OFF を永続保存しない】(persist:false)。従来は disable({persist:true})
    //      でユーザーの「ONにしたい」意思を storage に消しに行っており、これが
    //      「押しても勝手にOFFに戻る」の直接原因だった。
    //   ③ 失敗理由(timeout/refused/http-error)を画面に渡す。VOICEVOX が起動しているのに
    //      「見つかりません」と言っていた誤案内の是正(ユーザー指摘「たちあがってるけどね」)。
    let probe = await this.probeVoicevoxAlive();
    if (!probe.ok) {
      this.onLoadingState('connecting');
      for (const waitMs of VOICE_ALIVE_RETRY_BACKOFF_MS) {
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
        probe = await this.probeVoicevoxAlive();
        if (probe.ok) break;
      }
    }
    if (!probe.ok) {
      /*
       * ★v0.1.1331: 失敗理由を【計器にも】残す。
       *   従来は onLoadingState(画面表示)にしか渡しておらず、ユーザーが
       *   「押しても一瞬で戻る」と報告しても、状態速報には理由が1文字も出なかった
       *   =受け取った側(私)が原因を特定できず、推測で版を重ねることになった。
       *   ★画面に出すだけの情報は、報告に乗らない=無いのと同じ。
       */
      this.diag.lastEnableFailReason = String(probe.reason || 'unknown');
      this.diag.enableFailTotal = (Number(this.diag.enableFailTotal) || 0) + 1;
      this._emitDiag();
      // ★persist:false = ユーザーの意思を消さない。次に押せばまた試せる。
      this.disable({ persist: false });
      this.onLoadingState('notfound', probe.reason);
      this.toggleBusy = false;
      this._emitToggle();
      return;
    }

    this.styleIds = await this.fetchVoiceStyleIds();
    this.generation += 1;
    this.enabled = true;
    // ★v0.1.1331: 成功したら理由を消す(古い失敗が残り続けて誤診させない)。
    this.diag.lastEnableFailReason = '';
    this._emitDiag();
    this.toggleBusy = false;
    this.onLoadingState('ready');
    this._emitToggle();
    if (persist && this.storage) {
      this.storage.set({ [this.VOICE_READING_ENABLED_KEY]: true }).catch(() => {});
    }
  }

  _voiceUserKeyForItem(item) {
    const userId = String(item?.userId || '').trim();
    const name = String(item?.nickname || '').trim();
    const key = String(item?.userKey || item?.key || '').trim();
    return userId || key || name || 'anon';
  }

  /** item 1件ぶんの合成を起動し、in-flight WAV Promise を返す(まだ無ければ）。 */
  _ensurePrefetch(item, generation) {
    if (!item || generation !== this.generation) return null;
    const existing = this.prefetches.get(item);
    if (existing && existing.generation === generation) return existing.promise;
    const congestion = computeVoiceCongestion(this.queue.length);
    // v0.1.1222: 実効上限が絞られるとキューが5件に届かず congestion の上位段が発火しない構造穴を
    //   pressure(需要/供給比)由来のブーストで埋める。上げるだけ・落ち着いていれば0。
    const effBoost = this._resolveEffectiveSpeedBoost(congestion.speedBoost);
    const assigned = this.resolveVoice(item.userKey, this.assignments, this.styleIds);
    const promise = this.fetchSynthesizeVoice(
      buildMergedVoiceText(item, { maxChars: congestion.maxChars }),
      {
        ...assigned,
        speedOffset: assigned.speedOffset + effBoost
      },
      // v0.1.1224: 失敗理由を計器へ。第3引数(opts)は既存呼び出しに無くても壊れない。
      { onFailure: (info) => this._recordSynthFailureReason(info) }
    ).catch(() => null);
    // v0.1.1089(voice-tempo-realtime-SYNTHESIS §3 Phase 2): 合成起動時点のspeedBoostを保存する。
    //   このWAVは既にこの速度で焼き固まっているため、再生直前に「今」の混雑度と比較して
    //   playbackRateで追いつかせる(合成のやり直しなし=ゼロコスト)。
    this.prefetches.set(item, { generation, promise, boostAtSynth: effBoost });
    return promise;
  }

  /**
   * v0.1.1224: 合成失敗の理由を1件記録する。voicevoxClient の onFailure から呼ばれる。
   * @param {{ stage?: string, error?: unknown, httpStatus?: number, bodyInvalid?: boolean }} info
   */
  _recordSynthFailureReason(info) {
    try {
      const reason = classifyVoiceSynthFailureReason(info);
      const bag = this.diag.synthFailReasons || (this.diag.synthFailReasons = {});
      bag[reason] = (Number(bag[reason]) || 0) + 1;
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
    const merged = mergeVoiceSpeedBoost(congestionBoost, sustained);
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
      this.prefetches.clear();
      return;
    }
    const depth = resolveVoiceSynthDepth(this.queue.length, {
      pending: this.queue.length
    });
    // v0.1.1088計器(設計書§2): diag.lastDepth は宣言のみでどこからも代入されていなかった
    //   化石計器。ここで実値を代入して修理する(先読み深さの実測)。
    this.diag.lastDepth = depth;
    const wanted = new Set();
    for (let i = 0; i < depth && i < this.queue.length; i++) {
      const item = this.queue[i];
      if (!item) continue;
      wanted.add(item);
      this._ensurePrefetch(item, generation);
    }
    // キューから消えた item の先読みは破棄(取りこぼした WAV は GC される=メモリ有界)。
    for (const key of this.prefetches.keys()) {
      if (!wanted.has(key)) this.prefetches.delete(key);
    }
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
          const dropped = this.queue.slice(0, this.queue.length - 1);
          for (const d of dropped) {
            if (typeof d.onPlayStart === 'function') d.onPlayStart();
            this._notifyDropped(d); // v0.1.799: 鳴らず破棄→吹き出しを unvoiced へ
          }
          this.queue = [newest];
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
        // 2026-07-24計器(段階0=shadow): 1件あたり処理時間(shift〜再生完了)の起点。
        //   staleで即時破棄されたitemは合成/再生を伴わないため計測対象外(下のstale分岐でreturn)。
        const _serviceStart = Date.now();

        const ageCheck = isVoiceItemStale(item.enqueuedAt, Date.now(), queueLength, item.priority === 'high');
        if (ageCheck.stale) {
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
        const _synthStart = Date.now(); // v0.1.1065計器: 合成待ち(先読み済ならほぼ0)。
        const wav = pf
          ? await pf.promise
          : await this.fetchSynthesizeVoice(
              buildMergedVoiceText(item, { maxChars: congestion.maxChars }),
              {
                ...assigned,
                speedOffset: assigned.speedOffset + effBoostNow
              },
              { onFailure: (info) => this._recordSynthFailureReason(info) }
            );
        this.diag.lastSynthMs = Math.max(0, Date.now() - _synthStart);
        this.diag.lastSpeedBoost = effBoostNow;
        // 2026-07-28計器(段階0=shadow・voice-lag-decomposition-DESIGN.md C-1): 合成待ち時間の
        //   EMA化。先読みが効いていればほぼ0のはず(coldsynth判定の核心=W/S比)。
        this._synthWaitEmaMs = updateVoiceServiceTimeEma(this._synthWaitEmaMs, this.diag.lastSynthMs);
        this.diag.synthWaitEmaMs = this._synthWaitEmaMs;

        if (!wav || !this.enabled || generation !== this.generation || this.isObsMode()) {
          // v0.1.1213: 合成が null で返った件を数える。ここは以前どのカウンタも増やさずに
          //   捨てており、実配信で「需要52.2/分・読めた6件・間引き12件」=約34件が
          //   どの計器にも乗らない穴になっていた(=なぜ読まれないか答えられない)。
          //   無効化/世代替わり/OBSは別事由なので、合成失敗(!wav)のときだけ数える。
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
          const blob = new Blob([wav], { type: 'audio/wav' });
          objectUrl = this.createObjectURL(blob);
          const AudioCtor = this.audioConstructor;
          const audio = new AudioCtor(objectUrl);
          // v0.1.1089(voice-tempo-realtime-SYNTHESIS §3 Phase 2): 再生直前の「今」の混雑度と
          //   合成時点の混雑度を比べ、今の方が詰まっていれば playbackRate で追いつかせる
          //   (合成やり直しなし=ゼロコスト・上げるだけ=間延び退行なし)。
          // v0.1.1222: 「今」の混雑も実効ブースト(pressure込み)で見る。焼き固まった速度との
          //   比較なので、両辺を同じ物差しにしないと playbackRate 補正が過小になる。
          const boostNow = this._resolveEffectiveSpeedBoost(
            computeVoiceCongestion(this.queue.length).speedBoost
          );
          const playbackRate = computeVoicePlaybackRate(boostAtSynth, boostNow);
          if (playbackRate !== 1.0) {
            audio.preservesPitch = true;
            audio.playbackRate = playbackRate;
          }
          // 2026-07-24計器(段階0=shadow): playbackRateが上限で飽和=補正が追いつけていない兆候。
          if (playbackRate >= VOICE_PLAYBACK_RATE_MAX) this.diag.rateClampTotal += 1;

          // 2026-07-28計器(段階0=shadow・voice-lag-decomposition-DESIGN.md C-1): 準備待ち/実再生/
          //   期待再生時間の計測。'playing'は観測専用({once:true}・try/catch)、finish()の
          //   ライフサイクル(resolve/再生制御)には一切介入しない(地雷G-2)。
          const _prepStart = Date.now();
          let _playbackStartAt = -1;
          try {
            audio.addEventListener('playing', () => {
              try {
                const prepMs = Math.max(0, Date.now() - _prepStart);
                this._playPrepEmaMs = updateVoiceServiceTimeEma(this._playPrepEmaMs, prepMs);
                this.diag.playPrepEmaMs = this._playPrepEmaMs;
                _playbackStartAt = Date.now();
                const durationSec = Number(audio.duration);
                if (Number.isFinite(durationSec) && durationSec > 0) {
                  const expectedMs = (durationSec * 1000) / (Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1);
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
              }
              // v0.1.771: 実際に再生が始まった瞬間だけ通知(drop/merge/失敗では呼ばれない)。
              //   吹き出しはここで speaking になり、onAudioEnd まで消えない。
              if (typeof item.onAudioStart === 'function') item.onAudioStart();
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
      if (this.enabled && this.queue.length) void this._drainQueue();
    }
  }

  enqueue(items) {
    if (!this.enabled || this.isObsMode() || !Array.isArray(items)) return;
    let droppedCount = 0;
    for (const item of items) {
      if (!item || (item.kind !== 'comment' && item.kind !== 'gift')) continue;
      
      const name = this.readNameEnabled ? String(item.nickname || '').trim() : '';
      let body = '';
      let isHighPriority = false;
      
      if (item.kind === 'gift') {
        isHighPriority = true;
        const count = item.gift?.count > 1 ? `を${item.gift.count}個` : 'を';
        body = `ギフト、${item.gift?.name || 'アイテム'}${count}贈りました。${item.gift?.message || ''}`.trim();
      } else {
        body = String(item.text || '').trim();
      }

      if (!buildVoiceReadingText({ name, text: body })) continue;

      // 2026-07-28計器(段階0=shadow・voice-lag-decomposition-DESIGN.md C-3): 有効候補
      //   (テキスト構築に成功した=読み上げ対象になりうる)ごとに到着窓を畳む(件/分)。
      //   merge吸収分もここで数える(別コメントとして到着している需要のため)。
      this._arrivalWindowState = foldVoiceArrivalWindow(this._arrivalWindowState, Date.now(), 1);
      this.diag.arrivalPerMin = this._arrivalWindowState.arrivalPerMin;

      const candidate = {
        userKey: this._voiceUserKeyForItem(item),
        name,
        body,
        count: 1,
        enqueuedAt: Date.now(),
        priority: isHighPriority ? 'high' : 'normal',
        // onPlayStart: 「item が消費された(再生/破棄/merge/失敗)」= resolved 信号(後方互換)。
        onPlayStart: item.onPlayStart,
        // v0.1.771: 吹き出しを読み上げに連動させるため、実際の再生開始/終了だけを通知する。
        //   onAudioStart は audio.play() が実際に走ったときだけ・onAudioEnd は再生終了(ended/error/stop)時。
        onAudioStart: item.onAudioStart,
        onAudioEnd: item.onAudioEnd,
        // v0.1.799: 鳴らず破棄された時だけ発火する drop 専用シグナル(再生では呼ばれない)。
        onDropped: item.onDropped
      };

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
      const pushed = pushVoiceQueue(this.queue, candidate, { max: this._effectiveQueueMax });
      this.queue = pushed.queue;
      
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
