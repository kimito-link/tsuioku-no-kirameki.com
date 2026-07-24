// @ts-nocheck — VoicePlayer は依存注入(deps)クラス。型は呼び出し側の配線で担保。
//   comeview-entry.js と同じ方針(@ts-nocheck)。ロジックは変更しない。
import { buildVoiceReadingText, buildMergedVoiceText } from './voicevoxClient.js';
import { isVoiceItemStale } from './voiceAgeGate.js';
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
import { updateVoiceServiceTimeEma, resolveVoiceQueueMax, stepVoiceQueueMax } from './voiceLagBudget.js';

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
    this.createObjectURL = deps.createObjectURL;
    this.revokeObjectURL = deps.revokeObjectURL;
    this.fetchVoicevoxAlive = deps.fetchVoicevoxAlive;
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
      serviceTimeEmaMs: -1, effectiveQueueMax: 8, rateClampTotal: 0, voicedRatio: -1
    };
  }

  _emitDiag() {
    this.diag.enabled = this.enabled;
    this.diag.queueNow = this.queue.length;
    if (this.queue.length > this.diag.queueMax) this.diag.queueMax = this.queue.length;
    try { this.onDiag(this.diag); } catch { /* 計器は本体の再生を妨げない */ }
  }

  get VOICE_READING_ENABLED_KEY() { return 'nls_voice_reading_enabled_v1'; }
  get VOICE_ASSIGNMENTS_KEY() { return 'nls_voice_assignments_v1'; }
  get VOICE_READ_NAME_KEY() { return 'nls_voice_read_name_enabled_v1'; }

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

  async enable({ persist = true } = {}) {
    if (this.isObsMode() || this.toggleBusy) return;
    this.toggleBusy = true;
    this._emitToggle();
    // v0.1.770: 起動待ちの表示は onLoadingState(状態)が所有する(遅延ガードで一瞬成功はチラつかせない)。
    //   onStatus(テキスト)は audio ブロック警告など臨時メッセージ専用に残す。
    this.onLoadingState('checking');

    // 2026-06-14: 会場モード(content script・SW プロキシ経由)では MV3 SW のコールド起床で
    //   初回の生存確認がタイムアウトしやすい。初回失敗時に1回だけ再試行する(SW が起きた後の
    //   2回目はほぼ通る)。VOICEVOX が本当に未起動なら2回とも失敗して従来どおり案内を出す。
    let alive = await this.fetchVoicevoxAlive();
    if (!alive) {
      this.onLoadingState('connecting');
      alive = await this.fetchVoicevoxAlive();
    }
    if (!alive) {
      this.disable({ persist: true });
      this.onLoadingState('notfound');
      return;
    }

    this.styleIds = await this.fetchVoiceStyleIds();
    this.generation += 1;
    this.enabled = true;
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
    const assigned = this.resolveVoice(item.userKey, this.assignments, this.styleIds);
    const promise = this.fetchSynthesizeVoice(
      buildMergedVoiceText(item, { maxChars: congestion.maxChars }),
      {
        ...assigned,
        speedOffset: assigned.speedOffset + congestion.speedBoost
      }
    ).catch(() => null);
    // v0.1.1089(voice-tempo-realtime-SYNTHESIS §3 Phase 2): 合成起動時点のspeedBoostを保存する。
    //   このWAVは既にこの速度で焼き固まっているため、再生直前に「今」の混雑度と比較して
    //   playbackRateで追いつかせる(合成のやり直しなし=ゼロコスト)。
    this.prefetches.set(item, { generation, promise, boostAtSynth: congestion.speedBoost });
    return promise;
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
          this._emitDiag();
          this.prefetches.delete(item);
          continue;
        }

        const congestion = computeVoiceCongestion(queueLength);
        const assigned = this.resolveVoice(item.userKey, this.assignments, this.styleIds);

        // 先頭は _startPrefetch で必ず先読み起動済み(深さ>=1)。その in-flight を再利用する。
        const pf = this.prefetches.get(item);
        this.prefetches.delete(item);
        // v0.1.1089(Phase 2): 先読み済みWAVは pf.boostAtSynth の速度で焼き固まっている。
        //   先読み無し(その場で合成)なら今の congestion.speedBoost がそのまま合成速度=補正不要(等速)。
        const boostAtSynth = pf ? pf.boostAtSynth : congestion.speedBoost;
        const _synthStart = Date.now(); // v0.1.1065計器: 合成待ち(先読み済ならほぼ0)。
        const wav = pf
          ? await pf.promise
          : await this.fetchSynthesizeVoice(
              buildMergedVoiceText(item, { maxChars: congestion.maxChars }),
              {
                ...assigned,
                speedOffset: assigned.speedOffset + congestion.speedBoost
              }
            );
        this.diag.lastSynthMs = Math.max(0, Date.now() - _synthStart);
        this.diag.lastSpeedBoost = congestion.speedBoost;

        if (!wav || !this.enabled || generation !== this.generation || this.isObsMode()) {
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
          const boostNow = computeVoiceCongestion(this.queue.length).speedBoost;
          const playbackRate = computeVoicePlaybackRate(boostAtSynth, boostNow);
          if (playbackRate !== 1.0) {
            audio.preservesPitch = true;
            audio.playbackRate = playbackRate;
          }
          // 2026-07-24計器(段階0=shadow): playbackRateが上限で飽和=補正が追いつけていない兆候。
          if (playbackRate >= VOICE_PLAYBACK_RATE_MAX) this.diag.rateClampTotal += 1;

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
                    this.onStatus('⚠️ブラウザにより音声がブロックされました。ボタンを押し直してください');
                    this.disable({ persist: false });
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
