// @ts-nocheck — VoicePlayer は依存注入(deps)クラス。型は呼び出し側の配線で担保。
//   comeview-entry.js と同じ方針(@ts-nocheck)。ロジックは変更しない。
import { buildVoiceReadingText, buildMergedVoiceText } from './voicevoxClient.js';
import { isVoiceItemStale } from './voiceAgeGate.js';
import {
  computeVoiceCongestion,
  mergeRepeatedVoiceItem,
  pushVoiceQueue,
  resolveVoiceSynthDepth
} from './voiceReadQueue.js';

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

  stop() {
    this.queue = [];
    this.generation += 1;
    this.prefetches.clear();
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
    this.prefetches.set(item, { generation, promise });
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
          const dropCount = this.queue.length;
          for (const dropped of this.queue) {
            if (typeof dropped.onPlayStart === 'function') dropped.onPlayStart();
          }
          this.queue = [];
          this._showSkipped(dropCount);
          break;
        }

        const queueLength = this.queue.length;
        const generation = this.generation;
        // v0.1.768: 先頭から深さ分(最大3)を【先に】合成起動してから先頭を取り出す。
        //   こうすると N の再生でブロックしている間に N+1/N+2/N+3 の合成が並走する。
        this._startPrefetch(generation);

        const item = this.queue.shift();
        if (!item) continue;

        const ageCheck = isVoiceItemStale(item.enqueuedAt, Date.now(), queueLength, item.priority === 'high');
        if (ageCheck.stale) {
          if (typeof item.onPlayStart === 'function') item.onPlayStart();
          this._showSkipped(1);
          this.prefetches.delete(item);
          continue;
        }

        const congestion = computeVoiceCongestion(queueLength);
        const assigned = this.resolveVoice(item.userKey, this.assignments, this.styleIds);

        // 先頭は _startPrefetch で必ず先読み起動済み(深さ>=1)。その in-flight を再利用する。
        const pf = this.prefetches.get(item);
        this.prefetches.delete(item);
        const wav = pf
          ? await pf.promise
          : await this.fetchSynthesizeVoice(
              buildMergedVoiceText(item, { maxChars: congestion.maxChars }),
              {
                ...assigned,
                speedOffset: assigned.speedOffset + congestion.speedBoost
              }
            );

        if (!wav || !this.enabled || generation !== this.generation || this.isObsMode()) {
          if (typeof item.onPlayStart === 'function') item.onPlayStart();
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
          
          await new Promise((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
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
          if (objectUrl) this.revokeObjectURL(objectUrl);
        }
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
        onAudioEnd: item.onAudioEnd
      };
      
      const merged = mergeRepeatedVoiceItem(this.queue, candidate);
      this.queue = merged.queue;
      if (merged.merged) {
        if (typeof candidate.onPlayStart === 'function') candidate.onPlayStart();
        continue;
      }
      
      const pushed = pushVoiceQueue(this.queue, candidate, { max: 12 });
      this.queue = pushed.queue;
      
      if (pushed.dropped && pushed.dropped.length > 0) {
        for (const dropped of pushed.dropped) {
          if (typeof dropped.onPlayStart === 'function') dropped.onPlayStart();
        }
        droppedCount += pushed.dropped.length;
      }
    }
    
    if (droppedCount > 0) this._showSkipped(droppedCount);
    if (this.queue.length) void this._drainQueue();
  }
}
